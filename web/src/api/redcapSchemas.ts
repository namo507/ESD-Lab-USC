import { z } from "zod";
import { ANOMALY_CODES, NORMALIZED_STATUSES } from "@/constants/redcapConfig";

const statusValues = [...NORMALIZED_STATUSES] as [
  "incomplete",
  "unverified",
  "complete",
  "not_started",
  "skipped",
];
const anomalyValues = Object.keys(ANOMALY_CODES) as ["R1", "R2", "R3", "R4", "R5"];

export const CsbsStatus = z.enum(statusValues);
export type CsbsStatus = z.infer<typeof CsbsStatus>;

export const AnomalyCode = z.enum(anomalyValues);
export type AnomalyCode = z.infer<typeof AnomalyCode>;

export const RedcapTimepoint = z.object({
  eventName: z.string().optional(),
  visitDate: z.string().nullable().default(null),
  csbsStatus: CsbsStatus.default("not_started"),
  csbsTimestamp: z.string().nullable().optional().default(null),
});
export type RedcapTimepoint = z.infer<typeof RedcapTimepoint>;

export const RedcapVisitRecord = z.object({
  recordId: z.string(),
  sixMonth: RedcapTimepoint,
  nineMonth: RedcapTimepoint,
  twelveMonth: RedcapTimepoint,
  twentyFourMonth: RedcapTimepoint,
  anomalyFlags: z.array(AnomalyCode),
  hasCarryForwardRisk: z.boolean(),
});
export type RedcapVisitRecord = z.infer<typeof RedcapVisitRecord>;

export const RedcapCompletionStat = z.object({
  label: z.string(),
  complete: z.number(),
  unverified: z.number(),
  incomplete: z.number(),
  not_started: z.number(),
  skipped: z.number(),
  total: z.number(),
});
export type RedcapCompletionStat = z.infer<typeof RedcapCompletionStat>;

export const RedcapMeta = z.object({
  generated_at: z.string(),
  pid: z.number(),
  record_count: z.number(),
  anomaly_count: z.number(),
  source: z.string(),
  contract_version: z.string(),
  payload_version: z.string().optional(),
});
export type RedcapMeta = z.infer<typeof RedcapMeta>;

export const RedcapEnrollmentTracker = z.object({
  event: z.string(),
  label: z.string(),
  expected: z.number(),
  scheduled: z.number(),
  completed: z.number(),
});
export type RedcapEnrollmentTracker = z.infer<typeof RedcapEnrollmentTracker>;

export const RedcapInstrumentCompleteness = z.object({
  instrument: z.string(),
  label: z.string(),
  byEvent: z.record(z.object({
    complete: z.number(),
    total: z.number(),
  })),
});
export type RedcapInstrumentCompleteness = z.infer<typeof RedcapInstrumentCompleteness>;

export const RedcapQueueStage = z.object({
  stage: z.string(),
  count: z.number(),
});
export type RedcapQueueStage = z.infer<typeof RedcapQueueStage>;

export const RedcapTrackers = z.object({
  enrollment: z.array(RedcapEnrollmentTracker).default([]),
  instrument_completeness: z.array(RedcapInstrumentCompleteness).default([]),
  queue_funnel: z.array(RedcapQueueStage).default([]),
  thresholds: z.object({
    completeness_warn_pct: z.number().default(0.8),
    stale_visit_days: z.number().default(30),
  }).partial().default({}),
}).partial({
  thresholds: true,
});
export type RedcapTrackers = z.infer<typeof RedcapTrackers>;

export const RedcapTimelineEvent = z.object({
  event: z.string(),
  label: z.string(),
  month: z.number().optional().default(0),
  visitDate: z.string().default(""),
  status: CsbsStatus.default("not_started"),
  hasRisk: z.boolean().optional().default(false),
});
export type RedcapTimelineEvent = z.infer<typeof RedcapTimelineEvent>;

export const RedcapTimelineRecord = z.object({
  recordId: z.string(),
  events: z.array(RedcapTimelineEvent),
});
export type RedcapTimelineRecord = z.infer<typeof RedcapTimelineRecord>;

export const RedcapTimeline = z.object({
  records: z.array(RedcapTimelineRecord).default([]),
});
export type RedcapTimeline = z.infer<typeof RedcapTimeline>;

export const DashboardControls = z.object({
  anomaly_thresholds: z.object({
    stale_visit_days: z.number(),
    completeness_warn_pct: z.number(),
    freshness_sla_hours: z.number().optional(),
    small_cell_min: z.number().optional(),
  }).partial().default({}),
  clinical_cutoffs: z.object({
    epds_positive: z.number().default(10),
    epds_high: z.number().default(13),
    epds_self_harm_item_min: z.number().default(1),
    asq_monitor: z.number().default(35),
    asq_refer: z.number().default(25),
    visit_window_days: z.number().default(30),
    dp_epsilon: z.number().default(1),
  }).partial().default({}),
  sync: z.object({
    cadence_cron: z.string(),
    chunk_size: z.number(),
  }).partial().default({}),
  assistant: z.object({
    model_tier: z.string(),
    max_fragments: z.number(),
  }).partial().default({}),
  feature_flags: z.record(z.boolean()).default({}),
}).partial({
  anomaly_thresholds: true,
  clinical_cutoffs: true,
  sync: true,
  assistant: true,
  feature_flags: true,
});
export type DashboardControls = z.infer<typeof DashboardControls>;

