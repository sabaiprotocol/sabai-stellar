//! Pro-rata XLM reward distribution to share holders.
//!
//! Rent income becomes reward rounds that holders claim, the flow Sabai runs
//! in production on Polygon. The issuer deposits a round in the payment token;
//! every holder can then claim their slice of the rounds distributed *while
//! they held the shares*.
//!
//! ## Why this is not the textbook accumulator
//!
//! The classic pattern stores one `debt` per address and computes
//! `balance * acc_per_share - debt`. It relies on the token calling back into
//! the distributor on every transfer so that `debt` follows the shares. This
//! token has no such hook, and Soroban would not allow one here anyway: the
//! distributor reads `share_token.balance()`, so a token -> distributor ->
//! token call chain would re-enter the token inside one call stack.
//!
//! Without the hook, a bare `debt` is unsound. A holder could claim, move the
//! shares to a fresh address whose `debt` is still zero, and claim the whole
//! accumulator again on the same shares.
//!
//! So a position is recorded as a pair instead:
//!
//!   Settled(u) = { balance: b, acc: a }   the balance u held, and the
//!                                         accumulator level, at the last settle
//!
//!   earning(u) = min(balance_now(u), b)   shares that arrived since the last
//!                                         settle earn nothing until settled
//!   pending(u) = Owed(u) + earning(u) * (acc_now - a) / SCALE
//!
//! `min` is what makes it sound in both directions. Shares that arrive at a
//! new address earn nothing there until someone settles it, at which point the
//! accumulator level is stamped to *now*, so they never inherit history. And
//! shares that leave stop earning immediately, because `balance_now` falls.
//!
//! The same rule gives the correct answer to the question the old code got
//! wrong: an investor who buys after a round is not credited for it.
//!
//! `settle` is permissionless and moves no money, so anyone can bring an
//! address up to date; `claim` settles first and then pays.
//!
//! Solvency rests on `total_shares` bounding the supply. `share-token` is
//! deployed with a supply cap equal to it and issues exactly once, so
//! `sum(earning) <= total_supply <= total_shares` at every round and payouts
//! can never exceed deposits. `pool` and `outstanding` let anyone check the
//! consequence of that on-chain instead of taking it on trust.
#![no_std]

mod errors;
mod events;

pub use errors::Error;

use sabai_access as access;
use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, token, vec, Address, BytesN, Env,
    IntoVal, Symbol,
};

/// Fixed-point scale for the accumulator (1e12 keeps i128 far from overflow
/// at PoC magnitudes: deposits <= 1e12 stroops * 1e12 / 1e3 shares ~ 1e21).
const SCALE: i128 = 1_000_000_000_000;

/// A holder's position as of the last settle.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Position {
    /// Shares the holder had when the position was last settled.
    pub balance: i128,
    /// Accumulator level at that moment.
    pub acc: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    ShareToken,
    PaymentToken,
    /// Compliance registry, consulted on `claim` only.
    Registry,
    TotalShares,
    /// Cumulative rewards per share, scaled by `SCALE`. Only ever grows.
    AccPerShare,
    TotalDeposited,
    /// Lifetime total paid out across every holder.
    TotalClaimed,
    /// Last settled position of a holder.
    Settled(Address),
    /// Rewards banked by a settle and not yet paid out.
    Owed(Address),
    /// Lifetime total the holder has claimed.
    Claimed(Address),
}

fn get<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey) -> T {
    env.storage().instance().get(key).unwrap()
}

fn persistent_get_or_zero(env: &Env, key: &DataKey) -> i128 {
    env.storage().persistent().get(key).unwrap_or(0)
}

fn persistent_set(env: &Env, key: &DataKey, value: &i128) {
    env.storage().persistent().set(key, value);
    env.storage()
        .persistent()
        .extend_ttl(key, access::PERSISTENT_TTL, access::PERSISTENT_TTL);
}

/// An address nobody has settled yet has a zero balance on record, so
/// `earning` is zero and it inherits none of the accumulator's history.
fn read_position(env: &Env, user: &Address) -> Position {
    env.storage()
        .persistent()
        .get(&DataKey::Settled(user.clone()))
        .unwrap_or(Position { balance: 0, acc: 0 })
}

fn write_position(env: &Env, user: &Address, position: &Position) {
    let key = DataKey::Settled(user.clone());
    env.storage().persistent().set(&key, position);
    env.storage()
        .persistent()
        .extend_ttl(&key, access::PERSISTENT_TTL, access::PERSISTENT_TTL);
}

fn share_balance(env: &Env, user: &Address) -> i128 {
    let share_token: Address = get(env, &DataKey::ShareToken);
    token::Client::new(env, &share_token).balance(user)
}

