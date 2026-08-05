import styles from './Logo.module.scss';

/**
 * Official Sabai logotype, inlined so it recolors with the theme
 * via `--logo-color` (blue in light, white in dark - same as the app).
 * `short` renders the round mark (two-tone, so it stays out of the sprite).
 */
export function Logo({ short = false }: { short?: boolean }) {
  if (short) {
    return (
      <svg
        className={styles.short}
        width='28'
        height='28'
        viewBox='0 0 22 22'
        fill='none'
        xmlns='http://www.w3.org/2000/svg'
        role='img'
        aria-label='Sabai'
      >
        <rect width='22' height='22' rx='11' fill='var(--brand-500)' />
        <path
          fillRule='evenodd'
          clipRule='evenodd'
          d='M15.95 9.93297V5.71997H8.17142L6.04999 7.82647V10.9862H11V9.93297H15.95Z'
          fill='#fff'
        />
        <path
          fillRule='evenodd'
          clipRule='evenodd'
          d='M11 10.9862V12.0395H6.04999V16.2525H13.8286L15.95 14.146V10.9862H11Z'
          fill='#fff'
        />
      </svg>
    );
  }

  return (
    <svg
      className={styles.logo}
      width='110'
      height='22'
      viewBox='0 0 110 22'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      role='img'
      aria-label='Sabai'
    >
      <path
        fillRule='evenodd'
        clipRule='evenodd'
        d='M71.8055 4.4L67.2222 0H48.8889V22H67.2222L71.8055 17.6V11.7333L70.2778 10.2667L71.8055 8.8V4.4ZM58.8194 4.4H65.6944V6.41667H58.8194V4.4ZM58.8194 14.6667V12.65H65.6944V14.6667H58.8194Z'
        fill='currentColor'
      />
      <path
        fillRule='evenodd'
        clipRule='evenodd'
        d='M42.0139 0H28.2639L23.6806 4.4V22H46.5972V4.4L42.0139 0ZM33.9931 8.61667V4.4H36.2847V8.61667H33.9931ZM33.9931 11.1833V22H36.2847V11.1833H33.9931Z'
        fill='currentColor'
      />
      <path
        fillRule='evenodd'
        clipRule='evenodd'
        d='M92.4305 0H78.6805L74.0972 4.4V22H97.0139V4.4L92.4305 0ZM86.7014 22H84.4097V11.1833H86.7014V22ZM86.7014 8.61667H84.4097V4.4H86.7014Z'
        fill='currentColor'
      />
      <path d='M99.3055 0H110V17.6L105.417 22H99.3055V0Z' fill='currentColor' />
      <path
        fillRule='evenodd'
        clipRule='evenodd'
        d='M21.3889 8.8V0H4.58333L0 4.4V11H10.6944V8.8H21.3889Z'
        fill='currentColor'
      />
      <path
        fillRule='evenodd'
        clipRule='evenodd'
        d='M10.6944 11V13.2H0V22H16.8056L21.3889 17.6V11H10.6944Z'
        fill='currentColor'
      />
    </svg>
  );
}
