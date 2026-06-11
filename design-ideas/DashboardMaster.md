# ESD Lab NANO Dashboard — Master Prompt File
### Namit Shrivastava · ESD Lab, University of South Carolina
### Generated: June 10, 2026 · Refined: June 11, 2026 · Based on: live dashboards, GitHub codebase, idea-generation report

---

> **Purpose of this file:** This is the authoritative, self-contained prompt document for any AI assistant, collaborator, or future developer working on the ESD Lab NANO Study dashboard ecosystem. It encodes full context: what currently exists, what is missing, the full enhancement backlog from the architectural idea-generation report, step-by-step deployment instructions, and UX/content polish directives. Treat this as a living specification — update it as features ship.
>
> **IMPORTANT — Repository structure note:** The active frontend is the React SPA under `web/`. The `dashboard/` directory contains the Python backend server, static data files, and legacy assets — it is **not** the frontend source. All component, route, and style edits target `web/src/`. All CSS color values must reference CSS custom properties (defined in `web/src/styles/tokens.css` and `web/src/styles/global.css`) — never hardcoded hex literals — so that dark/light mode works correctly.

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
| Styling | Tailwind CSS + CSS Modules, custom token system (`web/src/styles/tokens.css`, `web/src/styles/global.css`) |
| Routing | React Router v6, lazy-loaded route components (`web/src/App.tsx`) |
| State | Zustand (`web/src/store/ui.ts` — `useUi` store) |
| Charts | Recharts (RMSSD trajectories, HDA bar stacks); `@nivo/sankey` + full `d3` bundle already in `web/package.json` |
| Maps | GeoJSON (`web/public/sc-counties.geojson`) + `web/src/components/warm/ReadingsGeoMap.tsx` |
| AI assistant | Local LM Studio backend proxied via Cloudflare Pages `_worker.js`; chat in `web/src/components/shell/ChatDrawer.tsx`; hover-card INSIGHTS in `web/src/components/shell/Buddy.tsx` |
| Deployment | Cloudflare Pages (project: `esd-lab-namo`), CI via `.github/workflows/deploy-pages.yml` |
| Production data | `VITE_USE_MOCKS=true` — all production data is mocked; no PHI ever in repo |
| Backend runtime | Python (`dashboard/server/live_dashboard_server.py`) on `127.0.0.1:8080`, Cloudflare Tunnel |
| Mock server | `web/src/api/mockServer.ts` — in-browser MSW-style intercept for `/api/*` when `VITE_USE_MOCKS=true` |
| Data store | REDCap (demographics/assessments), USC Secure Server (raw ECG/temp) |
| Vite build output | `web/build/` (controlled by `VITE_OUT_DIR` env var in `web/vite.config.ts`) |
| Pages wrapper output | `dist/pages-wrapper/` (assembled by `scripts/build_pages_site.py`) |

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

**How flags are enabled:** Flags can be enabled in two ways:
1. **One-off file edit:** Set `FLAG_NAME: true` directly in `web/src/config/featureFlags.ts`. Affects all builds until reverted.
2. **Build-time env var (preferred for production):** Pass `VITE_FEATURE_<FLAG_NAME>=true` during `npm run build`, or `VITE_NANO_FEATURES=all` to enable everything. The `make pages-build` target already enables the recommended subset via env vars — check the Makefile at line 128 for the current list.

Runtime evaluation lives in `web/src/hooks/useFeatureFlag.ts` (`isFeatureFlagEnabled` / `useFeatureFlag`), which checks both the static map and the env-var override.

**Immediate action:** Enable flags progressively as each underlying mock is verified complete. Recommended sequence: `PUBLIC_INSIGHTS → EXECUTIVE_MODE → PUBLICATIONS_FEED → MODEL_LEADERBOARD → RSA_GROWTH_CURVES → SWIMMER_PLOT → ATTRITION_FUNNEL → CASCADE_DAG → SDOH_MAP`.

---

## PART 2 — GAP ANALYSIS: LIVE DASHBOARDS vs. GITHUB CODEBASE

### 2.1 Live Site vs. Codebase Comparison

| Area | Live at `pages.dev` | In Codebase | Gap |
|------|--------------------|--------------|----|
| Landing (/) | ✅ Sections: Overview, Metrics, Aims, Architecture, Pipeline, QA, Cohort, ML, Studio, Assistant, Library | ✅ `web/src/routes/Landing.tsx` + `Landing.module.css` | All metric cards show 0 — mock seed data is empty zeros in `dashboard/data/dashboard_data.json` |
| Overview (/overview) | ✅ Lab Pulse with KPIs, DAG, ParticipantFlow, GeoMap | ✅ `web/src/routes/Overview.tsx` + `Overview.module.css` | All 36 feature flags off — entire advanced surface invisible |
| /participants | ✅ Filterable table with group/QA/visit filters | ✅ `web/src/routes/Participants.tsx` | Mocked rows only; Active Studies sidebar links all point to `/overview` or `/participants` without study query params |
| /results | ✅ RMSSD/HF/SDNN trajectory charts + HDA bar stacks | ✅ `web/src/routes/Results.tsx` | RSA_GROWTH_CURVES flag off — `web/src/components/charts/RsaGrowthChart.tsx` not rendered |
| /qa | ✅ Epoch grid with flagged/rejected filters | ✅ `web/src/routes/QA.tsx` + `web/src/components/qa/epochReducer.ts` | Demo visit only; no live ECG epoch streaming |
| /redcap | Route accessible | ✅ `web/src/routes/Redcap.tsx` | REDCAP_COMPLETENESS flag off; completeness heatmap hidden |
| All 30+ advanced routes | ❌ Not accessible via sidebar (flags = false) | ✅ All 50+ route components built under `web/src/routes/` | **Largest gap** — entire dynamics/dyads/insights/executive surface built but invisible |
| AI Chat (Buddy) | Cmd+K opens drawer | ✅ `web/src/components/shell/ChatDrawer.tsx` + `Buddy.tsx` | Non-functional in static Pages build; LM Studio backend must run locally |
| Presentation Maker | Route accessible | ✅ `web/src/routes/PresentationMaker.tsx` | 3 of 5 slide types are content stubs |
| Executive PPTX export | Flag off | ✅ `web/src/routes/ExecutiveMode.tsx` with pptxgenjs | 3 slide stubs need real data binding; helper at `web/src/lib/pptx.ts` |
| Public Insights | Flag off | ✅ `web/src/routes/PublicInsights.tsx`; insight sub-components in `web/src/components/insights/` | Ready to enable — highest-value public feature waiting behind flag |
| Cascade Simulator | Flag off | ✅ `web/src/routes/CascadeSimulator.tsx` with DAG + beta-path projection | Data served from `dashboard/data/dashboard_data.json` via `/api/v2/cascade-paths` |
| County Comparator | Flag off | ✅ `web/src/routes/CountyComparator.tsx` + `web/public/sc-counties.geojson` | GeoJSON present; SDOH overlay data needed in mock server |

### 2.2 Dashboard vs. Official esdlabsc.com — Missing Content

The official site at `https://www.esdlabsc.com` provides family-facing content that the research dashboard intentionally does not replicate. However, these cross-linking gaps weaken both properties:

| Content | esdlabsc.com | Dashboard | Action Needed |
|---------|-------------|-----------|---------------|
| Participant recruitment portal | ✅ Interest form | ❌ Not linked | Add banner/button on `web/src/routes/Landing.tsx` pointing families to esdlabsc.com |
| Plain-language study description | ✅ "We study how babies look, act, interact..." | ❌ Technical only | Add Public Insights FAQ accordion with lay-language explanation |
| Participant stories | ✅ Present | ❌ Absent | Consider embedding 1–2 anonymized quotes in `web/src/routes/PublicInsights.tsx` |
| Lab team / PI bios | ✅ Present | ❌ Absent | Add team section to Landing's "About" or footer in `web/src/routes/Landing.tsx` |
| Visit schedule for families | ✅ "Complete visits at different time points" | 🟡 README only, not in UI | Surface visit schedule table in Public Insights |
| IRB/ethics statement | ✅ Implied in consent process | 🟡 IRB# in `web/src/components/shell/HipaaBanner.tsx` but not in public routes | Add IRB badge to Public Insights; verify banner shows `IRB Pro00115234` |
| Study status / enrollment count | ❌ Static copy | 🟡 KPI card exists but shows 0 | Fix mock seed data in `dashboard/data/dashboard_data.json` → `study_summary` key |
| Publications | ❌ Not listed | 🟡 Route built, flag off | Enable PUBLICATIONS_FEED flag; seed `dashboard/data/readings_data.json` with real PMIDs |

