# ESD Lab NANO Dashboard — Full Feature Implementation Prompt

## Overview

This document is a complete, developer-ready implementation prompt for adding all suggested features and visualizations to the live NANO Dashboard (`esd-lab-namo.pages.dev`). It is written to be passed directly to an AI coding agent (e.g., Claude, GPT-4.1, Cursor, or Windsurf) that has access to the full repository codebase. Every instruction is safe-first — no existing routes, components, API contracts, REDCap hooks, MATLAB pipeline integrations, or authentication flows are to be modified unless the instruction explicitly says so.

***

## System Context for the Coding Agent

You are working on a **React + Vite** frontend deployed to Cloudflare Pages at `esd-lab-namo.pages.dev`, backed by a Python/FastAPI (or equivalent) API server tunneled via Cloudflare Workers at the `trycloudflare.com` subdomain. The app is called **NANO Dashboard** and serves the Early Social Development (ESD) Lab at the University of South Carolina.

**Existing confirmed stack:**
- **Frontend:** React, React Router, TanStack Query (`query-C6Llx0fO.js`), Tailwind CSS with a `garnet` custom color token, Vite + Rolldown bundler
- **Backend API:** Serves session, participant, REDCap, MATLAB pipeline, stage, batch, and visit_log data
- **Data sources:** REDCap (webhooks + hooks), MATLAB (Actiheart ECG @ 1024 Hz, Grant Squirrel temperature loggers), Datayu JavaScript behavioral tasks, NDA compliance outputs
- **Security:** HIPAA-compliant; de-identified participant IDs (NANOIDs); no PHI on frontend

**Non-negotiable safety rules for this implementation:**
1. Never modify existing route paths (`/`, `/overview`, or any current route).
2. Never change existing component props, context shapes, or TanStack Query key names.
3. All new API endpoints must be additive (`GET /api/v2/...`) and must not replace existing ones.
4. All new components must be lazy-loaded with `React.lazy` + `Suspense` so they do not bloat the initial bundle.
5. All new data fetches must use TanStack Query's `useQuery` with explicit `staleTime` and `gcTime` options.
6. Use the existing Tailwind `garnet` color token and design system for all new UI. Do not introduce a new CSS framework or global style override.
7. All new features must be behind an `enabled` feature flag in a central `featureFlags.ts` config file, defaulting to `false` so they can be toggled on one at a time.
8. All new pages/panels must be accessible via the existing sidebar navigation by adding a new nav entry — do not restructure the existing sidebar component, only append entries.

***

## Phase 1 — Infrastructure (Do First, No UI Impact)

### 1.1 Feature Flag System

Create `src/config/featureFlags.ts`:

```typescript
export const FEATURE_FLAGS = {
  RSA_GROWTH_CURVES: false,
  HDA_TIMELINE_PLAYER: false,
  THERMAL_HEATMAP: false,
  SWIMMER_PLOT: false,
  ATTRITION_FUNNEL: false,
  SDOH_MAP: false,
  SHAP_BEESWARM: false,
  CLUSTER_VIEWER: false,
  MODEL_LEADERBOARD: false,
  CASCADE_SANKEY: false,
  SPATIAL_ASSESSMENT_MATRIX: false,
  ATTACHMENT_HEATMAP: false,
  REDCAP_COMPLETENESS: false,
  ECG_QUALITY_MONITOR: false,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
```

Create a `useFeatureFlag(flag: FeatureFlag): boolean` hook in `src/hooks/useFeatureFlag.ts` that reads from this config. Wrap every new route and component with this hook. If the flag is `false`, render `null`.

### 1.2 New API Route Contracts (Backend — Additive Only)

Add the following GET endpoints to the backend. Each must return JSON with a top-level `data` array and a `meta` object containing `generatedAt` (ISO timestamp) and `participantCount`. All endpoints must enforce HIPAA de-identification — no names, DOBs, or exact addresses in responses; only NANOID identifiers and adjusted-age timestamps.

