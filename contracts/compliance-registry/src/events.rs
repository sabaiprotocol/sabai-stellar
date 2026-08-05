use soroban_sdk::{contractevent, Address};

/// The address self-registered through the demo shortcut.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Registered {
    #[topic]
    pub user: Address,
}

/// The KYC provider admitted an investor after an off-chain check. Distinct
/// from `Registered` on purpose: these two are not interchangeable in an
/// audit, and the self-serve path does not exist in production.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RegisteredByProvider {
    #[topic]
    pub user: Address,
    pub provider: Address,
}

/// Eligibility withdrawn. The holder keeps whatever shares they already have
/// and loses the ability to move or receive more.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Revoked {
    #[topic]
    pub user: Address,
    pub provider: Address,
}

/// Eligibility suspended without deleting the KYC record. Distinct from
/// `Revoked` on purpose: a freeze is a suspension of a verified investor,
/// a revoke is the withdrawal of the verification itself. Re-admitting after
/// a freeze is an unfreeze, not a second registration, and the event log has
/// to keep the two apart for an auditor to reconstruct why an address was
/// ever blocked.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Frozen {
    #[topic]
    pub user: Address,
    pub provider: Address,
}

/// A suspension lifted. The underlying verification was never removed.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Unfrozen {
    #[topic]
    pub user: Address,
    pub provider: Address,
}

/// The deployment-wide halt was set or lifted by the admin.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PauseChanged {
    pub paused: bool,
}

/// A protocol contract was admitted or removed by the admin.
#[contractevent(data_format = "single-value")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParticipantSet {
    #[topic]
    pub addr: Address,
    pub allowed: bool,
}

#[contractevent(data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KycProviderChanged {
    pub old: Address,
    pub new: Address,
}