---

## PART 3 — ENHANCEMENT BACKLOG (from Idea-Generation Report + Codebase Analysis)

### 3.1 Priority 1 — Enable Existing Features (Zero New Code)

These features are **fully implemented** but gated. Enabling requires either:
- **Build-time:** Add `VITE_FEATURE_<FLAG>=true` to the `make pages-build` command in the `Makefile` (line 128), then `make pages-deploy`.
- **Development-time:** Set the flag to `true` in `web/src/config/featureFlags.ts`, then `cd web && npm run dev`.

**Recommended enable sequence with rationale:**

```
1. PUBLIC_INSIGHTS        — web/src/routes/PublicInsights.tsx
                            Sub-components: web/src/components/insights/
                            (CdcStyleLine, DualGroupComparator, InsightSection, CumulativeCurve)
                            Zero PHI risk. Highest public + grant-demo value.

2. EXECUTIVE_MODE         — web/src/routes/ExecutiveMode.tsx
                            Fix slide stubs first (see §3.4). PPTX helper: web/src/lib/pptx.ts.

3. PUBLICATIONS_FEED      — web/src/routes/Publications.tsx + PublicationDetail.tsx
                            Seed dashboard/data/readings_data.json with actual PMIDs first.

4. MODEL_LEADERBOARD      — web/src/routes/ModelLeaderboard.tsx
                            Data: /api/v2/model-leaderboard → useModelLeaderboard() hook.

5. RSA_GROWTH_CURVES      — enables RsaGrowthChart in web/src/routes/Results.tsx
                            Chart component: web/src/components/charts/RsaGrowthChart.tsx
                            Hook: useRsaTrajectories() at /api/v2/rsa-trajectories.

6. CASCADE_DAG            — web/src/routes/CascadeDag.tsx
                            Data: /api/v2/cascade-dag → useCascadeDag() hook.

7. SWIMMER_PLOT           — web/src/routes/SwimmerPlot.tsx
                            Data: /api/v2/cohort-swimmer → useCohortSwimmer() hook.

8. ATTRITION_FUNNEL       — web/src/routes/Attrition.tsx
                            Data: /api/v2/attrition-funnel → useAttritionFunnel() hook.

9. SDOH_MAP + COUNTY_COMPARATOR — web/src/routes/SdohMap.tsx + CountyComparator.tsx
                            GeoJSON: web/public/sc-counties.geojson already in place.
                            Data: /api/v2/sdoh-map → useSdohMap() hook.

10. ECG_QUALITY_MONITOR   — web/src/routes/EcgQuality.tsx
                            Data: /api/v2/ecg-quality-summary → useEcgQualitySummary() hook.
```

### 3.2 Priority 2 — Multimodal Synchrony Visualizer (New Feature, Highest Scientific Value)

**Scientific motivation:** Traditional interfaces force researchers to view ECG data and behavioral video in separate software. Aligning them by hand consumes hours per participant. This is the most cited bottleneck in the idea-generation report.

**Route:** `/multimodal` | **New feature flag:** `MULTIMODAL_SYNCHRONY` | **File to create:** `web/src/routes/MultimodalSynchrony.tsx`

**Implementation prompt:**
```
Create web/src/routes/MultimodalSynchrony.tsx with a named export MultimodalSynchrony.

Render 4 stacked horizontal scrollable tracks sharing one synchronized x-axis
(time in seconds, 0 to session length):

  Track 1: Raw ECG waveform
    - R-peak markers as vertical lines in color var(--usc-garnet)
    - IBI segments as light shaded bands between peaks
    - Y-axis: millivolts (-1.5 to +1.5)

  Track 2: Continuous RSA calculation
    - Rolling 30-second window HF power in ms²
    - Y-axis: 0 to 200 ms²
    - Overlay: threshold line at 50 ms² (low autonomic regulation marker)
    - Line color: var(--ocean)

  Track 3: HDA phase labels
    - Colored bands using existing CSS token colors:
      orienting=var(--blue), sustained=var(--green),
      inattention=var(--purple), termination=var(--red)
    - Each band labeled with phase name if width > 2s

  Track 4: Gaze fixation events
    - Binary on/off strip: caregiver-face=var(--sand), object=var(--ocean)
    - Unlabeled intervals = off-face gaze

DARK/LIGHT MODE: All track backgrounds must use var(--warm-card) or var(--bg-surface),
  axis labels must use var(--warm-fg3), grid lines must use var(--warm-border).
  Never hardcode hex colors — chart fills should use CSS custom properties.

Social Synchrony Detector:
  When RSA > 80ms² AND Track 4 = caregiver-face AND Track 3 = sustained,
  auto-highlight the overlapping region with a border in var(--usc-gold) and log timestamp.
  Show a counter: "X synchrony windows detected this session"

Scrubber: a horizontal range input below all tracks that jumps all 4 tracks 
simultaneously. Add keyboard: ArrowLeft/ArrowRight = ±1s, Space = play/pause.
Use @media (prefers-reduced-motion: no-preference) for any animations.

Data source: useMultimodalSession(nanoId, visitAge) TanStack Query hook in web/src/api/hooks.ts
  Endpoint: GET /api/v2/multimodal/:nanoId/:visitAge
  Response shape validated with Zod schema MultimodalSessionResponse in web/src/api/schemas.ts:
  {
    ecg: {t: number[], mv: number[], rPeaks: number[]},
    rsa: {t: number[], hfPower: number[]},
    hda: {epochs: {start: number, end: number, phase: HdaPhase}[]},
    gaze: {events: {t: number, target: string, duration: number}[]}
  }

Register route in web/src/App.tsx:
  1. Add lazy import: const MultimodalSynchrony = lazy(...)
  2. Add <Route path="/multimodal" element={<MultimodalSynchrony />} /> inside the AppShell Routes block

Add to web/src/components/shell/Sidebar.tsx under the "Dynamics & Dyads" nav group:
  { to: "/multimodal", label: "Multimodal Sync", icon: "waveform", flag: "MULTIMODAL_SYNCHRONY" }

Add MULTIMODAL_SYNCHRONY: false to web/src/config/featureFlags.ts.

Add Buddy INSIGHTS entry in web/src/components/shell/Buddy.tsx INSIGHTS record:
  "multimodal-sync": { term: "Multimodal Synchrony", body: "..." }

Add BUDDY_FAST_PATHS entry in web/src/components/shell/ChatDrawer.tsx:
  { lane: "dyn", label: "Multimodal sync windows", 
    prompt: "Explain the Multimodal Synchrony Visualizer tracks and how the gold synchrony window detection works." }

Add endpoint to dashboard/server/live_dashboard_server.py:
  Register SPA route "/multimodal" in the SPA_ROUTE_PREFIXES tuple (line ~55).
  Add handler for GET /api/v2/multimodal/<nanoId>/<visitAge> returning mock multimodal data.

Add mock data handler in web/src/api/mockServer.ts following the existing pattern
  for other v2 endpoints (e.g., useDyadCoregulation).
```

### 3.3 Priority 2 — Cascade Simulator Completion

**The `web/src/routes/CascadeSimulator.tsx` is already built.** The shell renders a DAG with manipulable nodes and projects `outcome_36m` via beta-path propagation. The backend already serves the data: `dashboard/server/live_dashboard_server.py` at line ~1127 defines `_v2_cascade_paths()` and registers the route at `/api/v2/cascade-paths`. The TanStack hook `useCascadePaths()` in `web/src/api/hooks.ts` already calls this endpoint. Only data enrichment and UI overlays are missing.

