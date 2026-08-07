import { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { SUPPORTED_WALLETS, isWalletInstalled } from "../lib/wallet";
import { shortenAddress } from "../lib/format";

export default function ConnectWalletButton() {
  const { status, session, error, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);

  if (session) {
    return (
      <button className="btn" onClick={disconnect} title="Click to disconnect">
        <span className="pill">
          <span className="token-dot" style={{ width: 14, height: 14 }} />
          {shortenAddress(session.address)}
        </span>
      </button>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn btn-primary"
        onClick={() => setOpen((o) => !o)}
        disabled={status === "connecting"}
      >
        {status === "connecting" ? "Connecting…" : "Connect Wallet"}
      </button>
      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 220,
            zIndex: 20,
          }}
        >
          {SUPPORTED_WALLETS.map((w) => {
            const installed = isWalletInstalled(w.id);
            return (
              <button
                key={w.id}
                className="btn"
                style={{ width: "100%", marginBottom: 8, justifyContent: "space-between" }}
                disabled={!installed}
                onClick={async () => {
                  setOpen(false);
                  await connect(w.id);
                }}
              >
                <span>{w.label}</span>
                {!installed && <span className="muted" style={{ fontSize: 11 }}>Not found</span>}
              </button>
            );
          })}
          {error && <div className="error-text">{error}</div>}
        </div>
      )}
    </div>
  );
}
