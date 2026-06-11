// Mock data for the NANO Dashboard prototype.
// Uses exact study vocabulary from the ESD Lab readings & repo:
//   VPT (very preterm), ASIB (autism sibling), PT (preterm control), TD (typically developing),
//   CGA (corrected gestational age), PMA, HRV, RMSSD, IBI, HDA (Heart-rate Defined phases),
//   epochs/windows, NICU, Actiheart-5.

const GROUPS = [
  { code: 'VPT',  count: 184, target: 200, color: '#73000a', label: 'Very preterm (<32 wks)' },
  { code: 'ASIB', count: 26,  target: 30,  color: '#8172B2', label: 'Autism-sibling cohort' },
  { code: 'TD',   count: 21,  target: 30,  color: '#7c7c7c', label: 'Typically developing' },
];

const VISITS = ['nicu_dc', 'cga_3mo', 'cga_6mo', 'cga_9mo', 'cga_12mo', 'cga_18mo', 'cga_24mo'];

// 22 participants — realistic mix
const PARTICIPANTS = [
  { id: 'NANO-0102', group: 'VPT',  cga_wks: 28.4, sex: 'F', visit: 'cga_12mo', windows: 51, qa: 'pass',    rmssd: 38.41, hf:  412.1, hda: 'sustained', updated: '2 min',  enrolled: '2024-08-12', site: 'Prisma Midlands' },
  { id: 'NANO-0107', group: 'VPT',  cga_wks: 26.1, sex: 'M', visit: 'cga_12mo', windows: 33, qa: 'pending', rmssd: null,   hf: null,   hda: null,         updated: '4 min',  enrolled: '2024-08-19', site: 'Prisma Midlands' },
  { id: 'NANO-0114', group: 'ASIB', cga_wks: 39.2, sex: 'F', visit: 'cga_9mo',  windows: 47, qa: 'pass',    rmssd: 44.92, hf:  528.7, hda: 'orienting',   updated: '6 min',  enrolled: '2024-09-02', site: 'USC Lab' },
  { id: 'NANO-0121', group: 'TD',   cga_wks: 39.8, sex: 'M', visit: 'cga_6mo',  windows: 44, qa: 'pass',    rmssd: 41.07, hf:  468.3, hda: 'sustained',   updated: '11 min', enrolled: '2024-09-12', site: 'USC Lab' },
  { id: 'NANO-0129', group: 'VPT',  cga_wks: 30.3, sex: 'F', visit: 'cga_6mo',  windows: 49, qa: 'pass',    rmssd: 36.72, hf:  389.4, hda: 'sustained',   updated: '14 min', enrolled: '2024-09-21', site: 'Prisma Upstate' },
  { id: 'NANO-0134', group: 'VPT',  cga_wks: 27.7, sex: 'M', visit: 'cga_6mo',  windows: 12, qa: 'reject',  rmssd: null,   hf: null,   hda: null,         updated: '22 min', enrolled: '2024-10-01', site: 'Prisma Midlands' },
  { id: 'NANO-0141', group: 'ASIB', cga_wks: 38.7, sex: 'M', visit: 'cga_3mo',  windows: 38, qa: 'pass',    rmssd: 32.85, hf:  342.1, hda: 'orienting',   updated: '38 min', enrolled: '2024-10-09', site: 'USC Lab' },
  { id: 'NANO-0148', group: 'VPT',  cga_wks: 29.0, sex: 'F', visit: 'cga_3mo',  windows: 41, qa: 'pass',    rmssd: 29.18, hf:  298.7, hda: 'inattention', updated: '1 h',    enrolled: '2024-10-18', site: 'Prisma Midlands' },
  { id: 'NANO-0153', group: 'TD',   cga_wks: 40.1, sex: 'F', visit: 'cga_9mo',  windows: 46, qa: 'pass',    rmssd: 46.33, hf:  551.2, hda: 'sustained',   updated: '1 h',    enrolled: '2024-10-24', site: 'USC Lab' },
  { id: 'NANO-0159', group: 'VPT',  cga_wks: 28.9, sex: 'M', visit: 'cga_9mo',  windows: 27, qa: 'pending', rmssd: null,   hf: null,   hda: null,         updated: '2 h',    enrolled: '2024-11-04', site: 'Prisma Upstate' },
  { id: 'NANO-0162', group: 'VPT',  cga_wks: 27.2, sex: 'M', visit: 'nicu_dc',  windows:  8, qa: 'pending', rmssd: null,   hf: null,   hda: null,         updated: '2 h',    enrolled: '2024-11-12', site: 'Prisma Midlands' },
  { id: 'NANO-0168', group: 'ASIB', cga_wks: 39.5, sex: 'F', visit: 'cga_6mo',  windows: 43, qa: 'pass',    rmssd: 35.22, hf:  371.8, hda: 'sustained',   updated: '3 h',    enrolled: '2024-11-19', site: 'USC Lab' },
  { id: 'NANO-0173', group: 'VPT',  cga_wks: 30.8, sex: 'F', visit: 'cga_18mo', windows: 52, qa: 'pass',    rmssd: 42.18, hf:  481.2, hda: 'sustained',   updated: '4 h',    enrolled: '2023-11-02', site: 'Prisma Midlands' },
  { id: 'NANO-0179', group: 'VPT',  cga_wks: 26.8, sex: 'M', visit: 'cga_18mo', windows: 45, qa: 'pass',    rmssd: 31.04, hf:  312.5, hda: 'inattention', updated: '5 h',    enrolled: '2023-11-14', site: 'Prisma Upstate' },
  { id: 'NANO-0184', group: 'TD',   cga_wks: 39.4, sex: 'M', visit: 'cga_3mo',  windows: 39, qa: 'pass',    rmssd: 28.91, hf:  286.4, hda: 'orienting',   updated: '5 h',    enrolled: '2025-01-08', site: 'USC Lab' },
  { id: 'NANO-0188', group: 'VPT',  cga_wks: 29.4, sex: 'F', visit: 'cga_24mo', windows: 51, qa: 'pass',    rmssd: 47.61, hf:  574.0, hda: 'sustained',   updated: '6 h',    enrolled: '2023-04-22', site: 'Prisma Midlands' },
  { id: 'NANO-0193', group: 'VPT',  cga_wks: 28.2, sex: 'M', visit: 'cga_12mo', windows: 48, qa: 'pass',    rmssd: 39.84, hf:  434.9, hda: 'sustained',   updated: '8 h',    enrolled: '2024-04-30', site: 'Prisma Midlands' },
  { id: 'NANO-0197', group: 'ASIB', cga_wks: 38.9, sex: 'F', visit: 'cga_12mo', windows: 22, qa: 'reject',  rmssd: null,   hf: null,   hda: null,         updated: '10 h',   enrolled: '2024-04-12', site: 'USC Lab' },
  { id: 'NANO-0204', group: 'VPT',  cga_wks: 30.1, sex: 'M', visit: 'cga_24mo', windows: 49, qa: 'pass',    rmssd: 43.55, hf:  502.3, hda: 'sustained',   updated: '14 h',   enrolled: '2023-04-04', site: 'Prisma Upstate' },
  { id: 'NANO-0211', group: 'TD',   cga_wks: 39.6, sex: 'F', visit: 'cga_12mo', windows: 47, qa: 'pass',    rmssd: 40.18, hf:  442.1, hda: 'sustained',   updated: '1 d',    enrolled: '2024-04-19', site: 'USC Lab' },
  { id: 'NANO-0218', group: 'VPT',  cga_wks: 27.5, sex: 'M', visit: 'cga_3mo',  windows: 18, qa: 'pending', rmssd: null,   hf: null,   hda: null,         updated: '1 d',    enrolled: '2025-01-22', site: 'Prisma Midlands' },
  { id: 'NANO-0224', group: 'VPT',  cga_wks: 28.7, sex: 'F', visit: 'cga_9mo',  windows: 50, qa: 'pass',    rmssd: 37.92, hf:  408.6, hda: 'sustained',   updated: '1 d',    enrolled: '2024-07-08', site: 'Prisma Midlands' },
];

