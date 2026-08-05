/**
 * One way to send a contract call, used by every script here.
 *
 * There used to be three copies of this - deploy, smoke-buy and the drills all
 * grew their own - which is how the resource-fee padding ended up in two of
 * them and not the third. The frontend has its own copy in `web/src/lib/tx.ts`
 * because it signs through Freighter rather than with a keypair, and that one
 * is deliberately separate; these are not.
 *
 * `signers` is a list rather than one keypair because the admin of this
 * deployment is a 2-of-3 multisig account: its transactions carry two
 * signatures and the network checks them against the account's thresholds.
 * Nothing else about sending changes.
 */
import {
  BASE_FEE,
  Contract,
  type Keypair,
  Networks,
  rpc,
  SorobanDataBuilder,
  scValToNative,
  TransactionBuilder,
  type xdr,
} from '@stellar/stellar-sdk';
import { EXPLORER, RPC_URL } from './lib.ts';

/** How long a built transaction stays valid, in seconds. */
const VALID_FOR_SECONDS = 60;
const POLL_INTERVAL_MS = 2000;
const POLL_ATTEMPTS = 30;

/**
 * The simulated refundable fee can come in under what execution actually
 * needs, because state moves between simulate and apply, and the transaction
 * then fails with INSUFFICIENT_REFUNDABLE_FEE. The unused padding is refunded,
 * so this costs nothing in practice.
 */
const RESOURCE_FEE_PADDING_PERCENT = 130n;

export function server(): rpc.Server {
  return new rpc.Server(RPC_URL);
}

export function xlm(stroops: bigint): string {
  return (Number(stroops) / 1e7).toFixed(7);
}

export interface Call {
  contractId: string;
  method: string;
  args?: xdr.ScVal[];
  /** Signs the envelope. More than one when the source is a multisig account. */
  signers: Keypair[];
  /**
   * Transaction source, when it is not the first signer - which is the whole
   * multisig case: the source is the multisig ACCOUNT and the signers are the
   * keys that account lists.
   */
  source?: string;
}

export interface Sent {
  hash: string;
  feeCharged: bigint;
}

/** Build, simulate, pad, sign and submit. Throws unless the ledger says SUCCESS. */
export async function invoke(rpcServer: rpc.Server, call: Call): Promise<Sent> {
  const sourceKey = call.source ?? call.signers[0]?.publicKey();
  if (!sourceKey) throw new Error(`${call.method}: no source account and no signers`);

  const account = await rpcServer.getAccount(sourceKey);
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(call.contractId).call(call.method, ...(call.args ?? [])))
    .setTimeout(VALID_FOR_SECONDS)
    .build();

  const sim = await rpcServer.simulateTransaction(built);
  // The message carries `Error(Contract, #N)`, which is what `mustFail` in the
  // drills insists on seeing: a control has to be proven by a contract
  // rejecting the call, not by an RPC hiccup that threw at the same moment.
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`${call.method} rejected: ${sim.error}`);
  }
  const assembled = rpc.assembleTransaction(built, sim).build();

  const sorobanData = assembled.toEnvelope().v1().tx().ext().sorobanData();
  const resourceFee = BigInt(sorobanData.resourceFee().toString());
  const padded = (resourceFee * RESOURCE_FEE_PADDING_PERCENT) / 100n;
  const prepared = TransactionBuilder.cloneFrom(assembled, {
    fee: (BigInt(assembled.fee) + (padded - resourceFee)).toString(),
    sorobanData: new SorobanDataBuilder(sorobanData).setResourceFee(padded).build(),
  }).build();

  prepared.sign(...call.signers);
  const sent = await rpcServer.sendTransaction(prepared);
  // `tx_bad_auth` lands here, not in the polling below: the network rejects an
  // under-signed transaction outright rather than including a failed one.
  if (sent.status === 'ERROR') {
    throw new Error(`${call.method} send failed: ${JSON.stringify(sent.errorResult)}`);
  }

  let confirmed = await rpcServer.getTransaction(sent.hash);
  for (
    let i = 0;
    i < POLL_ATTEMPTS && confirmed.status === rpc.Api.GetTransactionStatus.NOT_FOUND;
    i++
  ) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    confirmed = await rpcServer.getTransaction(sent.hash);
  }
  if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    if (confirmed.status === rpc.Api.GetTransactionStatus.FAILED) {
      console.error(`  failed tx: ${EXPLORER}/tx/${sent.hash}`);
    }
    throw new Error(`${call.method} tx not successful: ${confirmed.status}`);
  }

  return { hash: sent.hash, feeCharged: BigInt(confirmed.resultXdr.feeCharged().toString()) };
}

