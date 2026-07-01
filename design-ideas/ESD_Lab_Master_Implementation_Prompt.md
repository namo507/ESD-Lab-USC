# ESD Lab USC — Master Dashboard Implementation Prompt
## NANO + NICO Study Integration | Full-Stack Engineering Directive
### Version 1.0 | July 2026 | University of South Carolina

---

> **HOW TO USE THIS FILE:** Hand this entire document verbatim to GitHub Copilot, Cursor, Claude, GPT-4, or any AI coding assistant as a single system prompt. It contains every clinical, physiological, computational, and engineering specification needed to implement, refine, and auto-sync the ESD Lab dashboard for both the NANO and NICO studies.

---

## 0. REPOSITORY & DEPLOYMENT CONTEXT

| Property | Value |
|---|---|
| **Live dashboard** | `https://esd-lab-namo.pages.dev/` |
| **Overview page** | `https://esd-lab-namo.pages.dev/overview` |
| **GitHub repo** | `https://github.com/namo507/ESD-Lab-USC` |
| **Local workspace** | `/Users/namomac/ESD-Lab-USC/` |
| **Frontend root** | `/Users/namomac/ESD-Lab-USC/web/` |
| **Backend root** | `/Users/namomac/ESD-Lab-USC/src/` |
| **Data contract** | `web/public/dashboard/data/dashboard_data.json` |
| **Cloudflare Worker** | `dist/pages-wrapper/_worker.js` |
| **Build tool** | Vite + TypeScript (strict) + Tailwind + CSS Modules |
| **Deployment** | Cloudflare Pages |
| **State management** | Zustand (uiStore) |
| **Test runner** | Vitest (`web/src/test/`) |
| **Python env** | Python 3.11, `src/` package, `pyproject.toml` |
| **R env** | `renv.lock` in repo root |
| **Database migrations** | `migrations/*.sql` |

**Existing built assets to preserve and extend (do NOT remove):**
- `GroupTag`, `SwimmerPlot`, `ThermalHeatmap`, `HdaTimeline`, `HdaPlayer`
- `ShapExplorer`, `CascadeSimulator`, `PipelineHealth`, `AttritionFunnel`
- `ModelConfidenceTerrain`, `SdohMap`, `MultimodalSynchrony`, `StillFace`
- `EpochTile`, `epochReducer`, `ClusterOpsPanel`, `PipelineDAG`, `PipelineSankey`
- `RsaGrowthChart`, `TrajectoryChart`, `EnrollmentBar`, `HDABarStack`
- `AppShell`, `Sidebar`, `TopNav`, `ChatDrawer`, `Buddy`, `HipaaBanner`

---

## 1. STUDY SCIENTIFIC CONTEXT

### 1.1 Neurobiological Foundation (Both Studies)

Both studies are grounded in the **developmental cascades theory**: ASD emerges not from a static neurological deficit but from a dynamic, cascading process of compounded developmental alterations originating in the autonomic nervous system (ANS). The cascade:

1. Subtle early neurobiological differences → altered neurotransmitter regulation and neural connectivity
2. Observable behavioral variability in lower-order attentional processes (orienting, disengagement, shifting)
3. Reduced triadic interaction opportunities → impoverished social and language learning
4. Cumulative cascading deficits in social experience → ASD phenotype

The ANS is the physiological bridge between biological survival and higher-order cognitive engagement. Significant ANS maturation occurs in the last prenatal trimester. Preterm birth before 32 weeks profoundly disrupts ANS development, initiating a developmental cascade that may disrupt physiological adaptation and cortical integration critical for social learning.

### 1.2 Heart-Defined Attention (HDA) — Core Construct

When an infant engages in sustained visual or social attention, a measurable **parasympathetically driven heart rate deceleration** occurs, blocking out irrelevant stimuli and focusing cognitive resources on the attention target.

**Four HDA phases** (used throughout dashboard UI):
1. **Not Looking / Inattention** — no stimulus engagement
2. **Attention Orienting** — initial stimulus detection, preparatory autonomic shift
3. **Sustained Attention (SA)** — prolonged parasympathetic dominance, steady HR deceleration
4. **Attention Termination** — parasympathetic release, HR returns to baseline

**Dependent variables:**
- `pct_SA` — percentage of time in sustained attention phase
- `HR_decel` — magnitude of HR deceleration (max − min HR during SA phase, in bpm)

---

## 2. STUDY 1 — NANO

**Full Title:** The Role of Autonomic Regulation of Attention in the Emergence of ASD  
**NIH Awards:** K23MH120476 / R01MH132925  
**PI:** Jessica Bradshaw, PhD (USC Department of Psychology)  
**Project Period:** July 1, 2023 – June 30, 2028  
**Study Design:** 5-year prospective longitudinal, N = 200 total participants  
**Preliminary Key Finding:** 86% accuracy classifying ASD likelihood (ASIB vs TD) using MLP on neonatal ECG features

### 2.1 Cohort Stratification

| Cohort | Label | N Target | Definition | Dashboard Tag Color |
|---|---|---|---|---|
| Autism Sibling | `ASIB` | 75 | Full-term infant with an older sibling diagnosed with ASD | Amber (`#F59E0B`) |
| Preterm | `PT` | 75 | Born GA 24w0d–32w6d, no family history of ASD | Teal (`#14B8A6`) |
| Typically Developing | `TD` | 50 | Full-term, TD sibling | Indigo (`#6366F1`) |

**PT gestational age strata (evenly distributed):**
- Stratum A: 24–26 weeks GA
- Stratum B: 27–29 weeks GA
- Stratum C: 30–32 weeks GA

### 2.2 Assessment Timepoints

`1m, 2m, 3m, 6m, 9m, 12m, 24m, 36m` (all in **corrected/adjusted age** for PT infants — non-negotiable)

### 2.3 Physiological Data Collection

**ECG Device:** CamnTech Actiheart wireless telemetry recorder, **1024 Hz** sampling  
**Placement:** Standard 3-lead infant ECG; worn during all assessment interactions  
**Duration:** Continuous during each study visit interaction block  
**Processing software:** CardioEdit / CardioEditPlus for QRS detection and artifact marking

**ECG-derived features** (extract via `src/preprocessing/hrv_features.py` and `src/preprocessing/ecg_preprocessing.py`):

| Feature | Variable Name | Description |
|---|---|---|
| Mean IBI | `mean_ibi` | Mean inter-beat interval (ms) |
| SD of IBI | `sd_ibi` | Standard deviation of IBI |
| RMSSD | `rmssd` | Root mean square of successive differences |
| ln(RMSSD) | `ln_rmssd` | Natural log of RMSSD (HRV proxy) |
| RSA | `rsa` | Respiratory sinus arrhythmia via CWT |
| Sample entropy | `sample_entropy` | Non-linear complexity of IBI series |
| CVNN | `cvnn` | Coefficient of variation: SD(NN)/Mean(NN) |
| HTI | `hti` | HRV triangular index |
| SD1/SD2 | `sd1`, `sd2` | Poincaré plot short- and long-axis |
| SAI | `sai` | Sympathetic Activity Index |
| PAI | `pai` | Parasympathetic Activity Index |

**HDA features** (synchronized ECG ↔ video, computed per visit × per interaction context):

| Feature | Variable Name |
|---|---|
| % time in sustained attention | `pct_sa` |
| HR deceleration magnitude | `hr_decel` |
| SA bout duration (mean) | `sa_duration_mean` |
| SA bout count | `sa_bout_count` |
| Orienting → SA transition probability | `p_orient_to_sa` |
| SA → Termination transition probability | `p_sa_to_term` |
| Orienting → Termination (bypass) probability | `p_orient_to_term` |

### 2.4 Behavioral Assessment Instruments

**At 1–3 months (NNNS-II Attention Protocol):**
- Animate stimuli: human face, human voice
- Inanimate stimuli: ball, rattle
- Score: attention items rated 1–9 (6 items, minimum 4 required for valid session)

