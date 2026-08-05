use soroban_sdk::{contractevent, Address};

/// Published on every successful purchase - the primary event an indexer
/// would follow. `cost` is what the buyer paid in total; `commission` is the
/// slice of it that went to the fee account rather than the treasury, so the
/// issuer's actual receipts can be reconstructed from the log alone.
#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Buy {
    #[topic]
    pub buyer: Address,
    pub amount: i128,
    pub cost: i128,
    pub commission: i128,
}

#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceChanged {
    pub old: i128,
    pub new: i128,
}

#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AvailabilityChanged {
    pub available: bool,
}

/// Admin pulled unsold shares out of the contract.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SharesWithdrawn {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

/// Shares sold back to the contract at the current price
/// against the buyback pool.
#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Sell {
    #[topic]
    pub seller: Address,
    pub amount: i128,
    pub payout: i128,
}

/// Payment token added to the buyback pool held by the contract.
#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BuybackFunded {
    pub from: Address,
    pub amount: i128,
}

/// Admin pulled payment token out of the buyback pool.
#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BuybackWithdrawn {
    pub to: Address,
    pub amount: i128,
}

/// The sale was pointed at a rewards distributor, so buyers are now settled
/// by their own purchase rather than by a second call of their own.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RewardsSet {
    #[topic]
    pub rewards: Address,
}
