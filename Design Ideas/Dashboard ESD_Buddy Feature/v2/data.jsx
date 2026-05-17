// Data for Dashboard ESD v2.

window.ESD2_KPIS = [
  { id: 'enroll',  label: 'Infants Enrolled',  value: 231,  unit: '/ 260',     sub: 'NANO Study · year 3 of 5',         tint: 'tint-peach',  accent: 'var(--peach-soft)',  delta: '+4 this week',     gloss: 'NANO',   spark: [180,188,195,201,209,214,220,224,227,231] },
  { id: 'epochs',  label: 'Epochs · 24h',      value: 1824, unit: 'windows',   sub: '5-second ECG segments',            tint: 'tint-ocean',  accent: 'var(--ocean-soft)',  delta: '+312 vs yesterday', gloss: 'Epoch',  spark: [820,940,1080,1200,1310,1450,1560,1680,1740,1824] },
  { id: 'rmssd',   label: 'Median RMSSD',      value: 38.4, unit: 'ms ±0.6',   sub: 'cohort vagal-tone marker',         tint: 'tint-sage',   accent: 'var(--sage-soft)',   delta: 'within band',       gloss: 'RMSSD',  spark: [35,36,37,36,38,37,39,38,38,39,38,38] },
  { id: 'redcap',  label: 'REDCap Health',     value: 99.8, unit: '%',         sub: 'sync rate · 0 PHI leaks',          tint: 'tint-green',  accent: 'rgba(85,168,104,0.18)', delta: 'all clear',      gloss: 'REDCap', spark: [99.4,99.5,99.7,99.6,99.8,99.8,99.9,99.8] },
  { id: 'auroc',   label: 'Model AUROC',       value: 0.899, unit: '↑',        sub: 'risk classifier · validation',     tint: 'tint-blue',   accent: 'rgba(76,114,176,0.18)', delta: '+0.012 vs prev',  gloss: 'HDA',    spark: [0.83,0.85,0.86,0.87,0.88,0.89,0.895,0.899] },
];

window.ESD2_COHORT = [
  { id: 'NANO-0231', group: 'VPT',  ga: 28.4, bw: 1180, complete: 88, qc: 'ok',     site: 'Greenville' },
  { id: 'NANO-0230', group: 'TD',   ga: 39.1, bw: 3220, complete: 96, qc: 'ok',     site: 'Columbia'   },
  { id: 'NANO-0229', group: 'ASIB', ga: 38.8, bw: 3080, complete: 64, qc: 'review', site: 'Columbia'   },
  { id: 'NANO-0228', group: 'VPT',  ga: 27.6, bw:  980, complete: 42, qc: 'review', site: 'Charleston' },
  { id: 'NANO-0227', group: 'TD',   ga: 39.6, bw: 3410, complete: 100, qc: 'ok',    site: 'Greenville' },
  { id: 'NANO-0226', group: 'ASIB', cga: 39.0, ga: 39.0, bw: 3160, complete: 78, qc: 'ok', site: 'Columbia' },
  { id: 'NANO-0225', group: 'VPT',  ga: 29.2, bw: 1340, complete: 91, qc: 'ok',     site: 'Columbia'   },
  { id: 'NANO-0224', group: 'VPT',  ga: 26.8, bw:  870, complete: 28, qc: 'flag',   site: 'Charleston' },
  { id: 'NANO-0223', group: 'TD',   ga: 40.2, bw: 3550, complete: 100, qc: 'ok',    site: 'Columbia'   },
  { id: 'NANO-0222', group: 'ASIB', ga: 38.4, bw: 2980, complete: 72, qc: 'ok',     site: 'Greenville' },
];

window.ESD2_SHAP = [
  { feat: 'RMSSD · cga_3mo',   val: 0.142, group: 'HRV' },
  { feat: 'LF/HF · cga_6mo',   val: 0.118, group: 'HRV' },
  { feat: 'CGA at recording',  val: 0.094, group: 'demo' },
  { feat: 'HDA % sustained',   val: 0.081, group: 'HDA' },
  { feat: 'pNN50 · cga_3mo',   val: 0.067, group: 'HRV' },
  { feat: 'Birth weight',      val: 0.054, group: 'demo' },
  { feat: 'NICU days',         val: 0.048, group: 'demo' },
];

