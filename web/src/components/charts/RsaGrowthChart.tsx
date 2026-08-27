import * as d3 from "d3";
import type { GroupCode, RsaTrajectoryRow } from "@/api/schemas";
import styles from "./RsaGrowthChart.module.css";

interface Props {
  rows: RsaTrajectoryRow[];
  ageBasis: "adjusted" | "chronological";
}

const GROUP_COLOR: Record<GroupCode, string> = {
  VPT: "var(--usc-garnet)",
  ASIB: "var(--purple)",
  TD: "var(--blue)",
};

const W = 760;
const H = 300;
const pad = { l: 54, r: 28, t: 18, b: 42 };

export function RsaGrowthChart({ rows, ageBasis }: Props) {
  const allX = rows.map((row) => row.ageMonths);
  const allY = rows.flatMap((row) => [row.ciLow, row.ciHigh]);
  const xDomain = d3.extent(allX) as [number, number];
  const yDomain = d3.extent(allY) as [number, number];
  const sx = d3.scaleLinear().domain(xDomain).nice().range([pad.l, W - pad.r]);
  const sy = d3.scaleLinear().domain(yDomain).nice().range([H - pad.b, pad.t]);
  const groups = d3.group(rows, (row) => row.group);
  const yTicks = sy.ticks(4);
  const xTicks = sx.ticks(6);
  const line = d3.line<RsaTrajectoryRow>().x((d) => sx(d.ageMonths)).y((d) => sy(d.mean));
  const area = d3
    .area<RsaTrajectoryRow>()
    .x((d) => sx(d.ageMonths))
    .y0((d) => sy(d.ciLow))
    .y1((d) => sy(d.ciHigh));

  return (
    <figure className={styles.figure}>
      <figcaption className="sr-only">
        RSA growth curves by group using {ageBasis} age with confidence bands.
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        role="img"
        aria-label={`RSA growth curves by group using ${ageBasis} age`}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(tick)} y2={sy(tick)} stroke="var(--slate-100)" />
            <text x={pad.l - 8} y={sy(tick) + 3} textAnchor="end" className={styles.tick}>
              {tick.toFixed(2)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <g key={tick}>
            <line x1={sx(tick)} x2={sx(tick)} y1={H - pad.b} y2={H - pad.b + 4} stroke="var(--slate-300)" />
            <text x={sx(tick)} y={H - pad.b + 18} textAnchor="middle" className={styles.tick}>
              {tick.toFixed(0)}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 8} className={styles.axis}>
          {ageBasis === "adjusted" ? "Adjusted age" : "Chronological age"} (months)
        </text>
        <text x={pad.l - 42} y={pad.t + 8} className={styles.axis}>RSA</text>

        {Array.from(groups.entries()).map(([group, groupRows]) => {
          const color = GROUP_COLOR[group];
          const sorted = groupRows.slice().sort((a, b) => a.ageMonths - b.ageMonths);
          const last = sorted[sorted.length - 1];
          return (
            <g key={group}>
              <path d={area(sorted) ?? ""} fill={color} opacity={0.12} />
              <path d={line(sorted) ?? ""} fill="none" stroke={color} strokeWidth={2.1} />
              {sorted.map((row) => (
                <circle
                  key={`${group}-${row.ageMonths}`}
                  cx={sx(row.ageMonths)}
                  cy={sy(row.mean)}
                  r={3}
                  fill="var(--bg-surface)"
                  stroke={color}
                  strokeWidth={1.5}
                />
              ))}
              {last && (
                <text x={sx(last.ageMonths) + 6} y={sy(last.mean) + 3} fill={color} className={styles.endLabel}>
                  {group}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className={styles.legend}>
        {Array.from(groups.entries()).map(([group, groupRows]) => (
          <span key={group} className={styles.legendItem}>
            <span className={styles.legendStripe} style={{ background: GROUP_COLOR[group] }} />
            {group}
            <span className="t-mono">n={groupRows[0]?.n ?? 0}</span>
          </span>
        ))}
        <span className="t-mono">LGCM · 95% CI band · PT normalized to VPT</span>
      </div>
    </figure>
  );
}
