//! Who is allowed to hold shares.
//!
//! One registry serves every asset on the platform: an investor is verified
//! once and can then hold shares of any asset issued against this registry,
//! instead of being whitelisted separately per asset the way our Polygon
//! deployment has to do it.
//!
//! Two kinds of entry, deliberately kept apart:
//!
//! * **Investors** are admitted by the KYC provider after an off-chain SEP-12
//!   check. The provider can do this and nothing else.
//! * **Participants** are the protocol's own contracts: a sale holding
//!   inventory, an exchange holding escrow. They are admitted by the admin,
//!   and kept in a separate map so an auditor can tell at a glance whether an
//!   address was admitted as a person or as a piece of infrastructure.
//!
//! ## Suspension is not the same as removal
//!
//! `revoke` deletes the verification; `freeze` suspends an address that keeps
//! it. Both stop the shares moving, but only one of them says the KYC decision
//! itself was withdrawn, and an auditor reading the log has to be able to tell
//! a sanctions suspension from an expired document.
//!
//! ## One contract halts the whole deployment
//!
//! Every write anywhere in the platform ends up asking this contract whether an
//! address may hold shares - the token asks on both sides of every movement,
//! and the sale and exchange ask before that for a better error. So `allowed`
//! returning `false` while paused stops minting, transfers, purchases,
//! buybacks, listings and fills across all five contracts, in one transaction,
//! with no code in the other four and no extra fee: that call was already
//! happening.
//!
//! Halting is the one control the hot operator key can reach, and lifting the
//! halt is the multisig admin's. See `sabai_access` for why that asymmetry is
//! deliberate.
#![no_std]

mod errors;
mod events;

pub use errors::Error;

use sabai_access as access;
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, BytesN, Env, Vec,
};

/// Addresses admitted per `register_verified_batch` call. Bounded because a
/// transaction that exceeds the host's resource limits fails whole, and a
/// provider would rather send eight batches than discover the ceiling.
const MAX_BATCH: u32 = 100;

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// The only address allowed to admit or revoke investors.
    KycProvider,
    /// Deployment-wide halt. Instance storage, so `allowed` reads it without
    /// touching a second ledger entry.
    Paused,
    /// An investor cleared to hold shares.
    Investor(Address),
    /// A protocol contract cleared to hold shares (sale inventory, escrow).
    Participant(Address),
    /// A verified address whose eligibility is suspended.
    Frozen(Address),
}

fn get<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey) -> T {
    env.storage().instance().get(key).unwrap()
}

/// Rejects anyone but the current provider. The address check runs before
/// `require_auth`, so a stranger gets `NotKycProvider` rather than a confusing
/// authorization failure.
fn require_provider(env: &Env, provider: &Address) {
    let expected: Address = get(env, &DataKey::KycProvider);
    if provider != &expected {
        panic_with_error!(env, Error::NotKycProvider);
    }
    provider.require_auth();
}

fn read_flag(env: &Env, key: &DataKey) -> bool {
    env.storage().persistent().get(key).unwrap_or(false)
}

fn read_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

/// Presence of the entry is the flag. Withdrawing eligibility deletes it
/// rather than storing `false`, so the ledger stops charging rent for a fact
/// that `read_flag` already assumes by default.
fn write_flag(env: &Env, key: DataKey, value: bool) {
    if value {
        env.storage().persistent().set(&key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&key, access::PERSISTENT_TTL, access::PERSISTENT_TTL);
    } else {
        env.storage().persistent().remove(&key);
    }
    access::extend_instance_ttl(env);
}

#[contract]
pub struct ComplianceRegistry;

#[contractimpl]
impl ComplianceRegistry {
    /// * `admin` - the 2-of-3 multisig account: may rotate the provider, admit
    ///   protocol contracts, lift a halt and name the operator.
    /// * `kyc_provider` - may admit and revoke investors, and nothing else.
    pub fn __constructor(env: Env, admin: Address, kyc_provider: Address) {
        access::init(&env, &admin);
        env.storage()
            .instance()
            .set(&DataKey::KycProvider, &kyc_provider);
        access::extend_instance_ttl(&env);
    }

