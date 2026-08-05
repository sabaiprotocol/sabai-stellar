# Operating Agreement — Asset DAO LLC

*Specimen — reference implementation. The company and its asset are
illustrative; every operative mechanism referenced is deployed and testable
in this repository.*

Adopted by the members of Asset DAO LLC, a Wyoming decentralized autonomous
organization limited liability company (the **"Company"**), under the Wyoming
Limited Liability Company Act and the DAO Supplement, W.S. 17-31-101 et seq.

## 1. Purpose and single asset

The Company exists to acquire, own, operate and dispose of one asset, "Sabai
Lagoon Residence No. 1" (the **"Asset"**), and holds no other asset of
substance. Where the law of the Asset's situs requires it, the Company holds
the Asset through a registered leasehold or a wholly-owned local
title-holding entity, and references to the Asset include that holding.
Liabilities of the Company do not extend to any other company on the
platform, and no other company's liabilities reach the Asset.

## 2. Units and capital

**2.1 Fixed denominator.** The Company issues **1,000 units**. One unit is
represented by one token on the membership register. The total is fixed at
formation, is issued in a single issuance, and is never recalculated or
reissued; every percentage in the Company — voting power, share of income,
share of liquidation proceeds (each a **"Percentage Interest"**) — is
computed against this fixed denominator.

**2.2 No further issuance.** No additional units may be created. Units may be
cancelled by redemption, in which case the denominator remains unchanged and
cancelled units are treated as unissued under clause 2.3.

**2.3 Unissued units.** Units not yet subscribed are held by the Sponsor
Member in treasury custody. They carry no right to distributions and no
voting rights, and are disregarded for quorum, but remain in the denominator.

## 3. Membership and the register

**3.1 The register.** The definitive, real-time register of members and unit
holdings is the balance state of the membership register smart contract named
in the articles of organization. No paper register controls over it; the
Company's records mirror the chain.

**3.2 Admission.** A person is admitted as a member, automatically and
without further act, upon on-chain settlement of one or more units to an
address verified for that person under clause 4 — whether by primary
subscription, member-to-member transfer, or operation of law recorded through
the register.

**3.3 One person, aggregated.** Membership, Percentage Interest and the caps
in clause 4 are computed per verified person, with all addresses of that
person aggregated.

## 4. Eligibility, transfers, caps

**4.1 Eligible persons.** Only persons who have completed the platform's
verification and are not U.S. persons (as defined in Regulation S under the
U.S. Securities Act of 1933) may hold or receive units. The eligibility
restriction is enforced by the compliance registry contract on both sides of
every movement of units: a transfer to or from an unverified address does not
settle.

**4.2 Offering restrictions.** Units are offered and sold only outside the
United States to non-U.S. persons in offshore transactions in reliance on
Regulation S, together with available private placement exemptions in the
holder's own jurisdiction. Units are not registered under the U.S. Securities
Act and may not be offered or sold to U.S. persons.

**4.3 Stop-transfer.** The registry gate in clause 4.1 constitutes the
Company's stop-transfer mechanism for purposes of Regulation S: resales
settle only between verified non-U.S. persons, from the first day of
secondary trading, and sales to U.S. persons remain blocked without time
limit as platform policy.

**4.4 Suspension and revocation.** The verification provider may suspend a
member (units frozen in both directions, entitlements continue to accrue and
are paid on release) or revoke verification (units frozen; accrued
distributions remain claimable) upon a sanctions, court or compliance event.
Suspension and revocation are distinct acts and are recorded as distinct
events on the register.

**4.5 Secondary transfers.** Members may transfer units to other eligible
persons through the platform's internal market at prices within the band
published by the operator, or by direct transfer between verified addresses.
Every transfer is subject to clauses 4.1–4.4.

**4.6 Concentration and member caps.** No verified person may hold more than
**9.99%** of the units, addresses aggregated; and the number of members shall
not exceed the limit the manager determines is required to preserve the
Company's U.S. tax classification under section 7704 of the Internal Revenue
Code and the regulations under it. Subscriptions and transfers exceeding a
cap are refused.

## 5. Economic rights

**5.1 Distributions.** Net income of the Asset, after taxes and charges of
the Asset's jurisdiction and Company expenses, is distributed to members pro
rata to units through the distribution contract. Deposited distributions
leave the contract only through a member's own claim; unclaimed amounts
remain standing to the member's credit.

