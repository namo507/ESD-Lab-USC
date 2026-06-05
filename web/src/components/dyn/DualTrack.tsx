import styles from "./DynamicRoutes.module.css";

export interface TrackSegment {
  start: number;
  end: number;
  label: string;
  color: string;
  lane?: string;
}

interface DualTrackProps {
  durationSec: number;
  topLabel: string;
  bottomLabel: string;
  top: TrackSegment[];
  bottom: TrackSegment[];
  overlays?: TrackSegment[];
  cursor?: number;
}

export function DualTrack({ durationSec, topLabel, bottomLabel, top, bottom, overlays = [], cursor }: DualTrackProps) {
  const w = 760;
  const h = 190;
  const x0 = 104;
  const laneW = 620;
  const sx = (t: number) => x0 + (Math.max(0, Math.min(durationSec, t)) / Math.max(1, durationSec)) * laneW;

  const renderLane = (segments: TrackSegment[], y: number) =>
    segments.map((segment, index) => (
      <rect
        key={`${segment.label}-${segment.start}-${index}`}
        x={sx(segment.start)}
        y={y}
        width={Math.max(1, sx(segment.end) - sx(segment.start))}
        height={28}
        rx={3}
        fill={segment.color}
        opacity={0.82}
      >
        <title>{`${segment.label} · ${(segment.end - segment.start).toFixed(1)} s`}</title>
      </rect>
    ));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={styles.svg} role="img" aria-label={`${topLabel} and ${bottomLabel} synchronized dual track`}>
      <rect x={0} y={0} width={w} height={h} rx={8} fill="var(--bg-surface)" />
      {[48, 104].map((y) => (
        <rect key={y} x={x0} y={y} width={laneW} height={28} rx={3} fill="var(--bg-subtle)" stroke="var(--border)" />
      ))}
      <text x={22} y={67} className={styles.tinyLabel}>{topLabel}</text>
      <text x={22} y={123} className={styles.tinyLabel}>{bottomLabel}</text>
      {renderLane(top, 48)}
      {renderLane(bottom, 104)}
      {overlays.map((segment, index) => (
        <rect
          key={`overlay-${index}`}
          x={sx(segment.start)}
          y={42}
          width={Math.max(1, sx(segment.end) - sx(segment.start))}
          height={96}
          rx={4}
          fill={segment.color}
          opacity={0.18}
        >
          <title>{`${segment.label} · ${(segment.end - segment.start).toFixed(1)} s`}</title>
        </rect>
      ))}
      {cursor !== undefined && (
        <line x1={sx(cursor)} x2={sx(cursor)} y1={34} y2={146} stroke="var(--usc-garnet)" strokeWidth={2} />
      )}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <g key={pct}>
          <line x1={x0 + pct * laneW} x2={x0 + pct * laneW} y1={146} y2={152} stroke="var(--slate-300)" />
          <text x={x0 + pct * laneW} y={170} textAnchor="middle" className={styles.tinyLabel}>
            {Math.round(durationSec * pct)}s
          </text>
        </g>
      ))}
    </svg>
  );
}
