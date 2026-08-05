import type { Metadata } from 'next';
import { AdminView } from '@/components/AdminView';

export const metadata: Metadata = {
  title: 'Admin — Sabai RWA on Stellar',
};

export default function AdminPage() {
  return <AdminView />;
}