| Endpoint | Description | Key Response Fields |
|---|---|---|
| `GET /api/v2/rsa-trajectories` | Group-level RSA mean + 95% CI at each visit | `group`, `ageMonths`, `rsaMean`, `rsaCI_lower`, `rsaCI_upper`, `n` |
| `GET /api/v2/hda-session/:nanoid/:visitAge` | Per-infant HDA phase + ECG timeseries for one visit | `timestampMs`, `rrIntervalMs`, `hdaPhase`, `stimulusType`, `gazeOnFace` |
| `GET /api/v2/thermal-heatmap/:nanoid` | 28-day NICU CPTd + HRC grid | `day`, `hour`, `cptd`, `hrcScore`, `medicalEvent` |
| `GET /api/v2/cohort-swimmer` | All participants × all visits with completion status | `nanoid`, `group`, `visitAge`, `status`, `measuresCompleted`, `dropoutReason` |
| `GET /api/v2/attrition-funnel` | Counts at each visit node by group and dropout reason | `visitAge`, `group`, `retained`, `dropoutCount`, `dropoutReason` |
| `GET /api/v2/sdoh-map` | County-level SDOH + enrollment density | `countyFIPS`, `prapareScore`, `enrolledCount`, `retainedCount`, `medianIncome` |
| `GET /api/v2/shap-values` | Per-participant SHAP values for current best model | `nanoid`, `feature`, `shapValue`, `featureValue`, `timeWindow` |
| `GET /api/v2/cluster-tsne` | t-SNE coordinates + DBSCAN cluster labels | `nanoid`, `group`, `x`, `y`, `clusterId`, `adosCSSat36m` |
| `GET /api/v2/model-leaderboard` | All trained model versions + CV metrics | `modelId`, `algorithm`, `r2Train`, `r2CV`, `r2Val`, `rmse`, `features`, `createdAt` |
| `GET /api/v2/cascade-dag` | Node + edge structure for developmental cascade DAG | `nodeId`, `label`, `timepoint`, `edges: [{to, beta, pValue}]` |
| `GET /api/v2/redcap-completeness` | Per-participant × per-instrument completion status | `nanoid`, `instrument`, `visitAge`, `status`, `ndaRequired`, `percentComplete` |
| `GET /api/v2/ecg-quality` | Per-infant signal quality by day/hour | `nanoid`, `day`, `hour`, `qualityPct`, `artifactType`, `excluded` |

### 1.3 Shared Visualization Dependencies

Install the following libraries. They are tree-shaken and will not increase bundle size for unused features:

```bash
npm install recharts d3 @visx/visx react-leaflet leaflet deck.gl @nivo/core @nivo/sankey @nivo/chord
```

Create a shared `src/components/charts/` directory. All new chart components live here with barrel exports.

***

## Phase 2 — New Dashboard Pages

Each page below is a new lazy-loaded route appended to the existing router. Add each route as:

```tsx
{
  path: "/[route-name]",
  lazy: () => import("./pages/[PageName]"),
}
```

Add a corresponding nav entry in the existing sidebar nav array using the existing nav item component pattern, with an appropriate Lucide icon.

***

### Page 1: RSA Growth Curves (`/rsa-trajectories`)

**Feature flag:** `RSA_GROWTH_CURVES`

**Purpose:** Visualize how Respiratory Sinus Arrhythmia (RSA) matures from 1–24 months across ASIB, PT, and TD cohorts, directly corresponding to the Latent Growth Curve Model outputs from Aim 1.

**Component:** `src/pages/RsaTrajectoriesPage.tsx`

