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
  Participant,
  ParticipantDetail,
  Stage,
  Run,
  Epoch,
  Trajectory,
  HdaDist,
  RedcapEvent,
  StudySummary,
  EpochDecision,
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
      ASIB: months.map((m, i) => ({ x: m, y: base + 4 + i * (step + 0.4), n: 26 - i * 1.5 })),
      TD: months.map((m, i) => ({ x: m, y: base + 7 + i * (step + 0.7), n: 21 - i * 1 })),
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

const realFetch = window.fetch.bind(window);
const LIVE_ASSISTANT_ROUTES = new Set([
  "/api/assistant/status",
  "/api/assistant/chat",
  "/api/chat/status",
  "/api/chat",
]);

const liveAssistantEnabled = import.meta.env.VITE_LIVE_ASSISTANT === "true";

export function shouldBypassMock(pathname: string, enabled = liveAssistantEnabled): boolean {
  return enabled && LIVE_ASSISTANT_ROUTES.has(pathname);
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
    if (p === "/api/assistant/status") {
      return reply({ status: "ready", error: null, model: "mock://qwen2.5-1.5b" });
    }
    if (p === "/api/assistant/chat" && method === "POST") {
      const payload = (await new Response(init?.body as BodyInit).json()) as { message?: string };
      const responseText = mockAssistantReply(payload.message ?? "");
      const words = responseText.split(/(\s+)/).filter(Boolean);
      const chunks: MockChatStreamChunk[] = words.map((part) => ({ delta: part }));
      chunks.push({ done: true });
      return ndjsonReply(chunks);
    }
    if (p === "/api/audit") return new Response(null, { status: 204 });

    return reply({ error: "mock route not found", path: p }, 404);
  };
}
