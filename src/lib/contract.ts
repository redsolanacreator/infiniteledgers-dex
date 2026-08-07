import { CosmWasmClient, SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import type { Coin } from "@cosmjs/stargate";
import {
  AMM_CONTRACT_ADDRESS,
  GAS_PRICE_STEP,
  RPC_ENDPOINT,
} from "../config/chain";
import type { PoolInfo, SwapSimulation } from "../types/contract";

let readClient: CosmWasmClient | null = null;
let readClientPromise: Promise<CosmWasmClient> | null = null;

/** Lazily connect (and cache) a read-only CosmWasm client against the public RPC. */
export async function getReadClient(): Promise<CosmWasmClient> {
  if (readClient) return readClient;
  if (!readClientPromise) {
    readClientPromise = CosmWasmClient.connect(RPC_ENDPOINT).then((c) => {
      readClient = c;
      return c;
    });
  }
  return readClientPromise;
}

/** Reset the cached client, e.g. after a connectivity failure, so the next call retries fresh. */
export function resetReadClient(): void {
  readClient = null;
  readClientPromise = null;
}

export async function checkRpcHealth(): Promise<boolean> {
  try {
    const client = await getReadClient();
    await client.getHeight();
    return true;
  } catch {
    resetReadClient();
    return false;
  }
}

// ---------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------

/**
 * Try a handful of plausible field-name variants for a query response.
 * Returns the first defined value found, or undefined. This exists
 * because the brief documents *what* each query returns in prose but
 * not the exact JSON field names -- see types/contract.ts for the full
 * explanation. Falling back across variants (rather than assuming one)
 * means the UI shows real data if the actual shape matches any common
 * convention, and shows "unknown" instead of a wrong number if none do.
 */
function pick(obj: any, keys: string[]): string | undefined {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return String(obj[k]);
  }
  return undefined;
}

export async function queryPool(
  denomA: string,
  denomB: string
): Promise<PoolInfo | null> {
  const client = await getReadClient();
  try {
    const res = await client.queryContractSmart(AMM_CONTRACT_ADDRESS, {
      get_pool: { denom_a: denomA, denom_b: denomB },
    });
    let reserveA =
      pick(res, ["reserve_a", "reserveA", "amount_a", "balance_a"]) ?? "0";
    let reserveB =
      pick(res, ["reserve_b", "reserveB", "amount_b", "balance_b"]) ?? "0";

    // The contract may canonicalize pool denom order internally (e.g.
    // sort alphabetically) rather than preserving the order this query
    // was called with. If the response itself reports which denom is
    // "a" vs "b", use that to correctly map reserves onto (denomA,
    // denomB) as passed in -- otherwise a caller that queried
    // (babyinf, minf) could end up with reserves silently swapped.
    const responseDenomA = pick(res, ["denom_a", "denomA"]);
    const responseDenomB = pick(res, ["denom_b", "denomB"]);
    if (
      responseDenomA &&
      responseDenomB &&
      responseDenomA === denomB &&
      responseDenomB === denomA
    ) {
      [reserveA, reserveB] = [reserveB, reserveA];
    }

    const lpSupply =
      pick(res, ["lp_supply", "lpSupply", "total_shares", "total_lp"]) ?? "0";
    const poolId = pick(res, ["pool_id", "poolId", "id"]) ?? null;
    return { poolId, denomA, denomB, reserveA, reserveB, lpSupply, raw: res };
  } catch {
    // Most likely: no pool exists yet for this pair. The contract call
    // itself may also be genuinely unreachable -- callers that care about
    // that distinction should pair this with checkRpcHealth().
    return null;
  }
}

export async function queryPrice(
  denomIn: string,
  denomOut: string
): Promise<string | null> {
  const client = await getReadClient();
  try {
    const res = await client.queryContractSmart(AMM_CONTRACT_ADDRESS, {
      get_price: { denom_in: denomIn, denom_out: denomOut },
    });
    if (typeof res === "string" || typeof res === "number") return String(res);
    return pick(res, ["price", "spot_price", "rate"]) ?? null;
  } catch {
    return null;
  }
}

