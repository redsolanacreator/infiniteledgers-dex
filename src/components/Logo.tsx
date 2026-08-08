export default function Logo({ size = 26 }: { size?: number }) {
  return (
    <img
      src="/infiniteledgers.png"
      alt="Infinite Ledgers"
      width={size}
      height={size}
      style={{ borderRadius: "20%", display: "block", objectFit: "cover" }}
    />
  );
}
