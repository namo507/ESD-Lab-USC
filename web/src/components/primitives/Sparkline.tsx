interface SparklineProps {
  values: number[];
  w?: number;
  h?: number;
  color?: string;
  fill?: boolean;
  dotLast?: boolean;
}

export function Sparkline({
  values,
  w = 120,
  h = 28,
  color,
  fill = false,
  dotLast = false,
}: SparklineProps) {
  if (!values || values.length === 0) return null;
  const stroke = color ?? "var(--slate-700)";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = w / (values.length - 1 || 1);
  const pts = values.map<[number, number]>((v, i) => [
    i * stepX,
    h - ((v - min) / span) * (h - 4) - 2,
  ]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0]!.toFixed(1) + " " + p[1]!.toFixed(1)).join(" ");
  const fillD = fill ? `${d} L ${w} ${h} L 0 ${h} Z` : null;
  const last = pts[pts.length - 1]!;
  return (
    <svg width={w} height={h} style={{ display: "block" }} aria-hidden="true">
      {fillD && <path d={fillD} fill={stroke} opacity={0.08} />}
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      {dotLast && <circle cx={last[0]} cy={last[1]} r={2} fill={stroke} />}
    </svg>
  );
}
