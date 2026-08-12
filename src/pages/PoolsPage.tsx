import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePools } from "../context/PoolsContext";
import { AMM_CONTRACTS, tokenDecimals, tokenLabel } from "../config/chain";
import { formatNumber, toDisplayUnits } from "../lib/format";
import { getAtomUsdPrice } from "../lib/coingecko";

const ATOM_DENOM =
  "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2";

export default function PoolsPage() {
  const { pools, loading, refresh, addCustomPair } = usePools();
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [denomA, setDenomA] = useState("");
  const [denomB, setDenomB] = useState("");
  const [addContractId, setAddContractId] = useState(AMM_CONTRACTS[0].id);
  const [atomUsd, setAtomUsd] = useState<number | null>(null);

  useEffect(() => {
    getAtomUsdPrice().then(setAtomUsd);
  }, []);

  function derivedTvlUsd(entry: (typeof pools)[number]): string | null {
    if (!entry.pool || atomUsd === null) return null;
    const involvesAtom = entry.denomA === ATOM_DENOM || entry.denomB === ATOM_DENOM;
    if (!involvesAtom) return null;
    const atomReserveBase =
      entry.denomA === ATOM_DENOM ? entry.pool.reserveA : entry.pool.reserveB;
    const atomReserve = Number(toDisplayUnits(atomReserveBase, tokenDecimals(ATOM_DENOM)));
    // Both sides of a balanced constant-product pool hold roughly equal
    // value, so total pool value ≈ 2 × (ATOM side value). This is a
    // rough, clearly-labeled estimate, not an exact TVL figure.
    const value = atomReserve * atomUsd * 2;
    return value.toFixed(2);
  }

  return (
    <div className="page">
      <div className="page-inner-wide">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 className="page-title">Pools</h1>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <button className="btn" onClick={() => refresh()}>
              {loading ? <span className="spinner" /> : "Refresh"}
            </button>
            <button className="btn" onClick={() => setShowAdd((s) => !s)}>
              + Track pool
            </button>
          </div>
        </div>

        {showAdd && (
          <div className="card" style={{ marginBottom: 12 }}>
            <p className="note" style={{ marginBottom: 10 }}>
              The AMM contract's documented queries look up one pool at a time by its
              two denoms — there's no "list all pools" query to enumerate every live
              pool automatically. If a pool exists that isn't shown below, add its two
              denoms here and it'll be tracked from then on (saved locally in this
              browser).
            </p>
            <div className="form-row">
              <label className="form-label">Contract</label>
              <select
                className="select-input"
                value={addContractId}
                onChange={(e) => setAddContractId(e.target.value)}
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
                value={denomA}
                onChange={(e) => setDenomA(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label className="form-label">Denom B</label>
              <input
                className="text-input"
                placeholder="e.g. ibc/…"
                value={denomB}
                onChange={(e) => setDenomB(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary"
              disabled={!denomA.trim() || !denomB.trim()}
              onClick={() => {
                addCustomPair(addContractId, denomA, denomB);
                setDenomA("");
                setDenomB("");
                setShowAdd(false);
              }}
            >
              Add
            </button>
          </div>
        )}

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Pool</th>
                <th>Contract</th>
                <th>Reserves</th>
                <th>Spot price</th>
                <th>LP supply</th>
                <th>Est. value</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((entry) => {
                const tvl = derivedTvlUsd(entry);
                return (
                  <tr
                    key={entry.key}
                    className="table-row-link"
                    onClick={() => navigate(`/pools/${encodeURIComponent(entry.key)}`)}
                  >
                    <td>
                      <span className="pill">
                        {tokenLabel(entry.denomA)} / {tokenLabel(entry.denomB)}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          entry.contractId === "single-sided" ? "badge-contract-alt" : "badge-contract"
                        }`}
                        title={entry.contractAddress}
                      >
                        {entry.contractLabel}
                      </span>
                    </td>
                    <td>
                      {entry.loading ? (
                        <span className="spinner" />
                      ) : entry.pool ? (
                        <span className="muted">
                          {formatNumber(
                            toDisplayUnits(entry.pool.reserveA, tokenDecimals(entry.denomA))
                          )}{" "}
                          {tokenLabel(entry.denomA)} +{" "}
                          {formatNumber(
                            toDisplayUnits(entry.pool.reserveB, tokenDecimals(entry.denomB))
                          )}{" "}
                          {tokenLabel(entry.denomB)}
                        </span>
                      ) : (
                        <span className="muted">no live pool yet</span>
                      )}
                    </td>
                    <td>
                      {entry.price ? (
                        `${formatNumber(entry.price)} ${tokenLabel(entry.denomB)}/${tokenLabel(
                          entry.denomA
                        )}`
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {entry.pool ? formatNumber(entry.pool.lpSupply, 0) : <span className="muted">—</span>}
                    </td>
                    <td>
                      {tvl ? (
                        <span className="pill">
                          ${formatNumber(tvl)} <span className="badge badge-derived">DERIVED</span>
                        </span>
                      ) : (
                        <span className="muted">n/a</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pools.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    No pools tracked yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="note" style={{ marginTop: 14 }}>
          Reserves, spot price, and LP supply come directly from each pool's own
          contract via its GetPool / GetPrice queries — nothing here is simulated.
          "Est. value" only appears for ATOM pools and is explicitly a derived
          estimate (pool ratio × ATOM's live CoinGecko price), never a direct feed —
          INF and BabyINF have no external market, so no USD figure is shown for them.
          The <strong>Contract</strong> column shows which of the two separate AMM
          deployments each pool lives in — they are independent contracts with
          independent liquidity, even when they happen to list the same pair.
        </p>
      </div>
    </div>
  );
}
