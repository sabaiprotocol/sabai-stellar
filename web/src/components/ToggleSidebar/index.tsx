'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/UI/Icon';
import styles from './ToggleSidebar.module.scss';

const STORAGE_KEY = 'slr1-sidebar';

/** Collapses the sidebar to an icon rail. The mode lives as a `sidebar-slim`
 *  class on <html>, applied pre-paint from localStorage, so Sidebar, Header
 *  and the page padding all follow it in CSS. */
export function ToggleSidebar({ className = '' }: { className?: string }) {
  const [slim, setSlim] = useState(false);

  useEffect(() => {
    setSlim(document.documentElement.classList.contains('sidebar-slim'));
  }, []);

  const toggle = () => {
    const next = !slim;
    setSlim(next);
    document.documentElement.classList.toggle('sidebar-slim', next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'slim' : 'full');
    } catch {
      /* private mode - the preference just won't persist */
    }
  };

  return (
    <button
      type='button'
      className={`${styles.button} ${className}`}
      onClick={toggle}
      aria-label={slim ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      <Icon name={slim ? 'sidebar-right' : 'sidebar-left'} />
    </button>
  );
}
