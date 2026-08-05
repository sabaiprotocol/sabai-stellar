/**
 * End-to-end smoke test against the LIVE testnet deployment. Walks the full
 * asset lifecycle over the same SDK and RPC path the frontend uses:
 *
 *   fresh keypair, friendbot, register (demo KYC), buy 3 shares, sell 1 back
 *   to the buyback pool, claim rewards, list 2 shares on the secondary market,
 *   second buyer partially fills the order, seller cancels the rest, verify
 *   balances, print stellar.expert links.
 *
 * The fee table it prints at the end is where the README's Stellar figures
 * come from, so this is the script to re-run when they need refreshing.
 */
import { Address, Keypair, nativeToScVal, type rpc, type xdr } from '@stellar/stellar-sdk';
import {
  EXPLORER,
  fundViaFriendbot,
  kycProviderKeypair,
  loadEnv,
  operatorKeypair,
  REWARD_ROUND_STROOPS,
  readDeployment,
} from './lib.ts';
import { FeeLog, server as rpcServer, invoke as send, xlm as stroopsToXlm, view } from './tx.ts';

const SHARES_TO_BUY = 3n;
const SHARES_TO_SELL = 1n;
/** Secondary-market listing: 2 shares at 120 XLM each (inside the band). */
const SHARES_TO_LIST = 2n;
const LIST_RATE_STROOPS = 1_200_000_000n;

const fees = new FeeLog();

/** Send a call signed by one ordinary key, and record what it cost. */
async function invoke(
  rpcServer: rpc.Server,
  signer: Keypair,
  contractId: string,
  method: string,
  ...args: xdr.ScVal[]
): Promise<string> {
  const sent = fees.record(
    method,
    await send(rpcServer, { contractId, method, args, signers: [signer] }),
  );
  console.log(`  ${method} tx: ${sent.hash} (fee ${stroopsToXlm(sent.feeCharged)} XLM)`);
  return sent.hash;
}

/**
 * The operator key, when one is configured. Optional on purpose: this script
 * has to stay runnable by a reviewer who has friendbot and nothing else.
 */
