import { useMemo } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { Card, Gloss, SectionLabel } from "@/components/primitives";
import {
  AnimatedDAG,
  MetricCard,
  ReadingsGeoMap,
  type MetricAccent,
} from "@/components/warm";
import {
  useStages,
  useRuns,
  useReadingsLibrary,
  useCohortSwimmer,
  useEcgQualitySummary,
  useRedcapCompleteness,
  usePublicationSyncStatus,
} from "@/api/hooks";
import {
  formatDashboardTimestamp,
  getDashboardSourceState,
  selectRedcapSummary,
  selectScopeMetrics,
  useDashboardMetrics,
  type DashboardStudyMetrics,
} from "@/api/dashboardMetrics";
import { RedcapProjectLinks } from "@/components/redcap/RedcapProjectLinks";
import { DataProvenance } from "@/components/data/DataProvenance";
import { ClusterOpsPanel } from "@/components/cluster/ClusterOpsPanel";
import { normalizeReadingLibrary } from "@/data/readingsGeo";
import { useUi } from "@/store/ui";
import { isFeatureFlagEnabled, useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { FeatureFlag } from "@/config/featureFlags";
import type { ShellContext } from "@/components/shell/AppShell";
import { isDiscoveryPath, toDiscoveryRoute } from "@/lib/discoveryRoutes";
import styles from "./Overview.module.css";

/** REDCap authority at the top; explicitly labeled operational snapshots below. */
export function Overview() {
  const { syncTick, syncing } = useOutletContext<ShellContext>();
  const selected = useUi((s) => s.selectedStageId);
  const setStage = useUi((s) => s.setStage);

  const dashboardMetrics = useDashboardMetrics();
  const { data: stages = [] } = useStages();
  const { data: runs = [] } = useRuns(20);
  const { data: pubSyncStatus } = usePublicationSyncStatus();
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

  // Every figure on this page follows the sidebar scope. `scope` is the study
  // key (or ALL); `scoped` is its metrics, or null when the payload has none.
  const activeStudy = useUi((s) => s.activeStudy);
  const setActiveStudy = useUi((s) => s.setActiveStudy);
  const scope = activeStudy.toLowerCase();
  const scoped = selectScopeMetrics(dashboardMetrics.data, scope);
  const isPortfolio = scope === "all";
  const scopeLabel = isPortfolio ? "All studies" : activeStudy;

  const sourceState = getDashboardSourceState(dashboardMetrics.data);
  const redcapSummary = selectRedcapSummary(dashboardMetrics.data);
  const portfolioStudies = dashboardMetrics.data?.studies ?? [];
  const observedEvents = (scoped?.events ?? []).filter(
    (event): event is typeof event & { records: number } => !event.suppressed && event.records !== null,
  );

  // Only render a summary card when it has a real number behind it. The page
  // previously showed five cards where three were permanently "—", which reads
  // as broken data rather than as an absent metric.
  const summaryCards = [
    scoped?.enrollment != null && {
      key: "enrollment",
      label: "Enrollment",
      value: formatMetric(scoped.enrollment),
      unit: scoped.target != null ? `/ ${scoped.target.toLocaleString()}` : "enrolled",
      progress: scoped.target ? (scoped.enrollment / scoped.target) * 100 : 0,
      note: scoped.target
        ? `${((scoped.enrollment / scoped.target) * 100).toFixed(1)}% of target`
        : `${scopeLabel} · survey authority`,
      insight: "kpi-enroll",
    },
    scoped?.eventRecords != null && {
      key: "events",
      label: "Event records",
      value: formatMetric(scoped.eventRecords),
      unit: "records",
      progress: 0,
      note: `Observed ${scopeLabel} REDCap events`,
      insight: "kpi-events",
    },
    scoped?.forms.completionRate != null && {
      key: "completion",
      label: "Form completion",
      value: scoped.forms.completionRate.toFixed(1),
      unit: "%",
      progress: scoped.forms.completionRate,
      note:
        scoped.forms.total != null
          ? `${formatMetric(scoped.forms.complete)} verified of ${formatMetric(scoped.forms.total)}`
          : "Verified form states",
      insight: "kpi-completion",
    },
    scoped?.projectsOk != null && {
      key: "projects",
      label: "Reporting projects",
      value: formatMetric(scoped.projectsOk),
      unit: scoped.projectsTotal != null ? `/ ${scoped.projectsTotal}` : "projects",
      progress: scoped.projectsTotal ? (scoped.projectsOk / scoped.projectsTotal) * 100 : 0,
      note: `${scopeLabel} source projects`,
      insight: "kpi-projects",
    },
  ].filter((card): card is Exclude<typeof card, false | undefined | null> => Boolean(card));

  // One honest line replaces the removed placeholder tiles.
  const unavailableCount = 4 - summaryCards.length;
  const overviewAsOf = sourceState.generatedAt
    ? formatDashboardTimestamp(sourceState.generatedAt)
    : "Not verified";

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
  }> = [];

  if (runs.length) {
    kpis.push({
      id: "evals",
      insightId: "kpi-evals",
      label: "Evaluations Pending",
      value: evalsPending,
      unit: "families",
      sub: (
        <>
          Pipeline snapshot · awaiting <Gloss term="HDA">HDA</Gloss> phase labels
        </>
      ),
      delta: "Snapshot count",
      deltaKind: "flat",
      spark: [evalsPending],
      accent: "sand",
    });
  }

  if (stages.length) {
    kpis.push({
      id: "epochs",
      insightId: "kpi-epochs",
      label: <span><Gloss term="Epoch">Epochs</Gloss> Processed</span>,
      value: totals.done,
      unit: "windows",
      sub: (
        <>
          Pipeline snapshot · <Gloss term="Actiheart">Actiheart-5</Gloss> ECG windows
        </>
      ),
      delta: "Snapshot count",
      deltaKind: "flat",
      spark: [totals.done],
      accent: "ocean",
    });
  }

  if (redcapSummary.completionRate !== null) {
    kpis.push({
      id: "redcap",
      insightId: "kpi-redcap",
      label: <Gloss term="RedCap">REDCap Health</Gloss>,
      value: redcapSummary.completionRate,
      unit: "%",
      sub: `${sourceState.label} · aggregate form completion`,
      delta: redcapSummary.reviewCount !== null ? `${redcapSummary.reviewCount} need review` : "Review count unavailable",
      deltaKind: redcapSummary.reviewCount ? "down" : "flat",
      spark: [redcapSummary.completionRate],
      badge: sourceState.isLive ? `${redcapSummary.projectsOk}/${redcapSummary.projectsTotal}` : undefined,
      accent: "mint",
      decimals: 1,
    });
  }

  if (publicationsEnabled && pubSyncStatus) {
    kpis.push({
      id: "publications",
      insightId: "kpi-publications",
      label: "Publications",
      value: pubSyncStatus.total,
      unit: "indexed",
      sub: `Publication snapshot · ${pubSyncStatus.last_sync ?? "date unavailable"}`,
      delta: pubSyncStatus.new_this_week ? `+${pubSyncStatus.new_this_week} in snapshot` : "Snapshot count",
      deltaKind: "flat",
      spark: [pubSyncStatus.total],
      accent: "sage",
    });
  }

  return (
    <div className={`${styles.page} flex flex-col gap-7 p-9 max-[768px]:px-4 max-[768px]:py-6`}>
      <header className={styles.routeHeader}>
        <div>
          <div className={styles.eyebrow}>
            Five-study REDCap portfolio
          </div>
          <h1>Overview</h1>
          <p>
            {isPortfolio
              ? "Combined totals across every configured REDCap study."
              : `${scopeLabel} figures, sourced from its configured REDCap projects.`}
          </p>
        </div>
        <DataProvenance source={sourceState} />
      </header>

      {/* Study picker. Selecting a card rescopes every panel below it. */}
      {portfolioStudies.length ? (
        <section className={styles.studyPicker} aria-label="Select a study scope">
          {portfolioStudies.map((study) => {
            const isActive = scope === study.key.toLowerCase();
            return (
              <button
                key={study.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveStudy(study.key.toUpperCase() as typeof activeStudy)}
                className={styles.studyChip}
                data-active={isActive || undefined}
                data-insight={`portfolio-${study.key}`}
                data-insight-term={`${study.label} study`}
                data-insight-body={`Select to rescope this page to ${study.label}. Enrollment and form totals come from that study's configured REDCap projects only.`}
              >
                <span className={styles.studyChipLabel}>{study.label}</span>
                <strong className={styles.studyChipValue}>{formatMetric(study.enrollment)}</strong>
                <span className={styles.studyChipNote}>
                  {study.target != null ? `of ${study.target.toLocaleString()}` : "enrolled"}
                </span>
              </button>
            );
          })}
        </section>
      ) : (
        <DataProvenance label="Portfolio unavailable" detail="No verified study summaries are available." />
      )}

      {summaryCards.length ? (
        <section
          className={styles.summaryGrid}
          aria-label={`${scopeLabel} overview metrics`}
          data-tour="operator-kpis"
        >
          {summaryCards.map((card) => (
            <OverviewSummaryCard
              key={card.key}
              label={card.label}
              value={card.value}
              unit={card.unit}
              progress={card.progress}
              note={card.note}
              insight={card.insight}
            />
          ))}
          <article className={`${styles.summaryCard} ${styles.redcapCard} surface-card`} data-insight="kpi-redcap">
            <span className={styles.metricLabel}>REDCap sync</span>
            <div className={styles.healthValue}>
              {sourceState.isLive ? <span aria-hidden /> : null}
              {sourceState.label}
            </div>
            <p>
              {redcapSummary.projectsOk}/{redcapSummary.projectsTotal || "—"} projects · as of {overviewAsOf}
            </p>
          </article>
        </section>
      ) : (
        <DataProvenance
          label={`No verified ${scopeLabel} metrics`}
          detail="This study reported no aggregate totals in the current payload."
        />
      )}

      {unavailableCount > 0 && summaryCards.length ? (
        <p className={styles.suppressedNote}>
          {unavailableCount} further {unavailableCount === 1 ? "measure is" : "measures are"} not
          published for {scopeLabel} in the current aggregate payload.
        </p>
      ) : null}

      <RedcapProjectLinks metrics={dashboardMetrics.data} studyKey={scope} />

      {observedEvents.length ? (
        <section className={styles.operationsGrid} aria-label={`Observed ${scopeLabel} events`}>
          <article className={`${styles.operationsCard} surface-card`}>
            <div className={styles.panelHeading}>
              <h2>Observed {scopeLabel} events</h2>
              <p>Suppressed and unavailable small-cell counts are omitted.</p>
            </div>
            <div className={styles.funnelList}>
              {observedEvents.map((event, index, rows) => {
                const max = Math.max(...rows.map((row) => row.records), 1);
                const width = Math.max(3, event.records / max * 100);
                return (
                  <div className={styles.funnelRow} key={event.event}>
                    <span>{formatEventName(event.event)}</span>
                    <div aria-hidden><i style={{ width: `${width}%` }} data-tone={index < 2 ? "science" : "blue"} /></div>
                    <strong>{event.records.toLocaleString()}</strong>
                  </div>
                );
              })}
            </div>
          </article>
        </section>
      ) : null}

      <div className={styles.detailHeading}>
        <span>Research operations snapshots</span>
        <p>Pipeline, QA, participant, model, and publication panels below are separate snapshots, not live REDCap totals.</p>
      </div>

      <DataProvenance kind="snapshot" detail="Operational details below keep their existing source and are never labeled live." />

      {kpis.length ? <section
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
      </section> : null}

      {stages.length ? <section aria-label="Pipeline snapshot DAG" data-tour="operator-pipeline">
        <AnimatedDAG
          stages={stages}
          selected={selected}
          onSelect={setStage}
          syncing={syncing}
          syncTick={syncTick}
        />
      </section> : null}

      <ClusterOpsPanel />

      <DynamicsDiscovery />

      <section aria-label="Reading geography">
        <ReadingsGeoMap readings={liveReadings} loading={readingsLibrary.isLoading} />
      </section>

      <OverviewProgressRings study={scoped} />
    </div>
  );
}

