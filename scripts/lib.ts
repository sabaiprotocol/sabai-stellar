import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CONTRACTS_DIR = join(ROOT, 'contracts');
export const WASM_DIR = join(CONTRACTS_DIR, 'target', 'wasm32v1-none', 'release');
export const DEPLOYMENTS_FILE = join(ROOT, 'deployments', 'testnet.json');

export const NETWORK = 'testnet';
export const RPC_URL = 'https://soroban-testnet.stellar.org';
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';
export const EXPLORER = 'https://stellar.expert/explorer/testnet';

// Demo asset (fictional - see README compliance disclaimer)
export const ASSET_NAME = 'Sabai Lagoon Residence No. 1';
export const ASSET_SYMBOL = 'SLR1';
/** 100 XLM per share, in stroops (1 XLM = 10^7). */
export const SHARE_PRICE_STROOPS = 1_000_000_000n;
/**
 * Total shares of the asset. Also the token's hard supply cap and the number
 * rewards-distributor divides income by; those three have to be one number or
 * the distributor can promise more rent than it holds.
 */
export const TOTAL_SHARES = 1000n;
/** First reward round, deposited once demo holders exist. */
export const REWARD_ROUND_STROOPS = 500_000_000n;
/**
 * The issuer buys shares back 5% below the primary price (500 bps).
 * Not cosmetic: at par, anyone could buy and sell in a loop and move the whole
 * buyback pool into the treasury for the cost of fees.
 */
export const BUYBACK_DISCOUNT_BPS = 500;
/**
 * The platform's cut of a primary sale: 200 bps = 2%. The buyer pays the
 * advertised price either way; this decides how much of it reaches the
 * issuer's treasury and how much the platform's fee account.
 */
export const SALE_COMMISSION_BPS = 200;
/**
 * Shares moved from custody into the sale contract. The whole issuance here,
 * because this asset is offered in full - a partial first tranche is this
 * number, not a code change, and the rest stays in the treasury.
 */
export const SALE_TRANCHE = TOTAL_SHARES;

/**
 * The four documents the register anchors: the constitutional bundle of the
 * per-asset company - articles, operating agreement, subscription agreement,
 * risk factors.
 *
 * The bundle, not the whole pack. What the hash has to pin down is the text an
 * investor is asked to sign, so that a version quietly edited after they signed
 * no longer matches the ledger. The framework license, the platform terms and
 * the operating policy govern other parties and change on their own schedule;
 * anchoring them would make every unrelated edit look like an amendment of the
 * investor's own agreement.
 */
export const TERMS_BUNDLE = [
  'docs/legal/03-ARTICLES-OF-ORGANIZATION.md',
  'docs/legal/04-OPERATING-AGREEMENT.md',
  'docs/legal/05-SUBSCRIPTION-AGREEMENT.md',
  'docs/legal/06-RISK-FACTORS.md',
];

/**
 * The legal wrapper recorded on the share token.
 *
 * The structure is the one the legal pack describes: a Wyoming DAO LLC per
 * asset, holding the property through whatever vehicle its situs requires. The
 * entity is a specimen and the contract says so in a field rather than only in
 * a README - `is_real_asset` is false, on-chain, where a wallet can read it.
 *
 * The hash is of the bundle above, computed at deploy time from the files in
 * this repository, so a reader reproduces it with one shell command rather than
 * taking a number on trust.
 */
export const ASSET_TERMS = {
  issuer: 'Asset DAO LLC (Wyoming DAO LLC, specimen - not incorporated)',
  jurisdiction: 'Wyoming, USA - company; Thailand - asset situs. No offering is being made',
  docPaths: TERMS_BUNDLE.map((p) => join(ROOT, p)),
  uri: 'https://github.com/sabaiprotocol/sabai-stellar/tree/main/docs/legal',
  isRealAsset: false,
};

// Secondary market (asset-exchange) configuration.
/** Platform commission on every fill: 200 bps = 2%. */
export const EXCHANGE_COMMISSION_BPS = 200;
/** Allowed listing price band: 50-200 XLM per share. */
export const EXCHANGE_MIN_RATE_STROOPS = 500_000_000n;
export const EXCHANGE_MAX_RATE_STROOPS = 2_000_000_000n;

/**
 * Signatures the admin account needs, out of its three signers.
 *
 * Also its medium threshold on-chain, which is what actually enforces this -
 * these constants only describe the account so the scripts know how many keys
 * to sign with. `npm run setup-multisig` is what sets the account up, and
 * `npm run governance-drill` proves one signature is refused.
 */
export const ADMIN_QUORUM = 2;
export const ADMIN_SIGNER_COUNT = 3;

