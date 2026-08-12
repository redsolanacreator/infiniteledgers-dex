import { useEffect, useMemo, useState } from "react";
import { usePools } from "../context/PoolsContext";
import { useWallet } from "../context/WalletContext";
import { AMM_CONTRACTS, findContract, tokenDecimals, tokenLabel } from "../config/chain";
import {
  executeAddLiquidity,
  executeAddLiquiditySingleSided,
  executeCreatePool,
  executeRemoveLiquidity,
} from "../lib/contract";
import { formatNumber, isPositiveAmount, toBaseUnits, toDisplayUnits } from "../lib/format";
import { quoteMatchingAmount } from "../lib/math";

type Tab = "add" | "remove";
type TxState =
  | { phase: "idle" }
  | { phase: "pending"; label: string }
  | { phase: "success"; txHash: string }
  | { phase: "error"; message: string };

export default function LiquidityPage() {
  const { pools, refresh, addCustomPair } = usePools();
  const { session } = useWallet();

  const [tab, setTab] = useState<Tab>("add");
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newDenomA, setNewDenomA] = useState("");
  const [newDenomB, setNewDenomB] = useState("");
  const [newContractId, setNewContractId] = useState(AMM_CONTRACTS[0].id);

  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [lpAmountToRemove, setLpAmountToRemove] = useState("");

  // Single-sided deposit -- only offered for pools on a contract that
  // supports AddLiquiditySingleSided (see AmmContractConfig in
  // config/chain.ts), and only once the pool already has live reserves to
  // deposit into.
  const [singleSided, setSingleSided] = useState(false);
  const [singleSidedDenom, setSingleSidedDenom] = useState<"a" | "b">("a");
  const [singleSidedAmount, setSingleSidedAmount] = useState("");

  const [tx, setTx] = useState<TxState>({ phase: "idle" });

  useEffect(() => {
    if (!selectedKey && pools.length > 0) setSelectedKey(pools[0].key);
  }, [pools, selectedKey]);

  const selected = pools.find((p) => p.key === selectedKey);
  const decimalsA = selected ? tokenDecimals(selected.denomA) : 6;
  const decimalsB = selected ? tokenDecimals(selected.denomB) : 6;
  const selectedContract = selected ? findContract(selected.contractId) : undefined;
  const supportsSingleSided = !!selectedContract?.supportsSingleSided;

  // Single-sided only makes sense on a contract that supports it, for a
  // pool that already has live reserves to deposit into -- reset out of
  // it whenever the selected pool changes to one that doesn't qualify.
  useEffect(() => {
    if (!supportsSingleSided || !selected?.pool) {
      setSingleSided(false);
    }
  }, [selectedKey, supportsSingleSided, selected?.pool]);

  const amountABase = toBaseUnits(amountA, decimalsA);

  // Auto-calculate the matching amount for side B once a pool with
  // existing reserves is selected and side A is entered -- same UX as
  // Uniswap's add-liquidity screen. For a brand new pool (no reserves
  // yet), there's no ratio to match against, so the first LP sets it
  // freely by typing both amounts.
  useEffect(() => {
    if (!selected?.pool || !isPositiveAmount(amountABase)) return;
    const matchB = quoteMatchingAmount(amountABase, selected.pool.reserveA, selected.pool.reserveB);
    setAmountB(toDisplayUnits(matchB, decimalsB));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountA, selectedKey]);

  const amountBBase = toBaseUnits(amountB, decimalsB);

  const singleSidedDenomValue =
    selected && singleSidedDenom === "a" ? selected.denomA : selected?.denomB ?? "";
  const singleSidedDecimals = selected ? (singleSidedDenom === "a" ? decimalsA : decimalsB) : 6;
  const singleSidedAmountBase = toBaseUnits(singleSidedAmount, singleSidedDecimals);

  async function handleCreatePool() {
    if (!session) return;
    const a = newDenomA.trim();
    const b = newDenomB.trim();
    if (!a || !b) return;
    const contract = findContract(newContractId);
    if (!contract) return;
    setTx({ phase: "pending", label: "Creating pool…" });
    try {
      await executeCreatePool(session.signingClient, session.address, contract.address, a, b);
      addCustomPair(newContractId, a, b);
      await refresh();
      setTx({ phase: "idle" });
      setCreatingNew(false);
      setNewDenomA("");
      setNewDenomB("");
    } catch (e) {
      setTx({ phase: "error", message: e instanceof Error ? e.message : "CreatePool failed." });
    }
  }

  async function handleAddLiquidity() {
    if (!session || !selected) return;
    setTx({ phase: "pending", label: "Adding liquidity…" });
    try {
      const result = await executeAddLiquidity(
        session.signingClient,
        session.address,
        selected.contractAddress,
        selected.denomA,
        amountABase,
        selected.denomB,
        amountBBase
      );
      setTx({ phase: "success", txHash: result.transactionHash });
      setAmountA("");
      setAmountB("");
      await refresh();
    } catch (e) {
      setTx({ phase: "error", message: e instanceof Error ? e.message : "AddLiquidity failed." });
    }
  }

  async function handleAddLiquiditySingleSided() {
    if (!session || !selected) return;
    setTx({ phase: "pending", label: "Adding single-sided liquidity…" });
    try {
      const result = await executeAddLiquiditySingleSided(
        session.signingClient,
        session.address,
        selected.contractAddress,
        singleSidedDenomValue,
        singleSidedAmountBase
      );
      setTx({ phase: "success", txHash: result.transactionHash });
      setSingleSidedAmount("");
      await refresh();
    } catch (e) {
      setTx({
        phase: "error",
        message: e instanceof Error ? e.message : "AddLiquiditySingleSided failed.",
      });
    }
  }

  async function handleRemoveLiquidity() {
    if (!session || !selected?.pool?.poolId) return;
    setTx({ phase: "pending", label: "Removing liquidity…" });
    try {
      const result = await executeRemoveLiquidity(
        session.signingClient,
        session.address,
        selected.contractAddress,
        selected.pool.poolId,
        lpAmountToRemove
      );
      setTx({ phase: "success", txHash: result.transactionHash });
      setLpAmountToRemove("");
      await refresh();
    } catch (e) {
      setTx({ phase: "error", message: e instanceof Error ? e.message : "RemoveLiquidity failed." });
    }
  }

  const canAdd =
    !!session &&
    !!selected &&
    isPositiveAmount(amountABase) &&
    isPositiveAmount(amountBBase) &&
    tx.phase !== "pending";

  const canAddSingleSided =
    !!session && !!selected && isPositiveAmount(singleSidedAmountBase) && tx.phase !== "pending";

  return (
    <div className="page">
      <div className="page-inner">
        <h1 className="page-title">Liquidity</h1>

        <div className="tabs">
          <div className={`tab ${tab === "add" ? "active" : ""}`} onClick={() => setTab("add")}>
            Add
          </div>
          <div className={`tab ${tab === "remove" ? "active" : ""}`} onClick={() => setTab("remove")}>
            Remove
          </div>
        </div>

        <div className="card">
          {!creatingNew ? (
            <div className="form-row">
              <label className="form-label">Pool</label>
              <select
                className="select-input"
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
              >
                {pools.map((p) => (
                  <option key={p.key} value={p.key}>
                    {tokenLabel(p.denomA)} / {tokenLabel(p.denomB)} — {p.contractLabel}
                    {!p.pool ? " (no live pool yet)" : ""}
                  </option>
                ))}
              </select>
              {selected && (
                <p className="note" style={{ marginTop: 8 }}>
                  Contract:{" "}
                  <span
                    className={`badge ${
                      selected.contractId === "single-sided" ? "badge-contract-alt" : "badge-contract"
                    }`}
                  >
                    {selected.contractLabel}
                  </span>{" "}
                  — {selected.contractAddress}
                </p>
              )}
              <button
                className="btn btn-ghost"
                style={{ marginTop: 8, fontSize: 12, padding: "6px 10px" }}
                onClick={() => setCreatingNew(true)}
              >
                + Create a new pair
              </button>
            </div>
          ) : (
            <div>
              <div className="form-row">
                <label className="form-label">Contract</label>
                <select
                  className="select-input"
                  value={newContractId}
                  onChange={(e) => setNewContractId(e.target.value)}
                >
                  {AMM_CONTRACTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} ({c.address.slice(0, 10)}…)
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label className="form-label">Denom A</label>
                <input
                  className="text-input"
                  placeholder="e.g. minf"
                  value={newDenomA}
                  onChange={(e) => setNewDenomA(e.target.value)}
                />
              </div>
              <div className="form-row">
                <label className="form-label">Denom B</label>
                <input
                  className="text-input"
                  placeholder="e.g. factory/inf.../babyinf"
                  value={newDenomB}
                  onChange={(e) => setNewDenomB(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => setCreatingNew(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!session || !newDenomA.trim() || !newDenomB.trim() || tx.phase === "pending"}
                  onClick={handleCreatePool}
                >
                  Create Pool
                </button>
              </div>
              <p className="note" style={{ marginTop: 10 }}>
                CreatePool registers the pair with zero reserves. Once it's created,
                switch back and add the initial liquidity via the Add tab.
              </p>
            </div>
          )}
        </div>

        {!creatingNew && selected && tab === "add" && (
          <div className="card">
            {supportsSingleSided && selected.pool && (
              <div className="tabs" style={{ marginBottom: 14 }}>
                <div
                  className={`tab ${!singleSided ? "active" : ""}`}
                  onClick={() => setSingleSided(false)}
                >
                  Both sides
                </div>
                <div
                  className={`tab ${singleSided ? "active" : ""}`}
                  onClick={() => setSingleSided(true)}
                >
                  Single-sided
                </div>
              </div>
            )}

            {singleSided && supportsSingleSided && selected.pool ? (
              <>
                <div className="swap-field">
                  <div className="swap-field-label">Deposit</div>
                  <div className="swap-field-row">
                    <input
                      className="swap-amount-input"
                      type="number"
                      min={0}
                      placeholder="0.0"
                      value={singleSidedAmount}
                      onChange={(e) => setSingleSidedAmount(e.target.value)}
                    />
                  </div>
                  <div className="contract-select-row">
                    <button
                      type="button"
                      className={`contract-select-chip${singleSidedDenom === "a" ? " active" : ""}`}
                      onClick={() => setSingleSidedDenom("a")}
                    >
                      {tokenLabel(selected.denomA)}
                    </button>
                    <button
                      type="button"
                      className={`contract-select-chip${singleSidedDenom === "b" ? " active" : ""}`}
                      onClick={() => setSingleSidedDenom("b")}
                    >
                      {tokenLabel(selected.denomB)}
                    </button>
                  </div>
                </div>
                <p className="note" style={{ marginTop: 10 }}>
                  Deposits just {tokenLabel(singleSidedDenomValue)} via AddLiquiditySingleSided —
                  a capability only the {selected.contractLabel} contract has. The contract
                  balances this into the pool itself; no matching amount of the other token is
                  required from you.
                </p>
                <button
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 14 }}
                  disabled={!canAddSingleSided}
                  onClick={handleAddLiquiditySingleSided}
                >
                  {!session
                    ? "Connect wallet"
                    : tx.phase === "pending"
                    ? "Confirm in wallet…"
                    : "Add Single-Sided"}
                </button>
              </>
            ) : (
              <>
                <div className="swap-field">
                  <div className="swap-field-label">{tokenLabel(selected.denomA)}</div>
                  <input
                    className="swap-amount-input"
                    type="number"
                    min={0}
                    placeholder="0.0"
                    value={amountA}
                    onChange={(e) => setAmountA(e.target.value)}
                  />
                </div>
                <div className="swap-field" style={{ marginTop: 8 }}>
                  <div className="swap-field-label">{tokenLabel(selected.denomB)}</div>
                  <input
                    className="swap-amount-input"
                    type="number"
                    min={0}
                    placeholder="0.0"
                    value={amountB}
                    onChange={(e) => setAmountB(e.target.value)}
                  />
                </div>
                {selected.pool && (
                  <p className="note" style={{ marginTop: 10 }}>
                    Auto-matched to the pool's current ratio. Edit either field if you want
                    to override it (the contract will still enforce its own ratio rules).
                  </p>
                )}
                {!selected.pool && (
                  <p className="note" style={{ marginTop: 10 }}>
                    No live pool for this pair yet — as the first liquidity provider, the
                    amounts you enter set the pool's initial price.
                  </p>
                )}
                <button
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 14 }}
                  disabled={!canAdd}
                  onClick={handleAddLiquidity}
                >
                  {!session ? "Connect wallet" : tx.phase === "pending" ? "Confirm in wallet…" : "Add Liquidity"}
                </button>
              </>
            )}
          </div>
        )}

        {!creatingNew && selected && tab === "remove" && (
          <div className="card">
            {!selected.pool ? (
              <div className="empty-state">No live pool to remove liquidity from.</div>
            ) : (
              <>
                <p className="note" style={{ marginBottom: 10 }}>
                  The contract's documented queries don't expose a per-address LP
                  balance (see the Pools page for detail), so this can't pre-fill your
                  actual holdings or cap a slider to your real max — enter the exact LP
                  share amount you want to withdraw.
                </p>
                <div className="form-row">
                  <label className="form-label">LP shares to remove</label>
                  <input
                    className="text-input"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={lpAmountToRemove}
                    onChange={(e) => setLpAmountToRemove(e.target.value)}
                  />
                </div>
                <div className="swap-details-row" style={{ marginBottom: 10 }}>
                  <span className="label">Pool LP total supply</span>
                  <span>{formatNumber(selected.pool.lpSupply, 0)}</span>
                </div>
                <button
                  className="btn btn-primary btn-block"
                  disabled={!session || !lpAmountToRemove || tx.phase === "pending"}
                  onClick={handleRemoveLiquidity}
                >
                  {!session
                    ? "Connect wallet"
                    : tx.phase === "pending"
                    ? "Confirm in wallet…"
                    : "Remove Liquidity"}
                </button>
              </>
            )}
          </div>
        )}

        {tx.phase === "success" && (
          <p className="success-text" style={{ marginTop: 10 }}>
            Confirmed. Tx hash: {tx.txHash.slice(0, 10)}…{tx.txHash.slice(-6)}
          </p>
        )}
        {tx.phase === "error" && (
          <p className="error-text" style={{ marginTop: 10 }}>
            {tx.message}
          </p>
        )}
      </div>
    </div>
  );
}
