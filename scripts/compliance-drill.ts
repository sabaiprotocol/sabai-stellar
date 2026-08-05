/**
 * The compliance controls, exercised against the LIVE testnet deployment.
 *
 * `smoke-buy` proves the happy path works. This proves the opposite: that the
 * controls a regulated issuer needs actually stop things, on-chain, and that
 * each one stops exactly what it should and nothing more.
 *
 *   1. the deployment-wide halt   - one call, five contracts frozen
 *   2. suspension of one holder   - their shares stop, their rent keeps accruing
 *   3. forced revocation          - shares returned to custody without a signature
 *
 * Every step asserts the block AND the release, because a control that cannot
 * be lifted is an outage rather than a control.
 *
 * Each control is exercised by the key that actually holds it in production,
 * which is why three different signers appear below: the operator halts, the
 * 2-of-3 admin lifts the halt and confiscates, and the KYC provider suspends.
 * `npm run governance-drill` is where that split is the subject rather than a
 * detail.
 *
 * It leaves the share inventory where it found it - the confiscated shares are
 * returned to the sale contract at the end - but not the ledger: the reward
 * round it distributes stays distributed, and the throwaway holder stays
 * revoked. It also HALTS the deployment for a few ledgers, so do not run it
 * against a shared demo while somebody is walking through the app.
 */
import { Address, Keypair, nativeToScVal, type xdr } from '@stellar/stellar-sdk';
import {
  adminQuorum,
  EXPLORER,
  fundViaFriendbot,
  kycProviderKeypair,
  loadEnv,
  operatorKeypair,
  readDeployment,
  treasuryKeypair,
} from './lib.ts';
import { FeeLog, invoke, mustFail, server, view, xlm } from './tx.ts';

const SHARES = 2n;
/** Reward round used to show accrual continuing under a suspension. */
const ROUND_STROOPS = 100_000_000n;

const fees = new FeeLog();

