import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Card, Gloss, KPI, SectionLabel, Segmented, type BadgeKind } from "@/components/primitives";
import {
  useRedcapData,
  useRedcapCompleteness,
  useRedcapEvents,
  useRedcapMissingData,
  useRedcapVisitDetail,
  useRedcapVisitEntry,
  useRedcapVisitHealth,
} from "@/api/hooks";
import { AmbientOrbit, FastPaths, type FastPathPrompt } from "@/components/warm";
import { resolveTheme, useUi } from "@/store/ui";
import { logAudit } from "@/lib/audit";
import { exportCsvFile } from "@/lib/exportCsv";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { CsbsVisitStatus, RedcapCompletenessRow, RedcapVisitOption, RedcapVisitRecord } from "@/api/schemas";
import type { RedcapPayload as RedcapDashboardPayload } from "@/api/redcapSchemas";
import { callREDCap } from "@/api/redcapClient";
import { SwimLane } from "@/components/timeline/SwimLane";
import type { TimelineEvent } from "@/components/timeline/EventMark";
import { ANOMALY_CODES, PROJECT_TITLE } from "@/constants/redcapConfig";
import { formPolicyLabel, questionnaireKind, questionnaireLabel, riskKind } from "@/lib/participantOperations";
import styles from "./Redcap.module.css";

const REDCAP_FAST_PATHS: FastPathPrompt[] = [
  { lane: "redcap", label: "Last-hour fail triage",   prompt: "Triage every REDCap sync that failed in the last hour. Group by form, surface the auth or schema cause, and recommend a fix order." },
  { lane: "redcap", label: "PHI column audit",        prompt: "Re-audit the PHI gate on every form in the active project. Flag any field where the strip rule is unset or stale." },
  { lane: "redcap", label: "Missing DOB · open",      prompt: "List every open Intake record missing DOB or MRN. Group by site and surface the assigned coordinator." },
  { lane: "redcap", label: "Dual AIH/EH policy",      prompt: "Explain the dual-enrollment AIH and EH form policy. When do we use one shared master form, and when do duplicate study-specific forms need a linking ID?" },
  { lane: "redcap", label: "Packet cross-check",      prompt: "Before scheduling a dual-enrolled participant, what enrollment-type, packet, questionnaire, and REDCap checks should staff complete?" },
  { lane: "qa",     label: "Sync vs QA mismatch",     prompt: "Cross-check tonight's REDCap visit_completion flags against QA epoch decisions. Flag any visit where REDCap says complete but QA yield is below 75%." },
  { lane: "qa",     label: "Bayley-4 missingness",    prompt: "Build a missingness heatmap for Bayley-4 across active visits and rank the worst-offending fields." },
  { lane: "model",  label: "Feature freshness",       prompt: "Which classifier features depend on REDCap fields that have not synced in 48 h? Rank by SHAP importance." },
  { lane: "model",  label: "Cohort drift on sync gap", prompt: "Quantify how a 24 h REDCap sync gap shifts the VPT vs TD cohort feature distributions." },
  { lane: "redcap", label: "Carry-forward triage",    prompt: "List every participant with an active carry-forward risk flag. Group by timepoint and surface the specific condition that triggered each flag." },
  { lane: "redcap", label: "CSBS gap analysis",       prompt: "Show which participants have incomplete CSBS at 6m or 9m while their next visit has already started. What's the coordinator action for each?" },
  { lane: "redcap", label: "Coverage report",         prompt: "Generate a data coverage report across all four CSBS timepoints. Break down complete, skipped, incomplete, and not-started counts by visit month." },
  { lane: "redcap", label: "Freshness check",         prompt: "When was REDCap last synced, how many records are in the payload, and how many carry-forward anomalies are active?" },
];

