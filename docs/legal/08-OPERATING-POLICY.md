# Operating & Compliance Policy

*Specimen — reference implementation. The operator is illustrative; the key
mechanics referenced are the ones deployed and drilled in this repository.*

Adopted by the board of Panama Tokenization Platform Inc. (the
**"Operator"**) for all platform deployments and per-asset companies it
serves.

## 1. The four registers

The platform maintains four registers as the single source of truth,
reconciled to the chain:

| Register | Contents |
| --- | --- |
| **Holders** | verified identity outcome, non-U.S.-person status, residence, linked addresses |
| **Holdings** | per-asset unit positions, time-sliced by holding period |
| **Transactions** | primary subscriptions, secondary fills, buybacks, forced transfers — sourced from contract events plus platform records |
| **Distributions** | every payout: date, amount, settlement asset, rate at payment |

Reconciliation is mandatory before any reporting cycle closes: allocations
sum to each company's income, capital accounts sum to contributions, and
on-chain data matches the internal registers.

## 2. Verification

Identity verification, sanctions and PEP screening are performed by a
licensed verification provider. The provider's key — and only that key —
writes admissions, suspensions and revocations to the on-chain registry; the
platform's administrators cannot admit an investor, and the contracts
enforce that split. Verification data stays with the provider; the ledger
receives only the eligibility decision. Re-verification runs on the
provider's cycle; a verification that lapses results in suspension through
the registry until renewed.

## 3. Keys

| Key | Held by | Custody |
| --- | --- | --- |
| Administration (2-of-3 account) | three custodians in distinct roles: a director of the issuing company's manager, the platform's engineering lead, and an independent custodian acting on written instruction | hardware signers, separate locations |
| Operator (day-to-day) | on-call engineer, rotating | hot key; powers bounded by contract |
| Verification provider | the licensed provider | the provider's own custody |
| Treasury | multi-signature custody | as administration keys |

Names of custodians are held in the key register maintained by the corporate
secretary; roles are fixed by this policy. Key generation is performed
offline on the signing hardware; no secret is displayed, printed or stored
in files; backups are sealed separately from their primaries. Loss of one
administration signer freezes the signer set, not the assets: the remaining
quorum migrates to a fresh account through the two-step handover, upon a
documented corporate approval.

## 4. Privileged actions

Every privileged action has two records: the on-chain event the contracts
already publish, and a corporate record naming its authority. Repricing
requires a current independent appraisal and a written pricing memo before
the quorum signs. A forced transfer requires a documented legal basis —
court or administrative order, probate, verified key loss — filed with the
minutes. Contract upgrades require an audit of the new code, notice to
holders with the published hash, and a corporate approval before signing.

## 5. Incidents

Anyone on call may halt: the halt is one bounded signature, and stopping is
the cheap direction. A written incident record is produced within 24 hours.
Reopening requires the administration quorum and the completed record.
Earned distributions remain claimable through any halt; suspension of a
specific holder blocks that holder's payout while entitlements continue to
accrue, and both states release in full when lifted.

## 6. The tax cycle

The tax year closes December 31. In January the platform closes the four
registers, computes per-holder allocations from time-sliced holdings, and
reconciles. The structured package per company — partner register,
per-partner amounts, capital account rollforward — is delivered to the U.S.
tax provider, which prepares and files each company's partnership return and
the holders' schedules under its own professional responsibility, within the
statutory deadline or its extension. Each company's authorized manager signs
its return; holders receive their schedules in their platform dashboards.
Each company maintains its standing certification as to the source and
character of its income, so secondary transfers settle without withholding
while the certification holds.

## 7. Records and audit

Registers, minutes, pricing memos, incident records and filings are retained
for the longer of ten years or the life of the relevant company, and are
made available to auditors and, where lawfully required, to authorities. The
policy itself is reviewed annually by the Operator's board.
