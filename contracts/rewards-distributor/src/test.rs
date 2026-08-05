#![cfg(test)]

use crate::{RewardsDistributor, RewardsDistributorClient};
use compliance_registry::{ComplianceRegistry, ComplianceRegistryClient};
use share_token::{ShareToken, ShareTokenClient};
use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{token, Address, Env, Error as HostError, IntoVal, InvokeError, String};

/// The exact contract error a failed invocation carried, so a test cannot pass
/// on some other failure that merely also returns Err.
fn code(n: u32) -> Result<HostError, InvokeError> {
    Ok(HostError::from_contract_error(n))
}

const TOTAL_SHARES: i128 = 1000;
/// 100 XLM in stroops.
const ROUND: i128 = 1_000_000_000;

struct Setup<'a> {
    env: &'a Env,
    rewards: RewardsDistributorClient<'a>,
    registry: ComplianceRegistryClient<'a>,
    shares: ShareTokenClient<'a>,
    payment: token::TokenClient<'a>,
    admin: Address,
    /// Holds the issuance and hands shares out, standing in for the treasury
    /// and the sale contract. The token issues once, so every share in these
    /// tests comes from here rather than from a second mint.
    issuer: Address,
}

fn setup(env: &Env) -> Setup<'_> {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let issuer = Address::generate(env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let payment = token::TokenClient::new(env, &sac.address());
    let payment_admin = token::StellarAssetClient::new(env, &sac.address());

    let registry_id = env.register(ComplianceRegistry, (admin.clone(), admin.clone()));
    let registry = ComplianceRegistryClient::new(env, &registry_id);
    let share_id = env.register(
        ShareToken,
        (
            admin.clone(),
            String::from_str(env, "Sabai Lagoon Residence No. 1"),
            String::from_str(env, "SLR1"),
            registry_id.clone(),
            issuer.clone(),
            TOTAL_SHARES,
        ),
    );
    let shares = ShareTokenClient::new(env, &share_id);

    let rewards_id = env.register(
        RewardsDistributor,
        (
            admin.clone(),
            share_id.clone(),
            sac.address(),
            registry_id.clone(),
            TOTAL_SHARES,
        ),
    );
    let rewards = RewardsDistributorClient::new(env, &rewards_id);

    // The admin holds the reward budget in the payment token.
    payment_admin.mint(&admin, &(100 * ROUND));

    registry.set_participant(&issuer, &true);
    shares.mint(&issuer, &TOTAL_SHARES);

    Setup {
        env,
        rewards,
        shares,
        payment,
        registry,
        admin,
        issuer,
    }
}

/// A registered holder whose position is settled, so their shares are earning.
fn holder(s: &Setup, shares: i128) -> Address {
    let user = Address::generate(s.env);
    // Shares only reach addresses the registry admits - the token enforces it.
    s.registry.register(&user);
    if shares > 0 {
        s.shares.transfer(&s.issuer, &user, &shares);
    }
    s.rewards.settle(&user);
    user
}

/// XLM the distributor still holds.
fn pool(s: &Setup) -> i128 {
    s.payment.balance(&s.rewards.address)
}

#[test]
fn constructor_sets_initial_state() {
    let env = Env::default();
    let s = setup(&env);

    assert_eq!(s.rewards.total_shares(), TOTAL_SHARES);
    assert_eq!(s.rewards.total_deposited(), 0);
    assert_eq!(s.rewards.admin(), s.admin);
    assert_eq!(s.rewards.share_token(), s.shares.address);
    assert_eq!(s.rewards.payment_token(), s.payment.address);
}

#[test]
#[should_panic(expected = "#502")]
fn constructor_rejects_zero_shares() {
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
            TOTAL_SHARES,
        ),
    );
    env.register(
        RewardsDistributor,
        (admin.clone(), share_id, sac.address(), registry_id, 0_i128),
    );
}

#[test]
fn claimable_is_pro_rata_to_balance() {
    let env = Env::default();
    let s = setup(&env);
    // 100 shares -> 10% of every round.
    let a = holder(&s, 100);
    // 300 shares -> 30%.
    let b = holder(&s, 300);

    s.rewards.deposit(&s.admin, &ROUND);

    assert_eq!(s.rewards.claimable(&a), ROUND / 10);
    assert_eq!(s.rewards.claimable(&b), 3 * ROUND / 10);
    assert_eq!(s.rewards.total_deposited(), ROUND);
}

