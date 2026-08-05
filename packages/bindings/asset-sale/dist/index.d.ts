import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions } from "@stellar/stellar-sdk/contract";
import type { u32, i128, Option } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export type DataKey = {
    tag: "ShareToken";
    values: void;
} | {
    tag: "PaymentToken";
    values: void;
} | {
    tag: "Treasury";
    values: void;
} | {
    tag: "Price";
    values: void;
} | {
    tag: "Available";
    values: void;
} | {
    tag: "Registry";
    values: void;
} | {
    tag: "BuybackDiscountBps";
    values: void;
} | {
    tag: "FeeTo";
    values: void;
} | {
    tag: "CommissionBps";
    values: void;
} | {
    tag: "Rewards";
    values: void;
};
/**
 * Codes are unique across every contract in this deployment (registry 1xx,
 * share-token 2xx, sale 3xx, exchange 4xx, rewards 5xx). A cross-contract
 * call surfaces the INNER contract's code, and a shared numbering is what
 * lets the UI turn that code into the right sentence instead of guessing
 * from whichever contract it happened to call.
 */
export declare const Errors: {
    /**
     * Sale is switched off by the admin (`set_available(false)`).
     */
    301: {
        message: string;
    };
    /**
     * `amount`, `max_cost` and `min_payout` must all be positive.
     */
    302: {
        message: string;
    };
    /**
     * The sale contract holds fewer shares than requested.
     */
    303: {
        message: string;
    };
    /**
     * `price` must be positive (stroops of the payment token per share).
     */
    304: {
        message: string;
    };
    /**
     * amount * price overflowed i128. Practically unreachable, checked anyway.
     */
    305: {
        message: string;
    };
    /**
     * The compliance registry does not list this address as eligible.
     */
    306: {
        message: string;
    };
    /**
     * The buyback pool holds less payment token than the sell payout.
     */
    307: {
        message: string;
    };
    /**
     * Buyback discount above the 30% cap, rejected at construction.
     */
    308: {
        message: string;
    };
    /**
     * The price moved between the quote and this transaction: the cost rose
     * above `max_cost`, or the payout fell below `min_payout`.
     */
    309: {
        message: string;
    };
    /**
     * The treasury or the fee account cannot buy from the sale that pays
     * them: their leg of the payment would be a transfer to themselves, so
     * they would receive shares for less than the asking price.
     */
    310: {
        message: string;
    };
    /**
     * Commission above the 30% cap, rejected at construction.
     */
    311: {
        message: string;
    };
};
/**
 * Named apart from each contract's own `Error` so the two never collide in
 * the contract spec the bindings are generated from.
 *
 * 9xx is reserved for governance in every contract of this deployment
 * (registry 1xx, share-token 2xx, sale 3xx, exchange 4xx, rewards 5xx), so a
 * code arriving from a cross-contract call still says what happened without
 * the caller having to know which contract produced it.
 */
