/**
 * Stellar testnet is wiped on its quarterly reset: accounts, contracts and
 * balances all disappear. This script restores the whole PoC in one command.
 *
 *   npm run redeploy
 *
 * The reset takes the admin account's signer list and thresholds with it, so
 * re-funding that account gives back an ordinary single-signature account and
 * every 2-of-3 step of the deploy is then refused with `txBadAuth`. Rebuilding
 * the multisig has to happen first, which is why `setup-multisig` runs here
 * rather than being left to whoever reads the error.
 *
 * The KYC provider is funded because it signs `register_verified`, and an
 * unfunded account cannot submit anything. The three admin signers are not:
 * they only add signatures to the admin account's transactions and never
 * source one of their own.
 */
import { runDeploy } from './deploy.ts';
import { fundViaFriendbot, loadEnv } from './lib.ts';
import { runSetupMultisig } from './setup-multisig.ts';

async function main(): Promise<void> {
  const env = loadEnv();

  console.log('Re-funding accounts via friendbot...');
  const accounts = new Set([env.deployerPublic, env.treasuryPublic, env.kycProviderPublic]);
  for (const pk of accounts) {
    const res = await fundViaFriendbot(pk);
    // 400 means already funded, which is fine after a partial reset or a
    // second run.
    if (!res.ok && res.status !== 400) {
      throw new Error(`friendbot failed for ${pk}: ${res.status} ${await res.text()}`);
    }
  }

  // Funds the admin and the operator itself, and reports "nothing to do" when
  // the account survived, so this is safe on a partial reset too.
  console.log('\nRebuilding the admin multisig...');
  await runSetupMultisig();

  await runDeploy();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
