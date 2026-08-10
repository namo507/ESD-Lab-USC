import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";

export const DASHBOARD_METRICS_URL = "/dashboard/data/dashboard_metrics.json";
export const DASHBOARD_METRICS_QUERY_KEY = ["dashboard", "metrics", "v1"] as const;
export const EXPECTED_REDCAP_PROJECTS = 8;
export const EXPECTED_REDCAP_STUDIES = 5;
export const DASHBOARD_SMALL_CELL_THRESHOLD = 5;

export const REDCAP_STUDY_IDENTITIES = {
  abc: { projects: 2 },
  ipsa: { projects: 2 },
  action: { projects: 1 },
  nico: { projects: 1 },
  nano: { projects: 2 },
} as const;

export const REDCAP_PROJECT_IDENTITIES = {
  abc_surveys: { projectId: 1140, study: "abc", role: "surveys", enrollmentAuthority: true },
  ipsa_surveys: { projectId: 1289, study: "ipsa", role: "surveys", enrollmentAuthority: true },
  action: { projectId: 1556, study: "action", role: "combined", enrollmentAuthority: true },
  ipsa_lab: { projectId: 2084, study: "ipsa", role: "assessments", enrollmentAuthority: false },
  abc_lab: { projectId: 2263, study: "abc", role: "assessments", enrollmentAuthority: false },
  nico: { projectId: 3836, study: "nico", role: "combined", enrollmentAuthority: true },
  nano_surveys: { projectId: 4218, study: "nano", role: "surveys", enrollmentAuthority: true },
  nano_lab: { projectId: 5484, study: "nano", role: "assessments", enrollmentAuthority: false },
} as const;

export type DashboardStudyKey = keyof typeof REDCAP_STUDY_IDENTITIES;
export type DashboardProjectKey = keyof typeof REDCAP_PROJECT_IDENTITIES;

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
  countsSuppressed: boolean;
}

export interface DashboardEventMetric {
  event: string;
  records: number | null;
  suppressed: boolean;
}

export interface DashboardStudyMetrics {
  key: DashboardStudyKey;
  label: string;
  status: string | null;
  projectsTotal: number | null;
  projectsOk: number | null;
  enrollment: number | null;
  enrollmentSuppressed: boolean;
  target: number | null;
  eventRecords: number | null;
  eventRecordsSuppressed: boolean;
  events: DashboardEventMetric[];
  forms: DashboardFormsMetrics;
}

export interface DashboardProjectMetrics {
  key: DashboardProjectKey;
  study: DashboardStudyKey;
  role: string;
  projectId: number;
  title: string;
  status: string | null;
  enrollmentAuthority: boolean;
  records: number | null;
  recordsSuppressed: boolean;
  eventRecords: number | null;
  eventRecordsSuppressed: boolean;
  events: DashboardEventMetric[];
  forms: DashboardFormsMetrics;
  errorCode: string | null;
}

