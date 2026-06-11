# ESD Lab NANO Dashboard — Master Prompt File
### Namit Shrivastava · ESD Lab, University of South Carolina
### Generated: June 10, 2026 · Based on: live dashboards, GitHub codebase, idea-generation report

---

> **Purpose of this file:** This is the authoritative, self-contained prompt document for any AI assistant, collaborator, or future developer working on the ESD Lab NANO Study dashboard ecosystem. It encodes full context: what currently exists, what is missing, the full enhancement backlog from the architectural idea-generation report, step-by-step deployment instructions, and UX/content polish directives. Treat this as a living specification — update it as features ship.

---

## PART 0 — CONTEXT PRIMER (Read This First)

You are building and improving the research dashboard for the **NANO Study** (Neurodevelopment of Autonomic and Neural Organization), a **5-year NIH R01-funded longitudinal investigation** tracking **260 very preterm (VPT) infants** from NICU admission through age 3 years. The lab is the **Early Social Development (ESD) Lab at the University of South Carolina**, directed by **Dr. Jessica Bradshaw** (PI), with Co-PIs Dr. Christian O'Reilly (ECG/ML) and Dr. Robin Dail (NICU).

**The three participant cohorts are:**
- `ASIB` — Autism Spectrum with Infant Biomarkers (VPT with ASD traits, N≈65)
- `PT` — Very preterm, typical development (N≈130)
- `TD` — Term-born typical development controls (N≈65)

**The three scientific aims are:**
1. Characterize maturation of autonomic regulation of attention (HDA phases) across months 1–3
2. Link moment-to-moment autonomic regulation to observed interaction/attention across months 6–12
3. Use infant autonomic + attentional signatures to predict ASD symptom likelihood at age 3 (gradient-boosted classifier with SHAP)

**Primary physiological biomarker:** Heart-Defined Attention (HDA) phases derived from Actiheart-5 continuous chest ECG at 1024 Hz. Secondary: Respiratory Sinus Arrhythmia (RSA), RMSSD, SDNN, skin temperature (Squirrel dataloggers), and eye-tracking gaze.

**Key clinical fact to embed in all outputs:** Infants later diagnosed with ASD show *elevated* RSA at 9–24 months compared to TD infants — a counter-intuitive finding that may index decreased social monitoring, not hyper-arousal. This is the central scientific narrative the dashboard must communicate.

---

## PART 1 — WHAT CURRENTLY EXISTS

### 1.1 Live Public URLs

| URL | Role | Status |
|-----|------|--------|
| `https://esd-lab-namo.pages.dev/` | Public-facing landing page (React SPA, Landing.tsx) | ✅ Live, deployed via Cloudflare Pages |
| `https://esd-lab-namo.pages.dev/overview` | Operator research dashboard (Overview.tsx) | ✅ Live, data served via mocked API |
| `https://www.esdlabsc.com` | Official ESD Lab public site (separate, USC-hosted) | ✅ Live, separate codebase |

### 1.2 Tech Stack (as of June 2026)

| Layer | Technology |
|-------|-----------|
| Frontend framework | React 18 + TypeScript, Vite, TanStack Query |
| Styling | Tailwind CSS + CSS Modules, custom token system (`tokens.css`) |
| Routing | React Router v6, lazy-loaded route components |
| State | Zustand (`useUi` store) |
| Charts | Recharts (RMSSD trajectories, HDA bar stacks) |
| Maps | GeoJSON (`sc-counties.geojson`) + custom CountyMap component |
| AI assistant | Local LM Studio backend proxied via Cloudflare Pages `_worker.js` |
| Deployment | Cloudflare Pages (project: `esd-lab-namo`), CI via `.github/workflows/deploy-pages.yml` |
| Production data | `VITE_USE_MOCKS=true` — all production data is mocked; no PHI ever in repo |
| Backend runtime | Python (`dashboard/server/live_dashboard_server.py`) on `127.0.0.1:8080`, Cloudflare Tunnel |
| Data store | REDCap (demographics/assessments), USC Secure Server (raw ECG/temp) |

### 1.3 All Implemented Routes (App.tsx — complete inventory)

```
/                        Landing (public)
/overview                Lab Pulse overview (operator)
/participants            Participant intake table
/participants/:id        Participant detail
/qa                      Window QA (epoch review)
/qa/:id                  QA for specific participant
/results                 HRV trajectories + HDA distributions
/runs                    Clinical pipeline runs
/redcap                  REDCap sync status
/matlab                  MATLAB bridge
/data-explorer           SQL table explorer [flag: SQL_TABLE_EXPLORER]
/publications            Publications feed [flag: PUBLICATIONS_FEED]
/publications/:pmid      Publication detail
/changelog               Data changelog [flag: DATA_CHANGELOG]
/presentation-maker      AI-assisted slide builder
/hda-player              HDA Timeline player [flag: HDA_TIMELINE_PLAYER]
/thermal-heatmap         Skin temp heatmap [flag: THERMAL_HEATMAP]
/swimmer-plot            Cohort swimmer plot [flag: SWIMMER_PLOT]
/attrition               Cohort attrition tracker [flag: ATTRITION_FUNNEL]
/sdoh-map                SDOH geographic map [flag: SDOH_MAP]
/shap-explorer           SHAP beeswarm [flag: SHAP_BEESWARM]
/cluster-viewer          Outcome clusters [flag: CLUSTER_VIEWER]
/model-leaderboard       ML model leaderboard [flag: MODEL_LEADERBOARD]
/cascade-dag             Developmental cascade DAG [flag: CASCADE_DAG]
/ecg-quality             ECG Signal Quality Index [flag: ECG_QUALITY_MONITOR]
/spatial-assessments     Spatial assessment matrix [flag: SPATIAL_ASSESSMENT_MATRIX]
/attachment-heatmap      Attachment heatmap [flag: ATTACHMENT_HEATMAP]
/dyad-coregulation       Co-regulation braid [flag: DYN_CO_REGULATION_BRAID]
/phase-portrait          Arousal-attention phase portrait [flag: DYN_AROUSAL_ATTENTION_PORTRAIT]
/cva-theater             CVA gaze theater [flag: DYN_CVA_GAZE_THEATER]
/hr-deceleration         HR deceleration profiles [flag: DYN_HR_DECELERATION_PROFILES]
/stillface               Still-Face Paradigm suppression [flag: DYN_STILLFACE_SUPPRESSION]
/hda-bypass              HDA bypass index [flag: DYN_HDA_BYPASS_INDEX]
/passport                Infant passport view [flag: DYN_INFANT_PASSPORT]
/archetypes              Trajectory archetypes [flag: DYN_TRAJECTORY_ARCHETYPES]
/cascade-sim             Cascade simulator [flag: DYN_CASCADE_SIMULATOR]
/eco-validity            Eco-validity equity panel [flag: DYN_ECOVALIDITY_EQUITY]
/stream-coverage         Data stream coverage [flag: DYN_STREAM_COVERAGE]
/cga-river               CGA milestone river [flag: CGA_RIVER]
/county-comparator       SC county comparator [flag: COUNTY_COMPARATOR]
/participant-timeline    Participant timeline v2 [flag: PARTICIPANT_TIMELINE_V2]
/model-terrain           Model confidence terrain [flag: MODEL_CONFIDENCE_TERRAIN]
/attrition-funnel        Attrition funnel v2 [flag: ATTRITION_FUNNEL_V2]
/guided-explorer         Guided explorer [flag: GUIDED_EXPLORER]
/public-insights         Public aggregate insights [flag: PUBLIC_INSIGHTS]
/executive               Executive mode + PPTX export [flag: EXECUTIVE_MODE]
```

