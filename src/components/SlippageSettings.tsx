const PRESETS = [50, 100]; // bps: 0.5%, 1%

export default function SlippageSettings({
  slippageBps,
  onChange,
}: {
  slippageBps: number;
  onChange: (bps: number) => void;
}) {
  const isCustom = !PRESETS.includes(slippageBps);
  return (
    <div className="slippage-row">
      <span className="muted" style={{ fontSize: 13 }}>
        Slippage tolerance
      </span>
      <div className="slippage-options">
        {PRESETS.map((bps) => (
          <button
            key={bps}
            className={`slippage-chip ${!isCustom && slippageBps === bps ? "active" : ""}`}
            onClick={() => onChange(bps)}
          >
            {(bps / 100).toFixed(1)}%
          </button>
        ))}
        <input
          className="slippage-chip-input"
          type="number"
          min={0}
          max={50}
          step={0.1}
          value={isCustom ? slippageBps / 100 : ""}
          placeholder="Custom"
          onChange={(e) => {
            const pct = Number(e.target.value);
            if (Number.isFinite(pct) && pct >= 0) onChange(Math.round(pct * 100));
          }}
        />
      </div>
    </div>
  );
}