window.ESD2_READING = [
  {
    title: 'Autonomic and attentional pathways in the emergence of autism: bridging mechanisms and real-world contexts in infancy',
    authors: 'Bradshaw, Platt, Yurkovic-Harding, Harding & Fu',
    meta: '2025 · Advances in Child Development and Behavior, vol. 69',
    abs: 'Reviews the ESD Lab\'s approach to integrating mechanistic research and real-world methodologies to explore autonomic and attentional pathways in early ASD development. Prospective longitudinal studies track ANS regulation and attention in elevated- vs. low-likelihood infants. Findings support the theory that infants later diagnosed with ASD exhibit early disruptions in parasympathetic modulation of arousal and attention across social and non-social contexts.',
    tag: 'Theory · Review',
  },
  {
    title: 'Capturing the complexity of autism: Applying a developmental cascades framework',
    authors: 'Bradshaw',
    meta: '2022 · Child Development Perspectives',
    abs: 'Proposes a developmental cascades lens for understanding how early differences in foundational systems — attention, ANS, motor — set off ripple effects that shape the emergence of ASD. Argues that lower-level processes produce cross-domain, reciprocal effects on later social-communication and repetitive-behavior outcomes.',
    tag: 'Framework',
  },
  {
    title: 'Specific Aims · Autonomic regulation of attention as a predictive biomarker for autism',
    authors: 'Bradshaw (PI) · NIH R01 application',
    meta: '2024 · NIH R01 · IRB Pro00115234',
    abs: 'Three aims drive the NANO Study. (1) Compare maturation of autonomic regulation of attention at 1–3 months across ASIBs, PTs, and TDs. (2) Determine the moment-to-moment influence of HDA on interactive behavior across 6, 9, 12 months. (3) Use machine learning to predict ASD symptoms at age 3 from infant autonomic and attentional features.',
    tag: 'Grant',
  },
  {
    title: 'Research Strategy · longitudinal design, measures, and analytic plan',
    authors: 'Bradshaw (PI) · NIH R01 application',
    meta: '2024 · NIH R01 — sections A–E',
    abs: 'Full longitudinal design rationale, recruitment plan for ASIBs / PTs / TDs, measures (Actiheart-5 ECG, head-mounted eye tracking, naturalistic in-home recording), and the multi-level modeling plan for HRV trajectories and HDA-behavior coupling. Closes with the ML analytic strategy underpinning Aim 3.',
    tag: 'Grant',
  },
];

// ============================================================
// Study Aims — three concrete cards expandable.
// ============================================================
window.ESD2_AIMS = [
  {
    n: '01',
    title: 'Maturation of autonomic regulation of attention',
    window: 'Ages 1 – 3 months',
    primary: 'Compare ASIBs, PTs, and TDs on how Heart-Defined Attention (HDA) matures across the early infant period.',
    hypothesis: 'ASIBs show typical HDA at 1 month, then their HDA attenuates from 1–3 months as ANS commands an increasingly larger role. PTs show delayed maturation across the same window due to broad ANS dysfunction.',
    method: 'Per visit: 5-second ECG epochs from Actiheart-5, HR change relative to a moving baseline labels each epoch with one of four HDA phases (orienting, sustained, inattention, termination).',
    outcome: '% time in HDA, magnitude of HR deceleration, HDA-phase distribution.',
    icon: 'wave',
    tint: 'tint-peach',
  },
  {
    n: '02',
    title: 'HDA × interactive behavior coordination',
    window: 'Ages 6, 9, 12 months',
    primary: 'Determine the moment-to-moment influence of autonomic regulation on interactive behavior across the first year.',
    hypothesis: 'ASIBs show weakening HDA-behavior associations from 6–12 months as early ASD symptoms emerge. PTs show initially weak associations that strengthen with ANS and behavioral maturation.',
    method: 'Naturalistic in-home recordings + head-mounted eye tracking + synchronous ECG. HDA epochs are aligned to interactive behavior episodes (joint attention, social gaze, vocalization).',
    outcome: 'Lead-lag cross-correlation between HDA and behavioral engagement; visit-level coupling coefficient.',
    icon: 'link',
    tint: 'tint-ocean',
  },
  {
    n: '03',
    title: 'Predicting ASD symptoms at age 3',
    window: 'From infant (1–12mo) features',
    primary: 'Use machine learning to derive a biomarker predicting later emergence of ASD symptoms from infant autonomic and attentional features (Aims 1–2 variables).',
    hypothesis: 'Features related to autonomic regulation of attention — not bulk HRV or attention alone — best predict 3-year ASD symptom severity.',
    method: 'Gradient-boosted classifier on cohort-stratified train/validation splits. SHAP attributions verify HDA-derived features dominate. Calibration curves and confusion matrices reported per group.',
    outcome: 'Held-out AUROC, F1, calibration, and group-stratified performance.',
    icon: 'brain',
    tint: 'tint-sage',
  },
];

