# Design notes: what is simplified, and the questions a reviewer asks first

This is a proof of concept built in a short window, and cutting scope honestly
is part of the deliverable. Everything below is a decision, not an oversight.

## What is deliberately simplified

**The KYC decision is simulated, the mechanism is not.** The registry has a
`kyc_provider` role held by a key separate from `admin`, and
`register_verified` / `revoke` are the only production paths that write the
investor list. What is missing is a licensed provider making the decision. No
personal data is collected anywhere: handling real PII in a public testnet demo
would be a liability, not a feature. `register` is a demo shortcut that lets you
admit yourself so the flow is walkable; it is deleted in production. Full design
and known gaps in [KYC.md](KYC.md).

**The buyback pool is an addition, not a port.** Our Polygon product has no
buyback at all; an investor exits only through the secondary order book. It
exists here so a reviewer walking the demo alone can complete a round trip
without needing a counterparty, and because it shows a Soroban contract
custodying the payment asset and paying out.

It also carries a decision worth stating plainly: the pool buys back **5% below**
the primary price. At par, anyone could buy and immediately sell in a loop and
move the entire pool into the treasury for the price of transaction fees,
leaving genuine holders with nothing to exit against.
`round_trip_cannot_drain_the_buyback_pool` is the test that pins this down. The
discount is fixed in the constructor with no setter, so it cannot be moved
against a holder who is about to sell. In production, standing ready to buy back
is a capital and regulatory commitment before it is a contract feature.

**Income is accounted per address rather than per round, and there is no
transfer hook.** The share token does not tell the distributor when shares
move, and Soroban could not let it here anyway: the distributor reads
`share_token.balance()`, so a token -> distributor -> token chain would re-enter
the token inside a single call stack.

Without a hook, the distributor records a position per address as a pair -
the balance held and the accumulator level, both as of the last `settle` - and
only counts `min(balance_now, balance_at_settle)` shares as earning. Shares
that arrive at an address earn nothing there until somebody calls `settle`,
which stamps the position at the current accumulator. `settle` is
permissionless and moves no money, so anyone may run it for anyone.

That last property is what makes the gap closeable without a hook. **Both
markets now settle the buyer inside the purchase**: `asset-sale.buy` and
`asset-exchange.swap_order` call `settle` on the buyer once the shares have
landed. Not a re-entrant call - the token's own `transfer` has already returned
by then, so the token is not on the stack when the distributor reads a balance
back out of it. The cost is the same money in one transaction instead of two
(0.0699334 XLM against 0.0238276 + 0.0464738), and one wallet prompt instead of
two, which is the part that mattered.

What that buys, and what it does not:

- Rounds distributed before you owned the shares are still not yours. Buying in
  the day after a rent distribution does not pay you for that month.
- The same shares still cannot be paid twice by moving between wallets. An
  earlier version of this contract stored a plain per-address `debt`, and
  because a fresh address starts at zero, claiming and then transferring
  re-armed the entire accumulator on the same shares. A second audit pass found
  it, and `claiming_then_moving_the_shares_cannot_pay_twice` is the regression
  test.
- **A plain wallet-to-wallet transfer is still not settled**, because no
  contract is in the path to do it. That is the case the manual call remains
  for, and it is the rarest one in a KYC-gated token where both sides have to be
  in the registry already. The portfolio still shows "Start earning on N shares"
  when it happens, and says why.

Two consequences remain by design, both proven by tests: selling before
claiming forfeits the accrual on the shares sold, and shares parked in the
sale's unsold inventory or in exchange escrow accrue a slice nobody claims,
which stays in the distributor. Income therefore tracks the fraction of the
asset actually distributed and in settled hands.

