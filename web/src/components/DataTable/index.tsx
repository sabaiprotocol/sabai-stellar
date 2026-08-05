'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Icon } from '@/components/UI/Icon';
import { EXPLORER } from '@/lib/stellar';
import styles from './DataTable.module.scss';

export interface TableRow {
  key: string;
  cells: ReactNode[];
}

interface Props {
  headers: string[];
  /** grid-template-columns shared by the header and every row. */
  template: string;
  rows: TableRow[];
}

/** Grid table: a header strip above zebra rows, collapsing to labelled
 *  cells below 1300px. */
export function DataTable({ headers, template, rows }: Props) {
  return (
    <div className={styles.table} style={{ '--cols': template } as CSSProperties}>
      <ul className={styles.headers}>
        {headers.map((h) => (
          <li key={h} className={styles.headerItem}>
            {h}
          </li>
        ))}
      </ul>
      <ul className={styles.rows}>
        {rows.map((row) => (
          <li key={row.key} className={styles.row}>
            <ul className={styles.cells}>
              {row.cells.map((cell, i) => (
                <li key={headers[i]} className={styles.cell}>
                  <h3 className={styles.cellTitle}>{headers[i]}</h3>
                  <div className={styles.cellValue}>{cell}</div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Tone = 'green' | 'blue' | 'red' | 'orange' | 'gray';

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}

export function TxHash({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked - the explorer link still carries the hash */
    }
  }, [hash]);

  return (
    <span className={styles.hash}>
      <a
        className={styles.hashLink}
        href={`${EXPLORER}/tx/${hash}`}
        target='_blank'
        rel='noreferrer'
      >
        {hash.slice(0, 6)}…{hash.slice(-4)} ↗
      </a>
      <button
        type='button'
        className={`${styles.copy} ${copied ? styles.copied : ''}`}
        onClick={copy}
        aria-label='Copy transaction hash'
        title={copied ? 'Copied' : 'Copy hash'}
      >
        <Icon name='copy-file' />
      </button>
    </span>
  );
}
