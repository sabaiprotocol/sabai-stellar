#![cfg(test)]

use crate::{AssetSale, AssetSaleClient};
use compliance_registry::{ComplianceRegistry, ComplianceRegistryClient};
use rewards_distributor::{RewardsDistributor, RewardsDistributorClient};
use share_token::{ShareToken, ShareTokenClient};
use soroban_sdk::testutils::{Address as _, Events, MockAuth, MockAuthInvoke};
use soroban_sdk::{
    token, vec, Address, Env, Error as HostError, IntoVal, InvokeError, String, Symbol,
};

/// The exact contract error a failed invocation carried, so a test cannot pass
/// on some other failure that merely also returns Err.
fn code(n: u32) -> Result<HostError, InvokeError> {
    Ok(HostError::from_contract_error(n))
}

/// One share costs 100 XLM = 1_000_000_000 stroops.
const PRICE: i128 = 1_000_000_000;
/// Share supply cap the token is deployed with.
const SUPPLY: i128 = 1000;
const INVENTORY: i128 = 500;
/// The issuer buys back 5% below the primary price.
const DISCOUNT_BPS: u32 = 500;
/// The platform keeps 2% of each primary sale.
const COMMISSION_BPS: u32 = 200;

/// The issuer's share of a purchase, and the platform's. The buyer pays
/// `quoted()` either way; these two are how it splits.
fn net_of_commission(shares: i128) -> i128 {
    quoted(shares) - commission_on(shares)
}

fn commission_on(shares: i128) -> i128 {
    quoted(shares) * COMMISSION_BPS as i128 / 10_000
}

/// What the buyback pool pays for `shares`, computed independently of the
/// contract so these tests catch the contract's own arithmetic drifting.
fn discounted(shares: i128) -> i128 {
    shares * PRICE * (10_000 - DISCOUNT_BPS as i128) / 10_000
}

/// The slippage bound a UI would send with a purchase: the quote it displayed.
fn quoted(shares: i128) -> i128 {
    shares * PRICE
}

struct Setup<'a> {
    env: &'a Env,
    sale: AssetSaleClient<'a>,
    shares: ShareTokenClient<'a>,
    payment: token::TokenClient<'a>,
    payment_admin: token::StellarAssetClient<'a>,
    registry: ComplianceRegistryClient<'a>,
    admin: Address,
    treasury: Address,
    fee_to: Address,
    kyc_provider: Address,
}

fn setup(env: &Env) -> Setup<'_> {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    // The issuer's proceeds and the platform's commission land on different
    // accounts, the way they do on the Polygon deployment.
    let fee_to = Address::generate(env);
    // Deliberately a different address from `admin`: the whole point of the
    // role is that admitting investors and controlling the money are separate.
    let kyc_provider = Address::generate(env);
    let registry_id = env.register(ComplianceRegistry, (admin.clone(), kyc_provider.clone()));
    let registry = ComplianceRegistryClient::new(env, &registry_id);

    // Payment token: a real Stellar Asset Contract from SDK testutils, the
    // on-testnet analogue of the native XLM SAC.
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let payment = token::TokenClient::new(env, &sac.address());
    let payment_admin = token::StellarAssetClient::new(env, &sac.address());

    let share_id = env.register(
        ShareToken,
        (
            admin.clone(),
            String::from_str(env, "Sabai Lagoon Residence No. 1"),
            String::from_str(env, "SLR1"),
            registry_id.clone(),
            treasury.clone(),
            SUPPLY,
        ),
    );
    let shares = ShareTokenClient::new(env, &share_id);

    let sale_id = env.register(
        AssetSale,
        (
            admin.clone(),
            share_id.clone(),
            sac.address(),
            treasury.clone(),
            registry_id.clone(),
            fee_to.clone(),
            PRICE,
            DISCOUNT_BPS,
            COMMISSION_BPS,
        ),
    );
    let sale = AssetSaleClient::new(env, &sale_id);

    // The sale contract holds inventory, so it must be an admitted participant
    // before anything can be minted to it.
    registry.set_participant(&sale_id, &true);
    shares.mint(&sale_id, &INVENTORY);

    Setup {
        env,
        sale,
        shares,
        payment,
        payment_admin,
        registry,
        admin,
        treasury,
        fee_to,
        kyc_provider,
    }
}

