#![cfg(test)]

use crate::{ShareToken, ShareTokenClient, Terms};
use compliance_registry::{ComplianceRegistry, ComplianceRegistryClient};
use soroban_sdk::testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke};
use soroban_sdk::{
    vec, Address, BytesN, Env, Error as HostError, IntoVal, InvokeError, String, Symbol,
};

/// The exact contract error a failed invocation carried, so a test cannot pass
/// on some other failure that merely also returns Err.
fn code(n: u32) -> Result<HostError, InvokeError> {
    Ok(HostError::from_contract_error(n))
}

/// Share supply cap the token is deployed with.
const SUPPLY: i128 = 1000;

struct Setup<'a> {
    env: &'a Env,
    token: ShareTokenClient<'a>,
    registry: ComplianceRegistryClient<'a>,
    admin: Address,
    provider: Address,
    treasury: Address,
}

fn setup_full(env: &Env) -> Setup<'_> {
    let admin = Address::generate(env);
    let provider = Address::generate(env);
    let treasury = Address::generate(env);
    let registry_id = env.register(ComplianceRegistry, (admin.clone(), provider.clone()));
    let contract_id = env.register(
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
    Setup {
        env,
        token: ShareTokenClient::new(env, &contract_id),
        registry: ComplianceRegistryClient::new(env, &registry_id),
        admin,
        provider,
        treasury,
    }
}

/// An address cleared to hold shares - the default actor for balance tests.
fn holder(s: &Setup) -> Address {
    let a = Address::generate(s.env);
    s.registry.register_verified(&s.provider, &a);
    a
}

fn setup(env: &Env) -> (ShareTokenClient<'_>, Address) {
    let s = setup_full(env);
    (s.token, s.admin)
}

#[test]
fn metadata_is_set_on_deploy() {
    let env = Env::default();
    let (token, admin) = setup(&env);

    assert_eq!(
        token.name(),
        String::from_str(&env, "Sabai Lagoon Residence No. 1")
    );
    assert_eq!(token.symbol(), String::from_str(&env, "SLR1"));
    assert_eq!(token.decimals(), 0);
    assert_eq!(token.total_supply(), 0);
    assert_eq!(token.admin(), admin);
}

#[test]
fn admin_mints_and_supply_grows() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let token = &s.token;
    let holder = holder(&s);

    token.mint(&holder, &1000);

    assert_eq!(token.balance(&holder), 1000);
    assert_eq!(token.total_supply(), 1000);
}

#[test]
fn mint_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let recipient = holder(&s);

    // Clear the mocks: an eligible recipient is not enough, the admin still
    // has to sign.
    env.set_auths(&[]);
    assert!(s.token.try_mint(&recipient, &1000).is_err());
}

#[test]
fn transfer_moves_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let token = &s.token;
    let alice = holder(&s);
    let bob = holder(&s);

    token.mint(&alice, &10);
    token.transfer(&alice, &bob, &3);

    assert_eq!(token.balance(&alice), 7);
    assert_eq!(token.balance(&bob), 3);
}

#[test]
fn transfer_more_than_balance_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let token = &s.token;
    let alice = holder(&s);
    let bob = holder(&s);

    token.mint(&alice, &5);

    assert!(token.try_transfer(&alice, &bob, &6).is_err());
    assert_eq!(token.balance(&alice), 5);
}

#[test]
fn negative_amount_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let token = &s.token;
    let alice = holder(&s);

    assert!(token.try_mint(&alice, &-1).is_err());
    assert!(token.try_transfer(&alice, &alice, &-1).is_err());
}

#[test]
fn approve_and_transfer_from() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let token = &s.token;
    let owner = holder(&s);
    let spender = holder(&s);
    let receiver = holder(&s);

    token.mint(&owner, &100);
    let expiration = env.ledger().sequence() + 100;
    token.approve(&owner, &spender, &40, &expiration);
    assert_eq!(token.allowance(&owner, &spender), 40);

    token.transfer_from(&spender, &owner, &receiver, &25);

    assert_eq!(token.balance(&owner), 75);
    assert_eq!(token.balance(&receiver), 25);
    assert_eq!(token.allowance(&owner, &spender), 15);
}

