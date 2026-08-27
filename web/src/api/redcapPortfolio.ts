/**
 * REDCap metadata watcher client.
 *
 * Reads the aggregate artifact written by
 * `scripts/build_redcap_portfolio_data.py` and exposes the derived views the
 * portfolio page renders: field inventory decoding, cross-project instrument
 * harmonization, and study roll-ups.
 *
 * The artifact carries instrument *structure* and *completion counts* only. It
 * has no verbatim item text (those labels are licensed assessment wording), no
 * identifier field names, and no record data. The envelope asserts all three,
 * and the parser below refuses a payload that claims otherwise, so a backend
 * regression fails loudly here instead of rendering.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";

export const REDCAP_PORTFOLIO_URL = "/dashboard/data/redcap_portfolio.json";
export const REDCAP_PORTFOLIO_QUERY_KEY = ["redcap", "portfolio", "metadata", "v1"] as const;

/** Flag bits on each field-inventory row. There is no identifier bit: those
 *  fields are withheld by the backend and never reach this payload. */
export const FIELD_FLAG_REQUIRED = 1;
export const FIELD_FLAG_BRANCHING = 2;
export const FIELD_FLAG_VALIDATED = 4;

const CompletionSchema = z.object({
  complete: z.number().int().nullable(),
  unverified: z.number().int().nullable(),
  incomplete: z.number().int().nullable(),
  not_started: z.number().int().nullable(),
  started: z.number().int().nullable(),
  total: z.number().int().nullable(),
  rate: z.number().nullable(),
  suppressed: z.boolean(),
});

const InstrumentRowSchema = CompletionSchema.extend({
  name: z.string(),
  label: z.string(),
  fields: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
});

const EventRowSchema = z.object({
  name: z.string(),
  label: z.string(),
  records: z.number().int().nullable(),
  rows: z.number().int().nullable(),
  started: z.number().int().nullable(),
  rate: z.number().nullable(),
  suppressed: z.boolean(),
});

const QualitySchema = z.object({
  check: z.string(),
  count: z.number().int().nonnegative(),
  detail: z.string(),
});

const ProjectSchema = z.object({
  key: z.string(),
  study: z.string(),
  role: z.string(),
  project_id: z.number().int().nullable(),
  title: z.string(),
  status: z.string(),
  error: z.string().nullish(),
  longitudinal: z.boolean().optional(),
  repeating: z.boolean().optional(),
  surveys: z.boolean().optional(),
  records: z.number().int().nullish(),
  record_events: z.number().int().nullish(),
  instruments: z.number().int().nonnegative().optional(),
  fields: z.number().int().nonnegative().optional(),
  fields_published: z.number().int().nonnegative().optional(),
  identifier_fields_withheld: z.number().int().nonnegative().optional(),
  required_fields: z.number().int().nonnegative().optional(),
  branching_fields: z.number().int().nonnegative().optional(),
  events: z.number().int().nonnegative().optional(),
  completion: CompletionSchema.optional(),
  field_types: z.array(z.tuple([z.string(), z.number().int()])).optional(),
  instrument_rows: z.array(InstrumentRowSchema).optional(),
  event_rows: z.array(EventRowSchema).optional(),
  quality: z.array(QualitySchema).optional(),
});

const StudySchema = z.object({
  key: z.string(),
  label: z.string(),
  target: z.number().int().nullable(),
  status: z.string(),
  projects_total: z.number().int().nonnegative(),
  projects_ok: z.number().int().nonnegative(),
  project_keys: z.array(z.string()),
  records: z.number().int().nullable(),
  instruments: z.number().int().nonnegative(),
  fields: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  completion: CompletionSchema,
});

const MatrixRowSchema = z.object({
  name: z.string(),
  label: z.string(),
  projects: z.array(z.string()),
  studies: z.array(z.string()),
  project_count: z.number().int().nonnegative(),
  study_count: z.number().int().nonnegative(),
});

const FieldInventorySchema = z.object({
  projects: z.array(z.string()),
  forms: z.array(z.string()),
  types: z.array(z.string()),
  validations: z.array(z.string()),
  // [projectIdx, formIdx, typeIdx, validationIdx, fieldName, choices, flags]
  rows: z.array(
    z.tuple([
      z.number().int(),
      z.number().int(),
      z.number().int(),
      z.number().int(),
      z.string(),
      z.number().int(),
      z.number().int(),
    ]),
  ),
});

