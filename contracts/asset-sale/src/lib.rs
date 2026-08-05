//! Primary sale of fractional shares against the payment token (XLM).
//!
//! The contract holds the tranche of inventory the issuer funded it with and
//! sells it at a fixed price. Payment goes straight out in the same
//! transaction - the issuer's treasury takes the price less the platform's
//! commission, the fee account takes the commission - so the contract never
//! custodies the proceeds. The only balance it holds is the buyback pool.
#![no_std]

mod errors;
mod events;

pub use errors::Error;

use sabai_access as access;
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, token, vec, Address, BytesN, Env,
    IntoVal, Symbol,
};

/// Ceiling on the buyback discount, so the parameter cannot be used to
/// confiscate. Same cap the exchange puts on its commission.
const MAX_BUYBACK_DISCOUNT_BPS: u32 = 3_000;
/// Ceiling on the platform's cut of a primary sale.
const MAX_COMMISSION_BPS: u32 = 3_000;
const BPS_DENOMINATOR: i128 = 10_000;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    ShareToken,
    PaymentToken,
    Treasury,
    Price,
    Available,
    /// Shared compliance registry, the single source of eligibility truth.
    Registry,
    /// Discount applied to the buyback payout, in basis points.
    BuybackDiscountBps,
    /// Receives the platform's cut of every primary sale.
    FeeTo,
    /// That cut, in basis points of the purchase price.
    CommissionBps,
    /// Rewards distributor to settle a buyer against, when one is configured.
    ///
    /// Optional, and added after this contract was first deployed: an upgrade
    /// does not re-run the constructor, so it is written by `set_rewards`
    /// rather than passed in. Unset means `buy` behaves exactly as it did
    /// before, which is what makes the upgrade and the setter two safe
    /// transactions instead of one atomic one.
    Rewards,
}

fn get<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey) -> T {
    env.storage().instance().get(key).unwrap()
}

/// Eligibility comes from the shared registry rather than a copy kept here, so
/// one investor decision covers however many assets the platform issues.
///
/// The share token asks the same registry on every transfer, so this check is
/// not what makes the gate binding - it is what makes a rejected purchase
/// report `NotWhitelisted` instead of failing deeper in the token.
/// Bring a holder's rewards position up to date in the same transaction that
/// moved shares to them.
///
/// The distributor has no transfer hook into the token, so shares that arrive
/// somewhere new earn nothing until an address is settled. Leaving that to the
/// holder means a second signature for bookkeeping they have no reason to know
/// about, and silently no income until they work it out.
///
/// `settle` moves no money and takes no authorization - it can only move
/// rewards from "accruing" to "banked" for the address named - so calling it on
/// a buyer's behalf can only ever help them.
///
/// Not a re-entrant call: the token's own `transfer` has already returned by
/// the time this runs, so the token is not on the stack when the distributor
/// reads a balance back out of it.
fn settle_rewards(env: &Env, holder: &Address) {
    let Some(rewards) = env
        .storage()
        .instance()
        .get::<DataKey, Address>(&DataKey::Rewards)
    else {
        return;
    };
    env.invoke_contract::<()>(
        &rewards,
        &Symbol::new(env, "settle"),
        vec![env, holder.into_val(env)],
    );
}

fn require_whitelisted(env: &Env, addr: &Address) {
    let registry: Address = get(env, &DataKey::Registry);
    let ok: bool = env.invoke_contract(
        &registry,
        &Symbol::new(env, "allowed"),
        vec![env, addr.into_val(env)],
    );
    if !ok {
        panic_with_error!(env, Error::NotWhitelisted);
    }
}

#[contract]
pub struct AssetSale;

