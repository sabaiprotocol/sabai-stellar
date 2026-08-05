'use client';

import styles from './MenuButton.module.scss';

interface Props {
  open: boolean;
  onToggle: () => void;
}

/** Burger button: three lines morphing into an ✕ inside a brand circle,
 *  visible below the tablet breakpoint. */
export function MenuButton({ open, onToggle }: Props) {
  return (
    <button
      type='button'
      className={`${styles.burger} ${open ? styles.open : ''}`}
      onClick={onToggle}
      aria-label={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
    >
      <span />
    </button>
  );
}
