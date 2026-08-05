#![cfg(test)]

use crate::{AssetExchange, AssetExchangeClient};
use asset_sale::AssetSale;
use compliance_registry::{ComplianceRegistry, ComplianceRegistryClient};
use rewards_distributor::{RewardsDistributor, RewardsDistributorClient};
use share_token::{ShareToken, ShareTokenClient};
use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{token, Address, Env, Error as HostError, IntoVal, InvokeError, String};

/// The exact contract error a failed invocation carried, so a test cannot pass
/// on some other failure that merely also returns Err.
fn code(n: u32) -> Result<HostError, InvokeError> {
    Ok(HostError::from_contract_error(n))
}

/// Primary price: one share costs 100 XLM = 1_000_000_000 stroops.
const PRICE: i128 = 1_000_000_000;
/// Share supply cap the token is deployed with.
const SUPPLY: i128 = 1000;
/// Exchange price band: 50-200 XLM per share.
const MIN_RATE: i128 = 500_000_000;
const MAX_RATE: i128 = 2_000_000_000;
/// Platform commission: 200 bps = 2%.
const COMMISSION_BPS: u32 = 200;
/// Buyback discount on the sale contract - irrelevant here, it just has to
/// be a valid constructor argument.
const DISCOUNT_BPS: u32 = 500;

struct Setup<'a> {
    env: &'a Env,
    exchange: AssetExchangeClient<'a>,
    shares: ShareTokenClient<'a>,
    payment: token::TokenClient<'a>,
    payment_admin: token::StellarAssetClient<'a>,
    registry: ComplianceRegistryClient<'a>,
    admin: Address,
    fee_to: Address,
    /// Holds the issuance and hands shares out. The token issues once, so
    /// every share in these tests originates here.
    issuer: Address,
}

fn setup(env: &Env) -> Setup<'_> {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    let fee_to = Address::generate(env);
    let issuer = Address::generate(env);
    let provider = Address::generate(env);
    let registry_id = env.register(ComplianceRegistry, (admin.clone(), provider.clone()));
    let registry = ComplianceRegistryClient::new(env, &registry_id);

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

    // A real sale contract, so escrow and inventory behave as they do live.
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
    let exchange_id = env.register(
        AssetExchange,
        (
            admin.clone(),
            share_id.clone(),
            sac.address(),
            registry_id.clone(),
            fee_to.clone(),
            COMMISSION_BPS,
            MIN_RATE,
            MAX_RATE,
        ),
    );
    let exchange = AssetExchangeClient::new(env, &exchange_id);

    // Both contracts hold shares - the sale its inventory, the exchange its
    // escrow - so both have to be admitted participants.
    registry.set_participant(&sale_id, &true);
    registry.set_participant(&exchange_id, &true);
    registry.set_participant(&issuer, &true);
    shares.mint(&issuer, &SUPPLY);

    Setup {
        env,
        exchange,
        shares,
        payment,
        payment_admin,
        registry,
        admin,
        fee_to,
        issuer,
    }
}

/// A KYC'd user holding `share_amount` SLR1 and `xlm_stroops` XLM.
fn actor(s: &Setup, share_amount: i128, xlm_stroops: i128) -> Address {
    let user = Address::generate(s.env);
    s.registry.register(&user);
    if share_amount > 0 {
        s.shares.transfer(&s.issuer, &user, &share_amount);
    }
    if xlm_stroops > 0 {
        s.payment_admin.mint(&user, &xlm_stroops);
    }
    user
}

#[test]
fn constructor_sets_initial_state() {
    let env = Env::default();
    let s = setup(&env);

    assert!(s.exchange.available());
    assert_eq!(s.exchange.commission_bps(), COMMISSION_BPS);
    assert_eq!(s.exchange.min_rate(), MIN_RATE);
    assert_eq!(s.exchange.max_rate(), MAX_RATE);
    assert_eq!(s.exchange.admin(), s.admin);
    assert_eq!(s.exchange.fee_to(), s.fee_to);
    assert_eq!(s.exchange.registry(), s.registry.address);
    assert_eq!(s.exchange.share_token(), s.shares.address);
    assert_eq!(s.exchange.payment_token(), s.payment.address);
    assert_eq!(s.exchange.orders().len(), 0);
}