export interface Env {
  deployerSecret: string;
  deployerPublic: string;
  /**
   * The 2-of-3 multisig account that is the admin of all five contracts. It
   * never signs with a single key: see `adminSignerSecrets`.
   */
  adminPublic: string;
  /**
   * Master key of that account. Its weight is set to zero by
   * `setup-multisig`, so after setup it can create nothing and authorize
   * nothing - it is kept only so the account can be rebuilt from scratch on a
   * testnet reset.
   */
  adminSecret: string;
  /** The three keys listed as signers. Any two of them make a quorum. */
  adminSignerSecrets: string[];
  /**
   * Hot key for the day-to-day switches: halt, open and close the markets,
   * distribute a rent round. Cannot move shares, reprice, or promote itself.
   * This is the key the admin panel expects in Freighter.
   */
  operatorSecret: string;
  operatorPublic: string;
  treasuryPublic: string;
  /**
   * Custody signs for itself. The issuance is minted here, and moving a
   * tranche into the sale contract is a second, deliberate transaction that
   * the deployer key cannot make on its own.
   */
  treasurySecret: string;
  /** Address allowed to admit investors; falls back to the deployer. */
  kycProviderPublic: string;
  /** Set only when the provider is a separate key from the deployer. */
  kycProviderSecret: string | null;
}

export function loadEnv(): Env {
  dotenv.config({ path: join(ROOT, '.env'), quiet: true });
  const need = (name: string): string => {
    const v = process.env[name];
    if (!v) throw new Error(`Missing ${name} in .env (see .env.example)`);
    return v;
  };
  const deployerPublic = need('DEPLOYER_PUBLIC');
  const kycProviderPublic = process.env.KYC_PROVIDER_PUBLIC || deployerPublic;
  if (kycProviderPublic === deployerPublic) {
    console.warn(
      'KYC_PROVIDER_PUBLIC is unset — the deployer will hold the provider role. ' +
        'Set a separate key so the role separation is visible on-chain.',
    );
  }
  const adminSignerSecrets = Array.from({ length: ADMIN_SIGNER_COUNT }, (_, i) =>
    need(`ADMIN_SIGNER_${i + 1}_SECRET`),
  );
  return {
    deployerSecret: need('DEPLOYER_SECRET'),
    deployerPublic,
    adminPublic: need('ADMIN_PUBLIC'),
    adminSecret: need('ADMIN_SECRET'),
    adminSignerSecrets,
    operatorSecret: need('OPERATOR_SECRET'),
    operatorPublic: need('OPERATOR_PUBLIC'),
    treasuryPublic: need('TREASURY_PUBLIC'),
    treasurySecret: need('TREASURY_SECRET'),
    kycProviderPublic,
    kycProviderSecret: process.env.KYC_PROVIDER_SECRET || null,
  };
}

/**
 * A quorum of admin signers: the first `ADMIN_QUORUM` of the three.
 *
 * Which two is arbitrary - the account weights them equally. Taking a slice
 * rather than all three is deliberate: signing with every key would still be
 * valid and would prove nothing, because the run would pass just as happily if
 * the thresholds were never set.
 */
export function adminQuorum(env: Env): Keypair[] {
  return env.adminSignerSecrets.slice(0, ADMIN_QUORUM).map((s) => Keypair.fromSecret(s));
}

/** One admin signer, which is on its own not enough to move anything. */
export function adminSingleSigner(env: Env): Keypair {
  return Keypair.fromSecret(env.adminSignerSecrets[0] as string);
}

export function operatorKeypair(env: Env): Keypair {
  return Keypair.fromSecret(env.operatorSecret);
}

/**
 * The KYC provider's signing key, when one is configured. Optional on purpose:
 * `smoke-buy` must stay runnable by a reviewer who has friendbot and nothing
 * else, and falls back to the self-serve `register` path without it.
 */
export function kycProviderKeypair(): Keypair | null {
  dotenv.config({ path: join(ROOT, '.env'), quiet: true });
  const secret = process.env.KYC_PROVIDER_SECRET;
  return secret ? Keypair.fromSecret(secret) : null;
}

/**
 * The admin key, when one is configured. Optional for the same reason: a
 * reviewer with only friendbot can still walk the lifecycle, they just cannot
 * play the issuer distributing a reward round.
 */
export function deployerKeypair(): Keypair | null {
  dotenv.config({ path: join(ROOT, '.env'), quiet: true });
  const secret = process.env.DEPLOYER_SECRET;
  return secret ? Keypair.fromSecret(secret) : null;
}

/** The custody key: holds the issuance and funds the sale with a tranche. */
export function treasuryKeypair(): Keypair | null {
  dotenv.config({ path: join(ROOT, '.env'), quiet: true });
  const secret = process.env.TREASURY_SECRET;
  return secret ? Keypair.fromSecret(secret) : null;
}

const SEED = /\bS[A-Z2-7]{55}\b/g;

/** Replace every Stellar secret seed in a string with a placeholder. */
export function maskSeeds(text: string): string {
  return text.replace(SEED, 'S…(masked)');
}

/**
 * Run the stellar CLI with args. No shell, so spaces in args are safe.
 *
 * Masking the echo line is not enough on its own: the secret is passed as
 * argv, and Node builds a failed child process's Error message as
 * `Command failed: <file> <args joined>`. Printing that error - which every
 * caller does - would put the deployer seed in the terminal, in CI output and
 * in any screen recording. So the error is re-thrown with the seeds scrubbed
 * out of the message and the CLI's own output.
 */
