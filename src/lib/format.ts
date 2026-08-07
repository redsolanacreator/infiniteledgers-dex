// Fixed-point helpers that avoid floating point for on-chain amounts.
// Amounts that actually get signed and broadcast should always be
// produced by toBaseUnits (string in/out), never by float math.

/** Convert a human-entered decimal string (e.g. "12.5") to base units (integer string, e.g. "12500000"). */
export function toBaseUnits(display: string, decimals: number): string {
  const trimmed = display.trim();
  if (trimmed === "" || Number.isNaN(Number(trimmed))) return "0";
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, frac = ""] = unsigned.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const combined = `${whole || "0"}${fracPadded}`.replace(/^0+(?=\d)/, "");
  const result = combined === "" ? "0" : combined;
  return negative ? `-${result}` : result;
}

/** Convert base units (integer string) to a human display string. */
export function toDisplayUnits(base: string | number | bigint, decimals: number): string {
  let s = typeof base === "bigint" ? base.toString() : String(base);
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  s = s.padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals) || "0";
  const frac = decimals > 0 ? s.slice(s.length - decimals) : "";
  const fracTrimmed = frac.replace(/0+$/, "");
  const out = fracTrimmed ? `${whole}.${fracTrimmed}` : whole;
  return negative && out !== "0" ? `-${out}` : out;
}

/** Format a display-unit numeric string with thousands separators, capped to maxDecimals for readability. */
export function formatNumber(value: string | number, maxDecimals = 6): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString(undefined, {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  });
}

export function formatPercent(bps: number, decimals = 2): string {
  return `${(bps / 100).toFixed(decimals)}%`;
}

export function shortenAddress(address: string, lead = 8, tail = 5): string {
  if (address.length <= lead + tail + 3) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

export function isPositiveAmount(baseAmount: string): boolean {
  try {
    return BigInt(baseAmount || "0") > 0n;
  } catch {
    return false;
  }
}
