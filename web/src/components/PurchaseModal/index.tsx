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
import { formatAmount, formatXlm } from '@/lib/format';
import { DEPLOYMENT, EXPLORER, FRIENDBOT_URL, type SaleState } from '@/lib/stellar';
import styles from './PurchaseModal.module.scss';

interface Props {
  sale: SaleState | null;
  onPurchased: () => void;
  onClose: () => void;
}

const TOTAL_SHARES = BigInt(DEPLOYMENT.asset.totalShares);

export function PurchaseModal({ sale, onPurchased, onClose }: Props) {
  const { status, address, xlmBalance, shareBalance, refreshBalances } = useWallet();
  const kyc = useKycGate(address);
  const { state: buy, busy: signing, label: txLabel, run } = useTxAction<number>();
  const [amount, setAmount] = useState(1);
  const [funding, setFunding] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [consent, setConsent] = useState(false);

  const busy = signing || kyc.registering;

  const fundWithFriendbot = useCallback(async () => {
    if (!address) return;
    setFunding('busy');
    try {
      const res = await fetch(`${FRIENDBOT_URL}/?addr=${encodeURIComponent(address)}`);
      if (!res.ok) throw new Error(`friendbot: HTTP ${res.status}`);
      setFunding('done');
      // Friendbot answers once it has submitted, and Horizon only knows the
      // account after that ledger closes and is ingested a few seconds later.
      // A single read here always comes back empty, so keep asking.
      for (let i = 0; i < 15; i++) {
        if (await refreshBalances()) return;
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch {
      setFunding('error');
    }
  }, [address, refreshBalances]);

  const costStroops = sale ? sale.priceStroops * BigInt(amount) : null;

  const submitBuy = useCallback(async () => {
    if (status !== 'connected' || !address || costStroops === null) return;
    const hash = await run(
      {
        contractId: DEPLOYMENT.contracts.assetSale,
        method: 'buy',
        args: [
          Address.fromString(address).toScVal(),
          nativeToScVal(BigInt(amount), { type: 'i128' }),
          // The quote on the button, sent as the ceiling the contract enforces:
          // a price raised before this lands aborts instead of charging more.
          nativeToScVal(costStroops, { type: 'i128' }),
        ],
        publicKey: address,
      },
      amount,
    );
    if (hash) onPurchased();
  }, [status, address, costStroops, amount, run, onPurchased]);

  const totalCost = costStroops !== null ? formatXlm(costStroops) : null;
  /**
   * The stepper cannot walk past what `buy` would actually accept. That is
   * `available_for_purchase`, not `remaining`: a sale switched off is holding
   * inventory it will not sell, and offering it here would let the user sign
   * for shares the contract then refuses.
   */
  const maxShares = sale ? Number(sale.forSale) : 1;
  const soldOut = sale !== null && sale.forSale === 0n;

  const owned = shareBalance ?? 0n;
  const ownershipPct =
    owned > 0n ? (Number((owned * 10_000n) / TOTAL_SHARES) / 100).toFixed(2) : null;
  const positionValue = sale && owned > 0n ? formatXlm(sale.priceStroops * owned) : null;

  return (
    <Modal label='Buy a fractional share' className={styles.modal} busy={busy} onClose={onClose}>
      <h2 className={styles.title}>Buy a fractional share</h2>
      <p className={styles.subtitle}>
        {DEMO_ASSET.name} · {DEMO_ASSET.symbol}
      </p>

      <div className={styles.walletRow}>
        <span className={styles.walletLabel}>XLM balance</span>
        <span className={styles.walletValue}>
          {xlmBalance !== null
            ? formatAmount(Number(xlmBalance).toFixed(2))
            : funding === 'idle' || funding === 'error'
              ? '— (fund via friendbot)'
              : 'Funding…'}
        </span>
      </div>

      <div className={styles.amountRow}>
        <span className={styles.walletLabel}>Shares</span>
        <div className={styles.stepper}>
          <button
            type='button'
            onClick={() => setAmount((a) => Math.max(1, a - 1))}
            disabled={busy || amount <= 1}
          >
            −
          </button>
          <span>{soldOut ? 0 : Math.min(amount, maxShares)}</span>
          <button
            type='button'
            onClick={() => setAmount((a) => Math.min(maxShares, a + 1))}
            disabled={busy || amount >= maxShares}
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
            This asset is KYC-gated on-chain: the share token asks the compliance registry on every
            movement, so an address it has not cleared cannot hold shares at all. One free
            transaction adds yours — in production a licensed KYC provider signs this instead.
          </p>
          {kyc.error && <p className={styles.error}>{kyc.error}</p>}
        </>
      ) : kyc.reason ? (
        // Suspended, or the whole asset halted. Neither is fixed by registering
        // again, so there is no button here to send the investor round a loop.
        <p className={styles.kycNote}>{BLOCKED_MESSAGE[kyc.reason]}</p>
      ) : (
        <>
          <ConsentCheck checked={consent} onChange={setConsent} disabled={busy} />
          <Button
            variant='gradient'
            onClick={submitBuy}
            loading={signing}
            disabled={
              busy || !consent || kyc.whitelisted === null || !sale || !sale.available || soldOut
            }
          >
            {txLabel}
            {!busy &&
              (kyc.whitelisted === null
                ? 'Checking KYC status…'
                : soldOut
                  ? 'Sold out — try the secondary market'
                  : totalCost
                    ? `Buy for ${totalCost} XLM`
                    : 'Loading…')}
          </Button>
        </>
      )}

      {buy.step === 'done' && (
        <div className={styles.success}>
          <p>
            You bought <b>{buy.meta}</b> share{buy.meta > 1 ? 's' : ''} of {DEMO_ASSET.symbol}.
          </p>
          <a href={`${EXPLORER}/tx/${buy.hash}`} target='_blank' rel='noreferrer'>
            View the transaction on stellar.expert ↗
          </a>
        </div>
      )}

      {buy.step === 'error' && <p className={styles.error}>{buy.message}</p>}

      {owned > 0n && (
        <div className={styles.position}>
          <h3 className={styles.positionTitle}>My position</h3>
          <div className={styles.positionRow}>
            <span>Shares owned</span>
            <b>
              {owned.toString()} {DEMO_ASSET.symbol}
            </b>
          </div>
          {ownershipPct && (
            <div className={styles.positionRow}>
              <span>Ownership</span>
              <b>{ownershipPct}%</b>
            </div>
          )}
          {positionValue && (
            <div className={styles.positionRow}>
              <span>Position value</span>
              <b>{positionValue} XLM</b>
            </div>
          )}
        </div>
      )}

      {xlmBalance === null && (
        <p className={styles.hint}>
          {funding === 'done' ? (
            'Account funded — 10,000 test XLM received. The balance updates in a moment.'
          ) : (
            <>
              Need test XLM?{' '}
              <button
                type='button'
                className={styles.hintAction}
                onClick={fundWithFriendbot}
                disabled={funding === 'busy'}
              >
                {funding === 'busy' ? 'Funding…' : 'Fund this account with friendbot (free)'}
              </button>
              {funding === 'error' && ' Friendbot did not respond — try again in a minute.'}
            </>
          )}
        </p>
      )}
    </Modal>
  );
}