#[test]
fn transfer_from_beyond_allowance_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let token = &s.token;
    let owner = holder(&s);
    let spender = holder(&s);
    let receiver = holder(&s);

    token.mint(&owner, &100);
    let expiration = env.ledger().sequence() + 100;
    token.approve(&owner, &spender, &10, &expiration);

    assert!(token
        .try_transfer_from(&spender, &owner, &receiver, &11)
        .is_err());
}

#[test]
fn expired_allowance_is_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let token = &s.token;
    let owner = holder(&s);
    let spender = holder(&s);

    token.mint(&owner, &100);
    let expiration = env.ledger().sequence() + 10;
    token.approve(&owner, &spender, &40, &expiration);
    assert_eq!(token.allowance(&owner, &spender), 40);

    env.ledger()
        .with_mut(|l| l.sequence_number = expiration + 1);

    assert_eq!(token.allowance(&owner, &spender), 0);
}

#[test]
fn burn_reduces_supply() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let token = &s.token;
    let alice = holder(&s);

    token.mint(&alice, &10);
    token.burn(&alice, &4);

    assert_eq!(token.balance(&alice), 6);
    assert_eq!(token.total_supply(), 6);
}

// The compliance gate
//
// These are the reason the token consults a registry at all. Without them the
// eligibility rule would only exist in the sale and exchange contracts, and a
// holder could step around it with a plain wallet-to-wallet transfer.

#[test]
fn transfer_to_an_uncleared_address_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);
    let stranger = Address::generate(&env); // never went through KYC

    s.token.mint(&alice, &10);

    assert!(s.token.try_transfer(&alice, &stranger, &1).is_err());
    assert_eq!(s.token.balance(&alice), 10);
    assert_eq!(s.token.balance(&stranger), 0);
}

#[test]
fn minting_to_an_uncleared_address_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let stranger = Address::generate(&env);

    assert!(s.token.try_mint(&stranger, &10).is_err());
    assert_eq!(s.token.total_supply(), 0);
}

#[test]
fn transfer_from_checks_both_sides_not_just_the_spender() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let owner = holder(&s);
    let spender = holder(&s);
    let stranger = Address::generate(&env);

    s.token.mint(&owner, &100);
    let expiration = env.ledger().sequence() + 100;
    s.token.approve(&owner, &spender, &40, &expiration);

    // An approved spender is still not a way to deliver shares to an address
    // the registry has not cleared.
    assert!(s
        .token
        .try_transfer_from(&spender, &owner, &stranger, &10)
        .is_err());
    assert_eq!(s.token.balance(&owner), 100);
}

#[test]
fn revoking_an_investor_freezes_their_shares_in_place() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);
    let bob = holder(&s);

    s.token.mint(&alice, &10);
    s.token.transfer(&alice, &bob, &2);
    assert_eq!(s.token.balance(&bob), 2);

    s.registry.revoke(&s.provider, &alice);

    // Alice keeps what she holds - revocation is not confiscation - but she
    // can no longer move it, and nobody can send her more.
    assert_eq!(s.token.balance(&alice), 8);
    assert!(s.token.try_transfer(&alice, &bob, &1).is_err());
    assert!(s.token.try_transfer(&bob, &alice, &1).is_err());
}

#[test]
fn a_protocol_contract_may_hold_shares_without_being_an_investor() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);
    // Stands in for a sale or exchange contract holding inventory or escrow.
    let escrow = Address::generate(&env);
    s.registry.set_participant(&escrow, &true);

    s.token.mint(&alice, &10);
    s.token.transfer(&alice, &escrow, &4);

    assert_eq!(s.token.balance(&escrow), 4);
    assert!(!s.registry.whitelisted(&escrow));
}

// Authorization
//
// Every test above runs under mock_all_auths, which disables authorization
// entirely. These are the ones that actually exercise it: each signs as
// somebody who is eligible but is not the party the entrypoint requires, so
// the only thing that can reject the call is the require_auth being tested.