#[test]
#[should_panic(expected = "#410")]
fn constructor_rejects_commission_above_cap() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let registry_id = env.register(ComplianceRegistry, (admin.clone(), admin.clone()));
    let share_id = env.register(
        ShareToken,
        (
            admin.clone(),
            String::from_str(&env, "S"),
            String::from_str(&env, "S"),
            registry_id.clone(),
            admin.clone(),
            SUPPLY,
        ),
    );
    env.register(
        AssetExchange,
        (
            admin.clone(),
            share_id,
            sac.address(),
            registry_id,
            admin.clone(),
            3_001_u32, // > 30% cap
            MIN_RATE,
            MAX_RATE,
        ),
    );
}

#[test]
fn add_order_escrows_shares_and_lists_order() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 10, 0);

    let id = s.exchange.add_order(&seller, &4, &PRICE);

    assert_eq!(id, 1);
    assert_eq!(s.shares.balance(&seller), 6);
    assert_eq!(s.shares.balance(&s.exchange.address), 4);

    let orders = s.exchange.orders();
    assert_eq!(orders.len(), 1);
    let order = orders.get(0).unwrap();
    assert_eq!(order.id, 1);
    assert_eq!(order.seller, seller);
    assert_eq!(order.rate, PRICE);
    assert_eq!(order.amount, 4);
    assert_eq!(order.remaining, 4);
}

#[test]
fn an_unregistered_address_cannot_even_receive_shares_to_list() {
    let env = Env::default();
    let s = setup(&env);
    let stranger = Address::generate(&env);

    // The token refuses to deliver shares to an address the registry has not
    // admitted, so the "holds shares but never passed KYC" case the exchange
    // used to guard against cannot arise.
    assert_eq!(s.shares.try_mint(&stranger, &5), Err(code(205)));
    assert_eq!(s.shares.balance(&stranger), 0);
    // And the exchange rejects them on its own terms, with its own error,
    // rather than leaving it to the escrow transfer to fail on a zero balance.
    assert_eq!(
        s.exchange.try_add_order(&stranger, &1, &PRICE),
        Err(code(408))
    );
}

#[test]
fn revoking_a_seller_stops_them_listing() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 10, 0);

    s.registry.revoke(&s.registry.kyc_provider(), &seller);

    assert_eq!(
        s.exchange.try_add_order(&seller, &1, &PRICE),
        Err(code(408))
    );
}

/// Revoking someone mid-listing freezes the escrow in both directions.
///
/// The refund is a transfer INTO their address and the token checks that side,
/// so neither cancel path works. The fill is blocked by the exchange itself:
/// without that check nothing in the stack would ever consult the registry
/// about the seller, and a revoked holder could liquidate the whole position
/// and be paid for it through a plain SAC transfer.
#[test]
fn revoking_a_seller_freezes_the_escrow_until_they_are_admitted_again() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 10, 0);
    let buyer = actor(&s, 0, 100 * PRICE);
    let order = s.exchange.add_order(&seller, &4, &PRICE);
    let provider = s.registry.kyc_provider();

    s.registry.revoke(&provider, &seller);

    // Nobody can take the escrow out, and nobody can buy it either.
    assert_eq!(s.exchange.try_close_order(&seller, &order), Err(code(205)));
    assert_eq!(
        s.exchange.try_close_order_by(&s.admin, &order),
        Err(code(205))
    );
    assert_eq!(
        s.exchange.try_swap_order(&buyer, &order, &1),
        Err(code(411))
    );
    assert_eq!(s.shares.balance(&seller), 6);
    assert_eq!(s.shares.balance(&buyer), 0);
    assert_eq!(s.payment.balance(&seller), 0);

    // Admitted again, both paths work: a buyer can fill and the seller can
    // cancel the rest.
    s.registry.register_verified(&provider, &seller);
    s.exchange.swap_order(&buyer, &order, &1);
    assert_eq!(s.shares.balance(&buyer), 1);
    s.exchange.close_order(&seller, &order);
    assert_eq!(s.shares.balance(&seller), 9);
    assert!(s.exchange.order(&order).is_none());
}

