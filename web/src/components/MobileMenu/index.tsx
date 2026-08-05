'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useWallet } from '@/components/WalletProvider';
import { isNavActive, navItemsFor } from '@/config/nav';
import { DEPLOYMENT, EXPLORER } from '@/lib/stellar';
import styles from './MobileMenu.module.scss';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Slide-in panel below the header: the sidebar navigation plus everything
 *  the compact header bar hides. */
export function MobileMenu({ open, onClose }: Props) {
  const pathname = usePathname();
  const { address } = useWallet();
  const items = navItemsFor(address);

  return (
    <nav className={`${styles.menu} ${open ? styles.open : ''}`} aria-hidden={!open}>
      <ul className={styles.list}>
        {items.map((item) => {
          const active = isNavActive(item.href, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${styles.link} ${active ? styles.activeLink : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={onClose}
              >
                {item.icon}
                <span className={styles.label}>{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li className={styles.row}>
          <span className={styles.label}>Network</span>
          <span className={styles.badge}>Testnet</span>
        </li>
        <li className={styles.row}>
          <span className={styles.label}>Theme</span>
          <ThemeToggle />
        </li>
        <li>
          <a
            className={styles.link}
            href={`${EXPLORER}/contract/${DEPLOYMENT.contracts.assetSale}`}
            target='_blank'
            rel='noreferrer'
            onClick={onClose}
          >
            Sale contract ↗
          </a>
        </li>
        <li>
          <a
            className={styles.link}
            href={`${EXPLORER}/contract/${DEPLOYMENT.contracts.shareToken}`}
            target='_blank'
            rel='noreferrer'
            onClick={onClose}
          >
            Share token (SLR1) ↗
          </a>
        </li>
      </ul>
    </nav>
  );
}