/// A suspended holder cannot be paid. This asks for `frozen` rather than
/// `allowed` on purpose, so the deployment-wide pause does not reach in here:
/// halting the asset must not withhold rent a holder has already earned.
/// Accrual continues throughout; the money waits in the pool.
fn require_not_frozen(env: &Env, user: &Address) {
    let registry: Address = get(env, &DataKey::Registry);
    let frozen: bool = env.invoke_contract(
        &registry,
        &Symbol::new(env, "frozen"),
        vec![env, user.into_val(env)],
    );
    if frozen {
        panic_with_error!(env, Error::HolderFrozen);
    }
}

/// Rewards accrued to `user` since their last settle, plus whatever a previous
/// settle already banked.
fn pending(env: &Env, user: &Address) -> i128 {
    let position = read_position(env, user);
    let balance = share_balance(env, user);
    let earning = if balance < position.balance {
        balance
    } else {
        position.balance
    };
    let acc: i128 = get(env, &DataKey::AccPerShare);
    let accrued = earning
        .checked_mul(acc - position.acc)
        .map(|v| v / SCALE)
        .unwrap_or_else(|| panic_with_error!(env, Error::Overflow));
    persistent_get_or_zero(env, &DataKey::Owed(user.clone())) + accrued
}

/// Bank everything accrued so far and re-stamp the position to right now.
fn settle_position(env: &Env, user: &Address) -> i128 {
    let owed = pending(env, user);
    persistent_set(env, &DataKey::Owed(user.clone()), &owed);
    write_position(
        env,
        user,
        &Position {
            balance: share_balance(env, user),
            acc: get(env, &DataKey::AccPerShare),
        },
    );
    owed
}

#[contract]
pub struct RewardsDistributor;

