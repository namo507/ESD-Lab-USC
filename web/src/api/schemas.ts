import { z } from "zod";

/** Core enums — match prototype's controlled vocabulary exactly. */
export const GroupCode = z.preprocess(
  (value) => (value === "PT" ? "VPT" : value),
  z.enum(["VPT", "ASIB", "TD"]),
);
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

/* ------------------------------------------------------------------------ */
/* Feature expansion API v2 contracts                                        */
/* ------------------------------------------------------------------------ */

export const ApiListMeta = z.object({
  generatedAt: z.string(),
  participantCount: z.number().int(),
  source: z.enum(["mock", "live", "aggregate"]).optional(),
});
export type ApiListMeta = z.infer<typeof ApiListMeta>;

export function ApiListResponse<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    meta: ApiListMeta,
  });
}

export const RsaTrajectoryRow = z.object({
  group: GroupCode,
  ageMonths: z.number(),
  adjustedAgeMonths: z.number(),
  chronologicalAgeMonths: z.number(),
  mean: z.number(),
  ciLow: z.number(),
  ciHigh: z.number(),
  n: z.number().int(),
});
export type RsaTrajectoryRow = z.infer<typeof RsaTrajectoryRow>;
export const RsaTrajectoryResponse = ApiListResponse(RsaTrajectoryRow);
export type RsaTrajectoryResponse = z.infer<typeof RsaTrajectoryResponse>;

export const RedcapCompletenessRow = z.object({
  nanoId: z.string(),
  group: GroupCode,
  instrument: z.string(),
  completenessPct: z.number(),
  requiredMissing: z.number().int(),
  requiredTotal: z.number().int(),
  ndaRequired: z.boolean(),
  dueDate: z.string().nullable(),
  status: z.enum(["complete", "watch", "missing"]),
});
export type RedcapCompletenessRow = z.infer<typeof RedcapCompletenessRow>;
export const RedcapCompletenessResponse = ApiListResponse(RedcapCompletenessRow);
export type RedcapCompletenessResponse = z.infer<typeof RedcapCompletenessResponse>;

export const HdaSessionRow = z.object({
  nanoId: z.string(),
  visitAge: z.number(),
  t0: z.number(),
  t1: z.number(),
  phase: HdaPhase,
  confidence: z.number().min(0).max(1),
  rmssd: z.number(),
  sqi: z.number().min(0).max(1),
});
export type HdaSessionRow = z.infer<typeof HdaSessionRow>;
export const HdaSessionResponse = ApiListResponse(HdaSessionRow);
export type HdaSessionResponse = z.infer<typeof HdaSessionResponse>;

export const ThermalHeatmapRow = z.object({
  nanoId: z.string(),
  day: z.number().int(),
  hour: z.number().int(),
  centralTemp: z.number(),
  peripheralTemp: z.number(),
  gradient: z.number(),
  hrc: z.number(),
  medicalEvent: z.string().nullable(),
});
export type ThermalHeatmapRow = z.infer<typeof ThermalHeatmapRow>;
export const ThermalHeatmapResponse = ApiListResponse(ThermalHeatmapRow);
export type ThermalHeatmapResponse = z.infer<typeof ThermalHeatmapResponse>;

export const CohortSwimmerRow = z.object({
  nanoId: z.string(),
  group: GroupCode,
  enrolledAt: z.string(),
  lastVisit: VisitId,
  completedVisits: z.number().int(),
  expectedVisits: z.number().int(),
  completionPct: z.number(),
  dropoutRisk: z.enum(["low", "watch", "high"]),
  milestones: z.array(z.object({
    visit: VisitId,
    month: z.number(),
    status: z.enum(["complete", "scheduled", "missed"]),
  })),
});
export type CohortSwimmerRow = z.infer<typeof CohortSwimmerRow>;
export const CohortSwimmerResponse = ApiListResponse(CohortSwimmerRow);
export type CohortSwimmerResponse = z.infer<typeof CohortSwimmerResponse>;

