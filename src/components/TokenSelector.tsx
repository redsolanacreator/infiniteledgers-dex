import { KnownToken } from "../config/chain";

export default function TokenSelector({
  tokens,
  value,
  onChange,
  exclude,
}: {
  tokens: KnownToken[];
  value: string;
  onChange: (denom: string) => void;
  exclude?: string;
}) {
  const options = tokens.filter((t) => t.denom !== exclude);
  return (
    <div className="token-select">
      <span className="token-dot" />
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((t) => (
          <option key={t.denom} value={t.denom}>
            {t.symbol}
          </option>
        ))}
      </select>
    </div>
  );
}