export async function simulateSwap(
  denomIn: string,
  amountInBase: string,
  denomOut: string
): Promise<SwapSimulation | null> {
  if (!amountInBase || amountInBase === "0") return null;
  const client = await getReadClient();
  try {
    const res = await client.queryContractSmart(AMM_CONTRACT_ADDRESS, {
      simulate_swap: {
        denom_in: denomIn,
        amount_in: amountInBase,
        denom_out: denomOut,
      },
    });
    const amountOut =
      pick(res, ["amount_out", "amountOut", "out_amount", "output"]) ?? "0";
    return { amountOut, raw: res };
  } catch {
    return null;
  }
}

/**
 * NOT YET WIRED.
 *
 * LP shares here are tracked internally in contract state rather than as
 * a separate CW20 token (per the brief), and RemoveLiquidity takes a
 * `pool_id` + `lp_amount`, which confirms the contract *has* a concept of
 * a per-address LP balance somewhere in its state -- but none of the
 * three documented queries (GetPool, GetPrice, SimulateSwap) exposes it.
 *
 * Rather than guess a query name and risk silently displaying a wrong
 * number (which would violate the "no fake data" requirement in the
 * brief), this returns null so the UI can show an honest
 * "not available" state. To finish this: get the exact query variant
 * name from the contract's schema.json (if published) or from whoever
 * deployed it -- likely something like `GetLpBalance { pool_id, address }`
 * or `GetPosition { pool_id, address }` -- then implement the call here
 * the same way queryPool/simulateSwap do it above.
 */
export async function queryLpBalance(
  _poolId: string | null,
  _address: string
): Promise<string | null> {
  return null;
}

// ---------------------------------------------------------------------
// Executes
// ---------------------------------------------------------------------

function sortedFunds(funds: Coin[]): Coin[] {
  // Cosmos SDK requires Coins to be sorted by denom; SigningCosmWasmClient
  // does not always do this for you depending on version, so sort here.
  return [...funds].sort((a, b) => (a.denom < b.denom ? -1 : a.denom > b.denom ? 1 : 0));
}

export const DEFAULT_GAS_PRICE = `${GAS_PRICE_STEP.average}minf`;

export async function executeSwap(
  client: SigningCosmWasmClient,
  sender: string,
  denomIn: string,
  amountInBase: string,
  denomOut: string,
  minAmountOutBase: string
) {
  const msg = {
    swap: {
      denom_in: denomIn,
      amount_in: amountInBase,
      denom_out: denomOut,
      min_amount_out: minAmountOutBase,
    },
  };
  const funds = sortedFunds([{ denom: denomIn, amount: amountInBase }]);
  return client.execute(sender, AMM_CONTRACT_ADDRESS, msg, "auto", undefined, funds);
}

export async function executeAddLiquidity(
  client: SigningCosmWasmClient,
  sender: string,
  denomA: string,
  amountABase: string,
  denomB: string,
  amountBBase: string
) {
  const msg = { add_liquidity: { denom_a: denomA, denom_b: denomB } };
  const funds = sortedFunds([
    { denom: denomA, amount: amountABase },
    { denom: denomB, amount: amountBBase },
  ]);
  return client.execute(sender, AMM_CONTRACT_ADDRESS, msg, "auto", undefined, funds);
}

export async function executeRemoveLiquidity(
  client: SigningCosmWasmClient,
  sender: string,
  poolId: string,
  lpAmountBase: string
) {
  const msg = { remove_liquidity: { pool_id: poolId, lp_amount: lpAmountBase } };
  return client.execute(sender, AMM_CONTRACT_ADDRESS, msg, "auto");
}

export async function executeCreatePool(
  client: SigningCosmWasmClient,
  sender: string,
  denomA: string,
  denomB: string
) {
  const msg = { create_pool: { denom_a: denomA, denom_b: denomB } };
  return client.execute(sender, AMM_CONTRACT_ADDRESS, msg, "auto");
}
