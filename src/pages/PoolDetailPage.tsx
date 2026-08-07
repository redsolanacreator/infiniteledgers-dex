import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePools } from "../context/PoolsContext";
import { useWallet } from "../context/WalletContext";
import { tokenDecimals, tokenLabel } from "../config/chain";
import { formatNumber, toDisplayUnits } from "../lib/format";
import { queryLpBalance } from "../lib/contract";

export default function PoolDetailPage() {
  const { poolKey: rawPoolKey } = useParams();
  const poolKey = rawPoolKey ? decodeURIComponent(rawPoolKey) : undefined;
  const { pools } = usePools();
  const { session } = useWallet();
  const entry = pools.find((p) => p.key === poolKey);

  const [lpBalance, setLpBalance] = useState<string | null | "loading">("loading");

  useEffect(() => {
    if (!session || !entry) {
      setLpBalance(null);
      return;
    }
    setLpBalance("loading");
    queryLpBalance(entry.pool?.poolId ?? null, session.address).then(setLpBalance);
  }, [session, entry]);

  if (!entry) {
    return (
      <div className="page">
        <div className="page-inner">
          <Link to="/pools" className="link-back">
            ← Back to pools
          </Link>
          <div className="empty-state">
            This pool isn't tracked. Go back and add it from the Pools page.
          </div>
        </div>
      </div>
    );
  }

  const { denomA, denomB, pool, price } = entry;

  return (
    <div className="page">
      <div className="page-inner">
        <Link to="/pools" className="link-back">
          ← Back to pools
        </Link>
        <h1 className="page-title">
          {tokenLabel(denomA)} / {tokenLabel(denomB)}
        </h1>

        <div className="card">
          {!pool ? (
            <div className="empty-state">No live pool exists for this pair yet.</div>
          ) : (
            <div className="swap-details">
              {pool.poolId && (
                <div className="swap-details-row">
                  <span className="label">Pool ID</span>
                  <span>{pool.poolId}</span>
                </div>
              )}
              <div className="swap-details-row">
                <span className="label">Reserve — {tokenLabel(denomA)}</span>
                <span>{formatNumber(toDisplayUnits(pool.reserveA, tokenDecimals(denomA)))}</span>
              </div>
              <div className="swap-details-row">
                <span className="label">Reserve — {tokenLabel(denomB)}</span>
                <span>{formatNumber(toDisplayUnits(pool.reserveB, tokenDecimals(denomB)))}</span>
              </div>
              <div className="swap-details-row">
                <span className="label">Spot price</span>
                <span>
                  {price
                    ? `1 ${tokenLabel(denomA)} ≈ ${formatNumber(price)} ${tokenLabel(denomB)}`
                    : "unavailable"}
                </span>
              </div>
              <div className="swap-details-row">
                <span className="label">LP total supply</span>
                <span>{formatNumber(pool.lpSupply, 0)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="swap-field-label" style={{ marginBottom: 10 }}>
            Your LP position
          </div>
          {!session ? (
            <p className="muted">Connect your wallet to view your position.</p>
          ) : lpBalance === "loading" ? (
            <span className="spinner" />
          ) : lpBalance === null ? (
            <div>
              <p className="muted" style={{ marginBottom: 6 }}>
                Not available yet.
              </p>
              <p className="note">
                The documented contract interface (GetPool, GetPrice, SimulateSwap)
                doesn't include a query for one address's LP share balance. LP shares
                are tracked internally in contract state rather than as a separate
                token, so this needs the actual query name/shape from the contract
                (its schema.json, or whoever deployed it) — see queryLpBalance in
                src/lib/contract.ts, which is stubbed out on purpose rather than
                showing a guessed number.
              </p>
            </div>
          ) : (
            <span>{formatNumber(lpBalance, 0)} LP shares</span>
          )}
        </div>
      </div>
    </div>
  );
}
