import { useState } from "react";
import { Button, Card, Gloss, SectionLabel, Segmented } from "@/components/primitives";
import { TrajectoryChart } from "@/components/charts/TrajectoryChart";
import { HDABarStack } from "@/components/charts/HDABarStack";
import { useHdaDist, useTrajectory } from "@/api/hooks";
import { logAudit } from "@/lib/audit";
import { AmbientOrbit, FastPaths, type FastPathPrompt } from "@/components/warm";
import { useUi } from "@/store/ui";
import type { GroupCode } from "@/api/schemas";
import styles from "./Results.module.css";

const RESULTS_FAST_PATHS: FastPathPrompt[] = [
  { lane: "model",  label: "Explain RMSSD shape",         prompt: "Why does the RMSSD trajectory dip between CGA 6 and 9 mo for the VPT group? Walk me through the mechanism and any confounders." },
  { lane: "model",  label: "ASIB vs TD effect size",      prompt: "What is the standardised effect size for ASIB vs TD across the latest HRV trajectory window? Include 95% CI." },
  { lane: "model",  label: "Cohort drift on metrics",     prompt: "Compare the current HF and SDNN cohort means to the prior nightly run. Flag any metric drift greater than 1 SD." },
  { lane: "qa",     label: "Yield → trajectory impact",   prompt: "How does a 10% drop in epoch yield propagate into the group-mean trajectory CI for RMSSD?" },
  { lane: "qa",     label: "Outlier visits to recheck",   prompt: "Surface the three visits whose RMSSD points are most leveraged in the current group mean. Recommend a QA re-review order." },
  { lane: "redcap", label: "Map exports back to REDCap",  prompt: "Generate the REDCap payload that pushes today's manuscript-table T1 group summary back into the analysis_outputs form." },
];

type Metric = "rmssd" | "hf" | "sdnn";
const METRIC_OPTS: Array<{ value: Metric; label: string }> = [
  { value: "rmssd", label: "RMSSD" },
  { value: "hf", label: "HF" },
  { value: "sdnn", label: "SDNN" },
];
const GROUP_DOT: Record<GroupCode, string> = {
  VPT: "var(--usc-garnet)",
  ASIB: "var(--purple)",
  TD: "var(--slate-500)",
};

export function Results() {
  const [metric, setMetric] = useState<Metric>("rmssd");
  const { data: traj } = useTrajectory(metric);
  const { data: hda } = useHdaDist();
  const setChatOpen = useUi((s) => s.setChatOpen);
  const setChatSeed = useUi((s) => s.setChatSeed);

  function fastPath(prompt: string) {
    setChatSeed(prompt);
    setChatOpen(true);
    void logAudit({ action: "run.trigger", scope: "/results/fast-path" });
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Results · preview</span>
          <h1 className={styles.h1}>
            HRV trajectories &amp; <Gloss term="HDA">HDA</Gloss> phase distribution
          </h1>
          <p className={styles.lede}>
            Generated from data/processed/deidentified/. Figures are matplotlib-rendered server-side; this dashboard view is a fast preview.
          </p>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" icon="image">Open figure</Button>
          <Button variant="secondary" icon="download" onClick={() => void logAudit({ action: "export.pdf", scope: "/results" })}>
            Export · PDF
          </Button>
          <Button icon="copy">Copy citation</Button>
        </div>
      </header>

      <section className={styles.fastRow} aria-label="Model performance fast-paths">
        <div className={styles.fastRowInner}>
          <FastPaths tone="light" density="wide" prompts={RESULTS_FAST_PATHS} onSelect={fastPath} />
        </div>
        <AmbientOrbit
          tone="ocean"
          size={170}
          opacity={0.24}
          spin={44}
          waveform
          className={styles.fastOrbit}
        />
      </section>

      <div className={styles.split}>
        <Card pad={20}>
          <div className={styles.cardHead}>
            <div>
              <SectionLabel>HRV trajectory · group means ± 95 % CI</SectionLabel>
              <div className={styles.cardTitle}>
                <Gloss term="RMSSD">{metric.toUpperCase()}</Gloss> across <Gloss term="CGA">CGA</Gloss>
              </div>
            </div>
            <Segmented<Metric> size="sm" options={METRIC_OPTS} value={metric} onChange={setMetric} />
          </div>
          {traj && <TrajectoryChart trajectory={traj} metric={metric} />}
        </Card>

        <Card pad={20}>
          <SectionLabel>HDA phase share · per group</SectionLabel>
          <div className={styles.cardTitle}>Attention episodes</div>
          {hda && <HDABarStack dist={hda} />}
        </Card>
      </div>

      {traj && (
        <Card pad={20}>
          <div className={styles.tableHead}>
            <SectionLabel>Manuscript table T1 · group × visit summary</SectionLabel>
            <span className={`${styles.tableMeta} t-mono`}>auto-rebuilt on merge · last 09:18</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Group mean ± SD for {metric.toUpperCase()} across CGA visits.</caption>
              <thead>
                <tr>
                  {["Group", "n", "CGA 3 mo", "CGA 6 mo", "CGA 9 mo", "CGA 12 mo", "CGA 18 mo", "CGA 24 mo"].map((h) => (
                    <th key={h} scope="col" className={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(Object.entries(traj.series) as Array<[GroupCode, typeof traj.series.VPT]>).map(([grp, pts]) => (
                  <tr key={grp}>
                    <td className={`${styles.td} ${styles.groupCell}`}>
                      <span className={styles.dot} style={{ background: GROUP_DOT[grp] }} />
                      <Gloss term={grp}>{grp}</Gloss>
                    </td>
                    <td className={`${styles.td} t-num t-mono`}>{pts[0]?.n ?? 0}</td>
                    {pts.map((p) => (
                      <td key={p.x} className={`${styles.td} t-num t-mono`}>
                        {p.y.toFixed(1)} <span className={styles.sd}>±2.5</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