/// Suspension does the same to the escrow as revocation, and this contract
/// needed no code for it: both paths go through `allowed`, which is where the
/// freeze list acts. What differs is the record - the seller's verification
/// survives, so lifting the suspension is one call rather than a re-onboarding.
#[test]
fn freezing_a_seller_freezes_the_escrow_the_same_way() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 10, 0);
    let buyer = actor(&s, 0, 100 * PRICE);
    let order = s.exchange.add_order(&seller, &4, &PRICE);
    let provider = s.registry.kyc_provider();

    s.registry.freeze(&provider, &seller);

    assert_eq!(s.exchange.try_close_order(&seller, &order), Err(code(205)));
    assert_eq!(
        s.exchange.try_swap_order(&buyer, &order, &1),
        Err(code(411))
    );
    assert!(s.registry.whitelisted(&seller));

    s.registry.unfreeze(&provider, &seller);
    s.exchange.swap_order(&buyer, &order, &1);
    assert_eq!(s.shares.balance(&buyer), 1);
}

/// The deployment-wide halt reaches the order book too, and the exchange has
/// no pause flag of its own involved: every path here asks the registry first.
#[test]
fn the_deployment_halt_stops_the_order_book() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 10, 0);
    let buyer = actor(&s, 0, 100 * PRICE);
    let order = s.exchange.add_order(&seller, &4, &PRICE);

    s.registry.pause(&s.admin);

    assert_eq!(
        s.exchange.try_add_order(&seller, &1, &PRICE),
        Err(code(408))
    );
    assert_eq!(
        s.exchange.try_swap_order(&buyer, &order, &1),
        Err(code(408))
    );
    assert_eq!(s.exchange.try_close_order(&seller, &order), Err(code(205)));
    // Trading itself was never switched off - the halt is elsewhere.
    assert!(s.exchange.available());

    s.registry.resume();
    s.exchange.swap_order(&buyer, &order, &1);
    assert_eq!(s.shares.balance(&buyer), 1);
}

#[test]
#[should_panic(expected = "#403")]
fn add_order_rejects_rate_outside_band() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 5, 0);

    s.exchange.add_order(&seller, &1, &(MAX_RATE + 1));
}

#[test]
#[should_panic(expected = "#402")]
fn add_order_rejects_zero_amount() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 5, 0);

    s.exchange.add_order(&seller, &0, &PRICE);
}

#[test]
fn swap_order_full_fill_pays_seller_minus_commission() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 5, 0);
    // Enough XLM for 2 shares at 100 XLM.
    let buyer = actor(&s, 0, 300 * 10_000_000);

    let id = s.exchange.add_order(&seller, &2, &PRICE);
    s.exchange.swap_order(&buyer, &id, &2);

    let cost = 2 * PRICE; // 200 XLM
    let commission = cost * (COMMISSION_BPS as i128) / 10_000; // 4 XLM
    assert_eq!(s.shares.balance(&buyer), 2);
    assert_eq!(s.shares.balance(&s.exchange.address), 0);
    assert_eq!(s.payment.balance(&seller), cost - commission);
    assert_eq!(s.payment.balance(&s.fee_to), commission);
    // Fully filled orders disappear from the book.
    assert_eq!(s.exchange.orders().len(), 0);
    assert_eq!(s.exchange.order(&id), None);
}

#[test]
fn swap_order_partial_fill_keeps_order_open() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 10, 0);
    let buyer = actor(&s, 0, 1_000 * 10_000_000);

    let id = s.exchange.add_order(&seller, &6, &PRICE);
    s.exchange.swap_order(&buyer, &id, &2);

    let order = s.exchange.order(&id).unwrap();
    assert_eq!(order.remaining, 4);
    assert_eq!(order.amount, 6);
    assert_eq!(s.shares.balance(&buyer), 2);
    assert_eq!(s.shares.balance(&s.exchange.address), 4);

    // The rest can be bought later; the order then closes itself.
    s.exchange.swap_order(&buyer, &id, &4);
    assert_eq!(s.exchange.order(&id), None);
    assert_eq!(s.shares.balance(&buyer), 6);
}