// ============================================================
// Data Architecture — layered, click-to-inspect.
// ============================================================
window.ESD2_ARCH = [
  {
    id: 'devices',
    title: 'Devices & Sensors',
    short: 'Edge capture',
    tint: 'tint-peach',
    items: [
      { name: 'Actiheart-5',         desc: 'Chest-worn ambulatory ECG + accelerometer. 1024 Hz single-lead, continuous recording across each visit.' },
      { name: 'Pupil Labs Invisible', desc: 'Head-mounted eye tracker for naturalistic gaze in young infants. 200 Hz binocular pupil + scene camera.' },
      { name: 'Audio array',         desc: 'Two-channel ambient audio paired with the eye tracker for vocalization episode segmentation.' },
    ],
  },
  {
    id: 'capture',
    title: 'Metadata & Capture',
    short: 'REDCap forms · session log',
    tint: 'tint-ocean',
    items: [
      { name: 'REDCap (visit_intake_v2)',  desc: 'Demographics, gestational age, NICU history, parental consent. Hosted on USC institutional REDCap.' },
      { name: 'caregiver_q_v3',            desc: 'Caregiver questionnaire battery — sleep, feeding, infant temperament.' },
      { name: 'session log',                desc: 'Examiner notes, Actiheart-5 contact integrity, eye-tracker calibration metrics.' },
    ],
  },
  {
    id: 'storage',
    title: 'Encrypted Storage',
    short: 'S3 + KMS',
    tint: 'tint-blue',
    items: [
      { name: 's3://nano-raw/',     desc: 'Encrypted raw ECG, video, audio. Access requires CITI attestation + USC SSO. KMS-key-rotated quarterly.' },
      { name: 's3://nano-meta/',    desc: 'REDCap exports cached and joined against device manifest. Hash-keyed against NANO-XXXX ID.' },
      { name: 'audit/access.log',   desc: 'Append-only access log persisted to immutable S3 Object Lock for the IRB-required 7-year retention.' },
    ],
  },
  {
    id: 'compute',
    title: 'Preprocess & QA',
    short: 'R-peaks · SQI · HDA labels',
    tint: 'tint-sage',
    items: [
      { name: 'Bandpass · R-peak detection', desc: '0.5–40 Hz Butterworth bandpass, Pan–Tompkins R-peak detection, IBI extraction. Drops > 20% ectopic windows.' },
      { name: 'Signal Quality Index',         desc: '0–1 per epoch combining R-peak coherence, noise floor, and ectopic fraction. < 0.4 auto-rejected, 0.4–0.6 surfaces for human review.' },
      { name: 'HDA labeler',                  desc: 'Phase classifier (orienting / sustained / inattention / termination) driven by HR change against a 30-s rolling baseline.' },
    ],
  },
  {
    id: 'features',
    title: 'Features & Long-Form',
    short: 'parquet · per-epoch',
    tint: 'tint-rose',
    items: [
      { name: 'HRV features',     desc: 'Time- and frequency-domain: RMSSD, SDNN, pNN50, LF, HF, LF/HF. Computed per accepted epoch and aggregated per visit.' },
      { name: 'HDA episode table', desc: 'One row per HDA episode: onset, duration, phase, magnitude of deceleration, paired behavior label.' },
      { name: 'cohort.parquet',   desc: 'Joined long-format table: participant × visit × epoch. Strips PHI before write. Source of every figure in this dashboard.' },
    ],
  },
  {
    id: 'models',
    title: 'Models & Inference',
    short: 'XGBoost · SHAP · calibration',
    tint: 'tint-amber',
    items: [
      { name: 'Risk classifier (Aim 3)',    desc: 'Gradient-boosted classifier predicting 3-year ASD symptom presence from infant HRV + HDA features. AUROC 0.899 on validation.' },
      { name: 'HDA-behavior coupling model', desc: 'Mixed-effects model estimating lead-lag cross-correlation between HDA and interactive behavior; per-group slopes for Aim 2.' },
      { name: 'Trajectory model (Aim 1)',    desc: 'Latent-growth curve model on HDA maturation 1–3 months. MICE imputation across visits, k = 20.' },
    ],
  },
];