**Implementation prompt:**
```
The cascade_paths data is served from dashboard/server/live_dashboard_server.py
via the function _v2_cascade_paths() (line ~1127). Its source data is embedded
in that function or in dashboard/data/dashboard_data.json under "cascade_paths".
Update that data source (NOT a separate cascade_paths.json) with this structure:

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
  "paths": [...],
  "cohort_diffs": { ... }
}

Then in web/src/routes/CascadeSimulator.tsx add:
  1. A "Group Overlay" toggle (TD baseline | ASIB overlay)
  2. When ASIB overlay is active, edges with |delta_beta| > 0.15 glow using
     color var(--red) (maps to #C44E52 in light mode, same token in dark mode)
  3. An interpretation panel below the DAG using var(--warm-fg2) text color
  4. A "Reset All" button using the existing Button primitive from
     web/src/components/primitives/Button.tsx
  5. A CSV export using web/src/lib/exportCsv.ts (already in the codebase)

The useCascadePaths() hook in web/src/api/hooks.ts already exists and calls
GET /api/v2/cascade-paths — no new hook or endpoint needed.

DARK/LIGHT MODE: Node labels must use var(--warm-fg1), edge labels var(--warm-fg3),
  panel backgrounds var(--warm-card), borders var(--warm-border).
  All node fill colors should be cohort group tokens: 
    --vpt-bg/#--vpt-fg, --asib-bg/--asib-fg, --td-bg/--td-fg from global.css.
```

### 3.4 Priority 2 — Executive Mode PPTX Stub Completion

**The `web/src/routes/ExecutiveMode.tsx` already generates a 5-slide PPTX via pptxgenjs. Slides 2–4 are content stubs. The helper module is `web/src/lib/pptx.ts`.**

**Implementation prompt:**
```
In web/src/routes/ExecutiveMode.tsx, complete the exportExecutiveSummary function.
The function already receives: enrolled, target, bestModel, bestAuroc, attritionLabel.
Add these additional parameters by calling the appropriate hooks before export:
  rsaData from useRsaTrajectories()        → /api/v2/rsa-trajectories
  modelData from useModelLeaderboard()     → /api/v2/model-leaderboard
  attritionStages from useAttritionFunnel() → /api/v2/attrition-funnel
(All three hooks already exist in web/src/api/hooks.ts.)

Replace Slide 2 — Enrollment Trajectory:
  Use attritionStages array to build a table.
  Style: USC Garnet (#73000a — from --usc-garnet token) header, 
  Georgia font 11pt, alternating row shade.

Replace Slide 3 — HRV Trajectory Summary:
  Build a 3×3 summary table: rows = groups (ASIB, VPT, TD), cols = age (9mo, 24mo, 36mo)
  Each cell = mean RSA value from rsaData at that timepoint.

Replace Slide 4 — Model Performance:
  Use top 3 models from modelData sorted by auroc descending.

All slides: logo from web/public/mark.svg top-right, garnet accent line,
  "Confidential — ESD Lab, USC" footer in 9pt gray.

BUDDY UPDATE: Add a BUDDY_FAST_PATHS entry in web/src/components/shell/ChatDrawer.tsx:
  { lane: "model", label: "Executive PPTX export",
    prompt: "Walk me through the Executive Mode PPTX export and which slides pull from live hooks vs. stubs." }
```

### 3.5 Priority 2 — Public Insights Grant-Demo Readiness

**`web/src/routes/PublicInsights.tsx` already renders CDC-style line charts, county map, and dual-group comparator. Sub-components are in `web/src/components/insights/`. It just needs content enrichment.**

**Implementation prompt:**
```
Enhance web/src/routes/PublicInsights.tsx:

1. NARRATIVE CALLOUT CARDS
   Import the Card primitive from web/src/components/primitives/Card.tsx.
   Add a Card above each metric chart with a colored left border using CSS custom properties:
   - Above RSA chart: border-left-color: var(--usc-garnet)
   - Above RMSSD chart: border-left-color: var(--ocean)
   Text content and PMID badge linking to the publication detail.
   
   DARK/LIGHT MODE: Card backgrounds must use var(--warm-card), text var(--warm-fg2).
   The callout card border should use the token color, not a hardcoded hex.

2. HDA COMPOSITION PANEL
   Use web/src/components/charts/HDABarStack.tsx (already exists) or a similar 
   Recharts BarChart. Data from useHdaComposition() → /api/v2/hda-composition
   (hook already exists in web/src/api/hooks.ts).
   
   Phase colors must use CSS tokens from web/src/styles/global.css:
     Orienting:   var(--blue)    (#4C72B0)
     Sustained:   var(--green)   (#55A868)
     Inattention: var(--purple)  (#8172B2)
     Termination: var(--red)     (#C44E52)
   These tokens have correct contrast in both light and dark modes.

3. STUDY EXPLAINER ACCORDION
   Use <details>/<summary> elements styled with CSS Module classes in
   web/src/routes/PublicInsights.module.css (already exists — add new classes).
   Accordion text color: var(--warm-fg2); border: var(--warm-border).
   The "Join the Study" button should use the Button primitive from
   web/src/components/primitives/Button.tsx.

4. SHARE BUTTON
   Import Share from lucide-react (already a dep in web/package.json).
   Use navigator.clipboard.writeText(). For the toast, check if a toast utility
   exists in web/src/components/primitives/ before creating a new one.
   Toast background: var(--warm-card); text: var(--warm-fg1); border: var(--warm-border).

5. IRB BADGE
   Text: "IRB Protocol #Pro00115234 | HIPAA Compliant"
   (Match the exact IRB number from web/src/components/shell/HipaaBanner.tsx)
   Badge style: small text, color: var(--warm-fg4), 
   border: 1px solid var(--warm-border).

BUDDY UPDATE: Add an INSIGHTS entry in web/src/components/shell/Buddy.tsx:
  "public-insights-irb": { term: "IRB badge", body: "The IRB badge confirms Protocol #Pro00115234. Only aggregate, de-identified data appears on this page." }
```

### 3.6 Priority 3 — REDCap Completeness Matrix

**Implementation prompt:**
```
Enable REDCAP_COMPLETENESS flag and complete web/src/routes/Redcap.tsx.

The useRedcapCompleteness() hook already exists in web/src/api/hooks.ts and
calls GET /api/v2/redcap-completeness → S.RedcapCompletenessResponse (schema in
web/src/api/schemas.ts). The mock data handler is in web/src/api/mockServer.ts.

Add a "Completeness Matrix" section below the existing sync status:

1. HEATMAP GRID
   Rows: participants (anonymized NANO-XXXX IDs)
   Columns: REDCap instruments in visit order (see original instruments list).
   
   Cell colors using CSS tokens (not hardcoded hex):
     Complete:   var(--green)         (maps to #55A868)
     Partial:    var(--amber)         (maps to #d97706)
     Missing:    var(--red)           (maps to #C44E52)
     Unscheduled: var(--warm-border)
   
   DARK/LIGHT MODE: All cell backgrounds and text must use CSS tokens.
   The grid container: background var(--warm-card), border var(--warm-border).
   Cell text: var(--warm-fg1). Header row: var(--warm-fg2), border-bottom var(--warm-border).

2. CLICK INTERACTION
   Click a cell → open a right-side drawer.
   Reuse the drawer pattern from web/src/components/pipeline/StageDrawer.tsx as reference.
   "Open in REDCap" button: use web/src/components/primitives/Button.tsx.

3. SUMMARY KPIs
   Use web/src/components/primitives/KPI.tsx (already exists) for the KPI cards.

4. EXPORT BUTTON
   Use the exportCsv utility at web/src/lib/exportCsv.ts (already in the codebase).

5. HIPAA REMINDER CARD
   IRB number must read: "IRB #Pro00115234"
   (Match web/src/components/shell/HipaaBanner.tsx exactly.)
   Card: background var(--hipaa-notice-bg), text var(--hipaa-fg), 
   border var(--hipaa-border) — these tokens already exist in global.css.

BUDDY UPDATE: Add BUDDY_FAST_PATHS entry in web/src/components/shell/ChatDrawer.tsx:
  { lane: "redcap", label: "Completeness matrix",
    prompt: "How should I use the REDCap completeness scorecard before an NDA deadline?" }
```

