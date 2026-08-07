import React, { createContext, useContext, useEffect, useState } from "react";
import { checkRpcHealth } from "../lib/contract";

type NetworkStatus = "checking" | "online" | "reconnecting";

const NetworkStatusContext = createContext<NetworkStatus>("checking");

const POLL_INTERVAL_MS = 15_000;

/**
 * Polls the RPC endpoint's health in the background so the whole app can
 * show a clear "reconnecting" state instead of crashing or silently
 * failing when rpc.infiniteledgers.com / api.infiniteledgers.com is
 * temporarily unreachable.
 */
export function NetworkStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<NetworkStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const ok = await checkRpcHealth();
      if (cancelled) return;
      setStatus(ok ? "online" : "reconnecting");
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <NetworkStatusContext.Provider value={status}>
      {children}
    </NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus(): NetworkStatus {
  return useContext(NetworkStatusContext);
}