export const RedcapOps = z.object({
  freshness: z.object({
    generated_at: z.string().default(""),
    age_hours: z.number().default(0),
    source: z.string().default("unknown"),
    sla_hours: z.number().optional(),
  }).default({}),
  runtime_parity: z.record(z.string()).default({}),
  run_ledger: z.array(z.object({
    run_id: z.string(),
    started_at: z.string(),
    status: z.string(),
    records: z.number(),
    anomalies: z.number(),
    duration_ms: z.number().optional(),
  })).default([]),
  controls_snapshot: DashboardControls.optional(),
});
export type RedcapOps = z.infer<typeof RedcapOps>;

const LooseRow = z.record(z.unknown());

export const RedcapClinical = z.object({
  epds_trajectory: z.array(LooseRow).default([]),
  developmental_grid: z.array(LooseRow).default([]),
  family_risk: z.array(LooseRow).default([]),
  cascade_edges: z.array(LooseRow).default([]),
  ados_flow: z.array(LooseRow).default([]),
}).default({
  epds_trajectory: [],
  developmental_grid: [],
  family_risk: [],
  cascade_edges: [],
  ados_flow: [],
});
export type RedcapClinical = z.infer<typeof RedcapClinical>;

export const RedcapIntegrity = z.object({
  nullity_matrix: z.array(LooseRow).default([]),
  field_presence: z.array(LooseRow).default([]),
  double_entry_diffs: z.array(LooseRow).default([]),
  mismatch_trend: z.array(LooseRow).default([]),
  response_quality: z.array(LooseRow).default([]),
  branching_violations: z.array(LooseRow).default([]),
  validation_radar: z.array(LooseRow).default([]),
}).default({
  nullity_matrix: [],
  field_presence: [],
  double_entry_diffs: [],
  mismatch_trend: [],
  response_quality: [],
  branching_violations: [],
  validation_radar: [],
});
export type RedcapIntegrity = z.infer<typeof RedcapIntegrity>;

export const RedcapSchedule = z.object({
  window_adherence: z.array(LooseRow).default([]),
  retention_survival: z.array(LooseRow).default([]),
  collection_calendar: z.array(LooseRow).default([]),
  upcoming_visits: z.array(LooseRow).default([]),
  entry_lag: z.array(LooseRow).default([]),
}).default({
  window_adherence: [],
  retention_survival: [],
  collection_calendar: [],
  upcoming_visits: [],
  entry_lag: [],
});
export type RedcapSchedule = z.infer<typeof RedcapSchedule>;

export const RedcapRespondent = z.object({
  caregiver_burden: z.array(LooseRow).default([]),
  respondent_concordance: z.array(LooseRow).default([]),
}).default({
  caregiver_burden: [],
  respondent_concordance: [],
});
export type RedcapRespondent = z.infer<typeof RedcapRespondent>;

export const RedcapPlatform = z.object({
  audit_log: z.array(LooseRow).default([]),
  reports: z.array(LooseRow).default([]),
  file_repository: z.array(LooseRow).default([]),
  users: z.array(LooseRow).default([]),
}).default({
  audit_log: [],
  reports: [],
  file_repository: [],
  users: [],
});
export type RedcapPlatform = z.infer<typeof RedcapPlatform>;

export const RedcapPredictive = z.object({
  attrition_risk: z.array(LooseRow).default([]),
  nl_query_enabled: z.boolean().default(false),
  weekly_memo: LooseRow.optional(),
}).default({
  attrition_risk: [],
  nl_query_enabled: false,
});
export type RedcapPredictive = z.infer<typeof RedcapPredictive>;

export const RedcapPayload = z.object({
  redcap_meta: RedcapMeta,
  redcap_completion_stats: z.record(RedcapCompletionStat),
  redcap_visit_health: z.object({
    anomaly_count: z.number(),
    data: z.array(RedcapVisitRecord),
  }),
  redcap_trackers: RedcapTrackers.default({
    enrollment: [],
    instrument_completeness: [],
    queue_funnel: [],
  }),
  redcap_timeline: RedcapTimeline.default({ records: [] }),
  redcap_clinical: RedcapClinical,
  redcap_integrity: RedcapIntegrity,
  redcap_schedule: RedcapSchedule,
  redcap_respondent: RedcapRespondent,
  redcap_platform: RedcapPlatform,
  redcap_predictive: RedcapPredictive,
  clinical_cutoffs: DashboardControls.shape.clinical_cutoffs.default({}),
  redcap_ops: RedcapOps.default({
    freshness: {},
    runtime_parity: {},
    run_ledger: [],
  }),
});
export type RedcapPayload = z.infer<typeof RedcapPayload>;

export const DashboardRedcapPayload = RedcapPayload.partial();
export type DashboardRedcapPayload = z.infer<typeof DashboardRedcapPayload>;
