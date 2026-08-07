import { useNetworkStatus } from "../context/NetworkStatusContext";

export default function StatusBanner() {
  const status = useNetworkStatus();
  if (status !== "reconnecting") return null;
  return (
    <div className="status-banner">
      <span className="status-dot" />
      Can't reach Infinite Ledgers RPC right now — reconnecting…
    </div>
  );
}
