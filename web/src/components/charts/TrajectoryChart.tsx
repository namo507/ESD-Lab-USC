import { Gloss, Tooltip } from "@/components/primitives";
import type { GroupCode, Trajectory } from "@/api/schemas";
import styles from "./TrajectoryChart.module.css";

interface Props {
  trajectory: Trajectory;
  metric: "rmssd" | "hf" | "sdnn";
}

const GROUP_COLOR: Record<GroupCode, string> = {
  VPT: "var(--usc-garnet)",
  ASIB: "var(--purple)",
  TD: "var(--slate-500)",
};

const W = 720;
const H = 280;
const padL = 50;
const padR = 20;
const padT = 20;
const padB = 36;
const innerW = W - padL - padR;
const innerH = H - padT - padB;

export function TrajectoryChart({ trajectory, metric }: Props) {
  const months = trajectory.months;
  const all = (Object.values(trajectory.series) as Array<Trajectory["series"]["VPT"]>).flat().map((p) => p.y);
  const yMin = Math.floor(Math.min(...all) - 4);
  const yMax = Math.ceil(Math.max(...all) + 4);
  const xMin = months[0] ?? 0;
  const xMax = months[months.length - 1] ?? 1;
  const sx = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * innerW;
  const sy = (y: number) => padT + (1 - (y - yMin) / (yMax - yMin)) * innerH;
  const unit = metric === "hf" ? "ms²" : "ms";

  return (
    <figure className={styles.figure}>
      <figcaption className="sr-only">{`${metric.toUpperCase()} group trajectories across CGA months.`}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label={`${metric.toUpperCase()} trajectory by group`}>
        {[yMin, (yMin + yMax) / 2, yMax].map((y) => (
          <g key={y}>
            <line x1={padL} y1={sy(y)} x2={W - padR} y2={sy(y)} stroke="var(--slate-100)" strokeWidth={1} />
            <text x={padL - 8} y={sy(y) + 3} textAnchor="end" className={styles.tick}>
              {y.toFixed(0)}
            </text>
          </g>
        ))}
        {months.map((m) => (
          <g key={m}>
            <line x1={sx(m)} y1={H - padB} x2={sx(m)} y2={H - padB + 4} stroke="var(--slate-400)" />
            <text x={sx(m)} y={H - padB + 18} textAnchor="middle" className={styles.tick}>
              {m} mo
            </text>
          </g>
        ))}
        <text x={padL} y={H - 6} className={styles.axis}>CGA (months)</text>
        <text x={padL - 38} y={padT + 8} className={styles.axis}>{unit}</text>

        {(Object.entries(trajectory.series) as Array<[GroupCode, Trajectory["series"]["VPT"]]>).map(([grp, pts]) => {
          const color = GROUP_COLOR[grp];
          const top = pts.map((p) => `${sx(p.x)},${sy(p.y + 2.5)}`).join(" ");
          const bot = pts.slice().reverse().map((p) => `${sx(p.x)},${sy(p.y - 2.5)}`).join(" ");
          const line = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x)} ${sy(p.y)}`).join(" ");
          const lastPt = pts[pts.length - 1]!;
          return (
            <g key={grp}>
              <polygon points={`${top} ${bot}`} fill={color} opacity={0.1} />
              <path d={line} fill="none" stroke={color} strokeWidth={2} />
              {pts.map((p) => (
                <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={3} fill="var(--white)" stroke={color} strokeWidth={1.5} />
              ))}
              <text x={sx(lastPt.x) + 6} y={sy(lastPt.y) + 3} className={styles.endLabel} fill={color}>
                {grp}
              </text>
            </g>
          );
        })}
      </svg>

      <div className={styles.legend}>
        {(Object.entries(trajectory.series) as Array<[GroupCode, Trajectory["series"]["VPT"]]>).map(([grp, pts]) => (
          <Tooltip
            key={grp}
            text={`${grp} · n=${pts[0]?.n ?? 0} at start, n=${pts[pts.length - 1]?.n ?? 0} at end. Group mean increases with maturation.`}
            maxWidth={300}
          >
            <span className={styles.legendItem}>
              <span className={styles.legendStripe} style={{ background: GROUP_COLOR[grp] }} />
              <Gloss term={grp}>{grp}</Gloss>
              <span className="t-mono">n={pts[0]?.n ?? 0}</span>
            </span>
          </Tooltip>
        ))}
        <span className={`${styles.legendNote} t-mono`}>LGCM · MICE-imputed · k=20</span>
      </div>
    </figure>
  );
}