**Implementation details:**
- Fetch data from `GET /api/v2/rsa-trajectories` using `useQuery`.
- Render a `recharts` `LineChart` with three `Line` components (one per group: ASIB = red, PT = orange, TD = green) matching the existing garnet palette.
- For each group, render a semi-transparent `Area` band between `rsaCI_lower` and `rsaCI_upper` (95% bootstrap CI).
- X-axis: `ageMonths` (1, 3, 6, 9, 12, 18, 24). Provide a toggle button for "Adjusted Age" vs. "Chronological Age" — this sends a `?ageType=adjusted|chronological` query param to the API.
- Y-axis: RSA in ms (natural log scale optional, controlled by a checkbox).
- Hover tooltip: display `group`, `rsaMean ± SD`, `n` at that timepoint.
- Add a "Download SVG" button using `recharts` ref export for manuscript-ready figures.
- Below the chart, render a small data table with the exact mean, CI, and n per group per timepoint using the existing ESD Lab table component pattern.

***

### Page 2: HDA Session Timeline Player (`/hda-player`)

**Feature flag:** `HDA_TIMELINE_PLAYER`

**Purpose:** Frame-by-frame synchronized viewer of ECG + HDA phase + gaze behavior for any individual infant visit.

**Component:** `src/pages/HdaPlayerPage.tsx`

**Implementation details:**
- Add a participant selector (searchable dropdown by NANOID) and a visit age selector (1mo, 3mo, 6mo, 9mo, 12mo).
- On selection, fetch `GET /api/v2/hda-session/:nanoid/:visitAge`.
- Render three vertically stacked SVG tracks using `d3` (do not use canvas — SVG is inspectable and exportable):
  - **Track 1 — ECG R-R Intervals:** Line plot of `rrIntervalMs` vs. `timestampMs`. Color the line blue during orienting, green during sustained attention, and gray during termination based on `hdaPhase`.
  - **Track 2 — HDA Phase Gantt:** Colored horizontal bars per phase. Orienting = `#3B82F6`, Sustained = `#22C55E`, Termination = `#6B7280`. Bar height is fixed, length is duration.
  - **Track 3 — Gaze + Stimulus:** Categorical lanes: top lane = `gazeOnFace` (boolean, shown as filled bar), bottom = `stimulusType` (color coded: social-video, nonsocial-video, social-interaction, nonsocial-interaction).
- Add a scrubber playhead that all three tracks scroll in sync.
- Add playback controls: play, pause, step-forward 100ms, step-back 100ms, playback speed (0.25×, 0.5×, 1×, 2×).
- Add an "HDA Depth" annotation: wherever `hdaPhase === 'sustained'`, calculate `maxHR - minHR` in that window and display it as a tooltip annotation above Track 1.
- Add a "Compare" mode toggle that loads a second infant side-by-side in the same viewport.

***

### Page 3: NICU Thermal Heatmap (`/thermal-heatmap`)

**Feature flag:** `THERMAL_HEATMAP`

**Purpose:** Visualize 28-day CPTd + HRC time-series for VPT infants in the NICU, identifying diurnal patterns of ANS dysfunction.

**Component:** `src/pages/ThermalHeatmapPage.tsx`

**Implementation details:**
- Participant selector (PT group only, filtered automatically).
- Fetch `GET /api/v2/thermal-heatmap/:nanoid`. Expect `~40,000` rows; the API should pre-aggregate to day × hour grid cells server-side.
- Render a `d3` heatmap grid: X-axis = Day (1–28+), Y-axis = Hour of day (0–23).
- Cell color scale: two-tailed diverging scale centered at normal CPTd (1–2°C): deep red for `cptd < 0` (abnormal sympathetic activation), deep blue for `cptd > 2` (atypical), white/neutral for normal range.
- Overlay: If `medicalEvent` is non-null for a cell, render a small icon (🔴 for ventilator, ⭐ for IVH, ✚ for infection, ⚡ for surgery) inside that cell.
- Below the heatmap, render a secondary line chart of `hrcScore` over day (averaged across hours) with a horizontal reference line at `hrcScore = 1` (the abnormal threshold per the grant protocol).
- Add a "HRC Anomaly Days" badge showing count of days where mean HRC > 1.
- Export button: downloads the grid as a CSV with all raw day/hour/CPTd/HRC values for the selected participant.

