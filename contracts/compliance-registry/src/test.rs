#![cfg(test)]

use crate::{ComplianceRegistry, ComplianceRegistryClient};
use share_token::{ShareToken, ShareTokenClient};
use soroban_sdk::testutils::{Address as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{
    vec, Address, BytesN, Env, Error as HostError, IntoVal, InvokeError, String, Vec,
};

/// The exact contract error a failed invocation carried, so a test cannot pass
/// on some other failure that merely also returns Err.
fn code(n: u32) -> Result<HostError, InvokeError> {
    Ok(HostError::from_contract_error(n))
}

struct Setup<'a> {
    env: &'a Env,
    registry: ComplianceRegistryClient<'a>,
    admin: Address,
    provider: Address,
}

fn setup(env: &Env) -> Setup<'_> {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let provider = Address::generate(env);
    let id = env.register(ComplianceRegistry, (admin.clone(), provider.clone()));
    Setup {
        env,
        registry: ComplianceRegistryClient::new(env, &id),
        admin,
        provider,
    }
}

#[test]
fn constructor_sets_roles() {
    let env = Env::default();
    let s = setup(&env);

    assert_eq!(s.registry.admin(), s.admin);
    assert_eq!(s.registry.kyc_provider(), s.provider);
}

#[test]
fn provider_admits_and_revokes_an_investor() {
    let env = Env::default();
    let s = setup(&env);
    let investor = Address::generate(&env);

    assert!(!s.registry.allowed(&investor));

    s.registry.register_verified(&s.provider, &investor);
    assert!(s.registry.allowed(&investor));
    assert!(s.registry.whitelisted(&investor));

    s.registry.revoke(&s.provider, &investor);
    assert!(!s.registry.allowed(&investor));
}

#[test]
fn only_the_provider_may_admit_or_revoke() {
    let env = Env::default();
    let s = setup(&env);
    let impostor = Address::generate(&env);
    let investor = Address::generate(&env);

    // Auth is mocked for everyone - the address check is what rejects these,
    // so the guard belongs to the contract and not to the wallet. The exact
    // code matters: NotKycProvider, not some incidental failure.
    assert_eq!(
        s.registry.try_register_verified(&impostor, &investor),
        Err(code(101))
    );
    assert_eq!(
        s.registry.try_register_verified(&s.admin, &investor),
        Err(code(101))
    );
    assert!(!s.registry.allowed(&investor));

    s.registry.register_verified(&s.provider, &investor);
    assert_eq!(s.registry.try_revoke(&s.admin, &investor), Err(code(101)));
    assert!(s.registry.allowed(&investor));
}

/// Naming the right provider is not enough on its own: they still have to
/// sign. Signing as a stranger leaves the address check satisfied and the
/// `require_auth` as the only thing that can reject the call.
#[test]
fn the_provider_still_has_to_sign() {
    let env = Env::default();
    let s = setup(&env);
    let investor = Address::generate(&env);
    let stranger = Address::generate(&env);

    let result = s
        .registry
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &s.registry.address,
                fn_name: "register_verified",
                args: (s.provider.clone(), investor.clone()).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .try_register_verified(&s.provider, &investor);

    assert!(result.is_err());
    assert!(!s.registry.allowed(&investor));
}

/// The demo shortcut admits the caller and only the caller.
#[test]
fn register_admits_the_signer_and_needs_their_signature() {
    let env = Env::default();
    let s = setup(&env);
    let user = Address::generate(&env);
    let stranger = Address::generate(&env);

    let forged = s
        .registry
        .mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &s.registry.address,
                fn_name: "register",
                args: (user.clone(),).into_val(s.env),
                sub_invokes: &[],
            },
        }])
        .try_register(&user);
    assert!(forged.is_err());
    assert!(!s.registry.allowed(&user));

    s.registry.register(&user);
    assert!(s.registry.allowed(&user));
    assert!(s.registry.whitelisted(&user));
}

