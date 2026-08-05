'use client';

import { Address } from '@stellar/stellar-sdk';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AssetDetailsModal } from '@/components/AssetDetailsModal';
import { ImageGallery } from '@/components/ImageGallery';
import { InfoGrid, type InfoGridItem } from '@/components/InfoGrid';
import { ListSharesModal } from '@/components/ListSharesModal';
import { MyOrders } from '@/components/MyOrders';
import { PurchaseModal } from '@/components/PurchaseModal';
import { SellChoiceModal, type SellRoute } from '@/components/SellChoiceModal';
import { SellModal } from '@/components/SellModal';
import { TabsNav } from '@/components/TabsNav';
import { Button } from '@/components/UI/Button';
import { useWallet } from '@/components/WalletProvider';
import { DEMO_ASSET } from '@/config/asset';
import { formatAmount, formatXlm, shortAddress, txErrorMessage } from '@/lib/format';
import {
  DEPLOYMENT,
  EXPLORER,
  fetchOrders,
  fetchRewards,
  fetchSaleState,
  type Order,
  type RewardsState,
  type SaleState,
} from '@/lib/stellar';
import { invokeContract, TX_PHASE_LABEL, type TxPhase } from '@/lib/tx';
import styles from './PortfolioView.module.scss';

const TOTAL_SHARES = BigInt(DEPLOYMENT.asset.totalShares);

type TabValue = 'assets' | 'orders';
const TABS: { label: string; value: TabValue }[] = [
  { label: 'My assets', value: 'assets' },
  { label: 'My orders', value: 'orders' },
];

/** The user's position as a property card, plus their open secondary-market
 *  orders on a second tab. */
