use soroban_sdk::{contractevent, Address};

/// A seller escrowed shares and opened an order
#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OrderAdded {
    #[topic]
    pub seller: Address,
    pub order_id: u64,
    pub amount: i128,
    pub rate: i128,
}

/// A buyer (partially) filled an order.
/// `payout` is what the seller received after the platform commission.
///
/// BOTH sides are topics so a wallet can pull its own trade history from
/// RPC with a single `getEvents` filter - where a production deployment
/// has to correlate ERC-20 Transfer logs to recover the counterparty.
#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OrderSwap {
    #[topic]
    pub buyer: Address,
    #[topic]
    pub seller: Address,
    pub order_id: u64,
    pub amount: i128,
    pub cost: i128,
    pub payout: i128,
}

/// An order was cancelled and the escrowed shares returned to the seller.
/// `by_admin` separates a seller cancelling from an admin force-closing.
#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OrderClosed {
    #[topic]
    pub seller: Address,
    pub order_id: u64,
    pub by_admin: bool,
}

/// Trading enabled/disabled by the admin.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AvailabilityChanged {
    pub available: bool,
}

/// The market was pointed at a rewards distributor, so a filling buyer is now
/// settled by their own trade rather than by a second call of their own.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RewardsSet {
    #[topic]
    pub rewards: Address,
}