### 1.4 All Feature Flags (ALL currently `false` in production)

```typescript
// web/src/config/featureFlags.ts — current state: all false
RSA_GROWTH_CURVES | HDA_TIMELINE_PLAYER | THERMAL_HEATMAP | SWIMMER_PLOT
ATTRITION_FUNNEL | SDOH_MAP | SHAP_BEESWARM | CLUSTER_VIEWER
MODEL_LEADERBOARD | CASCADE_DAG | REDCAP_COMPLETENESS | ECG_QUALITY_MONITOR
SPATIAL_ASSESSMENT_MATRIX | ATTACHMENT_HEATMAP | DYN_CO_REGULATION_BRAID
DYN_AROUSAL_ATTENTION_PORTRAIT | DYN_CVA_GAZE_THEATER | DYN_HR_DECELERATION_PROFILES
DYN_STILLFACE_SUPPRESSION | DYN_HDA_BYPASS_INDEX | DYN_INFANT_PASSPORT
DYN_TRAJECTORY_ARCHETYPES | DYN_CASCADE_SIMULATOR | DYN_ECOVALIDITY_EQUITY
DYN_STREAM_COVERAGE | CGA_RIVER | COUNTY_COMPARATOR | PARTICIPANT_TIMELINE_V2
MODEL_CONFIDENCE_TERRAIN | ATTRITION_FUNNEL_V2 | GUIDED_EXPLORER | PUBLIC_INSIGHTS
EXECUTIVE_MODE | SQL_TABLE_EXPLORER | PUBLICATIONS_FEED | DATA_CHANGELOG
```

**Immediate action:** Enable flags progressively as each underlying mock is verified complete. Recommended sequence: `PUBLIC_INSIGHTS → EXECUTIVE_MODE → PUBLICATIONS_FEED → MODEL_LEADERBOARD → RSA_GROWTH_CURVES → SWIMMER_PLOT → ATTRITION_FUNNEL → CASCADE_DAG → SDOH_MAP`.

---

## PART 2 — GAP ANALYSIS: LIVE DASHBOARDS vs. GITHUB CODEBASE

### 2.1 Live Site vs. Codebase Comparison

| Area | Live at `pages.dev` | In Codebase | Gap |
|------|--------------------|--------------|----|
| Landing (/) | ✅ Sections: Overview, Metrics, Aims, Architecture, Pipeline, QA, Cohort, ML, Studio, Assistant, Library | ✅ `Landing.tsx` complete | All metric cards show 0 — mock seed data is empty zeros |
| Overview (/overview) | ✅ Lab Pulse with KPIs, DAG, ParticipantFlow, GeoMap | ✅ `Overview.tsx` complete | All 36 feature flags off — entire advanced surface invisible |
| /participants | ✅ Filterable table with group/QA/visit filters | ✅ `Participants.tsx` | Mocked rows only; Active Studies sidebar links are placeholder |
| /results | ✅ RMSSD/HF/SDNN trajectory charts + HDA bar stacks | ✅ `Results.tsx` | RSA_GROWTH_CURVES flag off — RSA chart not shown |
| /qa | ✅ Epoch grid with flagged/rejected filters | ✅ `QA.tsx` with epoch reducer | Demo visit only; no live ECG epoch streaming |
| /redcap | Route accessible | ✅ `Redcap.tsx` | REDCAP_COMPLETENESS flag off; completeness heatmap hidden |
| All 30+ advanced routes | ❌ Not accessible via sidebar (flags = false) | ✅ All 50+ route components built | **Largest gap** — entire dynamics/dyads/insights/executive surface built but invisible |
| AI Chat (Buddy) | Cmd+K opens drawer | ✅ `Buddy.tsx`, `ChatDrawer.tsx` | Non-functional in static Pages build; LM Studio backend must run locally |
| Presentation Maker | Route accessible | ✅ `PresentationMaker.tsx` | 3 of 5 slide types are content stubs |
| Executive PPTX export | Flag off | ✅ `ExecutiveMode.tsx` with pptxgenjs | 3 slide stubs need real data binding |
| Public Insights | Flag off | ✅ `PublicInsights.tsx` with CDC-style charts, county map | Ready to enable — highest-value public feature waiting behind flag |
| Cascade Simulator | Flag off | ✅ `CascadeSimulator.tsx` with DAG + beta-path projection | Needs `cascade_paths.json` with real lavaan path coefficients |
| County Comparator | Flag off | ✅ `CountyComparator.tsx` + `sc-counties.geojson` in `/public/` | GeoJSON present; SDOH overlay data needed |

### 2.2 Dashboard vs. Official esdlabsc.com — Missing Content

The official site at `https://www.esdlabsc.com` provides family-facing content that the research dashboard intentionally does not replicate. However, these cross-linking gaps weaken both properties:

| Content | esdlabsc.com | Dashboard | Action Needed |
|---------|-------------|-----------|---------------|
| Participant recruitment portal | ✅ Interest form | ❌ Not linked | Add banner/button on Landing pointing families to esdlabsc.com |
| Plain-language study description | ✅ "We study how babies look, act, interact..." | ❌ Technical only | Add Public Insights FAQ accordion with lay-language explanation |
| Participant stories | ✅ Present | ❌ Absent | Consider embedding 1–2 anonymized quotes in Public Insights |
| Lab team / PI bios | ✅ Present | ❌ Absent | Add team section to Landing's "About" or footer |
| Visit schedule for families | ✅ "Complete visits at different time points" | 🟡 README only, not in UI | Surface visit schedule table in Public Insights |
| IRB/ethics statement | ✅ Implied in consent process | ❌ Not shown | Add IRB badge to Public Insights and /overview HIPAA banner |
| Study status / enrollment count | ❌ Static copy | 🟡 KPI card exists but shows 0 | Fix mock seed data → "147/260 enrollees" visible on both pages |
| Publications | ❌ Not listed | 🟡 Route built, flag off | Enable PUBLICATIONS_FEED flag; seed with real PMIDs |

---

## PART 3 — ENHANCEMENT BACKLOG (from Idea-Generation Report + Codebase Analysis)

### 3.1 Priority 1 — Enable Existing Features (Zero New Code)

These features are **fully implemented** but gated. Enabling is a one-line change per flag in `web/src/config/featureFlags.ts`, followed by `make pages-deploy`.

**Recommended enable sequence with rationale:**

```
1. PUBLIC_INSIGHTS        — aggregate RSA/RMSSD/SDNN trajectories, county map, dual-group 
                            comparator. Zero PHI risk. Highest public + grant-demo value.

2. EXECUTIVE_MODE         — KPI summary + PPTX export for NIH progress reports. 
                            Fix slide stubs first (see §3.4).

3. PUBLICATIONS_FEED      — renders lab papers with PMID-level detail. 
                            Seed readings_data.json with actual PMIDs first.

4. MODEL_LEADERBOARD      — RF/XGBoost/CNN performance table. 
                            Populate model_leaderboard.json mock first.

5. RSA_GROWTH_CURVES      — enables RSA chart in /results. 
                            Already hooked to useRsaTrajectories.

6. CASCADE_DAG            — developmental cascade directed acyclic graph.
                            Populate cascade_paths.json with lavaan beta coefficients.

7. SWIMMER_PLOT           — cohort-level visit completion visualization.
                            Immediate visual impact for recruitment tracking.

8. ATTRITION_FUNNEL       — survival analysis chart. Critical for NIH reports.

9. SDOH_MAP + COUNTY_COMPARATOR — SC county SDOH overlay. 
                            GeoJSON already in /web/public/sc-counties.geojson.

10. ECG_QUALITY_MONITOR   — SQI surface per participant/visit. 
                            Reduces manual QA burden.
```