**At 6–12 months (Infant Interaction Task):**
- Social Interaction: infant + caregiver + examiner; elicits social communication
- Object Interaction: infant + examiner + structured toy set; elicits non-social exploration
- Video coded frame-by-frame in DataVyu
- ECG onset/offset synchronized to video timestamp (tolerance: ≤500ms; flag if >500ms as "sync drift")

**Clinical/Covariate Assessments (REDCap):**

| Instrument | Timepoints | Construct |
|---|---|---|
| ADOS-2 (CSS) | 36m | Primary ASD outcome: Social Affect CSS, RRB CSS, Total CSS (range 1–10) |
| Bayley-4 (5 subscales) | 12m, 24m, 36m | NDI: Cognitive, Fine Motor, Gross Motor, Receptive Lang, Expressive Lang |
| SORF | 12m, 24m | Early ASD red flags: Social Communication Domain, RRB Domain |
| ASQ-3 | 6m, 12m, 24m | Developmental milestones |
| EPDS | 1m, 3m, 6m | Maternal depression |
| PRAPARE Risk Tally | 6m, 12m, 24m, 36m | Social Drivers of Health (SDOH) |
| NICU morbidity form | Enrollment | PT group only: IVH, NEC, BPD, ROP, PDA, ventilation |

### 2.5 NANO Analytic Targets

**Aim 1 — LGCM Trajectories (source: `src/models/latent_growth_curves.R`):**
- Latent Growth Curve Models on HDA metrics (`pct_sa`, `hr_decel`) and `rsa` from 1–3 months
- Estimate: **intercept** (baseline) and **slope** (rate of change) per infant
- Group comparison: ASIB vs PT vs TD — test intercept difference AND slope difference
- Handle missing data via Full Information Maximum Likelihood (FIML)
- Covariates: GA at birth, sex, NICU morbidity score, maternal education

**Aim 2 — CTMC Dynamics (source: `src/models/markov_chain_models.py`):**
- Continuous-Time Markov Chain over 4 HDA states
- Parameters per infant: 4 state time constants + 7 transition probabilities (11 total)
- Estimated via Bayesian MCMC
- Critical metric: probability of Orienting → Termination bypass (high = ASD-like rigidity)

**Aim 3 — ASD Prediction via ML (source: `src/models/ml_pipeline.py`):**
- MLP regression predicting ADOS-2 CSS (Social, RRB, Total) from HDA + RSA features at 1–12m
- Bi-LSTM on raw IBI time series as alternative feature input
- Cross-validation: leave-one-subject-out
- Bootstrapped R² CIs (n=1000 replicates)
- Ablation study: each feature removed → ΔAUC impact
- Temporal importance: which time window (1–3m vs 6–12m) contributes most per outcome

**Enrollment/Power:**
- 10–15 enrollments/month target
- 86% power to detect R² = 0.25 (primary ML outcome)
- 95% historical retention rate; 5% expected attrition

---

## 3. STUDY 2 — NICO

**Full Title:** Neonatal Autonomic Nervous System Dysfunction as a Predictor of Autism Spectrum Disorder in Preterm Infants  
**NIH Award:** 1R01MH138028-01A1  
**MPIs:** Robin Dail, PhD (USC College of Nursing) + Jessica Bradshaw, PhD (USC Psychology)  
**Total Budget:** $3,671,756 over 5 years  
**Project Period:** April 1, 2025 – March 31, 2030  
**Enrollment Site:** Prisma Health Richland NICU, Columbia SC (70-bed Level III, 200–250 VPTs/year)  
**Study Design:** 5-year prospective longitudinal, N = 260 enrolled (30% over-enrollment) → N = 200 completers  

**⭐ PRELIMINARY KEY FINDING (pin prominently on dashboard):**  
r = 0.81, p < 0.01 — HRC Score × SORF ASD Symptom Score at 12 months (N = 20 pilot VPT infants)

### 3.1 Cohort

**Single group: VPT (Very Preterm) infants**

**Inclusion criteria:**
- Born at Prisma Richland NICU between 24w0d and 31w6d GA
- Enrolled within first 24 hours of life
- Birthweight ≥ 500 grams

**Exclusion criteria:**
- Major anatomical or cardiac defect known at birth
- Anatomical brain damage or known in utero asphyxia
- Known genetic/chromosomal abnormality affecting heart function or neurodevelopment (e.g., Down Syndrome, Fragile X)

**Enrollment rate:** 12 infants/month × 22 months = 264 (supports 260 target); 90% historical consent rate

### 3.2 NICU-Phase Data Collection

**Duration:** Birth to NICU discharge (average ~9 weeks; range 4–16 weeks)

#### 3.2.1 Thermal Gradient Data

**Device:** Cincinnati Sub Zero Thermistor Model 499B + Grant Squirrel SQ2010 Datalogger  
**Placement:** Abdomen (central temperature) + sole of foot (peripheral temperature)  
**Adhesive:** Mepitac Silicone tape  
**Sampling rate:** 1 sample/minute → ~90,720 samples per infant over 63-day stay  
**Metric:** Central-Peripheral Temperature difference: `CPTd = T_abdomen − T_foot`

**Abnormal CPTd thresholds:**

| State | Definition | Physiological Meaning | Dashboard Color |
|---|---|---|---|
| Normal | 1°C ≤ CPTd ≤ 2°C | Healthy vasomotor tone | Green |
| Abnormal cold (peripheral vasodilation) | CPTd < 0°C | ANS dysfunction, abnormal peripheral blood flow | Blue |
| Abnormal hot (sympathetic stress) | CPTd > 2°C | Extreme vasoconstriction, possible infection/stress | Red |

**Data quality rule:** Any 24-hour period with < 80% valid temperature readings → **drop from analysis**, flag in QA log.

**Per-24h summary variables:** `pct_neg_cptd`, `pct_high_cptd`, `pct_valid_cptd`, `median_cptd`, `mean_cptd`  
**Rolling 7-day window:** `rolling_median_cptd`, `rolling_pct_abnormal`

#### 3.2.2 ECG and Heart Rate Indices

**Device:** SpaceLabs cardiopulmonary monitor → interfaced with HeRO Solo monitor (MPSC, Charlottesville VA)  
**HeRO upgrade for this study:** Re-engineered to store R-R intervals on USB (validated by MPSC, approved budget $22,500)  
**Signal:** Continuous beat-by-beat R-R intervals → 1,512 hours of ECG per infant  
**QRS detection:** FDA-approved automated algorithm (HeRO Solo internal)

**Pre-processing pipeline (implement in `src/preprocessing/hrv_features.py`):**
1. Identify isolated missed beats → correct via non-parametric outlier detection + interpolation
2. Segments with > 5 contiguous missing/edited beats → reject entirely
3. 1-hour windows with > 10% discarded data → drop, flag in QA log
4. Validate against manually cleaned Actiheart ECG from NANO recordings

**14 ANS features extracted per 1-hour window (Table 2a in NICO paper):**

| # | Feature | Variable Name | ANS Component |
|---|---|---|---|
| 1 | Heart Rate Variability | `hrv` | Combined |
| 2 | ln(RMSSD) | `ln_rmssd` | Parasympathetic |
| 3 | RSA (via CWT) | `rsa_cwt` | Parasympathetic |
| 4 | Mean NN | `mean_nn` | Combined |
| 5 | SD of NN | `sd_nn` | Combined |
| 6 | NN Skewness | `nn_skewness` | SNS/PNS balance |
| 7 | NN Sample Entropy | `nn_sample_entropy` | Non-linear |
| 8 | RMSSD | `rmssd` | Parasympathetic |
| 9 | SD1 (Poincaré) | `sd1` | Short-term HRV |
| 10 | SD2 (Poincaré) | `sd2` | Long-term HRV |
| 11 | CVNN | `cvnn` | Normalized HRV |
| 12 | HTI | `hti` | HRV distribution |
| 13 | SAI (Sympathetic Activity Index) | `sai` | Sympathetic |
| 14 | PAI (Parasympathetic Activity Index) | `pai` | Parasympathetic |
| Bonus | CSI (Cardiac Sympathetic Index) | `csi` | Sympathetic |
| Bonus | CVI (Cardiovagal Index) | `cvi` | Parasympathetic |

