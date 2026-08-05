'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { AccountModal } from '@/components/AccountModal';
import { ConnectModal } from '@/components/ConnectModal';
import { connectFreighter, isFreighterInstalled, restoreFreighter, TESTNET } from '@/lib/freighter';
import { fetchShareBalance, fetchXlmBalance } from '@/lib/stellar';

/** localStorage flag: the user connected before, so restore silently on load. */
const CONNECTED_KEY = 'slr1-wallet';

/** useLayoutEffect on the client (flips UI into the "restoring" state before
 *  the first paint, so nothing flashes), plain useEffect during prerender. */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export type WalletStatus = 'disconnected' | 'connecting' | 'wrong-network' | 'connected';

interface WalletContextValue {
  status: WalletStatus;
  address: string | null;
  network: string | null;
  /** null = not checked yet, false = extension missing */
  installed: boolean | null;
  error: string | null;
  /** True while a previous session is being restored after a refresh -
   *  the UI keeps the "connected" geometry with skeletons to avoid jumps. */
  restoring: boolean;
  /** XLM via Horizon; null = account not funded (or not loaded yet). */
  xlmBalance: string | null;
  shareBalance: bigint | null;
  /** Resolves with the XLM balance it just read, so a caller that has only
   *  submitted a funding transaction can poll for the account appearing. */
  refreshBalances: () => Promise<string | null>;
  openConnectModal: () => void;
  /** Account sheet of the connected wallet (copy / explorer / switch / disconnect). */
  openAccountModal: () => void;
  /** Forget the session locally; Freighter keeps the site allowed. */
  disconnect: () => void;
  /** Re-run the Freighter access prompt to pick another account. */
  switchWallet: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
  return ctx;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('disconnected');
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [xlmBalance, setXlmBalance] = useState<string | null>(null);
  const [shareBalance, setShareBalance] = useState<bigint | null>(null);

  // Detect the extension right after page load, so by the time the user
  // opens the modal the answer is usually already known (no button pop-in).
  useEffect(() => {
    isFreighterInstalled().then(setInstalled);
  }, []);

  // Reconnect silently after a refresh: only when the user connected before
  // and the site is still allowed in Freighter (never pops a dialog).
  // Layout effect: the restoring state is set before the first paint, so the
  // header chip and the two-column layout render as skeletons instead of
  // flashing the disconnected UI and jumping a moment later.
  useIsoLayoutEffect(() => {
    let cancelled = false;
    try {
      if (localStorage.getItem(CONNECTED_KEY) !== 'freighter') return;
    } catch {
      return;
    }
    setRestoring(true);
    setStatus('connecting');
    restoreFreighter().then((result) => {
      if (cancelled) return;
      setRestoring(false);
      if (!result.ok) {
        try {
          localStorage.removeItem(CONNECTED_KEY);
        } catch {
          /* ignore */
        }
        setStatus('disconnected');
        return;
      }
      setNetwork(result.network);
      if (result.network !== TESTNET) {
        setStatus('wrong-network');
        return;
      }
      setAddress(result.address);
      setStatus('connected');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // undefined from a rejected read means "still unknown", which is not the same
  // as Horizon answering that the account holds nothing - a network blip must
  // not blank a balance that is already on screen.
  const refreshBalances = useCallback(async (): Promise<string | null> => {
    if (!address) return null;
    const [xlm, shares] = await Promise.all([
      fetchXlmBalance(address).catch(() => undefined),
      fetchShareBalance(address).catch(() => undefined),
    ]);
    if (xlm !== undefined) setXlmBalance(xlm);
    if (shares !== undefined) setShareBalance(shares);
    return xlm ?? null;
  }, [address]);

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  const openConnectModal = useCallback(() => {
    setError(null);
    setModalOpen(true);
    // Re-check on every open - the user may have just installed the
    // extension without reloading the page.
    isFreighterInstalled().then(setInstalled);
  }, []);

  const closeConnectModal = useCallback(() => setModalOpen(false), []);

  const openAccountModal = useCallback(() => setAccountOpen(true), []);

  /** Local sign-out: drop the session and the balances. Freighter has no
   *  "revoke" API - the site stays allowed there, so reconnecting is one
   *  click and needs no popup. */
  const disconnect = useCallback(() => {
    try {
      localStorage.removeItem(CONNECTED_KEY);
    } catch {
      /* private mode - nothing was stored anyway */
    }
    setAccountOpen(false);
    setAddress(null);
    setNetwork(null);
    setXlmBalance(null);
    setShareBalance(null);
    setError(null);
    setStatus('disconnected');
  }, []);

  const connect = useCallback(async () => {
    setStatus('connecting');
    setError(null);
    const result = await connectFreighter();
    if (!result.ok) {
      setStatus('disconnected');
      setError(result.message);
      return;
    }
    try {
      localStorage.setItem(CONNECTED_KEY, 'freighter');
    } catch {
      /* private mode - the session just won't survive a refresh */
    }
    setNetwork(result.network);
    if (result.network !== TESTNET) {
      setStatus('wrong-network');
      return;
    }
    setAddress(result.address);
    // The modal notices 'connected' and closes itself through its exit
    // animation - do not unmount it abruptly here.
    setStatus('connected');
  }, []);

  /** Freighter's access prompt lets the user pick a different account -
   *  that is the whole "switch wallet" flow (there is no account API). */
  const switchWallet = useCallback(async () => {
    const result = await connectFreighter();
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setAccountOpen(false);
    setNetwork(result.network);
    if (result.network !== TESTNET) {
      setStatus('wrong-network');
      return;
    }
    // Clear the previous account's balances so the header never shows one
    // wallet's numbers next to another wallet's address.
    setXlmBalance(null);
    setShareBalance(null);
    setAddress(result.address);
    setStatus('connected');
  }, []);

  const value = useMemo(
    () => ({
      status,
      address,
      network,
      installed,
      error,
      restoring,
      xlmBalance,
      shareBalance,
      refreshBalances,
      openConnectModal,
      openAccountModal,
      disconnect,
      switchWallet,
    }),
    [
      status,
      address,
      network,
      installed,
      error,
      restoring,
      xlmBalance,
      shareBalance,
      refreshBalances,
      openConnectModal,
      openAccountModal,
      disconnect,
      switchWallet,
    ],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      {modalOpen && (
        <ConnectModal
          installed={installed}
          status={status}
          network={network}
          error={error}
          onConnect={connect}
          onClose={closeConnectModal}
        />
      )}
      {accountOpen && address && (
        <AccountModal
          address={address}
          xlmBalance={xlmBalance}
          shareBalance={shareBalance}
          error={error}
          onSwitch={switchWallet}
          onDisconnect={disconnect}
          onClose={() => setAccountOpen(false)}
        />
      )}
    </WalletContext.Provider>
  );
}
