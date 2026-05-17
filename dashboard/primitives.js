// ==========================================================================
// ESD Dashboard Primitives — vanilla JS ports of the design prototype library
// ==========================================================================

// ---------- GLOSSARY — term definitions for Gloss tooltips ----------
const ESD_GLOSSARY = {
  NANO:       "Neurodevelopment of Autonomic and Neural Organization — 5-year R01 tracking autonomic maturation in very preterm infants.",
  VPT:        "Very Preterm — born < 32 weeks gestational age. Primary cohort (n ≈ 200).",
  ASIB:       "Autism Sibling — younger siblings of autistic children with elevated familial likelihood (n ≈ 30).",
  TD:         "Typically Developing — term-born infants with no ASD family history (n ≈ 30).",
  RMSSD:      "Root Mean Square of Successive Differences — a time-domain HRV metric reflecting parasympathetic (vagal) cardiac regulation.",
  RSA:        "Respiratory Sinus Arrhythmia — the high-frequency component of HRV that tracks breathing-related vagal modulation.",
  SDNN:       "Standard Deviation of NN intervals — overall HRV, reflecting both sympathetic and parasympathetic contributions.",
  HDA:        "Heart-rate Deceleration Analysis — quantifies anticipatory cardiac slowing linked to attentional orienting.",
  SQI:        "Signal Quality Index — automated metric assessing ECG trace quality. Segments below threshold are excluded.",
  CGA:        "Corrected Gestational Age — chronological age adjusted for prematurity. Measurement windows are anchored at CGA milestones.",
  REDCap:     "Research Electronic Data Capture — the lab's primary clinical data management platform.",
  Actiheart:  "Actiheart-5 — a lightweight, single-lead ECG + accelerometer device worn by enrolled infants during visits.",
  HIPAA:      "Health Insurance Portability and Accountability Act — U.S. regulation governing the privacy of protected health information (PHI).",
  AUROC:      "Area Under the Receiver Operating Characteristic curve — discrimination metric for binary classifiers. Range 0.5 (chance) to 1.0 (perfect).",
  SHAP:       "SHapley Additive exPlanations — a game-theoretic approach to feature attribution that quantifies each feature's contribution to individual predictions.",
  PHI:        "Protected Health Information — any individually identifiable health data governed by HIPAA. Never displayed on this dashboard.",
};

// ---------- ESD2 Data Constants (from design prototype) ----------
const ESD2_KPIS = [
  { id: 'enroll', label: 'Infants enrolled',   gloss: 'NANO', value: 231, unit: '/ 260', sub: 'ASIB 26 · VPT 178 · TD 27', delta: '+3 this week',   tint: 'tint-peach', spark: [198, 205, 210, 218, 224, 228, 231] },
  { id: 'epochs', label: 'Epochs · 24 h',      gloss: null,   value: 1824, unit: '',     sub: 'Actiheart segments processed',   delta: '+312 today',   tint: '',           spark: [1420, 1510, 1580, 1640, 1710, 1770, 1824] },
  { id: 'rmssd',  label: 'Median RMSSD',        gloss: 'RMSSD', value: 38.4, unit: 'ms', sub: '6-mo CGA cohort-wide',          delta: '−0.8 vs prior', tint: 'tint-sage',  spark: [36.1, 37.2, 37.8, 38.0, 38.6, 38.2, 38.4] },
  { id: 'auroc',  label: 'Best AUROC',          gloss: 'AUROC', value: 0.899, unit: '',   sub: 'Gradient-boosted, held-out 20%', delta: '+0.012 retrain', tint: 'tint-ocean', spark: [0.841, 0.855, 0.862, 0.871, 0.882, 0.891, 0.899] },
];

const ESD2_STAGES = [
  { id: 'intake',       label: 'Intake',       short: 'device capture',     inflight: 14, done: 1892, color: 'var(--peach)',   desc: 'Raw Actiheart-5 traces arrive alongside REDCap visit context and infant-state notes.' },
  { id: 'ingest',       label: 'Ingest',       short: 'secure mount',       inflight: 14, done: 1878, color: 'var(--ocean)',   desc: 'Files enter the encrypted mount, receive BLAKE3 checksums and an auditable handoff record.' },
  { id: 'preprocess',   label: 'Preprocess',   short: 'ECG cleanup',        inflight: 8,  done: 1870, color: 'var(--sage)',    desc: 'Bandpass filter, R-peak detection, ectopic-beat interpolation, and timestamp harmonization.' },
  { id: 'window_qa',    label: 'Window QA',    short: 'signal quality',     inflight: 6,  done: 1864, color: 'var(--usc-gold)',desc: 'SQI rules scan each 30-second segment. Below-threshold windows are flagged for review or exclusion.' },
  { id: 'hrv_features', label: 'HRV Features', short: 'feature extraction', inflight: 4,  done: 1860, color: 'var(--rose)',    desc: 'Accepted windows are distilled into RMSSD, RSA, SDNN, and HDA features for longitudinal modelling.' },
  { id: 'deidentify',   label: 'De-identify',  short: 'PHI scrub',          inflight: 0,  done: 1860, color: '#55A868',       desc: 'Surrogate IDs replace real identifiers. Only aggregate or PHI-free outputs reach downstream analysis.' },
];