#[contractimpl]
impl RewardsDistributor {
    /// Deploy-time initialization.
    ///
    /// * `total_shares` - the fixed share supply the pro-rata math divides by.
    ///   `share-token` must be deployed with a supply cap equal to this, or
    ///   the distributor can promise more than it holds.
    pub fn __constructor(
        env: Env,
        admin: Address,
        share_token: Address,
        payment_token: Address,
        registry: Address,
        total_shares: i128,
    ) {
        if total_shares <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        access::init(&env, &admin);
        env.storage()
            .instance()
            .set(&DataKey::ShareToken, &share_token);
        env.storage()
            .instance()
            .set(&DataKey::PaymentToken, &payment_token);
        env.storage().instance().set(&DataKey::Registry, &registry);
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &total_shares);
        env.storage().instance().set(&DataKey::AccPerShare, &0_i128);
        env.storage()
            .instance()
            .set(&DataKey::TotalDeposited, &0_i128);
        env.storage()
            .instance()
            .set(&DataKey::TotalClaimed, &0_i128);
        access::extend_instance_ttl(&env);
    }

    /// Deposit a reward round for everyone holding shares right now. Admin or
    /// operator; on the platform this is the writer bot distributing rent
    /// income, month after month, which is exactly the job a hot key exists
    /// for. It is also the safest call in the deployment to give away: the
    /// money moves from `from` into the pool, and this contract has no
    /// entrypoint that moves it back out to anyone but a holder claiming.
    ///
    /// Holders who acquire shares after this call earn nothing from it, which
    /// is the point: you cannot be paid rent for a month you did not own the
    /// property.
    pub fn deposit(env: Env, from: Address, amount: i128) {
        access::require_manager(&env, &from);
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let payment_token: Address = get(&env, &DataKey::PaymentToken);
        token::Client::new(&env, &payment_token).transfer(
            &from,
            env.current_contract_address(),
            &amount,
        );

        let total_shares: i128 = get(&env, &DataKey::TotalShares);
        let acc: i128 = get(&env, &DataKey::AccPerShare);
        let delta = amount
            .checked_mul(SCALE)
            .map(|v| v / total_shares)
            .unwrap_or_else(|| panic_with_error!(&env, Error::Overflow));
        env.storage()
            .instance()
            .set(&DataKey::AccPerShare, &(acc + delta));

        let total: i128 = get(&env, &DataKey::TotalDeposited);
        env.storage()
            .instance()
            .set(&DataKey::TotalDeposited, &(total + amount));
        access::extend_instance_ttl(&env);

        events::Deposit { from, amount }.publish(&env);
    }

    /// Bring an address up to date without paying anything out. Permissionless
    /// and free of authorization on purpose: it can only ever move rewards
    /// from "accruing" to "banked" for the address named, so anyone may run it
    /// for anyone, and a wallet that just bought shares needs it before those
    /// shares start earning.
    pub fn settle(env: Env, user: Address) {
        let owed = settle_position(&env, &user);
        let earning = read_position(&env, &user).balance;
        access::extend_instance_ttl(&env);
        events::Settled {
            user,
            earning,
            owed,
        }
        .publish(&env);
    }

    /// Claim everything accrued to the caller. Settles first, so a claim is
    /// always against an up-to-date position.
    pub fn claim(env: Env, user: Address) {
        user.require_auth();
        require_not_frozen(&env, &user);

        let amount = settle_position(&env, &user);
        if amount <= 0 {
            panic_with_error!(&env, Error::NothingToClaim);
        }
        persistent_set(&env, &DataKey::Owed(user.clone()), &0_i128);

        let payment_token: Address = get(&env, &DataKey::PaymentToken);
        token::Client::new(&env, &payment_token).transfer(
            &env.current_contract_address(),
            &user,
            &amount,
        );

        let claimed = persistent_get_or_zero(&env, &DataKey::Claimed(user.clone()));
        persistent_set(&env, &DataKey::Claimed(user.clone()), &(claimed + amount));
        let total_claimed: i128 = get(&env, &DataKey::TotalClaimed);
        env.storage()
            .instance()
            .set(&DataKey::TotalClaimed, &(total_claimed + amount));
        access::extend_instance_ttl(&env);

        events::Claim { user, amount }.publish(&env);
    }

    // Governance - identical in all five contracts, see `sabai_access`.

    pub fn admin(env: Env) -> Address {
        access::admin(&env)
    }

    /// The hot key that may deposit a reward round.
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

    /// Rewards the holder can claim right now.
    pub fn claimable(env: Env, user: Address) -> i128 {
        pending(&env, &user)
    }

    /// Lifetime total the holder has already claimed.
    pub fn claimed(env: Env, user: Address) -> i128 {
        persistent_get_or_zero(&env, &DataKey::Claimed(user.clone()))
    }

    /// Lifetime rewards for the holder: already claimed + claimable now.
    pub fn earned(env: Env, user: Address) -> i128 {
        let claimed = persistent_get_or_zero(&env, &DataKey::Claimed(user.clone()));
        claimed + pending(&env, &user)
    }

    /// The holder's position as of their last settle. `balance` is how many
    /// shares are currently earning; a wallet showing fewer here than it holds
    /// needs `settle`.
    pub fn position(env: Env, user: Address) -> Position {
        read_position(&env, &user)
    }

    /// Total rewards ever deposited by the issuer.
    pub fn total_deposited(env: Env) -> i128 {
        get(&env, &DataKey::TotalDeposited)
    }

    /// Total paid out across every holder.
    pub fn total_claimed(env: Env) -> i128 {
        get(&env, &DataKey::TotalClaimed)
    }

    /// Payment token this contract is actually holding.
    ///
    /// Together with `outstanding` this is the solvency check, and it is a
    /// check anyone can run from an explorer without trusting a word of this
    /// documentation. Our Polygon contracts expose the same pair
    /// (`rewardStorage` / `needRewardStorage`); the difference is that there
    /// the admin can withdraw the backing and the discipline is off-chain,
    /// whereas this contract has no withdrawal entrypoint at all. Deposited
    /// rent can only ever leave through a holder's `claim`.
    pub fn pool(env: Env) -> i128 {
        let payment_token: Address = get(&env, &DataKey::PaymentToken);
        token::Client::new(&env, &payment_token).balance(&env.current_contract_address())
    }

    /// Upper bound on what every holder could still claim.
    ///
    /// Deposited minus claimed, which over-states the real liability: rounds
    /// that accrued to shares held by the sale contract, or forfeited by a
    /// transfer before a settle, are counted here and will never be claimed.
    /// Over-stating is the safe direction - `pool >= outstanding` proves
    /// solvency, and it stays true even as the bound loosens.
    pub fn outstanding(env: Env) -> i128 {
        let deposited: i128 = get(&env, &DataKey::TotalDeposited);
        let claimed: i128 = get(&env, &DataKey::TotalClaimed);
        deposited - claimed
    }

    /// The compliance registry consulted before a payout.
    pub fn registry(env: Env) -> Address {
        get(&env, &DataKey::Registry)
    }

    pub fn share_token(env: Env) -> Address {
        get(&env, &DataKey::ShareToken)
    }

    pub fn payment_token(env: Env) -> Address {
        get(&env, &DataKey::PaymentToken)
    }

    pub fn total_shares(env: Env) -> i128 {
        get(&env, &DataKey::TotalShares)
    }
}

#[cfg(test)]
mod test;
