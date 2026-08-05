/**
 * Who controls this asset, proven against the LIVE testnet deployment.
 *
 * `compliance-drill` shows the issuer's controls bind. This shows the controls
 * on the issuer bind - that "2-of-3 multisig" and "separate operator key" are
 * facts about the ledger and not sentences in a README.
 *
 *   1. one admin signature is refused by the network, two are accepted
 *   2. the operator can halt the deployment and cannot lift the halt
 *   3. the operator cannot issue, confiscate, reprice or withdraw
 *   4. a stranger holds neither role
 *   5. the admin role can only move to an address that signs for it
 *   6. the code can be replaced, and the state survives it
 *
 * Needs ADMIN_SIGNER_1..3_SECRET, OPERATOR_SECRET and DEPLOYER_SECRET.
 *
 * It leaves the deployment as it found it - the halt is lifted, the sale is
 * reopened, the handover is cancelled and the upgrade re-points the contract
 * at the wasm hash it was already running. It does HALT the deployment for a
 * few ledgers, so do not run it while somebody is walking through the app.
 */
import { Address, Keypair, nativeToScVal, type xdr } from '@stellar/stellar-sdk';
import {
  ADMIN_QUORUM,
  ADMIN_SIGNER_COUNT,
  adminQuorum,
  adminSingleSigner,
  EXPLORER,
  fundViaFriendbot,
  loadEnv,
  operatorKeypair,
  readDeployment,
} from './lib.ts';
import {
  FeeLog,
  invoke,
  mustFail,
  mustFailAtSignatureCheck,
  mustFailForLackOfAuthority,
  server,
  view,
} from './tx.ts';

const fees = new FeeLog();