/// Funds the buyer AND passes KYC. The default happy-path actor.
fn fund_buyer(s: &Setup, xlm_stroops: i128) -> Address {
    let buyer = Address::generate(s.env);
    s.payment_admin.mint(&buyer, &xlm_stroops);
    s.registry.register_verified(&s.kyc_provider, &buyer);
    buyer
}

#[test]
fn constructor_sets_initial_state() {
    let env = Env::default();
    let s = setup(&env);

    assert_eq!(s.sale.price(), PRICE);
    assert!(!s.sale.available());
    assert_eq!(s.sale.remaining(), INVENTORY);
    assert_eq!(s.sale.admin(), s.admin);
    assert_eq!(s.sale.treasury(), s.treasury);
    assert_eq!(s.sale.registry(), s.registry.address);
    assert_eq!(s.sale.buyback_discount_bps(), DISCOUNT_BPS);
    assert_eq!(s.sale.share_token(), s.shares.address);
    assert_eq!(s.sale.payment_token(), s.payment.address);
}

/// Deploys a sale with one config value pushed out of range, so the
/// constructor's guards can be tested one at a time.
fn deploy_sale_with(env: &Env, price: i128, discount_bps: u32, commission_bps: u32) {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let registry_id = env.register(ComplianceRegistry, (admin.clone(), admin.clone()));
    let share_id = env.register(
        ShareToken,
        (
            admin.clone(),
            String::from_str(env, "S"),
            String::from_str(env, "S"),
            registry_id.clone(),
            admin.clone(),
            SUPPLY,
        ),
    );
    env.register(
        AssetSale,
        (
            admin.clone(),
            share_id,
            sac.address(),
            admin.clone(),
            registry_id,
            admin.clone(),
            price,
            discount_bps,
            commission_bps,
        ),
    );
}

#[test]
#[should_panic(expected = "#304")]
fn constructor_rejects_zero_price() {
    deploy_sale_with(&Env::default(), 0, DISCOUNT_BPS, COMMISSION_BPS);
}

#[test]
#[should_panic(expected = "#308")]
fn constructor_rejects_discount_above_cap() {
    deploy_sale_with(&Env::default(), PRICE, 3_001, COMMISSION_BPS);
}

#[test]
#[should_panic(expected = "#311")]
fn constructor_rejects_commission_above_cap() {
    deploy_sale_with(&Env::default(), PRICE, DISCOUNT_BPS, 3_001);
}

#[test]
fn buy_happy_path() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let buyer = fund_buyer(&s, 5 * PRICE);

    s.sale.buy(&buyer, &3, &quoted(3));

    assert_eq!(s.shares.balance(&buyer), 3);
    assert_eq!(s.payment.balance(&buyer), 2 * PRICE);
    assert_eq!(s.payment.balance(&s.treasury), net_of_commission(3));
    assert_eq!(s.payment.balance(&s.fee_to), commission_on(3));
    assert_eq!(s.sale.remaining(), INVENTORY - 3);
}

/// The buyer is quoted one number and pays exactly that number. How it splits
/// between the issuer and the platform is not the buyer's problem, and no
/// rounding may leak a stroop in either direction.
#[test]
fn the_commission_comes_out_of_the_price_not_on_top_of_it() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let buyer = fund_buyer(&s, 10 * PRICE);

    s.sale.buy(&buyer, &7, &quoted(7));

    let paid = 10 * PRICE - s.payment.balance(&buyer);
    assert_eq!(paid, quoted(7));
    assert_eq!(
        s.payment.balance(&s.treasury) + s.payment.balance(&s.fee_to),
        paid
    );
    assert_eq!(s.sale.commission_bps(), COMMISSION_BPS);
    assert_eq!(s.sale.fee_to(), s.fee_to);
}

