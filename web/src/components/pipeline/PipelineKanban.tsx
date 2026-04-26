import { Badge, Card } from "@/components/primitives";
import type { Stage, Participant, GroupCode } from "@/api/schemas";
import styles from "./PipelineKanban.module.css";

interface Props {
  stages: Stage[];
  selected: string;
  onSelect: (id: string) => void;
  participants: Participant[];
}

const KIND: Record<GroupCode, "vpt" | "asib" | "td"> = {
  VPT: "vpt",
  ASIB: "asib",
  TD: "td",
};

export function PipelineKanban({ stages, selected, onSelect, participants }: Props) {
  const cardsPerStage = stages.map((s, i) => {
    const start = i * 3;
    return participants.slice(start, start + Math.min(s.inflight, 5));
  });

  return (
    <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
      {stages.map((s, i) => {
        const isSel = selected === s.id;
        return (
          <Card
            key={s.id}
            pad={10}
            onClick={() => onSelect(s.id)}
            ariaLabel={`Kanban column for ${s.label}`}
            className={`${styles.col} ${isSel ? styles.colSel : ""} ${s.inflight > 0 ? styles.flowing : ""}`}
          >
            <div>
              <div className={styles.head}>
                <span className={styles.label}>{s.label}</span>
                <span className={`${styles.count} t-mono`}>
                  {s.inflight}
                  <span className={styles.queued}>{` · ${s.queued}`}</span>
                </span>
              </div>
              <div className={styles.short}>{s.short}</div>
            </div>
            <div className={styles.cards}>
              {cardsPerStage[i]!.map((p) => (
                <div key={p.id} className={styles.cardRow}>
                  <div className={styles.row}>
                    <span className={styles.id}>{p.id}</span>
                    <Badge kind={KIND[p.group]} size="sm">{p.group}</Badge>
                  </div>
                  <div className={styles.meta}>{p.visit} · {p.windows} w</div>
                </div>
              ))}
              {s.queued > 0 && (
                <div className={styles.queuedBox}>+ {s.queued} queued</div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