const PortfolioSchema = z.object({
  schema: z.literal("redcap.metadata.v1"),
  data_version: z.string(),
  generated_at: z.string().min(1),
  aggregate_only: z.literal(true),
  contains_item_text: z.literal(false),
  contains_record_data: z.literal(false),
  identifier_fields_withheld: z.literal(true),
  read_only: z.literal(true),
  small_cell_threshold: z.number().int().positive(),
  refresh_cadence_seconds: z.number().int().positive(),
  // Optional so an artifact built before this field existed still parses.
  sla_seconds: z.number().int().positive().optional(),
  projects_total: z.number().int().nonnegative(),
  projects_ok: z.number().int().nonnegative(),
  instruments_total: z.number().int().nonnegative(),
  fields_total: z.number().int().nonnegative(),
  studies: z.array(StudySchema),
  projects: z.array(ProjectSchema),
  failed: z.array(
    z.object({ key: z.string(), study: z.string(), title: z.string(), error: z.string() }),
  ),
  matrix: z.array(MatrixRowSchema),
  overlap: z.object({ keys: z.array(z.string()), cells: z.array(z.array(z.number().int())) }),
  fields: FieldInventorySchema,
});

export type RedcapCompletion = z.infer<typeof CompletionSchema>;
export type RedcapInstrumentRow = z.infer<typeof InstrumentRowSchema>;
export type RedcapEventRow = z.infer<typeof EventRowSchema>;
export type RedcapQualitySignal = z.infer<typeof QualitySchema>;
export type RedcapPortfolioProject = z.infer<typeof ProjectSchema>;
export type RedcapPortfolioStudy = z.infer<typeof StudySchema>;
export type RedcapMatrixRow = z.infer<typeof MatrixRowSchema>;
export type RedcapPortfolio = z.infer<typeof PortfolioSchema>;

export function parseRedcapPortfolio(input: unknown): RedcapPortfolio {
  return PortfolioSchema.parse(input);
}

