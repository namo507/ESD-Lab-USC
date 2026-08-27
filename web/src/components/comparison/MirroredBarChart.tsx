interface MirroredMetric {
  label: string;
  left: number;
  right: number;
  format?: (value: number) => string;
}

interface MirroredBarChartProps {
  metrics: MirroredMetric[];
  leftLabel: string;
  rightLabel: string;
  summary?: string;
}

export function MirroredBarChart({ metrics, leftLabel, rightLabel, summary }: MirroredBarChartProps) {
  const W = 760;
  const rowH = 58;
  const H = 58 + metrics.length * rowH;
  const center = W / 2;
  const max = Math.max(...metrics.flatMap((metric) => [metric.left, metric.right]), 1);
  const fmt = (metric: MirroredMetric, value: number) => metric.format?.(value) ?? value.toFixed(1);

  return (
    <figure style={{ margin: 0 }}>
      {summary && <figcaption className="sr-only">{summary}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary ?? "Mirrored county comparison chart"} style={{ width: "100%", height: "auto", display: "block" }}>
        <text x={center - 18} y={18} textAnchor="end" className="t-mono" style={{ fontSize: 11, fill: "var(--slate-500)" }}>{leftLabel}</text>
        <text x={center + 18} y={18} textAnchor="start" className="t-mono" style={{ fontSize: 11, fill: "var(--slate-500)" }}>{rightLabel}</text>
        <line x1={center} x2={center} y1={26} y2={H - 14} stroke="var(--border-strong)" />
        {metrics.map((metric, index) => {
          const y = 46 + index * rowH;
          const leftW = (metric.left / max) * (center - 112);
          const rightW = (metric.right / max) * (center - 112);
          const delta = metric.right - metric.left;
          return (
            <g key={metric.label}>
              <text x={center} y={y - 12} textAnchor="middle" style={{ fontSize: 12, fill: "var(--ink)", fontWeight: 700 }}>{metric.label}</text>
              <rect x={center - leftW} y={y} width={leftW} height={16} rx={3} fill="var(--blue)" opacity={0.74} />
              <rect x={center} y={y} width={rightW} height={16} rx={3} fill="var(--usc-garnet)" opacity={0.76} />
              <text x={center - leftW - 8} y={y + 12} textAnchor="end" className="t-mono" style={{ fontSize: 10, fill: "var(--slate-500)" }}>{fmt(metric, metric.left)}</text>
              <text x={center + rightW + 8} y={y + 12} textAnchor="start" className="t-mono" style={{ fontSize: 10, fill: "var(--slate-500)" }}>{fmt(metric, metric.right)}</text>
              <text x={center} y={y + 35} textAnchor="middle" className="t-mono" style={{ fontSize: 10, fill: delta >= 0 ? "var(--green)" : "var(--red)" }}>
                {delta >= 0 ? "+" : ""}{fmt(metric, delta)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
