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

export const RedcapPayload = z.object({
  redcap_meta: RedcapMeta,
  redcap_completion_stats: z.record(RedcapCompletionStat),
  redcap_visit_health: z.object({
    anomaly_count: z.number(),
    data: z.array(RedcapVisitRecord),
  }),
});
export type RedcapPayload = z.infer<typeof RedcapPayload>;

export const DashboardRedcapPayload = RedcapPayload.partial();
export type DashboardRedcapPayload = z.infer<typeof DashboardRedcapPayload>;