/// A zero commission must not publish a transfer of nothing, and the treasury
/// takes the whole price.
#[test]
fn a_zero_commission_pays_the_treasury_in_full() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let buyer = fund_buyer(&s, 5 * PRICE);
    let zero_fee_sale = AssetSaleClient::new(
        &env,
        &env.register(
            AssetSale,
            (
                s.admin.clone(),
                s.shares.address.clone(),
                s.payment.address.clone(),
                s.treasury.clone(),
                s.registry.address.clone(),
                s.fee_to.clone(),
                PRICE,
                DISCOUNT_BPS,
                0_u32,
            ),
        ),
    );
    s.registry.set_participant(&zero_fee_sale.address, &true);
    s.sale.set_available(&s.admin, &true);
    s.sale.withdraw_shares(&zero_fee_sale.address, &10);
    zero_fee_sale.set_available(&s.admin, &true);

    zero_fee_sale.buy(&buyer, &2, &quoted(2));

    assert_eq!(s.payment.balance(&s.treasury), quoted(2));
    assert_eq!(s.payment.balance(&s.fee_to), 0);
}

#[test]
fn buy_fails_when_sale_disabled() {
    let env = Env::default();
    let s = setup(&env);
    let buyer = fund_buyer(&s, 10 * PRICE);

    assert!(s.sale.try_buy(&buyer, &1, &quoted(1)).is_err());
    assert_eq!(s.shares.balance(&buyer), 0);
}

#[test]
fn buy_rejects_zero_and_negative_amount() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let buyer = fund_buyer(&s, 10 * PRICE);

    assert!(s.sale.try_buy(&buyer, &0, &quoted(1)).is_err());
    assert!(s.sale.try_buy(&buyer, &-2, &quoted(1)).is_err());
}

#[test]
fn buy_fails_beyond_inventory() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let buyer = fund_buyer(&s, (INVENTORY + 1) * PRICE);

    let too_many = INVENTORY + 1;
    assert!(s
        .sale
        .try_buy(&buyer, &too_many, &quoted(too_many))
        .is_err());
    assert_eq!(s.sale.remaining(), INVENTORY);
}

#[test]
fn buy_fails_without_payment_funds() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    // Buyer has one stroop less than the price of one share.
    let buyer = fund_buyer(&s, PRICE - 1);

    assert!(s.sale.try_buy(&buyer, &1, &quoted(1)).is_err());
    assert_eq!(s.shares.balance(&buyer), 0);
    assert_eq!(s.payment.balance(&s.treasury), 0);
}

#[test]
fn set_price_changes_cost() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let new_price = 2 * PRICE;
    s.sale.set_price(&new_price);
    assert_eq!(s.sale.price(), new_price);

    let buyer = fund_buyer(&s, 2 * PRICE);
    s.sale.buy(&buyer, &1, &new_price);

    assert_eq!(s.payment.balance(&buyer), 0);
    assert_eq!(
        s.payment.balance(&s.treasury) + s.payment.balance(&s.fee_to),
        new_price
    );
}

#[test]
fn set_price_rejects_non_positive() {
    let env = Env::default();
    let s = setup(&env);

    assert!(s.sale.try_set_price(&0).is_err());
    assert!(s.sale.try_set_price(&-5).is_err());
}

/// A price raised after the buyer saw the quote must abort the purchase, not
/// silently charge the new price. Without `max_cost` this is a live
/// front-running window on every buy.
#[test]
fn a_price_raised_after_the_quote_cannot_charge_the_buyer_more() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let buyer = fund_buyer(&s, 10 * PRICE);

    let quote = quoted(2);
    s.sale.set_price(&(2 * PRICE));

    assert!(s.sale.try_buy(&buyer, &2, &quote).is_err());
    assert_eq!(s.shares.balance(&buyer), 0);
    assert_eq!(s.payment.balance(&buyer), 10 * PRICE);

    // Accepting the new price goes through, so the guard is a bound and not a
    // freeze on the price itself.
    s.sale.buy(&buyer, &2, &(4 * PRICE));
    assert_eq!(s.shares.balance(&buyer), 2);
}

/// The mirror case on the way out: a price cut between quote and execution
/// must not hand the seller less than they agreed to.
#[test]
fn a_price_cut_after_the_quote_cannot_shortchange_the_seller() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let holder = fund_buyer(&s, 5 * PRICE);
    s.sale.buy(&holder, &2, &quoted(2));
    s.payment_admin.mint(&s.admin, &(10 * PRICE));
    s.sale.fund_buyback(&s.admin, &(10 * PRICE));

    let quote = s.sale.buyback_quote(&2);
    s.sale.set_price(&(PRICE / 2));

    assert!(s.sale.try_sell(&holder, &2, &quote).is_err());
    assert_eq!(s.shares.balance(&holder), 2);
}