/// Withdrawing eligibility deletes the entry rather than storing `false`, so
/// the ledger stops charging rent for a fact the default already covers.
/// `allowed()` cannot tell the two apart, so this looks at the storage itself.
#[test]
fn revoking_removes_the_entry_rather_than_storing_false() {
    let env = Env::default();
    let s = setup(&env);
    let investor = Address::generate(&env);
    let key = crate::DataKey::Investor(investor.clone());

    s.registry.register_verified(&s.provider, &investor);
    env.as_contract(&s.registry.address, || {
        assert!(env.storage().persistent().has(&key));
    });

    s.registry.revoke(&s.provider, &investor);
    env.as_contract(&s.registry.address, || {
        assert!(
            !env.storage().persistent().has(&key),
            "revoked entry is still on the ledger and still paying rent"
        );
    });
    assert!(!s.registry.allowed(&investor));
}

#[test]
fn participants_are_tracked_separately_from_investors() {
    let env = Env::default();
    let s = setup(&env);
    let sale_contract = Address::generate(&env);

    s.registry.set_participant(&sale_contract, &true);

    assert!(s.registry.allowed(&sale_contract));
    assert!(s.registry.participant(&sale_contract));
    // Infrastructure is never counted as a verified investor.
    assert!(!s.registry.whitelisted(&sale_contract));

    s.registry.set_participant(&sale_contract, &false);
    assert!(!s.registry.allowed(&sale_contract));
}

#[test]
fn admin_rotates_the_provider_and_the_old_one_loses_the_power() {
    let env = Env::default();
    let s = setup(&env);
    let next = Address::generate(&env);
    let investor = Address::generate(&env);

    s.registry.set_kyc_provider(&next);
    assert_eq!(s.registry.kyc_provider(), next);

    assert!(s
        .registry
        .try_register_verified(&s.provider, &investor)
        .is_err());
    s.registry.register_verified(&next, &investor);
    assert!(s.registry.allowed(&investor));
}

