/**
 * @route ExecutiveMode
 * @data-sensitivity: AGGREGATED - no participant-level data
 * @auth-required: false (executive demo mode)
 * @hipaa-note: Curated executive view uses aggregate KPIs, model summaries, and retention stages only. No PHI present.
 */
import { Link } from "react-router-dom";
import { Button, Card, SectionLabel } from "@/components/primitives";
import { useAttritionFunnel, useModelLeaderboard, useRedcapData, useRsaTrajectories, useStudySummary } from "@/api/hooks";
import type { AttritionFunnelStage, ModelLeaderboardRow, RsaTrajectoryRow } from "@/api/schemas";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import shared from "./FeatureRoutes.module.css";
import styles from "./ExecutiveMode.module.css";

async function exportExecutiveSummary(args: {
  enrolled: number;
  target: number;
  bestModel: string;
  bestAuroc: number;
  attritionLabel: string;
  rsaData: RsaTrajectoryRow[];
  modelData: ModelLeaderboardRow[];
  attritionStages: AttritionFunnelStage[];
}) {
  const mod = await import("pptxgenjs");
  const PptxGenJS = mod.default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  type Slide = ReturnType<typeof pptx.addSlide>;
  const brand = {
    garnet: "73000A",
    ink: "0E1013",
    muted: "6B7076",
    bg: "FAFAF9",
    row: "F2F0EC",
    border: "D6D1C8",
  };
  const addChrome = (slide: Slide) => {
    slide.background = { color: brand.bg };
    slide.addShape("rect", { x: 0.7, y: 1.95, w: 2.2, h: 0.04, fill: { color: brand.garnet }, line: { color: brand.garnet } });
    slide.addText("Confidential - ESD Lab, USC", { x: 0.7, y: 7.05, w: 4.4, h: 0.22, fontFace: "Arial", fontSize: 9, color: brand.muted });
    slide.addText("ESD", { x: 12.0, y: 0.42, w: 0.58, h: 0.28, fontFace: "Georgia", fontSize: 10, bold: true, color: brand.garnet });
  };
  const slideTitle = (title: string, subtitle: string): Slide => {
    const slide = pptx.addSlide();
    addChrome(slide);
    slide.addText(title, { x: 0.7, y: 0.65, w: 11.8, h: 0.6, fontFace: "Georgia", fontSize: 28, bold: true, color: brand.ink });
    slide.addText(subtitle, { x: 0.7, y: 1.35, w: 11.6, h: 0.5, fontFace: "Arial", fontSize: 13, color: brand.muted });
    return slide;
  };
  const drawTable = (slide: Slide, rows: string[][], x: number, y: number, widths: number[]) => {
    const rowH = 0.36;
    rows.forEach((row, rowIndex) => {
      let cursor = x;
      row.forEach((cell, colIndex) => {
        const width = widths[colIndex] ?? 1.2;
        slide.addShape("rect", {
          x: cursor,
          y: y + rowIndex * rowH,
          w: width,
          h: rowH,
          fill: { color: rowIndex === 0 ? brand.garnet : rowIndex % 2 ? brand.row : brand.bg },
          line: { color: brand.border },
        });
        slide.addText(cell, {
          x: cursor + 0.06,
          y: y + rowIndex * rowH + 0.06,
          w: width - 0.12,
          h: rowH - 0.08,
          fontFace: "Georgia",
          fontSize: 10.5,
          bold: rowIndex === 0,
          color: rowIndex === 0 ? "FFFFFF" : brand.ink,
          fit: "shrink",
        });
        cursor += width;
      });
    });
  };
  slideTitle("NANO Study Executive Summary", `${args.enrolled}/${args.target} enrolled · generated ${new Date().toLocaleDateString()}`)
    .addText("Early Social Development Lab · University of South Carolina", { x: 0.7, y: 2.5, w: 9, h: 0.4, fontFace: "Arial", fontSize: 16, color: "3A3D42" });

  const enrollmentSlide = slideTitle("Enrollment Trajectory", "Aggregate retention stages from the attrition funnel hook.");
  drawTable(
    enrollmentSlide,
    [["Stage", "N", "Retained"], ...args.attritionStages.map((stage) => [stage.label, stage.n.toLocaleString(), `${stage.retainedPct.toFixed(1)}%`])],
    0.7,
    2.35,
    [3.4, 1.2, 1.5],
  );

  const groups = ["ASIB", "VPT", "TD"] as const;
  const ages = [9, 24, 36];
  const hrvSlide = slideTitle("HRV Trajectory Summary", "Mean RSA by cohort and corrected-age month.");
  drawTable(
    hrvSlide,
    [["Group", "9 mo", "24 mo", "36 mo"], ...groups.map((group) => [
      group,
      ...ages.map((age) => args.rsaData.find((row) => row.group === group && row.adjustedAgeMonths === age)?.mean.toFixed(3) ?? "n/a"),
    ])],
    0.7,
    2.35,
    [1.4, 1.2, 1.2, 1.2],
  );

  const modelSlide = slideTitle("Model Performance", "Top validation models sorted by AUROC.");
  const topModels = args.modelData.slice().sort((a, b) => b.auroc - a.auroc).slice(0, 3);
  drawTable(
    modelSlide,
    [["Model", "AUROC", "Sensitivity", "Specificity", "F1"], ...topModels.map((model) => [
      model.name,
      model.auroc.toFixed(3),
      model.sensitivity.toFixed(3),
      model.specificity.toFixed(3),
      model.f1.toFixed(3),
    ])],
    0.7,
    2.35,
    [2.8, 1.1, 1.3, 1.3, 1.1],
  );
  slideTitle("Retention Funnel", "Aggregate retention milestone summary.")
    .addText(args.attritionLabel, { x: 0.7, y: 2.5, w: 9, h: 0.7, fontFace: "Arial", fontSize: 18, color: brand.ink });
  await pptx.writeFile({ fileName: "nano-executive-summary.pptx" });
}