#[contractimpl]
impl AssetSale {
    /// Deploy-time initialization, run once and atomically with the deploy.
    ///
    /// * `price` - cost of ONE share in minimal units of `payment_token`
    ///   (stroops for XLM: 1 XLM = 10_000_000).
    /// * `registry` - shared compliance registry that decides who may hold
    ///   shares. One KYC decision serves every asset issued against it.
    /// * `buyback_discount_bps` - how far below the primary price the issuer
    ///   buys shares back (500 = 5%), capped at 30%. Fixed here with no setter
    ///   so it cannot be moved against a holder who is about to exit.
    /// * `fee_to` / `commission_bps` - the platform's cut of each purchase,
    ///   capped at 30% and fixed here for the same reason. The buyer pays the
    ///   advertised price either way; the split decides how much of it reaches
    ///   the issuer's treasury.
    ///
    /// The sale starts disabled: custody funds it with a tranche first, then
    /// the sale is switched on.
    #[allow(clippy::too_many_arguments)]
    pub fn __constructor(
        env: Env,
        admin: Address,
        share_token: Address,
        payment_token: Address,
        treasury: Address,
        registry: Address,
        fee_to: Address,
        price: i128,
        buyback_discount_bps: u32,
        commission_bps: u32,
    ) {
        if price <= 0 {
            panic_with_error!(&env, Error::InvalidPrice);
        }
        if buyback_discount_bps > MAX_BUYBACK_DISCOUNT_BPS {
            panic_with_error!(&env, Error::InvalidDiscount);
        }
        if commission_bps > MAX_COMMISSION_BPS {
            panic_with_error!(&env, Error::InvalidCommission);
        }
        env.storage()
            .instance()
            .set(&DataKey::BuybackDiscountBps, &buyback_discount_bps);
        env.storage().instance().set(&DataKey::FeeTo, &fee_to);
        env.storage()
            .instance()
            .set(&DataKey::CommissionBps, &commission_bps);
        access::init(&env, &admin);
        env.storage().instance().set(&DataKey::Registry, &registry);
        env.storage()
            .instance()
            .set(&DataKey::ShareToken, &share_token);
        env.storage()
            .instance()
            .set(&DataKey::PaymentToken, &payment_token);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().set(&DataKey::Price, &price);
        env.storage().instance().set(&DataKey::Available, &false);
        access::extend_instance_ttl(&env);
    }

