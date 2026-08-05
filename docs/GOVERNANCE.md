# Who controls this asset

Four keys, and none of them can do the others' job. Every claim on this page is
checked on-chain by `npm run governance-drill`, which halts the deployment,
tries to lift the halt with the wrong key, replaces a contract's code and reads
the state back — against the live testnet deployment, in about a minute.

## The roles

| Role | What it is | What it can do | What it cannot |
| --- | --- | --- | --- |
| **Admin** | A Stellar account with 3 signers, medium threshold 2, master key weight 0 | Issue shares, confiscate them, reprice the sale, withdraw funds, admit protocol contracts, rotate the KYC provider, lift a halt, replace the code, hand the role on | Admit an investor |
| **Operator** | One ordinary key | Halt the deployment, open and close both markets, force-cancel an order, distribute a rent round | Move a share, change a price, withdraw anything, lift a halt, promote itself |
| **KYC provider** | One key, usually the licensed provider's | Admit, suspend and revoke investors | Everything else |
| **Treasury** | Custody | Hold the issuance, fund the sale with a tranche | Issue, and it is the fixed destination of a forced revocation rather than a chooser of one |

The deployer key appears in the scripts but holds no role: it uploads the wasm,
pays the deploy fees, and is the account the platform's commission lands on.

Those are the roles the contracts enforce. Who is supposed to *hold* them is a
corporate question, and the legal pack answers it in
[08-OPERATING-POLICY.md](legal/08-OPERATING-POLICY.md) §3: the three admin
signers sit with three people in deliberately different positions — a director
of the issuing company's manager, the platform's engineering lead, and an
independent custodian who signs only on written instruction — on hardware
signers in separate locations, while the operator is a rotating on-call hot key.
The split only means something if no two of the three answer to the same person,
and that is a policy the contracts cannot check.

## Why the admin is an account and not a contract

On most chains "2-of-3 multisig" means deploying a Safe and auditing it. On
Stellar it is a property of an ordinary account: a signer list and three
thresholds that the network checks on every transaction that account sources.

So there is no extra contract in this deployment, nothing else to audit, and
the signer set is visible on any explorer:

```
thresholds  low 2 / med 2 / high 3
signer  G…76TFG  weight 1
signer  G…YBMFJ  weight 1
signer  G…3ZX57  weight 1
master  G…43B4D  weight 0
```

The master key having weight 0 is the part that matters. Without it the account
would still accept a single signature from the key that created it, and the
whole arrangement would be decoration.

`high 3` covers changing the signer set itself, so that takes all three. Losing
one key therefore freezes the signer list — and does not freeze the asset,
because two of three still authorize `transfer_admin`, and migrating to a fresh
multisig account is exactly what the two-step handover is for.

## The asymmetry: stopping is cheap, starting is not

`pause` is reachable by the operator. `resume` is admin-only.

Halting an asset that turns out to be fine costs an hour of downtime. Starting
one that is not fine can cost an investor their money, and it is the decision
most likely to be made at 3am by whoever is awake. So the cheap direction is one
hot signature and the expensive one costs two of three cold ones.

A stolen operator key can stop this deployment. It cannot start it again, and it
cannot take anything while it is stopped.

## What each entrypoint answers to

| Contract | Admin only | Admin or operator |
| --- | --- | --- |
| compliance-registry | `resume`, `set_participant`, `set_kyc_provider` | `pause` |
| share-token | `mint`, `revoke_shares`, `set_terms` | — |
| asset-sale | `set_price`, `withdraw_buyback`, `withdraw_shares` | `set_available` |
| asset-exchange | — | `set_available`, `close_order_by` |
| rewards-distributor | — | `deposit` |
| all five | `upgrade`, `set_operator`, `transfer_admin`, `cancel_transfer_admin` | — |

Three of the operator's powers look like they move value and do not:

- `deposit` moves money **into** the reward pool, and that contract has no
  entrypoint that sends it anywhere except to a holder claiming their own share.
- `close_order_by` returns escrowed shares to their seller and can send them
  nowhere else.
