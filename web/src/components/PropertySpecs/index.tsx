import { Icon } from '@/components/UI/Icon';
import { DEMO_ASSET } from '@/config/asset';
import styles from './PropertySpecs.module.scss';

/** Bed / bath / area row under the card title. */
export function PropertySpecs() {
  return (
    <ul className={styles.specs}>
      {DEMO_ASSET.specs.map((s) => (
        <li key={s.icon} className={styles.spec} title={s.label}>
          <Icon name={s.icon} className={styles.icon} />
          <span className={styles.value}>{s.value}</span>
        </li>
      ))}
    </ul>
  );
}