**HRC Score (HeRO):** Composite hourly HRC score (composite HRV-based infection predictor); clinical alert threshold: HRC > 5

**SVR input feature set per infant (Aim 1 ML):** For each of the 14 features, compute: 1st percentile, 50th percentile (median), 99th percentile, IQR, and slope vs. gestational age → 14 × 5 = 70 features total

### 3.3 Neonatal Morbidities

Extracted weekly from Prisma EMR → entered into REDCap by Research Nurse. If weekly entry is > 14 days stale → flag "data entry lag" in QA.

| Morbidity | Code | Definition | Incidence (VPT <32w) | Dashboard Icon Color |
|---|---|---|---|---|
| Severe Brain Injury | `SBI` | Grade III–IV IVH or PVL | 6–19% | Red |
| Sepsis | `SEP` | Late-onset blood infection (>7 days) | 9–50% | Orange |
| Necrotizing Enterocolitis | `NEC` | GI tract infection requiring treatment | 5–15% | Purple |
| Bronchopulmonary Dysplasia | `BPD` | Chronic lung disease, O₂ at 36w postnatal | 32–44% | Blue |
| Patent Ductus Arteriosus | `PDA` | Failed ductal closure requiring treatment | 5–60% | Cyan |
| Retinopathy of Prematurity | `ROP` | Developing retina disorder | 3–42% | Yellow |

**Combined Morbidity Index:** Validated summative score across all 6 morbidities + mechanical ventilation; used as moderator in Aim 2

### 3.4 Post-Discharge Follow-Up Assessments

| Visit | Timing | Format | Instruments | Incentive |
|---|---|---|---|---|
| 6m touchpoint | 6m corrected age | Virtual (REDCap survey + phone) | Demographics update, post-discharge medical info | $40 |
| 12m visit | 12m corrected age | In-home | SORF, ADOS-2, Bayley-4, ASQ-3, EPDS, PRAPARE, video recording | $50 |
| 24m visit | 24m corrected age | In-home | SORF, ADOS-2, Bayley-4, ASQ-3, EPDS, PRAPARE, video recording | $50 |
| 36m visit | 36m corrected age | In-home | ADOS-2 (primary outcome), Bayley-4, EPDS, PRAPARE, video recording | $50 |

**All post-discharge scores must be displayed in corrected/adjusted age — never chronological age.**

### 3.5 NICO Analytic Targets

**Aim 1 — SVR Prediction (source: `src/models/ml_pipeline.py`):**
- SVR (Scikit-Learn, RBF kernel) predicting ADOS-2 CSS and Bayley-4 subscale scores
- Input: 70-feature ANS matrix (14 features × 5 statistics) from NICU period
- Nested cross-validation: train 70% / test 15% / val 15% (subject-level splits)
- Permutation feature importance
- Bootstrapped R² CIs (n=1000)
- Bonferroni correction across 7 independent outcomes (ADOS-2 Total/Social/RRB + Bayley-4 × 4)

**Aim 2 — Moderation Analysis (source: new `src/models/moderation_analysis.py`):**
- StatsModels OLS with three-way interaction: `ANS_feature × Morbidity_Score × Sex` on ADOS CSS and Bayley-4
- Post-hoc decomposition by individual morbidity for significant interactions
- Correlation matrix hierarchical clustering to prune multicollinearity
- Power-transform linearity test per feature
- Sex as moderator for all ANS-outcome associations
- Bonferroni correction across 5 dependent variables

**Aim 3 — Phenotypic Clustering (source: `src/models/ml_pipeline.py`):**
- XGBoost regression on ADOS CSS Total at 36m → extract SHAP values
- PCA on SHAP values to prune redundancy before clustering
- DBSCAN clustering on PCA-reduced SHAP space
- Cluster QA: Silhouette Coefficient, t-SNE visualization, bootstrap stability
- Hotelling T² between-cluster significance (Mahalanobis distance)
- Per-cluster developmental trajectories: SORF (12m, 24m) + Bayley-4 (12m, 24m, 36m) with bootstrapped 95% CI ribbons
- 36m ADOS CSS distribution per cluster (violin/ridge plots)

---

## 4. DATA ACCURACY REQUIREMENTS — CRITICAL REFERENCE TABLE

**Never confuse NANO and NICO. They are distinct cohorts, distinct devices, distinct outcomes, distinct analytic frameworks.**

| Dashboard Element | NANO Value | NICO Value |
|---|---|---|
| Enrollment target | 200 (75 ASIB + 75 PT + 50 TD) | 260 enrolled → 200 completers |
| Participant group(s) | ASIB, PT, TD (3 groups) | VPT only (1 group) |
| Site | Community / home-based visits | Prisma Health Richland NICU |
| GA range | PT cohort: 24–32w; ASIB/TD: full-term | All VPT: 24w0d–31w6d |
| Follow-up timepoints | 1, 2, 3, 6, 9, 12, 24, 36 months | 6m (virtual), 12, 24, 36 months |
| ECG device | CamnTech Actiheart (1024 Hz, wireless) | HeRO Solo (MPSC, R-R stored on USB) |
| Temperature measurement | None (not applicable) | Grant Squirrel datalogger, 1 sample/min |
| Abnormal CPTd | N/A | < 0°C (vasodilation) OR > 2°C (vasoconstriction) |
| Primary ASD outcome | ADOS-2 CSS at 36m | ADOS-2 CSS at 36m |
| ASD screen at 12m/24m | SORF (from CSBS-BS) | SORF (from CSBS-BS) |
| NDI outcome | Bayley-4 (5 subscales) | Bayley-4 (5 subscales) |
| Key preliminary finding | 86% MLP classification accuracy (ASIB vs TD) | r = 0.81, p < 0.01 (HRC × SORF, N=20) |
| Primary ML method | MLP regression + bi-LSTM (Aim 3) | SVR Aim 1; XGBoost + DBSCAN Aim 3 |
| Dynamic model | CTMC (4 HDA states, 11 params/infant) | Not applicable |
| Growth curve model | LGCM (pct_SA, HR-decel, RSA at 1–3m) | Not applicable |
| Morbidity moderators | GA, NICU morbidities (PT group only) | SBI, SEP, NEC, BPD, PDA, ROP (validated index) |
| SDOH instrument | PRAPARE | PRAPARE Risk Tally Score |
| Maternal measures | EPDS at 1m, 3m, 6m | EPDS at visits |
| Adjusted age | Yes (PT and VPT infants only) | Yes (all NICO participants) |
| IRB | USC IRB | USC IRB + Prisma Health IRB |
| REDCap instance | USC server | USC server (separate database) |
| Data manager | Lab coordinators (Bradshaw lab) | Christopher Bush (consultant, $500/mo) |
| Consent rate | ~90% historical | ~90% historical |

---

## 5. PART A — FRONTEND UI IMPLEMENTATION

### A1. Study Selector (Global Shell)

**File:** `web/src/components/shell/AppShell.tsx`, `web/src/components/shell/Sidebar.tsx`

Add a **persistent study selector** immediately below the logo in the sidebar:

```tsx
// StudySelector component — add to uiStore
type StudyFilter = 'NANO' | 'NICO' | 'BOTH';

// Render as pill toggle group:
// [ NANO ]  [ NICO ]  [ BOTH ]
// Colors: NANO = indigo active, NICO = teal active, BOTH = slate active
```

**Behavior:**
- Store selection in Zustand `uiStore` as `activeStudy: StudyFilter`
- All pages, charts, and data calls reactively filter to the selected study
- `TopNav.tsx` breadcrumb shows: `ESD Lab / {activeStudy} / {pageName}` with NIH award ID subtitle
- When `BOTH` selected → render side-by-side comparison panels where components support it
- Persist selection to `localStorage` across sessions

