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




export type DataKey = {tag: "ShareToken", values: void} | {tag: "PaymentToken", values: void} | {tag: "Treasury", values: void} | {tag: "Price", values: void} | {tag: "Available", values: void} | {tag: "Registry", values: void} | {tag: "BuybackDiscountBps", values: void} | {tag: "FeeTo", values: void} | {tag: "CommissionBps", values: void} | {tag: "Rewards", values: void};

/**
 * Codes are unique across every contract in this deployment (registry 1xx,
 * share-token 2xx, sale 3xx, exchange 4xx, rewards 5xx). A cross-contract
 * call surfaces the INNER contract's code, and a shared numbering is what
 * lets the UI turn that code into the right sentence instead of guessing
 * from whichever contract it happened to call.
 */
export const Errors = {
  /**
   * Sale is switched off by the admin (`set_available(false)`).
   */
  301: {message:"SaleNotAvailable"},
  /**
   * `amount`, `max_cost` and `min_payout` must all be positive.
   */
  302: {message:"InvalidAmount"},
  /**
   * The sale contract holds fewer shares than requested.
   */
  303: {message:"InsufficientInventory"},
  /**
   * `price` must be positive (stroops of the payment token per share).
   */
  304: {message:"InvalidPrice"},
  /**
   * amount * price overflowed i128. Practically unreachable, checked anyway.
   */
  305: {message:"Overflow"},
  /**
   * The compliance registry does not list this address as eligible.
   */
  306: {message:"NotWhitelisted"},
  /**
   * The buyback pool holds less payment token than the sell payout.
   */
  307: {message:"InsufficientBuybackFunds"},
  /**
   * Buyback discount above the 30% cap, rejected at construction.
   */
  308: {message:"InvalidDiscount"},
  /**
   * The price moved between the quote and this transaction: the cost rose
   * above `max_cost`, or the payout fell below `min_payout`.
   */
  309: {message:"PriceMoved"},
  /**
   * The treasury or the fee account cannot buy from the sale that pays
   * them: their leg of the payment would be a transfer to themselves, so
   * they would receive shares for less than the asking price.
   */
  310: {message:"TreasuryCannotBuy"},
  /**
   * Commission above the 30% cap, rejected at construction.
   */
  311: {message:"InvalidCommission"}
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
   * Construct and simulate a buy transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Buy `amount` shares, paying at most `max_cost` in total.
   * 
   * The buyer authorizes ONE call; inside it the contract moves payment
   * (buyer to treasury) and shares (contract to buyer). Either both happen
   * or the whole transaction fails.
   * 
   * `max_cost` is what stops the admin repricing the sale between the quote
   * the buyer saw and the ledger their transaction lands in. Pass the cost
   * shown on screen; a price raised in the meantime aborts the purchase
   * rather than silently charging more.
   */
  buy: ({buyer, amount, max_cost}: {buyer: string, amount: i128, max_cost: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a sell transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Sell `amount` shares back to the issuer's buyback pool for at least
   * `min_payout`. Shares return to the sale inventory and become
   * purchasable again; the payout comes from the pool this contract holds.
   * 
   * Deliberately still callable while the sale is paused: pausing stops new
   * distribution, it must not trap holders who want out.
   * 
   * The discount is what makes the pool safe to leave open. Paying the full
   * price would let anyone buy and immediately sell in a loop, moving the
   * whole pool into the treasury for the cost of transaction fees and
   * leaving genuine holders with no way out. `min_payout` covers the mirror
   * risk: the price dropping between the quote and the transaction.
   */
  sell: ({seller, amount, min_payout}: {seller: string, amount: i128, min_payout: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  price: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a fee_to transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Receives the platform's cut of each purchase.
   */
  fee_to: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a rewards transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The distributor buyers are settled against, or `None` while unset.
   */
  rewards: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The hot key that may open and close the sale, and nothing else here.
   */
  operator: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a registry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The compliance registry this sale defers eligibility to.
   */
  registry: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a treasury transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  treasury: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a available transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  available: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a remaining transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Shares still held by this contract and purchasable right now. There is
   * no separate sold counter: inventory moves both ways (a buyback returns
   * shares here), so a counter would be a second version of this number
   * that can disagree with it.
   */
  remaining: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a set_price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Change the per-share price. Admin only. In-flight purchases are
   * protected by their own `max_cost`.
   * 
   * Not an operator power, even though it looks like an everyday one: a
   * price of 1 stroop empties the inventory into whoever notices first, so
   * a stolen hot key would be worth the whole tranche. `set_available` is
   * the operator's version of the same instinct - it can stop the sale
   * without being able to give it away.
   */
  set_price: ({price}: {price: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_rewards transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Point this sale at the rewards distributor so buyers are settled by
   * their purchase. Admin only.
   * 
   * Admin rather than operator because a wrong address here fails every
   * `buy` until it is corrected - it cannot misdirect money, but it can stop
   * the sale, and stopping the sale is `set_available`'s job with its own
   * event.
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
   * Construct and simulate a buyback_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Payment token held by the contract for buybacks.
   */
  buyback_pool: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a fund_buyback transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Add payment token to the buyback pool. Anyone may fund it.
   */
  fund_buyback: ({from, amount}: {from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a set_operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_operator: ({operator}: {operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a buyback_quote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * What the pool pays for `amount` shares right now. `sell` calls this same
   * function, so the quote on screen cannot drift from the amount paid.
   * Rounds down, so the pool never overpays.
   */
  buyback_quote: ({amount}: {amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

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
   * Enable or disable new purchases. Admin or operator. Does not affect
   * `sell`: closing the sale must never trap a holder who wants out.
   */
  set_available: ({caller, available}: {caller: string, available: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a commission_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The platform's cut, in basis points (200 = 2%).
   */
  commission_bps: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  transfer_admin: ({new_admin}: {new_admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a withdraw_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pull unsold shares back out of the contract. Admin only. `to` still has
   * to be admitted by the registry, so the gate applies to the issuer too.
   */
  withdraw_shares: ({to, amount}: {to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a withdraw_buyback transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pull payment token out of the buyback pool. Admin only - this is the
   * one entrypoint here that moves money outward, so it costs two of the
   * three multisig signatures and is out of the operator's reach.
   */
  withdraw_buyback: ({to, amount}: {to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a buyback_discount_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Discount applied to a buyback, in basis points (500 = 5%).
   */
  buyback_discount_bps: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a cancel_transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  cancel_transfer_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a available_for_purchase transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * What `buy` would actually accept right now: the inventory, or zero
   * while the sale is switched off. `remaining` answers "what is held here",
   * which is the honest number for an inventory readout but the wrong one
   * for a buy button - a disabled sale with 300 shares in it is not 300
   * shares available.
   */
  available_for_purchase: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, share_token, payment_token, treasury, registry, fee_to, price, buyback_discount_bps, commission_bps}: {admin: string, share_token: string, payment_token: string, treasury: string, registry: string, fee_to: string, price: i128, buyback_discount_bps: u32, commission_bps: u32},
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
    return ContractClient.deploy({admin, share_token, payment_token, treasury, registry, fee_to, price, buyback_discount_bps, commission_bps}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACgAAAAAAAAAAAAAAClNoYXJlVG9rZW4AAAAAAAAAAAAAAAAADFBheW1lbnRUb2tlbgAAAAAAAAAAAAAACFRyZWFzdXJ5AAAAAAAAAAAAAAAFUHJpY2UAAAAAAAAAAAAAAAAAAAlBdmFpbGFibGUAAAAAAAAAAAAAQ1NoYXJlZCBjb21wbGlhbmNlIHJlZ2lzdHJ5LCB0aGUgc2luZ2xlIHNvdXJjZSBvZiBlbGlnaWJpbGl0eSB0cnV0aC4AAAAACFJlZ2lzdHJ5AAAAAAAAADhEaXNjb3VudCBhcHBsaWVkIHRvIHRoZSBidXliYWNrIHBheW91dCwgaW4gYmFzaXMgcG9pbnRzLgAAABJCdXliYWNrRGlzY291bnRCcHMAAAAAAAAAAAAyUmVjZWl2ZXMgdGhlIHBsYXRmb3JtJ3MgY3V0IG9mIGV2ZXJ5IHByaW1hcnkgc2FsZS4AAAAAAAVGZWVUbwAAAAAAAAAAAAAwVGhhdCBjdXQsIGluIGJhc2lzIHBvaW50cyBvZiB0aGUgcHVyY2hhc2UgcHJpY2UuAAAADUNvbW1pc3Npb25CcHMAAAAAAAAAAAABfFJld2FyZHMgZGlzdHJpYnV0b3IgdG8gc2V0dGxlIGEgYnV5ZXIgYWdhaW5zdCwgd2hlbiBvbmUgaXMgY29uZmlndXJlZC4KCk9wdGlvbmFsLCBhbmQgYWRkZWQgYWZ0ZXIgdGhpcyBjb250cmFjdCB3YXMgZmlyc3QgZGVwbG95ZWQ6IGFuIHVwZ3JhZGUKZG9lcyBub3QgcmUtcnVuIHRoZSBjb25zdHJ1Y3Rvciwgc28gaXQgaXMgd3JpdHRlbiBieSBgc2V0X3Jld2FyZHNgCnJhdGhlciB0aGFuIHBhc3NlZCBpbi4gVW5zZXQgbWVhbnMgYGJ1eWAgYmVoYXZlcyBleGFjdGx5IGFzIGl0IGRpZApiZWZvcmUsIHdoaWNoIGlzIHdoYXQgbWFrZXMgdGhlIHVwZ3JhZGUgYW5kIHRoZSBzZXR0ZXIgdHdvIHNhZmUKdHJhbnNhY3Rpb25zIGluc3RlYWQgb2Ygb25lIGF0b21pYyBvbmUuAAAAB1Jld2FyZHMA",
        "AAAAAAAAAdxCdXkgYGFtb3VudGAgc2hhcmVzLCBwYXlpbmcgYXQgbW9zdCBgbWF4X2Nvc3RgIGluIHRvdGFsLgoKVGhlIGJ1eWVyIGF1dGhvcml6ZXMgT05FIGNhbGw7IGluc2lkZSBpdCB0aGUgY29udHJhY3QgbW92ZXMgcGF5bWVudAooYnV5ZXIgdG8gdHJlYXN1cnkpIGFuZCBzaGFyZXMgKGNvbnRyYWN0IHRvIGJ1eWVyKS4gRWl0aGVyIGJvdGggaGFwcGVuCm9yIHRoZSB3aG9sZSB0cmFuc2FjdGlvbiBmYWlscy4KCmBtYXhfY29zdGAgaXMgd2hhdCBzdG9wcyB0aGUgYWRtaW4gcmVwcmljaW5nIHRoZSBzYWxlIGJldHdlZW4gdGhlIHF1b3RlCnRoZSBidXllciBzYXcgYW5kIHRoZSBsZWRnZXIgdGhlaXIgdHJhbnNhY3Rpb24gbGFuZHMgaW4uIFBhc3MgdGhlIGNvc3QKc2hvd24gb24gc2NyZWVuOyBhIHByaWNlIHJhaXNlZCBpbiB0aGUgbWVhbnRpbWUgYWJvcnRzIHRoZSBwdXJjaGFzZQpyYXRoZXIgdGhhbiBzaWxlbnRseSBjaGFyZ2luZyBtb3JlLgAAAANidXkAAAAAAwAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACG1heF9jb3N0AAAACwAAAAA=",
        "AAAAAAAAAp5TZWxsIGBhbW91bnRgIHNoYXJlcyBiYWNrIHRvIHRoZSBpc3N1ZXIncyBidXliYWNrIHBvb2wgZm9yIGF0IGxlYXN0CmBtaW5fcGF5b3V0YC4gU2hhcmVzIHJldHVybiB0byB0aGUgc2FsZSBpbnZlbnRvcnkgYW5kIGJlY29tZQpwdXJjaGFzYWJsZSBhZ2FpbjsgdGhlIHBheW91dCBjb21lcyBmcm9tIHRoZSBwb29sIHRoaXMgY29udHJhY3QgaG9sZHMuCgpEZWxpYmVyYXRlbHkgc3RpbGwgY2FsbGFibGUgd2hpbGUgdGhlIHNhbGUgaXMgcGF1c2VkOiBwYXVzaW5nIHN0b3BzIG5ldwpkaXN0cmlidXRpb24sIGl0IG11c3Qgbm90IHRyYXAgaG9sZGVycyB3aG8gd2FudCBvdXQuCgpUaGUgZGlzY291bnQgaXMgd2hhdCBtYWtlcyB0aGUgcG9vbCBzYWZlIHRvIGxlYXZlIG9wZW4uIFBheWluZyB0aGUgZnVsbApwcmljZSB3b3VsZCBsZXQgYW55b25lIGJ1eSBhbmQgaW1tZWRpYXRlbHkgc2VsbCBpbiBhIGxvb3AsIG1vdmluZyB0aGUKd2hvbGUgcG9vbCBpbnRvIHRoZSB0cmVhc3VyeSBmb3IgdGhlIGNvc3Qgb2YgdHJhbnNhY3Rpb24gZmVlcyBhbmQKbGVhdmluZyBnZW51aW5lIGhvbGRlcnMgd2l0aCBubyB3YXkgb3V0LiBgbWluX3BheW91dGAgY292ZXJzIHRoZSBtaXJyb3IKcmlzazogdGhlIHByaWNlIGRyb3BwaW5nIGJldHdlZW4gdGhlIHF1b3RlIGFuZCB0aGUgdHJhbnNhY3Rpb24uAAAAAAAEc2VsbAAAAAMAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAptaW5fcGF5b3V0AAAAAAALAAAAAA==",
        "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAFcHJpY2UAAAAAAAAAAAAAAQAAAAs=",
        "AAAAAAAAAC1SZWNlaXZlcyB0aGUgcGxhdGZvcm0ncyBjdXQgb2YgZWFjaCBwdXJjaGFzZS4AAAAAAAAGZmVlX3RvAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAEJUaGUgZGlzdHJpYnV0b3IgYnV5ZXJzIGFyZSBzZXR0bGVkIGFnYWluc3QsIG9yIGBOb25lYCB3aGlsZSB1bnNldC4AAAAAAAdyZXdhcmRzAAAAAAAAAAABAAAD6AAAABM=",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAERUaGUgaG90IGtleSB0aGF0IG1heSBvcGVuIGFuZCBjbG9zZSB0aGUgc2FsZSwgYW5kIG5vdGhpbmcgZWxzZSBoZXJlLgAAAAhvcGVyYXRvcgAAAAAAAAABAAAAEw==",
        "AAAAAAAAADhUaGUgY29tcGxpYW5jZSByZWdpc3RyeSB0aGlzIHNhbGUgZGVmZXJzIGVsaWdpYmlsaXR5IHRvLgAAAAhyZWdpc3RyeQAAAAAAAAABAAAAEw==",
        "AAAAAAAAAAAAAAAIdHJlYXN1cnkAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAJYXZhaWxhYmxlAAAAAAAAAAAAAAEAAAAB",
        "AAAAAAAAAOxTaGFyZXMgc3RpbGwgaGVsZCBieSB0aGlzIGNvbnRyYWN0IGFuZCBwdXJjaGFzYWJsZSByaWdodCBub3cuIFRoZXJlIGlzCm5vIHNlcGFyYXRlIHNvbGQgY291bnRlcjogaW52ZW50b3J5IG1vdmVzIGJvdGggd2F5cyAoYSBidXliYWNrIHJldHVybnMKc2hhcmVzIGhlcmUpLCBzbyBhIGNvdW50ZXIgd291bGQgYmUgYSBzZWNvbmQgdmVyc2lvbiBvZiB0aGlzIG51bWJlcgp0aGF0IGNhbiBkaXNhZ3JlZSB3aXRoIGl0LgAAAAlyZW1haW5pbmcAAAAAAAAAAAAAAQAAAAs=",
        "AAAAAAAAAZtDaGFuZ2UgdGhlIHBlci1zaGFyZSBwcmljZS4gQWRtaW4gb25seS4gSW4tZmxpZ2h0IHB1cmNoYXNlcyBhcmUKcHJvdGVjdGVkIGJ5IHRoZWlyIG93biBgbWF4X2Nvc3RgLgoKTm90IGFuIG9wZXJhdG9yIHBvd2VyLCBldmVuIHRob3VnaCBpdCBsb29rcyBsaWtlIGFuIGV2ZXJ5ZGF5IG9uZTogYQpwcmljZSBvZiAxIHN0cm9vcCBlbXB0aWVzIHRoZSBpbnZlbnRvcnkgaW50byB3aG9ldmVyIG5vdGljZXMgZmlyc3QsIHNvCmEgc3RvbGVuIGhvdCBrZXkgd291bGQgYmUgd29ydGggdGhlIHdob2xlIHRyYW5jaGUuIGBzZXRfYXZhaWxhYmxlYCBpcwp0aGUgb3BlcmF0b3IncyB2ZXJzaW9uIG9mIHRoZSBzYW1lIGluc3RpbmN0IC0gaXQgY2FuIHN0b3AgdGhlIHNhbGUKd2l0aG91dCBiZWluZyBhYmxlIHRvIGdpdmUgaXQgYXdheS4AAAAACXNldF9wcmljZQAAAAAAAAEAAAAAAAAABXByaWNlAAAAAAAACwAAAAA=",
        "AAAAAAAAATpQb2ludCB0aGlzIHNhbGUgYXQgdGhlIHJld2FyZHMgZGlzdHJpYnV0b3Igc28gYnV5ZXJzIGFyZSBzZXR0bGVkIGJ5CnRoZWlyIHB1cmNoYXNlLiBBZG1pbiBvbmx5LgoKQWRtaW4gcmF0aGVyIHRoYW4gb3BlcmF0b3IgYmVjYXVzZSBhIHdyb25nIGFkZHJlc3MgaGVyZSBmYWlscyBldmVyeQpgYnV5YCB1bnRpbCBpdCBpcyBjb3JyZWN0ZWQgLSBpdCBjYW5ub3QgbWlzZGlyZWN0IG1vbmV5LCBidXQgaXQgY2FuIHN0b3AKdGhlIHNhbGUsIGFuZCBzdG9wcGluZyB0aGUgc2FsZSBpcyBgc2V0X2F2YWlsYWJsZWAncyBqb2Igd2l0aCBpdHMgb3duCmV2ZW50LgAAAAAAC3NldF9yZXdhcmRzAAAAAAEAAAAAAAAAB3Jld2FyZHMAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAALc2hhcmVfdG9rZW4AAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAMYWNjZXB0X2FkbWluAAAAAAAAAAA=",
        "AAAAAAAAADBQYXltZW50IHRva2VuIGhlbGQgYnkgdGhlIGNvbnRyYWN0IGZvciBidXliYWNrcy4AAAAMYnV5YmFja19wb29sAAAAAAAAAAEAAAAL",
        "AAAAAAAAADpBZGQgcGF5bWVudCB0b2tlbiB0byB0aGUgYnV5YmFjayBwb29sLiBBbnlvbmUgbWF5IGZ1bmQgaXQuAAAAAAAMZnVuZF9idXliYWNrAAAAAgAAAAAAAAAEZnJvbQAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAAAAAAAAMc2V0X29wZXJhdG9yAAAAAQAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAA==",
        "AAAAAAAAA0FEZXBsb3ktdGltZSBpbml0aWFsaXphdGlvbiwgcnVuIG9uY2UgYW5kIGF0b21pY2FsbHkgd2l0aCB0aGUgZGVwbG95LgoKKiBgcHJpY2VgIC0gY29zdCBvZiBPTkUgc2hhcmUgaW4gbWluaW1hbCB1bml0cyBvZiBgcGF5bWVudF90b2tlbmAKKHN0cm9vcHMgZm9yIFhMTTogMSBYTE0gPSAxMF8wMDBfMDAwKS4KKiBgcmVnaXN0cnlgIC0gc2hhcmVkIGNvbXBsaWFuY2UgcmVnaXN0cnkgdGhhdCBkZWNpZGVzIHdobyBtYXkgaG9sZApzaGFyZXMuIE9uZSBLWUMgZGVjaXNpb24gc2VydmVzIGV2ZXJ5IGFzc2V0IGlzc3VlZCBhZ2FpbnN0IGl0LgoqIGBidXliYWNrX2Rpc2NvdW50X2Jwc2AgLSBob3cgZmFyIGJlbG93IHRoZSBwcmltYXJ5IHByaWNlIHRoZSBpc3N1ZXIKYnV5cyBzaGFyZXMgYmFjayAoNTAwID0gNSUpLCBjYXBwZWQgYXQgMzAlLiBGaXhlZCBoZXJlIHdpdGggbm8gc2V0dGVyCnNvIGl0IGNhbm5vdCBiZSBtb3ZlZCBhZ2FpbnN0IGEgaG9sZGVyIHdobyBpcyBhYm91dCB0byBleGl0LgoqIGBmZWVfdG9gIC8gYGNvbW1pc3Npb25fYnBzYCAtIHRoZSBwbGF0Zm9ybSdzIGN1dCBvZiBlYWNoIHB1cmNoYXNlLApjYXBwZWQgYXQgMzAlIGFuZCBmaXhlZCBoZXJlIGZvciB0aGUgc2FtZSByZWFzb24uIFRoZSBidXllciBwYXlzIHRoZQphZHZlcnRpc2VkIHByaWNlIGVpdGhlciB3YXk7IHRoZSBzcGxpdCBkZWNpZGVzIGhvdyBtdWNoIG9mIGl0IHJlYWNoZXMKdGhlIGlzc3VlcidzIHRyZWFzdXJ5LgoKVGhlIHNhbGUgc3RhcnRzIGRpc2FibGVkOiBjdXN0b2R5IGZ1bmRzIGl0IHdpdGggYSB0cmFuY2hlIGZpcnN0LCB0aGVuCnRoZSBzYWxlIGlzIHN3aXRjaGVkIG9uLgAAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAACQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAtzaGFyZV90b2tlbgAAAAATAAAAAAAAAA1wYXltZW50X3Rva2VuAAAAAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAAhyZWdpc3RyeQAAABMAAAAAAAAABmZlZV90bwAAAAAAEwAAAAAAAAAFcHJpY2UAAAAAAAALAAAAAAAAABRidXliYWNrX2Rpc2NvdW50X2JwcwAAAAQAAAAAAAAADmNvbW1pc3Npb25fYnBzAAAAAAAEAAAAAA==",
        "AAAAAAAAALVXaGF0IHRoZSBwb29sIHBheXMgZm9yIGBhbW91bnRgIHNoYXJlcyByaWdodCBub3cuIGBzZWxsYCBjYWxscyB0aGlzIHNhbWUKZnVuY3Rpb24sIHNvIHRoZSBxdW90ZSBvbiBzY3JlZW4gY2Fubm90IGRyaWZ0IGZyb20gdGhlIGFtb3VudCBwYWlkLgpSb3VuZHMgZG93biwgc28gdGhlIHBvb2wgbmV2ZXIgb3ZlcnBheXMuAAAAAAAADWJ1eWJhY2tfcXVvdGUAAAAAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAACw==",
        "AAAAAAAAAAAAAAANcGF5bWVudF90b2tlbgAAAAAAAAAAAAABAAAAEw==",
        "AAAAAAAAAAAAAAANcGVuZGluZ19hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=",
        "AAAAAAAAAIRFbmFibGUgb3IgZGlzYWJsZSBuZXcgcHVyY2hhc2VzLiBBZG1pbiBvciBvcGVyYXRvci4gRG9lcyBub3QgYWZmZWN0CmBzZWxsYDogY2xvc2luZyB0aGUgc2FsZSBtdXN0IG5ldmVyIHRyYXAgYSBob2xkZXIgd2hvIHdhbnRzIG91dC4AAAANc2V0X2F2YWlsYWJsZQAAAAAAAAIAAAAAAAAABmNhbGxlcgAAAAAAEwAAAAAAAAAJYXZhaWxhYmxlAAAAAAAAAQAAAAA=",
        "AAAAAAAAAC9UaGUgcGxhdGZvcm0ncyBjdXQsIGluIGJhc2lzIHBvaW50cyAoMjAwID0gMiUpLgAAAAAOY29tbWlzc2lvbl9icHMAAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAAAAAAAOdHJhbnNmZXJfYWRtaW4AAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
        "AAAAAAAAAI5QdWxsIHVuc29sZCBzaGFyZXMgYmFjayBvdXQgb2YgdGhlIGNvbnRyYWN0LiBBZG1pbiBvbmx5LiBgdG9gIHN0aWxsIGhhcwp0byBiZSBhZG1pdHRlZCBieSB0aGUgcmVnaXN0cnksIHNvIHRoZSBnYXRlIGFwcGxpZXMgdG8gdGhlIGlzc3VlciB0b28uAAAAAAAPd2l0aGRyYXdfc2hhcmVzAAAAAAIAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
        "AAAAAAAAAMdQdWxsIHBheW1lbnQgdG9rZW4gb3V0IG9mIHRoZSBidXliYWNrIHBvb2wuIEFkbWluIG9ubHkgLSB0aGlzIGlzIHRoZQpvbmUgZW50cnlwb2ludCBoZXJlIHRoYXQgbW92ZXMgbW9uZXkgb3V0d2FyZCwgc28gaXQgY29zdHMgdHdvIG9mIHRoZQp0aHJlZSBtdWx0aXNpZyBzaWduYXR1cmVzIGFuZCBpcyBvdXQgb2YgdGhlIG9wZXJhdG9yJ3MgcmVhY2guAAAAABB3aXRoZHJhd19idXliYWNrAAAAAgAAAAAAAAACdG8AAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAADpEaXNjb3VudCBhcHBsaWVkIHRvIGEgYnV5YmFjaywgaW4gYmFzaXMgcG9pbnRzICg1MDAgPSA1JSkuAAAAAAAUYnV5YmFja19kaXNjb3VudF9icHMAAAAAAAAAAQAAAAQ=",
        "AAAAAAAAAAAAAAAVY2FuY2VsX3RyYW5zZmVyX2FkbWluAAAAAAAAAAAAAAA=",
        "AAAAAAAAASdXaGF0IGBidXlgIHdvdWxkIGFjdHVhbGx5IGFjY2VwdCByaWdodCBub3c6IHRoZSBpbnZlbnRvcnksIG9yIHplcm8Kd2hpbGUgdGhlIHNhbGUgaXMgc3dpdGNoZWQgb2ZmLiBgcmVtYWluaW5nYCBhbnN3ZXJzICJ3aGF0IGlzIGhlbGQgaGVyZSIsCndoaWNoIGlzIHRoZSBob25lc3QgbnVtYmVyIGZvciBhbiBpbnZlbnRvcnkgcmVhZG91dCBidXQgdGhlIHdyb25nIG9uZQpmb3IgYSBidXkgYnV0dG9uIC0gYSBkaXNhYmxlZCBzYWxlIHdpdGggMzAwIHNoYXJlcyBpbiBpdCBpcyBub3QgMzAwCnNoYXJlcyBhdmFpbGFibGUuAAAAABZhdmFpbGFibGVfZm9yX3B1cmNoYXNlAAAAAAAAAAAAAQAAAAs=",
        "AAAABAAAAUxDb2RlcyBhcmUgdW5pcXVlIGFjcm9zcyBldmVyeSBjb250cmFjdCBpbiB0aGlzIGRlcGxveW1lbnQgKHJlZ2lzdHJ5IDF4eCwKc2hhcmUtdG9rZW4gMnh4LCBzYWxlIDN4eCwgZXhjaGFuZ2UgNHh4LCByZXdhcmRzIDV4eCkuIEEgY3Jvc3MtY29udHJhY3QKY2FsbCBzdXJmYWNlcyB0aGUgSU5ORVIgY29udHJhY3QncyBjb2RlLCBhbmQgYSBzaGFyZWQgbnVtYmVyaW5nIGlzIHdoYXQKbGV0cyB0aGUgVUkgdHVybiB0aGF0IGNvZGUgaW50byB0aGUgcmlnaHQgc2VudGVuY2UgaW5zdGVhZCBvZiBndWVzc2luZwpmcm9tIHdoaWNoZXZlciBjb250cmFjdCBpdCBoYXBwZW5lZCB0byBjYWxsLgAAAAAAAAAFRXJyb3IAAAAAAAALAAAAO1NhbGUgaXMgc3dpdGNoZWQgb2ZmIGJ5IHRoZSBhZG1pbiAoYHNldF9hdmFpbGFibGUoZmFsc2UpYCkuAAAAABBTYWxlTm90QXZhaWxhYmxlAAABLQAAADtgYW1vdW50YCwgYG1heF9jb3N0YCBhbmQgYG1pbl9wYXlvdXRgIG11c3QgYWxsIGJlIHBvc2l0aXZlLgAAAAANSW52YWxpZEFtb3VudAAAAAAAAS4AAAA0VGhlIHNhbGUgY29udHJhY3QgaG9sZHMgZmV3ZXIgc2hhcmVzIHRoYW4gcmVxdWVzdGVkLgAAABVJbnN1ZmZpY2llbnRJbnZlbnRvcnkAAAAAAAEvAAAAQmBwcmljZWAgbXVzdCBiZSBwb3NpdGl2ZSAoc3Ryb29wcyBvZiB0aGUgcGF5bWVudCB0b2tlbiBwZXIgc2hhcmUpLgAAAAAADEludmFsaWRQcmljZQAAATAAAABIYW1vdW50ICogcHJpY2Ugb3ZlcmZsb3dlZCBpMTI4LiBQcmFjdGljYWxseSB1bnJlYWNoYWJsZSwgY2hlY2tlZCBhbnl3YXkuAAAACE92ZXJmbG93AAABMQAAAD9UaGUgY29tcGxpYW5jZSByZWdpc3RyeSBkb2VzIG5vdCBsaXN0IHRoaXMgYWRkcmVzcyBhcyBlbGlnaWJsZS4AAAAADk5vdFdoaXRlbGlzdGVkAAAAAAEyAAAAP1RoZSBidXliYWNrIHBvb2wgaG9sZHMgbGVzcyBwYXltZW50IHRva2VuIHRoYW4gdGhlIHNlbGwgcGF5b3V0LgAAAAAYSW5zdWZmaWNpZW50QnV5YmFja0Z1bmRzAAABMwAAAD1CdXliYWNrIGRpc2NvdW50IGFib3ZlIHRoZSAzMCUgY2FwLCByZWplY3RlZCBhdCBjb25zdHJ1Y3Rpb24uAAAAAAAAD0ludmFsaWREaXNjb3VudAAAAAE0AAAAflRoZSBwcmljZSBtb3ZlZCBiZXR3ZWVuIHRoZSBxdW90ZSBhbmQgdGhpcyB0cmFuc2FjdGlvbjogdGhlIGNvc3Qgcm9zZQphYm92ZSBgbWF4X2Nvc3RgLCBvciB0aGUgcGF5b3V0IGZlbGwgYmVsb3cgYG1pbl9wYXlvdXRgLgAAAAAAClByaWNlTW92ZWQAAAAAATUAAADBVGhlIHRyZWFzdXJ5IG9yIHRoZSBmZWUgYWNjb3VudCBjYW5ub3QgYnV5IGZyb20gdGhlIHNhbGUgdGhhdCBwYXlzCnRoZW06IHRoZWlyIGxlZyBvZiB0aGUgcGF5bWVudCB3b3VsZCBiZSBhIHRyYW5zZmVyIHRvIHRoZW1zZWx2ZXMsIHNvCnRoZXkgd291bGQgcmVjZWl2ZSBzaGFyZXMgZm9yIGxlc3MgdGhhbiB0aGUgYXNraW5nIHByaWNlLgAAAAAAABFUcmVhc3VyeUNhbm5vdEJ1eQAAAAAAATYAAAA3Q29tbWlzc2lvbiBhYm92ZSB0aGUgMzAlIGNhcCwgcmVqZWN0ZWQgYXQgY29uc3RydWN0aW9uLgAAAAARSW52YWxpZENvbW1pc3Npb24AAAAAAAE3",
        "AAAABQAAARtQdWJsaXNoZWQgb24gZXZlcnkgc3VjY2Vzc2Z1bCBwdXJjaGFzZSAtIHRoZSBwcmltYXJ5IGV2ZW50IGFuIGluZGV4ZXIKd291bGQgZm9sbG93LiBgY29zdGAgaXMgd2hhdCB0aGUgYnV5ZXIgcGFpZCBpbiB0b3RhbDsgYGNvbW1pc3Npb25gIGlzIHRoZQpzbGljZSBvZiBpdCB0aGF0IHdlbnQgdG8gdGhlIGZlZSBhY2NvdW50IHJhdGhlciB0aGFuIHRoZSB0cmVhc3VyeSwgc28gdGhlCmlzc3VlcidzIGFjdHVhbCByZWNlaXB0cyBjYW4gYmUgcmVjb25zdHJ1Y3RlZCBmcm9tIHRoZSBsb2cgYWxvbmUuAAAAAAAAAAADQnV5AAAAAAEAAAADYnV5AAAAAAQAAAAAAAAABWJ1eWVyAAAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAABGNvc3QAAAALAAAAAAAAAAAAAAAKY29tbWlzc2lvbgAAAAAACwAAAAAAAAAB",
        "AAAABQAAAE9TaGFyZXMgc29sZCBiYWNrIHRvIHRoZSBjb250cmFjdCBhdCB0aGUgY3VycmVudCBwcmljZQphZ2FpbnN0IHRoZSBidXliYWNrIHBvb2wuAAAAAAAAAAAEU2VsbAAAAAEAAAAEc2VsbAAAAAMAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAABnBheW91dAAAAAAACwAAAAAAAAAB",
        "AAAABQAAAIlUaGUgc2FsZSB3YXMgcG9pbnRlZCBhdCBhIHJld2FyZHMgZGlzdHJpYnV0b3IsIHNvIGJ1eWVycyBhcmUgbm93IHNldHRsZWQKYnkgdGhlaXIgb3duIHB1cmNoYXNlIHJhdGhlciB0aGFuIGJ5IGEgc2Vjb25kIGNhbGwgb2YgdGhlaXIgb3duLgAAAAAAAAAAAAAKUmV3YXJkc1NldAAAAAAAAQAAAAtyZXdhcmRzX3NldAAAAAABAAAAAAAAAAdyZXdhcmRzAAAAABMAAAABAAAAAA==",
        "AAAABQAAAAAAAAAAAAAADFByaWNlQ2hhbmdlZAAAAAEAAAANcHJpY2VfY2hhbmdlZAAAAAAAAAIAAAAAAAAAA29sZAAAAAALAAAAAAAAAAAAAAADbmV3AAAAAAsAAAAAAAAAAQ==",
        "AAAABQAAAD1QYXltZW50IHRva2VuIGFkZGVkIHRvIHRoZSBidXliYWNrIHBvb2wgaGVsZCBieSB0aGUgY29udHJhY3QuAAAAAAAAAAAAAA1CdXliYWNrRnVuZGVkAAAAAAAAAQAAAA5idXliYWNrX2Z1bmRlZAAAAAAAAgAAAAAAAAAEZnJvbQAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAQ==",
        "AAAABQAAAC9BZG1pbiBwdWxsZWQgdW5zb2xkIHNoYXJlcyBvdXQgb2YgdGhlIGNvbnRyYWN0LgAAAAAAAAAAD1NoYXJlc1dpdGhkcmF3bgAAAAABAAAAEHNoYXJlc193aXRoZHJhd24AAAACAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAA",
        "AAAABQAAADNBZG1pbiBwdWxsZWQgcGF5bWVudCB0b2tlbiBvdXQgb2YgdGhlIGJ1eWJhY2sgcG9vbC4AAAAAAAAAABBCdXliYWNrV2l0aGRyYXduAAAAAQAAABFidXliYWNrX3dpdGhkcmF3bgAAAAAAAAIAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAE=",
        "AAAABQAAAAAAAAAAAAAAE0F2YWlsYWJpbGl0eUNoYW5nZWQAAAAAAQAAABRhdmFpbGFiaWxpdHlfY2hhbmdlZAAAAAEAAAAAAAAACWF2YWlsYWJsZQAAAAAAAAEAAAAAAAAAAA==",
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
    buy: this.txFromJSON<null>,
        sell: this.txFromJSON<null>,
        admin: this.txFromJSON<string>,
        price: this.txFromJSON<i128>,
        fee_to: this.txFromJSON<string>,
        rewards: this.txFromJSON<Option<string>>,
        upgrade: this.txFromJSON<null>,
        operator: this.txFromJSON<string>,
        registry: this.txFromJSON<string>,
        treasury: this.txFromJSON<string>,
        available: this.txFromJSON<boolean>,
        remaining: this.txFromJSON<i128>,
        set_price: this.txFromJSON<null>,
        set_rewards: this.txFromJSON<null>,
        share_token: this.txFromJSON<string>,
        accept_admin: this.txFromJSON<null>,
        buyback_pool: this.txFromJSON<i128>,
        fund_buyback: this.txFromJSON<null>,
        set_operator: this.txFromJSON<null>,
        buyback_quote: this.txFromJSON<i128>,
        payment_token: this.txFromJSON<string>,
        pending_admin: this.txFromJSON<Option<string>>,
        set_available: this.txFromJSON<null>,
        commission_bps: this.txFromJSON<u32>,
        transfer_admin: this.txFromJSON<null>,
        withdraw_shares: this.txFromJSON<null>,
        withdraw_buyback: this.txFromJSON<null>,
        buyback_discount_bps: this.txFromJSON<u32>,
        cancel_transfer_admin: this.txFromJSON<null>,
        available_for_purchase: this.txFromJSON<i128>
  }
}