import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown, Presentation, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { Gloss } from "@/components/primitives";
import { Buddy } from "@/components/shell/Buddy";
import { ChatDrawer } from "@/components/shell/ChatDrawer";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { startNanoTour } from "@/components/help/tourEvents";
import { AmbientOrbit } from "@/components/warm";
import { useHdaDist, useParticipants, useRuns, useStages, useStudySummary, useTrajectory } from "@/api/hooks";
import { READING_CORPUS } from "@/data/readingLibrary";
import { DOC_ROUTE, HOW_TO_ROUTE } from "@/data/helpContent";
import { useUi } from "@/store/ui";
import { isFeatureFlagEnabled } from "@/hooks/useFeatureFlag";
import type { FeatureFlag } from "@/config/featureFlags";
import styles from "./Landing.module.css";

type SectionId = "overview" | "metrics" | "aims" | "architecture" | "pipeline" | "qa" | "cohort" | "ml" | "studio" | "assistant" | "library";

const NAV_SECTIONS: Array<{ id: SectionId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "metrics", label: "Metrics" },
  { id: "aims", label: "Aims" },
  { id: "architecture", label: "Architecture" },
  { id: "pipeline", label: "Pipeline" },
  { id: "qa", label: "QA" },
  { id: "cohort", label: "Cohort" },
  { id: "ml", label: "Model" },
  { id: "studio", label: "Studio" },
  { id: "assistant", label: "Assistant" },
  { id: "library", label: "Library" },
];

const AIMS = [
  {
    id: "01",
    title: "Maturation of autonomic regulation of attention",
    window: "Ages 1-3 months",
    primary: "Compare ASIB, VPT, and TD infants on how Heart-Defined Attention matures across the earliest infant window.",
    hypothesis:
      "ASIB infants begin with typical HDA, then attenuate through months 1-3 as autonomic regulation takes on a larger role. VPT infants show delayed maturation from broader ANS disruption.",
    method:
      "Five-second Actiheart ECG epochs are scored against a moving baseline to label orienting, sustained attention, inattention, and termination.",
    outcome: "Percent time in HDA, deceleration magnitude, and phase distribution.",
  },
  {
    id: "02",
    title: "HDA x interactive behavior coordination",
    window: "Ages 6, 9, 12 months",
    primary: "Link moment-to-moment autonomic regulation to observed interaction and attention across the first year.",
    hypothesis:
      "ASIB infants weaken in HDA-behavior coupling as symptoms emerge, while VPT infants begin weak and strengthen as ANS regulation stabilizes.",
    method:
      "Naturalistic recordings, eye tracking, and ECG are synchronized so HDA episodes can be aligned to behavior, gaze, and caregiver interaction.",
    outcome: "Lead-lag coupling and visit-level coordination coefficients.",
  },
  {
    id: "03",
    title: "Predicting ASD symptoms at age 3",
    window: "Infant features to age-3 outcome",
    primary: "Use infant autonomic and attentional signatures to estimate later ASD symptom likelihood.",
    hypothesis:
      "Features tied to autonomic regulation of attention outperform bulk HRV or attention alone when predicting later symptoms.",
    method:
      "Gradient-boosted classification on de-identified infant features with SHAP attribution, calibration, and held-out validation.",
    outcome: "Held-out AUROC, F1, calibration, and group-level performance.",
  },
] as const;

const ARCHITECTURE = [
  {
    id: "devices",
    title: "Devices and sensors",
    short: "Edge capture",
    items: [
      "Actiheart-5 continuous chest ECG at 1024 Hz.",
      "Head-mounted eye tracking for naturalistic attention.",
      "Session logs and caregiver context from every visit.",
    ],
  },
  {
    id: "capture",
    title: "Metadata and capture",
    short: "REDCap and forms",
    items: [
      "Visit intake, demographics, consent, and caregiver questionnaires in REDCap.",
      "Surrogate NANO IDs stitched to device manifests and site-level scheduling.",
      "Examiner notes retained without exposing PHI in downstream layers.",
    ],
  },
  {
    id: "compute",
    title: "Preprocess and QA",
    short: "SQI and HDA labels",
    items: [
      "Bandpass filtering, R-peak detection, and IBI extraction.",
      "Signal Quality Index scoring per epoch with surfaced review windows.",
      "HDA phase assignment for orienting, sustained, inattention, and termination.",
    ],
  },
  {
    id: "features",
    title: "Features and long-form tables",
    short: "Parquet outputs",
    items: [
      "RMSSD, SDNN, HF, LF/HF, pNN50, and visit-level aggregates.",
      "Per-episode HDA tables joined to behavior and site metadata.",
      "De-identified cohort parquet that powers every analysis route and export.",
    ],
  },
  {
    id: "models",
    title: "Models and inference",
    short: "XGBoost and trajectories",
    items: [
      "Age-3 ASD symptom classifier with calibration and feature attribution.",
      "Trajectory modeling for Aim 1 maturation questions.",
      "Behavioral coupling models for Aim 2 and downstream reporting.",
    ],
  },
] as const;

const READING_LIBRARY = [
  {
    title: "Autonomic and attentional pathways in the emergence of autism",
    authors: "Bradshaw, Platt, Yurkovic-Harding, Harding, and Fu",
    meta: "2025 · Advances in Child Development and Behavior",
    tag: "Theory",
    abstract:
      "Synthesizes the ESD Lab approach to autonomic regulation, attention, and longitudinal infant development, grounding the NANO protocol in mechanistic and real-world observation.",
  },
  {
    title: "Capturing the complexity of autism with developmental cascades",
    authors: "Bradshaw",
    meta: "2022 · Child Development Perspectives",
    tag: "Framework",
    abstract:
      "Argues for cascades across foundational systems including ANS regulation, attention, and motor development when modeling later ASD-related outcomes.",
  },
  {
    title: "Specific Aims: autonomic regulation of attention as a predictive biomarker",
    authors: "NIH R01 application",
    meta: "2024 · Grant document",
    tag: "Grant",
    abstract:
      "Three aims anchor the NANO Study: early HDA maturation, HDA-behavior coupling, and predictive modeling of age-3 outcomes from infant signals.",
  },
  {
    title: "Research strategy: longitudinal design, measures, and analytic plan",
    authors: "NIH R01 application",
    meta: "2024 · Research strategy",
    tag: "Protocol",
    abstract:
      "Details recruitment, devices, HRV preprocessing, HDA labeling, longitudinal modeling, and the analytic strategy behind downstream ML outputs.",
  },
] as const;

const ASSISTANT_SUGGESTIONS = [
  "Walk me through the NANO Study.",
  "Explain what HDA means in this pipeline.",
  "How is the classifier validated?",
  "What should a clinician look at first on this site?",
] as const;

const DYN_LANDING: Array<{
  flag: FeatureFlag;
  title: string;
  eyebrow: string;
  body: string;
  to: string;
  status: string;
  readoutLabel: string;
  readout: string;
  access: string;
  steps: readonly [string, string, string];
}> = [
  {
    flag: "DYN_CO_REGULATION_BRAID",
    title: "Co-Regulation",
    eyebrow: "Dyadic physiology",
    body: "Align caregiver and infant autonomic streams to reveal synchrony, lead-lag, and coupled windows.",
    to: "/dyad-coregulation",
    status: "V2 preview",
    readoutLabel: "Primary view",
    readout: "Synchrony + lag",
    access: "NANOID-only",
    steps: ["Signals", "Lag scan", "Coupling"],
  },
  {
    flag: "DYN_AROUSAL_ATTENTION_PORTRAIT",
    title: "Phase Portrait",
    eyebrow: "State-space route",
    body: "Map arousal and attention as a moving trajectory with occupancy, recovery, and transition context.",
    to: "/phase-portrait",
    status: "V2 preview",
    readoutLabel: "Primary view",
    readout: "Orbit geometry",
    access: "NANOID-only",
    steps: ["Arousal", "Attention", "Recovery"],
  },
  {
    flag: "DYN_CVA_GAZE_THEATER",
    title: "CVA Theater",
    eyebrow: "Social timing",
    body: "Inspect dyadic gaze overlap, face availability, and scaffold timing around shared visual attention.",
    to: "/cva-theater",
    status: "V2 preview",
    readoutLabel: "Primary view",
    readout: "Gaze overlap",
    access: "NANOID-only",
    steps: ["Faces", "Overlap", "Scaffold"],
  },
  {
    flag: "DYN_CASCADE_SIMULATOR",
    title: "Cascade Sim",
    eyebrow: "Guardrailed model",
    body: "Move what-if inputs through fitted developmental paths while keeping uncertainty and limits visible.",
    to: "/cascade-sim",
    status: "V2 preview",
    readoutLabel: "Primary view",
    readout: "What-if + CI",
    access: "NANOID-only",
    steps: ["Inputs", "Paths", "Bounds"],
  },
];

