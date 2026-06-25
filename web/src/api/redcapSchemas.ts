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
  redcap_ops: RedcapOps.default({
    freshness: {},
    runtime_parity: {},
    run_ledger: [],
  }),
});
export type RedcapPayload = z.infer<typeof RedcapPayload>;

export const DashboardRedcapPayload = RedcapPayload.partial();
export type DashboardRedcapPayload = z.infer<typeof DashboardRedcapPayload>;
