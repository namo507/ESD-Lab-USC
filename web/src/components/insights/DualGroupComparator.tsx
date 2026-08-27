interface Metric {
  label: string;
  left: number;
  right: number;
  format?: (value: number) => string;
}

interface DualGroupComparatorProps {
  leftLabel: string;
  rightLabel: string;
  metrics: Metric[];
  summary?: string;
}

export function DualGroupComparator({ leftLabel, rightLabel, metrics, summary }: DualGroupComparatorProps) {
  const max = Math.max(...metrics.flatMap((metric) => [metric.left, metric.right]), 1);
  const fmt = (metric: Metric, value: number) => metric.format?.(value) ?? value.toFixed(1);
  return (
    <figure style={{ margin: 0 }}>
      {summary && <figcaption className="sr-only">{summary}</figcaption>}
      <div style={{ display: "grid", gap: 12 }}>
        {metrics.map((metric) => {
          const delta = metric.right - metric.left;
          return (
            <div key={metric.label} style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 12, alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{metric.label}</div>
              <div style={{ display: "grid", gap: 5 }}>
                <div style={{ display: "grid", gridTemplateColumns: "72px 1fr auto", gap: 8, alignItems: "center" }}>
                  <span style={{ color: "var(--slate-500)", fontSize: 12 }}>{leftLabel}</span>
                  <span style={{ height: 10, borderRadius: 3, background: "var(--blue)", width: `${(metric.left / max) * 100}%` }} />
                  <span className="t-mono" style={{ fontSize: 11, color: "var(--slate-500)" }}>{fmt(metric, metric.left)}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "72px 1fr auto", gap: 8, alignItems: "center" }}>
                  <span style={{ color: "var(--slate-500)", fontSize: 12 }}>{rightLabel}</span>
                  <span style={{ height: 10, borderRadius: 3, background: "var(--usc-garnet)", width: `${(metric.right / max) * 100}%` }} />
                  <span className="t-mono" style={{ fontSize: 11, color: "var(--slate-500)" }}>{fmt(metric, metric.right)}</span>
                </div>
              </div>
              <span className="t-mono" style={{ color: delta >= 0 ? "var(--green)" : "var(--red)", fontSize: 11 }}>
                {delta >= 0 ? "+" : ""}{fmt(metric, delta)}
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
