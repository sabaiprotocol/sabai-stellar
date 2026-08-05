'use client';

import { useEffect, useState } from 'react';
import styles from './ThemeToggle.module.scss';

const STORAGE_KEY = 'slr1-theme';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // The pre-paint snippet in layout.tsx already applied the class; sync after
  // hydration and observe it so several toggle instances (header bar + burger
  // menu) never drift apart.
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setDark(el.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      /* private mode - theme just won't persist */
    }
  };

  return (
    <button
      type='button'
      className={styles.toggle}
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
    >
      {dark ? (
        <svg width='18' height='18' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
          <circle cx='12' cy='12' r='5' fill='currentColor' />
          <g stroke='currentColor' strokeWidth='2' strokeLinecap='round'>
            <path d='M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' />
          </g>
        </svg>
      ) : (
        <svg width='18' height='18' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
          <path d='M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z' fill='currentColor' />
        </svg>
      )}
    </button>
  );
}
