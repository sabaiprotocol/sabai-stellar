import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export type DataKey = {tag: "KycProvider", values: void} | {tag: "Paused", values: void} | {tag: "Investor", values: readonly [string]} | {tag: "Participant", values: readonly [string]} | {tag: "Frozen", values: readonly [string]};

/**
 * Codes are unique across every contract in this deployment (registry 1xx,
 * share-token 2xx, sale 3xx, exchange 4xx, rewards 5xx). A cross-contract
 * call surfaces the INNER contract's code, and a shared numbering is what
 * lets the UI turn that code into the right sentence instead of guessing
 * from whichever contract it happened to call.
 */
export const Errors = {
  /**
   * Called by an address that is not the registered KYC provider.
   */
  101: {message:"NotKycProvider"},
  /**
   * The address is not cleared to hold shares of this asset.
   */
  102: {message:"NotAllowed"},
  /**
   * A batch was empty or longer than `MAX_BATCH`.
   */
  103: {message:"InvalidBatch"}
}










/**
 * Named apart from each contract's own `Error` so the two never collide in
 * the contract spec the bindings are generated from.
 * 
 * 9xx is reserved for governance in every contract of this deployment
 * (registry 1xx, share-token 2xx, sale 3xx, exchange 4xx, rewards 5xx), so a
 * code arriving from a cross-contract call still says what happened without
 * the caller having to know which contract produced it.
 */
export const AccessError = {
  /**
   * The caller holds neither the admin nor the operator role.
   */
  901: {message:"NotAuthorized"},
  /**
   * `accept_admin` was called with no handover in progress.
   */
  902: {message:"NoHandoverPending"}
}





