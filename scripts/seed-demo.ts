/**
 * Populate the live deployment so it looks like an asset people actually
 * invested in, rather than one nobody has touched.
 *
 *   npm run seed-demo            # distribute down to the default target
 *   npm run seed-demo -- 300     # leave this many shares unsold instead
 *
 * Everything it does is a real transaction by a real key against the live
 * contracts. Nothing here is a fixture or a mock: the holders it creates hold
 * shares the same way any investor would, and their orders are fillable by
 * anyone. That is the point - a screenshot of seeded state is only worth
 * taking if the state is genuine.
 *
 * Run it shortly before recording. The activity feed reads events straight
 * from public RPC, which retains roughly a day, so a deployment seeded a week
 * ago shows an empty feed however busy its ledger history is.
 *
 * The keys it generates go to `deployments/demo-wallets.json`, which is
 * gitignored. Only `G…` addresses are printed, for the same reason
 * `setup-multisig` prints only those: a secret on stdout ends up in terminal
 * scrollback and in any recording of the run.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Address, Keypair, nativeToScVal, type rpc, xdr } from '@stellar/stellar-sdk';
import {
  EXCHANGE_MAX_RATE_STROOPS,
  EXCHANGE_MIN_RATE_STROOPS,
  EXPLORER,
  fundViaFriendbot,
  kycProviderKeypair,
  loadEnv,
  operatorKeypair,
  ROOT,
  readDeployment,
  SHARE_PRICE_STROOPS,
  treasuryKeypair,
} from './lib.ts';
import { FeeLog, invoke, server, view, xlm } from './tx.ts';

/** Shares left unsold when no target is given. */
const DEFAULT_REMAINING_TARGET = 320n;

/**
 * Friendbot funds a new account with 10 000 XLM, and a share costs 100, so 80
 * is the most one wallet can buy while keeping enough for its own fees. Any
 * holder meant to be larger than this needs a second wallet, which is what the
 * plan below does rather than topping up from the treasury - a demo where the
 * issuer funded every buyer is not a demo of anything.
 */
const MAX_SHARES_PER_WALLET = 80n;

/**
 * The shape of a holder list on a real property: a handful of large positions,
 * a middle, and a long tail of people who bought one or two.
 *
 * Weights, not counts - the plan is scaled to whatever shortfall the sale
 * actually has when the script runs, so re-running after a partial seed does
 * not produce fourteen more whales.
 */
const HOLDER_SHAPE: bigint[] = [80n, 80n, 72n, 55n, 40n, 40n, 28n, 15n, 12n, 8n, 5n, 3n, 2n, 1n];

/** Orders left open on the secondary market, as [shares, price in XLM]. */
const ORDER_BOOK: [bigint, bigint][] = [
  [4n, 95n],
  [6n, 105n],
  [3n, 118n],
  [10n, 132n],
];

/** One round of rent, deposited by the operator once the holders exist. */
const RENT_ROUND_STROOPS = 2_500_000_000n;

/**
 * Keep the buyback pool able to repurchase about fifty shares.
 *
 * The exit path is the flow most likely to be tried twice by someone poking at
 * the demo, and the second attempt is the one that finds an empty pool.
 */
const BUYBACK_FLOOR_STROOPS = 5_000_0000000n;

interface Holder {
  keypair: Keypair;
  shares: bigint;
}

/**
 * How many shares each new wallet buys, scaled so the total lands on `wanted`.
 *
 * The shape is preserved rather than the amounts: scaling every entry by the
 * same factor keeps the distribution recognisable at any target, and the
 * remainder goes to the largest position so the total is exact.
 */
