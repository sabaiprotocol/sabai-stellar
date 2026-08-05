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
 * An open sell order. `remaining` shrinks on partial fills; the order is
 * deleted when it reaches zero.
 */
export interface Order {
  /**
 * Shares originally listed.
 */
amount: i128;
  /**
 * Ledger timestamp when the order was placed.
 */
created_at: u64;
  id: u64;
  /**
 * Price of ONE share in stroops of the payment token.
 */
rate: i128;
  /**
 * Shares still available in this order.
 */
remaining: i128;
  seller: string;
}

export type DataKey = {tag: "ShareToken", values: void} | {tag: "PaymentToken", values: void} | {tag: "Registry", values: void} | {tag: "FeeTo", values: void} | {tag: "CommissionBps", values: void} | {tag: "MinRate", values: void} | {tag: "MaxRate", values: void} | {tag: "Available", values: void} | {tag: "NextOrderId", values: void} | {tag: "OrderIds", values: void} | {tag: "Order", values: readonly [u64]} | {tag: "Rewards", values: void};

/**
 * Codes are unique across every contract in this deployment (registry 1xx,
 * share-token 2xx, sale 3xx, exchange 4xx, rewards 5xx). A cross-contract
 * call surfaces the INNER contract's code, and a shared numbering is what
 * lets the UI turn that code into the right sentence instead of guessing
 * from whichever contract it happened to call.
 */
