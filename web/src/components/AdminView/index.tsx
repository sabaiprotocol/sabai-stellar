'use client';

import { Address, nativeToScVal, type xdr } from '@stellar/stellar-sdk';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/UI/Button';
import { Spinner } from '@/components/UI/Spinner';
import { useWallet } from '@/components/WalletProvider';
import { fetchAllActivity, type RawActivity } from '@/lib/events';
import { formatXlm, shortAddress, txErrorMessage, xlmToStroops } from '@/lib/format';
import {
  type AdminState,
  DEPLOYMENT,
  EXPLORER,
  fetchAdminState,
  hasConsoleAccess,
} from '@/lib/stellar';
import { invokeContract, TX_PHASE_LABEL, type TxPhase } from '@/lib/tx';
import styles from './AdminView.module.scss';

const ADMIN = DEPLOYMENT.accounts.admin;
const OPERATOR = DEPLOYMENT.accounts.operator;
const { quorum, signers } = DEPLOYMENT.governance;

type Pending = { method: string; phase: TxPhase } | null;

const CONTRACTS: { name: string; id: string }[] = [
  { name: 'Compliance registry', id: DEPLOYMENT.contracts.registry },
  { name: 'Share token', id: DEPLOYMENT.contracts.shareToken },
  { name: 'Asset sale', id: DEPLOYMENT.contracts.assetSale },
  { name: 'Asset exchange', id: DEPLOYMENT.contracts.exchange },
  { name: 'Rewards', id: DEPLOYMENT.contracts.rewards },
];

/**
 * Everything the multisig admin holds and this page therefore cannot run.
 *
 * They are listed rather than hidden. A console that only shows what the
 * connected key can do makes the boundary invisible, and the boundary is the
 * interesting part: a browser wallet supplies one signature, and each of these
 * needs two of three.
 */
const ADMIN_ONLY: { title: string; text: string; how: string }[] = [
  {
    title: 'Lift the halt',
    text: 'Halting is one hot signature; starting the asset again is not. Being wrong about stopping costs an hour of downtime, being wrong about restarting can cost an investor their money.',
    how: 'npm run admin -- resume',
  },
  {
    title: 'Change the share price',
    text: 'A price of one stroop empties the inventory into whoever notices first, so a stolen operator key would be worth the whole tranche.',
    how: 'npm run admin -- set-price 120',
  },
  {
    title: 'Withdraw from the buyback pool',
    text: 'The only entrypoint in the sale that moves money outward.',
    how: 'npm run admin -- withdraw-buyback 100',
  },
  {
    title: 'Issue or confiscate shares',
    text: 'The issuance already ran and can never run again, whoever signs. A forced revocation returns shares to the treasury address fixed at deployment.',
    how: 'share_token.mint / revoke_shares, 2-of-3',
  },
  {
    title: 'Replace the contract code, or hand the admin role on',
    text: 'An upgrade re-points a contract at wasm already installed on the network. A handover names a successor who then has to sign for it themselves.',
    how: 'npm run governance-drill',
  },
];

