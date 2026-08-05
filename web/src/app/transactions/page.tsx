import type { Metadata } from 'next';
import { TransactionsView } from '@/components/TransactionsView';

export const metadata: Metadata = {
  title: 'Transactions — Sabai RWA on Stellar',
};

export default function TransactionsPage() {
  return <TransactionsView />;
}
