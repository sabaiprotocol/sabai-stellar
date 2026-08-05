'use client';

import { useCallback, useEffect, useState } from 'react';
import { AssetCard } from '@/components/AssetCard';
import { RecentPurchases } from '@/components/RecentPurchases';
import { useWallet } from '@/components/WalletProvider';
import { fetchSaleState, type SaleState } from '@/lib/stellar';
import styles from './Dapp.module.scss';

const REFRESH_MS = 30_000;

export function Dapp() {
  const { refreshBalances } = useWallet();
  const [sale, setSale] = useState<SaleState | null>(null);

  const refreshSale = useCallback(() => {
    fetchSaleState()
      .then(setSale)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshSale();
    const id = setInterval(refreshSale, REFRESH_MS);
    return () => clearInterval(id);
  }, [refreshSale]);

  const onPurchased = useCallback(() => {
    refreshSale();
    refreshBalances();
  }, [refreshSale, refreshBalances]);

  return (
    <main className={styles.layout}>
      <AssetCard sale={sale} onPurchased={onPurchased} />
      <RecentPurchases />
    </main>
  );
}