### A2. Overview Page (`/overview`)

**Files:** `web/src/pages/Overview.tsx` (source of `build/assets/Overview-BLrbUUpI.js`)

Restructure the Overview page into a **dual-study hero section** at the top, followed by shared pipeline health:

#### NANO Hero Panel (left / top on mobile)

```
┌─────────────────────────────────────────────┐
│ NANO  R01MH132925  2023–2028                │
│─────────────────────────────────────────────│
│ Enrollment    [====|====|==  ] 0/200        │
│   ASIB ██  PT ██  TD ██                     │
│─────────────────────────────────────────────│
│ Active Follow-up                            │
│   1–3m: N  |  6–12m: N  |  24–36m: N       │
│─────────────────────────────────────────────│
│ Data Quality                                │
│   ECG valid: XX%    HDA synced: XX%         │
│─────────────────────────────────────────────│
│ 86% MLP classification accuracy ★ Prelim.  │
└─────────────────────────────────────────────┘
```

#### NICO Hero Panel (right / bottom on mobile)

```
┌─────────────────────────────────────────────┐
│ NICO  R01MH138028  2025–2030                │
│─────────────────────────────────────────────│
│ Enrollment    [====|====|==  ] 0/260        │
│─────────────────────────────────────────────│
│ Currently In-NICU: N  |  Discharged: N      │
│─────────────────────────────────────────────│
│ Thermal QA: XX% days ≥80% valid             │
│ ECG QA:     XX% windows <10% discarded      │
│─────────────────────────────────────────────│
│ ⭐ PRELIMINARY FINDING (amber card):         │
│ r = 0.81, p < 0.01                          │
│ HRC Score × SORF ASD Symptoms at 12m        │
│ N = 20 pilot VPT infants                    │
│ [mini scatter plot rendered inline]         │
└─────────────────────────────────────────────┘
```

**Implementation rules:**
- The r = 0.81 preliminary finding card must be: amber background (`bg-amber-50 border-amber-400`), pinned, non-dismissable, labeled "Preliminary Finding — Pilot Data"
- The mini scatter plot uses `ScatterChart` (already built), loads from `dashboard_data.json → nico.preliminary_finding.scatter_points`
- All counts driven from `dashboard_data.json`, never hardcoded as literals

### A3. Participants Page

**Files:** `web/src/pages/Participants.tsx` (source of `build/assets/Participants-DfUh8gbJ.js`)

#### NANO Participant Table Extensions

Add these columns:
- `GroupTag` chip: ASIB (amber) / PT (teal) / TD (indigo) — use existing `GroupTag` component
- `GA Stratum` (PT only): `24–26w` / `27–29w` / `30–32w`
- `Current Visit` column: which timepoint they are at (1m–36m bucket)
- `HDA Completeness` per participant: sparkline of % valid ECG per visit (green ≥ 80%, yellow 60–80%, red < 60%)
- `ADOS CSS` at 36m: severity chip (1–10 scale, color gradient from green → red); show `—` if not yet collected
- `EPDS Flag`: orange icon if EPDS score flagged at any timepoint

#### NICO Participant Table Extensions

Add these columns:
- `GA at Birth`: weeks + days
- `Birthweight (g)`
- `Days in NICU`: live counter for active infants (compare today vs. enrollment date)
- `Morbidity Flags`: icon pills for each morbidity — SBI (red), SEP (orange), NEC (purple), BPD (blue), PDA (cyan), ROP (yellow); empty circle if absent
- `Thermal QA`: mini sparkline of `pct_valid_cptd` per 7-day window
- `HRC Score Trend`: 7-day rolling median mini line chart; HRC > 5 highlighted red
- `Follow-Up Status`: color-coded badge per visit (6m / 12m / 24m / 36m): pending (grey) / scheduled (blue) / completed (green) / missed (red)
- `SORF at 12m/24m`: score when available, `—` otherwise

#### SwimmerPlot for All Participants

Render existing `SwimmerPlot` component showing each participant's timeline:
- X-axis: time from birth/enrollment
- Color bands: NICU phase (teal) → Discharged gap (grey) → 12m visit (blue) → 24m (indigo) → 36m (purple)
- Event markers: morbidity onset (NICO), assessment completions (both), SORF flags (diamonds)
- Sortable by: GA, enrollment date, outcome severity, cluster assignment (NICO Aim 3)

### A4. New Feature Routes

Add all routes to `web/src/FeatureRoutes.tsx`:

#### Route: `/nano/hda-explorer`
**Components:** Existing `HdaPlayer` + `HdaTimeline` + new group filter

```
UI Layout:
┌──────────────────────────────────────────────────────┐
│ Participant Selector  |  Visit Selector  |  Group ▾  │
├──────────────────────┬───────────────────────────────┤
│ HDA Phase Timeline   │ RSA Baseline Panel            │
│ (HdaTimeline)        │ (RsaGrowthChart)              │
├──────────────────────┴───────────────────────────────┤
│ HDA Phase Distribution Bar Stack                     │
│ (HDABarStack: Inattention | Orienting | SA | Term.)  │
├──────────────────────────────────────────────────────┤
│ Video Frame Counter (timestamp aligned to ECG)       │
│ [▶ Play]  Frame: XXXX  |  ECG Time: XX.XXXs          │
└──────────────────────────────────────────────────────┘
```

**Data source:** `dashboard_data.json → nano.hda_features.by_participant_visit`

#### Route: `/nano/lgcm-trajectories`
**Component:** Existing `TrajectoryChart`

```
UI Layout:
┌──────────────────────────────────────────────────────┐
│ Outcome Toggle: [pct_SA] [HR-decel] [RSA baseline]   │
│ Group Filter: [ASIB ✓] [PT ✓] [TD ✓]                │
├──────────────────────────────────────────────────────┤
│ Growth Curve Chart                                   │
│ X: 1m, 2m, 3m timepoints                           │
│ Y: outcome value                                     │
│ Solid lines: group means (ASIB amber, PT teal, TD indigo) │
│ Shaded ribbons: bootstrapped 95% CI per group        │
│ Dimmed thin lines: individual participant traces     │
├──────────────────────────────────────────────────────┤
│ Significance Annotations Table:                      │
│ Intercept diff (ASIB vs TD): β = X.XX, p = X.XXX    │
│ Slope diff (ASIB vs TD): β = X.XX, p = X.XXX        │
│ Intercept diff (PT vs TD): β = X.XX, p = X.XXX      │
└──────────────────────────────────────────────────────┘
```

**Data source:** `dashboard_data.json → nano.lgcm_results`

#### Route: `/nano/ml-prediction`
**Components:** Existing `ShapExplorer` + new R² heatmap

```
UI Layout:
┌────────────────────────────────────────────────────┐
│ Model Selector: [MLP] [bi-LSTM] [Ablation Mode]    │
├────────────────────────────────────────────────────┤
│ SHAP Feature Importance (horizontal bar chart)     │
│ Features sorted by mean |SHAP| value               │
│ Top 10 shown by default; expand for all            │
├────────────────────────────────────────────────────┤
│ Cross-Validated R² Heatmap                         │
│ Rows: ADOS-2 Total, ADOS-2 Social, ADOS-2 RRB,    │
│       Bayley Cog, Bayley FM, Bayley GM, Bayley RL, │
│       Bayley EL                                    │
│ Cols: 1–3m features | 6–12m features | combined   │
│ Color: R² value (0→1, white→green)                 │
├────────────────────────────────────────────────────┤
│ Ablation Study Table                               │
│ Feature removed | ΔAUC | Rank                      │
└────────────────────────────────────────────────────┘
```

**Data source:** `dashboard_data.json → nano.ml_results`

#### Route: `/nico/thermal-heatmap`
**Component:** Existing `ThermalHeatmap`