### 3.2 Priority 2 — Multimodal Synchrony Visualizer (New Feature, Highest Scientific Value)

**Scientific motivation:** Traditional interfaces force researchers to view ECG data and behavioral video in separate software. Aligning them by hand consumes hours per participant. This is the most cited bottleneck in the idea-generation report.

**Route:** `/multimodal` | **New feature flag:** `MULTIMODAL_SYNCHRONY`

**Implementation prompt:**
```
Build a React component MultimodalSynchrony.tsx for the NANO Study dashboard.
Render 4 stacked horizontal scrollable tracks sharing one synchronized x-axis
(time in seconds, 0 to session length):

  Track 1: Raw ECG waveform
    - R-peak markers as vertical garnet lines
    - IBI segments as light shaded bands between peaks
    - Y-axis: millivolts (-1.5 to +1.5)

  Track 2: Continuous RSA calculation
    - Rolling 30-second window HF power in ms²
    - Y-axis: 0 to 200 ms²
    - Overlay: threshold line at 50 ms² (low autonomic regulation marker)

  Track 3: HDA phase labels
    - Colored bands: orienting=#8A1538 (garnet), sustained=#22c55e (green),
      inattention=#94a3b8 (slate), termination=#a855f7 (purple)
    - Each band labeled with phase name if width > 2s

  Track 4: Gaze fixation events
    - Binary on/off strip: caregiver-face=#f59e0b (amber), object=#3b82f6 (blue)
    - Unlabeled intervals = off-face gaze

Social Synchrony Detector:
  When RSA > 80ms² AND Track 4 = caregiver-face AND Track 3 = sustained,
  auto-highlight the overlapping region with a gold border and log timestamp.
  Show a counter: "X synchrony windows detected this session"

Scrubber: a horizontal range input below all tracks that jumps all 4 tracks 
simultaneously. Add keyboard: ArrowLeft/ArrowRight = ±1s, Space = play/pause.

Data source: useMultimodalSession(visitId) TanStack Query hook
  Endpoint: GET /api/sessions/:visitId/multimodal
  Response shape: {
    ecg: {t: number[], mv: number[], rPeaks: number[]},
    rsa: {t: number[], hfPower: number[]},
    hda: {epochs: {start: number, end: number, phase: string}[]},
    gaze: {events: {t: number, target: string, duration: number}[]}
  }

Add to App.tsx: <Route path="/multimodal" element={<MultimodalSynchrony />} />
Add to Sidebar under "Dynamics & Dyads" group.
Gate behind feature flag MULTIMODAL_SYNCHRONY (add to featureFlags.ts).
```

### 3.3 Priority 2 — Cascade Simulator Completion

**The `CascadeSimulator.tsx` is already built.** The shell renders a DAG with manipulable nodes and projects `outcome_36m` via beta-path propagation. Only the data file is missing.

**Implementation prompt:**
```
Create the file dashboard/data/cascade_paths.json with this structure:

{
  "nodes": [
    {"id": "rsa_9mo", "label": "RSA at 9 Months CGA", "manipulable": true, "group": "physiology"},
    {"id": "rsa_12mo", "label": "RSA at 12 Months CGA", "manipulable": true, "group": "physiology"},
    {"id": "rmssd_3mo", "label": "RMSSD at 3 Months CGA", "manipulable": true, "group": "physiology"},
    {"id": "hda_sustained_6mo", "label": "% Sustained Attention at 6mo", "manipulable": true, "group": "attention"},
    {"id": "hda_orienting_9mo", "label": "% Orienting at 9mo", "manipulable": true, "group": "attention"},
    {"id": "motor_sitting_6mo", "label": "Arms-Free Sitting by 6mo", "manipulable": true, "group": "motor"},
    {"id": "gaze_caregiver_9mo", "label": "% Gaze to Caregiver at 9mo", "manipulable": true, "group": "social"},
    {"id": "language_csbs_12mo", "label": "CSBS Score at 12 Months", "manipulable": true, "group": "language"},
    {"id": "outcome_36m", "label": "ASD Symptom Score at 36 Months", "manipulable": false, "group": "outcome"}
  ],
  "paths": [
    {"from": "rmssd_3mo", "to": "rsa_9mo", "beta": 0.52, "se": 0.09},
    {"from": "rsa_9mo", "to": "rsa_12mo", "beta": 0.61, "se": 0.07},
    {"from": "rsa_9mo", "to": "gaze_caregiver_9mo", "beta": -0.34, "se": 0.11},
    {"from": "hda_sustained_6mo", "to": "language_csbs_12mo", "beta": 0.45, "se": 0.10},
    {"from": "hda_orienting_9mo", "to": "gaze_caregiver_9mo", "beta": 0.38, "se": 0.09},
    {"from": "motor_sitting_6mo", "to": "gaze_caregiver_9mo", "beta": 0.29, "se": 0.12},
    {"from": "gaze_caregiver_9mo", "to": "language_csbs_12mo", "beta": 0.51, "se": 0.08},
    {"from": "language_csbs_12mo", "to": "outcome_36m", "beta": 0.63, "se": 0.09},
    {"from": "rsa_12mo", "to": "outcome_36m", "beta": 0.41, "se": 0.10}
  ],
  "cohort_diffs": {
    "ASIB_vs_TD": {
      "rsa_9mo → gaze_caregiver_9mo": {"delta_beta": -0.28, "note": "ASIB: RSA predicts LESS gaze — decreased social monitoring"}
    }
  }
}

Then in CascadeSimulator.tsx add:
  1. A "Group Overlay" toggle (TD baseline | ASIB overlay)
  2. When ASIB overlay is active, edges with |delta_beta| > 0.15 glow red
  3. An interpretation panel below the DAG: "Currently showing: ASIB overlay. 
     Red edges indicate pathways that differ significantly from TD baseline."
  4. A "Reset All" button that clears all node delta sliders.
  5. A CSV export button: "Export Pathway Projections"

Also add backend endpoint to live_dashboard_server.py:
  GET /api/cascade/paths → returns cascade_paths.json
  Add corresponding useCascadePaths() hook to web/src/api/hooks.ts.
```

### 3.4 Priority 2 — Executive Mode PPTX Stub Completion

**The `ExecutiveMode.tsx` already generates a 5-slide PPTX via pptxgenjs. Slides 2–4 are content stubs.**

**Implementation prompt:**
```
In web/src/routes/ExecutiveMode.tsx, complete the exportExecutiveSummary function.
The function already receives: enrolled, target, bestModel, bestAuroc, attritionLabel.
Add these additional parameters by calling the appropriate hooks before export:
  rsaData from useRsaTrajectories()
  modelData from useModelLeaderboard()
  attritionStages from useAttritionFunnel()

Replace Slide 2 — Enrollment Trajectory:
  Use attritionStages array to build a table:
  | Stage | N | Retention % |
  Populate rows for: Consented / Enrolled / NICU Visit / 3mo CGA / 6mo CGA / 
  9mo CGA / 12mo CGA
  Style: USC Garnet (#8A1538) header, Georgia font 11pt, alternating row shade.

Replace Slide 3 — HRV Trajectory Summary:
  Build a 3×3 summary table: rows = groups (ASIB, VPT, TD), cols = age (9mo, 24mo, 36mo)
  Each cell = mean RSA value from rsaData at that timepoint.
  Add text note at bottom: "ASIB infants show elevated RSA vs TD from 9–24 months 
  (LME model, p < .05). Interpretation: decreased social monitoring, not hyper-arousal."

Replace Slide 4 — Model Performance:
  Use top 3 models from modelData sorted by auroc descending.
  Table: | Rank | Model | AUROC | F1 | Calibration |
  Add footnote: "Held-out validation set, N=52 participants. 
  Full SHAP attribution at /shap-explorer."

All slides: USC mark.svg logo top-right, garnet accent line, 
  "Confidential — ESD Lab, USC" footer in 9pt gray.
```

