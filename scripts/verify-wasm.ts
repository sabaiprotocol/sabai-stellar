/**
 * Reproducible-build check: rebuild the contracts, then prove the bytes
 * running on testnet are the bytes in this repository.
 *
 * Three values have to agree for each contract - the hash recorded in
 * deployments/testnet.json, the sha256 of the local artifact, and the wasm
 * hash the network stores for the deployed instance. A reviewer can run this
 * without trusting anything in the repo except the source.
 *
 *   stellar contract build && npm run verify-wasm
 */
import { Contract, rpc, xdr } from '@stellar/stellar-sdk';
import { RPC_URL, readDeployment, WASM_DIR, wasmHash } from './lib.ts';

type ContractKey = keyof ReturnType<typeof readDeployment>['contracts'] &
  keyof ReturnType<typeof readDeployment>['wasmHashes'];

const TARGETS: { name: string; contract: ContractKey; wasm: string }[] = [
  { name: 'compliance-registry', contract: 'registry', wasm: 'compliance_registry.wasm' },
  { name: 'share-token', contract: 'shareToken', wasm: 'share_token.wasm' },
  { name: 'asset-sale', contract: 'assetSale', wasm: 'asset_sale.wasm' },
  { name: 'asset-exchange', contract: 'exchange', wasm: 'asset_exchange.wasm' },
  { name: 'rewards-distributor', contract: 'rewards', wasm: 'rewards_distributor.wasm' },
];

/** The wasm hash the network has stored for a deployed contract instance. */
async function onChainWasmHash(server: rpc.Server, contractId: string): Promise<string> {
  const key = new Contract(contractId).getFootprint();
  const { entries } = await server.getLedgerEntries(key);
  if (!entries.length) throw new Error(`no instance entry for ${contractId}`);

  const instance = entries[0].val.contractData().val().instance();
  const executable = instance.executable();
  if (executable.switch() !== xdr.ContractExecutableType.contractExecutableWasm()) {
    throw new Error(`${contractId} is not a wasm contract`);
  }
  return executable.wasmHash().toString('hex');
}

async function main(): Promise<void> {
  const d = readDeployment();
  const server = new rpc.Server(RPC_URL);

  console.log(`Network: ${d.network} (protocol ${d.protocolVersion})`);
  console.log(`Local artifacts: ${WASM_DIR}\n`);

  let mismatches = 0;
  for (const t of TARGETS) {
    const contractId = d.contracts[t.contract];
    const recorded = d.wasmHashes[t.contract];
    const local = wasmHash(t.wasm);
    const chain = await onChainWasmHash(server, contractId);
    const ok = local === chain && local === recorded;
    if (!ok) mismatches++;

    console.log(`${t.name}`);
    console.log(`  contract  ${contractId}`);
    console.log(`  on-chain  ${chain}`);
    console.log(`  recorded  ${recorded}`);
    console.log(`  local     ${local}  ${ok ? '✅ match' : '❌ MISMATCH'}\n`);
  }

  if (mismatches) {
    console.error(
      `${mismatches} contract(s) differ from the deployed bytes — rebuild with the toolchain in the README before comparing.`,
    );
    process.exit(1);
  }
  console.log('Repository, local build and testnet all carry the same wasm ✅');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