#[test]
fn admin_functions_require_auth() {
    let env = Env::default();
    // No mock_all_auths for the sale admin calls: require_auth must fail.
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let registry_id = env.register(ComplianceRegistry, (admin.clone(), admin.clone()));
    let share_id = env.register(
        ShareToken,
        (
            admin.clone(),
            String::from_str(&env, "S"),
            String::from_str(&env, "S"),
            registry_id.clone(),
            treasury.clone(),
            SUPPLY,
        ),
    );
    let sale_id = env.register(
        AssetSale,
        (
            admin.clone(),
            share_id,
            sac.address(),
            treasury.clone(),
            registry_id,
            admin.clone(),
            PRICE,
            DISCOUNT_BPS,
            COMMISSION_BPS,
        ),
    );
    let sale = AssetSaleClient::new(&env, &sale_id);

    assert!(sale.try_set_available(&admin, &true).is_err());
    assert!(sale.try_set_price(&PRICE).is_err());
    assert!(sale.try_withdraw_shares(&treasury, &1).is_err());
    assert!(sale.try_withdraw_buyback(&treasury, &1).is_err());
}

#[test]
fn withdraw_shares_returns_inventory_to_admin() {
    let env = Env::default();
    let s = setup(&env);
    // Inventory can only be withdrawn to an address the registry admits: the
    // gate applies to the issuer too.
    let vault = Address::generate(&env);
    s.registry.set_participant(&vault, &true);

    s.sale.withdraw_shares(&vault, &200);

    assert_eq!(s.shares.balance(&vault), 200);
    assert_eq!(s.sale.remaining(), INVENTORY - 200);
}

// Eligibility comes from the registry

#[test]
fn the_sale_defers_to_the_registry_rather_than_keeping_a_copy() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let user = Address::generate(&env);
    s.payment_admin.mint(&user, &(2 * PRICE));

    assert!(s.sale.try_buy(&user, &1, &quoted(1)).is_err());

    // Admitted in the registry. Nothing is written to the sale contract, and
    // the very next call succeeds.
    s.registry.register_verified(&s.kyc_provider, &user);
    s.sale.buy(&user, &1, &quoted(1));
    assert_eq!(s.shares.balance(&user), 1);

    // Revoked there too, and the sale stops serving them immediately.
    s.registry.revoke(&s.kyc_provider, &user);
    assert!(s.sale.try_buy(&user, &1, &quoted(1)).is_err());
}

#[test]
fn buy_fails_without_registration() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    // Funded but never registered: the eligibility gate must reject.
    let buyer = Address::generate(&env);
    s.payment_admin.mint(&buyer, &(10 * PRICE));

    assert!(s.sale.try_buy(&buyer, &1, &quoted(1)).is_err());
    assert_eq!(s.shares.balance(&buyer), 0);
}

// Sell-back (buyback pool)

#[test]
fn sell_happy_path() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let buyer = fund_buyer(&s, 5 * PRICE);
    s.sale.buy(&buyer, &5, &quoted(5));

    // Admin funds the buyback pool, then the holder sells 2 shares back.
    s.payment_admin.mint(&s.admin, &(10 * PRICE));
    s.sale.fund_buyback(&s.admin, &(10 * PRICE));
    s.sale.sell(&buyer, &2, &discounted(2));

    // The pool buys back below the primary price, so 2 shares return less than
    // the 2 * PRICE they cost.
    let payout = discounted(2);
    assert_eq!(payout, 2 * PRICE * 95 / 100);
    assert_eq!(s.shares.balance(&buyer), 3);
    assert_eq!(s.payment.balance(&buyer), payout);
    assert_eq!(s.sale.remaining(), INVENTORY - 3);
    assert_eq!(s.sale.buyback_pool(), 10 * PRICE - payout);
}

/// Pausing the sale stops new distribution. It must not trap holders who want
/// to exit, so `sell` keeps working.
#[test]
fn a_paused_sale_still_lets_holders_exit() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let holder = fund_buyer(&s, 2 * PRICE);
    s.sale.buy(&holder, &2, &quoted(2));
    s.payment_admin.mint(&s.admin, &(10 * PRICE));
    s.sale.fund_buyback(&s.admin, &(10 * PRICE));

    s.sale.set_available(&s.admin, &false);

    assert!(s.sale.try_buy(&holder, &1, &quoted(1)).is_err());
    s.sale.sell(&holder, &2, &discounted(2));
    assert_eq!(s.shares.balance(&holder), 0);
}