// ============================================================
// Model card data
// ============================================================
window.ESD2_MODEL = {
  name: 'nano-risk-v0.3',
  algorithm: 'XGBoost · 600 trees · max-depth 4 · learning rate 0.04',
  trained_on: '184 infants · 3 visits each (1mo, 3mo, 6mo) · 552 visit rows',
  validation: 'Held-out 20% · stratified by group',
  features_in: 24,
  outputs: 'P(ASD symptoms ≥ ADOS-T threshold at age 3)',
  metrics: { auroc: 0.899, f1: 0.853, precision: 0.809, recall: 0.905, ece: 0.041, brier: 0.094 },
  feature_groups: [
    { id: 'hrv',  label: 'HRV (RMSSD / HF / pNN50)',  count: 12, color: 'var(--usc-garnet)' },
    { id: 'hda',  label: 'HDA phase composition',     count: 6,  color: '#8172B2' },
    { id: 'demo', label: 'Demographics',              count: 4,  color: 'var(--warm-500)' },
    { id: 'site', label: 'Site / recording quality',  count: 2,  color: '#4C72B0' },
  ],
};

// Live prediction sliders — input ranges
window.ESD2_SLIDER_INPUTS = [
  { id: 'rmssd_3m',      label: 'RMSSD @ 3mo (ms)',           min: 15, max: 60, step: 0.5, default: 38.4, weight: -0.32, gloss: 'RMSSD' },
  { id: 'pct_sustained', label: '% time in sustained HDA',     min: 10, max: 80, step: 1,   default: 52,    weight: -0.28, gloss: 'HDA' },
  { id: 'hr_decel',      label: 'Max HR deceleration (bpm)',   min: 1,  max: 14, step: 0.5, default: 7.2,   weight: -0.18 },
  { id: 'cga_3m_visit',  label: 'CGA at 3mo visit (wk)',       min: 36, max: 56, step: 0.5, default: 49,    weight: 0.04,  gloss: 'CGA' },
  { id: 'ectopic',       label: 'Ectopic %',                   min: 0,  max: 25, step: 0.5, default: 1.3,   weight: 0.14 },
];

window.ESD2_STAGES = [
  { id: 'intake',     label: 'Intake',           short: 'consent · forms',            inflight: 6,  done: 482,   color: 'var(--peach)',   desc: 'REDCap consent forms, caregiver questionnaires and visit scheduling. Every entry gets a NANO-XXXX identifier here.' },
  { id: 'ingest',     label: 'Ingest',           short: 'Actiheart-5 → S3',           inflight: 14, done: 7128,  color: 'var(--ocean)',   desc: 'Raw .ecg files from the chest-worn Actiheart-5 device land in encrypted S3. 1024 Hz sampling, single-lead.' },
  { id: 'preprocess', label: 'Preprocess',       short: 'bandpass · R-peaks',         inflight: 23, done: 6912,  color: 'var(--ocean)',   desc: '0.5–40 Hz bandpass filter, Pan–Tompkins R-peak detection, IBI extraction. Drops anything with > 20 % ectopic beats.' },
  { id: 'qa',         label: 'Window QA',        short: 'SQI · human review',         inflight: 27, done: 6604,  color: 'var(--sage)',    desc: 'Signal Quality Index per 5-s epoch. < 0.4 auto-rejected, 0.4–0.6 surfaces for a human reviewer.' },
  { id: 'hrv',        label: 'HRV Features',     short: 'RMSSD · HF · pNN50',          inflight: 8,  done: 6480,  color: 'var(--sage)',    desc: 'Time- and frequency-domain HRV computed per-window. Output: long-format parquet keyed by visit and epoch.' },
  { id: 'export',     label: 'De-identify',      short: 'PHI strip · export',         inflight: 0,  done: 6480,  color: 'var(--rose)',    desc: 'Drops DOB, MRN, name, address. Hash-keyed exports written to data/processed/deidentified/. Audit log appended.' },
];

