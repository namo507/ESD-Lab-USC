import { Card } from "@/components/primitives";
import type { Stage } from "@/api/schemas";
import styles from "./PipelineSankey.module.css";

interface Props {
  stages: Stage[];
  selected: string;
  onSelect: (id: string) => void;
}

const W = 1080;
const H = 320;

export function PipelineSankey({ stages, selected, onSelect }: Props) {
  const padX = 30;
  const padY = 24;
  const stepW = (W - padX * 2) / stages.length;
  const max = stages[0]?.done ?? 1;
  const widths = stages.map((s) => Math.max(20, (s.done / max) * (H - padY * 2)));

  return (
    <Card pad={0}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label="Pipeline Sankey">
        {stages.slice(0, -1).map((s, i) => {
          const x1 = padX + i * stepW + stepW * 0.5;
          const x2 = padX + (i + 1) * stepW + stepW * 0.5;
          const y = H / 2;
          const w1 = widths[i]!;
          const w2 = widths[i + 1]!;
          const flowing = s.inflight > 0;
          const top1 = y - w1 / 2;
          const bot1 = y + w1 / 2;
          const top2 = y - w2 / 2;
          const bot2 = y + w2 / 2;
          const mx = (x1 + x2) / 2;
          const path = `M ${x1} ${top1} C ${mx} ${top1}, ${mx} ${top2}, ${x2} ${top2} L ${x2} ${bot2} C ${mx} ${bot2}, ${mx} ${bot1}, ${x1} ${bot1} Z`;
          return (
            <g key={s.id}>
              <path d={path} fill={flowing ? "var(--blue-tint)" : "var(--slate-100)"} stroke="none" />
              {s.fail > 0 && (
                <g>
                  <path
                    d={`M ${x1 + (x2 - x1) * 0.3} ${bot1 - 2} L ${x1 + (x2 - x1) * 0.6} ${H - 8}`}
                    stroke="var(--red)"
                    strokeWidth={Math.max(1.2, (s.fail / s.done) * 30)}
                    opacity={0.3}
                    fill="none"
                  />
                  <text x={x1 + (x2 - x1) * 0.6} y={H - 12} className={styles.failLabel}>
                    –{s.fail}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {stages.map((s, i) => {
          const x = padX + i * stepW + stepW * 0.5;
          const w = widths[i]!;
          const isSel = selected === s.id;
          return (
            <g
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={styles.node}
              tabIndex={0}
              role="button"
              aria-label={`${s.label}, ${s.done} done, ${s.inflight} in flight`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(s.id);
              }}
            >
              <rect
                x={x - 6}
                y={H / 2 - w / 2}
                width={12}
                height={w}
                fill={isSel ? "var(--usc-garnet)" : s.inflight > 0 ? "var(--blue)" : "var(--slate-500)"}
              />
              <text x={x} y={H / 2 - w / 2 - 28} textAnchor="middle" className={styles.label}>
                {s.label}
              </text>
              <text x={x} y={H / 2 - w / 2 - 14} textAnchor="middle" className={styles.bigNum}>
                {s.done.toLocaleString()}
              </text>
              <text x={x} y={H / 2 + w / 2 + 18} textAnchor="middle" className={styles.sub}>
                {s.inflight} in flight
              </text>
            </g>
          );
        })}
      </svg>
    </Card>
  );
}