#[test]
fn buyback_quote_matches_what_sell_pays() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let buyer = fund_buyer(&s, 4 * PRICE);
    s.sale.buy(&buyer, &4, &quoted(4));
    s.payment_admin.mint(&s.admin, &(10 * PRICE));
    s.sale.fund_buyback(&s.admin, &(10 * PRICE));

    // The quote the UI would show, taken before selling.
    let quote = s.sale.buyback_quote(&3);
    let before = s.payment.balance(&buyer);
    s.sale.sell(&buyer, &3, &quote);

    assert_eq!(s.sale.buyback_discount_bps(), DISCOUNT_BPS);
    assert_eq!(s.payment.balance(&buyer) - before, quote);
}

/// The reason the discount exists: at full price anyone could buy and sell in
/// a loop, moving the entire pool into the treasury for the price of fees and
/// leaving real holders unable to exit.
#[test]
fn round_trip_cannot_drain_the_buyback_pool() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    s.payment_admin.mint(&s.admin, &(10 * PRICE));
    s.sale.fund_buyback(&s.admin, &(10 * PRICE));

    let attacker = fund_buyer(&s, 3 * PRICE);
    let start = s.payment.balance(&attacker);

    for _ in 0..3 {
        s.sale.buy(&attacker, &1, &quoted(1));
        s.sale.sell(&attacker, &1, &discounted(1));
    }

    // Every loop costs the attacker the discount, so the balance strictly
    // falls and the pool is drained no faster than they fund it.
    let spent = start - s.payment.balance(&attacker);
    assert_eq!(spent, 3 * (PRICE - discounted(1)));
    assert!(s.payment.balance(&attacker) < start);
    assert_eq!(s.shares.balance(&attacker), 0);
    assert_eq!(s.sale.buyback_pool(), 10 * PRICE - 3 * discounted(1));
}

#[test]
fn sell_fails_when_pool_underfunded() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let buyer = fund_buyer(&s, 2 * PRICE);
    s.sale.buy(&buyer, &2, &quoted(2));

    // Pool holds one share worth, so selling two must fail atomically.
    s.payment_admin.mint(&s.admin, &PRICE);
    s.sale.fund_buyback(&s.admin, &PRICE);

    assert!(s.sale.try_sell(&buyer, &2, &discounted(2)).is_err());
    assert_eq!(s.shares.balance(&buyer), 2);
    assert_eq!(s.sale.buyback_pool(), PRICE);
}

#[test]
fn shares_cannot_reach_an_unregistered_holder_at_all() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let buyer = fund_buyer(&s, PRICE);
    s.sale.buy(&buyer, &1, &quoted(1));

    // Handing shares to an outsider by plain transfer is refused by the token
    // itself, so the "holds shares but was never admitted" state the sale
    // would otherwise have to defend against cannot be reached at all.
    let outsider = Address::generate(&env);
    assert!(s.shares.try_transfer(&buyer, &outsider, &1).is_err());
    assert_eq!(s.shares.balance(&outsider), 0);
}

#[test]
fn a_revoked_holder_cannot_sell_back() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let buyer = fund_buyer(&s, PRICE);
    s.sale.buy(&buyer, &1, &quoted(1));
    s.payment_admin.mint(&s.admin, &(10 * PRICE));
    s.sale.fund_buyback(&s.admin, &(10 * PRICE));

    s.registry.revoke(&s.kyc_provider, &buyer);

    assert!(s.sale.try_sell(&buyer, &1, &discounted(1)).is_err());
    assert_eq!(s.shares.balance(&buyer), 1);
}

#[test]
fn sell_rejects_zero_and_negative_amount() {
    let env = Env::default();
    let s = setup(&env);
    let seller = fund_buyer(&s, PRICE);

    assert!(s.sale.try_sell(&seller, &0, &0).is_err());
    assert!(s.sale.try_sell(&seller, &-1, &0).is_err());
}