**5.2 Record mechanics.** Entitlement to a distribution round follows the
register position recorded for that round under the distribution contract's
settlement mechanics; rounds distributed before a member acquired units do
not accrue to that member.

**5.3 Buyback.** The Company may maintain a standing buyback at a fixed
discount to the published primary price, funded by the Sponsor Member, as an
exit of last resort; the discount is fixed at deployment.

## 6. Primary offering

**6.1 Escrow.** Subscription proceeds are held in escrow until Final Closing.
Before Final Closing the Company conducts no business, earns no income and
makes no distributions, and voting is dormant except for protective consents
listed in the subscription agreement.

**6.2 Final Closing.** When the funding target is reached and the Asset
acquisition completes, economic and voting rights activate simultaneously
for all members at their Percentage Interests.

**6.3 Failed raise.** If the target is not reached by the longstop date,
contributions are mandatorily returned, and any winding-up before Final
Closing distributes by capital contributions, not by Percentage Interests.

## 7. Management

**7.1 The Manager.** Day-to-day management is vested in the Manager (the
authorized member), who executes binding member resolutions, administers the
Asset, signs the Company's tax filings, and operates the Company's roles on
the smart contracts under the operator's published key-custody policy.

**7.2 Forced transfer.** The Manager may cause units to be transferred out of
an address without its signature **only** on a documented legal basis — a
court or administrative order, a probate transfer, or verified loss of keys —
using the register's forced-transfer function, whose destination is fixed at
deployment to the Company's treasury. Every forced transfer is recorded as a
distinct event alongside the transfer itself and is minuted with its legal
basis.

**7.3 What the Manager cannot do.** The Manager cannot create units, alter
the denominator, redirect sale proceeds or distributions, choose the
destination of a forced transfer, or admit an investor to the register;
investor admission belongs exclusively to the verification provider's key.

**7.4 Contract upgrades.** The smart contracts named in the articles of
organization may be re-pointed to new code by the administration quorum,
through the upgrade entrypoint each of them carries; the register and every
position on it survive unchanged, because an upgrade replaces code and not
storage. Before the quorum signs, the new code must be independently audited,
notice must be given to members stating the code hash to be adopted, and a
corporate approval must be recorded with the minutes. Where a contract is
replaced rather than upgraded, the identifiers in the articles are amended by
the same procedure.

Members should understand the boundary this puts around clause 7.3: the
restrictions on the Manager hold because the deployed code holds them, so the
power to replace that code is ultimately the power to change them. What
protects a member is the quorum, the audit and the notice — not the contract
alone. A published waiting period between the notice and the change, long
enough for a member to exit first, belongs to the same clause and is on the
platform's roadmap rather than in the reference deployment.

## 8. Governance

**8.1 Proposals and voting.** Any member may initiate a proposal. Voting
power is pro rata to units held by verified members. A resolution approved by
a majority of votes cast, at a quorum of the issued units the operating
procedure specifies, binds the Manager — including replacement of the
management company, sale of the Asset, and replacement of the Company's
representatives.

**8.2 Procedure.** Voting is conducted through the platform's governance
procedure against a snapshot of the on-chain register, and the snapshot
reference and result are recorded with the Company's minutes.

## 9. Tax

The Company is a partnership for U.S. federal income tax purposes and makes
no election to the contrary. The Manager causes the Company's information
returns and each member's schedules to be prepared and filed by a qualified
U.S. tax provider, maintains the Company's standing certifications regarding
the source and character of its income, and delivers each member's schedule
through the platform. Members are responsible for their own taxes.

## 10. The anchored terms

The Company's constitutional bundle — these articles and agreement, the
subscription agreement and the risk factors — is hashed, and the hash and
location are recorded on the membership register through its terms function.
The recorded hash identifies the version in force; any amendment under
clause 11 is re-anchored the same way, and all versions remain visible in the
register's event history.

## 11. Amendment

This agreement is amended by member resolution under clause 8, except that
clauses 2 (fixed denominator), 4.1–4.3 (eligibility and Regulation S
restrictions) and 7.2 (forced transfer bounds) may not be amended to the
detriment of the protections they provide while any units are outstanding.

## 12. Liquidation

On dissolution, after discharge of liabilities: first, return of capital
contributions; then, residual proceeds pro rata to Percentage Interests. A
dissolution before Final Closing follows clause 6.3 instead.

## 13. Governing law

The laws of the State of Wyoming, including the DAO Supplement.