/**
 * Read a view by simulating it. No signature, no fee, nothing written - the
 * source account is only there because a transaction needs one.
 */
export async function view(
  rpcServer: rpc.Server,
  source: string,
  contractId: string,
  method: string,
  ...args: xdr.ScVal[]
): Promise<unknown> {
  const account = await rpcServer.getAccount(source);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(VALID_FOR_SECONDS)
    .build();

  const sim = await rpcServer.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) {
    throw new Error(`simulation of ${method}() failed`);
  }
  return scValToNative(sim.result.retval);
}

/** What the network actually charged, collected for the tables in the docs. */
export class FeeLog {
  private readonly rows: { op: string; stroops: bigint; hash: string }[] = [];

  record(op: string, sent: Sent): Sent {
    this.rows.push({ op, stroops: sent.feeCharged, hash: sent.hash });
    return sent;
  }

  print(withHashes = false): void {
    console.log('\nFees actually charged by the network');
    let total = 0n;
    for (const r of this.rows) {
      total += r.stroops;
      console.log(
        r.op.padEnd(22) +
          xlm(r.stroops).padStart(12) +
          r.stroops.toString().padStart(10) +
          (withHashes ? `  ${r.hash}` : ''),
      );
    }
    console.log(`${'TOTAL'.padEnd(22)}${xlm(total).padStart(12)}${total.toString().padStart(10)}`);
  }
}

const CONTRACT_ERROR = /Error\(Contract, #(\d+)\)/;

/**
 * Runs a call that MUST be rejected, and fails the drill otherwise.
 *
 * Two ways to fail: the call goes through, or it fails for the wrong reason.
 * The second matters more than it looks - without the code check, a network
 * blip at the right moment reads as proof of a control that was never
 * exercised. `expect` narrows it further to one specific contract error.
 */
export async function mustFail(
  label: string,
  run: () => Promise<unknown>,
  expect?: number,
): Promise<void> {
  let thrown: unknown;
  try {
    await run();
  } catch (e) {
    thrown = e;
  }
  if (thrown === undefined) throw new Error(`${label} went through, and it must not have`);
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  const match = message.match(CONTRACT_ERROR);
  if (!match) throw new Error(`${label} failed, but not with a contract error: ${message}`);
  if (expect !== undefined && Number(match[1]) !== expect) {
    throw new Error(`${label} failed with #${match[1]}, expected #${expect}`);
  }
  console.log(`  blocked as expected (#${match[1]}): ${label}`);
}

/**
 * The same, for a transaction the NETWORK must refuse before any contract sees
 * it. Under-signing a multisig account fails at `tx_bad_auth`, which never
 * reaches a contract and therefore never carries a contract error code.
 */
export async function mustFailAtSignatureCheck(
  label: string,
  run: () => Promise<unknown>,
): Promise<void> {
  const message = await capture(label, run);
  if (!/txBadAuth|tx_bad_auth/.test(message)) {
    throw new Error(`${label} failed, but not on the signature check: ${message}`);
  }
  console.log(`  rejected by the network (txBadAuth): ${label}`);
}

/**
 * And for a call refused because a signature it needs is simply not there -
 * the operator reaching for an admin-only entrypoint.
 *
 * That failure has no contract error code, because the contract never gets to
 * choose: `require_auth` on an address nobody signed for either aborts the
 * invocation or leaves an auth entry the ledger then rejects, depending on
 * where in the stack it happens. Both are accepted here and the one that
 * occurred is printed, so the drill cannot quietly start passing for a reason
 * nobody looked at.
 */
export async function mustFailForLackOfAuthority(
  label: string,
  run: () => Promise<unknown>,
): Promise<void> {
  const message = await capture(label, run);
  const reason = /Error\(Auth/.test(message)
    ? 'refused during simulation (Error(Auth, …))'
    : /tx not successful: FAILED/.test(message)
      ? 'included and failed on-chain, unauthorized'
      : null;
  if (!reason) {
    throw new Error(`${label} failed, but not for want of authority: ${message}`);
  }
  console.log(`  ${reason}: ${label}`);
}

/** Run something that must throw, and hand back what it threw. */
async function capture(label: string, run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error(`${label} went through, and it must not have`);
}