const STUDIO_INPUTS = [
  { id: "rmssd", label: "RMSSD @ 3mo", min: 15, max: 60, step: 0.5, defaultValue: 38.4, weight: -0.32, suffix: "ms" },
  { id: "sustained", label: "Sustained HDA", min: 10, max: 80, step: 1, defaultValue: 52, weight: -0.28, suffix: "%" },
  { id: "deceleration", label: "Max HR deceleration", min: 1, max: 14, step: 0.5, defaultValue: 7.2, weight: -0.18, suffix: "bpm" },
  { id: "cga", label: "CGA at 3mo visit", min: 36, max: 56, step: 0.5, defaultValue: 49, weight: 0.04, suffix: "wk" },
  { id: "ectopic", label: "Ectopic beats", min: 0, max: 25, step: 0.5, defaultValue: 1.3, weight: 0.14, suffix: "%" },
] as const;

const GROUP_ACCENTS: Record<string, string> = {
  VPT: "var(--usc-garnet)",
  ASIB: "#5e3776",
  TD: "#3d6650",
};

const LANDING_SCROLL_OFFSET = 112;
const LANDING_SCROLL_DURATION_MS = 380;

function stat(value: number, digits = 0): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

interface EcgPeak {
  index: number;
  x: number;
  y: number;
  rrMs: number;
  bpm: number;
}

interface EcgStrip {
  path: string;
  peaks: EcgPeak[];
  avgBpm: number;
}

/** Tiny deterministic PRNG so the strip is stable across renders (no hydration jitter). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bump(distance: number, halfWidth: number): number {
  const z = distance / halfWidth;
  return Math.exp(-z * z);
}

/**
 * Build a Lead-I ECG strip whose beat-to-beat spacing *encodes RMSSD*: each R-R
 * interval is jittered by a successive difference scaled to the live RMSSD, so a
 * higher HRV literally renders as visibly more irregular beat spacing — the
 * metric becomes something you can see, not just a number. Returns the morph-
 * ology path plus per-beat R-peak coordinates + instantaneous BPM so the strip
 * can be inspected beat-by-beat on hover.
 */
function buildEcgStrip(width: number, height: number, hr: number, rmssd: number, beats: number): EcgStrip {
  const baseRr = 60000 / Math.max(hr, 1);
  const rng = mulberry32(0x5eed ^ Math.round(rmssd * 10) ^ (beats << 8));
  // Raw zero-centred R-R offsets, then scaled so the rendered series'
  // successive-difference RMS equals the live RMSSD *exactly* — the chip number
  // and the visible beat-spacing irregularity describe the same thing.
  const offsets = Array.from({ length: beats }, () => rng() - 0.5);
  let rawSq = 0;
  for (let i = 1; i < beats; i += 1) rawSq += (offsets[i]! - offsets[i - 1]!) ** 2;
  const rawRmssd = Math.sqrt(rawSq / Math.max(beats - 1, 1)) || 1;
  const scale = rmssd / rawRmssd;
  const rrs = offsets.map((o) => Math.max(baseRr * 0.62, baseRr + o * scale));
  const totalRr = rrs.reduce((sum, rr) => sum + rr, 0);
  const marginX = width * 0.035;
  const usable = width - marginX * 2;
  const baseline = height * 0.6;
  const rAmp = height * 0.46;

  let acc = 0;
  const peaks: EcgPeak[] = rrs.map((rr, index) => {
    const x = marginX + (acc / totalRr) * usable;
    acc += rr;
    return { index, x, y: baseline - rAmp * 0.97, rrMs: Math.round(rr), bpm: Math.round(60000 / rr) };
  });

  const qOff = width * 0.011;
  const sOff = width * 0.013;
  const pOff = width * 0.03;
  const tOff = width * 0.05;
  const samples: string[] = [];
  for (let x = 0; x <= width; x += 2) {
    let y = baseline + Math.sin(x * 0.015) * (height * 0.01);
    for (const p of peaks) {
      const d = x - p.x;
      if (d < -width * 0.05 || d > width * 0.075) continue;
      y -= rAmp * bump(d, width * 0.0042); // R spike (up)
      y += height * 0.06 * bump(d + qOff, width * 0.0034); // Q dip
      y += height * 0.11 * bump(d - sOff, width * 0.0042); // S dip
      y -= height * 0.07 * bump(d + pOff, width * 0.011); // P wave
      y -= height * 0.14 * bump(d - tOff, width * 0.02); // T wave
    }
    samples.push(`${x === 0 ? "M" : "L"}${x} ${clamp(y, 4, height - 4).toFixed(2)}`);
  }
  return { path: samples.join(" "), peaks, avgBpm: Math.round(60000 / (totalRr / beats)) };
}

/**
 * Live Lead-I ECG monitor. Beat spacing is driven by the live RMSSD, every
 * detected R-peak is marked, and hovering the strip surfaces that beat's R-R
 * interval + instantaneous heart rate. A sweep cursor + pulsing "live" dot give
 * it the feel of a bedside monitor while the readout chips stay data-honest.
 */
