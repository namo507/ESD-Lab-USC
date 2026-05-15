/**
 * GLOSS — single source of truth for inline acronym explanations.
 * Mirrors the prototype's window.GLOSS dictionary; do not redefine elsewhere.
 */
export const GLOSS = {
  RMSSD:
    "Root Mean Square of Successive Differences between adjacent inter-beat intervals (ms). A vagal-tone marker — higher values typically indicate stronger parasympathetic regulation.",
  HF:
    "High-Frequency power (0.15–0.4 Hz, ms²) of HRV spectrum. Reflects respiratory sinus arrhythmia / vagal activity in infants.",
  pNN50:
    "Percent of successive IBI differences greater than 50 ms. A simple time-domain HRV index.",
  SDNN:
    "Standard Deviation of NN (normal-to-normal) intervals across the window. Reflects overall HRV.",
  IBI:
    "Inter-Beat Interval — time between consecutive R-peaks (ms). Building block of all HRV metrics.",
  CGA:
    "Corrected Gestational Age — chronological age minus weeks born preterm. Standard for VPT longitudinal comparisons.",
  PMA:
    "Post-Menstrual Age — gestational age + chronological age. Used at and immediately after NICU discharge.",
  VPT:
    "Very Preterm — born < 32 weeks gestational age. The primary cohort in NANO (n=184 of 235 enrolled).",
  ASIB:
    "Autism-Sibling cohort — younger siblings of an autistic child, enrolled as a higher-likelihood comparison group.",
  TD:
    "Typically Developing — full-term, no autism family history. Comparison cohort.",
  HDA:
    "Heart-rate Defined Attention — episode classification driven by HR change relative to baseline. Phases: orienting, sustained attention, inattention, termination.",
  SQI:
    "Signal Quality Index — 0–1. Combines noise floor, R-peak SNR, and ectopic-beat fraction. Windows below 0.4 are auto-rejected; 0.4–0.6 surfaces for human review.",
  Epoch: "5-second window of ECG. The atomic unit of QA review and HDA labeling.",
  Window:
    "In NANO, a contiguous run of accepted epochs from one visit. HRV features are computed per window.",
  Ectopic:
    "Premature beat (PAC/PVC) deviating from the normal rhythm. Excluded before HRV computation but counted as a quality flag.",
  Orienting:
    "HDA phase 1 — initial rapid HR deceleration as infant attends to a novel stimulus.",
  Sustained:
    "HDA phase 2 — HR remains below baseline; engaged attention.",
  Inattention:
    "HDA phase 3 — HR returns toward baseline; attention waning.",
  Termination:
    "HDA phase 4 — HR overshoots baseline; attention has ended, often disengagement.",
  RedCap:
    "REDCap (Research Electronic Data Capture). Web platform hosting all study forms; the dashboard syncs metadata from REDCap nightly + on-demand.",
  Actiheart5:
    "Actiheart-5 — chest-worn ECG + activity logger. 1024 Hz ECG, recorded continuously across each visit. Source of every raw .ecg file.",
  PHI:
    "Protected Health Information. Names, DOBs, MRNs, exact addresses. Never enters data/processed/deidentified/.",
  HIPAA:
    "Health Insurance Portability and Accountability Act. The dashboard logs access, enforces session timeouts, and prevents direct PHI export.",
  Actiheart:
    "Actiheart-5 — chest-worn ambulatory ECG + accelerometer used in the NANO Study. 1024 Hz, single-lead. Source of every raw .ecg file.",
  ASD:
    "Autism Spectrum Disorder. The Early Social Development Lab studies its earliest behavioral and physiological signatures in infants from 1–36 months.",
} as const;

export type GlossTerm = keyof typeof GLOSS;

export function lookupGloss(term: string | undefined | null): string | undefined {
  if (!term) return undefined;
  return (GLOSS as Record<string, string>)[term];
}