export function stellar(args: string[], opts: { quiet?: boolean; cwd?: string } = {}): string {
  if (!opts.quiet) {
    console.log(`  $ stellar ${args.map(maskSeeds).join(' ')}`);
  }
  try {
    return execFileSync('stellar', args, {
      encoding: 'utf8',
      cwd: opts.cwd ?? ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (e) {
    const err = e as { message?: string; stderr?: string | Buffer };
    const stderr = err.stderr ? maskSeeds(err.stderr.toString()) : '';
    throw new Error(
      `${maskSeeds(err.message ?? 'stellar CLI failed')}${stderr ? `\n${stderr}` : ''}`,
    );
  }
}

/** `stellar contract build` must run inside the Cargo workspace. */
export function buildContracts(): void {
  stellar(['contract', 'build'], { quiet: true, cwd: CONTRACTS_DIR });
}

/**
 * sha256 of a built artifact - the same value the network stores as the
 * contract's wasm hash, so it can be compared against an explorer without
 * running anything locally.
 */
export function wasmHash(file: string): string {
  return sha256(join(WASM_DIR, file));
}

/**
 * sha256 of any file in the repository, hex.
 *
 * Used for the legal documents the share token points at, so the hash recorded
 * on-chain is one a reader can reproduce with `sha256sum` against files they
 * can see, rather than a number they have to take on trust.
 */
export function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * sha256 of several files, in the order given, hashed as one stream.
 *
 * Concatenation rather than a hash of hashes, because the point of the anchor
 * is that anyone can check it without this repository:
 *
 *   cat docs/legal/0[3-6]-*.md | sha256sum
 *
 * The repository normalizes text to LF (.gitattributes), so a fresh clone on
 * any platform hashes the same bytes.
 */
export function sha256Bundle(paths: string[]): string {
  const hash = createHash('sha256');
  for (const path of paths) hash.update(readFileSync(path));
  return hash.digest('hex');
}

/**
 * The `Terms` struct as the contract expects it: an ScMap keyed by the field
 * names in the Rust struct, and Soroban requires the keys in sorted order.
 *
 * Shared by `deploy` and `admin -- set-terms`, so a re-anchor after a document
 * amendment writes exactly the shape the deploy wrote.
 */
export function termsScVal(): xdr.ScVal {
  const field = (key: string, value: xdr.ScVal): xdr.ScMapEntry =>
    new xdr.ScMapEntry({ key: nativeToScVal(key, { type: 'symbol' }), val: value });
  return xdr.ScVal.scvMap([
    field('doc_hash', nativeToScVal(Buffer.from(sha256Bundle(ASSET_TERMS.docPaths), 'hex'))),
    field('is_real_asset', xdr.ScVal.scvBool(ASSET_TERMS.isRealAsset)),
    field('issuer', nativeToScVal(ASSET_TERMS.issuer, { type: 'string' })),
    field('jurisdiction', nativeToScVal(ASSET_TERMS.jurisdiction, { type: 'string' })),
    field('uri', nativeToScVal(ASSET_TERMS.uri, { type: 'string' })),
  ]);
}

export function fundViaFriendbot(publicKey: string): Promise<Response> {
  console.log(`  friendbot → ${publicKey}`);
  return fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
}

export interface Deployment {
  network: string;
  protocolVersion: number;
  updatedAt: string;
  asset: {
    name: string;
    symbol: string;
    priceStroops: string;
    totalShares: string;
    buybackDiscountBps: number;
    saleCommissionBps: number;
  };
  accounts: {
    /** The 2-of-3 multisig. `governance.quorum` says what that means. */
    admin: string;
    operator: string;
    treasury: string;
    feeTo: string;
    kycProvider: string;
  };
  governance: { quorum: number; signers: number; adminAccountLink: string };
  contracts: {
    registry: string;
    shareToken: string;
    assetSale: string;
    exchange: string;
    rewards: string;
    nativeSac: string;
  };
  links: {
    registry: string;
    shareToken: string;
    assetSale: string;
    exchange: string;
    rewards: string;
  };
  /** sha256 of the wasm deployed for each contract - see `npm run verify-wasm`. */
  wasmHashes: {
    registry: string;
    shareToken: string;
    assetSale: string;
    exchange: string;
    rewards: string;
  };
  exchange: { commissionBps: number; minRateStroops: string; maxRateStroops: string };
}

export function writeDeployment(d: Deployment): void {
  mkdirSync(dirname(DEPLOYMENTS_FILE), { recursive: true });
  writeFileSync(DEPLOYMENTS_FILE, `${JSON.stringify(d, null, 2)}\n`);
  console.log(`\nDeployment written → ${DEPLOYMENTS_FILE}`);
}

export function readDeployment(): Deployment {
  if (!existsSync(DEPLOYMENTS_FILE)) {
    throw new Error(`${DEPLOYMENTS_FILE} not found — run \`npm run deploy\` first`);
  }
  return JSON.parse(readFileSync(DEPLOYMENTS_FILE, 'utf8')) as Deployment;
}
