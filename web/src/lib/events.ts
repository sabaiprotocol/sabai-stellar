import { rpc, scValToNative } from '@stellar/stellar-sdk';
import { DEPLOYMENT, RPC_URL } from './stellar';

/**
 * On-chain activity read straight from Soroban RPC (`getEvents`). The dApp
 * has no backend: contract events are the history.
 *
 * Event shapes (see each contract's src/events.rs). The `#[contractevent]`
 * macro puts the struct name in snake_case as topic[0], then every
 * `#[topic]` field, and the remaining fields go into the data vec:
 *
 *   asset-sale   buy         [buy, buyer]           -> [amount, cost, commission]
 *                sell        [sell, seller]         -> [amount, payout]
 *   exchange     order_added [order_added, seller]  -> [order_id, amount, rate]
 *                order_swap  [order_swap, buyer, seller] -> [order_id, amount, cost, payout]
 *                order_closed[order_closed, seller] -> [order_id, by_admin]
 *   rewards      claim       [claim, user]          -> [amount]
 */

/** ~24h of ledgers at 5s close time (RPC keeps ~7 days). */
const LOOKBACK_LEDGERS = 17_000;
/** Safety net for the cursor walk - 10 x ~10k ledgers covers the window. */
const MAX_PAGES = 10;

export interface RecentBuy {
  buyer: string;
  amount: bigint;
  cost: bigint;
  txHash: string;
  closedAt: string;
}

export type ActivityKind =
  | 'buy'
  | 'sell'
  | 'claim'
  /** A listing with no later fill or cancellation in the window. */
  | 'list'
  /** A listing that was later filled or cancelled. */
  | 'list-closed'
  | 'unlist'
  | 'p2p-buy'
  | 'p2p-sell';

export interface ActivityRecord {
  kind: ActivityKind;
  /** Shares moved (0 for claims). */
  amount: bigint;
  /** Stroops paid (buy/list ask) or received (sell/claim/p2p-sell). */
  stroops: bigint;
  /** Counterparty address for P2P rows, null otherwise. */
  counterparty: string | null;
  /** Exchange order this row belongs to, for the ones that have one. */
  orderId: bigint | null;
  txHash: string;
  closedAt: string;
}

interface RawEvent {
  topics: unknown[];
  data: unknown;
  txHash: string;
  closedAt: string;
}

/** Ledger a paging cursor points at ("<toid>-<index>", toid = ledger << 32). */
function ledgerOfCursor(cursor: string): number {
  return Number(BigInt(cursor.split('-')[0]) >> 32n);
}

/**
 * All decodable events of the given contracts within the lookback window.
 *
 * RPC scans a bounded slice of ledgers per request (~10k) and happily
 * returns an EMPTY page with a cursor when that slice held no events - so
 * paging must follow the cursor until it reaches the tip, not stop at the
 * first short page (that bug made the history look empty).
 */
async function fetchEvents(contractIds: string[]): Promise<RawEvent[]> {
  const server = new rpc.Server(RPC_URL);
  const latest = await server.getLatestLedger();
  const startLedger = Math.max(latest.sequence - LOOKBACK_LEDGERS, 1);
  const filters = [{ type: 'contract' as const, contractIds }];

  const out: RawEvent[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await server.getEvents(
      cursor ? { cursor, filters, limit: 200 } : { startLedger, filters, limit: 200 },
    );
    for (const e of res.events) {
      try {
        out.push({
          topics: e.topic.map((t) => scValToNative(t)),
          data: scValToNative(e.value),
          txHash: e.txHash,
          closedAt: e.ledgerClosedAt,
        });
      } catch {}
    }
    const next = res.cursor;
    if (!next || next === cursor) break;
    cursor = next;
    if (ledgerOfCursor(next) >= res.latestLedger - 1) break;
  }
  return out;
}

/** Live Buy events for the market feed, newest first. */
export async function fetchRecentBuys(limit = 8): Promise<RecentBuy[]> {
  const events = await fetchEvents([DEPLOYMENT.contracts.assetSale]);
  const buys: RecentBuy[] = [];
  for (const e of events) {
    if (e.topics[0] !== 'buy') continue;
    // `cost` is what the buyer paid in full; the commission that follows it is
    // the issuer's business, not something a public feed needs to show.
    const [amount, cost] = e.data as [bigint, bigint, bigint];
    buys.push({
      buyer: String(e.topics[1]),
      amount,
      cost,
      txHash: e.txHash,
      closedAt: e.closedAt,
    });
  }
  return buys.reverse().slice(0, limit);
}

