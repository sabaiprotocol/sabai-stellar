//! Fractional share token: SEP-41 compatible, permissioned.
//!
//! One token is one indivisible share of the tokenized asset (decimals = 0),
//! the same unit Sabai issues on Polygon.
//!
//! The interface is the standard one, but the token is not free-floating.
//! Every movement of shares (mint, transfer, transfer_from) asks the
//! compliance registry whether both sides may hold them. Putting the check
//! here rather than only in the sale and exchange contracts is what makes the
//! eligibility gate binding: without it a holder could send shares
//! wallet-to-wallet and step around it.
//!
//! Two entrypoints answer to the issuer rather than to the holder, both of
//! them modelled on the Polygon contracts: `mint` runs exactly once, and
//! `revoke_shares` moves shares back into custody without the holder's
//! signature. See each for what bounds them. Both are admin-only, and the
//! admin is a 2-of-3 multisig - neither is reachable by the hot operator key.
//!
//! The token also carries the pointer to the legal wrapper the shares are
//! shares *of*: see `Terms`.
#![no_std]

use sabai_access as access;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    vec, Address, BytesN, Env, IntoVal, MuxedAddress, String, Symbol,
};

/// Codes are unique across every contract in this deployment (registry 1xx,
/// share-token 2xx, sale 3xx, exchange 4xx, rewards 5xx). A cross-contract
/// call surfaces the INNER contract's code, and a shared numbering is what
/// lets the UI turn that code into the right sentence instead of guessing
/// from whichever contract it happened to call.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NegativeAmount = 201,
    InsufficientBalance = 202,
    InsufficientAllowance = 203,
    InvalidExpirationLedger = 204,
    /// One side of the transfer is not cleared to hold shares.
    NotAllowed = 205,
    /// A balance or the total supply would exceed i128. Unreachable at any
    /// real supply, checked because release-mode Rust wraps instead of
    /// trapping.
    Overflow = 206,
    /// The mint would push the total supply past the cap fixed at deployment.
    SupplyCapExceeded = 207,
    /// `max_supply` must be a positive number of shares.
    InvalidSupplyCap = 208,
    /// The issuance already happened. There is no second one.
    AlreadyIssued = 209,
    /// `set_terms` was given an empty document hash, jurisdiction or URI.
    IncompleteTerms = 210,
}

/// The legal wrapper these shares represent an interest in.
///
/// A tokenized building is two things that have to stay tied together: an
/// entry in this contract's balance map, and a share of the company that holds
/// title to the property. Nothing on-chain can enforce the second half, but a
/// token that does not even *name* it leaves a holder with no way to find out
/// what they own. So the pointer and the hash live on-chain, and the documents
/// they point at live wherever the issuer publishes them.
///
/// `doc_hash` is what makes it more than a link: a subscription agreement
/// quietly rewritten after investors signed no longer hashes to the value the
/// ledger recorded, and anyone can check that without asking the issuer.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Terms {
    /// The entity holding title - normally a per-asset SPV.
    pub issuer: String,
    /// Law the SPV and the offering are governed by.
    pub jurisdiction: String,
    /// Where the signed document bundle is published (IPFS CID or https URL).
    pub uri: String,
    /// sha256 of that bundle.
    pub doc_hash: BytesN<32>,
    /// False while the asset is a demonstration rather than a property. This
    /// is a field rather than a README line because a wallet reading the
    /// contract has to be able to tell.
    pub is_real_asset: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Name,
    Symbol,
    TotalSupply,
    /// Hard ceiling on TotalSupply, fixed at deployment.
    MaxSupply,
    /// Set by the one and only `mint`.
    Issued,
    /// Custody address: receives the issuance, and the only destination a
    /// forced revocation can send shares to. Fixed at deployment.
    Treasury,
    /// Compliance registry consulted on every movement of shares.
    Registry,
    /// The legal wrapper behind the asset. Unset until the issuer publishes it.
    Terms,
    Balance(Address),
    Allowance(Address, Address),
}

#[contracttype]
#[derive(Clone)]
pub struct AllowanceValue {
    pub amount: i128,
    pub expiration_ledger: u32,
}

// Events, SEP-41 style: amount as single-value data.

#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Mint {
    #[topic]
    pub admin: Address,
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Transfer {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Approve {
    #[topic]
    pub from: Address,
    #[topic]
    pub spender: Address,
    pub amount: i128,
    pub live_until_ledger: u32,
}

#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Burn {
    #[topic]
    pub from: Address,
    pub amount: i128,
}

