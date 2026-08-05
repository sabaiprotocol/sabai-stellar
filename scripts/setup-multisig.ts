/**
 * Turn the admin account into a real 2-of-3 multisig, and fund the operator.
 *
 * This is Stellar account multisig, not a contract that imitates one. The
 * admin of all five contracts is an ordinary `G…` account whose signer list
 * and thresholds the network enforces on every transaction it sources. No
 * Gnosis-Safe-equivalent to deploy, no extra contract to audit, and the
 * signers are visible on any explorer.
 *
 *   npm run setup-multisig
 *
 * Idempotent: run it again and it reports the account is already configured
 * rather than reconfiguring it.
 *
 * Every change lands in ONE transaction on purpose. Adding the signers first
 * and raising the thresholds afterwards leaves a window where the account is
 * half-configured, and the second transaction failing there would leave it
 * either single-signature or bricked.
 *
 * Keys missing from `.env` are generated and written back to it. Only the `G…`
 * addresses are printed - a secret on stdout ends up in terminal scrollback
 * and in any screen recording of the demo.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { ADMIN_QUORUM, ADMIN_SIGNER_COUNT, EXPLORER, fundViaFriendbot, ROOT } from './lib.ts';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const ENV_FILE = join(ROOT, '.env');
/** Enough for fees on the admin's own transactions; friendbot gives 10 000. */
const BASE_FEE_MULTIPLIER = 100;

/**
 * Changing the signer set needs every key, while spending needs two of them.
 *
 * Losing one key therefore freezes the signer list - and does not freeze the
 * asset, because two of three still authorize `transfer_admin`. Migrating to a
 * fresh multisig account is the recovery path, which is exactly what the
 * two-step handover exists for.
 */
const THRESHOLDS = { low: ADMIN_QUORUM, med: ADMIN_QUORUM, high: ADMIN_SIGNER_COUNT };

interface Managed {
  name: string;
  keypair: Keypair;
  generated: boolean;
}

function appendToEnv(lines: string[]): void {
  const text = readFileSync(ENV_FILE, 'utf8');
  appendFileSync(ENV_FILE, `${text.endsWith('\n') ? '' : '\n'}${lines.join('\n')}\n`);
}

/**
 * Read a key from `.env`, or make one and write it back.
 *
 * The two variables are handled separately on purpose: a `.env` carried over
 * from an older layout can have the secret and not the public address, and
 * `loadEnv` needs both. Deriving the missing one and writing it back is
 * cheaper than a confusing "Missing ADMIN_PUBLIC" three commands later.
 */
function ensureKey(secretVar: string, publicVar?: string): Managed {
  const existing = process.env[secretVar];
  if (existing) {
    const keypair = Keypair.fromSecret(existing);
    if (publicVar && !process.env[publicVar]) {
      appendToEnv([`${publicVar}=${keypair.publicKey()}`]);
      process.env[publicVar] = keypair.publicKey();
    }
    return { name: secretVar, keypair, generated: false };
  }
  const keypair = Keypair.random();
  const lines = [`${secretVar}=${keypair.secret()}`];
  if (publicVar) lines.push(`${publicVar}=${keypair.publicKey()}`);
  appendToEnv(lines);
  process.env[secretVar] = keypair.secret();
  if (publicVar) process.env[publicVar] = keypair.publicKey();
  return { name: secretVar, keypair, generated: true };
}

async function ensureFunded(horizon: Horizon.Server, publicKey: string): Promise<boolean> {
  try {
    await horizon.loadAccount(publicKey);
    return false;
  } catch {
    const res = await fundViaFriendbot(publicKey);
    if (!res.ok) throw new Error(`friendbot could not fund ${publicKey}: ${res.status}`);
    return true;
  }
}