```
UI Layout:
┌──────────────────────────────────────────────────────────┐
│ Sort by: [GA] [Morbidity Score] [ADOS CSS at 36m]        │
│ Time range: [First 28 days] [Full NICU stay]             │
├───────────────────────────────┬──────────────────────────┤
│ CPTd Heatmap                  │ CPTd State Histogram      │
│ X: days of life (0–63)        │ Per-infant stacked bar:   │
│ Y: participants (sorted)      │  % normal | % neg | % high│
│ Color: blue<0, white=1-2, red>2│                          │
│ Markers: ↕ infection onset    │                          │
│          ▲ NEC onset          │                          │
│          × discharge          │                          │
└───────────────────────────────┴──────────────────────────┘
```

**Data source:** `dashboard_data.json → nico.thermal_data.by_participant_day`

#### Route: `/nico/hrc-ecg-features`
**Component:** Existing `HdaTimeline` adapted + new feature matrix

```
UI Layout:
┌──────────────────────────────────────────────────────────┐
│ Participant Selector | Feature Dropdown: [HRC Score ▾]   │
│ Feature options: HRC | RMSSD | RSA | NN Skewness |       │
│                  SAI | PAI | ln_RMSSD | Sample Entropy    │
├──────────────────────────────────────────────────────────┤
│ Time Series: Daily Median of Selected Feature            │
│ X: days of life | Y: feature value                       │
│ Horizontal threshold line for clinical alert (HRC=5)     │
│ Overlaid: morbidity event markers (colored vertical lines)│
├──────────────────────────────────────────────────────────┤
│ 14-Feature ANS Matrix Heatmap                           │
│ X: 24h windows | Y: 14 ANS features                    │
│ Color: z-score relative to cohort median                │
│ Color scale: RdBu diverging (existing: RdBu-BXQ2eJxL)  │
├──────────────────────────────────────────────────────────┤
│ ⭐ Preliminary Finding Callout (amber):                   │
│ "Pilot: r = 0.81, p < 0.01 (HRC Score × SORF at 12m)"  │
│ De-identified aggregate scatter (no PHI)                │
└──────────────────────────────────────────────────────────┘
```

**Data source:** `dashboard_data.json → nico.hrc_scores`, `nico.hri_features`

#### Route: `/nico/aim3-clusters`
**Components:** Existing `CascadeSimulator`, `ClusterOpsPanel`

```
UI Layout:
┌──────────────────────────────────────────────────────┐
│ DBSCAN Parameters Panel (ClusterOpsPanel)            │
│ ε (epsilon): [slider]  min_samples: [input]          │
│ Silhouette Coefficient: X.XX  N clusters: X         │
├────────────────────────┬─────────────────────────────┤
│ t-SNE Scatter          │ Cluster Trajectory Panel     │
│ Color: cluster assign. │ (CascadeSimulator)           │
│ Shape: ADOS CSS sev.  │ Select cluster → show:       │
│ Hover: participant ID  │  SORF 12m, SORF 24m,        │
│        ADOS CSS        │  Bayley Cog, FM, GM, RL, EL │
│        GA at birth     │  (7 subplot trajectory grid)│
│        top SHAP feat.  │  with 95% CI ribbons        │
├────────────────────────┴─────────────────────────────┤
│ Hotelling T² Significance Matrix                     │
│ N×N grid of cluster pairs, color = p-value           │
├──────────────────────────────────────────────────────┤
│ ADOS CSS Distribution per Cluster (violin plots)     │
└──────────────────────────────────────────────────────┘
```

**Data source:** `dashboard_data.json → nico.aim3_clusters`

---

## 6. PART B — BACKEND DATA CONTRACT & PIPELINE

### B1. Extended `dashboard_data.json` Schema

Replace the existing `web/public/dashboard/data/dashboard_data.json` root structure with:

```json
{
  "nano": {
    "study_meta": {
      "award": "R01MH132925",
      "start_date": "2023-07-01",
      "end_date": "2028-06-30",
      "n_target": 200,
      "n_target_asib": 75,
      "n_target_pt": 75,
      "n_target_td": 50,
      "pi": "Jessica Bradshaw, PhD"
    },
    "enrollment": {
      "asib": 0,
      "pt": 0,
      "td": 0,
      "total": 0,
      "last_updated": "",
      "by_ga_stratum": {
        "24_26w": 0,
        "27_29w": 0,
        "30_32w": 0
      }
    },
    "active_followup": {
      "1_3m": 0,
      "6_12m": 0,
      "24_36m": 0
    },
    "ecg_quality": {
      "pct_valid_ecg_by_visit": {},
      "pct_hda_synced_by_visit": {},
      "flagged_participants": []
    },
    "hda_features": {
      "by_participant_visit": []
    },
    "lgcm_results": {
      "pct_sa": {
        "asib_intercept_mean": null,
        "asib_slope_mean": null,
        "pt_intercept_mean": null,
        "pt_slope_mean": null,
        "td_intercept_mean": null,
        "td_slope_mean": null,
        "asib_vs_td_intercept_p": null,
        "asib_vs_td_slope_p": null,
        "pt_vs_td_intercept_p": null,
        "pt_vs_td_slope_p": null,
        "growth_curves": []
      },
      "hr_decel": {},
      "rsa": {}
    },
    "ml_results": {
      "r2_by_outcome": {},
      "shap_values": {},
      "feature_importance": [],
      "ablation_results": [],
      "temporal_importance": {}
    },
    "preliminary_finding": {
      "label": "86% MLP classification accuracy (ASIB vs TD, N=20 pilot)",
      "value": 0.86,
      "type": "accuracy",
      "n": 20,
      "pilot": true
    }
  },
  "nico": {
    "study_meta": {
      "award": "R01MH138028",
      "start_date": "2025-04-01",
      "end_date": "2030-03-31",
      "n_target_enrolled": 260,
      "n_target_completers": 200,
      "n_monthly_target": 12,
      "pi": "Robin Dail, PhD & Jessica Bradshaw, PhD"
    },
    "enrollment": {
      "total_enrolled": 0,
      "in_nicu": 0,
      "discharged": 0,
      "completed_12m": 0,
      "completed_24m": 0,
      "completed_36m": 0,
      "last_updated": ""
    },
    "participants": [],
    "thermal_data": {
      "by_participant_day": [],
      "summary_stats": {}
    },
    "hrc_scores": {
      "by_participant_day": [],
      "alert_threshold": 5
    },
    "hri_features": {
      "by_participant_window": [],
      "feature_names": [
        "hrv", "ln_rmssd", "rsa_cwt", "mean_nn", "sd_nn",
        "nn_skewness", "nn_sample_entropy", "rmssd", "sd1", "sd2",
        "cvnn", "hti", "sai", "pai", "csi", "cvi"
      ]
    },
    "morbidities": {
      "by_participant": [],
      "cohort_rates": {
        "sbi": null, "sep": null, "nec": null,
        "bpd": null, "pda": null, "rop": null
      }
    },
    "followup_visits": {
      "by_participant": []
    },
    "aim1_ml_results": {
      "r2_by_outcome": {},
      "feature_importance": [],
      "shap_values": {},
      "cv_scores": {}
    },
    "aim2_moderation": {
      "main_effects": {},
      "interaction_effects": {},
      "posthoc_by_morbidity": {}
    },
    "aim3_clusters": {
      "cluster_assignments": [],
      "n_clusters": 0,
      "silhouette_score": null,
      "epsilon": null,
      "min_samples": null,
      "tsne_coords": [],
      "trajectory_by_cluster": {},
      "hotelling_t2_matrix": []
    },
    "preliminary_finding": {
      "label": "HRC Score × SORF ASD Symptoms at 12 months (N=20 pilot VPT infants)",
      "r": 0.81,
      "p": 0.01,
      "n": 20,
      "pilot": true,
      "scatter_points": []
    }
  },
  "shared": {
    "data_pipeline_run": {
      "last_success": "",
      "last_error": "",
      "stages_passed": [],
      "record_deltas": {
        "new_participants": 0,
        "new_ecg_windows": 0,
        "new_redcap_entries": 0,
        "new_thermal_days": 0
      },
      "git_sha": ""
    },
    "changelog": []
  }
}
```