The same reasoning applies to listing shares, and it is not solved: `add_order`
moves a seller's shares into escrow without settling them first, so the accrual
on those shares between the last settle and the listing is forfeited. Settling
the seller there would fix it at the cost of ~0.046 XLM on every listing, paid
by everyone whether or not they had anything accrued. Claiming before listing
costs the same and only the people who need it pay, so the honest fix is a
prompt rather than a contract call. It is not in the UI yet.

**A real transfer hook is the version that closes all of it**, and it is not
here for a stated reason rather than an oversight. The token would have to call
the distributor on every movement, passing balances rather than letting the
distributor read them back. That couples the register of ownership - the one
contract that must never be redeployed casually - to the least critical one in
the deployment: a bad distributor upgrade would then freeze transfers. It also
makes `transfer` able to fail for reasons SEP-41 does not describe, and this
token's whole claim is that any wallet can move it knowing nothing about this
project. Worth doing with a non-reverting `try_` call and an audit; not worth
doing in the last fortnight before a deadline.

**Price is set by the admin, with no oracle.** `set_price` on the primary sale
and a 50%-200% band on the secondary market. Real-estate valuation has no
on-chain price feed to read; production uses periodic third-party appraisal,
which is an off-chain input under a governance process either way. `buy` and
`sell` take a slippage bound so a price change cannot land on a transaction that
is already signed.

**Every key in one `.env`.** The admin is a real 2-of-3 multisig account and
the network enforces it, but all three of its signers sit in one file on one
machine, next to the operator, treasury and provider keys. The contracts cannot
tell the difference; the operational practice is what would make it real, and
that means two people and two machines. See [GOVERNANCE.md](GOVERNANCE.md).

**The issuer's powers are the ones a security token needs, and no more.**
Three of them are worth naming because they look alarming until their bounds
are stated:

- `pause` on the registry halts every movement of shares across all five
  contracts at once. It does not stop `claim`: freezing rent a holder has
  already earned would be confiscation rather than incident response.
- `freeze` on the registry suspends one investor without withdrawing their
  verification. Their shares stop moving in either direction and their rent
  keeps accruing; it is paid in full when the suspension is lifted. This one
  *does* block their claim, which is the point - a sanctions hit means the
  payout stops, not that the entitlement disappears.
- `revoke_shares` on the token moves shares out of an address without its
  signature. Real registers of ownership need this: a court order, a probate
  transfer, keys that are gone. It is bounded by construction rather than by
  policy - the destination is the treasury address fixed at deployment with no
  setter, so the key that can confiscate cannot choose where the shares land,
  and every confiscation publishes `shares_revoked` alongside the standard
  `transfer` so it can never be read as an ordinary trade.

`npm run compliance-drill` exercises all three against the live deployment and
fails if any of them lets its transaction through, or fails to release.

**Upgrades have no timelock.** `upgrade` exists on all five contracts behind
the 2-of-3 admin, and `npm run governance-drill` replaces a contract's code on
testnet and reads its state back afterwards. What it does not have is a delay
between announcing a new wasm hash and applying it, which is what would let
holders exit ahead of a change they dislike. The reason is worth stating rather
than hiding: a timelock only means something if the delay itself cannot be
changed at will, so doing it properly means the delay setter is timelocked too.
That is a governance design rather than an afternoon's work, and a demo that
takes 48 hours to complete is not a demo. The gap is admitted in the paperwork
too rather than only here: [operating agreement](legal/04-OPERATING-AGREEMENT.md)
§7.4 requires an audit, a published hash and a corporate approval before the
quorum signs, and says in the same clause that a waiting period long enough for
a member to exit first is roadmap and not deployment.

**The order book returns whole.** `orders()` hands back every open order in one
call. That is a PoC affordance; a production book is discovered through an
indexer and settled by order id against the contract.

**Fictional asset, testnet only.** No company incorporated, no title deed.
Nothing here conveys ownership of anything, and the contract says so in a field
rather than only in a disclaimer: `share_token.terms().is_real_asset` is false.
What would have to exist for it to be true - the entity, the jurisdictions, the
exemptions, the transfer agent, the money path - is set out in
[LEGAL-STRUCTURE.md](LEGAL-STRUCTURE.md).