### 3.7 Priority 3 — SDOH Map with Recruitment Priority Overlay

**Implementation prompt:**
```
Complete web/src/routes/SdohMap.tsx and enable SDOH_MAP flag.

The ReadingsGeoMap component for SC counties is at
web/src/components/warm/ReadingsGeoMap.tsx (NOT a "CountyMap" component).
The GeoJSON is at web/public/sc-counties.geojson.
The useSdohMap() hook already exists in web/src/api/hooks.ts, calling
GET /api/v2/sdoh-map → S.SdohMapResponse.

Extend the existing SdohMap.tsx with:

1. SDOH OVERLAY LAYER
   Color counties by selected metric using a garnet sequential scale.
   Available metrics: dropdown selector in the component.
   Source: embed as static JSON in web/src/data/sc_sdoh.json
   (create this directory web/src/data/ if it doesn't exist; the file is purely
   static lookup data, never PHI).

2. ENROLLMENT DENSITY LAYER
   Proportional circles on each county centroid.
   Data from useSdohMap(). Tooltip: use the existing Tooltip primitive from
   web/src/components/primitives/Tooltip.tsx.

3. RECRUITMENT PRIORITY INDEX
   High priority: border color var(--red); low priority: var(--warm-border).
   Tooltip text color: var(--warm-fg1).

4. METRIC SELECTOR DROPDOWN
   Use the Segmented control from web/src/components/primitives/Segmented.tsx
   or a standard <select> styled with CSS Module classes.

5. EXPORT BUTTON
   Use exportCsv from web/src/lib/exportCsv.ts.

6. MAP LEGEND
   Legend text: var(--warm-fg2); background: var(--warm-card); 
   border: var(--warm-border). Must be readable in both dark and light mode.

DARK/LIGHT MODE: The map SVG county fills use CSS classes, not inline hex colors.
  Add dark-mode overrides in web/src/routes/SdohMap.tsx's CSS Module file if it
  exists, or in web/src/styles/global.css under :root[data-theme="dark"].

IMPLEMENTATION NOTE: web/package.json ships @nivo/sankey and full d3 bundle.
  Use react-simple-maps with d3-scale for choropleth if Leaflet and deck.gl are 
  absent from web/package.json — verify first with: cat web/package.json | grep -E "leaflet|deck.gl|simple-maps"

BUDDY UPDATE: Existing "dyn-cva-gap"-style entry exists; add no new entry since
  existing BUDDY_FAST_PATHS already covers county-comparator context.
```

### 3.8 Priority 3 — Co-Regulation Braid Visualization

**The route `web/src/routes/CoRegulation.tsx` already exists (flag: `DYN_CO_REGULATION_BRAID`). The data hook `useDyadCoregulation(nanoId, visitAge)` in `web/src/api/hooks.ts` calls `GET /api/v2/dyad/coregulation/:nanoId/:visitAge` and returns `S.DyadCoregulationResponse`.**

**Implementation prompt:**
```
Enhance web/src/routes/CoRegulation.tsx (DYN_CO_REGULATION_BRAID flag).

The existing useDyadCoregulation hook signature is:
  useDyadCoregulation(nanoId: string | undefined, visitAge: number | string | undefined)
  → GET /api/v2/dyad/coregulation/:nanoId/:visitAge
  → S.DyadCoregulationResponse (see web/src/api/schemas.ts for fields)

Render a "physiological braid" showing infant-caregiver RSA co-regulation:

BRAID VISUALIZATION (Recharts ComposedChart):
  Two AreaChart ribbons with transparency using CSS token colors:
    Top band (Infant RSA):    fill-opacity 0.4, fill var(--usc-garnet)
    Bottom band (Caregiver RSA): fill-opacity 0.4, fill var(--slate-500)
  Co-regulation overlap zone: fill var(--usc-gold), fill-opacity 0.6
  
  DARK/LIGHT MODE: Chart container background var(--warm-card). 
  Axis tick color: var(--warm-fg3). Grid stroke: var(--warm-border).
  Legend text: var(--warm-fg2). These must be passed as Recharts tick/style props,
  not hardcoded hex, so they switch correctly with theme.

EVENT STRIP below the braid:
  Three thin strip charts under the main braid, sharing the same x-axis.
  Strip border: var(--warm-border). Tick marks: var(--ocean), var(--sand), var(--red).

STATISTICS PANEL (right sidebar):
  Panel background: var(--warm-card), border: 1px solid var(--warm-border).
  Metric labels: var(--warm-fg3), values: var(--warm-fg1).
  Use KPI primitive from web/src/components/primitives/KPI.tsx for the
  four summary metrics (synchrony index, lead-lag, coupling stability, recovery).

COHORT TOGGLE:
  Use Segmented control from web/src/components/primitives/Segmented.tsx.

THRESHOLD SLIDER:
  Use a styled <input type="range">. Thumb color: var(--usc-garnet).

BUDDY UPDATE: The "dyn-coreg-synchrony" and related INSIGHTS keys already exist
  in web/src/components/shell/Buddy.tsx — verify they cover the enhanced metrics.
  If not, add entries for new metrics introduced by the enhancement.
```

### 3.9 Priority 4 — Guided Explorer (Onboarding UX)

**The route file `web/src/routes/GuidedExplorer.tsx` and its CSS Module `web/src/routes/GuidedExplorer.module.css` already exist (flag: `GUIDED_EXPLORER`).**

**Implementation prompt:**
```
Implement the 7-step wizard body in web/src/routes/GuidedExplorer.tsx.
Navigation state should live in React local state (useState), NOT in the Zustand
store, since it's transient wizard state with no PHI.

STRUCTURE: A 7-step wizard with "Back / Next" navigation and a progress bar.

Step 1 — "Welcome to the NANO Dashboard"
  Study overview animated using web/src/components/warm/Counter.tsx for numbers.
  Group pills: use the GroupTag component from web/src/components/warm/GroupTag.tsx.

Step 2 — "Understanding HDA Phases"
  Show a mock ECG trace using web/src/components/warm/AreaSparkline.tsx as reference.
  Phase band colors: var(--blue), var(--green), var(--purple), var(--red).
  These match the HdaPhase colors in web/src/styles/tokens.css / global.css.
  Interactive click → definition popup: use Tooltip from web/src/components/primitives/Tooltip.tsx.

Step 3 — "The RSA Paradox in ASD"
  Reuse web/src/components/charts/RsaGrowthChart.tsx (already exists).
  Annotation at 9 months: use a custom SVG label within the Recharts ReferenceArea.
  Pulsing annotation: CSS keyframe animation, wrapped in
  @media (prefers-reduced-motion: no-preference) to respect user settings.

Step 4 — "How the Pipeline Works"
  Reuse web/src/components/warm/AnimatedDAG.tsx (already exists in warm/ components).
  "Traveling dot" animation: CSS animation on a positioned element.
  Wrap all animations in @media (prefers-reduced-motion: no-preference).

Step 5 — "Your Participants"
  Show read-only participant rows using the same Participants data.
  Use web/src/components/warm/ParticipantFlow.tsx as a read-only reference component.

Step 6 — "QA Review"
  4 example epoch tiles: use EpochTile from web/src/components/qa/EpochTile.tsx.
  Accept/Reject dispatch: use epochReducer from web/src/components/qa/epochReducer.ts.

Step 7 — "You're ready."
  3 link cards using Card primitive from web/src/components/primitives/Card.tsx.
  Each card: background var(--warm-card), border var(--warm-border),
  hover: background var(--warm-pill), transition: background var(--dur-base).

ALL STEPS:
  "Skip tour" link: <button type="button"> with text color var(--warm-fg4).
  Step counter + progress bar: use var(--usc-garnet) fill for the progress line.
  Step content area padding: var(--s-32). Max width: var(--measure).

BUDDY UPDATE: Add an INSIGHTS entry in web/src/components/shell/Buddy.tsx:
  "guided-explorer-step": { term: "Guided Explorer", body: "The 7-step tour walks new users through HDA phases, the RSA paradox, and the pipeline before they access operator surfaces." }

Add a "New here? Take the 3-minute tour →" link on web/src/routes/Landing.tsx
pointing to /guided-explorer. Style: small text, color var(--usc-garnet),
placed near the study description section.
```

