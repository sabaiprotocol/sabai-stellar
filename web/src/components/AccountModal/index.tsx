'use client';

import { useCallback, useState } from 'react';
import { Icon } from '@/components/UI/Icon';
import { Modal } from '@/components/UI/Modal';
import { Spinner } from '@/components/UI/Spinner';
import { DEMO_ASSET } from '@/config/asset';
import { formatAmount } from '@/lib/format';
import { EXPLORER } from '@/lib/stellar';
import styles from './AccountModal.module.scss';

interface Props {
  address: string;
  xlmBalance: string | null;
  shareBalance: bigint | null;
  error: string | null;
  onSwitch: () => Promise<void>;
  onDisconnect: () => void;
  onClose: () => void;
}

/** Account sheet behind the header chip: address, balances, copy, explorer,
 *  switch and disconnect. Freighter itself offers no such screen. */
export function AccountModal({
  address,
  xlmBalance,
  shareBalance,
  error,
  onSwitch,
  onDisconnect,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [switching, setSwitching] = useState(false);

  const copyAddress = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked - the address is selectable in the plate above */
    }
  }, [address]);

  const switchWallet = useCallback(async () => {
    setSwitching(true);
    try {
      await onSwitch();
    } finally {
      setSwitching(false);
    }
  }, [onSwitch]);

  return (
    <Modal label='Connected wallet' className={styles.modal} onClose={onClose}>
      <h2 className={styles.title}>Connected wallet</h2>
      <p className={styles.subtitle}>Freighter · Stellar testnet</p>

      <div className={styles.identity}>
        <span className={styles.avatar}>
          {address.slice(1, 3)}
          <span className={styles.statusDot} />
        </span>
        <span className={styles.identityBody}>
          <span className={styles.identityLabel}>Address</span>
          <span className={styles.identityAddress}>{address}</span>
        </span>
      </div>

      <div className={styles.walletRow}>
        <span className={styles.walletLabel}>XLM balance</span>
        <span className={styles.walletValue}>
          {xlmBalance === null ? '—' : formatAmount(Number(xlmBalance).toFixed(2))}
        </span>
      </div>
      <div className={styles.walletRow}>
        <span className={styles.walletLabel}>{DEMO_ASSET.symbol} shares</span>
        <span className={styles.walletValue}>
          {shareBalance === null ? '—' : shareBalance.toString()}
        </span>
      </div>

      <div className={styles.menu}>
        <button type='button' className={styles.menuItem} onClick={copyAddress}>
          <Icon name='copy-file' />
          Copy address
          {copied && <span className={styles.menuHint}>Copied</span>}
        </button>

        <a
          className={styles.menuItem}
          href={`${EXPLORER}/account/${address}`}
          target='_blank'
          rel='noreferrer'
        >
          <Icon name='market' />
          View on stellar.expert ↗
        </a>

        <button
          type='button'
          className={styles.menuItem}
          onClick={switchWallet}
          disabled={switching}
          aria-busy={switching || undefined}
        >
          {/* No ledger involved here, so this one really is only waiting on the
              wallet - there is no settling phase to report after it. */}
          {switching ? <Spinner /> : <Icon name='wallet' />}
          {switching ? 'Confirm in Freighter…' : 'Switch wallet'}
          <span className={styles.menuHint}>Freighter prompt</span>
        </button>

        <button
          type='button'
          className={`${styles.menuItem} ${styles.menuDanger}`}
          onClick={onDisconnect}
        >
          <Icon name='power-disconnect' />
          Disconnect
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <p className={styles.note}>
        Disconnecting only clears the session in this browser — Freighter keeps the site approved,
        so reconnecting takes one click. To revoke that approval, remove the site in Freighter →
        Settings → Connected apps.
      </p>
    </Modal>
  );
}
