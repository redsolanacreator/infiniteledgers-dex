// -----------------------------------------------------------------------
// Message/query shapes for the Infinite Ledgers AMM contract.
//
// The execute message *names and parameters* below come directly from
// the documented contract interface in the project brief, translated to
// the snake_case CosmWasm normally uses for its JSON schema:
//
//   CreatePool { denom_a, denom_b }
//   AddLiquidity { denom_a, denom_b }        (amounts via tx funds)
//   RemoveLiquidity { pool_id, lp_amount }
//   Swap { denom_in, amount_in, denom_out, min_amount_out }
//
// A second, separate AMM contract deployment (see AMM_CONTRACTS in
// config/chain.ts) shares this same interface plus one more message,
// AddLiquiditySingleSided, that only it supports -- see that type below.
//
// The *query response* shapes are NOT fully specified by the brief
// (it only says what each returns in prose: "reserves and LP supply",
// "current spot price", "preview swap output"). The field names below
// are a reasonable guess at typical CosmWasm AMM conventions, and the
// normalizers in src/lib/contract.ts fall back across a few likely
// field-name variants rather than assuming one is correct. If a query
// response doesn't match any expected shape, the app surfaces "unknown"
// rather than fabricating a number -- verify actual field names against
// the deployed contract (its schema.json, if published, is the fastest
// way) and tighten these types once confirmed.
// -----------------------------------------------------------------------

export interface CreatePoolMsg {
  create_pool: { denom_a: string; denom_b: string };
}

export interface AddLiquidityMsg {
  add_liquidity: { denom_a: string; denom_b: string };
}

// ASSUMPTION: only the message *name* (AddLiquiditySingleSided) and its
// purpose (deposit one side of a pair only) are given in the brief -- the
// exact field name/shape is a guess, following the same pattern as
// AddLiquidity (the amount travels as tx funds, not as a message field,
// so only the denom being deposited needs to be named here). Verify
// against the single-sided contract's schema.json before relying on this.
export interface AddLiquiditySingleSidedMsg {
  add_liquidity_single_sided: { denom: string };
}

export interface RemoveLiquidityMsg {
  remove_liquidity: { pool_id: string; lp_amount: string };
}

export interface SwapMsg {
  swap: {
    denom_in: string;
    amount_in: string;
    denom_out: string;
    min_amount_out: string;
  };
}

export interface GetPoolQuery {
  get_pool: { denom_a: string; denom_b: string };
}

export interface GetPriceQuery {
  get_price: { denom_in: string; denom_out: string };
}

export interface SimulateSwapQuery {
  simulate_swap: { denom_in: string; amount_in: string; denom_out: string };
}

// Normalized, UI-friendly shapes (post field-name-guessing in contract.ts)

export interface PoolInfo {
  poolId: string | null;
  denomA: string;
  denomB: string;
  reserveA: string;
  reserveB: string;
  lpSupply: string;
  raw: unknown;
}

export interface SwapSimulation {
  amountOut: string;
  raw: unknown;
}