export interface DashboardPortfolioMetrics {
  status: string | null;
  studiesTotal: number | null;
  studiesReporting: number | null;
  studyEnrollments: number | null;
  studyEnrollmentsSuppressed: boolean;
  eventRecords: number | null;
  eventRecordsSuppressed: boolean;
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

const STUDY_KEYS = Object.keys(REDCAP_STUDY_IDENTITIES) as [DashboardStudyKey, ...DashboardStudyKey[]];
const PROJECT_KEYS = Object.keys(REDCAP_PROJECT_IDENTITIES) as [DashboardProjectKey, ...DashboardProjectKey[]];
const CountSchema = z.number().int().nonnegative();
const NullableCountSchema = CountSchema.nullable();
const StudyKeySchema = z.enum(STUDY_KEYS);
const ProjectKeySchema = z.enum(PROJECT_KEYS);

function addContractIssue(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

function validateSuppressedCount(
  count: number | null,
  suppressed: boolean,
  ctx: z.RefinementCtx,
  countPath: Array<string | number>,
  flagPath: Array<string | number>,
) {
  if (suppressed && count !== null) {
    addContractIssue(ctx, countPath, "suppressed aggregate counts must be null");
  }
  if (!suppressed && count !== null && count > 0 && count < DASHBOARD_SMALL_CELL_THRESHOLD) {
    addContractIssue(ctx, flagPath, "small aggregate counts must be privacy-suppressed");
  }
}

const EventSchema = z
  .object({
    event: z.string().trim().min(1),
    records: NullableCountSchema,
    suppressed: z.boolean(),
  })
  .strict()
  .superRefine((event, ctx) => {
    validateSuppressedCount(event.records, event.suppressed, ctx, ["records"], ["suppressed"]);
    if (!event.suppressed && event.records === null) {
      addContractIssue(ctx, ["records"], "an unsuppressed event must include its aggregate count");
    }
  });

interface RawFormsContract {
  incomplete: number | null;
  unverified: number | null;
  complete: number | null;
  unknown: number | null;
  total: number | null;
  completion_rate: number | null;
  counts_suppressed: boolean;
}

const FormsShape = {
  incomplete: NullableCountSchema,
  unverified: NullableCountSchema,
  complete: NullableCountSchema,
  unknown: NullableCountSchema,
  total: NullableCountSchema,
  completion_rate: z.number().finite().min(0).max(100).nullable(),
  counts_suppressed: z.boolean(),
};

function validateFormsContract(forms: RawFormsContract, ctx: z.RefinementCtx) {
  const countKeys = ["incomplete", "unverified", "complete", "unknown", "total"] as const;
  if (forms.counts_suppressed) {
    for (const key of countKeys) {
      if (forms[key] !== null) addContractIssue(ctx, [key], "suppressed form counts must be null");
    }
    if (forms.completion_rate !== null) {
      addContractIssue(ctx, ["completion_rate"], "suppressed form counts must not expose a rate");
    }
    return;
  }

  const present = countKeys.filter((key) => forms[key] !== null);
  if (present.length === 0) return;
  if (present.length !== countKeys.length) {
    addContractIssue(ctx, ["total"], "available form buckets must be published together");
    return;
  }

  const subtotal = (forms.incomplete ?? 0)
    + (forms.unverified ?? 0)
    + (forms.complete ?? 0)
    + (forms.unknown ?? 0);
  if (subtotal !== forms.total) {
    addContractIssue(ctx, ["total"], "form total must equal its aggregate buckets");
  }
  for (const key of ["incomplete", "unverified", "complete", "unknown"] as const) {
    const count = forms[key] ?? 0;
    if (count > 0 && count < DASHBOARD_SMALL_CELL_THRESHOLD) {
      addContractIssue(ctx, [key], "small form buckets must be privacy-suppressed");
    }
  }
}

const FormsSchema = z.object(FormsShape).strict().superRefine(validateFormsContract);
const ProjectFormsSchema = z
  .object({ instruments_total: NullableCountSchema, ...FormsShape })
  .strict()
  .superRefine(validateFormsContract);

const SourceSchema = z
  .object({
    kind: z.enum(["live", "api", "partial", "unavailable"]),
    transport: z.literal("api").optional(),
    system: z.literal("REDCap"),
    refresh_cadence_seconds: z.number().finite().positive().optional(),
    sla_seconds: z.number().finite().positive().optional(),
    cadence: z.string().trim().min(1).optional(),
    sla: z
      .object({ max_age_minutes: z.number().finite().positive() })
      .strict()
      .optional(),
    projects_total: z.literal(EXPECTED_REDCAP_PROJECTS),
    projects_ok: CountSchema.max(EXPECTED_REDCAP_PROJECTS),
  })
  .strict();

const PortfolioSchema = z
  .object({
    status: z.string().trim().min(1),
    studies_total: z.literal(EXPECTED_REDCAP_STUDIES),
    studies_reporting: CountSchema.max(EXPECTED_REDCAP_STUDIES),
    study_enrollments: NullableCountSchema,
    study_enrollments_suppressed: z.boolean(),
    event_records: NullableCountSchema,
    event_records_suppressed: z.boolean(),
    forms: FormsSchema,
  })
  .strict();

const StudySchema = z
  .object({
    key: StudyKeySchema,
    label: z.string().trim().min(1),
    status: z.string().trim().min(1),
    projects_total: CountSchema,
    projects_ok: CountSchema,
    target: NullableCountSchema,
    enrollment: NullableCountSchema,
    enrollment_suppressed: z.boolean(),
    event_records: NullableCountSchema,
    event_records_suppressed: z.boolean(),
    events: z.array(EventSchema),
    forms: FormsSchema,
  })
  .strict();

const ProjectSchema = z
  .object({
    key: ProjectKeySchema,
    study: StudyKeySchema,
    role: z.string().trim().min(1),
    project_id: CountSchema,
    title: z.string().trim().min(1),
    status: z.string().trim().min(1),
    enrollment_authority: z.boolean(),
    records: NullableCountSchema,
    records_suppressed: z.boolean(),
    event_records: NullableCountSchema,
    event_records_suppressed: z.boolean(),
    events: z.array(EventSchema),
    forms: ProjectFormsSchema,
    error: z.object({ code: z.string().trim().min(1) }).strict().nullable(),
  })
  .strict();

const DashboardMetricsSchema = z
  .object({
    schema: z.literal("dashboard.metrics.v1"),
    data_version: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    generated_at: z.string().trim().min(1).refine((value) => {
      return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
    }, "generated_at must be an ISO-8601 timestamp with a timezone"),
    aggregate_only: z.literal(true),
    source: SourceSchema,
    portfolio: PortfolioSchema,
    studies: z.array(StudySchema).length(EXPECTED_REDCAP_STUDIES),
    projects: z.array(ProjectSchema).length(EXPECTED_REDCAP_PROJECTS),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const studyKeys = new Set(payload.studies.map((study) => study.key));
    if (studyKeys.size !== EXPECTED_REDCAP_STUDIES) {
      addContractIssue(ctx, ["studies"], "the aggregate artifact must contain each canonical study exactly once");
    }
    const projectKeys = new Set(payload.projects.map((project) => project.key));
    if (projectKeys.size !== EXPECTED_REDCAP_PROJECTS) {
      addContractIssue(ctx, ["projects"], "the aggregate artifact must contain each canonical project exactly once");
    }

    const projectsByStudy = new Map<DashboardStudyKey, z.infer<typeof ProjectSchema>[]>();
    for (const key of STUDY_KEYS) projectsByStudy.set(key, []);

    payload.projects.forEach((project, index) => {
      const identity = REDCAP_PROJECT_IDENTITIES[project.key];
      if (
        project.project_id !== identity.projectId
        || project.study !== identity.study
        || project.role !== identity.role
        || project.enrollment_authority !== identity.enrollmentAuthority
      ) {
        addContractIssue(ctx, ["projects", index], `project ${project.key} does not match its canonical identity`);
      }
      projectsByStudy.get(project.study)?.push(project);
      validateSuppressedCount(
        project.records,
        project.records_suppressed,
        ctx,
        ["projects", index, "records"],
        ["projects", index, "records_suppressed"],
      );
      validateSuppressedCount(
        project.event_records,
        project.event_records_suppressed,
        ctx,
        ["projects", index, "event_records"],
        ["projects", index, "event_records_suppressed"],
      );
      if (project.status === "ok" && !project.records_suppressed && project.records === null) {
        addContractIssue(ctx, ["projects", index, "records"], "a healthy project must include its aggregate record count");
      }
      if (project.status === "ok" && !project.event_records_suppressed && project.event_records === null) {
        addContractIssue(ctx, ["projects", index, "event_records"], "a healthy project must include its aggregate event total");
      }
      if (project.events.some((event) => event.suppressed) && !project.event_records_suppressed) {
        addContractIssue(ctx, ["projects", index, "event_records_suppressed"], "project totals must preserve event suppression");
      }
      if (project.records_suppressed) {
        if (!project.forms.counts_suppressed) {
          addContractIssue(ctx, ["projects", index, "forms", "counts_suppressed"], "project forms must preserve participant-count suppression");
        }
        if (
          !project.event_records_suppressed
          || project.events.some((event) => !event.suppressed)
        ) {
          addContractIssue(ctx, ["projects", index, "event_records_suppressed"], "project events must preserve participant-count suppression");
        }
      }
    });

    payload.studies.forEach((study, index) => {
      const expectedProjects = REDCAP_STUDY_IDENTITIES[study.key].projects;
      const members = projectsByStudy.get(study.key) ?? [];
      const healthyMembers = members.filter((project) => project.status === "ok").length;
      if (study.projects_total !== expectedProjects || members.length !== expectedProjects) {
        addContractIssue(ctx, ["studies", index, "projects_total"], `study ${study.key} must contain ${expectedProjects} canonical projects`);
      }
      if (study.projects_ok !== healthyMembers) {
        addContractIssue(ctx, ["studies", index, "projects_ok"], "study health must match its project statuses");
      }
      validateSuppressedCount(
        study.enrollment,
        study.enrollment_suppressed,
        ctx,
        ["studies", index, "enrollment"],
        ["studies", index, "enrollment_suppressed"],
      );
      validateSuppressedCount(
        study.event_records,
        study.event_records_suppressed,
        ctx,
        ["studies", index, "event_records"],
        ["studies", index, "event_records_suppressed"],
      );
      if (study.events.some((event) => event.suppressed) && !study.event_records_suppressed) {
        addContractIssue(ctx, ["studies", index, "event_records_suppressed"], "study totals must preserve event suppression");
      }

      const authority = members.find((project) => project.enrollment_authority);
      if (!authority) {
        addContractIssue(ctx, ["studies", index], `study ${study.key} is missing its enrollment authority`);
      } else {
        if (study.enrollment_suppressed !== authority.records_suppressed) {
          addContractIssue(ctx, ["studies", index, "enrollment_suppressed"], "study suppression must match its enrollment authority");
        }
        if (!study.enrollment_suppressed && study.enrollment !== authority.records) {
          addContractIssue(ctx, ["studies", index, "enrollment"], "study enrollment must match its enrollment authority");
        }
        if (authority.event_records_suppressed && !study.event_records_suppressed) {
          addContractIssue(ctx, ["studies", index, "event_records_suppressed"], "study totals must preserve authority event suppression");
        }
      }
      if (members.some((project) => project.forms.counts_suppressed) && !study.forms.counts_suppressed) {
        addContractIssue(ctx, ["studies", index, "forms", "counts_suppressed"], "study totals must preserve project form suppression");
      }
    });

    const healthyProjects = payload.projects.filter((project) => project.status === "ok").length;
    if (payload.source.projects_ok !== healthyProjects) {
      addContractIssue(ctx, ["source", "projects_ok"], "source health must match project statuses");
    }

    const authorities = payload.projects.filter((project) => project.enrollment_authority);
    const reportingStudies = authorities.filter((project) => project.status === "ok").length;
    if (payload.portfolio.studies_reporting !== reportingStudies) {
      addContractIssue(ctx, ["portfolio", "studies_reporting"], "reporting study count must match healthy enrollment authorities");
    }

    validateSuppressedCount(
      payload.portfolio.study_enrollments,
      payload.portfolio.study_enrollments_suppressed,
      ctx,
      ["portfolio", "study_enrollments"],
      ["portfolio", "study_enrollments_suppressed"],
    );
    validateSuppressedCount(
      payload.portfolio.event_records,
      payload.portfolio.event_records_suppressed,
      ctx,
      ["portfolio", "event_records"],
      ["portfolio", "event_records_suppressed"],
    );

    const anyEnrollmentSuppressed = payload.studies.some((study) => study.enrollment_suppressed);
    if (payload.portfolio.study_enrollments_suppressed !== anyEnrollmentSuppressed) {
      addContractIssue(ctx, ["portfolio", "study_enrollments_suppressed"], "portfolio enrollment suppression must match its studies");
    }
    const enrollments = payload.studies.map((study) => study.enrollment);
    if (!anyEnrollmentSuppressed && enrollments.every((value): value is number => value !== null)) {
      const expectedTotal = enrollments.reduce((total, value) => total + value, 0);
      if (payload.portfolio.study_enrollments !== expectedTotal) {
        addContractIssue(ctx, ["portfolio", "study_enrollments"], "portfolio enrollment must equal the five authority counts");
      }
    } else if (!anyEnrollmentSuppressed && payload.portfolio.study_enrollments !== null) {
      addContractIssue(ctx, ["portfolio", "study_enrollments"], "portfolio enrollment must be unavailable when a study count is unavailable");
    }
    if (payload.projects.some((project) => project.forms.counts_suppressed) && !payload.portfolio.forms.counts_suppressed) {
      addContractIssue(ctx, ["portfolio", "forms", "counts_suppressed"], "portfolio totals must preserve project form suppression");
    }
    if (authorities.some((project) => project.event_records_suppressed) && !payload.portfolio.event_records_suppressed) {
      addContractIssue(ctx, ["portfolio", "event_records_suppressed"], "portfolio totals must preserve authority event suppression");
    }
  });

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

function parseForms(
  value: z.infer<typeof FormsSchema> | z.infer<typeof ProjectFormsSchema>,
): DashboardFormsMetrics {
  const rawCompletionRate = value.completion_rate;
  return {
    instrumentsTotal: "instruments_total" in value ? value.instruments_total : null,
    incomplete: value.incomplete,
    unverified: value.unverified,
    complete: value.complete,
    unknown: value.unknown,
    total: value.total,
    completionRate: rawCompletionRate !== null && rawCompletionRate <= 1
      ? rawCompletionRate * 100
      : rawCompletionRate,
    countsSuppressed: value.counts_suppressed,
  };
}

function parseEvents(value: Array<z.infer<typeof EventSchema>>): DashboardEventMetric[] {
  return value.map((entry) => ({
    event: entry.event,
    records: entry.records,
    suppressed: entry.suppressed,
  }));
}

function parseStudy(value: z.infer<typeof StudySchema>): DashboardStudyMetrics {
  return {
    key: value.key,
    label: value.label,
    status: value.status,
    projectsTotal: value.projects_total,
    projectsOk: value.projects_ok,
    enrollment: value.enrollment,
    enrollmentSuppressed: value.enrollment_suppressed,
    target: value.target,
    eventRecords: value.event_records,
    eventRecordsSuppressed: value.event_records_suppressed,
    events: parseEvents(value.events),
    forms: parseForms(value.forms),
  };
}

function parseProject(value: z.infer<typeof ProjectSchema>): DashboardProjectMetrics {
  return {
    key: value.key,
    study: value.study,
    role: value.role,
    projectId: value.project_id,
    title: value.title,
    status: value.status,
    enrollmentAuthority: value.enrollment_authority,
    records: value.records,
    recordsSuppressed: value.records_suppressed,
    eventRecords: value.event_records,
    eventRecordsSuppressed: value.event_records_suppressed,
    events: parseEvents(value.events),
    forms: parseForms(value.forms),
    errorCode: value.error?.code ?? null,
  };
}

/** Validate and normalize the public, aggregate-only REDCap metrics artifact. */
export function parseDashboardMetrics(input: unknown): DashboardMetrics {
  const parsed = DashboardMetricsSchema.parse(input);

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
      status: parsed.portfolio.status,
      studiesTotal: parsed.portfolio.studies_total,
      studiesReporting: parsed.portfolio.studies_reporting,
      studyEnrollments: parsed.portfolio.study_enrollments,
      studyEnrollmentsSuppressed: parsed.portfolio.study_enrollments_suppressed,
      eventRecords: parsed.portfolio.event_records,
      eventRecordsSuppressed: parsed.portfolio.event_records_suppressed,
      forms: parseForms(parsed.portfolio.forms),
    },
    studies: parsed.studies.map(parseStudy),
    projects: parsed.projects.map(parseProject),
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