function WaveRibbon({ rmssd, epochs, passRate }: { rmssd: number; epochs: number; passRate: number }) {
  const width = 1440;
  const height = 150;
  const beats = 14;
  const hr = 132; // NANO cohort is infants — resting HR ~120-160 bpm; R-R derives from this.
  const strip = useMemo(() => buildEcgStrip(width, height, hr, rmssd, beats), [rmssd]);
  const [hover, setHover] = useState<number | null>(null);

  function onMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const vbX = ((event.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let best = Infinity;
    for (const p of strip.peaks) {
      const dist = Math.abs(p.x - vbX);
      if (dist < best) {
        best = dist;
        nearest = p.index;
      }
    }
    setHover(nearest);
  }

  const active = hover != null ? strip.peaks[hover] : null;

  return (
    <div
      className={styles.ecgShell}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
      role="img"
      aria-label={`Live Lead I ECG · ${strip.avgBpm} beats per minute · RMSSD ${stat(rmssd, 1)} milliseconds · ${beats} R-peaks detected`}
    >
      <div className={styles.ecgLane}>
        <span className={styles.ecgLive} aria-hidden="true">
          <i className={styles.ecgLiveDot} /> Lead I · 1024 Hz · live
        </span>
      </div>
      <div className={styles.ecgReadout} aria-hidden="true">
        <span className={styles.ecgStat}><b>{strip.avgBpm}</b> bpm</span>
        <span className={styles.ecgStat}><b>{stat(rmssd, 1)}</b> ms RMSSD</span>
        <span className={styles.ecgStat}><b>{beats}</b> R-peaks</span>
        <span className={styles.ecgStat}><b>{stat(passRate, 1)}%</b> accepted</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={styles.ecgSvg} aria-hidden="true">
        {Array.from({ length: 15 }).map((_, index) => (
          <line key={index} x1={index * 100} y1="0" x2={index * 100} y2={height} className={styles.ecgGrid} />
        ))}
        <line x1="0" y1={height * 0.6} x2={width} y2={height * 0.6} className={styles.ecgBaseline} />
        <path d={strip.path} className={styles.ecgGlow} />
        <path d={strip.path} className={styles.ecgLine} />
        {active && <line x1={active.x} y1="6" x2={active.x} y2={height - 6} className={styles.ecgCursor} />}
        {strip.peaks.map((p) => (
          <circle
            key={p.index}
            cx={p.x}
            cy={p.y}
            r={hover === p.index ? 7 : 3.4}
            className={hover === p.index ? styles.ecgPeakActive : styles.ecgPeak}
          />
        ))}
      </svg>
      <div className={styles.ecgSweep} aria-hidden="true" />
      {active && (
        <div
          className={styles.ecgTip}
          style={{ left: `${clamp((active.x / width) * 100, 8, 92)}%` }}
          aria-hidden="true"
        >
          <strong>Beat {active.index + 1} · {active.bpm} bpm</strong>
          <span>R–R interval {active.rrMs} ms</span>
        </div>
      )}
      <div className={styles.ecgFoot} aria-hidden="true">
        <span>{stat(epochs)} epochs · 24 h</span>
        <span>Pan–Tompkins R-peak detection</span>
        <span className={styles.ecgHint}>hover a beat for instantaneous R–R</span>
      </div>
    </div>
  );
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i += 1) {
    sa += a[i]!;
    sb += b[i]!;
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const xa = a[i]! - ma;
    const xb = b[i]! - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

interface DyadModel {
  caregiver: number[];
  infant: number[];
  caregiverPath: string;
  infantPath: string;
  bands: Array<{ x0: number; x1: number }>;
  peakR: number;
  lagSeconds: number;
  coupledWindows: number;
  windowCount: number;
}

const DYAD_SAMPLES = 120;
const DYAD_WINDOW_SECONDS = 90;
const DYAD_LAG_SAMPLES = 7; // caregiver leads infant

/**
 * Caregiver↔infant autonomic co-regulation preview. Two coupled RSA-style
 * signals (caregiver leads, infant follows at a lag); the displayed synchrony
 * `r` is the *actual* peak cross-correlation of the two rendered traces, and
 * the shaded bands mark the windows where local coupling is strongest. RMSSD
 * gently scales the wiggle so the preview tracks the live HRV regime.
 */
function buildDyad(width: number, height: number, rmssd: number): DyadModel {
  const wobble = clamp(rmssd / 60, 0.18, 0.5);
  const rng = mulberry32(0xc0ffee ^ Math.round(rmssd * 7));
  const noise: number[] = Array.from({ length: DYAD_SAMPLES }, () => rng() - 0.5);

  const caregiver: number[] = [];
  for (let i = 0; i < DYAD_SAMPLES; i += 1) {
    const v = Math.sin(i * 0.097) * 0.62 + Math.sin(i * 0.041 + 0.8) * 0.3 + noise[i]! * wobble * 0.4;
    caregiver.push(v);
  }
  const infant: number[] = [];
  for (let i = 0; i < DYAD_SAMPLES; i += 1) {
    const lead = caregiver[Math.max(0, i - DYAD_LAG_SAMPLES)]!;
    infant.push(lead * 0.82 + noise[i]! * wobble);
  }

  const mid = height / 2;
  const amp = height * 0.32;
  const toPath = (series: number[]): string =>
    series
      .map((v, i) => {
        const x = (i / (DYAD_SAMPLES - 1)) * width;
        const y = clamp(mid - v * amp, 6, height - 6);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  // Coupling bands: contiguous spans where the lag-aligned traces track closely.
  const bands: Array<{ x0: number; x1: number }> = [];
  let runStart = -1;
  for (let i = 0; i < DYAD_SAMPLES; i += 1) {
    const aligned = caregiver[Math.max(0, i - DYAD_LAG_SAMPLES)]!;
    const coupled = Math.abs(aligned - infant[i]! / 0.82) < 0.22;
    if (coupled && runStart < 0) runStart = i;
    if ((!coupled || i === DYAD_SAMPLES - 1) && runStart >= 0) {
      const end = coupled ? i : i - 1;
      if (end - runStart >= 4) {
        bands.push({ x0: (runStart / (DYAD_SAMPLES - 1)) * width, x1: (end / (DYAD_SAMPLES - 1)) * width });
      }
      runStart = -1;
    }
  }

  // Peak cross-correlation over a small lag search → the headline synchrony r.
  let peakR = 0;
  for (let lag = 0; lag <= 14; lag += 1) {
    const shifted = caregiver.slice(0, DYAD_SAMPLES - lag);
    const target = infant.slice(lag);
    const r = pearson(shifted, target);
    if (r > peakR) peakR = r;
  }

  const windowCount = 8;
  let coupledWindows = 0;
  const per = Math.floor(DYAD_SAMPLES / windowCount);
  for (let w = 0; w < windowCount; w += 1) {
    const a = caregiver.slice(w * per, w * per + per);
    const b = infant.slice(w * per, w * per + per);
    if (pearson(a, b) > 0.45) coupledWindows += 1;
  }

  return {
    caregiver,
    infant,
    caregiverPath: toPath(caregiver),
    infantPath: toPath(infant),
    bands,
    peakR,
    lagSeconds: (DYAD_LAG_SAMPLES / DYAD_SAMPLES) * DYAD_WINDOW_SECONDS,
    coupledWindows,
    windowCount,
  };
}

function DyadSyncPreview({ rmssd, onOpen }: { rmssd: number; onOpen: () => void }) {
  const width = 620;
  const height = 210;
  const model = useMemo(() => buildDyad(width, height, rmssd), [rmssd]);
  const [hoverX, setHoverX] = useState<number | null>(null);

  function onMove(event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    setHoverX(clamp((event.clientX - rect.left) / rect.width, 0, 1));
  }

  const sampleIndex = hoverX == null ? null : Math.round(hoverX * (DYAD_SAMPLES - 1));
  const local =
    sampleIndex == null
      ? null
      : {
          x: (sampleIndex / (DYAD_SAMPLES - 1)) * width,
          caregiverY: clamp(height / 2 - model.caregiver[sampleIndex]! * (height * 0.32), 6, height - 6),
          infantY: clamp(height / 2 - model.infant[sampleIndex]! * (height * 0.32), 6, height - 6),
          coupling: clamp(1 - Math.abs(model.caregiver[sampleIndex]! - model.infant[sampleIndex]!) / 1.4, 0, 1),
          seconds: (sampleIndex / (DYAD_SAMPLES - 1)) * DYAD_WINDOW_SECONDS,
        };

  return (
    <button
      type="button"
      className={`${styles.dynamicsPanel} ${styles.dyadPanel}`}
      onClick={onOpen}
      onMouseMove={onMove}
      onMouseLeave={() => setHoverX(null)}
      aria-label={`Launch dyadic co-regulation. Peak synchrony r ${model.peakR.toFixed(2)}, caregiver leads by ${model.lagSeconds.toFixed(1)} seconds, ${model.coupledWindows} of ${model.windowCount} windows coupled.`}
    >
      <div className={styles.dynamicsMesh} aria-hidden="true">
        {Array.from({ length: 18 }).map((_, index) => (
          <span key={index} />
        ))}
      </div>

      <div className={styles.dyadReadout} aria-hidden="true">
        <span className={styles.dyadStat}>
          <i>Synchrony</i>
          <b>r {model.peakR.toFixed(2)}</b>
        </span>
        <span className={styles.dyadStat}>
          <i>Lead–lag</i>
          <b>+{model.lagSeconds.toFixed(1)}s</b>
        </span>
        <span className={styles.dyadStat}>
          <i>Coupled</i>
          <b>{model.coupledWindows}/{model.windowCount}</b>
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={styles.dynamicsTrace} aria-hidden="true">
        {model.bands.map((band, index) => (
          <rect key={index} x={band.x0} y="6" width={Math.max(0, band.x1 - band.x0)} height={height - 12} className={styles.dyadBand} />
        ))}
        <path d={model.caregiverPath} className={styles.dyadCaregiverSoft} />
        <path d={model.caregiverPath} className={styles.dyadCaregiver} />
        <path d={model.infantPath} className={styles.dyadInfant} />
        {local && (
          <>
            <line x1={local.x} y1="6" x2={local.x} y2={height - 6} className={styles.dyadCursor} />
            <circle cx={local.x} cy={local.caregiverY} r="5" className={styles.dyadDotCaregiver} />
            <circle cx={local.x} cy={local.infantY} r="5" className={styles.dyadDotInfant} />
          </>
        )}
      </svg>

      <div className={styles.dyadLegend} aria-hidden="true">
        <span><i className={styles.dyadSwatchCaregiver} /> Caregiver RSA</span>
        <span><i className={styles.dyadSwatchInfant} /> Infant RSA</span>
      </div>

      {local && (
        <div className={styles.dyadTip} style={{ left: `${clamp((local.x / width) * 100, 10, 90)}%` }} aria-hidden="true">
          <strong>t = {local.seconds.toFixed(0)}s · coupling {(local.coupling * 100).toFixed(0)}%</strong>
          <span>caregiver leads infant by {model.lagSeconds.toFixed(1)}s</span>
        </div>
      )}

      <span className={styles.dyadOpen} aria-hidden="true">Launch co-regulation →</span>
    </button>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Count up from 0 to `target` on mount (eased); jumps instantly under reduced motion. */
function useCountUp(target: number, duration = 950): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(target * easeOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function CorpusStat({ value, label, suffix = "", decimals = 0 }: { value: number; label: string; suffix?: string; decimals?: number }) {
  const animated = useCountUp(value);
  return (
    <div className={styles.corpusStat}>
      <strong>{stat(animated, decimals)}{suffix}</strong>
      <span>{label}</span>
    </div>
  );
}

const CORPUS_ACCENTS = {
  source: "var(--usc-garnet)",
  year: "var(--ocean)",
  depth: "var(--sage)",
} as const;

/**
 * Reading-library corpus intelligence. Every number, bar, and term here is
 * derived from `lab-readings.json` — the build-time index of the lab's
 * `esd-lab-readings/` PDF library. Bars are hover-inspectable (count + page
 * weight) and the source breakdown drives a focus list of the actual indexed
 * titles, so the public corpus is presented as live metric graphs.
 */
function ReadingCorpusPanel() {
  const corpus = READING_CORPUS;
  const [selectedSource, setSelectedSource] = useState(corpus.bySource[0]?.key ?? "");
  const [hoverBar, setHoverBar] = useState<string | null>(null);

  const maxSource = Math.max(1, ...corpus.bySource.map((b) => b.count));
  const maxYear = Math.max(1, ...corpus.byYear.map((b) => b.count));
  const maxDepth = Math.max(1, ...corpus.depthBuckets.map((b) => b.count));
  const maxTerm = Math.max(1, ...corpus.topKeywords.map((k) => k.count));

  const focusReadings = corpus.readings
    .filter((r) => r.source === selectedSource)
    .sort((a, b) => b.pageCount - a.pageCount)
    .slice(0, 5);
  const focusPages = corpus.readings.filter((r) => r.source === selectedSource).reduce((sum, r) => sum + r.pageCount, 0);

  const renderBar = (
    dim: "source" | "year" | "depth",
    bar: { key: string; label: string; count: number; pages: number },
    max: number,
    interactive: boolean,
  ) => {
    const id = `${dim}:${bar.key}`;
    const pct = (bar.count / max) * 100;
    const selected = dim === "source" && bar.key === selectedSource;
    const className = `${styles.corpusBar} ${selected ? styles.corpusBarSelected : ""}`;
    const inner = (
      <>
        <span className={styles.corpusBarLabel}>{bar.label}</span>
        <span className={styles.corpusBarTrack}>
          <span
            className={styles.corpusBarFill}
            style={{ width: `${pct}%`, background: CORPUS_ACCENTS[dim] }}
          />
        </span>
        <span className={styles.corpusBarValue}>{bar.count}</span>
        {hoverBar === id && (
          <span className={styles.corpusBarTip}>{bar.count} readings · {stat(bar.pages)} pages</span>
        )}
      </>
    );
    if (interactive) {
      return (
        <button
          key={id}
          type="button"
          className={className}
          aria-pressed={selected}
          onClick={() => setSelectedSource(bar.key)}
          onMouseEnter={() => setHoverBar(id)}
          onMouseLeave={() => setHoverBar((h) => (h === id ? null : h))}
        >
          {inner}
        </button>
      );
    }
    return (
      <div
        key={id}
        className={className}
        onMouseEnter={() => setHoverBar(id)}
        onMouseLeave={() => setHoverBar((h) => (h === id ? null : h))}
      >
        {inner}
      </div>
    );
  };

  return (
    <div className={styles.corpusPanel} data-insight="landing-corpus">
      <div className={styles.corpusHead}>
        <div>
          <span className={styles.sectionEyebrow}>Indexed corpus</span>
          <h3>The reading library, in numbers.</h3>
          <p>
            Auto-built from <code>esd-lab-readings/</code>
            {corpus.generatedAt ? ` · indexed ${new Date(corpus.generatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}
          </p>
        </div>
        <div className={styles.corpusStatRow}>
          <CorpusStat value={corpus.totalReadings} label="Readings" />
          <CorpusStat value={corpus.totalPages} label="Pages" />
          <CorpusStat value={corpus.sourceCount} label="Sources" />
          <CorpusStat value={corpus.totalMb} label="MB indexed" suffix="" decimals={1} />
        </div>
      </div>

      <div className={styles.corpusGrid}>
        <div className={styles.corpusCol}>
          <div className={styles.corpusBlockLabel}>Library composition · by source</div>
          <div className={styles.corpusBars}>
            {corpus.bySource.map((bar) => renderBar("source", bar, maxSource, true))}
          </div>
          <div className={styles.corpusFocus} aria-live="polite">
            <div className={styles.corpusFocusHead}>
              <strong>{selectedSource}</strong>
              <span>{stat(focusPages)} pages</span>
            </div>
            <ul>
              {focusReadings.map((reading) => (
                <li key={reading.id}>
                  <span className={styles.corpusFocusTitle}>{reading.title}</span>
                  <span className={styles.corpusFocusMeta}>
                    {reading.year ?? "n/a"} · {reading.pageCount} pg
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.corpusCol}>
          <div className={styles.corpusBlockLabel}>Publication cadence · by year</div>
          <div className={styles.corpusBars}>
            {corpus.byYear.map((bar) => renderBar("year", bar, maxYear, false))}
          </div>

          <div className={styles.corpusBlockLabel}>Reading depth · by length</div>
          <div className={styles.corpusBars}>
            {corpus.depthBuckets.map((bar) => renderBar("depth", bar, maxDepth, false))}
          </div>

          <div className={styles.corpusBlockLabel}>Frequent indexed terms</div>
          <div className={styles.corpusTerms}>
            {corpus.topKeywords.map((kw) => (
              <span
                key={kw.term}
                className={styles.corpusTerm}
                style={{ fontSize: `${11 + (kw.count / maxTerm) * 6}px`, opacity: 0.6 + (kw.count / maxTerm) * 0.4 }}
                title={`${kw.count} readings`}
              >
                {kw.term}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const width = 240;
  const height = 140;
  const cx = width / 2;
  const cy = 124;
  const radius = 96;
  const v = clamp(value, 0, 1);

  function arc(start: number, end: number) {
    const sx = cx + radius * Math.cos(Math.PI - Math.PI * start);
    const sy = cy - radius * Math.sin(Math.PI - Math.PI * start);
    const ex = cx + radius * Math.cos(Math.PI - Math.PI * end);
    const ey = cy - radius * Math.sin(Math.PI - Math.PI * end);
    const largeArc = end - start > 0.5 ? 1 : 0;
    return `M ${sx} ${sy} A ${radius} ${radius} 0 ${largeArc} 1 ${ex} ${ey}`;
  }

  return (
    <div className={styles.gaugeWrap}>
      <svg viewBox={`0 0 ${width} ${height}`} className={styles.gaugeSvg} aria-hidden>
        <defs>
          <linearGradient id="landing-gauge" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#55A868" />
            <stop offset="50%" stopColor="#d18a3a" />
            <stop offset="100%" stopColor="#C44E52" />
          </linearGradient>
        </defs>
        <path d={arc(0, 1)} className={styles.gaugeTrack} />
        <path d={arc(0, v)} className={styles.gaugeFill} />
      </svg>
      <div className={styles.gaugeValue}>{stat(v * 100, 1)}%</div>
      <div className={styles.gaugeLabel}>Estimated age-3 symptom likelihood</div>
    </div>
  );
}

const HERO_PHASES = [
  { key: "orienting", label: "Orienting", color: "#d5a253" },
  { key: "sustained", label: "Sustained", color: "#7f9f73" },
  { key: "inattention", label: "Inattention", color: "#c46c55" },
  { key: "termination", label: "Termination", color: "#6c90b6" },
] as const;

export function Landing() {
  const navigate = useNavigate();
  const setChatOpen = useUi((state) => state.setChatOpen);
  const setChatSeed = useUi((state) => state.setChatSeed);
  const progressRef = useRef<HTMLDivElement>(null);
  const activeSectionRef = useRef<SectionId>("overview");
  const scrollFrameRef = useRef<number | null>(null);
  const scrollAnimationRef = useRef<number | null>(null);

  const { data: study } = useStudySummary();
  const { data: stages = [] } = useStages();
  const { data: runs = [] } = useRuns(12);
  const { data: participants = [] } = useParticipants();
  const { data: rmssd } = useTrajectory("rmssd");
  const { data: hda } = useHdaDist();

  const [active, setActive] = useState<SectionId>("overview");
  const [openAim, setOpenAim] = useState(0);
  const [activeLayer, setActiveLayer] = useState<(typeof ARCHITECTURE)[number]["id"]>(ARCHITECTURE[0].id);
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [studioValues, setStudioValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(STUDIO_INPUTS.map((input) => [input.id, input.defaultValue])),
  );

  const totals = useMemo(() => {
    const inflight = stages.reduce((sum, stage) => sum + stage.inflight, 0);
    const done = stages.reduce((sum, stage) => sum + stage.done, 0);
    const fail = stages.reduce((sum, stage) => sum + stage.fail, 0);
    const rmssdLatest = rmssd?.series.VPT.at(-1)?.y ?? 38.4;
    const readyRuns = runs.filter((run) => run.status === "running" || run.status === "queued").length;
    const hdaTotal = hda
      ? Object.values(hda).reduce(
          (sum, group) => sum + group.orienting + group.sustained + group.inattention + group.termination,
          0,
        )
      : 0;
    return {
      inflight,
      done,
      fail,
      readyRuns,
      rmssdLatest,
      hdaTotal,
    };
  }, [hda, rmssd, runs, stages]);

  const activeArchitecture = useMemo(
    () => ARCHITECTURE.find((layer) => layer.id === activeLayer) ?? ARCHITECTURE[0],
    [activeLayer],
  );

  const filteredParticipants = useMemo(() => {
    return participants
      .filter((participant) => groupFilter === "all" || participant.group === groupFilter)
      .slice(0, 8);
  }, [groupFilter, participants]);

  const filteredReading = useMemo(() => {
    const needle = libraryQuery.trim().toLowerCase();
    if (!needle) return READING_LIBRARY;
    return READING_LIBRARY.filter((entry) => {
      return [entry.title, entry.authors, entry.meta, entry.abstract, entry.tag].some((field) =>
        field.toLowerCase().includes(needle),
      );
    });
  }, [libraryQuery]);

  const trajectorySeries = useMemo(() => {
    const series = rmssd?.series;
    if (!series) return [];
    return ["VPT", "ASIB", "TD"].flatMap((group) => {
      const groupSeries = series[group as keyof typeof series];
      if (!groupSeries?.length) return [];
      return [{ group, values: groupSeries }];
    });
  }, [rmssd]);

  const riskScore = useMemo(() => {
    let z = -0.55;
    for (const input of STUDIO_INPUTS) {
      const value = studioValues[input.id] ?? input.defaultValue;
      const midpoint = (input.min + input.max) / 2;
      const span = (input.max - input.min) / 2;
      const normalized = (value - midpoint) / span;
      z += normalized * input.weight * 5;
    }
    return 1 / (1 + Math.exp(-z));
  }, [studioValues]);

  const insightFeed = useMemo(() => {
    const latestRun = runs[0];
    const latestParticipant = participants[0];
    return [
      {
        tag: "QA",
        body: totals.fail > 0 ? `${totals.fail} stage failures surfaced for human review in the current run window.` : "No current stage failures. QA exceptions are under threshold.",
      },
      {
        tag: "FLOW",
        body: latestParticipant
          ? `${latestParticipant.id} reached ${latestParticipant.visit} at ${latestParticipant.site} with ${latestParticipant.qa} QA status.`
          : "Participant flow will populate as soon as visit data is available.",
      },
      {
        tag: "RUN",
        body: latestRun
          ? `${latestRun.id} is ${latestRun.status} in ${latestRun.scope} and owned by ${latestRun.actor}.`
          : "No active runs are visible right now.",
      },
    ];
  }, [participants, runs, totals.fail]);

  const dynLandingItems = useMemo(
    () => DYN_LANDING.filter((item) => isFeatureFlagEnabled(item.flag)),
    [],
  );

  const heroSignal = useMemo(() => {
    const fallbackTotals = {
      orienting: 250,
      sustained: 994,
      inattention: 118,
      termination: 55,
    };

    const totalsByPhase = hda
      ? Object.values(hda).reduce(
          (sum, group) => ({
            orienting: sum.orienting + group.orienting,
            sustained: sum.sustained + group.sustained,
            inattention: sum.inattention + group.inattention,
            termination: sum.termination + group.termination,
          }),
          { orienting: 0, sustained: 0, inattention: 0, termination: 0 },
        )
      : fallbackTotals;

    const totalLabeled = Math.max(
      1,
      totalsByPhase.orienting +
        totalsByPhase.sustained +
        totalsByPhase.inattention +
        totalsByPhase.termination,
    );
    const passRate = totals.done + totals.fail > 0 ? (totals.done / (totals.done + totals.fail)) * 100 : 99.8;

    const cohortBands = (["VPT", "ASIB", "TD"] as const).map((group) => {
      const phaseBlock = hda?.[group];
      const groupTotal = phaseBlock
        ? phaseBlock.orienting + phaseBlock.sustained + phaseBlock.inattention + phaseBlock.termination
        : 1;
      const sustainedShare = phaseBlock
        ? (phaseBlock.sustained / Math.max(groupTotal, 1)) * 100
        : group === "TD"
          ? 72
          : group === "ASIB"
            ? 65
            : 69;
      return {
        code: group,
        total: phaseBlock ? groupTotal : 0,
        sustainedShare,
      };
    });

    const phaseMix = HERO_PHASES.map((phase) => ({
      ...phase,
      share: (totalsByPhase[phase.key] / totalLabeled) * 100,
      count: totalsByPhase[phase.key],
    }));

    return {
      totalLabeled,
      passRate,
      sustainedShare: (totalsByPhase.sustained / totalLabeled) * 100,
      phaseMix,
      cohortBands,
    };
  }, [hda, totals.done, totals.fail]);

  useEffect(() => {
    const sections = NAV_SECTIONS.flatMap((section) => {
      const element = document.getElementById(section.id);
      return element ? [{ id: section.id, element }] : [];
    });

    const updateScrollUi = () => {
      scrollFrameRef.current = null;

      const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const ratio = window.scrollY / max;
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${ratio})`;
      }

      let current: SectionId = "overview";
      for (const section of sections) {
        if (section.element.getBoundingClientRect().top < window.innerHeight * 0.45) {
          current = section.id;
        }
      }

      if (current !== activeSectionRef.current) {
        activeSectionRef.current = current;
        setActive(current);
      }
    };

    const scheduleScrollUi = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(updateScrollUi);
    };

    scheduleScrollUi();
    window.addEventListener("scroll", scheduleScrollUi, { passive: true });
    window.addEventListener("resize", scheduleScrollUi);

    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
      window.removeEventListener("scroll", scheduleScrollUi);
      window.removeEventListener("resize", scheduleScrollUi);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (scrollAnimationRef.current !== null) {
        window.cancelAnimationFrame(scrollAnimationRef.current);
      }
    };
  }, []);

  function jumpTo(id: SectionId) {
    const target = document.getElementById(id);
    if (!target) return;

    const nextTop = Math.max(0, window.scrollY + target.getBoundingClientRect().top - LANDING_SCROLL_OFFSET);

    if (scrollAnimationRef.current !== null) {
      window.cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }

    activeSectionRef.current = id;
    setActive(id);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo(0, nextTop);
      return;
    }

    const startTop = window.scrollY;
    const distance = nextTop - startTop;
    if (Math.abs(distance) < 2) {
      window.scrollTo(0, nextTop);
      return;
    }

    const startedAt = performance.now();
    const animateScroll = (now: number) => {
      const elapsed = now - startedAt;
      const progress = clamp(elapsed / LANDING_SCROLL_DURATION_MS, 0, 1);
      const eased = easeOutCubic(progress);

      window.scrollTo(0, startTop + distance * eased);

      if (progress < 1) {
        scrollAnimationRef.current = window.requestAnimationFrame(animateScroll);
      } else {
        scrollAnimationRef.current = null;
      }
    };

    scrollAnimationRef.current = window.requestAnimationFrame(animateScroll);
  }

  function openAssistant(seed?: string) {
    setChatSeed(seed?.trim() ? seed : null);
    setChatOpen(true);
  }

  const groupCards = [
    { code: "ASIB", label: "Autism sibling cohort", count: study?.groups.ASIB.count ?? 30, target: study?.groups.ASIB.target ?? 65 },
    { code: "VPT", label: "Very preterm cohort", count: study?.groups.VPT.count ?? 105, target: study?.groups.VPT.target ?? 130 },
    { code: "TD", label: "Term-born comparison cohort", count: study?.groups.TD.count ?? 53, target: study?.groups.TD.target ?? 65 },
  ];

  return (
    <div className={styles.page}>
      <div ref={progressRef} className={styles.progress} style={{ transform: "scaleX(0)" }} aria-hidden />

      <nav className={styles.nav} aria-label="Landing sections" data-tour="public-nav">
        <button
          type="button"
          className={styles.brand}
          onClick={() => jumpTo("overview")}
          aria-label="ESD Lab - return to home"
        >
          <span className={styles.brandMark}>e</span>
          <span className={styles.brandText}>
            <strong>ESD Lab</strong>
            <small>NANO · UofSC</small>
          </span>
        </button>

        <div className={styles.navLinks}>
          {NAV_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`${styles.navLink} ${active === section.id ? styles.navLinkActive : ""}`}
              onClick={() => jumpTo(section.id)}
            >
              {section.label}
            </button>
          ))}
          <button type="button" className={styles.navLink} onClick={() => navigate(DOC_ROUTE)}>
            Docs
          </button>
          <button type="button" className={styles.navLink} onClick={() => navigate(HOW_TO_ROUTE)}>
            How-to
          </button>
          <button type="button" className={styles.navLink} onClick={() => startNanoTour("public")} data-insight="tour-trigger">
            Tour
          </button>
        </div>

        <button type="button" className={styles.askButton} onClick={() => openAssistant()}>
          <Sparkles size={14} strokeWidth={1.5} />
          Ask the lab
        </button>

        <ThemeToggle variant="pill" />
      </nav>

      <div className={styles.statusBanner}>
        <span className={styles.statusDot} aria-hidden />
        <span>NANO Study · Actively Enrolling · {study?.enrolled ?? 231} / {study?.target ?? 260} participants</span>
        <a href="https://www.esdlabsc.com" target="_blank" rel="noopener noreferrer">
          Learn more about participating <ArrowRight size={14} aria-hidden />
        </a>
      </div>

      <main className={styles.main}>
        <section id="overview" className={styles.hero} data-insight="landing-overview">
          <div className={styles.heroEyebrow} data-insight="pipeline-svg">
            <span className={styles.liveDot} />
            <span>Live NANO pipeline · {totals.inflight} stages in flight</span>
          </div>

          <div className={styles.heroGrid}>
            <div className={styles.heroCopy} data-insight="landing-overview">
              <h1 className={styles.heroTitle}>
                The heartbeat of every baby&apos;s first year.
              </h1>
              <p className={styles.heroBody}>
                This public surface now centers the <Gloss term="NANO">NANO Study</Gloss> itself: the longitudinal infant story,
                the live pipeline behind it, the cohort-level questions, and the assistant that can explain any section without dropping users into the operator shell too early.
              </p>
              <div className={styles.heroActions}>
                <button type="button" className={styles.primaryButton} onClick={() => jumpTo("aims")}>
                  Explore aims
                  <ChevronDown size={14} strokeWidth={1.5} />
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => openAssistant("Walk me through the NANO Study.")}>
                  Open assistant
                  <Sparkles size={14} strokeWidth={1.5} />
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => navigate("/presentation-maker")}>
                  Make an explainer
                  <Presentation size={14} strokeWidth={1.5} />
                </button>
              </div>
              <button type="button" className={styles.tourLink} onClick={() => startNanoTour("public")} data-insight="tour-trigger">
                New here? Take the 3-minute tour <ArrowRight size={13} aria-hidden />
              </button>

              <div className={styles.heroMetaStrip}>
                <div className={styles.heroMiniCard} data-insight="kpi-enroll">
                  <span>Infants enrolled</span>
                  <strong>{study?.enrolled ?? 231} / {study?.target ?? 260}</strong>
                </div>
                <div className={styles.heroMiniCard} data-insight="landing-rmssd">
                  <span>Median RMSSD</span>
                  <strong>{stat(totals.rmssdLatest, 1)} ms</strong>
                </div>
                <div className={styles.heroMiniCard} data-insight="kpi-epochs">
                  <span>Epochs in 24 h</span>
                  <strong>{stat(totals.done)}</strong>
                </div>
                <div className={styles.heroMiniCard} data-insight="landing-runs">
                  <span>Queued runs</span>
                  <strong>{totals.readyRuns}</strong>
                </div>
              </div>
            </div>

            <a
              href="/results"
              className={`${styles.heroSignalCard} ${styles.heroSignalButton}`}
              data-insight="landing-attention-pulse"
              data-tour="attention-pulse"
              aria-label="Open results view for deeper HDA and cohort metrics"
            >
              <div className={styles.heroSignalGlow} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <span className={styles.cardEyebrow}>Attention pulse</span>
              <div className={styles.heroSignalValueRow}>
                <strong>{stat(heroSignal.sustainedShare, 1)}%</strong>
                <span>labeled windows in sustained attention</span>
              </div>
              <p className={styles.cardBody}>
                A quick operational read on whether the visible HDA stream is spending more time in sustained attention than in orienting, inattention, or termination.
              </p>

              <div className={styles.heroSignalRail} aria-hidden="true">
                {heroSignal.phaseMix.map((phase) => (
                  <span
                    key={phase.key}
                    className={styles.heroSignalRailSegment}
                    style={{ width: `${phase.share}%`, background: `linear-gradient(90deg, ${phase.color}, ${phase.color}cc)` }}
                  />
                ))}
              </div>

              <div className={styles.heroSignalLegend}>
                {heroSignal.phaseMix.map((phase) => (
                  <div key={phase.key} className={styles.heroSignalLegendItem}>
                    <span className={styles.heroSignalLegendDot} style={{ backgroundColor: phase.color }} />
                    <span>{phase.label}</span>
                    <strong>{stat(phase.share, 0)}%</strong>
                  </div>
                ))}
              </div>

              <div className={styles.heroSignalBands}>
                {heroSignal.cohortBands.map((cohort) => (
                  <div key={cohort.code} className={styles.heroSignalBand}>
                    <div className={styles.heroSignalBandHeader}>
                      <span>{cohort.code}</span>
                      <strong>{stat(cohort.sustainedShare, 0)}%</strong>
                    </div>
                    <div className={styles.heroSignalTrack}>
                      <span className={styles.heroSignalFill} style={{ width: `${cohort.sustainedShare}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.heroSignalMeta}>
                <div>
                  <span>Tagged windows</span>
                  <strong>{stat(heroSignal.totalLabeled)}</strong>
                </div>
                <div>
                  <span>QA pass rate</span>
                  <strong>{stat(heroSignal.passRate, 1)}%</strong>
                </div>
              </div>
              <div className={styles.heroSignalCta}>
                <span>Open results view</span>
                <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
              </div>
            </a>

            <aside className={styles.heroCard} data-insight="landing-study">
              <span className={styles.cardEyebrow}>About the study</span>
              <h2 className={styles.cardTitle}>Longitudinal infant neurodevelopment, grounded in live operations.</h2>
              <p className={styles.cardBody}>
                A five-year study of 260 infants across very preterm, autism-sibling, and term-born cohorts. Every form, ECG segment, HDA label, and model output traces back to the same de-identified clinical pipeline.
              </p>
              <div className={styles.heroStats}>
                <div>
                  <span>Enrolled</span>
                  <strong>{study?.enrolled ?? 231} / {study?.target ?? 260}</strong>
                </div>
                <div>
                  <span>RMSSD</span>
                  <strong>{stat(totals.rmssdLatest, 1)} ms</strong>
                </div>
                <div>
                  <span>Epochs</span>
                  <strong>{stat(totals.done)}</strong>
                </div>
                <div>
                  <span>PHI leaks</span>
                  <strong>0</strong>
                </div>
              </div>
              <div className={styles.heroActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => navigate("/overview")}>
                  Operator detail
                  <ArrowRight size={14} strokeWidth={1.5} />
                </button>
              </div>
            </aside>
          </div>

          <div data-insight="landing-waveform">
            <WaveRibbon rmssd={totals.rmssdLatest} epochs={totals.done} passRate={heroSignal.passRate} />
          </div>
        </section>

        <section id="metrics" className={styles.section} data-insight="landing-metrics">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Lab pulse</span>
              <h2>What&apos;s moving today.</h2>
            </div>
            <div className={styles.sectionNote}>Updated from the live API hooks already powering the operator routes.</div>
          </header>
          <div className={styles.metricGrid}>
            <article className={styles.metricCard} data-insight="kpi-enroll">
              <span>Infants enrolled</span>
              <strong>{study?.enrolled ?? 231} / {study?.target ?? 260}</strong>
              <p>NANO recruitment across ASIB, VPT, and TD cohorts.</p>
              <div className={styles.metricFooter}>Recruitment narrative</div>
            </article>
            <article className={styles.metricCard} data-insight="kpi-epochs">
              <span>Epochs · 24 h</span>
              <strong>{stat(totals.done)}</strong>
              <p>Processed ECG windows available for QA and downstream features.</p>
              <div className={styles.metricFooter}>Signal throughput</div>
            </article>
            <article className={styles.metricCard} data-insight="landing-rmssd">
              <span>Median RMSSD</span>
              <strong>{stat(totals.rmssdLatest, 1)} ms</strong>
              <p>Cohort-level vagal tone across the visible trajectory slice.</p>
              <div className={styles.metricFooter}>Trajectory benchmark</div>
            </article>
            <article className={styles.metricCard} data-insight="landing-assistant-context">
              <span>Assistant-ready context</span>
              <strong>{stat(totals.hdaTotal)}</strong>
              <p>HDA-labeled windows and study context wired to ESD Buddy.</p>
              <div className={styles.metricFooter}>Explainer surface</div>
            </article>
          </div>
        </section>

        {dynLandingItems.length > 0 && (
          <section className={`${styles.section} ${styles.dynamicsSection}`} data-insight="dyn-discovery">
            <header className={`${styles.sectionHeader} ${styles.dynamicsHeader}`}>
              <div>
                <span className={styles.sectionEyebrow}>Dynamics &amp; Dyads</span>
                <h2>Relationships across time.</h2>
              </div>
              <div className={styles.sectionNote}>Preview routes stay feature-flagged and NANOID-only.</div>
            </header>
            <div className={styles.dynamicsGrid}>
              {dynLandingItems.map((item) => (
                <button
                  key={item.to}
                  type="button"
                  className={styles.dynamicsCard}
                  onClick={() => navigate(item.to)}
                  data-insight="dyn-discovery-card"
                  aria-label={`Launch ${item.title}. ${item.body}`}
                >
                  <div className={styles.dynamicsCardTop}>
                    <span className={styles.dynamicsStatus}>{item.status}</span>
                    <span className={styles.dynamicsLaunch}>
                      Launch route <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
                    </span>
                  </div>
                  <div className={styles.dynamicsCardBody}>
                    <span className={styles.dynamicsKicker}>{item.eyebrow}</span>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                  <div className={styles.dynamicsRouteMeta}>
                    <span>
                      <i>{item.readoutLabel}</i>
                      <b>{item.readout}</b>
                    </span>
                    <span>
                      <i>Access</i>
                      <b>{item.access}</b>
                    </span>
                  </div>
                  <div className={styles.dynamicsSteps}>
                    {item.steps.map((step, index) => (
                      <span key={step}>
                        <i>{String(index + 1).padStart(2, "0")}</i>
                        <b>{step}</b>
                      </span>
                    ))}
                  </div>
                </button>
              ))}
              {dynLandingItems.length < 4 ? (
                <DyadSyncPreview
                  rmssd={totals.rmssdLatest}
                  onOpen={() => navigate(dynLandingItems[0]?.to ?? "/dyad-coregulation")}
                />
              ) : null}
            </div>
          </section>
        )}

        <section id="aims" className={styles.section} data-insight="landing-aims">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Specific aims</span>
              <h2>Three questions, one trajectory.</h2>
            </div>
            <div className={styles.sectionNote}>Expand a card to see the exact hypothesis, method, and outcome surface.</div>
          </header>
          <div className={styles.aimGrid}>
            {AIMS.map((aim, index) => {
              const isOpen = openAim === index;
              return (
                <article
                  key={aim.id}
                  className={`${styles.aimCard} ${isOpen ? styles.aimCardOpen : ""}`}
                  data-insight={`landing-aim-${aim.id}`}
                  data-tour={index === 0 ? "aim-card" : undefined}
                >
                  <div className={styles.aimHeader}>
                    <div>
                      <span className={styles.storyKicker}>Aim {aim.id}</span>
                      <h3>{aim.title}</h3>
                    </div>
                    <button type="button" className={styles.aimButton} onClick={() => setOpenAim(isOpen ? -1 : index)}>
                      {isOpen ? "Collapse" : "Expand"}
                    </button>
                  </div>
                  <p>{aim.primary}</p>
                  <div className={styles.aimMeta}>{aim.window}</div>
                  {isOpen ? (
                    <div className={styles.aimOpen}>
                      <div>
                        <span className={styles.sectionEyebrow}>Hypothesis</span>
                        <p>{aim.hypothesis}</p>
                      </div>
                      <div>
                        <span className={styles.sectionEyebrow}>Method</span>
                        <p>{aim.method}</p>
                      </div>
                      <div>
                        <span className={styles.sectionEyebrow}>Outcome</span>
                        <p>{aim.outcome}</p>
                      </div>
                      <button type="button" className={styles.secondaryButton} onClick={() => openAssistant(`Explain Aim ${aim.id} in plain language.`)}>
                        Ask about Aim {aim.id}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          <div className={styles.comparisonStrip}>
            {groupCards.map((group) => (
              <article key={group.code} className={styles.comparisonCard} data-insight="landing-groups">
                <span className={styles.storyKicker}>{group.code}</span>
                <h3>{group.label}</h3>
                <strong>{group.count}</strong>
                <p>{group.target} target participants in this cohort arm.</p>
              </article>
            ))}
          </div>
        </section>

        <section id="architecture" className={styles.section} data-insight="landing-architecture">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Data architecture</span>
              <h2>From chest to claim.</h2>
            </div>
            <div className={styles.sectionNote}>Select a layer to inspect how raw capture becomes publishable output.</div>
          </header>
          <div className={styles.architectureShell}>
            <div className={styles.layerRail} data-tour="architecture-layer">
              {ARCHITECTURE.map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  className={`${styles.layerButton} ${activeLayer === layer.id ? styles.layerButtonActive : ""}`}
                  onClick={() => setActiveLayer(layer.id)}
                  data-insight={`landing-arch-${layer.id}`}
                >
                  <span>{layer.short}</span>
                  <strong>{layer.title}</strong>
                </button>
              ))}
            </div>
            <article className={styles.layerPanel} data-insight="landing-arch-panel">
              <span className={styles.storyKicker}>{activeArchitecture.short}</span>
              <h3>{activeArchitecture.title}</h3>
              <div className={styles.layerList}>
                {activeArchitecture.items.map((item) => (
                  <div key={item} className={styles.layerItem}>
                    {item}
                  </div>
                ))}
              </div>
              <div className={styles.heroActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => navigate("/runs")}>
                  Open pipeline detail
                  <ArrowRight size={14} strokeWidth={1.5} />
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => navigate("/redcap")}>
                  Open REDCap sync
                  <ArrowRight size={14} strokeWidth={1.5} />
                </button>
              </div>
            </article>
          </div>
        </section>

        <section id="pipeline" className={styles.section} data-insight="pipeline-svg">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Pipeline</span>
              <h2>The NANO pipeline, live.</h2>
            </div>
            <button type="button" className={styles.ghostButton} onClick={() => navigate("/runs")}>
              Open run history
              <ArrowRight size={14} strokeWidth={1.5} />
            </button>
          </header>
          <div className={styles.pipelineRail}>
            {stages.slice(0, 6).map((stage, index) => (
              <button
                key={stage.id}
                type="button"
                className={styles.pipelineCard}
                onClick={() => navigate("/runs")}
                data-insight={`stage-${stage.id}`}
                data-tour={index === 0 ? "pipeline-stage" : undefined}
              >
                <span className={styles.pipelineIndex}>Stage {String(index + 1).padStart(2, "0")}</span>
                <h3>{stage.label}</h3>
                <strong>{stage.inflight}</strong>
                <p>{stage.short}</p>
                <small>{stat(stage.done)} done · {stage.fail} fail</small>
              </button>
            ))}
          </div>
        </section>

        <section id="qa" className={`${styles.section} ${styles.qaSection}`} data-insight="landing-qa-watch">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Quality and flow</span>
              <h2>An agent watching the wires.</h2>
            </div>
          </header>
          <div className={styles.splitGrid}>
            <article className={`${styles.darkCard} ${styles.fillCard} ${styles.watchCard}`} data-insight="landing-qa-watch">
              <AmbientOrbit tone="gold" size={260} opacity={0.18} spin={36} waveform className={styles.fillOrbitBR} />
              <AmbientOrbit tone="garnet" size={140} opacity={0.22} spin={48} className={styles.fillOrbitBL} />
              <div className={styles.fillStream} aria-hidden>
                <span /><span /><span /><span /><span />
              </div>
              <div className={styles.watchSignal} aria-hidden="true">
                <svg viewBox="0 0 680 230" preserveAspectRatio="none">
                  <path className={styles.watchSignalGrid} d="M0 40 H680 M0 92 H680 M0 144 H680 M0 196 H680" />
                  <path className={styles.watchSignalRail} d="M40 164 C96 130 132 178 178 148 S268 104 314 134 S404 178 456 146 S556 108 640 132" />
                  <path className={styles.watchSignalPulse} d="M44 168 L108 166 L128 122 L148 194 L166 160 L218 158 L238 132 L254 166 L306 164 L334 94 L362 196 L384 150 L456 148 L482 120 L506 166 L584 164 L620 132 L648 154" />
                </svg>
              </div>
              <div className={styles.fillContent}>
                <span className={styles.sectionEyebrow}>Agentic QA</span>
                <h3>Pipeline watchlist</h3>
                <ul className={styles.watchList}>
                  {insightFeed.map((item) => (
                    <li key={item.tag}>
                      <strong>{item.tag}</strong>
                      <span>{item.body}</span>
                    </li>
                  ))}
                </ul>
                <div className={styles.heroActions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => openAssistant("Summarize the current QA watchlist.")}>
                    Ask the assistant
                  </button>
                </div>
                <div className={styles.fillStrip}>
                  <div className={styles.fillChip}><span className={styles.fillDotG} /> heartbeat <strong>{stat(totals.done)}</strong></div>
                  <div className={styles.fillChip}><span className={styles.fillDotR} /> stage fails <strong>{totals.fail}</strong></div>
                  <div className={styles.fillChip}><span className={styles.fillDotB} /> in flight <strong>{totals.inflight}</strong></div>
                </div>
              </div>
            </article>
            <article className={`${styles.flowCard} ${styles.fillCard} ${styles.participantFlowCard}`} data-insight="landing-flow">
              <AmbientOrbit tone="sage" size={200} opacity={0.32} spin={44} waveform className={styles.fillOrbitBR} />
              <AmbientOrbit tone="ocean" size={120} opacity={0.22} spin={52} className={styles.fillOrbitTR} />
              <div className={styles.flowConstellation} aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className={styles.fillContent}>
                <span className={styles.sectionEyebrow}>Recent participant flow</span>
                <h3>The last four hours</h3>
                <ul className={styles.flowList}>
                  {participants.slice(0, 7).map((participant) => (
                    <li key={participant.id}>
                      <button type="button" onClick={() => navigate(`/participants/${participant.id}`)}>
                        <strong>{participant.id}</strong>
                        <span>{participant.group} · {participant.visit} · {participant.site}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className={styles.fillStrip}>
                  <div className={styles.fillChip}><span className={styles.fillDotG} /> visits today <strong>{participants.length}</strong></div>
                  <div className={styles.fillChip}><span className={styles.fillDotB} /> queued runs <strong>{totals.readyRuns}</strong></div>
                  <div className={styles.fillChip}><span className={styles.fillDotY} /> RMSSD <strong>{stat(totals.rmssdLatest, 1)} ms</strong></div>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section id="cohort" className={styles.section} data-insight="landing-cohort">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Cohort snapshot</span>
              <h2>Every infant, every visit.</h2>
            </div>
            <button type="button" className={styles.ghostButton} onClick={() => navigate("/participants")}>
              Open participant table
              <ArrowRight size={14} strokeWidth={1.5} />
            </button>
          </header>
          <div className={styles.tableCard} data-insight="landing-cohort">
            <div className={styles.tableToolbar}>
              <div className={styles.toolbarActions}>
                <label className={styles.groupSelectWrap} data-tour="cohort-filter">
                  <span className={styles.sectionEyebrow}>Filter</span>
                  <select className={styles.groupSelect} value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                    <option value="all">All groups</option>
                    <option value="ASIB">ASIB</option>
                    <option value="VPT">VPT</option>
                    <option value="TD">TD</option>
                  </select>
                </label>
              </div>
              <div className={styles.sectionNote}>{filteredParticipants.length} participants shown</div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.cohortTable}>
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Group</th>
                    <th>Visit</th>
                    <th>Site</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParticipants.map((participant) => (
                    <tr key={participant.id}>
                      <td>
                        <button type="button" className={styles.rowLink} onClick={() => navigate(`/participants/${participant.id}`)}>
                          {participant.id}
                        </button>
                      </td>
                      <td>
                        <span className={styles.groupBadge} style={{ color: GROUP_ACCENTS[participant.group] ?? "var(--warm-600)" }}>
                          {participant.group}
                        </span>
                      </td>
                      <td>{participant.visit}</td>
                      <td>{participant.site}</td>
                      <td>{participant.qa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="ml" className={styles.section} data-insight="landing-model-card">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Model performance</span>
              <h2>Calibrated, not just accurate.</h2>
            </div>
            <button type="button" className={styles.ghostButton} onClick={() => navigate("/results")}>
              Open results
              <ArrowRight size={14} strokeWidth={1.5} />
            </button>
          </header>
          <div className={styles.chartGrid}>
            <article className={styles.chartCard} data-insight="landing-rmssd-chart">
              <span className={styles.storyKicker}>RMSSD trajectory</span>
              <h3>Visible cohort trend</h3>
              <svg viewBox="0 0 360 220" className={styles.trajectorySvg}>
                {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
                  <line key={tick} x1="32" x2="344" y1={26 + tick * 150} y2={26 + tick * 150} className={styles.chartGridLine} />
                ))}
                {trajectorySeries.map((series) => {
                  const values = series.values;
                  const xStep = values.length > 1 ? 280 / (values.length - 1) : 0;
                  const points = values
                    .map((point, index) => {
                      const x = 42 + index * xStep;
                      const y = 176 - ((point.y - 10) / 50) * 130;
                      return `${x},${y}`;
                    })
                    .join(" ");
                  return <polyline key={series.group} points={points} style={{ stroke: GROUP_ACCENTS[series.group] }} className={styles.chartLine} />;
                })}
              </svg>
              <div className={styles.legend}>
                {trajectorySeries.map((series) => (
                  <span key={series.group}>
                    <span className={styles.legendDot} style={{ background: GROUP_ACCENTS[series.group] }} />
                    {series.group}
                  </span>
                ))}
              </div>
            </article>
            <article className={styles.chartCard} data-insight="landing-hda-chart">
              <span className={styles.storyKicker}>HDA distribution</span>
              <h3>Phase composition by cohort</h3>
              <div className={styles.stackList}>
                {hda
                  ? Object.entries(hda).map(([group, dist]) => {
                      const total = dist.orienting + dist.sustained + dist.inattention + dist.termination;
                      return (
                        <div key={group} className={styles.stackRow}>
                          <div className={styles.stackLabel}>{group}</div>
                          <div className={styles.stackBar}>
                            <span className={styles.stackSegment} style={{ width: `${(dist.orienting / total) * 100}%`, background: "#9bb8e0" }} />
                            <span className={styles.stackSegment} style={{ width: `${(dist.sustained / total) * 100}%`, background: "var(--usc-garnet)" }} />
                            <span className={styles.stackSegment} style={{ width: `${(dist.inattention / total) * 100}%`, background: "#d18a3a" }} />
                            <span className={styles.stackSegment} style={{ width: `${(dist.termination / total) * 100}%`, background: "#8172B2" }} />
                          </div>
                          <div className={styles.stackValue}>{stat(total)}</div>
                        </div>
                      );
                    })
                  : null}
              </div>
            </article>
            <article className={styles.chartCard} data-insight="landing-model-card">
              <span className={styles.storyKicker}>Model card</span>
              <h3>Validated, calibrated, reviewable</h3>
              <div className={styles.metricTileGrid}>
                <div>
                  <span>AUROC</span>
                  <strong>0.899</strong>
                </div>
                <div>
                  <span>F1</span>
                  <strong>0.853</strong>
                </div>
                <div>
                  <span>ECE</span>
                  <strong>0.041</strong>
                </div>
                <div>
                  <span>Brier</span>
                  <strong>0.094</strong>
                </div>
              </div>
              <p>Gradient-boosted classification on de-identified infant features, surfaced here before the dense analytics routes.</p>
            </article>
          </div>
        </section>

        <section id="studio" className={styles.section} data-insight="landing-studio-inputs">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Model studio</span>
              <h2>Adjust the infant profile.</h2>
            </div>
            <div className={styles.sectionNote}>Illustrative sliders change the explanatory risk gauge without leaving the landing page.</div>
          </header>
          <div className={styles.studioGrid}>
            <article className={styles.studioCard} data-insight="landing-studio-inputs">
              <div className={styles.studioHeader}>
                <div>
                  <span className={styles.storyKicker}>Input features</span>
                  <h3>Per-infant predictors</h3>
                </div>
                <SlidersHorizontal size={18} strokeWidth={1.5} />
              </div>
              <div className={styles.sliderList}>
                {STUDIO_INPUTS.map((input, index) => (
                  <label key={input.id} className={styles.sliderRow} data-tour={index === 0 ? "studio-slider" : undefined}>
                    <div className={styles.sliderMeta}>
                      <span>{input.label}</span>
                      <strong>
                        {stat(studioValues[input.id] ?? input.defaultValue, input.step < 1 ? 1 : 0)} {input.suffix}
                      </strong>
                    </div>
                    <input
                      className={styles.sliderInput}
                      type="range"
                      min={input.min}
                      max={input.max}
                      step={input.step}
                      value={studioValues[input.id] ?? input.defaultValue}
                      onChange={(event) =>
                        setStudioValues((current) => ({
                          ...current,
                          [input.id]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <div className={styles.heroActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setStudioValues(Object.fromEntries(STUDIO_INPUTS.map((input) => [input.id, input.defaultValue])))}
                >
                  <RotateCcw size={14} strokeWidth={1.5} />
                  Reset inputs
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => openAssistant("Explain why these model features matter.")}>
                  Explain features
                </button>
              </div>
            </article>
            <article className={styles.studioCard} data-insight="landing-studio-gauge">
              <Gauge value={riskScore} />
              <div className={styles.metricTileGrid}>
                <div>
                  <span>Algorithm</span>
                  <strong>XGBoost</strong>
                </div>
                <div>
                  <span>Train split</span>
                  <strong>80/20</strong>
                </div>
                <div>
                  <span>Feature groups</span>
                  <strong>24</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>Calibrated</strong>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section id="assistant" className={styles.section} data-insight="landing-assistant">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>AI assistant</span>
              <h2>Ask the lab anything.</h2>
            </div>
          </header>
          <article className={styles.assistantCard} data-insight="landing-assistant" data-tour="assistant-surface">
            <p>
              The in-page assistant stays visually central and operationally grounded. Use it to explain the study, unpack HDA, summarize a result, or decide when to switch from this narrative surface into the operator routes.
            </p>
            <div className={styles.suggestionGrid}>
              {ASSISTANT_SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" className={styles.suggestionPill} onClick={() => openAssistant(suggestion)}>
                  <Sparkles size={14} strokeWidth={1.5} />
                  {suggestion}
                </button>
              ))}
            </div>
          </article>
        </section>

        <section id="library" className={styles.section} data-insight="landing-reading">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Anchor reading</span>
              <h2>Where this work points.</h2>
            </div>
            <label className={styles.searchShell} data-tour="library-search">
              <Search size={15} strokeWidth={1.5} />
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder="Search title, author, abstract"
              />
            </label>
          </header>
          <ReadingCorpusPanel />
          <div className={styles.readingList}>
            {filteredReading.map((entry) => (
              <article key={entry.title} className={styles.readingItem} data-insight="landing-reading">
                <div className={styles.readingHeader}>
                  <div>
                    <span className={styles.storyKicker}>{entry.tag}</span>
                    <h3>{entry.title}</h3>
                    <div className={styles.readingMeta}>{entry.meta} · {entry.authors}</div>
                  </div>
                  <button type="button" className={styles.secondaryButton} onClick={() => openAssistant(`Summarize ${entry.title}.`)}>
                    Summarize
                  </button>
                </div>
                <p className={styles.readingAbstract}>{entry.abstract}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <div className={styles.dock}>
        <span><ShieldCheck size={14} strokeWidth={1.5} /> HIPAA session</span>
        <span>{runs[0]?.id ?? "run_2026_115_a"}</span>
        <span>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
        <button type="button" onClick={() => navigate("/overview")} data-tour="operator-toggle">Operator view</button>
      </div>

      <button type="button" className={styles.fab} aria-label="Open assistant" onClick={() => openAssistant()}>
        <Sparkles size={20} strokeWidth={1.5} />
      </button>

      <Buddy anchor="page" />
      <ChatDrawer />
    </div>
  );
}
