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
    /// Sale is switched off by the admin (`set_available(false)`).
    SaleNotAvailable = 301,
    /// `amount`, `max_cost` and `min_payout` must all be positive.
    InvalidAmount = 302,
    /// The sale contract holds fewer shares than requested.
    InsufficientInventory = 303,
    /// `price` must be positive (stroops of the payment token per share).
    InvalidPrice = 304,
    /// amount * price overflowed i128. Practically unreachable, checked anyway.
    Overflow = 305,
    /// The compliance registry does not list this address as eligible.
    NotWhitelisted = 306,
    /// The buyback pool holds less payment token than the sell payout.
    InsufficientBuybackFunds = 307,
    /// Buyback discount above the 30% cap, rejected at construction.
    InvalidDiscount = 308,
    /// The price moved between the quote and this transaction: the cost rose
    /// above `max_cost`, or the payout fell below `min_payout`.
    PriceMoved = 309,
    /// The treasury or the fee account cannot buy from the sale that pays
    /// them: their leg of the payment would be a transfer to themselves, so
    /// they would receive shares for less than the asking price.
    TreasuryCannotBuy = 310,
    /// Commission above the 30% cap, rejected at construction.
    InvalidCommission = 311,
}
