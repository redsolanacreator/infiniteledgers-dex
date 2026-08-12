import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AMM_CONTRACTS,
  KNOWN_TOKENS,
  NATIVE_DECIMALS,
  NATIVE_DENOM,
  NATIVE_SYMBOL,
  tokenDecimals,
  tokenLabel,
} from "../config/chain";
import type { AmmContractConfig } from "../config/chain";
import TokenSelector from "../components/TokenSelector";
import SlippageSettings from "../components/SlippageSettings";
import { useWallet } from "../context/WalletContext";
import {
  estimateSwapFee,
  executeSwap,
  fallbackSwapFee,
  queryBalance,
  queryPool,
  queryPrice,
  simulateSwap,
} from "../lib/contract";
import type { SwapFeeEstimate } from "../lib/contract";
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

  // Supports being linked to with ?to=<denom> (e.g. from the wallet
  // extension's "Buy" button) to pre-select the target token. Only
  // takes effect for a denom already in KNOWN_TOKENS -- this page's
  // dropdown has no mechanism to swap into a token it doesn't know
  // about, so an unrecognized value is ignored and the usual default
  // applies instead of silently landing on a broken selection.
  const [searchParams] = useSearchParams();
  const requestedToDenom = searchParams.get("to");

  const [fromDenom, setFromDenom] = useState(NATIVE_DENOM);
  const [toDenom, setToDenom] = useState(() => {
    if (requestedToDenom && KNOWN_TOKENS.some((t) => t.denom === requestedToDenom && t.denom !== NATIVE_DENOM)) {
      return requestedToDenom;
    }
    return KNOWN_TOKENS.find((t) => t.denom !== NATIVE_DENOM)?.denom ?? NATIVE_DENOM;
  });
  const [fromDisplay, setFromDisplay] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);

  const [simulation, setSimulation] = useState<SwapSimulation | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [spotPrice, setSpotPrice] = useState<string | null>(null);
  const [reserves, setReserves] = useState<{ a: string; b: string; denomA: string } | null>(null);

  // Which contract(s) actually have a live pool for the currently selected
  // pair, and which one the user is acting against. Two separate,
  // independently-deployed AMM contracts can both list the same pair (e.g.
  // minf/ATOM), so this isn't hardcoded to a single contract.
  const [availableContracts, setAvailableContracts] = useState<AmmContractConfig[]>([]);
  const [contractId, setContractId] = useState<string>(AMM_CONTRACTS[0].id);
  const activeContract = useMemo(
    () => AMM_CONTRACTS.find((c) => c.id === contractId) ?? AMM_CONTRACTS[0],
    [contractId]
  );

  const [tx, setTx] = useState<TxState>({ phase: "idle" });

  // Base-unit balances for whichever denoms are currently selected, or null
  // while loading / if the query failed / if no wallet is connected -- kept
  // distinct from "0" so the UI never shows a fabricated zero balance.
  const [fromBalance, setFromBalance] = useState<string | null>(null);
  const [toBalance, setToBalance] = useState<string | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);

  const [feeEstimate, setFeeEstimate] = useState<SwapFeeEstimate | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);

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

  // Discover which contract(s) have a live pool for the selected pair.
  // Runs whenever the pair changes; when the previously-selected contract
  // is no longer one of the results, falls back to the first available one
  // (or the default contract if the pair isn't live anywhere).
  useEffect(() => {
    let cancelled = false;
    setAvailableContracts([]);
    Promise.all(
      AMM_CONTRACTS.map(async (c) => {
        const pool = await queryPool(c.address, fromDenom, toDenom);
        return pool ? c : null;
      })
    ).then((results) => {
      if (cancelled) return;
      const found = results.filter((c): c is AmmContractConfig => c !== null);
      setAvailableContracts(found);
      setContractId((prev) => (found.some((c) => c.id === prev) ? prev : found[0]?.id ?? AMM_CONTRACTS[0].id));
    });
    return () => {
      cancelled = true;
    };
  }, [fromDenom, toDenom]);

  // Fetch spot price + reserves for the selected contract whenever the pair
  // or the chosen contract changes (for price impact context).
  useEffect(() => {
    let cancelled = false;
    setSpotPrice(null);
    setReserves(null);
    const contractAddress = activeContract.address;
    queryPrice(contractAddress, fromDenom, toDenom).then((p) => {
      if (!cancelled) setSpotPrice(p);
    });
    queryPool(contractAddress, fromDenom, toDenom).then((pool) => {
      if (!cancelled && pool) {
        setReserves({ a: pool.reserveA, b: pool.reserveB, denomA: pool.denomA });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fromDenom, toDenom, activeContract.address]);

  // Live wallet balances for the selected pair. Cleared to null immediately
  // on denom/session change (not just at the end) so a stale balance for
  // the previous denom is never used for the Max/insufficient-balance checks
  // while the new one is still in flight.
  useEffect(() => {
    if (!session) {
      setFromBalance(null);
      setToBalance(null);
      setBalancesLoading(false);
      return;
    }
    let cancelled = false;
    setFromBalance(null);
    setToBalance(null);
    setBalancesLoading(true);
    Promise.all([
      queryBalance(session.address, fromDenom),
      queryBalance(session.address, toDenom),
    ]).then(([fb, tb]) => {
      if (cancelled) return;
      setFromBalance(fb);
      setToBalance(tb);
      setBalancesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [session, fromDenom, toDenom]);

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
      const res = await simulateSwap(activeContract.address, fromDenom, fromBaseUnits, toDenom);
      setSimulating(false);
      if (!res) {
        setSimulation(null);
        setSimError("No live pool for this pair, or the simulation failed.");
        return;
      }
      setSimulation(res);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [fromDenom, toDenom, fromBaseUnits, activeContract.address]);

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

  // Debounced pre-submit fee estimate, once there's a live quote to estimate against.
  useEffect(() => {
    if (!session || !simulation || !isPositiveAmount(fromBaseUnits)) {
      setFeeEstimate(null);
      setFeeLoading(false);
      return;
    }
    setFeeLoading(true);
    const handle = setTimeout(async () => {
      const est = await estimateSwapFee(
        session.signingClient,
        session.address,
        activeContract.address,
        fromDenom,
        fromBaseUnits,
        toDenom,
        minAmountOutBase
      );
      setFeeEstimate(est);
      setFeeLoading(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [session, fromDenom, toDenom, fromBaseUnits, minAmountOutBase, simulation, activeContract.address]);

  // Estimated network fee in native base units -- from the live simulate()
  // result once available, otherwise the static fallback (e.g. before any
  // amount is typed, for the Max-button buffer).
  const feeCoinBase = useMemo(() => {
    const fee = feeEstimate?.fee ?? fallbackSwapFee();
    return fee.amount.find((c) => c.denom === NATIVE_DENOM)?.amount ?? "0";
  }, [feeEstimate]);

  // Max button target: full balance, minus the gas-fee reserve when the
  // native token itself is being swapped (so Max never proposes an amount
  // that would leave nothing to pay the tx fee with).
  const maxAmountBase = useMemo(() => {
    if (fromBalance === null) return null;
    try {
      let bal = BigInt(fromBalance);
      if (fromDenom === NATIVE_DENOM) bal -= BigInt(feeCoinBase);
      return bal > 0n ? bal.toString() : "0";
    } catch {
      return null;
    }
  }, [fromBalance, fromDenom, feeCoinBase]);

  // Total native-denom cost when swapping the native token itself (swap
  // amount + fee both drawn from the same balance).
  const totalNativeBase = useMemo(() => {
    try {
      return (BigInt(fromBaseUnits || "0") + BigInt(feeCoinBase)).toString();
    } catch {
      return fromBaseUnits;
    }
  }, [fromBaseUnits, feeCoinBase]);

  const insufficientBalance = useMemo(() => {
    if (fromBalance === null || !isPositiveAmount(fromBaseUnits)) return false;
    try {
      const required =
        fromDenom === NATIVE_DENOM ? BigInt(fromBaseUnits) + BigInt(feeCoinBase) : BigInt(fromBaseUnits);
      return required > BigInt(fromBalance);
    } catch {
      return false;
    }
  }, [fromBalance, fromBaseUnits, fromDenom, feeCoinBase]);

  function handleMax() {
    if (maxAmountBase === null) return;
    setFromDisplay(toDisplayUnits(maxAmountBase, fromDecimals));
  }

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
        activeContract.address,
        fromDenom,
        fromBaseUnits,
        toDenom,
        minAmountOutBase
      );
      setTx({ phase: "success", txHash: result.transactionHash });
      setFromDisplay("");
      setSimulation(null);
      // Refresh balances immediately so the just-spent/received amounts show right away.
      const [fb, tb] = await Promise.all([
        queryBalance(session.address, fromDenom),
        queryBalance(session.address, toDenom),
      ]);
      setFromBalance(fb);
      setToBalance(tb);
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
    !insufficientBalance &&
    tx.phase !== "pending";

  return (
    <div className="page">
      <div className="page-inner">
        <h1 className="page-title">Swap</h1>

        <div className="card">
          <SlippageSettings slippageBps={slippageBps} onChange={setSlippageBps} />

          {availableContracts.length > 1 && (
            <div>
              <div className="swap-field-label">Pool source</div>
              <div className="contract-select-row">
                {availableContracts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`contract-select-chip${c.id === contractId ? " active" : ""}`}
                    onClick={() => setContractId(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="note" style={{ marginBottom: 10 }}>
                This pair has a live pool on more than one AMM contract — these are
                separate, independent pools, not one shared pool. Pick which to swap
                against.
              </p>
            </div>
          )}
          {availableContracts.length === 1 && (
            <p className="note" style={{ marginBottom: 10 }}>
              Pool source:{" "}
              <span
                className={`badge ${
                  availableContracts[0].id === "single-sided" ? "badge-contract-alt" : "badge-contract"
                }`}
              >
                {availableContracts[0].label}
              </span>
            </p>
          )}

          <div className={`swap-field${insufficientBalance ? " insufficient" : ""}`}>
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
            {session && (
              <div className="swap-field-sub balance-row">
                <span>
                  Balance:{" "}
                  {fromBalance === null
                    ? balancesLoading
                      ? "loading…"
                      : "unavailable"
                    : `${formatNumber(toDisplayUnits(fromBalance, fromDecimals))} ${tokenLabel(fromDenom)}`}
                </span>
                {fromBalance !== null && (
                  <button type="button" className="max-chip" onClick={handleMax}>
                    Max
                  </button>
                )}
              </div>
            )}
            {insufficientBalance && (
              <div className="error-text" style={{ marginTop: 8 }}>
                Insufficient balance
              </div>
            )}
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
            {session && (
              <div className="swap-field-sub balance-row">
                <span>
                  Balance:{" "}
                  {toBalance === null
                    ? balancesLoading
                      ? "loading…"
                      : "unavailable"
                    : `${formatNumber(toDisplayUnits(toBalance, toDecimals))} ${tokenLabel(toDenom)}`}
                </span>
              </div>
            )}
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
              <div className="swap-details-row">
                <span className="label">Network fee (estimated)</span>
                <span>
                  {feeLoading
                    ? "estimating…"
                    : `≈ ${formatNumber(toDisplayUnits(feeCoinBase, NATIVE_DECIMALS))} ${NATIVE_SYMBOL}${
                        feeEstimate && !feeEstimate.simulated ? " (approx.)" : ""
                      }`}
                </span>
              </div>
              <div className="swap-details-row swap-details-total">
                <span className="label">Total cost</span>
                <span>
                  {fromDenom === NATIVE_DENOM
                    ? `≈ ${formatNumber(toDisplayUnits(totalNativeBase, NATIVE_DECIMALS))} ${NATIVE_SYMBOL}`
                    : `${fromDisplay || "0"} ${tokenLabel(fromDenom)} + ≈${formatNumber(
                        toDisplayUnits(feeCoinBase, NATIVE_DECIMALS)
                      )} ${NATIVE_SYMBOL} fee`}
                </span>
              </div>
              {fromDenom === NATIVE_DENOM && (
                <div className="note">
                  Swapping {NATIVE_SYMBOL} itself — the swap amount and the network fee
                  both come out of your {NATIVE_SYMBOL} balance.
                </div>
              )}
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
          Prices shown are read live from the selected AMM contract's GetPrice /
          SimulateSwap queries on infiniteledgers-1 — no external price feed is used
          for INF or BabyINF, since none exists.
        </p>
      </div>
    </div>
  );
}