#[test]
fn claim_pays_and_resets_pending() {
    let env = Env::default();
    let s = setup(&env);
    let a = holder(&s, 250);

    s.rewards.deposit(&s.admin, &ROUND);
    s.rewards.claim(&a);

    assert_eq!(s.payment.balance(&a), ROUND / 4);
    assert_eq!(s.rewards.claimable(&a), 0);
    assert_eq!(s.rewards.claimed(&a), ROUND / 4);
    assert_eq!(s.rewards.earned(&a), ROUND / 4);
}

#[test]
fn multiple_rounds_accumulate() {
    let env = Env::default();
    let s = setup(&env);
    let a = holder(&s, 100);

    s.rewards.deposit(&s.admin, &ROUND);
    s.rewards.claim(&a);
    s.rewards.deposit(&s.admin, &(2 * ROUND));

    // Second round: 10% of 200 XLM on top of the already-claimed 10 XLM.
    assert_eq!(s.rewards.claimable(&a), 2 * ROUND / 10);
    assert_eq!(s.rewards.earned(&a), ROUND / 10 + 2 * ROUND / 10);
}

#[test]
fn claim_fails_with_nothing_pending() {
    let env = Env::default();
    let s = setup(&env);
    let a = holder(&s, 100);
    // No deposit yet - nothing to claim.
    assert_eq!(s.rewards.try_claim(&a), Err(code(501)));

    s.rewards.deposit(&s.admin, &ROUND);
    s.rewards.claim(&a);
    // Already claimed everything.
    assert_eq!(s.rewards.try_claim(&a), Err(code(501)));
}

#[test]
fn holder_without_shares_gets_nothing() {
    let env = Env::default();
    let s = setup(&env);
    let outsider = Address::generate(&env);

    s.rewards.deposit(&s.admin, &ROUND);

    assert_eq!(s.rewards.claimable(&outsider), 0);
    assert_eq!(s.rewards.try_claim(&outsider), Err(code(501)));
}

#[test]
fn deposit_rejects_non_positive() {
    let env = Env::default();
    let s = setup(&env);

    assert_eq!(s.rewards.try_deposit(&s.admin, &0), Err(code(502)));
    assert_eq!(s.rewards.try_deposit(&s.admin, &-5), Err(code(502)));
}

/// Signs as a stranger rather than leaving the env unauthorized, so the
/// failure can only come from the contract's own `admin.require_auth()` and
/// not from the payment token also wanting a signature.
#[test]
fn deposit_rejects_a_signature_from_anyone_but_the_admin() {
    let env = Env::default();
    let s = setup(&env);
    let stranger = Address::generate(&env);

    let result = s
        .rewards
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &s.rewards.address,
                fn_name: "deposit",
                args: (stranger.clone(), ROUND).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .try_deposit(&stranger, &ROUND);

    assert!(result.is_err());
    assert_eq!(s.rewards.total_deposited(), 0);
}

/// The property that makes the whole accumulator sound: a wallet only earns
/// rounds distributed while it was settled holding the shares.
#[test]
fn shares_that_arrive_after_a_round_earn_nothing_from_it() {
    let env = Env::default();
    let s = setup(&env);
    let early = holder(&s, 100);
    let late = holder(&s, 0);

    s.rewards.deposit(&s.admin, &ROUND);
    s.shares.transfer(&s.issuer, &late, &100);

    assert_eq!(s.rewards.claimable(&early), ROUND / 10);
    assert_eq!(s.rewards.claimable(&late), 0);

    // Settling stamps the position at today's accumulator, so the newcomer
    // starts from the next round rather than inheriting the last one.
    s.rewards.settle(&late);
    assert_eq!(s.rewards.claimable(&late), 0);
    s.rewards.deposit(&s.admin, &ROUND);
    assert_eq!(s.rewards.claimable(&late), ROUND / 10);
}

/// Regression: claim, then move the same shares to a fresh address and claim
/// again. Before per-address settlement this paid the round twice and the
/// second claimer drained rewards belonging to everyone else.
#[test]
fn claiming_then_moving_the_shares_cannot_pay_twice() {
    let env = Env::default();
    let s = setup(&env);
    let a = holder(&s, 100);
    let b = holder(&s, 0);

    s.rewards.deposit(&s.admin, &ROUND);
    s.rewards.claim(&a);
    assert_eq!(s.payment.balance(&a), ROUND / 10);

    s.shares.transfer(&a, &b, &100);

    // The shares carry no history to their new address.
    assert_eq!(s.rewards.claimable(&b), 0);
    assert_eq!(s.rewards.try_claim(&b), Err(code(501)));
    // And settling does not conjure it either.
    s.rewards.settle(&b);
    assert_eq!(s.rewards.claimable(&b), 0);

    // The sender keeps what they were owed and earns nothing further.
    assert_eq!(s.rewards.claimable(&a), 0);
    assert_eq!(s.payment.balance(&a) + s.payment.balance(&b), ROUND / 10);
}