#[test]
fn transfer_needs_the_sender_signature_not_the_recipient() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);
    let bob = holder(&s);
    s.token.mint(&alice, &10);

    let result = s
        .token
        .mock_auths(&[MockAuth {
            address: &bob,
            invoke: &MockAuthInvoke {
                contract: &s.token.address,
                fn_name: "transfer",
                args: (alice.clone(), bob.clone(), 3_i128).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .try_transfer(&alice, &bob, &3);

    assert!(result.is_err());
    assert_eq!(s.token.balance(&alice), 10);
    assert_eq!(s.token.balance(&bob), 0);
}

#[test]
fn transfer_from_needs_the_spender_signature_not_the_owner() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let owner = holder(&s);
    let spender = holder(&s);
    let receiver = holder(&s);
    s.token.mint(&owner, &100);
    let expiration = env.ledger().sequence() + 100;
    s.token.approve(&owner, &spender, &40, &expiration);

    // The owner already approved; their signature is not what authorizes the
    // pull, the spender's is.
    let result = s
        .token
        .mock_auths(&[MockAuth {
            address: &owner,
            invoke: &MockAuthInvoke {
                contract: &s.token.address,
                fn_name: "transfer_from",
                args: (spender.clone(), owner.clone(), receiver.clone(), 10_i128).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .try_transfer_from(&spender, &owner, &receiver, &10);

    assert!(result.is_err());
    assert_eq!(s.token.balance(&owner), 100);
}

#[test]
fn approve_needs_the_owner_signature_not_the_spenders() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let owner = holder(&s);
    let spender = holder(&s);
    let expiration = env.ledger().sequence() + 100;

    let result = s
        .token
        .mock_auths(&[MockAuth {
            address: &spender,
            invoke: &MockAuthInvoke {
                contract: &s.token.address,
                fn_name: "approve",
                args: (owner.clone(), spender.clone(), 40_i128, expiration).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .try_approve(&owner, &spender, &40, &expiration);

    assert!(result.is_err());
    assert_eq!(s.token.allowance(&owner, &spender), 0);
}

#[test]
fn burn_needs_the_holder_signature() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);
    let bob = holder(&s);
    s.token.mint(&alice, &10);

    let result = s
        .token
        .mock_auths(&[MockAuth {
            address: &bob,
            invoke: &MockAuthInvoke {
                contract: &s.token.address,
                fn_name: "burn",
                args: (alice.clone(), 4_i128).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .try_burn(&alice, &4);

    assert!(result.is_err());
    assert_eq!(s.token.balance(&alice), 10);
    assert_eq!(s.token.total_supply(), 10);
}

// Supply cap
//
// rewards-distributor divides income by a fixed share count. A token able to
// mint past that number could promise more rent than was ever deposited, so
// the ceiling lives here and has no setter.

#[test]
fn mint_stops_at_the_supply_cap() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);

    assert_eq!(s.token.try_mint(&alice, &(SUPPLY + 1)), Err(code(207)));
    assert_eq!(s.token.total_supply(), 0);
    assert!(!s.token.issued());

    s.token.mint(&alice, &SUPPLY);
    assert_eq!(s.token.total_supply(), SUPPLY);
    assert_eq!(s.token.max_supply(), SUPPLY);
}

/// The rejected mint above must not have consumed the one issuance, or a
/// fat-fingered amount would brick the asset permanently.
#[test]
fn a_rejected_mint_does_not_consume_the_issuance() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);
    let stranger = Address::generate(&env);

    assert_eq!(s.token.try_mint(&alice, &(SUPPLY + 1)), Err(code(207)));
    assert_eq!(s.token.try_mint(&stranger, &SUPPLY), Err(code(205)));
    assert_eq!(s.token.try_mint(&alice, &-1), Err(code(201)));

    s.token.mint(&alice, &SUPPLY);
    assert_eq!(s.token.balance(&alice), SUPPLY);
}

/// And the one amount that would otherwise be accepted and destroy the asset.
/// A zero mint is a harmless no-op on a token that can mint again; here it
/// would spend the single issuance on nothing and leave the asset unable to
/// ever have a share.
#[test]
fn a_zero_mint_cannot_burn_the_one_issuance() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);

    assert_eq!(s.token.try_mint(&alice, &0), Err(code(201)));
    assert!(!s.token.issued());

    s.token.mint(&alice, &SUPPLY);
    assert_eq!(s.token.total_supply(), SUPPLY);
}

/// A tokenized building is issued once. The cap bounds how much; this bounds
/// how many times, which is what makes `total_shares` in rewards-distributor
/// an invariant rather than an operating agreement.
#[test]
fn the_asset_is_issued_exactly_once() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);

    assert!(!s.token.issued());
    s.token.mint(&alice, &SUPPLY);
    assert!(s.token.issued());

    assert_eq!(s.token.try_mint(&alice, &1), Err(code(209)));
    assert_eq!(s.token.total_supply(), SUPPLY);
}

/// Issuing under the cap is allowed, and burning does not reopen the issuance:
/// supply can only ever fall after the mint. Under-issuing is safe because
/// rewards-distributor still divides by the cap, so the unissued fraction of a
/// round stays in the pool rather than being over-promised to holders.
#[test]
fn supply_only_falls_after_the_issuance() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);

    s.token.mint(&alice, &(SUPPLY - 100));
    assert_eq!(s.token.total_supply(), SUPPLY - 100);

    s.token.burn(&alice, &10);
    assert_eq!(s.token.total_supply(), SUPPLY - 110);

    assert_eq!(s.token.try_mint(&alice, &10), Err(code(209)));
    assert_eq!(s.token.total_supply(), SUPPLY - 110);
}

#[test]
#[should_panic(expected = "#208")]
fn constructor_rejects_a_zero_supply_cap() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let registry_id = env.register(ComplianceRegistry, (admin.clone(), admin.clone()));
    env.register(
        ShareToken,
        (
            admin.clone(),
            String::from_str(&env, "S"),
            String::from_str(&env, "S"),
            registry_id,
            admin.clone(),
            0_i128,
        ),
    );
}

