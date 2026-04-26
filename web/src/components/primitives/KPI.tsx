import type { CSSProperties, ReactNode } from "react";
import { Card } from "./Card";
import { SectionLabel } from "./SectionLabel";
import { Sparkline } from "./Sparkline";
import { Gloss } from "./Gloss";
import styles from "./KPI.module.css";

type DeltaKind = "up" | "down" | "flat";

interface KPIProps {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  delta?: string;
  deltaKind?: DeltaKind;
  spark?: number[];
  gloss?: string;
  style?: CSSProperties;
}

export function KPI({
  label,
  value,
  unit,
  sub,
  delta,
  deltaKind = "flat",
  spark,
  gloss,
  style,
}: KPIProps) {
  return (
    <Card pad={18} style={style} className={styles.card}>
      <div className={styles.head}>
        <SectionLabel>{gloss ? <Gloss term={gloss}>{label}</Gloss> : label}</SectionLabel>
        {spark && <Sparkline values={spark} w={64} h={18} color="var(--slate-400)" dotLast />}
      </div>
      <div className={styles.row}>
        <div className={`${styles.value} t-num`}>{value}</div>
        {unit && <div className={`${styles.unit} t-mono`}>{unit}</div>}
        {delta && <div className={`${styles.delta} ${styles[`d-${deltaKind}`]} t-mono`}>{delta}</div>}
      </div>
      {sub && <div className={styles.sub}>{sub}</div>}
    </Card>
  );
}
