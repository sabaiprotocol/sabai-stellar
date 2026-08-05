import styles from './Spinner.module.scss';

interface Props {
  className?: string;
}

/**
 * Inline "this is working" mark.
 *
 * Sized from the current font size and drawn in the current text colour, so it
 * fits whatever it is dropped into without being told about it. Decorative:
 * the state it stands for is carried by `aria-busy` and by the label beside it.
 */
export function Spinner({ className }: Props) {
  return (
    <span className={[styles.spinner, className].filter(Boolean).join(' ')} aria-hidden='true' />
  );
}