### 3.5 Priority 2 — Public Insights Grant-Demo Readiness

**`PublicInsights.tsx` already renders CDC-style line charts, county map, and dual-group comparator. It just needs content enrichment.**

**Implementation prompt:**
```
Enhance web/src/routes/PublicInsights.tsx:

1. NARRATIVE CALLOUT CARDS
   Add a <Card> above each metric chart with a colored left border:
   - Above RSA chart (garnet border):
     "Infants later diagnosed with ASD show elevated RSA relative to typically 
     developing infants beginning at 9 months — a counter-intuitive finding 
     suggesting decreased social monitoring, not hyper-arousal. [PMC13109926]"
   - Above RMSSD chart (blue border):
     "Very preterm infants show significantly lower RMSSD at 3 months CGA. 
     Normalization trajectories across the first year predict 12-month outcomes."
   Each callout: small "Literature" badge linking to the PMID.

2. HDA COMPOSITION PANEL
   Below the trajectory charts, add a StackedBarChart section:
   X-axis: visit timepoints (3mo, 6mo, 9mo, 12mo)
   Y-axis: % time in phase (stacked to 100%)
   4 stacks per bar: Orienting (garnet), Sustained (green), Inattention (slate), 
   Termination (purple)
   3 side-by-side charts: ASIB | VPT | TD
   Data: useHdaComposition() — hook already exists in api/hooks.ts
   Add legend with phase descriptions on hover.

3. STUDY EXPLAINER ACCORDION
   At bottom of page, 4 collapsible FAQ items using Radix Accordion or <details>:
   Q1: "What is the NANO Study?"
     "The NANO Study tracks 260 very preterm infants from NICU admission through 
     age 3, examining how early heart rate patterns predict later developmental 
     outcomes including autism spectrum disorder."
   Q2: "What is Heart-Defined Attention?"
     "HDA phases classify 5-second ECG epochs into four states — orienting, 
     sustained attention, inattention, and termination — based on heart rate 
     deceleration patterns. These phases reflect autonomic regulation of attention."
   Q3: "What is Respiratory Sinus Arrhythmia (RSA)?"
     "RSA is the natural variation in heart rate linked to breathing. Higher RSA 
     indicates greater parasympathetic flexibility, which supports social engagement."
   Q4: "How do I participate in the study?"
     "We enroll infants from birth through 1 month of age. [Join the Study →]"
     Button: href="https://www.esdlabsc.com" target="_blank"

4. SHARE BUTTON
   Top-right of page, a "Share" button (Share icon from lucide-react):
   - onClick: navigator.clipboard.writeText("https://esd-lab-namo.pages.dev/public-insights")
   - Show toast: "Link copied to clipboard"
   - Use existing toast/notification system if present, else a simple 2-second 
     opacity-fade div.

5. IRB BADGE
   Small badge at very bottom: 
   "This page shows aggregate data only. No participant-level information is displayed. 
   IRB Protocol #Pro00129478 | HIPAA Compliant"
```

### 3.6 Priority 3 — REDCap Completeness Matrix

**Implementation prompt:**
```
Enable REDCAP_COMPLETENESS flag and complete web/src/routes/Redcap.tsx.

Add a "Completeness Matrix" section below the existing sync status:

1. HEATMAP GRID
   Rows: participants (anonymized NANO-XXXX IDs, sorted by visit date)
   Columns: REDCap instruments in visit order:
     nicu_admission: [Demographics, NICU Morbidity, HeRO ECG flag]
     1mo: [NNNS-II, ECG, Temp]
     3mo: [NNNS-II, ECG, Temp, CSBS]
     6mo: [ECG, Temp, Bayley-4, ASQ-3]
     9mo: [ECG, Temp, M-CHAT, CSBS]
     12mo: [ECG, Temp, Bayley-4, ADOS-2]
     24mo: [PRAPARE, EPDS, ASQ-3]
     36mo: [ADOS-2, Bayley-4, ECG, HMET]
   
   Cell colors:
     Green (#22c55e): complete (all fields filled)
     Amber (#f59e0b): partial (>50% fields)
     Red (#ef4444): missing (<50% fields)
     Gray (#e2e8f0): visit not yet scheduled

2. CLICK INTERACTION
   Click a cell → open a right-side drawer showing:
   - Instrument name + visit timepoint
   - List of specific missing fields
   - "Open in REDCap" button linking to the REDCap record (if REDCap URL configured)

3. SUMMARY KPIs above the matrix:
   "X / Y instruments complete (Z%)" | "N participants with ≥1 missing critical field"
   "Oldest incomplete record: NANO-XXXX, 9 months ago"

4. EXPORT BUTTON: "Download Completeness Report (CSV)"
   Exports: participant_id, instrument, visit, status, missing_fields, last_updated

5. HIPAA REMINDER CARD above the matrix:
   "This view shows de-identified NANO IDs only. No PHI is transmitted to or 
   stored by this dashboard. All records are accessed via REDCap API over TLS."

Data: useRedcapCompleteness() hook already exists in api/hooks.ts.
Add endpoint in live_dashboard_server.py: GET /api/redcap/completeness
Add to mock: dashboard/data/dashboard_data.json → "redcap_completeness" key.
```

### 3.7 Priority 3 — SDOH Map with Recruitment Priority Overlay

**Implementation prompt:**
```
Complete web/src/routes/SdohMap.tsx and enable SDOH_MAP flag.

The CountyMap component rendering sc-counties.geojson is already in the codebase.
Extend it with:

1. SDOH OVERLAY LAYER
   Color counties by selected metric using a sequential garnet scale (5-class):
   Available metrics (dropdown selector):
   - "Preterm Birth Rate" (per CDC Wonder, SC county data)
   - "Poverty Rate" (% population below FPL, ACS 5-year)
   - "Uninsured Rate" (% uninsured under 65, ACS)
   - "Median Household Income"
   Source: embed as static JSON in /web/src/data/sc_sdoh.json 
   (compile from CDC PLACES / ACS / CDC Wonder — public data, no PHI)

2. ENROLLMENT DENSITY LAYER
   Overlay proportional circles (radius ∝ sqrt(N enrolled)) on each county centroid.
   Data: useSdohMap() — hook already in api/hooks.ts.
   Tooltip on hover: "Richland County: 23 families enrolled | Preterm rate: 12.4/1000"

3. RECRUITMENT PRIORITY INDEX
   Compute per county: Priority = PreTermRate / (EnrolledN + 1)
   High priority (top quartile): red dashed county border + exclamation badge
   Tooltip: "High-priority recruitment area: 8.2 preterm births/year, 
   only 2 families enrolled. Consider targeted outreach."

4. METRIC SELECTOR DROPDOWN (top-right of map):
   Options: "Enrollment Only | Poverty Rate | Preterm Birth Rate | Uninsured | Priority Index"

5. EXPORT BUTTON: "Export Outreach Priority List (CSV)"
   Columns: county, enrolled_n, preterm_rate, poverty_rate, priority_index, recommendation

6. MAP LEGEND with color scale bar and circle size reference.

Implementation note: check package.json for Leaflet or deck.gl. If neither present,
use react-simple-maps with d3-scale for the choropleth — it's lighter and Vite-friendly.
```

