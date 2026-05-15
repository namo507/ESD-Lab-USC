import { Card } from "@/components/primitives";
import type { Stage } from "@/api/schemas";
import styles from "./PipelineDAG.module.css";

interface PipelineDAGProps {
  stages: Stage[];
  selected: string;
  onSelect: (id: string) => void;
}

const W = 1080;
const H = 320;

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

export function PipelineDAG({ stages, selected, onSelect }: PipelineDAGProps) {
  const padX = 60;
  const colW = stages.length > 1 ? (W - padX * 2) / (stages.length - 1) : 0;
  const cy = 160;
  const nodes = stages.map((s, i) => ({ ...s, x: padX + i * colW, y: cy }));

  return (
    <Card pad={0} className={styles.card}>
      <div className={styles.gridBg} />
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label="Pipeline DAG">
        {nodes.slice(0, -1).map((n, i) => {
          const next = nodes[i + 1]!;
          const flowing = n.inflight > 0 || next.inflight > 0;
          return (
            <g key={n.id}>
              <path d={curve(n.x + 32, n.y, next.x - 32, next.y)} fill="none" stroke="var(--border)" strokeWidth={6} />
              <path
                d={curve(n.x + 32, n.y, next.x - 32, next.y)}
                fill="none"
                stroke={flowing ? "var(--blue)" : "var(--border-strong)"}
                strokeWidth={2}
                strokeDasharray={flowing ? "4 4" : "0"}
                className={flowing ? "flow-line" : undefined}
              />
              <text
                x={(n.x + next.x) / 2}
                y={n.y - 14}
                textAnchor="middle"
                className={styles.tput}
                fill={flowing ? "var(--blue)" : "var(--slate-400)"}
              >
                {n.rate}/h
              </text>
            </g>
          );
        })}

        {nodes.map((n) => {
          const isSel = selected === n.id;
          return (
            <g
              key={n.id}
              onClick={() => onSelect(n.id)}
              className={styles.node}
              tabIndex={0}
              role="button"
              aria-label={`${n.label} stage, ${n.inflight} in flight`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(n.id);
              }}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={32}
                fill="var(--white)"
                stroke={isSel ? "var(--usc-garnet)" : n.inflight > 0 ? "var(--blue)" : "var(--border-strong)"}
                strokeWidth={isSel ? 2 : 1.5}
              />
              <text x={n.x} y={n.y - 2} textAnchor="middle" className={styles.bigNum}>
                {n.inflight}
              </text>
              <text x={n.x} y={n.y + 12} textAnchor="middle" className={styles.caption}>
                IN FLIGHT
              </text>
              {n.inflight > 0 && (
                <circle cx={n.x + 22} cy={n.y - 22} r={4} fill="var(--blue)">
                  <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
                </circle>
              )}
              <text x={n.x} y={n.y + 56} textAnchor="middle" className={styles.label}>
                {n.label}
              </text>
              <text x={n.x} y={n.y + 72} textAnchor="middle" className={styles.short}>
                {n.short}
              </text>
              <text x={n.x} y={n.y - 60} textAnchor="middle" className={styles.counts}>
                {n.done.toLocaleString()} done · {n.fail} fail
              </text>
            </g>
          );
        })}
      </svg>
    </Card>
  );
}
