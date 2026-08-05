'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, DataTable, type TableRow, TxHash } from '@/components/DataTable';
import { TabsNav } from '@/components/TabsNav';
import { Button } from '@/components/UI/Button';
import { useWallet } from '@/components/WalletProvider';
import { DEMO_ASSET } from '@/config/asset';
import { type ActivityRecord, fetchActivity } from '@/lib/events';
import { formatXlm, shortAddress, stroopsToXlm } from '@/lib/format';
import { EXPLORER } from '@/lib/stellar';
import styles from './TransactionsView.module.scss';

type TabValue = 'buy' | 'sell' | 'claim' | 'orders';

const TABS: { label: string; value: TabValue }[] = [
  { label: 'Purchases', value: 'buy' },
  { label: 'Sells', value: 'sell' },
  { label: 'Claims', value: 'claim' },
  { label: 'Orders', value: 'orders' },
];

const EMPTY_TEXT: Record<TabValue, string> = {
  buy: 'Purchases made by this wallet will appear here — read from the contracts’ own events.',
  sell: 'Shares sold back to the buyback pool or to another holder will appear here.',
  claim: 'Reward claims will appear here once you press Claim in your portfolio.',
  orders:
    'Secondary-market orders you place or cancel will appear here — list your shares from the portfolio page.',
};

/* One column set per tab, with the grid template the header and rows share. */
const COLUMNS: Record<TabValue, { headers: string[]; template: string }> = {
  buy: {
    headers: ['Source', 'Shares', 'Price per share', 'Total paid', 'Hash', 'Date'],
    template:
      'minmax(120px, 1fr) minmax(90px, 0.7fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(140px, 1fr) minmax(140px, 1fr)',
  },
  sell: {
    headers: ['Route', 'Shares', 'Price per share', 'Total received', 'Hash', 'Date'],
    template:
      'minmax(120px, 1fr) minmax(90px, 0.7fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(140px, 1fr) minmax(140px, 1fr)',
  },
  claim: {
    headers: ['Type', 'Amount', 'Hash', 'Date'],
    template: 'minmax(140px, 1fr) minmax(120px, 1fr) minmax(140px, 1fr) minmax(140px, 1fr)',
  },
  orders: {
    headers: ['Action', 'Shares', 'Price per share', 'Order total', 'Status', 'Hash', 'Date'],
    template:
      'minmax(120px, 1fr) minmax(90px, 0.7fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(110px, 0.8fr) minmax(140px, 1fr) minmax(140px, 1fr)',
  },
};

function tabOf(r: ActivityRecord): TabValue {
  switch (r.kind) {
    case 'buy':
    case 'p2p-buy':
      return 'buy';
    case 'sell':
    case 'p2p-sell':
      return 'sell';
    case 'claim':
      return 'claim';
    default:
      return 'orders';
  }
}

