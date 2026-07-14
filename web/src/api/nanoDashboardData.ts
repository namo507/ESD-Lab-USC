import { useQuery, type UseQueryResult } from "@tanstack/react-query";

export const NANO_DASHBOARD_DATA_URL = "/dashboard/data/nano_dashboard_data.json";

export type NullableNumber = number | null;

export interface NanoDashboardMeta {
  study: string | null;
  longName: string | null;
  state: string | null;
  asOf: string | null;
  target: NullableNumber;
  source: string | null;
  aggregateOnly: boolean | null;
}

export interface NanoEnrollmentGroup {
  group: string;
  target: NullableNumber;
  enrolled: NullableNumber;
}

export interface NanoFunnelStage {
  stage: string;
  count: NullableNumber;
}

export interface NanoEnrollment {
  target: NullableNumber;
  enrolled: NullableNumber;
  active: NullableNumber;
  retentionPct: NullableNumber;
  byGroup: NanoEnrollmentGroup[];
  funnel: NanoFunnelStage[];
  byGaStratum: Array<{ label: string; count: NullableNumber }>;
  bySite: Array<{ label: string; count: NullableNumber }>;
}

export interface NanoAttentionPhase {
  phase: string;
  pct: NullableNumber;
}

export interface NanoAttentionWindow {
  window: string;
  sustainedPct: NullableNumber;
}

export interface NanoGroupAttentionWindow extends NanoAttentionWindow {
  group: string;
  hdaQualityBpm: NullableNumber;
}

export interface NanoAttention {
  hdaSustainedPct: NullableNumber;
  phases: NanoAttentionPhase[];
  hdaQualityBpm: NullableNumber;
  byWindow: NanoAttentionWindow[];
  byGroupWindow: NanoGroupAttentionWindow[];
}

export interface NanoAutonomicWindow {
  window: string;
  rsaBaselineMs2: NullableNumber;
  cptdMeanC: NullableNumber;
  group?: string;
}

export interface NanoAutonomic {
  rsaBaselineMs2: NullableNumber;
  cptdMeanC: NullableNumber;
  byWindow: NanoAutonomicWindow[];
  byGroupWindow: NanoAutonomicWindow[];
}

export interface NanoScheduleTimepoint {
  id: string;
  due: NullableNumber;
  upcoming14d: NullableNumber;
  overdue: NullableNumber;
  completed: NullableNumber;
  windowAdherencePct: NullableNumber;
}

export interface NanoPipelineStage {
  stage: string;
  count: NullableNumber;
  delta7d: NullableNumber;
  qcPassPct: NullableNumber;
  qaPassed: NullableNumber;
}

export interface NanoPipelineSummary {
  qaPassedSessions: NullableNumber;
}

export interface NanoAssessment {
  instrument: string;
  timepoint: string;
  complete: NullableNumber;
  expected: NullableNumber;
  pctComplete: NullableNumber;
  applicable: boolean | null;
}

export interface NanoInventoryItem {
  item: string;
  category: string | null;
  inUse: NullableNumber;
  available: NullableNumber;
  calibrationDue: NullableNumber;
  reorderThreshold: NullableNumber;
  lowStock: boolean | null;
  status: string | null;
}

export interface NanoChecklistItem {
  key: string;
  done: NullableNumber;
  total: NullableNumber;
}

export interface NanoChecklists {
  onboarding: NanoChecklistItem[];
  visitPrep: NanoChecklistItem[];
  qc: NanoChecklistItem[];
  openQcActions: NullableNumber;
  sopAckPct: NullableNumber;
}

export interface NanoRedcap {
  apiTokenValid: boolean | null;
  lastSync: string | null;
  recordsLocked: NullableNumber;
  doubleEntryDiscrepancies: NullableNumber;
  instrumentsDefined: NullableNumber;
  dags: NullableNumber;
  syncHealth: string | null;
}

export interface NanoModels {
  aim3Status: string | null;
  bestMetric: NullableNumber;
  shapReady: boolean | null;
  candidates: Array<Record<string, unknown>>;
}

export interface NanoLibrary {
  href: string | null;
  label: string | null;
  indexSource: string | null;
  indexedDocuments: NullableNumber;
  lastIndexed: string | null;
}

export interface NanoDashboardData {
  meta: NanoDashboardMeta;
  enrollment: NanoEnrollment;
  attention: NanoAttention;
  autonomic: NanoAutonomic;
  schedule: NanoScheduleTimepoint[];
  pipeline: NanoPipelineStage[];
  pipelineSummary: NanoPipelineSummary;
  assessments: NanoAssessment[];
  inventory: NanoInventoryItem[];
  checklists: NanoChecklists;
  redcap: NanoRedcap;
  models: NanoModels;
  library: NanoLibrary;
}