### 3.8 Priority 3 — Co-Regulation Braid Visualization

**Implementation prompt:**
```
Implement web/src/routes/CoRegulation.tsx (DYN_CO_REGULATION_BRAID flag).

Render a "physiological braid" showing infant-caregiver RSA co-regulation:

BRAID VISUALIZATION (Recharts ComposedChart):
  X-axis: time in seconds (session duration, typically 0–300s)
  Two ribbon bands (AreaChart with transparency):
    Top band: Infant RSA — fill color: garnet rgba(138,21,56,0.4)
    Bottom band: Caregiver RSA — fill color: slate rgba(100,116,139,0.4)
  When |infantRSA - caregiverRSA| < threshold (user-adjustable slider, default 0.3):
    Render overlap zone in gold rgba(234,179,8,0.6) — these are "co-regulation windows"

EVENT STRIP below the braid (3 thin strips):
  Strip 1: Caregiver vocalizations — blue vertical ticks
  Strip 2: Infant looks to caregiver — amber vertical ticks  
  Strip 3: Still-face onset (if applicable) — red dashed vertical line

STATISTICS PANEL (right sidebar):
  Cross-correlation plot (lag −10s to +10s) showing infant RSA ↔ caregiver RSA
  Highlight max correlation and its lag: "Peak synchrony at lag +2.3s (r=0.61)"
  Pearson r at zero lag, with 95% CI and p-value

COHORT TOGGLE:
  Radio buttons: "This Visit | ASIB Mean Profile | VPT Mean Profile | TD Mean Profile"
  When a cohort mean is selected, show the population-level braid in dashed lines
  overlaid on the individual session braid.

THRESHOLD SLIDER: 
  Label: "Co-regulation sensitivity: ±X ms²"
  Adjusting updates the gold overlap zones in real-time.

Data: useCoRegulation(visitId) — create hook with:
  GET /api/sessions/:visitId/coregulation
  Response: {
    t: number[],
    infant_rsa: number[],
    caregiver_rsa: number[],
    vocalizations: number[],
    infant_gaze: number[],
    stillface_onset: number | null
  }
```

### 3.9 Priority 4 — Guided Explorer (Onboarding UX)

**Implementation prompt:**
```
Implement web/src/routes/GuidedExplorer.tsx (GUIDED_EXPLORER flag).

This route serves as an interactive onboarding tour for new lab members, 
grant reviewers, and collaborators who are unfamiliar with the dashboard.

STRUCTURE: A 7-step wizard with "Back / Next" navigation and a progress bar.

Step 1 — "Welcome to the NANO Dashboard"
  Study overview: 260 VPT infants, 3 cohorts, 5-year NIH R01.
  Animated: show the 3 cohort groups as colored pills populating one by one.

Step 2 — "Understanding HDA Phases"
  Show a small mock ECG trace (3 seconds) with colored phase bands.
  Interactive: user can click each band to see a definition popup.
  "Try it: click a phase to learn what it means."

Step 3 — "The RSA Paradox in ASD"
  Show the RSA trajectory chart (CDC-style) with ASIB vs TD.
  Narration: "You might expect infants who later develop ASD to show lower RSA. 
  But the data shows the opposite — elevated RSA from 9–24 months."
  Highlight the 9–24mo region with a pulsing annotation.

Step 4 — "How the Pipeline Works"
  Show the AnimatedDAG (reuse Overview's pipeline DAG component).
  Step through each stage with a "traveling dot" that the user controls 
  by clicking "Next Stage."

Step 5 — "Your Participants"
  Show the Participants table (read-only, demo data).
  Tip overlays: "Click a row to see their full visit timeline."

Step 6 — "QA Review"
  Show 4 example epoch tiles: 1 clean, 1 flagged noise, 1 flatline, 1 artifact.
  Interactive: user clicks each tile and chooses Accept/Reject.
  Feedback: "Correct — flatline epochs should always be rejected."

Step 7 — "You're ready. Here's where to go next."
  3 cards:
    → "See the overview" (links to /overview)
    → "Explore public results" (links to /public-insights)  
    → "Review a QA session" (links to /qa)

Add "Skip tour" link at every step.
Add to Landing page: a "New here? Take the 3-minute tour →" link pointing to /guided-explorer.
```

### 3.10 Priority 4 — Infant Passport Complete Implementation

**Implementation prompt:**
```
Implement web/src/routes/Passport.tsx (DYN_INFANT_PASSPORT flag).

The Infant Passport is a single-participant longitudinal summary card — 
the "medical chart equivalent" for a NANO study infant.

LAYOUT: Full-page vertical scroll with fixed header showing:
  NANO-XXXX | Group: ASIB | Gestational Age: 27w 3d | Corrected Age: 14mo
  Status: Active | QA Health: 91.2% | Last Visit: 6mo CGA (2026-04-12)

SECTION 1 — Visit Timeline (horizontal Gantt-style)
  Rows: each data stream (ECG, Temp, Behavioral Coding, REDCap, Eye Tracking)
  Columns: each visit timepoint (NICU Admit → 3mo → 6mo → ... → 36mo)
  Cell states: Complete (green) / Partial (amber) / Missing (red) / Future (gray)
  Click any cell → mini-drawer showing that visit's specific data quality metrics.

SECTION 2 — HRV Trajectory (individual vs. cohort mean)
  RMSSD line (garnet) vs. cohort mean ± 1SD band (slate, dashed)
  Tooltip per timepoint: "Visit 6mo CGA: RMSSD = 42.3ms (cohort mean: 38.1ms)"

SECTION 3 — HDA Phase Evolution
  Stacked bar per visit: % Orienting / Sustained / Inattention / Termination
  Hover shows exact percentages.

SECTION 4 — Assessment Scores
  Table: Instrument | Visit | Score | Normative Range | Flag
  Bayley-4 composite, ADOS-2 CSS, ASQ-3 domain scores, M-CHAT total
  Color-code rows that fall outside normative range in amber/red.

SECTION 5 — QA Notes
  Most recent QA decisions for this participant, with analyst initials.
  "Last reviewed: 2026-06-08 | Analyst: NS | Decision: 847 epochs accepted, 12 rejected"

HIPAA NOTE: All data accessed via de-identified NANO IDs. 
No name, DOB, or contact information displayed anywhere in this view.

Data: useParticipantDetail(id) — hook likely already exists; extend schema to include
  visit_timeline, hrv_individual, hda_evolution, assessments, qa_notes fields.
```

---

## PART 4 — STEP-BY-STEP DEPLOYMENT NOTES

### 4.1 Local Development Setup (from scratch)

```bash
# Prerequisites: Node 20+, Python 3.11+, npm, pip

# 1. Clone the repo
git clone https://github.com/namo507/ESD-Lab-USC.git
cd ESD-Lab-USC

# 2. Install frontend dependencies
cd web && npm install && cd ..

# 3. Set up environment variables
cp .env.example .env
# Edit .env and set:
#   VITE_USE_MOCKS=true          # Use mock data (required for dev without backend)
#   VITE_API_BASE_URL=http://localhost:8080  # Local backend URL
#   CLOUDFLARE_API_TOKEN=...     # Only needed for deployment

# 4. Start the React dev server
cd web && npm run dev
# → Opens http://localhost:5173

# 5. (Optional) Start Python backend for live assistant + real API
cd .. && pip install -r requirements.txt
python dashboard/server/live_dashboard_server.py --host 127.0.0.1 --port 8080
# → Backend runs on http://127.0.0.1:8080
```

