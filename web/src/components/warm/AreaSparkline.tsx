type Accent = "sage" | "ocean" | "sand" | "mint";

interface Props {
  values: number[];
  w?: number;
  h?: number;
  accent?: Accent;
}

const FILL: Record<Accent, string> = {
  sage:  "#cdd9cf",
  ocean: "#cdd9ec",
  sand:  "#ede4cf",
  mint:  "#c8e0d4",
};

/** Garnet-stroke + accent-fill sparkline used inside `MetricCard`. */
export function AreaSparkline({ values, w = 120, h = 30, accent = "sage" }: Props) {
  if (!values || values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = w / (values.length - 1 || 1);
  const pts = values.map<[number, number]>((v, i) => [i * stepX, h - 4 - ((v - min) / range) * (h - 8)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]!.toFixed(1)} ${p[1]!.toFixed(1)}`).join(" ");
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  const last = pts[pts.length - 1]!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="block" aria-hidden>
      <path d={area} fill={FILL[accent]} opacity={0.5} />
      <path d={d} fill="none" stroke="var(--usc-garnet)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill="var(--usc-garnet)" />
    </svg>
  );
}