export const AttritionFunnelRow = z.object({
  from: z.string(),
  to: z.string(),
  value: z.number(),
  group: GroupCode,
});
export type AttritionFunnelRow = z.infer<typeof AttritionFunnelRow>;
export const AttritionFunnelResponse = ApiListResponse(AttritionFunnelRow);
export type AttritionFunnelResponse = z.infer<typeof AttritionFunnelResponse>;

export const SdohMapRow = z.object({
  county: z.string(),
  fips: z.string(),
  lat: z.number(),
  lng: z.number(),
  participants: z.number().int(),
  deprivationIndex: z.number(),
  broadbandPct: z.number(),
  foodAccessPct: z.number(),
  meanCompletion: z.number(),
});
export type SdohMapRow = z.infer<typeof SdohMapRow>;
export const SdohMapResponse = ApiListResponse(SdohMapRow);
export type SdohMapResponse = z.infer<typeof SdohMapResponse>;

export const ShapValueRow = z.object({
  participantId: z.string(),
  feature: z.string(),
  label: z.string(),
  value: z.number(),
  shap: z.number(),
  modality: z.enum(["ecg", "hda", "redcap", "thermal", "demographic"]),
  timeWindow: z.string(),
});
export type ShapValueRow = z.infer<typeof ShapValueRow>;
export const ShapValuesResponse = ApiListResponse(ShapValueRow);
export type ShapValuesResponse = z.infer<typeof ShapValuesResponse>;

export const ClusterTsneRow = z.object({
  nanoId: z.string(),
  group: GroupCode,
  x: z.number(),
  y: z.number(),
  cluster: z.string(),
  timepoint: z.number(),
  outcomeScore: z.number(),
});
export type ClusterTsneRow = z.infer<typeof ClusterTsneRow>;
export const ClusterTsneResponse = ApiListResponse(ClusterTsneRow);
export type ClusterTsneResponse = z.infer<typeof ClusterTsneResponse>;

export const ModelLeaderboardRow = z.object({
  modelId: z.string(),
  name: z.string(),
  auroc: z.number(),
  sensitivity: z.number(),
  specificity: z.number(),
  f1: z.number(),
  calibration: z.number(),
  features: z.number().int(),
  updatedAt: z.string(),
});
export type ModelLeaderboardRow = z.infer<typeof ModelLeaderboardRow>;
export const ModelLeaderboardResponse = ApiListResponse(ModelLeaderboardRow);
export type ModelLeaderboardResponse = z.infer<typeof ModelLeaderboardResponse>;

export const ModelLeaderboardDetailRow = z.object({
  modelId: z.string(),
  epoch: z.number().int(),
  trainAuroc: z.number(),
  validationAuroc: z.number(),
  ablation: z.string(),
  ablationDelta: z.number(),
});
export type ModelLeaderboardDetailRow = z.infer<typeof ModelLeaderboardDetailRow>;
export const ModelLeaderboardDetailResponse = ApiListResponse(ModelLeaderboardDetailRow);
export type ModelLeaderboardDetailResponse = z.infer<typeof ModelLeaderboardDetailResponse>;

export const CascadeDagRow = z.object({
  source: z.string(),
  target: z.string(),
  sourceDomain: z.string(),
  targetDomain: z.string(),
  weight: z.number(),
  evidence: z.string(),
});
export type CascadeDagRow = z.infer<typeof CascadeDagRow>;
export const CascadeDagResponse = ApiListResponse(CascadeDagRow);
export type CascadeDagResponse = z.infer<typeof CascadeDagResponse>;

export const EcgQualityRow = z.object({
  nanoId: z.string(),
  hour: z.number().int(),
  minute: z.number().int(),
  sqi: z.number().min(0).max(1),
  artifactType: z.enum(["none", "ectopic", "motion", "noise", "flatline"]),
  pass: z.boolean(),
  lead: z.string(),
});
export type EcgQualityRow = z.infer<typeof EcgQualityRow>;
export const EcgQualityResponse = ApiListResponse(EcgQualityRow);
export type EcgQualityResponse = z.infer<typeof EcgQualityResponse>;

