'use client';

import { useEffect, useState } from 'react';
import { AllocationDonut } from '@/components/AllocationDonut';
import { DetailGallery } from '@/components/DetailGallery';
import { DocumentModal } from '@/components/DocumentModal';
import { DocumentsList } from '@/components/DocumentsList';
import { TabsNav } from '@/components/TabsNav';
import { Icon } from '@/components/UI/Icon';
import { Modal } from '@/components/UI/Modal';
import { DEMO_ASSET } from '@/config/asset';
import { type DemoDocument, DOCUMENTS } from '@/config/documents';
import { formatAmount, formatXlm } from '@/lib/format';
import { DEPLOYMENT, EXPLORER, fetchTerms, type SaleState, type Terms } from '@/lib/stellar';
import styles from './AssetDetailsModal.module.scss';

interface Props {
  sale: SaleState | null;
  onClose: () => void;
}

type TabValue = 'description' | 'documents' | 'onchain';
const TABS: { label: string; value: TabValue }[] = [
  { label: 'Description', value: 'description' },
  { label: 'Documents', value: 'documents' },
  { label: 'On-chain', value: 'onchain' },
];

/** `wasm` is the sha256 of the deployed code; the native XLM SAC has none -
 *  it is built into the protocol rather than uploaded by us. */
const CONTRACTS: { name: string; id: string; wasm?: string }[] = [
  {
    name: 'Compliance registry (shared by all assets)',
    id: DEPLOYMENT.contracts.registry,
    wasm: DEPLOYMENT.wasmHashes.registry,
  },
  {
    name: `Share token (${DEMO_ASSET.symbol})`,
    id: DEPLOYMENT.contracts.shareToken,
    wasm: DEPLOYMENT.wasmHashes.shareToken,
  },
  {
    name: 'Asset sale',
    id: DEPLOYMENT.contracts.assetSale,
    wasm: DEPLOYMENT.wasmHashes.assetSale,
  },
  {
    name: 'Asset exchange',
    id: DEPLOYMENT.contracts.exchange,
    wasm: DEPLOYMENT.wasmHashes.exchange,
  },
  {
    name: 'Rewards distributor',
    id: DEPLOYMENT.contracts.rewards,
    wasm: DEPLOYMENT.wasmHashes.rewards,
  },
  { name: 'Native XLM (Stellar Asset Contract)', id: DEPLOYMENT.contracts.nativeSac },
];

