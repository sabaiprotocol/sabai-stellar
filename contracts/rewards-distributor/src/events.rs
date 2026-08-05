use soroban_sdk::{contractevent, Address};

/// Admin deposited a reward round for everyone holding shares at that ledger.
#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Deposit {
    #[topic]
    pub from: Address,
    pub amount: i128,
}

/// A holder's position was brought up to date. `earning` is how many shares
/// now accrue for them, `owed` is what is banked and waiting to be claimed.
#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Settled {
    #[topic]
    pub user: Address,
    pub earning: i128,
    pub owed: i128,
}

/// A holder claimed their accrued rewards.
#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claim {
    #[topic]
    pub user: Address,
    pub amount: i128,
}