    /// Buy `amount` shares, paying at most `max_cost` in total.
    ///
    /// The buyer authorizes ONE call; inside it the contract moves payment
    /// (buyer to treasury) and shares (contract to buyer). Either both happen
    /// or the whole transaction fails.
    ///
    /// `max_cost` is what stops the admin repricing the sale between the quote
    /// the buyer saw and the ledger their transaction lands in. Pass the cost
    /// shown on screen; a price raised in the meantime aborts the purchase
    /// rather than silently charging more.
    pub fn buy(env: Env, buyer: Address, amount: i128, max_cost: i128) {
        buyer.require_auth();
        require_whitelisted(&env, &buyer);

        if !get::<bool>(&env, &DataKey::Available) {
            panic_with_error!(&env, Error::SaleNotAvailable);
        }
        if amount <= 0 || max_cost <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        // The payment legs run buyer -> treasury and buyer -> fee_to. Either
        // one nets to zero if the buyer is on the receiving end of it, while
        // the share leg still delivers in full - so those two keys would be
        // buying at a discount, or free, for the price of a transaction fee.
        let treasury: Address = get(&env, &DataKey::Treasury);
        let fee_to: Address = get(&env, &DataKey::FeeTo);
        if buyer == treasury || buyer == fee_to {
            panic_with_error!(&env, Error::TreasuryCannotBuy);
        }

        let share_token: Address = get(&env, &DataKey::ShareToken);
        let inventory =
            token::Client::new(&env, &share_token).balance(&env.current_contract_address());
        if inventory < amount {
            panic_with_error!(&env, Error::InsufficientInventory);
        }

        let price: i128 = get(&env, &DataKey::Price);
        let cost = amount
            .checked_mul(price)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        if cost > max_cost {
            panic_with_error!(&env, Error::PriceMoved);
        }

        let commission_bps: u32 = get(&env, &DataKey::CommissionBps);
        let commission = cost
            .checked_mul(commission_bps as i128)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow))
            / BPS_DENOMINATOR;

        let payment_token: Address = get(&env, &DataKey::PaymentToken);
        let payment = token::Client::new(&env, &payment_token);
        payment.transfer(&buyer, &treasury, &(cost - commission));
        if commission > 0 {
            payment.transfer(&buyer, &fee_to, &commission);
        }
        token::Client::new(&env, &share_token).transfer(
            &env.current_contract_address(),
            &buyer,
            &amount,
        );
        settle_rewards(&env, &buyer);
        access::extend_instance_ttl(&env);

        events::Buy {
            buyer,
            amount,
            cost,
            commission,
        }
        .publish(&env);
    }

    /// Sell `amount` shares back to the issuer's buyback pool for at least
    /// `min_payout`. Shares return to the sale inventory and become
    /// purchasable again; the payout comes from the pool this contract holds.
    ///
    /// Deliberately still callable while the sale is paused: pausing stops new
    /// distribution, it must not trap holders who want out.
    ///
    /// The discount is what makes the pool safe to leave open. Paying the full
    /// price would let anyone buy and immediately sell in a loop, moving the
    /// whole pool into the treasury for the cost of transaction fees and
    /// leaving genuine holders with no way out. `min_payout` covers the mirror
    /// risk: the price dropping between the quote and the transaction.
    pub fn sell(env: Env, seller: Address, amount: i128, min_payout: i128) {
        seller.require_auth();
        require_whitelisted(&env, &seller);

        // `min_payout` has to be positive, not merely respected: the quote
        // rounds down, so at a low enough price it reaches zero and a seller
        // would hand over shares for nothing while every other check passes.
        if amount <= 0 || min_payout <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let payout = Self::buyback_quote(env.clone(), amount);
        if payout < min_payout {
            panic_with_error!(&env, Error::PriceMoved);
        }

        let payment_token: Address = get(&env, &DataKey::PaymentToken);
        let pool =
            token::Client::new(&env, &payment_token).balance(&env.current_contract_address());
        if pool < payout {
            panic_with_error!(&env, Error::InsufficientBuybackFunds);
        }

        let share_token: Address = get(&env, &DataKey::ShareToken);
        token::Client::new(&env, &share_token).transfer(
            &seller,
            env.current_contract_address(),
            &amount,
        );
        token::Client::new(&env, &payment_token).transfer(
            &env.current_contract_address(),
            &seller,
            &payout,
        );
        access::extend_instance_ttl(&env);

        events::Sell {
            seller,
            amount,
            payout,
        }
        .publish(&env);
    }

    /// Add payment token to the buyback pool. Anyone may fund it.
    pub fn fund_buyback(env: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let payment_token: Address = get(&env, &DataKey::PaymentToken);
        token::Client::new(&env, &payment_token).transfer(
            &from,
            env.current_contract_address(),
            &amount,
        );
        access::extend_instance_ttl(&env);
        events::BuybackFunded { from, amount }.publish(&env);
    }

    // Admin

    /// Pull payment token out of the buyback pool. Admin only - this is the
    /// one entrypoint here that moves money outward, so it costs two of the
    /// three multisig signatures and is out of the operator's reach.
    pub fn withdraw_buyback(env: Env, to: Address, amount: i128) {
        access::require_admin(&env);
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let payment_token: Address = get(&env, &DataKey::PaymentToken);
        let pool =
            token::Client::new(&env, &payment_token).balance(&env.current_contract_address());
        if pool < amount {
            panic_with_error!(&env, Error::InsufficientBuybackFunds);
        }
        token::Client::new(&env, &payment_token).transfer(
            &env.current_contract_address(),
            &to,
            &amount,
        );
        access::extend_instance_ttl(&env);
        events::BuybackWithdrawn { to, amount }.publish(&env);
    }

    /// Change the per-share price. Admin only. In-flight purchases are
    /// protected by their own `max_cost`.
    ///
    /// Not an operator power, even though it looks like an everyday one: a
    /// price of 1 stroop empties the inventory into whoever notices first, so
    /// a stolen hot key would be worth the whole tranche. `set_available` is
    /// the operator's version of the same instinct - it can stop the sale
    /// without being able to give it away.
    pub fn set_price(env: Env, price: i128) {
        access::require_admin(&env);
        if price <= 0 {
            panic_with_error!(&env, Error::InvalidPrice);
        }
        let old: i128 = get(&env, &DataKey::Price);
        env.storage().instance().set(&DataKey::Price, &price);
        access::extend_instance_ttl(&env);
        events::PriceChanged { old, new: price }.publish(&env);
    }

    /// Point this sale at the rewards distributor so buyers are settled by
    /// their purchase. Admin only.
    ///
    /// Admin rather than operator because a wrong address here fails every
    /// `buy` until it is corrected - it cannot misdirect money, but it can stop
    /// the sale, and stopping the sale is `set_available`'s job with its own
    /// event.
    pub fn set_rewards(env: Env, rewards: Address) {
        access::require_admin(&env);
        env.storage().instance().set(&DataKey::Rewards, &rewards);
        access::extend_instance_ttl(&env);
        events::RewardsSet { rewards }.publish(&env);
    }

    /// The distributor buyers are settled against, or `None` while unset.
    pub fn rewards(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Rewards)
    }

    /// Enable or disable new purchases. Admin or operator. Does not affect
    /// `sell`: closing the sale must never trap a holder who wants out.
    pub fn set_available(env: Env, caller: Address, available: bool) {
        access::require_manager(&env, &caller);
        env.storage()
            .instance()
            .set(&DataKey::Available, &available);
        access::extend_instance_ttl(&env);
        events::AvailabilityChanged { available }.publish(&env);
    }

    /// Pull unsold shares back out of the contract. Admin only. `to` still has
    /// to be admitted by the registry, so the gate applies to the issuer too.
    pub fn withdraw_shares(env: Env, to: Address, amount: i128) {
        access::require_admin(&env);
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let share_token: Address = get(&env, &DataKey::ShareToken);
        token::Client::new(&env, &share_token).transfer(
            &env.current_contract_address(),
            &to,
            &amount,
        );
        access::extend_instance_ttl(&env);
        events::SharesWithdrawn { to, amount }.publish(&env);
    }

    // Governance - identical in all five contracts, see `sabai_access`.

    pub fn admin(env: Env) -> Address {
        access::admin(&env)
    }

    /// The hot key that may open and close the sale, and nothing else here.
    pub fn operator(env: Env) -> Address {
        access::operator(&env)
    }

    pub fn set_operator(env: Env, operator: Address) {
        access::set_operator(&env, operator);
    }

    pub fn transfer_admin(env: Env, new_admin: Address) {
        access::transfer_admin(&env, new_admin);
    }

    pub fn cancel_transfer_admin(env: Env) {
        access::cancel_transfer_admin(&env);
    }

    pub fn accept_admin(env: Env) {
        access::accept_admin(&env);
    }

    pub fn pending_admin(env: Env) -> Option<Address> {
        access::pending_admin(&env)
    }

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        access::upgrade(&env, new_wasm_hash);
    }

    // Views

    pub fn price(env: Env) -> i128 {
        get(&env, &DataKey::Price)
    }

    pub fn available(env: Env) -> bool {
        get(&env, &DataKey::Available)
    }

    /// Shares still held by this contract and purchasable right now. There is
    /// no separate sold counter: inventory moves both ways (a buyback returns
    /// shares here), so a counter would be a second version of this number
    /// that can disagree with it.
    pub fn remaining(env: Env) -> i128 {
        let share_token: Address = get(&env, &DataKey::ShareToken);
        token::Client::new(&env, &share_token).balance(&env.current_contract_address())
    }

    /// What `buy` would actually accept right now: the inventory, or zero
    /// while the sale is switched off. `remaining` answers "what is held here",
    /// which is the honest number for an inventory readout but the wrong one
    /// for a buy button - a disabled sale with 300 shares in it is not 300
    /// shares available.
    pub fn available_for_purchase(env: Env) -> i128 {
        if get::<bool>(&env, &DataKey::Available) {
            Self::remaining(env)
        } else {
            0
        }
    }

    /// The compliance registry this sale defers eligibility to.
    pub fn registry(env: Env) -> Address {
        get(&env, &DataKey::Registry)
    }

    /// Discount applied to a buyback, in basis points (500 = 5%).
    pub fn buyback_discount_bps(env: Env) -> u32 {
        get(&env, &DataKey::BuybackDiscountBps)
    }

    /// What the pool pays for `amount` shares right now. `sell` calls this same
    /// function, so the quote on screen cannot drift from the amount paid.
    /// Rounds down, so the pool never overpays.
    pub fn buyback_quote(env: Env, amount: i128) -> i128 {
        let price: i128 = get(&env, &DataKey::Price);
        let discount_bps: u32 = get(&env, &DataKey::BuybackDiscountBps);
        let gross = amount
            .checked_mul(price)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        gross
            .checked_mul(BPS_DENOMINATOR - discount_bps as i128)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow))
            / BPS_DENOMINATOR
    }

    /// Payment token held by the contract for buybacks.
    pub fn buyback_pool(env: Env) -> i128 {
        let payment_token: Address = get(&env, &DataKey::PaymentToken);
        token::Client::new(&env, &payment_token).balance(&env.current_contract_address())
    }

    pub fn share_token(env: Env) -> Address {
        get(&env, &DataKey::ShareToken)
    }

    pub fn payment_token(env: Env) -> Address {
        get(&env, &DataKey::PaymentToken)
    }

    pub fn treasury(env: Env) -> Address {
        get(&env, &DataKey::Treasury)
    }

    /// Receives the platform's cut of each purchase.
    pub fn fee_to(env: Env) -> Address {
        get(&env, &DataKey::FeeTo)
    }

    /// The platform's cut, in basis points (200 = 2%).
    pub fn commission_bps(env: Env) -> u32 {
        get(&env, &DataKey::CommissionBps)
    }
}

#[cfg(test)]
mod test;