### 3.10 Priority 4 — Infant Passport Complete Implementation

**The route `web/src/routes/Passport.tsx` already exists (flag: `DYN_INFANT_PASSPORT`). The `usePassport(nanoId)` hook in `web/src/api/hooks.ts` calls `GET /api/v2/passport/:nanoId` → `S.PassportResponse`.**

**Implementation prompt:**
```
Implement the full layout body of web/src/routes/Passport.tsx.

The usePassport(nanoId) hook signature is:
  usePassport(nanoId: string | undefined)
  → GET /api/v2/passport/:nanoId
  → S.PassportResponse (see web/src/api/schemas.ts)

LAYOUT: Full-page vertical scroll with sticky header.
  Fixed header: background var(--warm-card), border-bottom var(--warm-border).
  Header text: var(--warm-fg1) for NANO-XXXX ID, var(--warm-fg3) for metadata.
  Group badge: use GroupTag from web/src/components/warm/GroupTag.tsx.

SECTION 1 — Visit Timeline (horizontal Gantt-style)
  Cell state colors (use CSS tokens, not hex):
    Complete:    var(--green)
    Partial:     var(--amber)
    Missing:     var(--red)
    Future:      var(--warm-border) with var(--warm-fg4) text
  Click any cell → mini-drawer: reuse StageDrawer pattern from
  web/src/components/pipeline/StageDrawer.tsx as reference.

SECTION 2 — HRV Trajectory
  Individual line: stroke var(--usc-garnet)
  Cohort mean band: stroke var(--slate-400), dashed pattern
  Use TrajectoryChart from web/src/components/charts/TrajectoryChart.tsx.
  Axis labels: color var(--warm-fg3) in Recharts tick props.
  Grid lines: stroke var(--warm-border) in Recharts CartesianGrid props.

SECTION 3 — HDA Phase Evolution
  Use HDABarStack from web/src/components/charts/HDABarStack.tsx.
  Phase colors: var(--blue), var(--green), var(--purple), var(--red).

SECTION 4 — Assessment Scores
  Table: rows outside normative range background var(--red-tint) in light mode,
  use :root[data-theme="dark"] override in CSS Module to swap to 
  rgba(C44E52, 0.18) (use color-mix in CSS instead of hardcoded rgba).
  Table borders: var(--warm-border). Text: var(--warm-fg1).

SECTION 5 — QA Notes
  Note card: background var(--warm-card), border var(--warm-border).
  Analyst initials badge: use Badge primitive from 
  web/src/components/primitives/Badge.tsx.
  IRB reminder: "All data accessed via de-identified NANO IDs. IRB #Pro00115234."

ALL TYPOGRAPHY:
  Section headings: font-family var(--font-serif), font-size var(--text-h3).
  Body text: font-family var(--font-sans), font-size var(--text-body).
  Mono values: font-family var(--font-mono), font-size var(--text-small).

BUDDY UPDATE: The "Passport" entry already exists in ChatDrawer.tsx BUDDY_FAST_PATHS.
  Add an INSIGHTS entry in web/src/components/shell/Buddy.tsx:
  "passport-header": { term: "Infant Passport", body: "The Passport shows one de-identified participant's full longitudinal record — visit timeline, HRV, HDA, assessments, and QA notes — without any PHI." }
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
#   VITE_API_BASE_URL=http://localhost:8080  # Local backend URL (Vite proxy target)
#   CLOUDFLARE_API_TOKEN=...     # Only needed for deployment

# 4. Start the React dev server (mocks active, proxies /api/* to 127.0.0.1:8080)
cd web && npm run dev
# → Opens http://localhost:5173
# Vite config (web/vite.config.ts) proxies /api/* to http://127.0.0.1:8080

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
  → Vite build with VITE_USE_MOCKS=true and VITE_FEATURE_* env vars
    Output: web/build/  (controlled by VITE_OUT_DIR in web/vite.config.ts)
  → scripts/build_pages_site.py: packages web/build/ into dist/pages-wrapper/
      - Injects deploy metadata: esd-deploy-stamp, esd-build-sha, esd-api-origin
      - Generates _worker.js that proxies /api/* to live assistant origin
  → wrangler pages deploy dist/pages-wrapper --project-name esd-lab-namo
  → Smoke test: scripts/check_site_health.py probes https://esd-lab-namo.pages.dev/
```

No action needed from you — just push to main and verify CI passes.

### 4.3 Manual Deploy (when CI is unavailable)

```bash
# Step 1: Build the React SPA
cd web
# Pass feature flags as env vars (check Makefile line ~128 for the full recommended set)
VITE_USE_MOCKS=true VITE_FEATURE_PUBLIC_INSIGHTS=true VITE_FEATURE_EXECUTIVE_MODE=true \
  npm run build
# Output: web/build/  (NOT web/dist/ — see web/vite.config.ts build.outDir)
cd ..

# Step 2: Package the Cloudflare Pages artifact
python scripts/build_pages_site.py
# Reads web/build/, injects debug metas, generates _worker.js proxy,
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

# Or via Makefile (recommended):
make pages-build && make pages-deploy
# make pages-build already sets the correct VITE_FEATURE_* env vars (see Makefile ~line 128)
```

### 4.4 Running the Live AI Assistant + Quick Tunnel

The Buddy chat assistant (Cmd+K, implemented in `web/src/components/shell/ChatDrawer.tsx`) requires a running local backend exposed via Cloudflare Tunnel:

```bash
# Start continuous tunnel + assistant backend (regenerates tunnel every ~6h)
bash scripts/share_dashboard.sh --continuous --mode quick

# What this does:
#   1. Starts dashboard/server/live_dashboard_server.py on 127.0.0.1:8080
#   2. Launches cloudflared quick tunnel → gets a trycloudflare.com URL
#   3. Updates dashboard/public/pages_wrapper/manifest.json with new origin URL
#   4. Runs scripts/build_pages_wrapper.py to regenerate the _worker.js proxy
#   5. Deploys updated wrapper to Cloudflare Pages

# To deploy against a specific known tunnel origin:
PAGES_API_ORIGIN=https://your-specific-tunnel.trycloudflare.com \
python scripts/build_pages_site.py
make pages-deploy
```

**⚠️ Important:** The quick tunnel URL rotates every ~6 hours. When it rotates, the AI assistant becomes unreachable on the live site until `bash scripts/share_dashboard.sh` is re-run. The named-tunnel cutover (§4.5) permanently resolves this.

**Graceful offline state (already partially handled):** When `VITE_USE_MOCKS=true`, the AI assistant backend is unreachable. In `web/src/components/shell/AgenticQAPanel.tsx` (and any route that embeds the assistant), show a graceful disabled state:
```tsx
if (import.meta.env.VITE_USE_MOCKS === "true") {
  return (
    <div style={{ padding: "var(--s-16)", color: "var(--warm-fg3)" }}>
      AI assistant requires a running local backend.
      Run <code>bash scripts/share_dashboard.sh</code> to enable.
    </div>
  );
}
```

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

# Step 2: Rotate Cloudflare API token to add Tunnel scope:
# Cloudflare Dashboard → My Profile → API Tokens → Edit token
# Add scope: Account > Cloudflare Tunnel > Edit
# Save → copy new token → update .env

# Step 3: After USC IT creates the CNAME, verify DNS resolution:
host esd-lab-namo.sc.edu

# Step 4: In Cloudflare Zero Trust dashboard (GUI):
# Tunnels → 8b0fa216-b69f-4289-98cf-492c55a710b6 → Public Hostnames
# Add hostname: esd-lab-namo.sc.edu → Service: http://127.0.0.1:8080
# Save

# Step 5: Run named-mode share
bash scripts/share_dashboard.sh --mode named
# Script validates hostname readiness