***

### Page 4: Cohort Swimmer Plot (`/swimmer-plot`)

**Feature flag:** `SWIMMER_PLOT`

**Purpose:** Display per-participant visit completion status across the full 36-month longitudinal timeline in a Gantt-style swimmer lane visualization.

**Component:** `src/pages/SwimmerPlotPage.tsx`

**Implementation details:**
- Fetch `GET /api/v2/cohort-swimmer`.
- Render an SVG swimmer plot using `d3`:
  - Each row = one participant (NANOID on Y-axis, truncated for screen space).
  - X-axis = visit age in months (1, 3, 6, 9, 12, 18, 24, 36).
  - Render a filled circle at each visit position. Fill color encodes `status`: `completed` = garnet green, `missed` = red, `pending` = gray outline, `withdrawn` = ✕ symbol.
  - Render a thin horizontal line connecting all visits for that participant (their "swim lane").
  - Overlay icons for key clinical events: ADOS-2 (at 18m/24m/36m), Bayley-4, SORF, EPDS maternal depression.
- **Filters panel (left sidebar):** Filter rows by `group` (ASIB/PT/TD), `dropoutReason`, enrollment cohort year, and sex.
- **Sort options:** Sort by NANOID, enrollment date, 36m ASD outcome (if unblinded), or % visits completed.
- Clicking a row opens a slide-over drawer showing that participant's full visit history with form-level completion for each visit.
- Add a summary bar at the top: total enrolled, % retained at 12mo, % retained at 36mo, broken out by group.

***

### Page 5: Attrition & Missing Data (`/attrition`)

**Feature flag:** `ATTRITION_FUNNEL`

**Purpose:** Dynamic Sankey/funnel showing cohort flow from enrollment through 36 months, with a missingness matrix.

**Component:** `src/pages/AttritionPage.tsx`

**Layout:** Two-panel layout (left = Sankey funnel, right = missingness matrix).

**Left panel — Attrition Sankey:**
- Use `@nivo/sankey` to render nodes (visit timepoints) and links (retained participants flowing to next node, branching dropouts).
- Nodes: Enrolled → 1mo → 3mo → 6mo → 9mo → 12mo → 24mo → 36mo.
- Dropout links: branch out to labeled dropout reasons (family unavailable, moved, medical exclusion, refusal, lost to follow-up).
- Node and link width scales with participant count.
- Color nodes by group (use garnet palette). Toggle: show all groups overlaid, or show one group at a time.
- Tooltip: hover any link to see exact N, %, and primary dropout reason.

**Right panel — Missingness Matrix:**
- Render a `d3` cell grid: rows = participants (sorted by % missing), columns = assessment instruments × visit age.
- Cell color: `observed` = white, `MCAR` = light blue, `MAR` = medium blue, `MNAR` = dark blue, `imputed` = yellow, `excluded` = red.
- Add marginal bar charts: row margins show per-participant % missing; column margins show per-instrument % missing.
- Bottom strip: kernel density overlay of imputed vs. observed distributions for a selected continuous variable (chosen via dropdown: RSA, HDA duration, ADOS CSS, Bayley composite).

***

### Page 6: SDOH Geographic Map (`/sdoh-map`)

**Feature flag:** `SDOH_MAP`

**Purpose:** Choropleth map of South Carolina counties showing SDOH risk scores, enrollment density, and attrition geography.

**Component:** `src/pages/SdohMapPage.tsx`

