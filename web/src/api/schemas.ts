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
/* Data Explorer, Publications, and Dataset Change History                   */
/* ------------------------------------------------------------------------ */

export const DataExplorerTable = z.enum(["participants", "runs", "stages", "redcap_events"]);
export type DataExplorerTable = z.infer<typeof DataExplorerTable>;

export const TableQueryParams = z.object({
  table: DataExplorerTable,
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(10).max(100).default(25),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  filters: z.record(z.string()).optional(),
});
export type TableQueryParams = z.infer<typeof TableQueryParams>;

export function PaginatedResponse<T extends z.ZodTypeAny>(row: T) {
  return z.object({
    rows: z.array(row),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });
}
export type PaginatedResponse<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

export const PublicationAuthor = z.object({
  last: z.string(),
  first: z.string(),
  initials: z.string(),
  affiliation: z.string(),
});
export type PublicationAuthor = z.infer<typeof PublicationAuthor>;

export const Publication = z.object({
  pmid: z.string().nullable(),
  title: z.string(),
  authors: z.array(PublicationAuthor),
  journal: z.string(),
  volume: z.string().nullable(),
  issue: z.string().nullable(),
  year: z.number().int(),
  month: z.number().int().nullable(),
  pages: z.string().nullable(),
  doi: z.string().nullable(),
  abstract: z.string().nullable(),
  pub_type: z.string(),
  mesh_terms: z.array(z.string()),
  keywords: z.array(z.string()),
  tags: z.array(z.string()),
  apa_citation: z.string().nullable(),
  citation_count: z.number().int().nullable(),
  source: z.enum(["pubmed", "orcid", "manual"]),
  epub_date: z.string().nullable(),
  updated_at: z.string(),
});
export type Publication = z.infer<typeof Publication>;

export const PublicationTagCount = z.object({
  tag: z.string(),
  count: z.number().int(),
});
export type PublicationTagCount = z.infer<typeof PublicationTagCount>;

export const PublicationListResponse = z.object({
  publications: z.array(Publication),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  tag_counts: z.array(PublicationTagCount),
});
export type PublicationListResponse = z.infer<typeof PublicationListResponse>;