export const Errors = {
  /**
   * Trading is switched off by the admin (`set_available(false)`).
   */
  401: {message:"ExchangeNotAvailable"},
  /**
   * `amount` must be a positive whole number of shares.
   */
  402: {message:"InvalidAmount"},
  /**
   * `rate` must sit inside the `[min_rate, max_rate]` band.
   */
  403: {message:"RateOutOfBand"},
  /**
   * No active order with this id (never existed, filled, or cancelled).
   */
  404: {message:"OrderNotFound"},
  /**
   * Buying from your own order is pointless, and blocked.
   */
  405: {message:"OwnOrder"},
  /**
   * Requested more shares than the order still holds.
   */
  406: {message:"ExceedsOrderSize"},
  /**
   * Only the seller who placed the order may cancel it this way.
   */
  407: {message:"NotOrderSeller"},
  /**
   * The buyer is not cleared by the compliance registry.
   */
  408: {message:"NotWhitelisted"},
  /**
   * amount * rate overflowed i128. Practically unreachable, checked anyway.
   */
  409: {message:"Overflow"},
  /**
   * Constructor got an invalid config value (rate band or commission).
   */
  410: {message:"InvalidConfig"},
  /**
   * The order's seller is no longer cleared by the registry, so the fill
   * would pay proceeds to a revoked address. Their escrow stays frozen
   * until the KYC provider admits them again.
   */
  411: {message:"SellerNotWhitelisted"}
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
   * Construct and simulate a order transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * A single open order, if it exists.
   */
  order: ({order_id}: {order_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Order>>>

  /**
   * Construct and simulate a fee_to transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  fee_to: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a orders transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Every open order, oldest first. The PoC book is small enough to return
   * whole; a production deployment pages this through an indexer.
   */
  orders: (options?: MethodOptions) => Promise<AssembledTransaction<Array<Order>>>

  /**
   * Construct and simulate a rewards transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The distributor filling buyers are settled against, or `None` if unset.
   */
  rewards: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a max_rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  max_rate: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a min_rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  min_rate: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The hot key that may halt trading and force-cancel an order.
   */
  operator: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a registry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The compliance registry this market defers eligibility to.
   */
  registry: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a add_order transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * List `amount` shares for sale at `rate` stroops per share. The shares
   * move into contract escrow in the same transaction, before the order is
   * visible to anyone. Returns the new order id.
   * 
   * Escrowed shares stop accruing rewards while listed, because
   * rewards-distributor pays against the current balance and the balance is
   * this contract's. Cancel or fill the order to start accruing again.
   */
  add_order: ({seller, amount, rate}: {seller: string, amount: i128, rate: i128}, options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a available transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  available: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a swap_order transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Buy `amount` shares from order `order_id`. Partial fills allowed.
   * 
   * One buyer authorization covers the whole atomic exchange: payment to
   * the seller (net) and to `fee_to` (commission), then shares out of
   * escrow to the buyer. The buyer pays the full asking price and the
   * commission comes out of the seller's proceeds.
   * 
   * No slippage bound is needed here: the price is `order.rate`, fixed when
   * the order was placed and not something the admin or the seller can move
   * under a buyer who is mid-transaction.
   */
  swap_order: ({buyer, order_id, amount}: {buyer: string, order_id: u64, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a close_order transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancel your own order: the remaining escrowed shares return to you.
   * Allowed even when trading is disabled - sellers can always exit.
   */
  close_order: ({seller, order_id}: {seller: string, order_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_rewards transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Point this market at the rewards distributor so filling buyers are
   * settled by their own trade. Admin only.
   * 
   * Admin rather than operator because a wrong address here fails every
   * fill until it is corrected - it cannot misdirect money or escrow, but it
   * can stop the market, and stopping the market is `set_available`'s job
   * with its own event.
   */
  set_rewards: ({rewards}: {rewards: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a share_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  share_token: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_operator: ({operator}: {operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a payment_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  payment_token: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a set_available transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Enable/disable trading. Admin or operator. Cancelling stays open either
   * way, so a halted market never locks a seller's escrow in.
   */
  set_available: ({caller, available}: {caller: string, available: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a close_order_by transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Force-cancel any order. Admin or operator - the escrow returns to its
   * seller and can go nowhere else, so the worst a stolen hot key does here
   * is hand people their own shares back.
   */
  close_order_by: ({caller, order_id}: {caller: string, order_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a commission_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  commission_bps: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

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
        {admin, share_token, payment_token, registry, fee_to, commission_bps, min_rate, max_rate}: {admin: string, share_token: string, payment_token: string, registry: string, fee_to: string, commission_bps: u32, min_rate: i128, max_rate: i128},
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
    return ContractClient.deploy({admin, share_token, payment_token, registry, fee_to, commission_bps, min_rate, max_rate}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAQAAAGRBbiBvcGVuIHNlbGwgb3JkZXIuIGByZW1haW5pbmdgIHNocmlua3Mgb24gcGFydGlhbCBmaWxsczsgdGhlIG9yZGVyIGlzCmRlbGV0ZWQgd2hlbiBpdCByZWFjaGVzIHplcm8uAAAAAAAAAAVPcmRlcgAAAAAAAAYAAAAZU2hhcmVzIG9yaWdpbmFsbHkgbGlzdGVkLgAAAAAAAAZhbW91bnQAAAAAAAsAAAArTGVkZ2VyIHRpbWVzdGFtcCB3aGVuIHRoZSBvcmRlciB3YXMgcGxhY2VkLgAAAAAKY3JlYXRlZF9hdAAAAAAABgAAAAAAAAACaWQAAAAAAAYAAAAzUHJpY2Ugb2YgT05FIHNoYXJlIGluIHN0cm9vcHMgb2YgdGhlIHBheW1lbnQgdG9rZW4uAAAAAARyYXRlAAAACwAAACVTaGFyZXMgc3RpbGwgYXZhaWxhYmxlIGluIHRoaXMgb3JkZXIuAAAAAAAACXJlbWFpbmluZwAAAAAAAAsAAAAAAAAABnNlbGxlcgAAAAAAEw==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAADAAAAAAAAAAAAAAAClNoYXJlVG9rZW4AAAAAAAAAAAAAAAAADFBheW1lbnRUb2tlbgAAAAAAAABEU2hhcmVkIGNvbXBsaWFuY2UgcmVnaXN0cnkgLSB0aGUgc2luZ2xlIHNvdXJjZSBvZiBlbGlnaWJpbGl0eSB0cnV0aC4AAAAIUmVnaXN0cnkAAAAAAAAAHlBsYXRmb3JtIGNvbW1pc3Npb24gcmVjaXBpZW50LgAAAAAABUZlZVRvAAAAAAAAAAAAAAAAAAANQ29tbWlzc2lvbkJwcwAAAAAAAAAAAAAAAAAAB01pblJhdGUAAAAAAAAAAAAAAAAHTWF4UmF0ZQAAAAAAAAAAAAAAAAlBdmFpbGFibGUAAAAAAAAAAAAAAAAAAAtOZXh0T3JkZXJJZAAAAAAAAAAARUlkcyBvZiBjdXJyZW50bHkgb3BlbiBvcmRlcnMgKHRoZSBib29rIGlzIHNtYWxsIC0gYSBQb0Mtc2NhbGUgaW5kZXgpLgAAAAAAAAhPcmRlcklkcwAAAAEAAABBT3BlbiBvcmRlciBieSBpZCAocGVyc2lzdGVudCAtIG9yZGVycyBvdXRsaXZlIGluc3RhbmNlIGFyY2hpdmFsKS4AAAAAAAAFT3JkZXIAAAAAAAABAAAABgAAAAAAAAGEUmV3YXJkcyBkaXN0cmlidXRvciB0byBzZXR0bGUgYSBmaWxsaW5nIGJ1eWVyIGFnYWluc3QsIHdoZW4gY29uZmlndXJlZC4KCk9wdGlvbmFsLCBhbmQgYWRkZWQgYWZ0ZXIgdGhpcyBjb250cmFjdCB3YXMgZmlyc3QgZGVwbG95ZWQ6IGFuIHVwZ3JhZGUKZG9lcyBub3QgcmUtcnVuIHRoZSBjb25zdHJ1Y3Rvciwgc28gaXQgaXMgd3JpdHRlbiBieSBgc2V0X3Jld2FyZHNgCnJhdGhlciB0aGFuIHBhc3NlZCBpbi4gVW5zZXQgbWVhbnMgYHN3YXBfb3JkZXJgIGJlaGF2ZXMgZXhhY3RseSBhcyBpdApkaWQgYmVmb3JlLCB3aGljaCBpcyB3aGF0IG1ha2VzIHRoZSB1cGdyYWRlIGFuZCB0aGUgc2V0dGVyIHR3byBzYWZlCnRyYW5zYWN0aW9ucyBpbnN0ZWFkIG9mIG9uZSBhdG9taWMgb25lLgAAAAdSZXdhcmRzAA==",
        "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAACJBIHNpbmdsZSBvcGVuIG9yZGVyLCBpZiBpdCBleGlzdHMuAAAAAAAFb3JkZXIAAAAAAAABAAAAAAAAAAhvcmRlcl9pZAAAAAYAAAABAAAD6AAAB9AAAAAFT3JkZXIAAAA=",
        "AAAAAAAAAAAAAAAGZmVlX3RvAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAIRFdmVyeSBvcGVuIG9yZGVyLCBvbGRlc3QgZmlyc3QuIFRoZSBQb0MgYm9vayBpcyBzbWFsbCBlbm91Z2ggdG8gcmV0dXJuCndob2xlOyBhIHByb2R1Y3Rpb24gZGVwbG95bWVudCBwYWdlcyB0aGlzIHRocm91Z2ggYW4gaW5kZXhlci4AAAAGb3JkZXJzAAAAAAAAAAAAAQAAA+oAAAfQAAAABU9yZGVyAAAA",
        "AAAAAAAAAEdUaGUgZGlzdHJpYnV0b3IgZmlsbGluZyBidXllcnMgYXJlIHNldHRsZWQgYWdhaW5zdCwgb3IgYE5vbmVgIGlmIHVuc2V0LgAAAAAHcmV3YXJkcwAAAAAAAAAAAQAAA+gAAAAT",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAAAAAAAIbWF4X3JhdGUAAAAAAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAIbWluX3JhdGUAAAAAAAAAAQAAAAs=",
        "AAAAAAAAADxUaGUgaG90IGtleSB0aGF0IG1heSBoYWx0IHRyYWRpbmcgYW5kIGZvcmNlLWNhbmNlbCBhbiBvcmRlci4AAAAIb3BlcmF0b3IAAAAAAAAAAQAAABM=",
        "AAAAAAAAADpUaGUgY29tcGxpYW5jZSByZWdpc3RyeSB0aGlzIG1hcmtldCBkZWZlcnMgZWxpZ2liaWxpdHkgdG8uAAAAAAAIcmVnaXN0cnkAAAAAAAAAAQAAABM=",
        "AAAAAAAAAYFMaXN0IGBhbW91bnRgIHNoYXJlcyBmb3Igc2FsZSBhdCBgcmF0ZWAgc3Ryb29wcyBwZXIgc2hhcmUuIFRoZSBzaGFyZXMKbW92ZSBpbnRvIGNvbnRyYWN0IGVzY3JvdyBpbiB0aGUgc2FtZSB0cmFuc2FjdGlvbiwgYmVmb3JlIHRoZSBvcmRlciBpcwp2aXNpYmxlIHRvIGFueW9uZS4gUmV0dXJucyB0aGUgbmV3IG9yZGVyIGlkLgoKRXNjcm93ZWQgc2hhcmVzIHN0b3AgYWNjcnVpbmcgcmV3YXJkcyB3aGlsZSBsaXN0ZWQsIGJlY2F1c2UKcmV3YXJkcy1kaXN0cmlidXRvciBwYXlzIGFnYWluc3QgdGhlIGN1cnJlbnQgYmFsYW5jZSBhbmQgdGhlIGJhbGFuY2UgaXMKdGhpcyBjb250cmFjdCdzLiBDYW5jZWwgb3IgZmlsbCB0aGUgb3JkZXIgdG8gc3RhcnQgYWNjcnVpbmcgYWdhaW4uAAAAAAAACWFkZF9vcmRlcgAAAAAAAAMAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAARyYXRlAAAACwAAAAEAAAAG",
        "AAAAAAAAAAAAAAAJYXZhaWxhYmxlAAAAAAAAAAAAAAEAAAAB",
        "AAAAAAAAAfFCdXkgYGFtb3VudGAgc2hhcmVzIGZyb20gb3JkZXIgYG9yZGVyX2lkYC4gUGFydGlhbCBmaWxscyBhbGxvd2VkLgoKT25lIGJ1eWVyIGF1dGhvcml6YXRpb24gY292ZXJzIHRoZSB3aG9sZSBhdG9taWMgZXhjaGFuZ2U6IHBheW1lbnQgdG8KdGhlIHNlbGxlciAobmV0KSBhbmQgdG8gYGZlZV90b2AgKGNvbW1pc3Npb24pLCB0aGVuIHNoYXJlcyBvdXQgb2YKZXNjcm93IHRvIHRoZSBidXllci4gVGhlIGJ1eWVyIHBheXMgdGhlIGZ1bGwgYXNraW5nIHByaWNlIGFuZCB0aGUKY29tbWlzc2lvbiBjb21lcyBvdXQgb2YgdGhlIHNlbGxlcidzIHByb2NlZWRzLgoKTm8gc2xpcHBhZ2UgYm91bmQgaXMgbmVlZGVkIGhlcmU6IHRoZSBwcmljZSBpcyBgb3JkZXIucmF0ZWAsIGZpeGVkIHdoZW4KdGhlIG9yZGVyIHdhcyBwbGFjZWQgYW5kIG5vdCBzb21ldGhpbmcgdGhlIGFkbWluIG9yIHRoZSBzZWxsZXIgY2FuIG1vdmUKdW5kZXIgYSBidXllciB3aG8gaXMgbWlkLXRyYW5zYWN0aW9uLgAAAAAAAApzd2FwX29yZGVyAAAAAAADAAAAAAAAAAVidXllcgAAAAAAABMAAAAAAAAACG9yZGVyX2lkAAAABgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
        "AAAAAAAAAIRDYW5jZWwgeW91ciBvd24gb3JkZXI6IHRoZSByZW1haW5pbmcgZXNjcm93ZWQgc2hhcmVzIHJldHVybiB0byB5b3UuCkFsbG93ZWQgZXZlbiB3aGVuIHRyYWRpbmcgaXMgZGlzYWJsZWQgLSBzZWxsZXJzIGNhbiBhbHdheXMgZXhpdC4AAAALY2xvc2Vfb3JkZXIAAAAAAgAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAhvcmRlcl9pZAAAAAYAAAAA",
        "AAAAAAAAAVJQb2ludCB0aGlzIG1hcmtldCBhdCB0aGUgcmV3YXJkcyBkaXN0cmlidXRvciBzbyBmaWxsaW5nIGJ1eWVycyBhcmUKc2V0dGxlZCBieSB0aGVpciBvd24gdHJhZGUuIEFkbWluIG9ubHkuCgpBZG1pbiByYXRoZXIgdGhhbiBvcGVyYXRvciBiZWNhdXNlIGEgd3JvbmcgYWRkcmVzcyBoZXJlIGZhaWxzIGV2ZXJ5CmZpbGwgdW50aWwgaXQgaXMgY29ycmVjdGVkIC0gaXQgY2Fubm90IG1pc2RpcmVjdCBtb25leSBvciBlc2Nyb3csIGJ1dCBpdApjYW4gc3RvcCB0aGUgbWFya2V0LCBhbmQgc3RvcHBpbmcgdGhlIG1hcmtldCBpcyBgc2V0X2F2YWlsYWJsZWAncyBqb2IKd2l0aCBpdHMgb3duIGV2ZW50LgAAAAAAC3NldF9yZXdhcmRzAAAAAAEAAAAAAAAAB3Jld2FyZHMAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAALc2hhcmVfdG9rZW4AAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAMYWNjZXB0X2FkbWluAAAAAAAAAAA=",
        "AAAAAAAAAAAAAAAMc2V0X29wZXJhdG9yAAAAAQAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAA==",
        "AAAAAAAAAcxEZXBsb3ktdGltZSBpbml0aWFsaXphdGlvbiAocnVucyBleGFjdGx5IG9uY2UsIGF0b21pY2FsbHkgd2l0aCBkZXBsb3kpLgoKKiBgcmVnaXN0cnlgIC0gY29tcGxpYW5jZSByZWdpc3RyeSB0aGF0IGdhdGVzIGJvdGggc2lkZXMgb2YgYSB0cmFkZS4KKiBgZmVlX3RvYCAtIHJlY2VpdmVzIHRoZSBwbGF0Zm9ybSBjb21taXNzaW9uIGZyb20gZXZlcnkgZmlsbC4KKiBgY29tbWlzc2lvbl9icHNgIC0gY29tbWlzc2lvbiBpbiBiYXNpcyBwb2ludHMgKDIwMCA9IDIlKSwgPD0gMzAwMC4KKiBgbWluX3JhdGVgL2BtYXhfcmF0ZWAgLSBhbGxvd2VkIHBlci1zaGFyZSBwcmljZSBiYW5kIGluIHN0cm9vcHMuCgpUcmFkaW5nIHN0YXJ0cyBlbmFibGVkOiB1bmxpa2UgdGhlIHByaW1hcnkgc2FsZSB0aGVyZSBpcyBubyBpbnZlbnRvcnkKdG8gZGVwb3NpdCBmaXJzdCAtIHRoZSBib29rIHNpbXBseSBzdGFydHMgZW1wdHkuAAAADV9fY29uc3RydWN0b3IAAAAAAAAIAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAC3NoYXJlX3Rva2VuAAAAABMAAAAAAAAADXBheW1lbnRfdG9rZW4AAAAAAAATAAAAAAAAAAhyZWdpc3RyeQAAABMAAAAAAAAABmZlZV90bwAAAAAAEwAAAAAAAAAOY29tbWlzc2lvbl9icHMAAAAAAAQAAAAAAAAACG1pbl9yYXRlAAAACwAAAAAAAAAIbWF4X3JhdGUAAAALAAAAAA==",
        "AAAAAAAAAAAAAAANcGF5bWVudF90b2tlbgAAAAAAAAAAAAABAAAAEw==",
        "AAAAAAAAAAAAAAANcGVuZGluZ19hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=",
        "AAAAAAAAAIFFbmFibGUvZGlzYWJsZSB0cmFkaW5nLiBBZG1pbiBvciBvcGVyYXRvci4gQ2FuY2VsbGluZyBzdGF5cyBvcGVuIGVpdGhlcgp3YXksIHNvIGEgaGFsdGVkIG1hcmtldCBuZXZlciBsb2NrcyBhIHNlbGxlcidzIGVzY3JvdyBpbi4AAAAAAAANc2V0X2F2YWlsYWJsZQAAAAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAJYXZhaWxhYmxlAAAAAAAAAQAAAAA=",
        "AAAAAAAAALNGb3JjZS1jYW5jZWwgYW55IG9yZGVyLiBBZG1pbiBvciBvcGVyYXRvciAtIHRoZSBlc2Nyb3cgcmV0dXJucyB0byBpdHMKc2VsbGVyIGFuZCBjYW4gZ28gbm93aGVyZSBlbHNlLCBzbyB0aGUgd29yc3QgYSBzdG9sZW4gaG90IGtleSBkb2VzIGhlcmUKaXMgaGFuZCBwZW9wbGUgdGhlaXIgb3duIHNoYXJlcyBiYWNrLgAAAAAOY2xvc2Vfb3JkZXJfYnkAAAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAIb3JkZXJfaWQAAAAGAAAAAA==",
        "AAAAAAAAAAAAAAAOY29tbWlzc2lvbl9icHMAAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAAAAAAAOdHJhbnNmZXJfYWRtaW4AAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAVY2FuY2VsX3RyYW5zZmVyX2FkbWluAAAAAAAAAAAAAAA=",
        "AAAABAAAAUxDb2RlcyBhcmUgdW5pcXVlIGFjcm9zcyBldmVyeSBjb250cmFjdCBpbiB0aGlzIGRlcGxveW1lbnQgKHJlZ2lzdHJ5IDF4eCwKc2hhcmUtdG9rZW4gMnh4LCBzYWxlIDN4eCwgZXhjaGFuZ2UgNHh4LCByZXdhcmRzIDV4eCkuIEEgY3Jvc3MtY29udHJhY3QKY2FsbCBzdXJmYWNlcyB0aGUgSU5ORVIgY29udHJhY3QncyBjb2RlLCBhbmQgYSBzaGFyZWQgbnVtYmVyaW5nIGlzIHdoYXQKbGV0cyB0aGUgVUkgdHVybiB0aGF0IGNvZGUgaW50byB0aGUgcmlnaHQgc2VudGVuY2UgaW5zdGVhZCBvZiBndWVzc2luZwpmcm9tIHdoaWNoZXZlciBjb250cmFjdCBpdCBoYXBwZW5lZCB0byBjYWxsLgAAAAAAAAAFRXJyb3IAAAAAAAALAAAAPlRyYWRpbmcgaXMgc3dpdGNoZWQgb2ZmIGJ5IHRoZSBhZG1pbiAoYHNldF9hdmFpbGFibGUoZmFsc2UpYCkuAAAAAAAURXhjaGFuZ2VOb3RBdmFpbGFibGUAAAGRAAAAM2BhbW91bnRgIG11c3QgYmUgYSBwb3NpdGl2ZSB3aG9sZSBudW1iZXIgb2Ygc2hhcmVzLgAAAAANSW52YWxpZEFtb3VudAAAAAAAAZIAAAA3YHJhdGVgIG11c3Qgc2l0IGluc2lkZSB0aGUgYFttaW5fcmF0ZSwgbWF4X3JhdGVdYCBiYW5kLgAAAAANUmF0ZU91dE9mQmFuZAAAAAAAAZMAAABDTm8gYWN0aXZlIG9yZGVyIHdpdGggdGhpcyBpZCAobmV2ZXIgZXhpc3RlZCwgZmlsbGVkLCBvciBjYW5jZWxsZWQpLgAAAAANT3JkZXJOb3RGb3VuZAAAAAAAAZQAAAA1QnV5aW5nIGZyb20geW91ciBvd24gb3JkZXIgaXMgcG9pbnRsZXNzLCBhbmQgYmxvY2tlZC4AAAAAAAAIT3duT3JkZXIAAAGVAAAAMVJlcXVlc3RlZCBtb3JlIHNoYXJlcyB0aGFuIHRoZSBvcmRlciBzdGlsbCBob2xkcy4AAAAAAAAQRXhjZWVkc09yZGVyU2l6ZQAAAZYAAAA8T25seSB0aGUgc2VsbGVyIHdobyBwbGFjZWQgdGhlIG9yZGVyIG1heSBjYW5jZWwgaXQgdGhpcyB3YXkuAAAADk5vdE9yZGVyU2VsbGVyAAAAAAGXAAAANFRoZSBidXllciBpcyBub3QgY2xlYXJlZCBieSB0aGUgY29tcGxpYW5jZSByZWdpc3RyeS4AAAAOTm90V2hpdGVsaXN0ZWQAAAAAAZgAAABHYW1vdW50ICogcmF0ZSBvdmVyZmxvd2VkIGkxMjguIFByYWN0aWNhbGx5IHVucmVhY2hhYmxlLCBjaGVja2VkIGFueXdheS4AAAAACE92ZXJmbG93AAABmQAAAEJDb25zdHJ1Y3RvciBnb3QgYW4gaW52YWxpZCBjb25maWcgdmFsdWUgKHJhdGUgYmFuZCBvciBjb21taXNzaW9uKS4AAAAAAA1JbnZhbGlkQ29uZmlnAAAAAAABmgAAALFUaGUgb3JkZXIncyBzZWxsZXIgaXMgbm8gbG9uZ2VyIGNsZWFyZWQgYnkgdGhlIHJlZ2lzdHJ5LCBzbyB0aGUgZmlsbAp3b3VsZCBwYXkgcHJvY2VlZHMgdG8gYSByZXZva2VkIGFkZHJlc3MuIFRoZWlyIGVzY3JvdyBzdGF5cyBmcm96ZW4KdW50aWwgdGhlIEtZQyBwcm92aWRlciBhZG1pdHMgdGhlbSBhZ2Fpbi4AAAAAAAAUU2VsbGVyTm90V2hpdGVsaXN0ZWQAAAGb",
        "AAAABQAAATdBIGJ1eWVyIChwYXJ0aWFsbHkpIGZpbGxlZCBhbiBvcmRlci4KYHBheW91dGAgaXMgd2hhdCB0aGUgc2VsbGVyIHJlY2VpdmVkIGFmdGVyIHRoZSBwbGF0Zm9ybSBjb21taXNzaW9uLgoKQk9USCBzaWRlcyBhcmUgdG9waWNzIHNvIGEgd2FsbGV0IGNhbiBwdWxsIGl0cyBvd24gdHJhZGUgaGlzdG9yeSBmcm9tClJQQyB3aXRoIGEgc2luZ2xlIGBnZXRFdmVudHNgIGZpbHRlciAtIHdoZXJlIGEgcHJvZHVjdGlvbiBkZXBsb3ltZW50CmhhcyB0byBjb3JyZWxhdGUgRVJDLTIwIFRyYW5zZmVyIGxvZ3MgdG8gcmVjb3ZlciB0aGUgY291bnRlcnBhcnR5LgAAAAAAAAAACU9yZGVyU3dhcAAAAAAAAAEAAAAKb3JkZXJfc3dhcAAAAAAABgAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAQAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAQAAAAAAAAAIb3JkZXJfaWQAAAAGAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAEY29zdAAAAAsAAAAAAAAAAAAAAAZwYXlvdXQAAAAAAAsAAAAAAAAAAQ==",
        "AAAABQAAACxBIHNlbGxlciBlc2Nyb3dlZCBzaGFyZXMgYW5kIG9wZW5lZCBhbiBvcmRlcgAAAAAAAAAKT3JkZXJBZGRlZAAAAAAAAQAAAAtvcmRlcl9hZGRlZAAAAAAEAAAAAAAAAAZzZWxsZXIAAAAAABMAAAABAAAAAAAAAAhvcmRlcl9pZAAAAAYAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAARyYXRlAAAACwAAAAAAAAAB",
        "AAAABQAAAJBUaGUgbWFya2V0IHdhcyBwb2ludGVkIGF0IGEgcmV3YXJkcyBkaXN0cmlidXRvciwgc28gYSBmaWxsaW5nIGJ1eWVyIGlzIG5vdwpzZXR0bGVkIGJ5IHRoZWlyIG93biB0cmFkZSByYXRoZXIgdGhhbiBieSBhIHNlY29uZCBjYWxsIG9mIHRoZWlyIG93bi4AAAAAAAAAClJld2FyZHNTZXQAAAAAAAEAAAALcmV3YXJkc19zZXQAAAAAAQAAAAAAAAAHcmV3YXJkcwAAAAATAAAAAQAAAAA=",
        "AAAABQAAAIxBbiBvcmRlciB3YXMgY2FuY2VsbGVkIGFuZCB0aGUgZXNjcm93ZWQgc2hhcmVzIHJldHVybmVkIHRvIHRoZSBzZWxsZXIuCmBieV9hZG1pbmAgc2VwYXJhdGVzIGEgc2VsbGVyIGNhbmNlbGxpbmcgZnJvbSBhbiBhZG1pbiBmb3JjZS1jbG9zaW5nLgAAAAAAAAALT3JkZXJDbG9zZWQAAAAAAQAAAAxvcmRlcl9jbG9zZWQAAAADAAAAAAAAAAZzZWxsZXIAAAAAABMAAAABAAAAAAAAAAhvcmRlcl9pZAAAAAYAAAAAAAAAAAAAAAhieV9hZG1pbgAAAAEAAAAAAAAAAQ==",
        "AAAABQAAACZUcmFkaW5nIGVuYWJsZWQvZGlzYWJsZWQgYnkgdGhlIGFkbWluLgAAAAAAAAAAABNBdmFpbGFiaWxpdHlDaGFuZ2VkAAAAAAEAAAAUYXZhaWxhYmlsaXR5X2NoYW5nZWQAAAABAAAAAAAAAAlhdmFpbGFibGUAAAAAAAABAAAAAAAAAAA=",
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
        order: this.txFromJSON<Option<Order>>,
        fee_to: this.txFromJSON<string>,
        orders: this.txFromJSON<Array<Order>>,
        rewards: this.txFromJSON<Option<string>>,
        upgrade: this.txFromJSON<null>,
        max_rate: this.txFromJSON<i128>,
        min_rate: this.txFromJSON<i128>,
        operator: this.txFromJSON<string>,
        registry: this.txFromJSON<string>,
        add_order: this.txFromJSON<u64>,
        available: this.txFromJSON<boolean>,
        swap_order: this.txFromJSON<null>,
        close_order: this.txFromJSON<null>,
        set_rewards: this.txFromJSON<null>,
        share_token: this.txFromJSON<string>,
        accept_admin: this.txFromJSON<null>,
        set_operator: this.txFromJSON<null>,
        payment_token: this.txFromJSON<string>,
        pending_admin: this.txFromJSON<Option<string>>,
        set_available: this.txFromJSON<null>,
        close_order_by: this.txFromJSON<null>,
        commission_bps: this.txFromJSON<u32>,
        transfer_admin: this.txFromJSON<null>,
        cancel_transfer_admin: this.txFromJSON<null>
  }
}