import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions } from "@stellar/stellar-sdk/contract";
import type { i128, Option } from "@stellar/stellar-sdk/contract";
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
    tag: "Registry";
    values: void;
} | {
    tag: "TotalShares";
    values: void;
} | {
    tag: "AccPerShare";
    values: void;
} | {
    tag: "TotalDeposited";
    values: void;
} | {
    tag: "TotalClaimed";
    values: void;
} | {
    tag: "Settled";
    values: readonly [string];
} | {
    tag: "Owed";
    values: readonly [string];
} | {
    tag: "Claimed";
    values: readonly [string];
};
/**
 * A holder's position as of the last settle.
 */
export interface Position {
    /**
   * Accumulator level at that moment.
   */
    acc: i128;
    /**
   * Shares the holder had when the position was last settled.
   */
    balance: i128;
}
/**
 * Codes are unique across every contract in this deployment (registry 1xx,
 * share-token 2xx, sale 3xx, exchange 4xx, rewards 5xx). A cross-contract
 * call surfaces the INNER contract's code, and a shared numbering is what
 * lets the UI turn that code into the right sentence instead of guessing
 * from whichever contract it happened to call.
 */
export declare const Errors: {
    /**
     * The caller has no accrued rewards to claim right now.
     */
    501: {
        message: string;
    };
    /**
     * Amounts must be positive whole numbers.
     */
    502: {
        message: string;
    };
    /**
     * Accumulator arithmetic overflowed i128. Practically unreachable.
     */
    503: {
        message: string;
    };
    /**
     * The holder is suspended in the compliance registry. Their rewards keep
     * accruing and stay in the pool until the suspension is lifted.
     */
    504: {
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
     * Construct and simulate a pool transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Payment token this contract is actually holding.
     *
     * Together with `outstanding` this is the solvency check, and it is a
     * check anyone can run from an explorer without trusting a word of this
     * documentation. Our Polygon contracts expose the same pair
     * (`rewardStorage` / `needRewardStorage`); the difference is that there
     * the admin can withdraw the backing and the discipline is off-chain,
     * whereas this contract has no withdrawal entrypoint at all. Deposited
     * rent can only ever leave through a holder's `claim`.
     */
    pool: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Claim everything accrued to the caller. Settles first, so a claim is
     * always against an up-to-date position.
     */
    claim: ({ user }: {
        user: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a earned transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Lifetime rewards for the holder: already claimed + claimable now.
     */
    earned: ({ user }: {
        user: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a settle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Bring an address up to date without paying anything out. Permissionless
     * and free of authorization on purpose: it can only ever move rewards
     * from "accruing" to "banked" for the address named, so anyone may run it
     * for anyone, and a wallet that just bought shares needs it before those
     * shares start earning.
     */
    settle: ({ user }: {
        user: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a claimed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Lifetime total the holder has already claimed.
     */
    claimed: ({ user }: {
        user: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Deposit a reward round for everyone holding shares right now. Admin or
     * operator; on the platform this is the writer bot distributing rent
     * income, month after month, which is exactly the job a hot key exists
     * for. It is also the safest call in the deployment to give away: the
     * money moves from `from` into the pool, and this contract has no
     * entrypoint that moves it back out to anyone but a holder claiming.
     *
     * Holders who acquire shares after this call earn nothing from it, which
     * is the point: you cannot be paid rent for a month you did not own the
     * property.
     */
    deposit: ({ from, amount }: {
        from: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    upgrade: ({ new_wasm_hash }: {
        new_wasm_hash: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The hot key that may deposit a reward round.
     */
    operator: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a position transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The holder's position as of their last settle. `balance` is how many
     * shares are currently earning; a wallet showing fewer here than it holds
     * needs `settle`.
     */
    position: ({ user }: {
        user: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<Position>>;
    /**
     * Construct and simulate a registry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The compliance registry consulted before a payout.
     */
    registry: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a claimable transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Rewards the holder can claim right now.
     */
    claimable: ({ user }: {
        user: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a outstanding transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Upper bound on what every holder could still claim.
     *
     * Deposited minus claimed, which over-states the real liability: rounds
     * that accrued to shares held by the sale contract, or forfeited by a
     * transfer before a settle, are counted here and will never be claimed.
     * Over-stating is the safe direction - `pool >= outstanding` proves
     * solvency, and it stays true even as the bound loosens.
     */
    outstanding: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
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
     * Construct and simulate a total_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    total_shares: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a payment_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    payment_token: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>;
    /**
     * Construct and simulate a total_claimed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Total paid out across every holder.
     */
    total_claimed: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    transfer_admin: ({ new_admin }: {
        new_admin: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a total_deposited transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Total rewards ever deposited by the issuer.
     */
    total_deposited: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a cancel_transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    cancel_transfer_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, share_token, payment_token, registry, total_shares }: {
        admin: string;
        share_token: string;
        payment_token: string;
        registry: string;
        total_shares: i128;
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
        pool: (json: string) => AssembledTransaction<bigint>;
        admin: (json: string) => AssembledTransaction<string>;
        claim: (json: string) => AssembledTransaction<null>;
        earned: (json: string) => AssembledTransaction<bigint>;
        settle: (json: string) => AssembledTransaction<null>;
        claimed: (json: string) => AssembledTransaction<bigint>;
        deposit: (json: string) => AssembledTransaction<null>;
        upgrade: (json: string) => AssembledTransaction<null>;
        operator: (json: string) => AssembledTransaction<string>;
        position: (json: string) => AssembledTransaction<Position>;
        registry: (json: string) => AssembledTransaction<string>;
        claimable: (json: string) => AssembledTransaction<bigint>;
        outstanding: (json: string) => AssembledTransaction<bigint>;
        share_token: (json: string) => AssembledTransaction<string>;
        accept_admin: (json: string) => AssembledTransaction<null>;
        set_operator: (json: string) => AssembledTransaction<null>;
        total_shares: (json: string) => AssembledTransaction<bigint>;
        payment_token: (json: string) => AssembledTransaction<string>;
        pending_admin: (json: string) => AssembledTransaction<Option<string>>;
        total_claimed: (json: string) => AssembledTransaction<bigint>;
        transfer_admin: (json: string) => AssembledTransaction<null>;
        total_deposited: (json: string) => AssembledTransaction<bigint>;
        cancel_transfer_admin: (json: string) => AssembledTransaction<null>;
    };
}