async function fetchRedcapPortfolio(): Promise<RedcapPortfolio> {
  const response = await fetch(REDCAP_PORTFOLIO_URL, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Portfolio metadata unavailable (${response.status})`);
  return parseRedcapPortfolio(await response.json());
}

export function useRedcapPortfolio(): UseQueryResult<RedcapPortfolio, Error> {
  return useQuery({
    queryKey: REDCAP_PORTFOLIO_QUERY_KEY,
    queryFn: fetchRedcapPortfolio,
    // Poll at the cadence the artifact itself publishes rather than a literal.
    // This was pinned at five minutes to match a sync that was believed to run
    // every five minutes; it does not -- GitHub throttles it to roughly every
    // 30 -- so five-minute polling was fetching the same bytes about six times
    // over. Half the published cadence keeps the freshness stamp current
    // without hammering the CDN. Falls back to five minutes until the first
    // payload lands, and for older artifacts that omit the field.
    staleTime: 5 * 60_000,
    refetchInterval: (query) => {
      const cadence = query.state.data?.refresh_cadence_seconds;
      return cadence ? (cadence / 2) * 1000 : 5 * 60_000;
    },
    retry: 1,
  });
}

/* ── Derived views ──────────────────────────────────────────────────────── */

export interface DecodedField {
  project: string;
  form: string;
  fieldName: string;
  type: string;
  validation: string;
  choices: number;
  required: boolean;
  branching: boolean;
  validated: boolean;
}

/** Expand the dictionary-encoded inventory into rows the explorer can filter. */
export function decodeFields(portfolio: RedcapPortfolio | null | undefined): DecodedField[] {
  if (!portfolio) return [];
  const { projects, forms, types, validations, rows } = portfolio.fields;
  return rows.map(([projectIdx, formIdx, typeIdx, validationIdx, fieldName, choices, flags]) => ({
    project: projects[projectIdx] ?? "—",
    form: forms[formIdx] ?? "—",
    fieldName,
    type: types[typeIdx] ?? "—",
    validation: validations[validationIdx] ?? "",
    choices,
    required: (flags & FIELD_FLAG_REQUIRED) !== 0,
    branching: (flags & FIELD_FLAG_BRANCHING) !== 0,
    validated: (flags & FIELD_FLAG_VALIDATED) !== 0,
  }));
}

export type HarmonizationVerdict = "identical" | "type differs" | "partial";

export interface HarmonizedField {
  fieldName: string;
  /** Field type per project key; absent when that project omits the field. */
  byProject: Record<string, string>;
  presentIn: number;
  verdict: HarmonizationVerdict;
}

/**
 * Compare one instrument field-by-field across the projects that define it.
 *
 * Verdicts describe *definition* drift only. Two projects can agree on a
 * field's name and type and still ask different questions with it; the item
 * wording that would settle that is deliberately not published.
 */
export function compareInstrument(
  fields: DecodedField[],
  instrument: string,
  projectKeys: string[],
): HarmonizedField[] {
  const scoped = new Set(projectKeys);
  const byField = new Map<string, Record<string, string>>();

  for (const field of fields) {
    if (field.form !== instrument || !scoped.has(field.project)) continue;
    const entry = byField.get(field.fieldName) ?? {};
    entry[field.project] = field.type;
    byField.set(field.fieldName, entry);
  }

  return [...byField.entries()]
    .map(([fieldName, byProject]) => {
      const presentIn = Object.keys(byProject).length;
      const distinctTypes = new Set(Object.values(byProject));
      let verdict: HarmonizationVerdict;
      if (presentIn < projectKeys.length) verdict = "partial";
      else if (distinctTypes.size > 1) verdict = "type differs";
      else verdict = "identical";
      return { fieldName, byProject, presentIn, verdict };
    })
    .sort(
      (a, b) =>
        VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] ||
        a.fieldName.localeCompare(b.fieldName),
    );
}

const VERDICT_ORDER: Record<HarmonizationVerdict, number> = {
  "type differs": 0,
  partial: 1,
  identical: 2,
};

export function harmonizationHeadline(
  comparison: HarmonizedField[],
): Record<HarmonizationVerdict | "fields", number> {
  const headline = { fields: comparison.length, identical: 0, "type differs": 0, partial: 0 };
  for (const row of comparison) headline[row.verdict] += 1;
  return headline;
}

/** Instruments defined by at least two of the given projects. */
export function sharedInstruments(
  portfolio: RedcapPortfolio | null | undefined,
  projectKeys: string[],
): RedcapMatrixRow[] {
  if (!portfolio) return [];
  const scoped = new Set(projectKeys);
  return portfolio.matrix
    .map((row) => ({ ...row, projects: row.projects.filter((key) => scoped.has(key)) }))
    .filter((row) => row.projects.length >= 2)
    .sort((a, b) => b.projects.length - a.projects.length || a.name.localeCompare(b.name));
}

export interface PortfolioTotals {
  records: number | null;
  instruments: number;
  fields: number;
  events: number;
  complete: number | null;
  started: number | null;
  rate: number | null;
  suppressed: boolean;
}

/** Roll healthy projects up to the headline numbers on the Portfolio tab. */
export function portfolioTotals(
  portfolio: RedcapPortfolio | null | undefined,
): PortfolioTotals {
  const empty: PortfolioTotals = {
    records: null,
    instruments: 0,
    fields: 0,
    events: 0,
    complete: null,
    started: null,
    rate: null,
    suppressed: false,
  };
  if (!portfolio) return empty;

  let records = 0;
  let recordsKnown = true;
  let complete = 0;
  let started = 0;
  let suppressed = false;

  for (const study of portfolio.studies) {
    empty.instruments += study.instruments;
    empty.fields += study.fields;
    empty.events += study.events;
    // Enrollment sums by study, never by project: a study's lab project holds
    // the same participants as its survey project.
    if (study.records === null) recordsKnown = false;
    else records += study.records;
    if (study.completion.suppressed) suppressed = true;
    complete += study.completion.complete ?? 0;
    started += study.completion.started ?? 0;
  }

  return {
    ...empty,
    records: recordsKnown ? records : null,
    complete: suppressed ? null : complete,
    started: suppressed ? null : started,
    rate: suppressed || !started ? null : Math.round((complete / started) * 1000) / 10,
    suppressed,
  };
}

export interface PortfolioFreshness {
  generatedAt: string | null;
  ageSeconds: number | null;
  /** `stale` once the artifact is older than the portfolio's published SLA. */
  status: "live" | "stale" | "unavailable";
  label: string;
}

/**
 * Freshness budget in seconds.
 *
 * Uses the SLA the backend publishes, which is the same budget every other
 * dashboard surface is judged against — an earlier version of this page
 * invented `cadence * 2`, which flagged stale on a different schedule than the
 * rest of the site for the same underlying data. Falls back to the SLA's
 * historical value only when an older artifact omits the field.
 */
function freshnessBudgetSeconds(portfolio: RedcapPortfolio): number {
  return portfolio.sla_seconds ?? portfolio.refresh_cadence_seconds * 3;
}

export function portfolioFreshness(
  portfolio: RedcapPortfolio | null | undefined,
  now: number = Date.now(),
): PortfolioFreshness {
  if (!portfolio) {
    return {
      generatedAt: null,
      ageSeconds: null,
      status: "unavailable",
      label: "not published",
    };
  }
  const parsed = Date.parse(portfolio.generated_at);
  if (Number.isNaN(parsed)) {
    return {
      generatedAt: portfolio.generated_at,
      ageSeconds: null,
      status: "stale",
      label: "timestamp unreadable",
    };
  }
  const ageSeconds = Math.max(0, Math.round((now - parsed) / 1000));
  const stale = ageSeconds > freshnessBudgetSeconds(portfolio);
  return {
    generatedAt: portfolio.generated_at,
    ageSeconds,
    status: stale ? "stale" : "live",
    label: formatAge(ageSeconds),
  };
}

function formatAge(seconds: number): string {
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** Healthy projects only; a failed project has no structure to show. */
export function healthyProjects(
  portfolio: RedcapPortfolio | null | undefined,
): RedcapPortfolioProject[] {
  return (portfolio?.projects ?? []).filter((project) => project.status === "ok");
}
