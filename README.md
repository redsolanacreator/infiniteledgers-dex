# Infinite Ledgers — Swap Interface

A Uniswap/Osmosis-style swap, pool browser, and liquidity UI for **Infinite
Ledgers** (`infiniteledgers-1`), talking directly to the live AMM contract at
`inf1nc5tatafv6eyq7llkr2gv50ff9e22mnf70qgjlv737ktmt4eswrqtknfe8`.

This is a frontend only. It never modifies the contract, never touches
private keys, and shows only real on-chain data — see **Honesty
constraints** below.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL (default `http://localhost:5173`). Requires
a Cosmos wallet extension (Keplr, Leap, or Cosmostation) to connect and
sign transactions.

```bash
npm run build     # type-checks (tsc -b) and produces a production build in dist/
npm run preview   # serve the production build locally
```

## What's real vs. what needs verification

Everything in this app queries the live contract on `infiniteledgers-1` at
runtime — there is no mocked or hardcoded pool/price/reserve data anywhere
in the code. That said, a few details **weren't fully specified in the
project brief** and had to be filled in with a documented, clearly-flagged
assumption or an intentionally-unimplemented stub rather than a guess
presented as fact:

- **Pool discovery.** The documented contract interface (`GetPool`,
  `GetPrice`, `SimulateSwap`) has no "list all pools" query — every query
  needs you to already know the two denoms to ask about. There's no way to
  truly enumerate pools from the chain with that interface. `src/config/chain.ts`
  seeds the known pairs from the brief (INF/BabyINF, INF/ATOM); the Pools
  page also lets you add any other pair by denom (persisted locally) so the
  list can grow without a code change. If the real contract gets a
  `ListPools`-style query later, swap that seed list for one call to it.

- **Per-address LP share balance.** `RemoveLiquidity` takes a `pool_id` +
  `lp_amount`, confirming the contract tracks LP shares per address
  internally — but none of the three documented queries exposes reading
  that balance back. `queryLpBalance` in `src/lib/contract.ts` is
  intentionally stubbed to return `null` rather than guess a query name and
  risk silently showing a wrong number. The UI reflects this honestly
  ("not available yet") instead of showing 0 or a fabricated figure. To
  finish it: get the exact query name/shape from the contract's
  `schema.json` (if published) or from whoever deployed it, then implement
  it the same way `queryPool`/`simulateSwap` do.

- **Query response field names.** The brief describes what `GetPool` /
  `GetPrice` / `SimulateSwap` return in prose ("reserves and LP supply",
  "spot price", "swap output"), not the exact JSON field names. The
  normalizers in `src/lib/contract.ts` try a few common naming conventions
  (`reserve_a`/`reserveA`/`amount_a`, etc.) and fall back gracefully rather
  than assuming one is right. Worth double-checking against the deployed
  contract's actual response shape.

- **Gas price, coin type, tokenfactory decimals.** Marked `ASSUMPTION` in
  `src/config/chain.ts` — reasonable Cosmos SDK defaults, not confirmed
  against the real chain.

## Derived USD figures

INF and BabyINF have no external price feed and never show a USD value —
only real on-chain reserves and pool-ratio prices. The Pools page shows an
"Est. value" figure **only for the ATOM pool**, computed as the pool's ATOM
reserve × ATOM's live CoinGecko price × 2 (rough constant-product TVL
estimate), and it's explicitly labeled `DERIVED` in the UI. This is never
presented as a direct market price.

## Architecture

```
src/
  config/chain.ts       chain id, RPC/REST endpoints, contract address, known tokens/pairs
  lib/wallet.ts          shared Keplr/Leap/Cosmostation connection (all three share one code path)
  lib/contract.ts        query + execute wrappers around the AMM contract
  lib/math.ts, format.ts slippage/price-impact math, base-unit <-> display conversions
  lib/coingecko.ts       ATOM USD price only, for the derived TVL estimate
  context/               React contexts: wallet session, network/RPC health, pools cache
  components/            Header, wallet connect button, token selector, slippage settings
  pages/SwapPage.tsx     swap UI with live SimulateSwap preview
  pages/PoolsPage.tsx    pool browser (list)
  pages/PoolDetailPage.tsx  pool detail + your LP position
  pages/LiquidityPage.tsx   add/remove liquidity, create new pool
```

## Network resilience

`NetworkStatusContext` polls the RPC's health every 15s and shows a banner
("Can't reach Infinite Ledgers RPC right now — reconnecting…") instead of
crashing when `rpc.infiniteledgers.com` is temporarily unreachable. All
contract calls also fail gracefully (return `null`/show an error state)
rather than throwing uncaught.
