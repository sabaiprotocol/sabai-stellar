/**
 * One-command testnet deploy for the Sabai Stellar PoC.
 *
 * Steps: build wasm -> deploy the compliance registry -> deploy share-token,
 * asset-sale, rewards-distributor and asset-exchange against it -> point every
 * contract's operator role at the hot key -> record the legal terms -> admit
 * the addresses that hold shares as participants -> issue the shares into the
 * treasury -> move a tranche from there into the sale contract -> enable the
 * sale -> seed the buyback pool -> write deployments/testnet.json.
 *
 * Order matters: nothing can hold shares before the registry admits it, so the
 * registry goes up first and the participants are set before the issuance.
 *
 * Three different keys sign here, and the split is the point:
 *
 *   deployer  uploads the wasm and pays the deploy fees. Holds no role
 *             afterwards except `fee_to`.
 *   admin     a 2-of-3 multisig ACCOUNT. Every call below marked "admin"
 *             carries two signatures; `npm run setup-multisig` builds it and
 *             `npm run governance-drill` proves one signature is refused.
 *   treasury  custody. Issuance is minted here, and funding the sale is its
 *             own transaction that the deployer cannot make on its own.
 *
 * The registry is per-PLATFORM, not per-asset. Issuing a second asset means
 * deploying share-token / asset-sale / rewards / exchange again and pointing
 * them at this same registry - every investor already verified stays verified.
 *
 * Re-runnable: each run deploys a fresh set of contracts and overwrites
 * deployments/testnet.json (old contracts simply stop being referenced).
 */
import { join } from 'node:path';
import { Address, nativeToScVal, type xdr } from '@stellar/stellar-sdk';
import {
  ADMIN_QUORUM,
  ADMIN_SIGNER_COUNT,
  ASSET_NAME,
  ASSET_SYMBOL,
  ASSET_TERMS,
  adminQuorum,
  BUYBACK_DISCOUNT_BPS,
  buildContracts,
  type Env,
  EXCHANGE_COMMISSION_BPS,
  EXCHANGE_MAX_RATE_STROOPS,
  EXCHANGE_MIN_RATE_STROOPS,
  EXPLORER,
  loadEnv,
  NETWORK,
  RPC_URL,
  SALE_COMMISSION_BPS,
  SALE_TRANCHE,
  SHARE_PRICE_STROOPS,
  sha256Bundle,
  stellar,
  TOTAL_SHARES,
  termsScVal,
  WASM_DIR,
  wasmHash,
  writeDeployment,
} from './lib.ts';
import { invoke, server } from './tx.ts';

const TOTAL_STEPS = 15;

/**
 * The protocol the network is on, for the record file. Deliberately tolerant:
 * every contract is already deployed by the time this runs, and letting an RPC
 * hiccup throw here would discard the only machine-readable note of what was
 * just created.
 */
async function protocolVersion(): Promise<number> {
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getVersionInfo' }),
    });
    const body = (await res.json()) as { result?: { protocolVersion?: number } };
    return body.result?.protocolVersion ?? 0;
  } catch {
    console.warn('  could not read the protocol version from RPC, recording 0');
    return 0;
  }
}

