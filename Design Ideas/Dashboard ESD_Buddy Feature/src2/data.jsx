// Mock data for the warmer ESD Lab Dashboard.

window.ESD_KPIS = [
  {
    id: 'enroll',
    label: 'Active Enrollees',
    value: 231,
    unit: '/ 260',
    sub: 'NANO Study · cohort building',
    accent: 'sage',
    delta: '+4 this wk',
    deltaKind: 'up',
    spark: [180, 188, 195, 201, 209, 214, 220, 224, 227, 231],
    badge: '4 new',
  },
  {
    id: 'evals',
    label: 'Evaluations Pending',
    value: 12,
    unit: 'families',
    sub: 'awaiting developmental feedback',
    accent: 'sand',
    delta: '–3 wk over wk',
    deltaKind: 'up',
    spark: [18, 17, 16, 16, 15, 14, 13, 12, 12],
    badge: '3 booked',
  },
  {
    id: 'epochs',
    label: 'Epochs Processed · 24h',
    value: 1824,
    unit: 'windows',
    sub: 'ECG 5-s segments through pipeline',
    accent: 'ocean',
    delta: '+312 vs yesterday',
    deltaKind: 'up',
    spark: [820, 940, 1080, 1200, 1310, 1450, 1560, 1680, 1740, 1824],
  },
  {
    id: 'redcap',
    label: 'REDCap Health',
    value: 99.8,
    unit: '%',
    sub: 'sync rate · last 24 h',
    accent: 'mint',
    delta: '0 PHI leaks',
    deltaKind: 'up',
    spark: [99.4, 99.5, 99.7, 99.6, 99.8, 99.8, 99.9, 99.8],
  },
];

window.ESD_STAGES = [
  { id: 'intake',     label: 'Intake',           short: 'forms',    inflight: 6,  done: 482,    color: 'sand'  },
  { id: 'ingest',     label: 'Actiheart-5 Ingest', short: '.ecg → s3', inflight: 14, done: 7128,   color: 'ocean' },
  { id: 'preprocess', label: 'ECG Preprocess',   short: 'bandpass · R-peaks', inflight: 23, done: 6912,  color: 'ocean' },
  { id: 'qa',         label: 'Window QA',        short: 'SQI · flag',  inflight: 27, done: 6604,  color: 'sage' },
  { id: 'hrv',        label: 'HRV Features',     short: 'RMSSD · HF', inflight: 8,  done: 6480,  color: 'sage' },
  { id: 'deid',       label: 'De-Identify',      short: 'export-safe', inflight: 0, done: 6480,  color: 'mint' },
];

window.ESD_PARTICIPANTS = [
  { id: 'NANO-0231', group: 'VPT',  visit: 'cga_3mo',   status: 'awaiting_feedback', when: '8 min ago',  cga: '38.4 wk', site: 'Greenville' },
  { id: 'NANO-0230', group: 'TD',   visit: 'cga_6mo',   status: 'visit_complete',   when: '24 min ago', cga: '40.1 wk', site: 'Columbia'   },
  { id: 'NANO-0229', group: 'ASIB', visit: 'cga_3mo',   status: 'redcap_synced',    when: '41 min ago', cga: '41.0 wk', site: 'Columbia'   },
  { id: 'NANO-0228', group: 'VPT',  visit: 'nicu_dc',   status: 'qa_review',        when: '1 h ago',    cga: '36.2 wk', site: 'Charleston' },
  { id: 'NANO-0227', group: 'TD',   visit: 'cga_12mo',  status: 'feedback_sent',    when: '2 h ago',    cga: '40.6 wk', site: 'Greenville' },
  { id: 'NANO-0226', group: 'ASIB', visit: 'cga_9mo',   status: 'visit_complete',   when: '3 h ago',    cga: '39.8 wk', site: 'Columbia'   },
  { id: 'NANO-0225', group: 'VPT',  visit: 'cga_6mo',   status: 'redcap_synced',    when: '4 h ago',    cga: '32.5 wk', site: 'Columbia'   },
];

window.ESD_INSIGHTS = [
  { kind: 'alert',  text: 'NANO-0173 · cga_6mo shows ectopic beats in 14 of 64 epochs — surfaced for human QA review.' },
  { kind: 'warn',   text: '2 Intake forms missing DOB · NANO-0228, NANO-0231 · auto-paged Sarah at 09:14.' },
  { kind: 'info',   text: 'Pipeline throughput is 312 windows/h, 18 % above 7-day median.' },
  { kind: 'ok',     text: 'REDCap field-map check passed for medical_history_v1 · all PHI columns gated.' },
  { kind: 'alert',  text: 'NANO-0214 · Actiheart-5 contact lost at t = 142 s — recommend rescheduling visit.' },
];

window.ESD_GLOSS = {
  ASD: 'Autism Spectrum Disorder. The Early Social Development Lab studies its earliest behavioral and physiological signatures in infants.',
  HRV: 'Heart-Rate Variability. Beat-to-beat variation in IBI; reflects autonomic regulation. Core outcome of the NANO Study.',
  RMSSD: 'Root Mean Square of Successive Differences between IBIs. Sensitive to vagal tone — the parasympathetic brake.',
  HF: 'High-Frequency power (0.15–0.40 Hz) of the IBI spectrum. Vagally mediated; reflects respiratory sinus arrhythmia.',
  IBI: 'Inter-Beat Interval. The time between successive R-peaks, in milliseconds.',
  CGA: 'Corrected Gestational Age. Chronological age adjusted for prematurity. NANO visits are scheduled by CGA.',
  PMA: 'Post-Menstrual Age. Sum of gestational age and chronological age in weeks.',
  VPT: 'Very Preterm. Infants born < 32 weeks gestation — primary at-risk cohort in NANO.',
  ASIB: 'Autism Sibling. Younger siblings of children with confirmed ASD diagnoses; elevated likelihood cohort.',
  TD: 'Typically Developing. Term-born comparison cohort.',
  HDA: 'Heart-rate Defined Attention. Phases (orienting / sustained / inattention / termination) inferred from HR change relative to a moving baseline.',
  SQI: 'Signal Quality Index. 0–1 score per epoch from R-peak coherence and noise floor. < 0.4 auto-rejected.',
  Epoch: '5-second window of ECG used as the unit of QA review and feature extraction.',
  Actiheart: 'Actiheart-5 — chest-worn ambulatory ECG and accelerometer used in the NANO Study. 1024 Hz, single-lead.',
  REDCap: 'Research Electronic Data Capture. Web-based metadata system for clinical studies — NANO uses REDCap for visit forms.',
  PHI: 'Protected Health Information. HIPAA-defined identifiers (DOB, MRN, name, address). Stripped from any export.',
  HIPAA: 'Health Insurance Portability and Accountability Act. Federal rule governing the privacy of health data.',
};

window.statusMap = {
  visit_complete:     { label: 'visit complete',     dot: '#5b9577' },
  awaiting_feedback:  { label: 'awaiting feedback',  dot: '#c79026' },
  redcap_synced:      { label: 'REDCap synced',      dot: '#6b8bb8' },
  qa_review:          { label: 'QA review',          dot: '#a06000' },
  feedback_sent:      { label: 'feedback sent',      dot: '#73000a' },
};
