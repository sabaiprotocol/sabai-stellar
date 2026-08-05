'use client';

import { useState } from 'react';
import { AssetDetailsModal } from '@/components/AssetDetailsModal';
import { ImageGallery } from '@/components/ImageGallery';
import { PropertySpecs } from '@/components/PropertySpecs';
import { PurchaseModal } from '@/components/PurchaseModal';
import { Button } from '@/components/UI/Button';
import { useWallet } from '@/components/WalletProvider';
import { DEMO_ASSET } from '@/config/asset';
import { formatXlm } from '@/lib/format';
import { DEPLOYMENT, type SaleState } from '@/lib/stellar';
import styles from './AssetCard.module.scss';

interface Props {
  sale: SaleState | null;
  onPurchased: () => void;
}

export function AssetCard({ sale, onPurchased }: Props) {
  const { status, openConnectModal } = useWallet();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  const total = BigInt(DEPLOYMENT.asset.totalShares);
  const held = sale ? total - sale.remaining : 0n;
  const soldPct = sale ? Number((held * 100n) / total) : 0;
  const totalValueXlm = sale ? formatXlm(sale.priceStroops * total) : null;

  // Without a wallet the CTA opens the connect modal; connected users get
  // the purchase modal right away.
  const onBuyClick = () => {
    if (status !== 'connected') {
      openConnectModal();
      return;
    }
    setBuyOpen(true);
  };

  return (
    <article className={styles.item}>
      {/* biome-ignore lint/a11y/useSemanticElements: a <button> wrapper would nest the gallery's arrow/dot buttons — invalid HTML that breaks hydration */}
      <div
        role='button'
        tabIndex={0}
        className={styles.link}
        onClick={() => setDetailsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setDetailsOpen(true);
          }
        }}
        aria-label={`Detailed information about ${DEMO_ASSET.name}`}
      >
        <div className={styles.imageWrap}>
          <ImageGallery
            images={DEMO_ASSET.images}
            alt={`${DEMO_ASSET.name} — illustrative photo`}
            priority
          />
          <span className={styles.photoNote}>Illustrative photo · fictional demo asset</span>
          {sale && !sale.available && <span className={styles.paused}>Sale paused</span>}
        </div>

        <div className={styles.body}>
          <div className={styles.cost}>
            <h1 className={styles.costTitle}>{DEMO_ASSET.name}</h1>
            {totalValueXlm ? (
              <div className={styles.costAmount}>{totalValueXlm} XLM</div>
            ) : (
              <span className={`${styles.skeleton} ${styles.skeletonAmount}`} />
            )}
          </div>
          <p className={styles.location}>{DEMO_ASSET.location}</p>

          <PropertySpecs />

          <div className={styles.statsBlock}>
            <div className={styles.statsItem}>
              <h4 className={styles.statsTitle}>Share price</h4>
              <div className={`${styles.statsValue} ${styles.statsPrice}`}>
                {sale ? (
                  <b>{formatXlm(sale.priceStroops)} XLM</b>
                ) : (
                  <span className={`${styles.skeleton} ${styles.skeletonStat}`} />
                )}
              </div>
            </div>
            <div className={styles.statsItem}>
              <h4 className={styles.statsTitle}>Shares available</h4>
              <div className={`${styles.statsValue} ${styles.statsYield}`}>
                {sale ? (
                  <b>
                    {sale.remaining.toString()} / {total.toString()}
                  </b>
                ) : (
                  <span className={`${styles.skeleton} ${styles.skeletonStat}`} />
                )}
              </div>
            </div>
          </div>

          <div className={styles.progressBlock}>
            <div className={styles.progressLabels}>
              {sale ? (
                <>
                  <span>
                    Held by investors: <b>{held.toString()}</b>
                  </span>
                  <span>{soldPct}%</span>
                </>
              ) : (
                <span className={`${styles.skeleton} ${styles.skeletonLabel}`} />
              )}
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${soldPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Button variant='gradient' onClick={onBuyClick} disabled={sale !== null && !sale.available}>
          Buy share
        </Button>
        <Button variant='secondary' onClick={() => setDetailsOpen(true)}>
          Asset overview
        </Button>
      </div>

      {detailsOpen && <AssetDetailsModal sale={sale} onClose={() => setDetailsOpen(false)} />}
      {buyOpen && (
        <PurchaseModal sale={sale} onPurchased={onPurchased} onClose={() => setBuyOpen(false)} />
      )}
    </article>
  );
}
