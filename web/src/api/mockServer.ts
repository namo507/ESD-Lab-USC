/**
 * In-browser mock backend.
 *
 * Intercepts /api fetches when VITE_USE_MOCKS=true (and in `npm run dev`
 * by default if no real backend is reachable). Mirrors the prototype's
 * mock dataset 1:1 so the design and data contracts stay aligned.
 *
 * Behind a feature flag — production builds NEVER pull this in.
 */
import type {
  ClusterPipeline,
  ClusterTopology,
  Participant,
  ParticipantDetail,
  ReadingsFreshness,
  ReadingsLibrary,
  Stage,
  Run,
  Epoch,
  Trajectory,
  HdaDist,
  RedcapEvent,
  StudySummary,
  EpochDecision,
  MatlabIntegration,
  RsaTrajectoryResponse,
  RedcapCompletenessResponse,
  HdaSessionResponse,
  ThermalHeatmapResponse,
  CohortSwimmerResponse,
  AttritionFunnelResponse,
  SdohMapResponse,
  ShapValuesResponse,
  ClusterTsneResponse,
  ModelLeaderboardResponse,
  ModelLeaderboardDetailResponse,
  CascadeDagResponse,
  EcgQualityResponse,
  EcgQualitySummaryResponse,
} from "./schemas";

const STUDY: StudySummary = {
  enrolled: 231,
  target: 260,
  groups: {
    VPT: { count: 184, target: 200 },
    ASIB: { count: 26, target: 30 },
    TD: { count: 21, target: 30 },
  },
};

const STAGES: Stage[] = [
  { id: "ingest", label: "Ingest", short: "Actiheart-5 + REDCap", description: "Pull raw .ecg files off the Actiheart-5 device + matched REDCap visit metadata. Validates filenames against NANO-XXXX manifest.", inflight: 14, queued: 4, done: 1824, fail: 0, rate: 312, eta: "—" },
  { id: "preprocess", label: "Preprocess", short: "filter · detect R-peaks", description: "0.5–40 Hz bandpass, R-peak detection (Pan–Tompkins), IBI extraction. Drops windows with > 20 % ectopic beats.", inflight: 9, queued: 2, done: 1786, fail: 38, rate: 248, eta: "11 min" },
  { id: "qa", label: "Window QA", short: "epoch-level review", description: "5-second epochs are rated by signal quality index (SQI). Marginal windows are surfaced for human review on the QA page.", inflight: 27, queued: 0, done: 1641, fail: 145, rate: 412, eta: "—" },
  { id: "hrv", label: "HRV features", short: "time- & freq-domain", description: "Per-window: RMSSD, SDNN, pNN50, LF/HF power. Tabular and aligned with HDA phase labels.", inflight: 18, queued: 6, done: 847, fail: 2, rate: 184, eta: "24 min" },
  { id: "hda", label: "HDA labeling", short: "phase classification", description: "Heart-rate Defined Attention phases: orienting · sustained · inattention · termination. Labels written back per epoch.", inflight: 4, queued: 9, done: 612, fail: 0, rate: 98, eta: "38 min" },
  { id: "merge", label: "Merge · de-id", short: "long-form parquet", description: "Joins HRV, HDA, redcap visit metadata. Strips PHI columns. Writes data/processed/deidentified/.", inflight: 0, queued: 12, done: 421, fail: 0, rate: 0, eta: "pending upstream" },
];

const RUNS: Run[] = [
  { id: "run_2026_115_a", triggered: "2026-04-25 09:12", actor: "jbradshaw", scope: "auto · 18 visits", status: "running", duration: "38m", stage: "hrv", windows: 1786 },
  { id: "run_2026_115_b", triggered: "2026-04-25 06:00", actor: "cron", scope: "nightly · all visits", status: "done", duration: "2h 14m", stage: "merge", windows: 4218 },
  { id: "run_2026_114_a", triggered: "2026-04-24 14:21", actor: "rgupta", scope: "NANO-0173 · cga_18mo", status: "done", duration: "4m 12s", stage: "merge", windows: 52 },
  { id: "run_2026_114_b", triggered: "2026-04-24 11:08", actor: "jbradshaw", scope: "rerun QA · n=18", status: "done", duration: "22m", stage: "qa", windows: 832 },
  { id: "run_2026_113_a", triggered: "2026-04-23 16:45", actor: "cron", scope: "preprocess fix #312", status: "fail", duration: "1m 04s", stage: "preprocess", windows: 0 },
  { id: "run_2026_113_b", triggered: "2026-04-23 09:00", actor: "cron", scope: "nightly", status: "done", duration: "1h 58m", stage: "merge", windows: 4096 },
];

