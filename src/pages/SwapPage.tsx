import { useEffect, useMemo, useState } from "react";
import { KNOWN_TOKENS, NATIVE_DENOM, tokenDecimals, tokenLabel } from "../config/chain";
import TokenSelector from "../components/TokenSelector";
import SlippageSettings from "../components/SlippageSettings";
import { useWallet } from "../context/WalletContext";
import { executeSwap, queryPool, queryPrice, simulateSwap } from "../lib/contract";
import { formatNumber, formatPercent, isPositiveAmount, toBaseUnits, toDisplayUnits } from "../lib/format";
import { applySlippage, priceImpactBps } from "../lib/math";
import type { SwapSimulation } from "../types/contract";

type TxState =
  | { phase: "idle" }
  | { phase: "pending" }
  | { phase: "success"; txHash: string }
  | { phase: "error"; message: string };

const DEBOUNCE_MS = 400;

export default function SwapPage() {
  const { session, status: walletStatus } = useWallet();

  const [fromDenom, setFromDenom] = useState(NATIVE_DENOM);
  const [toDenom, setToDenom] = useState(
    KNOWN_TOKENS.find((t) => t.denom !== NATIVE_DENOM)?.denom ?? NATIVE_DENOM
  );
  const [fromDisplay, setFromDisplay] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);

  const [simulation, setSimulation] = useState<SwapSimulation | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [spotPrice, setSpotPrice] = useState<string | null>(null);
  const [reserves, setReserves] = useState<{ a: string; b: string; denomA: string } | null>(null);

  const [tx, setTx] = useState<TxState>({ phase: "idle" });

  const fromDecimals = tokenDecimals(fromDenom);
  const toDecimals = tokenDecimals(toDenom);
  const fromBaseUnits = toBaseUnits(fromDisplay, fromDecimals);

  // Keep from/to distinct.
  useEffect(() => {
    if (toDenom === fromDenom) {
      const alt = KNOWN_TOKENS.find((t) => t.denom !== fromDenom);
      if (alt) setToDenom(alt.denom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDenom]);

  // Fetch spot price + reserves whenever the pair changes (for price impact context).
  useEffect(() => {
    let cancelled = false;
    setSpotPrice(null);
    setReserves(null);
    queryPrice(fromDenom, toDenom).then((p) => {
      if (!cancelled) setSpotPrice(p);
    });
    queryPool(fromDenom, toDenom).then((pool) => {
      if (!cancelled && pool) {
        setReserves({ a: pool.reserveA, b: pool.reserveB, denomA: pool.denomA });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fromDenom, toDenom]);

  // Debounced SimulateSwap.
  useEffect(() => {
    setSimError(null);
    if (!isPositiveAmount(fromBaseUnits)) {
      setSimulation(null);
      setSimulating(false);
      return;
    }
    setSimulating(true);
    const handle = setTimeout(async () => {
      const res = await simulateSwap(fromDenom, fromBaseUnits, toDenom);
      setSimulating(false);
      if (!res) {
        setSimulation(null);
        setSimError("No live pool for this pair, or the simulation failed.");
        return;
      }
      setSimulation(res);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [fromDenom, toDenom, fromBaseUnits]);

  const minAmountOutBase = useMemo(() => {
    if (!simulation) return "0";
    return applySlippage(simulation.amountOut, slippageBps);
  }, [simulation, slippageBps]);

  const impactBps = useMemo(() => {
    if (!simulation || !reserves) return 0;
    const reserveIn = reserves.denomA === fromDenom ? reserves.a : reserves.b;
    const reserveOut = reserves.denomA === fromDenom ? reserves.b : reserves.a;
    return priceImpactBps(fromBaseUnits, simulation.amountOut, reserveIn, reserveOut);
  }, [simulation, reserves, fromBaseUnits, fromDenom]);

  function flip() {
    setFromDenom(toDenom);
    setToDenom(fromDenom);
    setFromDisplay("");
    setSimulation(null);
    setTx({ phase: "idle" });
  }

  async function handleSwap() {
    if (!session || !simulation) return;
    setTx({ phase: "pending" });
    try {
      const result = await executeSwap(
        session.signingClient,
        session.address,
        fromDenom,
        fromBaseUnits,
        toDenom,
        minAmountOutBase
      );
      setTx({ phase: "success", txHash: result.transactionHash });
      setFromDisplay("");
      setSimulation(null);
    } catch (e) {
      setTx({
        phase: "error",
        message: e instanceof Error ? e.message : "Swap failed.",
      });
    }
  }

  const toDisplayValue = simulation
    ? toDisplayUnits(simulation.amountOut, toDecimals)
    : "";

  const canSwap =
    !!session &&
    isPositiveAmount(fromBaseUnits) &&
    !!simulation &&
    tx.phase !== "pending";

  return (
    <div className="page">
      <div className="page-inner">
        <h1 className="page-title">Swap</h1>

        <div className="card">
          <SlippageSettings slippageBps={slippageBps} onChange={setSlippageBps} />

          <div className="swap-field">
            <div className="swap-field-label">From</div>
            <div className="swap-field-row">
              <input
                className="swap-amount-input"
                type="number"
                min={0}
                placeholder="0.0"
                value={fromDisplay}
                onChange={(e) => setFromDisplay(e.target.value)}
              />
              <TokenSelector
                tokens={KNOWN_TOKENS}
                value={fromDenom}
                onChange={setFromDenom}
              />
            </div>
            <div className="swap-field-sub">
              <span>{tokenLabel(fromDenom)}</span>
              <span>{fromDecimals} decimals</span>
            </div>
          </div>

          <div className="swap-direction-row">
            <button className="swap-direction-btn" onClick={flip} aria-label="Flip direction">
              ↓
            </button>
          </div>

          <div className="swap-field">
            <div className="swap-field-label">To (estimated)</div>
            <div className="swap-field-row">
              <input
                className="swap-amount-input"
                type="text"
                placeholder="0.0"
                value={toDisplayValue}
                readOnly
              />
              <TokenSelector
                tokens={KNOWN_TOKENS}
                value={toDenom}
                onChange={setToDenom}
                exclude={fromDenom}
              />
            </div>
            <div className="swap-field-sub">
              <span>{tokenLabel(toDenom)}</span>
              <span>{simulating ? "simulating…" : ""}</span>
            </div>
          </div>

          {simError && <div className="error-text" style={{ marginTop: 10 }}>{simError}</div>}

          {simulation && (
            <div className="swap-details">
              <div className="swap-details-row">
                <span className="label">Spot price</span>
                <span>
                  {spotPrice
                    ? `1 ${tokenLabel(fromDenom)} ≈ ${formatNumber(spotPrice)} ${tokenLabel(toDenom)}`
                    : "unavailable"}
                </span>
              </div>
              <div className="swap-details-row">
                <span className="label">Price impact</span>
                <span
                  className={
                    impactBps > 300 ? "impact-danger" : impactBps > 100 ? "impact-warn" : ""
                  }
                >
                  {formatPercent(impactBps)}
                </span>
              </div>
              <div className="swap-details-row">
                <span className="label">Minimum received</span>
                <span>
                  {formatNumber(toDisplayUnits(minAmountOutBase, toDecimals))}{" "}
                  {tokenLabel(toDenom)}
                </span>
              </div>
              <div className="swap-details-row">
                <span className="label">Swap fee</span>
                <span>0.3%</span>
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            {!session ? (
              <button className="btn btn-primary btn-block" disabled>
                {walletStatus === "connecting" ? "Connecting…" : "Connect wallet to swap"}
              </button>
            ) : (
              <button className="btn btn-primary btn-block" disabled={!canSwap} onClick={handleSwap}>
                {tx.phase === "pending" ? (
                  <span className="pill" style={{ justifyContent: "center" }}>
                    <span className="spinner" /> Confirm in wallet…
                  </span>
                ) : (
                  "Swap"
                )}
              </button>
            )}
          </div>

          {tx.phase === "success" && (
            <div className="success-text" style={{ marginTop: 10 }}>
              Swap confirmed. Tx hash: {tx.txHash.slice(0, 10)}…{tx.txHash.slice(-6)}
            </div>
          )}
          {tx.phase === "error" && (
            <div className="error-text" style={{ marginTop: 10 }}>
              {tx.message}
            </div>
          )}
        </div>

        <p className="note" style={{ marginTop: 14 }}>
          Prices shown are read live from the AMM contract's GetPrice / SimulateSwap
          queries on infiniteledgers-1 — no external price feed is used for INF or
          BabyINF, since none exists.
        </p>
      </div>
    </div>
  );
}