# Step 6: Rebuild wrapper pointing to stable named hostname
python scripts/build_pages_wrapper.py --origin https://esd-lab-namo.sc.edu --kind named
make pages-deploy
# After this: both esd-lab-namo.pages.dev and esd-lab-namo.sc.edu resolve to the 
# same stable origin. Quick tunnel dependency eliminated.
```

### 4.6 Enabling Feature Flags Step-by-Step

```bash
# OPTION A — Build-time env vars (preferred, no file change needed)
# Add the flag to the make pages-build command in Makefile (~line 128):
VITE_USE_MOCKS=true VITE_FEATURE_PUBLIC_INSIGHTS=true npm --prefix web run build
python scripts/build_pages_site.py

# OPTION B — Static file edit (affects all builds)
# 1. Open the flags file
# web/src/config/featureFlags.ts

# 2. Change false → true for your target flag(s)
# Example diff:
-  PUBLIC_INSIGHTS: false,
+  PUBLIC_INSIGHTS: true,

# 3. Verify mock data exists for the new route's data hooks.
#    All v2 API mocks live in web/src/api/mockServer.ts.
#    The mock for most v2 endpoints is already implemented.
#    Grep to confirm:
grep -r "v2/rsa-trajectories\|v2/hda-composition\|v2/attrition-funnel" web/src/api/mockServer.ts

# 4. Check dashboard/data/dashboard_data.json for the seed values used by the mock.
#    The mock server reads data from dashboard/data/dashboard_data.json
#    (via the backend) or from inline mock fixtures in mockServer.ts.

# 5. Test locally
cd web && npm run dev
# Navigate to the new route, check browser console for errors

# 6. Deploy (using OPTION A env vars in Makefile)
git add web/src/config/featureFlags.ts
git commit -m "feat(flags): enable PUBLIC_INSIGHTS"
git push origin main
# CI deploys automatically via .github/workflows/deploy-pages.yml
```

### 4.7 Adding Mock Data for New Routes

```bash
# All mock JSON lives in:
dashboard/data/dashboard_data.json      # core study/participant/pipeline data
dashboard/data/readings_data.json       # publications/readings library
dashboard/data/runtime_status.json      # tunnel/health status

# In-browser mock interception is in: web/src/api/mockServer.ts
# This file uses MSW-style fetch interception (VITE_USE_MOCKS=true).
# All v2 API mocks should be added here following existing patterns.

# Example: adding a new multimodal endpoint mock
# 1. Add the mock handler in web/src/api/mockServer.ts
#    following the pattern of existing handlers, e.g.:
#    if (url.pathname.startsWith("/api/v2/multimodal/")) {
#      const [nanoId, visitAge] = url.pathname.replace("/api/v2/multimodal/", "").split("/");
#      return jsonResponse(buildMultimodalMock(nanoId, visitAge));
#    }

# 2. Add Zod schema in web/src/api/schemas.ts
export const MultimodalSessionResponse = z.object({
  ecg: z.object({ t: z.array(z.number()), mv: z.array(z.number()), rPeaks: z.array(z.number()) }),
  rsa: z.object({ t: z.array(z.number()), hfPower: z.array(z.number()) }),
  hda: z.object({ epochs: z.array(z.object({ start: z.number(), end: z.number(), phase: HdaPhase })) }),
  gaze: z.object({ events: z.array(z.object({ t: z.number(), target: z.string(), duration: z.number() })) }),
});

# 3. Add TanStack Query hook in web/src/api/hooks.ts
export function useMultimodalSession(nanoId: string | undefined, visitAge: number | string | undefined) {
  return useQuery({
    enabled: Boolean(nanoId) && visitAge !== undefined,
    queryKey: ["v2", "multimodal", nanoId, visitAge],
    queryFn: () => api.get(`/api/v2/multimodal/${nanoId}/${visitAge}`, S.MultimodalSessionResponse),
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
  });
}

# 4. Add backend handler in dashboard/server/live_dashboard_server.py
#    Register "/multimodal" in SPA_ROUTE_PREFIXES tuple (~line 55).
#    Add GET /api/v2/multimodal/<nanoId>/<visitAge> handler.
#    Implement _v2_multimodal(nano_id, visit_age_raw) function
#    following the pattern of _v2_dyad_coregulation (line ~860).
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

**Current issue:** All metric KPI cards display `0` or `Loading…` in production because `VITE_USE_MOCKS=true` serves empty seed values from `dashboard/data/dashboard_data.json`.

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

NOTE: The StudySummary Zod schema (web/src/api/schemas.ts) expects the shape:
  { enrolled, target, groups: { VPT: {count, target}, ASIB: {count, target}, TD: {count, target} } }
Verify that the seed data matches this schema. The GroupCode normalizer in schemas.ts
maps "PT" → "VPT" — use "VPT" in the mock JSON.

Update dashboard/data/dashboard_data.json → "runs" array to include 5 realistic entries.
RunStatus enum values are: "queued" | "running" | "done" | "fail" | "idle"
(NOT "complete" or "failed" — use the exact enum values from web/src/api/schemas.ts).

Update trajectory mock data with realistic group curves following the existing
"trajectory" → "rmssd" structure. Group code must be "VPT" not "PT".
```

**SEO & accessibility fixes:**
- Add `<meta name="description">` to `web/index.html`: *"NANO Study Dashboard — ESD Lab, University of South Carolina. Longitudinal neurodevelopmental research tracking 260 very preterm infants."*
- Add `<meta property="og:title">` and `<meta property="og:description">` for social sharing previews.
- All Lucide icons in the Landing nav that are decorative should have `aria-hidden="true"`.
- Navigation icons that convey meaning need `aria-label="[section name]"`.
- The `AmbientOrbit` animation in `web/src/components/warm/AmbientOrbit.tsx` should respect `prefers-reduced-motion`. Add to its CSS Module or to `web/src/styles/global.css`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    .orbit, .orbitTrail { animation: none !important; }
  }
  ```

**Study Status Banner (add to `web/src/routes/Landing.tsx`):**
```tsx
// Add between hero and nav sections. Style uses CSS tokens only:
<div
  style={{
    background: "var(--warm-pill)",
    borderBottom: "1px solid var(--warm-border)",
    padding: "var(--s-8) var(--s-24)",
    display: "flex", alignItems: "center", gap: "var(--s-8)",
    fontSize: "var(--text-small)", color: "var(--warm-fg2)",
  }}
>
  <span
    style={{ color: "var(--green)", fontWeight: "var(--w-bold)" }}
    aria-hidden="true"
  >●</span>
  <span>NANO Study · Actively Enrolling · {enrolled} / {target} participants</span>
  <a
    href="https://www.esdlabsc.com"
    target="_blank"
    rel="noopener noreferrer"
    style={{ marginLeft: "auto", color: "var(--fg-link)", display: "flex", alignItems: "center", gap: "4px" }}
  >
    Learn more about participating <ArrowRight size={14} aria-hidden />
  </a>
</div>
```

**Library section:** The "Library" nav section in Landing is currently empty. Seed `dashboard/data/readings_data.json` with these 3 real ESD Lab publications:
- PMC13109926 — "Social Behavior Forecasts Moment-to-Moment Changes in RSA in Infants With Autism"
- PMC9673985 — "Capturing the Complexity of Autism: Applying a Developmental Cascades Framework"
- PMC12333485 — "Early Development in Autism: How Developmental Cascades Help Us Understand..."

### 5.2 Overview Page (/overview) — Operator UX Polish

**AnimatedDAG legend (`web/src/components/warm/AnimatedDAG.tsx`):** Add a legend row below the pipeline DAG:
```
● Ingestion  ● QA  ● Feature Extraction  ● Imputation  ● Model Training
"Traveling dots = active epoch batches moving through the pipeline"
Legend text: color var(--warm-fg3), font-size var(--text-micro).
Dot colors: use the same color tokens as the DAG stage nodes.
```

**ParticipantFlow card (`web/src/components/warm/ParticipantFlow.tsx`):** Add:
- `(view all →)` link to `/participants` in the card footer — color `var(--fg-link)`.
- A small group badge next to each participant row using `GroupTag` from `web/src/components/warm/GroupTag.tsx`.