// Pipeline stages — match docs/data_flow_diagram.md vocabulary.
// Each stage: id, label, plain-language description, count of windows currently AT that stage,
// throughput (windows/hour), pass/fail breakdown.
const STAGES = [
  {
    id: 'ingest',     label: 'Ingest',           short: 'Actiheart-5 + REDCap',
    description: 'Pull raw .ecg files off the Actiheart-5 device + matched REDCap visit metadata. Validates filenames against NANO-XXXX manifest.',
    inflight: 14, queued: 4, done: 1824, fail: 0,  rate: 312, eta: '—',
  },
  {
    id: 'preprocess', label: 'Preprocess',       short: 'filter · detect R-peaks',
    description: '0.5–40 Hz bandpass, R-peak detection (Pan–Tompkins), IBI extraction. Drops windows with > 20 % ectopic beats.',
    inflight:  9, queued: 2, done: 1786, fail: 38, rate: 248, eta: '11 min',
  },
  {
    id: 'qa',         label: 'Window QA',        short: 'epoch-level review',
    description: '5-second epochs are rated by signal quality index (SQI). Marginal windows are surfaced for human review on the QA page.',
    inflight: 27, queued: 0, done: 1641, fail: 145, rate: 412, eta: '—',
  },
  {
    id: 'hrv',        label: 'HRV features',     short: 'time- & freq-domain',
    description: 'Per-window: RMSSD, SDNN, pNN50, LF/HF power. Tabular and aligned with HDA phase labels.',
    inflight: 18, queued: 6, done: 847,  fail: 2,  rate: 184, eta: '24 min',
  },
  {
    id: 'hda',        label: 'HDA labeling',     short: 'phase classification',
    description: 'Heart-rate Defined Attention phases: orienting · sustained · inattention · termination. Labels written back per epoch.',
    inflight:  4, queued: 9, done: 612,  fail: 0,  rate:  98, eta: '38 min',
  },
  {
    id: 'merge',      label: 'Merge · de-id',    short: 'long-form parquet',
    description: 'Joins HRV, HDA, redcap visit metadata. Strips PHI columns. Writes data/processed/deidentified/.',
    inflight:  0, queued: 12, done: 421, fail: 0,  rate:   0, eta: 'pending upstream',
  },
];

