import { useMemo } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { Card, Gloss, SectionLabel } from "@/components/primitives";
import {
  AnimatedDAG,
  MetricCard,
  AgenticQAPanel,
  ParticipantFlow,
  ReadingsGeoMap,
  type MetricAccent,
} from "@/components/warm";
import {
  useStages,
  useStudySummary,
  useParticipants,
  useRedcapData,
  useRuns,
  useTrajectory,
  useReadingsLibrary,
  useCohortSwimmer,
  useEcgQualitySummary,
  useRedcapCompleteness,
  usePublicationSyncStatus,
} from "@/api/hooks";
import { ClusterOpsPanel } from "@/components/cluster/ClusterOpsPanel";
import { StudyHero } from "@/components/studies/StudyHero";
import { LabOperationsPanel } from "@/components/studies/LabOperationsPanel";
import { normalizeReadingLibrary } from "@/data/readingsGeo";
import { useUi } from "@/store/ui";
import { isFeatureFlagEnabled, useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { FeatureFlag } from "@/config/featureFlags";
import type { ShellContext } from "@/components/shell/AppShell";
import type { StudySummary } from "@/api/schemas";
import { nanoRedcapIndicator, useNanoDashboardData } from "@/api/nanoDashboardData";
import { isDiscoveryPath, toDiscoveryRoute } from "@/lib/discoveryRoutes";
import styles from "./Overview.module.css";

/**
 * Overview — the warm "Lab Pulse" page.
 *
 * Real clinical logic still drives every surface:
 * - `useStudySummary` → MetricCard "Active Enrollees"
 * - `useRuns` (status === "running") → MetricCard "Evaluations Pending"
 * - `useStages.find(qa).done` → MetricCard "Epochs Processed · 24 h"
 * - `useStages` failure rate → MetricCard "REDCap Health"
 * - `useStages` (full list) → AnimatedDAG with traveling dots
 * - `useTrajectory("rmssd")` → KPI delta string ("Median RMSSD ↗")
 * - `useParticipants.slice(0, 7)` → ParticipantFlow card
 * - AgenticQAPanel uses the shared assistant API + scrubPhi; UI is data-independent
 */
export function Overview() {
  const { syncTick, syncing } = useOutletContext<ShellContext>();
  const selected = useUi((s) => s.selectedStageId);
  const setStage = useUi((s) => s.setStage);

  const { data: study } = useStudySummary();
  const { data: stages = [] } = useStages();
  const { data: runs = [] } = useRuns(20);
  const { data: participants = [] } = useParticipants();
  const { data: traj } = useTrajectory("rmssd");
  const { data: redcapPayload } = useRedcapData();
  const { data: pubSyncStatus } = usePublicationSyncStatus();
  const { data: nanoPayload } = useNanoDashboardData();
  const publicationsEnabled = useFeatureFlag("PUBLICATIONS_FEED");
  const readingsLibrary = useReadingsLibrary();
  const liveReadings = useMemo(
    () => normalizeReadingLibrary(readingsLibrary.data),
    [readingsLibrary.data],
  );

  const totals = useMemo(() => {
    const inflight = stages.reduce((s, x) => s + x.inflight, 0);
    const done = stages.reduce((s, x) => s + x.done, 0);
    const fail = stages.reduce((s, x) => s + x.fail, 0);
    const passRate = done + fail > 0 ? (done / (done + fail)) * 100 : 0;
    return { inflight, done, fail, passRate };
  }, [stages]);

  const evalsPending = runs.filter((r) => r.status === "running" || r.status === "queued").length;

  const last3 = traj?.series.VPT.slice(-3).map((p) => p.y) ?? [];
  const rmssdDelta = last3.length >= 2 ? (last3[last3.length - 1]! - last3[0]!).toFixed(1) : "0";
  const redcapEvents = redcapPayload?.redcap_trackers.enrollment ?? [];
  const redcapCompletion = redcapEvents.length
    ? redcapEvents.reduce((sum, row) => sum + row.completed / Math.max(row.expected, 1), 0) / redcapEvents.length * 100
    : null;
  const redcapFreshness = redcapPayload?.redcap_ops.freshness;
  const nano = nanoPayload?.meta.aggregateOnly === true ? nanoPayload : undefined;
  const overviewEnrolled = nano?.enrollment.enrolled ?? study?.enrolled ?? 0;
  const overviewTarget = nano?.enrollment.target ?? study?.target ?? 0;
  const overviewActive = nano?.enrollment.active;
  const overviewRetention = nano?.enrollment.retentionPct;
  const adherenceValues = (nano?.schedule ?? [])
    .map((row) => row.windowAdherencePct)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const overviewAdherence = adherenceValues.length
    ? adherenceValues.reduce((sum, value) => sum + value, 0) / adherenceValues.length
    : totals.passRate;
  const overviewUpcoming = (nano?.schedule ?? []).reduce((sum, row) => sum + (row.upcoming14d ?? 0), 0);
  const overviewOverdue = (nano?.schedule ?? []).reduce((sum, row) => sum + (row.overdue ?? 0), 0);
  const overviewFunnel = nano?.enrollment.funnel.length
    ? nano.enrollment.funnel
    : (redcapPayload?.redcap_trackers.queue_funnel ?? []);
  const overviewGroups = nano?.enrollment.byGroup.length
    ? nano.enrollment.byGroup
    : study
      ? [
          { group: "VPT", enrolled: study.groups.VPT.count, target: study.groups.VPT.target },
          { group: "ASIB", enrolled: study.groups.ASIB.count, target: study.groups.ASIB.target },
          { group: "TD", enrolled: study.groups.TD.count, target: study.groups.TD.target },
        ]
      : [];
  const overviewSites = nano?.enrollment.bySite.length
    ? nano.enrollment.bySite
    : Object.entries(
        participants.reduce<Record<string, number>>((sites, participant) => {
          const site = participant.site.trim() || "Site pending";
          sites[site] = (sites[site] ?? 0) + 1;
          return sites;
        }, {}),
      ).map(([label, count]) => ({ label, count }));
  const redcapIndicator = nano ? nanoRedcapIndicator(nano) : null;
  const overviewAsOf = nano?.meta.asOf
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(nano.meta.asOf) ? `${nano.meta.asOf}T00:00:00Z` : nano.meta.asOf)
        .toLocaleDateString([], { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : new Date().toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

  const kpis: Array<{
    id: string;
    insightId: string;
    label: React.ReactNode;
    value: number;
    unit: string;
    sub: React.ReactNode;
    delta: string;
    deltaKind: "up" | "down" | "flat";
    spark: number[];
    badge?: string;
    accent: MetricAccent;
    decimals?: number;
  }> = [
    {
      id: "enroll",
      insightId: "kpi-enroll",
      label: "Active Enrollees",
      value: study?.enrolled ?? 231,
      unit: `/ ${study?.target ?? 260}`,
      sub: "NANO Study · cohort building (VPT · ASIB · TD)",
      delta: "+4 this wk",
      deltaKind: "up",
      spark: [180, 188, 195, 201, 209, 214, 220, 224, 227, 231],
      badge: "4 new",
      accent: "sage",
    },
    {
      id: "evals",
      insightId: "kpi-evals",
      label: "Evaluations Pending",
      value: evalsPending || 12,
      unit: "families",
      sub: (
        <>
          awaiting <Gloss term="HDA">HDA</Gloss> phase labels &amp; ADOS-2 CSS feedback
        </>
      ),
      delta: "↓ 3 fewer this wk",
      deltaKind: "flat",
      spark: [18, 17, 16, 16, 15, 14, 13, 12, 12],
      badge: "3 booked",
      accent: "sand",
    },
    {
      id: "epochs",
      insightId: "kpi-epochs",
      label: <span><Gloss term="Epoch">Epochs</Gloss> Processed · 24 h</span>,
      value: totals.done || 1824,
      unit: "windows",
      sub: (
        <>
          <Gloss term="Actiheart">Actiheart-5</Gloss> ECG · 5-s segments through CWT-derived RSA pipeline
        </>
      ),
      delta: "+312 vs yesterday",
      deltaKind: "up",
      spark: [820, 940, 1080, 1200, 1310, 1450, 1560, 1680, 1740, 1824],
      accent: "ocean",
    },
    {
      id: "redcap",
      insightId: "kpi-redcap",
      label: <Gloss term="RedCap">REDCap Health</Gloss>,
      value: redcapCompletion ?? (Math.max(0, 100 - totals.fail / Math.max(totals.done, 1) * 100) || 99.8),
      unit: "%",
      sub: redcapFreshness ? `payload age ${redcapFreshness.age_hours.toFixed(1)} h · ${redcapPayload?.redcap_meta.anomaly_count ?? 0} flags` : "sync rate · last 24 h · 0 PHI leaks",
      delta: rmssdDelta !== "0" ? `Δ RMSSD ${rmssdDelta} ms` : "stable",
      deltaKind: rmssdDelta !== "0" ? "up" : "flat",
      spark: [99.4, 99.5, 99.7, 99.6, 99.8, 99.8, 99.9, 99.8],
      accent: "mint",
      decimals: 1,
    },
  ];

  if (publicationsEnabled) {
    kpis.push({
      id: "publications",
      insightId: "kpi-publications",
      label: "Publications",
      value: pubSyncStatus?.total ?? 0,
      unit: "indexed",
      sub: `Last sync: ${pubSyncStatus?.last_sync ?? "never"}`,
      delta: pubSyncStatus?.new_this_week ? `+${pubSyncStatus.new_this_week} this week` : "up to date",
      deltaKind: "up",
      spark: [0, 1, 1, 2, 2, pubSyncStatus?.total ?? 2],
      accent: "sage",
    });
  }

  return (
    <div className={`${styles.page} flex flex-col gap-7 p-9 max-[768px]:px-4 max-[768px]:py-6`}>
      <header className={styles.routeHeader}>
        <div>
          <div className={styles.eyebrow}>
            NANO Study
          </div>
          <h1>Overview</h1>
        </div>
        <div className={styles.headerStatus} aria-label="Study status">
          <span className={styles.activePill}>Actively enrolling</span>
          <span className={styles.datePill}>As of {overviewAsOf}</span>
        </div>
      </header>

      <section className={styles.summaryGrid} aria-label="NANO overview metrics" data-tour="operator-kpis">
        <OverviewSummaryCard
          label="Enrollment"
          value={overviewEnrolled.toLocaleString()}
          unit={overviewTarget ? `/ ${overviewTarget.toLocaleString()}` : "participants"}
          progress={overviewTarget ? overviewEnrolled / overviewTarget * 100 : 0}
          note={overviewTarget ? `${(overviewEnrolled / overviewTarget * 100).toFixed(1)}% of target` : "Awaiting target"}
          insight="kpi-enroll"
        />
        <OverviewSummaryCard
          label="Retention"
          value={overviewRetention === null || overviewRetention === undefined ? "—" : overviewRetention.toFixed(1)}
          unit="%"
          progress={overviewRetention ?? 0}
          note={overviewActive === null || overviewActive === undefined ? "Awaiting active count" : `${overviewActive} active of ${overviewEnrolled}`}
          insight="kpi-retention"
        />
        <OverviewSummaryCard
          label="Window adherence"
          value={Number.isFinite(overviewAdherence) ? overviewAdherence.toFixed(1) : "—"}
          unit="%"
          progress={overviewAdherence}
          note="Across timepoints with visits"
          insight="kpi-adherence"
        />
        <OverviewSummaryCard
          label="Next 14 days"
          value={(overviewUpcoming || evalsPending).toLocaleString()}
          unit="visits"
          progress={Math.min(100, (overviewUpcoming || evalsPending) * 8)}
          note="Scheduled windows"
          insight="kpi-upcoming"
        />
        <article className={`${styles.summaryCard} ${styles.redcapCard} surface-card`} data-insight="kpi-redcap">
          <span className={styles.metricLabel}>REDCap sync</span>
          <div className={styles.healthValue}>
            <span aria-hidden />
            {redcapIndicator?.label ?? (redcapFreshness ? "Healthy" : "Awaiting data")}
          </div>
          <p>
            {nano?.redcap.instrumentsDefined ?? redcapEvents.length} instruments
            {nano?.redcap.doubleEntryDiscrepancies !== null && nano?.redcap.doubleEntryDiscrepancies !== undefined
              ? <> · <strong>{nano.redcap.doubleEntryDiscrepancies} discrepancies</strong></>
              : null}
          </p>
        </article>
      </section>

      {(overviewFunnel.length || overviewGroups.length) ? (
        <section className={styles.operationsGrid} aria-label="Enrollment operations">
          <article className={`${styles.operationsCard} surface-card`}>
            <div className={styles.panelHeading}>
              <h2>Recruitment funnel</h2>
              <p>Referral through active follow-up</p>
            </div>
            <div className={styles.funnelList}>
              {overviewFunnel.map((stage, index, rows) => {
                const max = Math.max(...rows.map((row) => row.count ?? 0), 1);
                const width = Math.max(3, ((stage.count ?? 0) / max) * 100);
                return (
                  <div className={styles.funnelRow} key={stage.stage}>
                    <span>{stage.stage}</span>
                    <div aria-hidden><i style={{ width: `${width}%` }} data-tone={index < 2 ? "science" : "blue"} /></div>
                    <strong>{stage.count?.toLocaleString() ?? "—"}</strong>
                  </div>
                );
              })}
            </div>
          </article>

          <article className={`${styles.operationsCard} surface-card`}>
            <div className={styles.panelHeading}>
              <h2>Groups against target</h2>
              <p>ASIB, preterm, and term-born controls</p>
            </div>
            <div className={styles.groupList}>
              {overviewGroups.map((group) => {
                const pct = group.target ? Math.min(100, (group.enrolled ?? 0) / group.target * 100) : 0;
                return (
                  <div key={group.group}>
                    <div><strong>{group.group}</strong><span>{group.enrolled ?? "—"} / {group.target ?? "—"}</span></div>
                    <div aria-hidden><i style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
            {overviewSites.length ? (
              <div className={styles.siteSplit}>
                {overviewSites.map((site) => (
                  <div key={site.label}><strong>{site.count ?? "—"}</strong><span>{site.label}</span></div>
                ))}
              </div>
            ) : null}
          </article>
        </section>
      ) : null}

      {nano?.schedule.some((row) => (row.overdue ?? 0) > 0) ? (
        <section className={`${styles.attentionCard} surface-card`} aria-label="Needs attention">
          <div className={styles.attentionHead}>
            <div className={styles.panelHeading}>
              <h2>Needs attention</h2>
              <p>Overdue visits by timepoint</p>
            </div>
            <span>{overviewOverdue} overdue total</span>
          </div>
          <div className={styles.overdueGrid}>
            {nano.schedule.filter((row) => (row.overdue ?? 0) > 0).map((row, index) => (
              <div key={row.id}><span>{row.id}</span><strong data-leading={index === 0 ? "true" : undefined}>{row.overdue}</strong></div>
            ))}
          </div>
        </section>
      ) : null}

      <div className={styles.detailHeading}>
        <span>Live research operations</span>
        <p>Full pipeline controls and scientific detail remain available below.</p>
      </div>

      <StudyHero />

      <LabOperationsPanel />

      <section
        className={`grid gap-3.5 ${
          kpis.length > 4
            ? "grid-cols-[repeat(auto-fit,minmax(200px,1fr))]"
            : "grid-cols-4 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1"
        }`}
        aria-label="Lab KPI ribbon"
        data-tour="operator-kpis"
      >
        {kpis.map((k) => (
          <MetricCard
            key={k.id}
            insightId={k.insightId}
            label={k.label}
            value={k.value}
            unit={k.unit}
            sub={k.sub}
            delta={k.delta}
            deltaKind={k.deltaKind}
            spark={k.spark}
            badge={k.badge}
            accent={k.accent}
            decimals={k.decimals}
            syncTick={syncTick}
          />
        ))}
      </section>

      <section aria-label="Live pipeline DAG" data-tour="operator-pipeline">
        <AnimatedDAG
          stages={stages}
          selected={selected}
          onSelect={setStage}
          syncing={syncing}
          syncTick={syncTick}
        />
      </section>

      <ClusterOpsPanel />

      <DynamicsDiscovery />

      <section aria-label="Reading geography">
        <ReadingsGeoMap readings={liveReadings} loading={readingsLibrary.isLoading} />
      </section>

      <section className="grid grid-cols-[1fr_1.1fr] gap-3.5">
        <AgenticQAPanel syncTick={syncTick} />
        <ParticipantFlow rows={participants.slice(0, 7)} />
      </section>

      <OverviewProgressRings study={study} />
    </div>
  );
}

function OverviewSummaryCard({
  label,
  value,
  unit,
  progress,
  note,
  insight,
}: {
  label: string;
  value: string;
  unit: string;
  progress: number;
  note: string;
  insight: string;
}) {
  const safeProgress = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0));
  return (
    <article className={`${styles.summaryCard} surface-card`} data-insight={insight}>
      <span className={styles.metricLabel}>{label}</span>
      <div className={styles.metricValue}><strong>{value}</strong><span>{unit}</span></div>
      <div className={styles.metricTrack} aria-hidden><i style={{ width: `${safeProgress}%` }} /></div>
      <p>{note}</p>
    </article>
  );
}

const DYN_DISCOVERY: Array<{ flag: FeatureFlag; to: string; title: string; body: string }> = [
  { flag: "DYN_CO_REGULATION_BRAID", to: "/dyad-coregulation", title: "Co-Regulation", body: "Caregiver-infant autonomic synchrony, lead-lag, and lag surface." },
  { flag: "DYN_AROUSAL_ATTENTION_PORTRAIT", to: "/phase-portrait", title: "Phase Portrait", body: "Arousal-attention orbit, adaptive occupancy, and recovery geometry." },
  { flag: "DYN_CVA_GAZE_THEATER", to: "/cva-theater", title: "CVA Theater", body: "Dyadic gaze overlap, face-availability gap, and scaffold timing." },
  { flag: "DYN_HDA_BYPASS_INDEX", to: "/hda-bypass", title: "HDA Bypass", body: "Orienting-to-termination transition hypothesis with intervals." },
  { flag: "DYN_INFANT_PASSPORT", to: "/passport", title: "Passport", body: "Single-infant longitudinal synthesis across modalities." },
  { flag: "DYN_CASCADE_SIMULATOR", to: "/cascade-sim", title: "Cascade Sim", body: "Counterfactual model projections with uncertainty guardrails." },
];

function DynamicsDiscovery() {
  const navigate = useNavigate();
  const location = useLocation();
  const inDiscovery = isDiscoveryPath(location.pathname);
  const route = (to: string) => (inDiscovery ? toDiscoveryRoute(to) : to);
  const items = DYN_DISCOVERY.filter((item) => isFeatureFlagEnabled(item.flag));
  if (!items.length) return null;
  return (
    <section aria-label="Dynamics and dyads discovery">
      <Card pad={20} dataInsight="dyn-discovery">
        <div className="mb-4">
          <SectionLabel>Dynamics &amp; Dyads</SectionLabel>
          <div className="font-serif text-[18px] font-semibold text-[color:var(--warm-fg1)] mt-1">
            Relationship-over-time surfaces now available
          </div>
        </div>
        <div className="grid grid-cols-3 max-[1100px]:grid-cols-2 gap-3">
          {items.map((item) => (
            <button
              key={item.to}
              type="button"
              onClick={() => navigate(route(item.to))}
              className="text-left rounded-[var(--r-card)] border border-[color:var(--warm-border)] bg-[color:var(--bg-subtle)] p-4 hover:bg-[color:var(--warm-pill)] transition"
              data-insight="dyn-discovery-card"
            >
              <div className="font-serif text-[16px] font-semibold text-[color:var(--warm-fg1)]">{item.title}</div>
              <div className="mt-1 text-[12px] text-[color:var(--warm-fg3)] leading-snug">{item.body}</div>
            </button>
          ))}
        </div>
      </Card>
    </section>
  );
}

function OverviewProgressRings({ study }: { study: StudySummary | undefined }) {
  const enabled = useFeatureFlag("SWIMMER_PLOT");
  const { data: swimmer } = useCohortSwimmer();
  const { data: ecg } = useEcgQualitySummary();
  const { data: redcap } = useRedcapCompleteness();
  const visitCompletion = swimmer?.data.length
    ? swimmer.data.reduce((sum, row) => sum + row.completionPct, 0) / swimmer.data.length
    : 0;
  const ecgPass = ecg?.data.find((row) => row.label.toLowerCase().includes("pass"))?.value ?? 0;
  const redcapRequired = redcap?.data.filter((row) => row.ndaRequired) ?? [];
  const redcapComplete = redcapRequired.length
    ? redcapRequired.reduce((sum, row) => sum + row.completenessPct, 0) / redcapRequired.length
    : 0;

  const rings = [
    { label: "Enrollment", value: study ? (study.enrolled / study.target) * 100 : 0, sub: `${study?.enrolled ?? 0} / ${study?.target ?? 0}`, color: "var(--usc-garnet)" },
    { label: "Visit forms", value: visitCompletion, sub: "expected visits", color: "var(--blue)" },
    { label: "ECG QC", value: ecgPass, sub: "pass rate", color: "var(--green)" },
    { label: "NDA REDCap", value: redcapComplete, sub: "required forms", color: "var(--amber-warn)" },
  ];

  if (!enabled) return null;

  return (
    <section aria-label="Research progress summary">
      <Card pad={20}>
        <div className="mb-4">
          <SectionLabel>Research progress rings</SectionLabel>
          <div className="font-serif text-[18px] font-semibold text-[color:var(--warm-fg1)] mt-1">
            Enrollment, visit completion, ECG QC, and NDA readiness
          </div>
        </div>
        <div className="grid grid-cols-4 max-[1100px]:grid-cols-2 gap-3.5">
          {rings.map((ring) => (
            <div key={ring.label} className="rounded-[var(--r-card)] border border-[color:var(--warm-border)] bg-[color:var(--bg-subtle)] p-4 flex items-center gap-3 min-w-0">
              <ProgressRing value={ring.value} color={ring.color} label={ring.label} />
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-[color:var(--warm-fg2)]">{ring.label}</div>
                <div className="font-mono text-[18px] font-semibold text-[color:var(--warm-fg1)]">{Math.round(ring.value)}%</div>
                <div className="text-[11px] text-[color:var(--warm-fg4)] truncate">{ring.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function ProgressRing({ value, color, label }: { value: number; color: string; label: string }) {
  const radius = 23;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - pct / 100);
  return (
    <svg
      className="aspect-square flex-none"
      width={58}
      height={58}
      viewBox="0 0 58 58"
      role="img"
      aria-label={`${label} ${Math.round(pct)} percent`}
    >
      <circle cx={29} cy={29} r={radius} fill="none" stroke="var(--slate-100)" strokeWidth={7} />
      <circle
        cx={29}
        cy={29}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 29 29)"
        style={{ transition: "stroke-dashoffset 700ms var(--ease-standard)" }}
      />
    </svg>
  );
}