export async function runSetupMultisig(): Promise<void> {
  const { config } = await import('dotenv');
  config({ path: ENV_FILE, quiet: true });

  const horizon = new Horizon.Server(HORIZON_URL);

  const admin = ensureKey('ADMIN_SECRET', 'ADMIN_PUBLIC');
  const signers = Array.from({ length: ADMIN_SIGNER_COUNT }, (_, i) =>
    ensureKey(`ADMIN_SIGNER_${i + 1}_SECRET`),
  );
  const operator = ensureKey('OPERATOR_SECRET', 'OPERATOR_PUBLIC');

  const generated = [admin, ...signers, operator].filter((k) => k.generated);
  if (generated.length > 0) {
    console.log(`Generated ${generated.length} key(s) and wrote them to .env (gitignored):`);
    for (const k of generated)
      console.log(`  ${k.name.replace('_SECRET', '')} ${k.keypair.publicKey()}`);
  }

  console.log('\nFunding accounts...');
  const adminAddress = admin.keypair.publicKey();
  console.log(
    `  admin      ${adminAddress}${(await ensureFunded(horizon, adminAddress)) ? ' (funded)' : ' (already exists)'}`,
  );
  const operatorAddress = operator.keypair.publicKey();
  console.log(
    `  operator   ${operatorAddress}${(await ensureFunded(horizon, operatorAddress)) ? ' (funded)' : ' (already exists)'}`,
  );
  // The signers never source a transaction of their own - they only add
  // signatures to the admin account's - so they need no balance and no
  // account. That is the point of account-level multisig: three keys, one
  // funded account.

  const account = await horizon.loadAccount(adminAddress);
  const alreadyThere = signers.filter((s) =>
    account.signers.some((on) => on.key === s.keypair.publicKey() && on.weight > 0),
  ).length;
  const masterWeight = account.signers.find((s) => s.key === adminAddress)?.weight ?? 0;

  if (alreadyThere === ADMIN_SIGNER_COUNT && masterWeight === 0) {
    console.log(`\nAlready a ${ADMIN_QUORUM}-of-${ADMIN_SIGNER_COUNT} multisig, nothing to do.`);
    report(account);
    return;
  }
  if (masterWeight === 0) {
    throw new Error(
      'The master key of the admin account has weight 0 but the signer list does not match ' +
        '.env. This account can no longer be reconfigured by this script — point ADMIN_SECRET ' +
        'at a fresh account and re-run, then hand the contracts over with transfer_admin.',
    );
  }

  console.log(`\nMaking it ${ADMIN_QUORUM}-of-${ADMIN_SIGNER_COUNT}, in one transaction...`);
  const builder = new TransactionBuilder(account, {
    fee: (BASE_FEE_MULTIPLIER * 100).toString(),
    networkPassphrase: Networks.TESTNET,
  });
  for (const s of signers) {
    builder.addOperation(
      Operation.setOptions({ signer: { ed25519PublicKey: s.keypair.publicKey(), weight: 1 } }),
    );
  }
  // Last, and in the same transaction: the signature on this envelope was
  // checked against the account as it was BEFORE any of these operations, so
  // the master key can still sign away its own weight.
  builder.addOperation(
    Operation.setOptions({
      masterWeight: 0,
      lowThreshold: THRESHOLDS.low,
      medThreshold: THRESHOLDS.med,
      highThreshold: THRESHOLDS.high,
    }),
  );

  const tx = builder.setTimeout(60).build();
  tx.sign(admin.keypair);
  const result = await horizon.submitTransaction(tx);
  console.log(`  ${EXPLORER}/tx/${result.hash}`);

  report(await horizon.loadAccount(adminAddress));
}

function report(account: Horizon.AccountResponse): void {
  console.log('\nAdmin account, as the network now sees it');
  console.log(`  ${EXPLORER}/account/${account.accountId()}`);
  console.log(
    `  thresholds  low ${account.thresholds.low_threshold} / med ${account.thresholds.med_threshold} / high ${account.thresholds.high_threshold}`,
  );
  for (const s of account.signers) {
    const role = s.key === account.accountId() ? 'master' : 'signer';
    console.log(`  ${role.padEnd(11)}${s.key}  weight ${s.weight}`);
  }
  console.log(
    `\nAny ${ADMIN_QUORUM} of the ${ADMIN_SIGNER_COUNT} signers can now authorize an admin call; one cannot.`,
  );
  console.log('Next: npm run deploy');
}

if (process.argv[1]?.endsWith('setup-multisig.ts')) {
  runSetupMultisig().catch((e) => {
    const message = e instanceof Error ? e.message : String(e);
    const detail = (e as { response?: { data?: { extras?: unknown } } })?.response?.data?.extras;
    console.error(detail ? `${message}\n${JSON.stringify(detail, null, 2)}` : message);
    process.exit(1);
  });
}