**Implementation details:**
- Use `react-leaflet` + `leaflet` with OpenStreetMap tiles.
- Fetch `GET /api/v2/sdoh-map`.
- Fetch South Carolina county GeoJSON from a static file bundled in `public/sc-counties.geojson` (add this file to the repo; source from US Census TIGER/Line).
- Color each county polygon using a sequential color scale on `prapareScore` (low risk = light, high risk = dark garnet).
- Overlay circle markers at county centroids sized by `enrolledCount`.
- On hover: tooltip showing county name, PRAPARE Risk Score, enrolled N, retained %, median income.
- Toggle layer: "Attrition Risk" mode replaces the PRAPARE choropleth with a retention rate choropleth (% participants retained to 36 months).
- Add a legend panel (fixed bottom-right) explaining both color scales.
- Add a scatter plot panel below the map: X = PRAPARE Risk Score, Y = % visits completed, dot size = enrolled N, color = group. This reveals the correlation between SDOH disadvantage and longitudinal engagement.

***

### Page 7: SHAP Beeswarm Explainer (`/shap-explorer`)

**Feature flag:** `SHAP_BEESWARM`

**Purpose:** Interactive Shapley Additive Explanations beeswarm plot for the current best ML model predicting ADOS CSS at 36 months.

**Component:** `src/pages/ShapExplorerPage.tsx`

**Implementation details:**
- Fetch `GET /api/v2/shap-values`.
- Render a beeswarm plot using `d3`:
  - Y-axis: feature names, sorted by mean absolute SHAP value (most impactful at top).
  - X-axis: SHAP value (negative = reduces ASD risk prediction, positive = increases it). Place a vertical zero line.
  - Each dot = one participant. Dots are jittered vertically within each feature's row using a collision-avoidance beeswarm algorithm (implement with d3-force simulation).
  - Dot color: diverging gradient from blue (low raw feature value) to red (high raw feature value).
- **Time window selector:** Dropdown to filter features by time window (1–3mo, 6mo, 9mo, 12mo). The chart updates to show only features from that window.
- **Modality filter:** Checkboxes to filter by modality: ECG/HRV, Thermal/CPTd, Behavioral/Gaze, Clinical/Assessment.
- Clicking any dot highlights that participant across all dots and opens a tooltip showing NANOID, SHAP value, raw feature value, and that participant's eventual ADOS CSS.
- Add a "Global Summary" bar chart alongside: mean |SHAP| per feature per time window, grouped and color-coded — directly answering the ablation study question of which timepoints contribute most.

***

### Page 8: ASD Cluster Viewer (`/cluster-viewer`)

**Feature flag:** `CLUSTER_VIEWER`

**Purpose:** Interactive t-SNE scatter plot with DBSCAN cluster labels, animatable by adding later timepoint features.

**Component:** `src/pages/ClusterViewerPage.tsx`

**Implementation details:**
- Fetch `GET /api/v2/cluster-tsne`.
- Render a `recharts` `ScatterChart` (or `d3` canvas for performance if N > 300):
  - X = `x` (t-SNE dim 1), Y = `y` (t-SNE dim 2).
  - Dot color: encode by `clusterId` using a categorical color palette (max 8 clusters).
  - Dot shape: encode by `group` (circle = TD, triangle = ASIB, diamond = PT).
  - Dot size: encode by `adosCSSat36m` (larger = higher ASD severity at 36m).
- **Timepoint animation slider:** Slider labeled "Include features through:" with stops at 1mo, 3mo, 6mo, 12mo. Moving the slider triggers a refetch with `?maxTimepoint=Xmo` query param and smoothly re-renders the cluster positions with a 500ms transition.
- Hover tooltip: NANOID, group, cluster ID, ADOS CSS at 36m, top 3 features driving cluster membership (from SHAP).
- **Cluster summary panel (right):** For each cluster ID, show a box: cluster label, N (total, ASIB/PT/TD breakdown), mean ADOS CSS ± SD with bootstrapped 95% CI, and a mini radar chart of the cluster's mean feature values across modalities.
- Add a "Cluster Separation Quality" badge showing the Silhouette Coefficient and DBSCAN epsilon/minPts used.

***

### Page 9: ML Model Leaderboard (`/model-leaderboard`)

**Feature flag:** `MODEL_LEADERBOARD`

**Purpose:** Track all trained model versions, CV performance, and ablation results in one place.