/// Shares taken from a holder without their signature and returned to
/// custody. Published alongside the standard `Transfer` so a SEP-41 indexer
/// stays correct while an auditor can still tell a confiscation from a trade.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SharesRevoked {
    #[topic]
    pub from: Address,
    pub amount: i128,
}

/// The issuer published or replaced the legal terms. The hash is in the log so
/// a holder can prove which version of the documents was in force when they
/// bought, without trusting whatever the URI serves today.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TermsSet {
    #[topic]
    pub doc_hash: BytesN<32>,
    pub uri: String,
}

fn checked_add(env: &Env, a: i128, b: i128) -> i128 {
    a.checked_add(b)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow))
}

fn check_non_negative(env: &Env, amount: i128) {
    if amount < 0 {
        panic_with_error!(env, Error::NegativeAmount);
    }
}

/// Stricter than `check_non_negative`, for the two entrypoints where a zero is
/// not a harmless no-op: `mint` would spend the one issuance on nothing and
/// brick the asset permanently, and `revoke_shares` would publish a
/// confiscation that never happened.
fn check_positive(env: &Env, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, Error::NegativeAmount);
    }
}

fn read_balance(env: &Env, id: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Balance(id.clone()))
        .unwrap_or(0)
}

fn write_balance(env: &Env, id: &Address, amount: i128) {
    let key = DataKey::Balance(id.clone());
    env.storage().persistent().set(&key, &amount);
    env.storage()
        .persistent()
        .extend_ttl(&key, access::PERSISTENT_TTL, access::PERSISTENT_TTL);
}

fn spend_balance(env: &Env, id: &Address, amount: i128) {
    let balance = read_balance(env, id);
    if balance < amount {
        panic_with_error!(env, Error::InsufficientBalance);
    }
    write_balance(env, id, balance - amount);
}

fn read_allowance(env: &Env, from: &Address, spender: &Address) -> i128 {
    let key = DataKey::Allowance(from.clone(), spender.clone());
    match env.storage().temporary().get::<_, AllowanceValue>(&key) {
        Some(a) if a.expiration_ledger >= env.ledger().sequence() => a.amount,
        _ => 0,
    }
}

fn spend_allowance(env: &Env, from: &Address, spender: &Address, amount: i128) {
    let allowance = read_allowance(env, from, spender);
    if allowance < amount {
        panic_with_error!(env, Error::InsufficientAllowance);
    }
    let key = DataKey::Allowance(from.clone(), spender.clone());
    if let Some(mut a) = env.storage().temporary().get::<_, AllowanceValue>(&key) {
        a.amount = allowance - amount;
        env.storage().temporary().set(&key, &a);
    }
}

fn move_tokens(env: &Env, from: &Address, to: &Address, amount: i128) {
    spend_balance(env, from, amount);
    let credited = checked_add(env, read_balance(env, to), amount);
    write_balance(env, to, credited);
}

/// Ask the registry whether an address may hold shares.
///
/// The registry is a separate contract rather than a callback into
/// asset-sale: the sale invokes this token during a purchase, so a check that
/// called back into the sale would re-enter it inside the same call stack,
/// which the host forbids.
fn require_allowed(env: &Env, addr: &Address) {
    let registry: Address = env
        .storage()
        .instance()
        .get(&DataKey::Registry)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotAllowed));
    let allowed: bool = env.invoke_contract(
        &registry,
        &Symbol::new(env, "allowed"),
        vec![env, addr.into_val(env)],
    );
    if !allowed {
        panic_with_error!(env, Error::NotAllowed);
    }
}

fn burn_supply(env: &Env, from: &Address, amount: i128) {
    spend_balance(env, from, amount);
    let supply: i128 = env
        .storage()
        .instance()
        .get(&DataKey::TotalSupply)
        .unwrap_or(0);
    env.storage()
        .instance()
        .set(&DataKey::TotalSupply, &(supply - amount));
    Burn {
        from: from.clone(),
        amount,
    }
    .publish(env);
}

#[contract]
pub struct ShareToken;

