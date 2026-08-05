import type { Metadata } from 'next';
import { SecondaryMarketView } from '@/components/SecondaryMarketView';

export const metadata: Metadata = {
  title: 'Secondary market — Sabai RWA on Stellar',
};

export default function SecondaryMarketPage() {
  return <SecondaryMarketView />;
}
