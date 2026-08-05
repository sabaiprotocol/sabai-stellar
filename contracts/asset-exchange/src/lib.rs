//! Secondary market for fractional shares, settled in XLM.
//!
//! A sell-side escrow order book with no matching engine, mirroring the
//! secondary market Sabai runs in production on Polygon. A seller locks shares
//! in the contract at a chosen price inside the admin's rate band; any
//! eligible buyer fills the order fully or partially, paying XLM straight to
//! the seller minus the platform commission. No backend signs anything: the
//! book lives entirely on-chain.
//!
//! Eligibility is not duplicated here. Both sides are checked against the
//! shared compliance registry, so one registration covers the primary and the
//! secondary market.
#![no_std]

mod errors;
mod events;

pub use errors::Error;

use sabai_access as access;
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, token, vec, Address, BytesN, Env,
    IntoVal, Symbol, Vec,
};

/// Commission denominator: rates are basis points, 100 bps = 1%.
const BPS: i128 = 10_000;
/// The commission can never exceed 30%.
const MAX_COMMISSION_BPS: u32 = 3_000;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    ShareToken,
    PaymentToken,
    /// Shared compliance registry - the single source of eligibility truth.
    Registry,
    /// Platform commission recipient.
    FeeTo,
    CommissionBps,
    MinRate,
    MaxRate,
    Available,
    NextOrderId,
    /// Ids of currently open orders (the book is small - a PoC-scale index).
    OrderIds,
    /// Open order by id (persistent - orders outlive instance archival).
    Order(u64),
    /// Rewards distributor to settle a filling buyer against, when configured.
    ///
    /// Optional, and added after this contract was first deployed: an upgrade
    /// does not re-run the constructor, so it is written by `set_rewards`
    /// rather than passed in. Unset means `swap_order` behaves exactly as it
    /// did before, which is what makes the upgrade and the setter two safe
    /// transactions instead of one atomic one.
    Rewards,
}

/// An open sell order. `remaining` shrinks on partial fills; the order is
/// deleted when it reaches zero.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Order {
    pub id: u64,
    pub seller: Address,
    /// Price of ONE share in stroops of the payment token.
    pub rate: i128,
    /// Shares originally listed.
    pub amount: i128,
    /// Shares still available in this order.
    pub remaining: i128,
    /// Ledger timestamp when the order was placed.
    pub created_at: u64,
}

fn get<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey) -> T {
    env.storage().instance().get(key).unwrap()
}

/// Bring a holder's rewards position up to date in the same transaction that
/// moved shares to them.
///
/// The distributor has no transfer hook into the token, so shares that arrive
/// somewhere new earn nothing until an address is settled. Leaving that to the
/// buyer means a second signature for bookkeeping they have no reason to know
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

/// Eligibility is asked of the shared registry, so an investor cleared once
/// can trade every asset the platform issues.
fn allowed(env: &Env, addr: &Address) -> bool {
    let registry: Address = get(env, &DataKey::Registry);
    env.invoke_contract(
        &registry,
        &Symbol::new(env, "allowed"),
        vec![env, addr.into_val(env)],
    )
}

fn require_whitelisted(env: &Env, addr: &Address) {
    if !allowed(env, addr) {
        panic_with_error!(env, Error::NotWhitelisted);
    }
}

fn require_available(env: &Env) {
    if !get::<bool>(env, &DataKey::Available) {
        panic_with_error!(env, Error::ExchangeNotAvailable);
    }
}

fn load_order(env: &Env, order_id: u64) -> Order {
    env.storage()
        .persistent()
        .get(&DataKey::Order(order_id))
        .unwrap_or_else(|| panic_with_error!(env, Error::OrderNotFound))
}

fn save_order(env: &Env, order: &Order) {
    let key = DataKey::Order(order.id);
    env.storage().persistent().set(&key, order);
    env.storage()
        .persistent()
        .extend_ttl(&key, access::PERSISTENT_TTL, access::PERSISTENT_TTL);
}

