'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AssetDetailsModal } from '@/components/AssetDetailsModal';
import { BuyOrderModal } from '@/components/BuyOrderModal';
import { ListSharesModal } from '@/components/ListSharesModal';
import { MarketOrderCard } from '@/components/MarketOrderCard';
import { OrderBook } from '@/components/OrderBook';
import { Button } from '@/components/UI/Button';
import { useWallet } from '@/components/WalletProvider';
import { DEMO_ASSET } from '@/config/asset';
import { stroopsToXlm } from '@/lib/format';
import {
  type ExchangeConfig,
  fetchExchangeConfig,
  fetchOrders,
  fetchSaleState,
  type Order,
  type SaleState,
} from '@/lib/stellar';
import styles from './SecondaryMarketView.module.scss';

const REFRESH_MS = 30_000;

/** P2P marketplace page:
 *  a card per asset with its order book inside, the full book below, and the
 *  contract-enforced trading rules last. Your own orders are excluded from
 *  the card (they live in the portfolio's My orders tab). */
export function SecondaryMarketView() {
  const { status, address, shareBalance, openConnectModal, refreshBalances } = useWallet();
  const [config, setConfig] = useState<ExchangeConfig | null>(null);
  /** null = loading. */
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [buying, setBuying] = useState<Order | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  /** Live sale state: the details modal, and the primary price shown next to
   *  the best market bid so the two are always the same number. */
  const [sale, setSale] = useState<SaleState | null>(null);
  /** Bumped after any write so the book below reloads immediately. */
  const [reload, setReload] = useState(0);
  const router = useRouter();

  const refresh = useCallback(() => {
    fetchOrders()
      .then(setOrders)
      .catch(() => setOrders((prev) => prev ?? []));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    fetchExchangeConfig()
      .then((c) => !cancelled && setConfig(c))
      .catch(() => {});
    fetchSaleState()
      .then((s) => !cancelled && setSale(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const onChanged = useCallback(() => {
    refresh();
    setReload((n) => n + 1);
    refreshBalances();
  }, [refresh, refreshBalances]);

  const owned = shareBalance ?? 0n;
  const connected = status === 'connected';
  const others = (orders ?? [])
    .filter((o) => o.seller !== address)
    .sort((a, b) => (a.rate === b.rate ? Number(a.id - b.id) : Number(a.rate - b.rate)));
  const mine = (orders ?? []).filter((o) => o.seller === address);

  return (
    <main className={styles.layout}>
      <div className={styles.items}>
        {orders === null ? (
          <div className={styles.cardSkeleton} aria-hidden='true' />
        ) : others.length > 0 ? (
          <MarketOrderCard
            orders={others}
            primaryPriceStroops={sale?.priceStroops ?? null}
            onBuy={(o) => (connected ? setBuying(o) : openConnectModal())}
            onSell={() => (connected ? setListOpen(true) : openConnectModal())}
            canSell={!connected || owned > 0n}
            onOpenDetails={() => setDetailsOpen(true)}
          />
        ) : (
          <div className={styles.emptyCard}>
            <h2 className={styles.emptyTitle}>No open orders right now</h2>
            <p className={styles.emptyText}>
              Nobody is reselling {DEMO_ASSET.symbol} at the moment. Buy from the primary sale, or
              list your own shares and become the first seller here.
            </p>
            {connected && owned > 0n ? (
              <Button variant='gradient' onClick={() => setListOpen(true)}>
                List shares for sale
              </Button>
            ) : (
              <Button variant='gradient' onClick={() => router.push('/')}>
                Go to asset market
              </Button>
            )}
          </div>
        )}
      </div>

      {mine.length > 0 && (
        <p className={styles.mineNote}>
          You have {mine.length} open order{mine.length === 1 ? '' : 's'} of your own — manage{' '}
          {mine.length === 1 ? 'it' : 'them'} in{' '}
          <button
            type='button'
            className={styles.linkButton}
            onClick={() => router.push('/portfolio')}
          >
            My portfolio → My orders
          </button>
        </p>
      )}

      <OrderBook reloadKey={reload} onChanged={onChanged} />

      <section className={styles.rules}>
        <h3 className={styles.rulesTitle}>Market rules · enforced by the exchange contract</h3>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Platform commission</span>
            <span className={styles.statValue}>
              {config ? `${config.commissionBps / 100}%` : '…'}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Allowed price band</span>
            <span className={styles.statValue}>
              {config
                ? `${stroopsToXlm(config.minRateStroops)}–${stroopsToXlm(config.maxRateStroops)} XLM`
                : '…'}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Trading status</span>
            <span className={styles.statValue}>
              {config ? (config.available ? 'Open' : 'Paused') : '…'}
            </span>
          </div>
        </div>
        <p className={styles.rulesText}>
          Listed shares sit in on-chain escrow until someone buys them or the seller cancels. Buyers
          pay the seller directly, partial fills are allowed, and the commission is deducted in the
          same atomic transaction. Both sides must have passed the demo KYC.
        </p>
      </section>

      {listOpen && (
        <ListSharesModal owned={owned} onListed={onChanged} onClose={() => setListOpen(false)} />
      )}
      {buying && (
        <BuyOrderModal order={buying} onBought={onChanged} onClose={() => setBuying(null)} />
      )}
      {detailsOpen && <AssetDetailsModal sale={sale} onClose={() => setDetailsOpen(false)} />}
    </main>
  );
}
