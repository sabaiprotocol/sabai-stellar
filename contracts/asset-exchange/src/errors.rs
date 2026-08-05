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
    /// Trading is switched off by the admin (`set_available(false)`).
    ExchangeNotAvailable = 401,
    /// `amount` must be a positive whole number of shares.
    InvalidAmount = 402,
    /// `rate` must sit inside the `[min_rate, max_rate]` band.
    RateOutOfBand = 403,
    /// No active order with this id (never existed, filled, or cancelled).
    OrderNotFound = 404,
    /// Buying from your own order is pointless, and blocked.
    OwnOrder = 405,
    /// Requested more shares than the order still holds.
    ExceedsOrderSize = 406,
    /// Only the seller who placed the order may cancel it this way.
    NotOrderSeller = 407,
    /// The buyer is not cleared by the compliance registry.
    NotWhitelisted = 408,
    /// amount * rate overflowed i128. Practically unreachable, checked anyway.
    Overflow = 409,
    /// Constructor got an invalid config value (rate band or commission).
    InvalidConfig = 410,
    /// The order's seller is no longer cleared by the registry, so the fill
    /// would pay proceeds to a revoked address. Their escrow stays frozen
    /// until the KYC provider admits them again.
    SellerNotWhitelisted = 411,
}