// Pipeline runs (recent)
const RUNS = [
  { id: 'run_2026_115_a',  triggered: '2026-04-25 09:12', actor: 'jbradshaw',  scope: 'auto · 18 visits',     status: 'running',  duration: '38m', stage: 'hrv',        windows: 1786 },
  { id: 'run_2026_115_b',  triggered: '2026-04-25 06:00', actor: 'cron',       scope: 'nightly · all visits', status: 'done',     duration: '2h 14m', stage: 'merge',   windows: 4218 },
  { id: 'run_2026_114_a',  triggered: '2026-04-24 14:21', actor: 'rgupta',     scope: 'NANO-0173 · cga_18mo', status: 'done',     duration: '4m 12s', stage: 'merge',   windows: 52 },
  { id: 'run_2026_114_b',  triggered: '2026-04-24 11:08', actor: 'jbradshaw',  scope: 'rerun QA · n=18',      status: 'done',     duration: '22m',    stage: 'qa',      windows: 832 },
  { id: 'run_2026_113_a',  triggered: '2026-04-23 16:45', actor: 'cron',       scope: 'preprocess fix #312',  status: 'fail',     duration: '1m 04s', stage: 'preprocess', windows: 0 },
  { id: 'run_2026_113_b',  triggered: '2026-04-23 09:00', actor: 'cron',       scope: 'nightly',              status: 'done',     duration: '1h 58m', stage: 'merge',   windows: 4096 },
];

