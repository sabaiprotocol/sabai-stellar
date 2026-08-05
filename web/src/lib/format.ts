const STROOPS_IN_XLM = 10_000_000n;

/** 1000000000n -> "100" ; 1234567n -> "0.1234567" (trailing zeros trimmed). */
export function stroopsToXlm(stroops: bigint): string {
  const whole = stroops / STROOPS_IN_XLM;
  const frac = (stroops % STROOPS_IN_XLM).toString().padStart(7, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

/** "120.5" -> 1205000000n ; null when the input is not a positive XLM amount. */
export function xlmToStroops(input: string): bigint | null {
  const m = input.trim().match(/^(\d+)(?:\.(\d{1,7}))?$/);
  if (!m) return null;
  const [, whole, frac = ''] = m;
  return BigInt(whole) * STROOPS_IN_XLM + BigInt(frac.padEnd(7, '0'));
}

/** "100000" -> "100,000" ; "1234.5" -> "1,234.5". */
export function formatAmount(value: string | number | bigint): string {
  const [int, frac] = String(value).split('.');
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${formatted}.${frac}` : formatted;
}

export function formatXlm(stroops: bigint): string {
  return formatAmount(stroopsToXlm(stroops));
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export type ContractErrors = Record<number, string>;

/**
 * What the buyback pool pays for `shares` - mirrors `buyback_quote` in
 * asset-sale, integer math and rounding included, so the quote on screen is
 * the amount the contract transfers.
 */
export function buybackQuote(priceStroops: bigint, shares: bigint, discountBps: number): bigint {
  return (priceStroops * shares * BigInt(10_000 - discountBps)) / 10_000n;
}

/**
 * Every contract error in the deployment, in one table.
 *
 * The codes are globally unique by design (registry 1xx, share-token 2xx, sale
 * 3xx, exchange 4xx, rewards 5xx, governance 9xx) and that is what makes a
 * single table
 * correct. Every write in this app is a cross-contract call, and a failure
 * anywhere in the chain surfaces the INNER contract's code: buying goes
 * asset-sale -> share-token -> compliance-registry. With per-contract
 * numbering there is no way to tell whose #2 came back, so the UI would print
 * a confident, wrong sentence. Shared numbering removes the question.
 *
 * Keep this in step with each contract's `src/errors.rs`.
 */
export const CONTRACT_ERRORS: ContractErrors = {
  // compliance-registry
  101: 'Only the registered KYC provider can admit or revoke an investor.',
  102: 'This address is not cleared to hold shares.',
  103: 'A batch must hold between 1 and 100 addresses.',
  // share-token
  201: 'Amounts must be positive whole numbers of shares.',
  202: 'Not enough shares on this address.',
  203: 'The approved allowance does not cover this amount.',
  204: 'The approval expiry is in the past.',
  205: 'This address cannot hold shares right now — it has not passed the demo KYC, or it is suspended, or the asset is halted.',
  206: 'Amount overflow.',
  207: 'That would issue more shares than this asset has.',
  208: 'Invalid share supply configuration.',
  209: 'This asset was already issued — the share count is fixed and cannot be added to.',
  210: 'The legal terms need an issuing entity, a jurisdiction and a document URI.',
  // asset-sale
  301: 'The sale is currently disabled by the administrator.',
  302: 'Invalid amount — must be a positive whole number of shares.',
  303: 'Not enough shares left in the sale contract.',
  304: 'Invalid price configuration.',
  305: 'Amount overflow.',
  306: 'This address cannot buy right now — it has not passed the demo KYC, or it is suspended, or the asset is halted.',
  307: 'The buyback pool does not hold enough XLM for this sale right now.',
  308: 'Invalid buyback discount configuration.',
  309: 'The share price moved while you were signing — reopen the form for a fresh quote.',
  310: 'The accounts the sale pays out to cannot buy from it.',
  311: 'Invalid sale commission configuration.',
  // asset-exchange
  401: 'The secondary market is currently disabled by the administrator.',
  402: 'Invalid amount — must be a positive whole number of shares.',
  403: 'The price is outside the allowed band for this asset.',
  404: 'This order no longer exists — it was filled or cancelled.',
  405: 'You cannot buy from your own order.',
  406: 'The order holds fewer shares than requested.',
  407: 'Only the seller can cancel this order.',
  408: 'This address cannot trade right now — it has not passed the demo KYC, or it is suspended, or the asset is halted.',
  409: 'Amount overflow.',
  410: 'Invalid exchange configuration.',
  411: 'The seller of this order is no longer cleared to trade, so it cannot be filled.',
  // rewards-distributor
  501: 'There is nothing to claim on this address right now.',
  502: 'Invalid amount — must be a positive whole number.',
  503: 'Amount overflow.',
  504: 'This wallet is suspended by the compliance provider. Rent keeps accruing and can be claimed once the suspension is lifted.',
  // governance, shared by all five contracts
  901: 'This wallet holds neither the admin nor the operator role on this contract.',
  902: 'There is no admin handover waiting to be accepted.',
};

const DECLINED = /declined|rejected|denied/i;
const CONTRACT_CODE = /Error\(Contract, #(\d+)\)/;

/**
 * Anything thrown on the write path -> one sentence a user can act on.
 * Simulation failures carry the contract error as `Error(Contract, #306)`;
 * everything unrecognised falls through truncated rather than hidden.
 */
export function txErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (DECLINED.test(raw)) return 'Signature request was declined in Freighter.';

  const code = raw.match(CONTRACT_CODE);
  const known = code && CONTRACT_ERRORS[Number(code[1])];
  if (known) return known;

  if (/insufficient|balance/i.test(raw)) {
    return 'Not enough testnet XLM to complete this transaction.';
  }
  return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
}