export async function runDeploy(): Promise<void> {
  const env = loadEnv();
  const rpcServer = server();

  /** An admin call: sourced by the multisig account, signed by a quorum of it. */
  const asAdmin = async (
    contractId: string,
    method: string,
    args: xdr.ScVal[] = [],
  ): Promise<void> => {
    const sent = await invoke(rpcServer, {
      contractId,
      method,
      args,
      source: env.adminPublic,
      signers: adminQuorum(env),
    });
    console.log(`  ${method} signed ${ADMIN_QUORUM}-of-${ADMIN_SIGNER_COUNT} — ${sent.hash}`);
  };

  console.log(`1/${TOTAL_STEPS} Building contracts (wasm release)...`);
  buildContracts();

  console.log(`2/${TOTAL_STEPS} Resolving native XLM SAC address...`);
  const nativeSac = stellar(['contract', 'id', 'asset', '--asset', 'native', '--network', NETWORK]);

  console.log(`3/${TOTAL_STEPS} Deploying compliance-registry (shared across all assets)...`);
  const registry = deployContract(env, 'compliance_registry.wasm', [
    '--admin',
    env.adminPublic,
    '--kyc_provider',
    env.kycProviderPublic,
  ]);
  console.log(`  compliance-registry: ${registry}`);
  console.log(`  admin (2-of-3 multisig): ${env.adminPublic}`);
  console.log(`  kyc provider: ${env.kycProviderPublic}`);

  console.log(`4/${TOTAL_STEPS} Deploying share-token...`);
  const shareToken = deployContract(env, 'share_token.wasm', [
    '--admin',
    env.adminPublic,
    '--name',
    ASSET_NAME,
    '--symbol',
    ASSET_SYMBOL,
    '--registry',
    registry,
    '--treasury',
    env.treasuryPublic,
    '--max_supply',
    TOTAL_SHARES.toString(),
  ]);
  console.log(`  share-token: ${shareToken}`);

  console.log(`5/${TOTAL_STEPS} Deploying asset-sale...`);
  const assetSale = deployContract(env, 'asset_sale.wasm', [
    '--admin',
    env.adminPublic,
    '--share_token',
    shareToken,
    '--payment_token',
    nativeSac,
    '--treasury',
    env.treasuryPublic,
    '--registry',
    registry,
    // The issuer's proceeds and the platform's commission are different
    // accounts: the treasury is the asset's, the fee account is ours.
    '--fee_to',
    env.deployerPublic,
    '--price',
    SHARE_PRICE_STROOPS.toString(),
    '--buyback_discount_bps',
    BUYBACK_DISCOUNT_BPS.toString(),
    '--commission_bps',
    SALE_COMMISSION_BPS.toString(),
  ]);
  console.log(`  asset-sale: ${assetSale}`);

  console.log(`6/${TOTAL_STEPS} Deploying rewards-distributor...`);
  const rewards = deployContract(env, 'rewards_distributor.wasm', [
    '--admin',
    env.adminPublic,
    '--share_token',
    shareToken,
    '--payment_token',
    nativeSac,
    '--registry',
    registry,
    '--total_shares',
    TOTAL_SHARES.toString(),
  ]);
  console.log(`  rewards-distributor: ${rewards}`);

  console.log(`7/${TOTAL_STEPS} Deploying asset-exchange (secondary market)...`);
  const exchange = deployContract(env, 'asset_exchange.wasm', [
    '--admin',
    env.adminPublic,
    '--share_token',
    shareToken,
    '--payment_token',
    nativeSac,
    '--registry',
    registry,
    '--fee_to',
    env.deployerPublic,
    '--commission_bps',
    EXCHANGE_COMMISSION_BPS.toString(),
    '--min_rate',
    EXCHANGE_MIN_RATE_STROOPS.toString(),
    '--max_rate',
    EXCHANGE_MAX_RATE_STROOPS.toString(),
  ]);
  console.log(`  asset-exchange: ${exchange}`);

  // The operator role starts out pointing at the admin, so until this step the
  // deployment has no hot key at all. Five admin transactions hand each
  // contract's day-to-day switches to one ordinary key that can never issue,
  // confiscate, reprice or withdraw.
  console.log(`8/${TOTAL_STEPS} Pointing the operator role at the hot key...`);
  console.log(`  operator: ${env.operatorPublic}`);
  const operatorArg = [Address.fromString(env.operatorPublic).toScVal()];
  for (const id of [registry, shareToken, assetSale, exchange, rewards]) {
    await asAdmin(id, 'set_operator', operatorArg);
  }

  console.log(`9/${TOTAL_STEPS} Recording the legal terms on the share token...`);
  console.log(`  issuer: ${ASSET_TERMS.issuer}`);
  console.log(`  bundle: ${ASSET_TERMS.uri}`);
  console.log(`  sha256: ${sha256Bundle(ASSET_TERMS.docPaths)}`);
  await asAdmin(shareToken, 'set_terms', [termsScVal()]);

  console.log(`10/${TOTAL_STEPS} Admitting the addresses that hold shares as participants...`);
  for (const [name, id] of [
    ['asset-sale', assetSale],
    ['asset-exchange', exchange],
    ['treasury (custody of the issuance)', env.treasuryPublic],
    ['admin (receives withdrawn inventory)', env.adminPublic],
  ]) {
    console.log(`  participant: ${name}`);
    await asAdmin(registry, 'set_participant', [
      Address.fromString(id as string).toScVal(),
      nativeToScVal(true),
    ]);
  }

  // The issuance. It runs once and can never run again, whatever the amount:
  // a tokenized building has the share count it has, and the distributor
  // divides income by that same number.
  console.log(`11/${TOTAL_STEPS} Issuing ${TOTAL_SHARES} ${ASSET_SYMBOL} into the treasury...`);
  await asAdmin(shareToken, 'mint', [
    Address.fromString(env.treasuryPublic).toScVal(),
    nativeToScVal(TOTAL_SHARES, { type: 'i128' }),
  ]);

  // Signed by the treasury, not the admin. The sale can only ever distribute
  // what custody has handed it.
  console.log(
    `12/${TOTAL_STEPS} Funding the sale with a tranche of ${SALE_TRANCHE} ${ASSET_SYMBOL}...`,
  );
  stellar([
    'contract',
    'invoke',
    '--id',
    shareToken,
    '--source-account',
    env.treasurySecret,
    '--network',
    NETWORK,
    '--',
    'transfer',
    '--from',
    env.treasuryPublic,
    '--to',
    assetSale,
    '--amount',
    SALE_TRANCHE.toString(),
  ]);

  console.log(`13/${TOTAL_STEPS} Enabling the sale...`);
  await asAdmin(assetSale, 'set_available', [
    Address.fromString(env.adminPublic).toScVal(),
    nativeToScVal(true),
  ]);

  // 500 XLM buyback pool from the deployer's friendbot-funded balance, enough
  // for several reviewers to walk the full cycle (each share sold back takes
  // 95 XLM out of the pool). Funding is permissionless, so this needs no role.
  //
  // No reward round here. Income is credited to whoever holds shares at the
  // moment of the deposit, and right now that is this contract's own unsold
  // inventory, which never claims. `npm run deposit-round` seeds one after the
  // demo holders exist.
  console.log(`14/${TOTAL_STEPS} Seeding the buyback pool (500 XLM)...`);
  stellar([
    'contract',
    'invoke',
    '--id',
    assetSale,
    '--source-account',
    env.deployerSecret,
    '--network',
    NETWORK,
    '--',
    'fund_buyback',
    '--from',
    env.deployerPublic,
    '--amount',
    (500n * 10_000_000n).toString(),
  ]);

  console.log(`15/${TOTAL_STEPS} Writing deployments/testnet.json...`);
  writeDeployment({
    network: NETWORK,
    protocolVersion: await protocolVersion(),
    updatedAt: new Date().toISOString(),
    asset: {
      name: ASSET_NAME,
      symbol: ASSET_SYMBOL,
      priceStroops: SHARE_PRICE_STROOPS.toString(),
      totalShares: TOTAL_SHARES.toString(),
      buybackDiscountBps: BUYBACK_DISCOUNT_BPS,
      saleCommissionBps: SALE_COMMISSION_BPS,
    },
    accounts: {
      admin: env.adminPublic,
      operator: env.operatorPublic,
      treasury: env.treasuryPublic,
      feeTo: env.deployerPublic,
      kycProvider: env.kycProviderPublic,
    },
    governance: {
      quorum: ADMIN_QUORUM,
      signers: ADMIN_SIGNER_COUNT,
      adminAccountLink: `${EXPLORER}/account/${env.adminPublic}`,
    },
    contracts: { registry, shareToken, assetSale, exchange, rewards, nativeSac },
    links: {
      registry: `${EXPLORER}/contract/${registry}`,
      shareToken: `${EXPLORER}/contract/${shareToken}`,
      assetSale: `${EXPLORER}/contract/${assetSale}`,
      exchange: `${EXPLORER}/contract/${exchange}`,
      rewards: `${EXPLORER}/contract/${rewards}`,
    },
    wasmHashes: {
      registry: wasmHash('compliance_registry.wasm'),
      shareToken: wasmHash('share_token.wasm'),
      assetSale: wasmHash('asset_sale.wasm'),
      exchange: wasmHash('asset_exchange.wasm'),
      rewards: wasmHash('rewards_distributor.wasm'),
    },
    exchange: {
      commissionBps: EXCHANGE_COMMISSION_BPS,
      minRateStroops: EXCHANGE_MIN_RATE_STROOPS.toString(),
      maxRateStroops: EXCHANGE_MAX_RATE_STROOPS.toString(),
    },
  });

  console.log('\nDone. Explorer:');
  console.log(
    `  admin account (${ADMIN_QUORUM}-of-${ADMIN_SIGNER_COUNT}): ${EXPLORER}/account/${env.adminPublic}`,
  );
  for (const id of [shareToken, assetSale, exchange, rewards]) {
    console.log(`  ${EXPLORER}/contract/${id}`);
  }
  console.log('\nNext: seed some holders (npm run smoke-buy), then npm run deposit-round.');
}

/** Deploy one contract, signed by the deployer, with its constructor args. */
function deployContract(env: Env, wasm: string, constructorArgs: string[]): string {
  return stellar([
    'contract',
    'deploy',
    '--wasm',
    join(WASM_DIR, wasm),
    '--source-account',
    env.deployerSecret,
    '--network',
    NETWORK,
    '--',
    ...constructorArgs,
  ]);
}

if (process.argv[1]?.endsWith('deploy.ts')) {
  runDeploy().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
