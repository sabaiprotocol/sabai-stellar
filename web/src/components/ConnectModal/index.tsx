'use client';

import { Button } from '@/components/UI/Button';
import { Modal } from '@/components/UI/Modal';
import type { WalletStatus } from '@/components/WalletProvider';
import styles from './ConnectModal.module.scss';

const FREIGHTER_URL = 'https://www.freighter.app/';

interface Props {
  installed: boolean | null;
  status: WalletStatus;
  network: string | null;
  error: string | null;
  onConnect: () => void;
  onClose: () => void;
}

/** Wallet picker, scoped to the one wallet this dApp supports. */
export function ConnectModal({ installed, status, network, error, onConnect, onClose }: Props) {
  return (
    <Modal
      label='Connect a wallet'
      width={400}
      className={styles.modal}
      hideClose
      closeWhen={status === 'connected'}
      onClose={onClose}
    >
      {(close) => (
        <>
          <div className={styles.head}>
            <h2 className={styles.title}>Connect a wallet</h2>
            <button type='button' className={styles.close} onClick={close} aria-label='Close'>
              ✕
            </button>
          </div>

          <div className={styles.wallet}>
            <div className={styles.walletInfo}>
              <span className={styles.walletIcon}>
                <svg width='22' height='22' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                  <rect
                    x='2'
                    y='5'
                    width='20'
                    height='15'
                    rx='3'
                    stroke='currentColor'
                    strokeWidth='2'
                  />
                  <path d='M2 9h20' stroke='currentColor' strokeWidth='2' />
                  <circle cx='17' cy='14.5' r='1.5' fill='currentColor' />
                </svg>
              </span>
              <div>
                <div className={styles.walletName}>Freighter</div>
                <div className={styles.walletMeta}>
                  {installed === null && 'Checking extension…'}
                  {installed === false && 'Extension not detected'}
                  {installed === true && 'Browser extension'}
                </div>
              </div>
            </div>

            {installed === null && (
              <span className={styles.actionLoading} aria-label='Checking extension'>
                <span className={styles.spinner} />
              </span>
            )}
            {installed === true && (
              <Button
                variant='gradient'
                className={styles.walletAction}
                onClick={onConnect}
                disabled={status === 'connecting'}
              >
                {status === 'connecting' ? 'Connecting…' : 'Connect'}
              </Button>
            )}
            {installed === false && (
              <a
                className={styles.installLink}
                href={FREIGHTER_URL}
                target='_blank'
                rel='noreferrer'
              >
                Install ↗
              </a>
            )}
          </div>

          {installed === false && (
            <p className={styles.note}>
              After installing the extension, refresh this page and connect again.
            </p>
          )}
          {status === 'wrong-network' && (
            <p className={styles.warning}>
              Freighter is on <b>{network}</b>. Open the extension, switch the network to{' '}
              <b>Testnet</b> and press Connect again.
            </p>
          )}
          {error && <p className={styles.error}>{error}</p>}

          <p className={styles.footnote}>
            Testnet only — transactions cost nothing. After connecting you can top up free test XLM
            in one click from the purchase window.
          </p>
        </>
      )}
    </Modal>
  );
}