### B2. Python Pipeline Extensions

#### `src/data_ingestion/redcap_merge.py` — Add two study-specific pull functions

```python
def pull_nano(redcap_api_url: str, redcap_token: str) -> dict:
    """
    Pull all NANO instruments from REDCap.
    Instruments: enrollment_form, visit_completion_log,
    nnns_attention, csbs_sorf, ados2_css, bayley4,
    asq3, epds, prapare, morbidity_form (PT only), ecg_qa_flags
    Returns: dict keyed by participant_id
    """

def pull_nico(redcap_api_url: str, redcap_token: str) -> dict:
    """
    Pull all NICO instruments from REDCap.
    Instruments: nicu_enrollment, daily_morbidity_log (weekly),
    thermal_qa_log, hero_ecg_download_log, discharge_form,
    virtual_6m_form, 12m_assessment, 24m_assessment, 36m_assessment
    (SORF, ADOS2, Bayley4, PRAPARE)
    Returns: dict keyed by participant_id
    """
```

#### `src/preprocessing/temperature_preprocessing.py` — Extend with full CPTd pipeline

```python
def compute_cptd(abdomen_series: pd.Series, foot_series: pd.Series) -> pd.Series:
    """CPTd = T_abdomen - T_foot, per minute"""

def compute_daily_summary(cptd_series: pd.Series, day: int) -> dict:
    """
    Returns: {
        'day': day,
        'pct_valid': float,      # ≥80% required to include day
        'pct_neg': float,        # CPTd < 0°C
        'pct_high': float,       # CPTd > 2°C
        'median_cptd': float,
        'mean_cptd': float,
        'n_samples': int
    }
    Drop day if pct_valid < 0.80.
    """

def compute_rolling_7day(daily_summaries: list[dict]) -> list[dict]:
    """7-day rolling median_cptd and pct_abnormal"""

def run_nico_pipeline(participant_id: str, datalogger_file: str) -> dict:
    """Full pipeline: load → compute CPTd → daily summaries → rolling stats"""
```

#### `src/preprocessing/hrv_features.py` — Add full 16-feature HRI pipeline for NICO

```python
def preprocess_rr_intervals(rr_series: np.ndarray) -> np.ndarray:
    """
    1. Detect isolated missed beats → interpolate
    2. Reject segments with >5 contiguous missing/edited beats
    3. Drop 1h windows with >10% discarded data
    Returns: cleaned RR intervals with quality flags
    """

def extract_hri_features(rr_clean: np.ndarray, fs: float = 1.0) -> dict:
    """
    Extract all 14+2 ANS features from a 1h window of cleaned R-R intervals.
    Returns: dict with keys matching feature_names in dashboard_data.json schema
    """

def compute_rsa_cwt(rr_clean: np.ndarray, resp_rate_hz: float) -> float:
    """RSA via Continuous Wavelet Transform in respiratory frequency band"""

def compute_sai_pai(rr_clean: np.ndarray) -> tuple[float, float]:
    """Sympathetic Activity Index and Parasympathetic Activity Index"""

def compute_csi_cvi(rr_clean: np.ndarray) -> tuple[float, float]:
    """Cardiac Sympathetic Index and Cardiovagal Index"""

def run_nico_hri_pipeline(participant_id: str, hero_rr_file: str) -> list[dict]:
    """Full pipeline: load R-R → preprocess → extract per 1h window"""
```

#### `src/models/ml_pipeline.py` — Extend with NANO and NICO model functions

```python
# ── NANO Aim 3 ──────────────────────────────────────────────────────
def run_nano_aim3_mlp(features_df: pd.DataFrame, outcomes_df: pd.DataFrame) -> dict:
    """
    MLP regression predicting ADOS-2 CSS from HDA + RSA features.
    Cross-validation: leave-one-subject-out.
    Returns: r2 by outcome, feature_importance, shap_values, ablation_results
    """

def run_nano_aim3_bilstm(rr_timeseries: np.ndarray, outcomes: np.ndarray) -> dict:
    """
    Bi-LSTM on raw IBI time series predicting ASD likelihood.
    Returns: r2, accuracy, confusion matrix
    """

def bootstrap_r2(y_true, y_pred, n=1000, seed=42) -> tuple[float, float, float]:
    """Returns: (r2, ci_lower_95, ci_upper_95)"""

# ── NICO Aim 1 ──────────────────────────────────────────────────────
def build_nico_feature_matrix(hri_windows: list[dict]) -> pd.DataFrame:
    """
    For each of 14 ANS features, compute:
    1st percentile, 50th (median), 99th percentile, IQR, slope vs GA
    Returns: DataFrame with 70 columns (14 features × 5 stats)
    """

def run_nico_aim1_svr(feature_matrix: pd.DataFrame, outcomes_df: pd.DataFrame) -> dict:
    """
    SVR (RBF kernel) predicting ADOS-2 CSS and Bayley-4 subscale scores.
    Nested CV: train=0.70, test=0.15, val=0.15 (subject-level).
    Bonferroni correction across 7 outcomes.
    Returns: r2_by_outcome, feature_importance, shap_values, cv_scores
    """

# ── NICO Aim 3 ──────────────────────────────────────────────────────
def run_nico_aim3_xgboost_shap(
    feature_matrix: pd.DataFrame, ados_css_total: pd.Series
) -> pd.DataFrame:
    """XGBoost + 5-fold CV → SHAP values"""

def run_nico_aim3_dbscan(shap_df: pd.DataFrame) -> dict:
    """
    PCA on SHAP values → DBSCAN clustering.
    Returns: {
        cluster_assignments, silhouette_score, epsilon, min_samples,
        tsne_coords (2D), hotelling_t2_matrix, n_clusters
    }
    Use deterministic seed for reproducibility.
    """
```

#### NEW: `src/models/moderation_analysis.py`

```python
def run_nico_aim2_moderation(
    ans_features: pd.DataFrame,
    morbidity_scores: pd.Series,
    sex: pd.Series,
    outcomes: pd.DataFrame
) -> dict:
    """
    OLS with three-way interaction:
    outcome ~ ANS_feature * Morbidity_Score * Sex + covariates
    
    For each of 5 outcomes: ADOS CSS Total, ADOS CSS Social,
    ADOS CSS RRB, Bayley-4 Cognitive, Bayley-4 Composite
    
    Returns: {
        main_effects: {outcome: {feature: {beta, se, p, ci95}}},
        interaction_effects: {outcome: {interaction_term: {beta, p}}},
        posthoc_by_morbidity: {}  # decompose morbidity index
    }
    
    Apply Bonferroni correction (α = 0.05 / 5 = 0.01) across outcomes.
    """

def prune_multicollinearity(feature_df: pd.DataFrame, threshold: float = 0.85) -> list[str]:
    """
    Hierarchical clustering of correlation matrix.
    Remove features with pairwise |r| > threshold.
    Returns list of retained feature names.
    """

def power_transform_test(feature_df: pd.DataFrame) -> dict:
    """Test linearity assumption per feature; apply Box-Cox if needed"""
```

#### NEW: `scripts/build_dashboard_data.py` — Master Orchestrator

