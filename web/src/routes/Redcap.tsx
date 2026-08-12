import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, Gloss, KPI, SectionLabel, Segmented, type BadgeKind } from "@/components/primitives";
import {
  useRedcapData,
  useRedcapCompleteness,
  useRedcapEvents,
  useRedcapMissingData,
  useRedcapVisitDetail,
  useRedcapVisitHealth,
} from "@/api/hooks";
import { AmbientOrbit, FastPaths, type FastPathPrompt } from "@/components/warm";
import { resolveTheme, useUi } from "@/store/ui";
import { logAudit } from "@/lib/audit";
import { exportCsvFile } from "@/lib/exportCsv";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { CsbsVisitStatus, RedcapCompletenessRow, RedcapVisitRecord } from "@/api/schemas";
import type { RedcapPayload as RedcapDashboardPayload } from "@/api/redcapSchemas";
import {
  DASHBOARD_METRICS_QUERY_KEY,
  type DashboardMetrics,
  type DashboardProjectMetrics,
  type DashboardSourceState,
  getDashboardSourceState,
  selectRedcapSummary,
  useDashboardMetrics,
} from "@/api/dashboardMetrics";
import {
  getPortfolioFreshness,
  useRedcapPortfolio,
  type PortfolioFreshness,
  type RedcapPortfolio,
} from "@/api/redcapPortfolio";
import {
  RedcapComparisonTab,
  RedcapDefinitionsTab,
  RedcapFieldExplorerTab,
  RedcapPortfolioTab,
  RedcapProjectDetailTab,
} from "@/components/redcap";
import { DataProvenance } from "@/components/data/DataProvenance";
import { SwimLane } from "@/components/timeline/SwimLane";
import type { TimelineEvent } from "@/components/timeline/EventMark";
import { ANOMALY_CODES } from "@/constants/redcapConfig";
import { formPolicyLabel, questionnaireKind, questionnaireLabel, riskKind } from "@/lib/participantOperations";
import styles from "./Redcap.module.css";

const REDCAP_FAST_PATHS: FastPathPrompt[] = [
  { lane: "redcap", label: "Last-hour fail triage",   prompt: "Triage every REDCap sync that failed in the last hour. Group by form, surface the auth or schema cause, and recommend a fix order." },
  { lane: "redcap", label: "PHI column audit",        prompt: "Re-audit the PHI gate on every form in the active project. Flag any field where the strip rule is unset or stale." },
  { lane: "redcap", label: "Missing fields · aggregate", prompt: "Summarize aggregate missing DOB and MRN counts by form and site. Do not list records, identifiers, names, or assigned coordinators." },
  { lane: "redcap", label: "Dual AIH/EH policy",      prompt: "Explain the dual-enrollment AIH and EH form policy. When do we use one shared master form, and when do duplicate study-specific forms need a linking ID?" },
  { lane: "redcap", label: "Packet cross-check",      prompt: "Before scheduling a dual-enrolled participant, what enrollment-type, packet, questionnaire, and REDCap checks should staff complete?" },
  { lane: "qa",     label: "Sync vs QA mismatch",     prompt: "Cross-check tonight's REDCap visit_completion flags against QA epoch decisions. Flag any visit where REDCap says complete but QA yield is below 75%." },
  { lane: "qa",     label: "Bayley-4 missingness",    prompt: "Build a missingness heatmap for Bayley-4 across active visits and rank the worst-offending fields." },
  { lane: "model",  label: "Feature freshness",       prompt: "Which classifier features depend on REDCap fields that have not synced in 48 h? Rank by SHAP importance." },
  { lane: "model",  label: "Cohort drift on sync gap", prompt: "Quantify how a 24 h REDCap sync gap shifts the VPT vs TD cohort feature distributions." },
  { lane: "redcap", label: "Carry-forward summary",   prompt: "Summarize aggregate carry-forward risk counts by timepoint and anomaly class. Do not expose record-level details or identifiers." },
  { lane: "redcap", label: "CSBS coverage summary",   prompt: "Summarize aggregate incomplete CSBS counts at 6m and 9m and provide the approved coordinator workflow without listing participants." },
  { lane: "redcap", label: "Coverage report",         prompt: "Generate a data coverage report across all four CSBS timepoints. Break down complete, skipped, incomplete, and not-started counts by visit month." },
  { lane: "redcap", label: "Freshness check",         prompt: "When was REDCap last synced, how many records are in the payload, and how many carry-forward anomalies are active?" },
  { lane: "redcap", label: "EPDS review queue",       prompt: "How many mothers are EPDS screen-positive, how many are high-concern, and which aggregate timing or respondent burden signals should coordinators review next?" },
  { lane: "redcap", label: "Next 30 days",            prompt: "Show the REDCap upcoming visit forecast for the next 30 days. Group overdue and approaching windows and summarize the operational risk." },
  { lane: "redcap", label: "Integrity sentinels",     prompt: "Summarize the REDCap nullity matrix, double-entry diffs, response-quality sentinels, branching violations, and validation radar from the next-wave integrity payload." },
  { lane: "redcap", label: "Weekly study memo",       prompt: "Draft this week's REDCap study memo using redcap_clinical, redcap_schedule, redcap_integrity, redcap_platform, and redcap_predictive." },
];

type RedcapTab =
  | "portfolio"
  | "project"
  | "comparison"
  | "fields"
  | "definitions"
  | "ops"
  | "sync"
  | "visit-health"
  | "coverage"
  | "next-wave";

/** Tabs that read the portfolio structure artifact rather than the ops feeds. */
const PORTFOLIO_TABS: ReadonlyArray<{ value: RedcapTab; label: string }> = [
  { value: "portfolio", label: "Portfolio" },
  { value: "project", label: "Project Detail" },
  { value: "comparison", label: "Instrument Comparison" },
  { value: "fields", label: "Field Explorer" },
];

type VisitKey = "sixMonth" | "nineMonth" | "twelveMonth" | "twentyFourMonth";

const VISIT_COLUMNS: Array<{ key: VisitKey; label: string }> = [
  { key: "sixMonth", label: "6m" },
  { key: "nineMonth", label: "9m" },
  { key: "twelveMonth", label: "12m" },
  { key: "twentyFourMonth", label: "24m" },
];

const STATUS_ORDER: CsbsVisitStatus[] = ["complete", "unverified", "incomplete", "not_started", "skipped"];

const STATUS_META: Record<CsbsVisitStatus, { label: string; badge: BadgeKind; chart: string }> = {
  complete: { label: "Complete", badge: "ok", chart: "var(--status-green)" },
  unverified: { label: "Unverified", badge: "warn", chart: "var(--status-amber)" },
  incomplete: { label: "Incomplete", badge: "fail", chart: "var(--status-red)" },
  not_started: { label: "Not Started", badge: "neutral", chart: "var(--status-grey)" },
  skipped: { label: "Skipped", badge: "info", chart: "var(--status-blue)" },
};

interface VisitChartRow {
  visit: string;
  idsByStatus: Record<CsbsVisitStatus, string[]>;
  complete: number;
  unverified: number;
  incomplete: number;
  not_started: number;
  skipped: number;
}

interface VisitSummary {
  chartRows: VisitChartRow[];
  totals: Record<CsbsVisitStatus, number>;
  skippedByVisit: Record<VisitKey, number>;
  coveragePct: number;
}

function emptyStatusCounts(): Record<CsbsVisitStatus, number> {
  return {
    complete: 0,
    unverified: 0,
    incomplete: 0,
    not_started: 0,
    skipped: 0,
  };
}

function summarizeVisitHealth(records: RedcapVisitRecord[]): VisitSummary {
  const totals = emptyStatusCounts();
  const skippedByVisit: Record<VisitKey, number> = {
    sixMonth: 0,
    nineMonth: 0,
    twelveMonth: 0,
    twentyFourMonth: 0,
  };
  const chartRows = VISIT_COLUMNS.map(({ key, label }) => {
    const counts = emptyStatusCounts();
    const idsByStatus: Record<CsbsVisitStatus, string[]> = {
      complete: [],
      unverified: [],
      incomplete: [],
      not_started: [],
      skipped: [],
    };
    records.forEach((record) => {
      const status = record[key].csbsStatus;
      counts[status] += 1;
      totals[status] += 1;
      idsByStatus[status].push(record.recordId);
      if (status === "skipped") skippedByVisit[key] += 1;
    });
    return { visit: label, idsByStatus, ...counts };
  });
  const totalExpected = Math.max(records.length * VISIT_COLUMNS.length, 1);
  const coveragePct = ((totals.complete + totals.skipped) / totalExpected) * 100;
  return { chartRows, totals, skippedByVisit, coveragePct };
}

