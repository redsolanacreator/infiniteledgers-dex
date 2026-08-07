import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  WalletId,
  WalletNotFoundError,
  WalletSession,
  connectWallet,
  onWalletAccountChange,
} from "../lib/wallet";

type Status = "disconnected" | "connecting" | "connected" | "error";

interface WalletContextValue {
  status: Status;
  session: WalletSession | null;
  error: string | null;
  connect: (id: WalletId) => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

const LAST_WALLET_KEY = "infiniteledgers-dex:last-wallet";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("disconnected");
  const [session, setSession] = useState<WalletSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (id: WalletId) => {
    setStatus("connecting");
    setError(null);
    try {
      const s = await connectWallet(id);
      setSession(s);
      setStatus("connected");
      localStorage.setItem(LAST_WALLET_KEY, id);
    } catch (e) {
      setStatus("error");
      setSession(null);
      if (e instanceof WalletNotFoundError) {
        setError(`${e.walletId} isn't installed in this browser.`);
      } else {
        setError(e instanceof Error ? e.message : "Failed to connect wallet.");
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    setSession(null);
    setStatus("disconnected");
    localStorage.removeItem(LAST_WALLET_KEY);
  }, []);

  // Re-sync the connected account if the user switches accounts inside
  // their wallet extension rather than disconnecting.
  useEffect(() => {
    if (!session) return;
    return onWalletAccountChange(() => {
      void connect(session.walletId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.walletId]);

  const value = useMemo(
    () => ({ status, session, error, connect, disconnect }),
    [status, session, error, connect, disconnect]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