export function ExecutiveMode() {
  const enabled = useFeatureFlag("EXECUTIVE_MODE");
  const study = useStudySummary();
  const models = useModelLeaderboard();
  const attrition = useAttritionFunnel();
  const rsa = useRsaTrajectories();
  const redcap = useRedcapData();
  const enrolled = study.data?.enrolled ?? 0;
  const target = study.data?.target ?? 260;
  const best = (models.data?.data ?? []).slice().sort((a, b) => b.auroc - a.auroc)[0];
  const lastStage = attrition.data?.stages?.at(-1);
  const attritionLabel = lastStage ? `${lastStage.label}: N=${lastStage.n}, ${lastStage.retainedPct.toFixed(1)}% retained.` : "Retention funnel not available.";
  const latestRsa = rsa.data?.data.find((row) => row.group === "TD" && row.adjustedAgeMonths === 36)?.mean;
  const redcapOps = redcap.data?.redcap_ops;
  const redcapTrackers = redcap.data?.redcap_trackers;
  const queue = redcapTrackers?.queue_funnel ?? [];
  const parityHashes = new Set(Object.values(redcapOps?.runtime_parity ?? {}).filter(Boolean));
  const parityOk = parityHashes.size <= 1 && parityHashes.size > 0;
  const completionRows = redcapTrackers?.enrollment ?? [];
  const avgVisitCompletion = completionRows.length
    ? completionRows.reduce((sum, row) => sum + row.completed / Math.max(row.expected, 1), 0) / completionRows.length
    : 0;
  const furthestBehind = completionRows.slice().sort((a, b) => (
    (b.expected - b.completed) / Math.max(b.expected, 1)
    - (a.expected - a.completed) / Math.max(a.expected, 1)
  ))[0];

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
            rsaData: rsa.data?.data ?? [],
            modelData: models.data?.data ?? [],
            attritionStages: attrition.data?.stages ?? [],
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
          ["REDCap Freshness", redcapOps?.freshness?.age_hours !== undefined ? `${redcapOps.freshness.age_hours.toFixed(1)}h` : "n/a"],
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
        <Card pad={20}>
          <SectionLabel>REDCap study health</SectionLabel>
          <h2 className={shared.cardTitle}>{(avgVisitCompletion * 100).toFixed(1)}% event completion</h2>
          <p className={shared.muted}>
            Runtime parity is {parityOk ? "green" : "not fully matched"}; the furthest-behind REDCap event is {furthestBehind?.label ?? "n/a"}.
          </p>
        </Card>
        <Card pad={20}>
          <SectionLabel>Milestone queue</SectionLabel>
          <table className={styles.table}>
            <thead><tr><th>Stage</th><th>N</th></tr></thead>
            <tbody>
              {queue.map((stage) => (
                <tr key={stage.stage}><td>{stage.stage}</td><td className="t-mono">{stage.count}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
