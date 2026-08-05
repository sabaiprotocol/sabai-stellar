'use client';

import { useCallback, useState } from 'react';
import { txErrorMessage } from '@/lib/format';
import { type InvokeArgs, invokeContract, TX_PHASE_LABEL, type TxPhase } from '@/lib/tx';

/** `meta` is whatever the caller wants to show next to the result - the
 *  amount at the moment of signing, for instance, which the form itself may
 *  have moved on from by the time the transaction lands. */
export type TxState<T> =
  | { step: 'idle' }
  | { step: 'signing'; phase: TxPhase }
  | { step: 'done'; hash: string; meta: T }
  | { step: 'error'; message: string };

/** Sign and submit one contract call, tracking the state a form renders from. */
export function useTxAction<T = void>() {
  const [state, setState] = useState<TxState<T>>({ step: 'idle' });

  const run = useCallback(async (call: InvokeArgs, meta: T): Promise<string | null> => {
    setState({ step: 'signing', phase: 'preparing' });
    try {
      const hash = await invokeContract({
        ...call,
        onPhase: (phase) => setState({ step: 'signing', phase }),
      });
      setState({ step: 'done', hash, meta });
      return hash;
    } catch (e) {
      setState({ step: 'error', message: txErrorMessage(e) });
      return null;
    }
  }, []);

  return {
    state,
    busy: state.step === 'signing',
    /** What the button says while it works, or null when it is not working. */
    label: state.step === 'signing' ? TX_PHASE_LABEL[state.phase] : null,
    run,
  };
}