#[test]
fn provider_cannot_touch_admin_powers() {
    let env = Env::default();
    let s = setup(&env);
    let id = s.registry.address.clone();
    let target = Address::generate(&env);

    // Sign as the provider only: the admin entrypoints must still refuse,
    // because each requires the ADMIN's signature.
    s.env.mock_auths(&[MockAuth {
        address: &s.provider,
        invoke: &MockAuthInvoke {
            contract: &id,
            fn_name: "set_participant",
            args: (target.clone(), true).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(s.registry.try_set_participant(&target, &true).is_err());

    s.env.mock_auths(&[MockAuth {
        address: &s.provider,
        invoke: &MockAuthInvoke {
            contract: &id,
            fn_name: "set_kyc_provider",
            args: (target.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(s.registry.try_set_kyc_provider(&target).is_err());

    s.env.mock_auths(&[MockAuth {
        address: &s.provider,
        invoke: &MockAuthInvoke {
            contract: &id,
            fn_name: "pause",
            args: (s.provider.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    assert!(s.registry.try_pause(&s.provider).is_err());

    assert!(!s.registry.allowed(&target));
    assert!(!s.registry.paused());
    assert_eq!(s.registry.kyc_provider(), s.provider);
}

/// And the mirror: the admin holds the halt, not the investor list. Freezing
/// is a compliance decision, so it sits with the provider like every other
/// entry in that list.
#[test]
fn admin_cannot_touch_the_investor_list() {
    let env = Env::default();
    let s = setup(&env);
    let investor = Address::generate(&env);
    s.registry.register_verified(&s.provider, &investor);

    assert_eq!(s.registry.try_freeze(&s.admin, &investor), Err(code(101)));
    assert_eq!(s.registry.try_unfreeze(&s.admin, &investor), Err(code(101)));
    assert_eq!(
        s.registry.try_register_verified_batch(
            &s.admin,
            &vec![&env, Address::generate(&env), Address::generate(&env)]
        ),
        Err(code(101))
    );
    assert!(s.registry.allowed(&investor));
}

// The deployment-wide halt.

#[test]
fn pausing_stops_investors_and_infrastructure_alike() {
    let env = Env::default();
    let s = setup(&env);
    let investor = Address::generate(&env);
    let sale_contract = Address::generate(&env);
    s.registry.register_verified(&s.provider, &investor);
    s.registry.set_participant(&sale_contract, &true);

    s.registry.pause(&s.admin);
    assert!(s.registry.paused());
    assert!(!s.registry.allowed(&investor));
    assert!(!s.registry.allowed(&sale_contract));

    // A halt is not a revocation: the entries are untouched underneath, so
    // resuming needs no re-registration of anyone.
    assert!(s.registry.whitelisted(&investor));
    assert!(s.registry.participant(&sale_contract));

    s.registry.resume();
    assert!(s.registry.allowed(&investor));
    assert!(s.registry.allowed(&sale_contract));
}

/// The claim worth proving is not that the flag flips, but that one
/// transaction against this contract stops share movement in a contract that
/// has no pause code of its own.
#[test]
fn one_pause_halts_a_token_that_knows_nothing_about_it() {
    let env = Env::default();
    let s = setup(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    s.registry.register_verified(&s.provider, &alice);
    s.registry.register_verified(&s.provider, &bob);

    let token = ShareTokenClient::new(
        &env,
        &env.register(
            ShareToken,
            (
                s.admin.clone(),
                String::from_str(&env, "Sabai Lagoon Residence No. 1"),
                String::from_str(&env, "SLR1"),
                s.registry.address.clone(),
                s.admin.clone(),
                1000_i128,
            ),
        ),
    );
    token.mint(&alice, &100);

    s.registry.pause(&s.admin);
    assert_eq!(token.try_transfer(&alice, &bob, &1), Err(code(205)));

    s.registry.resume();
    token.transfer(&alice, &bob, &1);
    assert_eq!(token.balance(&bob), 1);
}

// Suspension: a verified investor who is blocked, as distinct from one whose
// verification was withdrawn.

#[test]
fn freezing_blocks_without_withdrawing_the_verification() {
    let env = Env::default();
    let s = setup(&env);
    let investor = Address::generate(&env);
    let key = crate::DataKey::Investor(investor.clone());
    s.registry.register_verified(&s.provider, &investor);

    s.registry.freeze(&s.provider, &investor);
    assert!(!s.registry.allowed(&investor));
    assert!(s.registry.frozen(&investor));
    // The KYC decision itself still stands - which is exactly the difference
    // from `revoke`, and the reason a UI can say "suspended" rather than
    // sending the investor back through verification.
    assert!(s.registry.whitelisted(&investor));
    env.as_contract(&s.registry.address, || {
        assert!(env.storage().persistent().has(&key));
    });

    s.registry.unfreeze(&s.provider, &investor);
    assert!(s.registry.allowed(&investor));
    assert!(!s.registry.frozen(&investor));
}

/// Freezing an address that was never verified admits nobody, and lifting it
/// afterwards must not either.
#[test]
fn unfreezing_is_not_a_back_door_into_the_investor_list() {
    let env = Env::default();
    let s = setup(&env);
    let stranger = Address::generate(&env);

    s.registry.freeze(&s.provider, &stranger);
    s.registry.unfreeze(&s.provider, &stranger);

    assert!(!s.registry.allowed(&stranger));
    assert!(!s.registry.whitelisted(&stranger));
}

// Batch admission, for a provider clearing a review queue.

#[test]
fn a_batch_admits_every_address_in_it() {
    let env = Env::default();
    let s = setup(&env);
    let investors: Vec<Address> = vec![
        &env,
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];

    s.registry.register_verified_batch(&s.provider, &investors);

    for investor in investors.iter() {
        assert!(s.registry.allowed(&investor));
        assert!(s.registry.whitelisted(&investor));
    }
}

#[test]
fn a_batch_is_bounded_at_both_ends() {
    let env = Env::default();
    let s = setup(&env);

    assert_eq!(
        s.registry
            .try_register_verified_batch(&s.provider, &Vec::new(&env)),
        Err(code(103))
    );

    let mut oversized = Vec::new(&env);
    for _ in 0..101 {
        oversized.push_back(Address::generate(&env));
    }
    let first = oversized.get_unchecked(0);
    assert_eq!(
        s.registry
            .try_register_verified_batch(&s.provider, &oversized),
        Err(code(103))
    );
    // Rejected whole: nothing was admitted before the length check.
    assert!(!s.registry.allowed(&first));
}

/// The reason this contract exists: on Polygon the same investor is
/// whitelisted once per asset. Here one entry answers for all of them, so the
/// test deploys two real tokens against the same registry and moves shares of
/// both on the strength of a single registration.
#[test]
fn one_registration_serves_every_asset() {
    let env = Env::default();
    let s = setup(&env);
    let investor = Address::generate(&env);
    let other = Address::generate(&env);

    let first = ShareTokenClient::new(
        &env,
        &env.register(
            ShareToken,
            (
                s.admin.clone(),
                String::from_str(&env, "Sabai Lagoon Residence No. 1"),
                String::from_str(&env, "SLR1"),
                s.registry.address.clone(),
                s.admin.clone(),
                1000_i128,
            ),
        ),
    );
    let second = ShareTokenClient::new(
        &env,
        &env.register(
            ShareToken,
            (
                s.admin.clone(),
                String::from_str(&env, "Sabai Lagoon Residence No. 2"),
                String::from_str(&env, "SLR2"),
                s.registry.address.clone(),
                s.admin.clone(),
                1000_i128,
            ),
        ),
    );

    // Before the single registration, neither asset will deliver.
    assert_eq!(first.try_mint(&investor, &1), Err(code(205)));
    assert_eq!(second.try_mint(&investor, &1), Err(code(205)));

    s.registry.register_verified(&s.provider, &investor);

    // One decision, both assets, no second transaction anywhere.
    first.mint(&investor, &10);
    second.mint(&investor, &10);
    assert_eq!(first.balance(&investor), 10);
    assert_eq!(second.balance(&investor), 10);

    // And revoking it once stops both.
    s.registry.revoke(&s.provider, &investor);
    assert_eq!(first.try_transfer(&investor, &other, &1), Err(code(205)));
    assert_eq!(second.try_transfer(&investor, &other, &1), Err(code(205)));
}

// ---------------------------------------------------------------------------
// Governance
//
// The admin, operator, handover and upgrade rules live in one crate
// (`sabai_access`) and are identical in all five contracts, so they are pinned
// down once here rather than five times. What each contract's own tests cover
// is the part that differs: which entrypoint each role can actually reach.
// ---------------------------------------------------------------------------

/// The whole point of the split. A key held hot enough to be used from a
/// browser can stop the asset, and cannot start it again.
#[test]
fn the_operator_can_halt_the_deployment_but_not_lift_the_halt() {
    let env = Env::default();
    let s = setup(&env);
    let operator = Address::generate(&env);
    s.registry.set_operator(&operator);
    assert_eq!(s.registry.operator(), operator);

    s.registry.pause(&operator);
    assert!(s.registry.paused());

    // Auth is mocked for the operator specifically, so what rejects this is
    // `resume` reading the admin address - not a missing signature.
    let denied = s
        .registry
        .mock_auths(&[MockAuth {
            address: &operator,
            invoke: &MockAuthInvoke {
                contract: &s.registry.address,
                fn_name: "resume",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_resume();
    assert!(denied.is_err());
    assert!(s.registry.paused());

    s.registry.resume();
    assert!(!s.registry.paused());
}

/// An address holding neither role gets the shared governance code rather than
/// an authorization failure, so the reason is legible in the UI.
#[test]
fn a_stranger_holds_neither_role() {
    let env = Env::default();
    let s = setup(&env);
    let stranger = Address::generate(&env);

    assert_eq!(s.registry.try_pause(&stranger), Err(code(901)));
    assert!(!s.registry.paused());
}

/// The operator role is rotatable, and rotating it takes the old key's power
/// away in the same transaction.
#[test]
fn rotating_the_operator_retires_the_previous_key() {
    let env = Env::default();
    let s = setup(&env);
    let first = Address::generate(&env);
    let second = Address::generate(&env);

    s.registry.set_operator(&first);
    s.registry.set_operator(&second);

    assert_eq!(s.registry.try_pause(&first), Err(code(901)));
    s.registry.pause(&second);
    assert!(s.registry.paused());
}

/// Two steps, because the address being typed is a 56-character multisig
/// account and a one-step setter would hand the asset to whatever was typed.
#[test]
fn the_admin_role_moves_only_to_an_address_that_signs_for_it() {
    let env = Env::default();
    let s = setup(&env);
    let successor = Address::generate(&env);

    assert_eq!(s.registry.try_accept_admin(), Err(code(902)));

    s.registry.transfer_admin(&successor);
    assert_eq!(s.registry.pending_admin(), Some(successor.clone()));
    // Named, not in force.
    assert_eq!(s.registry.admin(), s.admin);

    // Not even the outgoing admin can accept on the successor's behalf.
    let wrong = s
        .registry
        .mock_auths(&[MockAuth {
            address: &s.admin,
            invoke: &MockAuthInvoke {
                contract: &s.registry.address,
                fn_name: "accept_admin",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_accept_admin();
    assert!(wrong.is_err());
    assert_eq!(s.registry.admin(), s.admin);

    s.registry.accept_admin();
    assert_eq!(s.registry.admin(), successor);
    assert_eq!(s.registry.pending_admin(), None);
}

/// A handover named in error is withdrawn, not lived with.
#[test]
fn a_handover_can_be_called_off_before_it_is_accepted() {
    let env = Env::default();
    let s = setup(&env);
    let mistake = Address::generate(&env);

    s.registry.transfer_admin(&mistake);
    s.registry.cancel_transfer_admin();

    assert_eq!(s.registry.pending_admin(), None);
    assert_eq!(s.registry.try_accept_admin(), Err(code(902)));
    assert_eq!(s.registry.admin(), s.admin);
}

/// The operator role does not follow the admin role. A handover is a change of
/// who is in charge, not a change of who runs the asset day to day, and moving
/// both at once would quietly re-point a hot key nobody asked about.
#[test]
fn a_handover_leaves_the_operator_where_it_was() {
    let env = Env::default();
    let s = setup(&env);
    let operator = Address::generate(&env);
    let successor = Address::generate(&env);

    s.registry.set_operator(&operator);
    s.registry.transfer_admin(&successor);
    s.registry.accept_admin();

    assert_eq!(s.registry.admin(), successor);
    assert_eq!(s.registry.operator(), operator);
    s.registry.pause(&operator);
    assert!(s.registry.paused());
}

/// Replacing the code is an admin decision, so on the live deployment it costs
/// two of three signatures. That the swap itself works is proven on-chain by
/// `npm run governance-drill`, which upgrades a contract and reads its state
/// back afterwards; what a unit test can pin down is who may ask for it.
#[test]
fn only_the_admin_may_replace_the_code() {
    let env = Env::default();
    let s = setup(&env);
    let operator = Address::generate(&env);
    s.registry.set_operator(&operator);

    let hash = BytesN::from_array(&env, &[7u8; 32]);
    let denied = s
        .registry
        .mock_auths(&[MockAuth {
            address: &operator,
            invoke: &MockAuthInvoke {
                contract: &s.registry.address,
                fn_name: "upgrade",
                args: (hash.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .try_upgrade(&hash);
    assert!(denied.is_err());
}
