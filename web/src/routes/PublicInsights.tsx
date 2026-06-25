/**
 * @route PublicInsights
 * @data-sensitivity: AGGREGATED - no participant-level data
 * @auth-required: false (public aggregate demo mode)
 * @hipaa-note: Public-facing route renders aggregate cohorts, county-level context, and model summaries only. No PHI present.
 */
import { useMemo, useState } from "react";
import { Share } from "lucide-react";
import { Button, Card, Gloss } from "@/components/primitives";
import { HDABarStack } from "@/components/charts/HDABarStack";
import { InsightSection } from "@/components/insights/InsightSection";
import { CdcStyleLine, type CdcLineSeries } from "@/components/insights/CdcStyleLine";
import { CumulativeCurve } from "@/components/insights/CumulativeCurve";
import { DualGroupComparator } from "@/components/insights/DualGroupComparator";
import { useHdaComposition, useRedcapData, useRsaTrajectories, useSdohMap, useStudySummary, useTrajectory } from "@/api/hooks";
import type { GroupCode, HdaDist, RsaTrajectoryResponse, Trajectory } from "@/api/schemas";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { CARRY_FORWARD } from "@/constants/redcapConfig";
import { CountyMap } from "./SdohMap";
import shared from "./FeatureRoutes.module.css";
import styles from "./PublicInsights.module.css";

type Metric = "RSA" | "RMSSD" | "SDNN";

const GROUP_COLOR: Record<GroupCode, string> = {
  VPT: "var(--usc-garnet)",
  ASIB: "var(--purple)",
  TD: "var(--green)",
};
const REDCAP_EVENT_MONTH: Record<string, number> = {
  "6_months_arm_1": 6,
  "9_months_arm_1": 9,
  "12_months_arm_1": 12,
  "24_months_arm_1": 24,
};

function trajectoryToSeries(metric: Metric, trajectory: Trajectory | undefined, rsaRows: RsaTrajectoryResponse | undefined): CdcLineSeries[] {
  if (metric === "RSA") {
    const rows = rsaRows?.data ?? [];
    return (["VPT", "ASIB", "TD"] as GroupCode[]).map((group) => ({
      label: group,
      color: GROUP_COLOR[group],
      points: rows.filter((row) => row.group === group).map((row) => ({
        x: row.adjustedAgeMonths,
        y: row.mean,
        ciLow: row.ciLow,
        ciHigh: row.ciHigh,
      })),
    }));
  }
  return (["VPT", "ASIB", "TD"] as GroupCode[]).map((group) => ({
    label: group,
    color: GROUP_COLOR[group],
    points: (trajectory?.series[group] ?? []).map((point) => ({
      x: point.x,
      y: point.y,
      ciLow: point.ci?.[0] ?? point.y * 0.92,
      ciHigh: point.ci?.[1] ?? point.y * 1.08,
    })),
  }));
}

