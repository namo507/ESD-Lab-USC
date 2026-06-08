/**
 * @route ExecutiveMode
 * @data-sensitivity: AGGREGATED - no participant-level data
 * @auth-required: false (executive demo mode)
 * @hipaa-note: Curated executive view uses aggregate KPIs, model summaries, and retention stages only. No PHI present.
 */
import { Link } from "react-router-dom";
import { Button, Card, SectionLabel } from "@/components/primitives";
import { useAttritionFunnel, useModelLeaderboard, useRsaTrajectories, useStudySummary } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import shared from "./FeatureRoutes.module.css";
import styles from "./ExecutiveMode.module.css";

async function exportExecutiveSummary(args: {
  enrolled: number;
  target: number;
  bestModel: string;
  bestAuroc: number;
  attritionLabel: string;
}) {
  const mod = await import("pptxgenjs");
  const PptxGenJS = mod.default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  const slideTitle = (title: string, subtitle: string) => {
    const slide = pptx.addSlide();
    slide.background = { color: "FAFAF9" };
    slide.addText(title, { x: 0.7, y: 0.65, w: 11.8, h: 0.6, fontFace: "Georgia", fontSize: 28, bold: true, color: "0E1013" });
    slide.addText(subtitle, { x: 0.7, y: 1.35, w: 11.6, h: 0.5, fontFace: "Arial", fontSize: 13, color: "6B7076" });
    slide.addShape("rect", { x: 0.7, y: 1.95, w: 2.2, h: 0.04, fill: { color: "73000A" }, line: { color: "73000A" } });
    return slide;
  };
  slideTitle("NANO Study Executive Summary", `${args.enrolled}/${args.target} enrolled · generated ${new Date().toLocaleDateString()}`)
    .addText("Early Social Development Lab · University of South Carolina", { x: 0.7, y: 2.5, w: 9, h: 0.4, fontFace: "Arial", fontSize: 16, color: "3A3D42" });
  slideTitle("Enrollment Trajectory", "Stub slide: replace with rendered enrollment trajectory image when export formatting is finalized.")
    .addText(`${args.enrolled} active enrollees toward target N=${args.target}.`, { x: 0.7, y: 2.5, w: 8, h: 0.5, fontFace: "Arial", fontSize: 18, color: "0E1013" });
  slideTitle("HRV Trajectory", "Stub slide: RMSSD/RSA trajectory chart goes here.")
    .addText("Three-group HRV trajectory context is available in Results and Public Insights.", { x: 0.7, y: 2.5, w: 8, h: 0.5, fontFace: "Arial", fontSize: 18, color: "0E1013" });
  slideTitle("Model Performance", "Best model and validation score.")
    .addText(`${args.bestModel}: AUROC ${args.bestAuroc.toFixed(3)}`, { x: 0.7, y: 2.5, w: 8, h: 0.5, fontFace: "Arial", fontSize: 18, color: "0E1013" });
  slideTitle("Retention Funnel", "Aggregate retention milestone summary.")
    .addText(args.attritionLabel, { x: 0.7, y: 2.5, w: 9, h: 0.7, fontFace: "Arial", fontSize: 18, color: "0E1013" });
  await pptx.writeFile({ fileName: "nano-executive-summary.pptx" });
}

export function ExecutiveMode() {
  const enabled = useFeatureFlag("EXECUTIVE_MODE");
  const study = useStudySummary();
  const models = useModelLeaderboard();
  const attrition = useAttritionFunnel();
  const rsa = useRsaTrajectories();
  const enrolled = study.data?.enrolled ?? 0;
  const target = study.data?.target ?? 260;
  const best = (models.data?.data ?? []).slice().sort((a, b) => b.auroc - a.auroc)[0];
  const lastStage = attrition.data?.stages?.at(-1);
  const attritionLabel = lastStage ? `${lastStage.label}: N=${lastStage.n}, ${lastStage.retainedPct.toFixed(1)}% retained.` : "Retention funnel not available.";
  const latestRsa = rsa.data?.data.find((row) => row.group === "TD" && row.adjustedAgeMonths === 36)?.mean;

  if (!enabled) return null;

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <div className={styles.banner}>
        <span><strong>Executive Summary View</strong> - Showing key study metrics only</span>
        <Link to="/overview">Exit</Link>
      </div>

      <header className={shared.hero}>
        <div>
          <span className={`${shared.eyebrow} t-mono`}>Executive mode</span>
          <h1 className={shared.h1}>NANO Study Snapshot</h1>
          <p className={shared.lede}>A curated view for PIs, NIH program officers, and funders.</p>
        </div>
        <Button
          icon="download"
          onClick={() => void exportExecutiveSummary({
            enrolled,
            target,
            bestModel: best?.name ?? "Model unavailable",
            bestAuroc: best?.auroc ?? 0,
            attritionLabel,
          })}
        >
          Export Executive Summary
        </Button>
      </header>

      <section className={styles.kpis} aria-label="Executive KPI row">
        {[
          ["Enrolled N", enrolled.toLocaleString()],
          ["Target N", target.toLocaleString()],
          ["Visit Completion", attrition.data?.stages?.[3]?.retainedPct ? `${attrition.data.stages[3].retainedPct.toFixed(1)}%` : "n/a"],
          ["AUROC Best Model", best ? best.auroc.toFixed(3) : "n/a"],
        ].map(([label, value]) => (
          <div key={label} className={styles.kpi}>
            <div className={styles.kpiLabel}>{label}</div>
            <div className={styles.kpiValue}>{value}</div>
          </div>
        ))}
      </section>

      <div className={styles.grid}>
        <Card pad={20}>
          <SectionLabel>Study progress</SectionLabel>
          <h2 className={shared.cardTitle}>{enrolled}/{target} enrolled</h2>
          <p className={shared.muted}>Recruitment is shown as aggregate study progress across VPT, ASIB, and TD cohorts.</p>
        </Card>
        <Card pad={20}>
          <SectionLabel>Physiology</SectionLabel>
          <h2 className={shared.cardTitle}>TD RSA at 36 months: {latestRsa?.toFixed(2) ?? "n/a"}</h2>
          <p className={shared.muted}>Open Results or Public Insights for full confidence intervals and group curves.</p>
        </Card>
        <Card pad={20}>
          <SectionLabel>Model leaderboard</SectionLabel>
          <table className={styles.table}>
            <thead><tr><th>Model</th><th>AUROC</th><th>F1</th></tr></thead>
            <tbody>
              {(models.data?.data ?? []).slice(0, 4).map((model) => (
                <tr key={model.modelId}><td>{model.name}</td><td className="t-mono">{model.auroc.toFixed(3)}</td><td className="t-mono">{model.f1.toFixed(3)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card pad={20}>
          <SectionLabel>Retention</SectionLabel>
          <h2 className={shared.cardTitle}>{attritionLabel}</h2>
          <p className={shared.muted}>Reason-code detail is available in the Attrition Funnel route.</p>
        </Card>
      </div>
    </div>
  );
}
