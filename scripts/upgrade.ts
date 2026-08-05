/**
 * Replace the code of live contracts without moving them or losing their state.
 *
 *   npm run upgrade                    # every contract whose wasm has changed
 *   npm run upgrade -- asset-sale      # just this one
 *
 * Two steps per contract, both signed by a quorum of the admin multisig:
 * upload the new wasm so the network stores it by hash, then `upgrade(hash)`
 * to re-point the existing contract id at it. Storage is untouched, so the
 * addresses in `deployments/testnet.json` keep working and the demo state -
 * who owns what, which orders are open, what has been sold - survives.
 *
 * Contracts already running the built code are skipped rather than re-pointed
 * at the hash they are on, so this is safe to run repeatedly and its output
 * says what actually changed.
 *
 * An upgrade that changes the SHAPE of stored data needs a migration call
 * afterwards; this script does not attempt one, because what that call is
 * depends entirely on the change. Adding a new storage key is the safe case:
 * `DataKey` is a `contracttype` enum serialized by variant name, so a new
 * variant cannot shift an existing one.
 */

import { join } from 'node:path';
import { Address, nativeToScVal, type rpc, xdr } from '@stellar/stellar-sdk';
import {
  ADMIN_QUORUM,
  ADMIN_SIGNER_COUNT,
  adminQuorum,
  buildContracts,
  EXPLORER,
  loadEnv,
  NETWORK,
  readDeployment,
  stellar,
  WASM_DIR,
  wasmHash,
  writeDeployment,
} from './lib.ts';
import { invoke, server, xlm } from './tx.ts';

/** Contract key in the deployment file -> the artifact that builds it. */
const ARTIFACTS = {
  registry: 'compliance_registry.wasm',
  shareToken: 'share_token.wasm',
  assetSale: 'asset_sale.wasm',
  exchange: 'asset_exchange.wasm',
  rewards: 'rewards_distributor.wasm',
} as const;

type ContractKey = keyof typeof ARTIFACTS;

/** What `npm run upgrade -- <name>` accepts, in the deployment file's terms. */
const ALIASES: Record<string, ContractKey> = {
  registry: 'registry',
  'compliance-registry': 'registry',
  'share-token': 'shareToken',
  sharetoken: 'shareToken',
  'asset-sale': 'assetSale',
  sale: 'assetSale',
  'asset-exchange': 'exchange',
  exchange: 'exchange',
  'rewards-distributor': 'rewards',
  rewards: 'rewards',
};

/**
 * The wasm hash the network currently has for a contract id.
 *
 * Read from the ledger rather than from the deployment file: the file records
 * what was deployed, and the point of this check is to catch the case where
 * those two have drifted apart.
 */
async function onChainHash(rpcServer: rpc.Server, contractId: string): Promise<string> {
  const entry = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
  const { entries } = await rpcServer.getLedgerEntries(entry);
  if (entries.length === 0) throw new Error(`${contractId} has no instance on this network`);
  const instance = entries[0].val.contractData().val().instance();
  const executable = instance.executable();
  if (executable.switch() !== xdr.ContractExecutableType.contractExecutableWasm()) {
    throw new Error(`${contractId} is not a wasm contract`);
  }
  return executable.wasmHash().toString('hex');
}

async function main(): Promise<void> {
  const env = loadEnv();
  const d = readDeployment();
  const requested = process.argv.slice(2);

  const targets: ContractKey[] = [];
  for (const name of requested) {
    const key = ALIASES[name.toLowerCase()];
    if (!key) {
      throw new Error(`Unknown contract "${name}". One of: ${Object.keys(ALIASES).join(', ')}`);
    }
    if (!targets.includes(key)) targets.push(key);
  }
  if (targets.length === 0) targets.push(...(Object.keys(ARTIFACTS) as ContractKey[]));

  console.log('Building contracts first, so the hash below is of the code in this tree...');
  buildContracts();

  const rpcServer = server();
  const changed: ContractKey[] = [];

  for (const key of targets) {
    const contractId = d.contracts[key];
    const local = wasmHash(ARTIFACTS[key]);
    const live = await onChainHash(rpcServer, contractId);
    if (local === live) {
      console.log(`\n${key}  already running this code (${live.slice(0, 12)}…), skipping`);
      continue;
    }

    console.log(`\n${key}  ${contractId}`);
    console.log(`  on-chain  ${live}`);
    console.log(`  built     ${local}`);

    // Uploading is idempotent and needs no quorum - it only stores code by its
    // own hash and grants it nothing. The deployer pays, as it does on deploy.
    console.log('  uploading the new wasm...');
    const uploaded = stellar([
      'contract',
      'upload',
      '--wasm',
      join(WASM_DIR, ARTIFACTS[key]),
      '--source-account',
      env.deployerSecret,
      '--network',
      NETWORK,
    ]);
    if (uploaded !== local) {
      throw new Error(`the network stored ${uploaded}, the local artifact hashes to ${local}`);
    }

    const sent = await invoke(rpcServer, {
      contractId,
      method: 'upgrade',
      args: [nativeToScVal(Buffer.from(local, 'hex'))],
      source: env.adminPublic,
      signers: adminQuorum(env),
    });
    console.log(
      `  upgraded, ${ADMIN_QUORUM}-of-${ADMIN_SIGNER_COUNT}: ${EXPLORER}/tx/${sent.hash} (${xlm(sent.feeCharged)} XLM)`,
    );

    const after = await onChainHash(rpcServer, contractId);
    if (after !== local) {
      throw new Error(`${key} still reports ${after} after the upgrade`);
    }
    d.wasmHashes[key] = local;
    changed.push(key);
  }

  if (changed.length === 0) {
    console.log('\nNothing to do: every contract is already running the built code.');
    return;
  }

  writeDeployment(d);
  console.log(`\nUpgraded ${changed.length}: ${changed.join(', ')}`);
  console.log('deployments/testnet.json now records the new hashes.');
  console.log('Next: npm run verify-wasm, and re-run the drills.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