type RedcapTab = "ops" | "sync" | "visit-health" | "coverage";
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
  const eventsQuery = useRedcapEvents();
  const events = eventsQuery.data ?? [];
  const okN = events.filter((e) => e.status === "ok").length;
  const warnN = events.filter((e) => e.status === "warn").length;
  const failN = events.filter((e) => e.status === "fail").length;
  const visitHealthEnabled = useFeatureFlag("REDCAP_VISIT_HEALTH");
  const liveProxyEnabled = useFeatureFlag("REDCAP_LIVE_PROXY");
  const visitHealth = useRedcapVisitHealth(visitHealthEnabled);
  const redcapPayload = useRedcapData(visitHealthEnabled);
  const visitRecords = visitHealth.data?.data ?? [];
  const visitSummary = useMemo(() => summarizeVisitHealth(visitRecords), [visitRecords]);
  const queryClient = useQueryClient();
  const theme = useUi((s) => s.theme);
  const setChatOpen = useUi((s) => s.setChatOpen);
  const setChatSeed = useUi((s) => s.setChatSeed);
  const lastSyncAt = useUi((s) => s.lastSyncAt);
  const setLastSyncAt = useUi((s) => s.setLastSyncAt);
  const fastPathTone = resolveTheme(theme);
  const [activeTab, setActiveTab] = useState<RedcapTab>("ops");
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [liveFreshness, setLiveFreshness] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  const tabOptions = useMemo(
    () =>
      visitHealthEnabled
        ? [
            { value: "ops" as const, label: "Ops Monitor" },
            { value: "sync" as const, label: "Sync & Completeness" },
            { value: "visit-health" as const, label: "Visit Health" },
            { value: "coverage" as const, label: "Coverage" },
          ]
        : [{ value: "sync" as const, label: "Sync & Completeness" }],
    [visitHealthEnabled],
  );

  useEffect(() => {
    if (!visitHealthEnabled && activeTab !== "sync") setActiveTab("sync");
  }, [activeTab, visitHealthEnabled]);

  useEffect(() => {
    if (visitHealth.data?.meta.generatedAt) {
      setLastSyncAt(visitHealth.data.meta.generatedAt);
    }
  }, [setLastSyncAt, visitHealth.data?.meta.generatedAt]);

  function fastPath(prompt: string) {
    setChatSeed(prompt);
    setChatOpen(true);
    void logAudit({ action: "run.trigger", scope: "/redcap/fast-path" });
  }

  function refreshVisitHealth() {
    void queryClient.invalidateQueries({ queryKey: ["v2", "redcap-visit-health"] });
    void queryClient.invalidateQueries({ queryKey: ["redcap", "dashboard-data"] });
    void queryClient.invalidateQueries({ queryKey: ["v2", "redcap-missing-data"] });
    setLastSyncAt(new Date().toISOString());
  }

  async function refreshLiveProject() {
    setLiveError(null);
    try {
      const project = await callREDCap<Array<{ project_title?: string }>>({ content: "project" });
      const title = project[0]?.project_title ?? PROJECT_TITLE;
      setLiveFreshness(`${title} · checked ${formatSyncTime(new Date().toISOString())}`);
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "REDCap proxy unavailable.");
    }
  }

  function syncNow() {
    void eventsQuery.refetch();
    if (visitHealthEnabled) refreshVisitHealth();
    if (liveProxyEnabled) void refreshLiveProject();
    void logAudit({ action: "run.trigger", scope: "/redcap/sync" });
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
            Bidirectional sync with the NANO REDCap project. Pulls visit metadata, pushes processed flags. PHI columns are stripped before any export.
          </p>
        </div>
        <div className={styles.actions}>
          {liveProxyEnabled && <Button variant="secondary" icon="refresh-cw" onClick={() => void refreshLiveProject()}>Refresh live</Button>}
          <Button icon="refresh-cw" onClick={syncNow}>Sync now</Button>
        </div>
      </header>
      {(liveFreshness || liveError) && (
        <div className={`${styles.liveFreshness} t-mono`}>
          {liveFreshness}
          {liveError && <span>{liveError}</span>}
        </div>
      )}

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

      {visitHealthEnabled && (
        <div className={styles.tabRow}>
          <Segmented
            options={tabOptions}
            value={activeTab}
            onChange={setActiveTab}
            ariaLabel="REDCap dashboard sections"
          />
        </div>
      )}

      <section className={styles.kpis}>
        <KPI label="Forms tracked" value="14" sub="versioned · v1–v4" insightId="redcap-forms" />
        <KPI label="Records · 24 h" value="25" sub="pulled and pushed" delta={`+${okN}`} deltaKind="up" insightId="redcap-records" />
        <KPI label="Warnings" value={warnN} sub="missing fields · review" delta="needs eye" deltaKind="flat" insightId="redcap-warnings" />
        <KPI
          label="Failures"
          value={failN}
          sub="auto-retry queued"
          delta={failN ? "needs auth" : "clear"}
          deltaKind={failN ? "down" : "up"}
          insightId="redcap-failures"
        />
      </section>

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
    </div>
  );
}