#[test]
#[should_panic(expected = "#405")]
fn swap_order_rejects_own_order() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 5, 1_000 * 10_000_000);

    let id = s.exchange.add_order(&seller, &2, &PRICE);
    s.exchange.swap_order(&seller, &id, &1);
}

#[test]
#[should_panic(expected = "#406")]
fn swap_order_rejects_amount_above_remaining() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 5, 0);
    let buyer = actor(&s, 0, 1_000 * 10_000_000);

    let id = s.exchange.add_order(&seller, &2, &PRICE);
    s.exchange.swap_order(&buyer, &id, &3);
}

#[test]
#[should_panic(expected = "#408")]
fn swap_order_fails_without_registration() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 5, 0);
    let stranger = Address::generate(&env);
    s.payment_admin.mint(&stranger, &(1_000 * 10_000_000));

    let id = s.exchange.add_order(&seller, &2, &PRICE);
    s.exchange.swap_order(&stranger, &id, &1);
}

#[test]
#[should_panic(expected = "#404")]
fn swap_order_fails_for_unknown_order() {
    let env = Env::default();
    let s = setup(&env);
    let buyer = actor(&s, 0, 1_000 * 10_000_000);

    s.exchange.swap_order(&buyer, &99, &1);
}

#[test]
fn close_order_returns_remaining_escrow() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 10, 0);
    let buyer = actor(&s, 0, 1_000 * 10_000_000);

    let id = s.exchange.add_order(&seller, &6, &PRICE);
    s.exchange.swap_order(&buyer, &id, &2);
    s.exchange.close_order(&seller, &id);

    // 4 unsold shares come back; the 2 sold ones do not.
    assert_eq!(s.shares.balance(&seller), 8);
    assert_eq!(s.shares.balance(&s.exchange.address), 0);
    assert_eq!(s.exchange.order(&id), None);
    assert_eq!(s.exchange.orders().len(), 0);
}

#[test]
#[should_panic(expected = "#407")]
fn close_order_rejects_non_seller() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 5, 0);
    let other = actor(&s, 0, 0);

    let id = s.exchange.add_order(&seller, &2, &PRICE);
    s.exchange.close_order(&other, &id);
}

#[test]
fn close_order_by_admin_refunds_the_seller() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 5, 0);

    let id = s.exchange.add_order(&seller, &3, &PRICE);
    s.exchange.close_order_by(&s.admin, &id);

    // Escrow returns to the seller, not to the admin.
    assert_eq!(s.shares.balance(&seller), 5);
    assert_eq!(s.shares.balance(&s.exchange.address), 0);
    assert_eq!(s.exchange.order(&id), None);
}

/// Both admin entrypoints, signed by an eligible stranger rather than left
/// unauthorized, so the only thing that can reject the call is the admin's
/// own `require_auth`.
#[test]
fn admin_entrypoints_reject_a_signature_from_anyone_else() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 5, 0);
    let stranger = actor(&s, 0, 0);
    let id = s.exchange.add_order(&seller, &3, &PRICE);

    let closed = s
        .exchange
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &s.exchange.address,
                fn_name: "close_order_by",
                args: (stranger.clone(), id).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .try_close_order_by(&stranger, &id);
    assert!(closed.is_err());

    let paused = s
        .exchange
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &s.exchange.address,
                fn_name: "set_available",
                args: (stranger.clone(), false).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .try_set_available(&stranger, &false);
    assert!(paused.is_err());

    // Nothing moved and nothing was switched off.
    assert!(s.exchange.available());
    assert_eq!(s.exchange.order(&id).unwrap().remaining, 3);
}

