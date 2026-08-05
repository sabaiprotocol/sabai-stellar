import { Client as AssetSaleClient } from '@sabai/bindings-asset-sale';
import { Client as ExchangeClient, type Order } from '@sabai/bindings-exchange';
import { Client as RegistryClient } from '@sabai/bindings-registry';
import { Client as RewardsClient } from '@sabai/bindings-rewards';
import { Client as ShareTokenClient, type Terms } from '@sabai/bindings-share-token';
import deployment from '../../../deployments/testnet.json';

export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
export const RPC_URL = 'https://soroban-testnet.stellar.org';
export const HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const EXPLORER = 'https://stellar.expert/explorer/testnet';
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';

export const DEPLOYMENT = deployment;

/**
 * Whether `/admin` opens for this wallet at all.
 *
 * Two keys, not one. The operator holds the switches the page actually runs;
 * the admin account gets in read-only, because Freighter can produce one of the
 * two signatures its calls need and the network refuses the rest. Both the nav
 * and the page itself ask this, so the tab can never appear for a wallet the
 * page then turns away - or stay hidden from one it would have let in.
 */
export function hasConsoleAccess(address: string | null): boolean {
  return address === DEPLOYMENT.accounts.operator || address === DEPLOYMENT.accounts.admin;
}

type SignTransaction = NonNullable<
  ConstructorParameters<typeof AssetSaleClient>[0]['signTransaction']
>;

/**
 * Sale-contract client. Without a wallet it still serves view calls -
 * simulations then run from the admin account recorded in the deployment.
 */
export function saleClient(publicKey?: string, signTransaction?: SignTransaction) {
  return new AssetSaleClient({
    contractId: deployment.contracts.assetSale,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: publicKey ?? deployment.accounts.admin,
    signTransaction,
  });
}

export function shareClient() {
  return new ShareTokenClient({
    contractId: deployment.contracts.shareToken,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: deployment.accounts.admin,
  });
}

/** Rewards-distributor client (views without a wallet, claim with one). */
export function rewardsClient(publicKey?: string, signTransaction?: SignTransaction) {
  return new RewardsClient({
    contractId: deployment.contracts.rewards,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: publicKey ?? deployment.accounts.admin,
    signTransaction,
  });
}

/** Secondary-market client (views without a wallet, orders with one). */
export function exchangeClient() {
  return new ExchangeClient({
    contractId: deployment.contracts.exchange,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: deployment.accounts.admin,
  });
}

export type { Order };

/** Every open sell order on the secondary market, oldest first. */
export async function fetchOrders(): Promise<Order[]> {
  const tx = await exchangeClient().orders();
  return tx.result;
}

export interface ExchangeConfig {
  commissionBps: number;
  minRateStroops: bigint;
  maxRateStroops: bigint;
  available: boolean;
}

export async function fetchExchangeConfig(): Promise<ExchangeConfig> {
  const ex = exchangeClient();
  const [bps, min, max, available] = await Promise.all([
    ex.commission_bps(),
    ex.min_rate(),
    ex.max_rate(),
    ex.available(),
  ]);
  return {
    commissionBps: bps.result,
    minRateStroops: min.result,
    maxRateStroops: max.result,
    available: available.result,
  };
}

export interface SaleState {
  priceStroops: bigint;
  /** Shares still in the sale contract. Everything else is held by investors. */
  remaining: bigint;
  /** What `buy` would accept right now: the inventory, or 0 while switched off. */
  forSale: bigint;
  available: boolean;
  /** The platform's cut of the price, in basis points. */
  commissionBps: number;
}

export async function fetchSaleState(): Promise<SaleState> {
  const sale = saleClient();
  const [price, remaining, forSale, available, commission] = await Promise.all([
    sale.price(),
    sale.remaining(),
    sale.available_for_purchase(),
    sale.available(),
    sale.commission_bps(),
  ]);
  return {
    priceStroops: price.result,
    remaining: remaining.result,
    forSale: forSale.result,
    available: available.result,
    commissionBps: commission.result,
  };
}

export async function fetchShareBalance(address: string): Promise<bigint> {
  const tx = await shareClient().balance({ id: address });
  return tx.result;
}

/** Compliance registry client - views only, no wallet needed. */
export function registryClient() {
  return new RegistryClient({
    contractId: deployment.contracts.registry,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: deployment.accounts.admin,
  });
}

export interface GateStatus {
  /** The one answer every contract acts on. */
  allowed: boolean;
  /** Verified as an investor, ignoring the halt and the suspension. */
  whitelisted: boolean;
  /** Verified but suspended by the compliance provider. */
  frozen: boolean;
  /** The whole deployment is halted by the issuer. */
  paused: boolean;
}

