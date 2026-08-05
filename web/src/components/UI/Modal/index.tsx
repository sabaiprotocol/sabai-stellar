'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useModalTransition } from '@/hooks/useModalTransition';
import styles from './Modal.module.scss';

interface Props {
  /** Accessible name of the dialog. */
  label: string;
  /** Sheet width in px; it never exceeds the viewport. */
  width?: number;
  /** Applied to the sheet - padding, layout and typography live in the caller. */
  className?: string;
  /** Blocks backdrop-click while a signature is pending. */
  busy?: boolean;
  /** Suppresses the default close button; the content supplies its own. */
  hideClose?: boolean;
  /** Closes the modal once this turns true, keeping the exit animation. */
  closeWhen?: boolean;
  onClose: () => void;
  /** Function form receives the animated close, for content that closes itself. */
  children: ReactNode | ((close: () => void) => ReactNode);
}

/**
 * Dialog shell: backdrop, sheet, enter/exit animation, Esc, scroll lock.
 *
 * Always portalled onto document.body. A sheet keeps the `transform` from its
 * entry animation, which would make it the containing block for any nested
 * `position: fixed` dialog - a document opened from the buy sheet would then
 * be sized and clipped by that sheet. Portalling also means stacking follows
 * mount order, so nested dialogs need no z-index bookkeeping.
 */
export function Modal({
  label,
  width = 420,
  className,
  busy = false,
  hideClose = false,
  closeWhen = false,
  onClose,
  children,
}: Props) {
  const { closing, requestClose } = useModalTransition(onClose);

  useEffect(() => {
    if (closeWhen) requestClose();
  }, [closeWhen, requestClose]);

  if (typeof window === 'undefined') return null;

  return createPortal(
    <div
      className={`${styles.backdrop} ${closing ? styles.isClosing : ''}`}
      onClick={() => !busy && requestClose()}
      role='presentation'
    >
      <div
        className={`${styles.sheet} ${className ?? ''}`}
        style={{ '--modal-width': `${width}px` } as CSSProperties}
        onClick={(e) => e.stopPropagation()}
        role='dialog'
        aria-modal='true'
        aria-label={label}
      >
        {!hideClose && (
          <button type='button' className={styles.close} onClick={requestClose} aria-label='Close'>
            ✕
          </button>
        )}
        {typeof children === 'function' ? children(requestClose) : children}
      </div>
    </div>,
    window.document.body,
  );
}
