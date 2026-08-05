/**
 * Deposit one reward round, the way the issuer distributes rent income.
 *
 * Signed by the OPERATOR key, not the admin. Paying rent out is a monthly job
 * that a person or a bot has to be able to do without assembling two of three
 * cold signatures, and it is safe to hand over: the money moves into the pool,
 * and the distributor has no entrypoint that moves it back out to anyone but a
 * holder claiming their own share.
 *
 * Separate from `deploy` on purpose. A round is credited to whoever holds
 * shares at that ledger, so depositing at deploy time - when the sale contract
 * still holds the entire supply - would hand the income to inventory that
 * never claims. Run this once real holders exist:
 *
 *   npm run deploy
 *   npm run smoke-buy          # a few times, to create holders
 *   npm run deposit-round      # now they have something to claim
 *
 *   npm run deposit-round -- 25    # a different amount, in XLM
 */
import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { EXPLORER, loadEnv, operatorKeypair, REWARD_ROUND_STROOPS, readDeployment } from './lib.ts';
import { invoke, server, xlm } from './tx.ts';

const STROOPS_IN_XLM = 10_000_000n;

function amountFromArgv(): bigint {
  const arg = process.argv[2];
  if (!arg) return REWARD_ROUND_STROOPS;
  if (!/^\d+(\.\d{1,7})?$/.test(arg)) {
    throw new Error(`Expected an amount in XLM, got "${arg}"`);
  }
  const [whole, frac = ''] = arg.split('.');
  return BigInt(whole) * STROOPS_IN_XLM + BigInt(frac.padEnd(7, '0'));
}

async function main(): Promise<void> {
  const env = loadEnv();
  const d = readDeployment();
  const amount = amountFromArgv();

  console.log(`Depositing ${xlm(amount)} XLM into ${d.contracts.rewards}`);
  console.log(`  signed by the operator: ${env.operatorPublic}`);
  const sent = await invoke(server(), {
    contractId: d.contracts.rewards,
    method: 'deposit',
    args: [
      Address.fromString(env.operatorPublic).toScVal(),
      nativeToScVal(amount, { type: 'i128' }),
    ],
    signers: [operatorKeypair(env)],
  });
  console.log(`  ${EXPLORER}/tx/${sent.hash} (fee ${xlm(sent.feeCharged)} XLM)`);
  console.log('Done. Holders settled before this ledger can claim their share.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