// 64 epoch tiles for the QA grid — each is 5 s of ECG.
// flag: clean | ectopic | motion | noise | flatline ; sqi 0–1
function makeEpochs() {
  const flags = ['clean','clean','clean','clean','clean','clean','clean','ectopic','motion','noise','clean','clean','flatline','clean'];
  const arr = [];
  let t = 0;
  for (let i = 0; i < 64; i++) {
    const f = flags[(i * 7 + 3) % flags.length];
    const sqi = f === 'clean' ? 0.78 + (i % 7) * 0.03 : f === 'ectopic' ? 0.55 - (i % 4) * 0.05 : f === 'motion' ? 0.32 : f === 'noise' ? 0.18 : 0.04;
    arr.push({
      idx: i, t0: t, t1: t + 5, flag: f, sqi: Math.max(0.02, Math.min(0.99, sqi)),
      ibi_n: f === 'clean' ? 8 + (i % 3) : f === 'ectopic' ? 6 : f === 'motion' ? 4 : 2,
      decision: 'auto', // auto | accept | reject
    });
    t += 5;
  }
  return arr;
}

const VISIT_LOG = [
  { ts: '2026-04-25 09:18', actor: 'system',     event: 'merge.parquet written', kind: 'ok', detail: 'data/processed/deidentified/cga_12mo/NANO-0102.parquet · 0.42 MB' },
  { ts: '2026-04-25 09:14', actor: 'system',     event: 'HDA labels emitted',    kind: 'ok', detail: '51 epochs · 38 sustained · 9 orienting · 4 inattention' },
  { ts: '2026-04-25 09:11', actor: 'system',     event: 'HRV features computed', kind: 'ok', detail: 'RMSSD = 38.41 ms · HF = 412.1 ms² · pNN50 = 14.2 %' },
  { ts: '2026-04-25 09:07', actor: 'rgupta',     event: 'QA accepted',           kind: 'ok', detail: '49/51 epochs accepted · 2 ectopic flagged' },
  { ts: '2026-04-25 09:02', actor: 'system',     event: 'preprocess complete',   kind: 'ok', detail: '0.5–40 Hz bandpass · R-peak n=2,431 · ectopic 1.3 %' },
  { ts: '2026-04-25 08:58', actor: 'system',     event: 'ingest',                kind: 'ok', detail: 'Actiheart-5 · 22:14 min · 1024 Hz · file 14.8 MB' },
  { ts: '2026-04-25 08:42', actor: 'cstrickland', event: 'visit started',         kind: 'info', detail: 'cga_12mo · room USC-LAB-104 · examiner CST' },
];

// Trajectory data: RMSSD over CGA, by group — used in Results screen.
// Generated to look plausible: TD highest, ASIB middle, VPT lowest at early CGA, narrowing over time.
function makeTrajectory() {
  const months = [3, 6, 9, 12, 18, 24];
  const series = {
    VPT:  months.map((m, i) => ({ x: m, y: 24 + i * 4.2 + (i === 5 ? -1 : 0), n: 184 - i * 8 })),
    ASIB: months.map((m, i) => ({ x: m, y: 28 + i * 4.6,                       n: 26 - i * 1.5 })),
    TD:   months.map((m, i) => ({ x: m, y: 31 + i * 4.9,                       n: 21 - i * 1 })),
  };
  return { months, series };
}

// HDA phase distribution (counts) — by group
const HDA_DIST = {
  VPT:  { orienting: 142, sustained: 612, inattention: 84,  termination: 38 },
  ASIB: { orienting:  61, sustained: 184, inattention: 22,  termination: 11 },
  TD:   { orienting:  47, sustained: 198, inattention: 12,  termination:  6 },
};