```python
"""
ESD Lab Dashboard Data Build Orchestrator
==========================================
Runs all data ingestion, preprocessing, modeling, and writes dashboard_data.json.
Designed for: cron job / GitHub Actions nightly / Cloudflare Cron Trigger.

Run: python scripts/build_dashboard_data.py [--study NANO|NICO|BOTH] [--dry-run]

STAGE MAP:
  Stage 1:  REDCap pull — NANO instruments
  Stage 2:  REDCap pull — NICO instruments
  Stage 3:  ECG preprocessing — NANO Actiheart → HDA features
  Stage 4:  Temperature preprocessing — NICO datalogger → CPTd summaries
  Stage 5:  HRI extraction — NICO HeRO R-R → 14 ANS features per window
  Stage 6:  NANO Aim 1 LGCM → growth curve results
  Stage 7:  NANO Aim 2 CTMC → Markov transition parameters
  Stage 8:  NANO Aim 3 MLP + bi-LSTM → R², SHAP, ablation
  Stage 9:  NICO Aim 1 SVR → R², feature importance, SHAP
  Stage 10: NICO Aim 2 Moderation → main effects, interactions
  Stage 11: NICO Aim 3 XGBoost + DBSCAN → clusters, t-SNE
  Stage 12: Assemble dashboard_data.json
  Stage 13: Validate schema, write file, log provenance
"""

PROVENANCE_RECORD = {
    "stage": str,
    "timestamp": str,       # ISO 8601
    "n_records_in": int,
    "n_records_out": int,
    "warnings": list[str],
    "git_sha": str,         # subprocess.check_output(["git", "rev-parse", "HEAD"])
    "duration_seconds": float
}

# Rules:
# - Each stage is individually re-runnable (idempotent)
# - On stage failure: log to web/logs/, set shared.data_pipeline_run.last_error
# - Do NOT overwrite last good dashboard_data.json on failure
# - On success: append provenance record to shared.changelog
# - All clustering uses deterministic random seeds (seed=42)
# - Output JSON: sorted keys for byte-identical reruns on same data
```

### B3. Cloudflare Worker Cache-Bust

**File:** `dist/pages-wrapper/_worker.js`

Add response headers for `GET /dashboard/data/dashboard_data.json`:

```javascript
// Add to response handler for dashboard_data.json:
const response = new Response(body, {
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, must-revalidate',
    'ETag': sha256(body),
    'X-Pipeline-Run': env.LAST_PIPELINE_RUN_TIMESTAMP ?? 'unknown'
  }
});
```

---

## 7. PART C — DATA VALIDATION & EXPERT REVIEW

### C1. Extended QA Panel (`/qa` route)

**Files:** `web/src/components/qa/` (existing `EpochTile`, `epochReducer`)

#### NANO QA Rules (add to `epochReducer`)

| Rule ID | Condition | Flag Label | Tier |
|---|---|---|---|
| `NANO_ECG_RSA_FAIL` | `rsa === NaN OR rsa_sd < 0.01` | "RSA extraction failed" | 2 |
| `NANO_HDA_SYNC_DRIFT` | `|ecg_start − video_start| > 500ms` | "Sync drift >500ms" | 1 |
| `NANO_NNNS_INCOMPLETE` | `n_items_scored < 4` | "Incomplete NNNS battery" | 1 |
| `NANO_ADOS_RANGE` | `css_total < 1 OR css_total > 10` | "ADOS CSS out-of-range" | 3 |
| `NANO_GA_STRATUM` | PT participant GA not in {24–26w, 27–29w, 30–32w} | "Invalid GA stratum" | 1 |
| `NANO_EPDS_GAP` | Missing EPDS at 1m or 3m | "Maternal depression data gap" | 1 |

#### NICO QA Rules (add to `epochReducer`)

| Rule ID | Condition | Flag Label | Tier |
|---|---|---|---|
| `NICO_THERMAL_VALIDITY` | `pct_valid_cptd < 0.80` | "Thermal day dropped (<80% valid)" | 2 |
| `NICO_ECG_DISCARD` | `pct_discarded_1h > 0.10` | "ECG window dropped (>10% discarded)" | 2 |
| `NICO_HRC_ALERT` | `daily_median_hrc > 5` | "HRC Clinical Alert — Possible Infection" | 3 |
| `NICO_CPTd_PERSIST_NEG` | `pct_neg_cptd_24h > 0.50` | "High ANS Dysfunction — persistent CPTd<0" | 3 |
| `NICO_EMR_STALE` | `days_since_morbidity_entry > 14` | "Data entry lag — EMR >14 days stale" | 1 |
| `NICO_WARM_HANDOFF` | `hours_post_discharge > 72 AND handoff_not_recorded` | "Warm handoff overdue" | 1 |

**QA Summary Bar (render above EpochTile grid):**
```
NANO: [12 flags / 340 total] | NICO: [8 flags / 180 total]  [Export CSV ↓]
Tier 1: 14  |  Tier 2: 5  |  Tier 3: 1  ← this week
```

**Email/Slack alert stub** (configure in `config/notifications.yaml`):
```yaml
alert_thresholds:
  tier3_flags_per_week: 3
  nico_hrc_alerts_per_day: 2
channels:
  slack_webhook_url: "${SLACK_WEBHOOK_URL}"
  email_recipients: ["rdail@mailbox.sc.edu", "jessica.bradshaw.1@mailbox.sc.edu"]
```

### C2. Expert Review Panel

**New file:** `web/src/components/qa/ExpertReviewPanel.tsx`

**Three-tier review workflow:**

```
Tier 1 (Research Coordinator):
  • ECG sync issues (NANO_HDA_SYNC_DRIFT)
  • Missing REDCap entries (NANO_EPDS_GAP)
  • Morbidity entry lag (NICO_EMR_STALE)
  • Warm handoff overdue (NICO_WARM_HANDOFF)

Tier 2 (Data Manager — Christopher Bush):
  • Thermal data anomalies (NICO_THERMAL_VALIDITY)
  • HRI outliers (NICO_ECG_DISCARD)
  • NANO RSA extraction failures (NANO_ECG_RSA_FAIL)
  • Imputation decisions (when >15% missing in any feature window)

Tier 3 (PI/Co-I: Dail, Bradshaw, OReilly):
  • Clinical: HRC > 5 → possible infection (NICO_HRC_ALERT)
  • Clinical: SORF cutoff exceeded → ASD referral trigger
  • Clinical: Bayley-4 z-score < −2 in any domain → NDI referral
  • Data: ADOS CSS out-of-range (NANO_ADOS_RANGE)
  • Statistical: cluster assignment anomalies
```

**Per-flag review card fields:**
```tsx
interface ReviewItem {
  flag_id: string;
  participant_study_id: string;   // de-identified only, never PHI
  study: 'NANO' | 'NICO';
  tier: 1 | 2 | 3;
  flag_label: string;
  current_values: Record<string, unknown>;
  action: 'pending' | 'approve' | 'reject' | 'request_clarification' | 'refer_to_clinician';
  reviewer_initials: string;
  review_timestamp: string;       // ISO 8601, set on action
  notes: string;
}
```

**Approved items:** Write to `audit_changelog` table (migration `migrations/0004_audit_changelog.sql` already present).

**PI sign-off:** Lock review record with cryptographic timestamp (SHA-256 of record JSON + timestamp + reviewer ID).

### C3. Pipeline Health Panel on Overview

**Component:** Existing `PipelineHealth` (`build/assets/PipelineHealth-Cz3D8NYC.js`)

Render in Overview page below the dual-study hero:

```
┌──────────────────────────────────────────────────────────────┐
│ Data Pipeline Health                       Last run: 2h ago  │
│──────────────────────────────────────────────────────────────│
│ Stage 1: REDCap NANO      ✅  │  Stage 2: REDCap NICO    ✅  │
│ Stage 3: ECG NANO         ✅  │  Stage 4: Thermal NICO   ✅  │
│ Stage 5: HRI Extraction   ✅  │  Stage 6: LGCM NANO      ✅  │
│ Stage 7: CTMC NANO        ⚠️  │  Stage 8: MLP NANO       ✅  │
│ Stage 9: SVR NICO         ✅  │  Stage 10: Moderation    ✅  │
│ Stage 11: DBSCAN NICO     ✅  │  Stage 12: JSON build    ✅  │
│──────────────────────────────────────────────────────────────│
│ +3 new participants   +1,440 ECG windows   +42 REDCap entries│
│ Git SHA: abc1234                                             │
│ Data freshness: ● 2h ago (FRESH)                            │
└──────────────────────────────────────────────────────────────┘
```