function planFor(wanted: bigint): bigint[] {
  const shapeTotal = HOLDER_SHAPE.reduce((a, b) => a + b, 0n);
  if (wanted <= 0n) return [];
  const scaled = HOLDER_SHAPE.map((w) => {
    const n = (w * wanted) / shapeTotal;
    return n < 1n ? 1n : n > MAX_SHARES_PER_WALLET ? MAX_SHARES_PER_WALLET : n;
  });
  // Hand the rounding remainder out one share at a time, largest first, so no
  // single wallet is pushed past what friendbot can fund.
  let short = wanted - scaled.reduce((a, b) => a + b, 0n);
  for (let pass = 0; short > 0n && pass < 100; pass++) {
    for (let i = 0; i < scaled.length && short > 0n; i++) {
      if (scaled[i] < MAX_SHARES_PER_WALLET) {
        scaled[i] += 1n;
        short -= 1n;
      }
    }
  }
  // And take any excess back off the smallest, so a tiny target does not
  // produce a wallet holding zero.
  let over = scaled.reduce((a, b) => a + b, 0n) - wanted;
  for (let i = scaled.length - 1; over > 0n && i >= 0; i--) {
    const take = scaled[i] - 1n < over ? scaled[i] - 1n : over;
    scaled[i] -= take;
    over -= take;
  }
  return scaled.filter((n) => n > 0n);
}

/**
 * A funded account, retrying friendbot rather than aborting a fourteen-wallet
 * run because one request was rate-limited.
 */
async function fundNewAccount(attempts = 4): Promise<Keypair> {
  const keypair = Keypair.random();
  for (let i = 1; i <= attempts; i++) {
    const res = await fundViaFriendbot(keypair.publicKey());
    if (res.ok) return keypair;
    if (i === attempts) {
      throw new Error(`friendbot refused ${keypair.publicKey()} ${attempts} times: ${res.status}`);
    }
    await new Promise((r) => setTimeout(r, 2000 * i));
  }
  throw new Error('unreachable');
}

