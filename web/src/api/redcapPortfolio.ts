/**
 * Aggregate-only REDCap portfolio structure.
 *
 * Two static artifacts are published by scripts/build_redcap_portfolio_data.py
 * and revalidated on every request:
 *
 *   redcap_portfolio.json         summary (projects, instruments, events, quality)
 *   redcap_portfolio_fields.json  dictionary-encoded field inventory, fetched on
 *                                 demand by the Field Explorer and the
 *                                 field-level harmonization view
 *
 * Both are small-cell suppressed server-side: a hidden count arrives as null
 * with its `*Suppressed` flag set, and this module never infers it back.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";

export const REDCAP_PORTFOLIO_URL = "/dashboard/data/redcap_portfolio.json";
export const REDCAP_PORTFOLIO_FIELDS_URL = "/dashboard/data/redcap_portfolio_fields.json";
export const REDCAP_PORTFOLIO_QUERY_KEY = ["redcap", "portfolio", "v1"] as const;
export const REDCAP_PORTFOLIO_FIELDS_QUERY_KEY = ["redcap", "portfolio-fields", "v1"] as const;

export const PORTFOLIO_SCHEMA = "redcap.portfolio.metadata.v1";
export const PORTFOLIO_FIELDS_SCHEMA = "redcap.portfolio.fields.v1";

export const FLAG_REQUIRED = 1;
export const FLAG_IDENTIFIER = 2;
export const FLAG_BRANCHING = 4;
export const FLAG_LABELLED = 8;
export const FLAG_VALIDATED = 16;

/**
 * Fixed, non-cycling study colours so a study keeps one colour everywhere.
 * The values live in the design tokens (`--study-*`) and are re-stepped for
 * the dark surface there rather than being flipped at render time.
 */
export const STUDY_COLORS: Record<string, string> = {
  nano: "var(--study-nano)",
  nico: "var(--study-nico)",
  ipsa: "var(--study-ipsa)",
  action: "var(--study-action)",
  abc: "var(--study-abc)",
};

export const STATUS_COLORS = {
  complete: "var(--status-green)",
  unverified: "var(--purple)",
  incomplete: "var(--status-red)",
  notStarted: "var(--status-grey)",
} as const;

export function studyColor(study: string): string {
  return STUDY_COLORS[study.toLowerCase()] ?? "var(--slate-400)";
}

const NullableCount = z.number().int().nonnegative().nullable();

const CompletionShape = {
  complete: NullableCount,
  incomplete: NullableCount,
  unverified: NullableCount,
  not_started: NullableCount,
  started: NullableCount,
  counts_suppressed: z.boolean(),
  completion_rate: z.number().finite().min(0).max(100).nullable(),
};

const RawCompletion = z.object(CompletionShape);

const RawInstrumentRow = z.object({
  name: z.string(),
  label: z.string(),
  fields: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  ...CompletionShape,
});

const RawEventRow = z.object({
  name: z.string(),
  label: z.string(),
  records: NullableCount,
  records_suppressed: z.boolean(),
  rows: NullableCount,
  ...CompletionShape,
});

const RawQualityRow = z.object({
  check: z.string(),
  count: z.number().int().nonnegative(),
  detail: z.string(),
});

const RawProject = z.object({
  key: z.string(),
  study: z.string(),
  study_label: z.string(),
  label: z.string(),
  role: z.string(),
  project_id: z.number().int().positive(),
  title: z.string(),
  status: z.string(),
  enrollment_authority: z.boolean(),
  longitudinal: z.boolean(),
  repeating: z.boolean(),
  surveys: z.boolean(),
  records: NullableCount,
  records_suppressed: z.boolean(),
  rows: NullableCount,
  instruments: z.number().int().nonnegative(),
  fields: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  identifier_fields: z.number().int().nonnegative(),
  required_fields: z.number().int().nonnegative(),
  branching_fields: z.number().int().nonnegative(),
  completion: RawCompletion,
  field_types: z.array(z.tuple([z.string(), z.number().int().nonnegative()])),
  instrument_rows: z.array(RawInstrumentRow),
  event_rows: z.array(RawEventRow),
  quality: z.array(RawQualityRow),
  warnings: z.array(z.string()).default([]),
});

