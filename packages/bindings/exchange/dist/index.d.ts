import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions } from "@stellar/stellar-sdk/contract";
import type { u32, u64, i128, Option } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
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
export type DataKey = {
    tag: "ShareToken";
    values: void;
} | {
    tag: "PaymentToken";
    values: void;
} | {
    tag: "Registry";
    values: void;
} | {
    tag: "FeeTo";
    values: void;
} | {
    tag: "CommissionBps";
    values: void;
} | {
    tag: "MinRate";
    values: void;
} | {
    tag: "MaxRate";
    values: void;
} | {
    tag: "Available";
    values: void;
} | {
    tag: "NextOrderId";
    values: void;
} | {
    tag: "OrderIds";
    values: void;
} | {
    tag: "Order";
    values: readonly [u64];
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
     * Trading is switched off by the admin (`set_available(false)`).
     */
    401: {
        message: string;
    };
    /**
     * `amount` must be a positive whole number of shares.
     */
    402: {
        message: string;
    };
    /**
     * `rate` must sit inside the `[min_rate, max_rate]` band.
     */
    403: {
        message: string;
    };
    /**
     * No active order with this id (never existed, filled, or cancelled).
     */
    404: {
        message: string;
    };
    /**
     * Buying from your own order is pointless, and blocked.
     */
    405: {
        message: string;
    };
    /**
     * Requested more shares than the order still holds.
     */
    406: {
        message: string;
    };
    /**
     * Only the seller who placed the order may cancel it this way.
     */
    407: {
        message: string;
    };
    /**
     * The buyer is not cleared by the compliance registry.
     */
    408: {
        message: string;
    };
    /**
     * amount * rate overflowed i128. Practically unreachable, checked anyway.
     */
    409: {
        message: string;
    };
    /**
     * Constructor got an invalid config value (rate band or commission).
     */
    410: {
        message: string;
    };
    /**
     * The order's seller is no longer cleared by the registry, so the fill
     * would pay proceeds to a revoked address. Their escrow stays frozen
     * until the KYC provider admits them again.
     */
    411: {
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
     * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a order transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * A single open order, if it exists.
     */
    order: ({ order_id }: {
        order_id: u64;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Option<Order>>>;
    /**
     * Construct and simulate a fee_to transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    fee_to: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a orders transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Every open order, oldest first. The PoC book is small enough to return
     * whole; a production deployment pages this through an indexer.
     */
    orders: (options?: MethodOptions) => Promise<AssembledTransaction<Array<Order>>>;
    /**
     * Construct and simulate a rewards transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The distributor filling buyers are settled against, or `None` if unset.
     */
    rewards: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>;
    /**
     * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    upgrade: ({ new_wasm_hash }: {
        new_wasm_hash: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a max_rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    max_rate: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a min_rate transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    min_rate: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The hot key that may halt trading and force-cancel an order.
     */
    operator: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a registry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The compliance registry this market defers eligibility to.
     */
    registry: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
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
    add_order: ({ seller, amount, rate }: {
        seller: string;
        amount: i128;
        rate: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<u64>>;
    /**
     * Construct and simulate a available transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    available: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;
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
    swap_order: ({ buyer, order_id, amount }: {
        buyer: string;
        order_id: u64;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a close_order transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Cancel your own order: the remaining escrowed shares return to you.
     * Allowed even when trading is disabled - sellers can always exit.
     */
    close_order: ({ seller, order_id }: {
        seller: string;
        order_id: u64;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
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
     * Construct and simulate a set_operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    set_operator: ({ operator }: {
        operator: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
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
     * Enable/disable trading. Admin or operator. Cancelling stays open either
     * way, so a halted market never locks a seller's escrow in.
     */
    set_available: ({ caller, available }: {
        caller: string;
        available: boolean;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a close_order_by transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Force-cancel any order. Admin or operator - the escrow returns to its
     * seller and can go nowhere else, so the worst a stolen hot key does here
     * is hand people their own shares back.
     */
    close_order_by: ({ caller, order_id }: {
        caller: string;
        order_id: u64;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a commission_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    commission_bps: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;
    /**
     * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    transfer_admin: ({ new_admin }: {
        new_admin: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a cancel_transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    cancel_transfer_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, share_token, payment_token, registry, fee_to, commission_bps, min_rate, max_rate }: {
        admin: string;
        share_token: string;
        payment_token: string;
        registry: string;
        fee_to: string;
        commission_bps: u32;
        min_rate: i128;
        max_rate: i128;
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
        admin: (json: string) => AssembledTransaction<string>;
        order: (json: string) => AssembledTransaction<Option<Order>>;
        fee_to: (json: string) => AssembledTransaction<string>;
        orders: (json: string) => AssembledTransaction<Order[]>;
        rewards: (json: string) => AssembledTransaction<Option<string>>;
        upgrade: (json: string) => AssembledTransaction<null>;
        max_rate: (json: string) => AssembledTransaction<bigint>;
        min_rate: (json: string) => AssembledTransaction<bigint>;
        operator: (json: string) => AssembledTransaction<string>;
        registry: (json: string) => AssembledTransaction<string>;
        add_order: (json: string) => AssembledTransaction<bigint>;
        available: (json: string) => AssembledTransaction<boolean>;
        swap_order: (json: string) => AssembledTransaction<null>;
        close_order: (json: string) => AssembledTransaction<null>;
        set_rewards: (json: string) => AssembledTransaction<null>;
        share_token: (json: string) => AssembledTransaction<string>;
        accept_admin: (json: string) => AssembledTransaction<null>;
        set_operator: (json: string) => AssembledTransaction<null>;
        payment_token: (json: string) => AssembledTransaction<string>;
        pending_admin: (json: string) => AssembledTransaction<Option<string>>;
        set_available: (json: string) => AssembledTransaction<null>;
        close_order_by: (json: string) => AssembledTransaction<null>;
        commission_bps: (json: string) => AssembledTransaction<number>;
        transfer_admin: (json: string) => AssembledTransaction<null>;
        cancel_transfer_admin: (json: string) => AssembledTransaction<null>;
    };
}