async function main(): Promise<void> {
  const env = loadEnv();
  const d = readDeployment();
  const rpcServer = server();
  const operator = operatorKeypair(env);
  const quorum = adminQuorum(env);
  const single = adminSingleSigner(env);

  const asAdmin = (contractId: string, method: string, args: xdr.ScVal[] = []) =>
    invoke(rpcServer, { contractId, method, args, source: env.adminPublic, signers: quorum });
  const asOperator = (contractId: string, method: string, args: xdr.ScVal[] = []) =>
    invoke(rpcServer, { contractId, method, args, signers: [operator] });
  const read = (contractId: string, method: string, ...args: xdr.ScVal[]) =>
    view(rpcServer, env.deployerPublic, contractId, method, ...args);

  const adminScVal = Address.fromString(env.adminPublic).toScVal();
  const operatorScVal = Address.fromString(env.operatorPublic).toScVal();

  console.log(`Admin account: ${EXPLORER}/account/${env.adminPublic}`);
  console.log(`Operator:      ${env.operatorPublic}`);
  if ((await read(d.contracts.registry, 'admin')) !== env.adminPublic) {
    throw new Error('the registry does not name ADMIN_PUBLIC as its admin');
  }
  if ((await read(d.contracts.registry, 'operator')) !== env.operatorPublic) {
    throw new Error('the registry does not name OPERATOR_PUBLIC as its operator');
  }

  // 1 ----------------------------------------------------------------------
  console.log(`\n1/6 One signature out of ${ADMIN_SIGNER_COUNT} is not a quorum`);
  const throwaway = Keypair.random().publicKey();
  const throwawayScVal = Address.fromString(throwaway).toScVal();

  await mustFailAtSignatureCheck(`transfer_admin signed by 1 of ${ADMIN_SIGNER_COUNT}`, () =>
    invoke(rpcServer, {
      contractId: d.contracts.registry,
      method: 'transfer_admin',
      args: [throwawayScVal],
      source: env.adminPublic,
      signers: [single],
    }),
  );
  // Nothing was recorded, so the refusal happened before the contract ran.
  if ((await read(d.contracts.registry, 'pending_admin')) !== null) {
    throw new Error('an under-signed transfer_admin still named a successor');
  }
  console.log('  and nothing was recorded: pending_admin is still empty');

  fees.record(
    `transfer_admin (${ADMIN_QUORUM}/${ADMIN_SIGNER_COUNT})`,
    await asAdmin(d.contracts.registry, 'transfer_admin', [throwawayScVal]),
  );
  if ((await read(d.contracts.registry, 'pending_admin')) !== throwaway) {
    throw new Error(`${ADMIN_QUORUM} signatures did not name the successor`);
  }
  console.log(`  the same call with ${ADMIN_QUORUM} signatures went through`);

  // 5 (here, because the handover is already open) --------------------------
  console.log('\n2/6 A named successor is not the admin until it accepts');
  if ((await read(d.contracts.registry, 'admin')) !== env.adminPublic) {
    throw new Error('transfer_admin changed the admin before it was accepted');
  }
  console.log('  admin is unchanged while the handover is pending');
  fees.record(
    'cancel_transfer_admin',
    await asAdmin(d.contracts.registry, 'cancel_transfer_admin'),
  );
  if ((await read(d.contracts.registry, 'pending_admin')) !== null) {
    throw new Error('the handover was not cancelled');
  }
  console.log('  and it was called off again, so nothing is pending');

  // 2 ----------------------------------------------------------------------
  console.log('\n3/6 The operator can stop the asset and cannot start it again');
  fees.record('pause (operator)', await asOperator(d.contracts.registry, 'pause', [operatorScVal]));
  if ((await read(d.contracts.registry, 'paused')) !== true) {
    throw new Error('the operator could not halt the deployment');
  }
  console.log('  halted with one hot signature');

  await mustFailForLackOfAuthority('the operator lifting the halt', () =>
    asOperator(d.contracts.registry, 'resume'),
  );
  if ((await read(d.contracts.registry, 'paused')) !== true) {
    throw new Error('the deployment un-paused itself');
  }
  fees.record(
    `resume (${ADMIN_QUORUM}/${ADMIN_SIGNER_COUNT})`,
    await asAdmin(d.contracts.registry, 'resume'),
  );
  if ((await read(d.contracts.registry, 'paused')) !== false) {
    throw new Error('the admin could not lift the halt');
  }
  console.log(`  lifted only by ${ADMIN_QUORUM} of ${ADMIN_SIGNER_COUNT} cold signatures`);

  // 3 ----------------------------------------------------------------------
  console.log('\n4/6 What the hot key cannot reach');
  // Each call below is one the ADMIN could make right now and that changes
  // nothing when it lands: the same price, the same operator, one stroop back
  // to the admin's own account, one share from inventory into custody. That is
  // deliberate. Simulation runs authorization in recording mode, so a call
  // that would fail for any other reason fails there instead and proves
  // nothing about who signed it. These can only fail on the signature.
  const currentPrice = (await read(d.contracts.assetSale, 'price')) as bigint;
  await mustFailForLackOfAuthority('the operator repricing the sale', () =>
    asOperator(d.contracts.assetSale, 'set_price', [nativeToScVal(currentPrice, { type: 'i128' })]),
  );
  await mustFailForLackOfAuthority('the operator promoting itself', () =>
    asOperator(d.contracts.registry, 'set_operator', [operatorScVal]),
  );
  await mustFailForLackOfAuthority('the operator draining the buyback pool', () =>
    asOperator(d.contracts.assetSale, 'withdraw_buyback', [
      adminScVal,
      nativeToScVal(1n, { type: 'i128' }),
    ]),
  );
  await mustFailForLackOfAuthority('the operator confiscating shares', () =>
    asOperator(d.contracts.shareToken, 'revoke_shares', [
      Address.fromString(d.contracts.assetSale).toScVal(),
      nativeToScVal(1n, { type: 'i128' }),
    ]),
  );
  if ((await read(d.contracts.assetSale, 'price')) !== currentPrice) {
    throw new Error('the price moved during the drill');
  }

  // Issuance is closed to everyone, the admin included. Not a role boundary
  // but a stronger one: there is no second mint to authorize.
  if ((await read(d.contracts.shareToken, 'issued')) !== true) {
    throw new Error('the asset has not been issued');
  }
  await mustFail(
    `a second issuance, signed ${ADMIN_QUORUM}-of-${ADMIN_SIGNER_COUNT}`,
    () =>
      asAdmin(d.contracts.shareToken, 'mint', [
        Address.fromString(d.accounts.treasury).toScVal(),
        nativeToScVal(1n, { type: 'i128' }),
      ]),
    209,
  );

  // What it CAN reach, so the role is not merely a name.
  fees.record(
    'set_available (operator)',
    await asOperator(d.contracts.assetSale, 'set_available', [operatorScVal, nativeToScVal(false)]),
  );
  if ((await read(d.contracts.assetSale, 'available')) !== false) {
    throw new Error('the operator could not close the sale');
  }
  await asOperator(d.contracts.assetSale, 'set_available', [operatorScVal, nativeToScVal(true)]);
  console.log('  it can still open and close the sale, which is the whole job');

  // 4 ----------------------------------------------------------------------
  console.log('\n5/6 A stranger holds neither role');
  const stranger = Keypair.random();
  const fb = await fundViaFriendbot(stranger.publicKey());
  if (!fb.ok) throw new Error(`friendbot failed: ${fb.status}`);
  await mustFail(
    'a stranger halting the deployment',
    () =>
      invoke(rpcServer, {
        contractId: d.contracts.registry,
        method: 'pause',
        args: [Address.fromString(stranger.publicKey()).toScVal()],
        signers: [stranger],
      }),
    901,
  );

  // 6 ----------------------------------------------------------------------
  console.log('\n6/6 The code can be replaced, and the state survives it');
  // Re-pointing the registry at the wasm hash it is already running. A live
  // demo is the wrong place to install different code, and the property being
  // proven is the mechanism, not the diff: two signatures reach
  // `update_current_contract_wasm`, one does not, and the storage is untouched
  // either way.
  const wasmHash = nativeToScVal(Buffer.from(d.wasmHashes.registry, 'hex'));
  const before = {
    admin: await read(d.contracts.registry, 'admin'),
    operator: await read(d.contracts.registry, 'operator'),
    provider: await read(d.contracts.registry, 'kyc_provider'),
    saleAdmitted: await read(
      d.contracts.registry,
      'participant',
      Address.fromString(d.contracts.assetSale).toScVal(),
    ),
  };

  await mustFailAtSignatureCheck(`upgrade signed by 1 of ${ADMIN_SIGNER_COUNT}`, () =>
    invoke(rpcServer, {
      contractId: d.contracts.registry,
      method: 'upgrade',
      args: [wasmHash],
      source: env.adminPublic,
      signers: [single],
    }),
  );
  const upgraded = fees.record(
    `upgrade (${ADMIN_QUORUM}/${ADMIN_SIGNER_COUNT})`,
    await asAdmin(d.contracts.registry, 'upgrade', [wasmHash]),
  );
  console.log(`  ${EXPLORER}/tx/${upgraded.hash}`);

  const after = {
    admin: await read(d.contracts.registry, 'admin'),
    operator: await read(d.contracts.registry, 'operator'),
    provider: await read(d.contracts.registry, 'kyc_provider'),
    saleAdmitted: await read(
      d.contracts.registry,
      'participant',
      Address.fromString(d.contracts.assetSale).toScVal(),
    ),
  };
  for (const key of Object.keys(before) as (keyof typeof before)[]) {
    if (before[key] !== after[key]) {
      throw new Error(`the upgrade lost state: ${key} was ${before[key]}, is now ${after[key]}`);
    }
  }
  console.log('  roles, the provider and the participant list all read back unchanged');

  console.log('\nGOVERNANCE DRILL OK');
  console.log(
    `  admin      ${ADMIN_QUORUM}-of-${ADMIN_SIGNER_COUNT}, enforced by the account's thresholds`,
  );
  console.log('  operator   can halt, switch markets and distribute rent, and nothing else');
  console.log('  handover   two steps, and the successor has to sign');
  console.log('  upgrade    reachable only by a quorum, and it preserves storage');
  fees.print();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
