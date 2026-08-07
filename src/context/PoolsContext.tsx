import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { EXPLORER_STORAGE_KEY, KNOWN_TOKENS, SEED_PAIRS } from "../config/chain";
import { queryPool, queryPrice } from "../lib/contract";
import type { PoolInfo } from "../types/contract";

export interface PoolEntry {
  key: string;
  denomA: string;
  denomB: string;
  pool: PoolInfo | null; // null while loading or if the pair has no live pool yet
  price: string | null; // GetPrice(denomA -> denomB), null if unavailable
  loading: boolean;
}

interface PoolsContextValue {
  pools: PoolEntry[];
  loading: boolean;
  refresh: () => Promise<void>;
  addCustomPair: (denomA: string, denomB: string) => void;
  knownTokens: typeof KNOWN_TOKENS;
}

const PoolsContext = createContext<PoolsContextValue | undefined>(undefined);

function pairKey(a: string, b: string) {
  return [a, b].sort().join("::");
}

function loadCustomPairs(): [string, string][] {
  try {
    const raw = localStorage.getItem(EXPLORER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function saveCustomPairs(pairs: [string, string][]) {
  localStorage.setItem(EXPLORER_STORAGE_KEY, JSON.stringify(pairs));
}

/**
 * Central place that resolves the "known pairs" list (seed + any the
 * user has added manually, see config/chain.ts for why this exists
 * instead of a true on-chain enumeration) into live pool data by
 * querying GetPool for each pair.
 */
export function PoolsProvider({ children }: { children: React.ReactNode }) {
  const [customPairs, setCustomPairs] = useState<[string, string][]>(loadCustomPairs);
  const [pools, setPools] = useState<PoolEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const allPairs = useMemo(() => {
    const seen = new Set<string>();
    const combined = [...SEED_PAIRS, ...customPairs];
    return combined.filter(([a, b]) => {
      const k = pairKey(a, b);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [customPairs]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setPools(
      allPairs.map(([a, b]) => ({
        key: pairKey(a, b),
        denomA: a,
        denomB: b,
        pool: null,
        price: null,
        loading: true,
      }))
    );
    const results = await Promise.all(
      allPairs.map(async ([a, b]) => {
        const [pool, price] = await Promise.all([queryPool(a, b), queryPrice(a, b)]);
        return { key: pairKey(a, b), denomA: a, denomB: b, pool, price, loading: false };
      })
    );
    setPools(results);
    setLoading(false);
  }, [allPairs]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPairs.length]);

  const addCustomPair = useCallback(
    (denomA: string, denomB: string) => {
      const next: [string, string][] = [
        ...customPairs,
        [denomA.trim(), denomB.trim()],
      ];
      setCustomPairs(next);
      saveCustomPairs(next);
    },
    [customPairs]
  );

  const value = useMemo(
    () => ({ pools, loading, refresh, addCustomPair, knownTokens: KNOWN_TOKENS }),
    [pools, loading, refresh, addCustomPair]
  );

  return <PoolsContext.Provider value={value}>{children}</PoolsContext.Provider>;
}

export function usePools(): PoolsContextValue {
  const ctx = useContext(PoolsContext);
  if (!ctx) throw new Error("usePools must be used within a PoolsProvider");
  return ctx;
}