**Component:** `src/pages/ModelLeaderboardPage.tsx`

**Implementation details:**
- Fetch `GET /api/v2/model-leaderboard`.
- Render a sortable data table (use the existing ESD Lab table component) with columns: Model ID, Algorithm, R² (train), R² (CV 5-fold), R² (LOOCV), RMSE (CV), Features included, Time windows, Created at.
- Highlight the best row (highest LOOCV R²) with a garnet border and "Best Model" badge.
- Clicking any row expands it to show:
  - **Learning Curve chart:** Training set size (X) vs. CV R² (Y) — two lines (train score, validation score). Renders with `recharts`.
  - **Ablation Table:** Feature group removed → Δ R² (sorted by impact). Color-code: red if removing the feature group drops R² by > 0.05.
  - **Predicted vs. Actual scatterplot:** `recharts` scatter with marginal density histograms on both axes using a custom `MarginalDensityScatter` component.
- Add a "Export Manuscript Table" button that generates a LaTeX-formatted table of the leaderboard and downloads it as a `.tex` file.

***

### Page 10: Developmental Cascade DAG (`/cascade-dag`)

**Feature flag:** `CASCADE_SANKEY`

**Purpose:** Directed Acyclic Graph showing cross-domain developmental cascade pathways from ANS function → attention → interactive behavior → ASD outcomes.

**Component:** `src/pages/CascadeDagPage.tsx`

**Implementation details:**
- Fetch `GET /api/v2/cascade-dag`.
- Render an interactive force-directed DAG using `d3-force` + SVG:
  - Nodes: developmental milestones or clinical scores (e.g., "3mo RSA", "6mo HDA", "12mo Social Communication", "36mo ADOS CSS"). Node color = developmental domain (physiological = blue, behavioral = green, clinical = red).
  - Edges: directed arrows. Edge thickness = standardized beta coefficient from SEM. Edge opacity = 1 − p-value. Statistically non-significant edges (p > 0.05) render as dashed.
  - Node size = variance explained (R²) at that node.
- Clicking a terminal node (e.g., "36mo ADOS CSS") triggers an animation that pulses upstream nodes along the highest-β path, visually tracing the cascade.
- Toggle panel: switch between ASIB, PT, and TD group-specific DAG layouts. Edge widths recompute per group.
- Add a legend panel explaining node size (R²), edge width (β), edge opacity (significance), and edge style (solid = p < 0.05, dashed = n.s.).

***

### Page 11: REDCap Completeness Scorecard (`/redcap-completeness`)

**Feature flag:** `REDCAP_COMPLETENESS`

**Purpose:** Per-participant × per-instrument completeness grid with NDA required-field flagging.

**Component:** `src/pages/RedcapCompletenessPage.tsx`

**Implementation details:**
- Fetch `GET /api/v2/redcap-completeness`.
- Render a `d3` cell grid:
  - Rows = participant NANOIDs (sorted by overall % complete, descending).
  - Columns = instrument × visit age (e.g., "ADOS-2 @ 24mo", "Bayley-4 @ 12mo", "EPDS @ 3mo").
  - Cell colors: `complete` = `#22C55E`, `partial` = `#F59E0B`, `missing` = `#EF4444`, `not-applicable` = `#D1D5DB`.
  - Cells with `ndaRequired = true` that have status `missing` or `partial` render with a pulsing red border.
- **Summary row at top:** % complete per instrument across all participants. Color-coded using the same scale.
- **Summary column on right:** % complete per participant across all instruments. Renders as a mini progress bar.
- **NDA Alert Banner:** If any `ndaRequired` fields are missing within 30 days of the next NDA submission deadline (pass deadline as an env variable `VITE_NDA_DEADLINE`), render a prominent garnet alert banner at the top of the page listing the affected instruments and participant count.
- **Export button:** Downloads a CSV of the full grid for offline review.

***

### Page 12: ECG Signal Quality Monitor (`/ecg-quality`)

