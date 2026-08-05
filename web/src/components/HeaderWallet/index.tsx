'use client';

import { useWallet } from '@/components/WalletProvider';
import { DEMO_ASSET } from '@/config/asset';
import { formatAmount, shortAddress } from '@/lib/format';
import styles from './HeaderWallet.module.scss';

export function HeaderWallet() {
  const {
    status,
    address,
    restoring,
    xlmBalance,
    shareBalance,
    openConnectModal,
    openAccountModal,
  } = useWallet();

  // Session restore in progress - hold a chip-shaped skeleton so the header
  // doesn't flash a Connect button and shift when the chip appears.
  if (restoring && status !== 'connected') {
    return <span className={`${styles.chip} ${styles.chipSkeleton}`} aria-hidden='true' />;
  }

  if (status === 'connected' && address) {
    return (
      <button
        type='button'
        className={styles.chip}
        title={address}
        onClick={openAccountModal}
        aria-label='Connected wallet — open account menu'
      >
        <span className={styles.balances}>
          <span className={styles.balance}>
            {xlmBalance === null ? '0' : formatAmount(Number(xlmBalance).toFixed(2))}
            <i>XLM</i>
          </span>
          {shareBalance !== null && shareBalance > 0n && (
            <span className={styles.balance}>
              {shareBalance.toString()}
              <i>{DEMO_ASSET.symbol}</i>
            </span>
          )}
        </span>
        <span className={styles.divider} />
        <span className={styles.address}>
          <span className={styles.dot} />
          {shortAddress(address)}
        </span>
      </button>
    );
  }

  return (
    <button type='button' className={styles.connect} onClick={openConnectModal}>
      {status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
    </button>
  );
}
