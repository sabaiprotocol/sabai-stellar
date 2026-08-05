# The legal pack: the platform's legal layer, implemented

The contracts in this repository demonstrate the technical layer of a
tokenization platform on a fictional asset. This pack demonstrates the legal
layer the same way: the complete document set of one reference deployment,
drafted end to end, with the same fictional asset behind it. Sabai Ecoverse
Pte. Ltd. is the real owner of the framework; every other party in the pack is
illustrative, and each document says so in its header. The documents are
numbered in reading order.

## The structure, in three tiers

| Tier | Entity | Role |
| --- | --- | --- |
| **Framework** | Sabai Ecoverse Pte. Ltd. (Singapore, UEN 202346091R) | Owns and licenses the white-label framework — contracts, libraries, tooling and document templates — for the licensee's internal use only, without any right of transfer |
| **Platform** | Panama Tokenization Platform Inc. *(illustrative)* | The operator: a company created by the client, running the platform under the framework license — for tokenizing its own assets, for listing third-party assets, or both |
| **Asset** | Asset DAO LLC, a Wyoming DAO LLC *(illustrative)* | One asset — one company — one token. Issuer of the membership tokens and owner of the asset, a partnership for U.S. tax purposes |

**Chain of title:** token → membership interest in the per-asset DAO LLC →
the asset, held directly or through the local title vehicle its jurisdiction
requires — a registered lease or a wholly-owned local property company where
the situs demands one, as [LEGAL-STRUCTURE.md](../LEGAL-STRUCTURE.md) works
through for Thailand.

## How an asset launches

1. The client incorporates the operator company and signs the
   [framework license](02-FRAMEWORK-LICENSE.md).
2. The contract set is deployed and the full unit supply is issued into
   treasury custody.
3. The per-asset Wyoming DAO LLC is formed, and the deployed contract
   addresses are written into its
   [articles of organization](03-ARTICLES-OF-ORGANIZATION.md) as the publicly
   available smart contract identifiers.
4. The [operating agreement](04-OPERATING-AGREEMENT.md) is adopted, binding
   membership to the on-chain register; the document bundle is hashed and
   anchored via `share_token.set_terms`; the primary sale opens to verified
   investors under the [subscription agreement](05-SUBSCRIPTION-AGREEMENT.md).

## The documents, in reading order

| # | Document | Level | What it does |
| --- | --- | --- | --- |
| 01 | [Compliance Roadmap](01-COMPLIANCE-ROADMAP.md) | Design | The regulatory logic of the structure, and what has to be true at each delivery stage |
| 02 | [Framework License](02-FRAMEWORK-LICENSE.md) | Framework | Sabai licenses the stack to the operator — internal use, non-transferable |
| 03 | [Articles of Organization](03-ARTICLES-OF-ORGANIZATION.md) | Asset | Forms the Wyoming DAO LLC; names the smart contracts on the public record |
| 04 | [Operating Agreement](04-OPERATING-AGREEMENT.md) | Asset | Units = tokens; the on-chain register is the member register; rights, transfers, distributions, governance |
| 05 | [Subscription Agreement](05-SUBSCRIPTION-AGREEMENT.md) | Asset | Regulation S private subscription; joinder to the operating agreement |
| 06 | [Risk Factors](06-RISK-FACTORS.md) | Asset | The disclosure that accompanies every subscription |
| 07 | [Platform Terms](07-PLATFORM-TERMS.md) | Platform | Investor-facing access terms: KYC gate, eligibility, fees, settlement |
| 08 | [Operating Policy](08-OPERATING-POLICY.md) | Platform | The operator's registers, key custody, incident response and tax cycle |
| 09 | [Listing Agreement](09-LISTING-AGREEMENT.md) | Platform | The marketplace case: a third-party asset holder brings an asset to the platform |
| 10 | [Repository Terms](10-TERMS.md) | Repository | Legal notices for this repository and the demo itself |

## Where each rule is enforced

The point of the pack is that its operative clauses are not promises — each
one names the contract mechanism that executes it:

| Legal rule | Document | Enforced by |
| --- | --- | --- |
| The member register, in real time | OA §3 | `share-token` balances |
| Only verified non-U.S. persons hold or receive units | OA §4, Platform Terms | `compliance-registry`, checked on both sides of every movement |
| Reg S stop-transfer on resales | OA §4.3 | the same registry gate — an unverified transferee cannot settle |
| Fixed capital: 1,000 units, never recalculated | OA §2 | one-shot `mint` with an immutable cap |
| Unsold units sit with the sponsor, carrying nothing | OA §2.3 | treasury custody; unsold inventory in the sale contract |
| Distributions pro rata, post-tax | OA §5 | `rewards-distributor` — deposits leave only through holder claims |
| Forced transfer on court order, probate, lost keys | OA §7.2 | `revoke_shares`, destination fixed at deployment |
| Suspension on a sanctions or compliance event | OA §4.4 | `freeze` / `unfreeze` by the KYC provider key |
| Incident halt, without touching earned income | Policy §5 | registry `pause`; `claim` deliberately stays open |
| Primary sale and buyback at published prices | OA §6 | `asset-sale`, slippage-bounded |
| Member-to-member trading inside a band | OA §4.5, Platform Terms | `asset-exchange` escrow, price band, commission |
| The documents themselves, tamper-evident | OA §10 | `set_terms` — URI plus sha256 on the ledger |
| Code changes carry a quorum | OA §7.4 | `upgrade`, admin-only, storage untouched — the audit and the notice around it are procedure |

## How the pack is anchored

`share_token.terms()` carries the issuing entity, the governing jurisdiction, a
URI, and the sha256 of the anchored bundle. On this deployment the anchored
bundle is the constitutional set of the asset — the articles, the operating
agreement, the subscription agreement and the risk factors (03–06): the hash
recorded on the ledger is the hash of what an investor is asked to sign, so a
bundle quietly edited after subscription no longer matches, and anyone can
establish that without asking the issuer. Every version ever anchored remains
visible in the `terms_set` event history.

Two commands, and they either produce the same 64 characters or one of them is
stale:

```bash
cat docs/legal/0[3-6]-*.md | sha256sum
stellar contract invoke --network testnet \
  --id CAAYJPFOVUHSQJEJA5G3WBBZRNX7GAYTT2C2IJG6TYB7RZCPRN3ZC4XQ -- terms
```

The four files are concatenated in numerical order and hashed as one stream.
`npm run admin -- set-terms` re-anchors after an amendment under OA §11,
computing the hash from the working tree rather than taking one on trust.

## What the reference deployment enforces today

Three of the pack's rules run as platform procedure pending the compliance
module (the roadmap's next design step): escrowed subscriptions before Final
Closing, the 9.99% concentration cap and member-count limit, and proposal
voting — which the [operating agreement](04-OPERATING-AGREEMENT.md)
deliberately conducts off-chain against an on-chain register snapshot. The
eligibility gate, the register, forced transfer, distributions and the
document anchor are enforced by the deployed contracts now, and the drills in
this repository prove it.

## License note

The MIT License of this repository covers its code. The legal pack is
reference documentation of the framework: it is provided for review and
evaluation, and the templates remain part of the licensed framework rather
than passing under MIT.