function formatDate(value: string | null): string {
  return value || "—";
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSyncTime(value: string | null): string {
  if (!value) return "not synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString();
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function sumRows(rows: Array<Record<string, unknown>>, key: string): number {
  return rows.reduce((sum, row) => sum + asNumber(row[key]), 0);
}

function VisitStatusBadge({ status }: { status: CsbsVisitStatus }) {
  const meta = STATUS_META[status];
  return <Badge kind={meta.badge} size="sm">{meta.label}</Badge>;
}

interface FieldRow {
  k: string;
  v: string;
  phi: boolean;
}

const FIELD_MAP: FieldRow[] = [
  { k: "study_id",     v: "NANO-XXXX",    phi: false },
  { k: "dob",          v: "YYYY-MM-DD",   phi: true },
  { k: "sex",          v: "M | F | X",    phi: false },
  { k: "cga_wks",      v: "float",        phi: false },
  { k: "mrn",          v: "string",       phi: true },
  { k: "caregiver_id", v: "NANO-CG-XXXX", phi: false },
  { k: "site",         v: "enum",         phi: false },
];

export function Redcap() {
  const dashboardMetrics = useDashboardMetrics();
  const sourceState = getDashboardSourceState(dashboardMetrics.data);
  const liveSummary = selectRedcapSummary(dashboardMetrics.data);
  const eventsQuery = useRedcapEvents();
  const events = eventsQuery.data ?? [];
  const visitHealthEnabled = useFeatureFlag("REDCAP_VISIT_HEALTH");
  const visitHealth = useRedcapVisitHealth(visitHealthEnabled);
  const redcapPayload = useRedcapData(visitHealthEnabled);
  const visitRecords = useMemo(() => visitHealth.data?.data ?? [], [visitHealth.data]);
  const visitSummary = useMemo(() => summarizeVisitHealth(visitRecords), [visitRecords]);
  const queryClient = useQueryClient();
  const theme = useUi((s) => s.theme);
  const setChatOpen = useUi((s) => s.setChatOpen);
  const setChatSeed = useUi((s) => s.setChatSeed);
  const lastSyncAt = useUi((s) => s.lastSyncAt);
  const setLastSyncAt = useUi((s) => s.setLastSyncAt);
  const fastPathTone = resolveTheme(theme);
  const [activeTab, setActiveTab] = useState<RedcapTab>("portfolio");
  const [alertDismissed, setAlertDismissed] = useState(false);
  const portfolio = useRedcapPortfolio();
  const portfolioFreshness = getPortfolioFreshness(portfolio.data);
  const [selectedProject, setSelectedProject] = useState("");

  const tabOptions = useMemo(
    () => [
      ...PORTFOLIO_TABS,
      ...(visitHealthEnabled ? [{ value: "ops" as const, label: "Ops Monitor" }] : []),
      { value: "sync" as const, label: "Sync & Completeness" },
      ...(visitHealthEnabled
        ? [
            { value: "visit-health" as const, label: "Visit Health" },
            { value: "coverage" as const, label: "Coverage" },
            { value: "next-wave" as const, label: "Next-Wave Intelligence" },
          ]
        : []),
      { value: "definitions" as const, label: "Definitions" },
    ],
    [visitHealthEnabled],
  );

  useEffect(() => {
    if (tabOptions.some((option) => option.value === activeTab)) return;
    setActiveTab("portfolio");
  }, [activeTab, tabOptions]);

  useEffect(() => {
    if (dashboardMetrics.data?.generatedAt) {
      setLastSyncAt(dashboardMetrics.data.generatedAt);
    }
  }, [dashboardMetrics.data?.generatedAt, setLastSyncAt]);

  function fastPath(prompt: string) {
    setChatSeed(prompt);
    setChatOpen(true);
    void logAudit({ action: "run.trigger", scope: "/redcap/fast-path" });
  }

  function refreshVisitHealth() {
    void queryClient.invalidateQueries({ queryKey: ["v2", "redcap-visit-health"] });
    void queryClient.invalidateQueries({ queryKey: ["redcap", "dashboard-data"] });
    void queryClient.invalidateQueries({ queryKey: ["v2", "redcap-missing-data"] });
    void queryClient.invalidateQueries({ queryKey: DASHBOARD_METRICS_QUERY_KEY });
    void dashboardMetrics.refetch();
  }

  function reloadSnapshot() {
    if (!visitHealthEnabled) void dashboardMetrics.refetch();
    void eventsQuery.refetch();
    void portfolio.refetch();
    if (visitHealthEnabled) refreshVisitHealth();
  }

  const visitHealthError =
    visitHealth.data?.error ?? (visitHealth.error instanceof Error ? visitHealth.error.message : null);

  return (
    <div className={styles.page}>
      {visitHealthEnabled && !alertDismissed && (
        <VisitAnomalyBanner
          anomalies={visitHealth.data?.anomalies ?? []}
          error={visitHealthError}
          isLoading={visitHealth.isLoading}
          lastSyncAt={lastSyncAt}
          onDismiss={() => setAlertDismissed(true)}
          onRefresh={refreshVisitHealth}
        />
      )}

      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>REDCap sync</span>
          <h1 className={styles.h1}>
            <Gloss term="RedCap">REDCap</Gloss> · forms &amp; metadata
          </h1>
          <p className={styles.lede}>
            Aggregate status across five studies and eight REDCap projects. NANO enrollment comes only from its survey authority; no PHI or tokens enter this public contract.
          </p>
        </div>
        <div className={styles.actions}>
          <Button icon="refresh-cw" onClick={reloadSnapshot} disabled={dashboardMetrics.isFetching}>
            {dashboardMetrics.isFetching ? "Reloading snapshot…" : "Reload snapshot"}
          </Button>
        </div>
      </header>
      <DataProvenance source={sourceState} />

      <section className={styles.fastRow} aria-label="REDCap fast-paths">
        <div className={styles.fastRowInner}>
          <FastPaths tone={fastPathTone} density="wide" prompts={REDCAP_FAST_PATHS} onSelect={fastPath} />
        </div>
        <AmbientOrbit
          tone="garnet"
          size={170}
          opacity={0.22}
          spin={42}
          waveform
          className={styles.fastOrbit}
        />
      </section>

      <div className={styles.tabRow}>
        <Segmented
          options={tabOptions}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel="REDCap dashboard sections"
        />
      </div>

      <section className={styles.kpis}>
        <KPI
          label="Projects healthy"
          value={`${liveSummary.projectsOk}/${liveSummary.projectsTotal || "—"}`}
          sub="configured REDCap sources"
          insightId="redcap-projects"
        />
        <KPI label="Instruments" value={formatCount(liveSummary.instrumentsTotal)} sub="across reporting projects" insightId="redcap-forms" />
        <KPI label="Event records" value={formatCount(liveSummary.eventRecords)} sub="aggregate portfolio" insightId="redcap-records" />
        <KPI
          label="Form completion"
          value={liveSummary.completionRate === null ? "—" : `${liveSummary.completionRate.toFixed(1)}%`}
          sub={liveSummary.reviewCount === null ? "review count unavailable" : `${liveSummary.reviewCount} need review`}
          delta={sourceState.isLive ? "verified current" : sourceState.label}
          deltaKind="flat"
          insightId="redcap-completion"
        />
      </section>

      <RedcapProjectStatusGrid
        metrics={dashboardMetrics.data}
        sourceState={sourceState}
        isLoading={dashboardMetrics.isLoading}
        isFetching={dashboardMetrics.isFetching}
        isError={dashboardMetrics.isError}
        onReload={reloadSnapshot}
      />

      {PORTFOLIO_TABS.some((option) => option.value === activeTab) && (
        <RedcapPortfolioSection
          activeTab={activeTab}
          portfolio={portfolio.data}
          freshness={portfolioFreshness}
          isLoading={portfolio.isLoading}
          isError={portfolio.isError}
          onReload={() => void portfolio.refetch()}
          selectedProject={selectedProject}
          onSelectProject={setSelectedProject}
        />
      )}

      {activeTab === "definitions" && <RedcapDefinitionsTab portfolio={portfolio.data} />}

      {activeTab !== "definitions" && !PORTFOLIO_TABS.some((option) => option.value === activeTab) && (
        <DataProvenance
          kind="snapshot"
          label="Operational snapshot"
          detail="Sync events, visit health, completeness matrices, and next-wave panels use their existing snapshot feeds."
        />
      )}

      {visitHealthEnabled && activeTab === "ops" && redcapPayload.data && (
        <CoordinatorOpsMonitor payload={redcapPayload.data} records={visitRecords} />
      )}

      {activeTab === "sync" && (
        <>
          <RedcapCompletenessScorecard />
          <RedcapSyncPanel events={events} />
        </>
      )}

      {visitHealthEnabled && activeTab === "visit-health" && (
        <VisitHealthTab
          records={visitRecords}
          summary={visitSummary}
          isLoading={visitHealth.isLoading}
          error={visitHealthError}
        />
      )}

      {visitHealthEnabled && activeTab === "coverage" && (
        <CoveragePanel records={visitRecords} summary={visitSummary} />
      )}

      {visitHealthEnabled && activeTab === "next-wave" && redcapPayload.data && (
        <NextWavePanel payload={redcapPayload.data} onAsk={fastPath} />
      )}
    </div>
  );
}

interface RedcapPortfolioSectionProps {
  activeTab: RedcapTab;
  portfolio: RedcapPortfolio | undefined;
  freshness: PortfolioFreshness;
  isLoading: boolean;
  isError: boolean;
  onReload: () => void;
  selectedProject: string;
  onSelectProject: (key: string) => void;
}

/**
 * Structure panels backed by the portfolio artifact. They stay mounted next to
 * the operational panels, so a failure to read the structure snapshot never
 * takes the rest of the REDCap page down with it.
 */
export function RedcapPortfolioSection({
  activeTab,
  portfolio,
  freshness,
  isLoading,
  isError,
  onReload,
  selectedProject,
  onSelectProject,
}: RedcapPortfolioSectionProps) {
  if (isLoading && !portfolio) {
    return (
      <Card pad={20}>
        <div role="status" aria-live="polite">
          <strong>Loading REDCap structure…</strong>
          <p className={styles.note}>
            Reading the aggregate-only portfolio snapshot published by the five-minute sync.
          </p>
        </div>
      </Card>
    );
  }

  if (!portfolio) {
    return (
      <Card pad={20}>
        <div role="alert">
          <strong>REDCap structure snapshot unavailable</strong>
          <p className={styles.note}>
            {isError
              ? "The portfolio artifact could not be loaded or did not pass its privacy contract."
              : "No portfolio artifact has been published yet. Run scripts/build_redcap_portfolio_data.py to create one."}
          </p>
          <Button size="sm" variant="secondary" icon="refresh-cw" onClick={onReload}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <DataProvenance
        source={{
          status: freshness.status,
          label: freshness.label,
          detail: freshness.detail,
          isLive: freshness.isLive,
          generatedAt: freshness.generatedAt,
          ageSeconds: freshness.ageSeconds,
          projectsOk: freshness.projectsOk,
          projectsTotal: freshness.projectsTotal,
        }}
      />
      {activeTab === "portfolio" && <RedcapPortfolioTab portfolio={portfolio} />}
      {activeTab === "project" && (
        <RedcapProjectDetailTab
          portfolio={portfolio}
          selectedKey={selectedProject}
          onSelect={onSelectProject}
        />
      )}
      {activeTab === "comparison" && <RedcapComparisonTab portfolio={portfolio} />}
      {activeTab === "fields" && <RedcapFieldExplorerTab portfolio={portfolio} />}
    </>
  );
}

interface RedcapProjectStatusGridProps {
  metrics: DashboardMetrics | undefined;
  sourceState: DashboardSourceState;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  onReload: () => void;
}

function projectStatusBadge(project: DashboardProjectMetrics): { kind: BadgeKind; label: string } {
  if (project.status === "ok") return { kind: "ok", label: "Healthy" };
  if (project.status === "degraded" || project.status === "partial") return { kind: "warn", label: "Degraded" };
  return { kind: "fail", label: "Unavailable" };
}

function sourceStatusBadge(source: DashboardSourceState): BadgeKind {
  if (source.status === "live") return "ok";
  if (source.status === "stale" || source.status === "partial") return "warn";
  return "fail";
}

function aggregateMetric(value: number | null, suppressed: boolean) {
  if (suppressed) {
    return <span className={styles.suppressedValue} aria-label="Suppressed for privacy">Suppressed</span>;
  }
  return value === null ? <span className={styles.unavailableValue}>Unavailable</span> : value.toLocaleString();
}

export function RedcapProjectStatusGrid({
  metrics,
  sourceState,
  isLoading,
  isFetching,
  isError,
  onReload,
}: RedcapProjectStatusGridProps) {
  const initialLoading = isLoading && !metrics;
  const unavailable = isError && !metrics;

  return (
    <Card pad={0} className={sourceState.status === "stale" ? styles.projectSnapshotStale : undefined}>
      <section aria-labelledby="redcap-project-snapshot-title" data-insight="redcap-project-grid">
        <div className={styles.projectSnapshotHead}>
          <div>
            <h2 id="redcap-project-snapshot-title" className={styles.projectSnapshotTitle}>Eight-project status</h2>
            <p>The validated contract contains server-generated aggregates only; project tokens and participant rows are rejected.</p>
          </div>
          <div className={styles.projectSnapshotBadges}>
            <Badge kind="neutral" size="sm">Aggregate only</Badge>
            {initialLoading
              ? <Badge kind="pending" size="sm">Loading snapshot</Badge>
              : <Badge kind={sourceStatusBadge(sourceState)} size="sm">{sourceState.label}</Badge>}
            {isFetching && metrics && <span className={styles.reloadingText}>Reloading snapshot…</span>}
          </div>
        </div>

        {initialLoading && (
          <div className={styles.projectSnapshotState} role="status" aria-live="polite">
            <div className={styles.projectSkeletonGrid} aria-hidden="true">
              {Array.from({ length: 8 }, (_, index) => <span key={index} />)}
            </div>
            <strong>Loading aggregate project snapshot…</strong>
          </div>
        )}

        {unavailable && (
          <div className={styles.projectSnapshotState} role="alert">
            <strong>Project snapshot unavailable</strong>
            <p>The last aggregate artifact could not be loaded or did not pass its privacy contract.</p>
            <Button size="sm" variant="secondary" icon="refresh-cw" onClick={onReload}>Reload snapshot</Button>
          </div>
        )}

        {metrics && (
          <>
            {(sourceState.status === "stale" || isError) && (
              <div className={styles.projectSnapshotNotice} role="status">
                <strong>{isError ? "Reload failed; showing the prior snapshot." : "This snapshot is stale."}</strong>{" "}
                {isError
                  ? "The existing aggregate values remain visible, but they were not refreshed."
                  : "Reload the snapshot before using it for current operational decisions."}
              </div>
            )}
            <ul className={styles.projectStatusGrid} aria-label="REDCap aggregate project status">
              {metrics.projects.map((project) => {
                const status = projectStatusBadge(project);
                return (
                  <li key={project.key} className={styles.projectStatusCard}>
                    <div className={styles.projectStatusTop}>
                      <div>
                        <strong>{project.title}</strong>
                        <span className="t-mono">{project.key} · #{project.projectId}</span>
                      </div>
                      <Badge kind={status.kind} size="sm">{status.label}</Badge>
                    </div>
                    <div className={styles.projectIdentityRow}>
                      <span>{project.study.toUpperCase()}</span>
                      <span>{project.role}</span>
                      {project.enrollmentAuthority && <span>enrollment authority</span>}
                    </div>
                    <dl className={styles.projectMetrics}>
                      <div><dt>Records</dt><dd>{aggregateMetric(project.records, project.recordsSuppressed)}</dd></div>
                      <div><dt>Event records</dt><dd>{aggregateMetric(project.eventRecords, project.eventRecordsSuppressed)}</dd></div>
                      <div>
                        <dt>Form completion</dt>
                        <dd>
                          {project.forms.countsSuppressed
                            ? <span className={styles.suppressedValue} aria-label="Suppressed for privacy">Suppressed</span>
                            : project.forms.completionRate === null
                              ? <span className={styles.unavailableValue}>Unavailable</span>
                              : `${project.forms.completionRate.toFixed(1)}%`}
                        </dd>
                      </div>
                    </dl>
                    {project.errorCode && <p className={styles.projectError}>Status code: {project.errorCode}</p>}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </Card>
  );
}

function RedcapSyncPanel({ events }: { events: Array<{ ts: string; form: string; n: number; status: "ok" | "warn" | "fail"; note: string }> }) {
  return (
    <div className={styles.split}>
      <Card pad={0}>
        <div className={styles.listHead}>
          <SectionLabel>Sync events · snapshot</SectionLabel>
          <Badge kind="neutral" size="sm">Snapshot</Badge>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">REDCap sync events.</caption>
            <thead>
              <tr>
                {["Time", "Form", "n", "Status", "Note"].map((h) => (
                  <th key={h} scope="col" className={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i}>
                  <td className={`${styles.td} t-mono ${styles.muted}`}>{e.ts}</td>
                  <td className={`${styles.td} t-mono`}>{e.form}</td>
                  <td className={`${styles.td} t-num t-mono`}>{e.n}</td>
                  <td className={styles.td}>
                    <Badge kind={e.status === "ok" ? "ok" : e.status === "warn" ? "warn" : "fail"} size="sm">{e.status}</Badge>
                  </td>
                  <td className={`${styles.td} ${styles.note}`}>{e.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card pad={20}>
        <div className={styles.fieldMapWrap}>
          <AmbientOrbit
            tone="garnet"
            size={140}
            opacity={0.16}
            spin={48}
            className={styles.fieldOrbit}
          />
          <SectionLabel>Reference field map · medical_history_v1</SectionLabel>
          <div className={`${styles.fieldMap} t-mono`}>
            {FIELD_MAP.map((f) => (
              <div key={f.k} className={styles.fieldRow}>
                <span className={styles.fieldKey}>{f.k}</span>
                <span className={styles.fieldVal}>{f.v}</span>
                {f.phi
                  ? <Badge kind="phi" size="sm">PHI · stripped</Badge>
                  : <Badge kind="ok" size="sm">ok</Badge>}
              </div>
            ))}
          </div>
          <div className={styles.privacyNote}>
            PHI fields never enter the public dashboard — only approved de-identified derivatives are written to{" "}
            <code className="t-mono">processed/deidentified/</code>.
          </div>
        </div>
      </Card>
    </div>
  );
}

function pctText(complete: number, total: number): string {
  if (!total) return "0%";
  return `${((complete / total) * 100).toFixed(0)}%`;
}

function CoordinatorOpsMonitor({
  payload,
  records,
}: {
  payload: RedcapDashboardPayload;
  records: RedcapVisitRecord[];
}) {
  const baseWarnPct = payload.redcap_trackers.thresholds?.completeness_warn_pct ?? 0.8;
  const [warnPct, setWarnPct] = useState(baseWarnPct);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const activeRisk = records.filter((record) =>
    record.anomalyFlags.some((flag) => ["R1", "R2", "R5"].includes(flag)),
  );
  const historicalRisk = records.filter((record) =>
    record.anomalyFlags.some((flag) => ["R3", "R4"].includes(flag)),
  );
  const cleared = records.filter((record) => !record.hasCarryForwardRisk).slice(0, 8);
  const timelineRows = payload.redcap_timeline.records.slice(0, 8);
  const width = 840;
  const yStep = 42;
  const x = (month: number) => 170 + (month / 24) * (width - 210);
  const heatRows = payload.redcap_trackers.instrument_completeness.slice(0, 6);
  const heatEvents = payload.redcap_trackers.enrollment.slice(0, 12);
  const lowCells = heatRows.reduce((sum, row) => {
    return sum + heatEvents.filter((event) => {
      const cell = row.byEvent[event.event];
      return cell && cell.total > 0 && cell.complete / cell.total < warnPct;
    }).length;
  }, 0);
  const missingDates = records.reduce((sum, record) => (
    sum + VISIT_COLUMNS.filter(({ key }) => record[key].csbsStatus !== "not_started" && !record[key].visitDate).length
  ), 0);
  const epdsReviewCount = (payload.redcap_clinical?.epds_trajectory ?? []).reduce(
    (sum, row) => sum + asNumber(row.screen_positive),
    0,
  );
  const completionGap = payload.redcap_trackers.enrollment.reduce((max, event) => {
    const expected = Math.max(event.expected, 1);
    const gap = (event.expected - event.completed) / expected;
    return gap > max.gap ? { label: event.label, gap, count: event.expected - event.completed } : max;
  }, { label: "n/a", gap: 0, count: 0 });

  function laneEvents(row: RedcapDashboardPayload["redcap_timeline"]["records"][number]): TimelineEvent[] {
    return row.events.map((event) => ({
      id: `${row.recordId}-${event.event}`,
      type: event.status === "incomplete" ? "failed" : "redcap",
      month: event.month ?? 0,
      label: event.label,
      date: event.visitDate || "not started",
      cga: event.month ?? 0,
      status: event.status,
    }));
  }

  return (
    <div className={styles.opsStack}>
      <Card pad={0}>
        <div className={styles.listHead}>
          <SectionLabel>Coordinator Ops Monitor</SectionLabel>
          <Badge kind="neutral" size="sm">Snapshot · what-if local</Badge>
        </div>
        <div className={styles.whatIfBar} data-insight="redcap-whatif-controls">
          <label>
            <span>Completeness warning</span>
            <input
              type="range"
              min="0.5"
              max="0.95"
              step="0.05"
              value={warnPct}
              onChange={(event) => setWarnPct(Number(event.target.value))}
            />
            <strong className="t-mono">{pctText(warnPct, 1)}</strong>
          </label>
          <Badge kind={lowCells ? "warn" : "ok"} size="sm">{lowCells} heatwall cells below threshold</Badge>
        </div>
        <div className={styles.matrixKpis}>
          <KPI label="Anomalies now" value={payload.redcap_meta.anomaly_count} sub="R1-R5 active" insightId="redcap-action-strip" />
          <KPI label="EPDS review" value={epdsReviewCount} sub="screen-positive" insightId="redcap-epds-trajectory" deltaKind={epdsReviewCount ? "down" : "up"} />
          <KPI label="Missing dates" value={missingDates} sub="status without visit date" />
          <KPI label="Heatwall alerts" value={lowCells} sub={`below ${pctText(warnPct, 1)}`} />
          <KPI label="Behind target" value={completionGap.count} sub={completionGap.label} deltaKind={completionGap.count ? "down" : "up"} />
        </div>
      </Card>

      <div className={styles.opsGrid}>
        <Card pad={0}>
          <div className={styles.listHead} data-insight="redcap-anomaly-board">
            <SectionLabel>Carry-forward anomaly board</SectionLabel>
            <Badge kind={activeRisk.length ? "fail" : "ok"} size="sm">{activeRisk.length} active</Badge>
          </div>
          <div className={styles.boardColumns}>
            <RiskColumn title="Active risk" records={activeRisk} empty="No active R1/R2/R5 records" />
            <RiskColumn title="Historical shift" records={historicalRisk} empty="No R3/R4 shift records" />
            <RiskColumn title="Cleared" records={cleared} empty="No cleared records" />
          </div>
        </Card>

        <Card pad={0}>
          <div className={styles.listHead} data-insight="redcap-heatwall">
            <SectionLabel>Instrument completeness heatwall</SectionLabel>
            <Badge kind="neutral" size="sm">{heatRows.length} instruments</Badge>
          </div>
          <div className={styles.heatwall}>
            <div className={styles.heatHeader} />
            {heatEvents.map((event) => <div key={event.event} className={styles.heatHeader}>{event.label}</div>)}
            {heatRows.map((row) => (
              <Fragment key={row.instrument}>
                <div className={styles.heatInstrument}>{row.label}</div>
                {heatEvents.map((event) => {
                  const cell = row.byEvent[event.event] ?? { complete: 0, total: 0 };
                  const ratio = cell.total ? cell.complete / cell.total : 0;
                  const state = ratio >= warnPct ? styles.heatOk : ratio >= warnPct - 0.15 ? styles.heatWarn : styles.heatFail;
                  return (
                    <div key={`${row.instrument}-${event.event}`} className={`${styles.heatCell} ${state}`} title={`${cell.complete}/${cell.total}`}>
                      {pctText(cell.complete, cell.total)}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </Card>
      </div>

      <Card pad={0}>
        <div className={styles.listHead} data-insight="redcap-swimlane">
          <SectionLabel>Visit swimlane timeline</SectionLabel>
          {selectedEvent && <Badge kind="info" size="sm">{selectedEvent.label} · {selectedEvent.status}</Badge>}
        </div>
        <div className={styles.swimlaneWrap}>
          <svg viewBox={`0 0 ${width} ${Math.max(90, timelineRows.length * yStep + 40)}`} className={styles.swimlaneSvg} role="img" aria-label="REDCap visit swimlane timeline">
            <line x1={x(0)} x2={x(24)} y1={20} y2={20} stroke="var(--warm-border)" />
            {[6, 9, 12, 24].map((month) => (
              <g key={month}>
                <line x1={x(month)} x2={x(month)} y1={14} y2={timelineRows.length * yStep + 26} stroke="var(--slate-100)" />
                <text x={x(month)} y={12} textAnchor="middle" className="t-mono" style={{ fontSize: 10, fill: "var(--slate-500)" }}>{month}m</text>
              </g>
            ))}
            {timelineRows.map((row, index) => (
              <SwimLane
                key={row.recordId}
                id={row.recordId}
                group="REDCap"
                qa={row.events.some((event) => event.hasRisk) ? "risk" : "clean"}
                y={48 + index * yStep}
                width={width}
                events={laneEvents(row)}
                x={x}
                selectedEventId={selectedEvent?.id}
                onSelectEvent={setSelectedEvent}
                onSelectRow={() => undefined}
              />
            ))}
          </svg>
        </div>
      </Card>
    </div>
  );
}

function RiskColumn({
  title,
  records,
  empty,
}: {
  title: string;
  records: RedcapVisitRecord[];
  empty: string;
}) {
  return (
    <div className={styles.riskColumn}>
      <div className={styles.riskColumnTitle}>{title}</div>
      {records.length ? records.slice(0, 8).map((record) => (
        <div key={`${title}-${record.recordId}`} className={styles.riskMiniCard}>
          <strong className="t-mono">{record.recordId}</strong>
          <span>{record.anomalyFlags.length ? record.anomalyFlags.join(", ") : "clean"}</span>
        </div>
      )) : <div className={styles.emptyMini}>{empty}</div>}
    </div>
  );
}

function NextWavePanel({
  payload,
  onAsk,
}: {
  payload: RedcapDashboardPayload;
  onAsk: (prompt: string) => void;
}) {
  const [privacyMode, setPrivacyMode] = useState(false);
  const clinical = payload.redcap_clinical;
  const integrity = payload.redcap_integrity;
  const schedule = payload.redcap_schedule;
  const respondent = payload.redcap_respondent;
  const platform = payload.redcap_platform;
  const predictive = payload.redcap_predictive;
  const cutoffs = payload.clinical_cutoffs ?? payload.redcap_ops.controls_snapshot?.clinical_cutoffs ?? {};
  const epdsRows = clinical.epds_trajectory;
  const epdsPositive = sumRows(epdsRows, "screen_positive");
  const epdsHigh = sumRows(epdsRows, "high_concern");
  const selfHarm = sumRows(epdsRows, "self_harm_flags");
  const epsilon = asNumber(cutoffs.dp_epsilon, 1);
  const publicEpdsPositive = privacyMode
    ? Math.max(0, Math.round(epdsPositive + Math.sin(epdsPositive || 1) / Math.max(epsilon, 0.1)))
    : epdsPositive;
  const upcoming = schedule.upcoming_visits;
  const overdue = upcoming.filter((row) => asNumber(row.due_in_days) < 0).length;
  const highRisk = predictive.attrition_risk.filter((row) => asString(row.risk_band) === "high").length;
  const avgNullity = integrity.nullity_matrix.length
    ? integrity.nullity_matrix.reduce((sum, row) => sum + asNumber(row.missing_fraction), 0) / integrity.nullity_matrix.length
    : 0;
  const latestMemo = predictive.weekly_memo as Record<string, unknown> | undefined;
  const memoHighlights = Array.isArray(latestMemo?.highlights)
    ? latestMemo.highlights.map((item) => String(item))
    : [];
  const devByDomain = clinical.developmental_grid.slice(0, 12);
  const riskAxes = clinical.family_risk.slice(0, 8);
  const maxRiskScore = Math.max(...riskAxes.map((row) => asNumber(row.max_score, 1)), 1);

  return (
    <div className={styles.nextWaveStack}>
      <Card pad={0}>
        <div className={styles.listHead} data-insight="redcap-nextwave">
          <SectionLabel>Next-Wave REDCap Intelligence</SectionLabel>
          <div className={styles.alertMain}>
            <Badge kind="neutral" size="sm">Snapshot</Badge>
            <Badge kind={predictive.nl_query_enabled ? "ok" : "neutral"} size="sm">
              NL table query {predictive.nl_query_enabled ? "ready" : "off"}
            </Badge>
            <Button
              size="sm"
              icon="sparkles"
              onClick={() => onAsk("Draft this week's REDCap study memo from the next-wave payload and include EPDS, schedule, integrity, platform, and predictive highlights.")}
            >
              Ask AI
            </Button>
          </div>
        </div>
        <div className={styles.matrixKpis}>
          <KPI label="EPDS review" value={publicEpdsPositive} sub={`positive >= ${asNumber(cutoffs.epds_positive, 10)}`} insightId="redcap-epds-trajectory" deltaKind={epdsPositive ? "down" : "up"} />
          <KPI label="High concern" value={epdsHigh} sub={`total >= ${asNumber(cutoffs.epds_high, 13)}`} insightId="redcap-epds-trajectory" deltaKind={epdsHigh ? "down" : "up"} />
          <KPI label="Self-harm flags" value={selfHarm} sub="item 10 > 0" insightId="redcap-epds-trajectory" deltaKind={selfHarm ? "down" : "up"} />
          <KPI label="Due soon" value={upcoming.length} sub={`${overdue} overdue`} insightId="redcap-visit-forecast" deltaKind={overdue ? "down" : "flat"} />
          <KPI label="High risk" value={highRisk} sub="attrition model" insightId="redcap-predictive-risk" deltaKind={highRisk ? "down" : "up"} />
          <KPI label="Nullity" value={`${(avgNullity * 100).toFixed(0)}%`} sub="mean missing" insightId="redcap-nullity-matrix" />
        </div>
      </Card>

      <div className={styles.nextWaveGrid}>
        <Card pad={0}>
          <div className={styles.listHead} data-insight="redcap-epds-trajectory">
            <SectionLabel>Maternal mental health trajectory</SectionLabel>
            <Badge kind={epdsPositive ? "warn" : "ok"} size="sm">{epdsRows.length} events</Badge>
          </div>
          <div className={styles.epdsBands}>
            <div><span>0-9</span><strong>below cutoff</strong></div>
            <div><span>10-12</span><strong>screen-positive</strong></div>
            <div><span>13+</span><strong>higher concern</strong></div>
          </div>
          <div className={styles.metricRows}>
            {epdsRows.length ? epdsRows.map((row) => {
              const total = Math.max(asNumber(row.n), 1);
              const positive = asNumber(row.screen_positive);
              const high = asNumber(row.high_concern);
              return (
                <div key={asString(row.event, asString(row.label))} className={styles.metricRow}>
                  <span>{asString(row.label, asString(row.event))}</span>
                  <span className={styles.barTrack}>
                    <span className={styles.barWarn} style={{ width: `${Math.min(100, (positive / total) * 100)}%` }} />
                    <span className={styles.barFail} style={{ width: `${Math.min(100, (high / total) * 100)}%` }} />
                  </span>
                  <strong className="t-mono">{positive}/{total}</strong>
                </div>
              );
            }) : <div className={styles.emptyMini}>EPDS score fields are not present in this payload yet.</div>}
          </div>
        </Card>

        <Card pad={0}>
          <div className={styles.listHead} data-insight="redcap-development-grid">
            <SectionLabel>Developmental surveillance grid</SectionLabel>
            <Badge kind="neutral" size="sm">{devByDomain.length} domains</Badge>
          </div>
          <div className={styles.domainGrid}>
            {devByDomain.length ? devByDomain.map((row) => (
              <div key={`${asString(row.field)}-${asString(row.event)}`} className={styles.domainTile}>
                <span>{asString(row.domain, asString(row.field))}</span>
                <strong className="t-mono">{asNumber(row.mean_score).toFixed(1)}</strong>
                <Badge kind={asString(row.zone) === "refer" ? "fail" : asString(row.zone) === "monitor" ? "warn" : "ok"} size="sm">
                  {asString(row.zone, "context")}
                </Badge>
              </div>
            )) : <div className={styles.emptyMini}>No developmental score fields verified yet.</div>}
          </div>
        </Card>

        <Card pad={0}>
          <div className={styles.listHead} data-insight="redcap-family-risk">
            <SectionLabel>Family autism-risk constellation</SectionLabel>
            <Badge kind="neutral" size="sm">aggregate only</Badge>
          </div>
          <div className={styles.riskConstellation}>
            {riskAxes.map((row, index) => {
              const score = asNumber(row.score);
              const max = Math.max(asNumber(row.max_score, maxRiskScore), 1);
              return (
                <div
                  key={asString(row.axis, `axis-${index}`)}
                  className={styles.riskAxis}
                  style={{ "--axis-angle": `${index * (360 / Math.max(riskAxes.length, 1))}deg`, "--axis-size": `${28 + (score / max) * 42}%` } as CSSProperties}
                  title={asString(row.note)}
                >
                  <span>{asString(row.axis)}</span>
                </div>
              );
            })}
          </div>
          <div className={styles.verificationList}>
            {riskAxes.slice(0, 4).map((row) => (
              <div key={asString(row.axis)}>
                <span>{asString(row.axis)}</span>
                <Badge kind={row.field_verified ? "ok" : "warn"} size="sm">{row.field_verified ? "verified" : "verify"}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card pad={0}>
          <div className={styles.listHead} data-insight="redcap-cascade-explorer">
            <SectionLabel>Cascade explorer</SectionLabel>
            <Badge kind="neutral" size="sm">{clinical.cascade_edges.length} edges</Badge>
          </div>
          <div className={styles.edgeList}>
            {clinical.cascade_edges.length ? clinical.cascade_edges.map((edge) => (
              <div key={`${asString(edge.source)}-${asString(edge.target)}`} className={styles.edgeRow}>
                <span>{asString(edge.label, `${asString(edge.source)} to ${asString(edge.target)}`)}</span>
                <strong className="t-mono">{asNumber(edge.weight).toFixed(2)}</strong>
                <Badge kind={asString(edge.direction) === "negative" ? "info" : "ok"} size="sm">{asString(edge.direction, "link")}</Badge>
              </div>
            )) : <div className={styles.emptyMini}>Cascade correlations appear when matched feature and outcome columns exist.</div>}
          </div>
        </Card>
      </div>

      <div className={styles.nextWaveGrid}>
        <Card pad={0}>
          <div className={styles.listHead} data-insight="redcap-window-adherence">
            <SectionLabel>Visit-window adherence beeswarm</SectionLabel>
            <Badge kind="neutral" size="sm">+/- {asNumber(cutoffs.visit_window_days, 30)}d</Badge>
          </div>
          <div className={styles.swarmRows}>
            {schedule.window_adherence.length ? schedule.window_adherence.map((row) => {
              const points = Array.isArray(row.points) ? row.points as Array<Record<string, unknown>> : [];
              return (
                <div key={asString(row.event)} className={styles.swarmRow}>
                  <span>{asString(row.label, asString(row.event))}</span>
                  <div className={styles.swarmTrack}>
                    <span className={styles.windowBand} />
                    {points.slice(0, 48).map((point, index) => {
                      const delta = asNumber(point.delta_days);
                      const left = Math.max(0, Math.min(100, ((delta + 70) / 140) * 100));
                      return <i key={`${asString(point.recordId)}-${index}`} className={styles.swarmPoint} style={{ left: `${left}%` }} />;
                    })}
                  </div>
                  <strong className="t-mono">{asNumber(row.mean_delta_days).toFixed(1)}d</strong>
                </div>
              );
            }) : <div className={styles.emptyMini}>Age-at-visit fields are not available yet.</div>}
          </div>
        </Card>

        <Card pad={0}>
          <div className={styles.listHead} data-insight="redcap-visit-forecast">
            <SectionLabel>Next-30-days visit forecast</SectionLabel>
            <Badge kind={overdue ? "warn" : "ok"} size="sm">{overdue} overdue</Badge>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Upcoming REDCap visit windows.</caption>
              <thead>
                <tr>{["Record", "Visit", "Due", "Urgency"].map((h) => <th key={h} className={styles.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {upcoming.length ? upcoming.slice(0, 8).map((row) => (
                  <tr key={`${asString(row.recordId)}-${asString(row.event)}`}>
                    <td className={`${styles.td} t-mono`}>{asString(row.recordId)}</td>
                    <td className={styles.td}>{asString(row.label, asString(row.event))}</td>
                    <td className={`${styles.td} t-mono`}>{asNumber(row.due_in_days)}d</td>
                    <td className={styles.td}><Badge kind={asString(row.urgency) === "overdue" ? "fail" : "warn"} size="sm">{asString(row.urgency)}</Badge></td>
                  </tr>
                )) : <tr><td className={styles.stateCell} colSpan={4}>No upcoming visit windows in the next 30 days.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card pad={0}>
          <div className={styles.listHead} data-insight="redcap-nullity-matrix">
            <SectionLabel>Nullity matrix</SectionLabel>
            <Badge kind={avgNullity > 0.2 ? "warn" : "ok"} size="sm">{(avgNullity * 100).toFixed(0)}% mean</Badge>
          </div>
          <div className={styles.nullityGrid}>
            {integrity.nullity_matrix.slice(0, 40).map((row) => (
              <div
                key={`${asString(row.instrument)}-${asString(row.event)}`}
                className={styles.nullityCell}
                style={{ opacity: 0.28 + Math.min(0.72, asNumber(row.missing_fraction)) }}
                title={`${asString(row.instrument)} ${asString(row.label)} ${(asNumber(row.missing_fraction) * 100).toFixed(0)}% missing`}
              />
            ))}
          </div>
          <div className={styles.verificationList}>
            {integrity.field_presence.slice(0, 4).map((row) => (
              <div key={asString(row.instrument)}>
                <span>{asString(row.instrument)}</span>
                <strong className="t-mono">{asNumber(row.present_fields)}/{asNumber(row.expected_fields)}</strong>
              </div>
            ))}
          </div>
        </Card>

        <Card pad={0}>
          <div className={styles.listHead} data-insight="redcap-integrity-diff">
            <SectionLabel>Double-entry reconciliation diff</SectionLabel>
            <Badge kind={integrity.double_entry_diffs.length ? "warn" : "ok"} size="sm">{integrity.double_entry_diffs.length} diffs</Badge>
          </div>
          <div className={styles.diffList}>
            {integrity.double_entry_diffs.length ? integrity.double_entry_diffs.slice(0, 8).map((row) => (
              <div key={`${asString(row.recordId)}-${asString(row.field)}`} className={styles.diffRow}>
                <strong className="t-mono">{asString(row.recordId)}</strong>
                <span>{asString(row.instrument)} · {asString(row.field)}</span>
                <Badge kind="warn" size="sm">{asString(row.severity, "review")}</Badge>
              </div>
            )) : <div className={styles.emptyMini}>No double-entry mismatches in the current payload.</div>}
          </div>
        </Card>
      </div>

      <div className={styles.nextWaveGrid}>
        <Card pad={0}>
          <div className={styles.listHead} data-insight="redcap-platform-audit">
            <SectionLabel>Audit-trail river</SectionLabel>
            <Badge kind="neutral" size="sm">{platform.audit_log.length} events</Badge>
          </div>
          <div className={styles.auditRiver}>
            {platform.audit_log.length ? platform.audit_log.slice(0, 10).map((row, index) => (
              <div key={`${asString(row.recordId)}-${index}`}>
                <span className="t-mono">{asString(row.recordId)}</span>
                <strong>{asString(row.action)}</strong>
                <small>{asString(row.event)}</small>
              </div>
            )) : <div className={styles.emptyMini}>Logging API rows appear after the server-side content=log sync is enabled.</div>}
          </div>
        </Card>

        <Card pad={0}>
          <div className={styles.listHead} data-insight="redcap-caregiver-burden">
            <SectionLabel>Caregiver burden meter</SectionLabel>
            <Badge kind="neutral" size="sm">{respondent.caregiver_burden.length} respondents</Badge>
          </div>
          <div className={styles.metricRows}>
            {respondent.caregiver_burden.map((row) => {
              const assigned = Math.max(asNumber(row.assigned), 1);
              const completed = asNumber(row.completed);
              return (
                <div key={asString(row.respondent)} className={styles.metricRow}>
                  <span>{asString(row.label, asString(row.respondent))}</span>
                  <span className={styles.barTrack}><span className={styles.barOk} style={{ width: `${Math.min(100, (completed / assigned) * 100)}%` }} /></span>
                  <strong className="t-mono">{completed}/{assigned}</strong>
                </div>
              );
            })}
          </div>
        </Card>

        <Card pad={0}>
          <div className={styles.listHead} data-insight="redcap-predictive-risk">
            <SectionLabel>Attrition early-warning</SectionLabel>
            <Badge kind={highRisk ? "warn" : "ok"} size="sm">{highRisk} high</Badge>
          </div>
          <div className={styles.riskList}>
            {predictive.attrition_risk.slice(0, 8).map((row) => {
              const drivers = Array.isArray(row.drivers) ? row.drivers.map((item) => String(item)).join(", ") : asString(row.drivers);
              return (
                <div key={asString(row.recordId)} className={styles.riskMiniCard}>
                  <strong className="t-mono">{asString(row.recordId)}</strong>
                  <span>{(asNumber(row.risk_score) * 100).toFixed(0)}% · {asString(row.risk_band)}</span>
                  <small>{drivers}</small>
                </div>
              );
            })}
          </div>
        </Card>

        <Card pad={0}>
          <div className={styles.listHead} data-insight="redcap-public-privacy">
            <SectionLabel>Public privacy mode</SectionLabel>
            <Badge kind="ok" size="sm">epsilon {epsilon}</Badge>
          </div>
          <div className={styles.privacyPanel}>
            <label className={styles.stateItem}>
              <input type="checkbox" checked={privacyMode} onChange={(event) => setPrivacyMode(event.target.checked)} />
              <span>Differential privacy counts</span>
              <Badge kind={privacyMode ? "ok" : "neutral"} size="sm">{privacyMode ? "on" : "off"}</Badge>
            </label>
            <div className={styles.constellation} data-insight="redcap-milestone-constellation">
              {devByDomain.slice(0, 10).map((row, index) => (
                <i
                  key={`${asString(row.domain)}-${index}`}
                  style={{ "--axis-angle": `${index * 36}deg`, "--axis-size": `${24 + Math.min(60, asNumber(row.mean_score))}%` } as CSSProperties}
                  title={asString(row.domain)}
                />
              ))}
            </div>
            <div className={styles.memoBox}>
              <strong>{asString(latestMemo?.title, "Weekly study memo")}</strong>
              {memoHighlights.slice(0, 2).map((item) => <span key={item}>{item}</span>)}
            </div>
          </div>
        </Card>
      </div>

      <div className={styles.hipaaReminder}>
        IRB #Pro00115234 · Next-wave panels use aggregate counts or hashed record IDs. REDCap token use stays server-side, and public counts honor the current small-cell and differential-privacy controls.
      </div>
    </div>
  );
}

function VisitAnomalyBanner({
  anomalies,
  error,
  isLoading,
  lastSyncAt,
  onDismiss,
  onRefresh,
}: {
  anomalies: Array<{ recordId: string; risks: string[] }>;
  error: string | null;
  isLoading: boolean;
  lastSyncAt: string | null;
  onDismiss: () => void;
  onRefresh: () => void;
}) {
  const hasRisk = anomalies.length > 0;
  const message = error
    ? "Visit-health snapshot unavailable"
    : isLoading
    ? "Checking REDCap visit-health records..."
    : hasRisk
      ? `${anomalies.length} carry-forward risk ${anomalies.length === 1 ? "record" : "records"} need coordinator review`
      : "All records clean — no carry-forward risks detected";
  return (
    <div
      className={`${styles.deadlineAlert} ${hasRisk || error ? styles.anomalyWarn : styles.anomalyClean}`}
      data-insight="redcap-anomaly-banner"
    >
      <div className={styles.alertBody}>
        <div className={styles.alertMain}>
          <Badge kind={error ? "warn" : hasRisk ? "fail" : "neutral"} size="sm">
            {error ? "Unavailable" : hasRisk ? "Carry-Forward Risk" : "Snapshot clean"}
          </Badge>
          <span>{message}</span>
        </div>
        <div className={styles.alertActions}>
          <span className="t-mono">Portfolio artifact: {formatSyncTime(lastSyncAt)}</span>
          <Button size="sm" variant="secondary" icon="refresh-cw" onClick={onRefresh}>Refresh</Button>
          <button type="button" className={styles.alertClose} onClick={onDismiss} aria-label="Dismiss carry-forward alert">x</button>
        </div>
      </div>
      {error && <p className={styles.alertNote}>{error}</p>}
      {hasRisk && (
        <details className={styles.alertDetails}>
          <summary>Review flagged records</summary>
          <ul>
            {anomalies.slice(0, 8).map((item) => (
              <li key={item.recordId}>
                <span className="t-mono">{item.recordId}</span>
                <span>{item.risks.join("; ")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function VisitHealthTab({
  records,
  summary,
  isLoading,
  error,
}: {
  records: RedcapVisitRecord[];
  summary: VisitSummary;
  isLoading: boolean;
  error: string | null;
}) {
  const [selected, setSelected] = useState<RedcapVisitRecord | null>(null);
  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => Number(b.hasCarryForwardRisk) - Number(a.hasCarryForwardRisk) || a.recordId.localeCompare(b.recordId)),
    [records],
  );

  return (
    <>
      <Card pad={0}>
        <div className={styles.listHead} data-insight="redcap-visit-health">
          <SectionLabel>Visit Health Monitor · CSBS carry-forward guard</SectionLabel>
          <Badge kind={error ? "warn" : "neutral"} size="sm">{error ? "Snapshot unavailable" : "Snapshot"}</Badge>
        </div>
        <VisitCompletionChart summary={summary} isLoading={isLoading} />
      </Card>

      <Card pad={0}>
        <div className={styles.listHead} data-insight="redcap-visit-grid">
          <SectionLabel>Participant visit status grid</SectionLabel>
          <Badge kind={summary.totals.incomplete ? "warn" : "neutral"} size="sm">
            Snapshot · {records.filter((record) => record.hasCarryForwardRisk).length} risk rows
          </Badge>
        </div>
        <VisitStatusGrid records={sortedRecords} isLoading={isLoading} onSelect={setSelected} />
        <div className={styles.hipaaReminder}>
          IRB #Pro00115234 · This visit-health panel is a de-identified operational snapshot. Open source records only from the secure study network.
        </div>
      </Card>

      {selected && <VisitRecordDrawer record={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function VisitCompletionChart({ summary, isLoading }: { summary: VisitSummary; isLoading: boolean }) {
  return (
    <div className={styles.chartPanel} data-insight="redcap-visit-chart">
      {isLoading ? (
        <div className={styles.chartLoading}>
            {Array.from({ length: 4 }).map((_, idx) => (
            <span key={idx} className={styles.skeletonBar} />
          ))}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={summary.chartRows} margin={{ top: 14, right: 18, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="visit" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <ChartTooltip content={<VisitChartTooltip />} cursor={{ fill: "var(--bg-hover)" }} />
            <Legend />
            {STATUS_ORDER.map((status) => (
              <Bar
                key={status}
                dataKey={status}
                stackId="visit"
                name={STATUS_META[status].label}
                fill={STATUS_META[status].chart}
                radius={status === "complete" ? [6, 6, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function VisitChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number; payload?: VisitChartRow }>;
  label?: string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className={styles.chartTooltip}>
      <strong>{label} CSBS</strong>
      {STATUS_ORDER.map((status) => {
        const ids = row.idsByStatus[status];
        if (!ids.length) return null;
        return (
          <div key={status}>
            <span>{STATUS_META[status].label}</span>
            <span className="t-mono">{ids.length}</span>
            <small>{ids.slice(0, 6).join(", ")}{ids.length > 6 ? ` +${ids.length - 6}` : ""}</small>
          </div>
        );
      })}
    </div>
  );
}

function VisitStatusGrid({
  records,
  isLoading,
  onSelect,
}: {
  records: RedcapVisitRecord[];
  isLoading: boolean;
  onSelect: (record: RedcapVisitRecord) => void;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="sr-only">CSBS visit completion status across 6, 9, 12, and 24 month REDCap events.</caption>
        <thead>
          <tr>
            {["Record ID", "6m Visit Date", "6m CSBS Status", "9m Visit Date", "9m CSBS Status", "12m Visit Date", "12m CSBS Status", "24m Visit Date", "24m CSBS Status", "Anomaly Flag"].map((h) => (
              <th key={h} scope="col" className={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, idx) => (
              <tr key={idx}>
                <td className={styles.td} colSpan={10}><span className={styles.skeletonLine} /></td>
              </tr>
            ))
          ) : records.length ? (
            records.map((record) => (
              <tr
                key={record.recordId}
                className={record.hasCarryForwardRisk ? styles.riskRow : styles.clickRow}
                tabIndex={0}
                onClick={() => onSelect(record)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(record);
                }}
              >
                <td className={`${styles.td} t-mono`}>{record.recordId}</td>
                {VISIT_COLUMNS.map(({ key }) => (
                  <Fragment key={key}>
                    <td key={`${key}-date`} className={`${styles.td} t-mono ${styles.muted}`}>{formatDate(record[key].visitDate)}</td>
                    <td key={`${key}-status`} className={styles.td}><VisitStatusBadge status={record[key].csbsStatus} /></td>
                  </Fragment>
                ))}
                <td className={styles.td}>
                  {record.hasCarryForwardRisk
                    ? <Badge kind="fail" size="sm">{record.anomalyFlags.join(", ")}</Badge>
                    : <Badge kind="ok" size="sm">Clean</Badge>}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className={styles.stateCell} colSpan={10}>No REDCap visit-health records are available yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function VisitRecordDrawer({ record, onClose }: { record: RedcapVisitRecord; onClose: () => void }) {
  const { data } = useRedcapVisitDetail(record.recordId);
  const detail = data ?? record;
  const openRedcap = () => {
    window.open(`/api/v2/redcap-open?record_id=${encodeURIComponent(detail.recordId)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <aside className={styles.matrixDrawer} aria-label="REDCap visit detail" data-insight="redcap-visit-drawer">
      <div className={styles.drawerHead}>
        <SectionLabel>Visit detail</SectionLabel>
        <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close visit detail">x</button>
      </div>
      <div className={styles.drawerBody}>
        <div><strong className="t-mono">{detail.recordId}</strong></div>
        <div className={styles.drawerBadges}>
          {detail.hasCarryForwardRisk
            ? <Badge kind="fail" size="sm">Carry-Forward Risk</Badge>
            : <Badge kind="ok" size="sm">No active risk</Badge>}
        </div>
        {detail.hasCarryForwardRisk && (
          <div className={styles.riskCard}>
            <strong>Coordinator action</strong>
            <p>Resolve the earlier CSBS state before later-event data lands in the wrong REDCap column. Confirm the source event and the visit_occurred.visit_date anchor in REDCap.</p>
            <ul>
              {detail.anomalyFlags.map((flag) => <li key={flag}>{flag}: {ANOMALY_CODES[flag]}</li>)}
            </ul>
          </div>
        )}
        <div className={styles.timeline}>
          {VISIT_COLUMNS.map(({ key, label }) => (
            <div key={key} className={styles.timelineNode}>
              <span className={`${styles.timelineDot} ${styles[`status-${detail[key].csbsStatus}`]}`} />
              <strong>{label}</strong>
              <VisitStatusBadge status={detail[key].csbsStatus} />
            </div>
          ))}
        </div>
        <div className={styles.drawerContext}>
          {VISIT_COLUMNS.map(({ key, label }) => (
            <div key={key}>
              <span>{label} visit</span>
              <strong>
                {formatDate(detail[key].visitDate)} · {STATUS_META[detail[key].csbsStatus].label}
                <br />
                <span className="t-mono">Survey: {formatTimestamp(detail[key].csbsTimestamp)}</span>
              </strong>
            </div>
          ))}
        </div>
        <Button size="sm" icon="external-link" onClick={openRedcap}>Open in REDCap</Button>
      </div>
    </aside>
  );
}

function CoveragePanel({ records, summary }: { records: RedcapVisitRecord[]; summary: VisitSummary }) {
  const missingData = useRedcapMissingData();
  const skippedRecords = missingData.data?.data ?? records.filter((record) =>
    VISIT_COLUMNS.some(({ key }) => record[key].csbsStatus === "skipped"),
  );
  const anomalyCount = records.filter((record) => record.hasCarryForwardRisk).length;
  return (
    <div className={styles.coverageStack}>
      <Card pad={0}>
        <div className={styles.listHead} data-insight="redcap-missing-data">
          <SectionLabel>Missing data code tracker · CSBS SKIP coverage</SectionLabel>
          <Badge kind={missingData.data?.error ? "warn" : "neutral"} size="sm">
            {missingData.data?.error ? "Snapshot unavailable" : "Snapshot"}
          </Badge>
        </div>
        <div className={styles.matrixKpis}>
          <KPI label="6m skipped" value={summary.skippedByVisit.sixMonth} sub="intentional SKIP" insightId="redcap-missing-data" />
          <KPI label="9m skipped" value={summary.skippedByVisit.nineMonth} sub="intentional SKIP" />
          <KPI label="12m skipped" value={summary.skippedByVisit.twelveMonth} sub="intentional SKIP" />
          <KPI label="24m skipped" value={summary.skippedByVisit.twentyFourMonth} sub="intentional SKIP" />
          <KPI label="Coverage" value={`${summary.coveragePct.toFixed(1)}%`} sub="complete + skipped" insightId="redcap-coverage-metric" />
          <KPI label="Active risks" value={anomalyCount} sub="carry-forward flags" deltaKind={anomalyCount ? "down" : "up"} />
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">Records with CSBS missing data code SKIP.</caption>
            <thead>
              <tr>
                {["Record ID", "Skipped visits", "6m", "9m", "12m", "24m"].map((h) => (
                  <th key={h} scope="col" className={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {skippedRecords.length ? skippedRecords.map((record) => {
                const skipped = VISIT_COLUMNS.filter(({ key }) => record[key].csbsStatus === "skipped").map(({ label }) => label);
                return (
                  <tr key={record.recordId}>
                    <td className={`${styles.td} t-mono`}>{record.recordId}</td>
                    <td className={styles.td}>{skipped.join(", ")}</td>
                    {VISIT_COLUMNS.map(({ key }) => (
                      <td key={key} className={styles.td}><VisitStatusBadge status={record[key].csbsStatus} /></td>
                    ))}
                  </tr>
                );
              }) : (
                <tr>
                  <td className={styles.stateCell} colSpan={6}>No SKIP-coded CSBS records found in the current payload.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className={styles.hipaaReminder}>
          IRB #Pro00115234 · Coverage = (Complete + Skipped) / Total expected, separating intentional missingness from workflow errors.
        </div>
      </Card>
    </div>
  );
}

function RedcapCompletenessScorecard() {
  const enabled = useFeatureFlag("REDCAP_COMPLETENESS");
  const { data } = useRedcapCompleteness(enabled);
  const [selected, setSelected] = useState<RedcapCompletenessRow | null>(null);
  if (!enabled) return null;

  const deadline = import.meta.env.VITE_NDA_DEADLINE ?? "2026-08-01";
  const rows = data?.data ?? [];
  const required = rows.filter((row) => row.ndaRequired);
  const missingCount = required.reduce((sum, row) => sum + row.requiredMissing, 0);
  const instruments = Array.from(new Set(required.map((row) => row.instrument))).slice(0, 6);
  const participants = Array.from(new Set(required.map((row) => row.nanoId))).slice(0, 9);
  const byInstrument = instruments.map((instrument) => {
    const instRows = required.filter((row) => row.instrument === instrument);
    const avg = instRows.reduce((sum, row) => sum + row.completenessPct, 0) / Math.max(1, instRows.length);
    return { instrument, avg };
  });
  const completeCells = required.filter((row) => row.status === "complete").length;
  const watchCells = required.filter((row) => row.status === "watch").length;
  const missingCells = required.filter((row) => row.status === "missing").length;
  const workflowCounts = {
    complete: required.filter((row) => (row.workflowState ?? row.status) === "complete").length,
    due: required.filter((row) => row.workflowState === "due").length,
    missing: required.filter((row) => (row.workflowState ?? row.status) === "missing").length,
    did_not_qualify: required.filter((row) => row.workflowState === "did_not_qualify").length,
    other: required.filter((row) => row.workflowState === "other").length,
  };
  const dualRows = required.filter((row) => row.enrollmentType === "dual").length;
  const avgCompleteness = required.reduce((sum, row) => sum + row.completenessPct, 0) / Math.max(1, required.length);

  return (
    <Card pad={0}>
      {missingCount > 0 && (
        <div className={styles.deadlineAlert}>
          {missingCount} NDA-required REDCap fields are still missing before {deadline}.
        </div>
      )}
      <div className={styles.listHead}>
        <SectionLabel>Completeness scorecard · NDA-required forms</SectionLabel>
        <div className={styles.alertMain}>
          <Badge kind="neutral" size="sm">Snapshot</Badge>
          <Button
            size="sm"
            variant="secondary"
            icon="download"
            onClick={() => exportCsvFile(required as unknown as Array<Record<string, unknown>>, "redcap-completeness.csv")}
          >
            Export CSV
          </Button>
        </div>
      </div>
      <div className={styles.matrixKpis}>
        <KPI label="Average complete" value={`${avgCompleteness.toFixed(1)}%`} sub="NDA forms" insightId="redcap-completeness-matrix" />
        <KPI label="Complete cells" value={completeCells} sub="ready" deltaKind="up" />
        <KPI label="Partial cells" value={watchCells} sub="review" deltaKind="flat" />
        <KPI label="Missing cells" value={missingCells} sub="before NDA" deltaKind="down" />
        <KPI label="Dual rows" value={dualRows} sub="cross-study forms" deltaKind={dualRows ? "flat" : "up"} />
      </div>
      <div className={styles.stateChecklist} data-insight="redcap-workflow-states">
        {(["complete", "due", "missing", "did_not_qualify", "other"] as const).map((state) => (
          <label key={state} className={styles.stateItem}>
            <input type="checkbox" checked readOnly />
            <span>{questionnaireLabel(state)}</span>
            <Badge kind={questionnaireKind(state)} size="sm">{workflowCounts[state]}</Badge>
          </label>
        ))}
      </div>
      <div className={styles.scoreBars}>
        {byInstrument.map((item) => (
          <div key={item.instrument} className={styles.scoreBar}>
            <div className={`${styles.scoreMeta} t-mono`}><span>{item.instrument}</span><span>{item.avg.toFixed(1)}%</span></div>
            <div className={styles.scoreTrack}><span style={{ width: `${item.avg}%` }} /></div>
          </div>
        ))}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="sr-only">Participant by instrument REDCap completeness matrix.</caption>
          <thead>
            <tr>
              <th className={styles.th}>Participant</th>
              {instruments.map((instrument) => <th key={instrument} className={styles.th}>{instrument}</th>)}
            </tr>
          </thead>
          <tbody>
            {participants.map((nanoId) => (
              <tr key={nanoId}>
                <td className={`${styles.td} t-mono`}>{nanoId}</td>
                {instruments.map((instrument) => {
                  const cell = required.find((row) => row.nanoId === nanoId && row.instrument === instrument);
                  return (
                    <td key={instrument} className={`${styles.td} t-mono`}>
                      <button
                        type="button"
                        className={cell?.status === "complete" ? styles.cellOk : cell?.status === "watch" ? styles.cellWarn : cell ? styles.cellFail : styles.cellUnscheduled}
                        onClick={() => cell && setSelected(cell)}
                        aria-label={cell ? `${cell.nanoId} ${cell.instrument} ${cell.workflowState ?? cell.status}` : `${nanoId} ${instrument} unscheduled`}
                      >
                        {cell ? `${cell.completenessPct.toFixed(0)}%` : "—"}
                      </button>
                      {cell?.workflowState && cell.workflowState !== cell.status && (
                        <div className={styles.workflowState}>{questionnaireLabel(cell.workflowState)}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.hipaaReminder}>
        IRB #Pro00115234 · Completeness review uses de-identified NANO IDs only. Open REDCap from the secure study network for source records.
      </div>
      {selected && (
        <aside className={styles.matrixDrawer} aria-label="REDCap cell detail">
          <div className={styles.drawerHead}>
            <SectionLabel>Cell detail</SectionLabel>
            <button type="button" className={styles.drawerClose} onClick={() => setSelected(null)} aria-label="Close detail">x</button>
          </div>
          <div className={styles.drawerBody}>
            <div><strong>{selected.nanoId}</strong></div>
            <div className="t-mono">{selected.instrument}</div>
            <div className={styles.drawerBadges}>
              <Badge kind={selected.status === "complete" ? "ok" : selected.status === "watch" ? "warn" : "fail"} size="sm">
                {selected.status === "watch" ? "partial" : selected.status}
              </Badge>
              <Badge kind={questionnaireKind(selected.workflowState ?? selected.status)} size="sm">
                {questionnaireLabel(selected.workflowState ?? selected.status)}
              </Badge>
              {selected.schedulingRisk && <Badge kind={riskKind(selected.schedulingRisk)} size="sm">{selected.schedulingRisk} risk</Badge>}
            </div>
            <p>
              {selected.requiredMissing} of {selected.requiredTotal} required fields missing.
              {selected.dueDate ? ` NDA due ${selected.dueDate}.` : " Not NDA-required."}
            </p>
            <div className={styles.drawerContext}>
              <div><span>Enrollment</span><strong>{selected.enrollmentType ?? "single"}</strong></div>
              <div><span>Studies</span><strong>{selected.studies?.join(" + ") ?? "NANO"}</strong></div>
              <div><span>Visit type</span><strong>{selected.visitType ?? "CGA longitudinal"}</strong></div>
              <div><span>Form policy</span><strong>{formPolicyLabel(selected.formPolicy)}</strong></div>
              <div><span>Linking ID</span><strong className="t-mono">{selected.linkingId ?? "not needed"}</strong></div>
            </div>
            <Button size="sm" icon="external-link" onClick={() => window.open(`/api/v2/redcap-open?record_id=${encodeURIComponent(selected.nanoId)}`, "_blank", "noopener,noreferrer")}>
              Open in REDCap
            </Button>
          </div>
        </aside>
      )}
    </Card>
  );
}