The **wrapper**, though, is no longer the missing half. [docs/legal/](legal/) is
the document set drafted around these contracts, and the four constitutional
documents of the per-asset company are what the register anchors: the hash in
`terms()` is the sha256 of those files, reproducible with `cat docs/legal/0[3-6]-*.md | sha256sum`.
It is a specimen — the company is not incorporated and each document says so in
its header — but it is a specimen with the contract addresses on its face and an
entrypoint named against every operative clause, which is a different thing from
a placeholder.

## Reviewer FAQ

**"A token is a number in a contract. What would a holder actually own?"**
A membership interest in a Wyoming DAO LLC formed for one property and nothing
else — one asset, one company, one token. The whole document set that says so is
[docs/legal/](legal/), drafted by our counsel around these contracts rather than
adapted afterwards, and the thing worth checking is its table of operative
clauses: each one names the entrypoint that executes it. The member register is
`share-token` balances. The transfer restriction is the registry, checked on both
sides. The forced transfer for a court order or a probate is `revoke_shares`,
with its destination fixed at deployment so the manager cannot choose it. The
fixed denominator is the one-shot `mint`.

Three of the pack's rules are *not* code yet, and the same table says which:
the 9.99% concentration cap and the member-count limit, escrowed subscriptions
before Final Closing, and proposal voting — which the operating agreement
deliberately conducts off-chain against a register snapshot. On this deployment
the company is a specimen and `is_real_asset` is `false`, on-chain.

**"How would you upgrade a contract that holds investor assets?"**
`upgrade(new_wasm_hash)` on all five, behind the 2-of-3 admin account, using
Soroban's `update_current_contract_wasm`. Storage survives it; a change to the
shape of stored data needs a migration call afterwards.
`npm run governance-drill` does exactly that against the live deployment - one
signature refused, two accepted, and the registry's roles, provider and
participant list all read back unchanged. What is still missing is the timelock,
and why is above under "Upgrades have no timelock".

**"Who decides the price, and what stops the admin from manipulating it?"**
The admin sets the primary price; the secondary market clamps listings to an
admin-set band. Nothing on-chain stops a malicious admin from moving the price,
which is true of every RWA platform, because the asset's value is an off-chain
fact. What the contracts do provide is a bound and a trail: `buy` takes a
`max_cost` and `sell` a `min_payout`, so a repricing cannot land on a
transaction already signed, and every change emits `price_changed`. On mainnet
the rest of the mitigation is procedural: third-party appraisal, multisig on the
setter, and the SPV's constitutional documents.

**"What exactly can the admin key do?"**
There is no single admin key. The admin is a 2-of-3 multisig account, and the
day-to-day switches belong to a separate hot operator key that cannot reach any
of the rest.

Two of three admin signatures: issue the shares once, set the price, withdraw
from the buyback pool, withdraw unsold shares, confiscate shares to the
treasury, lift a halt, admit a protocol contract, rotate the KYC provider,
record the legal terms, replace the code, hand the admin role on.

One operator signature: halt the deployment, open and close the primary sale and
the secondary market, force-close a stale order, deposit income. None of those
can take anything - the escrow of a force-closed order goes back to its seller,
a deposit moves money inward, and a closed market still lets holders sell back
and cancel.

It **cannot** cancel a holder's claim, take escrowed shares out of an order,
issue more shares than the asset has or issue twice, choose where a confiscation
goes, or redirect the proceeds. Sale proceeds go straight to the treasury
address fixed at construction and commissions to `fee_to`; both are constructor
arguments with no setter, as are the token's supply cap and the confiscation
destination. Every privileged call is gated by `require_auth` inside the
contract, so the `/admin` screen is a convenience, not a permission: opening it
without the admin key achieves nothing.

