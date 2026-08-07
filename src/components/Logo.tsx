// Placeholder brand mark. The build spec asked for the real Infinite
// Ledgers logo "from other project folders" if accessible -- this
// sandbox has no such folders (and per the project brief, this project
// shouldn't read from other project folders on this machine anyway), so
// this is a clean placeholder consistent with the black/gold branding.
// Drop in the real logo file and swap this component's contents when
// it's available.
export default function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="7" fill="#131313" stroke="#2a2a2a" />
      <path
        d="M16 6 L25 11.5 V20.5 L16 26 L7 20.5 V11.5 Z"
        fill="none"
        stroke="#d4af37"
        strokeWidth="1.6"
      />
      <circle cx="16" cy="16" r="4" fill="#d4af37" />
    </svg>
  );
}
