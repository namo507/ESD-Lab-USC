import type { StudySummary } from "@/api/schemas";
import styles from "./EnrollmentBar.module.css";

const COLOR = {
  VPT: "var(--usc-garnet)",
  ASIB: "var(--purple)",
  TD: "var(--slate-500)",
} as const;

export function EnrollmentBar({ study }: { study: StudySummary }) {
  const totalCount = study.enrolled;
  const totalTarget = study.target;
  return (
    <div className={styles.wrap} aria-label={`${totalCount} of ${totalTarget} infants enrolled`}>
      <div className={styles.track}>
        {(["VPT", "ASIB", "TD"] as const).map((g) => {
          const w = (study.groups[g].count / totalTarget) * 100;
          return <div key={g} className={styles.seg} style={{ width: `${w}%`, background: COLOR[g] }} />;
        })}
      </div>
      <div className={styles.legend}>
        {(["VPT", "ASIB", "TD"] as const).map((g) => (
          <span key={g} className={styles.legendItem}>
            <span className={styles.dot} style={{ background: COLOR[g] }} />
            <span>{g}</span>
            <span className="t-mono">{study.groups[g].count}/{study.groups[g].target}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