function RedcapSyncPanel({ events }: { events: Array<{ ts: string; form: string; n: number; status: "ok" | "warn" | "fail"; note: string }> }) {
  return (
    <div className={styles.split}>
      <Card pad={0}>
        <div className={styles.listHead}>
          <SectionLabel>Sync events · last 1 h</SectionLabel>
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
          <SectionLabel>Field map · medical_history_v1</SectionLabel>
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
            PHI fields never leave the secure REDCap proxy — only hashed/derived columns are written to{" "}
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
          <Badge kind="neutral" size="sm">what-if local</Badge>
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
  const message = isLoading
    ? "Checking REDCap visit-health records..."
    : hasRisk
      ? `${anomalies.length} carry-forward risk ${anomalies.length === 1 ? "record" : "records"} need coordinator review`
      : "All records clean — no carry-forward risks detected";
  return (
    <div
      className={`${styles.deadlineAlert} ${hasRisk ? styles.anomalyWarn : styles.anomalyClean}`}
      data-insight="redcap-anomaly-banner"
    >
      <div className={styles.alertBody}>
        <div className={styles.alertMain}>
          <Badge kind={hasRisk ? "fail" : "ok"} size="sm">
            {hasRisk ? "Carry-Forward Risk" : "Clean"}
          </Badge>
          <span>{message}</span>
        </div>
        <div className={styles.alertActions}>
          <span className="t-mono">Last synced: {formatSyncTime(lastSyncAt)}</span>
          {error && <Badge kind="warn" size="sm">offline fallback</Badge>}
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
          {error && <Badge kind="warn" size="sm">Backend fallback active</Badge>}
        </div>
        <VisitCompletionChart summary={summary} isLoading={isLoading} />
      </Card>

      <Card pad={0}>
        <div className={styles.listHead} data-insight="redcap-visit-grid">
          <SectionLabel>Participant visit status grid</SectionLabel>
          <Badge kind={summary.totals.incomplete ? "warn" : "ok"} size="sm">
            {records.filter((record) => record.hasCarryForwardRisk).length} risk rows
          </Badge>
        </div>
        <VisitStatusGrid records={sortedRecords} isLoading={isLoading} onSelect={setSelected} />
        <div className={styles.hipaaReminder}>
          IRB #Pro00115234 · Visit-health review uses REDCap proxy data and de-identified record IDs only. Open source records from the secure study network.
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

function VisitEntryPanel({
  records,
  visitOptions,
}: {
  records: RedcapVisitRecord[];
  visitOptions: RedcapVisitOption[];
}) {
  const options = useMemo(() => {
    if (visitOptions.length) return visitOptions;
    const first = records[0];
    if (!first) return [];
    return VISIT_COLUMNS.map(({ key, label }) => ({ key, label, eventName: first[key].eventName ?? "" }));
  }, [records, visitOptions]);
  const [recordId, setRecordId] = useState("");
  const [eventName, setEventName] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [toast, setToast] = useState<{ kind: "ok" | "fail"; text: string } | null>(null);
  const mutation = useRedcapVisitEntry();

  useEffect(() => {
    if (!recordId && records[0]) setRecordId(records[0].recordId);
  }, [recordId, records]);

  useEffect(() => {
    const firstOption = options[0];
    if (!eventName && firstOption) setEventName(firstOption.eventName);
  }, [eventName, options]);

  async function submitVisitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setToast(null);
    try {
      const result = await mutation.mutateAsync({ recordId, eventName, visitDate });
      if (!result.success) {
        throw new Error(result.errors.join("; ") || "REDCap returned an import error.");
      }
      const label = options.find((option) => option.eventName === eventName)?.label ?? eventName;
      setToast({
        kind: "ok",
        text: `Visit date recorded for ${recordId} at ${label}. REDCap Form Display Logic will now disable the previous timepoint's CSBS survey.`,
      });
      void logAudit({ action: "run.trigger", scope: "/redcap/visit-entry", detail: { event: label } });
    } catch (error) {
      setToast({
        kind: "fail",
        text: error instanceof Error ? error.message : "Visit date import failed.",
      });
    }
  }

  return (
    <Card pad={0}>
      <div className={styles.listHead} data-insight="redcap-visit-entry">
        <SectionLabel>Visit date entry · staff quick action</SectionLabel>
        <Badge kind="phi" size="sm">server-side token only</Badge>
      </div>
      <form className={styles.entryForm} onSubmit={submitVisitEntry}>
        <label>
          <span>Participant record</span>
          <select value={recordId} onChange={(event) => setRecordId(event.target.value)} disabled={!records.length}>
            {records.length ? records.map((record) => (
              <option key={record.recordId} value={record.recordId}>{record.recordId}</option>
            )) : <option value="">No records loaded</option>}
          </select>
        </label>
        <label>
          <span>Visit timepoint</span>
          <select value={eventName} onChange={(event) => setEventName(event.target.value)} disabled={!options.length}>
            {options.length ? options.map((option) => (
              <option key={option.key} value={option.eventName}>{option.label}</option>
            )) : <option value="">No REDCap events configured</option>}
          </select>
        </label>
        <label>
          <span>Visit date</span>
          <input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} />
        </label>
        <Button type="submit" icon="check" disabled={!recordId || !eventName || !visitDate || mutation.isPending}>
          {mutation.isPending ? "Recording..." : "Record Visit Start"}
        </Button>
      </form>
      {toast && (
        <div className={`${styles.toast} ${toast.kind === "ok" ? styles.toastOk : styles.toastFail}`}>
          {toast.text}
        </div>
      )}
      <div className={styles.hipaaReminder}>
        IRB #Pro00115234 · Visit entry writes only the configured visit-date field through the backend REDCap proxy. API tokens never enter the browser bundle.
      </div>
    </Card>
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
          {missingData.data?.error && <Badge kind="warn" size="sm">fallback active</Badge>}
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
  const { data } = useRedcapCompleteness();
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
        <Button
          size="sm"
          variant="secondary"
          icon="download"
          onClick={() => exportCsvFile(required as unknown as Array<Record<string, unknown>>, "redcap-completeness.csv")}
        >
          Export CSV
        </Button>
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