export declare const AccessError: {
    /**
     * The caller holds neither the admin nor the operator role.
     */
    901: {
        message: string;
    };
    /**
     * `accept_admin` was called with no handover in progress.
     */
    902: {
        message: string;
    };
};
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
    buy: ({ buyer, amount, max_cost }: {
        buyer: string;
        amount: i128;
        max_cost: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
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
    sell: ({ seller, amount, min_payout }: {
        seller: string;
        amount: i128;
        min_payout: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a price transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    price: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a fee_to transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Receives the platform's cut of each purchase.
     */
    fee_to: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a rewards transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The distributor buyers are settled against, or `None` while unset.
     */
    rewards: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>;
    /**
     * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    upgrade: ({ new_wasm_hash }: {
        new_wasm_hash: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The hot key that may open and close the sale, and nothing else here.
     */
    operator: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a registry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The compliance registry this sale defers eligibility to.
     */
    registry: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a treasury transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    treasury: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a available transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    available: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;
    /**
     * Construct and simulate a remaining transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Shares still held by this contract and purchasable right now. There is
     * no separate sold counter: inventory moves both ways (a buyback returns
     * shares here), so a counter would be a second version of this number
     * that can disagree with it.
     */
    remaining: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
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
    set_price: ({ price }: {
        price: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
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
    set_rewards: ({ rewards }: {
        rewards: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a share_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    share_token: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a buyback_pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Payment token held by the contract for buybacks.
     */
    buyback_pool: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a fund_buyback transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Add payment token to the buyback pool. Anyone may fund it.
     */
    fund_buyback: ({ from, amount }: {
        from: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a set_operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    set_operator: ({ operator }: {
        operator: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a buyback_quote transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * What the pool pays for `amount` shares right now. `sell` calls this same
     * function, so the quote on screen cannot drift from the amount paid.
     * Rounds down, so the pool never overpays.
     */
    buyback_quote: ({ amount }: {
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a payment_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    payment_token: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>;
    /**
     * Construct and simulate a set_available transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Enable or disable new purchases. Admin or operator. Does not affect
     * `sell`: closing the sale must never trap a holder who wants out.
     */
    set_available: ({ caller, available }: {
        caller: string;
        available: boolean;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a commission_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The platform's cut, in basis points (200 = 2%).
     */
    commission_bps: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;
    /**
     * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    transfer_admin: ({ new_admin }: {
        new_admin: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a withdraw_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Pull unsold shares back out of the contract. Admin only. `to` still has
     * to be admitted by the registry, so the gate applies to the issuer too.
     */
    withdraw_shares: ({ to, amount }: {
        to: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a withdraw_buyback transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Pull payment token out of the buyback pool. Admin only - this is the
     * one entrypoint here that moves money outward, so it costs two of the
     * three multisig signatures and is out of the operator's reach.
     */
    withdraw_buyback: ({ to, amount }: {
        to: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a buyback_discount_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Discount applied to a buyback, in basis points (500 = 5%).
     */
    buyback_discount_bps: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;
    /**
     * Construct and simulate a cancel_transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    cancel_transfer_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a available_for_purchase transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * What `buy` would actually accept right now: the inventory, or zero
     * while the sale is switched off. `remaining` answers "what is held here",
     * which is the honest number for an inventory readout but the wrong one
     * for a buy button - a disabled sale with 300 shares in it is not 300
     * shares available.
     */
    available_for_purchase: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, share_token, payment_token, treasury, registry, fee_to, price, buyback_discount_bps, commission_bps }: {
        admin: string;
        share_token: string;
        payment_token: string;
        treasury: string;
        registry: string;
        fee_to: string;
        price: i128;
        buyback_discount_bps: u32;
        commission_bps: u32;
    }, 
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions & Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
    }): Promise<AssembledTransaction<T>>;
    constructor(options: ContractClientOptions);
    readonly fromJSON: {
        buy: (json: string) => AssembledTransaction<null>;
        sell: (json: string) => AssembledTransaction<null>;
        admin: (json: string) => AssembledTransaction<string>;
        price: (json: string) => AssembledTransaction<bigint>;
        fee_to: (json: string) => AssembledTransaction<string>;
        rewards: (json: string) => AssembledTransaction<Option<string>>;
        upgrade: (json: string) => AssembledTransaction<null>;
        operator: (json: string) => AssembledTransaction<string>;
        registry: (json: string) => AssembledTransaction<string>;
        treasury: (json: string) => AssembledTransaction<string>;
        available: (json: string) => AssembledTransaction<boolean>;
        remaining: (json: string) => AssembledTransaction<bigint>;
        set_price: (json: string) => AssembledTransaction<null>;
        set_rewards: (json: string) => AssembledTransaction<null>;
        share_token: (json: string) => AssembledTransaction<string>;
        accept_admin: (json: string) => AssembledTransaction<null>;
        buyback_pool: (json: string) => AssembledTransaction<bigint>;
        fund_buyback: (json: string) => AssembledTransaction<null>;
        set_operator: (json: string) => AssembledTransaction<null>;
        buyback_quote: (json: string) => AssembledTransaction<bigint>;
        payment_token: (json: string) => AssembledTransaction<string>;
        pending_admin: (json: string) => AssembledTransaction<Option<string>>;
        set_available: (json: string) => AssembledTransaction<null>;
        commission_bps: (json: string) => AssembledTransaction<number>;
        transfer_admin: (json: string) => AssembledTransaction<null>;
        withdraw_shares: (json: string) => AssembledTransaction<null>;
        withdraw_buyback: (json: string) => AssembledTransaction<null>;
        buyback_discount_bps: (json: string) => AssembledTransaction<number>;
        cancel_transfer_admin: (json: string) => AssembledTransaction<null>;
        available_for_purchase: (json: string) => AssembledTransaction<bigint>;
    };
}
