import {
  getAddress,
  getNetwork,
  isAllowed,
  isConnected,
  requestAccess,
  signTransaction,
} from '@stellar/freighter-api';

export type ConnectResult =
  | { ok: true; address: string; network: string }
  | { ok: false; message: string };

export const TESTNET = 'TESTNET';

export function isFreighterInstalled(): Promise<boolean> {
  return isConnected()
    .then((r) => r.isConnected && !r.error)
    .catch(() => false);
}

/** Ask Freighter for access and report which network it is on. */
export async function connectFreighter(): Promise<ConnectResult> {
  const access = await requestAccess();
  if (access.error || !access.address) {
    return { ok: false, message: access.error?.message ?? 'Access to Freighter was declined' };
  }
  const net = await getNetwork();
  if (net.error) {
    return { ok: false, message: net.error.message };
  }
  return { ok: true, address: access.address, network: net.network };
}

/** Silent session restore after a page refresh - no popup. Succeeds only when
 *  the site is already allowed in Freighter (isAllowed/getAddress don't prompt,
 *  unlike requestAccess). */
export async function restoreFreighter(): Promise<ConnectResult> {
  const allowed = await isAllowed();
  if (allowed.error || !allowed.isAllowed) {
    return { ok: false, message: 'Site is no longer allowed in Freighter' };
  }
  const addr = await getAddress();
  if (addr.error || !addr.address) {
    return { ok: false, message: 'No address available' };
  }
  const net = await getNetwork();
  if (net.error) {
    return { ok: false, message: net.error.message };
  }
  return { ok: true, address: addr.address, network: net.network };
}

/** Signer adapter for the generated contract clients. */
export { signTransaction };
