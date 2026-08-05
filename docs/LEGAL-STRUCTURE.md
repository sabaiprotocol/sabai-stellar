# What has to exist off-chain before a share means anything

This PoC issues 1 000 shares of "Sabai Lagoon Residence No. 1". The contracts
enforce who may hold them, how they move, and how rent is split. What they
cannot do is make a share a claim on a building.

That gap is not a coding problem, and this document is where it is described
precisely rather than waved at. It is a plan and an explanation, not legal
advice; every jurisdiction below needs local counsel before anything is signed.

**The demo asset is fictional and no offering is being made.** The contract
says so too, in a field a wallet can read: `share_token.terms().is_real_asset`
is `false` on this deployment.

**The documents themselves now exist.** [docs/legal/](legal/) holds the
reference set our counsel drafted around these contracts — the framework
license, the per-asset company's articles and operating agreement, the
subscription agreement, the risk factors, the platform terms, the operating
policy and the listing agreement. This page is the reasoning; that folder is the
paperwork, and each of its operative clauses names the entrypoint that executes
it. Four of those documents are what the ledger anchors — see
[the anchor](#the-document-anchor-and-how-to-check-it) below.

## The one-sentence version

A token is a register entry. For that entry to be worth something, a legal
person has to own the property and a document has to say that holders of those
entries own that legal person. The standard vehicle for that is an **SPV**: one
company per property, whose entire business is holding that one asset.

Per property, not per portfolio, and that is the point of the S in SPV. If the
company holds three buildings, a token holder's claim is diluted by decisions
about the other two, and a creditor of one building can reach all three.

## The structure our counsel settled on

Three tiers, and the separation between them is the compliance design rather
than a tax trick:

| Tier | Entity | Role |
| --- | --- | --- |
| **Framework** | Sabai Ecoverse Pte. Ltd. (Singapore) | Licenses the stack — contracts, tooling, document templates — for the licensee's internal use. A technology vendor: not the issuer, offeror, broker, market operator or custodian of anything issued on a licensed deployment |
| **Platform** | The operator, a company the client incorporates | Runs the deployment under its own name and its own regulatory perimeter, in the markets it chooses to address |
| **Asset** | One Wyoming DAO LLC per asset | The issuer. Owns the property, directly or through the local title vehicle the situs requires, and its units are the tokens |

Chain of title: token → membership interest in the per-asset company → the
asset. Documents: [framework license](legal/02-FRAMEWORK-LICENSE.md),
[platform terms](legal/07-PLATFORM-TERMS.md),
[articles](legal/03-ARTICLES-OF-ORGANIZATION.md) and
[operating agreement](legal/04-OPERATING-AGREEMENT.md).

Wyoming rather than the BVI because of its
[DAO Supplement](legal/03-ARTICLES-OF-ORGANIZATION.md) (W.S. 17-31-101): the
articles filed with the state name the contract addresses on the public record,
and the operating agreement can make the on-chain balances the definitive member
register rather than a mirror of a paper one. The US tax exposure that normally
argues against a Wyoming LLC is answered by the offering design rather than
ignored — see below.

The reference structure offers units privately, outside the United States, to
non-U.S. persons only, under **Regulation S** plus the private-placement
exemption of each holder's own jurisdiction. Three consequences follow, and the
first is the one that matters to this codebase:

- **The eligibility gate is the stop-transfer mechanism.** Reg S requires the
  issuer to prevent prohibited resales; here the compliance registry discharges
  that duty by checking both sides of every movement. So secondary trading can
  open the day the primary sale completes, while sales toward U.S. persons stay
  blocked without a time limit.
- **The company is a U.S. partnership** — transparent, so the real tax burden
  arises where the asset is. With only non-U.S. members and foreign-source
  income, no U.S. withholding attaches while its certifications hold. Two
  guardrails keep that classification safe: a 9.99% concentration cap per
  verified person and a member-count limit consistent with the private-placement
  safe harbor under §7704. **Neither is enforced on-chain today** — both are
  platform procedure until the compliance module ships.
- **No prospectus, no public register, and therefore no public solicitation.**

Full reasoning, and what has to be true at each stage:
[docs/legal/01-COMPLIANCE-ROADMAP.md](legal/01-COMPLIANCE-ROADMAP.md).

## What actually has to be done, in order

### 1. Handle the asset's own jurisdiction, which sits on top of all of it

The structure above decides who issues and to whom. It decides nothing about
title, and the property is in Thailand, which is where the hard constraints are:

- **Foreigners cannot own land.** A villa on land is not directly tokenizable
  to foreign holders, whatever the token says.
- **Condominium units can be foreign-owned**, up to 49% of a building's
  saleable floor area. Past that quota the remaining units are Thai-ownership
  only, and the register of ownership has to enforce the split.
- **Leasehold** (typically 30 years, renewals not automatically enforceable
  against a successor owner) is the usual workaround, and it changes what the
  token represents: a lease interest with an end date, not freehold.

So the issuing company does not hold Thai title itself. A **registered
leasehold**, or a **wholly-owned Thai property company** where the situs demands
one, sits underneath it and the per-asset company owns that — which is why
[the operating agreement](legal/04-OPERATING-AGREEMENT.md) §1 defines the Asset
to include the vehicle through which it is held rather than naming a deed.

The outer layer was the open question until counsel answered it. What was
weighed:

| | Why | Cost of it |
| --- | --- | --- |
| BVI / Cayman | Cheapest, fastest, understood by every custodian | Increasing bank and exchange friction; no on-chain register recognition |
| Liechtenstein (TVTG) | The only regime that recognizes a token as *the* register of a right | Substance requirements, higher cost |
| Labuan (Malaysia) | Close to the asset, Thai-adjacent tax treaties | Thin precedent for tokenized real estate |
| **Wyoming DAO LLC** *(chosen)* | Cheap, member-managed, the DAO Supplement puts the contract addresses on the state filing and lets the on-chain balances be the member register | US tax and reporting questions — answered by Reg S, pass-through treatment and the §7704 caps, at the price of holding those caps |

Liechtenstein remains the only regime where the register would be legally *the*
register rather than a contractual one, and it is the fallback if an operator's
market needs that. It costs several times more to stand up, which for a first
asset decides it.

The per-asset analysis still belongs to the operator's counsel at onboarding:
this is what the reference structure does, not a finding that it fits every
asset.

### 2. Move the title into the SPV, and prove it

A signed title deed or registered lease, a title search from Thai counsel, and
an independent valuation. Until these exist, everything below is theatre. The
valuation is what sets the share price honestly, rather than the issuer's
opinion of it.

### 3. Find the exemption, or write a prospectus

Selling shares of an SPV to the public is selling securities. Three separate
regimes usually apply at once:

- **Thailand.** Investment tokens are regulated under the Emergency Decree on
  Digital Asset Businesses (B.E. 2561). A public offering requires SEC Thailand
  approval and must go through a licensed ICO portal.
- **United States.** Either keep US persons out (Regulation S) or sell only to
  verified accredited investors (Rule 506(c)). Both are compatible with the
  registry in these contracts: the eligibility decision is exactly the flag the
  KYC provider writes.
- **EU.** MiCA explicitly does not cover financial instruments, so a tokenized
  SPV share falls under MiFID II and the Prospectus Regulation. The DLT Pilot
  Regime covers the trading and settlement layer, not the offering.

The cheapest honest route for a first asset is a private placement to a bounded
number of qualifying investors under Reg S plus a local private-placement
exemption — no prospectus, but a real subscription process. That is the route
the pack takes: the representations an investor makes are
[05-SUBSCRIPTION-AGREEMENT.md](legal/05-SUBSCRIPTION-AGREEMENT.md) §3, and the
resale restriction they bind themselves to is the registry gate itself.

### 4. Appoint the register, which is the part already built

Someone has to maintain the authoritative list of who owns what and act on
court orders, deaths and lost keys. Traditionally a transfer agent; here the
`share-token` contract is the register and the admin multisig is the agent
acting on it. `revoke_shares` is the entrypoint that exists for exactly this
and cannot be justified any other way.

Recognition of the on-chain register as *the* register is the one place where
jurisdiction really changes the code's meaning. Under Liechtenstein's TVTG it is
so by statute. Wyoming gets most of the way there by contract instead:
[the operating agreement](legal/04-OPERATING-AGREEMENT.md) §3.1 makes the
balance state of the share token the definitive register and says no paper
register controls over it, and §3.2 admits a member automatically on settlement,
without a further act. That binds the members and the company to each other; it
does not bind a third party who never signed it, which is the remaining
distance between a contractual register and a statutory one.

### 5. Set up the money path

A bank account for the SPV, rent collected into it, and a paying agent who
converts and distributes. Thai withholding tax on rental income is deducted
before anything reaches a holder, which means the number deposited into
`rewards-distributor` is a **post-tax** figure and the contract should never
be described as paying gross rent.

### 6. Produce the document bundle, and hash it

**Done, in reference form.** [docs/legal/](legal/) is the full set our counsel
drafted around these contracts. Four of them are the *constitutional* bundle of
the per-asset company — the ones an investor is asked to accept, and therefore
the ones the ledger anchors:

| | |
| --- | --- |
| [03](legal/03-ARTICLES-OF-ORGANIZATION.md) | Articles of organization — forms the company, names these five contract addresses on the Wyoming filing |
| [04](legal/04-OPERATING-AGREEMENT.md) | Operating agreement — units are tokens, the on-chain balances are the member register, and every right runs off it |
| [05](legal/05-SUBSCRIPTION-AGREEMENT.md) | Subscription agreement — the Reg S representations and the joinder |
| [06](legal/06-RISK-FACTORS.md) | Risk factors — delivered with every subscription |

A real asset adds the documents no template can supply: the title report, the
independent valuation, the property management agreement and the audited opening
balance sheet. Those go into the same bundle and change the hash, which is the
correct behaviour — the anchor records a version, not a promise.

### 7. Then, and only then, flip the flag

`is_real_asset: true`, terms pointing at the published bundle, and the
self-serve `register` entrypoint deleted from the registry.

## What the contracts already do for a real SPV

This is the half that is finished, and it is not a small half:

| SPV needs | Already in this repository |
| --- | --- |
| A register of members | `share-token` balances, on a public ledger |
| Transfer restrictions on that register | `compliance-registry`, checked on both sides of every movement |
| Fixed share capital | `max_supply` plus a one-shot `mint`; there is no second issuance |
| A transfer agent who can act without the holder | `revoke_shares`, destination fixed at deployment |
| Sanctions and court-order handling | `freeze` / `unfreeze`, separate from `revoke` |
| An incident stop | `pause`, one transaction across five contracts |
| Pro-rata distribution of net income | `rewards-distributor`, and `pool` / `outstanding` to check solvency from outside |
| Segregation of duties | 2-of-3 admin, separate operator, separate KYC provider — see [GOVERNANCE.md](GOVERNANCE.md) |
| A link from the register to the paperwork | `set_terms` / `terms` |

Read the other way round — clause by clause, each naming the entrypoint that
executes it — that is the table in [docs/legal/README.md](legal/README.md).

## The document anchor, and how to check it

`share_token.terms()` returns five fields: the issuing entity, the governing
jurisdiction, a URI, the sha256 of the document bundle, and `is_real_asset`.

The hash matters more than the URI. A link says where a document is today; the
hash says which document the ledger recorded, so a subscription agreement
quietly edited after investors signed no longer matches, and anyone can
establish that without asking the issuer. The `terms_set` event carries every
version ever published, so a holder can show which text was in force on the day
they bought.

On this deployment the anchored bundle is the four constitutional documents,
concatenated in numerical order and hashed as one stream:

```bash
cat docs/legal/0[3-6]-*.md | sha256sum
stellar contract invoke --network testnet \
  --id CAAYJPFOVUHSQJEJA5G3WBBZRNX7GAYTT2C2IJG6TYB7RZCPRN3ZC4XQ -- terms
```

`be85e1da2a35a09395f36857300e40d35af6075e4214da14cfefe12bf82a3af4`, twice, or
one of them is stale. `npm run admin -- set-terms` re-anchors after an
amendment, computing the hash from the working tree — so what reaches the ledger
is what a reader can check out, not a value somebody typed into a form.

The `issuer` and `jurisdiction` fields say what the pack says: `Asset DAO LLC
(Wyoming DAO LLC, specimen - not incorporated)`, `Wyoming, USA - company;
Thailand - asset situs. No offering is being made`. A wallet reads that without
opening a document at all.

## What is deliberately not solved here

- **No entity exists.** Nothing has been incorporated and no title has been
  transferred. The pack is a specimen — every document says so in its header —
  and `is_real_asset` is false on-chain rather than only in a disclaimer.
- **Three of the pack's own rules are procedure, not code.** The 9.99%
  concentration cap and the member-count limit (OA §4.6), escrowed subscriptions
  released at Final Closing (OA §6), and proposal voting (OA §8) are stated
  clauses today and registry claims tomorrow. The operating agreement conducts
  voting off-chain against a register snapshot deliberately; the other two are
  waiting on the compliance module. Naming which clauses the contracts do not
  yet execute is the point of the table in
  [docs/legal/README.md](legal/README.md).
- **The gate is a boolean.** Country caps, the Thai 49% quota, accreditation
  status, holder counts, verification expiry and lock-ups all belong in that
  same module, which reads richer claims than "allowed: yes".
- **No tax withholding in the contract.** A round is deposited post-tax by the
  issuer; nothing on-chain computes or withholds it. The annual partnership
  reporting the structure needs is a register-reconciliation job, sketched in
  [08-OPERATING-POLICY.md](legal/08-OPERATING-POLICY.md) §6 and built by nobody
  yet.
- **The on-chain register is authoritative by contract, not by statute.** The
  operating agreement binds the members to it. A creditor, a court or a
  registrar who never signed that agreement is a different question, and it is
  the one Liechtenstein answers and Wyoming does not.
- **The code can be replaced.** Every restriction above holds because the
  deployed contracts hold it, so the 2-of-3 that can `upgrade` is upstream of
  all of them. OA §7.4 says this in the document rather than leaving a reader to
  work it out, and the missing piece — a published waiting period before a code
  change takes effect — is in
  [GOVERNANCE.md](GOVERNANCE.md#replacing-the-code).

None of these are reasons the contracts would change much. They are reasons the
company would.
