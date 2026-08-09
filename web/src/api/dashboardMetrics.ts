import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";

export const DASHBOARD_METRICS_URL = "/dashboard/data/dashboard_metrics.json";
export const DASHBOARD_METRICS_QUERY_KEY = ["dashboard", "metrics", "v1"] as const;
export const EXPECTED_REDCAP_PROJECTS = 8;

export type DashboardSourceKind = "live" | "partial" | "unavailable";
export type DashboardSourceStatus = "live" | "partial" | "stale" | "unavailable";

export interface DashboardFormsMetrics {
  instrumentsTotal: number | null;
  incomplete: number | null;
  unverified: number | null;
  complete: number | null;
  unknown: number | null;
  total: number | null;
  completionRate: number | null;
}

export interface DashboardEventMetric {
  event: string;
  records: number | null;
  suppressed: boolean;
}

export interface DashboardStudyMetrics {
  key: string;
  label: string;
  status: string | null;
  projectsTotal: number | null;
  projectsOk: number | null;
  enrollment: number | null;
  target: number | null;
  eventRecords: number | null;
  events: DashboardEventMetric[];
  forms: DashboardFormsMetrics;
}

export interface DashboardProjectMetrics {
  key: string;
  study: string | null;
  role: string | null;
  title: string | null;
  status: string | null;
  enrollmentAuthority: boolean;
  records: number | null;
  eventRecords: number | null;
  events: DashboardEventMetric[];
  forms: DashboardFormsMetrics;
  errorCode: string | null;
}

export interface DashboardPortfolioMetrics {
  status: string | null;
  studiesTotal: number | null;
  studiesReporting: number | null;
  studyEnrollments: number | null;
  eventRecords: number | null;
  forms: DashboardFormsMetrics;
}

export interface DashboardMetrics {
  schema: "dashboard.metrics.v1";
  dataVersion: string;
  generatedAt: string;
  aggregateOnly: boolean;
  source: {
    kind: DashboardSourceKind;
    declaredKind: string;
    system: string;
    refreshCadenceSeconds: number;
    slaSeconds: number;
    projectsTotal: number;
    projectsOk: number;
  };
  portfolio: DashboardPortfolioMetrics;
  studies: DashboardStudyMetrics[];
  projects: DashboardProjectMetrics[];
}

export interface DashboardSourceState {
  status: DashboardSourceStatus;
  label: string;
  detail: string;
  isLive: boolean;
  generatedAt: string | null;
  ageSeconds: number | null;
  projectsOk: number;
  projectsTotal: number;
}

export interface DashboardRedcapSummary {
  projectsOk: number;
  projectsTotal: number;
  instrumentsTotal: number | null;
  eventRecords: number | null;
  formsComplete: number | null;
  formsTotal: number | null;
  completionRate: number | null;
  reviewCount: number | null;
}

type JsonRecord = Record<string, unknown>;

const SourceSchema = z
  .object({
    kind: z.string().min(1),
    system: z.string().min(1),
    refresh_cadence_seconds: z.number().finite().positive().optional(),
    sla_seconds: z.number().finite().positive().optional(),
    cadence: z.string().optional(),
    sla: z
      .object({ max_age_minutes: z.number().finite().positive().optional() })
      .passthrough()
      .optional(),
    projects_total: z.number().int().nonnegative(),
    projects_ok: z.number().int().nonnegative(),
  })
  .passthrough();

const DashboardMetricsSchema = z
  .object({
    schema: z.literal("dashboard.metrics.v1"),
    data_version: z.string().min(1),
    generated_at: z.string().min(1),
    aggregate_only: z.boolean(),
    source: SourceSchema,
    portfolio: z.record(z.unknown()),
    studies: z.array(z.record(z.unknown())),
    projects: z.array(z.record(z.unknown())),
  })
  .passthrough();

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function numberAt(value: JsonRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const candidate = finiteNumber(value[key]);
    if (candidate !== null) return candidate;
  }
  return null;
}

function stringAt(value: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function parseCadenceSeconds(source: z.infer<typeof SourceSchema>): number {
  if (source.refresh_cadence_seconds) return source.refresh_cadence_seconds;
  const match = source.cadence?.match(/every[_ -]?(\d+)[_ -]?minutes?/i);
  return match?.[1] ? Number(match[1]) * 60 : 300;
}

function parseSlaSeconds(source: z.infer<typeof SourceSchema>): number {
  if (source.sla_seconds) return source.sla_seconds;
  if (source.sla?.max_age_minutes) return source.sla.max_age_minutes * 60;
  return 900;
}

function normalizeSourceKind(value: string): DashboardSourceKind {
  const normalized = value.trim().toLowerCase();
  if (normalized === "live" || normalized === "api") return "live";
  if (normalized === "partial") return "partial";
  return "unavailable";
}

function parseForms(value: unknown): DashboardFormsMetrics {
  const source = record(value);
  const rawCompletionRate = numberAt(source, "completion_rate", "completeness_pct");
  return {
    instrumentsTotal: numberAt(source, "instruments_total", "instruments", "forms_tracked"),
    incomplete: numberAt(source, "incomplete"),
    unverified: numberAt(source, "unverified"),
    complete: numberAt(source, "complete"),
    unknown: numberAt(source, "unknown"),
    total: numberAt(source, "total"),
    completionRate: rawCompletionRate !== null && rawCompletionRate <= 1
      ? rawCompletionRate * 100
      : rawCompletionRate,
  };
}

function parseEvents(value: unknown): DashboardEventMetric[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const source = record(entry);
    const event = stringAt(source, "event", "label", "name");
    if (!event) return [];
    const suppressed = source.suppressed === true;
    return [{
      event,
      records: suppressed ? null : numberAt(source, "records", "count", "completed"),
      suppressed,
    }];
  });
}

