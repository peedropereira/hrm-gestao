// Símbolo do app: um flange visto de frente (anel, furo central e seis parafusos).
const BOLTS: [number, number][] = [
  [16, 8.8],
  [22.24, 12.4],
  [22.24, 19.6],
  [16, 23.2],
  [9.76, 19.6],
  [9.76, 12.4],
];

export function FlangeMark({ size = 30, bg = "var(--ac)", fg = "var(--ac-fg)", className }: { size?: number; bg?: string; fg?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" style={{ fill: bg }} />
      <circle cx="16" cy="16" r="10.6" style={{ fill: "none", stroke: fg, strokeWidth: 2.2 }} />
      <circle cx="16" cy="16" r="3.9" style={{ fill: "none", stroke: fg, strokeWidth: 2.2 }} />
      {BOLTS.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.35" style={{ fill: fg }} />
      ))}
    </svg>
  );
}