export const PublicationQueryParams = z.object({
  yearMin: z.number().int().optional(),
  yearMax: z.number().int().optional(),
  tag: z.array(z.string()).optional(),
  search: z.string().optional(),
  pubType: z.string().optional(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(10).max(100).default(25),
});
export type PublicationQueryParams = z.infer<typeof PublicationQueryParams>;

export const SyncStatus = z.object({
  last_sync: z.string().nullable(),
  total: z.number().int(),
  inserted: z.number().int(),
  updated: z.number().int(),
  new_this_week: z.number().int(),
  errors: z.array(z.string()),
});
export type SyncStatus = z.infer<typeof SyncStatus>;

export const ChangelogAction = z.enum(["INSERT", "UPDATE", "DELETE", "IMPORT", "SYNC", "QA_OVERRIDE"]);
export type ChangelogAction = z.infer<typeof ChangelogAction>;

export const ChangelogEntry = z.object({
  id: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  action: ChangelogAction,
  actor: z.string(),
  actor_role: z.string().nullable(),
  changed_fields: z.record(z.tuple([z.unknown(), z.unknown()])).nullable(),
  before: z.record(z.unknown()).nullable().optional(),
  after: z.record(z.unknown()).nullable().optional(),
  session_id: z.string().nullable().optional(),
  note: z.string().nullable(),
  ts: z.string(),
  version_tag: z.string().nullable(),
});
export type ChangelogEntry = z.infer<typeof ChangelogEntry>;

export const ChangelogQueryParams = z.object({
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  actor: z.string().optional(),
  action: ChangelogAction.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  version_tag: z.string().optional(),
  search: z.string().optional(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(10).max(100).default(25),
});
export type ChangelogQueryParams = z.infer<typeof ChangelogQueryParams>;

export const DatasetSnapshot = z.object({
  id: z.string(),
  tag: z.string(),
  description: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  row_counts: z.record(z.number().int()),
  checksum: z.string(),
});
export type DatasetSnapshot = z.infer<typeof DatasetSnapshot>;

export const AdminCapabilities = z.object({
  canEditPublicationTags: z.boolean(),
  canCreateSnapshots: z.boolean(),
  canTriggerPublicationSync: z.boolean(),
});
export type AdminCapabilities = z.infer<typeof AdminCapabilities>;

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

export const HdaCompositionPoint = z.object({
  month: z.number(),
  orienting: z.number(),
  sustained: z.number(),
  inattention: z.number(),
  termination: z.number(),
});
export type HdaCompositionPoint = z.infer<typeof HdaCompositionPoint>;
export const HdaCompositionResponse = z.object({
  byGroup: z.record(GroupCode, z.array(HdaCompositionPoint)),
  meta: ApiListMeta,
});
export type HdaCompositionResponse = z.infer<typeof HdaCompositionResponse>;

export const AttritionFunnelRow = z.object({
  from: z.string(),
  to: z.string(),
  value: z.number(),
  group: GroupCode,
});
export type AttritionFunnelRow = z.infer<typeof AttritionFunnelRow>;

export const AttritionFunnelStage = z.object({
  id: z.string(),
  label: z.string(),
  n: z.number().int(),
  retainedPct: z.number(),
});
export type AttritionFunnelStage = z.infer<typeof AttritionFunnelStage>;
export const AttritionReasonCode = z.object({
  stageId: z.string(),
  reason: z.string(),
  n: z.number().int(),
  pct: z.number(),
});
export type AttritionReasonCode = z.infer<typeof AttritionReasonCode>;
export const AttritionTrendPoint = z.object({
  quarter: z.string(),
  stageId: z.string(),
  n: z.number().int(),
  retainedPct: z.number().optional(),
});
export type AttritionTrendPoint = z.infer<typeof AttritionTrendPoint>;
export const AttritionFunnelResponse = ApiListResponse(AttritionFunnelRow).extend({
  stages: z.array(AttritionFunnelStage).default([]),
  reasonCodes: z.array(AttritionReasonCode).default([]),
  trendByQuarter: z.array(AttritionTrendPoint).default([]),
});
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

export const CountyProfileRow = z.object({
  county: z.string(),
  fips: z.string(),
  enrolled: z.number().int(),
  completionRate: z.number(),
  sdohScore: z.number(),
  medianIncomeBracket: z.enum(["low", "medium", "high"]),
  cptdGapMean: z.number().nullable(),
});
export type CountyProfileRow = z.infer<typeof CountyProfileRow>;
export const CountyProfileResponse = ApiListResponse(CountyProfileRow);
export type CountyProfileResponse = z.infer<typeof CountyProfileResponse>;

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
/* Dynamics & Dyads V2 contracts                                             */
/* ------------------------------------------------------------------------ */

export const DynEventType = z.enum(["arousal_spike", "still_face", "reunion"]);
export type DynEventType = z.infer<typeof DynEventType>;

export const DyadCoregulationResponse = z.object({
  fs: z.number(),
  caregiver: z.object({
    rsa: z.array(z.number()),
    heartPeriod: z.array(z.number()),
  }),
  infant: z.object({
    rsa: z.array(z.number()),
    heartPeriod: z.array(z.number()),
    hdaPhase: z.array(z.string()),
  }),
  events: z.array(z.object({
    onset: z.number(),
    type: DynEventType,
  })),
  groupContext: z.array(z.object({
    group: GroupCode,
    synchronyIndex: z.number(),
    leadLagSec: z.number(),
  })).optional(),
});
export type DyadCoregulationResponse = z.infer<typeof DyadCoregulationResponse>;

export const PhasePortraitResponse = z.object({
  fs: z.number(),
  arousal: z.array(z.number()),
  attention: z.array(z.number()),
  t: z.array(z.number()),
  prototypes: z.array(z.object({
    group: GroupCode,
    points: z.array(z.object({ arousal: z.number(), attention: z.number() })),
  })).optional(),
});
export type PhasePortraitResponse = z.infer<typeof PhasePortraitResponse>;

export const CvaTarget = z.enum(["face", "toy", "other", "away", "infant_face"]);
export type CvaTarget = z.infer<typeof CvaTarget>;

export const CvaSegment = z.object({
  start: z.number(),
  end: z.number(),
  target: CvaTarget,
  toyId: z.string().optional(),
});
export type CvaSegment = z.infer<typeof CvaSegment>;

export const CvaResponse = z.object({
  durationSec: z.number(),
  infantGaze: z.array(CvaSegment),
  caregiverGaze: z.array(CvaSegment),
  faceAvailability: z.array(z.object({ start: z.number(), end: z.number() })),
  scaffoldEvents: z.array(z.object({
    t: z.number(),
    type: z.enum(["name", "touch", "position"]),
  })).optional(),
});
export type CvaResponse = z.infer<typeof CvaResponse>;

export const HrDecelerationResponse = z.object({
  preSec: z.number(),
  postSec: z.number(),
  fs: z.number(),
  episodes: z.array(z.object({
    nanoid: z.string(),
    group: GroupCode,
    ageBin: z.string(),
    hr: z.array(z.number()),
  })),
});
export type HrDecelerationResponse = z.infer<typeof HrDecelerationResponse>;

export const StillFaceResponse = z.object({
  phases: z.array(z.object({
    name: z.enum(["baseline", "play", "stillface", "reunion"]),
    startSec: z.number(),
    endSec: z.number(),
  })),
  rsa: z.array(z.number()),
  fs: z.number(),
  caregiverRsa: z.array(z.number()).optional(),
});
export type StillFaceResponse = z.infer<typeof StillFaceResponse>;

export const HdaTransitionsResponse = z.object({
  transitions: z.array(z.object({
    group: GroupCode,
    ageBin: z.string(),
    from: z.string(),
    to: z.string(),
    probability: z.number(),
    ci95: z.tuple([z.number(), z.number()]),
  })),
  perParticipant: z.array(z.object({
    nanoid: z.string(),
    group: GroupCode,
    ageBin: z.string(),
    bypassIndex: z.number(),
    sustainedDwellSec: z.number(),
  })),
});
export type HdaTransitionsResponse = z.infer<typeof HdaTransitionsResponse>;

export const PassportResponse = z.object({
  group: GroupCode,
  sex: z.enum(["F", "M", "X"]),
  gestationalAge: z.number(),
  timeline: z.array(z.object({
    ageMonths: z.number(),
    modality: z.string(),
    metric: z.string(),
    value: z.number(),
    groupMean: z.number().optional(),
    groupSd: z.number().optional(),
  })),
  milestones: z.array(z.object({
    ageMonths: z.number(),
    label: z.string(),
  })),
  nicu: z.object({
    hrcSummary: z.string(),
    thermalSummary: z.string(),
  }).optional(),
  outcome: z.object({
    adosCSS: z.number(),
    ageMonths: z.number(),
  }).optional(),
});
export type PassportResponse = z.infer<typeof PassportResponse>;

export const ArchetypesResponse = z.object({
  measure: z.string(),
  archetypes: z.array(z.object({
    id: z.number(),
    label: z.string(),
    meanCurve: z.array(z.object({ ageMonths: z.number(), value: z.number() })),
    band: z.array(z.object({ lo: z.number(), hi: z.number() })),
  })),
  members: z.array(z.object({
    nanoid: z.string(),
    group: GroupCode,
    archetypeId: z.number(),
    posterior: z.number(),
  })),
});
export type ArchetypesResponse = z.infer<typeof ArchetypesResponse>;

export const CascadePathsResponse = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    label: z.string(),
    domain: z.string(),
    manipulable: z.boolean().optional(),
  })),
  paths: z.array(z.object({
    from: z.string(),
    to: z.string(),
    beta: z.number(),
    se: z.number(),
  })),
  baseline: z.array(z.object({
    nodeId: z.string(),
    value: z.number(),
  })),
  fit: z.object({
    rmsea: z.number(),
    cfi: z.number(),
  }).optional(),
});
export type CascadePathsResponse = z.infer<typeof CascadePathsResponse>;

export const EcoValidityResponse = z.object({
  arms: z.array(z.enum(["lab", "home"])),
  behavior: z.array(z.object({
    metric: z.string(),
    lab: z.number(),
    home: z.number(),
    test: z.string().optional(),
    p: z.number().optional(),
  })),
  quality: z.array(z.object({
    metric: z.string(),
    lab: z.number(),
    home: z.number(),
  })),
  representation: z.array(z.object({
    metric: z.string(),
    lab: z.number(),
    home: z.number(),
    localReference: z.number().optional(),
  })),
});
export type EcoValidityResponse = z.infer<typeof EcoValidityResponse>;

export const StreamCoverageResponse = z.object({
  durationSec: z.number(),
  streams: z.array(z.object({
    name: z.enum(["ecg_infant", "ecg_caregiver", "audio", "video", "markers"]),
    valid: z.array(z.object({ start: z.number(), end: z.number() })),
  })),
  syncOffsetsMs: z.array(z.object({
    pair: z.string(),
    offsetMs: z.number(),
  })).optional(),
});
export type StreamCoverageResponse = z.infer<typeof StreamCoverageResponse>;

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