/// Remove the order record and drop its id from the open-orders index.
fn delete_order(env: &Env, order_id: u64) {
    env.storage().persistent().remove(&DataKey::Order(order_id));
    let ids: Vec<u64> = get(env, &DataKey::OrderIds);
    if let Some(pos) = ids.first_index_of(order_id) {
        let mut ids = ids;
        ids.remove(pos);
        env.storage().instance().set(&DataKey::OrderIds, &ids);
    }
}

#[contract]
pub struct AssetExchange;

#[contractimpl]
impl AssetExchange {
    /// Deploy-time initialization (runs exactly once, atomically with deploy).
    ///
    /// * `registry` - compliance registry that gates both sides of a trade.
    /// * `fee_to` - receives the platform commission from every fill.
    /// * `commission_bps` - commission in basis points (200 = 2%), <= 3000.
    /// * `min_rate`/`max_rate` - allowed per-share price band in stroops.
    ///
    /// Trading starts enabled: unlike the primary sale there is no inventory
    /// to deposit first - the book simply starts empty.
    #[allow(clippy::too_many_arguments)]
    pub fn __constructor(
        env: Env,
        admin: Address,
        share_token: Address,
        payment_token: Address,
        registry: Address,
        fee_to: Address,
        commission_bps: u32,
        min_rate: i128,
        max_rate: i128,
    ) {
        if commission_bps > MAX_COMMISSION_BPS || min_rate <= 0 || max_rate < min_rate {
            panic_with_error!(&env, Error::InvalidConfig);
        }
        access::init(&env, &admin);
        env.storage()
            .instance()
            .set(&DataKey::ShareToken, &share_token);
        env.storage()
            .instance()
            .set(&DataKey::PaymentToken, &payment_token);
        env.storage().instance().set(&DataKey::Registry, &registry);
        env.storage().instance().set(&DataKey::FeeTo, &fee_to);
        env.storage()
            .instance()
            .set(&DataKey::CommissionBps, &commission_bps);
        env.storage().instance().set(&DataKey::MinRate, &min_rate);
        env.storage().instance().set(&DataKey::MaxRate, &max_rate);
        env.storage().instance().set(&DataKey::Available, &true);
        env.storage().instance().set(&DataKey::NextOrderId, &1_u64);
        env.storage()
            .instance()
            .set(&DataKey::OrderIds, &Vec::<u64>::new(&env));
        access::extend_instance_ttl(&env);
    }

    /// List `amount` shares for sale at `rate` stroops per share. The shares
    /// move into contract escrow in the same transaction, before the order is
    /// visible to anyone. Returns the new order id.
    ///
    /// Escrowed shares stop accruing rewards while listed, because
    /// rewards-distributor pays against the current balance and the balance is
    /// this contract's. Cancel or fill the order to start accruing again.
    pub fn add_order(env: Env, seller: Address, amount: i128, rate: i128) -> u64 {
        seller.require_auth();
        require_available(&env);
        require_whitelisted(&env, &seller);

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let min_rate: i128 = get(&env, &DataKey::MinRate);
        let max_rate: i128 = get(&env, &DataKey::MaxRate);
        if rate < min_rate || rate > max_rate {
            panic_with_error!(&env, Error::RateOutOfBand);
        }

        // Escrow the shares. The token contract itself rejects the call if
        // the seller's balance is insufficient - no separate check needed.
        let share_token: Address = get(&env, &DataKey::ShareToken);
        token::Client::new(&env, &share_token).transfer(
            &seller,
            env.current_contract_address(),
            &amount,
        );

        let order_id: u64 = get(&env, &DataKey::NextOrderId);
        env.storage()
            .instance()
            .set(&DataKey::NextOrderId, &(order_id + 1));

        let order = Order {
            id: order_id,
            seller: seller.clone(),
            rate,
            amount,
            remaining: amount,
            created_at: env.ledger().timestamp(),
        };
        save_order(&env, &order);

        let mut ids: Vec<u64> = get(&env, &DataKey::OrderIds);
        ids.push_back(order_id);
        env.storage().instance().set(&DataKey::OrderIds, &ids);
        access::extend_instance_ttl(&env);

        events::OrderAdded {
            seller,
            order_id,
            amount,
            rate,
        }
        .publish(&env);

        order_id
    }

