import { Badge, Button, Card, Gloss, SectionLabel } from "@/components/primitives";
import type { Epoch, EpochDecision } from "@/api/schemas";
import { ecgPath } from "@/lib/ecgPath";
import styles from "./EpochInspector.module.css";

interface Props {
  epoch: Epoch;
  total: number;
  onDecision: (idx: number, d: EpochDecision) => void;
  onPrev: () => void;
  onNext: () => void;
}

const FLAG_BADGE: Record<Epoch["flag"], { kind: "ok" | "warn" | "fail"; label: string }> = {
  clean:    { kind: "ok",   label: "clean" },
  ectopic:  { kind: "warn", label: "ectopic" },
  motion:   { kind: "warn", label: "motion" },
  noise:    { kind: "fail", label: "noise" },
  flatline: { kind: "fail", label: "flatline" },
};

function flagStrokeColor(flag: Epoch["flag"]): string {
  if (flag === "clean") return "var(--green)";
  if (flag === "ectopic" || flag === "motion") return "var(--usc-gold)";
  return "var(--red)";
}

function epochExplanation(flag: Epoch["flag"]): string {
  switch (flag) {
    case "clean":    return "Clear R-peaks, low noise floor. Safe to feed into HRV (RMSSD, HF) and HDA labeling. No action needed.";
    case "ectopic":  return "Premature beat detected. Excluded from RMSSD computation but the epoch is otherwise usable — HRV pipeline interpolates the IBI series before features.";
    case "motion":   return "Likely infant movement artifact. Baseline wander obscures isoelectric line. Often salvageable after high-pass filtering; review for false R-peaks.";
    case "noise":    return "Power-line or muscle EMG dominates. R-peak detection is unreliable. Reject — do not include in HRV features.";
    case "flatline": return "Lead disconnect or saturation. Reject and check Actiheart-5 contact log. May indicate sensor pop-off mid-visit.";
  }
}

export function EpochInspector({ epoch, total, onDecision, onPrev, onNext }: Props) {
  const flag = FLAG_BADGE[epoch.flag];
  const isAccept = epoch.decision === "accept";
  const isReject = epoch.decision === "reject";
  return (
    <Card pad={20}>
      <div className={styles.head}>
        <SectionLabel>Epoch {epoch.idx + 1}</SectionLabel>
        <span className={`${styles.range} t-mono`}>{epoch.t0}–{epoch.t1} s</span>
      </div>

      <div className={styles.scope}>
        <svg viewBox="0 0 320 120" className={styles.svg} aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 50} y1={0} x2={i * 50} y2={120} stroke="var(--ecg-grid)" strokeWidth={1} />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 30} x2={320} y2={i * 30} stroke="var(--ecg-grid)" strokeWidth={1} />
          ))}
          <path
            d={ecgPath(320, 120, epoch.idx + 1, epoch.flag)}
            fill="none"
            stroke={flagStrokeColor(epoch.flag)}
            strokeWidth={1.4}
          />
        </svg>
        <div className={styles.scopeFoot}>
          <span>{epoch.t0} s</span>
          <span>{epoch.t1} s</span>
        </div>
      </div>

      <div className={styles.metaGrid}>
        <div className={styles.metaCell}>
          <div className={styles.metaLabel}><Gloss term="SQI">SQI</Gloss></div>
          <div className={`${styles.metaValue} t-mono`}>{epoch.sqi.toFixed(2)}</div>
        </div>
        <div className={styles.metaCell}>
          <div className={styles.metaLabel}><Gloss term="IBI">R-peaks</Gloss></div>
          <div className={`${styles.metaValue} t-mono`}>{epoch.ibi_n}</div>
        </div>
        <div className={styles.metaCell}>
          <div className={styles.metaLabel}>Flag</div>
          <div className={styles.metaValue}>
            <Badge kind={flag.kind} size="sm">{flag.label}</Badge>
          </div>
        </div>
        <div className={styles.metaCell}>
          <div className={styles.metaLabel}>Decision</div>
          <div className={`${styles.decision} t-mono`} data-decision={epoch.decision}>
            {epoch.decision === "auto" ? "pending review" : `${epoch.decision}ed`}
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          variant={isAccept ? "gold" : "secondary"}
          icon="check"
          onClick={() => onDecision(epoch.idx, "accept")}
          style={{ flex: 1, justifyContent: "center" }}
        >
          Accept
        </Button>
        <Button
          variant={isReject ? "primary" : "secondary"}
          icon="x"
          onClick={() => onDecision(epoch.idx, "reject")}
          style={{ flex: 1, justifyContent: "center" }}
        >
          Reject
        </Button>
      </div>
      <div className={styles.nav}>
        <Button variant="ghost" size="sm" icon="chevron-left" onClick={onPrev}>Prev</Button>
        <Button variant="ghost" size="sm" iconRight="chevron-right" onClick={onNext}>Next</Button>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" icon="message-square">Note</Button>
      </div>

      <div className={styles.why}>
        <SectionLabel style={{ marginBottom: 8 }}>Why this matters</SectionLabel>
        <p className={styles.reason}>{epochExplanation(epoch.flag)}</p>
        <p className={styles.context}>Epoch {epoch.idx + 1} of {total}.</p>
      </div>
    </Card>
  );
}
