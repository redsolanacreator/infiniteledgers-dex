// Constant-product AMM helper math (client-side estimates only -- the
// contract's own state is always the source of truth; these are used
// for UI feedback like price impact before a SimulateSwap round-trip
// resolves, and for computing minAmountOut from slippage tolerance).

export const BPS_DENOM = 10_000n;

/** Apply a slippage tolerance (in bps, e.g. 50 = 0.5%) to an expected output amount, rounding down. */
export function applySlippage(expectedOutBase: string, slippageBps: number): string {
  const amount = BigInt(expectedOutBase || "0");
  const bps = BigInt(Math.max(0, Math.round(slippageBps)));
  const min = (amount * (BPS_DENOM - bps)) / BPS_DENOM;
  return min < 0n ? "0" : min.toString();
}

/**
 * Price impact in bps, comparing the effective execution price
 * (amountIn / amountOut) against the pre-trade spot price
 * (reserveOut / reserveIn, i.e. how much out you'd get per 1 in with
 * zero slippage). Both amounts must be in base units of their own denom;
 * decimals cancel out as long as reserves and trade amounts use the
 * same per-denom scale, so this is safe to call with raw base-unit
 * strings.
 */
export function priceImpactBps(
  amountInBase: string,
  amountOutBase: string,
  reserveInBase: string,
  reserveOutBase: string
): number {
  try {
    const amountIn = Number(amountInBase);
    const amountOut = Number(amountOutBase);
    const reserveIn = Number(reserveInBase);
    const reserveOut = Number(reserveOutBase);
    if (!amountIn || !amountOut || !reserveIn || !reserveOut) return 0;
    const spotOutPerIn = reserveOut / reserveIn;
    const effectiveOutPerIn = amountOut / amountIn;
    const impact = (spotOutPerIn - effectiveOutPerIn) / spotOutPerIn;
    return Math.max(0, impact * 10_000);
  } catch {
    return 0;
  }
}

/** Constant-product quote: how much of the paired asset matches a given amount, at the pool's current ratio. */
export function quoteMatchingAmount(
  amountBase: string,
  reserveOfSameSideBase: string,
  reserveOfOtherSideBase: string
): string {
  try {
    const amount = BigInt(amountBase || "0");
    const reserveSame = BigInt(reserveOfSameSideBase || "0");
    const reserveOther = BigInt(reserveOfOtherSideBase || "0");
    if (reserveSame === 0n) return "0";
    return ((amount * reserveOther) / reserveSame).toString();
  } catch {
    return "0";
  }
}