const RawPortfolio = z.object({
  schema: z.literal(PORTFOLIO_SCHEMA),
  data_version: z.string(),
  generated_at: z.string(),
  aggregate_only: z.literal(true),
  small_cell_threshold: z.number().int().positive(),
  source: z.object({
    kind: z.string(),
    system: z.string(),
    refresh_cadence_seconds: z.number().int().positive(),
    sla_seconds: z.number().int().positive(),
    projects_total: z.number().int().nonnegative(),
    projects_ok: z.number().int().nonnegative(),
  }),
  totals: z.object({
    projects: z.number().int().nonnegative(),
    projects_ok: z.number().int().nonnegative(),
    studies: z.number().int().nonnegative(),
    studies_reporting: z.number().int().nonnegative(),
    instruments: z.number().int().nonnegative(),
    fields: z.number().int().nonnegative(),
    events: z.number().int().nonnegative(),
    records: NullableCount,
    records_suppressed: z.boolean(),
    identifier_fields: z.number().int().nonnegative(),
    required_fields: z.number().int().nonnegative(),
    branching_fields: z.number().int().nonnegative(),
    completion: RawCompletion,
  }),
  projects: z.array(RawProject),
  failed: z.array(
    z.object({
      key: z.string(),
      study: z.string(),
      label: z.string(),
      project_id: z.number().int().positive(),
      status: z.string(),
      detail: z.string(),
    }),
  ),
  matrix: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      projects: z.number().int().nonnegative(),
      in: z.array(z.string()),
    }),
  ),
  field_index: z.object({
    artifact: z.string(),
    schema: z.string(),
    rows: z.number().int().nonnegative(),
    forms: z.number().int().nonnegative(),
    types: z.number().int().nonnegative(),
  }),
});

const RawFieldIndex = z.object({
  schema: z.literal(PORTFOLIO_FIELDS_SCHEMA),
  data_version: z.string(),
  generated_at: z.string(),
  fields: z.object({
    projects: z.array(z.string()),
    forms: z.array(z.string()),
    types: z.array(z.string()),
    validations: z.array(z.string()),
    rows: z.array(z.array(z.union([z.number(), z.string()]))),
  }),
});

export interface PortfolioCompletion {
  complete: number | null;
  incomplete: number | null;
  unverified: number | null;
  notStarted: number | null;
  started: number | null;
  countsSuppressed: boolean;
  completionRate: number | null;
}

export interface PortfolioInstrumentRow extends PortfolioCompletion {
  name: string;
  label: string;
  fields: number;
  events: number;
}

export interface PortfolioEventRow extends PortfolioCompletion {
  name: string;
  label: string;
  records: number | null;
  recordsSuppressed: boolean;
  rows: number | null;
}

export interface PortfolioQualityRow {
  check: string;
  count: number;
  detail: string;
}

export interface PortfolioProject {
  key: string;
  study: string;
  studyLabel: string;
  label: string;
  role: string;
  projectId: number;
  title: string;
  status: string;
  enrollmentAuthority: boolean;
  longitudinal: boolean;
  repeating: boolean;
  surveys: boolean;
  records: number | null;
  recordsSuppressed: boolean;
  rows: number | null;
  instruments: number;
  fields: number;
  events: number;
  identifierFields: number;
  requiredFields: number;
  branchingFields: number;
  completion: PortfolioCompletion;
  fieldTypes: Array<{ type: string; count: number }>;
  instrumentRows: PortfolioInstrumentRow[];
  eventRows: PortfolioEventRow[];
  quality: PortfolioQualityRow[];
  warnings: string[];
  color: string;
}

export interface PortfolioTotals {
  projects: number;
  projectsOk: number;
  studies: number;
  studiesReporting: number;
  instruments: number;
  fields: number;
  events: number;
  records: number | null;
  recordsSuppressed: boolean;
  identifierFields: number;
  requiredFields: number;
  branchingFields: number;
  completion: PortfolioCompletion;
}