#[contractimpl]
impl ShareToken {
    /// Deploy-time initialization (runs exactly once, atomically with deploy).
    ///
    /// * `registry` is shared across every asset on the platform - an investor
    ///   verified once can hold shares of all of them.
    /// * `treasury` receives the issuance and is the only address a forced
    ///   revocation can move shares to. No setter: the key that can confiscate
    ///   must not also be able to choose where the shares land.
    /// * `max_supply` is the asset's share count and cannot be raised later.
    ///   rewards-distributor divides income by that same number, so a token
    ///   able to mint past it could promise more rent than was ever deposited.
    pub fn __constructor(
        env: Env,
        admin: Address,
        name: String,
        symbol: String,
        registry: Address,
        treasury: Address,
        max_supply: i128,
    ) {
        if max_supply <= 0 {
            panic_with_error!(&env, Error::InvalidSupplyCap);
        }
        access::init(&env, &admin);
        env.storage().instance().set(&DataKey::Registry, &registry);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::TotalSupply, &0_i128);
        env.storage()
            .instance()
            .set(&DataKey::MaxSupply, &max_supply);
        env.storage().instance().set(&DataKey::Issued, &false);
        access::extend_instance_ttl(&env);
    }

    /// Issue the asset's shares. Admin only, and callable **once** - a second
    /// call fails whatever the amount, so the amount has to be positive: a
    /// `mint(to, 0)` would otherwise spend the single issuance on nothing and
    /// leave the asset permanently unable to have any shares at all.
    ///
    /// A tokenized building is issued, not printed on demand: the share count
    /// is a property of the asset and of the legal wrapper behind it, so the
    /// contract enforces it rather than trusting an operator to stop. That is
    /// also what makes `total_shares` in rewards-distributor an invariant
    /// instead of an agreement - the supply it divides income by is fixed
    /// before the first investor arrives and cannot be diluted afterwards.
    ///
    /// Issuing less than `max_supply` is allowed and safe: the distributor
    /// still divides by the cap, so the unissued fraction of every round
    /// simply stays in the pool. It is never over-promised.
    ///
    /// `to` is normally the treasury, which then funds the sale contract with
    /// whatever tranche is actually being offered. It is a parameter rather
    /// than the stored treasury because a real issuance may go to a custodian
    /// the platform does not control.
    pub fn mint(env: Env, to: Address, amount: i128) {
        check_positive(&env, amount);
        let admin = access::require_admin(&env);
        require_allowed(&env, &to);

        if env
            .storage()
            .instance()
            .get(&DataKey::Issued)
            .unwrap_or(false)
        {
            panic_with_error!(&env, Error::AlreadyIssued);
        }

        let supply: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0);
        let new_supply = checked_add(&env, supply, amount);
        let max_supply: i128 = env.storage().instance().get(&DataKey::MaxSupply).unwrap();
        if new_supply > max_supply {
            panic_with_error!(&env, Error::SupplyCapExceeded);
        }
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &new_supply);
        env.storage().instance().set(&DataKey::Issued, &true);
        let credited = checked_add(&env, read_balance(&env, &to), amount);
        write_balance(&env, &to, credited);
        access::extend_instance_ttl(&env);

        Mint { admin, to, amount }.publish(&env);
    }

    /// Move `amount` shares from `from` to the treasury without the holder's
    /// signature. Admin only.
    ///
    /// A security token needs this and a payment token does not: a court order,
    /// a probate transfer, a sanctions confiscation, or a holder whose keys are
    /// gone are all cases where the register of ownership has to change and the
    /// holder cannot or will not sign. Our Polygon contracts carry the same
    /// entrypoint. Three things bound it:
    ///
    /// * the destination is the treasury fixed at deployment, so this cannot be
    ///   used to move shares to an address of the admin's choosing;
    /// * it publishes `SharesRevoked` next to the standard `Transfer`, so a
    ///   confiscation can never be mistaken for a trade in the log;
    /// * it is the only path in this contract that skips the registry check on
    ///   purpose - the address being confiscated from is usually the one that
    ///   was frozen or revoked, and requiring it to be eligible would make the
    ///   entrypoint useless in exactly the case it exists for.
    ///
    /// It is deliberately not blocked by the deployment-wide pause: an incident
    /// is when this is most likely to be needed.
    pub fn revoke_shares(env: Env, from: Address, amount: i128) {
        check_positive(&env, amount);
        access::require_admin(&env);

        let treasury: Address = env.storage().instance().get(&DataKey::Treasury).unwrap();
        move_tokens(&env, &from, &treasury, amount);
        access::extend_instance_ttl(&env);

        SharesRevoked {
            from: from.clone(),
            amount,
        }
        .publish(&env);
        Transfer {
            from,
            to: treasury,
            amount,
        }
        .publish(&env);
    }

    /// Publish the legal wrapper behind the shares, or replace it when the
    /// documents are re-executed. Admin only.
    ///
    /// Replacing rather than appending is the honest shape for a PoC, and it
    /// is also the reason every version is announced in an event: the current
    /// value says what is in force, and the log says what was in force when
    /// any given investor bought. A production issuer keeps the superseded
    /// bundles published at their own URIs so both remain retrievable.
    pub fn set_terms(env: Env, terms: Terms) {
        access::require_admin(&env);
        // An all-zero hash is what a caller who has no document to hash ends up
        // passing, and it would sit on-chain looking exactly like a real one.
        // No sha256 of anything is 32 zero bytes.
        if terms.uri.is_empty()
            || terms.jurisdiction.is_empty()
            || terms.issuer.is_empty()
            || terms.doc_hash == BytesN::from_array(&env, &[0u8; 32])
        {
            panic_with_error!(&env, Error::IncompleteTerms);
        }
        env.storage().instance().set(&DataKey::Terms, &terms);
        access::extend_instance_ttl(&env);

        TermsSet {
            doc_hash: terms.doc_hash,
            uri: terms.uri,
        }
        .publish(&env);
    }

    /// The legal wrapper, if the issuer has published one. `None` is a real
    /// answer and a wallet should show it as one: shares with no terms behind
    /// them are shares of nothing.
    pub fn terms(env: Env) -> Option<Terms> {
        env.storage().instance().get(&DataKey::Terms)
    }

    // Governance - identical in all five contracts, see `sabai_access`.

    pub fn admin(env: Env) -> Address {
        access::admin(&env)
    }

    pub fn set_operator(env: Env, operator: Address) {
        access::set_operator(&env, operator);
    }

    /// Stored for symmetry with the other four contracts and unused here: this
    /// token has no entrypoint a hot key may call. Issuing and confiscating
    /// shares are exactly the decisions that must cost two signatures.
    pub fn operator(env: Env) -> Address {
        access::operator(&env)
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

    /// The compliance registry every movement of shares is checked against.
    pub fn registry(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Registry).unwrap()
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    /// Ceiling on `total_supply`, fixed at deployment and with no setter.
    pub fn max_supply(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::MaxSupply).unwrap()
    }

    /// Has the one-time issuance already happened?
    pub fn issued(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Issued)
            .unwrap_or(false)
    }

    /// Custody address: where the issuance went and the only place a forced
    /// revocation can send shares.
    pub fn treasury(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Treasury).unwrap()
    }
}