export const EcgQualitySummaryRow = z.object({
  label: z.string(),
  value: z.number(),
  target: z.number(),
  status: z.enum(["ok", "watch", "fail"]),
});
export type EcgQualitySummaryRow = z.infer<typeof EcgQualitySummaryRow>;
export const EcgQualitySummaryResponse = ApiListResponse(EcgQualitySummaryRow);
export type EcgQualitySummaryResponse = z.infer<typeof EcgQualitySummaryResponse>;

/* ------------------------------------------------------------------------ */
/* Presentation Maker — concept-to-deck contracts                            */
/* ------------------------------------------------------------------------ */

/** Reading level the deck is written for. */
export const PresentationAudience = z.enum(["beginner", "intermediate", "advanced"]);
export type PresentationAudience = z.infer<typeof PresentationAudience>;

/** Controlled slide vocabulary — mirrors the server normalizer exactly. */
export const SlideType = z.enum([
  "title",
  "why",
  "concept",
  "analogy",
  "example",
  "recap",
]);
export type SlideType = z.infer<typeof SlideType>;

/**
 * Client-side request options. The server re-validates and clamps these, but
 * keeping the contract here lets the form stay strongly typed.
 */
export const PresentationOptions = z.object({
  audience_level: PresentationAudience,
  slide_count: z.number().int().min(3).max(10),
  include_analogy: z.boolean(),
  include_worked_example: z.boolean(),
});
export type PresentationOptions = z.infer<typeof PresentationOptions>;

/** One validated slide in the deck plan returned by /api/presentation/plan. */
export const DeckSlide = z.object({
  id: z.string(),
  type: SlideType,
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  // The server caps bullets at five; title slides legitimately carry zero.
  bullets: z.array(z.string()).max(5),
  example: z.string().nullable().optional(),
  analogy: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  citations: z.array(z.string()).default([]),
  visual: z.string().nullable().optional(),
});
export type DeckSlide = z.infer<typeof DeckSlide>;

/** Full structured deck plan. */
export const DeckPlan = z.object({
  title: z.string(),
  subtitle: z.string(),
  audience_level: PresentationAudience,
  summary: z.string(),
  disclaimer: z.string().nullable().optional(),
  grounded: z.boolean(),
  citations: z.array(z.string()).default([]),
  concept: z.string().optional(),
  generated_at: z.string().optional(),
  slides: z.array(DeckSlide).min(1),
});
export type DeckPlan = z.infer<typeof DeckPlan>;

/** Envelope returned by the server (extra keys like `status` are ignored). */
export const PresentationPlanResponse = z.object({
  plan: DeckPlan,
});
export type PresentationPlanResponse = z.infer<typeof PresentationPlanResponse>;

/* ---- Async presentation jobs (create + poll transport) ----------------- */

export const PresentationJobStatus = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "expired",
]);
export type PresentationJobStatus = z.infer<typeof PresentationJobStatus>;

/** Response to POST /api/presentation/jobs — returns fast with an id. */
export const PresentationJobCreated = z.object({
  job_id: z.string(),
  status: PresentationJobStatus,
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  progress_message: z.string().nullable().optional(),
  poll_after_ms: z.number().int().positive().optional(),
});
export type PresentationJobCreated = z.infer<typeof PresentationJobCreated>;

/**
 * Response to GET /api/presentation/jobs/{id}. `result` (the existing deck-plan
 * envelope) is present only on success; `error` only on failure/expiry.
 */
export const PresentationJobState = z.object({
  job_id: z.string(),
  status: PresentationJobStatus,
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  progress_message: z.string().nullable().optional(),
  poll_after_ms: z.number().int().positive().optional(),
  result: PresentationPlanResponse.optional(),
  error: z.string().nullable().optional(),
});
export type PresentationJobState = z.infer<typeof PresentationJobState>;

