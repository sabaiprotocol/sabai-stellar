import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { WalletProvider } from '@/components/WalletProvider';
import '@/styles/global.scss';

const inter = localFont({
  src: [
    { path: '../../public/assets/fonts/Inter-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../../public/assets/fonts/Inter-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../../public/assets/fonts/Inter-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: '../../public/assets/fonts/Inter-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-inter',
  display: 'swap',
});

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3030';
const DESCRIPTION =
  'Proof of Concept: buy a fractional share of a tokenized real-estate asset on Stellar testnet via Soroban smart contracts.';

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: 'Sabai — RWA on Stellar (Testnet PoC)',
  description: DESCRIPTION,
  icons: {
    icon: [{ url: '/logo-short.svg', type: 'image/svg+xml' }],
  },
  openGraph: {
    title: 'Sabai — RWA on Stellar',
    description: DESCRIPTION,
    type: 'website',
    images: [
      {
        url: '/assets/images/rwa/villa__001.webp',
        width: 1200,
        height: 630,
        alt: 'Sabai Lagoon Residence No. 1',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sabai — RWA on Stellar',
    description: DESCRIPTION,
    images: ['/assets/images/rwa/villa__001.webp'],
  },
};

/** Applies the saved theme and sidebar mode before first paint - no flash. */
const themeInit = `try{var c=document.documentElement.classList;if(localStorage.getItem('slr1-theme')==='dark'){c.add('dark')}if(localStorage.getItem('slr1-sidebar')==='slim'){c.add('sidebar-slim')}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static first-party theme snippet */}
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className={inter.variable}>
        <WalletProvider>
          <div className='page'>
            <Sidebar />
            <Header />
            {children}
            <Footer />
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