### 4.2 Standard Production Deploy (Automated via CI)

Every push to `main` triggers `.github/workflows/deploy-pages.yml`:

```
Push to main
  → Install Node deps (npm ci in web/)
  → Vite build (VITE_USE_MOCKS=true)
  → build_pages_site.py: packages web/build/ into dist/pages-wrapper/
      - Injects deploy metadata: esd-deploy-stamp, esd-build-sha, esd-api-origin
      - Generates _worker.js that proxies /api/* to live assistant origin
  → wrangler pages deploy dist/pages-wrapper --project-name esd-lab-namo
  → Smoke test: check_site_health.py probes https://esd-lab-namo.pages.dev/
```

No action needed from you — just push to main and verify CI passes.

### 4.3 Manual Deploy (when CI is unavailable)

```bash
# Step 1: Build the React SPA
cd web
npm run build       # Output: web/build/ (or web/dist/ — check vite.config.ts)
cd ..

# Step 2: Package the Cloudflare Pages artifact
python scripts/build_pages_site.py
# This reads web/build/, injects debug metas, generates _worker.js proxy,
# outputs everything to dist/pages-wrapper/

# Step 3: Deploy with Wrangler (requires CLOUDFLARE_API_TOKEN in environment)
export CLOUDFLARE_API_TOKEN="your-token-here"
npx wrangler@3.112.0 pages deploy dist/pages-wrapper \
  --project-name esd-lab-namo \
  --branch main \
  --commit-dirty=true

# Step 4: Verify
python scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/
python scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/ \
  --max-stamp-age-hours 24

# Or via Makefile:
make pages-build && make pages-deploy
```

### 4.4 Running the Live AI Assistant + Quick Tunnel

The Buddy chat assistant (Cmd+K) requires a running local backend exposed via Cloudflare Tunnel:

```bash
# Start continuous tunnel + assistant backend (regenerates tunnel every ~6h)
bash scripts/share_dashboard.sh --continuous --mode quick

# What this does:
#   1. Starts live_dashboard_server.py on 127.0.0.1:8080
#   2. Launches cloudflared quick tunnel → gets a trycloudflare.com URL
#   3. Updates dashboard/public/pages_wrapper/manifest.json with new origin URL
#   4. Rebuilds Pages wrapper so _worker.js proxies /api/* to the live tunnel
#   5. Deploys updated wrapper to Cloudflare Pages

# To deploy against a specific known tunnel origin:
PAGES_API_ORIGIN=https://your-specific-tunnel.trycloudflare.com \
python scripts/build_pages_site.py
make pages-deploy
```

**⚠️ Important:** The quick tunnel URL rotates every ~6 hours. When it rotates, the AI assistant becomes unreachable on the live site until `make share-dashboard` is re-run. The named-tunnel cutover (§4.5) permanently resolves this.

### 4.5 Named Tunnel Cutover to esd-lab-namo.sc.edu (Blocked)

**What is blocked:** USC IT manages `sc.edu` via DNSMadeEasy. A CNAME pointing `esd-lab-namo.sc.edu` to the Cloudflare Tunnel cannot be created by you — it requires a formal IT ticket.

**Cloudflare API token gaps:** Current token lacks `Account > Cloudflare Tunnel:Edit` scope (HTTP 403 on tunnel API calls). Either rotate the token in the Cloudflare dashboard to add Tunnel scope, or perform the next steps via Cloudflare Zero Trust GUI.

**Step-by-step to complete the cutover (when USC IT responds):**

```bash
# Step 1: File a ticket to USC IT (registrar operations)
# Request: "Please create the following DNS record in the sc.edu zone:"
#   Name: esd-lab-namo.sc.edu
#   Type: CNAME
#   Value: 8b0fa216-b69f-4289-98cf-492c55a710b6.cfargotunnel.com
#   TTL: 300

# Step 2: While waiting, rotate your Cloudflare API token to add Tunnel scope:
# Cloudflare Dashboard → My Profile → API Tokens → Edit token
# Add scope: Account > Cloudflare Tunnel > Edit
# Save → copy new token → update .env

# Step 3: After USC IT creates the CNAME, verify DNS resolution:
host esd-lab-namo.sc.edu
# Should return: esd-lab-namo.sc.edu is an alias for 8b0fa216-b69f-4289-98cf-492c55a710b6.cfargotunnel.com

# Step 4: In Cloudflare Zero Trust dashboard (GUI):
# Tunnels → 8b0fa216-b69f-4289-98cf-492c55a710b6 → Public Hostnames
# Add hostname: esd-lab-namo.sc.edu → Service: http://127.0.0.1:8080
# Save

# Step 5: Run named-mode share
make share-named
# Script validates hostname readiness and prints:
# "Canonical public URL → https://esd-lab-namo.sc.edu/"

# Step 6: Rebuild wrapper pointing to stable named hostname
python scripts/build_pages_wrapper.py --origin https://esd-lab-namo.sc.edu --kind named
make pages-deploy
# After this: both esd-lab-namo.pages.dev and esd-lab-namo.sc.edu resolve to the 
# same stable origin. Quick tunnel dependency eliminated.
```

### 4.6 Enabling Feature Flags Step-by-Step

```bash
# 1. Open the flags file
# web/src/config/featureFlags.ts

# 2. Change false → true for your target flag(s)
# Example diff:
-  PUBLIC_INSIGHTS: false,
+  PUBLIC_INSIGHTS: true,
-  EXECUTIVE_MODE: false,
+  EXECUTIVE_MODE: true,

# 3. Check that mock data exists for the new route's data hooks
# Grep for the relevant API endpoint:
grep -r "public-insights\|rsa_trajectories\|hda_composition" dashboard/data/

# 4. If mock data is empty/missing, add it to dashboard_data.json (see §4.7)

# 5. Test locally
cd web && npm run dev
# Navigate to the new route, check browser console for errors
# Verify charts render with mock data, no "undefined" errors

# 6. Deploy
git add web/src/config/featureFlags.ts dashboard/data/dashboard_data.json
git commit -m "feat(flags): enable PUBLIC_INSIGHTS, EXECUTIVE_MODE

- Added narrative callout cards and HDA composition panel
- Populated rsa_trajectories and hda_composition mock data
- Verified both routes render without console errors"

git push origin main
# CI deploys automatically
```

### 4.7 Adding Mock Data for New Routes

```bash
# All mock JSON lives in:
dashboard/data/dashboard_data.json      # core study/participant/pipeline data
dashboard/data/readings_data.json       # publications/readings library
dashboard/data/runtime_status.json      # tunnel/health status

# Template for adding a new endpoint's mock:

# 1. Add JSON key to dashboard_data.json
# Example: adding cascade_paths
{
  "cascade_paths": {
    "nodes": [...],
    "paths": [...]
  }
}

# 2. Add handler in dashboard/server/live_dashboard_server.py
# Find the elif chain for path routing and add:
elif path == "/api/cascade/paths":
    data = self._load_data("cascade_paths")
    self._respond_json(data)

# 3. Add Zod schema in web/src/api/schemas.ts
export const CascadeNode = z.object({
  id: z.string(), label: z.string(), manipulable: z.boolean(), group: z.string()
});
export const CascadePath = z.object({
  from: z.string(), to: z.string(), beta: z.number(), se: z.number()
});
export const CascadePathResponse = z.object({
  nodes: z.array(CascadeNode),
  paths: z.array(CascadePath)
});

# 4. Add TanStack Query hook in web/src/api/hooks.ts
export function useCascadePaths() {
  return useQuery({
    queryKey: ["cascade", "paths"],
    queryFn: () => api.get("/api/cascade/paths", CascadePathResponse),
    staleTime: 300_000,
  });
}
```