**AgenticQAPanel disabled state (`web/src/components/warm/AgenticQAPanel.tsx`):**
```tsx
// When VITE_USE_MOCKS=true, backend is unreachable. Show graceful disabled state:
if (import.meta.env.VITE_USE_MOCKS === "true") {
  return (
    <div style={{ padding: "var(--s-16)", color: "var(--warm-fg3)", fontSize: "var(--text-small)" }}>
      AI assistant requires a running local backend.
      Run <code>bash scripts/share_dashboard.sh</code> to enable.
    </div>
  );
}
```

**ReadingsGeoMap county map (`web/src/components/warm/ReadingsGeoMap.tsx`):** Add county name + participant count tooltip on hover using the `Tooltip` primitive from `web/src/components/primitives/Tooltip.tsx`. Currently regions are colored but show no tooltip.

**Last synced timestamp in `web/src/components/shell/TopNav.tsx`:**
The `TopNav` already receives `idleMinutes` and `onForceSync` props. Add a relative time display next to the sync button:
```tsx
// In TopNav.tsx, the sync button area — add before the sync button:
<span className="text-[10px] font-mono text-[color:var(--warm-fg4)]">
  {formatRelativeTime(lastSyncAt)}
</span>
```
Store `lastSyncAt` in `web/src/store/ui.ts` and update it on each successful sync.

**ClusterOpsPanel:** Add `"Learn more about outcome clusters →"` link pointing to `/cluster-viewer` using `var(--fg-link)` color.

### 5.3 Sidebar Navigation — Polish (`web/src/components/shell/Sidebar.tsx`)

**Active Studies nav items:** Currently all point to `/overview` or `/participants` without differentiation. Replace the three Active Studies items in `NAV_GROUPS` (the `"studies"` group):
```typescript
// In web/src/components/shell/Sidebar.tsx, NAV_GROUPS "studies" group items:
{ to: "/overview", label: "NANO Study (VPT)", icon: "activity" },
{ to: "/participants?study=home", label: "Home Study", icon: "home" },
{ to: "/participants?study=fiscal", label: "FiSCAL-ASD", icon: "baby" },
```
Then in `web/src/routes/Participants.tsx`, read the `?study=` query param via `useSearchParams()` (React Router v6) and pre-filter rows.

**Keyboard shortcuts tooltip:** Add a collapsed `<details>` at the sidebar footer. Use CSS tokens:
```
text color: var(--warm-fg4)
background: var(--warm-pill)
border: var(--warm-border)
font-family: var(--font-mono)
font-size: var(--text-micro)
```

**QA badge pulse animation:** When `qaPending > 0`, the badge should pulse. Add to `web/src/components/shell/Sidebar.module.css` or `web/src/styles/global.css`:
```css
@keyframes badge-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.badge-pending { animation: badge-pulse 1.5s ease-in-out infinite; }
/* Respect reduced motion: */
@media (prefers-reduced-motion: reduce) {
  .badge-pending { animation: none; }
}
```

**"NEW" badge for recently enabled flags:** Implement a `FEATURE_FLAG_RELEASE_DATES` map in `web/src/config/featureFlags.ts` (add it as a separate `export const`):
```typescript
// Add to web/src/config/featureFlags.ts
export const FEATURE_FLAG_RELEASE_DATES: Partial<Record<FeatureFlag, string>> = {
  PUBLIC_INSIGHTS: "2026-06-15",
  EXECUTIVE_MODE: "2026-06-15",
};
```
In `web/src/components/shell/Sidebar.tsx`, check if `Date.now() < new Date(releaseDate).getTime() + 14 * 24 * 60 * 60 * 1000` and show a small `NEW` badge using the `Badge` primitive from `web/src/components/primitives/Badge.tsx`.

**Dark mode sidebar:** The sidebar uses `bg-white border-r` Tailwind classes. In dark mode, these must resolve correctly. `web/src/styles/global.css` already provides:
```css
:root[data-theme="dark"] .bg-white { background-color: var(--warm-card) !important; }
```
Verify the sidebar border uses `border-[color:var(--warm-border)]` (not a hardcoded color class) so it switches in dark mode.

### 5.4 QA Page (/qa) — Epoch Review Polish

**Epoch tile waveforms (`web/src/components/qa/EpochTile.tsx`):** Add a micro spark line:
```tsx
// In EpochTile.tsx, add a Sparkline component — the primitive already exists at
// web/src/components/primitives/Sparkline.tsx. Use it to render the IBI series.
// The Sparkline accepts a data array; no new canvas element needed.
// Color: var(--green) for clean epochs, var(--red) for noise/flatline.
// This requires the epoch data schema (web/src/api/schemas.ts Epoch type)
// to include ibi_series: z.array(z.number()).optional()
```

**Batch actions:** Add a "Select All Flagged → Reject All" batch action button above the epoch grid in `web/src/routes/QA.tsx`. Use the `Button` primitive from `web/src/components/primitives/Button.tsx`. Dispatch a batch action through `epochReducer` in `web/src/components/qa/epochReducer.ts` (extend the reducer with a new `"rejectAll"` action type).

**Epoch inspector improvements (`web/src/components/qa/EpochInspector.tsx`):**
- Compare with prior epoch: add a side-by-side layout using CSS Grid (`grid-template-columns: 1fr 1fr`), each panel background `var(--warm-card)`, border `var(--warm-border)`.
- Rejection reason dropdown: `<select>` styled with CSS Module; options: `[Motion artifact | Flatline | Noise burst | Electrode dropout | Out of range]`. Use `var(--warm-fg1)` for option text, `var(--warm-card)` for select background.
- Yield counter: `font-family: var(--font-mono); color: var(--warm-fg2)`.

**Fast paths for QA:** Add 3 quick-prompt buttons in `web/src/routes/QA.tsx` that call `setChatSeed()` then `setChatOpen(true)` from `useUi` in `web/src/store/ui.ts`. This is the correct pattern for seeding the assistant already used in `web/src/components/shell/TopNav.tsx`.

**Dark mode QA:** Epoch tiles in dark mode need:
```css
/* In web/src/components/qa/EpochTile.module.css */
:root[data-theme="dark"] .tile {
  background: var(--warm-card);
  border-color: var(--warm-border);
}
:root[data-theme="dark"] .tile.accept {
  background: color-mix(in srgb, var(--green) 12%, var(--warm-card));
  border-color: color-mix(in srgb, var(--green) 30%, var(--warm-border));
}
:root[data-theme="dark"] .tile.reject {
  background: color-mix(in srgb, var(--red) 12%, var(--warm-card));
  border-color: color-mix(in srgb, var(--red) 30%, var(--warm-border));
}
```

### 5.5 Results Page (/results) — Chart Polish

**RSA chart (`web/src/components/charts/RsaGrowthChart.tsx`):** Enable `RSA_GROWTH_CURVES` flag. When enabled, ensure:
- CI bands: Recharts `<Area>` component with `fillOpacity={0.15}` for each cohort.
- Annotation at 9 months: Recharts `<ReferenceLine x={9} stroke="var(--usc-garnet)" strokeDasharray="4 2">` with a `<Label>` child.
- Y-axis label: set via Recharts `<YAxis label={{ value: "RSA (log HF power, ms²)", angle: -90, ... }}>` with `fill: "var(--warm-fg3)"`.
- Axis tick color: pass `tick={{ fill: "var(--warm-fg3)" }}` to `<XAxis>` and `<YAxis>`.
- Grid lines: `<CartesianGrid stroke="var(--warm-border)" strokeOpacity={0.6} />`.

**RMSSD trajectory axis labels (`web/src/components/charts/TrajectoryChart.tsx`):**
- X-axis label: "Corrected Gestational Age (months)" vs "Chronological Age (months)"
- The `AgeBasis` toggle must actually change both the axis label text **and** the data passed to the chart — verify this in `web/src/routes/Results.tsx` where `useRsaTrajectories(ageBasis)` is called. The ageBasis param is passed to the endpoint as `?age=adjusted|chronological`.