const ESD2_AIMS = [
  { n: 1, title: 'Autonomic Trajectories',   window: 'NICU → CGA 12 mo', primary: 'Characterize RSA, RMSSD, HDA growth curves across VPT, ASIB, TD', hypothesis: 'VPT infants show flatter RSA slope and elevated RMSSD variability vs. TD through 12 months CGA.', method: 'Multilevel growth-curve models with random intercept + slope per participant, stratified by cohort.', outcome: 'Group × time interaction on autonomic trajectory shape.', tint: 'tint-peach' },
  { n: 2, title: 'Attention Mediation',       window: 'CGA 12 → 24 mo', primary: 'Test whether 12-mo HDA mediates the link between ANS dysregulation and 24-mo attention', hypothesis: 'Heart-rate deceleration at 12 mo mediates group differences in sustained attention at 24 mo.', method: 'Structural equation model with ANS → HDA → attention path, controlling for GA and SES.', outcome: 'Significant indirect effect through HDA with > 30% variance explained.', tint: 'tint-sage' },
  { n: 3, title: 'Predictive Classifier',     window: 'CGA 3 + 6 mo → Age 3', primary: 'Build and validate a classifier predicting ADOS-2 positive screen from early biomarkers', hypothesis: 'A gradient-boosted classifier trained on 3- and 6-mo HRV features achieves AUROC > 0.85 on held-out data.', method: 'Stratified 5-fold CV, participant-level holdout, Platt calibration per cohort.', outcome: 'Published, calibrated risk model with feature-level SHAP attributions.', tint: 'tint-ocean' },
];

const ESD2_MODEL = {
  name: 'xgb_nano_v3.2',
  algorithm: 'XGBoost · gradient boosted trees',
  features_in: 42,
  trained_on: '1,860 visit-epochs (n = 204 infants)',
  metrics: { auroc: 0.899, f1: 0.853, ece: 0.031, brier: 0.092 },
  feature_groups: [
    { id: 'hrv',  label: 'HRV time-domain',   count: 14, color: 'var(--usc-garnet)' },
    { id: 'hda',  label: 'HDA / attention',    count: 8,  color: '#8172B2' },
    { id: 'freq', label: 'HRV frequency',      count: 10, color: '#4C72B0' },
    { id: 'demo', label: 'Demographics',       count: 6,  color: 'var(--warm-500)' },
    { id: 'acti', label: 'Actiheart quality',   count: 4,  color: '#55A868' },
  ],
};

const ESD2_SHAP = [
  { feat: 'RMSSD variability (6 mo)',     val: 0.142, group: 'HRV' },
  { feat: 'HDA anticipatory slope',       val: 0.118, group: 'HDA' },
  { feat: 'RSA baseline (3 mo)',          val: 0.097, group: 'HRV' },
  { feat: 'GA at birth (weeks)',          val: 0.085, group: 'demo' },
  { feat: 'HDA latency × group',         val: 0.074, group: 'HDA' },
  { feat: 'SDNN trend 3→6 mo',           val: 0.068, group: 'HRV' },
  { feat: 'RSA reactivity (Δ baseline→still-face)', val: 0.061, group: 'HRV' },
  { feat: 'Birth weight (g)',             val: 0.044, group: 'demo' },
];