export interface PortfolioFailure {
  key: string;
  study: string;
  label: string;
  projectId: number;
  status: string;
  detail: string;
}

export interface PortfolioMatrixRow {
  name: string;
  label: string;
  projects: number;
  in: string[];
}

export interface RedcapPortfolio {
  schema: string;
  dataVersion: string;
  generatedAt: string;
  smallCellThreshold: number;
  source: {
    kind: string;
    system: string;
    refreshCadenceSeconds: number;
    slaSeconds: number;
    projectsTotal: number;
    projectsOk: number;
  };
  totals: PortfolioTotals;
  projects: PortfolioProject[];
  failed: PortfolioFailure[];
  matrix: PortfolioMatrixRow[];
  fieldIndex: { rows: number; forms: number; types: number };
}

export interface PortfolioField {
  projectKey: string;
  form: string;
  type: string;
  validation: string;
  name: string;
  label: string;
  note: string;
  choices: string;
  choiceCount: number;
  required: boolean;
  identifier: boolean;
  branching: boolean;
  labelled: boolean;
  validated: boolean;
}

export interface PortfolioFieldIndex {
  dataVersion: string;
  generatedAt: string;
  projects: string[];
  forms: string[];
  types: string[];
  validations: string[];
  fields: PortfolioField[];
}

type RawCompletionShape = z.infer<typeof RawCompletion>;

function parseCompletion(raw: RawCompletionShape): PortfolioCompletion {
  return {
    complete: raw.complete,
    incomplete: raw.incomplete,
    unverified: raw.unverified,
    notStarted: raw.not_started,
    started: raw.started,
    countsSuppressed: raw.counts_suppressed,
    completionRate: raw.completion_rate,
  };
}

export function parseRedcapPortfolio(input: unknown): RedcapPortfolio {
  const parsed = RawPortfolio.parse(input);
  return {
    schema: parsed.schema,
    dataVersion: parsed.data_version,
    generatedAt: parsed.generated_at,
    smallCellThreshold: parsed.small_cell_threshold,
    source: {
      kind: parsed.source.kind,
      system: parsed.source.system,
      refreshCadenceSeconds: parsed.source.refresh_cadence_seconds,
      slaSeconds: parsed.source.sla_seconds,
      projectsTotal: parsed.source.projects_total,
      projectsOk: parsed.source.projects_ok,
    },
    totals: {
      projects: parsed.totals.projects,
      projectsOk: parsed.totals.projects_ok,
      studies: parsed.totals.studies,
      studiesReporting: parsed.totals.studies_reporting,
      instruments: parsed.totals.instruments,
      fields: parsed.totals.fields,
      events: parsed.totals.events,
      records: parsed.totals.records,
      recordsSuppressed: parsed.totals.records_suppressed,
      identifierFields: parsed.totals.identifier_fields,
      requiredFields: parsed.totals.required_fields,
      branchingFields: parsed.totals.branching_fields,
      completion: parseCompletion(parsed.totals.completion),
    },
    projects: parsed.projects.map((project) => ({
      key: project.key,
      study: project.study,
      studyLabel: project.study_label,
      label: project.label,
      role: project.role,
      projectId: project.project_id,
      title: project.title,
      status: project.status,
      enrollmentAuthority: project.enrollment_authority,
      longitudinal: project.longitudinal,
      repeating: project.repeating,
      surveys: project.surveys,
      records: project.records,
      recordsSuppressed: project.records_suppressed,
      rows: project.rows,
      instruments: project.instruments,
      fields: project.fields,
      events: project.events,
      identifierFields: project.identifier_fields,
      requiredFields: project.required_fields,
      branchingFields: project.branching_fields,
      completion: parseCompletion(project.completion),
      fieldTypes: project.field_types.map(([type, count]) => ({ type, count })),
      instrumentRows: project.instrument_rows.map((row) => ({
        name: row.name,
        label: row.label,
        fields: row.fields,
        events: row.events,
        ...parseCompletion(row),
      })),
      eventRows: project.event_rows.map((row) => ({
        name: row.name,
        label: row.label,
        records: row.records,
        recordsSuppressed: row.records_suppressed,
        rows: row.rows,
        ...parseCompletion(row),
      })),
      quality: project.quality,
      warnings: project.warnings,
      color: studyColor(project.study),
    })),
    failed: parsed.failed.map((row) => ({
      key: row.key,
      study: row.study,
      label: row.label,
      projectId: row.project_id,
      status: row.status,
      detail: row.detail,
    })),
    matrix: parsed.matrix,
    fieldIndex: {
      rows: parsed.field_index.rows,
      forms: parsed.field_index.forms,
      types: parsed.field_index.types,
    },
  };
}

