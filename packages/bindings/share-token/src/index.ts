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






/**
 * Codes are unique across every contract in this deployment (registry 1xx,
 * share-token 2xx, sale 3xx, exchange 4xx, rewards 5xx). A cross-contract
 * call surfaces the INNER contract's code, and a shared numbering is what
 * lets the UI turn that code into the right sentence instead of guessing
 * from whichever contract it happened to call.
 */
export const Errors = {
  201: {message:"NegativeAmount"},
  202: {message:"InsufficientBalance"},
  203: {message:"InsufficientAllowance"},
  204: {message:"InvalidExpirationLedger"},
  /**
   * One side of the transfer is not cleared to hold shares.
   */
  205: {message:"NotAllowed"},
  /**
   * A balance or the total supply would exceed i128. Unreachable at any
   * real supply, checked because release-mode Rust wraps instead of
   * trapping.
   */
  206: {message:"Overflow"},
  /**
   * The mint would push the total supply past the cap fixed at deployment.
   */
  207: {message:"SupplyCapExceeded"},
  /**
   * `max_supply` must be a positive number of shares.
   */
  208: {message:"InvalidSupplyCap"},
  /**
   * The issuance already happened. There is no second one.
   */
  209: {message:"AlreadyIssued"},
  /**
   * `set_terms` was given an empty document hash, jurisdiction or URI.
   */
  210: {message:"IncompleteTerms"}
}


/**
 * The legal wrapper these shares represent an interest in.
 * 
 * A tokenized building is two things that have to stay tied together: an
 * entry in this contract's balance map, and a share of the company that holds
 * title to the property. Nothing on-chain can enforce the second half, but a
 * token that does not even *name* it leaves a holder with no way to find out
 * what they own. So the pointer and the hash live on-chain, and the documents
 * they point at live wherever the issuer publishes them.
 * 
 * `doc_hash` is what makes it more than a link: a subscription agreement
 * quietly rewritten after investors signed no longer hashes to the value the
 * ledger recorded, and anyone can check that without asking the issuer.
 */
export interface Terms {
  /**
 * sha256 of that bundle.
 */
doc_hash: Buffer;
  /**
 * False while the asset is a demonstration rather than a property. This
 * is a field rather than a README line because a wallet reading the
 * contract has to be able to tell.
 */
is_real_asset: boolean;
  /**
 * The entity holding title - normally a per-asset SPV.
 */
issuer: string;
  /**
 * Law the SPV and the offering are governed by.
 */
jurisdiction: string;
  /**
 * Where the signed document bundle is published (IPFS CID or https URL).
 */
uri: string;
}

export type DataKey = {tag: "Name", values: void} | {tag: "Symbol", values: void} | {tag: "TotalSupply", values: void} | {tag: "MaxSupply", values: void} | {tag: "Issued", values: void} | {tag: "Treasury", values: void} | {tag: "Registry", values: void} | {tag: "Terms", values: void} | {tag: "Balance", values: readonly [string]} | {tag: "Allowance", values: readonly [string, string]};