/// The gate reports its own error rather than failing somewhere downstream,
/// which is what lets the UI say "this address has not passed KYC".
#[test]
fn the_eligibility_gate_reports_not_allowed() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);
    let stranger = Address::generate(&env);
    s.token.mint(&alice, &10);

    assert_eq!(s.token.try_mint(&stranger, &1), Err(code(205)));
    assert_eq!(s.token.try_transfer(&alice, &stranger, &1), Err(code(205)));
}

// Forced revocation: the issuer's clawback, for a court order, a probate
// transfer or keys that are gone. The tests below pin what bounds it.

#[test]
fn revocation_takes_shares_without_the_holder_signing() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);
    s.token.mint(&alice, &100);

    // Only the admin signs. Alice never authorizes anything, which is the
    // whole point: she may be unwilling, or unreachable.
    s.token
        .mock_auths(&[MockAuth {
            address: &s.admin,
            invoke: &MockAuthInvoke {
                contract: &s.token.address,
                fn_name: "revoke_shares",
                args: (alice.clone(), 40_i128).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .revoke_shares(&alice, &40);

    assert_eq!(s.token.balance(&alice), 60);
    assert_eq!(s.token.balance(&s.treasury), 40);
    // Confiscation moves ownership, it does not destroy shares.
    assert_eq!(s.token.total_supply(), 100);
}

/// The case it exists for. A sanctioned holder is frozen or revoked first, and
/// every ordinary path into and out of their address is shut - so a clawback
/// that respected the gate would be useless exactly when it is needed.
#[test]
fn revocation_reaches_an_address_the_registry_has_already_shut() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);
    s.token.mint(&alice, &100);

    s.registry.revoke(&s.provider, &alice);
    assert_eq!(
        s.token.try_transfer(&alice, &s.treasury, &1),
        Err(code(205))
    );

    s.token.revoke_shares(&alice, &100);
    assert_eq!(s.token.balance(&alice), 0);
    assert_eq!(s.token.balance(&s.treasury), 100);
}

/// Same for a deployment-wide halt: an incident is when a clawback is most
/// likely to be needed, so this path does not consult the registry at all.
#[test]
fn revocation_still_works_while_the_deployment_is_paused() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);
    s.token.mint(&alice, &100);

    s.registry.pause(&s.admin);
    assert_eq!(
        s.token.try_transfer(&alice, &s.treasury, &1),
        Err(code(205))
    );

    s.token.revoke_shares(&alice, &30);
    assert_eq!(s.token.balance(&s.treasury), 30);
}

#[test]
fn revocation_is_admin_only() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);
    let stranger = holder(&s);
    s.token.mint(&alice, &100);

    let result = s
        .token
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &s.token.address,
                fn_name: "revoke_shares",
                args: (alice.clone(), 100_i128).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .try_revoke_shares(&alice, &100);

    assert!(result.is_err());
    assert_eq!(s.token.balance(&alice), 100);
}