// REDCap sync events
const REDCAP_EVENTS = [
  { ts: '09:14', form: 'visit_intake_v2',     n: 3, status: 'ok',   note: 'pushed' },
  { ts: '09:08', form: 'caregiver_q_v3',      n: 12, status: 'ok',  note: 'pulled' },
  { ts: '09:02', form: 'medical_history_v1',  n: 1, status: 'warn', note: 'missing dob → flagged' },
  { ts: '08:58', form: 'visit_intake_v2',     n: 2, status: 'ok',   note: 'pulled' },
  { ts: '08:51', form: 'asd_followup_v1',     n: 4, status: 'ok',   note: 'pulled' },
  { ts: '08:44', form: 'consent_v4',          n: 1, status: 'ok',   note: 'pushed' },
  { ts: '08:30', form: 'medical_history_v1',  n: 2, status: 'fail', note: 'token expired · retry' },
];

// Glossary entries — used by Tooltip 'gloss' prop for inline explanations.
const GLOSS = {
  RMSSD: 'Root Mean Square of Successive Differences between adjacent inter-beat intervals (ms). A vagal-tone marker — higher values typically indicate stronger parasympathetic regulation.',
  HF:    'High-Frequency power (0.15–0.4 Hz, ms²) of HRV spectrum. Reflects respiratory sinus arrhythmia / vagal activity in infants.',
  pNN50: 'Percent of successive IBI differences greater than 50 ms. A simple time-domain HRV index.',
  SDNN:  'Standard Deviation of NN (normal-to-normal) intervals across the window. Reflects overall HRV.',
  IBI:   'Inter-Beat Interval — time between consecutive R-peaks (ms). Building block of all HRV metrics.',
  CGA:   'Corrected Gestational Age — chronological age minus weeks born preterm. Standard for VPT longitudinal comparisons.',
  PMA:   'Post-Menstrual Age — gestational age + chronological age. Used at and immediately after NICU discharge.',
  VPT:   'Very Preterm — born < 32 weeks gestational age. The primary cohort in NANO (n=184 of 235 enrolled).',
  ASIB:  'Autism-Sibling cohort — younger siblings of an autistic child, enrolled as a higher-likelihood comparison group.',
  TD:    'Typically Developing — full-term, no autism family history. Comparison cohort.',
  HDA:   'Heart-rate Defined Attention — episode classification driven by HR change relative to baseline. Phases: orienting, sustained attention, inattention, termination.',
  SQI:   'Signal Quality Index — 0–1. Combines noise floor, R-peak SNR, and ectopic-beat fraction. Windows below 0.4 are auto-rejected; 0.4–0.6 surfaces for human review.',
  Epoch: '5-second window of ECG. The atomic unit of QA review and HDA labeling.',
  Window:'In NANO, a contiguous run of accepted epochs from one visit. HRV features are computed per window.',
  Ectopic:'Premature beat (PAC/PVC) deviating from the normal rhythm. Excluded before HRV computation but counted as a quality flag.',
  Orienting:'HDA phase 1 — initial rapid HR deceleration as infant attends to a novel stimulus.',
  Sustained:'HDA phase 2 — HR remains below baseline; engaged attention.',
  Inattention:'HDA phase 3 — HR returns toward baseline; attention waning.',
  Termination:'HDA phase 4 — HR overshoots baseline; attention has ended, often disengagement.',
  RedCap:'REDCap — REDCap (Research Electronic Data Capture). Web platform hosting all study forms; the dashboard syncs metadata from REDCap nightly + on-demand.',
  Actiheart5:'Actiheart-5 — chest-worn ECG + activity logger. 1024 Hz ECG, recorded continuously across each visit. Source of every raw .ecg file.',
  PHI:   'Protected Health Information. Names, DOBs, MRNs, exact addresses. Never enters data/processed/deidentified/.',
  HIPAA: 'Health Insurance Portability and Accountability Act. The dashboard logs access, enforces session timeouts, and prevents direct PHI export.',
};

Object.assign(window, {
  GROUPS, VISITS, PARTICIPANTS, STAGES, RUNS, VISIT_LOG, HDA_DIST,
  REDCAP_EVENTS, GLOSS, makeEpochs, makeTrajectory,
});
