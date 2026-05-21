import { z } from "zod";

/** Core enums — match prototype's controlled vocabulary exactly. */
export const GroupCode = z.enum(["VPT", "ASIB", "TD"]);
export type GroupCode = z.infer<typeof GroupCode>;

export const VisitId = z.enum([
  "nicu_dc",
  "cga_3mo",
  "cga_6mo",
  "cga_9mo",
  "cga_12mo",
  "cga_18mo",
  "cga_24mo",
]);
export type VisitId = z.infer<typeof VisitId>;

export const EpochFlag = z.enum(["clean", "ectopic", "motion", "noise", "flatline"]);
export type EpochFlag = z.infer<typeof EpochFlag>;

export const EpochDecision = z.enum(["auto", "accept", "reject"]);
export type EpochDecision = z.infer<typeof EpochDecision>;

export const QaStatus = z.enum(["pass", "pending", "reject"]);
export type QaStatus = z.infer<typeof QaStatus>;

export const RunStatus = z.enum(["queued", "running", "done", "fail", "idle"]);
export type RunStatus = z.infer<typeof RunStatus>;

export const HdaPhase = z.enum(["orienting", "sustained", "inattention", "termination"]);
export type HdaPhase = z.infer<typeof HdaPhase>;

/** /api/study/summary */
export const StudySummary = z.object({
  enrolled: z.number().int(),
  target: z.number().int(),
  groups: z.object({
    VPT: z.object({ count: z.number().int(), target: z.number().int() }),
    ASIB: z.object({ count: z.number().int(), target: z.number().int() }),
    TD: z.object({ count: z.number().int(), target: z.number().int() }),
  }),
});
export type StudySummary = z.infer<typeof StudySummary>;

/** /api/pipeline/stages */
export const Stage = z.object({
  id: z.string(),
  label: z.string(),
  short: z.string(),
  description: z.string(),
  inflight: z.number().int(),
  queued: z.number().int(),
  done: z.number().int(),
  fail: z.number().int(),
  rate: z.number(),
  eta: z.string(),
});
export type Stage = z.infer<typeof Stage>;

/** /api/runs */
export const Run = z.object({
  id: z.string(),
  triggered: z.string(),
  actor: z.string(),
  scope: z.string(),
  status: RunStatus,
  duration: z.string(),
  stage: z.string(),
  windows: z.number().int(),
});
export type Run = z.infer<typeof Run>;

/** /api/participants — note: never carries DOB/MRN/name */
export const Participant = z.object({
  id: z.string(), // surrogate NANO-#### only
  group: GroupCode,
  cga_wks: z.number(),
  sex: z.enum(["F", "M", "X"]),
  visit: VisitId,
  windows: z.number().int(),
  qa: QaStatus,
  rmssd: z.number().nullable(),
  hf: z.number().nullable(),
  hda: HdaPhase.nullable(),
  updated: z.string(),
  enrolled: z.string(),
  site: z.string(),
});
export type Participant = z.infer<typeof Participant>;

/** /api/participants/:id (with visit log) */
export const VisitLogEntry = z.object({
  ts: z.string(),
  actor: z.string(),
  event: z.string(),
  kind: z.enum(["ok", "warn", "fail", "info"]),
  detail: z.string(),
});
export type VisitLogEntry = z.infer<typeof VisitLogEntry>;

export const ParticipantDetail = Participant.extend({
  visit_log: z.array(VisitLogEntry),
});
export type ParticipantDetail = z.infer<typeof ParticipantDetail>;

/** /api/visits/:visitId/epochs */
export const Epoch = z.object({
  idx: z.number().int(),
  t0: z.number(),
  t1: z.number(),
  flag: EpochFlag,
  sqi: z.number().min(0).max(1),
  ibi_n: z.number().int(),
  decision: EpochDecision,
});
export type Epoch = z.infer<typeof Epoch>;

/** /api/results/trajectory */
export const TrajectoryPoint = z.object({
  x: z.number(),
  y: z.number(),
  n: z.number().int(),
  ci: z.tuple([z.number(), z.number()]).optional(),
});
export type TrajectoryPoint = z.infer<typeof TrajectoryPoint>;

export const Trajectory = z.object({
  months: z.array(z.number()),
  series: z.object({
    VPT: z.array(TrajectoryPoint),
    ASIB: z.array(TrajectoryPoint),
    TD: z.array(TrajectoryPoint),
  }),
});
export type Trajectory = z.infer<typeof Trajectory>;

/** /api/results/hda */
export const HdaDist = z.record(
  GroupCode,
  z.object({
    orienting: z.number().int(),
    sustained: z.number().int(),
    inattention: z.number().int(),
    termination: z.number().int(),
  }),
);
export type HdaDist = z.infer<typeof HdaDist>;

/** /api/redcap/events */
export const RedcapEvent = z.object({
  ts: z.string(),
  form: z.string(),
  n: z.number().int(),
  status: z.enum(["ok", "warn", "fail"]),
  note: z.string(),
});
export type RedcapEvent = z.infer<typeof RedcapEvent>;

/** /api/matlab/integration */
export const MatlabManifest = z.object({
  generated_at: z.string(),
  matlab_version: z.string(),
  salt: z.string().nullable().optional(),
  epoch_sec: z.number().int().nullable().optional(),
  source: z.string(),
  host: z.string(),
});
export type MatlabManifest = z.infer<typeof MatlabManifest>;

export const MatlabFile = z.object({
  name: z.string(),
  feature: z.string(),
  rows: z.number().int(),
  qa_pass_pct: z.number(),
});
export type MatlabFile = z.infer<typeof MatlabFile>;

export const MatlabScript = z.object({
  name: z.string(),
  feature: z.string(),
  last_run: z.string(),
  status: z.enum(["ok", "warn", "fail"]),
  duration_s: z.number(),
  lines: z.number().int(),
});
export type MatlabScript = z.infer<typeof MatlabScript>;

export const MatlabOption = z.object({
  id: z.string(),
  title: z.string(),
  tag: z.string(),
  coupling: z.string(),
  cost: z.string(),
  summary: z.string(),
});
export type MatlabOption = z.infer<typeof MatlabOption>;

export const MatlabIntegration = z.object({
  manifest: MatlabManifest,
  files: z.array(MatlabFile),
  scripts: z.array(MatlabScript),
  throughput_24h: z.object({
    hours: z.array(z.string()),
    rows: z.array(z.number().int()),
  }),
  options: z.array(MatlabOption),
});
export type MatlabIntegration = z.infer<typeof MatlabIntegration>;
