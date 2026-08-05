//! Who is in charge, and what each role may do.
//!
//! Every contract in the deployment stores the same three things and enforces
//! them the same way, so this lives in one place rather than five. Anything a
//! reviewer has to check about authorization, they check here once.
//!
//! ## Two roles, and the line between them
//!
//! * **Admin** — a 2-of-3 multisig Stellar account. Everything that can move
//!   value, change who holds a role, or replace the code answers to it.
//! * **Operator** — one ordinary key, held hot so a person with a browser
//!   wallet can run the asset day to day. It can flip switches. It cannot move
//!   a single share or a single stroop that is not already moving in its
//!   favour, and it cannot promote itself.
//!
//! The split exists because the two jobs have opposite requirements. Issuing
//! shares must be slow and deliberate; halting a live asset during an incident
//! must be immediate. A deployment with one key has to pick which of those to
//! get wrong.
//!
//! That asymmetry is deliberate elsewhere too: the operator can halt the
//! deployment, and only the admin can lift the halt. Stopping is the cheap
//! direction to be wrong in.
//!
//! ## Handing the role over
//!
//! `transfer_admin` names a successor and `accept_admin` is signed by that
//! successor. A one-step setter would hand the asset to whatever address was
//! typed, and the address being typed here is a 56-character multisig account
//! nobody reads twice. The two-step version cannot land anywhere that did not
//! sign for it.
//!
//! ## Replacing the code
//!
//! `upgrade` swaps the contract's wasm for one already installed on the
//! network, behind the same 2-of-3. See `docs/GOVERNANCE.md` for what a
//! production deployment adds on top of that and why it is not here.
#![no_std]

use soroban_sdk::{
    contracterror, contractevent, panic_with_error, symbol_short, Address, BytesN, Env, Symbol,
};

/// ~24h worth of ledgers at a 5s close time.
pub const DAY_IN_LEDGERS: u32 = 17_280;
/// Every contract extends its instance entry by the same amount on every
/// write, so a deployment in active use never approaches archival.
pub const INSTANCE_TTL: u32 = 30 * DAY_IN_LEDGERS;
/// Balances, orders and registry entries: longer-lived than the instance,
/// because they have to survive a quiet asset.
pub const PERSISTENT_TTL: u32 = 90 * DAY_IN_LEDGERS;

const ADMIN: Symbol = symbol_short!("admin");
const PENDING: Symbol = symbol_short!("pending");
const OPERATOR: Symbol = symbol_short!("operator");

/// Named apart from each contract's own `Error` so the two never collide in
/// the contract spec the bindings are generated from.
///
/// 9xx is reserved for governance in every contract of this deployment
/// (registry 1xx, share-token 2xx, sale 3xx, exchange 4xx, rewards 5xx), so a
/// code arriving from a cross-contract call still says what happened without
/// the caller having to know which contract produced it.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AccessError {
    /// The caller holds neither the admin nor the operator role.
    NotAuthorized = 901,
    /// `accept_admin` was called with no handover in progress.
    NoHandoverPending = 902,
}

/// A successor was named. Not yet in force: only `AdminTransferred` is.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminTransferStarted {
    #[topic]
    pub from: Address,
    pub to: Address,
}

#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminTransferred {
    #[topic]
    pub from: Address,
    pub to: Address,
}

/// The offer was withdrawn. Published because the alternative is a log where a
/// handover starts and nothing ever says it stopped, which reads as one still
/// pending forever.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminTransferCancelled {
    #[topic]
    pub admin: Address,
    pub cancelled: Address,
}

#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OperatorChanged {
    #[topic]
    pub from: Address,
    pub to: Address,
}

/// The contract is now running different code. The hash is the one an
/// explorer shows against the contract, so this event and the ledger agree.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Upgraded {
    #[topic]
    pub wasm_hash: BytesN<32>,
}

pub fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL, INSTANCE_TTL);
}

