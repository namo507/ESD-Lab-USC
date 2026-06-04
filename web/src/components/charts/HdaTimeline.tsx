import * as d3 from "d3";
import type { HdaPhase, HdaSessionRow } from "@/api/schemas";
import styles from "./HdaTimeline.module.css";

interface Props {
  rows: HdaSessionRow[];
  compareRows?: HdaSessionRow[];
  cursor?: number;
  compact?: boolean;
}

const PHASE_COLOR: Record<HdaPhase, string> = {
  orienting: "var(--blue)",
  sustained: "var(--green)",
  inattention: "var(--purple)",
  termination: "var(--red)",
};

const PHASES: HdaPhase[] = ["orienting", "sustained", "inattention", "termination"];

export function HdaTimeline({ rows, compareRows = [], cursor = 0, compact = false }: Props) {
  const W = 760;
  const H = compact ? 150 : 250;
  const pad = { l: compact ? 48 : 74, r: 18, t: 16, b: 26 };
  const maxT = Math.max(...rows.map((row) => row.t1), ...compareRows.map((row) => row.t1), 1);
  const sx = d3.scaleLinear().domain([0, maxT]).range([pad.l, W - pad.r]);
  const rmssdVals = [...rows, ...compareRows].map((row) => row.rmssd);
  const syRmssd = d3.scaleLinear().domain(d3.extent(rmssdVals) as [number, number]).nice().range([compact ? 74 : 110, compact ? 42 : 62]);
  const sySqi = d3.scaleLinear().domain([0, 1]).range([H - pad.b, compact ? 100 : 166]);
  const phaseY = compact ? 20 : 24;
  const line = d3.line<HdaSessionRow>().x((d) => sx((d.t0 + d.t1) / 2)).y((d) => syRmssd(d.rmssd));
  const sqiLine = d3.line<HdaSessionRow>().x((d) => sx((d.t0 + d.t1) / 2)).y((d) => sySqi(d.sqi));
  const cursorX = sx(Math.max(0, Math.min(cursor, maxT)));
  const ticks = Array.from(new Set([0, Math.round(maxT / 2), maxT]));

  function renderPhaseTrack(data: HdaSessionRow[], y: number, opacity = 1) {
    return data.map((row) => (
      <rect
        key={`${row.nanoId}-${row.t0}-${y}`}
        x={sx(row.t0)}
        y={y}
        width={Math.max(1, sx(row.t1) - sx(row.t0))}
        height={compact ? 12 : 18}
        fill={PHASE_COLOR[row.phase]}
        opacity={opacity * (0.55 + row.confidence * 0.4)}
      />
    ));
  }

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        role="img"
        aria-label="HDA timeline with phase blocks, RMSSD trend, and SQI trend"
      >
        <text x={8} y={phaseY + 10} className={styles.trackLabel}>Phase</text>
        {renderPhaseTrack(rows, phaseY)}
        {compareRows.length > 0 && renderPhaseTrack(compareRows, phaseY + (compact ? 16 : 24), 0.42)}

        <text x={8} y={(compact ? 60 : 84)} className={styles.trackLabel}>RMSSD</text>
        <path d={line(rows) ?? ""} fill="none" stroke="var(--usc-garnet)" strokeWidth={compact ? 1.4 : 1.8} />
        {compareRows.length > 0 && (
          <path d={line(compareRows) ?? ""} fill="none" stroke="var(--blue)" strokeWidth={1.4} strokeDasharray="4 4" />
        )}

        <text x={8} y={(compact ? 122 : 192)} className={styles.trackLabel}>SQI</text>
        <path d={sqiLine(rows) ?? ""} fill="none" stroke="var(--green)" strokeWidth={compact ? 1.2 : 1.6} />
        {compareRows.length > 0 && (
          <path d={sqiLine(compareRows) ?? ""} fill="none" stroke="var(--purple)" strokeWidth={1.2} strokeDasharray="4 4" />
        )}

        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={sx(tick)} x2={sx(tick)} y1={H - pad.b} y2={H - pad.b + 4} stroke="var(--slate-300)" />
            <text x={sx(tick)} y={H - 7} textAnchor="middle" className={styles.tick}>
              {tick}s
            </text>
          </g>
        ))}
        <line x1={cursorX} x2={cursorX} y1={pad.t} y2={H - pad.b} stroke="var(--usc-gold)" strokeWidth={1.5} />
      </svg>
      {!compact && (
        <div className={styles.legend}>
          {PHASES.map((phase) => (
            <span key={phase} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: PHASE_COLOR[phase] }} />
              {phase}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