export function PortfolioView() {
  const { status, address, restoring, shareBalance, openConnectModal, refreshBalances } =
    useWallet();
  const [tab, setTab] = useState<TabValue>('assets');
  const [sale, setSale] = useState<SaleState | null>(null);
  const [rewards, setRewards] = useState<RewardsState | null>(null);
  /** null = loading; the wallet's open secondary-market orders (escrow). */
  const [myOrders, setMyOrders] = useState<Order[] | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  /** 'choice' asks buyback vs market first, then routes to the real modal. */
  const [sell, setSell] = useState<'closed' | 'choice' | SellRoute>('closed');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [claim, setClaim] = useState<'idle' | 'signing' | 'error'>('idle');
  /** Which wait the call in flight is in. Both buttons share it - only one of
   *  the two is on screen at a time. */
  const [phase, setPhase] = useState<TxPhase>('preparing');
  const [claimError, setClaimError] = useState<string | null>(null);
  const router = useRouter();

  const refreshSale = useCallback(() => {
    fetchSaleState()
      .then(setSale)
      .catch(() => {});
  }, []);

  const refreshRewards = useCallback(() => {
    if (!address) return;
    fetchRewards(address)
      .then(setRewards)
      .catch(() => {});
  }, [address]);

  const refreshOrders = useCallback(() => {
    if (!address) return;
    fetchOrders()
      .then((all) => setMyOrders(all.filter((o) => o.seller === address)))
      .catch(() => setMyOrders((prev) => prev ?? []));
  }, [address]);

  useEffect(() => {
    refreshSale();
    refreshRewards();
    refreshOrders();
  }, [refreshSale, refreshRewards, refreshOrders]);

  const onPurchased = useCallback(() => {
    refreshSale();
    refreshBalances();
    refreshRewards();
    refreshOrders();
  }, [refreshSale, refreshBalances, refreshRewards, refreshOrders]);

  const submitClaim = useCallback(async () => {
    if (!address) return;
    setClaim('signing');
    setPhase('preparing');
    setClaimError(null);
    try {
      await invokeContract({
        contractId: DEPLOYMENT.contracts.rewards,
        method: 'claim',
        args: [Address.fromString(address).toScVal()],
        publicKey: address,
        onPhase: setPhase,
      });
      setClaim('idle');
      refreshBalances();
      refreshRewards();
    } catch (e) {
      setClaim('error');
      setClaimError(txErrorMessage(e));
    }
  }, [address, refreshBalances, refreshRewards]);

  /** Bring newly acquired shares onto the distributor's books so they start
   *  earning from the next round. Moves no money. */
  const submitSettle = useCallback(async () => {
    if (!address) return;
    setClaim('signing');
    setPhase('preparing');
    setClaimError(null);
    try {
      await invokeContract({
        contractId: DEPLOYMENT.contracts.rewards,
        method: 'settle',
        args: [Address.fromString(address).toScVal()],
        publicKey: address,
        onPhase: setPhase,
      });
      setClaim('idle');
      refreshRewards();
    } catch (e) {
      setClaim('error');
      setClaimError(txErrorMessage(e));
    }
  }, [address, refreshRewards]);

  if (status !== 'connected' || !address) {
    return (
      <main className={styles.layout}>
        <div className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>My portfolio</h2>
          <p className={styles.emptyText}>
            Connect your Freighter wallet to see your {DEMO_ASSET.symbol} position, ownership share
            and balances.
          </p>
          <Button variant='gradient' onClick={openConnectModal} disabled={restoring}>
            {restoring ? 'Restoring session…' : 'Connect wallet'}
          </Button>
        </div>
      </main>
    );
  }

  // Hoisted render helpers below lose the narrowing from the guard above.
  const wallet = address;
  const escrowed = (myOrders ?? []).reduce((sum, o) => sum + o.remaining, 0n);
  const owned = shareBalance ?? 0n;
  // Shares escrowed in open orders are still yours until someone buys them.
  const position = owned + escrowed;
  const pct = (Number((position * 10_000n) / TOTAL_SHARES) / 100).toFixed(2);
  const positionValue = sale ? formatXlm(sale.priceStroops * position) : null;
  const claimable = rewards?.claimable ?? 0n;
  /**
   * Shares in the WALLET that the distributor is not yet counting - which is
   * what `settle` can fix, and all it can fix.
   *
   * Not `position`: escrowed shares are held by the exchange contract, and the
   * distributor pays against the balance an address actually holds. Counting
   * them here made the button reappear for every listed share after a settle
   * had already done everything it could, charging a fee each time to change
   * nothing. Clamped at zero because a listing made after a settle leaves the
   * recorded balance above the wallet's.
   */
  const notEarning = rewards && owned > rewards.earningShares ? owned - rewards.earningShares : 0n;

  const items: InfoGridItem[] = [
    {
      icon: 'coins',
      title: escrowed > 0n ? 'Shares (wallet + listed)' : 'Shares held',
      value: (
        <>
          <span>{position.toString()}</span> of {formatAmount(TOTAL_SHARES.toString())}
        </>
      ),
    },
    {
      icon: 'cash',
      title: 'Earned',
      value: (
        <>
          <span>{rewards ? formatXlm(rewards.earned) : '…'}</span> XLM
        </>
      ),
    },
    {
      icon: 'chart-pie',
      title: 'Claimed',
      value: (
        <>
          <span>{rewards ? formatXlm(rewards.claimed) : '…'}</span> XLM
        </>
      ),
    },
    {
      icon: 'transfer-in',
      title: 'Available for claim',
      value: (
        <>
          <span>{rewards ? formatXlm(claimable) : '…'}</span> XLM
        </>
      ),
    },
  ];

  // Balances still loading, or a zero balance that might just mean
  // "everything is listed" - hold a card-shaped skeleton, no flicker.
  const loading = shareBalance === null || (shareBalance === 0n && myOrders === null);

  function renderAssets() {
    if (loading) return <div className={styles.cardSkeleton} aria-hidden='true' />;

    // The card appears only once the wallet actually holds shares (in the
    // wallet or escrowed) - before that the portfolio points to the market.
    if (position === 0n) {
      return (
        <div className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>No shares yet</h2>
          <p className={styles.emptyText}>
            You do not own any {DEMO_ASSET.symbol} shares. Buy your first fractional share on the
            asset market — it will appear here.
          </p>
          <Button variant='gradient' onClick={() => router.push('/')}>
            Go to market
          </Button>
        </div>
      );
    }

    return (
      <article className={styles.item}>
        {/* biome-ignore lint/a11y/useSemanticElements: a <button> wrapper would nest the gallery's arrow/dot buttons — invalid HTML that breaks hydration */}
        <div
          role='button'
          tabIndex={0}
          className={styles.link}
          onClick={() => setDetailsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDetailsOpen(true);
            }
          }}
          aria-label={`Detailed information about ${DEMO_ASSET.name}`}
        >
          <div className={styles.imageWrap}>
            <ImageGallery
              images={DEMO_ASSET.images}
              alt={`${DEMO_ASSET.name} — illustrative photo`}
              priority
            />
            <span className={styles.photoNote}>Illustrative photo · fictional demo asset</span>
          </div>

          <div className={styles.body}>
            <div className={styles.cost}>
              <h2 className={styles.costTitle}>{DEMO_ASSET.name}</h2>
              {positionValue ? (
                <div className={styles.costAmount}>{positionValue} XLM</div>
              ) : (
                <span className={`${styles.skeleton} ${styles.skeletonAmount}`} />
              )}
            </div>
            <p className={styles.location}>
              {DEMO_ASSET.location} · {pct}% ownership
            </p>

            <InfoGrid items={items} />
          </div>
        </div>

        <div className={styles.actions}>
          <Button
            variant='gradient'
            onClick={() => setBuyOpen(true)}
            disabled={sale !== null && !sale.available}
          >
            Buy more shares
          </Button>
          {/* One Sell entry point; the modal asks buyback or secondary market. */}
          <Button variant='secondary' onClick={() => setSell('choice')} disabled={owned === 0n}>
            Sell shares
          </Button>
          {notEarning > 0n ? (
            <Button
              variant='gradient'
              className={styles.claimButton}
              onClick={submitSettle}
              loading={claim === 'signing'}
            >
              {claim === 'signing'
                ? TX_PHASE_LABEL[phase]
                : `Start earning on ${notEarning.toString()} ${DEMO_ASSET.symbol}`}
            </Button>
          ) : (
            <Button
              variant='gradient'
              className={styles.claimButton}
              onClick={submitClaim}
              loading={claim === 'signing'}
              disabled={claimable === 0n}
            >
              {claim === 'signing'
                ? TX_PHASE_LABEL[phase]
                : `Claim ${rewards ? formatXlm(claimable) : '…'} XLM`}
            </Button>
          )}
          {notEarning > 0n && (
            <p className={styles.claimNote}>
              {notEarning.toString()} {DEMO_ASSET.symbol} you hold are not on the distributor's
              books yet, so they earn nothing until one free-of-charge call registers them. Buying
              from the sale or filling an order does this for you inside the purchase — these
              arrived by a plain wallet-to-wallet transfer, which no contract is watching. Rounds
              distributed before you owned the shares are not yours either way, which is what stops
              the same shares being paid twice as they change hands.
            </p>
          )}
          {escrowed > 0n && (
            <p className={styles.claimNote}>
              {escrowed.toString()} {DEMO_ASSET.symbol} are escrowed in your open orders. They are
              still yours, and they earn nothing while listed, because income is paid against the
              balance an address actually holds and those sit with the exchange contract. Cancel or
              fill the order and they start earning again after a settle.
            </p>
          )}
          {claimError && <p className={styles.claimError}>{claimError}</p>}
        </div>
      </article>
    );
  }

  function renderOrders() {
    if (myOrders === null) return <div className={styles.cardSkeleton} aria-hidden='true' />;

    if (myOrders.length === 0) {
      return (
        <div className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>You currently have no open orders</h2>
          <p className={styles.emptyText}>
            Nothing of yours is listed on the secondary market. List shares at your own price — they
            stay in on-chain escrow until a buyer takes them or you cancel.
          </p>
          <Button variant='gradient' onClick={() => setSell('market')} disabled={owned === 0n}>
            List shares for sale
          </Button>
        </div>
      );
    }

    return (
      <MyOrders
        address={wallet}
        orders={myOrders}
        onSellMore={() => setSell('market')}
        onOpenDetails={() => setDetailsOpen(true)}
        canSellMore={owned > 0n}
        onChanged={onPurchased}
      />
    );
  }

  return (
    <main className={styles.layout}>
      <div className={styles.tabs}>
        <TabsNav tabs={TABS} activeValue={tab} onTabClick={setTab} />
      </div>

      {tab === 'assets' ? renderAssets() : renderOrders()}

      <p className={styles.note}>
        Wallet {shortAddress(address)} — full on-chain history on{' '}
        <a href={`${EXPLORER}/account/${address}`} target='_blank' rel='noreferrer'>
          stellar.expert ↗
        </a>
      </p>

      {detailsOpen && <AssetDetailsModal sale={sale} onClose={() => setDetailsOpen(false)} />}
      {buyOpen && (
        <PurchaseModal sale={sale} onPurchased={onPurchased} onClose={() => setBuyOpen(false)} />
      )}
      {sell === 'choice' && (
        <SellChoiceModal
          sale={sale}
          owned={owned}
          onPick={setSell}
          onClose={() => setSell('closed')}
        />
      )}
      {sell === 'buyback' && (
        <SellModal
          sale={sale}
          owned={owned}
          onSold={onPurchased}
          onClose={() => setSell('closed')}
        />
      )}
      {sell === 'market' && (
        <ListSharesModal owned={owned} onListed={onPurchased} onClose={() => setSell('closed')} />
      )}
    </main>
  );
}
