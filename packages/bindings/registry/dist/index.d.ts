import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions } from "@stellar/stellar-sdk/contract";
import type { Option } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export type DataKey = {
    tag: "KycProvider";
    values: void;
} | {
    tag: "Paused";
    values: void;
} | {
    tag: "Investor";
    values: readonly [string];
} | {
    tag: "Participant";
    values: readonly [string];
} | {
    tag: "Frozen";
    values: readonly [string];
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
     * Called by an address that is not the registered KYC provider.
     */
    101: {
        message: string;
    };
    /**
     * The address is not cleared to hold shares of this asset.
     */
    102: {
        message: string;
    };
    /**
     * A batch was empty or longer than `MAX_BATCH`.
     */
    103: {
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
    pause: ({ caller }: {
        caller: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
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
    freeze: ({ provider, user }: {
        provider: string;
        user: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a frozen transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Verified but suspended.
     */
    frozen: ({ addr }: {
        addr: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;
    /**
     * Construct and simulate a paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Is the whole deployment halted?
     */
    paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;
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
    resume: (options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a revoke transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Withdraw an investor's eligibility - a sanctions hit, an expired
     * re-verification, a closed account. Shares already held are untouched;
     * what stops is the ability to receive or move them.
     */
    revoke: ({ provider, user }: {
        provider: string;
        user: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a allowed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * May this address hold shares? The question every token transfer asks,
     * and the single point the halt and the freeze list act through.
     */
    allowed: ({ addr }: {
        addr: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;
    /**
     * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    upgrade: ({ new_wasm_hash }: {
        new_wasm_hash: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The hot key that may halt the deployment but not lift the halt.
     */
    operator: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a register transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * DEMO SHORTCUT - the caller admits THEMSELVES, so a reviewer can walk
     * the whole flow on testnet without us running a KYC vendor. This
     * entrypoint does not exist in a production deployment;
     * `register_verified` is the real path.
     */
    register: ({ user }: {
        user: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a unfreeze transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Lift a suspension. The underlying verification was never removed, so
     * this is all it takes to make the address eligible again.
     */
    unfreeze: ({ provider, user }: {
        provider: string;
        user: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a participant transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    participant: ({ addr }: {
        addr: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;
    /**
     * Construct and simulate a whitelisted transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Admitted as an investor (as opposed to protocol infrastructure).
     * Raw verification status: unlike `allowed` this ignores the halt and the
     * freeze list, so a UI can tell "never verified" from "verified, blocked".
     */
    whitelisted: ({ addr }: {
        addr: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;
    /**
     * Construct and simulate a accept_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    accept_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a kyc_provider transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    kyc_provider: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a set_operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    set_operator: ({ operator }: {
        operator: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The successor named by `transfer_admin` and still to accept.
     */
    pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>;
    /**
     * Construct and simulate a transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    transfer_admin: ({ new_admin }: {
        new_admin: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a set_participant transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Admit or remove a protocol contract - the sale holding inventory, the
     * exchange holding escrow, the address unsold inventory is withdrawn to.
     * Admin only, and separate from the investor list on purpose: the admin
     * must not be able to admit investors.
     */
    set_participant: ({ addr, allowed }: {
        addr: string;
        allowed: boolean;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a set_kyc_provider transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Rotate the provider. Admin only. Rotation is why this is stored state
     * and not a constructor constant: changing KYC vendor must not mean
     * redeploying and migrating every entry.
     */
    set_kyc_provider: ({ provider }: {
        provider: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a register_verified transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Admit an investor after an off-chain KYC decision (SEP-12). The
     * provider signs; the investor does not have to be online.
     */
    register_verified: ({ provider, user }: {
        provider: string;
        user: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a cancel_transfer_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    cancel_transfer_admin: (options?: MethodOptions) => Promise<AssembledTransaction<null>>;
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
    register_verified_batch: ({ provider, users }: {
        provider: string;
        users: Array<string>;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, kyc_provider }: {
        admin: string;
        kyc_provider: string;
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
        pause: (json: string) => AssembledTransaction<null>;
        freeze: (json: string) => AssembledTransaction<null>;
        frozen: (json: string) => AssembledTransaction<boolean>;
        paused: (json: string) => AssembledTransaction<boolean>;
        resume: (json: string) => AssembledTransaction<null>;
        revoke: (json: string) => AssembledTransaction<null>;
        allowed: (json: string) => AssembledTransaction<boolean>;
        upgrade: (json: string) => AssembledTransaction<null>;
        operator: (json: string) => AssembledTransaction<string>;
        register: (json: string) => AssembledTransaction<null>;
        unfreeze: (json: string) => AssembledTransaction<null>;
        participant: (json: string) => AssembledTransaction<boolean>;
        whitelisted: (json: string) => AssembledTransaction<boolean>;
        accept_admin: (json: string) => AssembledTransaction<null>;
        kyc_provider: (json: string) => AssembledTransaction<string>;
        set_operator: (json: string) => AssembledTransaction<null>;
        pending_admin: (json: string) => AssembledTransaction<Option<string>>;
        transfer_admin: (json: string) => AssembledTransaction<null>;
        set_participant: (json: string) => AssembledTransaction<null>;
        set_kyc_provider: (json: string) => AssembledTransaction<null>;
        register_verified: (json: string) => AssembledTransaction<null>;
        cancel_transfer_admin: (json: string) => AssembledTransaction<null>;
        register_verified_batch: (json: string) => AssembledTransaction<null>;
    };
}
