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
        </div>
      )}
      {/*
        Deliberately OUTSIDE the `open &&` block above: the wallet buttons
        call setOpen(false) immediately on click, before awaiting connect(),
        so `open` is already false by the time a failed connect() sets
        `error`. An error div nested inside `open && (...)` would never
        render -- every connection failure (wrong extension not found, no
        wallet set up yet, user rejected, ...) would look like the dropdown
        just silently closing with zero feedback. Shown only while the
        dropdown itself is closed so it doesn't overlap the open list, and
        it clears naturally the next time the user reopens the dropdown to
        retry.
      */}
      {!open && error && (
        <div
          className="card error-text"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 220,
            zIndex: 20,
            padding: "10px 12px",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