#[test]
fn withdraw_buyback_moves_the_pool_and_stops_at_its_balance() {
    let env = Env::default();
    let s = setup(&env);
    s.payment_admin.mint(&s.admin, &(5 * PRICE));
    s.sale.fund_buyback(&s.admin, &(5 * PRICE));

    let vault = Address::generate(&env);
    s.sale.withdraw_buyback(&vault, &(2 * PRICE));

    assert_eq!(s.payment.balance(&vault), 2 * PRICE);
    assert_eq!(s.sale.buyback_pool(), 3 * PRICE);
    assert_eq!(
        s.sale.try_withdraw_buyback(&vault, &(10 * PRICE)),
        Err(code(307))
    );
}

/// The pool is the one place this contract custodies money, so the guard on it
/// gets a test that actually exercises authorization: a stranger signs, and
/// only `require_admin` can be what rejects the call.
#[test]
fn withdraw_buyback_rejects_a_signature_from_anyone_but_the_admin() {
    let env = Env::default();
    let s = setup(&env);
    s.payment_admin.mint(&s.admin, &(5 * PRICE));
    s.sale.fund_buyback(&s.admin, &(5 * PRICE));
    let stranger = Address::generate(&env);

    let result = s
        .sale
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &s.sale.address,
                fn_name: "withdraw_buyback",
                args: (stranger.clone(), 5 * PRICE).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .try_withdraw_buyback(&stranger, &(5 * PRICE));

    assert!(result.is_err());
    assert_eq!(s.sale.buyback_pool(), 5 * PRICE);
    assert_eq!(s.payment.balance(&stranger), 0);
}

/// `buy` and `sell` are the two entrypoints a stranger could try to run on
/// somebody else's behalf. Signing as the wrong party must not be enough.
#[test]
fn buy_and_sell_reject_a_signature_from_anyone_but_the_caller() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let holder = fund_buyer(&s, 5 * PRICE);
    s.sale.buy(&holder, &2, &quoted(2));
    s.payment_admin.mint(&s.admin, &(10 * PRICE));
    s.sale.fund_buyback(&s.admin, &(10 * PRICE));
    let stranger = fund_buyer(&s, 5 * PRICE);

    let bought = s
        .sale
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &s.sale.address,
                fn_name: "buy",
                args: (holder.clone(), 1_i128, quoted(1)).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .try_buy(&holder, &1, &quoted(1));
    assert!(bought.is_err());

    let sold = s
        .sale
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &s.sale.address,
                fn_name: "sell",
                args: (holder.clone(), 1_i128, discounted(1)).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .try_sell(&holder, &1, &discounted(1));
    assert!(sold.is_err());

    assert_eq!(s.shares.balance(&holder), 2);
}

/// The payment legs run buyer -> treasury and buyer -> fee_to. If the buyer is
/// on the receiving end of either, that leg nets to zero while the share leg
/// still delivers - the treasury key would take the whole inventory for the
/// price of a transaction fee, and the fee account would buy at a discount.
#[test]
fn neither_account_paid_by_the_sale_can_buy_from_it() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    // Even once both are cleared to hold shares, the sale refuses.
    s.registry.register_verified(&s.kyc_provider, &s.treasury);
    s.registry.register_verified(&s.kyc_provider, &s.fee_to);
    s.payment_admin.mint(&s.treasury, &(10 * PRICE));
    s.payment_admin.mint(&s.fee_to, &(10 * PRICE));

    assert_eq!(s.sale.try_buy(&s.treasury, &5, &quoted(5)), Err(code(310)));
    assert_eq!(s.sale.try_buy(&s.fee_to, &5, &quoted(5)), Err(code(310)));
    assert_eq!(s.shares.balance(&s.treasury), 0);
    assert_eq!(s.shares.balance(&s.fee_to), 0);
    assert_eq!(s.sale.remaining(), INVENTORY);
}