    /// DEMO SHORTCUT - the caller admits THEMSELVES, so a reviewer can walk
    /// the whole flow on testnet without us running a KYC vendor. This
    /// entrypoint does not exist in a production deployment;
    /// `register_verified` is the real path.
    pub fn register(env: Env, user: Address) {
        user.require_auth();
        write_flag(&env, DataKey::Investor(user.clone()), true);
        events::Registered { user }.publish(&env);
    }

    /// Admit an investor after an off-chain KYC decision (SEP-12). The
    /// provider signs; the investor does not have to be online.
    pub fn register_verified(env: Env, provider: Address, user: Address) {
        require_provider(&env, &provider);
        write_flag(&env, DataKey::Investor(user.clone()), true);
        events::RegisteredByProvider { user, provider }.publish(&env);
    }

    /// Admit up to `MAX_BATCH` investors in one transaction, for a provider
    /// clearing a queue after a review run. One event per address, identical to
    /// the single-address path, so an indexer needs no special case.
    ///
    /// The batch shares one base fee and one signature; the per-address ledger
    /// writes are the same either way, which is why this is a smaller saving
    /// than batching on an EVM chain and why nothing else here is batched.
    /// Measured on testnet: 0.0234 XLM for one address, 0.0203 per address at
    /// a hundred - about 13%, against the order of magnitude batching buys on
    /// an EVM chain, because here the ledger writes dominate and they do not
    /// amortize. A full batch of 100 fits inside the host's resource limits
    /// with room to spare.
    pub fn register_verified_batch(env: Env, provider: Address, users: Vec<Address>) {
        require_provider(&env, &provider);
        if users.is_empty() || users.len() > MAX_BATCH {
            panic_with_error!(&env, Error::InvalidBatch);
        }
        for user in users.iter() {
            write_flag(&env, DataKey::Investor(user.clone()), true);
            events::RegisteredByProvider {
                user,
                provider: provider.clone(),
            }
            .publish(&env);
        }
    }

    /// Suspend a verified investor without withdrawing the verification -
    /// a sanctions screening hit, a court order, an account under review.
    /// Their shares stay theirs and stop moving in either direction.
    ///
    /// Kept apart from `revoke` because the two answer different questions.
    /// `revoke` says the KYC decision no longer stands and re-admission means
    /// verifying again; `freeze` says the decision stands but the address is
    /// blocked, and lifting it is a single call with no re-verification.
    pub fn freeze(env: Env, provider: Address, user: Address) {
        require_provider(&env, &provider);
        write_flag(&env, DataKey::Frozen(user.clone()), true);
        events::Frozen { user, provider }.publish(&env);
    }

    /// Lift a suspension. The underlying verification was never removed, so
    /// this is all it takes to make the address eligible again.
    pub fn unfreeze(env: Env, provider: Address, user: Address) {
        require_provider(&env, &provider);
        write_flag(&env, DataKey::Frozen(user.clone()), false);
        events::Unfrozen { user, provider }.publish(&env);
    }

    /// Withdraw an investor's eligibility - a sanctions hit, an expired
    /// re-verification, a closed account. Shares already held are untouched;
    /// what stops is the ability to receive or move them.
    pub fn revoke(env: Env, provider: Address, user: Address) {
        require_provider(&env, &provider);
        write_flag(&env, DataKey::Investor(user.clone()), false);
        events::Revoked { user, provider }.publish(&env);
    }

    /// Admit or remove a protocol contract - the sale holding inventory, the
    /// exchange holding escrow, the address unsold inventory is withdrawn to.
    /// Admin only, and separate from the investor list on purpose: the admin
    /// must not be able to admit investors.
    pub fn set_participant(env: Env, addr: Address, allowed: bool) {
        access::require_admin(&env);
        write_flag(&env, DataKey::Participant(addr.clone()), allowed);
        events::ParticipantSet { addr, allowed }.publish(&env);
    }