export function parseRedcapPortfolioFields(input: unknown): PortfolioFieldIndex {
  const parsed = RawFieldIndex.parse(input);
  const { projects, forms, types, validations, rows } = parsed.fields;
  const fields: PortfolioField[] = [];
  for (const row of rows) {
    if (row.length !== 10) continue;
    const flags = Number(row[9]) || 0;
    fields.push({
      projectKey: projects[Number(row[0])] ?? "",
      form: forms[Number(row[1])] ?? "",
      type: types[Number(row[2])] ?? "",
      validation: validations[Number(row[3])] ?? "",
      name: String(row[4] ?? ""),
      label: String(row[5] ?? ""),
      note: String(row[6] ?? ""),
      choices: String(row[7] ?? ""),
      choiceCount: Number(row[8]) || 0,
      required: (flags & FLAG_REQUIRED) !== 0,
      identifier: (flags & FLAG_IDENTIFIER) !== 0,
      branching: (flags & FLAG_BRANCHING) !== 0,
      labelled: (flags & FLAG_LABELLED) !== 0,
      validated: (flags & FLAG_VALIDATED) !== 0,
    });
  }
  return {
    dataVersion: parsed.data_version,
    generatedAt: parsed.generated_at,
    projects,
    forms,
    types,
    validations,
    fields,
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`REDCap portfolio unavailable (${response.status})`);
  return response.json();
}

export function useRedcapPortfolio(): UseQueryResult<RedcapPortfolio, Error> {
  return useQuery({
    queryKey: REDCAP_PORTFOLIO_QUERY_KEY,
    queryFn: async () => parseRedcapPortfolio(await fetchJson(REDCAP_PORTFOLIO_URL)),
    staleTime: 0,
    retry: 1,
    refetchInterval: (query) => {
      const cadence = query.state.data?.source.refreshCadenceSeconds ?? 300;
      return Math.max(30_000, Math.min(cadence * 1_000, 15 * 60_000));
    },
  });
}

/**
 * The field index is an order of magnitude larger than the summary, so it is
 * only fetched once a panel that needs it is opened, and it is cached for the
 * session afterwards.
 */
