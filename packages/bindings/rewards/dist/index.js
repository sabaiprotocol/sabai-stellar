import { Buffer } from "buffer";
import { Client as ContractClient, Spec as ContractSpec, } from "@stellar/stellar-sdk/contract";
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
    /**
     * The caller has no accrued rewards to claim right now.
     */
    501: { message: "NothingToClaim" },
    /**
     * Amounts must be positive whole numbers.
     */
    502: { message: "InvalidAmount" },
    /**
     * Accumulator arithmetic overflowed i128. Practically unreachable.
     */
    503: { message: "Overflow" },
    /**
     * The holder is suspended in the compliance registry. Their rewards keep
     * accruing and stay in the pool until the suspension is lifted.
     */
    504: { message: "HolderFrozen" }
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
export const AccessError = {
    /**
     * The caller holds neither the admin nor the operator role.
     */
    901: { message: "NotAuthorized" },
    /**
     * `accept_admin` was called with no handover in progress.
     */
    902: { message: "NoHandoverPending" }
};
export class Client extends ContractClient {
    options;
    static async deploy(
    /** Constructor/Initialization Args for the contract's `__constructor` method */
    { admin, share_token, payment_token, registry, total_shares }, 
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options) {
        return ContractClient.deploy({ admin, share_token, payment_token, registry, total_shares }, options);
    }
    constructor(options) {
        super(new ContractSpec(["AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACgAAAAAAAAAAAAAAClNoYXJlVG9rZW4AAAAAAAAAAAAAAAAADFBheW1lbnRUb2tlbgAAAAAAAAAvQ29tcGxpYW5jZSByZWdpc3RyeSwgY29uc3VsdGVkIG9uIGBjbGFpbWAgb25seS4AAAAACFJlZ2lzdHJ5AAAAAAAAAAAAAAALVG90YWxTaGFyZXMAAAAAAAAAAEFDdW11bGF0aXZlIHJld2FyZHMgcGVyIHNoYXJlLCBzY2FsZWQgYnkgYFNDQUxFYC4gT25seSBldmVyIGdyb3dzLgAAAAAAAAtBY2NQZXJTaGFyZQAAAAAAAAAAAAAAAA5Ub3RhbERlcG9zaXRlZAAAAAAAAAAAACxMaWZldGltZSB0b3RhbCBwYWlkIG91dCBhY3Jvc3MgZXZlcnkgaG9sZGVyLgAAAAxUb3RhbENsYWltZWQAAAABAAAAIkxhc3Qgc2V0dGxlZCBwb3NpdGlvbiBvZiBhIGhvbGRlci4AAAAAAAdTZXR0bGVkAAAAAAEAAAATAAAAAQAAADBSZXdhcmRzIGJhbmtlZCBieSBhIHNldHRsZSBhbmQgbm90IHlldCBwYWlkIG91dC4AAAAET3dlZAAAAAEAAAATAAAAAQAAACZMaWZldGltZSB0b3RhbCB0aGUgaG9sZGVyIGhhcyBjbGFpbWVkLgAAAAAAB0NsYWltZWQAAAAAAQAAABM=",
            "AAAAAQAAACpBIGhvbGRlcidzIHBvc2l0aW9uIGFzIG9mIHRoZSBsYXN0IHNldHRsZS4AAAAAAAAAAAAIUG9zaXRpb24AAAACAAAAIUFjY3VtdWxhdG9yIGxldmVsIGF0IHRoYXQgbW9tZW50LgAAAAAAAANhY2MAAAAACwAAADlTaGFyZXMgdGhlIGhvbGRlciBoYWQgd2hlbiB0aGUgcG9zaXRpb24gd2FzIGxhc3Qgc2V0dGxlZC4AAAAAAAAHYmFsYW5jZQAAAAAL",
            "AAAAAAAAAflQYXltZW50IHRva2VuIHRoaXMgY29udHJhY3QgaXMgYWN0dWFsbHkgaG9sZGluZy4KClRvZ2V0aGVyIHdpdGggYG91dHN0YW5kaW5nYCB0aGlzIGlzIHRoZSBzb2x2ZW5jeSBjaGVjaywgYW5kIGl0IGlzIGEKY2hlY2sgYW55b25lIGNhbiBydW4gZnJvbSBhbiBleHBsb3JlciB3aXRob3V0IHRydXN0aW5nIGEgd29yZCBvZiB0aGlzCmRvY3VtZW50YXRpb24uIE91ciBQb2x5Z29uIGNvbnRyYWN0cyBleHBvc2UgdGhlIHNhbWUgcGFpcgooYHJld2FyZFN0b3JhZ2VgIC8gYG5lZWRSZXdhcmRTdG9yYWdlYCk7IHRoZSBkaWZmZXJlbmNlIGlzIHRoYXQgdGhlcmUKdGhlIGFkbWluIGNhbiB3aXRoZHJhdyB0aGUgYmFja2luZyBhbmQgdGhlIGRpc2NpcGxpbmUgaXMgb2ZmLWNoYWluLAp3aGVyZWFzIHRoaXMgY29udHJhY3QgaGFzIG5vIHdpdGhkcmF3YWwgZW50cnlwb2ludCBhdCBhbGwuIERlcG9zaXRlZApyZW50IGNhbiBvbmx5IGV2ZXIgbGVhdmUgdGhyb3VnaCBhIGhvbGRlcidzIGBjbGFpbWAuAAAAAAAABHBvb2wAAAAAAAAAAQAAAAs=",
            "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=",
            "AAAAAAAAAGtDbGFpbSBldmVyeXRoaW5nIGFjY3J1ZWQgdG8gdGhlIGNhbGxlci4gU2V0dGxlcyBmaXJzdCwgc28gYSBjbGFpbSBpcwphbHdheXMgYWdhaW5zdCBhbiB1cC10by1kYXRlIHBvc2l0aW9uLgAAAAAFY2xhaW0AAAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAA=",
            "AAAAAAAAAEFMaWZldGltZSByZXdhcmRzIGZvciB0aGUgaG9sZGVyOiBhbHJlYWR5IGNsYWltZWQgKyBjbGFpbWFibGUgbm93LgAAAAAAAAZlYXJuZWQAAAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAs=",
            "AAAAAAAAATBCcmluZyBhbiBhZGRyZXNzIHVwIHRvIGRhdGUgd2l0aG91dCBwYXlpbmcgYW55dGhpbmcgb3V0LiBQZXJtaXNzaW9ubGVzcwphbmQgZnJlZSBvZiBhdXRob3JpemF0aW9uIG9uIHB1cnBvc2U6IGl0IGNhbiBvbmx5IGV2ZXIgbW92ZSByZXdhcmRzCmZyb20gImFjY3J1aW5nIiB0byAiYmFua2VkIiBmb3IgdGhlIGFkZHJlc3MgbmFtZWQsIHNvIGFueW9uZSBtYXkgcnVuIGl0CmZvciBhbnlvbmUsIGFuZCBhIHdhbGxldCB0aGF0IGp1c3QgYm91Z2h0IHNoYXJlcyBuZWVkcyBpdCBiZWZvcmUgdGhvc2UKc2hhcmVzIHN0YXJ0IGVhcm5pbmcuAAAABnNldHRsZQAAAAAAAQAAAAAAAAAEdXNlcgAAABMAAAAA",
            "AAAAAAAAAC5MaWZldGltZSB0b3RhbCB0aGUgaG9sZGVyIGhhcyBhbHJlYWR5IGNsYWltZWQuAAAAAAAHY2xhaW1lZAAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAL",
            "AAAAAAAAAi1EZXBvc2l0IGEgcmV3YXJkIHJvdW5kIGZvciBldmVyeW9uZSBob2xkaW5nIHNoYXJlcyByaWdodCBub3cuIEFkbWluIG9yCm9wZXJhdG9yOyBvbiB0aGUgcGxhdGZvcm0gdGhpcyBpcyB0aGUgd3JpdGVyIGJvdCBkaXN0cmlidXRpbmcgcmVudAppbmNvbWUsIG1vbnRoIGFmdGVyIG1vbnRoLCB3aGljaCBpcyBleGFjdGx5IHRoZSBqb2IgYSBob3Qga2V5IGV4aXN0cwpmb3IuIEl0IGlzIGFsc28gdGhlIHNhZmVzdCBjYWxsIGluIHRoZSBkZXBsb3ltZW50IHRvIGdpdmUgYXdheTogdGhlCm1vbmV5IG1vdmVzIGZyb20gYGZyb21gIGludG8gdGhlIHBvb2wsIGFuZCB0aGlzIGNvbnRyYWN0IGhhcyBubwplbnRyeXBvaW50IHRoYXQgbW92ZXMgaXQgYmFjayBvdXQgdG8gYW55b25lIGJ1dCBhIGhvbGRlciBjbGFpbWluZy4KCkhvbGRlcnMgd2hvIGFjcXVpcmUgc2hhcmVzIGFmdGVyIHRoaXMgY2FsbCBlYXJuIG5vdGhpbmcgZnJvbSBpdCwgd2hpY2gKaXMgdGhlIHBvaW50OiB5b3UgY2Fubm90IGJlIHBhaWQgcmVudCBmb3IgYSBtb250aCB5b3UgZGlkIG5vdCBvd24gdGhlCnByb3BlcnR5LgAAAAAAAAdkZXBvc2l0AAAAAAIAAAAAAAAABGZyb20AAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAA",
            "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAAA",
            "AAAAAAAAACxUaGUgaG90IGtleSB0aGF0IG1heSBkZXBvc2l0IGEgcmV3YXJkIHJvdW5kLgAAAAhvcGVyYXRvcgAAAAAAAAABAAAAEw==",
            "AAAAAAAAAJxUaGUgaG9sZGVyJ3MgcG9zaXRpb24gYXMgb2YgdGhlaXIgbGFzdCBzZXR0bGUuIGBiYWxhbmNlYCBpcyBob3cgbWFueQpzaGFyZXMgYXJlIGN1cnJlbnRseSBlYXJuaW5nOyBhIHdhbGxldCBzaG93aW5nIGZld2VyIGhlcmUgdGhhbiBpdCBob2xkcwpuZWVkcyBgc2V0dGxlYC4AAAAIcG9zaXRpb24AAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAfQAAAACFBvc2l0aW9u",
            "AAAAAAAAADJUaGUgY29tcGxpYW5jZSByZWdpc3RyeSBjb25zdWx0ZWQgYmVmb3JlIGEgcGF5b3V0LgAAAAAACHJlZ2lzdHJ5AAAAAAAAAAEAAAAT",
            "AAAAAAAAACdSZXdhcmRzIHRoZSBob2xkZXIgY2FuIGNsYWltIHJpZ2h0IG5vdy4AAAAACWNsYWltYWJsZQAAAAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAQAAAAs=",
            "AAAAAAAAAX1VcHBlciBib3VuZCBvbiB3aGF0IGV2ZXJ5IGhvbGRlciBjb3VsZCBzdGlsbCBjbGFpbS4KCkRlcG9zaXRlZCBtaW51cyBjbGFpbWVkLCB3aGljaCBvdmVyLXN0YXRlcyB0aGUgcmVhbCBsaWFiaWxpdHk6IHJvdW5kcwp0aGF0IGFjY3J1ZWQgdG8gc2hhcmVzIGhlbGQgYnkgdGhlIHNhbGUgY29udHJhY3QsIG9yIGZvcmZlaXRlZCBieSBhCnRyYW5zZmVyIGJlZm9yZSBhIHNldHRsZSwgYXJlIGNvdW50ZWQgaGVyZSBhbmQgd2lsbCBuZXZlciBiZSBjbGFpbWVkLgpPdmVyLXN0YXRpbmcgaXMgdGhlIHNhZmUgZGlyZWN0aW9uIC0gYHBvb2wgPj0gb3V0c3RhbmRpbmdgIHByb3Zlcwpzb2x2ZW5jeSwgYW5kIGl0IHN0YXlzIHRydWUgZXZlbiBhcyB0aGUgYm91bmQgbG9vc2Vucy4AAAAAAAALb3V0c3RhbmRpbmcAAAAAAAAAAAEAAAAL",
            "AAAAAAAAAAAAAAALc2hhcmVfdG9rZW4AAAAAAAAAAAEAAAAT",
            "AAAAAAAAAAAAAAAMYWNjZXB0X2FkbWluAAAAAAAAAAA=",
            "AAAAAAAAAAAAAAAMc2V0X29wZXJhdG9yAAAAAQAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAA==",
            "AAAAAAAAAAAAAAAMdG90YWxfc2hhcmVzAAAAAAAAAAEAAAAL",
            "AAAAAAAAANdEZXBsb3ktdGltZSBpbml0aWFsaXphdGlvbi4KCiogYHRvdGFsX3NoYXJlc2AgLSB0aGUgZml4ZWQgc2hhcmUgc3VwcGx5IHRoZSBwcm8tcmF0YSBtYXRoIGRpdmlkZXMgYnkuCmBzaGFyZS10b2tlbmAgbXVzdCBiZSBkZXBsb3llZCB3aXRoIGEgc3VwcGx5IGNhcCBlcXVhbCB0byB0aGlzLCBvcgp0aGUgZGlzdHJpYnV0b3IgY2FuIHByb21pc2UgbW9yZSB0aGFuIGl0IGhvbGRzLgAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAUAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAALc2hhcmVfdG9rZW4AAAAAEwAAAAAAAAANcGF5bWVudF90b2tlbgAAAAAAABMAAAAAAAAACHJlZ2lzdHJ5AAAAEwAAAAAAAAAMdG90YWxfc2hhcmVzAAAACwAAAAA=",
            "AAAAAAAAAAAAAAANcGF5bWVudF90b2tlbgAAAAAAAAAAAAABAAAAEw==",
            "AAAAAAAAAAAAAAANcGVuZGluZ19hZG1pbgAAAAAAAAAAAAABAAAD6AAAABM=",
            "AAAAAAAAACNUb3RhbCBwYWlkIG91dCBhY3Jvc3MgZXZlcnkgaG9sZGVyLgAAAAANdG90YWxfY2xhaW1lZAAAAAAAAAAAAAABAAAACw==",
            "AAAAAAAAAAAAAAAOdHJhbnNmZXJfYWRtaW4AAAAAAAEAAAAAAAAACW5ld19hZG1pbgAAAAAAABMAAAAA",
            "AAAAAAAAACtUb3RhbCByZXdhcmRzIGV2ZXIgZGVwb3NpdGVkIGJ5IHRoZSBpc3N1ZXIuAAAAAA90b3RhbF9kZXBvc2l0ZWQAAAAAAAAAAAEAAAAL",
            "AAAAAAAAAAAAAAAVY2FuY2VsX3RyYW5zZmVyX2FkbWluAAAAAAAAAAAAAAA=",
            "AAAABAAAAUxDb2RlcyBhcmUgdW5pcXVlIGFjcm9zcyBldmVyeSBjb250cmFjdCBpbiB0aGlzIGRlcGxveW1lbnQgKHJlZ2lzdHJ5IDF4eCwKc2hhcmUtdG9rZW4gMnh4LCBzYWxlIDN4eCwgZXhjaGFuZ2UgNHh4LCByZXdhcmRzIDV4eCkuIEEgY3Jvc3MtY29udHJhY3QKY2FsbCBzdXJmYWNlcyB0aGUgSU5ORVIgY29udHJhY3QncyBjb2RlLCBhbmQgYSBzaGFyZWQgbnVtYmVyaW5nIGlzIHdoYXQKbGV0cyB0aGUgVUkgdHVybiB0aGF0IGNvZGUgaW50byB0aGUgcmlnaHQgc2VudGVuY2UgaW5zdGVhZCBvZiBndWVzc2luZwpmcm9tIHdoaWNoZXZlciBjb250cmFjdCBpdCBoYXBwZW5lZCB0byBjYWxsLgAAAAAAAAAFRXJyb3IAAAAAAAAEAAAANVRoZSBjYWxsZXIgaGFzIG5vIGFjY3J1ZWQgcmV3YXJkcyB0byBjbGFpbSByaWdodCBub3cuAAAAAAAADk5vdGhpbmdUb0NsYWltAAAAAAH1AAAAJ0Ftb3VudHMgbXVzdCBiZSBwb3NpdGl2ZSB3aG9sZSBudW1iZXJzLgAAAAANSW52YWxpZEFtb3VudAAAAAAAAfYAAABAQWNjdW11bGF0b3IgYXJpdGhtZXRpYyBvdmVyZmxvd2VkIGkxMjguIFByYWN0aWNhbGx5IHVucmVhY2hhYmxlLgAAAAhPdmVyZmxvdwAAAfcAAACEVGhlIGhvbGRlciBpcyBzdXNwZW5kZWQgaW4gdGhlIGNvbXBsaWFuY2UgcmVnaXN0cnkuIFRoZWlyIHJld2FyZHMga2VlcAphY2NydWluZyBhbmQgc3RheSBpbiB0aGUgcG9vbCB1bnRpbCB0aGUgc3VzcGVuc2lvbiBpcyBsaWZ0ZWQuAAAADEhvbGRlckZyb3plbgAAAfg=",
            "AAAABQAAACdBIGhvbGRlciBjbGFpbWVkIHRoZWlyIGFjY3J1ZWQgcmV3YXJkcy4AAAAAAAAAAAVDbGFpbQAAAAAAAAEAAAAFY2xhaW0AAAAAAAACAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAB",
            "AAAABQAAAEpBZG1pbiBkZXBvc2l0ZWQgYSByZXdhcmQgcm91bmQgZm9yIGV2ZXJ5b25lIGhvbGRpbmcgc2hhcmVzIGF0IHRoYXQgbGVkZ2VyLgAAAAAAAAAAAAdEZXBvc2l0AAAAAAEAAAAHZGVwb3NpdAAAAAACAAAAAAAAAARmcm9tAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAB",
            "AAAABQAAAJFBIGhvbGRlcidzIHBvc2l0aW9uIHdhcyBicm91Z2h0IHVwIHRvIGRhdGUuIGBlYXJuaW5nYCBpcyBob3cgbWFueSBzaGFyZXMKbm93IGFjY3J1ZSBmb3IgdGhlbSwgYG93ZWRgIGlzIHdoYXQgaXMgYmFua2VkIGFuZCB3YWl0aW5nIHRvIGJlIGNsYWltZWQuAAAAAAAAAAAAAAdTZXR0bGVkAAAAAAEAAAAHc2V0dGxlZAAAAAADAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAAAAAAB2Vhcm5pbmcAAAAACwAAAAAAAAAAAAAABG93ZWQAAAALAAAAAAAAAAE=",
            "AAAABQAAAItUaGUgY29udHJhY3QgaXMgbm93IHJ1bm5pbmcgZGlmZmVyZW50IGNvZGUuIFRoZSBoYXNoIGlzIHRoZSBvbmUgYW4KZXhwbG9yZXIgc2hvd3MgYWdhaW5zdCB0aGUgY29udHJhY3QsIHNvIHRoaXMgZXZlbnQgYW5kIHRoZSBsZWRnZXIgYWdyZWUuAAAAAAAAAAAIVXBncmFkZWQAAAABAAAACHVwZ3JhZGVkAAAAAQAAAAAAAAAJd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAAAA==",
            "AAAABAAAAYtOYW1lZCBhcGFydCBmcm9tIGVhY2ggY29udHJhY3QncyBvd24gYEVycm9yYCBzbyB0aGUgdHdvIG5ldmVyIGNvbGxpZGUgaW4KdGhlIGNvbnRyYWN0IHNwZWMgdGhlIGJpbmRpbmdzIGFyZSBnZW5lcmF0ZWQgZnJvbS4KCjl4eCBpcyByZXNlcnZlZCBmb3IgZ292ZXJuYW5jZSBpbiBldmVyeSBjb250cmFjdCBvZiB0aGlzIGRlcGxveW1lbnQKKHJlZ2lzdHJ5IDF4eCwgc2hhcmUtdG9rZW4gMnh4LCBzYWxlIDN4eCwgZXhjaGFuZ2UgNHh4LCByZXdhcmRzIDV4eCksIHNvIGEKY29kZSBhcnJpdmluZyBmcm9tIGEgY3Jvc3MtY29udHJhY3QgY2FsbCBzdGlsbCBzYXlzIHdoYXQgaGFwcGVuZWQgd2l0aG91dAp0aGUgY2FsbGVyIGhhdmluZyB0byBrbm93IHdoaWNoIGNvbnRyYWN0IHByb2R1Y2VkIGl0LgAAAAAAAAAAC0FjY2Vzc0Vycm9yAAAAAAIAAAA5VGhlIGNhbGxlciBob2xkcyBuZWl0aGVyIHRoZSBhZG1pbiBub3IgdGhlIG9wZXJhdG9yIHJvbGUuAAAAAAAADU5vdEF1dGhvcml6ZWQAAAAAAAOFAAAAN2BhY2NlcHRfYWRtaW5gIHdhcyBjYWxsZWQgd2l0aCBubyBoYW5kb3ZlciBpbiBwcm9ncmVzcy4AAAAAEU5vSGFuZG92ZXJQZW5kaW5nAAAAAAADhg==",
            "AAAABQAAAAAAAAAAAAAAD09wZXJhdG9yQ2hhbmdlZAAAAAABAAAAEG9wZXJhdG9yX2NoYW5nZWQAAAACAAAAAAAAAARmcm9tAAAAEwAAAAEAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAA=",
            "AAAABQAAAAAAAAAAAAAAEEFkbWluVHJhbnNmZXJyZWQAAAABAAAAEWFkbWluX3RyYW5zZmVycmVkAAAAAAAAAgAAAAAAAAAEZnJvbQAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAAAAAAA",
            "AAAABQAAAERBIHN1Y2Nlc3NvciB3YXMgbmFtZWQuIE5vdCB5ZXQgaW4gZm9yY2U6IG9ubHkgYEFkbWluVHJhbnNmZXJyZWRgIGlzLgAAAAAAAAAUQWRtaW5UcmFuc2ZlclN0YXJ0ZWQAAAABAAAAFmFkbWluX3RyYW5zZmVyX3N0YXJ0ZWQAAAAAAAIAAAAAAAAABGZyb20AAAATAAAAAQAAAAAAAAACdG8AAAAAABMAAAAAAAAAAA==",
            "AAAABQAAAKdUaGUgb2ZmZXIgd2FzIHdpdGhkcmF3bi4gUHVibGlzaGVkIGJlY2F1c2UgdGhlIGFsdGVybmF0aXZlIGlzIGEgbG9nIHdoZXJlIGEKaGFuZG92ZXIgc3RhcnRzIGFuZCBub3RoaW5nIGV2ZXIgc2F5cyBpdCBzdG9wcGVkLCB3aGljaCByZWFkcyBhcyBvbmUgc3RpbGwKcGVuZGluZyBmb3JldmVyLgAAAAAAAAAAFkFkbWluVHJhbnNmZXJDYW5jZWxsZWQAAAAAAAEAAAAYYWRtaW5fdHJhbnNmZXJfY2FuY2VsbGVkAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAAAAAAAAJY2FuY2VsbGVkAAAAAAAAEwAAAAAAAAAA"]), options);
        this.options = options;
    }
    fromJSON = {
        pool: (this.txFromJSON),
        admin: (this.txFromJSON),
        claim: (this.txFromJSON),
        earned: (this.txFromJSON),
        settle: (this.txFromJSON),
        claimed: (this.txFromJSON),
        deposit: (this.txFromJSON),
        upgrade: (this.txFromJSON),
        operator: (this.txFromJSON),
        position: (this.txFromJSON),
        registry: (this.txFromJSON),
        claimable: (this.txFromJSON),
        outstanding: (this.txFromJSON),
        share_token: (this.txFromJSON),
        accept_admin: (this.txFromJSON),
        set_operator: (this.txFromJSON),
        total_shares: (this.txFromJSON),
        payment_token: (this.txFromJSON),
        pending_admin: (this.txFromJSON),
        total_claimed: (this.txFromJSON),
        transfer_admin: (this.txFromJSON),
        total_deposited: (this.txFromJSON),
        cancel_transfer_admin: (this.txFromJSON)
    };
}