/* The three contracts that emit money movement. The registry is left out on
   purpose: admissions are a compliance log, not wallet activity. */
const ALL_CONTRACTS = [
  DEPLOYMENT.contracts.assetSale,
  DEPLOYMENT.contracts.exchange,
  DEPLOYMENT.contracts.rewards,
];

/** One decoded event, newest first. */
export interface RawActivity {
  /** Event name, e.g. 'buy', 'order_swap'. */
  name: string;
  /** Addresses indexed as topics (actor, and counterparty for swaps). */
  actors: string[];
  /** Data fields as strings, ready to print. */
  data: string[];
  txHash: string;
  closedAt: string;
}

/** Every event those contracts emitted - the admin panel's global feed. */
export async function fetchAllActivity(): Promise<RawActivity[]> {
  const events = await fetchEvents(ALL_CONTRACTS);
  return events
    .map((e) => {
      const [name, ...actors] = e.topics as [string, ...string[]];
      const data = Array.isArray(e.data) ? e.data : e.data === null ? [] : [e.data];
      return {
        name,
        actors: actors.map(String),
        data: data.map((v) => String(v)),
        txHash: e.txHash,
        closedAt: e.closedAt,
      };
    })
    .reverse();
}

/**
 * Everything the given wallet did on-chain, newest first. Reads the sale,
 * exchange and rewards contracts in one RPC call and keeps the events whose
 * topics name this address.
 */
export async function fetchActivity(address: string): Promise<ActivityRecord[]> {
  const events = await fetchEvents(ALL_CONTRACTS);

  const out: ActivityRecord[] = [];
  /** Orders this wallet listed that later got filled or cancelled. */
  const settled = new Set<string>();

  for (const e of events) {
    const [name, first, second] = e.topics as [string, string?, string?];
    const base = {
      txHash: e.txHash,
      closedAt: e.closedAt,
      counterparty: null,
      orderId: null,
    };

    switch (name) {
      case 'buy': {
        if (first !== address) break;
        const [amount, cost] = e.data as [bigint, bigint, bigint];
        out.push({ ...base, kind: 'buy', amount, stroops: cost });
        break;
      }
      case 'sell': {
        if (first !== address) break;
        const [amount, payout] = e.data as [bigint, bigint];
        out.push({ ...base, kind: 'sell', amount, stroops: payout });
        break;
      }
      case 'claim': {
        if (first !== address) break;
        const [amount] = e.data as [bigint];
        out.push({ ...base, kind: 'claim', amount: 0n, stroops: amount });
        break;
      }
      case 'order_added': {
        if (first !== address) break;
        const [orderId, amount, rate] = e.data as [bigint, bigint, bigint];
        out.push({ ...base, kind: 'list', orderId, amount, stroops: amount * rate });
        break;
      }
      case 'order_closed': {
        const [orderId] = e.data as [bigint, boolean];
        settled.add(orderId.toString());
        if (first !== address) break;
        out.push({ ...base, kind: 'unlist', orderId, amount: 0n, stroops: 0n });
        break;
      }
      case 'order_swap': {
        // Both sides are topics - one event feeds the buyer's and the
        // seller's history with the right sign.
        const [orderId, amount, cost, payout] = e.data as [bigint, bigint, bigint, bigint];
        settled.add(orderId.toString());
        if (first === address) {
          out.push({
            ...base,
            kind: 'p2p-buy',
            orderId,
            amount,
            stroops: cost,
            counterparty: second ?? null,
          });
        } else if (second === address) {
          out.push({
            ...base,
            kind: 'p2p-sell',
            orderId,
            amount,
            stroops: payout,
            counterparty: first ?? null,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  // A listing is only still open if no later event closed or filled it.
  // Without this every listing the wallet ever made reads as "Open" forever.
  return out
    .map((r) =>
      r.kind === 'list' && r.orderId !== null && settled.has(r.orderId.toString())
        ? { ...r, kind: 'list-closed' as const }
        : r,
    )
    .reverse();
}
