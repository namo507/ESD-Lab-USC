/**
 * Structural REDCap data dictionary.
 *
 * Describes instrument and field *shape* only. The backend never exports
 * verbatim `field_label` text (those are licensed assessment items) and
 * withholds fields REDCap flags as direct identifiers, keeping only a count so
 * totals still reconcile. The envelope states both facts explicitly and this
 * parser refuses a payload that claims otherwise.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { z } from "zod";

export const REDCAP_DICTIONARY_URL = "/dashboard/data/redcap_dictionary.json";
export const REDCAP_DICTIONARY_QUERY_KEY = ["redcap", "dictionary", "v1"] as const;

const FieldSchema = z.object({
  field_name: z.string(),
  form_name: z.string(),
  field_type: z.string(),
  required: z.boolean(),
  branching: z.boolean(),
  validation: z.string(),
  choices: z.number().int().nonnegative(),
});

const InstrumentSchema = z.object({
  name: z.string(),
  label: z.string(),
  fields_total: z.number().int().nonnegative(),
  fields_published: z.number().int().nonnegative(),
  identifier_fields_withheld: z.number().int().nonnegative(),
  required_fields: z.number().int().nonnegative(),
  branching_fields: z.number().int().nonnegative(),
  field_types: z.record(z.number().int().nonnegative()),
  fields: z.array(FieldSchema),
});

const ProjectSchema = z.object({
  key: z.string(),
  study: z.string().nullish(),
  project_id: z.number().int().nullish(),
  title: z.string().nullish(),
  instruments_total: z.number().int().nonnegative().optional(),
  fields_total: z.number().int().nonnegative().optional(),
  fields_published: z.number().int().nonnegative().optional(),
  identifier_fields_withheld: z.number().int().nonnegative().optional(),
  instruments: z.array(InstrumentSchema).optional(),
  error: z.string().nullish(),
});

const DictionarySchema = z.object({
  schema: z.literal("redcap.dictionary.v1"),
  generated_at: z.string().min(1),
  aggregate_only: z.literal(true),
  // A payload that carries item text or record data is rejected outright
  // rather than rendered, so a backend regression fails loudly here.
  contains_item_text: z.literal(false),
  contains_record_data: z.literal(false),
  projects_total: z.number().int().nonnegative(),
  projects_ok: z.number().int().nonnegative(),
  instruments_total: z.number().int().nonnegative(),
  fields_total: z.number().int().nonnegative(),
  projects: z.array(ProjectSchema),
});

export type RedcapDictionaryField = z.infer<typeof FieldSchema>;
export type RedcapInstrument = z.infer<typeof InstrumentSchema>;
export type RedcapDictionaryProject = z.infer<typeof ProjectSchema>;
export type RedcapDictionary = z.infer<typeof DictionarySchema>;

export function parseRedcapDictionary(input: unknown): RedcapDictionary {
  return DictionarySchema.parse(input);
}

async function fetchRedcapDictionary(): Promise<RedcapDictionary> {
  const response = await fetch(REDCAP_DICTIONARY_URL, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Dictionary unavailable (${response.status})`);
  return parseRedcapDictionary(await response.json());
}

export function useRedcapDictionary(): UseQueryResult<RedcapDictionary, Error> {
  return useQuery({
    queryKey: REDCAP_DICTIONARY_QUERY_KEY,
    queryFn: fetchRedcapDictionary,
    // The dictionary changes when instruments are edited, not every sync.
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

/** Projects for a study scope; `all` returns every healthy project. */
export function selectDictionaryProjects(
  dictionary: RedcapDictionary | null | undefined,
  scope: string,
): RedcapDictionaryProject[] {
  if (!dictionary) return [];
  const normalized = scope.trim().toLowerCase();
  return dictionary.projects.filter(
    (project) =>
      !project.error && (normalized === "all" || project.study?.toLowerCase() === normalized),
  );
}

export interface DictionaryScopeSummary {
  projects: number;
  instruments: number;
  fields: number;
  identifierFieldsWithheld: number;
  requiredFields: number;
  branchingFields: number;
  /** Field-type counts across the scope, largest first. */
  fieldTypes: Array<{ type: string; count: number }>;
}

/** Roll instrument structure up to a study scope. */
export function summarizeDictionaryScope(
  projects: RedcapDictionaryProject[],
): DictionaryScopeSummary {
  const types = new Map<string, number>();
  let instruments = 0;
  let fields = 0;
  let withheld = 0;
  let required = 0;
  let branching = 0;

  for (const project of projects) {
    for (const instrument of project.instruments ?? []) {
      instruments += 1;
      fields += instrument.fields_total;
      withheld += instrument.identifier_fields_withheld;
      required += instrument.required_fields;
      branching += instrument.branching_fields;
      for (const [type, count] of Object.entries(instrument.field_types)) {
        types.set(type, (types.get(type) ?? 0) + count);
      }
    }
  }

  return {
    projects: projects.length,
    instruments,
    fields,
    identifierFieldsWithheld: withheld,
    requiredFields: required,
    branchingFields: branching,
    fieldTypes: [...types.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
  };
}