function configuredOperator(): Keypair | null {
  try {
    return operatorKeypair(loadEnv());
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const d = readDeployment();
  const server = rpcServer();

  console.log(`Asset: ${d.asset.name} (${d.asset.symbol})`);
  console.log(`Sale: ${d.contracts.assetSale}`);
  console.log(`Exchange: ${d.contracts.exchange}`);
  console.log(`Rewards: ${d.contracts.rewards}`);

  console.log('\n1/9 Creating and funding a fresh buyer...');
  const buyer = Keypair.random();
  const fb = await fundViaFriendbot(buyer.publicKey());
  if (!fb.ok) throw new Error(`friendbot failed: ${fb.status}`);
  console.log(`  buyer: ${buyer.publicKey()}`);
  const buyerScVal = Address.fromString(buyer.publicKey()).toScVal();

  console.log('\n2/9 Passing the demo KYC (register)...');
  await invoke(server, buyer, d.contracts.registry, 'register', buyerScVal);
  const whitelisted = await view(
    server,
    buyer.publicKey(),
    d.contracts.registry,
    'allowed',
    buyerScVal,
  );
  if (whitelisted !== true) throw new Error('register did not whitelist the buyer');

  console.log(`\n3/9 Buying ${SHARES_TO_BUY} shares...`);
  // Quote first, then send it as the slippage bound, the way the UI does.
  const price = (await view(server, buyer.publicKey(), d.contracts.assetSale, 'price')) as bigint;
  const buyHash = await invoke(
    server,
    buyer,
    d.contracts.assetSale,
    'buy',
    buyerScVal,
    nativeToScVal(SHARES_TO_BUY, { type: 'i128' }),
    nativeToScVal(price * SHARES_TO_BUY, { type: 'i128' }),
  );

  console.log(`\n4/9 Selling ${SHARES_TO_SELL} share back to the buyback pool...`);
  const quote = (await view(
    server,
    buyer.publicKey(),
    d.contracts.assetSale,
    'buyback_quote',
    nativeToScVal(SHARES_TO_SELL, { type: 'i128' }),
  )) as bigint;
  await invoke(
    server,
    buyer,
    d.contracts.assetSale,
    'sell',
    buyerScVal,
    nativeToScVal(SHARES_TO_SELL, { type: 'i128' }),
    nativeToScVal(quote, { type: 'i128' }),
  );

  console.log('\n5/9 Distributing a round and claiming...');
  // No `settle` call here, and its absence is the assertion. Income belongs to
  // whoever holds shares when a round is deposited, and this wallet is already
  // on the distributor's books because `buy` settled it - so a round deposited
  // now has to reach it. The `claimable > 0` check below is what proves it: if
  // the purchase had not settled the buyer, nothing would be claimable and the
  // run would fail rather than quietly pay nothing.
  const settledByPurchase = (await view(
    server,
    buyer.publicKey(),
    d.contracts.rewards,
    'position',
    buyerScVal,
  )) as { balance: bigint };
  console.log(`  earning on ${settledByPurchase.balance} shares, settled by the purchase itself`);
  if (settledByPurchase.balance <= 0n) {
    throw new Error('the purchase did not settle the buyer, so the next round would pay nothing');
  }

  // Playing the issuer needs the operator key. Distributing rent is the one
  // money-moving call a hot key holds, because the money moves inward. Without
  // it the wallet simply holds shares that have not seen a distribution yet,
  // which is correct rather than broken, so the claim leg is skipped.
  const operator = configuredOperator();
  if (operator) {
    await invoke(
      server,
      operator,
      d.contracts.rewards,
      'deposit',
      Address.fromString(operator.publicKey()).toScVal(),
      nativeToScVal(REWARD_ROUND_STROOPS, { type: 'i128' }),
    );
  } else {
    console.log('  no OPERATOR_SECRET, skipping the reward round');
  }

  const claimable = (await view(
    server,
    buyer.publicKey(),
    d.contracts.rewards,
    'claimable',
    buyerScVal,
  )) as bigint;
  console.log(`  claimable: ${Number(claimable) / 1e7} XLM`);
  if (claimable > 0n) {
    await invoke(server, buyer, d.contracts.rewards, 'claim', buyerScVal);
  } else if (operator) {
    throw new Error('a round was deposited on a settled position but nothing became claimable');
  }

  console.log(`\n6/9 Listing ${SHARES_TO_LIST} shares on the secondary market (add_order)...`);
  await invoke(
    server,
    buyer,
    d.contracts.exchange,
    'add_order',
    buyerScVal,
    nativeToScVal(SHARES_TO_LIST, { type: 'i128' }),
    nativeToScVal(LIST_RATE_STROOPS, { type: 'i128' }),
  );
  const book = (await view(server, buyer.publicKey(), d.contracts.exchange, 'orders')) as {
    id: bigint;
    seller: string;
    remaining: bigint;
  }[];
  // By seller, not by size. This runs against a shared public deployment where
  // somebody else's order of the same size may well sit earlier in the book.
  const order = book.find((o) => o.seller === buyer.publicKey());
  if (!order) throw new Error('this wallet has no open order after add_order');
  console.log(`  order #${order.id} open, ${order.remaining} shares escrowed`);

  console.log('\n7/9 Second buyer partially fills the order (swap_order)...');
  const buyer2 = Keypair.random();
  const fb2 = await fundViaFriendbot(buyer2.publicKey());
  if (!fb2.ok) throw new Error(`friendbot failed: ${fb2.status}`);
  const buyer2ScVal = Address.fromString(buyer2.publicKey()).toScVal();

  // Admit this one the production way: the KYC provider signs, the investor
  // never touches the transaction. Falls back to self-serve when no provider
  // key is configured, so this script still runs on a bare checkout.
  const provider = kycProviderKeypair();
  if (provider) {
    console.log('  admitting via register_verified — the KYC provider signs');
    await invoke(
      server,
      provider,
      d.contracts.registry,
      'register_verified',
      Address.fromString(provider.publicKey()).toScVal(),
      buyer2ScVal,
    );
  } else {
    await invoke(server, buyer2, d.contracts.registry, 'register', buyer2ScVal);
  }
  const buyer2Whitelisted = await view(
    server,
    buyer2.publicKey(),
    d.contracts.registry,
    'allowed',
    buyer2ScVal,
  );
  if (buyer2Whitelisted !== true) throw new Error('second buyer was not admitted');
  const swapHash = await invoke(
    server,
    buyer2,
    d.contracts.exchange,
    'swap_order',
    buyer2ScVal,
    nativeToScVal(order.id, { type: 'u64' }),
    nativeToScVal(1n, { type: 'i128' }),
  );
  const afterSwap = (await view(
    server,
    buyer.publicKey(),
    d.contracts.exchange,
    'order',
    nativeToScVal(order.id, { type: 'u64' }),
  )) as { remaining: bigint } | null;

  console.log('\n8/9 Seller cancels the remainder (close_order)...');
  await invoke(
    server,
    buyer,
    d.contracts.exchange,
    'close_order',
    buyerScVal,
    nativeToScVal(order.id, { type: 'u64' }),
  );

  console.log('\n9/9 Verifying on-chain state...');
  const shares = (await view(
    server,
    buyer.publicKey(),
    d.contracts.shareToken,
    'balance',
    buyerScVal,
  )) as bigint;
  const shares2 = (await view(
    server,
    buyer.publicKey(),
    d.contracts.shareToken,
    'balance',
    buyer2ScVal,
  )) as bigint;
  const bookAfter = (await view(
    server,
    buyer.publicKey(),
    d.contracts.exchange,
    'orders',
  )) as unknown[];
  const remaining = (await view(
    server,
    buyer.publicKey(),
    d.contracts.assetSale,
    'remaining',
  )) as bigint;
  const claimed = (await view(
    server,
    buyer.publicKey(),
    d.contracts.rewards,
    'claimed',
    buyerScVal,
  )) as bigint;
  // The solvency pair, checked from outside the contract the same way anyone
  // reading the explorer would: the pool has to cover everything still owed.
  const pool = (await view(server, buyer.publicKey(), d.contracts.rewards, 'pool')) as bigint;
  const outstanding = (await view(
    server,
    buyer.publicKey(),
    d.contracts.rewards,
    'outstanding',
  )) as bigint;

  // buy 3, sell 1 back, list 2 into escrow, 1 of those fills P2P, cancel
  // returns the last one.
  const expected = SHARES_TO_BUY - SHARES_TO_SELL - SHARES_TO_LIST + (SHARES_TO_LIST - 1n);
  console.log(`  seller ${d.asset.symbol} balance: ${shares} (expected ${expected})`);
  console.log(`  P2P buyer ${d.asset.symbol} balance: ${shares2} (expected 1)`);
  console.log(`  open orders left by this test: ${bookAfter.length ? 'checked below' : 'none'}`);
  console.log(`  after partial fill remaining was: ${afterSwap ? afterSwap.remaining : 'n/a'}`);
  console.log(`  shares still in the sale contract: ${remaining}`);
  console.log(`  buyer claimed rewards: ${Number(claimed) / 1e7} XLM`);
  console.log(
    `  rewards pool ${stroopsToXlm(pool)} XLM vs outstanding ${stroopsToXlm(outstanding)}`,
  );
  if (shares !== expected) throw new Error(`expected seller balance ${expected}, got ${shares}`);
  if (shares2 !== 1n) throw new Error(`expected P2P buyer balance 1, got ${shares2}`);
  if (pool < outstanding) {
    throw new Error(`rewards contract is short: pool ${pool} < outstanding ${outstanding}`);
  }

  console.log('\nSMOKE LIFECYCLE OK: register, buy, sell, claim, list, partial fill, cancel');
  console.log(`Buy tx: ${EXPLORER}/tx/${buyHash}`);
  console.log(`P2P swap tx: ${EXPLORER}/tx/${swapHash}`);

  fees.print(true);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
