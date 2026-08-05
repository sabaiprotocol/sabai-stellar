'use client';

import styles from './TabsNav.module.scss';

export interface Tab<T extends string = string> {
  label: string;
  value: T;
}

interface Props<T extends string> {
  tabs: readonly Tab<T>[];
  activeValue: T;
  onTabClick: (value: T) => void;
}

/** Generic in the tab value so callers keep their own union, no casts. */
export function TabsNav<T extends string>({ tabs, activeValue, onTabClick }: Props<T>) {
  return (
    <nav className={styles.nav}>
      <ul className={styles.list}>
        {tabs.map((tab) => (
          <li key={tab.value} className={styles.item}>
            <button
              type='button'
              className={`${styles.link} ${activeValue === tab.value ? styles.active : ''}`}
              onClick={() => onTabClick(tab.value)}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