The deployment runs **four separate roles** - admin, operator, treasury, KYC
provider - and the contracts enforce the split. Unit tests sign as the provider
and as the operator and assert every entrypoint outside their role still
refuses; `npm run governance-drill` does the same on-chain.

One caveat worth stating precisely, because an earlier version of this document
overstated it. The admin cannot write the **investor** list: `register_verified`
and `revoke` check the caller against the stored `kyc_provider` and nothing
else. But eligibility is `investor OR participant`, and `set_participant` is
admin-only with no check that the address belongs to a contract. An admin can
therefore make an arbitrary address eligible by admitting it as protocol
infrastructure. What the split does buy is that the two are different storage
maps written by different keys and emitting different events, so an auditor
reading the log can always tell an investor admitted after a KYC decision from
an address the operator waved through. Making the distinction enforceable
rather than merely visible needs a real identity claim on the entry, which is
the compliance-module work in the roadmap.

**"The rewards math looks too simple."**
It was, and that is the interesting part. The first version was the textbook
accumulator: cumulative income per share, minus a per-address `debt`. That
pattern assumes the token calls back into the distributor on every transfer so
the debt follows the shares. This token cannot, so a fresh address always
started at `debt = 0` and inherited the whole accumulator: claim, transfer to a
new wallet, claim again, and the same shares paid twice until the pool ran out.

The current version records a position rather than a debt - the balance held
and the accumulator level at the last settle - and only counts
`min(balance_now, balance_at_settle)` shares as earning. Both halves matter:
shares that arrive somewhere new earn nothing until settled, and shares that
leave stop earning immediately. See the section above and
`claiming_then_moving_the_shares_cannot_pay_twice`.

**"What stops the issuer minting more shares and diluting the rent?"**
Two checks that bound different things. `mint` runs **exactly once** - a second
call fails whatever the amount - and it cannot exceed the supply cap fixed in
the constructor with no setter, which is the same number `rewards-distributor`
divides income by. The cap bounds how much, the one-shot flag bounds how many
times; either alone leaves the other reachable. Together they make
`total_shares` an invariant rather than an operating agreement, and after the
issuance supply can only fall, through `burn`.

Issuing *less* than the cap is allowed and safe: the distributor still divides
by the cap, so the unissued fraction of every round simply stays in the pool
rather than being over-promised.

You can check the consequence without trusting any of this: `pool()` and
`outstanding()` on the distributor are the XLM it holds and an upper bound on
what every holder could still claim. `pool >= outstanding` at all times, and
the smoke test asserts it after a full lifecycle. Our Polygon contracts expose
the same pair; the difference is that there the admin can withdraw the backing
and the discipline is off-chain, whereas this contract has **no withdrawal
entrypoint at all**. Deposited rent leaves only through a holder's `claim`.

**"Is there really no backend?"**
No server, no database, no indexer, no API key. The frontend talks to a public
Soroban RPC endpoint and nothing else. That is a genuine constraint rather than
only a boast: the activity feed shows roughly the last 24 hours, because that is
what public RPC retains and nothing else is remembering. The app says so on
screen rather than hiding it.

Production is not backend-free and we do not claim it should be. It adds a KYC
provider, an indexer, a document store and fiat ramps, none of which gains
authority over the contracts. [ARCHITECTURE.md](ARCHITECTURE.md) sets out which
half is which.

**"There is no pause in four of these contracts. What happens in an incident?"**
There is one, and it is in the fifth. Every write anywhere in the platform ends
up asking `compliance-registry` whether an address may hold shares - the token
asks on both sides of every movement, and the sale and exchange ask first for a
better error message. So `pause` on the registry stops minting, transfers,
purchases, buybacks, listings and fills in one transaction, with no pause code
in the other four contracts and no extra fee, because that call was already
happening. The drill proves it by halting the deployment and watching a purchase
and a listing both fail. Same mechanism, same reason, as the freeze list.

