// Used ONLY to compute a clearly-labeled DERIVED USD estimate for the
// ATOM pool (pool ratio × ATOM's real market price). Never used to
// invent a price for INF or BabyINF, which have no external market and
// must never show a USD figure per the project brief.

const COINGECKO_SIMPLE_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=cosmos&vs_currencies=usd";

let cached: { price: number; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getAtomUsdPrice(): Promise<number | null> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.price;
  }
  try {
    const res = await fetch(COINGECKO_SIMPLE_PRICE_URL);
    if (!res.ok) return cached?.price ?? null;
    const data = await res.json();
    const price = data?.cosmos?.usd;
    if (typeof price !== "number") return cached?.price ?? null;
    cached = { price, fetchedAt: Date.now() };
    return price;
  } catch {
    // CoinGecko unreachable -- fall back to last known price if we have
    // one, otherwise the caller shows no USD estimate rather than a
    // stale/fake one.
    return cached?.price ?? null;
  }
}
