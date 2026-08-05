'use client';

import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/UI/Button';
import { Modal } from '@/components/UI/Modal';
import { useWallet } from '@/components/WalletProvider';
import { DEMO_ASSET } from '@/config/asset';
import { useTxAction } from '@/hooks/useTxAction';
import { buybackQuote, formatXlm } from '@/lib/format';
import { DEPLOYMENT, EXPLORER, fetchBuybackPool, type SaleState } from '@/lib/stellar';
import styles from './SellModal.module.scss';

interface Props {
  sale: SaleState | null;
  /** Shares the connected wallet holds - the stepper's upper bound. */
  owned: bigint;
  onSold: () => void;
  onClose: () => void;
}

/** Sell shares back to the contract's buyback pool at the current price. */
export function SellModal({ sale, owned, onSold, onClose }: Props) {
  const { status, address } = useWallet();
  const { state: sell, busy, label: txLabel, run } = useTxAction<number>();
  const [amount, setAmount] = useState(1);
  /** null while loading; the pool caps how much the contract can pay out. */
  const [pool, setPool] = useState<bigint | null>(null);

  const max = Number(owned);

  useEffect(() => {
    let cancelled = false;
    fetchBuybackPool()
      .then((p) => !cancelled && setPool(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const discountBps = DEPLOYMENT.asset.buybackDiscountBps;
  const payoutStroops = sale ? buybackQuote(sale.priceStroops, BigInt(amount), discountBps) : null;
  const payout = payoutStroops !== null ? formatXlm(payoutStroops) : null;

  const submitSell = useCallback(async () => {
    if (status !== 'connected' || !address || payoutStroops === null) return;
    const hash = await run(
      {
        contractId: DEPLOYMENT.contracts.assetSale,
        method: 'sell',
        args: [
          Address.fromString(address).toScVal(),
          nativeToScVal(BigInt(amount), { type: 'i128' }),
          // The quote on the button, sent as the floor the contract enforces:
          // a price cut before this lands aborts instead of paying less.
          nativeToScVal(payoutStroops, { type: 'i128' }),
        ],
        publicKey: address,
      },
      amount,
    );
    if (hash) onSold();
  }, [status, address, payoutStroops, amount, run, onSold]);
  const poolTooSmall = pool !== null && payoutStroops !== null && payoutStroops > pool;

  return (
    <Modal label='Sell shares back' className={styles.modal} busy={busy} onClose={onClose}>
      <h2 className={styles.title}>Sell shares back</h2>
      <p className={styles.subtitle}>
        {DEMO_ASSET.name} · {DEMO_ASSET.symbol}
      </p>

      <div className={styles.walletRow}>
        <span className={styles.walletLabel}>You hold</span>
        <span className={styles.walletValue}>
          {owned.toString()} {DEMO_ASSET.symbol}
        </span>
      </div>

      <div className={styles.walletRow}>
        <span className={styles.walletLabel}>Buyback pool</span>
        <span className={styles.walletValue}>{pool === null ? '…' : `${formatXlm(pool)} XLM`}</span>
      </div>

      <div className={styles.amountRow}>
        <span className={styles.walletLabel}>Shares to sell</span>
        <div className={styles.stepper}>
          <button
            type='button'
            onClick={() => setAmount((a) => Math.max(1, a - 1))}
            disabled={busy || amount <= 1}
          >
            −
          </button>
          <span>{amount}</span>
          <button
            type='button'
            onClick={() => setAmount((a) => Math.min(max, a + 1))}
            disabled={busy || amount >= max}
          >
            +
          </button>
        </div>
      </div>

      <Button
        variant='gradient'
        onClick={submitSell}
        loading={busy}
        disabled={busy || !sale || max === 0 || poolTooSmall}
      >
        {txLabel ?? (payout ? `Sell for ${payout} XLM` : 'Loading…')}
      </Button>

      {poolTooSmall && (
        <p className={styles.error}>
          The buyback pool holds only {pool !== null ? formatXlm(pool) : '…'} XLM right now — reduce
          the amount or try later when the pool is refilled.
        </p>
      )}

      <p className={styles.note}>
        The issuer buys shares back at {(discountBps / 100).toFixed(discountBps % 100 ? 2 : 0)}%
        below the primary price of {sale ? formatXlm(sale.priceStroops) : '…'} XLM, straight from
        the on-chain buyback pool — shares return to the sale inventory, XLM reaches your wallet in
        the same transaction. The discount is fixed at deployment and the admin cannot change it.
        Sell on the secondary market instead if you want to set your own price.
      </p>

      {sell.step === 'done' && (
        <div className={styles.success}>
          <p>
            You sold <b>{sell.meta}</b> share{sell.meta > 1 ? 's' : ''} back for XLM.
          </p>
          <a href={`${EXPLORER}/tx/${sell.hash}`} target='_blank' rel='noreferrer'>
            View the transaction on stellar.expert ↗
          </a>
        </div>
      )}

      {sell.step === 'error' && <p className={styles.error}>{sell.message}</p>}
    </Modal>
  );
}