/// The system-wide invariant, exercised across transfers between rounds:
/// however the shares move, the contract never pays out more than it took in.
#[test]
fn total_payouts_never_exceed_total_deposited() {
    let env = Env::default();
    let s = setup(&env);
    let a = holder(&s, 400);
    let b = holder(&s, 400);
    let c = holder(&s, 200);

    s.rewards.deposit(&s.admin, &ROUND);
    s.rewards.claim(&a);
    s.shares.transfer(&a, &b, &400);
    s.rewards.settle(&b);

    s.rewards.deposit(&s.admin, &ROUND);
    s.rewards.claim(&b);
    s.shares.transfer(&b, &c, &200);
    s.rewards.settle(&c);

    s.rewards.deposit(&s.admin, &ROUND);
    for who in [&a, &b, &c] {
        if s.rewards.claimable(who) > 0 {
            s.rewards.claim(who);
        }
    }

    let deposited = 3 * ROUND;
    let paid = s.payment.balance(&a) + s.payment.balance(&b) + s.payment.balance(&c);
    assert!(
        paid <= deposited,
        "paid {paid} exceeds deposited {deposited}"
    );
    assert_eq!(pool(&s), deposited - paid);
}

#[test]
fn selling_shares_before_claim_forfeits_the_difference() {
    let env = Env::default();
    let s = setup(&env);
    let a = holder(&s, 100);
    let b = holder(&s, 0);

    s.rewards.deposit(&s.admin, &ROUND);
    // Holder gives away half the balance before claiming.
    s.shares.transfer(&a, &b, &50);

    // Pending follows the CURRENT balance - 5% now, never negative.
    assert_eq!(s.rewards.claimable(&a), ROUND / 20);
    s.rewards.claim(&a);
    assert_eq!(s.payment.balance(&a), ROUND / 20);
}

#[test]
fn dust_rounding_never_overpays() {
    let env = Env::default();
    let s = setup(&env);
    // 333 + 667 = 1000 shares, deposit not divisible cleanly.
    let a = holder(&s, 333);
    let b = holder(&s, 667);
    let odd = 999_999_999_i128;

    s.rewards.deposit(&s.admin, &odd);
    s.rewards.claim(&a);
    s.rewards.claim(&b);

    // Sum of payouts must never exceed the deposit (dust stays in contract).
    let paid = s.payment.balance(&a) + s.payment.balance(&b);
    assert!(paid <= odd);
    assert!(odd - paid < 1000);
}

/// `settle` moves no money, so it needs no authorization: a wallet, a script
/// or the counterparty of a trade can all bring a position up to date.
#[test]
fn settle_needs_no_signature_and_pays_nothing() {
    let env = Env::default();
    let s = setup(&env);
    let a = holder(&s, 100);
    s.rewards.deposit(&s.admin, &ROUND);

    let before = s.payment.balance(&a);
    env.set_auths(&[]);
    s.rewards.settle(&a);

    assert_eq!(s.payment.balance(&a), before);
    // The banked amount is still claimable, just moved from accruing to owed.
    assert_eq!(s.rewards.claimable(&a), ROUND / 10);
    assert_eq!(s.rewards.position(&a).balance, 100);
}

/// The distributor divides by `total_shares`. Two properties of the token keep
/// that number honest: it cannot mint past the same cap, and it cannot mint a
/// second time at all. Either one alone would leave the other reachable.
#[test]
fn the_supply_rewards_divide_by_cannot_move() {
    let env = Env::default();
    let s = setup(&env);
    let a = holder(&s, TOTAL_SHARES);

    assert_eq!(s.shares.total_supply(), TOTAL_SHARES);
    assert_eq!(s.shares.max_supply(), s.rewards.total_shares());
    assert!(s.shares.issued());
    assert_eq!(s.shares.try_mint(&a, &1), Err(code(209)));
}

// Solvency, and the one holder who cannot be paid.