export function nanoQaPassedHeadline(
  data: Pick<NanoDashboardData, "pipeline" | "pipelineSummary">,
): NullableNumber {
  if (data.pipelineSummary.qaPassedSessions !== null) {
    return data.pipelineSummary.qaPassedSessions;
  }
  const stageQa = data.pipeline
    .map((stage) => stage.qaPassed)
    .filter((value): value is number => value !== null);
  if (stageQa.length) return Math.max(...stageQa);
  const modelReady = data.pipeline.find((stage) => /model.?ready|models?/i.test(stage.stage))
    ?? data.pipeline.at(-1);
  return modelReady?.count ?? null;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): NullableNumber {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function countRecord(value: unknown): Array<{ label: string; count: NullableNumber }> {
  if (Array.isArray(value)) {
    return records(value)
      .map((row) => ({
        label: text(row.label) ?? text(row.stratum) ?? text(row.site) ?? "",
        count: number(row.count) ?? number(row.n) ?? number(row.enrolled),
      }))
      .filter((row) => row.label);
  }

  return Object.entries(record(value)).map(([label, count]) => ({ label, count: number(count) }));
}

function checklistItems(value: unknown): NanoChecklistItem[] {
  return records(value)
    .map((row) => ({
      key: text(row.key) ?? text(row.label) ?? "",
      done: number(row.done),
      total: number(row.total),
    }))
    .filter((row) => row.key);
}

function legacyEnrollmentGroups(nano: JsonRecord, legacyMeta: JsonRecord): NanoEnrollmentGroup[] {
  const enrollment = record(nano.enrollment);
  const rows: NanoEnrollmentGroup[] = [
    { group: "ASIB", enrolled: number(enrollment.asib), target: number(legacyMeta.n_target_asib) },
    { group: "PT", enrolled: number(enrollment.pt), target: number(legacyMeta.n_target_pt) },
    { group: "TD", enrolled: number(enrollment.td), target: number(legacyMeta.n_target_td) },
  ];
  return rows.filter((row) => row.enrolled !== null || row.target !== null);
}

function activeFromLegacy(nano: JsonRecord): NullableNumber {
  const values = Object.values(record(nano.active_followup))
    .map(number)
    .filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

/**
 * Converts the additive aggregate NANO contract into a null-aware UI model.
 * Legacy research keys are read only as a transition fallback. No synthetic
 * values are invented in the browser, so a missing leaf remains visibly empty.
 */
export function normalizeNanoDashboardData(payload: unknown): NanoDashboardData {
  const root = record(payload);
  const nano = record(root.nano);
  const meta = record(nano.meta);
  const legacyMeta = record(nano.study_meta);
  const enrollment = record(nano.enrollment);
  const attention = record(nano.attention);
  const autonomic = record(nano.autonomic);
  const schedule = record(nano.schedule);
  const pipelineSummary = record(nano.pipeline_summary);
  const checklists = record(nano.checklists);
  const redcap = record(nano.redcap);
  const models = record(nano.models);
  const library = record(nano.library);

  const byGroup = records(enrollment.by_group)
    .map((row) => ({
      group: text(row.group) ?? "",
      target: number(row.target),
      enrolled: number(row.enrolled),
    }))
    .filter((row) => row.group);

  return {
    meta: {
      study: text(meta.study) ?? (legacyMeta.award ? "NANO" : null),
      longName: text(meta.long_name),
      state: text(meta.state),
      asOf: text(meta.as_of) ?? text(enrollment.last_updated),
      target: number(meta.n_target) ?? number(legacyMeta.n_target),
      source: text(meta.source) ?? text(record(root.meta).source),
      aggregateOnly: boolean(meta.aggregate_only),
    },
    enrollment: {
      target: number(enrollment.target) ?? number(meta.n_target) ?? number(legacyMeta.n_target),
      enrolled: number(enrollment.enrolled) ?? number(enrollment.total),
      active: number(enrollment.active) ?? activeFromLegacy(nano),
      retentionPct: number(enrollment.retention_pct),
      byGroup: byGroup.length ? byGroup : legacyEnrollmentGroups(nano, legacyMeta),
      funnel: records(enrollment.funnel)
        .map((row) => ({ stage: text(row.stage) ?? "", count: number(row.n) }))
        .filter((row) => row.stage),
      byGaStratum: countRecord(enrollment.age_at_intake).length
        ? countRecord(enrollment.age_at_intake)
        : countRecord(enrollment.by_ga_stratum),
      bySite: countRecord(enrollment.by_site),
    },
    attention: {
      hdaSustainedPct: number(attention.hda_sustained_pct),
      phases: records(attention.phases)
        .map((row) => ({ phase: text(row.phase) ?? "", pct: number(row.pct) }))
        .filter((row) => row.phase),
      hdaQualityBpm: number(attention.hda_quality_bpm),
      byWindow: records(attention.by_window)
        .map((row) => ({ window: text(row.window) ?? "", sustainedPct: number(row.sustained_pct) }))
        .filter((row) => row.window),
      byGroupWindow: records(attention.by_group_window)
        .map((row) => ({
          group: text(row.group) ?? "",
          window: text(row.window) ?? "",
          sustainedPct: number(row.sustained_pct),
          hdaQualityBpm: number(row.hda_quality_bpm),
        }))
        .filter((row) => row.group && row.window),
    },
    autonomic: {
      rsaBaselineMs2: number(autonomic.rsa_baseline_ms2),
      cptdMeanC: number(autonomic.cptd_mean_c),
      byWindow: records(autonomic.by_window)
        .map((row) => ({
          window: text(row.window) ?? "",
          rsaBaselineMs2: number(row.rsa_baseline_ms2),
          cptdMeanC: number(row.cptd_mean_c),
        }))
        .filter((row) => row.window),
      byGroupWindow: records(autonomic.by_group_window)
        .map((row) => ({
          group: text(row.group) ?? "",
          window: text(row.window) ?? "",
          rsaBaselineMs2: number(row.rsa_baseline_ms2),
          cptdMeanC: number(row.cptd_mean_c),
        }))
        .filter((row) => row.group && row.window),
    },
    schedule: records(schedule.timepoints)
      .map((row) => ({
        id: text(row.id) ?? "",
        due: number(row.due),
        upcoming14d: number(row.upcoming_14d),
        overdue: number(row.overdue),
        completed: number(row.completed),
        windowAdherencePct: number(row.window_adherence_pct),
      }))
      .filter((row) => row.id),
    pipeline: records(nano.pipeline)
      .map((row) => ({
        stage: text(row.stage) ?? "",
        count: number(row.count),
        delta7d: number(row.delta_7d),
        qcPassPct: number(row.qc_pass_pct),
        qaPassed: number(row.qa_passed),
      }))
      .filter((row) => row.stage),
    pipelineSummary: {
      qaPassedSessions: number(pipelineSummary.qa_passed_sessions),
    },
    assessments: records(nano.assessments)
      .map((row) => ({
        instrument: text(row.instrument) ?? "",
        timepoint: text(row.timepoint) ?? "",
        complete: number(row.complete),
        expected: number(row.expected),
        pctComplete: number(row.pct_complete),
        applicable: boolean(row.applicable),
      }))
      .filter((row) => row.instrument && row.timepoint && row.applicable !== false),
    inventory: records(nano.inventory)
      .map((row) => ({
        item: text(row.item) ?? "",
        category: text(row.category),
        inUse: number(row.in_use),
        available: number(row.available),
        calibrationDue: number(row.calibration_due),
        reorderThreshold: number(row.reorder_threshold),
        lowStock: boolean(row.low_stock),
        status: text(row.status),
      }))
      .filter((row) => row.item),
    checklists: {
      onboarding: checklistItems(checklists.onboarding),
      visitPrep: checklistItems(checklists.visit_prep),
      qc: checklistItems(checklists.qc),
      openQcActions: number(checklists.open_qc_actions),
      sopAckPct: number(checklists.sop_ack_pct),
    },
    redcap: {
      apiTokenValid: boolean(redcap.api_token_valid),
      lastSync: text(redcap.last_sync),
      recordsLocked: number(redcap.records_locked),
      doubleEntryDiscrepancies: number(redcap.double_entry_discrepancies),
      instrumentsDefined: number(redcap.instruments_defined),
      dags: number(redcap.dags),
      syncHealth: text(redcap.sync_health),
    },
    models: {
      aim3Status: text(models.aim3_status),
      bestMetric: number(models.best_metric),
      shapReady: boolean(models.shap_ready),
      candidates: records(models.candidates),
    },
    library: {
      href: text(library.href),
      label: text(library.label),
      indexSource: text(library.index_source),
      indexedDocuments: number(library.indexed_documents),
      lastIndexed: text(library.last_indexed),
    },
  };
}

export async function fetchNanoDashboardData(): Promise<NanoDashboardData> {
  const response = await fetch(NANO_DASHBOARD_DATA_URL, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return normalizeNanoDashboardData(await response.json());
}

export function useNanoDashboardData(): UseQueryResult<NanoDashboardData> {
  return useQuery({
    queryKey: ["study", "nano-dashboard"],
    queryFn: fetchNanoDashboardData,
    staleTime: 60_000,
    gcTime: 15 * 60_000,
  });
}
