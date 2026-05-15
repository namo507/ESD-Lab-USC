import { Badge, Button, Card, SectionLabel, Sparkline, Tooltip } from "@/components/primitives";
import type { Stage } from "@/api/schemas";
import styles from "./StageDrawer.module.css";

interface Props {
  stage?: Stage;
}

function tputHistory(rate: number, len = 24): number[] {
  const arr: number[] = [];
  for (let i = 0; i < len; i++) {
    const noise = ((i * 9301) % 233) / 233 - 0.5;
    arr.push(Math.max(0, rate * (0.7 + 0.4 * Math.sin(i / 3) + noise * 0.3)));
  }
  return arr;
}

export function StageDrawer({ stage }: Props) {
  if (!stage) return null;
  const tput = tputHistory(stage.rate);
  const total = stage.done + stage.inflight + stage.queued + stage.fail;
  const segs = [
    { name: "done",      n: stage.done,     color: "var(--green)" },
    { name: "in flight", n: stage.inflight, color: "var(--blue)" },
    { name: "queued",    n: stage.queued,   color: "var(--slate-400)" },
    { name: "failed",    n: stage.fail,     color: "var(--red)" },
  ];

  return (
    <Card pad={20} className={styles.wrap}>
      <div>
        <div className={styles.row}>
          <SectionLabel>{`Stage · ${stage.id}`}</SectionLabel>
          <Badge kind={stage.inflight > 0 ? "info" : "neutral"}>
            {stage.inflight > 0 ? "running" : "idle"}
          </Badge>
        </div>
        <div className={styles.title}>{stage.label}</div>
        <div className={styles.desc}>{stage.description}</div>
      </div>

      <div>
        <div className={styles.row}>
          <SectionLabel>Throughput · last 24 h</SectionLabel>
          <span className={`${styles.metaMono} t-mono`}>
            <span className={styles.strong}>{stage.rate}</span> windows/h
          </span>
        </div>
        <Sparkline values={tput} w={300} h={36} color="var(--blue)" fill dotLast />
      </div>

      <div>
        <SectionLabel style={{ marginBottom: 6 }}>Window distribution</SectionLabel>
        <div className={styles.barTrack}>
          {segs.map((s) => (
            <Tooltip key={s.name} text={`${s.name} · ${s.n.toLocaleString()} (${((s.n / Math.max(total, 1)) * 100).toFixed(1)}%)`}>
              <div
                className={styles.barSeg}
                style={{ width: `${(s.n / Math.max(total, 1)) * 300}px`, background: s.color }}
              />
            </Tooltip>
          ))}
        </div>
        <div className={styles.legend}>
          {segs.map((s) => (
            <div key={s.name} className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: s.color }} />
              <span>{s.name}</span>
              <span className="t-mono">{s.n.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.metaGrid}>
        <div className={styles.metaCell}>
          <div className={styles.metaLabel}>ETA</div>
          <div className={`${styles.metaValue} t-mono`}>{stage.eta}</div>
        </div>
        <div className={styles.metaCell}>
          <div className={styles.metaLabel}>Pass rate</div>
          <div className={`${styles.metaValue} t-mono`}>
            {((stage.done / Math.max(stage.done + stage.fail, 1)) * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Button variant="secondary" size="sm" icon="external-link">View logs</Button>
        <Button variant="secondary" size="sm" icon="rotate-cw">Rerun stage</Button>
      </div>
    </Card>
  );
}
