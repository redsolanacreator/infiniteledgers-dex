// -----------------------------------------------------------------------
// Infinite Ledgers chain + AMM contract configuration
//
// Values below come directly from the project brief. A few fields that
// the brief did not specify (gas price, bip44 coin type, tokenfactory
// token decimals) are marked ASSUMPTION -- verify them against the real
// chain before relying on this in production. Getting these wrong won't
// corrupt data, but a wrong gas price can make transactions fail to
// broadcast, and a wrong decimals value would mis-scale displayed amounts.
// -----------------------------------------------------------------------

export const CHAIN_ID = "infiniteledgers-1";
export const RPC_ENDPOINT = "https://rpc.infiniteledgers.com";
export const REST_ENDPOINT = "https://api.infiniteledgers.com";
export const BECH32_PREFIX = "inf";

export const AMM_CONTRACT_ADDRESS =
  "inf1nc5tatafv6eyq7llkr2gv50ff9e22mnf70qgjlv737ktmt4eswrqtknfe8";

// A second, separate AMM contract deployment. It exposes the same
// message interface as the original (GetPool, GetPrice, SimulateSwap,
// Swap, AddLiquidity, RemoveLiquidity) plus AddLiquiditySingleSided,
// which the original does not have. Its pools and liquidity are entirely
// its own -- not shared with AMM_CONTRACT_ADDRESS in any way.
export const SINGLE_SIDED_AMM_CONTRACT_ADDRESS =
  "inf17p9rzwnnfxcjp32un9ug7yhhzgtkhvl9jfksztgw5uh69wac2pgsnddvsr";

export const NATIVE_DENOM = "minf";
export const NATIVE_SYMBOL = "INF";
export const NATIVE_DECIMALS = 6;

// ASSUMPTION: not given in the brief. Confirm the chain's actual
// min-gas-price (e.g. via `<REST_ENDPOINT>/cosmos/base/node/v1beta1/config`
// or the validator's app.toml) and update this before mainnet use.
export const GAS_PRICE_STEP = { low: 0.01, average: 0.025, high: 0.04 };

export const SWAP_FEE_BPS = 30; // 0.3%, per the brief

export interface KnownToken {
  denom: string;
  symbol: string;
  decimals: number;
  isIbc?: boolean;
}

export const KNOWN_TOKENS: KnownToken[] = [
  { denom: NATIVE_DENOM, symbol: NATIVE_SYMBOL, decimals: NATIVE_DECIMALS },
  {
    denom: "factory/inf14h3h0n645e0zln9gn004un47mdn9yfg0nswtyv/babyinf",
    symbol: "BabyINF",
    // ASSUMPTION: the brief doesn't state BabyINF's decimals. Tokenfactory
    // denoms are commonly minted with 6 decimals to match the native
    // token, but this is not confirmed on-chain here -- verify against
    // the token's actual metadata (bank module DenomMetadata) before launch.
    decimals: 6,
  },
  {
    denom:
      "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2",
    symbol: "ATOM",
    decimals: 6,
    isIbc: true,
  },
];

export function findToken(denom: string): KnownToken | undefined {
  return KNOWN_TOKENS.find((t) => t.denom === denom);
}

export function tokenLabel(denom: string): string {
  return findToken(denom)?.symbol ?? shortenDenom(denom);
}

export function tokenDecimals(denom: string): number {
  return findToken(denom)?.decimals ?? 6;
}

export function shortenDenom(denom: string): string {
  if (denom.startsWith("ibc/")) return `ibc/${denom.slice(4, 10)}…`;
  if (denom.startsWith("factory/")) {
    const parts = denom.split("/");
    return parts[parts.length - 1];
  }
  return denom;
}

// -----------------------------------------------------------------------
// AMM contracts
//
// The DEX talks to potentially more than one separate AMM contract
// deployment -- each with its own address and its own, independent pools
// and liquidity. Every query/execute in src/lib/contract.ts takes a
// contract address as a parameter rather than assuming a single global
// one, and every place in the UI that shows or acts on a pool carries
// along which contract it came from. This list is what to extend if a
// third contract is ever deployed -- nothing else should need to assume
// there are exactly one or two.
// -----------------------------------------------------------------------
export interface AmmContractConfig {
  id: string;
  label: string;
  address: string;
  /** Whether this contract exposes AddLiquiditySingleSided. */
  supportsSingleSided: boolean;
}

export const AMM_CONTRACTS: AmmContractConfig[] = [
  {
    id: "original",
    label: "Original AMM",
    address: AMM_CONTRACT_ADDRESS,
    supportsSingleSided: false,
  },
  {
    id: "single-sided",
    label: "Single-Sided AMM",
    address: SINGLE_SIDED_AMM_CONTRACT_ADDRESS,
    supportsSingleSided: true,
  },
];

export function findContract(id: string): AmmContractConfig | undefined {
  return AMM_CONTRACTS.find((c) => c.id === id);
}

export function findContractByAddress(address: string): AmmContractConfig | undefined {
  return AMM_CONTRACTS.find((c) => c.address === address);
}

// -----------------------------------------------------------------------
// Known pool pairs
//
// HONESTY NOTE: the documented AMM contract interface exposes exactly
// three queries -- GetPool { denom_a, denom_b }, GetPrice, and
// SimulateSwap. All three require you to already know which two denoms
// to ask about; none of them enumerates "every pool that exists." That
// means there is no way to *truly* discover the full set of live pools
// from the chain with only the documented interface -- the frontend has
// to be told which (contract, pair) combinations to look up.
//
// This file seeds that list with the pairs described as live in the
// project brief, one entry per (contract, pair). The Pools page also
// lets a user add a pair manually (persisted in localStorage, tagged
// with a contract) so the token/pool list can grow without a code change
// -- as close to "dynamic" as is possible without a ListPools-style
// query on the contract. If a real contract does add such a query
// later, swap the relevant seed entries below for a call to it.
// -----------------------------------------------------------------------
export interface SeedPair {
  contractId: string;
  denomA: string;
  denomB: string;
}

const ATOM_IBC_DENOM =
  "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2";

export const SEED_PAIRS: SeedPair[] = [
  {
    contractId: "original",
    denomA: NATIVE_DENOM,
    denomB: "factory/inf14h3h0n645e0zln9gn004un47mdn9yfg0nswtyv/babyinf",
  },
  { contractId: "original", denomA: NATIVE_DENOM, denomB: ATOM_IBC_DENOM },
  // The single-sided contract's real, live pool -- a separate deployment
  // and separate liquidity from the original contract's minf/ATOM pool
  // above, even though the pair happens to be the same.
  { contractId: "single-sided", denomA: NATIVE_DENOM, denomB: ATOM_IBC_DENOM },
];

export const EXPLORER_STORAGE_KEY = "infiniteledgers-dex:custom-pairs";