const PARTICIPANTS: Participant[] = [
  { id: "NANO-0102", group: "VPT", cga_wks: 28.4, sex: "F", visit: "cga_12mo", windows: 51, qa: "pass", rmssd: 38.41, hf: 412.1, hda: "sustained", updated: "2 min", enrolled: "2024-08-12", site: "Prisma Midlands" },
  { id: "NANO-0107", group: "VPT", cga_wks: 26.1, sex: "M", visit: "cga_12mo", windows: 33, qa: "pending", rmssd: null, hf: null, hda: null, updated: "4 min", enrolled: "2024-08-19", site: "Prisma Midlands" },
  { id: "NANO-0114", group: "ASIB", cga_wks: 39.2, sex: "F", visit: "cga_9mo", windows: 47, qa: "pass", rmssd: 44.92, hf: 528.7, hda: "orienting", updated: "6 min", enrolled: "2024-09-02", site: "USC Lab" },
  { id: "NANO-0121", group: "TD", cga_wks: 39.8, sex: "M", visit: "cga_6mo", windows: 44, qa: "pass", rmssd: 41.07, hf: 468.3, hda: "sustained", updated: "11 min", enrolled: "2024-09-12", site: "USC Lab" },
  { id: "NANO-0129", group: "VPT", cga_wks: 30.3, sex: "F", visit: "cga_6mo", windows: 49, qa: "pass", rmssd: 36.72, hf: 389.4, hda: "sustained", updated: "14 min", enrolled: "2024-09-21", site: "Prisma Upstate" },
  { id: "NANO-0134", group: "VPT", cga_wks: 27.7, sex: "M", visit: "cga_6mo", windows: 12, qa: "reject", rmssd: null, hf: null, hda: null, updated: "22 min", enrolled: "2024-10-01", site: "Prisma Midlands" },
  { id: "NANO-0141", group: "ASIB", cga_wks: 38.7, sex: "M", visit: "cga_3mo", windows: 38, qa: "pass", rmssd: 32.85, hf: 342.1, hda: "orienting", updated: "38 min", enrolled: "2024-10-09", site: "USC Lab" },
  { id: "NANO-0148", group: "VPT", cga_wks: 29.0, sex: "F", visit: "cga_3mo", windows: 41, qa: "pass", rmssd: 29.18, hf: 298.7, hda: "inattention", updated: "1 h", enrolled: "2024-10-18", site: "Prisma Midlands" },
  { id: "NANO-0153", group: "TD", cga_wks: 40.1, sex: "F", visit: "cga_9mo", windows: 46, qa: "pass", rmssd: 46.33, hf: 551.2, hda: "sustained", updated: "1 h", enrolled: "2024-10-24", site: "USC Lab" },
  { id: "NANO-0159", group: "VPT", cga_wks: 28.9, sex: "M", visit: "cga_9mo", windows: 27, qa: "pending", rmssd: null, hf: null, hda: null, updated: "2 h", enrolled: "2024-11-04", site: "Prisma Upstate" },
  { id: "NANO-0162", group: "VPT", cga_wks: 27.2, sex: "M", visit: "nicu_dc", windows: 8, qa: "pending", rmssd: null, hf: null, hda: null, updated: "2 h", enrolled: "2024-11-12", site: "Prisma Midlands" },
  { id: "NANO-0168", group: "ASIB", cga_wks: 39.5, sex: "F", visit: "cga_6mo", windows: 43, qa: "pass", rmssd: 35.22, hf: 371.8, hda: "sustained", updated: "3 h", enrolled: "2024-11-19", site: "USC Lab" },
  { id: "NANO-0173", group: "VPT", cga_wks: 30.8, sex: "F", visit: "cga_18mo", windows: 52, qa: "pass", rmssd: 42.18, hf: 481.2, hda: "sustained", updated: "4 h", enrolled: "2023-11-02", site: "Prisma Midlands" },
  { id: "NANO-0179", group: "VPT", cga_wks: 26.8, sex: "M", visit: "cga_18mo", windows: 45, qa: "pass", rmssd: 31.04, hf: 312.5, hda: "inattention", updated: "5 h", enrolled: "2023-11-14", site: "Prisma Upstate" },
  { id: "NANO-0184", group: "TD", cga_wks: 39.4, sex: "M", visit: "cga_3mo", windows: 39, qa: "pass", rmssd: 28.91, hf: 286.4, hda: "orienting", updated: "5 h", enrolled: "2025-01-08", site: "USC Lab" },
  { id: "NANO-0188", group: "VPT", cga_wks: 29.4, sex: "F", visit: "cga_24mo", windows: 51, qa: "pass", rmssd: 47.61, hf: 574.0, hda: "sustained", updated: "6 h", enrolled: "2023-04-22", site: "Prisma Midlands" },
  { id: "NANO-0193", group: "VPT", cga_wks: 28.2, sex: "M", visit: "cga_12mo", windows: 48, qa: "pass", rmssd: 39.84, hf: 434.9, hda: "sustained", updated: "8 h", enrolled: "2024-04-30", site: "Prisma Midlands" },
  { id: "NANO-0197", group: "ASIB", cga_wks: 38.9, sex: "F", visit: "cga_12mo", windows: 22, qa: "reject", rmssd: null, hf: null, hda: null, updated: "10 h", enrolled: "2024-04-12", site: "USC Lab" },
  { id: "NANO-0204", group: "VPT", cga_wks: 30.1, sex: "M", visit: "cga_24mo", windows: 49, qa: "pass", rmssd: 43.55, hf: 502.3, hda: "sustained", updated: "14 h", enrolled: "2023-04-04", site: "Prisma Upstate" },
  { id: "NANO-0211", group: "TD", cga_wks: 39.6, sex: "F", visit: "cga_12mo", windows: 47, qa: "pass", rmssd: 40.18, hf: 442.1, hda: "sustained", updated: "1 d", enrolled: "2024-04-19", site: "USC Lab" },
  { id: "NANO-0218", group: "VPT", cga_wks: 27.5, sex: "M", visit: "cga_3mo", windows: 18, qa: "pending", rmssd: null, hf: null, hda: null, updated: "1 d", enrolled: "2025-01-22", site: "Prisma Midlands" },
  { id: "NANO-0224", group: "VPT", cga_wks: 28.7, sex: "F", visit: "cga_9mo", windows: 50, qa: "pass", rmssd: 37.92, hf: 408.6, hda: "sustained", updated: "1 d", enrolled: "2024-07-08", site: "Prisma Midlands" },
];

const VISIT_LOG = [
  { ts: "2026-04-25 09:18", actor: "system", event: "merge.parquet written", kind: "ok" as const, detail: "data/processed/deidentified/cga_12mo/NANO-0102.parquet · 0.42 MB" },
  { ts: "2026-04-25 09:14", actor: "system", event: "HDA labels emitted", kind: "ok" as const, detail: "51 epochs · 38 sustained · 9 orienting · 4 inattention" },
  { ts: "2026-04-25 09:11", actor: "system", event: "HRV features computed", kind: "ok" as const, detail: "RMSSD = 38.41 ms · HF = 412.1 ms² · pNN50 = 14.2 %" },
  { ts: "2026-04-25 09:07", actor: "rgupta", event: "QA accepted", kind: "ok" as const, detail: "49/51 epochs accepted · 2 ectopic flagged" },
  { ts: "2026-04-25 09:02", actor: "system", event: "preprocess complete", kind: "ok" as const, detail: "0.5–40 Hz bandpass · R-peak n=2,431 · ectopic 1.3 %" },
  { ts: "2026-04-25 08:58", actor: "system", event: "ingest", kind: "ok" as const, detail: "Actiheart-5 · 22:14 min · 1024 Hz · file 14.8 MB" },
  { ts: "2026-04-25 08:42", actor: "cstrickland", event: "visit started", kind: "info" as const, detail: "cga_12mo · room USC-LAB-104 · examiner CST" },
];

const HDA: HdaDist = {
  VPT: { orienting: 142, sustained: 612, inattention: 84, termination: 38 },
  ASIB: { orienting: 61, sustained: 184, inattention: 22, termination: 11 },
  TD: { orienting: 47, sustained: 198, inattention: 12, termination: 6 },
};

const REDCAP_EVENTS: RedcapEvent[] = [
  { ts: "09:14", form: "visit_intake_v2", n: 3, status: "ok", note: "pushed" },
  { ts: "09:08", form: "caregiver_q_v3", n: 12, status: "ok", note: "pulled" },
  { ts: "09:02", form: "medical_history_v1", n: 1, status: "warn", note: "missing dob → flagged" },
  { ts: "08:58", form: "visit_intake_v2", n: 2, status: "ok", note: "pulled" },
  { ts: "08:51", form: "asd_followup_v1", n: 4, status: "ok", note: "pulled" },
  { ts: "08:44", form: "consent_v4", n: 1, status: "ok", note: "pushed" },
  { ts: "08:30", form: "medical_history_v1", n: 2, status: "fail", note: "token expired · retry" },
];