const ESD2_ARCH = [
  { id: 'devices',  title: 'Device Capture',      short: 'Actiheart-5 + REDCap forms', tint: 'tint-peach', items: [{ name: 'Actiheart-5', desc: 'Single-lead ECG at 1024 Hz, worn for 24 h per visit' }, { name: 'REDCap', desc: 'Caregiver questionnaires, visit metadata, QC checklists' }] },
  { id: 'secure',   title: 'Secure Ingest',        short: 'Encrypted mount + checksums', tint: '', items: [{ name: 'BLAKE3 checksum', desc: 'Verify file integrity before pipeline entry' }, { name: 'AES-256 mount', desc: 'All raw data at rest on LUKS-encrypted NVMe' }] },
  { id: 'preproc',  title: 'ECG Preprocessing',    short: 'Filtering + peak detection', tint: 'tint-sage', items: [{ name: 'Bandpass filter', desc: '0.5–40 Hz Butterworth, 4th order' }, { name: 'R-peak detection', desc: 'Pan-Tompkins with adaptive threshold' }, { name: 'Ectopic filter', desc: 'Malik et al. correction for premature beats' }] },
  { id: 'qa',       title: 'Window QA',             short: 'SQI + segment rules', tint: '', items: [{ name: 'SQI threshold', desc: 'Segments with SQI < 0.85 flagged for review' }, { name: '30-s windowing', desc: 'Non-overlapping epochs for stationary HRV' }] },
  { id: 'features', title: 'Feature Extraction',    short: 'Time + frequency + nonlinear', tint: 'tint-ocean', items: [{ name: 'RMSSD', desc: 'Vagal regulation marker' }, { name: 'RSA', desc: 'HF band 0.15–0.4 Hz' }, { name: 'SDNN', desc: 'Overall variability' }, { name: 'HDA', desc: 'Anticipatory cardiac deceleration' }] },
  { id: 'deident',  title: 'De-identification',     short: 'Surrogate IDs + PHI scrub', tint: '', items: [{ name: 'Surrogate mapping', desc: 'NANO-{group}-{sequence} replaces real IDs' }, { name: 'Date shifting', desc: 'Visit dates shifted by random offset per participant' }] },
];

const ESD2_SLIDER_INPUTS = [
  { id: 'rmssd_6',   label: 'RMSSD (6 mo)',        gloss: 'RMSSD', min: 10, max: 70,   step: 0.5, default: 38.4, weight: -0.22 },
  { id: 'hda_slope',  label: 'HDA anticipatory slope', gloss: 'HDA', min: -2, max: 2,   step: 0.1, default: 0.4,  weight: 0.35 },
  { id: 'rsa_3',      label: 'RSA baseline (3 mo)', gloss: 'RSA', min: 1,  max: 9,   step: 0.1, default: 5.2,  weight: -0.18 },
  { id: 'ga',         label: 'GA at birth (wk)',    gloss: 'CGA', min: 24, max: 42,  step: 0.5, default: 29.0, weight: -0.12 },
  { id: 'bw',         label: 'Birth weight (g)',    gloss: null,  min: 500, max: 4200, step: 50,  default: 1280, weight: -0.08 },
  { id: 'sdnn_delta', label: 'SDNN trend 3→6 mo',  gloss: 'SDNN', min: -15, max: 15, step: 0.5, default: 3.2,  weight: -0.10 },
];

// ---------- Reveal — IntersectionObserver scroll animation ----------
function initRevealObserver() {
  if (typeof IntersectionObserver === 'undefined') return;
  const els = document.querySelectorAll('.esd-reveal');
  if (!els.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('esd-revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => observer.observe(el));
}

// ---------- Sparkline — tiny SVG line chart ----------
function createSparkline(values, w, h) {
  if (!values || !values.length) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(' ');
  const areaD = `M0,${h} L${pts.map(p => p).join(' L')} L${w},${h} Z`;
  return `<svg class="esd-sparkline" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    <polyline points="${line}" fill="none" stroke="var(--usc-garnet, #73000a)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <polygon points="0,${h} ${line} ${w},${h}" fill="var(--usc-garnet, #73000a)" opacity="0.12"/>
  </svg>`;
}

// ---------- Counter — animated number ticker ----------
function animateCounter(el, to, opts = {}) {
  if (!el) return;
  const decimals = opts.decimals || 0;
  const duration = opts.duration || 1200;
  const formatter = opts.formatter || null;
  const start = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);

  function tick(now) {
    const elapsed = now - start;
    const t = Math.min(1, elapsed / duration);
    const v = ease(t) * to;
    if (formatter) {
      el.textContent = formatter(v);
    } else {
      el.textContent = v.toFixed(decimals);
    }
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---------- Gloss — inline term tooltip ----------
function initGlossTooltips() {
  const glossEls = document.querySelectorAll('.esd-gloss[data-term]');
  let activePopup = null;

  function hidePopup() {
    if (activePopup) {
      activePopup.remove();
      activePopup = null;
    }
  }

  glossEls.forEach(el => {
    el.addEventListener('mouseenter', () => {
      hidePopup();
      const term = el.dataset.term;
      const def = ESD_GLOSSARY[term];
      if (!def) return;

      const popup = document.createElement('div');
      popup.className = 'esd-gloss-popup';
      popup.innerHTML = `<strong>${term}</strong> — ${def}`;

      document.body.appendChild(popup);
      activePopup = popup;

      const rect = el.getBoundingClientRect();
      const pw = popup.offsetWidth;
      let left = rect.left + rect.width / 2 - pw / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      popup.style.left = `${left}px`;
      popup.style.top = `${rect.top - popup.offsetHeight - 8 + window.scrollY}px`;

      requestAnimationFrame(() => popup.classList.add('show'));
    });

    el.addEventListener('mouseleave', () => {
      setTimeout(hidePopup, 200);
    });
  });

  document.addEventListener('scroll', hidePopup, { passive: true });
}

// ---------- ECG Waveform Generator ----------
function ecgRibbonPath(W, H, beats, seed) {
  beats = beats || 12;
  seed = seed || 5;
  const pts = [];
  const beatW = W / beats;
  const mid = H / 2;
  for (let x = 0; x <= W; x += 1) {
    const phase = (x % beatW) / beatW;
    let y = mid + Math.sin(x * 0.02 + seed) * 1.2;
    if (phase > 0.42 && phase < 0.5)       y -= ((phase - 0.42) / 0.08) * 4;
    else if (phase >= 0.5 && phase < 0.55) y -= ((phase - 0.5) / 0.05) * (H * 0.35) - 4;
    else if (phase >= 0.55 && phase < 0.62) y -= ((0.62 - phase) / 0.07) * (H * 0.35);
    else if (phase >= 0.7 && phase < 0.82) y += Math.sin((phase - 0.7) / 0.12 * Math.PI) * 4;
    pts.push([x, Math.max(4, Math.min(H - 4, y))]);
  }
  return pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1].toFixed(2)).join(' ');
}

// ---------- Scroll Progress Bar ----------
function initScrollProgress() {
  const bar = document.getElementById('esd-scroll-progress');
  if (!bar) return;
  function update() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = Math.max(0, Math.min(1, window.scrollY / max));
    bar.style.transform = `scaleX(${p})`;
  }
  window.addEventListener('scroll', update, { passive: true });
  update();
}