window.ESD2_PARTICIPANTS = [
  { id: 'NANO-0231', group: 'VPT',  visit: 'cga_3mo',  status: 'awaiting_feedback', when: '8 min',   cga: '38.4 wk', site: 'Greenville' },
  { id: 'NANO-0230', group: 'TD',   visit: 'cga_6mo',  status: 'visit_complete',    when: '24 min',  cga: '40.1 wk', site: 'Columbia'   },
  { id: 'NANO-0229', group: 'ASIB', visit: 'cga_3mo',  status: 'redcap_synced',     when: '41 min',  cga: '41.0 wk', site: 'Columbia'   },
  { id: 'NANO-0228', group: 'VPT',  visit: 'nicu_dc',  status: 'qa_review',         when: '1 h',     cga: '36.2 wk', site: 'Charleston' },
  { id: 'NANO-0227', group: 'TD',   visit: 'cga_12mo', status: 'feedback_sent',     when: '2 h',     cga: '40.6 wk', site: 'Greenville' },
  { id: 'NANO-0226', group: 'ASIB', visit: 'cga_9mo',  status: 'visit_complete',    when: '3 h',     cga: '39.8 wk', site: 'Columbia'   },
  { id: 'NANO-0225', group: 'VPT',  visit: 'cga_6mo',  status: 'redcap_synced',     when: '4 h',     cga: '32.5 wk', site: 'Columbia'   },
];

window.ESD2_INSIGHTS = [
  { kind: 'alert',  term: 'QA',     text: 'NANO-0173 · cga_6mo shows ectopic beats in 14 of 64 epochs — surfaced for human review.' },
  { kind: 'warn',   term: 'forms',  text: '2 intake forms missing DOB · NANO-0228, NANO-0231 · auto-paged S. Patel at 09:14.' },
  { kind: 'info',   term: 'flow',   text: 'Pipeline throughput is 312 windows / h — 18 % above the 7-day median.' },
  { kind: 'ok',     term: 'PHI',    text: 'REDCap field-map check passed for medical_history_v1 — all 6 PHI columns gated.' },
  { kind: 'alert',  term: 'device', text: 'NANO-0214 · Actiheart-5 contact lost at t = 142 s — visit will need a reschedule.' },
];

window.ESD2_GLOSS = {
  HRV:     'Heart-Rate Variability — beat-to-beat variation in inter-beat intervals. Core outcome of the NANO Study and a window into autonomic regulation.',
  RMSSD:   'Root Mean Square of Successive Differences between IBIs. The classic vagal-tone marker, sensitive to parasympathetic activity.',
  IBI:     'Inter-Beat Interval — the time between two successive R-peaks, in milliseconds.',
  CGA:     'Corrected Gestational Age — chronological age adjusted for prematurity. NANO visits are scheduled on CGA, not birth date.',
  VPT:     'Very Preterm — infants born < 32 weeks gestation. The primary at-risk cohort for the NANO Study.',
  ASIB:    'Autism Sibling — younger siblings of children with confirmed ASD. Elevated-likelihood comparison cohort.',
  TD:      'Typically Developing — term-born comparison cohort with no family ASD history.',
  HDA:     'Heart-rate Defined Attention — phases (orienting / sustained / inattention / termination) inferred from HR change relative to a moving baseline.',
  SQI:     'Signal Quality Index — 0–1 score per epoch combining R-peak coherence and noise floor. < 0.4 auto-rejected.',
  Epoch:   'A 5-second window of ECG. The atomic unit of QA review and feature extraction.',
  Actiheart:'Actiheart-5 — the chest-worn ambulatory ECG and accelerometer used in NANO. Single-lead, 1024 Hz.',
  REDCap:  'Research Electronic Data Capture — the web-based metadata system holding every NANO visit form.',
  PHI:     'Protected Health Information — HIPAA-defined identifiers like DOB, MRN, name, address. Stripped before any export.',
  HIPAA:   'Health Insurance Portability and Accountability Act — the federal rule the dashboard, audit trail and exports all answer to.',
  NANO:    'Neurodevelopment of Autonomic and Neural Organization — the 5-year NIH R01-funded longitudinal study of 260 VPT infants.',
};

window.ESD2_STATUS = {
  visit_complete:     { label: 'visit complete',    dot: 'var(--green)' },
  awaiting_feedback:  { label: 'awaiting feedback', dot: 'var(--amber)' },
  redcap_synced:      { label: 'REDCap synced',     dot: 'var(--blue)' },
  qa_review:          { label: 'QA review',         dot: 'var(--purple)' },
  feedback_sent:      { label: 'feedback sent',     dot: 'var(--usc-garnet)' },
};

window.ESD2_GROUP_STYLE = {
  VPT:  { color: '#73000a' },
  ASIB: { color: '#5e3776' },
  TD:   { color: '#3d6650' },
};
