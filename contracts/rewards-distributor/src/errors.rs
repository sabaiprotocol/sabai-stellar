use soroban_sdk::contracterror;

/// Codes are unique across every contract in this deployment (registry 1xx,
/// share-token 2xx, sale 3xx, exchange 4xx, rewards 5xx). A cross-contract
/// call surfaces the INNER contract's code, and a shared numbering is what
/// lets the UI turn that code into the right sentence instead of guessing
/// from whichever contract it happened to call.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The caller has no accrued rewards to claim right now.
    NothingToClaim = 501,
    /// Amounts must be positive whole numbers.
    InvalidAmount = 502,
    /// Accumulator arithmetic overflowed i128. Practically unreachable.
    Overflow = 503,
    /// The holder is suspended in the compliance registry. Their rewards keep
    /// accruing and stay in the pool until the suspension is lifted.
    HolderFrozen = 504,
}
