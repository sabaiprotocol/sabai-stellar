import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions } from "@stellar/stellar-sdk/contract";
import type { u32, i128, Option } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
/**
 * Codes are unique across every contract in this deployment (registry 1xx,
 * share-token 2xx, sale 3xx, exchange 4xx, rewards 5xx). A cross-contract
 * call surfaces the INNER contract's code, and a shared numbering is what
 * lets the UI turn that code into the right sentence instead of guessing
 * from whichever contract it happened to call.
 */
export declare const Errors: {
    201: {
        message: string;
    };
    202: {
        message: string;
    };
    203: {
        message: string;
    };
    204: {
        message: string;
    };
    /**
     * One side of the transfer is not cleared to hold shares.
     */
    205: {
        message: string;
    };
    /**
     * A balance or the total supply would exceed i128. Unreachable at any
     * real supply, checked because release-mode Rust wraps instead of
     * trapping.
     */
    206: {
        message: string;
    };
    /**
     * The mint would push the total supply past the cap fixed at deployment.
     */
    207: {
        message: string;
    };
    /**
     * `max_supply` must be a positive number of shares.
     */
    208: {
        message: string;
    };
    /**
     * The issuance already happened. There is no second one.
     */
    209: {
        message: string;
    };
    /**
     * `set_terms` was given an empty document hash, jurisdiction or URI.
     */
    210: {
        message: string;
    };
};
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
export type DataKey = {
    tag: "Name";
    values: void;
} | {
    tag: "Symbol";
    values: void;
} | {
    tag: "TotalSupply";
    values: void;
} | {
    tag: "MaxSupply";
    values: void;
} | {
    tag: "Issued";
    values: void;
} | {
    tag: "Treasury";
    values: void;
} | {
    tag: "Registry";
    values: void;
} | {
    tag: "Terms";
    values: void;
} | {
    tag: "Balance";
    values: readonly [string];
} | {
    tag: "Allowance";
    values: readonly [string, string];
};
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
     * Construct and simulate a burn transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    burn: ({ from, amount }: {
        from: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
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
    mint: ({ to, amount }: {
        to: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a name transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    name: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a terms transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The legal wrapper, if the issuer has published one. `None` is a real
     * answer and a wallet should show it as one: shares with no terms behind
     * them are shares of nothing.
     */
    terms: (options?: MethodOptions) => Promise<AssembledTransaction<Option<Terms>>>;
    /**
     * Construct and simulate a issued transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Has the one-time issuance already happened?
     */
    issued: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>;
    /**
     * Construct and simulate a symbol transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    symbol: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a approve transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    approve: ({ from, spender, amount, live_until_ledger }: {
        from: string;
        spender: string;
        amount: i128;
        live_until_ledger: u32;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    balance: ({ id }: {
        id: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    upgrade: ({ new_wasm_hash }: {
        new_wasm_hash: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a decimals transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Shares are indivisible: decimals = 0.
     */
    decimals: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;
    /**
     * Construct and simulate a operator transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Stored for symmetry with the other four contracts and unused here: this
     * token has no entrypoint a hot key may call. Issuing and confiscating
     * shares are exactly the decisions that must cost two signatures.
     */
    operator: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a registry transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * The compliance registry every movement of shares is checked against.
     */
    registry: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * `to` is a MuxedAddress (CAP-67): wallets/exchanges may attach a mux id
     * to one Stellar account. Balances are tracked per underlying Address.
     */
    transfer: ({ from, to, amount }: {
        from: string;
        to: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a treasury transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Custody address: where the issuance went and the only place a forced
     * revocation can send shares.
     */
    treasury: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a allowance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    allowance: ({ from, spender }: {
        from: string;
        spender: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a burn_from transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    burn_from: ({ spender, from, amount }: {
        spender: string;
        from: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
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
    set_terms: ({ terms }: {
        terms: Terms;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a max_supply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     * Ceiling on `total_supply`, fixed at deployment and with no setter.
     */
    max_supply: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
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
     * Construct and simulate a total_supply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    total_supply: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a pending_admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    pending_admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>;
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
    revoke_shares: ({ from, amount }: {
        from: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a transfer_from transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    transfer_from: ({ spender, from, to, amount }: {
        spender: string;
        from: string;
        to: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
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
    { admin, name, symbol, registry, treasury, max_supply }: {
        admin: string;
        name: string;
        symbol: string;
        registry: string;
        treasury: string;
        max_supply: i128;
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
        burn: (json: string) => AssembledTransaction<null>;
        mint: (json: string) => AssembledTransaction<null>;
        name: (json: string) => AssembledTransaction<string>;
        admin: (json: string) => AssembledTransaction<string>;
        terms: (json: string) => AssembledTransaction<Option<Terms>>;
        issued: (json: string) => AssembledTransaction<boolean>;
        symbol: (json: string) => AssembledTransaction<string>;
        approve: (json: string) => AssembledTransaction<null>;
        balance: (json: string) => AssembledTransaction<bigint>;
        upgrade: (json: string) => AssembledTransaction<null>;
        decimals: (json: string) => AssembledTransaction<number>;
        operator: (json: string) => AssembledTransaction<string>;
        registry: (json: string) => AssembledTransaction<string>;
        transfer: (json: string) => AssembledTransaction<null>;
        treasury: (json: string) => AssembledTransaction<string>;
        allowance: (json: string) => AssembledTransaction<bigint>;
        burn_from: (json: string) => AssembledTransaction<null>;
        set_terms: (json: string) => AssembledTransaction<null>;
        max_supply: (json: string) => AssembledTransaction<bigint>;
        accept_admin: (json: string) => AssembledTransaction<null>;
        set_operator: (json: string) => AssembledTransaction<null>;
        total_supply: (json: string) => AssembledTransaction<bigint>;
        pending_admin: (json: string) => AssembledTransaction<Option<string>>;
        revoke_shares: (json: string) => AssembledTransaction<null>;
        transfer_from: (json: string) => AssembledTransaction<null>;
        transfer_admin: (json: string) => AssembledTransaction<null>;
        cancel_transfer_admin: (json: string) => AssembledTransaction<null>;
    };
}
