'use client';

import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import { useCallback, useEffect, useState } from 'react';
import { BuyOrderModal } from '@/components/BuyOrderModal';
import { Badge, DataTable, type TableRow } from '@/components/DataTable';
import { Spinner } from '@/components/UI/Spinner';
import { useWallet } from '@/components/WalletProvider';
import { DEMO_ASSET } from '@/config/asset';
import { formatXlm, shortAddress, stroopsToXlm, txErrorMessage } from '@/lib/format';
import { DEPLOYMENT, fetchOrders, type Order } from '@/lib/stellar';
import { invokeContract, TX_PHASE_LABEL, type TxPhase } from '@/lib/tx';
import styles from './OrderBook.module.scss';

const REFRESH_MS = 30_000;

const HEADERS = ['Seller', 'Shares', 'Price per share', 'Order total', 'Status', 'Placed', ''];
const TEMPLATE =
  'minmax(120px, 1fr) minmax(110px, 1fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(110px, 0.8fr) minmax(120px, 1fr) minmax(110px, 0.8fr)';

interface Props {
  /** Change this to force an immediate reload (e.g. after listing shares). */
  reloadKey?: number;
  /** Let the page refresh its own copy of the book after a buy or cancel. */
  onChanged?: () => void;
}

/** The full on-chain order book as a table: other holders' orders get Buy,
 *  your own get Cancel. */
export function OrderBook({ reloadKey = 0, onChanged }: Props) {
  const { status, address, refreshBalances, openConnectModal } = useWallet();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [buying, setBuying] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState<bigint | null>(null);
  /** Which wait the cancellation in flight is in, for its own row. */
  const [phase, setPhase] = useState<TxPhase>('preparing');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchOrders()
      .then((o) => setOrders(o))
      .catch(() => setOrders((prev) => prev ?? []));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh, reloadKey]);

  const onBought = useCallback(() => {
    refresh();
    refreshBalances();
    onChanged?.();
  }, [refresh, refreshBalances, onChanged]);

  const cancelOrder = useCallback(
    async (order: Order) => {
      if (!address) return;
      setCancelling(order.id);
      setPhase('preparing');
      setError(null);
      try {
        await invokeContract({
          contractId: DEPLOYMENT.contracts.exchange,
          method: 'close_order',
          args: [Address.fromString(address).toScVal(), nativeToScVal(order.id, { type: 'u64' })],
          publicKey: address,
          onPhase: setPhase,
        });
        refresh();
        refreshBalances();
        onChanged?.();
      } catch (e) {
        setError(txErrorMessage(e));
      } finally {
        setCancelling(null);
      }
    },
    [address, refresh, refreshBalances, onChanged],
  );

  if (orders === null) return null;

  const rows: TableRow[] = orders.map((o) => {
    const own = address !== null && o.seller === address;
    const partial = o.remaining !== o.amount;
    return {
      key: o.id.toString(),
      cells: [
        own ? (
          <Badge key='seller' tone='blue'>
            Your order
          </Badge>
        ) : (
          <span key='seller' title={o.seller}>
            {shortAddress(o.seller)}
          </span>
        ),
        `${o.remaining} of ${o.amount} ${DEMO_ASSET.symbol}`,
        `${stroopsToXlm(o.rate)} XLM`,
        `${formatXlm(o.rate * o.remaining)} XLM`,
        <Badge key='status' tone={partial ? 'orange' : 'green'}>
          {partial ? 'Partially filled' : 'Open'}
        </Badge>,
        <time key='placed'>
          {new Date(Number(o.created_at) * 1000).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </time>,
        own ? (
          <button
            key='action'
            type='button'
            className={`${styles.action} ${styles.actionSecondary}`}
            onClick={() => cancelOrder(o)}
            disabled={cancelling !== null}
            aria-busy={cancelling === o.id || undefined}
          >
            {cancelling === o.id && <Spinner />}
            {cancelling === o.id ? TX_PHASE_LABEL[phase] : 'Cancel'}
          </button>
        ) : (
          <button
            key='action'
            type='button'
            className={styles.action}
            onClick={() => (status === 'connected' ? setBuying(o) : openConnectModal())}
          >
            Buy
          </button>
        ),
      ],
    };
  });

  return (
    <section className={styles.book} aria-label='Secondary market order book'>
      <h3 className={styles.title}>
        Open orders <span className={styles.live}>● live from the exchange contract</span>
      </h3>

      {orders.length === 0 ? (
        <p className={styles.empty}>
          No open orders right now. Any holder can list shares at their own price — the order shows
          up here for anyone to buy, fully or partially.
        </p>
      ) : (
        <DataTable headers={HEADERS} template={TEMPLATE} rows={rows} />
      )}

      {error && <p className={styles.error}>{error}</p>}

      {buying && (
        <BuyOrderModal order={buying} onBought={onBought} onClose={() => setBuying(null)} />
      )}
    </section>
  );
}
