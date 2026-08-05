'use client';

import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { useCallback, useState } from 'react';
import { ImageGallery } from '@/components/ImageGallery';
import { InfoGrid, type InfoGridItem } from '@/components/InfoGrid';
import { Button } from '@/components/UI/Button';
import { DEMO_ASSET } from '@/config/asset';
import { formatXlm, stroopsToXlm, txErrorMessage } from '@/lib/format';
import { DEPLOYMENT, type Order } from '@/lib/stellar';
import { invokeContract, TX_PHASE_LABEL, type TxPhase } from '@/lib/tx';
import styles from './MyOrders.module.scss';

interface Props {
  address: string;
  /** The connected wallet's open orders (already filtered by the parent). */
  orders: Order[];
  /** Open the listing modal - the card's "Sell more" action. */
  onSellMore: () => void;
  /** Open the asset overview - the whole card body is clickable. */
  onOpenDetails: () => void;
  /** False when every share is already escrowed - nothing left to list. */
  canSellMore: boolean;
  /** Called after a successful cancel - the parent refreshes its data. */
  onChanged: () => void;
}

/** Open secondary-market orders as property cards, one per order. */
export function MyOrders({
  address,
  orders,
  onSellMore,
  onOpenDetails,
  canSellMore,
  onChanged,
}: Props) {
  const [cancelling, setCancelling] = useState<bigint | null>(null);
  /** Which wait the cancellation in flight is in, for its own button. */
  const [phase, setPhase] = useState<TxPhase>('preparing');
  /** Keyed by order id: one card failing must not paint an error on the rest. */
  const [errors, setErrors] = useState<Record<string, string>>({});

  const closeOrder = useCallback(
    async (order: Order) => {
      const key = order.id.toString();
      setCancelling(order.id);
      setPhase('preparing');
      setErrors((prev) => {
        const { [key]: _dropped, ...rest } = prev;
        return rest;
      });
      try {
        await invokeContract({
          contractId: DEPLOYMENT.contracts.exchange,
          method: 'close_order',
          args: [Address.fromString(address).toScVal(), nativeToScVal(order.id, { type: 'u64' })],
          publicKey: address,
          onPhase: setPhase,
        });
        onChanged();
      } catch (e) {
        setErrors((prev) => ({ ...prev, [key]: txErrorMessage(e) }));
      } finally {
        setCancelling(null);
      }
    },
    [address, onChanged],
  );

  return (
    <>
      {orders.map((order) => {
        const items: InfoGridItem[] = [
          {
            icon: 'calendar',
            title: 'Order placed',
            value: new Date(Number(order.created_at) * 1000).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            }),
          },
          {
            icon: 'coins',
            title: 'Order shares',
            value: (
              <>
                <span>{order.amount.toString()}</span> {DEMO_ASSET.symbol}
              </>
            ),
          },
          {
            icon: 'cash',
            title: 'Price for 1 share',
            value: (
              <>
                <span>{stroopsToXlm(order.rate)}</span> XLM
              </>
            ),
          },
          {
            icon: 'coins-swap',
            title: 'Available for purchase',
            value: (
              <>
                <span>{order.remaining.toString()}</span> {DEMO_ASSET.symbol}
              </>
            ),
          },
        ];

        return (
          <article key={order.id.toString()} className={styles.item}>
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
                />
                <span className={styles.orderBadge}>Order #{order.id.toString()}</span>
                <span className={styles.photoNote}>Illustrative photo</span>
              </div>

              <div className={styles.body}>
                <div className={styles.cost}>
                  <h2 className={styles.costTitle}>{DEMO_ASSET.name}</h2>
                  <div className={styles.costAmount}>
                    {formatXlm(order.rate * order.remaining)} XLM
                  </div>
                </div>
                <p className={styles.location}>
                  {DEMO_ASSET.location} ·{' '}
                  {order.remaining === order.amount
                    ? 'awaiting a buyer'
                    : `${(order.amount - order.remaining).toString()} of ${order.amount.toString()} sold`}
                </p>

                <InfoGrid items={items} />
              </div>
            </div>

            <div className={styles.actions}>
              <Button variant='secondary' onClick={onSellMore} disabled={!canSellMore}>
                Sell more
              </Button>
              <Button
                variant='red'
                onClick={() => closeOrder(order)}
                loading={cancelling === order.id}
                disabled={cancelling !== null}
              >
                {cancelling === order.id ? TX_PHASE_LABEL[phase] : 'Close order'}
              </Button>
              {errors[order.id.toString()] && (
                <p className={styles.error}>{errors[order.id.toString()]}</p>
              )}
            </div>
          </article>
        );
      })}
    </>
  );
}