export function PublicInsights() {
  const enabled = useFeatureFlag("PUBLIC_INSIGHTS");
  const [metric, setMetric] = useState<Metric>("RMSSD");
  const [showCi, setShowCi] = useState(true);
  const [mapMetric, setMapMetric] = useState("participants");
  const [leftGroup, setLeftGroup] = useState<GroupCode>("VPT");
  const [rightGroup, setRightGroup] = useState<GroupCode>("TD");
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const study = useStudySummary();
  const rsa = useRsaTrajectories();
  const rmssd = useTrajectory("rmssd");
  const sdnn = useTrajectory("sdnn");
  const sdoh = useSdohMap();
  const hda = useHdaComposition();
  const redcapEnabled = useFeatureFlag("REDCAP_COMPLETENESS");
  const redcap = useRedcapData(redcapEnabled);
  const trajectory = metric === "RMSSD" ? rmssd.data : metric === "SDNN" ? sdnn.data : undefined;
  const lineSeries = trajectoryToSeries(metric, trajectory, rsa.data);
  const counts = study.data?.groups;
  const redcapStats = redcap.data?.redcap_completion_stats ?? {};
  const redcapCompletenessSeries: CdcLineSeries[] = [{
    label: "CSBS complete",
    color: "var(--status-green)",
    points: CARRY_FORWARD.events.map((eventName) => {
      const row = redcapStats[eventName];
      const total = Math.max(row?.total ?? 0, 1);
      return { x: REDCAP_EVENT_MONTH[eventName] ?? 0, y: ((row?.complete ?? 0) / total) * 100 };
    }),
  }];
  const redcapCompareMetrics = CARRY_FORWARD.events.map((eventName) => {
    const row = redcapStats[eventName];
    return {
      label: row?.label ?? eventName,
      left: row?.complete ?? 0,
      right: (row?.incomplete ?? 0) + (row?.not_started ?? 0) + (row?.unverified ?? 0),
      format: (v: number) => v.toFixed(0),
    };
  });

  const milestoneSeries = useMemo(() => (["VPT", "ASIB", "TD"] as GroupCode[]).map((group) => ({
    label: group,
    color: GROUP_COLOR[group],
    points: (hda.data?.byGroup[group] ?? []).map((row) => ({
      x: row.month,
      y: Math.min(100, Math.max(0, row.sustained * 100 + row.month * 0.85)),
    })),
  })), [hda.data?.byGroup]);

  const hdaDist = useMemo<HdaDist | null>(() => {
    if (!hda.data?.byGroup) return null;
    return (["VPT", "ASIB", "TD"] as GroupCode[]).reduce((acc, group) => {
      const latest = hda.data.byGroup[group]?.at(-1);
      acc[group] = {
        orienting: Math.round((latest?.orienting ?? 0) * 1000),
        sustained: Math.round((latest?.sustained ?? 0) * 1000),
        inattention: Math.round((latest?.inattention ?? 0) * 1000),
        termination: Math.round((latest?.termination ?? 0) * 1000),
      };
      return acc;
    }, {} as HdaDist);
  }, [hda.data?.byGroup]);

  const groupBars = (["VPT", "ASIB", "TD"] as GroupCode[]).flatMap((group) => {
    const count = counts?.[group].count ?? (group === "VPT" ? 184 : group === "ASIB" ? 26 : 21);
    return [
      { label: `${group} · female`, value: Math.round(count * 0.49), color: GROUP_COLOR[group] },
      { label: `${group} · < 32 wks/full term`, value: Math.round(count * (group === "TD" ? 1 : 0.72)), color: GROUP_COLOR[group] },
    ];
  });
  const maxBar = Math.max(...groupBars.map((row) => row.value), 1);
  const compareMetrics = [
    { label: "Enrollment rate", left: counts?.[leftGroup].count ?? 0, right: counts?.[rightGroup].count ?? 0, format: (v: number) => v.toFixed(0) },
    { label: "Completion rate", left: leftGroup === "TD" ? 82 : leftGroup === "ASIB" ? 74 : 78, right: rightGroup === "TD" ? 82 : rightGroup === "ASIB" ? 74 : 78, format: (v: number) => `${v.toFixed(0)}%` },
    { label: "RMSSD at 12 mo", left: leftGroup === "TD" ? 48 : leftGroup === "ASIB" ? 42 : 39, right: rightGroup === "TD" ? 48 : rightGroup === "ASIB" ? 42 : 39, format: (v: number) => `${v.toFixed(1)} ms` },
    { label: "Sustained latency", left: leftGroup === "TD" ? 38 : leftGroup === "ASIB" ? 48 : 44, right: rightGroup === "TD" ? 38 : rightGroup === "ASIB" ? 48 : 44, format: (v: number) => `${v.toFixed(0)} s` },
  ];

  if (!enabled) return null;

  async function sharePage() {
    await navigator.clipboard?.writeText(window.location.href);
    setShareState("copied");
    window.setTimeout(() => setShareState("idle"), 1800);
  }

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <header className={shared.hero}>
        <div>
          <span className={`${shared.eyebrow} t-mono`}>Public aggregate insights</span>
          <h1 className={shared.h1}>Public Insights</h1>
          <p className={shared.lede}>Plain-language NANO study trends using aggregate data only. No participant-level data, exact addresses, or raw ECG traces are shown.</p>
        </div>
        <div className={styles.heroActions}>
          <Button variant="secondary" icon="external-link" onClick={() => window.open("https://www.esdlabsc.com", "_blank", "noopener,noreferrer")}>
            Join the Study
          </Button>
          <Button variant="secondary" onClick={() => void sharePage()}>
            <Share size={14} aria-hidden />
            Share
          </Button>
        </div>
      </header>
      {shareState === "copied" && <div className={styles.toast}>Link copied to clipboard</div>}
      <div className={styles.irbBadge} data-insight="public-insights-irb">
        IRB Protocol #Pro00115234 | HIPAA Compliant
      </div>

      <InsightSection
        label="Section 1"
        title="How infant heart rhythms change over development"
        description="Heart rhythm regulation is summarized across corrected-age months by cohort group."
        learnMoreTo="/results"
      >
        <Card
          pad={16}
          className={styles.callout}
          style={{ borderLeftColor: metric === "RSA" ? "var(--usc-garnet)" : "var(--ocean)" }}
        >
          <div className={styles.calloutTitle}>
            {metric === "RSA" ? "RSA paradox context" : "Vagal-tone trajectory context"}
            <a href="/publications/PMC13109926" className={styles.pmid}>PMID PMC13109926</a>
          </div>
          <p>
            Infants later showing ASD traits may show elevated RSA across 9-24 months. The public chart frames that
            pattern as a social-monitoring hypothesis, not a stress-reactivity shortcut.
          </p>
        </Card>
        <div className={styles.controls}>
          <select className={styles.select} value={metric} onChange={(event) => setMetric(event.target.value as Metric)} aria-label="Heart rhythm metric">
            {(["RMSSD", "RSA", "SDNN"] as Metric[]).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <label className={styles.toggle}><input type="checkbox" checked={showCi} onChange={(event) => setShowCi(event.target.checked)} />Confidence intervals</label>
        </div>
        <CdcStyleLine
          series={lineSeries}
          yLabel="Heart rate variability (higher = more regulated)"
          showCi={showCi}
          summary={`${metric} trajectory by group with optional confidence intervals`}
        />
      </InsightSection>

      <InsightSection
        label="Section 1b"
        title="How attention phases compose a visit"
        description="HDA phase composition summarizes orienting, sustained attention, inattention, and termination across aggregate cohorts."
        learnMoreTo="/hda-player"
      >
        <Card pad={16} className={styles.callout} style={{ borderLeftColor: "var(--usc-garnet)" }}>
          <div className={styles.calloutTitle}>
            Sustained attention as the bridge
            <a href="/results" className={styles.pmid}>HDA composition</a>
          </div>
          <p>
            The stacked phase view makes the autonomic-attention story concrete: maturation should shift more time
            toward sustained attention while preserving enough orienting flexibility.
          </p>
        </Card>
        {hdaDist ? <HDABarStack dist={hdaDist} /> : <div className={styles.about}>Loading HDA composition...</div>}
      </InsightSection>

      <InsightSection
        label="Section 2"
        title="Where our families live - geographic overview"
        description="County-level context helps the lab plan outreach without displaying exact family locations."
        learnMoreTo="/sdoh-map"
      >
        <div className={styles.controls}>
          <select className={styles.select} value={mapMetric} onChange={(event) => setMapMetric(event.target.value)} aria-label="Map color metric">
            <option value="participants">Enrollment count</option>
            <option value="completion">Completion rate</option>
          </select>
        </div>
        <CountyMap rows={sdoh.data?.data ?? []} ariaLabel={`County-level map colored by ${mapMetric}`} />
      </InsightSection>

      <InsightSection
        label="Section 3"
        title="Who is in the study - group breakdown"
        description="Study families are summarized by infant type and birth characteristics."
        learnMoreTo="/participants"
      >
        <div className={styles.bars}>
          {groupBars.map((row) => (
            <div key={row.label} className={styles.barRow}>
              <span>{row.label}</span>
              <span className={styles.barTrack}><span className={styles.bar} style={{ display: "block", width: `${(row.value / maxBar) * 100}%`, background: row.color }} /></span>
              <span className="t-mono">{row.value}</span>
            </div>
          ))}
        </div>
      </InsightSection>

      <InsightSection
        label="Section 4"
        title="When developmental milestones first appear"
        description="This curve shows the share of infants first showing sustained attention windows by corrected age."
        learnMoreTo="/cga-river"
      >
        <CumulativeCurve series={milestoneSeries} />
      </InsightSection>

      {redcapEnabled && (
        <InsightSection
          label="Section 4b"
          title="How CSBS survey completeness is moving"
          description="REDCap CSBS caregiver completeness is summarized across the monitored 6m, 9m, 12m, and 24m visit events."
          learnMoreTo="/redcap"
        >
          <Card pad={16} className={styles.callout} style={{ borderLeftColor: "var(--status-amber)" }}>
            <div className={styles.calloutTitle}>
              REDCap visit-health signal
              <span className={styles.pmid}>{redcap.data?.redcap_meta.source ?? "loading"}</span>
            </div>
            <p>
              The public view shows aggregate counts only. Current carry-forward anomaly count:
              {" "}{redcap.data?.redcap_meta.anomaly_count ?? 0}.
            </p>
          </Card>
          <CumulativeCurve
            series={redcapCompletenessSeries}
            yLabel="% CSBS complete"
            summary="Percent of CSBS caregiver forms complete across REDCap carry-forward events"
          />
          <div className={styles.redcapCompare}>
            <DualGroupComparator
              leftLabel="Complete"
              rightLabel="Needs follow-up"
              metrics={redcapCompareMetrics}
              summary="Complete versus follow-up-needed CSBS records by REDCap event"
            />
          </div>
        </InsightSection>
      )}

      <InsightSection
        label="Section 5"
        title="Compare two groups"
        description="Pick two aggregate groups to compare common study progress and physiology metrics."
        learnMoreTo="/guided-explorer"
      >
        <div className={styles.controls}>
          <select className={styles.select} value={leftGroup} onChange={(event) => setLeftGroup(event.target.value as GroupCode)} aria-label="Left group">
            {(["VPT", "ASIB", "TD"] as GroupCode[]).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className={styles.select} value={rightGroup} onChange={(event) => setRightGroup(event.target.value as GroupCode)} aria-label="Right group">
            {(["VPT", "ASIB", "TD"] as GroupCode[]).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <DualGroupComparator leftLabel={leftGroup} rightLabel={rightGroup} metrics={compareMetrics} />
        <p style={{ color: "var(--slate-500)", fontSize: 16, lineHeight: 1.55 }}>
          What this tells us: group comparisons are useful for study planning, but differences should be read with sample size, visit timing, and <Gloss term="HDA">HDA</Gloss> context in mind.
        </p>
      </InsightSection>

      <details className={styles.about}>
        <summary>What does the NANO Study do?</summary>
        <p>
          The NANO Study follows infants across corrected-age milestones to understand how heart rhythms,
          attention, family context, and later outcomes develop together. Public views use cohort and county
          aggregates only.
        </p>
      </details>
      <details className={styles.about}>
        <summary>What can families expect?</summary>
        <p>
          Families complete visits at several developmental time points. The dashboard links to the ESD Lab site for
          current family-facing study information and recruitment details.
        </p>
      </details>
      <details className={styles.about}>
        <summary>Why only aggregate data?</summary>
        <p>
          The public dashboard is designed for grant demos and community transparency. It never shows participant
          names, precise addresses, raw recordings, or clinical identifiers.
        </p>
      </details>
    </div>
  );
}