/// A seller cannot cancel with someone else's signature either.
#[test]
fn close_order_needs_the_sellers_own_signature() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 5, 0);
    let stranger = actor(&s, 0, 0);
    let id = s.exchange.add_order(&seller, &3, &PRICE);

    let result = s
        .exchange
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &s.exchange.address,
                fn_name: "close_order",
                args: (seller.clone(), id).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .try_close_order(&seller, &id);

    assert!(result.is_err());
    assert_eq!(s.exchange.order(&id).unwrap().remaining, 3);
}

/// The band is inclusive at both ends, and rejects a rate below the floor with
/// the same error it uses above the ceiling.
#[test]
fn the_rate_band_is_inclusive_at_both_ends() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 10, 0);

    s.exchange.add_order(&seller, &1, &MIN_RATE);
    s.exchange.add_order(&seller, &1, &MAX_RATE);
    assert_eq!(s.exchange.orders().len(), 2);

    assert_eq!(
        s.exchange.try_add_order(&seller, &1, &(MIN_RATE - 1)),
        Err(code(403))
    );
}

#[test]
#[should_panic(expected = "#410")]
fn constructor_rejects_a_zero_min_rate() {
    let env = Env::default();
    let s = setup(&env);
    env.register(
        AssetExchange,
        (
            s.admin.clone(),
            s.shares.address.clone(),
            s.payment.address.clone(),
            s.registry.address.clone(),
            s.fee_to.clone(),
            COMMISSION_BPS,
            0_i128,
            MAX_RATE,
        ),
    );
}

#[test]
#[should_panic(expected = "#410")]
fn constructor_rejects_an_inverted_band() {
    let env = Env::default();
    let s = setup(&env);
    env.register(
        AssetExchange,
        (
            s.admin.clone(),
            s.shares.address.clone(),
            s.payment.address.clone(),
            s.registry.address.clone(),
            s.fee_to.clone(),
            COMMISSION_BPS,
            MAX_RATE,
            MIN_RATE,
        ),
    );
}

#[test]
#[should_panic(expected = "#401")]
fn set_available_false_blocks_new_orders() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 5, 0);

    s.exchange.set_available(&s.admin, &false);
    s.exchange.add_order(&seller, &1, &PRICE);
}

#[test]
fn close_order_still_works_when_trading_disabled() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 5, 0);

    let id = s.exchange.add_order(&seller, &2, &PRICE);
    s.exchange.set_available(&s.admin, &false);
    // Sellers can always exit, even with the exchange switched off.
    s.exchange.close_order(&seller, &id);
    assert_eq!(s.shares.balance(&seller), 5);
}

#[test]
fn multiple_orders_list_oldest_first_and_close_independently() {
    let env = Env::default();
    let s = setup(&env);
    let alice = actor(&s, 10, 0);
    let bob = actor(&s, 10, 0);
    let buyer = actor(&s, 0, 2_000 * 10_000_000);

    let a = s.exchange.add_order(&alice, &3, &PRICE);
    let b = s.exchange.add_order(&bob, &5, &(PRICE + 1_000));
    assert_eq!(s.exchange.orders().len(), 2);
    assert_eq!(s.exchange.orders().get(0).unwrap().id, a);
    assert_eq!(s.exchange.orders().get(1).unwrap().id, b);

    // Filling one order leaves the other untouched.
    s.exchange.swap_order(&buyer, &a, &3);
    let left = s.exchange.orders();
    assert_eq!(left.len(), 1);
    assert_eq!(left.get(0).unwrap().id, b);
    assert_eq!(left.get(0).unwrap().remaining, 5);
}

#[test]
fn commission_rounds_down_and_never_overpays() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 5, 0);
    let buyer = actor(&s, 0, 1_000 * 10_000_000);

    // Rate chosen so commission truncates: 3 * 500_000_001 = 1_500_000_003;
    // 2% = 30_000_000.06 -> 30_000_000 (floor).
    let rate = MIN_RATE + 1;
    let id = s.exchange.add_order(&seller, &3, &rate);
    s.exchange.swap_order(&buyer, &id, &3);

    let cost = 3 * rate;
    let commission = cost * (COMMISSION_BPS as i128) / 10_000;
    assert_eq!(commission, 30_000_000);
    assert_eq!(s.payment.balance(&seller), cost - commission);
    assert_eq!(s.payment.balance(&s.fee_to), commission);
    // Seller payout + commission always reconstruct the full cost.
    assert_eq!(
        s.payment.balance(&seller) + s.payment.balance(&s.fee_to),
        cost
    );
}