**Feature flag:** `ECG_QUALITY_MONITOR`

**Purpose:** Per-infant ECG data quality tracking by day and hour with artifact classification.

**Component:** `src/pages/EcgQualityPage.tsx`

**Implementation details:**
- Participant selector (all groups).
- Fetch `GET /api/v2/ecg-quality/:nanoid`.
- Render a `d3` heatmap grid: X = day of study (1–28 for NICU; 1–visit-day for post-NICU), Y = hour of day (0–23).
- Cell color: green (≥ 90% quality), yellow (70–89%), orange (50–69%), red (< 50%), black (session not collected).
- Overlay icons inside cells: 🔧 = noise artifact, 💓 = missed beats, 🫁 = ventilator artifact (for NICU PT infants), ❓ = unknown.
- **Data yield summary bar:** Horizontal bar at the top showing overall `% hours ≥ 90% quality` vs. target (show as a gauge). Flag participants below 80% overall yield.
- **Excluded segments list:** Collapsible panel below the heatmap listing all excluded segments (`> 5 contiguous missing beats` OR `> 10% discarded in 1-hour window`) with timestamps and artifact type, per the MATLAB exclusion protocol.
- **Export QC Report button:** Generates a Markdown `.md` QC summary report for the selected participant with all exclusion details, suitable for inclusion in the data processing log.

***

## Phase 3 — Cross-Cutting Enhancements to Existing Pages

These changes enhance existing pages without breaking current functionality.

### 3.1 Overview Page — Add Research Progress Rings

On the existing `/overview` page, add (do not replace) a new section below the current content. Use the `SWIMMER_PLOT` feature flag for the summary section.

Add four circular progress rings (use SVG `ircle>` with `stroke-dashoffset`) showing:
- % of 200 target participants enrolled (split by ASIB/PT/TD)
- % of total expected visit-forms completed
- % of ECG files passing QC
- % of REDCap NDA-required fields complete

Each ring should be labeled, show the raw fraction (e.g., "143 / 200"), and animate on page load using a CSS `@keyframes` stroke-dashoffset transition.

### 3.2 Pipeline Page — MATLAB Processing Status Enrichment

On the existing pipeline page, add (do not modify existing elements) a new collapsible card section labeled "MATLAB Processing Queue". Use `ECG_QUALITY_MONITOR` flag.

Show a table: `batchId`, `participantCount`, `matlabVersion`, `processingStatus` (queued/running/complete/error), `artifactRate`, `startedAt`, `completedAt`. All data from the existing `matlab_version` and `batch` fields already in the API, supplemented by the new `GET /api/v2/ecg-quality` aggregate endpoint.

### 3.3 Session Page — HDA Quick Preview

On the existing session detail view, add a "HDA Preview" tab alongside existing tabs. When selected, it renders a miniaturized (height: 180px) version of the HDA Timeline Player (Phase 2, Page 2) scoped to the current session's NANOID and visit age. Use `HDA_TIMELINE_PLAYER` flag.

***

## Phase 4 — Spatial Assessment & Attachment Pages

These two pages serve the broader multi-study context of the Combined Papers (spatial cognition chapter and secure base script research).

### Page 13: Spatial Assessment Matrix (`/spatial-assessments`)

**Feature flag:** `SPATIAL_ASSESSMENT_MATRIX`

**Component:** `src/pages/SpatialAssessmentMatrixPage.tsx`

- Render a filterable, sortable HTML table (no API fetch required — data is static and sourced from the Combined Papers).
- Columns: Assessment Name, Spatial Skill Type (mental rotation / perspective taking / block design / navigation / other), Age Range (years), Sample Size, Cronbach's α (if reported), Validated (Y/N), Digitally Available (Y/N), Used in STEM Training Research (Y/N), Citation.
- Pre-populate with all assessments listed in the spatial cognition chapter of the Combined Papers: Picture Rotation Test, CMTT, Ghost MRT, MRT-Animal, sOPT, PTT-C, Photographic PTT, Block Design Test (WISC), Crossing Sectioning for Children, Spatial Scaling Task, Diagrammatic Representations Task, Silcton, Virtual Path Mazes, and others.
- Filters: age range slider, skill type checkboxes, "validated only" toggle, "digitally available only" toggle.
- Color-code cells in the Cronbach's α column: ≥ 0.80 = green, 0.70–0.79 = yellow, < 0.70 = red, N/A = gray.
- Add an export to CSV button.