// ---------- Floating Dock Clock ----------
function initDockClock() {
  const clockEl = document.getElementById('esd-dock-clock');
  if (!clockEl) return;
  function update() {
    clockEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  update();
  setInterval(update, 1000);
}

// ---------- Gauge — semicircular AUROC-style dial ----------
function createGaugeSVG(value, label) {
  const W = 240, H = 140;
  const cx = W / 2, cy = 124, r = 96;
  const v = Math.max(0, Math.min(1, value));
  const band = v < 0.33 ? 'low' : v < 0.66 ? 'mid' : 'high';
  const bandLabel = v < 0.33 ? 'lower risk' : v < 0.66 ? 'monitor' : 'elevated risk';
  const bandColor = v < 0.33 ? '#55A868' : v < 0.66 ? '#d18a3a' : '#C44E52';

  function arcD(start, end) {
    const sx = cx + r * Math.cos(Math.PI - (Math.PI * start));
    const sy = cy - r * Math.sin(Math.PI - (Math.PI * start));
    const ex = cx + r * Math.cos(Math.PI - (Math.PI * end));
    const ey = cy - r * Math.sin(Math.PI - (Math.PI * end));
    const largeArc = end - start > 0.5 ? 1 : 0;
    return `M ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`;
  }

  const tx = cx + r * Math.cos(Math.PI - (Math.PI * v));
  const ty = cy - r * Math.sin(Math.PI - (Math.PI * v));

  return `<div class="esd-gauge-wrap">
    <svg class="esd-gauge-svg" viewBox="0 0 ${W} ${H}">
      <defs>
        <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#55A868"/>
          <stop offset="50%" stop-color="#d18a3a"/>
          <stop offset="100%" stop-color="#C44E52"/>
        </linearGradient>
      </defs>
      <path d="${arcD(0, 1)}" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="18" stroke-linecap="round"/>
      <path d="${arcD(0, v)}" fill="none" stroke="url(#gauge-grad)" stroke-width="18" stroke-linecap="round"/>
      <circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="10" fill="#fff" stroke="${bandColor}" stroke-width="3"/>
      <text x="${cx - r}" y="${cy + 24}" text-anchor="middle" style="font-family:JetBrains Mono,monospace;font-size:9px;fill:var(--warm-500,#807969)">0.0</text>
      <text x="${cx + r}" y="${cy + 24}" text-anchor="middle" style="font-family:JetBrains Mono,monospace;font-size:9px;fill:var(--warm-500,#807969)">1.0</text>
    </svg>
    <div class="esd-gauge-value">${(v * 100).toFixed(1)}<span style="font-size:0.4em;color:var(--warm-500,#807969)">%</span></div>
    <div class="esd-gauge-label">${label || ''}</div>
    <div class="esd-gauge-band esd-gauge-${band}">${bandLabel}</div>
  </div>`;
}
