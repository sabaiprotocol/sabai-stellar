import type { ReactNode } from 'react';
import type { IconName } from '@/assets/sprite/types';
import { Icon } from '@/components/UI/Icon';
import styles from './InfoGrid.module.scss';

export interface InfoGridItem {
  icon: IconName;
  title: string;
  value: ReactNode;
}

export function InfoGrid({ items }: { items: InfoGridItem[] }) {
  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <div key={item.title} className={styles.item}>
          <div className={styles.icon}>
            <Icon name={item.icon} />
          </div>
          <h3 className={styles.title}>{item.title}</h3>
          <div className={styles.value}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}