/** Operator console: the switches one hot key holds, and the state behind them. */
export function AdminView() {
  const { status, address, restoring, openConnectModal } = useWallet();
  const [state, setState] = useState<AdminState | null>(null);
  const [feed, setFeed] = useState<RawActivity[] | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [result, setResult] = useState<{ method: string; hash: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fundAmount, setFundAmount] = useState('');
  const [rewardAmount, setRewardAmount] = useState('');
  const [orderId, setOrderId] = useState('');

  const isOperator = address === OPERATOR;
  const isAdminAccount = address === ADMIN;

  const refresh = useCallback(() => {
    fetchAdminState()
      .then(setState)
      .catch(() => {});
    fetchAllActivity()
      .then(setFeed)
      .catch(() => setFeed((prev) => prev ?? []));
  }, []);

  useEffect(() => {
    if (isOperator || isAdminAccount) refresh();
  }, [isOperator, isAdminAccount, refresh]);

  /** Every write goes through the same padded-fee path the rest of the app uses. */
  const run = useCallback(
    async (label: string, contractId: string, method: string, args: xdr.ScVal[]) => {
      if (!address) return;
      setPending({ method: label, phase: 'preparing' });
      setError(null);
      setResult(null);
      try {
        const hash = await invokeContract({
          contractId,
          method,
          args,
          publicKey: address,
          onPhase: (phase) => setPending({ method: label, phase }),
        });
        setResult({ method: label, hash });
        refresh();
      } catch (e) {
        setError(txErrorMessage(e));
      } finally {
        setPending(null);
      }
    },
    [address, refresh],
  );

  if (status !== 'connected' || !address) {
    return (
      <main className={styles.layout}>
        <div className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>Admin</h2>
          <p className={styles.emptyText}>Connect the operator wallet to manage the contracts.</p>
          <Button variant='gradient' onClick={openConnectModal} disabled={restoring}>
            {restoring ? 'Restoring session…' : 'Connect wallet'}
          </Button>
        </div>
      </main>
    );
  }

  if (!hasConsoleAccess(address)) {
    return (
      <main className={styles.layout}>
        <div className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>Not a role on this deployment</h2>
          <p className={styles.emptyText}>
            Two keys run this asset and neither is the one you connected. Every action on this page
            is enforced on-chain by <code>require_auth</code> against the contract&rsquo;s stored
            roles, so a different wallet cannot execute them even with the page open.
          </p>
          <p className={styles.emptyText}>
            Operator (this page): <code>{OPERATOR}</code>
          </p>
          <p className={styles.emptyText}>
            Admin, {quorum}-of-{signers} multisig: <code>{ADMIN}</code>
          </p>
        </div>
      </main>
    );
  }

  const busy = pending !== null;
  /** Only the button that started the call spins; the rest just go disabled. */
  const running = (label: string) => pending?.method === label;
  const halted = state?.paused === true;
  // The roles come off the registry, not out of the deployment file this build
  // was compiled against. If they disagree, a role was rotated since and the
  // buttons below would be aimed at the wrong key.
  const stale = state !== null && state.roles.operator !== OPERATOR;

  return (
    <main className={styles.layout}>
      {stale && (
        <div className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>This build is out of date</h2>
          <p className={styles.emptyText}>
            The registry names <code>{state.roles.operator}</code> as its operator, and this build
            was compiled against <code>{OPERATOR}</code>. Re-run <code>npm run deploy</code> or
            update <code>deployments/testnet.json</code>.
          </p>
        </div>
      )}

      {isAdminAccount && (
        <div className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>This is the multisig account</h2>
          <p className={styles.emptyText}>
            You connected the admin account itself. Its master key carries weight 0 and its medium
            threshold is {quorum}, so Freighter can produce one of the {quorum} signatures every
            admin call needs and the network will refuse anything sent from here. The state below is
            live; the buttons are the operator&rsquo;s.
          </p>
        </div>
      )}

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Share price</span>
          <span className={styles.statValue}>
            {state ? `${formatXlm(state.sale.priceStroops)} XLM` : '…'}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Sale status</span>
          <span className={styles.statValue}>
            {state ? (state.sale.available ? 'Open' : 'Closed') : '…'}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Deployment</span>
          <span className={styles.statValue}>{state ? (halted ? 'HALTED' : 'Live') : '…'}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Held / supply</span>
          <span className={styles.statValue}>
            {state ? `${state.totalSupply - state.sale.remaining} / ${state.totalSupply}` : '…'}
          </span>
        </div>
        {/* Held here vs actually on offer: a closed sale is sitting on
            inventory it will not sell, and the two numbers diverge. */}
        <div className={styles.stat}>
          <span className={styles.statLabel}>Inventory / on offer</span>
          <span className={styles.statValue}>
            {state ? `${state.sale.remaining} / ${state.sale.forSale}` : '…'}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Commission sale / market</span>
          <span className={styles.statValue}>
            {state
              ? `${state.sale.commissionBps / 100}% / ${state.exchange.commissionBps / 100}%`
              : '…'}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Buyback pool</span>
          <span className={styles.statValue}>
            {state ? `${formatXlm(state.buybackPool)} XLM` : '…'}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Rewards deposited</span>
          <span className={styles.statValue}>
            {state ? `${formatXlm(state.rewardsDeposited)} XLM` : '…'}
          </span>
        </div>
        {/* The solvency pair. Read off the contract, not computed here: the
            pool has to cover every claim still outstanding. */}
        <div className={styles.stat}>
          <span className={styles.statLabel}>Rewards pool / owed</span>
          <span className={styles.statValue}>
            {state
              ? `${formatXlm(state.rewardsPool)} / ${formatXlm(state.rewardsOutstanding)} XLM`
              : '…'}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Exchange status</span>
          <span className={styles.statValue}>
            {state ? (state.exchange.available ? 'Open' : 'Paused') : '…'}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Open orders / escrow</span>
          <span className={styles.statValue}>
            {state ? `${state.openOrders} / ${state.escrowedShares}` : '…'}
          </span>
        </div>
        {/* Read from the registry, not from the deployment file: a role rotated
            after this build was made would otherwise show the old key. */}
        <div className={styles.stat}>
          <span className={styles.statLabel}>Handover pending</span>
          <span className={styles.statValue}>
            {state
              ? state.roles.pendingAdmin
                ? shortAddress(state.roles.pendingAdmin)
                : 'no'
              : '…'}
          </span>
        </div>
      </div>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>
          Incident switch <span className={styles.panelHint}>compliance-registry contract</span>
        </h3>
        <div className={styles.actions}>
          <div className={styles.action}>
            <span className={styles.actionTitle}>Halt every movement of shares</span>
            <span className={styles.actionText}>
              One transaction against the registry stops minting, transfers, purchases, buybacks,
              listings and fills across all five contracts — every write asks this contract whether
              an address may hold shares, so nothing else needs a pause of its own. Rent already
              earned stays claimable: halting the asset is not the same as withholding a
              holder&rsquo;s money. Suspending one investor is the KYC provider&rsquo;s{' '}
              <code>freeze</code>, not this.
            </span>
            <span className={styles.actionText}>
              Lifting it needs {quorum} of {signers} admin signatures, which is why there is no
              Resume button here.
            </span>
            <div className={styles.actionRow}>
              <button
                type='button'
                className={`${styles.button} ${styles.buttonGhost}`}
                disabled={busy || !isOperator || halted}
                onClick={() =>
                  run('Halt deployment', DEPLOYMENT.contracts.registry, 'pause', [
                    Address.fromString(address).toScVal(),
                  ])
                }
              >
                {running('Halt deployment') && <Spinner />}
                {halted ? 'Halted' : 'Halt'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>
          Markets <span className={styles.panelHint}>asset-sale and asset-exchange contracts</span>
        </h3>
        <div className={styles.actions}>
          <div className={styles.action}>
            <span className={styles.actionTitle}>Primary sale</span>
            <span className={styles.actionText}>
              Open or close new purchases (<code>set_available</code>). Selling back to the buyback
              pool keeps working either way: closing distribution must not trap a holder who wants
              out.
            </span>
            <div className={styles.actionRow}>
              <button
                type='button'
                className={styles.button}
                disabled={busy || !isOperator || state?.sale.available === true}
                onClick={() =>
                  run('Open sale', DEPLOYMENT.contracts.assetSale, 'set_available', [
                    Address.fromString(address).toScVal(),
                    nativeToScVal(true),
                  ])
                }
              >
                {running('Open sale') && <Spinner />}
                Open
              </button>
              <button
                type='button'
                className={`${styles.button} ${styles.buttonGhost}`}
                disabled={busy || !isOperator || state?.sale.available === false}
                onClick={() =>
                  run('Close sale', DEPLOYMENT.contracts.assetSale, 'set_available', [
                    Address.fromString(address).toScVal(),
                    nativeToScVal(false),
                  ])
                }
              >
                {running('Close sale') && <Spinner />}
                Close
              </button>
            </div>
          </div>

          <div className={styles.action}>
            <span className={styles.actionTitle}>Secondary market</span>
            <span className={styles.actionText}>
              Pause new orders and fills. Sellers can always cancel and reclaim their escrow.
            </span>
            <div className={styles.actionRow}>
              <button
                type='button'
                className={styles.button}
                disabled={busy || !isOperator || state?.exchange.available === true}
                onClick={() =>
                  run('Open exchange', DEPLOYMENT.contracts.exchange, 'set_available', [
                    Address.fromString(address).toScVal(),
                    nativeToScVal(true),
                  ])
                }
              >
                {running('Open exchange') && <Spinner />}
                Open
              </button>
              <button
                type='button'
                className={`${styles.button} ${styles.buttonGhost}`}
                disabled={busy || !isOperator || state?.exchange.available === false}
                onClick={() =>
                  run('Pause exchange', DEPLOYMENT.contracts.exchange, 'set_available', [
                    Address.fromString(address).toScVal(),
                    nativeToScVal(false),
                  ])
                }
              >
                {running('Pause exchange') && <Spinner />}
                Pause
              </button>
            </div>
          </div>

          <div className={styles.action}>
            <span className={styles.actionTitle}>Force-cancel an order</span>
            <span className={styles.actionText}>
              Moderation tool (<code>close_order_by</code>): the escrowed shares always go back to
              the seller, never to whoever cancelled it. That is what makes it safe to leave with a
              hot key.
            </span>
            <div className={styles.actionRow}>
              <input
                className={styles.input}
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder='order id'
                inputMode='numeric'
                aria-label='Order id to force-cancel'
              />
              <button
                type='button'
                className={`${styles.button} ${styles.buttonGhost}`}
                disabled={busy || !isOperator || !/^\d+$/.test(orderId.trim())}
                onClick={() =>
                  run('Force-cancel order', DEPLOYMENT.contracts.exchange, 'close_order_by', [
                    Address.fromString(address).toScVal(),
                    nativeToScVal(BigInt(orderId.trim()), { type: 'u64' }),
                  ])
                }
              >
                {running('Force-cancel order') && <Spinner />}
                Cancel
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>
          Money in{' '}
          <span className={styles.panelHint}>rewards-distributor and the buyback pool</span>
        </h3>
        <div className={styles.actions}>
          <div className={styles.action}>
            <span className={styles.actionTitle}>Deposit a reward round</span>
            <span className={styles.actionText}>
              Distribute XLM pro rata across all {DEPLOYMENT.asset.totalShares} shares (
              <code>deposit</code>). Holders then claim from their portfolio. Safe for a hot key
              because the money only moves inward: nothing in that contract sends it anywhere but to
              a holder claiming their own share.
            </span>
            <div className={styles.actionRow}>
              <input
                className={styles.input}
                value={rewardAmount}
                onChange={(e) => setRewardAmount(e.target.value)}
                placeholder='50'
                inputMode='decimal'
                aria-label='Reward round amount in XLM'
              />
              <button
                type='button'
                className={styles.button}
                disabled={busy || !isOperator || xlmToStroops(rewardAmount) === null}
                onClick={() => {
                  const stroops = xlmToStroops(rewardAmount);
                  if (stroops === null) return;
                  run('Deposit rewards', DEPLOYMENT.contracts.rewards, 'deposit', [
                    Address.fromString(address).toScVal(),
                    nativeToScVal(stroops, { type: 'i128' }),
                  ]);
                }}
              >
                {running('Deposit rewards') && <Spinner />}
                Deposit
              </button>
            </div>
          </div>

          <div className={styles.action}>
            <span className={styles.actionTitle}>Fund the buyback pool</span>
            <span className={styles.actionText}>
              Move XLM from this wallet into the pool that pays instant sell-backs (
              <code>fund_buyback</code>). Permissionless — anyone may top it up, so this one needs
              no role at all.
            </span>
            <div className={styles.actionRow}>
              <input
                className={styles.input}
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                placeholder='500'
                inputMode='decimal'
                aria-label='Amount to add to the buyback pool, in XLM'
              />
              {/* Permissionless in the contract, but still sourced by the
                  connected account - and the multisig cannot source anything
                  with the one signature Freighter can give it. */}
              <button
                type='button'
                className={styles.button}
                disabled={busy || isAdminAccount || xlmToStroops(fundAmount) === null}
                onClick={() => {
                  const stroops = xlmToStroops(fundAmount);
                  if (stroops === null) return;
                  run('Fund buyback', DEPLOYMENT.contracts.assetSale, 'fund_buyback', [
                    Address.fromString(address).toScVal(),
                    nativeToScVal(stroops, { type: 'i128' }),
                  ]);
                }}
              >
                {running('Fund buyback') && <Spinner />}
                Fund
              </button>
            </div>
          </div>
        </div>

        {pending && (
          <p className={styles.actionText}>
            {pending.method} — {TX_PHASE_LABEL[pending.phase]}
          </p>
        )}
        {result && (
          <p className={styles.result}>
            {result.method} confirmed —{' '}
            <a href={`${EXPLORER}/tx/${result.hash}`} target='_blank' rel='noreferrer'>
              view transaction ↗
            </a>
          </p>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </section>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>
          Held by the {quorum}-of-{signers} admin
          <span className={styles.panelHint}>not reachable from a browser wallet</span>
        </h3>
        <p className={styles.actionText}>
          The admin is a Stellar account with three signers, a medium threshold of {quorum} and a
          master key of weight 0 — enforced by the network, not by this page.{' '}
          <a href={`${EXPLORER}/account/${ADMIN}`} target='_blank' rel='noreferrer'>
            see its signers ↗
          </a>
        </p>
        <div className={styles.actions}>
          {ADMIN_ONLY.map((item) => (
            <div key={item.title} className={styles.action}>
              <span className={styles.actionTitle}>{item.title}</span>
              <span className={styles.actionText}>{item.text}</span>
              <code className={styles.actionText}>{item.how}</code>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>
          All transactions <span className={styles.panelHint}>every contract event, ~24h</span>
        </h3>
        {feed === null ? (
          <p className={styles.actionText}>Reading contract events from Soroban RPC…</p>
        ) : feed.length === 0 ? (
          <p className={styles.actionText}>No contract activity in the last 24 hours.</p>
        ) : (
          <ul className={styles.feed}>
            {feed.map((e) => (
              <li key={`${e.txHash}-${e.name}-${e.actors.join()}`} className={styles.row}>
                <span className={styles.rowName}>{e.name}</span>
                <span className={styles.rowActors}>
                  {e.actors.map((a) => shortAddress(a)).join(' → ') || '—'}
                </span>
                <span className={styles.rowData}>{e.data.join(' · ') || '—'}</span>
                <span className={styles.rowTime}>
                  {new Date(e.closedAt).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <a
                  className={styles.rowLink}
                  href={`${EXPLORER}/tx/${e.txHash}`}
                  target='_blank'
                  rel='noreferrer'
                >
                  tx ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>Deployed contracts</h3>
        <div className={styles.contracts}>
          {CONTRACTS.map((c) => (
            <div key={c.id} className={styles.contractRow}>
              <span className={styles.contractName}>{c.name}</span>
              <span className={styles.contractId}>{c.id}</span>
              <a
                className={styles.rowLink}
                href={`${EXPLORER}/contract/${c.id}`}
                target='_blank'
                rel='noreferrer'
              >
                explorer ↗
              </a>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