/**
 * The three separate reasons `allowed` can be false, so the UI can say which
 * one applies instead of telling a suspended investor to pass KYC again.
 */
export async function fetchGateStatus(address: string): Promise<GateStatus> {
  const registry = registryClient();
  const [allowed, whitelisted, frozen, paused] = await Promise.all([
    registry.allowed({ addr: address }),
    registry.whitelisted({ addr: address }),
    registry.frozen({ addr: address }),
    registry.paused(),
  ]);
  return {
    allowed: allowed.result,
    whitelisted: whitelisted.result,
    frozen: frozen.result,
    paused: paused.result,
  };
}

/** XLM (stroops) the sale contract holds for buybacks. */
export async function fetchBuybackPool(): Promise<bigint> {
  const tx = await saleClient().buyback_pool();
  return tx.result;
}

/** Aggregate contract state for the admin panel. */
export interface AdminState {
  sale: SaleState;
  buybackPool: bigint;
  exchange: ExchangeConfig;
  openOrders: number;
  escrowedShares: bigint;
  rewardsDeposited: bigint;
  /** XLM the distributor holds. */
  rewardsPool: bigint;
  /** Upper bound on what holders can still claim from it. */
  rewardsOutstanding: bigint;
  totalSupply: bigint;
  /** The issuance already happened and cannot happen again. */
  issued: boolean;
  /** Deployment-wide halt in the registry. */
  paused: boolean;
  /** Read from the registry rather than the deployment file, so the panel
   *  reflects a role that was rotated after this build was made. */
  roles: Roles;
}

export interface Roles {
  /** The 2-of-3 multisig account. */
  admin: string;
  /** The hot key the switches answer to. */
  operator: string;
  /** A successor named by `transfer_admin` and still to accept, if any. */
  pendingAdmin: string | null;
}

export async function fetchRoles(): Promise<Roles> {
  const registry = registryClient();
  const [admin, operator, pending] = await Promise.all([
    registry.admin(),
    registry.operator(),
    registry.pending_admin(),
  ]);
  return {
    admin: admin.result,
    operator: operator.result,
    pendingAdmin: pending.result ?? null,
  };
}

export type { Terms };

/**
 * The legal wrapper the shares represent an interest in, or null when the
 * issuer has published none. See docs/LEGAL-STRUCTURE.md.
 */
export async function fetchTerms(): Promise<Terms | null> {
  const tx = await shareClient().terms();
  return tx.result ?? null;
}

export async function fetchAdminState(): Promise<AdminState> {
  const rewards = rewardsClient();
  const shares = shareClient();
  const [
    sale,
    buybackPool,
    exchange,
    orders,
    deposited,
    pool,
    outstanding,
    supply,
    issued,
    paused,
    roles,
  ] = await Promise.all([
    fetchSaleState(),
    fetchBuybackPool(),
    fetchExchangeConfig(),
    fetchOrders(),
    rewards.total_deposited(),
    rewards.pool(),
    rewards.outstanding(),
    shares.total_supply(),
    shares.issued(),
    registryClient().paused(),
    fetchRoles(),
  ]);
  return {
    sale,
    buybackPool,
    exchange,
    openOrders: orders.length,
    escrowedShares: orders.reduce((sum, o) => sum + o.remaining, 0n),
    rewardsDeposited: deposited.result,
    rewardsPool: pool.result,
    rewardsOutstanding: outstanding.result,
    totalSupply: supply.result,
    issued: issued.result,
    paused: paused.result,
    roles,
  };
}

export interface RewardsState {
  /** Claimable right now. */
  claimable: bigint;
  /** Lifetime claimed. */
  claimed: bigint;
  /** claimed + claimable. */
  earned: bigint;
  /**
   * Shares currently accruing income for this wallet. Lower than the balance
   * when shares arrived after the last settle: they earn nothing until the
   * position is brought up to date, which is what stops the same shares being
   * paid for a round twice as they move between wallets.
   */
  earningShares: bigint;
}

export async function fetchRewards(address: string): Promise<RewardsState> {
  const rewards = rewardsClient();
  const [claimable, claimed, earned, position] = await Promise.all([
    rewards.claimable({ user: address }),
    rewards.claimed({ user: address }),
    rewards.earned({ user: address }),
    rewards.position({ user: address }),
  ]);
  return {
    claimable: claimable.result,
    claimed: claimed.result,
    earned: earned.result,
    earningShares: position.result.balance,
  };
}

/** XLM balance via Horizon; null when the account is not funded yet. */
export async function fetchXlmBalance(address: string): Promise<string | null> {
  const res = await fetch(`${HORIZON_URL}/accounts/${address}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    balances: { asset_type: string; balance: string }[];
  };
  return data.balances.find((b) => b.asset_type === 'native')?.balance ?? null;
}
