/**
 * @route GuidedExplorer
 * @data-sensitivity: AGGREGATED - no PII
 * @auth-required: false (internal demo mode only)
 * @hipaa-note: Hypothesis cards use aggregate route presets and no participant-level details.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, SectionLabel } from "@/components/primitives";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import shared from "./FeatureRoutes.module.css";
import styles from "./GuidedExplorer.module.css";

interface Hypothesis {
  id: string;
  question: string;
  badge: string;
  groups: string[];
  target: string;
  narration: string;
  values: Array<{ label: string; value: number; color: string }>;
}

const HYPOTHESES: Hypothesis[] = [
  {
    id: "H1",
    question: "Does RSA grow faster in TD than VPT infants?",
    badge: "RSA · Trajectory",
    groups: ["TD", "VPT"],
    target: "/results?metric=rsa&groups=VPT,TD&overlay=ci",
    narration: "TD shows the steeper illustrative RSA slope, while VPT keeps a lower but improving trajectory. Use Results for the full CI-aware view.",
    values: [{ label: "VPT", value: 62, color: "var(--usc-garnet)" }, { label: "TD", value: 82, color: "var(--green)" }],
  },
  {
    id: "H2",
    question: "Are ASIB infants' sustained-attention windows shorter at 6 months?",
    badge: "HDA · River",
    groups: ["ASIB", "6 mo"],
    target: "/cga-river?group=ASIB&month=6&phase=sustained",
    narration: "The demo preset focuses on sustained attention at 6 months for ASIB infants, then opens the CGA river for the full phase context.",
    values: [{ label: "ASIB", value: 48, color: "var(--purple)" }, { label: "TD", value: 60, color: "var(--green)" }],
  },
  {
    id: "H3",
    question: "Does county SDoH score predict visit completion?",
    badge: "SDoH · County",
    groups: ["high SDoH", "low SDoH"],
    target: "/county-comparator?left=florence&right=charleston",
    narration: "The comparison pairs higher and lower SDoH burden counties so completion differences are visible without exposing precise locations.",
    values: [{ label: "High burden", value: 69, color: "var(--usc-garnet)" }, { label: "Low burden", value: 82, color: "var(--blue)" }],
  },
  {
    id: "H4",
    question: "Which physiological features drive the model most at 3 months?",
    badge: "SHAP · Model",
    groups: ["ECG", "HDA"],
    target: "/shap-explorer?timeWindow=m3",
    narration: "This preset points to physiological features and the model-attribution surfaces, where SHAP magnitude shows where the model is most sensitive.",
    values: [{ label: "ECG", value: 76, color: "var(--blue)" }, { label: "HDA", value: 58, color: "var(--green)" }],
  },
  {
    id: "H5",
    question: "How does attrition differ between cohort groups?",
    badge: "Retention · Funnel",
    groups: ["VPT", "ASIB", "TD"],
    target: "/attrition-funnel?subgroup=group",
    narration: "The funnel preset frames retention as a cohort-comparison question, then surfaces reason-code context for grant reporting.",
    values: [{ label: "VPT", value: 65, color: "var(--usc-garnet)" }, { label: "ASIB", value: 61, color: "var(--purple)" }, { label: "TD", value: 72, color: "var(--green)" }],
  },
];

function InlinePreview({ hypothesis }: { hypothesis: Hypothesis }) {
  const W = 620;
  const H = 260;
  const max = Math.max(...hypothesis.values.map((item) => item.value), 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label={`${hypothesis.id} inline preview`}>
      {hypothesis.values.map((item, index) => {
        const y = 42 + index * 56;
        return (
          <g key={item.label}>
            <text x={22} y={y + 15} style={{ fontSize: 13, fill: "var(--ink)", fontWeight: 700 }}>{item.label}</text>
            <rect x={140} y={y} width={(item.value / max) * 420} height={22} rx={4} fill={item.color} opacity={0.78} />
            <text x={570} y={y + 16} textAnchor="end" className="t-mono" style={{ fontSize: 11, fill: "var(--slate-500)" }}>{item.value.toFixed(0)}</text>
          </g>
        );
      })}
      <text x={140} y={H - 18} className="t-mono" style={{ fontSize: 10, fill: "var(--slate-500)" }}>Illustrative aggregate preview · open target route for source chart</text>
    </svg>
  );
}

export function GuidedExplorer() {
  const enabled = useFeatureFlag("GUIDED_EXPLORER");
  const [activeId, setActiveId] = useState<string>("");
  const active = HYPOTHESES.find((item) => item.id === activeId);

  if (!enabled) return null;

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <header className={shared.hero}>
        <div>
          <span className={`${shared.eyebrow} t-mono`}>Guided demo</span>
          <h1 className={shared.h1}>Guided Explorer</h1>
          <p className={shared.lede}>Start from a named research question, then let the dashboard pre-configure the relevant chart path.</p>
        </div>
        {active && <button type="button" className={styles.startOver} onClick={() => setActiveId("")}>Start over</button>}
      </header>

      {!active ? (
        <div className={styles.grid}>
          {HYPOTHESES.map((hypothesis) => (
            <button
              type="button"
              key={hypothesis.id}
              className={styles.hypothesis}
              onClick={() => setActiveId(hypothesis.id)}
              data-insight={`guided-${hypothesis.id.toLowerCase()}`}
            >
              <span className={`${shared.eyebrow} t-mono`}>{hypothesis.id}</span>
              <p className={styles.question}>{hypothesis.question}</p>
              <div className={styles.badges}>
                <span className={styles.chip}>{hypothesis.badge}</span>
                {hypothesis.groups.map((group) => <span key={group} className={styles.chip}>{group}</span>)}
              </div>
              <span className={styles.explore}>Explore &gt;</span>
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.inline}>
          <Card pad={20}>
            <SectionLabel>{active.badge}</SectionLabel>
            <h2 className={shared.cardTitle}>{active.question}</h2>
            <InlinePreview hypothesis={active} />
          </Card>
          <aside className={styles.narration} data-insight="guided-narration">
            <SectionLabel>Buddy narration</SectionLabel>
            <p>{active.narration}</p>
            <Link to={active.target} style={{ color: "var(--usc-garnet)", fontWeight: 700 }}>Open configured route</Link>
          </aside>
        </div>
      )}
    </div>
  );
}