export interface AllowanceValue {
  amount: i128;
  expiration_ledger: u32;
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
   * Construct and simulate a burn transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  burn: ({from, amount}: {from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a mint transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Issue the asset's shares. Admin only, and callable **once** - a second
   * call fails whatever the amount, so the amount has to be positive: a
   * `mint(to, 0)` would otherwise spend the single issuance on nothing and
   * leave the asset permanently unable to have any shares at all.
   * 
   * A tokenized building is issued, not printed on demand: the share count
   * is a property of the asset and of the legal wrapper behind it, so the
   * contract enforces it rather than trusting an operator to stop. That is
   * also what makes `total_shares` in rewards-distributor an invariant
   * instead of an agreement - the supply it divides income by is fixed
   * before the first investor arrives and cannot be diluted afterwards.
   * 
   * Issuing less than `max_supply` is allowed and safe: the distributor
   * still divides by the cap, so the unissued fraction of every round
   * simply stays in the pool. It is never over-promised.
   * 
   * `to` is normally the treasury, which then funds the sale contract with
   * whatever tranche is actually being offered. It is a parameter rather
   * than the
   */
  mint: ({to, amount}: {to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a name transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  name: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a terms transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The legal wrapper, if the issuer has published one. `None` is a real
   * answer and a wallet should show it as one: shares with no terms behind
   * them are shares of nothing.
   */
  terms: (options?: MethodOptions) => Promise<AssembledTransaction<Option<Terms>>>

  /**
   * Construct and simulate a issued transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Has the one-time issuance already happened?
   */
  issued: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a symbol transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  symbol: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a approve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  approve: ({from, spender, amount, live_until_ledger}: {from: string, spender: string, amount: i128, live_until_ledger: u32}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  balance: ({id}: {id: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a decimals transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Shares are indivisible: decimals = 0.
   */
  decimals: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Stored for symmetry with the other four contracts and unused here: this
   * token has no entrypoint a hot key may call. Issuing and confiscating
   * shares are exactly the decisions that must cost two signatures.
   */
  operator: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a registry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The compliance registry every movement of shares is checked against.
   */
  registry: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * `to` is a MuxedAddress (CAP-67): wallets/exchanges may attach a mux id
   * to one Stellar account. Balances are tracked per underlying Address.
   */
  transfer: ({from, to, amount}: {from: string, to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a treasury transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Custody address: where the issuance went and the only place a forced
   * revocation can send shares.
   */
  treasury: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a allowance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  allowance: ({from, spender}: {from: string, spender: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a burn_from transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  burn_from: ({spender, from, amount}: {spender: string, from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_terms transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Publish the legal wrapper behind the shares, or replace it when the
   * documents are re-executed. Admin only.
   * 
   * Replacing rather than appending is the honest shape for a PoC, and it
   * is also the reason every version is announced in an event: the current
   * value says what is in force, and the log says what was in force when
   * any given investor bought. A production issuer keeps the superseded
   * bundles published at their own URIs so both remain retrievable.
   */
  set_terms: ({terms}: {terms: Terms}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a max_supply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Ceiling on `total_supply`, fixed at deployment and with no setter.
   */
  max_supply: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_operator: ({operator}: {operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a total_supply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_supply: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a revoke_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Move `amount` shares from `from` to the treasury without the holder's
   * signature. Admin only.
   * 
   * A security token needs this and a payment token does not: a court order,
   * a probate transfer, a sanctions confiscation, or a holder whose keys are
   * gone are all cases where the register of ownership has to change and the
   * holder cannot or will not sign. Our Polygon contracts carry the same
   * entrypoint. Three things bound it:
   * 
   * * the destination is the treasury fixed at deployment, so this cannot be
   * used to move shares to an address of the admin's choosing;
   * * it publishes `SharesRevoked` next to the standard `Transfer`, so a
   * confiscation can never be mistaken for a trade in the log;
   * * it is the only path in this contract that skips the registry check on
   * purpose - the address being confiscated from is usually the one that
   * was frozen or revoked, and requiring it to be eligible would make the
   * entrypoint useless in exactly the case it exists for.
   * 
   * It is deliberately not blocked by the deployment-wide pause: an incident
   * is when
   */
  revoke_shares: ({from, amount}: {from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a transfer_from transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  transfer_from: ({spender, from, to, amount}: {spender: string, from: string, to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  transfer_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a cancel_transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel_transfer_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, name, symbol, registry, treasury, max_supply}: {admin: string, name: string, symbol: string, registry: string, treasury: string, max_supply: i128},
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
    return ContractClient.deploy({admin, name, symbol, registry, treasury, max_supply}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABQAAAAAAAAAAAAAABEJ1cm4AAAABAAAABGJ1cm4AAAACAAAAAAAAAARmcm9tAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAA",
        "AAAABQAAAAAAAAAAAAAABE1pbnQAAAABAAAABG1pbnQAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAA",
        "AAAABAAAAUxDb2RlcyBhcmUgdW5pcXVlIGFjcm9zcyBldmVyeSBjb250cmFjdCBpbiB0aGlzIGRlcGxveW1lbnQgKHJlZ2lzdHJ5IDF4eCwKc2hhcmUtdG9rZW4gMnh4LCBzYWxlIDN4eCwgZXhjaGFuZ2UgNHh4LCByZXdhcmRzIDV4eCkuIEEgY3Jvc3MtY29udHJhY3QKY2FsbCBzdXJmYWNlcyB0aGUgSU5ORVIgY29udHJhY3QncyBjb2RlLCBhbmQgYSBzaGFyZWQgbnVtYmVyaW5nIGlzIHdoYXQKbGV0cyB0aGUgVUkgdHVybiB0aGF0IGNvZGUgaW50byB0aGUgcmlnaHQgc2VudGVuY2UgaW5zdGVhZCBvZiBndWVzc2luZwpmcm9tIHdoaWNoZXZlciBjb250cmFjdCBpdCBoYXBwZW5lZCB0byBjYWxsLgAAAAAAAAAFRXJyb3IAAAAAAAAKAAAAAAAAAA5OZWdhdGl2ZUFtb3VudAAAAAAAyQAAAAAAAAATSW5zdWZmaWNpZW50QmFsYW5jZQAAAADKAAAAAAAAABVJbnN1ZmZpY2llbnRBbGxvd2FuY2UAAAAAAADLAAAAAAAAABdJbnZhbGlkRXhwaXJhdGlvbkxlZGdlcgAAAADMAAAAN09uZSBzaWRlIG9mIHRoZSB0cmFuc2ZlciBpcyBub3QgY2xlYXJlZCB0byBob2xkIHNoYXJlcy4AAAAACk5vdEFsbG93ZWQAAAAAAM0AAACNQSBiYWxhbmNlIG9yIHRoZSB0b3RhbCBzdXBwbHkgd291bGQgZXhjZWVkIGkxMjguIFVucmVhY2hhYmxlIGF0IGFueQpyZWFsIHN1cHBseSwgY2hlY2tlZCBiZWNhdXNlIHJlbGVhc2UtbW9kZSBSdXN0IHdyYXBzIGluc3RlYWQgb2YKdHJhcHBpbmcuAAAAAAAACE92ZXJmbG93AAAAzgAAAEZUaGUgbWludCB3b3VsZCBwdXNoIHRoZSB0b3RhbCBzdXBwbHkgcGFzdCB0aGUgY2FwIGZpeGVkIGF0IGRlcGxveW1lbnQuAAAAAAARU3VwcGx5Q2FwRXhjZWVkZWQAAAAAAADPAAAAMWBtYXhfc3VwcGx5YCBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyIG9mIHNoYXJlcy4AAAAAAAAQSW52YWxpZFN1cHBseUNhcAAAANAAAAA2VGhlIGlzc3VhbmNlIGFscmVhZHkgaGFwcGVuZWQuIFRoZXJlIGlzIG5vIHNlY29uZCBvbmUuAAAAAAANQWxyZWFkeUlzc3VlZAAAAAAAANEAAABCYHNldF90ZXJtc2Agd2FzIGdpdmVuIGFuIGVtcHR5IGRvY3VtZW50IGhhc2gsIGp1cmlzZGljdGlvbiBvciBVUkkuAAAAAAAPSW5jb21wbGV0ZVRlcm1zAAAAANI=",
        "AAAAAQAAAr5UaGUgbGVnYWwgd3JhcHBlciB0aGVzZSBzaGFyZXMgcmVwcmVzZW50IGFuIGludGVyZXN0IGluLgoKQSB0b2tlbml6ZWQgYnVpbGRpbmcgaXMgdHdvIHRoaW5ncyB0aGF0IGhhdmUgdG8gc3RheSB0aWVkIHRvZ2V0aGVyOiBhbgplbnRyeSBpbiB0aGlzIGNvbnRyYWN0J3MgYmFsYW5jZSBtYXAsIGFuZCBhIHNoYXJlIG9mIHRoZSBjb21wYW55IHRoYXQgaG9sZHMKdGl0bGUgdG8gdGhlIHByb3BlcnR5LiBOb3RoaW5nIG9uLWNoYWluIGNhbiBlbmZvcmNlIHRoZSBzZWNvbmQgaGFsZiwgYnV0IGEKdG9rZW4gdGhhdCBkb2VzIG5vdCBldmVuICpuYW1lKiBpdCBsZWF2ZXMgYSBob2xkZXIgd2l0aCBubyB3YXkgdG8gZmluZCBvdXQKd2hhdCB0aGV5IG93bi4gU28gdGhlIHBvaW50ZXIgYW5kIHRoZSBoYXNoIGxpdmUgb24tY2hhaW4sIGFuZCB0aGUgZG9jdW1lbnRzCnRoZXkgcG9pbnQgYXQgbGl2ZSB3aGVyZXZlciB0aGUgaXNzdWVyIHB1Ymxpc2hlcyB0aGVtLgoKYGRvY19oYXNoYCBpcyB3aGF0IG1ha2VzIGl0IG1vcmUgdGhhbiBhIGxpbms6IGEgc3Vic2NyaXB0aW9uIGFncmVlbWVudApxdWlldGx5IHJld3JpdHRlbiBhZnRlciBpbnZlc3RvcnMgc2lnbmVkIG5vIGxvbmdlciBoYXNoZXMgdG8gdGhlIHZhbHVlIHRoZQpsZWRnZXIgcmVjb3JkZWQsIGFuZCBhbnlvbmUgY2FuIGNoZWNrIHRoYXQgd2l0aG91dCBhc2tpbmcgdGhlIGlzc3Vlci4AAAAAAAAAAAAFVGVybXMAAAAAAAAFAAAAFnNoYTI1NiBvZiB0aGF0IGJ1bmRsZS4AAAAAAAhkb2NfaGFzaAAAA+4AAAAgAAAAqEZhbHNlIHdoaWxlIHRoZSBhc3NldCBpcyBhIGRlbW9uc3RyYXRpb24gcmF0aGVyIHRoYW4gYSBwcm9wZXJ0eS4gVGhpcwppcyBhIGZpZWxkIHJhdGhlciB0aGFuIGEgUkVBRE1FIGxpbmUgYmVjYXVzZSBhIHdhbGxldCByZWFkaW5nIHRoZQpjb250cmFjdCBoYXMgdG8gYmUgYWJsZSB0byB0ZWxsLgAAAA1pc19yZWFsX2Fzc2V0AAAAAAAAAQAAADRUaGUgZW50aXR5IGhvbGRpbmcgdGl0bGUgLSBub3JtYWxseSBhIHBlci1hc3NldCBTUFYuAAAABmlzc3VlcgAAAAAAEAAAAC1MYXcgdGhlIFNQViBhbmQgdGhlIG9mZmVyaW5nIGFyZSBnb3Zlcm5lZCBieS4AAAAAAAAManVyaXNkaWN0aW9uAAAAEAAAAEZXaGVyZSB0aGUgc2lnbmVkIGRvY3VtZW50IGJ1bmRsZSBpcyBwdWJsaXNoZWQgKElQRlMgQ0lEIG9yIGh0dHBzIFVSTCkuAAAAAAADdXJpAAAAABA=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACgAAAAAAAAAAAAAABE5hbWUAAAAAAAAAAAAAAAZTeW1ib2wAAAAAAAAAAAAAAAAAC1RvdGFsU3VwcGx5AAAAAAAAAAAxSGFyZCBjZWlsaW5nIG9uIFRvdGFsU3VwcGx5LCBmaXhlZCBhdCBkZXBsb3ltZW50LgAAAAAAAAlNYXhTdXBwbHkAAAAAAAAAAAAAH1NldCBieSB0aGUgb25lIGFuZCBvbmx5IGBtaW50YC4AAAAABklzc3VlZAAAAAAAAAAAAH1DdXN0b2R5IGFkZHJlc3M6IHJlY2VpdmVzIHRoZSBpc3N1YW5jZSwgYW5kIHRoZSBvbmx5IGRlc3RpbmF0aW9uIGEKZm9yY2VkIHJldm9jYXRpb24gY2FuIHNlbmQgc2hhcmVzIHRvLiBGaXhlZCBhdCBkZXBsb3ltZW50LgAAAAAAAAhUcmVhc3VyeQAAAAAAAAA6Q29tcGxpYW5jZSByZWdpc3RyeSBjb25zdWx0ZWQgb24gZXZlcnkgbW92ZW1lbnQgb2Ygc2hhcmVzLgAAAAAACFJlZ2lzdHJ5AAAAAAAAAEhUaGUgbGVnYWwgd3JhcHBlciBiZWhpbmQgdGhlIGFzc2V0LiBVbnNldCB1bnRpbCB0aGUgaXNzdWVyIHB1Ymxpc2hlcyBpdC4AAAAFVGVybXMAAAAAAAABAAAAAAAAAAdCYWxhbmNlAAAAAAEAAAATAAAAAQAAAAAAAAAJQWxsb3dhbmNlAAAAAAAAAgAAABMAAAAT",
        "AAAABQAAAAAAAAAAAAAAB0FwcHJvdmUAAAAAAQAAAAdhcHByb3ZlAAAAAAQAAAAAAAAABGZyb20AAAATAAAAAQAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAARbGl2ZV91bnRpbF9sZWRnZXIAAAAAAAAEAAAAAAAAAAE=",
        "AAAABQAAAMxUaGUgaXNzdWVyIHB1Ymxpc2hlZCBvciByZXBsYWNlZCB0aGUgbGVnYWwgdGVybXMuIFRoZSBoYXNoIGlzIGluIHRoZSBsb2cgc28KYSBob2xkZXIgY2FuIHByb3ZlIHdoaWNoIHZlcnNpb24gb2YgdGhlIGRvY3VtZW50cyB3YXMgaW4gZm9yY2Ugd2hlbiB0aGV5CmJvdWdodCwgd2l0aG91dCB0cnVzdGluZyB3aGF0ZXZlciB0aGUgVVJJIHNlcnZlcyB0b2RheS4AAAAAAAAACFRlcm1zU2V0AAAAAQAAAAl0ZXJtc19zZXQAAAAAAAACAAAAAAAAAAhkb2NfaGFzaAAAA+4AAAAgAAAAAQAAAAAAAAADdXJpAAAAABAAAAAAAAAAAA==",
        "AAAABQAAAAAAAAAAAAAACFRyYW5zZmVyAAAAAQAAAAh0cmFuc2ZlcgAAAAMAAAAAAAAABGZyb20AAAATAAAAAQAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAA==",
        "AAAABQAAANZTaGFyZXMgdGFrZW4gZnJvbSBhIGhvbGRlciB3aXRob3V0IHRoZWlyIHNpZ25hdHVyZSBhbmQgcmV0dXJuZWQgdG8KY3VzdG9keS4gUHVibGlzaGVkIGFsb25nc2lkZSB0aGUgc3RhbmRhcmQgYFRyYW5zZmVyYCBzbyBhIFNFUC00MSBpbmRleGVyCnN0YXlzIGNvcnJlY3Qgd2hpbGUgYW4gYXVkaXRvciBjYW4gc3RpbGwgdGVsbCBhIGNvbmZpc2NhdGlvbiBmcm9tIGEgdHJhZGUuAAAAAAAAAAAADVNoYXJlc1Jldm9rZWQAAAAAAAABAAAADnNoYXJlc19yZXZva2VkAAAAAAACAAAAAAAAAARmcm9tAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAA",
        "AAAAAQAAAAAAAAAAAAAADkFsbG93YW5jZVZhbHVlAAAAAAACAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAEWV4cGlyYXRpb25fbGVkZ2VyAAAAAAAABA==",
        "AAAAAAAAAAAAAAAEYnVybgAAAAIAAAAAAAAABGZyb20AAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAABABJc3N1ZSB0aGUgYXNzZXQncyBzaGFyZXMuIEFkbWluIG9ubHksIGFuZCBjYWxsYWJsZSAqKm9uY2UqKiAtIGEgc2Vjb25kCmNhbGwgZmFpbHMgd2hhdGV2ZXIgdGhlIGFtb3VudCwgc28gdGhlIGFtb3VudCBoYXMgdG8gYmUgcG9zaXRpdmU6IGEKYG1pbnQodG8sIDApYCB3b3VsZCBvdGhlcndpc2Ugc3BlbmQgdGhlIHNpbmdsZSBpc3N1YW5jZSBvbiBub3RoaW5nIGFuZApsZWF2ZSB0aGUgYXNzZXQgcGVybWFuZW50bHkgdW5hYmxlIHRvIGhhdmUgYW55IHNoYXJlcyBhdCBhbGwuCgpBIHRva2VuaXplZCBidWlsZGluZyBpcyBpc3N1ZWQsIG5vdCBwcmludGVkIG9uIGRlbWFuZDogdGhlIHNoYXJlIGNvdW50CmlzIGEgcHJvcGVydHkgb2YgdGhlIGFzc2V0IGFuZCBvZiB0aGUgbGVnYWwgd3JhcHBlciBiZWhpbmQgaXQsIHNvIHRoZQpjb250cmFjdCBlbmZvcmNlcyBpdCByYXRoZXIgdGhhbiB0cnVzdGluZyBhbiBvcGVyYXRvciB0byBzdG9wLiBUaGF0IGlzCmFsc28gd2hhdCBtYWtlcyBgdG90YWxfc2hhcmVzYCBpbiByZXdhcmRzLWRpc3RyaWJ1dG9yIGFuIGludmFyaWFudAppbnN0ZWFkIG9mIGFuIGFncmVlbWVudCAtIHRoZSBzdXBwbHkgaXQgZGl2aWRlcyBpbmNvbWUgYnkgaXMgZml4ZWQKYmVmb3JlIHRoZSBmaXJzdCBpbnZlc3RvciBhcnJpdmVzIGFuZCBjYW5ub3QgYmUgZGlsdXRlZCBhZnRlcndhcmRzLgoKSXNzdWluZyBsZXNzIHRoYW4gYG1heF9zdXBwbHlgIGlzIGFsbG93ZWQgYW5kIHNhZmU6IHRoZSBkaXN0cmlidXRvcgpzdGlsbCBkaXZpZGVzIGJ5IHRoZSBjYXAsIHNvIHRoZSB1bmlzc3VlZCBmcmFjdGlvbiBvZiBldmVyeSByb3VuZApzaW1wbHkgc3RheXMgaW4gdGhlIHBvb2wuIEl0IGlzIG5ldmVyIG92ZXItcHJvbWlzZWQuCgpgdG9gIGlzIG5vcm1hbGx5IHRoZSB0cmVhc3VyeSwgd2hpY2ggdGhlbiBmdW5kcyB0aGUgc2FsZSBjb250cmFjdCB3aXRoCndoYXRldmVyIHRyYW5jaGUgaXMgYWN0dWFsbHkgYmVpbmcgb2ZmZXJlZC4gSXQgaXMgYSBwYXJhbWV0ZXIgcmF0aGVyCnRoYW4gdGhlAAAABG1pbnQAAAACAAAAAAAAAAJ0bwAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
        "AAAAAAAAAAAAAAAEbmFtZQAAAAAAAAABAAAAEA==",
        "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAKdUaGUgbGVnYWwgd3JhcHBlciwgaWYgdGhlIGlzc3VlciBoYXMgcHVibGlzaGVkIG9uZS4gYE5vbmVgIGlzIGEgcmVhbAphbnN3ZXIgYW5kIGEgd2FsbGV0IHNob3VsZCBzaG93IGl0IGFzIG9uZTogc2hhcmVzIHdpdGggbm8gdGVybXMgYmVoaW5kCnRoZW0gYXJlIHNoYXJlcyBvZiBub3RoaW5nLgAAAAAFdGVybXMAAAAAAAAAAAAAAQAAA+gAAAfQAAAABVRlcm1zAAAA",
        "AAAAAAAAACtIYXMgdGhlIG9uZS10aW1lIGlzc3VhbmNlIGFscmVhZHkgaGFwcGVuZWQ/AAAAAAZpc3N1ZWQAAAAAAAAAAAABAAAAAQ==",
        "AAAAAAAAAAAAAAAGc3ltYm9sAAAAAAAAAAAAAQAAABA=",
        "AAAAAAAAAAAAAAAHYXBwcm92ZQAAAAAEAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAEWxpdmVfdW50aWxfbGVkZ2VyAAAAAAAABAAAAAA=",
        "AAAAAAAAAAAAAAAHYmFsYW5jZQAAAAABAAAAAAAAAAJpZAAAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAACVTaGFyZXMgYXJlIGluZGl2aXNpYmxlOiBkZWNpbWFscyA9IDAuAAAAAAAACGRlY2ltYWxzAAAAAAAAAAEAAAAE",
        "AAAAAAAAAMxTdG9yZWQgZm9yIHN5bW1ldHJ5IHdpdGggdGhlIG90aGVyIGZvdXIgY29udHJhY3RzIGFuZCB1bnVzZWQgaGVyZTogdGhpcwp0b2tlbiBoYXMgbm8gZW50cnlwb2ludCBhIGhvdCBrZXkgbWF5IGNhbGwuIElzc3VpbmcgYW5kIGNvbmZpc2NhdGluZwpzaGFyZXMgYXJlIGV4YWN0bHkgdGhlIGRlY2lzaW9ucyB0aGF0IG11c3QgY29zdCB0d28gc2lnbmF0dXJlcy4AAAAIb3BlcmF0b3IAAAAAAAAAAQAAABM=",
        "AAAAAAAAAERUaGUgY29tcGxpYW5jZSByZWdpc3RyeSBldmVyeSBtb3ZlbWVudCBvZiBzaGFyZXMgaXMgY2hlY2tlZCBhZ2FpbnN0LgAAAAhyZWdpc3RyeQAAAAAAAAABAAAAEw==",
        "AAAAAAAAAItgdG9gIGlzIGEgTXV4ZWRBZGRyZXNzIChDQVAtNjcpOiB3YWxsZXRzL2V4Y2hhbmdlcyBtYXkgYXR0YWNoIGEgbXV4IGlkCnRvIG9uZSBTdGVsbGFyIGFjY291bnQuIEJhbGFuY2VzIGFyZSB0cmFja2VkIHBlciB1bmRlcmx5aW5nIEFkZHJlc3MuAAAAAAh0cmFuc2ZlcgAAAAMAAAAAAAAABGZyb20AAAATAAAAAAAAAAJ0bwAAAAAAFAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
        "AAAAAAAAAGBDdXN0b2R5IGFkZHJlc3M6IHdoZXJlIHRoZSBpc3N1YW5jZSB3ZW50IGFuZCB0aGUgb25seSBwbGFjZSBhIGZvcmNlZApyZXZvY2F0aW9uIGNhbiBzZW5kIHNoYXJlcy4AAAAIdHJlYXN1cnkAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAJYWxsb3dhbmNlAAAAAAAAAgAAAAAAAAAEZnJvbQAAABMAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAEAAAAL",
        "AAAAAAAAAAAAAAAJYnVybl9mcm9tAAAAAAAAAwAAAAAAAAAHc3BlbmRlcgAAAAATAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
        "AAAAAAAAAcFQdWJsaXNoIHRoZSBsZWdhbCB3cmFwcGVyIGJlaGluZCB0aGUgc2hhcmVzLCBvciByZXBsYWNlIGl0IHdoZW4gdGhlCmRvY3VtZW50cyBhcmUgcmUtZXhlY3V0ZWQuIEFkbWluIG9ubHkuCgpSZXBsYWNpbmcgcmF0aGVyIHRoYW4gYXBwZW5kaW5nIGlzIHRoZSBob25lc3Qgc2hhcGUgZm9yIGEgUG9DLCBhbmQgaXQKaXMgYWxzbyB0aGUgcmVhc29uIGV2ZXJ5IHZlcnNpb24gaXMgYW5ub3VuY2VkIGluIGFuIGV2ZW50OiB0aGUgY3VycmVudAp2YWx1ZSBzYXlzIHdoYXQgaXMgaW4gZm9yY2UsIGFuZCB0aGUgbG9nIHNheXMgd2hhdCB3YXMgaW4gZm9yY2Ugd2hlbgphbnkgZ2l2ZW4gaW52ZXN0b3IgYm91Z2h0LiBBIHByb2R1Y3Rpb24gaXNzdWVyIGtlZXBzIHRoZSBzdXBlcnNlZGVkCmJ1bmRsZXMgcHVibGlzaGVkIGF0IHRoZWlyIG93biBVUklzIHNvIGJvdGggcmVtYWluIHJldHJpZXZhYmxlLgAAAAAAAAlzZXRfdGVybXMAAAAAAAABAAAAAAAAAAV0ZXJtcwAAAAAAB9AAAAAFVGVybXMAAAAAAAAA",
        "AAAAAAAAAEJDZWlsaW5nIG9uIGB0b3RhbF9zdXBwbHlgLCBmaXhlZCBhdCBkZXBsb3ltZW50IGFuZCB3aXRoIG5vIHNldHRlci4AAAAAAAptYXhfc3VwcGx5AAAAAAAAAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAMYWNjZXB0X2FkbWluAAAAAAAAAAA=",
        "AAAAAAAAAAAAAAAMc2V0X29wZXJhdG9yAAAAAQAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAMdG90YWxfc3VwcGx5AAAAAAAAAAEAAAAL",
        "AAAAAAAAAk5EZXBsb3ktdGltZSBpbml0aWFsaXphdGlvbiAocnVucyBleGFjdGx5IG9uY2UsIGF0b21pY2FsbHkgd2l0aCBkZXBsb3kpLgoKKiBgcmVnaXN0cnlgIGlzIHNoYXJlZCBhY3Jvc3MgZXZlcnkgYXNzZXQgb24gdGhlIHBsYXRmb3JtIC0gYW4gaW52ZXN0b3IKdmVyaWZpZWQgb25jZSBjYW4gaG9sZCBzaGFyZXMgb2YgYWxsIG9mIHRoZW0uCiogYHRyZWFzdXJ5YCByZWNlaXZlcyB0aGUgaXNzdWFuY2UgYW5kIGlzIHRoZSBvbmx5IGFkZHJlc3MgYSBmb3JjZWQKcmV2b2NhdGlvbiBjYW4gbW92ZSBzaGFyZXMgdG8uIE5vIHNldHRlcjogdGhlIGtleSB0aGF0IGNhbiBjb25maXNjYXRlCm11c3Qgbm90IGFsc28gYmUgYWJsZSB0byBjaG9vc2Ugd2hlcmUgdGhlIHNoYXJlcyBsYW5kLgoqIGBtYXhfc3VwcGx5YCBpcyB0aGUgYXNzZXQncyBzaGFyZSBjb3VudCBhbmQgY2Fubm90IGJlIHJhaXNlZCBsYXRlci4KcmV3YXJkcy1kaXN0cmlidXRvciBkaXZpZGVzIGluY29tZSBieSB0aGF0IHNhbWUgbnVtYmVyLCBzbyBhIHRva2VuCmFibGUgdG8gbWludCBwYXN0IGl0IGNvdWxkIHByb21pc2UgbW9yZSByZW50IHRoYW4gd2FzIGV2ZXIgZGVwb3NpdGVkLgAAAAAADV9fY29uc3RydWN0b3IAAAAAAAAGAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAZzeW1ib2wAAAAAABAAAAAAAAAACHJlZ2lzdHJ5AAAAEwAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAAptYXhfc3VwcGx5AAAAAAALAAAAAA==",
        "AAAAAAAAAAAAAAANcGVuZGluZ19hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=",
        "AAAAAAAABABNb3ZlIGBhbW91bnRgIHNoYXJlcyBmcm9tIGBmcm9tYCB0byB0aGUgdHJlYXN1cnkgd2l0aG91dCB0aGUgaG9sZGVyJ3MKc2lnbmF0dXJlLiBBZG1pbiBvbmx5LgoKQSBzZWN1cml0eSB0b2tlbiBuZWVkcyB0aGlzIGFuZCBhIHBheW1lbnQgdG9rZW4gZG9lcyBub3Q6IGEgY291cnQgb3JkZXIsCmEgcHJvYmF0ZSB0cmFuc2ZlciwgYSBzYW5jdGlvbnMgY29uZmlzY2F0aW9uLCBvciBhIGhvbGRlciB3aG9zZSBrZXlzIGFyZQpnb25lIGFyZSBhbGwgY2FzZXMgd2hlcmUgdGhlIHJlZ2lzdGVyIG9mIG93bmVyc2hpcCBoYXMgdG8gY2hhbmdlIGFuZCB0aGUKaG9sZGVyIGNhbm5vdCBvciB3aWxsIG5vdCBzaWduLiBPdXIgUG9seWdvbiBjb250cmFjdHMgY2FycnkgdGhlIHNhbWUKZW50cnlwb2ludC4gVGhyZWUgdGhpbmdzIGJvdW5kIGl0OgoKKiB0aGUgZGVzdGluYXRpb24gaXMgdGhlIHRyZWFzdXJ5IGZpeGVkIGF0IGRlcGxveW1lbnQsIHNvIHRoaXMgY2Fubm90IGJlCnVzZWQgdG8gbW92ZSBzaGFyZXMgdG8gYW4gYWRkcmVzcyBvZiB0aGUgYWRtaW4ncyBjaG9vc2luZzsKKiBpdCBwdWJsaXNoZXMgYFNoYXJlc1Jldm9rZWRgIG5leHQgdG8gdGhlIHN0YW5kYXJkIGBUcmFuc2ZlcmAsIHNvIGEKY29uZmlzY2F0aW9uIGNhbiBuZXZlciBiZSBtaXN0YWtlbiBmb3IgYSB0cmFkZSBpbiB0aGUgbG9nOwoqIGl0IGlzIHRoZSBvbmx5IHBhdGggaW4gdGhpcyBjb250cmFjdCB0aGF0IHNraXBzIHRoZSByZWdpc3RyeSBjaGVjayBvbgpwdXJwb3NlIC0gdGhlIGFkZHJlc3MgYmVpbmcgY29uZmlzY2F0ZWQgZnJvbSBpcyB1c3VhbGx5IHRoZSBvbmUgdGhhdAp3YXMgZnJvemVuIG9yIHJldm9rZWQsIGFuZCByZXF1aXJpbmcgaXQgdG8gYmUgZWxpZ2libGUgd291bGQgbWFrZSB0aGUKZW50cnlwb2ludCB1c2VsZXNzIGluIGV4YWN0bHkgdGhlIGNhc2UgaXQgZXhpc3RzIGZvci4KCkl0IGlzIGRlbGliZXJhdGVseSBub3QgYmxvY2tlZCBieSB0aGUgZGVwbG95bWVudC13aWRlIHBhdXNlOiBhbiBpbmNpZGVudAppcyB3aGVuAAAADXJldm9rZV9zaGFyZXMAAAAAAAACAAAAAAAAAARmcm9tAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
        "AAAAAAAAAAAAAAANdHJhbnNmZXJfZnJvbQAAAAAAAAQAAAAAAAAAB3NwZW5kZXIAAAAAEwAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAAAAAAAOdHJhbnNmZXJfYWRtaW4AAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAVY2FuY2VsX3RyYW5zZmVyX2FkbWluAAAAAAAAAAAAAAA=",
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
    burn: this.txFromJSON<null>,
        mint: this.txFromJSON<null>,
        name: this.txFromJSON<string>,
        admin: this.txFromJSON<string>,
        terms: this.txFromJSON<Option<Terms>>,
        issued: this.txFromJSON<boolean>,
        symbol: this.txFromJSON<string>,
        approve: this.txFromJSON<null>,
        balance: this.txFromJSON<i128>,
        upgrade: this.txFromJSON<null>,
        decimals: this.txFromJSON<u32>,
        operator: this.txFromJSON<string>,
        registry: this.txFromJSON<string>,
        transfer: this.txFromJSON<null>,
        treasury: this.txFromJSON<string>,
        allowance: this.txFromJSON<i128>,
        burn_from: this.txFromJSON<null>,
        set_terms: this.txFromJSON<null>,
        max_supply: this.txFromJSON<i128>,
        accept_admin: this.txFromJSON<null>,
        set_operator: this.txFromJSON<null>,
        total_supply: this.txFromJSON<i128>,
        pending_admin: this.txFromJSON<Option<string>>,
        revoke_shares: this.txFromJSON<null>,
        transfer_from: this.txFromJSON<null>,
        transfer_admin: this.txFromJSON<null>,
        cancel_transfer_admin: this.txFromJSON<null>
  }
}