export interface Client {
  /**
   * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Halt every movement of shares across the whole deployment. Admin or
   * operator - see `resume` for why those two are not the same list.
   * 
   * This is the incident switch. It does not stop `claim` in
   * rewards-distributor: pausing exists to freeze the asset while something
   * is being investigated, and withholding rent a holder has already earned
   * would be confiscation, not incident response. A specific holder who must
   * not be paid is a `freeze`, which does block their claim.
   */
  pause: ({caller}: {caller: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a freeze transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Suspend a verified investor without withdrawing the verification -
   * a sanctions screening hit, a court order, an account under review.
   * Their shares stay theirs and stop moving in either direction.
   * 
   * Kept apart from `revoke` because the two answer different questions.
   * `revoke` says the KYC decision no longer stands and re-admission means
   * verifying again; `freeze` says the decision stands but the address is
   * blocked, and lifting it is a single call with no re-verification.
   */
  freeze: ({provider, user}: {provider: string, user: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a frozen transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Verified but suspended.
   */
  frozen: ({addr}: {addr: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Is the whole deployment halted?
   */
  paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a resume transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lift the halt. Admin only, and deliberately a narrower list than
   * `pause`.
   * 
   * Halting an asset that turns out to be fine costs an hour of downtime.
   * Restarting one that is not fine can cost an investor their money, and
   * it is the decision most likely to be made under pressure by whoever is
   * awake. So the cheap direction is one hot signature and the expensive
   * one needs two of three cold ones - a single stolen operator key can
   * stop this deployment and cannot start it again.
   */
  resume: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a revoke transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Withdraw an investor's eligibility - a sanctions hit, an expired
   * re-verification, a closed account. Shares already held are untouched;
   * what stops is the ability to receive or move them.
   */
  revoke: ({provider, user}: {provider: string, user: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a allowed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * May this address hold shares? The question every token transfer asks,
   * and the single point the halt and the freeze list act through.
   */
  allowed: ({addr}: {addr: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The hot key that may halt the deployment but not lift the halt.
   */
  operator: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a register transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * DEMO SHORTCUT - the caller admits THEMSELVES, so a reviewer can walk
   * the whole flow on testnet without us running a KYC vendor. This
   * entrypoint does not exist in a production deployment;
   * `register_verified` is the real path.
   */
  register: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a unfreeze transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Lift a suspension. The underlying verification was never removed, so
   * this is all it takes to make the address eligible again.
   */
  unfreeze: ({provider, user}: {provider: string, user: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a participant transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  participant: ({addr}: {addr: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a whitelisted transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admitted as an investor (as opposed to protocol infrastructure).
   * Raw verification status: unlike `allowed` this ignores the halt and the
   * freeze list, so a UI can tell "never verified" from "verified, blocked".
   */
  whitelisted: ({addr}: {addr: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a kyc_provider transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  kyc_provider: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a set_operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_operator: ({operator}: {operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The successor named by `transfer_admin` and still to accept.
   */
  pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  transfer_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_participant transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admit or remove a protocol contract - the sale holding inventory, the
   * exchange holding escrow, the address unsold inventory is withdrawn to.
   * Admin only, and separate from the investor list on purpose: the admin
   * must not be able to admit investors.
   */
  set_participant: ({addr, allowed}: {addr: string, allowed: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_kyc_provider transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Rotate the provider. Admin only. Rotation is why this is stored state
   * and not a constructor constant: changing KYC vendor must not mean
   * redeploying and migrating every entry.
   */
  set_kyc_provider: ({provider}: {provider: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a register_verified transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admit an investor after an off-chain KYC decision (SEP-12). The
   * provider signs; the investor does not have to be online.
   */
  register_verified: ({provider, user}: {provider: string, user: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a cancel_transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel_transfer_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a register_verified_batch transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admit up to `MAX_BATCH` investors in one transaction, for a provider
   * clearing a queue after a review run. One event per address, identical to
   * the single-address path, so an indexer needs no special case.
   * 
   * The batch shares one base fee and one signature; the per-address ledger
   * writes are the same either way, which is why this is a smaller saving
   * than batching on an EVM chain and why nothing else here is batched.
   * Measured on testnet: 0.0234 XLM for one address, 0.0203 per address at
   * a hundred - about 13%, against the order of magnitude batching buys on
   * an EVM chain, because here the ledger writes dominate and they do not
   * amortize. A full batch of 100 fits inside the host's resource limits
   * with room to spare.
   */
  register_verified_batch: ({provider, users}: {provider: string, users: Array<string>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, kyc_provider}: {admin: string, kyc_provider: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, kyc_provider}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABQAAAAAAAAA2VGhlIG9ubHkgYWRkcmVzcyBhbGxvd2VkIHRvIGFkbWl0IG9yIHJldm9rZSBpbnZlc3RvcnMuAAAAAAALS3ljUHJvdmlkZXIAAAAAAAAAAGVEZXBsb3ltZW50LXdpZGUgaGFsdC4gSW5zdGFuY2Ugc3RvcmFnZSwgc28gYGFsbG93ZWRgIHJlYWRzIGl0IHdpdGhvdXQKdG91Y2hpbmcgYSBzZWNvbmQgbGVkZ2VyIGVudHJ5LgAAAAAAAAZQYXVzZWQAAAAAAAEAAAAjQW4gaW52ZXN0b3IgY2xlYXJlZCB0byBob2xkIHNoYXJlcy4AAAAACEludmVzdG9yAAAAAQAAABMAAAABAAAAREEgcHJvdG9jb2wgY29udHJhY3QgY2xlYXJlZCB0byBob2xkIHNoYXJlcyAoc2FsZSBpbnZlbnRvcnksIGVzY3JvdykuAAAAC1BhcnRpY2lwYW50AAAAAAEAAAATAAAAAQAAADJBIHZlcmlmaWVkIGFkZHJlc3Mgd2hvc2UgZWxpZ2liaWxpdHkgaXMgc3VzcGVuZGVkLgAAAAAABkZyb3plbgAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAdBIYWx0IGV2ZXJ5IG1vdmVtZW50IG9mIHNoYXJlcyBhY3Jvc3MgdGhlIHdob2xlIGRlcGxveW1lbnQuIEFkbWluIG9yCm9wZXJhdG9yIC0gc2VlIGByZXN1bWVgIGZvciB3aHkgdGhvc2UgdHdvIGFyZSBub3QgdGhlIHNhbWUgbGlzdC4KClRoaXMgaXMgdGhlIGluY2lkZW50IHN3aXRjaC4gSXQgZG9lcyBub3Qgc3RvcCBgY2xhaW1gIGluCnJld2FyZHMtZGlzdHJpYnV0b3I6IHBhdXNpbmcgZXhpc3RzIHRvIGZyZWV6ZSB0aGUgYXNzZXQgd2hpbGUgc29tZXRoaW5nCmlzIGJlaW5nIGludmVzdGlnYXRlZCwgYW5kIHdpdGhob2xkaW5nIHJlbnQgYSBob2xkZXIgaGFzIGFscmVhZHkgZWFybmVkCndvdWxkIGJlIGNvbmZpc2NhdGlvbiwgbm90IGluY2lkZW50IHJlc3BvbnNlLiBBIHNwZWNpZmljIGhvbGRlciB3aG8gbXVzdApub3QgYmUgcGFpZCBpcyBhIGBmcmVlemVgLCB3aGljaCBkb2VzIGJsb2NrIHRoZWlyIGNsYWltLgAAAAVwYXVzZQAAAAAAAAEAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAA=",
        "AAAAAAAAAdhTdXNwZW5kIGEgdmVyaWZpZWQgaW52ZXN0b3Igd2l0aG91dCB3aXRoZHJhd2luZyB0aGUgdmVyaWZpY2F0aW9uIC0KYSBzYW5jdGlvbnMgc2NyZWVuaW5nIGhpdCwgYSBjb3VydCBvcmRlciwgYW4gYWNjb3VudCB1bmRlciByZXZpZXcuClRoZWlyIHNoYXJlcyBzdGF5IHRoZWlycyBhbmQgc3RvcCBtb3ZpbmcgaW4gZWl0aGVyIGRpcmVjdGlvbi4KCktlcHQgYXBhcnQgZnJvbSBgcmV2b2tlYCBiZWNhdXNlIHRoZSB0d28gYW5zd2VyIGRpZmZlcmVudCBxdWVzdGlvbnMuCmByZXZva2VgIHNheXMgdGhlIEtZQyBkZWNpc2lvbiBubyBsb25nZXIgc3RhbmRzIGFuZCByZS1hZG1pc3Npb24gbWVhbnMKdmVyaWZ5aW5nIGFnYWluOyBgZnJlZXplYCBzYXlzIHRoZSBkZWNpc2lvbiBzdGFuZHMgYnV0IHRoZSBhZGRyZXNzIGlzCmJsb2NrZWQsIGFuZCBsaWZ0aW5nIGl0IGlzIGEgc2luZ2xlIGNhbGwgd2l0aCBubyByZS12ZXJpZmljYXRpb24uAAAABmZyZWV6ZQAAAAAAAgAAAAAAAAAIcHJvdmlkZXIAAAATAAAAAAAAAAR1c2VyAAAAEwAAAAA=",
        "AAAAAAAAABdWZXJpZmllZCBidXQgc3VzcGVuZGVkLgAAAAAGZnJvemVuAAAAAAABAAAAAAAAAARhZGRyAAAAEwAAAAEAAAAB",
        "AAAAAAAAAB9JcyB0aGUgd2hvbGUgZGVwbG95bWVudCBoYWx0ZWQ/AAAAAAZwYXVzZWQAAAAAAAAAAAABAAAAAQ==",
        "AAAAAAAAAdZMaWZ0IHRoZSBoYWx0LiBBZG1pbiBvbmx5LCBhbmQgZGVsaWJlcmF0ZWx5IGEgbmFycm93ZXIgbGlzdCB0aGFuCmBwYXVzZWAuCgpIYWx0aW5nIGFuIGFzc2V0IHRoYXQgdHVybnMgb3V0IHRvIGJlIGZpbmUgY29zdHMgYW4gaG91ciBvZiBkb3dudGltZS4KUmVzdGFydGluZyBvbmUgdGhhdCBpcyBub3QgZmluZSBjYW4gY29zdCBhbiBpbnZlc3RvciB0aGVpciBtb25leSwgYW5kCml0IGlzIHRoZSBkZWNpc2lvbiBtb3N0IGxpa2VseSB0byBiZSBtYWRlIHVuZGVyIHByZXNzdXJlIGJ5IHdob2V2ZXIgaXMKYXdha2UuIFNvIHRoZSBjaGVhcCBkaXJlY3Rpb24gaXMgb25lIGhvdCBzaWduYXR1cmUgYW5kIHRoZSBleHBlbnNpdmUKb25lIG5lZWRzIHR3byBvZiB0aHJlZSBjb2xkIG9uZXMgLSBhIHNpbmdsZSBzdG9sZW4gb3BlcmF0b3Iga2V5IGNhbgpzdG9wIHRoaXMgZGVwbG95bWVudCBhbmQgY2Fubm90IHN0YXJ0IGl0IGFnYWluLgAAAAAABnJlc3VtZQAAAAAAAAAAAAA=",
        "AAAAAAAAALlXaXRoZHJhdyBhbiBpbnZlc3RvcidzIGVsaWdpYmlsaXR5IC0gYSBzYW5jdGlvbnMgaGl0LCBhbiBleHBpcmVkCnJlLXZlcmlmaWNhdGlvbiwgYSBjbG9zZWQgYWNjb3VudC4gU2hhcmVzIGFscmVhZHkgaGVsZCBhcmUgdW50b3VjaGVkOwp3aGF0IHN0b3BzIGlzIHRoZSBhYmlsaXR5IHRvIHJlY2VpdmUgb3IgbW92ZSB0aGVtLgAAAAAAAAZyZXZva2UAAAAAAAIAAAAAAAAACHByb3ZpZGVyAAAAEwAAAAAAAAAEdXNlcgAAABMAAAAA",
        "AAAAAAAAAIRNYXkgdGhpcyBhZGRyZXNzIGhvbGQgc2hhcmVzPyBUaGUgcXVlc3Rpb24gZXZlcnkgdG9rZW4gdHJhbnNmZXIgYXNrcywKYW5kIHRoZSBzaW5nbGUgcG9pbnQgdGhlIGhhbHQgYW5kIHRoZSBmcmVlemUgbGlzdCBhY3QgdGhyb3VnaC4AAAAHYWxsb3dlZAAAAAABAAAAAAAAAARhZGRyAAAAEwAAAAEAAAAB",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAD9UaGUgaG90IGtleSB0aGF0IG1heSBoYWx0IHRoZSBkZXBsb3ltZW50IGJ1dCBub3QgbGlmdCB0aGUgaGFsdC4AAAAACG9wZXJhdG9yAAAAAAAAAAEAAAAT",
        "AAAAAAAAAOBERU1PIFNIT1JUQ1VUIC0gdGhlIGNhbGxlciBhZG1pdHMgVEhFTVNFTFZFUywgc28gYSByZXZpZXdlciBjYW4gd2Fsawp0aGUgd2hvbGUgZmxvdyBvbiB0ZXN0bmV0IHdpdGhvdXQgdXMgcnVubmluZyBhIEtZQyB2ZW5kb3IuIFRoaXMKZW50cnlwb2ludCBkb2VzIG5vdCBleGlzdCBpbiBhIHByb2R1Y3Rpb24gZGVwbG95bWVudDsKYHJlZ2lzdGVyX3ZlcmlmaWVkYCBpcyB0aGUgcmVhbCBwYXRoLgAAAAhyZWdpc3RlcgAAAAEAAAAAAAAABHVzZXIAAAATAAAAAA==",
        "AAAAAAAAAH1MaWZ0IGEgc3VzcGVuc2lvbi4gVGhlIHVuZGVybHlpbmcgdmVyaWZpY2F0aW9uIHdhcyBuZXZlciByZW1vdmVkLCBzbwp0aGlzIGlzIGFsbCBpdCB0YWtlcyB0byBtYWtlIHRoZSBhZGRyZXNzIGVsaWdpYmxlIGFnYWluLgAAAAAAAAh1bmZyZWV6ZQAAAAIAAAAAAAAACHByb3ZpZGVyAAAAEwAAAAAAAAAEdXNlcgAAABMAAAAA",
        "AAAAAAAAAAAAAAALcGFydGljaXBhbnQAAAAAAQAAAAAAAAAEYWRkcgAAABMAAAABAAAAAQ==",
        "AAAAAAAAANFBZG1pdHRlZCBhcyBhbiBpbnZlc3RvciAoYXMgb3Bwb3NlZCB0byBwcm90b2NvbCBpbmZyYXN0cnVjdHVyZSkuClJhdyB2ZXJpZmljYXRpb24gc3RhdHVzOiB1bmxpa2UgYGFsbG93ZWRgIHRoaXMgaWdub3JlcyB0aGUgaGFsdCBhbmQgdGhlCmZyZWV6ZSBsaXN0LCBzbyBhIFVJIGNhbiB0ZWxsICJuZXZlciB2ZXJpZmllZCIgZnJvbSAidmVyaWZpZWQsIGJsb2NrZWQiLgAAAAAAAAt3aGl0ZWxpc3RlZAAAAAABAAAAAAAAAARhZGRyAAAAEwAAAAEAAAAB",
        "AAAAAAAAAAAAAAAMYWNjZXB0X2FkbWluAAAAAAAAAAA=",
        "AAAAAAAAAAAAAAAMa3ljX3Byb3ZpZGVyAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAMc2V0X29wZXJhdG9yAAAAAQAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAA==",
        "AAAAAAAAAMMqIGBhZG1pbmAgLSB0aGUgMi1vZi0zIG11bHRpc2lnIGFjY291bnQ6IG1heSByb3RhdGUgdGhlIHByb3ZpZGVyLCBhZG1pdApwcm90b2NvbCBjb250cmFjdHMsIGxpZnQgYSBoYWx0IGFuZCBuYW1lIHRoZSBvcGVyYXRvci4KKiBga3ljX3Byb3ZpZGVyYCAtIG1heSBhZG1pdCBhbmQgcmV2b2tlIGludmVzdG9ycywgYW5kIG5vdGhpbmcgZWxzZS4AAAAADV9fY29uc3RydWN0b3IAAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAADGt5Y19wcm92aWRlcgAAABMAAAAA",
        "AAAAAAAAADxUaGUgc3VjY2Vzc29yIG5hbWVkIGJ5IGB0cmFuc2Zlcl9hZG1pbmAgYW5kIHN0aWxsIHRvIGFjY2VwdC4AAAANcGVuZGluZ19hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=",
        "AAAAAAAAAAAAAAAOdHJhbnNmZXJfYWRtaW4AAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAAPdBZG1pdCBvciByZW1vdmUgYSBwcm90b2NvbCBjb250cmFjdCAtIHRoZSBzYWxlIGhvbGRpbmcgaW52ZW50b3J5LCB0aGUKZXhjaGFuZ2UgaG9sZGluZyBlc2Nyb3csIHRoZSBhZGRyZXNzIHVuc29sZCBpbnZlbnRvcnkgaXMgd2l0aGRyYXduIHRvLgpBZG1pbiBvbmx5LCBhbmQgc2VwYXJhdGUgZnJvbSB0aGUgaW52ZXN0b3IgbGlzdCBvbiBwdXJwb3NlOiB0aGUgYWRtaW4KbXVzdCBub3QgYmUgYWJsZSB0byBhZG1pdCBpbnZlc3RvcnMuAAAAAA9zZXRfcGFydGljaXBhbnQAAAAAAgAAAAAAAAAEYWRkcgAAABMAAAAAAAAAB2FsbG93ZWQAAAAAAQAAAAA=",
        "AAAAAAAAAK5Sb3RhdGUgdGhlIHByb3ZpZGVyLiBBZG1pbiBvbmx5LiBSb3RhdGlvbiBpcyB3aHkgdGhpcyBpcyBzdG9yZWQgc3RhdGUKYW5kIG5vdCBhIGNvbnN0cnVjdG9yIGNvbnN0YW50OiBjaGFuZ2luZyBLWUMgdmVuZG9yIG11c3Qgbm90IG1lYW4KcmVkZXBsb3lpbmcgYW5kIG1pZ3JhdGluZyBldmVyeSBlbnRyeS4AAAAAABBzZXRfa3ljX3Byb3ZpZGVyAAAAAQAAAAAAAAAIcHJvdmlkZXIAAAATAAAAAA==",
        "AAAAAAAAAHhBZG1pdCBhbiBpbnZlc3RvciBhZnRlciBhbiBvZmYtY2hhaW4gS1lDIGRlY2lzaW9uIChTRVAtMTIpLiBUaGUKcHJvdmlkZXIgc2lnbnM7IHRoZSBpbnZlc3RvciBkb2VzIG5vdCBoYXZlIHRvIGJlIG9ubGluZS4AAAARcmVnaXN0ZXJfdmVyaWZpZWQAAAAAAAACAAAAAAAAAAhwcm92aWRlcgAAABMAAAAAAAAABHVzZXIAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAVY2FuY2VsX3RyYW5zZmVyX2FkbWluAAAAAAAAAAAAAAA=",
        "AAAAAAAAAstBZG1pdCB1cCB0byBgTUFYX0JBVENIYCBpbnZlc3RvcnMgaW4gb25lIHRyYW5zYWN0aW9uLCBmb3IgYSBwcm92aWRlcgpjbGVhcmluZyBhIHF1ZXVlIGFmdGVyIGEgcmV2aWV3IHJ1bi4gT25lIGV2ZW50IHBlciBhZGRyZXNzLCBpZGVudGljYWwgdG8KdGhlIHNpbmdsZS1hZGRyZXNzIHBhdGgsIHNvIGFuIGluZGV4ZXIgbmVlZHMgbm8gc3BlY2lhbCBjYXNlLgoKVGhlIGJhdGNoIHNoYXJlcyBvbmUgYmFzZSBmZWUgYW5kIG9uZSBzaWduYXR1cmU7IHRoZSBwZXItYWRkcmVzcyBsZWRnZXIKd3JpdGVzIGFyZSB0aGUgc2FtZSBlaXRoZXIgd2F5LCB3aGljaCBpcyB3aHkgdGhpcyBpcyBhIHNtYWxsZXIgc2F2aW5nCnRoYW4gYmF0Y2hpbmcgb24gYW4gRVZNIGNoYWluIGFuZCB3aHkgbm90aGluZyBlbHNlIGhlcmUgaXMgYmF0Y2hlZC4KTWVhc3VyZWQgb24gdGVzdG5ldDogMC4wMjM0IFhMTSBmb3Igb25lIGFkZHJlc3MsIDAuMDIwMyBwZXIgYWRkcmVzcyBhdAphIGh1bmRyZWQgLSBhYm91dCAxMyUsIGFnYWluc3QgdGhlIG9yZGVyIG9mIG1hZ25pdHVkZSBiYXRjaGluZyBidXlzIG9uCmFuIEVWTSBjaGFpbiwgYmVjYXVzZSBoZXJlIHRoZSBsZWRnZXIgd3JpdGVzIGRvbWluYXRlIGFuZCB0aGV5IGRvIG5vdAphbW9ydGl6ZS4gQSBmdWxsIGJhdGNoIG9mIDEwMCBmaXRzIGluc2lkZSB0aGUgaG9zdCdzIHJlc291cmNlIGxpbWl0cwp3aXRoIHJvb20gdG8gc3BhcmUuAAAAABdyZWdpc3Rlcl92ZXJpZmllZF9iYXRjaAAAAAACAAAAAAAAAAhwcm92aWRlcgAAABMAAAAAAAAABXVzZXJzAAAAAAAD6gAAABMAAAAA",
        "AAAABAAAAUxDb2RlcyBhcmUgdW5pcXVlIGFjcm9zcyBldmVyeSBjb250cmFjdCBpbiB0aGlzIGRlcGxveW1lbnQgKHJlZ2lzdHJ5IDF4eCwKc2hhcmUtdG9rZW4gMnh4LCBzYWxlIDN4eCwgZXhjaGFuZ2UgNHh4LCByZXdhcmRzIDV4eCkuIEEgY3Jvc3MtY29udHJhY3QKY2FsbCBzdXJmYWNlcyB0aGUgSU5ORVIgY29udHJhY3QncyBjb2RlLCBhbmQgYSBzaGFyZWQgbnVtYmVyaW5nIGlzIHdoYXQKbGV0cyB0aGUgVUkgdHVybiB0aGF0IGNvZGUgaW50byB0aGUgcmlnaHQgc2VudGVuY2UgaW5zdGVhZCBvZiBndWVzc2luZwpmcm9tIHdoaWNoZXZlciBjb250cmFjdCBpdCBoYXBwZW5lZCB0byBjYWxsLgAAAAAAAAAFRXJyb3IAAAAAAAADAAAAPUNhbGxlZCBieSBhbiBhZGRyZXNzIHRoYXQgaXMgbm90IHRoZSByZWdpc3RlcmVkIEtZQyBwcm92aWRlci4AAAAAAAAOTm90S3ljUHJvdmlkZXIAAAAAAGUAAAA4VGhlIGFkZHJlc3MgaXMgbm90IGNsZWFyZWQgdG8gaG9sZCBzaGFyZXMgb2YgdGhpcyBhc3NldC4AAAAKTm90QWxsb3dlZAAAAAAAZgAAAC1BIGJhdGNoIHdhcyBlbXB0eSBvciBsb25nZXIgdGhhbiBgTUFYX0JBVENIYC4AAAAAAAAMSW52YWxpZEJhdGNoAAAAZw==",
        "AAAABQAAAXRFbGlnaWJpbGl0eSBzdXNwZW5kZWQgd2l0aG91dCBkZWxldGluZyB0aGUgS1lDIHJlY29yZC4gRGlzdGluY3QgZnJvbQpgUmV2b2tlZGAgb24gcHVycG9zZTogYSBmcmVlemUgaXMgYSBzdXNwZW5zaW9uIG9mIGEgdmVyaWZpZWQgaW52ZXN0b3IsCmEgcmV2b2tlIGlzIHRoZSB3aXRoZHJhd2FsIG9mIHRoZSB2ZXJpZmljYXRpb24gaXRzZWxmLiBSZS1hZG1pdHRpbmcgYWZ0ZXIKYSBmcmVlemUgaXMgYW4gdW5mcmVlemUsIG5vdCBhIHNlY29uZCByZWdpc3RyYXRpb24sIGFuZCB0aGUgZXZlbnQgbG9nIGhhcwp0byBrZWVwIHRoZSB0d28gYXBhcnQgZm9yIGFuIGF1ZGl0b3IgdG8gcmVjb25zdHJ1Y3Qgd2h5IGFuIGFkZHJlc3Mgd2FzCmV2ZXIgYmxvY2tlZC4AAAAAAAAABkZyb3plbgAAAAAAAQAAAAZmcm96ZW4AAAAAAAIAAAAAAAAABHVzZXIAAAATAAAAAQAAAAAAAAAIcHJvdmlkZXIAAAATAAAAAAAAAAA=",
        "AAAABQAAAHhFbGlnaWJpbGl0eSB3aXRoZHJhd24uIFRoZSBob2xkZXIga2VlcHMgd2hhdGV2ZXIgc2hhcmVzIHRoZXkgYWxyZWFkeSBoYXZlCmFuZCBsb3NlcyB0aGUgYWJpbGl0eSB0byBtb3ZlIG9yIHJlY2VpdmUgbW9yZS4AAAAAAAAAB1Jldm9rZWQAAAAAAQAAAAdyZXZva2VkAAAAAAIAAAAAAAAABHVzZXIAAAATAAAAAQAAAAAAAAAIcHJvdmlkZXIAAAATAAAAAAAAAAA=",
        "AAAABQAAAENBIHN1c3BlbnNpb24gbGlmdGVkLiBUaGUgdW5kZXJseWluZyB2ZXJpZmljYXRpb24gd2FzIG5ldmVyIHJlbW92ZWQuAAAAAAAAAAAIVW5mcm96ZW4AAAABAAAACHVuZnJvemVuAAAAAgAAAAAAAAAEdXNlcgAAABMAAAABAAAAAAAAAAhwcm92aWRlcgAAABMAAAAAAAAAAA==",
        "AAAABQAAADZUaGUgYWRkcmVzcyBzZWxmLXJlZ2lzdGVyZWQgdGhyb3VnaCB0aGUgZGVtbyBzaG9ydGN1dC4AAAAAAAAAAAAKUmVnaXN0ZXJlZAAAAAAAAQAAAApyZWdpc3RlcmVkAAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAA",
        "AAAABQAAADhUaGUgZGVwbG95bWVudC13aWRlIGhhbHQgd2FzIHNldCBvciBsaWZ0ZWQgYnkgdGhlIGFkbWluLgAAAAAAAAAMUGF1c2VDaGFuZ2VkAAAAAQAAAA1wYXVzZV9jaGFuZ2VkAAAAAAAAAQAAAAAAAAAGcGF1c2VkAAAAAAABAAAAAAAAAAA=",
        "AAAABQAAADlBIHByb3RvY29sIGNvbnRyYWN0IHdhcyBhZG1pdHRlZCBvciByZW1vdmVkIGJ5IHRoZSBhZG1pbi4AAAAAAAAAAAAADlBhcnRpY2lwYW50U2V0AAAAAAABAAAAD3BhcnRpY2lwYW50X3NldAAAAAACAAAAAAAAAARhZGRyAAAAEwAAAAEAAAAAAAAAB2FsbG93ZWQAAAAAAQAAAAAAAAAA",
        "AAAABQAAAAAAAAAAAAAAEkt5Y1Byb3ZpZGVyQ2hhbmdlZAAAAAAAAQAAABRreWNfcHJvdmlkZXJfY2hhbmdlZAAAAAIAAAAAAAAAA29sZAAAAAATAAAAAAAAAAAAAAADbmV3AAAAABMAAAAAAAAAAQ==",
        "AAAABQAAAMtUaGUgS1lDIHByb3ZpZGVyIGFkbWl0dGVkIGFuIGludmVzdG9yIGFmdGVyIGFuIG9mZi1jaGFpbiBjaGVjay4gRGlzdGluY3QKZnJvbSBgUmVnaXN0ZXJlZGAgb24gcHVycG9zZTogdGhlc2UgdHdvIGFyZSBub3QgaW50ZXJjaGFuZ2VhYmxlIGluIGFuCmF1ZGl0LCBhbmQgdGhlIHNlbGYtc2VydmUgcGF0aCBkb2VzIG5vdCBleGlzdCBpbiBwcm9kdWN0aW9uLgAAAAAAAAAAFFJlZ2lzdGVyZWRCeVByb3ZpZGVyAAAAAQAAABZyZWdpc3RlcmVkX2J5X3Byb3ZpZGVyAAAAAAACAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAAAAAACHByb3ZpZGVyAAAAEwAAAAAAAAAA",
        "AAAABQAAAItUaGUgY29udHJhY3QgaXMgbm93IHJ1bm5pbmcgZGlmZmVyZW50IGNvZGUuIFRoZSBoYXNoIGlzIHRoZSBvbmUgYW4KZXhwbG9yZXIgc2hvd3MgYWdhaW5zdCB0aGUgY29udHJhY3QsIHNvIHRoaXMgZXZlbnQgYW5kIHRoZSBsZWRnZXIgYWdyZWUuAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAA==",
        "AAAABAAAAYtOYW1lZCBhcGFydCBmcm9tIGVhY2ggY29udHJhY3QncyBvd24gYEVycm9yYCBzbyB0aGUgdHdvIG5ldmVyIGNvbGxpZGUgaW4KdGhlIGNvbnRyYWN0IHNwZWMgdGhlIGJpbmRpbmdzIGFyZSBnZW5lcmF0ZWQgZnJvbS4KCjl4eCBpcyByZXNlcnZlZCBmb3IgZ292ZXJuYW5jZSBpbiBldmVyeSBjb250cmFjdCBvZiB0aGlzIGRlcGxveW1lbnQKKHJlZ2lzdHJ5IDF4eCwgc2hhcmUtdG9rZW4gMnh4LCBzYWxlIDN4eCwgZXhjaGFuZ2UgNHh4LCByZXdhcmRzIDV4eCksIHNvIGEKY29kZSBhcnJpdmluZyBmcm9tIGEgY3Jvc3MtY29udHJhY3QgY2FsbCBzdGlsbCBzYXlzIHdoYXQgaGFwcGVuZWQgd2l0aG91dAp0aGUgY2FsbGVyIGhhdmluZyB0byBrbm93IHdoaWNoIGNvbnRyYWN0IHByb2R1Y2VkIGl0LgAAAAAAAAAAC0FjY2Vzc0Vycm9yAAAAAAIAAAA5VGhlIGNhbGxlciBob2xkcyBuZWl0aGVyIHRoZSBhZG1pbiBub3IgdGhlIG9wZXJhdG9yIHJvbGUuAAAAAAAADU5vdEF1dGhvcml6ZWQAAAAAAAOFAAAAN2BhY2NlcHRfYWRtaW5gIHdhcyBjYWxsZWQgd2l0aCBubyBoYW5kb3ZlciBpbiBwcm9ncmVzcy4AAAAAEU5vSGFuZG92ZXJQZW5kaW5nAAAAAAADhg==",
        "AAAABQAAAAAAAAAAAAAAD09wZXJhdG9yQ2hhbmdlZAAAAAABAAAAEG9wZXJhdG9yX2NoYW5nZWQAAAACAAAAAAAAAARmcm9tAAAAEwAAAAEAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAA=",
        "AAAABQAAAAAAAAAAAAAAEEFkbWluVHJhbnNmZXJyZWQAAAABAAAAEWFkbWluX3RyYW5zZmVycmVkAAAAAAAAAgAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAAAAAAA",
        "AAAABQAAAERBIHN1Y2Nlc3NvciB3YXMgbmFtZWQuIE5vdCB5ZXQgaW4gZm9yY2U6IG9ubHkgYEFkbWluVHJhbnNmZXJyZWRgIGlzLgAAAAAAAAAUQWRtaW5UcmFuc2ZlclN0YXJ0ZWQAAAABAAAAFmFkbWluX3RyYW5zZmVyX3N0YXJ0ZWQAAAAAAAIAAAAAAAAABGZyb20AAAATAAAAAQAAAAAAAAACdG8AAAAAABMAAAAAAAAAAA==",
        "AAAABQAAAKdUaGUgb2ZmZXIgd2FzIHdpdGhkcmF3bi4gUHVibGlzaGVkIGJlY2F1c2UgdGhlIGFsdGVybmF0aXZlIGlzIGEgbG9nIHdoZXJlIGEKaGFuZG92ZXIgc3RhcnRzIGFuZCBub3RoaW5nIGV2ZXIgc2F5cyBpdCBzdG9wcGVkLCB3aGljaCByZWFkcyBhcyBvbmUgc3RpbGwKcGVuZGluZyBmb3JldmVyLgAAAAAAAAAAFkFkbWluVHJhbnNmZXJDYW5jZWxsZWQAAAAAAAEAAAAYYWRtaW5fdHJhbnNmZXJfY2FuY2VsbGVkAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJY2FuY2VsbGVkAAAAAAAAEwAAAAAAAAAA" ]),
      options
    )
  }
  public readonly fromJSON = {
    admin: this.txFromJSON<string>,
        pause: this.txFromJSON<null>,
        freeze: this.txFromJSON<null>,
        frozen: this.txFromJSON<boolean>,
        paused: this.txFromJSON<boolean>,
        resume: this.txFromJSON<null>,
        revoke: this.txFromJSON<null>,
        allowed: this.txFromJSON<boolean>,
        upgrade: this.txFromJSON<null>,
        operator: this.txFromJSON<string>,
        register: this.txFromJSON<null>,
        unfreeze: this.txFromJSON<null>,
        participant: this.txFromJSON<boolean>,
        whitelisted: this.txFromJSON<boolean>,
        accept_admin: this.txFromJSON<null>,
        kyc_provider: this.txFromJSON<string>,
        set_operator: this.txFromJSON<null>,
        pending_admin: this.txFromJSON<Option<string>>,
        transfer_admin: this.txFromJSON<null>,
        set_participant: this.txFromJSON<null>,
        set_kyc_provider: this.txFromJSON<null>,
        register_verified: this.txFromJSON<null>,
        cancel_transfer_admin: this.txFromJSON<null>,
        register_verified_batch: this.txFromJSON<null>
  }
}