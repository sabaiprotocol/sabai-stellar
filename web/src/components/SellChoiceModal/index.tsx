'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/UI/Modal';
import { DEMO_ASSET } from '@/config/asset';
import { buybackQuote, formatXlm, stroopsToXlm } from '@/lib/format';
import { DEPLOYMENT, fetchBuybackPool, type SaleState } from '@/lib/stellar';
import styles from './SellChoiceModal.module.scss';

export type SellRoute = 'buyback' | 'market';

interface Props {
  sale: SaleState | null;
  /** Shares in the wallet - both routes need at least one. */
  owned: bigint;
  onPick: (route: SellRoute) => void;
  onClose: () => void;
}

/** Two ways out of a position behind one button: sell instantly to the
 *  contract's buyback pool at the fixed price, or list on the secondary
 *  market at your own price. */
export function SellChoiceModal({ sale, owned, onPick, onClose }: Props) {
  /** null while loading; caps how much the buyback route can pay out. */
  const [pool, setPool] = useState<bigint | null>(null);

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
  const buybackPerShare = sale !== null ? buybackQuote(sale.priceStroops, 1n, discountBps) : null;
  const poolEmpty = pool !== null && buybackPerShare !== null && pool < buybackPerShare;

  return (
    <Modal label='How would you like to sell?' className={styles.modal} onClose={onClose}>
      <h2 className={styles.title}>Sell shares</h2>
      <p className={styles.subtitle}>
        {DEMO_ASSET.name} · you hold {owned.toString()} {DEMO_ASSET.symbol}
      </p>

      <div className={styles.options}>
        <button
          type='button'
          className={styles.option}
          onClick={() => onPick('buyback')}
          disabled={owned === 0n || poolEmpty}
        >
          <span className={styles.optionHead}>
            <span className={styles.optionTitle}>Sell back instantly</span>
            <span className={styles.optionPrice}>
              {buybackPerShare !== null ? `${stroopsToXlm(buybackPerShare)} XLM / share` : '…'}
            </span>
          </span>
          <span className={styles.optionText}>
            The issuer buys your shares back {discountBps / 100}% below the primary price — one
            transaction, no waiting for a counterparty.{' '}
            {pool !== null && `Pool holds ${formatXlm(pool)} XLM.`}
            {poolEmpty && ' Not enough for a share right now.'}
          </span>
        </button>

        <button
          type='button'
          className={styles.option}
          onClick={() => onPick('market')}
          disabled={owned === 0n}
        >
          <span className={styles.optionHead}>
            <span className={styles.optionTitle}>List on the secondary market</span>
            <span className={styles.optionPrice}>your price</span>
          </span>
          <span className={styles.optionText}>
            Set your own price per share and wait for a buyer. Shares sit in on-chain escrow, buyers
            can take them in parts, and you can cancel any time.
          </span>
        </button>
      </div>
    </Modal>
  );
}
