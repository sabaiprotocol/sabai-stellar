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
    /// Called by an address that is not the registered KYC provider.
    NotKycProvider = 101,
    /// The address is not cleared to hold shares of this asset.
    NotAllowed = 102,
    /// A batch was empty or longer than `MAX_BATCH`.
    InvalidBatch = 103,
}
