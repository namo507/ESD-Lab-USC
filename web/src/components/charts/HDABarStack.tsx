import { Gloss, Tooltip } from "@/components/primitives";
import { GLOSS } from "@/lib/glossary";
import type { GroupCode, HdaDist, HdaPhase } from "@/api/schemas";
import styles from "./HDABarStack.module.css";

interface Props {
  dist: HdaDist;
}

const PHASES: HdaPhase[] = ["orienting", "sustained", "inattention", "termination"];
const PHASE_COLOR: Record<HdaPhase, string> = {
  orienting: "var(--blue)",
  sustained: "var(--green)",
  inattention: "var(--purple)",
  termination: "var(--red)",
};
const PHASE_TERM: Record<HdaPhase, keyof typeof GLOSS> = {
  orienting: "Orienting",
  sustained: "Sustained",
  inattention: "Inattention",
  termination: "Termination",
};
const GROUP_DOT: Record<GroupCode, string> = {
  VPT: "var(--usc-garnet)",
  ASIB: "var(--purple)",
  TD: "var(--slate-500)",
};

export function HDABarStack({ dist }: Props) {
  return (
    <div>
      {(Object.entries(dist) as Array<[GroupCode, HdaDist[GroupCode]]>).map(([grp, d]) => {
        if (!d) return null;
        const total = PHASES.reduce((s, p) => s + d[p], 0);
        return (
          <div key={grp} className={styles.row}>
            <div className={styles.head}>
              <span className={styles.title}>
                <span className={styles.dot} style={{ background: GROUP_DOT[grp] }} aria-hidden />
                <Gloss term={grp}>{grp}</Gloss>
              </span>
              <span className={`${styles.total} t-mono`}>{total} epochs</span>
            </div>
            <div className={styles.track} role="presentation">
              {PHASES.map((ph) => (
                <Tooltip
                  key={ph}
                  maxWidth={280}
                  text={`${ph}: ${d[ph]} epochs (${((d[ph] / Math.max(total, 1)) * 100).toFixed(1)}%). ${GLOSS[PHASE_TERM[ph]]}`}
                >
                  <div className={styles.seg} style={{ width: `${(d[ph] / Math.max(total, 1)) * 100}%`, background: PHASE_COLOR[ph] }} />
                </Tooltip>
              ))}
            </div>
          </div>
        );
      })}

      <div className={styles.legend}>
        {PHASES.map((ph) => (
          <Tooltip key={ph} gloss={PHASE_TERM[ph]} maxWidth={280}>
            <span className={styles.legendItem}>
              <span className={styles.swatch} style={{ background: PHASE_COLOR[ph] }} />
              <span className={styles.legendLabel}>{ph}</span>
            </span>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