**Freshness badge thresholds:** `< 24h` = green (FRESH), `24–72h` = yellow (STALE), `> 72h` = red (CRITICAL)

---

## 8. PART D — AUTOMATION

### D1. GitHub Actions Nightly Workflow

**New file:** `.github/workflows/nightly_dashboard_build.yml`

```yaml
name: Nightly Dashboard Data Build
on:
  schedule:
    - cron: '0 6 * * *'   # 2 AM EDT / 11 PM PDT
  workflow_dispatch:       # Manual trigger

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r requirements.lock
      - name: Run pipeline
        env:
          REDCAP_NANO_TOKEN: ${{ secrets.REDCAP_NANO_TOKEN }}
          REDCAP_NICO_TOKEN: ${{ secrets.REDCAP_NICO_TOKEN }}
          REDCAP_API_URL: ${{ secrets.REDCAP_API_URL }}
        run: python scripts/build_dashboard_data.py --study BOTH
      - name: Commit updated dashboard_data.json
        run: |
          git config user.name "ESD Lab Bot"
          git config user.email "bot@esd-lab"
          git add web/public/dashboard/data/dashboard_data.json
          git add CHANGELOG.md
          git diff --staged --quiet || git commit -m "chore: nightly dashboard data update $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          git push
      - name: Trigger Cloudflare Pages deploy
        run: curl -X POST "${{ secrets.CF_DEPLOY_HOOK }}"
```

**CHANGELOG.md auto-update:** Each pipeline run appends a one-line entry:
```
## 2026-07-01T06:00:12Z — build abc1234
+3 NANO participants, +2 NICO participants, +1440 ECG windows, 0 QA flags
```

---

## 9. PART E — IMPLEMENTATION PHASES

### Phase 1 — Data Contract + Study Selector (Week 1)
1. Extend `dashboard_data.json` schema per Section 6.1
2. Add `StudyFilter` type and study selector to `AppShell` + `uiStore`
3. Update Overview page: dual-study hero panels + NICO preliminary finding card (r=0.81)
4. Wire `PipelineHealth` component to `shared.data_pipeline_run` in JSON
5. Create `scripts/build_dashboard_data.py` skeleton with logging infrastructure
6. Cloudflare Worker cache-bust headers

### Phase 2 — Core Visualizations (Weeks 2–3)
7. Extend Participants page: NANO cohort tags + GA strata + NICO morbidity flag pills
8. Implement `SwimmerPlot` integration for both studies
9. Build `/nico/thermal-heatmap` route using `ThermalHeatmap`
10. Build `/nano/lgcm-trajectories` route using `TrajectoryChart`
11. Extend QA panel with all NANO + NICO validation rules

### Phase 3 — ML Results + Expert Review (Weeks 4–5)
12. Build `/nano/hda-explorer` route with video sync counter
13. Build `/nano/ml-prediction` route with `ShapExplorer` + R² heatmap
14. Build `/nico/hrc-ecg-features` route with ANS matrix heatmap
15. Build `/nico/aim3-clusters` route with t-SNE + DBSCAN panel
16. Implement `ExpertReviewPanel` with 3-tier workflow
17. Wire expert review actions to `audit_changelog` SQL table

### Phase 4 — Backend Pipeline + Automation (Weeks 6–7)
18. Implement all Python pipeline extensions (Sections 6.2)
19. Implement `moderation_analysis.py`
20. Full `build_dashboard_data.py` orchestrator with provenance
21. GitHub Actions nightly workflow + CHANGELOG.md auto-update
22. Alert stub (Slack/email) for Tier 3 flags

### Phase 5 — Polish + Hardening (Week 8)
23. TypeScript strict-mode audit: no `any` in new component props
24. Full test pass: each new route has `*.test.tsx` (render + empty state + label accuracy)
25. Dark mode audit (extend `darkModeSurfaceGuard.test.ts`)
26. Accessibility pass: ARIA labels, keyboard navigation for all new components
27. PHI scrub audit: run `src/utils/hipaa_utils.py` on all new data paths

---

## 10. HARD CONSTRAINTS — NEVER VIOLATE

| # | Constraint | Detail |
|---|---|---|
| 1 | **HIPAA compliance** | All participant displays use de-identified study IDs only. No names, DOBs, MRNs anywhere in the UI. `HipaaBanner` must remain visible on all clinical data pages. Reference `src/utils/hipaa_utils.py`. |
| 2 | **Adjusted age** | All PT (NANO) and VPT (NICO) developmental scores displayed in **corrected/adjusted age**, never chronological age. |
| 3 | **No hardcoded data** | All counts, scores, statistics driven from `dashboard_data.json`. Zero numeric literals in TSX files representing study data. |
| 4 | **Idempotent pipeline** | Re-running build on the same data produces byte-identical JSON (sort keys, deterministic clustering seed=42). |
| 5 | **TypeScript strict** | All new `.tsx`/`.ts` files pass `tsc --strict`. No `any` types in new component props. |
| 6 | **Test coverage** | Every new route has a `*.test.tsx` covering: renders without crash, handles empty data state, label text matches protocol values. |
| 7 | **Study separation** | NANO and NICO are never conflated. Different cohorts, devices, timelines, analytic methods. Side-by-side only in BOTH mode with explicit study labels. |
| 8 | **No PHI in preliminary scatter** | The r=0.81 NICO scatter plot uses only de-identified aggregate data points. No participant-identifiable information. |
| 9 | **Failure safety** | Pipeline build failure must NOT overwrite last good `dashboard_data.json`. Write to temp file, validate schema, then atomic rename. |
| 10 | **Preliminary data labeling** | All charts/cards derived from pilot data (N=20 NICO, NANO prelim) must carry a visible "Preliminary — Pilot Data" badge. |

---

## 11. SIDEBAR NAVIGATION MAP

After full implementation, the sidebar should contain:

```
ESD Lab [Study: NANO | NICO | BOTH]
─────────────────────────────
  Overview           /
  Participants       /participants

─── NANO Studies ───────────────
  HDA Explorer       /nano/hda-explorer
  LGCM Trajectories  /nano/lgcm-trajectories
  ML Prediction      /nano/ml-prediction

─── NICO Studies ───────────────
  Thermal Heatmap    /nico/thermal-heatmap
  HRC + ECG Features /nico/hrc-ecg-features
  Aim 3 Clusters     /nico/aim3-clusters

─── Data & Pipeline ────────────
  REDCap Status      /redcap
  QA Panel           /qa
  Expert Review      /qa/expert-review
  Pipeline Health    /pipeline
  Runs               /runs

─── Resources ──────────────────
  Publications       /publications
  Guided Explorer    /explorer
  Docs               /docs
```

---

## 12. DESIGN SYSTEM REFERENCE

Use existing tokens in `web/src/styles/tokens.css`. Do not introduce new design tokens for new components. Color assignments:

| Study / Cohort | Token / Hex |
|---|---|
| NANO — ASIB | `--color-amber-500` (#F59E0B) |
| NANO — PT | `--color-teal-500` (#14B8A6) |
| NANO — TD | `--color-indigo-500` (#6366F1) |
| NICO — VPT | `--color-cyan-500` (#06B6D4) |
| Preliminary finding card | `bg-amber-50 border-amber-400 text-amber-900` |
| CPTd negative (cold) | `#3B82F6` (blue-500) |
| CPTd normal | `#FFFFFF` (white) |
| CPTd high (stress) | `#EF4444` (red-500) |
| HRC Alert > 5 | `#EF4444` (red-500) |
| Data freshness: FRESH | `#22C55E` (green-500) |
| Data freshness: STALE | `#EAB308` (yellow-500) |
| Data freshness: CRITICAL | `#EF4444` (red-500) |

---

*End of ESD Lab USC Master Dashboard Implementation Prompt.*  
*Document version: 1.0 | Generated: July 2026 | Studies: NANO (R01MH132925) + NICO (R01MH138028)*
