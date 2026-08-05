'use client';

import { Address } from '@stellar/stellar-sdk';
import { useCallback, useEffect, useState } from 'react';
import { txErrorMessage } from '@/lib/format';
import { DEPLOYMENT, fetchGateStatus, type GateStatus } from '@/lib/stellar';
import { invokeContract, TX_PHASE_LABEL, type TxPhase } from '@/lib/tx';

/** Why the registry is refusing this address, when it is. */
export type BlockedReason = 'kyc' | 'frozen' | 'paused';

/** One sentence per reason, so no screen has to compose its own. */
export const BLOCKED_MESSAGE: Record<BlockedReason, string> = {
  kyc: 'This wallet has not passed the demo KYC yet.',
  frozen:
    'This wallet is suspended by the compliance provider. Its shares are frozen in place and its rent keeps accruing; a suspension is lifted by the provider, not by registering again.',
  paused:
    'The issuer has halted this asset. No shares can move until the halt is lifted. Rent already earned can still be claimed.',
};

function reasonFor(status: GateStatus): BlockedReason | null {
  if (status.allowed) return null;
  if (status.paused) return 'paused';
  if (status.frozen) return 'frozen';
  return 'kyc';
}

/**
 * The shared compliance registry every contract checks before it lets an
 * address hold or move shares - the token included, so there is no
 * wallet-to-wallet way around it. One entry covers every asset the platform
 * issues; in production it is written by a KYC provider rather than the user.
 *
 * `allowed` being false has three different causes and only one of them is the
 * user's to fix, so the hook reports which, rather than sending a suspended
 * investor round the registration loop again.
 */
export function useKycGate(address: string | null) {
  /** null while the answer is still coming back from the chain. */
  const [status, setStatus] = useState<GateStatus | null>(null);
  const [registering, setRegistering] = useState(false);
  /** Which wait the registration is in, for the button that started it. */
  const [phase, setPhase] = useState<TxPhase>('preparing');
  /** null when the last attempt did not fail. */
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    fetchGateStatus(address)
      .then((s) => !cancelled && setStatus(s))
      .catch(
        () =>
          !cancelled &&
          setStatus({ allowed: false, whitelisted: false, frozen: false, paused: false }),
      );
    return () => {
      cancelled = true;
    };
  }, [address]);

  const register = useCallback(async () => {
    if (!address) return;
    setRegistering(true);
    setPhase('preparing');
    setError(null);
    try {
      await invokeContract({
        contractId: DEPLOYMENT.contracts.registry,
        method: 'register',
        args: [Address.fromString(address).toScVal()],
        publicKey: address,
        onPhase: setPhase,
      });
      setStatus((s) => ({
        allowed: true,
        whitelisted: true,
        frozen: s?.frozen ?? false,
        paused: s?.paused ?? false,
      }));
    } catch (e) {
      setError(txErrorMessage(e));
    } finally {
      setRegistering(false);
    }
  }, [address]);

  return {
    /** null while unknown; otherwise whether the contracts will let this through. */
    whitelisted: status === null ? null : status.allowed,
    /** Which of the three reasons applies, when it is blocked. */
    reason: status === null ? null : reasonFor(status),
    status,
    registering,
    /** What the register button says while it works, or null when idle. */
    registerLabel: registering ? TX_PHASE_LABEL[phase] : null,
    error,
    register,
  };
}