/// `remaining` answers "what is held here", which is the honest inventory
/// number and the wrong number for a buy button: a disabled sale sitting on
/// 500 shares offers none of them.
#[test]
fn availability_is_reported_separately_from_inventory() {
    let env = Env::default();
    let s = setup(&env);

    assert_eq!(s.sale.remaining(), INVENTORY);
    assert_eq!(s.sale.available_for_purchase(), 0);

    s.sale.set_available(&s.admin, &true);
    assert_eq!(s.sale.available_for_purchase(), INVENTORY);

    let buyer = fund_buyer(&s, 5 * PRICE);
    s.sale.buy(&buyer, &4, &quoted(4));
    assert_eq!(s.sale.available_for_purchase(), INVENTORY - 4);

    s.sale.set_available(&s.admin, &false);
    assert_eq!(s.sale.available_for_purchase(), 0);
    assert_eq!(s.sale.remaining(), INVENTORY - 4);
}

/// The quote rounds down. Without a positive floor, a low enough price makes
/// the payout zero while every other check still passes and the shares move.
#[test]
fn a_sell_must_name_a_payout_it_will_accept() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let holder = fund_buyer(&s, 2 * PRICE);
    s.sale.buy(&holder, &1, &quoted(1));

    assert_eq!(s.sale.try_sell(&holder, &1, &0), Err(code(302)));
    assert_eq!(s.sale.try_sell(&holder, &1, &-1), Err(code(302)));
    assert_eq!(s.shares.balance(&holder), 1);
}

/// Same on the way in: a purchase has to name the ceiling it accepts.
#[test]
fn a_buy_must_name_a_cost_it_will_accept() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let buyer = fund_buyer(&s, 5 * PRICE);

    assert_eq!(s.sale.try_buy(&buyer, &1, &0), Err(code(302)));
    assert_eq!(s.shares.balance(&buyer), 0);
}

/// The dApp has no backend, so contract events are the history, and the
/// frontend reads the data vec BY POSITION. Reordering two fields here would
/// silently swap two columns on the user's transactions screen, which no
/// balance assertion anywhere would catch. This pins the wire format down.
#[test]
fn the_buy_event_carries_the_layout_the_frontend_decodes() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let buyer = fund_buyer(&s, 5 * PRICE);

    s.sale.buy(&buyer, &3, &quoted(3));

    assert_eq!(
        env.events().all().filter_by_contract(&s.sale.address),
        vec![
            &env,
            (
                s.sale.address.clone(),
                (Symbol::new(&env, "buy"), buyer.clone()).into_val(&env),
                // [amount, cost, commission] - the order web/src/lib/events.ts
                // destructures.
                (3_i128, quoted(3), commission_on(3)).into_val(&env),
            ),
        ]
    );
}

/// Same contract for the sell side, which the UI renders with the opposite
/// sign and would therefore get exactly backwards if the fields swapped.
#[test]
fn the_sell_event_carries_the_layout_the_frontend_decodes() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);
    let holder = fund_buyer(&s, 5 * PRICE);
    s.sale.buy(&holder, &2, &quoted(2));
    s.payment_admin.mint(&s.admin, &(10 * PRICE));
    s.sale.fund_buyback(&s.admin, &(10 * PRICE));

    s.sale.sell(&holder, &2, &discounted(2));

    assert_eq!(
        env.events().all().filter_by_contract(&s.sale.address),
        vec![
            &env,
            (
                s.sale.address.clone(),
                (Symbol::new(&env, "sell"), holder.clone()).into_val(&env),
                // [amount, payout].
                (2_i128, discounted(2)).into_val(&env),
            ),
        ]
    );
}

