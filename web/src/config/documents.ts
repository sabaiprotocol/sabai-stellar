/**
 * Demo document set for the asset page. These are NOT legal records: they
 * describe how this testnet proof of concept works and what a real offering
 * would need instead. On the production platform the same slots are filled
 * from the media service (`/api/property/:id/documents`), gated per user by
 * whitelist / holder status.
 */
import deployment from '../../../deployments/testnet.json';

export interface DocSection {
  heading?: string;
  paragraphs?: string[];
  list?: string[];
}

export interface DemoDocument {
  id: string;
  title: string;
  /** Short line under the title in the list and the modal header. */
  kind: string;
  sections: DocSection[];
}

export const DOCUMENTS: DemoDocument[] = [
  {
    id: 'asset-sheet',
    title: 'Asset information sheet',
    kind: 'Demo document · fictional asset',
    sections: [
      {
        paragraphs: [
          'Sabai Lagoon Residence No. 1 (SLR1) is a fictional property created for this proof of concept. It does not exist, is not for sale, and no rights of any kind attach to the tokens described here.',
        ],
      },
      {
        heading: 'Property (illustrative)',
        list: [
          'Type: villa, 4 bedrooms, 3 bathrooms',
          'Built area: 420 m² on a 1,200 m² plot',
          'Location: Phuket, Thailand — used only to make the demo concrete',
          'Photographs: stock imagery, marked as illustrative throughout the app',
        ],
      },
      {
        heading: 'Share structure',
        list: [
          'Total supply: 1,000 indivisible shares (SLR1), minted once at deployment',
          'Primary price: 100 XLM per share, fixed in the sale contract',
          'Minimum purchase: 1 share',
          'Ownership of one share represents 0.1% of the demo asset',
        ],
      },
      {
        heading: 'What a real offering would add',
        paragraphs: [
          'A production listing on the Sabai platform carries a title deed, the incorporation certificate of the company formed for this one asset, an independent valuation, rental projections and the subscription agreement — each issued by an identified party and delivered under the document permissions the platform enforces per investor.',
        ],
      },
    ],
  },
  {
    id: 'token-terms',
    title: 'Token terms',
    kind: 'Demo document · how the contracts behave',
    sections: [
      {
        paragraphs: [
          'Every rule below is enforced by the Soroban contracts listed in the On-chain tab — there is no backend that can override them.',
        ],
      },
      {
        heading: 'Primary sale',
        list: [
          'The sale contract holds unsold inventory and sells at a fixed price; payment goes to the treasury account in the same transaction that delivers the shares.',
          'Buyers must be on the on-chain whitelist. In this demo anyone can add themselves with one free transaction ("Pass demo KYC"); in production a licensed provider drives that list.',
          'The administrator can pause the sale or change the price. Neither action can take shares out of a holder’s wallet.',
        ],
      },
      {
        heading: 'Instant buyback',
        list: [
          'Holders may sell shares back to the contract at the current price, paid from an on-chain buyback pool.',
          'The pool is finite: when it cannot cover a sale the contract rejects the transaction and the app says so before you sign.',
        ],
      },
      {
        heading: 'Secondary market',
        list: [
          'Sellers list shares at their own price inside an administrator-set band (currently 50–200 XLM per share).',
          'Listed shares move into contract escrow until the order is filled or cancelled; the seller can always cancel, even if trading is paused.',
          'Buyers may fill an order partially. The platform commission (currently 2%) is deducted from the seller’s proceeds in the same atomic transaction.',
          'Both sides of every trade must be whitelisted.',
        ],
      },
      {
        heading: 'Rewards',
        list: [
          'The administrator deposits reward rounds that accrue pro rata across all 1,000 shares.',
          'Holders claim their accrued balance at any time; unclaimed rewards stay in the contract.',
          'Simplification of this PoC: accrual is counted against the balance held at claim time, not weighted by how long shares were held. A production distributor tracks per-transfer checkpoints.',
        ],
      },
    ],
  },
  {
    id: 'compliance',
    title: 'Compliance and risk disclaimer',
    kind: 'Required reading · testnet demo',
    sections: [
      {
        paragraphs: [
          'This application runs on the Stellar test network. Balances are test XLM obtained free from friendbot and have no monetary value. Nothing here is an offer, solicitation or recommendation to buy securities or any other financial instrument.',
        ],
      },
      {
        heading: 'What is deliberately simplified',
        list: [
          'KYC/AML: the whitelist is self-service so reviewers can walk the whole flow. A production deployment gates it behind an identity provider (SEP-12) and sanctions screening.',
          'Issuer: no legal entity stands behind SLR1. In the reference structure one company is formed per asset — a Wyoming DAO LLC — and the tokens are membership interests in it; the document set is drafted (docs/legal/ in the repository, hashed onto the share token) but nothing is incorporated and no title has been transferred.',
          'Custody: keys stay in the user’s Freighter wallet; there is no recovery path if they are lost.',
          'Market data: prices are whatever participants set on testnet — they reflect nothing real.',
        ],
      },
      {
        heading: 'Technical risks that remain in production',
        list: [
          'Smart-contract risk: the contracts in this repository are unaudited.',
          'Liquidity risk: the secondary market only matches what other holders offer, and the buyback pool can run dry.',
          'Network risk: testnet is reset periodically by the Stellar Development Foundation; contract state does not survive a reset.',
        ],
      },
    ],
  },
  {
    id: 'verify',
    title: 'How to verify this yourself',
    kind: 'Reviewer guide · on-chain evidence',
    sections: [
      {
        paragraphs: [
          'Every number in this app is read from the contracts below through public RPC. Nothing is served from a database — there is no backend.',
        ],
      },
      {
        heading: 'Contract addresses (testnet)',
        list: [
          `Share token — ${deployment.contracts.shareToken}`,
          `Asset sale — ${deployment.contracts.assetSale}`,
          `Asset exchange — ${deployment.contracts.exchange}`,
          `Rewards distributor — ${deployment.contracts.rewards}`,
        ],
      },
      {
        heading: 'Checks a reviewer can run',
        list: [
          'Open any address on stellar.expert and compare the contract state with what the app shows.',
          'Buy one share, then find the resulting "buy" event under the sale contract — the Transactions page reads exactly those events.',
          'Rebuild the contracts from source (`stellar contract build`) and compare the wasm hash with the deployed one.',
          'Call any read method yourself: `stellar contract invoke --id <contract> -- price` returns the same value the card shows.',
        ],
      },
    ],
  },
];

/** Documents linked from the purchase / listing consent checkboxes. */
export const CONSENT_DOCUMENT_IDS = ['token-terms', 'compliance'];
