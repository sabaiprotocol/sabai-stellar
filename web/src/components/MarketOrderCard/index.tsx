'use client';

import { ImageGallery } from '@/components/ImageGallery';
import { Button } from '@/components/UI/Button';
import { DEMO_ASSET } from '@/config/asset';
import { formatXlm, shortAddress, stroopsToXlm } from '@/lib/format';
import type { Order } from '@/lib/stellar';
import styles from './MarketOrderCard.module.scss';

/** Order-book rows shown before the "+N more orders" line. */
const VISIBLE_ROWS = 3;

interface Props {
  /** Other holders' open orders, cheapest first (the parent sorts). */
  orders: Order[];
  /** Live primary price from asset-sale; null while it loads. */
  primaryPriceStroops: bigint | null;
  /** Buy now targets the cheapest open order. */
  onBuy: (order: Order) => void;
  onSell: () => void;
  canSell: boolean;
  /** Open the asset overview - the whole card body is clickable. */
  onOpenDetails: () => void;
}

/** The asset as one marketplace card with its order book inside: one card
 *  per property, not per order. */
export function MarketOrderCard({
  orders,
  primaryPriceStroops,
  onBuy,
  onSell,
  canSell,
  onOpenDetails,
}: Props) {
  const best = orders[0];
  const available = orders.reduce((sum, o) => sum + o.remaining, 0n);
  const bookValue = orders.reduce((sum, o) => sum + o.rate * o.remaining, 0n);

  return (
    <article className={styles.item}>
      {/* biome-ignore lint/a11y/useSemanticElements: a <button> wrapper would nest the gallery's arrow/dot buttons — invalid HTML that breaks hydration */}
      <div
        role='button'
        tabIndex={0}
        className={styles.link}
        onClick={onOpenDetails}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenDetails();
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
        </div>

        <div className={styles.body}>
          <div className={styles.cost}>
            <h2 className={styles.costTitle}>{DEMO_ASSET.name}</h2>
            <div className={styles.costAmount}>{formatXlm(bookValue)} XLM on offer</div>
          </div>
          <p className={styles.location}>{DEMO_ASSET.location}</p>

          <div className={styles.priceBlock}>
            <div className={styles.priceItem}>
              <span className={styles.priceTitle}>Best price</span>
              <span className={styles.priceValue}>
                {best ? `${stroopsToXlm(best.rate)} XLM` : '—'}
              </span>
            </div>
            <div className={styles.priceItem}>
              <span className={styles.priceTitle}>Primary price</span>
              <span className={styles.priceValue}>
                {primaryPriceStroops === null ? '…' : `${stroopsToXlm(primaryPriceStroops)} XLM`}
              </span>
            </div>
          </div>

          <div className={styles.book}>
            <div className={styles.bookSummary}>
              <span>
                {orders.length} order{orders.length === 1 ? '' : 's'}
              </span>
              <span>
                {available.toString()} {DEMO_ASSET.symbol} available
              </span>
            </div>
            <ul className={styles.bookList}>
              {orders.slice(0, VISIBLE_ROWS).map((o) => (
                <li key={o.id.toString()} className={styles.bookRow}>
                  <b>{stroopsToXlm(o.rate)} XLM</b>
                  <span>× {o.remaining.toString()}</span>
                  <span className={styles.bookSeller} title={o.seller}>
                    {shortAddress(o.seller)}
                  </span>
                </li>
              ))}
            </ul>
            {orders.length > VISIBLE_ROWS && (
              <span className={styles.bookMore}>+{orders.length - VISIBLE_ROWS} more orders</span>
            )}
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Button variant='gradient' onClick={() => best && onBuy(best)} disabled={!best}>
          Buy now
        </Button>
        <Button variant='secondary' onClick={onSell} disabled={!canSell}>
          Sell now
        </Button>
      </div>
    </article>
  );
}
