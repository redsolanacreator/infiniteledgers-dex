import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  EXPLORER_STORAGE_KEY,
  KNOWN_TOKENS,
  SEED_PAIRS,
  findContract,
} from "../config/chain";
import type { SeedPair } from "../config/chain";
import { queryPool, queryPrice } from "../lib/contract";
import type { PoolInfo } from "../types/contract";

export interface PoolEntry {
  key: string;
  contractId: string;
  contractAddress: string;
  contractLabel: string;
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
  addCustomPair: (contractId: string, denomA: string, denomB: string) => void;
  knownTokens: typeof KNOWN_TOKENS;
}

const PoolsContext = createContext<PoolsContextValue | undefined>(undefined);

function pairKey(contractId: string, a: string, b: string) {
  return `${contractId}::${[a, b].sort().join("::")}`;
}

/**
 * Custom pairs are persisted as {contractId, denomA, denomB} objects.
 * Older data saved before multi-contract support existed as bare
 * [denomA, denomB] tuples for the (only, at the time) original contract
 * -- accept that legacy shape too rather than dropping a user's
 * previously-tracked pairs.
 */
function loadCustomPairs(): SeedPair[] {
  try {
    const raw = localStorage.getItem(EXPLORER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: SeedPair[] = [];
    for (const entry of parsed) {
      if (Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string") {
        result.push({ contractId: "original", denomA: entry[0], denomB: entry[1] });
      } else if (
        entry &&
        typeof entry === "object" &&
        typeof entry.denomA === "string" &&
        typeof entry.denomB === "string"
      ) {
        result.push({
          contractId: typeof entry.contractId === "string" ? entry.contractId : "original",
          denomA: entry.denomA,
          denomB: entry.denomB,
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

function saveCustomPairs(pairs: SeedPair[]) {
  localStorage.setItem(EXPLORER_STORAGE_KEY, JSON.stringify(pairs));
}

/**
 * Central place that resolves the "known pairs" list (seed + any the
 * user has added manually, see config/chain.ts for why this exists
 * instead of a true on-chain enumeration) into live pool data by
 * querying GetPool for each (contract, pair). Every entry is tagged with
 * which contract it belongs to, since the DEX now talks to more than one
 * independent AMM deployment.
 */
export function PoolsProvider({ children }: { children: React.ReactNode }) {
  const [customPairs, setCustomPairs] = useState<SeedPair[]>(loadCustomPairs);
  const [pools, setPools] = useState<PoolEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const allPairs = useMemo(() => {
    const seen = new Set<string>();
    const combined = [...SEED_PAIRS, ...customPairs];
    return combined.filter((p) => {
      const k = pairKey(p.contractId, p.denomA, p.denomB);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [customPairs]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setPools(
      allPairs.map((p) => {
        const contract = findContract(p.contractId);
        return {
          key: pairKey(p.contractId, p.denomA, p.denomB),
          contractId: p.contractId,
          contractAddress: contract?.address ?? "",
          contractLabel: contract?.label ?? p.contractId,
          denomA: p.denomA,
          denomB: p.denomB,
          pool: null,
          price: null,
          loading: true,
        };
      })
    );
    const results = await Promise.all(
      allPairs.map(async (p) => {
        const contract = findContract(p.contractId);
        const address = contract?.address ?? "";
        const [pool, price] = address
          ? await Promise.all([
              queryPool(address, p.denomA, p.denomB),
              queryPrice(address, p.denomA, p.denomB),
            ])
          : [null, null];
        return {
          key: pairKey(p.contractId, p.denomA, p.denomB),
          contractId: p.contractId,
          contractAddress: address,
          contractLabel: contract?.label ?? p.contractId,
          denomA: p.denomA,
          denomB: p.denomB,
          pool,
          price,
          loading: false,
        };
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
    (contractId: string, denomA: string, denomB: string) => {
      const next: SeedPair[] = [
        ...customPairs,
        { contractId, denomA: denomA.trim(), denomB: denomB.trim() },
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
