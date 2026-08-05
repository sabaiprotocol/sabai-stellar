/**
 * Demo asset content. FICTIONAL - this property does not exist.
 * See the README compliance disclaimer: testnet demo, not an offering.
 */
export const DEMO_ASSET = {
  name: 'Sabai Lagoon Residence No. 1',
  symbol: 'SLR1',
  location: 'Phuket, Thailand (fictional demo asset)',
  description:
    'A demo tokenized villa: 1000 indivisible shares, each recorded on the ' +
    'Stellar testnet via Soroban smart contracts. Connect a Freighter wallet, ' +
    'buy a fractional share with testnet XLM and verify the transaction ' +
    'on-chain — the full RWA purchase flow in miniature.',
  /** Photos live in /public/assets/images/rwa - the gallery controls
   *  appear automatically when there is more than one. */
  images: [
    '/assets/images/rwa/villa__001.webp',
    '/assets/images/rwa/villa__002.webp',
    '/assets/images/rwa/villa__003.webp',
    '/assets/images/rwa/villa__007.webp',
  ],
  specs: [
    { icon: 'bed', value: '4', label: 'bedrooms' },
    { icon: 'bath', value: '3', label: 'bathrooms' },
    { icon: 'area', value: '420 m²', label: 'built area' },
  ],
  facts: [
    { label: 'Type', value: 'Villa · 4 BR' },
    { label: 'Built area', value: '420 m²' },
    { label: 'Land plot', value: '1 200 m²' },
    { label: 'Total shares', value: '1 000' },
  ],
} as const;

export type SpecIcon = (typeof DEMO_ASSET.specs)[number]['icon'];