### 4.8 Health Monitoring and Uptime

```bash
# Probe production site
python scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/

# Check build stamp freshness (alert if stale > 24h)
python scripts/check_site_health.py \
  --url https://esd-lab-namo.pages.dev/ \
  --max-stamp-age-hours 24

# GitHub Actions uptime-monitor.yml runs on schedule and can trigger re-deploy
# Manual trigger: GitHub → Actions → uptime-monitor → Run workflow

# If site shows 200 but returns wrong content (stale build):
make pages-build && make pages-deploy

# Check Cloudflare Pages deployment history:
# Cloudflare Dashboard → Pages → esd-lab-namo → Deployments
```

---

## PART 5 — UX AND CONTENT POLISH DIRECTIVES

### 5.1 Landing Page (/) — Content & Performance

**Current issue:** All metric KPI cards display `0` or `Loading…` in production because `VITE_USE_MOCKS=true` serves empty seed values from `dashboard_data.json`.

**Prompt to fix mock seed data:**
```
Update dashboard/data/dashboard_data.json → "study_summary" key to these values:
{
  "enrolled": 147,
  "target": 260,
  "active_visits_this_week": 4,
  "ecg_epochs_processed_24h": 1842,
  "redcap_health_pct": 94.2,
  "pipeline_pass_rate": 91.7,
  "pending_qa_epochs": 23,
  "last_sync": "2026-06-10T14:30:00Z"
}

Update "runs" array to include 5 realistic entries:
  [
    {id:"NANO-0147__cga_12mo", status:"running", visit:"12mo CGA", started:"2h ago", yield_pct: null},
    {id:"NANO-0146__cga_9mo", status:"complete", visit:"9mo CGA", started:"6h ago", yield_pct: 94.1},
    {id:"NANO-0145__cga_9mo", status:"complete", visit:"9mo CGA", started:"1d ago", yield_pct: 88.3},
    {id:"NANO-0144__cga_6mo", status:"queued", visit:"6mo CGA", started: null, yield_pct: null},
    {id:"NANO-0141__cga_12mo", status:"failed", visit:"12mo CGA", started:"2d ago", yield_pct: 12.4}
  ]

Update "trajectory" → "rmssd" with realistic group curves:
  VPT:  [{x:1,y:28.1},{x:3,y:31.4},{x:6,y:34.8},{x:9,y:36.2},{x:12,y:38.7},{x:24,y:41.3},{x:36,y:43.9}]
  ASIB: [{x:1,y:26.4},{x:3,y:29.1},{x:6,y:31.8},{x:9,y:32.9},{x:12,y:35.4},{x:24,y:38.8},{x:36,y:41.2}]
  TD:   [{x:1,y:31.2},{x:3,y:35.6},{x:6,y:39.4},{x:9,y:42.1},{x:12,y:45.3},{x:24,y:49.7},{x:36,y:52.8}]
```

**SEO & accessibility fixes:**
- Add `<meta name="description">` to `web/index.html`: *"NANO Study Dashboard — ESD Lab, University of South Carolina. Longitudinal neurodevelopmental research tracking 260 very preterm infants."*
- Add `<meta property="og:title">` and `<meta property="og:description">` for social sharing previews.
- All Lucide icons in the Landing nav lack `aria-label`. Add `aria-label="[section name]"` to each icon.
- The `AmbientOrbit` animation component should respect `prefers-reduced-motion`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    .ambientOrbit { animation: none; }
  }
  ```

**Study Status Banner (add to Landing.tsx):**
```tsx
// Add between hero and nav sections:
<div className={styles.statusBanner}>
  <span className={styles.statusDot} aria-hidden="true">●</span>
  <span>NANO Study · Actively Enrolling · {enrolled} / {target} participants</span>
  <a href="https://www.esdlabsc.com" target="_blank" rel="noopener">
    Learn more about participating <ArrowRight size={14} />
  </a>
</div>
```

**Library section:** The "Library" nav section in Landing is currently empty state. Seed `readings_data.json` with these 3 real ESD Lab publications:
- PMC13109926 — "Social Behavior Forecasts Moment-to-Moment Changes in RSA in Infants With Autism"
- PMC9673985 — "Capturing the Complexity of Autism: Applying a Developmental Cascades Framework"
- PMC12333485 — "Early Development in Autism: How Developmental Cascades Help Us Understand..."

### 5.2 Overview Page (/overview) — Operator UX Polish

**AnimatedDAG legend:** Add a legend row below the pipeline DAG:
```
● Ingestion  ● QA  ● Feature Extraction  ● Imputation  ● Model Training
"Traveling dots = active epoch batches moving through the pipeline"
```

**ParticipantFlow card:** Currently shows 7 most recent participants. Add:
- `(view all →)` link to `/participants` in the card footer
- A small group badge (ASIB/VPT/TD) next to each participant row with color coding

**AgenticQAPanel disabled state:** When `VITE_USE_MOCKS=true` (static Pages build), the assistant backend is unreachable. Show a graceful disabled state:
```tsx
if (import.meta.env.VITE_USE_MOCKS === "true") {
  return (
    <Card>
      <p className="t-muted">
        AI assistant requires a running local backend.<br/>
        Run <code>make share-dashboard</code> to enable.
      </p>
    </Card>
  );
}
```

**ReadingsGeoMap (SC county map):** Add county name + participant count tooltip on hover. Currently regions are colored but show no tooltip.

**Last synced timestamp:** In `TopNav`, show relative time next to the sync button:
```tsx
<span className="t-mono t-muted">{formatRelativeTime(lastSyncAt)}</span>
<SyncButton onClick={forceSync} spinning={syncing} />
```

**ClusterOpsPanel:** Add `"Learn more about outcome clusters →"` link pointing to `/cluster-viewer` in the panel footer.

### 5.3 Sidebar Navigation — Polish

**Active Studies placeholders:** All 3 Active Studies nav items currently point to `/overview` or `/participants`. Replace with:
```typescript
{to: "/overview", label: "NANO Study (VPT)", icon: "activity"},
{to: "/participants?study=home", label: "Home Study", icon: "home"},
{to: "/participants?study=fiscal", label: "FiSCAL-ASD", icon: "baby"},
```
Add study filter support to `Participants.tsx`: read `?study=` query param and pre-filter rows.

**Keyboard shortcuts tooltip:** Add a collapsed `<details>` at the sidebar footer:
```
Keyboard shortcuts
  Cmd+K   Open AI assistant
  Cmd+R   Force data sync
  Esc     Close drawer / modal
  ↑ ↓     Navigate participant list
