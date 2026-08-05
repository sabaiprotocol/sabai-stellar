# Regulatory design, and what has to be true per stage

[LEGAL-STRUCTURE.md](../LEGAL-STRUCTURE.md) states the problem: a token is a
register entry, and something off-chain has to make it a claim on a building.
The [legal pack](README.md) is the answer this platform gives — a
complete reference document set in which every operative clause names the
contract that enforces it. This document states the regulatory logic of that
design and maps it onto the platform's delivery stages, from the testnet
demonstration to a mainnet launch.

## Who stands where

The structure separates three roles, and the separation is the compliance
design:

- **Sabai Ecoverse Pte. Ltd.** (Singapore, UEN 202346091R) owns the framework
  and licenses it for internal use. It is a technology vendor: not the
  issuer, offeror, broker, market operator or custodian of anything issued on
  a licensed deployment.
- **The platform operator** — a company created by the client — runs each
  deployment under its own name and its own regulatory perimeter, in the
  markets it chooses to address.
- **The per-asset company** is the issuer. One asset, one company, one token:
  liabilities and disputes of one asset never reach another, and the token's
  meaning is fixed by that company's constitutional documents, anchored
  on-chain.

## The offering design

The reference structure offers units privately, outside the United States, to
non-U.S. persons only, in reliance on **Regulation S**, alongside the private
placement exemptions of each holder's own jurisdiction. Three design
consequences:

- **The gate is the stop-transfer mechanism.** Regulation S requires the
  issuer to prevent prohibited resales; here that duty is discharged by the
  compliance registry, which checks both sides of every movement of units.
  Secondary trading between verified non-U.S. persons can therefore open the
  day the primary sale completes, while sales toward U.S. persons stay
  blocked without time limit.
- **No public register, no prospectus** — and correspondingly no public
  solicitation: offerings run inside the platform, to verified accounts.
- **The asset's own jurisdiction always applies on top** — title, tax and,
  where the asset sits in a regulated market such as Thailand, the local
  digital-asset regime. That analysis is per-asset and belongs to the
  operator's counsel at onboarding; the Thai constraints are worked through
  in LEGAL-STRUCTURE.md.

## The tax design

The per-asset company is a U.S. partnership: pass-through, so the company is
a transparent layer and the real tax burden arises where the asset is. With
only non-U.S. members and foreign-source income, no U.S. withholding
attaches to distributions or secondary transfers while the company's
standing certifications hold. Two guardrails keep the classification safe,
and both are enforced at the platform level: a concentration cap per
verified person, and a member-count limit consistent with the
private-placement safe harbor under section 7704 — with the qualifying-income
exception (rents from real property) as the fallback where a company's
membership grows past it. The platform's four registers are designed to
make the annual partnership reporting mechanical: time-sliced holdings in,
per-holder allocation schedules out, filed by a U.S. tax provider under its
own professional responsibility.

## The road to mainnet

| | Testnet MVP *(delivered)* | Testnet expansion | Mainnet launch |
| --- | --- | --- | --- |
| **Engineering** | five contracts live, governance and compliance drills passing | compliance module: caps, expiry, jurisdiction claims, escrowed closing; licensed SEP-12 provider integration; indexer | first production deployment for a client operator |
| **Legal layer** | the reference legal pack, anchored via `set_terms` | pack instantiated for the first real structure with counsel in the asset's and operator's jurisdictions; provider under contract | operator's structure live: per-asset company formed, title in, audit passed, bundle anchored, `is_real_asset: true`, self-serve `register` removed |

Each stage's legal work runs in parallel with the engineering of the stage
before it, and no offering exists until every box in the final column is
true. The mainnet stage launches a structure of the kind the company already
operates in production on Polygon — live tokenized assets in Thailand and
Cambodia since 2022 — so the closing risk is porting risk, not first-time
structuring risk.

## What the compliance module makes enforceable

Today the on-chain gate answers one question — may this address hold units.
The legal pack's remaining rules run as platform procedure until the
compliance module ships in the expansion stage: the 9.99% concentration cap and the
member-count limit, verification expiry, per-jurisdiction eligibility, and
escrowed subscriptions released at Final Closing. Each of those is a stated
clause in the [operating agreement](04-OPERATING-AGREEMENT.md)
today and a registry claim tomorrow — the design is in
[KYC.md](../KYC.md), and the point of the module is to close the distance
between the document and the contract to zero.
