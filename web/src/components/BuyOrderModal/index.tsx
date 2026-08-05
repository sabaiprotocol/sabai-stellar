'use client';

import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { useCallback, useState } from 'react';
import { ConsentCheck } from '@/components/ConsentCheck';
import { Button } from '@/components/UI/Button';
import { Modal } from '@/components/UI/Modal';
import { useWallet } from '@/components/WalletProvider';
import { DEMO_ASSET } from '@/config/asset';
import { BLOCKED_MESSAGE, useKycGate } from '@/hooks/useKycGate';
import { useTxAction } from '@/hooks/useTxAction';
import { formatXlm, shortAddress, stroopsToXlm } from '@/lib/format';
import { DEPLOYMENT, EXPLORER, type Order } from '@/lib/stellar';
import styles from './BuyOrderModal.module.scss';

interface Props {
  order: Order;
  onBought: () => void;
  onClose: () => void;
}

/** Fill someone else's sell order, fully or in part. */
export function BuyOrderModal({ order, onBought, onClose }: Props) {
  const { status, address } = useWallet();
  const kyc = useKycGate(address);
  const { state: buy, busy: signing, label: txLabel, run } = useTxAction<number>();
  const [amount, setAmount] = useState(1);
  const [consent, setConsent] = useState(false);

  const busy = signing || kyc.registering;
  const max = Number(order.remaining);

  const submitBuy = useCallback(async () => {
    if (status !== 'connected' || !address) return;
    const hash = await run(
      {
        contractId: DEPLOYMENT.contracts.exchange,
        method: 'swap_order',
        args: [
          Address.fromString(address).toScVal(),
          nativeToScVal(order.id, { type: 'u64' }),
          nativeToScVal(BigInt(amount), { type: 'i128' }),
        ],
        publicKey: address,
      },
      amount,
    );
    if (hash) onBought();
  }, [status, address, order, amount, run, onBought]);

  const totalCost = formatXlm(order.rate * BigInt(amount));

  return (
    <Modal label='Buy from order' className={styles.modal} busy={busy} onClose={onClose}>
      <h2 className={styles.title}>Buy from order #{order.id.toString()}</h2>
      <p className={styles.subtitle}>
        {DEMO_ASSET.name} · {DEMO_ASSET.symbol} · secondary market
      </p>

      <div className={styles.walletRow}>
        <span className={styles.walletLabel}>Seller</span>
        <span className={styles.walletValue} title={order.seller}>
          {shortAddress(order.seller)}
        </span>
      </div>

      <div className={styles.walletRow}>
        <span className={styles.walletLabel}>Price per share</span>
        <span className={styles.walletValue}>{stroopsToXlm(order.rate)} XLM</span>
      </div>

      <div className={styles.walletRow}>
        <span className={styles.walletLabel}>Available in this order</span>
        <span className={styles.walletValue}>
          {order.remaining.toString()} {DEMO_ASSET.symbol}
        </span>
      </div>

      <div className={styles.amountRow}>
        <span className={styles.walletLabel}>Shares to buy</span>
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

      {kyc.reason === 'kyc' ? (
        <>
          <Button
            variant='gradient'
            onClick={kyc.register}
            disabled={busy}
            loading={kyc.registering}
          >
            {kyc.registerLabel ?? 'Pass demo KYC (free)'}
          </Button>
          <p className={styles.kycNote}>
            The secondary market asks the same on-chain registry as the primary sale — one free
            transaction adds your address.
          </p>
          {kyc.error && <p className={styles.error}>{kyc.error}</p>}
        </>
      ) : kyc.reason ? (
        <p className={styles.kycNote}>{BLOCKED_MESSAGE[kyc.reason]}</p>
      ) : (
        <>
          <ConsentCheck
            checked={consent}
            onChange={setConsent}
            disabled={busy}
            text='By continuing, I agree with the terms of this trade'
          />
          <Button
            variant='gradient'
            onClick={submitBuy}
            loading={signing}
            disabled={busy || !consent || kyc.whitelisted === null || max === 0}
          >
            {txLabel}
            {!busy &&
              (kyc.whitelisted === null ? 'Checking KYC status…' : `Buy for ${totalCost} XLM`)}
          </Button>
        </>
      )}

      <p className={styles.note}>
        You pay the seller directly on-chain: the contract sends them the price minus the platform
        commission and hands you the shares in the same atomic transaction.
      </p>

      {buy.step === 'done' && (
        <div className={styles.success}>
          <p>
            You bought <b>{buy.meta}</b> share{buy.meta > 1 ? 's' : ''} from{' '}
            {shortAddress(order.seller)}.
          </p>
          <a href={`${EXPLORER}/tx/${buy.hash}`} target='_blank' rel='noreferrer'>
            View the transaction on stellar.expert ↗
          </a>
        </div>
      )}

      {buy.step === 'error' && <p className={styles.error}>{buy.message}</p>}
    </Modal>
  );
}