#[test]
fn revocation_cannot_take_more_than_the_holder_has() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);
    s.token.mint(&alice, &10);

    assert_eq!(s.token.try_revoke_shares(&alice, &11), Err(code(202)));
    assert_eq!(s.token.try_revoke_shares(&alice, &-1), Err(code(201)));
    // Zero too: a confiscation of nothing would still publish the event that
    // says one happened.
    assert_eq!(s.token.try_revoke_shares(&alice, &0), Err(code(201)));
    assert_eq!(s.token.balance(&alice), 10);
}

/// A confiscation must never read as an ordinary trade in the log. Both events
/// go out: `Transfer` so a SEP-41 indexer stays correct, `SharesRevoked` so an
/// auditor can tell the two apart.
#[test]
fn revocation_is_labelled_as_such_in_the_event_log() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let alice = holder(&s);
    s.token.mint(&alice, &100);

    s.token.revoke_shares(&alice, &25);

    assert_eq!(
        env.events().all().filter_by_contract(&s.token.address),
        vec![
            &env,
            (
                s.token.address.clone(),
                (Symbol::new(&env, "shares_revoked"), alice.clone()).into_val(&env),
                25_i128.into_val(&env),
            ),
            (
                s.token.address.clone(),
                (
                    Symbol::new(&env, "transfer"),
                    alice.clone(),
                    s.treasury.clone()
                )
                    .into_val(&env),
                25_i128.into_val(&env),
            ),
        ]
    );
}

/// Issuing and confiscating are the two decisions that must cost two
/// signatures, so this token gives the hot key nothing at all.
#[test]
fn the_operator_role_reaches_nothing_in_this_contract() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let operator = Address::generate(&env);
    s.token.set_operator(&operator);
    let target = holder(&s);

    let denied = s
        .token
        .mock_auths(&[MockAuth {
            address: &operator,
            invoke: &MockAuthInvoke {
                contract: &s.token.address,
                fn_name: "mint",
                args: (target.clone(), 1_i128).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_mint(&target, &1);
    assert!(denied.is_err());

    let denied = s
        .token
        .mock_auths(&[MockAuth {
            address: &operator,
            invoke: &MockAuthInvoke {
                contract: &s.token.address,
                fn_name: "revoke_shares",
                args: (target.clone(), 1_i128).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_revoke_shares(&target, &1);
    assert!(denied.is_err());

    assert_eq!(s.token.total_supply(), 0);
    assert!(!s.token.issued());
}

/// The pointer to the legal wrapper. A token with no terms behind it says so.
#[test]
fn terms_start_unset_and_are_published_by_the_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    assert_eq!(s.token.terms(), None);

    let terms = Terms {
        issuer: String::from_str(&env, "Sabai Lagoon Residence No. 1 Ltd"),
        jurisdiction: String::from_str(&env, "Thailand"),
        uri: String::from_str(&env, "ipfs://bafyDEMO"),
        doc_hash: BytesN::from_array(&env, &[9u8; 32]),
        is_real_asset: false,
    };
    s.token.set_terms(&terms);

    let stored = s.token.terms().unwrap();
    assert_eq!(stored, terms);
    // The demo asset says out loud that it is one, in a field a wallet reads
    // rather than a disclaimer a wallet cannot.
    assert!(!stored.is_real_asset);
}

/// A link with nothing behind it is worse than no link, so the empty cases are
/// rejected rather than stored.
#[test]
fn terms_without_a_document_are_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let s = setup_full(&env);
    let full = Terms {
        issuer: String::from_str(&env, "Sabai Lagoon Residence No. 1 Ltd"),
        jurisdiction: String::from_str(&env, "Thailand"),
        uri: String::from_str(&env, "ipfs://bafyDEMO"),
        doc_hash: BytesN::from_array(&env, &[9u8; 32]),
        is_real_asset: false,
    };

    let empty = String::from_str(&env, "");
    for broken in [
        Terms {
            uri: empty.clone(),
            ..full.clone()
        },
        Terms {
            jurisdiction: empty.clone(),
            ..full.clone()
        },
        Terms {
            issuer: empty.clone(),
            ..full.clone()
        },
        // The hash a caller with nothing to hash ends up passing. It is 32
        // bytes like any other, so only an explicit check catches it.
        Terms {
            doc_hash: BytesN::from_array(&env, &[0u8; 32]),
            ..full.clone()
        },
    ] {
        assert_eq!(s.token.try_set_terms(&broken), Err(code(210)));
    }
    assert_eq!(s.token.terms(), None);

    s.token.set_terms(&full);
    assert!(s.token.terms().is_some());
}