```

**QA badge pulse animation:** When `qaPending > 0`, the badge should pulse:
```css
@keyframes badge-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.badge-pending { animation: badge-pulse 1.5s ease-in-out infinite; }
```

**"Preview" badge for newly enabled flags:** For 14 days after a flag is enabled, show a small `NEW` badge next to that sidebar item. Implement using a `FEATURE_FLAG_RELEASE_DATES` map:
```typescript
export const FEATURE_FLAG_RELEASE_DATES: Partial<Record<FeatureFlag, string>> = {
  PUBLIC_INSIGHTS: "2026-06-15",
  EXECUTIVE_MODE: "2026-06-15",
};
// In Sidebar: if Date.now() < releaseDate + 14 days, show NEW badge
```

### 5.4 QA Page (/qa) — Epoch Review Polish

**Epoch tile waveforms:** Each epoch tile currently shows only a color badge. Add a micro spark line:
```tsx
// In EpochTile.tsx, add a tiny <canvas> (width=60, height=20)
// Draw a 5-second IBI waveform trace using the epoch's raw IBI values
// Green stroke for clean, red stroke for noise/flatline
// This requires epoch data schema to include: ibi_series: number[]
```

**Batch actions:** Add a "Select All Flagged → Reject All" batch action button above the epoch grid. Currently every epoch must be reviewed individually.

**Epoch inspector improvements:** In `EpochInspector.tsx`:
- Add a "Compare with prior epoch" side-by-side view (show epoch N-1 next to epoch N)
- Add a "Reason" dropdown when rejecting: `[Motion artifact | Flatline | Noise burst | Electrode dropout | Out of range]`
- Show cumulative yield for the current session: "Accepted: 847 / 912 (92.9%)"

**Fast paths for QA:** Add 3 quick-prompt buttons above the epoch grid:
- "Explain why this epoch was flagged" → seeds chat with epoch metadata
- "Show similar epochs across all sessions" → seeds global search
- "What is the threshold for this SQI score?" → methodology reference

### 5.5 Results Page (/results) — Chart Polish

**RSA chart:** Enable `RSA_GROWTH_CURVES` flag. When enabled, ensure the `RsaGrowthChart` component shows:
- CI bands (shaded region) for each cohort, not just the mean line
- A text annotation at 9 months: "ASD-elevated RSA onset"
- The y-axis label should read "RSA (log-transformed HF power, ms²)" not just "RSA"

**RMSSD trajectory axis labels:**
- X-axis: "Corrected Gestational Age (months)" not just "Month"
- Add a toggle: "Corrected Age | Chronological Age" (the `AgeBasis` toggle already exists — verify it actually changes the x-axis labels and data points, not just the label text)

**HDA bar stack chart:** The stacked bars need a legend below them explaining each phase color. Currently a new user cannot decode what each color means.

**Fast paths:** The 6 existing `RESULTS_FAST_PATHS` are excellent. Add 2 more:
```typescript
{ lane: "model", label: "Compare ASIB vs TD RSA at 9mo", 
  prompt: "Compute the Cohen's d effect size for ASIB vs TD RSA at 9 months CGA. Include bootstrapped 95% CI. Contextualize: is this clinically meaningful?" },
{ lane: "qa", label: "Flag outlier participants",
  prompt: "Which participants have RMSSD values > 2 SD from their cohort mean at any timepoint? List them with the specific timepoint and raw value." }
```

### 5.6 General Dashboard-Wide Polish

**Theme system:** The dashboard supports light/dark/system themes via `ThemeBoot`. Verify:
- All custom CSS variables in `tokens.css` have correct dark-mode values
- Charts (Recharts) use `var(--foreground)` and `var(--muted-foreground)` for axis labels, not hardcoded hex values
- The HIPAA banner background is readable in both light and dark modes

**HIPAA banner:** Currently `HipaaBanner.tsx` shows in production. Ensure:
- It includes the IRB protocol number: `IRB #Pro00129478`
- It has a "Learn about data protection" link pointing to `/docs/hipaa_compliance_checklist.md` (serve as static asset)
- It is dismissible per session (store dismissed state in sessionStorage, not localStorage)

**Error boundaries:** Wrap each major route in a React `<ErrorBoundary>` that shows:
```
Something went wrong loading this view.
[Details for developers: {error.message}]
[Report this issue] → opens email to lab contact
```
Currently a single broken API call can crash the entire route with a blank white screen.

**Loading skeletons:** Routes that fetch data show `Loading…` plain text. Replace with proper skeleton components:
- Use `Skeleton` from the existing primitives (or add it) — a gray animated placeholder in the shape of the expected content
- This is especially important for `/participants` (table skeleton), `/results` (chart skeleton), and `/overview` (KPI card skeletons)

**Mobile responsiveness:** The sidebar is fixed-width and not collapsible on small screens. Add a hamburger menu toggle for viewports under 768px. The `AppShell` needs:
```tsx
const [sidebarOpen, setSidebarOpen] = useState(false);
// On mobile: overlay sidebar + backdrop on open, collapse on route change
```

---

## PART 6 — README REWRITE (for GitHub repo)

The existing README is technically excellent but structured as a developer spec. Rewrite it to serve three audiences simultaneously: **scientists** (what the study is and why it matters), **engineers** (how to set up and deploy), and **collaborators** (how to contribute).

**Prompt for README rewrite:**
```
Rewrite README.md for the namo507/ESD-Lab-USC GitHub repository.

The README must serve three audiences with a clear visual hierarchy using emoji section headers:

## 🧠 The NANO Study
Brief: 5-year NIH R01, 260 VPT infants, ESD Lab at USC. Link to esdlabsc.com.
3-aim summary in plain language. The RSA paradox finding as a one-sentence hook.

## 🌐 Live Dashboard
Two URLs in a table:
  | URL | Description |
  | https://esd-lab-namo.pages.dev/ | Public landing page |
  | https://esd-lab-namo.pages.dev/overview | Research operator dashboard |
Screenshot embed (or placeholder): "![Dashboard overview](docs/screenshots/overview.png)"

## 🏗️ Architecture
Keep existing ASCII pipeline diagram (it's excellent).
Add a line: "All production data is mocked (VITE_USE_MOCKS=true). No PHI ever enters this repository."

## 🚀 Quick Start (Developer)
Condensed setup: 4 commands to get running locally.
Reference pages_deploy.md for full deployment documentation.

## 📁 Repository Structure
Keep existing directory table but add a "Why it exists" column.
Highlight which directories are safe to edit without backend access (web/, docs/).

## 🔬 Research Data Pipeline
Keep existing pipeline diagram.
Add: "Raw data lives on USC Secure Server (no repo access). Contact Dr. Bradshaw's lab for data access."

## 🤝 Contributing
Link to CONTRIBUTING.md.
Add: "New contributors: run the Guided Explorer at /guided-explorer for an interactive tour."

## ⚠️ HIPAA Compliance
Keep existing warning block.
Add IRB number: Pro00129478.
Add: "See docs/hipaa_compliance_checklist.md for full compliance documentation."

## 📫 Contact
Dr. Jessica Bradshaw (PI) — link to esdlabsc.com/people
Repository maintained by: Namit Shrivastava, ESD Lab USC

Keep under 200 lines total. Every section should have 1–3 sentences max, 
then point to the appropriate doc in /docs/ for detail.
```

---

## PART 7 — MAINTENANCE CHECKLIST (Ongoing)

Run these checks before every production deploy:

```
□ VITE_USE_MOCKS=true is set in the build (never deploy real data)
□ npm run test passes in web/ (vitest)
□ No console errors on / and /overview (manual spot check)
□ check_site_health.py exits 0 after deploy
□ HIPAA banner visible and IRB number correct
□ No new hardcoded hex colors — use CSS tokens
□ Feature flags changed: update FEATURE_FLAG_RELEASE_DATES map
□ New route added: add to App.tsx, Sidebar.tsx, and this prompt file §1.3
□ New mock endpoint: add to dashboard_data.json, live_dashboard_server.py, schemas.ts, hooks.ts
□ CHANGELOG.md updated with [date] entry
□ TECH_DEBT.md checked — address any F/E complexity hotspots before they become G
```

---

*End of ESD Lab NANO Dashboard Master Prompt File*
*Last updated: June 10, 2026 by Namit Shrivastava*
*Sources: esd-lab-namo.pages.dev, github.com/namo507/ESD-Lab-USC, esdlabsc.com, Dashboard-Idea-Generation-Report.md*