const MATLAB_INTEGRATION: MatlabIntegration = {
  manifest: {
    generated_at: new Date().toISOString().slice(0, 19),
    matlab_version: "R2024a",
    salt: "nano_demo",
    epoch_sec: 60,
    source: "synthetic_demo",
    host: "matlab-lab-01",
  },
  files: [
    { name: "hrv_dense.parquet",      feature: "hrv",  rows: 12480, qa_pass_pct: 0.924 },
    { name: "temp_gradients.parquet", feature: "temp", rows: 30210, qa_pass_pct: 0.951 },
    { name: "hda_phases.parquet",     feature: "hda",  rows: 4120,  qa_pass_pct: 0.967 },
  ],
  scripts: [
    { name: "export_hrv_features.m",         feature: "hrv",          last_run: "09:12", status: "ok", duration_s: 14.6, lines: 96 },
    { name: "export_temperature_features.m", feature: "temp",         last_run: "09:11", status: "ok", duration_s:  7.2, lines: 64 },
    { name: "export_hda_phases.m",           feature: "hda",          last_run: "09:11", status: "ok", duration_s:  3.4, lines: 48 },
    { name: "run_all.m",                     feature: "orchestrator", last_run: "09:13", status: "ok", duration_s: 28.1, lines: 22 },
  ],
  throughput_24h: {
    hours: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`),
    rows:  [310, 280, 295, 220, 180, 150, 260, 410, 530, 610, 620, 580, 540, 600, 690, 720, 700, 640, 560, 520, 480, 440, 400, 360],
  },
  options: [
    { id: "file",   title: "File handoff",             tag: "Recommended", coupling: "loose", cost: "low",    summary: "MATLAB writes Parquet to data/interim/matlab/. Python merge picks it up on the next dashboard refresh." },
    { id: "engine", title: "MATLAB Engine for Python", tag: "Real-time",   coupling: "tight", cost: "medium", summary: "build_dashboard_data.py invokes .m functions via matlab.engine in a single process." },
    { id: "rest",   title: "REST endpoint",            tag: "On-demand",   coupling: "loose", cost: "medium", summary: "MATLAB Production Server or a Flask wrapper exposes /predict for click-time inference." },
  ],
};

const V2_GENERATED_AT = new Date().toISOString();
const VISIT_MONTHS = [
  { visit: "nicu_dc", month: 0 },
  { visit: "cga_3mo", month: 3 },
  { visit: "cga_6mo", month: 6 },
  { visit: "cga_9mo", month: 9 },
  { visit: "cga_12mo", month: 12 },
  { visit: "cga_18mo", month: 18 },
  { visit: "cga_24mo", month: 24 },
] as const;

function v2Envelope<T>(
  data: T[],
  participantCount = PARTICIPANTS.length,
): { data: T[]; meta: { generatedAt: string; participantCount: number; source: "mock" } } {
  return { data, meta: { generatedAt: V2_GENERATED_AT, participantCount, source: "mock" } };
}

function makeRsaTrajectories(ageBasis: string): RsaTrajectoryResponse {
  const baseMonths = [0, 1, 2, 3, 6, 9, 12, 24, 36];
  const groupBase = { VPT: 3.14, ASIB: 3.11, TD: 3.13 };
  const groupSlope = { VPT: 0.055, ASIB: 0.026, TD: 0.073 };
  const data = (Object.keys(groupBase) as Array<keyof typeof groupBase>).flatMap((group) =>
    baseMonths.map((month, i) => {
      const chronologicalAgeMonths = month + (group === "VPT" ? 2.2 : group === "ASIB" ? 1.4 : 0);
      const adjustedAgeMonths = month;
      const ageMonths = ageBasis === "chronological" ? chronologicalAgeMonths : adjustedAgeMonths;
      const mean = groupBase[group] + groupSlope[group] * ageMonths + Math.sin(i + group.length) * 0.025;
      const band = group === "TD" ? 0.055 : group === "ASIB" ? 0.075 : 0.065;
      return {
        group,
        ageMonths,
        adjustedAgeMonths,
        chronologicalAgeMonths,
        mean: Number(mean.toFixed(3)),
        ciLow: Number((mean - band).toFixed(3)),
        ciHigh: Number((mean + band).toFixed(3)),
        n: Math.max(8, STUDY.groups[group].count - i * (group === "VPT" ? 12 : 3)),
      };
    }),
  );
  return v2Envelope(data, STUDY.enrolled);
}

const REDCAP_INSTRUMENTS = [
  { instrument: "visit_intake_v2", ndaRequired: true, requiredTotal: 18 },
  { instrument: "medical_history_v1", ndaRequired: true, requiredTotal: 22 },
  { instrument: "bayley4_scores", ndaRequired: true, requiredTotal: 16 },
  { instrument: "mchat_r_tf", ndaRequired: true, requiredTotal: 12 },
  { instrument: "caregiver_q_v3", ndaRequired: false, requiredTotal: 14 },
  { instrument: "temperature_recording_log", ndaRequired: false, requiredTotal: 10 },
];

const REDCAP_COMPLETENESS: RedcapCompletenessResponse = v2Envelope(
  PARTICIPANTS.slice(0, 12).flatMap((p, pi) =>
    REDCAP_INSTRUMENTS.map((form, fi) => {
      const requiredMissing = Math.max(0, ((pi + fi * 2) % 5) - (p.qa === "pass" ? 2 : 0));
      const completenessPct = ((form.requiredTotal - requiredMissing) / form.requiredTotal) * 100;
      return {
        nanoId: p.id,
        group: p.group,
        instrument: form.instrument,
        completenessPct: Number(completenessPct.toFixed(1)),
        requiredMissing,
        requiredTotal: form.requiredTotal,
        ndaRequired: form.ndaRequired,
        dueDate: form.ndaRequired ? "2026-08-01" : null,
        status: requiredMissing === 0 ? "complete" : requiredMissing <= 2 ? "watch" : "missing",
      };
    }),
  ),
  STUDY.enrolled,
);

function visitAgeFromPath(raw: string): number {
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  return VISIT_MONTHS.find((v) => v.visit === raw)?.month ?? 12;
}

function makeHdaSession(nanoId: string, visitAgeRaw: string): HdaSessionResponse {
  const visitAge = visitAgeFromPath(visitAgeRaw);
  const phases = ["orienting", "sustained", "inattention", "termination"] as const;
  const data = Array.from({ length: 72 }, (_, i) => {
    const phase = phases[(i < 10 ? 0 : i < 48 ? 1 : i < 64 ? 2 : 3) % phases.length]!;
    return {
      nanoId,
      visitAge,
      t0: i * 5,
      t1: i * 5 + 5,
      phase,
      confidence: Number((0.74 + ((i * 7) % 19) / 100).toFixed(2)),
      rmssd: Number((28 + visitAge * 0.9 + Math.sin(i / 4) * 4).toFixed(2)),
      sqi: Number((0.72 + ((i * 5) % 23) / 100).toFixed(2)),
    };
  });
  return v2Envelope(data, 1);
}

function makeThermalHeatmap(nanoId: string): ThermalHeatmapResponse {
  const data = Array.from({ length: 7 * 24 }, (_, idx) => {
    const day = Math.floor(idx / 24) + 1;
    const hour = idx % 24;
    const centralTemp = 36.6 + Math.sin((hour - 5) / 4) * 0.25 + day * 0.015;
    const peripheralTemp = 35.9 + Math.cos(hour / 5) * 0.38 - day * 0.01;
    return {
      nanoId,
      day,
      hour,
      centralTemp: Number(centralTemp.toFixed(2)),
      peripheralTemp: Number(peripheralTemp.toFixed(2)),
      gradient: Number((centralTemp - peripheralTemp).toFixed(2)),
      hrc: Number((4.4 + Math.sin(idx / 9) * 1.2 + (hour > 18 ? 0.6 : 0)).toFixed(2)),
      medicalEvent: hour === 7 && day === 2 ? "care cluster" : hour === 19 && day === 5 ? "feeding hold" : null,
    };
  });
  return v2Envelope(data, 1);
}

const COHORT_SWIMMER: CohortSwimmerResponse = v2Envelope(
  PARTICIPANTS.map((p, idx) => {
    const completedVisits = Math.max(1, VISIT_MONTHS.findIndex((v) => v.visit === p.visit) + 1);
    return {
      nanoId: p.id,
      group: p.group,
      enrolledAt: p.enrolled,
      lastVisit: p.visit,
      completedVisits,
      expectedVisits: VISIT_MONTHS.length,
      completionPct: Number(((completedVisits / VISIT_MONTHS.length) * 100).toFixed(1)),
      dropoutRisk: p.qa === "reject" ? "high" : p.qa === "pending" ? "watch" : "low",
      milestones: VISIT_MONTHS.map((v, vi) => ({
        visit: v.visit,
        month: v.month,
        status: vi < completedVisits ? "complete" : vi === completedVisits && idx % 5 === 0 ? "missed" : "scheduled",
      })),
    };
  }),
  STUDY.enrolled,
);

const ATTRITION_FUNNEL: AttritionFunnelResponse = v2Envelope(
  (["VPT", "ASIB", "TD"] as const).flatMap((group) => [
    { from: "enrolled", to: "nicu_dc", value: STUDY.groups[group].count, group },
    { from: "nicu_dc", to: "cga_6mo", value: Math.round(STUDY.groups[group].count * 0.84), group },
    { from: "cga_6mo", to: "cga_12mo", value: Math.round(STUDY.groups[group].count * 0.62), group },
    { from: "cga_12mo", to: "cga_24mo", value: Math.round(STUDY.groups[group].count * 0.28), group },
  ]),
  STUDY.enrolled,
);

const SDOH_MAP: SdohMapResponse = v2Envelope(
  [
    ["Richland", "45079", 34.0007, -81.0348, 74, 0.43, 87, 72],
    ["Lexington", "45063", 33.9815, -81.2362, 39, 0.31, 91, 78],
    ["Greenville", "45045", 34.8526, -82.394, 31, 0.37, 89, 75],
    ["Charleston", "45019", 32.7765, -79.9311, 22, 0.28, 92, 81],
    ["Florence", "45041", 34.1954, -79.7626, 18, 0.52, 81, 69],
  ].map(([county, fips, lat, lng, participants, deprivationIndex, broadbandPct, meanCompletion]) => ({
    county: String(county),
    fips: String(fips),
    lat: Number(lat),
    lng: Number(lng),
    participants: Number(participants),
    deprivationIndex: Number(deprivationIndex),
    broadbandPct: Number(broadbandPct),
    foodAccessPct: Number(100 - Number(deprivationIndex) * 45),
    meanCompletion: Number(meanCompletion),
  })),
  STUDY.enrolled,
);

const SHAP_FEATURES = [
  { feature: "rmssd_mean_m6", label: "RMSSD mean @ 6mo", modality: "ecg" },
  { feature: "rsa_slope_0_12", label: "RSA slope 0-12mo", modality: "ecg" },
  { feature: "hda_sa_latency_m3", label: "HDA sustained latency", modality: "hda" },
  { feature: "cptd_nicu", label: "Central-peripheral temp delta", modality: "thermal" },
  { feature: "mchat_total_m9", label: "M-CHAT total @ 9mo", modality: "redcap" },
  { feature: "ga_weeks", label: "Gestational age", modality: "demographic" },
] as const;

const SHAP_VALUES: ShapValuesResponse = v2Envelope(
  PARTICIPANTS.slice(0, 18).flatMap((p, pi) =>
    SHAP_FEATURES.map((f, fi) => ({
      participantId: p.id,
      feature: f.feature,
      label: f.label,
      value: Number((0.8 + pi * 0.08 + fi * 0.12).toFixed(2)),
      shap: Number((Math.sin(pi * 0.9 + fi) * 0.18 + (p.group === "VPT" ? 0.04 : -0.02)).toFixed(3)),
      modality: f.modality,
      timeWindow: fi % 2 ? "0-12 mo" : "6-24 mo",
    })),
  ),
  STUDY.enrolled,
);

const CLUSTER_TSNE: ClusterTsneResponse = v2Envelope(
  PARTICIPANTS.flatMap((p, idx) =>
    [6, 12, 24].map((timepoint, ti) => {
      const cluster = p.group === "TD" ? "regulated" : p.qa === "pending" ? "watchful" : idx % 3 === 0 ? "mixed-signal" : "maturing";
      return {
        nanoId: p.id,
        group: p.group,
        x: Number((Math.cos(idx * 0.7 + ti) * 7 + ti * 2).toFixed(2)),
        y: Number((Math.sin(idx * 0.5 + ti) * 5 + (p.group === "VPT" ? 1.5 : -1)).toFixed(2)),
        cluster,
        timepoint,
        outcomeScore: Number((62 + ti * 7 + (p.group === "TD" ? 8 : 0) - (p.qa === "reject" ? 9 : 0)).toFixed(1)),
      };
    }),
  ),
  STUDY.enrolled,
);

const MODEL_LEADERBOARD: ModelLeaderboardResponse = v2Envelope(
  [
    ["cnn_lstm", "1D-CNN + LSTM", 0.899, 0.766, 0.827, 0.82, 0.041, 128],
    ["xgb", "XGBoost", 0.859, 0.865, 0.899, 0.678, 0.052, 46],
    ["transformer", "Transformer", 0.865, 0.777, 0.866, 0.761, 0.047, 96],
    ["rf", "Random Forest", 0.82, 0.772, 0.738, 0.674, 0.063, 52],
    ["logreg", "Logistic Regression", 0.747, 0.726, 0.856, 0.674, 0.081, 24],
  ].map(([modelId, name, auroc, sensitivity, specificity, f1, calibration, features]) => ({
    modelId: String(modelId),
    name: String(name),
    auroc: Number(auroc),
    sensitivity: Number(sensitivity),
    specificity: Number(specificity),
    f1: Number(f1),
    calibration: Number(calibration),
    features: Number(features),
    updatedAt: "2026-06-03T02:56:59",
  })),
  STUDY.enrolled,
);

function makeModelDetail(modelId: string): ModelLeaderboardDetailResponse {
  const data = Array.from({ length: 8 }, (_, i) => ({
    modelId,
    epoch: i + 1,
    trainAuroc: Number((0.72 + i * 0.025 + (modelId === "cnn_lstm" ? 0.04 : 0)).toFixed(3)),
    validationAuroc: Number((0.7 + i * 0.021 + (modelId === "cnn_lstm" ? 0.05 : 0)).toFixed(3)),
    ablation: ["no HDA", "no ECG", "no REDCap", "no thermal"][i % 4]!,
    ablationDelta: Number((-0.018 - (i % 4) * 0.011).toFixed(3)),
  }));
  return v2Envelope(data, STUDY.enrolled);
}

const CASCADE_DAG: CascadeDagResponse = v2Envelope(
  [
    ["NICU stress physiology", "Autonomic regulation", "context", "physiology", 0.78, "HRC + RSA coupling"],
    ["Autonomic regulation", "Sustained attention", "physiology", "attention", 0.72, "HDA phase stability"],
    ["Caregiver co-regulation", "Sustained attention", "family", "attention", 0.54, "home-study linkage"],
    ["Sustained attention", "Social communication", "attention", "behavior", 0.64, "CSBS + M-CHAT"],
    ["Thermal stability", "Autonomic regulation", "physiology", "physiology", 0.48, "central-peripheral gradient"],
    ["Social communication", "Adaptive outcome", "behavior", "outcome", 0.69, "Bayley + Vineland"],
  ].map(([source, target, sourceDomain, targetDomain, weight, evidence]) => ({
    source: String(source),
    target: String(target),
    sourceDomain: String(sourceDomain),
    targetDomain: String(targetDomain),
    weight: Number(weight),
    evidence: String(evidence),
  })),
  STUDY.enrolled,
);

function makeEcgQuality(nanoId: string): EcgQualityResponse {
  const artifacts = ["none", "none", "none", "ectopic", "motion", "noise", "flatline"] as const;
  const data = Array.from({ length: 12 * 12 }, (_, idx) => {
    const hour = Math.floor(idx / 12);
    const minute = (idx % 12) * 5;
    const artifactType = artifacts[(idx * 5) % artifacts.length]!;
    const sqi = artifactType === "none" ? 0.78 + ((idx * 3) % 18) / 100 : 0.35 + ((idx * 7) % 27) / 100;
    return {
      nanoId,
      hour,
      minute,
      sqi: Number(Math.min(0.98, sqi).toFixed(2)),
      artifactType,
      pass: artifactType === "none" || sqi >= 0.7,
      lead: "Actiheart-5 ch I",
    };
  });
  return v2Envelope(data, 1);
}

const ECG_QUALITY_SUMMARY: EcgQualitySummaryResponse = v2Envelope(
  [
    { label: "ECG QC pass rate", value: 92.4, target: 90, status: "ok" },
    { label: "Artifact review queue", value: 18, target: 24, status: "ok" },
    { label: "Late transfers", value: 4, target: 0, status: "watch" },
    { label: "NDA-ready windows", value: 88.6, target: 95, status: "watch" },
  ],
  STUDY.enrolled,
);

const MOCK_READINGS_FRESHNESS: ReadingsFreshness = {
  schema: "readings_freshness.v1",
  mode: "local",
  generated_at: new Date().toISOString(),
  last_indexed_at: new Date().toISOString(),
  readings_generated_at: new Date().toISOString(),
  lab_readings_generated_at: new Date().toISOString(),
  total_indexed: 20,
  total_pages: 1124,
  files_changed_since_last_run: 0,
  last_trigger: "mock",
  last_event_id: "readings-mock",
  warnings: [],
};

const MOCK_CLUSTER_TOPOLOGY: ClusterTopology = {
  schema: "cluster_topology.v1",
  mode: "local",
  enabled: true,
  generated_at: new Date().toISOString(),
  degraded: false,
  errors: [],
  summary: {
    nodes: 1,
    pods: 0,
    deployments: 0,
    jobs: 0,
    cronjobs: 0,
    health: "simulated",
  },
  components: [
    { id: "local-runtime", name: "Local dashboard runtime", kind: "process", status: "ok", role: "dashboard" },
    { id: "local-watcher", name: "Readings watcher", kind: "thread", status: "ok", role: "watcher" },
    { id: "local-pipeline", name: "Pipeline worker", kind: "subprocess", status: "idle", role: "worker" },
  ],
  edges: [
    { from: "local-watcher", to: "local-pipeline" },
    { from: "local-pipeline", to: "local-runtime" },
  ],
};

const MOCK_CLUSTER_PIPELINE: ClusterPipeline = {
  schema: "cluster_pipeline.v1",
  mode: "local",
  generated_at: new Date().toISOString(),
  state: "succeeded",
  queue_depth: 0,
  running: false,
  last_run: { event_id: "readings-mock", trigger_source: "mock" },
  last_success: {
    event_id: "readings-mock",
    trigger_source: "mock",
    finished_at: new Date().toISOString(),
    duration_ms: 2840,
    total_readings: 20,
  },
  last_failure: null,
  last_duration_ms: 2840,
  last_trigger: "mock",
  freshness: MOCK_READINGS_FRESHNESS,
  events: [
    {
      event_id: "readings-mock",
      trigger_source: "mock",
      status: "succeeded",
      recorded_at: new Date().toISOString(),
      paths: ["ResearchStrategy_Final.pdf"],
      total_readings: 20,
      duration_ms: 2840,
    },
  ],
  degraded: false,
};

const MOCK_READINGS_LIBRARY: ReadingsLibrary = {
  schema: "readings_library.v1",
  mode: "local",
  generated_at: new Date().toISOString(),
  summary: { count: 2, total_pages: 132 },
  readings: [
    {
      id: "mock-autonomic",
      title: "Autonomic pathways in autism",
      year: 2025,
      category: "Physiology and Autonomic",
      source: "ESD Lab Reading Library",
      keywords: ["autonomic", "attention", "infancy"],
      abstract: "United States, South Carolina, and California affiliation signals for the mock map.",
      page_count: 84,
      size_mb: 1.2,
      href: "#",
      bucket: "Physiology and Autonomic · 2025",
    },
    {
      id: "mock-family",
      title: "Family engagement across developmental science",
      year: 2024,
      category: "Family and Parenting",
      source: "ESD Lab Reading Library",
      keywords: ["family", "community"],
      abstract: "United Kingdom and Canada collaboration signals for the mock map.",
      page_count: 48,
      size_mb: 0.7,
      href: "#",
      bucket: "Family and Parenting · 2024",
    },
  ],
};

interface MockChatStreamChunk {
  delta?: string;
  done?: boolean;
  error?: string;
}

function mockAssistantReply(message: string): string {
  const q = message.toLowerCase();

  if (q.includes("rmssd")) {
    return "RMSSD is the root mean square of successive IBI differences. In this dashboard it is used as a vagal-tone marker, so higher values generally indicate stronger parasympathetic regulation during attention tasks.";
  }

  if (q.includes("risk") || q.includes("classifier") || q.includes("auroc")) {
    return "The dashboard prototype reports a held-out AUROC near 0.899 for the risk model. The feature mix combines HRV, HDA composition, demographics, and recording quality, with HDA-derived features carrying much of the signal.";
  }

  if (q.includes("new feature") || q.includes("new route") || q.includes("feature surface")) {
    return "The expanded NANO surfaces include RSA growth curves, REDCap completeness, HDA timeline/player, thermal heatmap, swimmer plot, attrition, SDOH map, SHAP Explorer, Outcome Clusters, Model Leaderboard, Cascade DAG, ECG Quality, Spatial Assessment Matrix, and Attachment Heatmap. Each uses de-identified NANO IDs and v2 API envelopes.";
  }

  if (q.includes("shap") || q.includes("beeswarm")) {
    return "The SHAP Explorer beeswarm shows how each feature pushes model risk up or down across de-identified participants. Use modality and time-window filters to narrow the view, then click a point to highlight that participant across the feature distribution.";
  }

  if (q.includes("redcap") && (q.includes("completeness") || q.includes("nda"))) {
    return "The REDCap completeness scorecard focuses on NDA-required instruments, shows participant-by-instrument completeness, and flags missing required fields before the configured VITE_NDA_DEADLINE.";
  }

  if (q.includes("hda") && (q.includes("timeline") || q.includes("player") || q.includes("compare"))) {
    return "The HDA Timeline Player synchronizes phase blocks with RMSSD and SQI tracks. Play/pause, step, speed, and scrubber controls move through the session, and compare mode overlays a second de-identified participant stack.";
  }

  if (q.includes("ecg") && (q.includes("quality") || q.includes("artifact") || q.includes("sqi"))) {
    return "The ECG Quality Monitor renders SQI as a time grid and marks artifact windows with compact SVG markers. It can export a Markdown QC report summarizing pass windows and artifact counts.";
  }

  if (q.includes("matlab") && q.includes("queue")) {
    return "The MATLAB Processing Queue is derived from the existing MATLAB manifest and file QA rates, then supplemented with ECG QC summary context. It reports batch ID, participant count, MATLAB version, processing status, artifact rate, and start/completion timestamps.";
  }

  if (q.includes("pipeline") || q.includes("walk me through")) {
    return "The NANO pipeline moves from ingest to preprocess, QA, HRV features, HDA labeling, and a de-identified merge. Each stage card in the DAG shows in-flight work, throughput, and cumulative completed windows.";
  }

  return "ESD Buddy is running against the mock backend in development. Ask about RMSSD, HDA, enrollment, REDCap sync, or the pipeline and I will answer using the same dashboard vocabulary the production assistant uses.";
}

function ndjsonReply(chunks: MockChatStreamChunk[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    headers: { "content-type": "application/x-ndjson" },
  });
}

function makeEpochs(): Epoch[] {
  const flags: Epoch["flag"][] = [
    "clean", "clean", "clean", "clean", "clean", "clean", "clean", "ectopic",
    "motion", "noise", "clean", "clean", "flatline", "clean",
  ];
  const arr: Epoch[] = [];
  let t = 0;
  for (let i = 0; i < 64; i++) {
    const f = flags[(i * 7 + 3) % flags.length] as Epoch["flag"];
    const sqi =
      f === "clean" ? 0.78 + (i % 7) * 0.03 :
      f === "ectopic" ? 0.55 - (i % 4) * 0.05 :
      f === "motion" ? 0.32 :
      f === "noise" ? 0.18 : 0.04;
    arr.push({
      idx: i,
      t0: t,
      t1: t + 5,
      flag: f,
      sqi: Math.max(0.02, Math.min(0.99, sqi)),
      ibi_n: f === "clean" ? 8 + (i % 3) : f === "ectopic" ? 6 : f === "motion" ? 4 : 2,
      decision: "auto",
    });
    t += 5;
  }
  return arr;
}

function makeTrajectory(metric: string): Trajectory {
  const months = [3, 6, 9, 12, 18, 24];
  const base =
    metric === "hf" ? 280 : metric === "sdnn" ? 30 : 24;
  const step =
    metric === "hf" ? 35 : metric === "sdnn" ? 3.6 : 4.2;
  return {
    months,
    series: {
      VPT: months.map((m, i) => ({ x: m, y: base + i * step + (i === 5 ? -1 : 0), n: 184 - i * 8 })),
      ASIB: months.map((m, i) => ({ x: m, y: base + 4 + i * (step + 0.4), n: Math.max(4, Math.round(26 - i * 1.5)) })),
      TD: months.map((m, i) => ({ x: m, y: base + 7 + i * (step + 0.7), n: Math.max(4, 21 - i) })),
    },
  };
}

const epochStore = new Map<string, Epoch[]>();
function getEpochs(visitId: string): Epoch[] {
  if (!epochStore.has(visitId)) epochStore.set(visitId, makeEpochs());
  return epochStore.get(visitId)!;
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface MockPresentationOptions {
  audience_level?: string;
  slide_count?: number;
  include_analogy?: boolean;
  include_worked_example?: boolean;
}

/**
 * Deterministic, schema-valid deck plan for development + the public Pages
 * demo (where there is no live Python assistant). The real route is driven by
 * the local GGUF model via the Python server; this mirror keeps the page fully
 * functional offline without fabricating lab citations.
 */
function mockPresentationPlan(concept: string, options: MockPresentationOptions) {
  const topic = (concept || "this concept").trim();
  const title = topic.charAt(0).toUpperCase() + topic.slice(1);
  const audience = ["beginner", "intermediate", "advanced"].includes(options.audience_level ?? "")
    ? (options.audience_level as string)
    : "beginner";
  const includeAnalogy = options.include_analogy !== false;
  const includeExample = options.include_worked_example !== false;

  const slides: Array<Record<string, unknown>> = [
    {
      id: "title-1", type: "title", title: `Understanding ${title}`,
      subtitle: `A simple, ${audience}-friendly explainer`, bullets: [],
      example: null, analogy: null, note: null, citations: [], visual: "clean title with a thin garnet divider",
    },
    {
      id: "why-2", type: "why", title: "Why this matters", subtitle: null,
      bullets: [
        `${title} shows up in everyday situations`,
        "A simple mental model makes it easier to use",
        "Getting the basics first prevents confusion later",
      ],
      example: null, analogy: null, note: null, citations: [], visual: null,
    },
    {
      id: "concept-3", type: "concept", title: `What ${title} means`, subtitle: null,
      bullets: ["The core idea in one plain sentence", "The key parts and how they fit", "A common misconception to avoid"],
      example: null, analogy: null, note: "Keep this slide jargon-free.", citations: [], visual: null,
    },
    {
      id: "concept-4", type: "concept", title: "How it works", subtitle: null,
      bullets: ["Step through the cause and effect", "Note what changes and what stays fixed", "Where it tends to break down"],
      example: null, analogy: null, note: null, citations: [], visual: "simple left-to-right flow of three nodes",
    },
  ];

  if (includeAnalogy) {
    slides.push({
      id: "analogy-5", type: "analogy", title: "A helpful analogy", subtitle: null,
      bullets: ["Compare it to a familiar everyday system", "The same pattern of cause and effect applies", "The analogy breaks down at the finest detail"],
      example: null, analogy: `${title} behaves like a familiar everyday process.`, note: null, citations: [], visual: "two side-by-side panels joined by an arrow",
    });
  }
  if (includeExample) {
    slides.push({
      id: "example-6", type: "example", title: "A worked example", subtitle: null,
      bullets: ["Start from a concrete, simple case", "Apply the idea one step at a time", "Check the result against intuition"],
      example: `A short step-by-step walkthrough of ${title}.`, analogy: null, note: null, citations: [], visual: "numbered steps stacked vertically",
    });
  }
  slides.push({
    id: "recap-7", type: "recap", title: "Recap", subtitle: null,
    bullets: ["The one-sentence idea", "Why it matters in practice", "Where to look next"],
    example: null, analogy: null, note: null, citations: [], visual: "three-line summary with a gold underline",
  });

  return {
    plan: {
      title: `Understanding ${title}`,
      subtitle: `A simple, ${audience}-friendly explainer`,
      audience_level: audience,
      summary: `A clear, ${audience} introduction to ${title}.`,
      disclaimer:
        "This deck is a general, simplified explanation. It is not drawn from ESD Lab or NANO study materials, so it carries no lab-specific citations.",
      grounded: false,
      citations: [],
      concept: topic,
      generated_at: new Date().toISOString().slice(0, 19),
      slides,
    },
    status: { status: "ready", error: null, model: "mock://qwen2.5-1.5b" },
  };
}

/* ---- Mock async job lifecycle ------------------------------------------ */
// Mirrors the real async transport for local dev: a job starts queued, becomes
// running on the next poll, then succeeds with the deck plan. Lets the UI
// exercise queued/generating/ready states without a backend.
interface MockJob {
  job_id: string;
  status: "queued" | "running" | "succeeded";
  created_at: string;
  updated_at: string;
  concept: string;
  options: MockPresentationOptions;
  polls: number;
}

const mockJobs = new Map<string, MockJob>();

function nowStamp(): string {
  return new Date().toISOString().slice(0, 19);
}

function mockJobCreate(concept: string, options: MockPresentationOptions): MockJob {
  const job_id = `pmjob_${Math.random().toString(36).slice(2, 10)}`;
  const job: MockJob = {
    job_id,
    status: "queued",
    created_at: nowStamp(),
    updated_at: nowStamp(),
    concept,
    options,
    polls: 0,
  };
  mockJobs.set(job_id, job);
  return job;
}

function mockJobView(job: MockJob): Record<string, unknown> {
  // Advance one step per poll: queued -> running -> succeeded.
  job.polls += 1;
  if (job.polls >= 3) job.status = "succeeded";
  else if (job.polls === 2) job.status = "running";
  else job.status = "queued";
  job.updated_at = nowStamp();

  const view: Record<string, unknown> = {
    job_id: job.job_id,
    status: job.status,
    created_at: job.created_at,
    updated_at: job.updated_at,
    poll_after_ms: job.status === "queued" ? 900 : job.status === "running" ? 1400 : undefined,
    progress_message:
      job.status === "queued"
        ? "Queued — waiting for the local model."
        : job.status === "running"
          ? "Composing your deck…"
          : null,
  };
  if (job.status === "succeeded") {
    view.result = mockPresentationPlan(job.concept, job.options);
  }
  return view;
}

const realFetch = window.fetch.bind(window);
const LIVE_ASSISTANT_ROUTES = new Set([
  "/api/assistant/status",
  "/api/assistant/chat",
  "/api/chat/status",
  "/api/chat",
  // Presentation planning reuses the same local assistant stack, so it must
  // reach the real Python server (or the Pages /api worker proxy) when the
  // live assistant is enabled rather than the in-browser mock below.
  "/api/presentation/plan",
]);

// Prefix-matched live routes (dynamic path segments, e.g. job ids).
const LIVE_ASSISTANT_PREFIXES = ["/api/presentation/jobs"];

const liveAssistantEnabled = import.meta.env.VITE_LIVE_ASSISTANT === "true";

export function shouldBypassMock(pathname: string, enabled = liveAssistantEnabled): boolean {
  if (!enabled) return false;
  if (LIVE_ASSISTANT_ROUTES.has(pathname)) return true;
  return LIVE_ASSISTANT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function installMockServer() {
  if ((window as unknown as { __nano_mock_installed?: boolean }).__nano_mock_installed) return;
  (window as unknown as { __nano_mock_installed?: boolean }).__nano_mock_installed = true;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const u = new URL(url, window.location.origin);
    const p = u.pathname;
    const method = (init?.method || "GET").toUpperCase();

    if (!p.startsWith("/api/")) return realFetch(input, init);
    if (shouldBypassMock(p)) return realFetch(input, init);

    if (p === "/api/study/summary") return reply(STUDY);
    if (p === "/api/pipeline/stages") return reply(STAGES);
    if (p === "/api/runs" && method === "GET") return reply(RUNS);
    if (p === "/api/runs" && method === "POST") return reply({ runId: `run_2026_${Math.floor(Math.random() * 999)}_x` }, 201);
    if (p === "/api/participants") return reply(PARTICIPANTS);
    if (p === "/api/v2/rsa-trajectories") return reply(makeRsaTrajectories(u.searchParams.get("age") ?? "adjusted"));
    if (p === "/api/v2/redcap-completeness") return reply(REDCAP_COMPLETENESS);
    if (p === "/api/v2/cohort-swimmer") return reply(COHORT_SWIMMER);
    if (p === "/api/v2/attrition-funnel") return reply(ATTRITION_FUNNEL);
    if (p === "/api/v2/sdoh-map") return reply(SDOH_MAP);
    if (p === "/api/v2/shap-values") return reply(SHAP_VALUES);
    if (p === "/api/v2/cluster-tsne") return reply(CLUSTER_TSNE);
    if (p === "/api/v2/model-leaderboard") return reply(MODEL_LEADERBOARD);
    if (p === "/api/v2/cascade-dag") return reply(CASCADE_DAG);
    if (p === "/api/v2/ecg-quality-summary") return reply(ECG_QUALITY_SUMMARY);

    const hdaSession = p.match(/^\/api\/v2\/hda-session\/([A-Z0-9-]+)\/([^/]+)$/);
    if (hdaSession) return reply(makeHdaSession(hdaSession[1] as string, hdaSession[2] as string));

    const thermal = p.match(/^\/api\/v2\/thermal-heatmap\/([A-Z0-9-]+)$/);
    if (thermal) return reply(makeThermalHeatmap(thermal[1] as string));

    const modelDetail = p.match(/^\/api\/v2\/model-leaderboard\/([^/]+)$/);
    if (modelDetail) return reply(makeModelDetail(modelDetail[1] as string));

    const ecgQuality = p.match(/^\/api\/v2\/ecg-quality\/([A-Z0-9-]+)$/);
    if (ecgQuality) return reply(makeEcgQuality(ecgQuality[1] as string));

    const detail = p.match(/^\/api\/participants\/([A-Z0-9-]+)$/);
    if (detail) {
      const subject = PARTICIPANTS.find((x) => x.id === detail[1]) ?? PARTICIPANTS[0];
      if (!subject) return reply({ error: "no participants" }, 404);
      const out: ParticipantDetail = { ...subject, visit_log: VISIT_LOG };
      return reply(out);
    }

    const epochs = p.match(/^\/api\/visits\/([^/]+)\/epochs$/);
    if (epochs && method === "GET") return reply(getEpochs(epochs[1] as string));

    const epochPatch = p.match(/^\/api\/visits\/([^/]+)\/epochs\/(\d+)$/);
    if (epochPatch && method === "PATCH") {
      const [, visitId, idxRaw] = epochPatch;
      const idx = Number(idxRaw);
      const list = getEpochs(visitId as string);
      const target = list[idx];
      if (!target) return reply({ error: "not found" }, 404);
      const body = (await new Response(init?.body as BodyInit).json()) as { decision: EpochDecision };
      target.decision = body.decision;
      return reply(target);
    }

    if (p === "/api/results/trajectory") {
      const metric = u.searchParams.get("metric") || "rmssd";
      return reply(makeTrajectory(metric));
    }
    if (p === "/api/results/hda") return reply(HDA);
    if (p === "/api/redcap/events") return reply(REDCAP_EVENTS);
    if (p === "/api/matlab/integration") return reply(MATLAB_INTEGRATION);
    if (p === "/api/cluster/topology") return reply(MOCK_CLUSTER_TOPOLOGY);
    if (p === "/api/cluster/pipeline") return reply(MOCK_CLUSTER_PIPELINE);
    if (p === "/api/readings/freshness") return reply(MOCK_READINGS_FRESHNESS);
    if (p === "/api/readings/library") return reply(MOCK_READINGS_LIBRARY);
    if (p === "/api/assistant/freshness") {
      return reply({
        schema: "assistant_freshness.v1",
        mode: "local",
        generated_at: new Date().toISOString(),
        assistant: { status: "ready" },
        readings: {
          last_indexed_at: MOCK_READINGS_FRESHNESS.last_indexed_at,
          total_indexed: MOCK_READINGS_FRESHNESS.total_indexed,
          payload_version: MOCK_READINGS_FRESHNESS.readings_generated_at,
        },
        pipeline: {
          state: MOCK_CLUSTER_PIPELINE.state,
          last_event_id: "readings-mock",
          warnings: [],
        },
      });
    }
    if (p === "/api/assistant/status") {
      return reply({
        status: "ready",
        error: null,
        model: "mock://qwen2.5-1.5b",
        freshness: {
          readings: {
            last_indexed_at: MOCK_READINGS_FRESHNESS.last_indexed_at,
            total_indexed: MOCK_READINGS_FRESHNESS.total_indexed,
          },
          pipeline: { state: MOCK_CLUSTER_PIPELINE.state, warnings: [] },
        },
      });
    }
    if (p === "/api/assistant/chat" && method === "POST") {
      const payload = (await new Response(init?.body as BodyInit).json()) as { message?: string };
      const responseText = mockAssistantReply(payload.message ?? "");
      const words = responseText.split(/(\s+)/).filter(Boolean);
      const chunks: MockChatStreamChunk[] = words.map((part) => ({ delta: part }));
      chunks.push({ done: true });
      return ndjsonReply(chunks);
    }
    if (p === "/api/presentation/jobs" && method === "POST") {
      const payload = (await new Response(init?.body as BodyInit).json()) as {
        concept?: string;
        options?: MockPresentationOptions;
      };
      if (!payload.concept || !payload.concept.trim()) {
        return reply({ error: "Please enter a concept you want explained." }, 400);
      }
      const job = mockJobCreate(payload.concept, payload.options ?? {});
      return reply(
        {
          job_id: job.job_id,
          status: "queued",
          created_at: job.created_at,
          updated_at: job.updated_at,
          poll_after_ms: 900,
          progress_message: "Queued — waiting for the local model.",
        },
        202,
      );
    }
    const jobGet = p.match(/^\/api\/presentation\/jobs\/([^/]+)$/);
    if (jobGet && method === "GET") {
      const job = mockJobs.get(jobGet[1] as string);
      if (!job) {
        return reply(
          { error: "This presentation job was not found or has expired.", status: "expired" },
          404,
        );
      }
      return reply(mockJobView(job));
    }
    if (p === "/api/presentation/plan" && method === "POST") {
      const payload = (await new Response(init?.body as BodyInit).json()) as {
        concept?: string;
        options?: MockPresentationOptions;
      };
      if (!payload.concept || !payload.concept.trim()) {
        return reply({ error: "Please enter a concept you want explained." }, 400);
      }
      return reply(mockPresentationPlan(payload.concept, payload.options ?? {}));
    }
    if (p === "/api/audit") return new Response(null, { status: 204 });

    return reply({ error: "mock route not found", path: p }, 404);
  };
}
