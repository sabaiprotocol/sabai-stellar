'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DemoVideoModal } from '@/components/DemoVideoModal';
import { HeaderWallet } from '@/components/HeaderWallet';
import { Logo } from '@/components/Logo';
import { MenuButton } from '@/components/MenuButton';
import { MobileMenu } from '@/components/MobileMenu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { isNavActive, NAV_ITEMS } from '@/config/nav';
import { DEPLOYMENT, EXPLORER } from '@/lib/stellar';
import styles from './Header.module.scss';

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const pathname = usePathname();

  // Desktop header shows the current section title (the sidebar carries the
  // logo); on mobile the sidebar is hidden, so the logo moves here.
  const title = NAV_ITEMS.find((i) => isNavActive(i.href, pathname))?.label ?? 'RWA on Stellar';

  // Body scroll lock while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  // The menu exists only below the tablet breakpoint - close it if the
  // viewport grows past it, otherwise the scroll lock would stick.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 992px)');
    const onChange = (e: MediaQueryListEvent) => e.matches && setMenuOpen(false);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <span className={styles.logoCompact}>
            <Logo />
          </span>
          <h1 className={styles.title}>{title}</h1>
        </div>
        <div className={styles.right}>
          <button type='button' className={styles.demo} onClick={() => setDemoOpen(true)}>
            ▶ Demo
          </button>
          <a
            className={styles.contractLink}
            href={`${EXPLORER}/contract/${DEPLOYMENT.contracts.assetSale}`}
            target='_blank'
            rel='noreferrer'
          >
            Sale contract ↗
          </a>
          <span className={styles.badge}>Testnet</span>
          <span className={styles.desktopOnly}>
            <ThemeToggle />
          </span>
          <HeaderWallet />
          <MenuButton open={menuOpen} onToggle={() => setMenuOpen((o) => !o)} />
        </div>
      </div>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      {demoOpen && <DemoVideoModal onClose={() => setDemoOpen(false)} />}
    </header>
  );
}