/// The pair anyone can read off an explorer to check the contract covers what
/// it owes, without trusting a line of this repository's documentation.
#[test]
fn the_pool_always_covers_what_is_outstanding() {
    let env = Env::default();
    let s = setup(&env);
    let a = holder(&s, 400);
    let b = holder(&s, 600);

    assert_eq!(s.rewards.pool(), 0);
    assert_eq!(s.rewards.outstanding(), 0);

    s.rewards.deposit(&s.admin, &ROUND);
    assert_eq!(s.rewards.pool(), ROUND);
    assert_eq!(s.rewards.outstanding(), ROUND);

    s.rewards.claim(&a);
    assert_eq!(s.rewards.total_claimed(), 2 * ROUND / 5);
    assert_eq!(s.rewards.pool(), ROUND - 2 * ROUND / 5);
    assert_eq!(s.rewards.outstanding(), s.rewards.pool());

    s.rewards.claim(&b);
    assert_eq!(s.rewards.pool(), 0);
    assert_eq!(s.rewards.outstanding(), 0);
}

/// `outstanding` is an upper bound, and the bound has to hold in the direction
/// that matters: rounds that accrue to shares nobody claims stay counted, so
/// `pool >= outstanding` is never a false reassurance.
#[test]
fn outstanding_over_states_rather_than_under_states_the_liability() {
    let env = Env::default();
    let s = setup(&env);
    let a = holder(&s, 100);
    // The other 900 shares sit with the issuer, which never claims - exactly
    // what unsold inventory on the sale contract does in the live deployment.

    s.rewards.deposit(&s.admin, &ROUND);
    s.rewards.claim(&a);

    assert_eq!(s.rewards.pool(), ROUND - ROUND / 10);
    assert_eq!(s.rewards.outstanding(), s.rewards.pool());
    assert!(s.rewards.pool() >= s.rewards.outstanding());
}

/// A sanctioned holder must not be paid out. Accrual continues underneath, so
/// lifting the suspension pays them everything they earned throughout it -
/// this withholds money, it does not confiscate it.
#[test]
fn a_frozen_holder_cannot_be_paid_but_keeps_accruing() {
    let env = Env::default();
    let s = setup(&env);
    let a = holder(&s, 100);

    s.rewards.deposit(&s.admin, &ROUND);
    s.registry.freeze(&s.admin, &a);

    assert_eq!(s.rewards.try_claim(&a), Err(code(504)));
    assert_eq!(s.payment.balance(&a), 0);
    // Still owed, and still earning from later rounds.
    assert_eq!(s.rewards.claimable(&a), ROUND / 10);
    s.rewards.deposit(&s.admin, &ROUND);
    assert_eq!(s.rewards.claimable(&a), 2 * ROUND / 10);

    s.registry.unfreeze(&s.admin, &a);
    s.rewards.claim(&a);
    assert_eq!(s.payment.balance(&a), 2 * ROUND / 10);
}

/// Halting the asset is not the same as withholding a holder's money. A pause
/// stops shares moving; rent already earned stays claimable, because freezing
/// a payout for everyone is confiscation rather than incident response.
#[test]
fn a_paused_deployment_still_pays_rent_already_earned() {
    let env = Env::default();
    let s = setup(&env);
    let a = holder(&s, 100);

    s.rewards.deposit(&s.admin, &ROUND);
    s.registry.pause(&s.admin);

    // Shares are frozen in place...
    assert!(s.shares.try_transfer(&a, &s.issuer, &1).is_err());
    // ...and the rent is still paid.
    s.rewards.claim(&a);
    assert_eq!(s.payment.balance(&a), ROUND / 10);
}

/// Distributing rent is a monthly job, so it is the operator's. It is also the
/// safest call to hand out: money moves into the pool, and nothing here moves
/// it back out except a holder claiming their own share.
#[test]
fn the_operator_can_distribute_a_round() {
    let env = Env::default();
    let s = setup(&env);
    let operator = Address::generate(&env);
    s.rewards.set_operator(&operator);
    s.payment.transfer(&s.admin, &operator, &ROUND);
    let a = holder(&s, 100);

    s.rewards.deposit(&operator, &ROUND);

    assert_eq!(s.rewards.total_deposited(), ROUND);
    assert_eq!(s.rewards.claimable(&a), ROUND / 10);
    assert_eq!(s.payment.balance(&operator), 0);
}

/// The deposit is charged to the address that signs it, so a stranger cannot
/// name someone else's account as the source.
#[test]
fn a_stranger_cannot_distribute_a_round() {
    let env = Env::default();
    let s = setup(&env);
    let stranger = Address::generate(&env);

    assert_eq!(s.rewards.try_deposit(&stranger, &ROUND), Err(code(901)));
    assert_eq!(s.rewards.total_deposited(), 0);
}
