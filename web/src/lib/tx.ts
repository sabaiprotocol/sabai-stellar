import {
  BASE_FEE,
  Contract,
  rpc,
  SorobanDataBuilder,
  TransactionBuilder,
  type xdr,
} from '@stellar/stellar-sdk';
import { signTransaction } from './freighter';
import { NETWORK_PASSPHRASE, RPC_URL } from './stellar';

/**
 * A contract call has three waits, and they are not the same wait.
 *
 * Simulation is a round-trip to RPC before the wallet ever opens; the signature
 * is the only part the user does anything about; and settling is up to four
 * ledgers with the wallet already closed. Reporting all three as "signing"
 * leaves the app asking for a signature that was given several seconds ago.
 */
export type TxPhase = 'preparing' | 'signing' | 'settling';

/** One wording per phase, so no screen composes its own. */
export const TX_PHASE_LABEL: Record<TxPhase, string> = {
  preparing: 'Preparing…',
  signing: 'Confirm in Freighter…',
  settling: 'Settling on-chain…',
};

export interface InvokeArgs {
  contractId: string;
  method: string;
  args: xdr.ScVal[];
  publicKey: string;
  /** Called as the call moves between waits, for the button that started it. */
  onPhase?: (phase: TxPhase) => void;
}

/** How long the built transaction stays valid, in seconds. */
const VALID_FOR_SECONDS = 120;
const POLL_INTERVAL_MS = 2000;
/**
 * Poll past the validity window rather than up to it. Giving up first would
 * report a transaction as failed while the network could still include it, and
 * the user would be told their purchase did not happen when it might.
 */
const POLL_ATTEMPTS = Math.ceil(((VALID_FOR_SECONDS + 30) * 1000) / POLL_INTERVAL_MS);

/**
 * Single write path for every contract call the dApp signs with Freighter:
 * build -> simulate -> assemble -> PAD THE RESOURCE FEE -> sign -> send -> poll.
 *
 * The padding matters: the simulated refundable fee can come in slightly
 * under what execution actually needs (state moves between simulate and
 * apply), and the transaction then fails on-chain with
 * INSUFFICIENT_REFUNDABLE_FEE. The unused padding is refunded, so +30%
 * costs nothing in practice. The generated bindings do not pad - which is
 * why writes go through here and the bindings serve typed views only.
 */
export async function invokeContract(opts: InvokeArgs): Promise<string> {
  opts.onPhase?.('preparing');
  const server = new rpc.Server(RPC_URL);
  const account = await server.getAccount(opts.publicKey);

  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(new Contract(opts.contractId).call(opts.method, ...opts.args))
    .setTimeout(VALID_FOR_SECONDS)
    .build();

  const sim = await server.simulateTransaction(built);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    // Carries the contract error code - txErrorMessage turns it into a sentence.
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  // A restore response also satisfies isSimulationSuccess, because it extends
  // it. Submitting one anyway would fail on-chain: the entries it touched are
  // archived and the host only pretended otherwise for the simulation.
  if (rpc.Api.isSimulationRestore(sim)) {
    throw new Error(
      'Some contract data has expired and needs restoring before this call can go through.',
    );
  }
  const assembled = rpc.assembleTransaction(built, sim).build();

  const sorobanData = assembled.toEnvelope().v1().tx().ext().sorobanData();
  const resourceFee = BigInt(sorobanData.resourceFee().toString());
  const paddedResourceFee = (resourceFee * 13n) / 10n;
  const padded = TransactionBuilder.cloneFrom(assembled, {
    fee: (BigInt(assembled.fee) + (paddedResourceFee - resourceFee)).toString(),
    sorobanData: new SorobanDataBuilder(sorobanData).setResourceFee(paddedResourceFee).build(),
  }).build();

  opts.onPhase?.('signing');
  const signed = await signTransaction(padded.toXDR(), {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: opts.publicKey,
  });
  if (signed.error || !signed.signedTxXdr) {
    throw new Error(signed.error?.message ?? 'Signature request was declined');
  }

  opts.onPhase?.('settling');
  const envelope = TransactionBuilder.fromXDR(signed.signedTxXdr, NETWORK_PASSPHRASE);
  const sent = await server.sendTransaction(envelope);
  // Four possible statuses, and only PENDING and DUPLICATE mean the node took
  // it. TRY_AGAIN_LATER in particular is not a queued transaction: polling for
  // its hash would spin for two minutes and then report a failure that never
  // happened.
  if (sent.status === 'ERROR') {
    throw new Error('Transaction was not accepted by the network');
  }
  if (sent.status === 'TRY_AGAIN_LATER') {
    throw new Error('The network is busy and did not queue this transaction. Try again.');
  }

  let confirmed = await server.getTransaction(sent.hash);
  for (
    let i = 0;
    i < POLL_ATTEMPTS && confirmed.status === rpc.Api.GetTransactionStatus.NOT_FOUND;
    i++
  ) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    confirmed = await server.getTransaction(sent.hash);
  }
  // NOT_FOUND here means the validity window closed without inclusion, which
  // is a different thing from the contract rejecting the call, and the user
  // deserves to be told which one happened.
  if (confirmed.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    throw new Error(
      `The network did not include this transaction in time. Nothing was charged; check ${sent.hash} before retrying.`,
    );
  }
  if (confirmed.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction ${confirmed.status.toLowerCase()} on-chain`);
  }
  return sent.hash;
}