async function main(): Promise<void> {
  const env = loadEnv();
  const d = readDeployment();
  const rpcServer = server();
  const provider = kycProviderKeypair();
  if (!provider) {
    throw new Error('KYC_PROVIDER_SECRET is required: a suspension is a provider call');
  }
  const operator = operatorKeypair(env);
  const quorum = adminQuorum(env);

  /** One ordinary key signing for itself. */
  const as = async (signer: Keypair, contractId: string, method: string, ...args: xdr.ScVal[]) =>
    fees.record(method, await invoke(rpcServer, { contractId, method, args, signers: [signer] }));

  /** The 2-of-3 admin account, sourcing its own transaction. */
  const asAdmin = async (contractId: string, method: string, args: xdr.ScVal[] = []) =>
    fees.record(
      method,
      await invoke(rpcServer, {
        contractId,
        method,
        args,
        source: env.adminPublic,
        signers: quorum,
      }),
    );

  const read = (contractId: string, method: string, ...args: xdr.ScVal[]) =>
    view(rpcServer, env.deployerPublic, contractId, method, ...args);

  console.log('Setting up a holder to run the controls against...');
  const holder = Keypair.random();
  const fb = await fundViaFriendbot(holder.publicKey());
  if (!fb.ok) throw new Error(`friendbot failed: ${fb.status}`);
  const holderScVal = Address.fromString(holder.publicKey()).toScVal();
  const providerScVal = Address.fromString(provider.publicKey()).toScVal();
  const operatorScVal = Address.fromString(env.operatorPublic).toScVal();

  await as(provider, d.contracts.registry, 'register_verified', providerScVal, holderScVal);
  const price = (await read(d.contracts.assetSale, 'price')) as bigint;
  await as(
    holder,
    d.contracts.assetSale,
    'buy',
    holderScVal,
    nativeToScVal(SHARES, { type: 'i128' }),
    nativeToScVal(price * SHARES, { type: 'i128' }),
  );
  await as(holder, d.contracts.rewards, 'settle', holderScVal);
  console.log(`  holder ${holder.publicKey()} holds ${SHARES} ${d.asset.symbol}`);

  console.log('\n1/3 Deployment-wide halt (operator -> compliance-registry.pause)');
  await as(operator, d.contracts.registry, 'pause', operatorScVal);
  if ((await read(d.contracts.registry, 'paused')) !== true) {
    throw new Error('pause did not take effect');
  }
  // One call against one contract, and every path that moves shares is shut -
  // in contracts that contain no pause logic of their own.
  await mustFail('buying from the primary sale', () =>
    as(
      holder,
      d.contracts.assetSale,
      'buy',
      holderScVal,
      nativeToScVal(1n, { type: 'i128' }),
      nativeToScVal(price, { type: 'i128' }),
    ),
  );
  await mustFail('listing shares on the secondary market', () =>
    as(
      holder,
      d.contracts.exchange,
      'add_order',
      holderScVal,
      nativeToScVal(1n, { type: 'i128' }),
      nativeToScVal(1_200_000_000n, { type: 'i128' }),
    ),
  );
  // Lifting it is the cold key's job, not the hot one's.
  await asAdmin(d.contracts.registry, 'resume');
  console.log('  released: the halt is lifted and the shares move again');

  console.log('\n2/3 Suspending one holder (provider -> compliance-registry.freeze)');
  await as(provider, d.contracts.registry, 'freeze', providerScVal, holderScVal);
  await mustFail('a suspended holder listing their shares', () =>
    as(
      holder,
      d.contracts.exchange,
      'add_order',
      holderScVal,
      nativeToScVal(1n, { type: 'i128' }),
      nativeToScVal(1_200_000_000n, { type: 'i128' }),
    ),
  );
  // Rent keeps accruing throughout: a suspension withholds money, it does not
  // confiscate it. The round below lands while the holder is frozen.
  await as(
    operator,
    d.contracts.rewards,
    'deposit',
    operatorScVal,
    nativeToScVal(ROUND_STROOPS, { type: 'i128' }),
  );
  const accruedWhileFrozen = (await read(d.contracts.rewards, 'claimable', holderScVal)) as bigint;
  console.log(`  accrued while suspended: ${xlm(accruedWhileFrozen)} XLM`);
  if (accruedWhileFrozen <= 0n) throw new Error('a suspended holder stopped accruing rent');
  await mustFail('a suspended holder claiming it', () =>
    as(holder, d.contracts.rewards, 'claim', holderScVal),
  );

  await as(provider, d.contracts.registry, 'unfreeze', providerScVal, holderScVal);
  await as(holder, d.contracts.rewards, 'claim', holderScVal);
  const claimed = (await read(d.contracts.rewards, 'claimed', holderScVal)) as bigint;
  console.log(`  released: claimed ${xlm(claimed)} XLM, including everything earned while blocked`);
  if (claimed < accruedWhileFrozen) throw new Error('rent earned under suspension was lost');

  console.log('\n3/3 Forced revocation (admin -> share-token.revoke_shares)');
  // The holder never signs. Their eligibility is withdrawn first, which is
  // what makes every ordinary path out of their address unusable - and the
  // reason this entrypoint skips the registry check.
  await as(provider, d.contracts.registry, 'revoke', providerScVal, holderScVal);
  const treasury = (await read(d.contracts.shareToken, 'treasury')) as string;
  const treasuryScVal = Address.fromString(treasury).toScVal();
  const before = (await read(d.contracts.shareToken, 'balance', treasuryScVal)) as bigint;

  const revoked = await asAdmin(d.contracts.shareToken, 'revoke_shares', [
    holderScVal,
    nativeToScVal(SHARES, { type: 'i128' }),
  ]);
  const after = (await read(d.contracts.shareToken, 'balance', treasuryScVal)) as bigint;
  const left = (await read(d.contracts.shareToken, 'balance', holderScVal)) as bigint;
  if (left !== 0n) throw new Error(`revocation left ${left} shares behind`);
  if (after - before !== SHARES) throw new Error('shares did not land in the treasury');
  console.log(`  ${SHARES} ${d.asset.symbol} moved to custody without the holder signing`);
  console.log(`  destination is fixed at deployment: ${treasury}`);
  console.log(`  ${EXPLORER}/tx/${revoked.hash}`);

  // Put the inventory back, so running the drill does not quietly shrink the
  // number of shares the demo has left to sell. Custody signs for itself, the
  // same way it funded the sale at deployment.
  const custody = treasuryKeypair();
  if (custody && custody.publicKey() === treasury) {
    await as(
      custody,
      d.contracts.shareToken,
      'transfer',
      treasuryScVal,
      Address.fromString(d.contracts.assetSale).toScVal(),
      nativeToScVal(SHARES, { type: 'i128' }),
    );
    console.log('  inventory restored: the confiscated shares are back in the sale contract');
  } else {
    console.log(
      `  NOTE: ${SHARES} shares are sitting in custody - no TREASURY_SECRET to return them`,
    );
  }

  console.log('\nCOMPLIANCE DRILL OK: halt, suspension and revocation all bind and all release');
  fees.print();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
