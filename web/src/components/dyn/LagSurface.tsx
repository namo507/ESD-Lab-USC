import styles from "./DynamicRoutes.module.css";

interface LagSurfaceProps {
  corr: number[][];
  fs: number;
  maxLagSamples: number;
  windowStepSec: number;
}

function color(value: number): string {
  const v = Math.max(-1, Math.min(1, value));
  if (v >= 0) {
    const mix = Math.round(238 - v * 120);
    return `rgb(${mix}, ${Math.round(236 - v * 190)}, ${Math.round(232 - v * 205)})`;
  }
  const mag = Math.abs(v);
  return `rgb(${Math.round(228 - mag * 120)}, ${Math.round(235 - mag * 110)}, ${Math.round(244 - mag * 55)})`;
}

export function LagSurface({ corr, fs, maxLagSamples, windowStepSec }: LagSurfaceProps) {
  const rows = corr.length;
  const cols = corr[0]?.length ?? 0;
  const w = 760;
  const h = 280;
  const pad = { left: 64, top: 18, right: 18, bottom: 42 };
  const cw = cols ? (w - pad.left - pad.right) / cols : 0;
  const ch = rows ? (h - pad.top - pad.bottom) / rows : 0;
  const zeroLag = maxLagSamples;

  if (!rows || !cols) {
    return <div className={styles.empty}>Lag surface unavailable for this signal window.</div>;
  }

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={styles.svg}
      role="img"
      aria-label="Windowed cross-correlation heatmap with time on the horizontal axis and lag in seconds on the vertical axis"
    >
      <rect x={0} y={0} width={w} height={h} rx={8} fill="var(--bg-surface)" />
      {corr.map((row, r) =>
        row.map((value, c) => (
          <rect
            key={`${r}-${c}`}
            x={pad.left + r * ch}
            y={pad.top + c * cw}
            width={Math.max(1, ch + 0.5)}
            height={Math.max(1, cw + 0.5)}
            fill={color(value)}
          >
            <title>
              {`Window ${r + 1}, lag ${((c - maxLagSamples) / fs).toFixed(1)} s, r=${value.toFixed(2)}`}
            </title>
          </rect>
        )),
      )}
      <line
        x1={pad.left}
        x2={pad.left + rows * ch}
        y1={pad.top + zeroLag * cw + cw / 2}
        y2={pad.top + zeroLag * cw + cw / 2}
        stroke="var(--ink)"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
      <text x={pad.left} y={h - 14} className={styles.tinyLabel}>time windows · {windowStepSec.toFixed(0)} s step</text>
      <text x={8} y={pad.top + zeroLag * cw + 4} className={styles.tinyLabel}>0 lag</text>
      <text x={8} y={pad.top + 12} className={styles.tinyLabel}>infant leads</text>
      <text x={8} y={pad.top + cols * cw - 4} className={styles.tinyLabel}>caregiver leads</text>
    </svg>
  );
}