#[contractimpl]
impl token::TokenInterface for ShareToken {
    fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        read_allowance(&env, &from, &spender)
    }

    fn approve(env: Env, from: Address, spender: Address, amount: i128, live_until_ledger: u32) {
        from.require_auth();
        check_non_negative(&env, amount);

        if amount > 0 && live_until_ledger < env.ledger().sequence() {
            panic_with_error!(env, Error::InvalidExpirationLedger);
        }

        let key = DataKey::Allowance(from.clone(), spender.clone());
        env.storage().temporary().set(
            &key,
            &AllowanceValue {
                amount,
                expiration_ledger: live_until_ledger,
            },
        );
        if amount > 0 {
            let live_for = live_until_ledger.saturating_sub(env.ledger().sequence());
            env.storage()
                .temporary()
                .extend_ttl(&key, live_for, live_for);
        }

        Approve {
            from,
            spender,
            amount,
            live_until_ledger,
        }
        .publish(&env);
    }

    fn balance(env: Env, id: Address) -> i128 {
        read_balance(&env, &id)
    }

    /// `to` is a MuxedAddress (CAP-67): wallets/exchanges may attach a mux id
    /// to one Stellar account. Balances are tracked per underlying Address.
    fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) {
        from.require_auth();
        check_non_negative(&env, amount);
        let to_addr = to.address();
        // Both sides: a revoked holder must not be able to move shares out,
        // and no one may push shares onto an address that was never cleared.
        require_allowed(&env, &from);
        require_allowed(&env, &to_addr);
        move_tokens(&env, &from, &to_addr, amount);
        access::extend_instance_ttl(&env);
        Transfer {
            from,
            to: to_addr,
            amount,
        }
        .publish(&env);
    }

    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        check_non_negative(&env, amount);
        require_allowed(&env, &from);
        require_allowed(&env, &to);
        spend_allowance(&env, &from, &spender, amount);
        move_tokens(&env, &from, &to, amount);
        access::extend_instance_ttl(&env);
        Transfer { from, to, amount }.publish(&env);
    }

    fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        check_non_negative(&env, amount);
        burn_supply(&env, &from, amount);
    }

    fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        check_non_negative(&env, amount);
        spend_allowance(&env, &from, &spender, amount);
        burn_supply(&env, &from, amount);
    }

    /// Shares are indivisible: decimals = 0.
    fn decimals(env: Env) -> u32 {
        let _ = env;
        0
    }

    fn name(env: Env) -> String {
        env.storage().instance().get(&DataKey::Name).unwrap()
    }

    fn symbol(env: Env) -> String {
        env.storage().instance().get(&DataKey::Symbol).unwrap()
    }
}

#[cfg(test)]
mod test;