    /// Buy `amount` shares from order `order_id`. Partial fills allowed.
    ///
    /// One buyer authorization covers the whole atomic exchange: payment to
    /// the seller (net) and to `fee_to` (commission), then shares out of
    /// escrow to the buyer. The buyer pays the full asking price and the
    /// commission comes out of the seller's proceeds.
    ///
    /// No slippage bound is needed here: the price is `order.rate`, fixed when
    /// the order was placed and not something the admin or the seller can move
    /// under a buyer who is mid-transaction.
    pub fn swap_order(env: Env, buyer: Address, order_id: u64, amount: i128) {
        buyer.require_auth();
        require_available(&env);
        require_whitelisted(&env, &buyer);

        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let mut order = load_order(&env, order_id);
        if order.seller == buyer {
            panic_with_error!(&env, Error::OwnOrder);
        }
        // The seller too, not only the buyer. The shares leave from this
        // contract's own address and the payment is a plain SAC transfer, so
        // without this check nothing in the stack ever consults the registry
        // about the seller, and a revoked holder could still liquidate their
        // whole position and be paid for it.
        if !allowed(&env, &order.seller) {
            panic_with_error!(&env, Error::SellerNotWhitelisted);
        }
        if amount > order.remaining {
            panic_with_error!(&env, Error::ExceedsOrderSize);
        }

        let cost = amount
            .checked_mul(order.rate)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        let commission_bps: u32 = get(&env, &DataKey::CommissionBps);
        // Checked to keep every money path uniform, though bps is capped at
        // 10_000 and cost already fits i128.
        let commission = cost
            .checked_mul(commission_bps as i128)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow))
            / BPS;
        let payout = cost - commission;

        let payment_token: Address = get(&env, &DataKey::PaymentToken);
        let payment = token::Client::new(&env, &payment_token);
        payment.transfer(&buyer, &order.seller, &payout);
        if commission > 0 {
            let fee_to: Address = get(&env, &DataKey::FeeTo);
            payment.transfer(&buyer, &fee_to, &commission);
        }

        let share_token: Address = get(&env, &DataKey::ShareToken);
        token::Client::new(&env, &share_token).transfer(
            &env.current_contract_address(),
            &buyer,
            &amount,
        );

        settle_rewards(&env, &buyer);

        order.remaining -= amount;
        if order.remaining == 0 {
            delete_order(&env, order_id);
        } else {
            save_order(&env, &order);
        }
        access::extend_instance_ttl(&env);

        events::OrderSwap {
            buyer,
            seller: order.seller,
            order_id,
            amount,
            cost,
            payout,
        }
        .publish(&env);
    }

    /// Cancel your own order: the remaining escrowed shares return to you.
    /// Allowed even when trading is disabled - sellers can always exit.
    pub fn close_order(env: Env, seller: Address, order_id: u64) {
        seller.require_auth();
        let order = load_order(&env, order_id);
        if order.seller != seller {
            panic_with_error!(&env, Error::NotOrderSeller);
        }
        refund_and_close(&env, &order, false);
    }

    // Admin

    /// Force-cancel any order. Admin or operator - the escrow returns to its
    /// seller and can go nowhere else, so the worst a stolen hot key does here
    /// is hand people their own shares back.
    pub fn close_order_by(env: Env, caller: Address, order_id: u64) {
        access::require_manager(&env, &caller);
        let order = load_order(&env, order_id);
        refund_and_close(&env, &order, true);
    }

    /// Point this market at the rewards distributor so filling buyers are
    /// settled by their own trade. Admin only.
    ///
    /// Admin rather than operator because a wrong address here fails every
    /// fill until it is corrected - it cannot misdirect money or escrow, but it
    /// can stop the market, and stopping the market is `set_available`'s job
    /// with its own event.
    pub fn set_rewards(env: Env, rewards: Address) {
        access::require_admin(&env);
        env.storage().instance().set(&DataKey::Rewards, &rewards);
        access::extend_instance_ttl(&env);
        events::RewardsSet { rewards }.publish(&env);
    }

    /// The distributor filling buyers are settled against, or `None` if unset.
    pub fn rewards(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Rewards)
    }

    /// Enable/disable trading. Admin or operator. Cancelling stays open either
    /// way, so a halted market never locks a seller's escrow in.
    pub fn set_available(env: Env, caller: Address, available: bool) {
        access::require_manager(&env, &caller);
        env.storage()
            .instance()
            .set(&DataKey::Available, &available);
        access::extend_instance_ttl(&env);
        events::AvailabilityChanged { available }.publish(&env);
    }

    // Governance - identical in all five contracts, see `sabai_access`.

    pub fn admin(env: Env) -> Address {
        access::admin(&env)
    }

    /// The hot key that may halt trading and force-cancel an order.
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

    /// Every open order, oldest first. The PoC book is small enough to return
    /// whole; a production deployment pages this through an indexer.
    pub fn orders(env: Env) -> Vec<Order> {
        let ids: Vec<u64> = get(&env, &DataKey::OrderIds);
        let mut out = Vec::new(&env);
        for id in ids.iter() {
            if let Some(order) = env.storage().persistent().get(&DataKey::Order(id)) {
                out.push_back(order);
            }
        }
        out
    }

    /// A single open order, if it exists.
    pub fn order(env: Env, order_id: u64) -> Option<Order> {
        env.storage().persistent().get(&DataKey::Order(order_id))
    }

    pub fn available(env: Env) -> bool {
        get(&env, &DataKey::Available)
    }

    pub fn commission_bps(env: Env) -> u32 {
        get(&env, &DataKey::CommissionBps)
    }

    pub fn min_rate(env: Env) -> i128 {
        get(&env, &DataKey::MinRate)
    }

    pub fn max_rate(env: Env) -> i128 {
        get(&env, &DataKey::MaxRate)
    }

    pub fn fee_to(env: Env) -> Address {
        get(&env, &DataKey::FeeTo)
    }

    /// The compliance registry this market defers eligibility to.
    pub fn registry(env: Env) -> Address {
        get(&env, &DataKey::Registry)
    }

    pub fn share_token(env: Env) -> Address {
        get(&env, &DataKey::ShareToken)
    }

    pub fn payment_token(env: Env) -> Address {
        get(&env, &DataKey::PaymentToken)
    }
}

/// Shared tail of both cancel paths: return the escrow, drop the order.
///
/// This contract asks for no eligibility here, but the share token does, and
/// it checks the receiving side. A seller revoked while an order is open
/// therefore cannot be refunded until they are admitted again, by either
/// cancel path. That is a freeze, not a loss - the same rule that stops a
/// revoked holder moving shares they already own - and
/// `revoking_a_seller_freezes_the_escrow_until_they_are_admitted_again` pins
/// it down.
fn refund_and_close(env: &Env, order: &Order, by_admin: bool) {
    let share_token: Address = get(env, &DataKey::ShareToken);
    token::Client::new(env, &share_token).transfer(
        &env.current_contract_address(),
        &order.seller,
        &order.remaining,
    );
    delete_order(env, order.id);
    access::extend_instance_ttl(env);

    events::OrderClosed {
        seller: order.seller.clone(),
        order_id: order.id,
        by_admin,
    }
    .publish(env);
}

#[cfg(test)]
mod test;