function parseStudy(value: JsonRecord): DashboardStudyMetrics | null {
  const key = stringAt(value, "key", "study", "study_key", "id")?.toLowerCase();
  if (!key) return null;
  const enrollmentValue = finiteNumber(value.enrollment);
  const enrollment = enrollmentValue ?? numberAt(record(value.enrollment), "enrolled", "total");
  return {
    key,
    label: stringAt(value, "label", "name", "title") ?? key.toUpperCase(),
    status: stringAt(value, "status"),
    projectsTotal: numberAt(value, "projects_total"),
    projectsOk: numberAt(value, "projects_ok"),
    enrollment,
    target: numberAt(value, "target", "enrollment_target"),
    eventRecords: numberAt(value, "event_records"),
    events: parseEvents(value.events),
    forms: parseForms(value.forms),
  };
}

function parseProject(value: JsonRecord): DashboardProjectMetrics | null {
  const key = stringAt(value, "key", "alias");
  if (!key) return null;
  const error = record(value.error);
  return {
    key,
    study: stringAt(value, "study", "study_key")?.toLowerCase() ?? null,
    role: stringAt(value, "role"),
    title: stringAt(value, "title", "label"),
    status: stringAt(value, "status"),
    enrollmentAuthority: value.enrollment_authority === true,
    records: numberAt(value, "records", "record_count"),
    eventRecords: numberAt(value, "event_records"),
    events: parseEvents(value.events),
    forms: parseForms(value.forms),
    errorCode: stringAt(error, "code"),
  };
}

/** Validate and normalize the public, aggregate-only REDCap metrics artifact. */
export function parseDashboardMetrics(input: unknown): DashboardMetrics {
  const parsed = DashboardMetricsSchema.parse(input);
  const studies = parsed.studies.flatMap((study) => {
    const normalized = parseStudy(study);
    return normalized ? [normalized] : [];
  });
  const projects = parsed.projects.flatMap((project) => {
    const normalized = parseProject(project);
    return normalized ? [normalized] : [];
  });
  const portfolio = parsed.portfolio;

  return {
    schema: parsed.schema,
    dataVersion: parsed.data_version,
    generatedAt: parsed.generated_at,
    aggregateOnly: parsed.aggregate_only,
    source: {
      kind: normalizeSourceKind(parsed.source.kind),
      declaredKind: parsed.source.kind,
      system: parsed.source.system,
      refreshCadenceSeconds: parseCadenceSeconds(parsed.source),
      slaSeconds: parseSlaSeconds(parsed.source),
      projectsTotal: parsed.source.projects_total,
      projectsOk: parsed.source.projects_ok,
    },
    portfolio: {
      status: stringAt(portfolio, "status"),
      studiesTotal: numberAt(portfolio, "studies_total"),
      studiesReporting: numberAt(portfolio, "studies_reporting"),
      studyEnrollments: numberAt(portfolio, "study_enrollments", "enrollment"),
      eventRecords: numberAt(portfolio, "event_records"),
      forms: parseForms(portfolio.forms),
    },
    studies,
    projects,
  };
}