**"Why five contracts instead of one?"**
So each owns exactly one thing and can be reasoned about alone: the registry
knows who is eligible, the token knows balances, the sale knows price and
inventory, the exchange knows orders, the distributor knows income. It also
means the exchange can be paused or replaced without touching the token that
records who owns what, the piece that must never be redeployed casually.

The split is not uniform, and the asymmetry is the interesting part. **Four are
per-asset; the registry is per-platform.** Issuing a second property means
deploying four more contracts pointed at the same registry, and every investor
already verified stays verified. On our Polygon deployment the whitelist is
per-asset, so the same person is admitted separately for every property they buy
into: 269 whitelist writes across five assets in the measured window.

Deploying those four is cheap on Soroban. The wasm is uploaded once and
identified by hash, and each deployment is a new instance referencing the same
code. Contract code is not copied per instance the way EVM bytecode is.

**"What happens if you revoke someone who has an open order?"**
Their escrowed shares freeze in both directions. The refund is a transfer into
their address and the token checks the receiving side, so neither the seller
nor the admin can close the order; and `swap_order` checks the seller against
the registry as well as the buyer, so nobody can fill it either. That second
check was missing until a second audit pass: the shares leave from the
exchange's own address and the payment is a plain SAC transfer, so without it
nothing in the stack ever asked about the seller and a sanctioned holder could
still liquidate the position and be paid for it.

A freeze, not a loss. Admitting them again releases both paths, and
`revoking_a_seller_freezes_the_escrow_until_they_are_admitted_again` pins the
whole behaviour down. Worth knowing before an operator revokes someone
mid-listing.

Suspending them with `freeze` does exactly the same to the escrow, through the
same `allowed` check, and needed no code in the exchange at all. The difference
is in the record: a suspension leaves the KYC decision standing, so lifting it
is one call rather than sending the investor back through verification.

## Roadmap to mainnet

| Area | Work |
| --- | --- |
| **Compliance** | Point `kyc_provider` at a licensed SEP-12 anchor and delete the self-serve `register`; add re-verification with expiry, sanctions screening and per-jurisdiction eligibility rules ([design](KYC.md)) |
| **Legal structure** | Done, on paper: the reference document set is [docs/legal/](legal/) — a Wyoming DAO LLC per asset under an operator company under the framework license, offered under Reg S, with the constitutional bundle anchored on the register. Still to do: instantiate it for a real structure with counsel in the asset's and the operator's jurisdictions, form the company, move the title in |
| **Compliance module** | The clauses the pack states and the contracts do not yet execute: the 9.99% concentration cap and the member-count limit (OA §4.6), verification expiry, per-jurisdiction eligibility, and subscriptions escrowed until Final Closing (OA §6). Each is a registry claim richer than "allowed: yes" — [sequencing](legal/01-COMPLIANCE-ROADMAP.md) |
| **Key management** | Done: 2-of-3 admin account plus a separate operator role. Still to do: the signers on different machines and hardware, and a multisig for the KYC provider and the treasury too |
| **Upgradeability** | Done: `upgrade` behind the multisig. Still to do: a published pending-hash window, with the delay itself under governance |
| **Security** | The Soroban contracts are unaudited. A third-party audit is required before any real value moves through them |
| **Rewards** | Done: both markets settle the buyer inside the purchase. Still to do: a transfer hook on the token so a plain wallet-to-wallet movement settles too, non-reverting so the distributor can never freeze the register |
| **Rewards, separately** | Time-weighting. A round is credited to whoever is settled when it is deposited, so someone who settled a minute earlier is paid the same as someone who held all quarter. Per-round snapshots fix who is credited; weighting by how long they held is a further step and needs checkpointed balances |
| **Ramps** | SEP-24 and SEP-6 anchors so investors arrive with fiat, not with XLM |
| **Data** | An indexer behind the activity feed, so history outlives the RPC retention window |