export function useRedcapPortfolioFields(
  enabled: boolean,
): UseQueryResult<PortfolioFieldIndex, Error> {
  return useQuery({
    queryKey: REDCAP_PORTFOLIO_FIELDS_QUERY_KEY,
    queryFn: async () =>
      parseRedcapPortfolioFields(await fetchJson(REDCAP_PORTFOLIO_FIELDS_URL)),
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

export type PortfolioFreshnessStatus = "live" | "partial" | "stale" | "unavailable";

export interface PortfolioFreshness {
  status: PortfolioFreshnessStatus;
  label: string;
  detail: string;
  isLive: boolean;
  generatedAt: string | null;
  ageSeconds: number | null;
  projectsOk: number;
  projectsTotal: number;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "not verified";
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Resolve the only state allowed to claim a live, complete portfolio read. */
export function getPortfolioFreshness(
  portfolio: RedcapPortfolio | null | undefined,
  now: number | Date = Date.now(),
): PortfolioFreshness {
  if (!portfolio) {
    return {
      status: "unavailable",
      label: "Structure unavailable",
      detail: "No verified REDCap structure snapshot is available.",
      isLive: false,
      generatedAt: null,
      ageSeconds: null,
      projectsOk: 0,
      projectsTotal: 0,
    };
  }

  const nowMs = now instanceof Date ? now.getTime() : now;
  const generatedMs = Date.parse(portfolio.generatedAt);
  const validTimestamp = Number.isFinite(generatedMs);
  const ageSeconds = validTimestamp ? Math.max(0, (nowMs - generatedMs) / 1_000) : null;
  const withinSla = ageSeconds !== null && ageSeconds <= portfolio.source.slaSeconds;
  const allHealthy =
    portfolio.source.projectsTotal > 0
    && portfolio.source.projectsOk === portfolio.source.projectsTotal;
  const generatedLabel = validTimestamp ? formatTimestamp(portfolio.generatedAt) : "not verified";
  const counts = `${portfolio.source.projectsOk}/${portfolio.source.projectsTotal} projects read`;

  if (!validTimestamp || portfolio.source.projectsOk === 0) {
    return {
      status: "unavailable",
      label: "Structure unavailable",
      detail: "No verified REDCap structure snapshot is available.",
      isLive: false,
      generatedAt: validTimestamp ? portfolio.generatedAt : null,
      ageSeconds,
      projectsOk: portfolio.source.projectsOk,
      projectsTotal: portfolio.source.projectsTotal,
    };
  }

  const base = {
    isLive: false,
    generatedAt: portfolio.generatedAt,
    ageSeconds,
    projectsOk: portfolio.source.projectsOk,
    projectsTotal: portfolio.source.projectsTotal,
  };

  if (allHealthy && withinSla) {
    return {
      ...base,
      status: "live",
      label: "Live REDCap structure",
      detail: `Read ${generatedLabel} · ${counts}`,
      isLive: true,
    };
  }
  if (!withinSla) {
    return {
      ...base,
      status: "stale",
      label: "Stale structure",
      detail: `Last read ${generatedLabel} · ${counts}`,
    };
  }
  return {
    ...base,
    status: "partial",
    label: "Partial structure",
    detail: `Read ${generatedLabel} · ${counts}`,
  };
}

export type HarmonizationVerdict = "identical" | "label differs" | "type differs" | "partial";

export interface HarmonizationRow {
  field: string;
  byProject: Record<string, { type: string; label: string } | undefined>;
  present: number;
  verdict: HarmonizationVerdict;
}

/**
 * Compare one instrument field-by-field across the projects that contain it.
 * A field present in every project with the same type and label is identical;
 * anything missing from at least one project is partial.
 */
export function compareInstrument(
  index: PortfolioFieldIndex | null | undefined,
  instrument: string,
  projectKeys: string[],
): HarmonizationRow[] {
  if (!index || !instrument || projectKeys.length < 2) return [];
  const byField = new Map<string, HarmonizationRow>();
  const order: string[] = [];
  const wanted = new Set(projectKeys);

  for (const field of index.fields) {
    if (field.form !== instrument || !wanted.has(field.projectKey)) continue;
    let row = byField.get(field.name);
    if (!row) {
      row = { field: field.name, byProject: {}, present: 0, verdict: "identical" };
      byField.set(field.name, row);
      order.push(field.name);
    }
    if (!row.byProject[field.projectKey]) row.present += 1;
    row.byProject[field.projectKey] = { type: field.type, label: field.label };
  }

  return order.map((name) => {
    const row = byField.get(name)!;
    const present = projectKeys
      .map((key) => row.byProject[key])
      .filter((value): value is { type: string; label: string } => Boolean(value));
    if (present.length < projectKeys.length) return { ...row, verdict: "partial" };
    const types = new Set(present.map((value) => value.type));
    if (types.size > 1) return { ...row, verdict: "type differs" };
    const labels = new Set(present.map((value) => value.label.trim().toLowerCase()));
    if (labels.size > 1) return { ...row, verdict: "label differs" };
    return { ...row, verdict: "identical" };
  });
}

export function harmonizationHeadline(
  rows: HarmonizationRow[],
): Record<HarmonizationVerdict, number> {
  const headline: Record<HarmonizationVerdict, number> = {
    identical: 0,
    "label differs": 0,
    "type differs": 0,
    partial: 0,
  };
  for (const row of rows) headline[row.verdict] += 1;
  return headline;
}
