'use client';

import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { useCallback, useEffect, useState } from 'react';
import { ConsentCheck } from '@/components/ConsentCheck';
import { Button } from '@/components/UI/Button';
import { Modal } from '@/components/UI/Modal';
import { useWallet } from '@/components/WalletProvider';
import { DEMO_ASSET } from '@/config/asset';
import { useTxAction } from '@/hooks/useTxAction';
import { formatXlm, stroopsToXlm, xlmToStroops } from '@/lib/format';
import { DEPLOYMENT, EXPLORER, type ExchangeConfig, fetchExchangeConfig } from '@/lib/stellar';
import styles from './ListSharesModal.module.scss';

interface Props {
  /** Shares the connected wallet holds - the stepper's upper bound. */
  owned: bigint;
  onListed: () => void;
  onClose: () => void;
}

const BPS = 10_000n;

/** Place a sell order on the secondary market: amount, price, commission
 *  preview, then the shares move into on-chain escrow. */
export function ListSharesModal({ owned, onListed, onClose }: Props) {
  const { status, address } = useWallet();
  const { state: list, busy, label: txLabel, run } = useTxAction<number>();
  const [amount, setAmount] = useState(1);
  const [price, setPrice] = useState(stroopsToXlm(BigInt(DEPLOYMENT.asset.priceStroops)));
  /** null while the on-chain band and commission are loading. */
  const [config, setConfig] = useState<ExchangeConfig | null>(null);
  const [consent, setConsent] = useState(false);

  const max = Number(owned);

  useEffect(() => {
    let cancelled = false;
    fetchExchangeConfig()
      .then((c) => !cancelled && setConfig(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const rateStroops = xlmToStroops(price);
  const rateOutOfBand =
    rateStroops !== null &&
    config !== null &&
    (rateStroops < config.minRateStroops || rateStroops > config.maxRateStroops);
  const priceInvalid = rateStroops === null || rateStroops <= 0n || rateOutOfBand;

  const totalStroops = rateStroops !== null ? rateStroops * BigInt(amount) : null;
  const commissionStroops =
    totalStroops !== null && config !== null
      ? (totalStroops * BigInt(config.commissionBps)) / BPS
      : null;
  const netStroops =
    totalStroops !== null && commissionStroops !== null ? totalStroops - commissionStroops : null;

  const submitList = useCallback(async () => {
    if (status !== 'connected' || !address || rateStroops === null) return;
    const hash = await run(
      {
        contractId: DEPLOYMENT.contracts.exchange,
        method: 'add_order',
        args: [
          Address.fromString(address).toScVal(),
          nativeToScVal(BigInt(amount), { type: 'i128' }),
          nativeToScVal(rateStroops, { type: 'i128' }),
        ],
        publicKey: address,
      },
      amount,
    );
    if (hash) onListed();
  }, [status, address, amount, rateStroops, run, onListed]);

  return (
    <Modal label='List shares for sale' className={styles.modal} busy={busy} onClose={onClose}>
      <h2 className={styles.title}>List shares for sale</h2>
      <p className={styles.subtitle}>
        {DEMO_ASSET.name} · {DEMO_ASSET.symbol} · secondary market
      </p>

      <div className={styles.walletRow}>
        <span className={styles.walletLabel}>You hold</span>
        <span className={styles.walletValue}>
          {owned.toString()} {DEMO_ASSET.symbol}
        </span>
      </div>

      <div className={styles.amountRow}>
        <span className={styles.walletLabel}>Shares to list</span>
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

      <div className={styles.priceField}>
        <span className={styles.walletLabel}>
          Price per share
          {config && (
            <>
              {' '}
              ({stroopsToXlm(config.minRateStroops)}–{stroopsToXlm(config.maxRateStroops)} XLM)
            </>
          )}
        </span>
        <input
          className={`${styles.priceInput} ${priceInvalid ? styles.invalid : ''}`}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode='decimal'
          disabled={busy}
          aria-label='Price per share in XLM'
        />
      </div>

      <div className={styles.feeRows}>
        <div className={styles.feeRow}>
          <span>Order total</span>
          <b>{totalStroops !== null ? `${formatXlm(totalStroops)} XLM` : '—'}</b>
        </div>
        <div className={styles.feeRow}>
          <span>
            Platform commission
            {config
              ? ` (${(config.commissionBps / 100).toFixed(config.commissionBps % 100 ? 2 : 0)}%)`
              : ''}
          </span>
          <b>{commissionStroops !== null ? `${formatXlm(commissionStroops)} XLM` : '—'}</b>
        </div>
        <div className={`${styles.feeRow} ${styles.feeRowStrong}`}>
          <span>You receive if fully sold</span>
          <b>{netStroops !== null ? `${formatXlm(netStroops)} XLM` : '—'}</b>
        </div>
      </div>

      <ConsentCheck
        checked={consent}
        onChange={setConsent}
        disabled={busy}
        text='By continuing, I agree with the terms of this order'
      />

      <Button
        variant='gradient'
        onClick={submitList}
        loading={busy}
        disabled={busy || !consent || max === 0 || priceInvalid || config === null}
      >
        {txLabel ?? `List ${amount} share${amount > 1 ? 's' : ''} for sale`}
      </Button>

      {rateOutOfBand && config && (
        <p className={styles.error}>
          The price must stay between {stroopsToXlm(config.minRateStroops)} and{' '}
          {stroopsToXlm(config.maxRateStroops)} XLM per share — the band the admin sets on-chain.
        </p>
      )}

      <p className={styles.note}>
        Your shares move into on-chain escrow until someone buys them or you cancel the order.
        Buyers pay you directly — the contract deducts the platform commission and sends the rest
        straight to your wallet.
      </p>

      {list.step === 'done' && (
        <div className={styles.success}>
          <p>
            Listed <b>{list.meta}</b> share{list.meta > 1 ? 's' : ''} on the secondary market.
          </p>
          <a href={`${EXPLORER}/tx/${list.hash}`} target='_blank' rel='noreferrer'>
            View the transaction on stellar.expert ↗
          </a>
        </div>
      )}

      {list.step === 'error' && <p className={styles.error}>{list.message}</p>}
    </Modal>
  );
}