/// Called from every constructor. The operator starts out as the admin, so a
/// contract is never live with an unset role; the deploy script points it at
/// the hot key immediately afterwards, in a transaction the admin has to sign.
pub fn init(env: &Env, admin: &Address) {
    env.storage().instance().set(&ADMIN, admin);
    env.storage().instance().set(&OPERATOR, admin);
    extend_instance_ttl(env);
}

pub fn admin(env: &Env) -> Address {
    env.storage().instance().get(&ADMIN).unwrap()
}

pub fn operator(env: &Env) -> Address {
    env.storage().instance().get(&OPERATOR).unwrap()
}

/// The address named to take over, if a handover is in progress.
pub fn pending_admin(env: &Env) -> Option<Address> {
    env.storage().instance().get(&PENDING)
}

/// Admin only. Returns the address so callers can put it in an event without
/// reading storage twice.
pub fn require_admin(env: &Env) -> Address {
    let admin = admin(env);
    admin.require_auth();
    admin
}

/// Either role.
///
/// The caller is a parameter rather than something this function works out on
/// its own, because `require_auth` cannot be attempted and rolled back: asking
/// the admin first would make every operator call fail on the admin's
/// signature. Naming the caller also means the event and the failure both say
/// which key acted, which matters when one of them is a shared hot key.
pub fn require_manager(env: &Env, caller: &Address) {
    if *caller != admin(env) && *caller != operator(env) {
        panic_with_error!(env, AccessError::NotAuthorized);
    }
    caller.require_auth();
}

/// Point the operator role at a different key. Admin only.
///
/// Rotating a hot key is a routine event - a laptop is replaced, someone
/// leaves - and it must not require redeploying anything.
pub fn set_operator(env: &Env, new: Address) {
    require_admin(env);
    let from = operator(env);
    env.storage().instance().set(&OPERATOR, &new);
    extend_instance_ttl(env);
    OperatorChanged { from, to: new }.publish(env);
}

/// Name a successor admin. Admin only, and not in force until the successor
/// accepts.
pub fn transfer_admin(env: &Env, to: Address) {
    let from = require_admin(env);
    env.storage().instance().set(&PENDING, &to);
    extend_instance_ttl(env);
    AdminTransferStarted { from, to }.publish(env);
}

/// Abandon a handover before it is accepted. Admin only, and a no-op with no
/// event when there was nothing pending - so re-running it is harmless and the
/// log never shows a cancellation that cancelled nothing.
pub fn cancel_transfer_admin(env: &Env) {
    let admin = require_admin(env);
    let pending: Option<Address> = env.storage().instance().get(&PENDING);
    env.storage().instance().remove(&PENDING);
    extend_instance_ttl(env);
    if let Some(cancelled) = pending {
        AdminTransferCancelled { admin, cancelled }.publish(env);
    }
}

/// Take the admin role. Signed by the named successor and nobody else - which
/// is the whole point, since an address that cannot sign cannot be handed the
/// asset by mistake.
pub fn accept_admin(env: &Env) {
    let to: Address = env
        .storage()
        .instance()
        .get(&PENDING)
        .unwrap_or_else(|| panic_with_error!(env, AccessError::NoHandoverPending));
    to.require_auth();
    let from = admin(env);
    env.storage().instance().set(&ADMIN, &to);
    env.storage().instance().remove(&PENDING);
    extend_instance_ttl(env);
    AdminTransferred { from, to }.publish(env);
}

/// Replace this contract's code with the wasm already installed under
/// `new_wasm_hash`. Admin only.
///
/// The swap takes effect once the current invocation returns, so the event
/// below is published by the outgoing code and the next call runs the new
/// code. Storage is untouched: an upgrade that changes the shape of what is
/// stored has to migrate it in a call made afterwards.
pub fn upgrade(env: &Env, new_wasm_hash: BytesN<32>) {
    require_admin(env);
    env.deployer()
        .update_current_contract_wasm(new_wasm_hash.clone());
    extend_instance_ttl(env);
    Upgraded {
        wasm_hash: new_wasm_hash,
    }
    .publish(env);
}
