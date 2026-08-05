'use client';

import type { ReactNode } from 'react';
import { useId } from 'react';
import styles from './Checkbox.module.scss';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, disabled = false }: Props) {
  const id = useId();

  return (
    <div className={styles.checkbox}>
      <input
        id={id}
        type='checkbox'
        className={styles.input}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} className={styles.label}>
        <span className={styles.text}>{label}</span>
      </label>
    </div>
  );
}
