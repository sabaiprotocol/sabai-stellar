import styles from './AllocationDonut.module.scss';

interface Props {
  /** Total issued for this asset - the denominator, fixed at deployment. */
  total: bigint;
  /** Shares still held by the sale contract. */
  remaining: bigint;
}

const R = 15.915; // radius giving circumference = 100, so dash values are %
const CIRCUMFERENCE = 100;

/** Held-vs-available ring, drawn as plain SVG. No chart library. */
export function AllocationDonut({ total, remaining }: Props) {
  const held = total - remaining;
  const heldPct = total > 0n ? Number((held * 1000n) / total) / 10 : 0;

  return (
    <div className={styles.wrap}>
      <svg viewBox='0 0 42 42' className={styles.donut} role='img' aria-label='Share allocation'>
        <circle className={styles.track} cx='21' cy='21' r={R} />
        <circle
          className={styles.value}
          cx='21'
          cy='21'
          r={R}
          strokeDasharray={`${heldPct} ${CIRCUMFERENCE - heldPct}`}
          strokeDashoffset='25'
        />
        <text x='21' y='19.6' className={styles.pct}>
          {heldPct}%
        </text>
        <text x='21' y='25.4' className={styles.caption}>
          held
        </text>
      </svg>
      <ul className={styles.legend}>
        <li>
          <span className={`${styles.swatch} ${styles.swatchSold}`} />
          Held by investors <b>{held.toString()}</b>
        </li>
        <li>
          <span className={`${styles.swatch} ${styles.swatchFree}`} />
          Available <b>{remaining.toString()}</b>
        </li>
      </ul>
    </div>
  );
}