async function remainingShares(
  rpcServer: rpc.Server,
  source: string,
  sale: string,
): Promise<bigint> {
  return (await view(rpcServer, source, sale, 'remaining')) as bigint;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const d = readDeployment();
  const rpcServer = server();
  const fees = new FeeLog();
  const source = env.deployerPublic;

  const provider = kycProviderKeypair();
  if (!provider) throw new Error('KYC_PROVIDER_SECRET is not set; the provider admits the holders');
  const operator = operatorKeypair(env);

  const target = process.argv[2] ? BigInt(process.argv[2]) : DEFAULT_REMAINING_TARGET;
  const remaining = await remainingShares(rpcServer, source, d.contracts.assetSale);
  console.log(`Sale holds ${remaining} shares; target is to leave ${target}.`);

  // Distribution is the part that cannot be repeated - it mints no shares, it
  // sells them, so a second full run would empty the sale. The later steps are
  // top-ups by design: run this again the morning of a recording and it adds a
  // rent round and refills the buyback pool without inventing more investors.
  const wanted = remaining - target;
  const plan = wanted > 0n ? planFor(wanted) : [];
  if (plan.length === 0) {
    console.log('Already at or below the target, so no new holders. Topping up the rest.');
  } else {
    console.log(
      `Distributing ${plan.reduce((a, b) => a + b, 0n)} shares across ${plan.length} wallets.`,
    );
    console.log(`  ${plan.join(', ')}`);
  }

  // 1 ------------------------------------------------------------------ //
  const holders: Holder[] = [];
  if (plan.length > 0) {
    console.log('\n1/6 Creating and funding the wallets...');
    for (const shares of plan) {
      const keypair = await fundNewAccount();
      holders.push({ keypair, shares });
      console.log(`  ${keypair.publicKey()}  ${shares} shares`);
    }
  }

  // 2 ------------------------------------------------------------------ //
  // One transaction for all of them. This is the entrypoint a licensed
  // provider would use after clearing a batch of applications, and it is
  // cheaper per investor than admitting them one at a time - though only by
  // about 13%, because what is paid for is a ledger write per address.
  if (holders.length > 0) {
    console.log('\n2/6 Admitting all of them in one transaction (register_verified_batch)...');
    const admitted = fees.record(
      'register_verified_batch',
      await invoke(rpcServer, {
        contractId: d.contracts.registry,
        method: 'register_verified_batch',
        args: [
          Address.fromString(provider.publicKey()).toScVal(),
          xdr.ScVal.scvVec(holders.map((h) => Address.fromString(h.keypair.publicKey()).toScVal())),
        ],
        signers: [provider],
      }),
    );
    console.log(`  ${holders.length} investors admitted: ${EXPLORER}/tx/${admitted.hash}`);
  }

  // 3 ------------------------------------------------------------------ //
  if (holders.length > 0) console.log('\n3/6 Buying...');
  let buyFees = 0n;
  for (const [i, h] of holders.entries()) {
    const cost = h.shares * SHARE_PRICE_STROOPS;
    const sent = await invoke(rpcServer, {
      contractId: d.contracts.assetSale,
      method: 'buy',
      args: [
        Address.fromString(h.keypair.publicKey()).toScVal(),
        nativeToScVal(h.shares, { type: 'i128' }),
        nativeToScVal(cost, { type: 'i128' }),
      ],
      signers: [h.keypair],
    });
    buyFees += sent.feeCharged;
    // One row in the fee table rather than fourteen identical ones; the rest
    // are summed and reported as a total below.
    if (i === 0) fees.record('buy', sent);
    console.log(`  ${h.shares} shares for ${xlm(cost)} XLM (fee ${xlm(sent.feeCharged)})`);
  }
  if (holders.length > 0) {
    console.log(`  ${holders.length} purchases cost ${xlm(buyFees)} XLM in fees altogether`);
  }

  // 4 ------------------------------------------------------------------ //
  // Listed by the larger holders, since they are the ones with shares to
  // spare, and priced across the band rather than all at par so the book has
  // something to look at.
  console.log('\n4/6 Opening the secondary market...');
  const sellers = holders.filter((h) => h.shares >= 12n);
  const openIds = async (): Promise<Set<string>> => {
    const book = (await view(rpcServer, source, d.contracts.exchange, 'orders')) as {
      id: bigint;
    }[];
    return new Set(book.map((o) => o.id.toString()));
  };
  const placed: { id: bigint; seller: Holder }[] = [];
  for (const [i, [amount, priceXlm]] of ORDER_BOOK.entries()) {
    const seller = sellers[i % sellers.length];
    if (!seller || seller.shares < amount) continue;
    const rate = priceXlm * 10_000_000n;
    if (rate < EXCHANGE_MIN_RATE_STROOPS || rate > EXCHANGE_MAX_RATE_STROOPS) {
      throw new Error(`${priceXlm} XLM is outside the exchange's band`);
    }
    // `add_order` returns the new id, but a submitted transaction gives back a
    // hash rather than a return value, so the id is found by diffing the book.
    // Taking the last entry would assume an ordering the contract does not
    // promise, and the book already holds orders this script did not place.
    const before = await openIds();
    const sent = await invoke(rpcServer, {
      contractId: d.contracts.exchange,
      method: 'add_order',
      args: [
        Address.fromString(seller.keypair.publicKey()).toScVal(),
        nativeToScVal(amount, { type: 'i128' }),
        nativeToScVal(rate, { type: 'i128' }),
      ],
      signers: [seller.keypair],
    });
    seller.shares -= amount;
    const after = (await view(rpcServer, source, d.contracts.exchange, 'orders')) as {
      id: bigint;
    }[];
    const fresh = after.find((o) => !before.has(o.id.toString()));
    if (fresh) placed.push({ id: fresh.id, seller });
    console.log(
      `  order #${fresh?.id ?? '?'}: ${amount} shares at ${priceXlm} XLM (fee ${xlm(sent.feeCharged)})`,
    );
  }

  // A partial fill, so the book shows a live order that someone has already
  // taken a bite out of rather than four untouched ones.
  const fillable = placed[0];
  const filler = holders.find(
    (h) => h.keypair.publicKey() !== fillable?.seller.keypair.publicKey(),
  );
  if (fillable && filler) {
    const sent = await invoke(rpcServer, {
      contractId: d.contracts.exchange,
      method: 'swap_order',
      args: [
        Address.fromString(filler.keypair.publicKey()).toScVal(),
        nativeToScVal(fillable.id, { type: 'u64' }),
        nativeToScVal(1n, { type: 'i128' }),
      ],
      signers: [filler.keypair],
    });
    console.log(`  order #${fillable.id} partially filled (fee ${xlm(sent.feeCharged)})`);
  }

  // 5 ------------------------------------------------------------------ //
  // The buyback is the one flow that fails on the DEMO rather than on the
  // contract: `sell` reverts with #307 when the pool cannot cover the payout,
  // and a reviewer who hits that reads it as broken rather than as unfunded.
  // Topping up from the treasury - which is where the purchases above sent
  // their money - keeps the exit path working for anyone trying it.
  console.log('\n5/6 Making sure the buyback pool can actually pay...');
  const pooled = (await view(rpcServer, source, d.contracts.assetSale, 'buyback_pool')) as bigint;
  if (pooled < BUYBACK_FLOOR_STROOPS) {
    const treasury = treasuryKeypair();
    if (!treasury) throw new Error('TREASURY_SECRET is not set; it funds the buyback pool');
    const top = BUYBACK_FLOOR_STROOPS - pooled;
    const sent = fees.record(
      'fund_buyback',
      await invoke(rpcServer, {
        contractId: d.contracts.assetSale,
        method: 'fund_buyback',
        args: [
          Address.fromString(treasury.publicKey()).toScVal(),
          nativeToScVal(top, { type: 'i128' }),
        ],
        signers: [treasury],
      }),
    );
    console.log(
      `  ${xlm(pooled)} -> ${xlm(BUYBACK_FLOOR_STROOPS)} XLM: ${EXPLORER}/tx/${sent.hash}`,
    );
  } else {
    console.log(`  ${xlm(pooled)} XLM already there, nothing to top up`);
  }

  // 6 ------------------------------------------------------------------ //
  // Every wallet above was settled by its own purchase, so this round reaches
  // all of them without anybody calling `settle`.
  console.log('\n6/6 Distributing a round of rent...');
  const deposited = fees.record(
    'deposit',
    await invoke(rpcServer, {
      contractId: d.contracts.rewards,
      method: 'deposit',
      args: [
        Address.fromString(operator.publicKey()).toScVal(),
        nativeToScVal(RENT_ROUND_STROOPS, { type: 'i128' }),
      ],
      signers: [operator],
    }),
  );
  console.log(`  ${xlm(RENT_ROUND_STROOPS)} XLM: ${EXPLORER}/tx/${deposited.hash}`);

  // A few claims, so the feed shows income being taken and not only paid in.
  for (const h of holders.slice(0, 3)) {
    const claimable = (await view(
      rpcServer,
      source,
      d.contracts.rewards,
      'claimable',
      Address.fromString(h.keypair.publicKey()).toScVal(),
    )) as bigint;
    if (claimable <= 0n) continue;
    await invoke(rpcServer, {
      contractId: d.contracts.rewards,
      method: 'claim',
      args: [Address.fromString(h.keypair.publicKey()).toScVal()],
      signers: [h.keypair],
    });
    console.log(`  claimed ${xlm(claimable)} XLM`);
  }

  // ------------------------------------------------------------------- //
  // Appended, never replaced. A top-up run creates no wallets, and truncating
  // the file to an empty list would strand every holder from the run before -
  // their shares would be unreachable, which on testnet costs nothing and is
  // still the wrong thing for a script to do quietly.
  if (holders.length > 0) {
    const walletsFile = join(ROOT, 'deployments', 'demo-wallets.json');
    const existing: unknown[] = existsSync(walletsFile)
      ? JSON.parse(readFileSync(walletsFile, 'utf8'))
      : [];
    const rows = [
      ...existing,
      ...holders.map((h) => ({ public: h.keypair.publicKey(), secret: h.keypair.secret() })),
    ];
    writeFileSync(walletsFile, `${JSON.stringify(rows, null, 2)}\n`);
  }

  const left = await remainingShares(rpcServer, source, d.contracts.assetSale);
  const pool = (await view(rpcServer, source, d.contracts.rewards, 'pool')) as bigint;
  const outstanding = (await view(rpcServer, source, d.contracts.rewards, 'outstanding')) as bigint;
  const book = (await view(rpcServer, source, d.contracts.exchange, 'orders')) as unknown[];

  console.log('\nDEMO STATE SEEDED');
  console.log(`  holders created   ${holders.length}`);
  console.log(`  shares sold       ${remaining - left} (sale now holds ${left})`);
  console.log(`  open orders       ${book.length}`);
  console.log(`  reward pool       ${xlm(pool)} XLM vs ${xlm(outstanding)} outstanding`);
  console.log(`  keys              deployments/demo-wallets.json (gitignored)`);
  console.log(`\n  ${EXPLORER}/contract/${d.contracts.assetSale}`);
  fees.print();
  console.log('\nRecord the demo soon: the activity feed only reaches as far back as RPC keeps.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