function formatMetric(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString();
}

function formatEventName(value: string): string {
  return value
    .replace(/_arm_\d+$/i, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function OverviewProgressRings({ study }: { study: DashboardStudyMetrics | null }) {
  const enabled = useFeatureFlag("SWIMMER_PLOT");
  const redcapEnabled = useFeatureFlag("REDCAP_COMPLETENESS");
  const { data: swimmer } = useCohortSwimmer();
  const { data: ecg } = useEcgQualitySummary();
  const { data: redcap } = useRedcapCompleteness(redcapEnabled);
  const visitCompletion = swimmer?.data.length
    ? swimmer.data.reduce((sum, row) => sum + row.completionPct, 0) / swimmer.data.length
    : 0;
  const ecgPass = ecg?.data.find((row) => row.label.toLowerCase().includes("pass"))?.value ?? 0;
  const redcapRequired = redcap?.data.filter((row) => row.ndaRequired) ?? [];
  const redcapComplete = redcapRequired.length
    ? redcapRequired.reduce((sum, row) => sum + row.completenessPct, 0) / redcapRequired.length
    : 0;

  const rings = [
    ...(study?.enrollment !== null && study?.enrollment !== undefined && study.target
      ? [{ label: "Enrollment", value: study.enrollment / study.target * 100, sub: `${study.enrollment} / ${study.target}`, color: "var(--usc-garnet)" }]
      : []),
    ...(swimmer?.data.length
      ? [{ label: "Visit forms", value: visitCompletion, sub: "expected visits", color: "var(--blue)" }]
      : []),
    ...(ecg?.data.length
      ? [{ label: "ECG QC", value: ecgPass, sub: "pass rate", color: "var(--green)" }]
      : []),
    ...(redcapRequired.length
      ? [{ label: "NDA REDCap", value: redcapComplete, sub: "required forms", color: "var(--amber-warn)" }]
      : []),
  ];

  if (!enabled) return null;

  return (
    <section aria-label="Research progress summary">
      <Card pad={20}>
        <div className="mb-4">
          <SectionLabel>Research progress rings</SectionLabel>
          <div className="font-serif text-[18px] font-semibold text-[color:var(--warm-fg1)] mt-1">
            Authoritative enrollment and available research snapshots
          </div>
          <div className="mt-3">
            <DataProvenance kind="snapshot" detail="Enrollment comes from the central REDCap contract; any additional rings are operational snapshots." compact />
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
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
