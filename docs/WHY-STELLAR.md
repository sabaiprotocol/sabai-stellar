# Why Stellar, measured on both chains

The Polygon column here is not a benchmark. It is **2,285 real mainnet
transactions** from five live Sabai assets — Layan Green Park L-111 and Layan
Verde B2 304, B2 308, B9 305 and B3 210 — between 2025-10-04 and 2026-08-04,
pulled from Blockscout and reduced to a median per operation. Every successful
transaction to each asset's three contracts is in the sample; nothing is
sub-sampled. The Stellar column is `feeCharged` from the ledger, taken from the
deployment this repository points at.

Prices: POL $0.072795, XLM $0.174268 (CoinGecko, 2026-08-03). Every Stellar
figure in the table below comes from one warm run of `npm run smoke-buy` and the
two drills against the deployment this repository points at, so the numbers and
the explorer links describe the same transactions. [How reproducible those
figures are](#the-one-thing-that-does-move-the-total-and-it-is-not-congestion)
is measured further down rather than asserted, including what a run after an
idle period costs and why.

| User action | Polygon (median, real) | Sigs | Stellar (measured) | Sigs |
| --- | --- | --- | --- | --- |
| Admit an investor (`addWhiteList` / `register_verified`) | $0.0004 | 1 | 0.0186597 XLM · $0.0033 | 1 |
| Buy shares on the primary sale ** | $0.0031 | **2** | 0.0699334 XLM · $0.0122 | 1 |
| Sell back to the buyback pool * | $0.0031 | **2** | 0.0043498 XLM · $0.0008 | 1 |
| List shares on the secondary market | $0.0021 | 1 | 0.0468972 XLM · $0.0082 | 1 |
| Fill someone else's order ** | $0.0039 | **2** | 0.0703621 XLM · $0.0123 | 1 |
| Cancel an order | $0.0016 | 1 | 0.0039576 XLM · $0.0007 | 1 |
| Claim rental income | $0.0022 | 1 | 0.0228281 XLM · $0.0040 | 1 |
| Distribute one income round (issuer) | $0.0093 *per batch* | 1 | 0.0023166 XLM · $0.0004 *total* | 1 |

The compliance controls, which are issuer actions rather than investor ones and
have no per-investor cost at all:

| Issuer / provider action | Signatures | Stellar (measured) |
| --- | --- | --- |
| Halt the whole deployment (`pause`) | 1, operator | 0.0012531 XLM · $0.0002 |
| Lift the halt (`resume`) | **2 of 3**, admin | 0.0012495 XLM · $0.0002 |
| Suspend one holder (`freeze`) | 1, KYC provider | 0.0186162 XLM · $0.0032 |
| Lift a suspension (`unfreeze`) | 1, KYC provider | 0.0013532 XLM · $0.0002 |
| Withdraw eligibility (`revoke`) | 1, KYC provider | 0.0013532 XLM · $0.0002 |
| Forced revocation of shares (`revoke_shares`) | **2 of 3**, admin | 0.0023886 XLM · $0.0004 |
| Name a successor admin (`transfer_admin`) | **2 of 3**, admin | 0.0038555 XLM · $0.0007 |
| Withdraw that offer (`cancel_transfer_admin`) | **2 of 3**, admin | 0.0013025 XLM · $0.0002 |
| Re-point a contract at code already installed (`upgrade`) | **2 of 3**, admin | 0.0014311 XLM · $0.0003 |
| Replace a contract's code with a **new** build (`upgrade`) | **2 of 3**, admin | 2.6656110 XLM · $0.4645 |

Those last two rows are the same entrypoint, and the difference between them is
worth more than the row. The drill's `upgrade` re-points a contract at the wasm
hash it is already running, so nothing new enters the ledger and it costs a
third of a cent. A real upgrade to freshly uploaded code pays rent on a code
entry tens of kilobytes wide, and cost **1900x** as much. Quoting only the
cheap one — which an earlier version of this page did — would have been quoting
a no-op.

Both numbers are from this deployment: the second is the `asset-sale` upgrade
that put the auto-settle described below on-chain, alongside `asset-exchange`
at 3.3442260 XLM. Still under a dollar to replace the code of a live contract
without moving it or touching its state, and the state surviving is the part
that mattered: the sale came back with the same 986 shares remaining, the same
price, the same roles, and the exchange with the same open order.

Halting an entire asset costs a fifth of a cent and one transaction, because the
contracts that stop are not the contract being called.
`npm run compliance-drill` and `npm run governance-drill` produce that table and
assert every one of those controls actually blocks what it should and releases
it again.

**Multisig is not a cost centre here.** Halting with one hot signature cost
0.0012531 XLM; lifting the halt with two of three cold ones cost 0.0012495 -
the same operation class, and the two-signature transaction came in *lower*
than the one-signature one, by 36 stroops out of 12 500. A Soroban fee tracks the resources a call touches,
and a second signature is 64 more bytes on an envelope whose cost is already
dominated by the contract invocation. The EVM equivalent is a Safe contract
executing a nested call on the caller's behalf, and that is real extra gas on
every single transaction.

Both sides of the first row are written by the platform, not the investor:
Polygon's `addWhiteList` is called by our backend, and `register_verified` by
the KYC provider's key. Same operation, two chains.

\* The buyback row has no true Polygon counterpart, because our production
contracts have no buyback. The figure quoted there is the closest equivalent
transfer. See [DESIGN-NOTES.md](DESIGN-NOTES.md).

\*\* **Both purchase rows carry a cost Polygon does not have, and it used to be
its own row.** This token has no transfer hook into the reward accounting, so
shares that arrive somewhere new earn nothing until that address is settled.
That used to be a second transaction the investor had to know to send —
0.0464308 XLM on top of a 0.0237394 purchase. Both markets now settle the buyer
inside the purchase, so the money is the same and the signature count is not:

| | before | now |
| --- | ---: | ---: |
| `buy` | 0.0238276 | 0.0699334 |
| `settle`, separately | 0.0464738 | — |
| the investor's total | **0.0703014**, 2 signatures | **0.0699334**, 1 signature |

Merging them saves 3680 stroops of transaction overhead, which is nothing, and
one wallet prompt, which is not. The whole ten-operation lifecycle came out at
**0.2578758 XLM** doing strictly more than it used to: the old run settled only
the primary buyer, and the peer-to-peer buyer silently earned nothing until
they worked it out. Settling both under the old code would have cost
0.2583899 — the same to within 0.2%.

`asset-sale` and `asset-exchange` do this by calling `settle` on the buyer
after the shares land. It is not a re-entrant call: the token's own `transfer`
has already returned, so the token is not on the stack when the distributor
reads a balance back out of it. And `settle` moves no money and takes no
authorization, so doing it on a buyer's behalf can only ever help them.

The gap that remains is the plain wallet-to-wallet transfer, which no contract
is watching. That is the case the manual call still exists for, and it is the
rarest one here — both sides of such a transfer have to be in the registry
already.

Every Stellar figure is a transaction you can open. All eight come from the same
warm run, so a figure and the link under it describe the same ledger:
[register_verified](https://stellar.expert/explorer/testnet/tx/2ba896ef7000736421e73af021ff37dd6623b1be2ceea46eedad7c1b0452a42b) ·
[buy](https://stellar.expert/explorer/testnet/tx/03cea44326a1e8a3d482bde4c16ca7a51fe9baa71f360c18cd7d2e87152f1f15) ·
[sell](https://stellar.expert/explorer/testnet/tx/fd58285a4109a85430a4db85ea045edcb436747ce265e16f07e60e86cc4f0f97) ·
[add_order](https://stellar.expert/explorer/testnet/tx/c758cb5a7d982dcb293babb20108c1e8fc56581d0b768701ad928c1da5e0a6de) ·
[swap_order](https://stellar.expert/explorer/testnet/tx/70df95a1db1daa77267e0665b1d6a78bb28141a9e486a89560706f118dfaca75) ·
[close_order](https://stellar.expert/explorer/testnet/tx/317889c1b2447057f6f57d3dd29c04f01f1a0866e339dba38582020af6bc930e) ·
[claim](https://stellar.expert/explorer/testnet/tx/eda5bb238bf797f55abc97c35885843602beaae0808e20ff959056fc5dcaa190) ·
[deposit](https://stellar.expert/explorer/testnet/tx/e9e75c9e36f9e65a6a6f5239b7021cf5c68607c0519b00846567ae20836ba6ba).

The two upgrades that put this on-chain are open too:
[asset-sale](https://stellar.expert/explorer/testnet/tx/25adca20e5de164d0035fb932c2f4d38f7ac35c8087a8a3f684635bb6c824915) ·
[asset-exchange](https://stellar.expert/explorer/testnet/tx/8852883b8d4808aff27945d7a653cc088a1703b0fb5451c23f00ef4b6fecbcd4).

`npm run smoke-buy` reproduces the whole sequence from a fresh wallet and prints
this table from its own transactions.

The Polygon side is public too — the five asset contracts the measurement is
taken from:
[Layan Green Park L-111](https://polygonscan.com/address/0x3f110f6b66d8d966a3a695e24e3942789a590389) ·
[Layan Verde B2 304](https://polygonscan.com/address/0xb208912ddf8fbd72dc23b514033b02a34bfcfd27) ·
[B2 308](https://polygonscan.com/address/0xe37e45d1ff7b0c4dc85d55fc8e4b8f2234b4e194) ·
[B9 305](https://polygonscan.com/address/0x8aa32bc604bfe28f2396ef36ad2c6f3859885446) ·
[B3 210](https://polygonscan.com/address/0xFAAd588fC451D7B366c1AB317E7911fa91c7ed9F).

Each of those has a whitelist and an exchange contract beside it, and the
measurement reads all three per asset — fifteen contracts, because the
operations being compared do not all live in the same one.

## The honest reading

**At today's prices Stellar is not uniformly cheaper.** Listing an order costs
about 4x what it does on Polygon, claiming income about 2x, and the compliance
`settle` call has no Polygon counterpart at all. Anyone selling Soroban purely
on per-transaction price is comparing against a different week's gas market.
What the move actually buys is elsewhere.

### Fee predictability

Across those 2,285 transactions the gas price ranged from 25 to 7,122 gwei: p10
45, median 251, p90 655. The *same* operation therefore cost between $0.0001 and
$0.0291 depending on when it landed.

| Operation | n | min | median | max | spread |
| --- | ---: | ---: | ---: | ---: | ---: |
| `addWhiteList` | 269 | $0.0001 | $0.0004 | $0.0260 | **294x** |
| `addOrder` | 30 | $0.0005 | $0.0021 | $0.0985 | **212x** |
| `approve` | 23 | $0.0001 | $0.0005 | $0.0109 | 151x |
| `sendTokens` | 281 | $0.0002 | $0.0026 | $0.0291 | **140x** |
| `claimRewards` | 1081 | $0.0002 | $0.0022 | $0.0226 | 136x |
| `addRewardsGroup` | 189 | $0.0007 | $0.0093 | $0.0777 | 111x |
| `swapOrder` | 22 | $0.0003 | $0.0039 | $0.0153 | 46x |
| `closeOrder` | 18 | $0.0002 | $0.0016 | $0.0052 | 31x |

`sendTokens` is the buy, and it is the row worth pausing on: the operation an
investor performs most visibly cost anywhere between a fiftieth of a cent and
three cents for exactly the same work, decided by nothing the investor did.

A Soroban fee is a function of the resource footprint the transaction actually
touches: CPU instructions, ledger entries read and written, their sizes, and
rent for the TTL extension. Congestion does not enter into it, and simulation
returns the number before the investor signs.

That is not the same as "always identical", and the honest measurement says so.
Two consecutive warm runs of the full lifecycle cost **0.2581100 and 0.2578758
XLM** - a difference of **2342 stroops out of 2.58 million, or 0.09%**. (The
very first run against a freshly deployed contract set is dearer than either,
because it creates the ledger entries the later runs only update; the figures
below are the warm ones, which is what a live platform actually charges.) Per
operation:

| Operation | warm run 1 | warm run 2 | difference |
| --- | ---: | ---: | ---: |
| `sell` | 0.0043498 | 0.0043498 | **identical** |
| `claim` | 0.0228281 | 0.0228281 | **identical** |
| `register_verified` | 0.0186597 | 0.0186597 | **identical** |
| `swap_order` | 0.0703621 | 0.0703621 | **identical** |
| `close_order` | 0.0039576 | 0.0039576 | **identical** |
| `register` | 0.0185999 | 0.0185713 | 286 stroops |
| `buy` | 0.0697463 | 0.0699334 | 1871 stroops |
| `add_order` | 0.0466722 | 0.0468972 | 2250 stroops |
| `deposit` | 0.0029343 | 0.0023166 | 6177 stroops |

Five of the nine are bit-identical, including both purchase paths - the two
that now do the most work. The rest move by hundreds of stroops, the residue of
ledger entries whose size shifts as the data in them changes: how many ids the
open-order vector holds that minute, how wide a balance has grown. `deposit` is
the widest swing in relative terms and the smallest in absolute, and it is rent
rather than computation - the section below is about exactly that.

Against **31x to 294x** for the same operations on Polygon, driven by nothing
about the operation at all.

#### The one thing that does move the total, and it is not congestion

Run the lifecycle after the deployment has sat idle for a while and the total
comes out around **0.274 XLM**, well above the figures above. It is worth being
precise about why, because a reviewer who runs `npm run smoke-buy` once, after a
gap, will see that number and reasonably suspect the table oversells.

Soroban charges rent when a call extends a ledger entry's time to live, and the
charge scales with how many ledgers are being added. An entry touched minutes
ago needs almost nothing; the same entry after a week of no activity has drifted
towards expiry and the extension back to full TTL costs proportionally more. So
the premium is paid by whichever calls reach each entry *first* - later calls in
the same run find them already refreshed and pay nothing for it.

The measurement, taken on the previous build - the one where `settle` was still
the investor's own transaction - across a week of the deployment sitting idle:

| Operation | after the gap | immediately after | vs a warm run a week earlier |
| --- | ---: | ---: | ---: |
| `sell` | 0.0043447 | 0.0043447 | 13 stroops |
| `deposit` | 0.0023093 | 0.0023093 | **identical** |
| `claim` | 0.0228281 | 0.0228281 | 4 stroops |
| `register_verified` | 0.0186638 | 0.0186638 | 7 stroops |
| `swap_order` | 0.0243884 | 0.0243884 | 17 stroops |
| `close_order` | 0.0039451 | 0.0039451 | 9 stroops |
| `register` | 0.0191601 | 0.0186040 | 251 stroops |
| `settle` | 0.0649704 | 0.0464738 | 430 stroops |
| `add_order` | 0.0679367 | 0.0465313 | 503 stroops |
| `buy` | 0.0455658 | 0.0238276 | 882 stroops |
| **total** | **0.2741124** | **0.2119161** | **2116 stroops, 0.1%** |

The second run is straight back in the band. Six operations are unchanged to the
stroop across a week and across a replacement of the contract code, and the
whole lifecycle moved by one part in a thousand.

Those are the pre-upgrade numbers and they are left here rather than restated,
because what they measure - a fee that moves with rent and with nothing else -
is a property of the chain rather than of this build, and rewriting them would
lose the week-long interval that makes the point.

Rent is also the one component a platform can plan for: it is a function of how
much state the asset keeps and how often it is touched, both of which the issuer
chooses. Gas priced by whoever else is bidding for the same block is not.

For a platform that has to quote an investor a total cost before they sign,
that difference is a product problem rather than an accounting one. And the
number simulation returns before the signature is the number charged, so the
quote does not have to be an estimate in the first place.

### Income distribution stops scaling with holder count

On Polygon, paying out a round means pushing to every holder in batches: 189
`addRewardsGroup` transactions across five assets in this window, and the
largest single batch consumed **1,595,393 gas**. That number grows with the
holder list. Those 189 transactions cost **31.26 POL** between them, a third of
the 95.47 POL every one of the 2,285 transactions cost in total — for an
operation that on Soroban is one call at a fixed price.

The Soroban design flips it. The issuer calls `deposit` once (0.0022 XLM, one
transaction), the contract records income per share, and each holder pays their
own `claim`. The issuer's cost is identical whether the asset has 20 holders or
20,000, because `deposit` writes one number and never walks the list.

The honest counterpart: **batching does much less on Soroban than on an EVM
chain**, and the registry's `register_verified_batch` shows why. Admitting one
investor costs 0.0234 XLM; admitting a hundred in one transaction costs 0.0203
per investor. About 13%, not an order of magnitude, because what is being paid
for is a ledger write per address and only the base fee amortizes. That is the
same fact from the other side: a fee that tracks the resources touched does not
reward packing work into fewer transactions, which is exactly why the reward
distribution had to stop walking the holder list rather than walk it in bigger
steps.

### One signature instead of two

ERC-20's `approve` plus call means the investor confirms two wallet prompts,
pays two fees, and can strand an allowance in between. Soroban's `require_auth`
authorizes the exact sub-invocation inside the same transaction, so buying is
one prompt that either fully succeeds or fully reverts. Three of the eight flows
above lose a signature this way.

### No second asset to acquire first

A Polygon investor needs POL for gas *and* USDT to invest. On Stellar, fees are
paid in XLM, the same asset used for the purchase. And when we would rather the
investor pay nothing at all, Stellar has fee sponsorship as a protocol
primitive: a fee-bump transaction lets the platform's account cover an
investor's fee with no relayer, no paymaster contract and no meta-transaction
scheme.

### Standards instead of bespoke integrations

SEP-12 for KYC data exchange with a licensed provider, SEP-24 and SEP-6 for
fiat on and off ramps, SEP-41 for the token interface, and a built-in DEX with
path payments so an investor can arrive holding something else. On the Polygon
deployment each of these is a partner integration we build and maintain
ourselves.

### Finality you can put in the UI

A ledger closes about every five seconds and a transaction is final when it
closes. There is no reorg window to wait out before telling an investor they own
something.