/// What the hot key reaches here: the switch, and nothing that carries value.
/// A price of one stroop would empty the inventory into whoever noticed first,
/// which is why `set_price` is not on this list.
#[test]
fn the_operator_can_close_the_sale_but_not_reprice_or_drain_it() {
    let env = Env::default();
    let s = setup(&env);
    let operator = Address::generate(&env);
    s.sale.set_operator(&operator);
    s.sale.set_available(&s.admin, &true);

    s.sale.set_available(&operator, &false);
    assert!(!s.sale.available());
    s.sale.set_available(&operator, &true);
    assert!(s.sale.available());

    // Each of the three below is admin-only, and the operator holds a real
    // role here - so what rejects them is the entrypoint asking for the admin,
    // not the caller being a stranger to the contract.
    let denied = s
        .sale
        .mock_auths(&[MockAuth {
            address: &operator,
            invoke: &MockAuthInvoke {
                contract: &s.sale.address,
                fn_name: "set_price",
                args: (1_i128,).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_set_price(&1);
    assert!(denied.is_err());

    let denied = s
        .sale
        .mock_auths(&[MockAuth {
            address: &operator,
            invoke: &MockAuthInvoke {
                contract: &s.sale.address,
                fn_name: "withdraw_buyback",
                args: (operator.clone(), 1_i128).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_withdraw_buyback(&operator, &1);
    assert!(denied.is_err());

    let denied = s
        .sale
        .mock_auths(&[MockAuth {
            address: &operator,
            invoke: &MockAuthInvoke {
                contract: &s.sale.address,
                fn_name: "withdraw_shares",
                args: (operator.clone(), 1_i128).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_withdraw_shares(&operator, &1);
    assert!(denied.is_err());

    assert_eq!(s.sale.price(), PRICE);
}

/// A stranger is not an operator just because the entrypoint takes a caller.
#[test]
fn set_available_names_the_caller_and_checks_it() {
    let env = Env::default();
    let s = setup(&env);
    let stranger = Address::generate(&env);

    assert_eq!(s.sale.try_set_available(&stranger, &true), Err(code(901)));
    assert!(!s.sale.available());
}

// ---------------------------------------------------------------------------
// Settling the buyer as part of the purchase
// ---------------------------------------------------------------------------

/// Registers a real distributor and points the sale at it, returning both.
fn with_rewards<'a>(s: &Setup<'a>) -> RewardsDistributorClient<'a> {
    let rewards_id = s.env.register(
        RewardsDistributor,
        (
            s.admin.clone(),
            s.shares.address.clone(),
            s.payment.address.clone(),
            s.registry.address.clone(),
            SUPPLY,
        ),
    );
    s.registry.set_participant(&rewards_id, &true);
    s.sale.set_rewards(&rewards_id);
    RewardsDistributorClient::new(s.env, &rewards_id)
}

/// The call chain this whole design rests on: sale -> distributor -> token.
///
/// The token's own `transfer` has already returned by then, so the token is
/// not on the stack when the distributor reads a balance back out of it. If
/// Soroban treated that as re-entrancy, `buy` itself would fail here.
#[test]
fn buying_settles_the_buyer_so_the_next_round_pays_them() {
    let env = Env::default();
    let s = setup(&env);
    let rewards = with_rewards(&s);
    s.sale.set_available(&s.admin, &true);

    let buyer = fund_buyer(&s, quoted(2));
    s.sale.buy(&buyer, &2, &quoted(2));

    // Settled by the purchase, with no second call from anyone.
    assert_eq!(rewards.position(&buyer).balance, 2);

    // And the next round actually reaches them. `deposit` answers to the
    // admin or the operator, so the issuer here is the admin.
    s.payment_admin.mint(&s.admin, &1_000_000_000);
    rewards.deposit(&s.admin, &1_000_000_000);
    assert_eq!(rewards.claimable(&buyer), 1_000_000_000 * 2 / SUPPLY);
}

/// The upgrade lands before the setter does, and nothing breaks in between.
#[test]
fn buying_works_untouched_while_no_distributor_is_configured() {
    let env = Env::default();
    let s = setup(&env);
    s.sale.set_available(&s.admin, &true);

    assert_eq!(s.sale.rewards(), None);

    let buyer = fund_buyer(&s, quoted(2));
    s.sale.buy(&buyer, &2, &quoted(2));

    assert_eq!(s.shares.balance(&buyer), 2);
    assert_eq!(s.sale.remaining(), INVENTORY - 2);
}

/// A wrong address here stops the sale, so it is not the operator's to set.
#[test]
fn only_the_admin_can_point_the_sale_at_a_distributor() {
    let env = Env::default();
    let s = setup(&env);
    let operator = Address::generate(&env);
    s.sale.set_operator(&operator);
    let target = Address::generate(&env);

    let attempt = s
        .sale
        .mock_auths(&[MockAuth {
            address: &operator,
            invoke: &MockAuthInvoke {
                contract: &s.sale.address,
                fn_name: "set_rewards",
                args: (target.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_set_rewards(&target);

    // An auth failure rather than a contract error: `require_admin` asks the
    // stored admin to sign, and the operator's signature is not that.
    assert!(attempt.is_err());
    assert_eq!(s.sale.rewards(), None);
}