**HDA bar stack chart (`web/src/components/charts/HDABarStack.tsx`):** Add a legend below the chart using CSS token phase colors:
```tsx
// Legend items: phase name + color swatch
// Colors must use CSS variables, NOT hardcoded hex:
//   Orienting:   var(--blue)
//   Sustained:   var(--green)
//   Inattention: var(--purple)
//   Termination: var(--red)
// Legend text: color var(--warm-fg2), font-size var(--text-small)
```

**Fast paths in Results:** The existing `RESULTS_FAST_PATHS` use `setChatSeed()` + `setChatOpen()` from `useUi`. Add 2 more fast paths following the same pattern:
```typescript
// Add in web/src/routes/Results.tsx
{ lane: "model", label: "Compare ASIB vs TD RSA at 9mo", 
  prompt: "Compute Cohen's d for ASIB vs TD RSA at 9 months CGA. Include bootstrapped 95% CI." },
{ lane: "qa", label: "Flag outlier participants",
  prompt: "Which participants have RMSSD values > 2 SD from their cohort mean at any timepoint? List NANO IDs." }
```

### 5.6 General Dashboard-Wide Polish

**CSS token enforcement (critical for dark/light mode consistency):**
- The design system has two CSS token files: `web/src/styles/tokens.css` (core) and `web/src/styles/global.css` (extended warm palette + dark overrides).
- Dark mode is activated by `data-theme="dark"` on `<html>`, set by `web/src/store/ui.ts`. The theme persists in `localStorage` under its own key.
- All component CSS Modules must use `var(--warm-*)` tokens for surfaces and text, and `var(--usc-garnet)`, `var(--blue)`, `var(--green)`, `var(--red)`, `var(--purple)` for semantic colors.
- **Never use hardcoded hex colors in component CSS.** Run this audit before each deploy:
  ```bash
  grep -rn "#[0-9a-fA-F]\{3,6\}" web/src/routes/ web/src/components/ --include="*.css" --include="*.module.css"
  ```
  Any hits that aren't in `global.css` or `tokens.css` are violations.
- Recharts charts must pass `tick={{ fill: "var(--warm-fg3)" }}` to axis components and `stroke="var(--warm-border)"` to CartesianGrid. Hardcoded Recharts fill strings like `"#8884d8"` must be replaced with CSS token references.

**HIPAA banner (`web/src/components/shell/HipaaBanner.tsx`):**
- IRB number is `Pro00115234` (verify it matches exactly what's in the file).
- Dismissible: banner dismiss state is already managed by `useUi` in `web/src/store/ui.ts` via `showHipaa` / `setHipaa`. The banner uses `sessionStorage` indirectly through the Zustand `persist` middleware (configured to use `sessionStorage`).
- HIPAA banner tokens (`--hipaa-notice-bg`, `--hipaa-fg`, `--hipaa-border`, `--hipaa-icon`) already have dark mode overrides in `web/src/styles/global.css` under `:root[data-theme="dark"]`. Verify they render correctly in both modes.

**Error boundaries:** Wrap each major route's data-dependent section in a React `<ErrorBoundary>` that shows:
```tsx
// Error state uses CSS tokens for theme-correctness:
<div style={{
  padding: "var(--s-32)", textAlign: "center",
  color: "var(--warm-fg2)", background: "var(--warm-bg)"
}}>
  <p style={{ color: "var(--red)", marginBottom: "var(--s-8)" }}>
    Something went wrong loading this view.
  </p>
  <code style={{ color: "var(--warm-fg4)", fontSize: "var(--text-small)", fontFamily: "var(--font-mono)" }}>
    {error.message}
  </code>
</div>
```

**Loading skeletons:** Replace `Loading…` plain text with the existing `Sparkline` or custom skeleton shims. A gray animated placeholder:
```css
/* Add to web/src/styles/global.css */
.skeleton {
  background: linear-gradient(90deg, var(--warm-border) 25%, var(--warm-pill) 50%, var(--warm-border) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: var(--r-2);
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
```

**Mobile responsiveness (`web/src/components/shell/AppShell.tsx` + `AppShell.module.css`):** Add a hamburger menu toggle for viewports under 768px:
```tsx
// In AppShell.tsx, add:
const [sidebarOpen, setSidebarOpen] = useState(false);
// Use CSS class .shellSidebarOpen from AppShell.module.css to control overlay.
// Add backdrop <div> with onClick={() => setSidebarOpen(false)} when sidebarOpen.
// Close on route change: add useEffect that calls setSidebarOpen(false) on location change.
```
The sidebar `<aside>` in `web/src/components/shell/Sidebar.tsx` must apply a transform when collapsed:
```css
/* In Sidebar.module.css or AppShell.module.css */
@media (max-width: 767px) {
  .sidebar { transform: translateX(-100%); transition: transform var(--dur-base) var(--ease-sharp); }
  .sidebar.open { transform: translateX(0); }
}
/* No will-change on the sidebar; it's not in a hot animation path */
```

**Gradient text and font consistency:**
- Section headings across all routes should use `font-family: var(--font-serif)`.
- Body text: `font-family: var(--font-sans)`.
- Mono values (IDs, metrics, timestamps): `font-family: var(--font-mono)`.
- USC garnet gradient text (used in hero headers): use `background: linear-gradient(135deg, var(--usc-garnet) 0%, var(--usc-garnet-600) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;`. This is theme-safe because the gradient uses tokens, not hex. In dark mode the garnet tokens remain the same (they are brand-fixed colors), ensuring correct contrast against the dark background.
- Never use `color: linear-gradient(...)` (invalid CSS) — always use the background-clip pattern above.

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
Link to docs/governance/CONTRIBUTING.md.
Add: "New contributors: run the Guided Explorer at /guided-explorer for an interactive tour."

## ⚠️ HIPAA Compliance
Keep existing warning block.
Add IRB number: Pro00115234.
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
□ npm run test passes in web/ (vitest, config: web/vitest.config.ts)
□ No console errors on / and /overview (manual spot check)
□ scripts/check_site_health.py exits 0 after deploy
□ HIPAA banner visible; IRB number reads "Pro00115234" (NOT Pro00129478)
□ No new hardcoded hex colors in component CSS Modules — use CSS token audit:
  grep -rn "#[0-9a-fA-F]\{3,6\}" web/src/routes/ web/src/components/ --include="*.module.css"
□ Recharts charts: axes use var(--warm-fg3) ticks, grid uses var(--warm-border) stroke
□ Feature flags changed: update FEATURE_FLAG_RELEASE_DATES in web/src/config/featureFlags.ts
□ Feature flag enabled via build env: update Makefile pages-build line with VITE_FEATURE_<FLAG>=true
□ New route added: add to web/src/App.tsx (lazy import + Route), web/src/components/shell/Sidebar.tsx (NAV_GROUPS), dashboard/server/live_dashboard_server.py (SPA_ROUTE_PREFIXES ~line 55), and this prompt file §1.3
□ New mock endpoint: add handler to web/src/api/mockServer.ts, Zod schema to web/src/api/schemas.ts, hook to web/src/api/hooks.ts, SPA route prefix to dashboard/server/live_dashboard_server.py
□ New component with hover context: add INSIGHTS entry in web/src/components/shell/Buddy.tsx
□ New complex workflow: add BUDDY_FAST_PATHS entry in web/src/components/shell/ChatDrawer.tsx
□ Animation added: wrapped in @media (prefers-reduced-motion: no-preference)
□ CHANGELOG.md updated with [date] entry
□ TECH_DEBT.md checked — address any F/E complexity hotspots before they become G
□ Dark mode verified: toggle theme via ThemeToggle in TopNav, check all new surfaces
□ Mobile check: resize to 375px, verify sidebar collapses, text doesn't overflow
```

---

*End of ESD Lab NANO Dashboard Master Prompt File*
*Last updated: June 11, 2026 by Namit Shrivastava (refined from June 10, 2026 version)*
*Sources: esd-lab-namo.pages.dev, github.com/namo507/ESD-Lab-USC, esdlabsc.com, Dashboard-Idea-Generation-Report.md, live codebase audit June 11, 2026*
