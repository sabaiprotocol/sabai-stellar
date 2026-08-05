/**
 * The admin calls, signed by a quorum of the multisig.
 *
 *   npm run admin -- resume
 *   npm run admin -- pause
 *   npm run admin -- set-price 120
 *   npm run admin -- withdraw-buyback 100
 *   npm run admin -- set-operator G...
 *   npm run admin -- transfer-admin G...
 *   npm run admin -- cancel-transfer
 *   npm run admin -- set-rewards         # defaults to the deployed distributor
 *   npm run admin -- set-terms           # re-anchor the legal bundle
 *
 * This exists because /admin in the dApp deliberately cannot do any of it. A
 * browser wallet holds one key and every call here needs two of three, so the
 * page shows the boundary and this is what stands on the other side of it.
 *
 * In production the two signatures would come from different people on
 * different machines, and the transaction XDR would travel between them. Here
 * all three keys are in one `.env`, which is the one thing about this setup
 * that is a demo rather than a design.
 */
import { Address, nativeToScVal, type xdr } from '@stellar/stellar-sdk';
import {
  ADMIN_QUORUM,
  ADMIN_SIGNER_COUNT,
  ASSET_TERMS,
  adminQuorum,
  EXPLORER,
  loadEnv,
  readDeployment,
  sha256Bundle,
  termsScVal,
} from './lib.ts';
import { invoke, server, xlm } from './tx.ts';

const STROOPS_IN_XLM = 10_000_000n;

function xlmArg(name: string, raw: string | undefined): bigint {
  if (!raw || !/^\d+(\.\d{1,7})?$/.test(raw)) {
    throw new Error(`${name} needs a positive amount in XLM, got "${raw ?? ''}"`);
  }
  const [whole, frac = ''] = raw.split('.');
  const stroops = BigInt(whole) * STROOPS_IN_XLM + BigInt(frac.padEnd(7, '0'));
  if (stroops <= 0n) throw new Error(`${name} needs a positive amount`);
  return stroops;
}

function addressArg(name: string, raw: string | undefined): string {
  if (!raw || !/^G[A-Z2-7]{55}$/.test(raw)) {
    throw new Error(`${name} needs a G… address, got "${raw ?? ''}"`);
  }
  return raw;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const d = readDeployment();
  const [command, argument] = process.argv.slice(2);

  // Each contract stores its own roles, so a role change is five transactions
  // and not one. Doing four of them and stopping would leave the deployment
  // with two different admins, which is why these commands fan out here rather
  // than leaving it to whoever remembers.
  const everywhere = [
    d.contracts.registry,
    d.contracts.shareToken,
    d.contracts.assetSale,
    d.contracts.exchange,
    d.contracts.rewards,
  ];

  // `args` is a function, not a value. As a plain object literal every entry's
  // arguments would be evaluated when the table is built, so `resume` - which
  // takes none - would still fail on `set-price`'s missing amount.
  const plan: Record<string, { on: string[]; method: string; args: () => xdr.ScVal[] }> = {
    resume: { on: [d.contracts.registry], method: 'resume', args: () => [] },
    pause: {
      on: [d.contracts.registry],
      method: 'pause',
      args: () => [Address.fromString(env.adminPublic).toScVal()],
    },
    'set-price': {
      on: [d.contracts.assetSale],
      method: 'set_price',
      args: () => [nativeToScVal(xlmArg('set-price', argument), { type: 'i128' })],
    },
    'withdraw-buyback': {
      on: [d.contracts.assetSale],
      method: 'withdraw_buyback',
      args: () => [
        Address.fromString(env.adminPublic).toScVal(),
        nativeToScVal(xlmArg('withdraw-buyback', argument), { type: 'i128' }),
      ],
    },
    'set-operator': {
      on: everywhere,
      method: 'set_operator',
      args: () => [Address.fromString(addressArg('set-operator', argument)).toScVal()],
    },
    'transfer-admin': {
      on: everywhere,
      method: 'transfer_admin',
      args: () => [Address.fromString(addressArg('transfer-admin', argument)).toScVal()],
    },
    'cancel-transfer': { on: everywhere, method: 'cancel_transfer_admin', args: () => [] },
    // Both markets settle a buyer's rewards position as part of the purchase,
    // which needs them to know where the distributor is. Run once after an
    // upgrade that introduced the key, and again if the distributor is ever
    // redeployed - until it is set, buying works exactly as it did before.
    'set-rewards': {
      on: [d.contracts.assetSale, d.contracts.exchange],
      method: 'set_rewards',
      args: () => [Address.fromString(argument ?? d.contracts.rewards).toScVal()],
    },
    // Re-anchor after the constitutional bundle is amended. Deliberately takes
    // no arguments: the hash is computed from the files in this working tree,
    // so what lands on the ledger is what a reader can check out and hash - not
    // a value somebody typed. Every version stays visible in `terms_set`.
    'set-terms': {
      on: [d.contracts.shareToken],
      method: 'set_terms',
      args: () => [termsScVal()],
    },
  };

  const call = command ? plan[command] : undefined;
  if (!call) {
    console.error(`Usage: npm run admin -- <${Object.keys(plan).join('|')}> [argument]`);
    process.exit(1);
  }
  const args = call.args();

  console.log(`${call.method} on ${call.on.length} contract(s)`);
  console.log(`  signed ${ADMIN_QUORUM}-of-${ADMIN_SIGNER_COUNT} by the admin account`);
  if (call.method === 'set_terms') {
    console.log(`  issuer: ${ASSET_TERMS.issuer}`);
    console.log(`  bundle: ${ASSET_TERMS.uri}`);
    console.log(`  sha256: ${sha256Bundle(ASSET_TERMS.docPaths)}`);
  }
  const rpcServer = server();
  for (const contractId of call.on) {
    const sent = await invoke(rpcServer, {
      contractId,
      method: call.method,
      args,
      source: env.adminPublic,
      signers: adminQuorum(env),
    });
    console.log(`  ${contractId}  ${EXPLORER}/tx/${sent.hash} (${xlm(sent.feeCharged)} XLM)`);
  }
  if (call.method === 'transfer_admin') {
    console.log('\nNamed, not in force. The successor has to call accept_admin itself.');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