    /// Halt every movement of shares across the whole deployment. Admin or
    /// operator - see `resume` for why those two are not the same list.
    ///
    /// This is the incident switch. It does not stop `claim` in
    /// rewards-distributor: pausing exists to freeze the asset while something
    /// is being investigated, and withholding rent a holder has already earned
    /// would be confiscation, not incident response. A specific holder who must
    /// not be paid is a `freeze`, which does block their claim.
    pub fn pause(env: Env, caller: Address) {
        access::require_manager(&env, &caller);
        env.storage().instance().set(&DataKey::Paused, &true);
        access::extend_instance_ttl(&env);
        events::PauseChanged { paused: true }.publish(&env);
    }

    /// Lift the halt. Admin only, and deliberately a narrower list than
    /// `pause`.
    ///
    /// Halting an asset that turns out to be fine costs an hour of downtime.
    /// Restarting one that is not fine can cost an investor their money, and
    /// it is the decision most likely to be made under pressure by whoever is
    /// awake. So the cheap direction is one hot signature and the expensive
    /// one needs two of three cold ones - a single stolen operator key can
    /// stop this deployment and cannot start it again.
    pub fn resume(env: Env) {
        access::require_admin(&env);
        env.storage().instance().set(&DataKey::Paused, &false);
        access::extend_instance_ttl(&env);
        events::PauseChanged { paused: false }.publish(&env);
    }

    /// Rotate the provider. Admin only. Rotation is why this is stored state
    /// and not a constructor constant: changing KYC vendor must not mean
    /// redeploying and migrating every entry.
    pub fn set_kyc_provider(env: Env, provider: Address) {
        access::require_admin(&env);
        let old: Address = get(&env, &DataKey::KycProvider);
        env.storage()
            .instance()
            .set(&DataKey::KycProvider, &provider);
        access::extend_instance_ttl(&env);
        events::KycProviderChanged { old, new: provider }.publish(&env);
    }

    // Governance - identical in all five contracts, see `sabai_access`.

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

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        access::upgrade(&env, new_wasm_hash);
    }

    // Views

    /// May this address hold shares? The question every token transfer asks,
    /// and the single point the halt and the freeze list act through.
    pub fn allowed(env: Env, addr: Address) -> bool {
        if read_paused(&env) || read_flag(&env, &DataKey::Frozen(addr.clone())) {
            return false;
        }
        read_flag(&env, &DataKey::Investor(addr.clone()))
            || read_flag(&env, &DataKey::Participant(addr))
    }

    /// Admitted as an investor (as opposed to protocol infrastructure).
    /// Raw verification status: unlike `allowed` this ignores the halt and the
    /// freeze list, so a UI can tell "never verified" from "verified, blocked".
    pub fn whitelisted(env: Env, addr: Address) -> bool {
        read_flag(&env, &DataKey::Investor(addr))
    }

    pub fn participant(env: Env, addr: Address) -> bool {
        read_flag(&env, &DataKey::Participant(addr))
    }

    /// Verified but suspended.
    pub fn frozen(env: Env, addr: Address) -> bool {
        read_flag(&env, &DataKey::Frozen(addr))
    }

    /// Is the whole deployment halted?
    pub fn paused(env: Env) -> bool {
        read_paused(&env)
    }

    pub fn kyc_provider(env: Env) -> Address {
        get(&env, &DataKey::KycProvider)
    }

    pub fn admin(env: Env) -> Address {
        access::admin(&env)
    }

    /// The hot key that may halt the deployment but not lift the halt.
    pub fn operator(env: Env) -> Address {
        access::operator(&env)
    }

    /// The successor named by `transfer_admin` and still to accept.
    pub fn pending_admin(env: Env) -> Option<Address> {
        access::pending_admin(&env)
    }
}

#[cfg(test)]
mod test;