/* ------------------------------------------------------------------------ */
/* Kubernetes cluster observability + readings freshness                     */
/* ------------------------------------------------------------------------ */

export const ClusterComponent = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  kind: z.string(),
  status: z.string(),
  role: z.string().nullable().optional(),
  ready: z.number().nullable().optional(),
  desired: z.number().nullable().optional(),
  node: z.string().nullable().optional(),
});
export type ClusterComponent = z.infer<typeof ClusterComponent>;

export const ClusterTopology = z.object({
  schema: z.string().optional(),
  mode: z.string(),
  enabled: z.boolean(),
  generated_at: z.string(),
  degraded: z.boolean().default(false),
  errors: z.array(z.string()).default([]),
  summary: z.object({
    nodes: z.number().int(),
    pods: z.number().int(),
    deployments: z.number().int(),
    jobs: z.number().int(),
    cronjobs: z.number().int(),
    health: z.string(),
  }),
  components: z.array(ClusterComponent).default([]),
  edges: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
});
export type ClusterTopology = z.infer<typeof ClusterTopology>;

export const ReadingsFreshness = z.object({
  schema: z.string().optional(),
  mode: z.string(),
  generated_at: z.string(),
  last_indexed_at: z.string().nullable().optional(),
  readings_generated_at: z.string().nullable().optional(),
  lab_readings_generated_at: z.string().nullable().optional(),
  total_indexed: z.number().int().default(0),
  total_pages: z.number().int().nullable().optional(),
  files_changed_since_last_run: z.number().int().default(0),
  last_trigger: z.string().nullable().optional(),
  last_event_id: z.string().nullable().optional(),
  warnings: z.array(z.record(z.unknown())).default([]),
});
export type ReadingsFreshness = z.infer<typeof ReadingsFreshness>;

export const PipelineEvent = z.object({
  schema: z.string().optional(),
  recorded_at: z.string().optional(),
  event_id: z.string().optional(),
  trigger_source: z.string().optional(),
  status: z.string(),
  paths: z.array(z.string()).optional(),
  error: z.string().optional(),
  total_readings: z.number().int().optional(),
  duration_ms: z.number().int().optional(),
});
export type PipelineEvent = z.infer<typeof PipelineEvent>;

export const ClusterPipeline = z.object({
  schema: z.string().optional(),
  mode: z.string(),
  generated_at: z.string(),
  state: z.string(),
  queue_depth: z.number().int().default(0),
  running: z.boolean().default(false),
  last_run: z.record(z.unknown()).nullable().optional(),
  last_success: z.record(z.unknown()).nullable().optional(),
  last_failure: z.record(z.unknown()).nullable().optional(),
  last_duration_ms: z.number().int().nullable().optional(),
  last_trigger: z.string().nullable().optional(),
  freshness: ReadingsFreshness,
  events: z.array(PipelineEvent).default([]),
  degraded: z.boolean().default(false),
});
export type ClusterPipeline = z.infer<typeof ClusterPipeline>;

export const ReadingLibraryEntry = z.object({
  id: z.string(),
  title: z.string(),
  year: z.number().nullable().optional(),
  category: z.string(),
  source: z.string(),
  keywords: z.array(z.string()).default([]),
  abstract: z.string().default(""),
  page_count: z.number().int().default(0),
  size_mb: z.number().default(0),
  href: z.string().default("#"),
  bucket: z.string().optional(),
});
export type ReadingLibraryEntry = z.infer<typeof ReadingLibraryEntry>;

export const ReadingsLibrary = z.object({
  schema: z.string().optional(),
  mode: z.string().optional(),
  generated_at: z.string().optional(),
  summary: z.record(z.unknown()).default({}),
  readings: z.array(ReadingLibraryEntry).default([]),
});
export type ReadingsLibrary = z.infer<typeof ReadingsLibrary>;
