import type { ReactNode } from 'react';
import { Icon } from '@/components/UI/Icon';
import { hasConsoleAccess } from '@/lib/stellar';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Shown only to a wallet the operator console opens for. */
  adminOnly?: boolean;
}

/* Icons come from the generated sprite (src/assets/svgicons -> sprite.svg). */
export const NAV_ITEMS: NavItem[] = [
  { href: '/portfolio', label: 'My portfolio', icon: <Icon name='portfolio' /> },
  { href: '/', label: 'Asset market', icon: <Icon name='market' /> },
  { href: '/secondary-market', label: 'Secondary market', icon: <Icon name='coins-swap' /> },
  { href: '/transactions', label: 'Transactions', icon: <Icon name='transactions' /> },
  { href: '/admin', label: 'Admin', icon: <Icon name='settings' />, adminOnly: true },
];

/** Nav items visible to the given wallet (null = not connected). */
export function navItemsFor(address: string | null): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.adminOnly || hasConsoleAccess(address));
}

export function isNavActive(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}
