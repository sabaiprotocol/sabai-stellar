import type { Metadata } from 'next';
import { PortfolioView } from '@/components/PortfolioView';

export const metadata: Metadata = {
  title: 'My portfolio — Sabai RWA on Stellar',
};

export default function PortfolioPage() {
  return <PortfolioView />;
}