/** Rows the summary strip should not count as shares changing hands. */
function isListing(kind: ActivityRecord['kind']): boolean {
  return kind === 'list' || kind === 'list-closed';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Price per share, derived from the amounts the event carries. */
function unitPrice(r: ActivityRecord): string {
  if (r.amount === 0n) return '—';
  return `${stroopsToXlm(r.stroops / r.amount)} XLM`;
}

function rowFor(r: ActivityRecord, tab: TabValue): TableRow {
  const hash = <TxHash hash={r.txHash} />;
  const date = <time>{formatDate(r.closedAt)}</time>;
  const shares = `${r.amount} ${DEMO_ASSET.symbol}`;
  const key = `${r.txHash}-${r.kind}`;

  if (tab === 'buy') {
    const p2p = r.kind === 'p2p-buy';
    return {
      key,
      cells: [
        <Badge key='src' tone={p2p ? 'blue' : 'green'}>
          {p2p ? 'Secondary' : 'Primary sale'}
        </Badge>,
        shares,
        unitPrice(r),
        <span key='total' className={styles.out}>
          −{formatXlm(r.stroops)} XLM
        </span>,
        hash,
        date,
      ],
    };
  }

  if (tab === 'sell') {
    const p2p = r.kind === 'p2p-sell';
    return {
      key,
      cells: [
        <Badge key='route' tone={p2p ? 'blue' : 'orange'}>
          {p2p ? 'P2P order' : 'Buyback pool'}
        </Badge>,
        shares,
        unitPrice(r),
        <span key='total' className={styles.in}>
          +{formatXlm(r.stroops)} XLM
        </span>,
        hash,
        date,
      ],
    };
  }

  if (tab === 'claim') {
    return {
      key,
      cells: [
        <Badge key='type' tone='green'>
          Rewards
        </Badge>,
        <span key='amount' className={styles.in}>
          +{formatXlm(r.stroops)} XLM
        </span>,
        hash,
        date,
      ],
    };
  }

  const listed = r.kind === 'list' || r.kind === 'list-closed';
  // "Open" only when no later fill or cancellation for this order id turned up
  // in the same window; otherwise every past listing would read as open.
  const open = r.kind === 'list';
  return {
    key,
    cells: [
      <Badge key='action' tone={listed ? 'blue' : 'gray'}>
        {listed ? 'Listed' : 'Cancelled'}
      </Badge>,
      listed ? shares : '—',
      listed ? unitPrice(r) : '—',
      listed ? `${formatXlm(r.stroops)} XLM` : '—',
      <Badge key='status' tone={open ? 'orange' : 'gray'}>
        {open ? 'Open' : 'Closed'}
      </Badge>,
      hash,
      date,
    ],
  };
}

/** Per-tab summary strip. */
function summaryFor(tab: TabValue, rows: ActivityRecord[]) {
  const shares = rows.reduce((sum, r) => sum + r.amount, 0n);
  const value = rows.reduce((sum, r) => sum + r.stroops, 0n);
  switch (tab) {
    case 'buy':
      return [
        { label: 'Purchases', value: String(rows.length) },
        { label: 'Shares bought', value: shares.toString() },
        { label: 'Total spent', value: `${formatXlm(value)} XLM` },
      ];
    case 'sell':
      return [
        { label: 'Sells', value: String(rows.length) },
        { label: 'Shares sold', value: shares.toString() },
        { label: 'Total received', value: `${formatXlm(value)} XLM` },
      ];
    case 'claim':
      return [
        { label: 'Claims', value: String(rows.length) },
        { label: 'Rewards received', value: `${formatXlm(value)} XLM` },
      ];
    default:
      return [
        { label: 'Order events', value: String(rows.length) },
        {
          label: 'Shares listed',
          value: rows
            .filter((r) => isListing(r.kind))
            .reduce((sum, r) => sum + r.amount, 0n)
            .toString(),
        },
      ];
  }
}

export function TransactionsView() {
  const { status, address, restoring, openConnectModal } = useWallet();
  /** null = not loaded yet. */
  const [records, setRecords] = useState<ActivityRecord[] | null>(null);
  const [tab, setTab] = useState<TabValue>('buy');

  const load = useCallback(() => {
    if (!address) return;
    fetchActivity(address)
      .then(setRecords)
      .catch(() => setRecords((prev) => prev ?? []));
  }, [address]);

  useEffect(load, [load]);

  if (status !== 'connected' || !address) {
    return (
      <main className={styles.layout}>
        <div className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>Transactions</h2>
          <p className={styles.emptyText}>
            Connect your Freighter wallet to read its on-chain activity straight from the Soroban
            contracts.
          </p>
          <Button variant='gradient' onClick={openConnectModal} disabled={restoring}>
            {restoring ? 'Restoring session…' : 'Connect wallet'}
          </Button>
        </div>
      </main>
    );
  }

  const filtered = (records ?? []).filter((r) => tabOf(r) === tab);
  const { headers, template } = COLUMNS[tab];

  return (
    <main className={styles.layout}>
      <section className={styles.card}>
        <div className={styles.head}>
          <h2 className={styles.title}>Transaction history</h2>
          <p className={styles.syncNote}>
            Read from contract events via Soroban RPC — the last ~24h only, because this demo runs
            with no indexer behind it · wallet{' '}
            <a href={`${EXPLORER}/account/${address}`} target='_blank' rel='noreferrer'>
              {shortAddress(address)} ↗
            </a>
          </p>
        </div>

        <TabsNav tabs={TABS} activeValue={tab} onTabClick={setTab} />

        <div className={styles.summary}>
          {summaryFor(tab, filtered).map((s) => (
            <div key={s.label} className={styles.stat}>
              <span className={styles.statLabel}>{s.label}</span>
              <span className={styles.statValue}>{s.value}</span>
            </div>
          ))}
        </div>

        {records === null ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>Reading contract events from Soroban RPC…</p>
          </div>
        ) : filtered.length > 0 ? (
          <DataTable
            headers={headers}
            template={template}
            rows={filtered.map((r) => rowFor(r, tab))}
          />
        ) : (
          <div className={styles.empty}>
            <h3 className={styles.emptyTitle}>Nothing here yet</h3>
            <p className={styles.emptyText}>{EMPTY_TEXT[tab]}</p>
          </div>
        )}
      </section>
    </main>
  );
}
