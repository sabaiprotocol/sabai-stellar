'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { ToggleSidebar } from '@/components/ToggleSidebar';
import { useWallet } from '@/components/WalletProvider';
import { isNavActive, navItemsFor } from '@/config/nav';
import { DEPLOYMENT, EXPLORER } from '@/lib/stellar';
import styles from './Sidebar.module.scss';

/** Fixed left navigation, desktop only - below the tablet breakpoint the
 *  burger menu carries the same links. */
export function Sidebar() {
  const pathname = usePathname();
  const { address } = useWallet();
  const items = navItemsFor(address);

  return (
    <aside className={styles.aside}>
      {/* Both logo variants render; CSS shows one depending on slim mode. */}
      <Link href='/' className={styles.logo} aria-label='Sabai — home'>
        <span className={styles.logoFull}>
          <Logo />
        </span>
        <span className={styles.logoShort}>
          <Logo short />
        </span>
      </Link>

      <ToggleSidebar className={styles.toggle} />

      <nav className={styles.menu}>
        <ul>
          {items.map((item) => {
            const active = isNavActive(item.href, pathname);
            return (
              <li key={item.href} className={styles.item}>
                <Link
                  href={item.href}
                  className={`${styles.link} ${active ? styles.active : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={styles.bottom}>
        <p>Soroban PoC · Stellar testnet</p>
        <a
          href={`${EXPLORER}/contract/${DEPLOYMENT.contracts.assetSale}`}
          target='_blank'
          rel='noreferrer'
        >
          Sale contract ↗
        </a>
      </div>
    </aside>
  );
}