/** Asset overview: gallery, header, tabs, and a document reader on top. */
export function AssetDetailsModal({ sale, onClose }: Props) {
  const [tab, setTab] = useState<TabValue>('description');
  const [doc, setDoc] = useState<DemoDocument | null>(null);
  const [terms, setTerms] = useState<Terms | null>(null);

  // The anchor is worth showing only if it is the live one, so it is read from
  // the contract rather than taken from the deployment file. Nothing here can
  // fail loudly: an unreachable RPC leaves the fields at "…" rather than
  // breaking the tab around them.
  useEffect(() => {
    let live = true;
    fetchTerms()
      .then((t) => live && setTerms(t))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const totalShares = BigInt(DEPLOYMENT.asset.totalShares);
  const valuation = sale ? formatXlm(sale.priceStroops * totalShares) : null;

  return (
    /* The reader is a sibling of the sheet, not a child: React bubbles events
       through the component tree, so a click inside a nested reader would
       otherwise reach the backdrop and close this modal underneath it. */
    <>
      <Modal
        label={`${DEMO_ASSET.name} — details`}
        width={960}
        className={styles.modal}
        hideClose
        onClose={onClose}
      >
        {(close) => (
          <>
            <div className={styles.closeBar}>
              <button type='button' className={styles.close} onClick={close} aria-label='Close'>
                ✕
              </button>
            </div>

            <div className={styles.gallery}>
              <DetailGallery images={DEMO_ASSET.images} alt={DEMO_ASSET.name} />
            </div>

            <div className={styles.header}>
              <h2 className={styles.title}>{DEMO_ASSET.name}</h2>
              <p className={styles.location}>{DEMO_ASSET.location}</p>
              <div className={styles.specs}>
                {DEMO_ASSET.specs.map((s) => (
                  <span key={s.label} className={styles.spec}>
                    <Icon name={s.icon} />
                    {s.value} {s.label}
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.tabs}>
              <TabsNav tabs={TABS} activeValue={tab} onTabClick={setTab} />
            </div>

            <div className={styles.content}>
              {tab === 'description' && (
                <div className={styles.overview}>
                  <div className={styles.overviewMain}>
                    <p className={styles.description}>{DEMO_ASSET.description}</p>

                    <dl className={styles.facts}>
                      {DEMO_ASSET.facts.map((f) => (
                        <div key={f.label} className={styles.fact}>
                          <dt>{f.label}</dt>
                          <dd>{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>

                  <aside className={styles.overviewSide}>
                    <div className={styles.keyFigures}>
                      <div className={styles.figure}>
                        <span className={styles.figureLabel}>Asset valuation</span>
                        <span className={styles.figureValue}>
                          {valuation ? `${valuation} XLM` : '…'}
                        </span>
                      </div>
                      <div className={styles.figure}>
                        <span className={styles.figureLabel}>Share price</span>
                        <span className={styles.figureValue}>
                          {sale ? `${formatXlm(sale.priceStroops)} XLM` : '…'}
                        </span>
                      </div>
                      <div className={styles.figure}>
                        <span className={styles.figureLabel}>Total shares</span>
                        <span className={styles.figureValue}>
                          {formatAmount(totalShares.toString())}
                        </span>
                      </div>
                      <div className={styles.figure}>
                        <span className={styles.figureLabel}>Available now</span>
                        <span className={styles.figureValue}>
                          {sale ? sale.remaining.toString() : '…'}
                        </span>
                      </div>
                    </div>

                    {sale && (
                      <div className={styles.allocation}>
                        <AllocationDonut total={totalShares} remaining={sale.remaining} />
                      </div>
                    )}
                  </aside>
                </div>
              )}

              {tab === 'documents' && (
                <>
                  <p className={styles.sectionText}>
                    On the production platform these slots hold the title deed, the company's
                    incorporation certificate, the valuation and the subscription agreement, served
                    per investor according to their KYC and holder status. Here they describe the
                    proof of concept itself. The reference legal set the contracts were drafted
                    around — articles, operating agreement, subscription agreement, risk factors —
                    lives in <code className={styles.inline}>docs/legal/</code> in the repository,
                    and its sha256 is the value anchored on the share token under On-chain.
                  </p>
                  <div className={styles.documents}>
                    <DocumentsList documents={DOCUMENTS} onOpen={setDoc} />
                  </div>
                </>
              )}

              {tab === 'onchain' && (
                <>
                  <p className={styles.sectionText}>
                    Everything this page shows is read from these contracts through public Soroban
                    RPC — no backend sits in between. Network: Stellar {DEPLOYMENT.network},
                    protocol {DEPLOYMENT.protocolVersion}.
                  </p>
                  <h3 className={styles.subtitle}>Contracts</h3>
                  <ul className={styles.contracts}>
                    {CONTRACTS.map((c) => (
                      <li key={c.id}>
                        <div className={styles.contractHead}>
                          <span>{c.name}</span>
                          <a href={`${EXPLORER}/contract/${c.id}`} target='_blank' rel='noreferrer'>
                            {c.id.slice(0, 8)}… <b>stellar.expert ↗</b>
                          </a>
                        </div>
                        {c.wasm && <code className={styles.hash}>wasm sha256 {c.wasm}</code>}
                      </li>
                    ))}
                  </ul>
                  <p className={styles.sectionText}>
                    Those hashes are the sha256 of the wasm in this repository. The explorer shows
                    the hash the network stores for each contract — they match, so the code running
                    here is the code that is published.
                  </p>
                  <h3 className={styles.subtitle}>Accounts</h3>
                  <ul className={styles.contracts}>
                    <li>
                      <div className={styles.contractHead}>
                        <span>
                          Admin — {DEPLOYMENT.governance.quorum}-of-
                          {DEPLOYMENT.governance.signers} multisig
                        </span>
                        <a
                          href={DEPLOYMENT.governance.adminAccountLink}
                          target='_blank'
                          rel='noreferrer'
                        >
                          {DEPLOYMENT.accounts.admin.slice(0, 8)}… <b>stellar.expert ↗</b>
                        </a>
                      </div>
                    </li>
                    <li>
                      <span>Operator (hot key)</span>
                      <a
                        href={`${EXPLORER}/account/${DEPLOYMENT.accounts.operator}`}
                        target='_blank'
                        rel='noreferrer'
                      >
                        {DEPLOYMENT.accounts.operator.slice(0, 8)}… <b>stellar.expert ↗</b>
                      </a>
                    </li>
                    <li>
                      <span>Treasury</span>
                      <a
                        href={`${EXPLORER}/account/${DEPLOYMENT.accounts.treasury}`}
                        target='_blank'
                        rel='noreferrer'
                      >
                        {DEPLOYMENT.accounts.treasury.slice(0, 8)}… <b>stellar.expert ↗</b>
                      </a>
                    </li>
                    <li>
                      <span>KYC provider</span>
                      <a
                        href={`${EXPLORER}/account/${DEPLOYMENT.accounts.kycProvider}`}
                        target='_blank'
                        rel='noreferrer'
                      >
                        {DEPLOYMENT.accounts.kycProvider.slice(0, 8)}… <b>stellar.expert ↗</b>
                      </a>
                    </li>
                  </ul>
                  <p className={styles.sectionText}>
                    Four separate keys, and the contracts keep them separate. Issuing shares,
                    confiscating them, repricing the sale, withdrawing funds and replacing the code
                    all answer to the admin account, which is a Stellar multisig: three signers, a
                    medium threshold of {DEPLOYMENT.governance.quorum}, and a master key of weight
                    zero. The operator is one ordinary key that can halt the deployment and switch
                    the markets — and cannot lift the halt, because stopping is the cheap direction
                    to be wrong in. The KYC provider is the only address that can admit an investor
                    (<code className={styles.inline}>register_verified</code>) and can do nothing
                    else. In this demo you can also admit yourself through{' '}
                    <code className={styles.inline}>register</code>, a shortcut that exists so the
                    flow is walkable without us running a KYC vendor. Eligibility lives in the
                    registry, not in the sale — the share token asks it on every transfer, so shares
                    cannot reach an address it has not cleared, not even wallet to wallet.
                  </p>
                  <p className={styles.sectionText}>
                    The admin screen is not what protects these contracts. Every privileged
                    entrypoint calls <code className={styles.inline}>require_auth</code> on a stored
                    role, so a transaction signed by any other key is rejected by the network —
                    opening <code className={styles.inline}>/admin</code> without one achieves
                    nothing, and a browser wallet cannot reach the admin calls at all because it
                    holds one signature and they need {DEPLOYMENT.governance.quorum}.
                  </p>
                  <h3 className={styles.subtitle}>Legal wrapper</h3>
                  <p className={styles.sectionText}>
                    The share token carries a pointer to the entity and documents the shares
                    represent an interest in —{' '}
                    <code className={styles.inline}>share_token.terms()</code>. Read live from the
                    contract, like everything else on this page:
                  </p>
                  <dl className={styles.terms}>
                    <div>
                      <dt>Issuing entity</dt>
                      <dd>{terms ? terms.issuer : '…'}</dd>
                    </div>
                    <div>
                      <dt>Governing law</dt>
                      <dd>{terms ? terms.jurisdiction : '…'}</dd>
                    </div>
                    <div>
                      <dt>Real asset</dt>
                      <dd>{terms ? (terms.is_real_asset ? 'yes' : 'no — demonstration') : '…'}</dd>
                    </div>
                    <div>
                      <dt>Anchored bundle</dt>
                      <dd>
                        {terms ? (
                          <a href={terms.uri} target='_blank' rel='noreferrer'>
                            {terms.uri}
                          </a>
                        ) : (
                          '…'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>sha256</dt>
                      <dd>
                        <code className={styles.hash}>
                          {terms ? terms.doc_hash.toString('hex') : '…'}
                        </code>
                      </dd>
                    </div>
                  </dl>
                  <p className={styles.sectionText}>
                    The hash is what makes the pointer worth something. It is the sha256 of four
                    documents — the articles of organization, the operating agreement, the
                    subscription agreement and the risk factors of the company that issues these
                    shares — concatenated and hashed as one stream. Run{' '}
                    <code className={styles.inline}>cat docs/legal/0[3-6]-*.md | sha256sum</code>{' '}
                    against the repository and you get the value above, or one of the two is stale.
                    A document quietly edited after investors signed no longer matches what the
                    ledger recorded, and anyone can establish that without asking the issuer.
                  </p>
                </>
              )}

              <p className={styles.disclaimer}>
                Fictional demo asset on Stellar testnet — not an offer of securities.
              </p>
            </div>
          </>
        )}
      </Modal>

      {doc && <DocumentModal document={doc} onClose={() => setDoc(null)} />}
    </>
  );
}