async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  const response = await fetch(DASHBOARD_METRICS_URL, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Dashboard metrics unavailable (${response.status})`);
  return parseDashboardMetrics(await response.json());
}

export function useDashboardMetrics(): UseQueryResult<DashboardMetrics, Error> {
  return useQuery({
    queryKey: DASHBOARD_METRICS_QUERY_KEY,
    queryFn: fetchDashboardMetrics,
    staleTime: 0,
    retry: 1,
    refetchInterval: (query) => {
      const cadence = query.state.data?.source.refreshCadenceSeconds ?? 300;
      return Math.max(30_000, Math.min(cadence * 1_000, 15 * 60_000));
    },
  });
}

export function selectStudyMetrics(
  metrics: DashboardMetrics | null | undefined,
  studyKey: string,
): DashboardStudyMetrics | null {
  const normalizedKey = studyKey.trim().toLowerCase();
  return metrics?.studies.find((study) => study.key === normalizedKey) ?? null;
}

export function selectNanoMetrics(metrics: DashboardMetrics | null | undefined): DashboardStudyMetrics | null {
  return selectStudyMetrics(metrics, "nano");
}

export function selectRedcapSummary(metrics: DashboardMetrics | null | undefined): DashboardRedcapSummary {
  if (!metrics) {
    return {
      projectsOk: 0,
      projectsTotal: 0,
      instrumentsTotal: null,
      eventRecords: null,
      formsComplete: null,
      formsTotal: null,
      completionRate: null,
      reviewCount: null,
    };
  }

  const instrumentCounts = metrics.projects
    .map((project) => project.forms.instrumentsTotal)
    .filter((value): value is number => value !== null);
  const forms = metrics.portfolio.forms;
  const reviewParts = [forms.incomplete, forms.unverified, forms.unknown]
    .filter((value): value is number => value !== null);

  return {
    projectsOk: metrics.source.projectsOk,
    projectsTotal: metrics.source.projectsTotal,
    instrumentsTotal: instrumentCounts.length ? instrumentCounts.reduce((sum, value) => sum + value, 0) : null,
    eventRecords: metrics.portfolio.eventRecords,
    formsComplete: forms.complete,
    formsTotal: forms.total,
    completionRate: forms.completionRate,
    reviewCount: reviewParts.length ? reviewParts.reduce((sum, value) => sum + value, 0) : null,
  };
}

export function formatDashboardTimestamp(value: string | null | undefined): string {
  if (!value) return "not verified";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "not verified";
  return timestamp.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * Resolve the only state allowed to use live/green UI. The artifact must be
 * aggregate-only, fresh, explicitly API/live sourced, and healthy for all
 * eight configured REDCap projects.
 */
export function getDashboardSourceState(
  metrics: DashboardMetrics | null | undefined,
  now: number | Date = Date.now(),
): DashboardSourceState {
  if (!metrics) {
    return {
      status: "unavailable",
      label: "REDCap unavailable",
      detail: "No verified aggregate metrics are available.",
      isLive: false,
      generatedAt: null,
      ageSeconds: null,
      projectsOk: 0,
      projectsTotal: 0,
    };
  }

  const nowMs = now instanceof Date ? now.getTime() : now;
  const generatedMs = Date.parse(metrics.generatedAt);
  const validTimestamp = Number.isFinite(generatedMs);
  const ageSeconds = validTimestamp ? Math.max(0, (nowMs - generatedMs) / 1_000) : null;
  const withinSla = ageSeconds !== null && ageSeconds <= metrics.source.slaSeconds;
  const allProjectsHealthy = metrics.source.projectsTotal === EXPECTED_REDCAP_PROJECTS
    && metrics.source.projectsOk === EXPECTED_REDCAP_PROJECTS;
  const live = metrics.aggregateOnly
    && metrics.source.kind === "live"
    && allProjectsHealthy
    && withinSla;
  const generatedLabel = validTimestamp ? formatDashboardTimestamp(metrics.generatedAt) : "not verified";

  if (live) {
    return {
      status: "live",
      label: "Live REDCap",
      detail: `Updated ${generatedLabel} · ${EXPECTED_REDCAP_PROJECTS}/${EXPECTED_REDCAP_PROJECTS} projects healthy`,
      isLive: true,
      generatedAt: metrics.generatedAt,
      ageSeconds,
      projectsOk: metrics.source.projectsOk,
      projectsTotal: metrics.source.projectsTotal,
    };
  }

  if (
    metrics.source.kind === "unavailable"
    || !metrics.aggregateOnly
    || !validTimestamp
    || metrics.source.projectsOk === 0
  ) {
    return {
      status: "unavailable",
      label: "REDCap unavailable",
      detail: validTimestamp ? `Last artifact ${generatedLabel} · not verified live` : "No verified aggregate metrics are available.",
      isLive: false,
      generatedAt: validTimestamp ? metrics.generatedAt : null,
      ageSeconds,
      projectsOk: metrics.source.projectsOk,
      projectsTotal: metrics.source.projectsTotal,
    };
  }

  if (!withinSla) {
    return {
      status: "stale",
      label: "Stale REDCap",
      detail: `Last verified ${generatedLabel} · ${metrics.source.projectsOk}/${metrics.source.projectsTotal} projects reported`,
      isLive: false,
      generatedAt: metrics.generatedAt,
      ageSeconds,
      projectsOk: metrics.source.projectsOk,
      projectsTotal: metrics.source.projectsTotal,
    };
  }

  return {
    status: "partial",
    label: "Partial REDCap",
    detail: `Updated ${generatedLabel} · ${metrics.source.projectsOk}/${metrics.source.projectsTotal} projects healthy`,
    isLive: false,
    generatedAt: metrics.generatedAt,
    ageSeconds,
    projectsOk: metrics.source.projectsOk,
    projectsTotal: metrics.source.projectsTotal,
  };
}
