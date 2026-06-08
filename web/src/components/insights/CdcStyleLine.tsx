import * as d3 from "d3";

export interface CdcLinePoint {
  x: number;
  y: number;
  ciLow?: number;
  ciHigh?: number;
}

export interface CdcLineSeries {
  label: string;
  color: string;
  points: CdcLinePoint[];
}

interface CdcStyleLineProps {
  series: CdcLineSeries[];
  yLabel: string;
  showCi?: boolean;
  summary?: string;
}

export function CdcStyleLine({ series, yLabel, showCi = true, summary }: CdcStyleLineProps) {
  const W = 760;
  const H = 320;
  const pad = { l: 56, r: 28, t: 20, b: 42 };
  const all = series.flatMap((item) => item.points);
  if (!all.length) {
    return <p style={{ margin: 0, color: "var(--slate-500)", fontSize: 13 }}>No data available for this filter combination</p>;
  }
  const x = d3.scaleLinear().domain(d3.extent(all, (point) => point.x) as [number, number]).range([pad.l, W - pad.r]);
  const yMin = d3.min(all, (point) => showCi ? point.ciLow ?? point.y : point.y) ?? 0;
  const yMax = d3.max(all, (point) => showCi ? point.ciHigh ?? point.y : point.y) ?? 1;
  const y = d3.scaleLinear().domain([yMin * 0.96, yMax * 1.04]).nice().range([H - pad.b, pad.t]);
  const line = d3.line<CdcLinePoint>().x((point) => x(point.x)).y((point) => y(point.y));
  const area = d3.area<CdcLinePoint>()
    .x((point) => x(point.x))
    .y0((point) => y(point.ciLow ?? point.y))
    .y1((point) => y(point.ciHigh ?? point.y));

  return (
    <figure style={{ margin: 0 }}>
      {summary && <figcaption className="sr-only">{summary}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary ?? yLabel} style={{ width: "100%", display: "block" }}>
        {y.ticks(4).map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} stroke="var(--slate-100)" />
            <text x={pad.l - 8} y={y(tick) + 3} textAnchor="end" className="t-mono" style={{ fontSize: 10, fill: "var(--slate-500)" }}>{tick.toFixed(1)}</text>
          </g>
        ))}
        {[0, 1, 2, 3, 6, 9, 12, 24, 36].map((month) => (
          <g key={month}>
            <line x1={x(month)} x2={x(month)} y1={H - pad.b} y2={H - pad.b + 4} stroke="var(--slate-400)" />
            <text x={x(month)} y={H - pad.b + 18} textAnchor="middle" className="t-mono" style={{ fontSize: 10, fill: "var(--slate-500)" }}>{month}</text>
          </g>
        ))}
        <text x={pad.l} y={H - 6} className="t-mono" style={{ fontSize: 10, fill: "var(--slate-500)" }}>CGA months</text>
        <text x={pad.l - 42} y={pad.t + 8} className="t-mono" style={{ fontSize: 10, fill: "var(--slate-500)" }}>{yLabel}</text>
        {series.map((item) => (
          <g key={item.label}>
            {showCi && <path d={area(item.points) ?? ""} fill={item.color} opacity={0.12} />}
            <path d={line(item.points) ?? ""} fill="none" stroke={item.color} strokeWidth={2.4} />
            {item.points.map((point) => <circle key={`${item.label}-${point.x}`} cx={x(point.x)} cy={y(point.y)} r={3} fill="var(--bg-surface)" stroke={item.color} strokeWidth={1.6} />)}
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--slate-500)" }}>
        {series.map((item) => (
          <span key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 3, background: item.color, display: "inline-block" }} />
            {item.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
