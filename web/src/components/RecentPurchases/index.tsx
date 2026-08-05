'use client';

import { useEffect, useState } from 'react';
import { fetchRecentBuys, type RecentBuy } from '@/lib/events';
import { formatXlm, shortAddress } from '@/lib/format';
import { EXPLORER } from '@/lib/stellar';
import styles from './RecentPurchases.module.scss';

const REFRESH_MS = 30_000;

/** Live Buy events read straight from Soroban RPC - proof that every number
 *  on this page is on-chain, not a backend mock. */
export function RecentPurchases() {
  const [buys, setBuys] = useState<RecentBuy[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchRecentBuys()
        .then((b) => !cancelled && setBuys(b))
        .catch(() => !cancelled && setBuys((prev) => prev ?? []));
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (buys === null || buys.length === 0) return null;

  return (
    <section className={styles.feed} aria-label='Recent on-chain purchases'>
      <h3 className={styles.title}>
        Recent purchases <span className={styles.live}>● live from Soroban RPC</span>
      </h3>
      <ul className={styles.list}>
        {buys.map((b) => (
          <li key={b.txHash} className={styles.row}>
            <span className={styles.buyer} title={b.buyer}>
              {shortAddress(b.buyer)}
            </span>
            <span className={styles.amount}>+{b.amount.toString()} SLR1</span>
            <span className={styles.cost}>{formatXlm(b.cost)} XLM</span>
            <span className={styles.time}>
              {new Date(b.closedAt).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <a
              className={styles.link}
              href={`${EXPLORER}/tx/${b.txHash}`}
              target='_blank'
              rel='noreferrer'
            >
              tx ↗
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