/// The market switch and the moderation tool are both operator-reachable: the
/// escrow of a force-cancelled order can only ever go back to its seller, so
/// neither call can move a share anywhere the seller did not put it.
#[test]
fn the_operator_can_halt_trading_and_force_cancel_an_order() {
    let env = Env::default();
    let s = setup(&env);
    let operator = Address::generate(&env);
    s.exchange.set_operator(&operator);
    let seller = actor(&s, 5, 0);
    let id = s.exchange.add_order(&seller, &3, &PRICE);

    s.exchange.close_order_by(&operator, &id);
    assert!(s.exchange.order(&id).is_none());
    assert_eq!(s.shares.balance(&seller), 5);

    s.exchange.set_available(&operator, &false);
    assert!(!s.exchange.available());
}

/// And a stranger holds neither role, whatever they pass as the caller.
#[test]
fn a_stranger_cannot_halt_trading() {
    let env = Env::default();
    let s = setup(&env);
    let stranger = Address::generate(&env);

    assert_eq!(
        s.exchange.try_set_available(&stranger, &false),
        Err(code(901))
    );
    assert!(s.exchange.available());
}

// ---------------------------------------------------------------------------
// Settling the buyer as part of the fill
// ---------------------------------------------------------------------------

/// Registers a real distributor and points the market at it.
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
    s.exchange.set_rewards(&rewards_id);
    RewardsDistributorClient::new(s.env, &rewards_id)
}

/// exchange -> distributor -> token, with the token's own transfer already
/// returned. The same chain the primary sale relies on.
#[test]
fn filling_an_order_settles_the_buyer_so_the_next_round_pays_them() {
    let env = Env::default();
    let s = setup(&env);
    let rewards = with_rewards(&s);
    let seller = actor(&s, 10, 0);
    let buyer = actor(&s, 0, 100 * PRICE);
    let order = s.exchange.add_order(&seller, &4, &PRICE);

    s.exchange.swap_order(&buyer, &order, &3);

    // Settled by the fill, with no second call from anyone.
    assert_eq!(rewards.position(&buyer).balance, 3);

    s.payment_admin.mint(&s.admin, &1_000_000_000);
    rewards.deposit(&s.admin, &1_000_000_000);
    assert_eq!(rewards.claimable(&buyer), 1_000_000_000 * 3 / SUPPLY);
}

/// The upgrade lands before the setter does, and nothing breaks in between.
#[test]
fn filling_works_untouched_while_no_distributor_is_configured() {
    let env = Env::default();
    let s = setup(&env);
    let seller = actor(&s, 10, 0);
    let buyer = actor(&s, 0, 100 * PRICE);

    assert_eq!(s.exchange.rewards(), None);

    let order = s.exchange.add_order(&seller, &4, &PRICE);
    s.exchange.swap_order(&buyer, &order, &3);

    assert_eq!(s.shares.balance(&buyer), 3);
}

/// A wrong address here stops every fill, so it is not the operator's to set.
#[test]
fn only_the_admin_can_point_the_market_at_a_distributor() {
    let env = Env::default();
    let s = setup(&env);
    let operator = Address::generate(&env);
    s.exchange.set_operator(&operator);
    let target = Address::generate(&env);

    let attempt = s
        .exchange
        .mock_auths(&[MockAuth {
            address: &operator,
            invoke: &MockAuthInvoke {
                contract: &s.exchange.address,
                fn_name: "set_rewards",
                args: (target.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_set_rewards(&target);

    // An auth failure rather than a contract error: `require_admin` asks the
    // stored admin to sign, and the operator's signature is not that.
    assert!(attempt.is_err());
    assert_eq!(s.exchange.rewards(), None);
}
