'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Must match the exit animation duration in the modal SCSS. */
const EXIT_MS = 200;

/**
 * Every mounted modal, innermost last. Modals nest - a document opens on top
 * of the buy sheet - so Esc must reach only the topmost one, and the body
 * scroll lock must survive until the LAST of them closes.
 */
const stack: symbol[] = [];

/**
 * Shared modal lifecycle: Esc-to-close, body scroll lock, and a graceful
 * exit - `requestClose()` flips `closing` (the SCSS plays the reverse
 * animation) and only then the parent unmounts the modal.
 */
export function useModalTransition(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | null>(null);
  /** Identity of this modal inside `stack`; stable across re-renders. */
  const [token] = useState(() => Symbol('modal'));

  const requestClose = useCallback(() => {
    setClosing((already) => {
      if (!already) {
        timer.current = window.setTimeout(onClose, EXIT_MS);
      }
      return true;
    });
  }, [onClose]);

  // Mount/unmount only - consumers pass inline onClose callbacks, so an
  // effect keyed on requestClose would re-run on every render and shuffle
  // this modal back to the top of the stack.
  useEffect(() => {
    stack.push(token);
    document.body.style.overflow = 'hidden';
    return () => {
      const i = stack.lastIndexOf(token);
      if (i !== -1) stack.splice(i, 1);
      if (stack.length === 0) document.body.style.overflow = '';
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [token]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === token) requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose, token]);

  return { closing, requestClose };
}