### Page 14: Attachment Correlation Heatmap (`/attachment-heatmap`)

**Feature flag:** `ATTACHMENT_HEATMAP`

**Component:** `src/pages/AttachmentHeatmapPage.tsx`

- Static data page (no live API). Populate from the secure base script research reviewed in the Combined Papers.
- Render a `d3` correlation matrix:
  - Rows: Attachment/caregiving measures (AAI coherence, AAI secure base script, SBST, ASCT, maternal sensitivity, parental secure base support).
  - Columns: Developmental outcomes (social communication, language, cognitive composite, peer competence, loneliness, behavior problems).
  - Cell color: diverging scale from deep blue (r = −1) through white (r = 0) to deep garnet (r = +1).
  - Each cell shows the r value text. Cells with p < 0.05 from the cited studies get a bold border. Cells with p < 0.001 get a ✱ superscript.
- Hover tooltip: study citation, N, age at attachment measure, age at outcome measure.
- Toggle: "Child-level predictors" vs. "Parent-level predictors" switches which rows are displayed.

***

## Phase 5 — Final Integration Checklist

After implementing all phases, run this checklist before deploying:

- [ ] All 14 new routes are lazy-loaded and wrapped in `<Suspense fallback={<PageSkeleton />}>`.
- [ ] All new routes default to disabled via `featureFlags.ts` (`false`).
- [ ] No existing routes (`/`, `/overview`, and all current routes) have been modified or deleted.
- [ ] No existing TanStack Query keys have been renamed or removed.
- [ ] No new CSS globals have been introduced; all styling uses the existing Tailwind config with the `garnet` token.
- [ ] All new API endpoints are prefixed `/api/v2/` and additive only.
- [ ] All participant data displayed uses NANOID only — no names, birthdates, or addresses.
- [ ] All new SVG/canvas charts are wrapped in a `role="img" aria-label="..."` container for accessibility.
- [ ] The Cloudflare Pages build passes: `npm run build` produces no type errors and no new bundle warnings.
- [ ] Each feature flag can be independently toggled to `true` in `featureFlags.ts` and the corresponding page loads without console errors.
- [ ] The existing sidebar nav renders correctly with new entries appended.

***

## Appendix — Recommended Build Order

Implement features in this sequence to minimize risk and allow incremental testing:

1. **Phase 1.1** (feature flag system) — no UI impact, safest first step
2. **Phase 1.2** (backend endpoints) — enables all data fetching
3. **Phase 1.3** (npm installs) — verify build succeeds
4. **Phase 3.1** (overview rings) — high-visibility, low-complexity, builds confidence
5. **Page 11** (REDCap Completeness) — highest operational priority for NDA reporting
6. **Page 4** (Swimmer Plot) — second operational priority
7. **Page 1** (RSA Growth Curves) — first scientific visualization
8. **Page 2** (HDA Timeline Player) — most complex, build after simpler charts work
9. **Page 3** (Thermal Heatmap) — second complex visualization
10. **Page 5** (Attrition Funnel) — requires Sankey library integration
11. **Page 6** (SDOH Map) — requires Leaflet + GeoJSON file
12. **Pages 7–9** (SHAP, Cluster, Leaderboard) — ML layer, implement together
13. **Page 10** (Cascade DAG) — most complex d3 component, last
14. **Phase 3.2 & 3.3** (pipeline + session enhancements)
15. **Pages 12–14** (ECG Quality, Spatial Matrix, Attachment Heatmap)