- `set_available` stops trade. `sell` and `close_order` stay open either way, so
  closing a market never traps a holder who wants out.

`set_price` is not on that list even though it looks routine. A price of one
stroop empties the inventory into whoever notices first, so a stolen hot key
would be worth the whole tranche.

## Handing the admin role on

Two steps: `transfer_admin(new)` names a successor, `accept_admin()` is signed
by that successor. Until the second call the old admin is still the admin, and
`cancel_transfer_admin` withdraws the offer.

A one-step setter would hand the asset to whatever address was typed, and the
address being typed here is a 56-character multisig account nobody reads twice.
This version cannot land anywhere that did not sign for it.

Each contract stores its own roles, so a handover is five transactions.
`npm run admin -- transfer-admin G…` fans out across all five rather than
leaving four of them behind.

## Replacing the code

`upgrade(new_wasm_hash)` re-points a contract at wasm already installed on the
network. Admin only, so two of three signatures. Storage is untouched: an
upgrade that changes the shape of what is stored has to migrate it in a call
made afterwards.

The drill proves the mechanism rather than describing it — one signature is
refused, two go through, and the registry's roles, provider and participant list
all read back unchanged afterwards.

Two signatures are what the *contract* requires. What the pack requires around
them is an independent audit of the new code, notice to holders naming the hash
to be adopted, and a corporate approval on the minutes, all before the quorum
signs — [operating agreement](legal/04-OPERATING-AGREEMENT.md) §7.4 and
[operating policy](legal/08-OPERATING-POLICY.md) §4. That clause also states the
consequence plainly, which is worth repeating here: every restriction on the
manager holds because the deployed code holds it, so the power to replace the
code sits upstream of all of them. The quorum, the audit and the notice are the
protection; the contract is not protecting itself from its own admin.

**What production adds and this does not: a timelock.** The obvious next step is
propose → wait N ledgers → apply, so holders can see a code change coming and
exit before it lands. It is not here for a reason worth stating rather than
hiding: a timelock is only worth its complexity if the delay itself cannot be
changed at will, and an admin who can set the delay to zero has a timelock that
means nothing. Doing it properly means the delay setter is itself timelocked,
which is a governance design rather than an afternoon's work — and a demo that
takes 48 hours to complete is not a demo. The multisig plus the two-step
handover is what is actually enforced today.

## What is still a single point of failure

- **The KYC provider is one key.** In production it belongs to the licensed
  provider and should be their multisig, for exactly the reasons above.
- **The treasury is one key.** It holds no shares in the steady state — the
  issuance went straight into the sale contract — but it is the destination of
  every forced revocation, so it should be a multisig too.
- **All the keys are in one `.env` on one machine.** That is the demo half of
  this setup, and the exact distance between it and
  [08-OPERATING-POLICY.md](legal/08-OPERATING-POLICY.md) §3. Real 2-of-3 means
  two people, two machines, and the transaction XDR travelling between them; the
  contracts cannot tell the difference and the operational practice is what
  makes it real.
- **Nothing here produces the second record.** The policy asks for two records
  of every privileged action: the on-chain event, which the contracts already
  publish, and a corporate one naming its authority — a pricing memo behind a
  repricing, a court order or probate grant behind a forced transfer. The first
  half is automatic and the second is a filing cabinet.
- **No hardware signers.** Freighter and a file. Ledger support is a wallet
  question, not a contract one.

## Reproducing all of it

```bash
cd scripts
npm run setup-multisig    # builds the account: 3 signers, med 2, master 0
npm run deploy            # 12 of the 15 steps are 2-of-3 transactions
npm run governance-drill  # every claim above, against the live deployment
```

The drill's output names each property as it proves it, and fails loudly rather
than skipping when one does not hold. See also
[KYC.md](KYC.md) for the provider's separate powers,
[LEGAL-STRUCTURE.md](LEGAL-STRUCTURE.md) for what the admin role would mean once
a real entity stands behind the shares, and
[docs/legal/](legal/) for the documents that put a person and a duty behind each
of these keys.
