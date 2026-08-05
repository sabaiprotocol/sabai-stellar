'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from '@/components/UI/Spinner';
import styles from './Button.module.scss';

type Variant = 'gradient' | 'secondary' | 'red';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Spins and blocks the button. Disabling is implied - a button that is
   *  already working must not take a second click. */
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'gradient',
  loading = false,
  children,
  className,
  disabled,
  ...rest
}: Props) {
  const cls = [styles.button, styles[variant], className].filter(Boolean).join(' ');
  return (
    <button
      type='button'
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
