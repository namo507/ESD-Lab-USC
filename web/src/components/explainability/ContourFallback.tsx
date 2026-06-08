import * as d3 from "d3";
import type { ShapValueRow } from "@/api/schemas";

interface ContourFallbackProps {
  rows: ShapValueRow[];
  mode: "contour" | "heatmap";
  diverging: boolean;
  summary?: string;
}

export function ContourFallback({ rows, mode, diverging, summary }: ContourFallbackProps) {
  const W = 760;
  const H = 320;
  const pad = { l: 58, r: 24, t: 22, b: 42 };
  const windows = Array.from(new Set(rows.map((row) => row.timeWindow))).sort();
  if (!rows.length || !windows.length) {
    return <p style={{ margin: 0, color: "var(--slate-500)", fontSize: 13 }}>No data available for this filter combination</p>;
  }
  const values = rows.map((row) => row.value);
  const xDomain = d3.extent(values) as [number, number];
  const x = d3.scaleLinear().domain(xDomain[0] === xDomain[1] ? [xDomain[0] - 1, xDomain[1] + 1] : xDomain).nice().range([pad.l, W - pad.r]);
  const y = d3.scalePoint<string>().domain(windows).range([H - pad.b, pad.t]).padding(0.5);
  const color = diverging
    ? d3.scaleDiverging<string>().domain([-0.24, 0, 0.24]).interpolator(d3.interpolateRdBu)
    : d3.scaleSequential<string>().domain([0, 0.24]).interpolator(d3.interpolateYlOrRd);
  const grouped = windows.flatMap((window) => {
    const bucket = rows.filter((row) => row.timeWindow === window);
    const bins = d3.bin<ShapValueRow, number>().value((row) => row.value).thresholds(8)(bucket);
    return bins.map((bin) => ({
      window,
      x0: bin.x0 ?? 0,
      x1: bin.x1 ?? 0,
      influence: d3.mean(bin, (row) => diverging ? row.shap : Math.abs(row.shap)) ?? 0,
      n: bin.length,
    }));
  });

  return (
    <figure style={{ margin: 0 }}>
      {summary && <figcaption className="sr-only">{summary}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary ?? "SHAP model confidence terrain fallback"} style={{ width: "100%", height: "auto", display: "block" }}>
        {x.ticks(5).map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={pad.t} y2={H - pad.b} stroke="var(--slate-100)" />
            <text x={x(tick)} y={H - 16} textAnchor="middle" className="t-mono" style={{ fontSize: 10, fill: "var(--slate-500)" }}>{tick.toFixed(1)}</text>
          </g>
        ))}
        {windows.map((window) => (
          <g key={window}>
            <line x1={pad.l} x2={W - pad.r} y1={y(window)} y2={y(window)} stroke="var(--slate-100)" />
            <text x={pad.l - 10} y={(y(window) ?? 0) + 3} textAnchor="end" className="t-mono" style={{ fontSize: 10, fill: "var(--slate-500)" }}>{window}</text>
          </g>
        ))}
        {grouped.map((cell) => {
          const yCenter = y(cell.window) ?? 0;
          const fill = color(cell.influence);
          return (
            <rect
              key={`${cell.window}-${cell.x0}`}
              x={x(cell.x0)}
              y={yCenter - 14}
              width={Math.max(2, x(cell.x1) - x(cell.x0) - 2)}
              height={28}
              rx={mode === "contour" ? 10 : 2}
              fill={fill}
              opacity={mode === "contour" ? 0.42 + Math.min(0.4, cell.n / 20) : 0.75}
              stroke={mode === "contour" ? "var(--bg-surface)" : "transparent"}
            />
          );
        })}
        <text x={pad.l} y={H - 4} className="t-mono" style={{ fontSize: 10, fill: "var(--slate-500)" }}>Feature value</text>
      </svg>
    </figure>
  );
}
