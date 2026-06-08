# ESD Lab Dashboard — Mega Implementation Prompt
> **For:** Claude Code / GPT-4.5 / Cursor Agent / GitHub Copilot Workspace  
> **Project:** ESD-Lab-USC · `esd-lab-namo.pages.dev`  
> **Author:** Namit Shrivastava  
> **Date:** June 2026  
> **Scope:** Full next-wave feature implementation — 8 new routes, 5 novel widgets, CDC-style charts, WCAG fixes, and guided demo flows

---

## 0. CONTEXT — READ FIRST

You are a senior full-stack engineer, data-visualization architect, and accessibility-first product designer working inside the **ESD-Lab-USC** codebase.

This is a **React + TypeScript** research dashboard for the Early Social Development (ESD) Lab at the University of South Carolina. The lab runs the **NANO Study** (Neurodevelopment of Autonomic and Neural Organization), a 5-year NIH R01 longitudinal study tracking 260 infants (VPT, ASIB, TD cohorts) across 36 months of corrected gestational age. The dashboard serves two personas: internal researchers/coordinators and external stakeholders (funders, clinical collaborators, families).

### Existing architecture (do not rewrite, extend it)

| Layer | Detail |
|---|---|
| Framework | React 18 + TypeScript, Vite build, Cloudflare Pages deploy |
| State | Zustand (`useUi` store), `@tanstack/react-query` for server state |
| Routing | React Router v6, all routes lazy-loaded in `web/src/App.tsx` |
| Styling | CSS Modules per component, design token CSS vars (`--usc-garnet`, `--usc-gold`, etc.) |
| Primitives | `Card`, `Button`, `SectionLabel`, `Gloss`, `Segmented`, `Tooltip`, `KPI`, `DataTable`, `Badge`, `Sparkline` in `web/src/components/primitives/` |
| Charts | D3.js for SVG, Nivo (Sankey already bundled), Three.js (in v2 layer) |
| Maps | React-Leaflet + D3 in `SdohMap.tsx` |
| API | Mock server + `web/src/api/hooks.ts` + `web/src/api/schemas.ts` |
| Feature flags | `useFeatureFlag(key)` + `isFeatureFlagEnabled(key)` hooks |
| Backend data | `dashboard/data/dashboard_data.json` built by Python + R pipelines |
| Schema contract | `dashboard/context_skill/references/dashboard_schema.md` |
| Metrics | `dashboard/context_skill/references/metrics.md` |
| Entities | `dashboard/context_skill/references/entities.md` |
| AI assistant | `Buddy.tsx` in `web/src/components/shell/` (LM Studio, phi scrubber) |

### Existing routes already built (do NOT recreate these)

`Landing`, `Overview`, `Participants`, `ParticipantDetail`, `QA`, `Results`, `Runs`, `Redcap`, `Matlab`, `DataExplorer`, `Publications`, `PublicationDetail`, `Changelog`, `PresentationMaker`, `HdaPlayer`, `ThermalHeatmap`, `SwimmerPlot`, `Attrition`, `SdohMap`, `ShapExplorer`, `ClusterViewer`, `ModelLeaderboard`, `CascadeDag`, `EcgQuality`, `SpatialAssessmentMatrix`, `AttachmentHeatmap`, `CoRegulation`, `PhasePortrait`, `CvaTheater`, `HrDeceleration`, `StillFace`, `HdaBypass`, `Passport`, `Archetypes`, `CascadeSimulator`, `EcoValidity`, `StreamCoverage`

### Study domain vocabulary

- **VPT** = Very Preterm infants (primary at-risk group)
- **ASIB** = Autism Sibling (infant with older autistic sibling)
- **TD** = Typically Developing (control)
- **CGA** = Corrected Gestational Age in months; canonical time points = `[0, 1, 2, 3, 6, 9, 12, 24, 36]`
- **HDA phases** = Heart-rate Defined Attention: `orienting`, `sustained`, `inattention`, `termination`
- **RSA** = Respiratory Sinus Arrhythmia (parasympathetic index, ln ms²)
- **RMSSD** = Root-mean-square of successive differences in IBI (ms)
- **SDNN** = Standard deviation of NN intervals (ms)
- **CPTd** = Central-Peripheral Temperature Difference (°C); socioeconomic reactivity index
- **SHAP** = SHapley Additive exPlanations; mean |SHAP| > 0.10 = top feature
- **AUROC** = Area under ROC; 95% bootstrap CI from 2000 resamples
- **REDCap** = Research data capture platform used for visit scheduling + survey ingestion

---

## 1. ROUTES TO CREATE

Register **all 8** using the identical lazy-loading pattern already used in `web/src/App.tsx`:

```tsx
const CgaMilestoneRiver     = lazy(() => import("@/routes/CgaMilestoneRiver").then(m => ({ default: m.CgaMilestoneRiver })));
const CountyComparator      = lazy(() => import("@/routes/CountyComparator").then(m => ({ default: m.CountyComparator })));
const ParticipantTimeline   = lazy(() => import("@/routes/ParticipantTimeline").then(m => ({ default: m.ParticipantTimeline })));
const ModelConfidenceTerrain= lazy(() => import("@/routes/ModelConfidenceTerrain").then(m => ({ default: m.ModelConfidenceTerrain })));
const AttritionFunnel       = lazy(() => import("@/routes/AttritionFunnel").then(m => ({ default: m.AttritionFunnel })));
const GuidedExplorer        = lazy(() => import("@/routes/GuidedExplorer").then(m => ({ default: m.GuidedExplorer })));
const PublicInsights        = lazy(() => import("@/routes/PublicInsights").then(m => ({ default: m.PublicInsights })));
const ExecutiveMode         = lazy(() => import("@/routes/ExecutiveMode").then(m => ({ default: m.ExecutiveMode })));
```

Add these `<Route>` entries inside the existing `<Routes>` block under `<AppShell>`:

```tsx
<Route path="cga-river"          element={<CgaMilestoneRiver />} />
<Route path="county-comparator"  element={<CountyComparator />} />
<Route path="participant-timeline" element={<ParticipantTimeline />} />
<Route path="model-terrain"      element={<ModelConfidenceTerrain />} />
<Route path="attrition-funnel"   element={<AttritionFunnel />} />
<Route path="guided-explorer"    element={<GuidedExplorer />} />
<Route path="public-insights"    element={<PublicInsights />} />
<Route path="executive"          element={<ExecutiveMode />} />
```

Add corresponding feature flags to the existing flags config:

```ts
CGA_RIVER: true,
COUNTY_COMPARATOR: true,
PARTICIPANT_TIMELINE_V2: true,
MODEL_CONFIDENCE_TERRAIN: true,
ATTRITION_FUNNEL_V2: true,
GUIDED_EXPLORER: true,
PUBLIC_INSIGHTS: true,
EXECUTIVE_MODE: true,
```

---

## 2. WIDGET A — CGA Milestone River (`CgaMilestoneRiver.tsx`)

### What it is
A longitudinal stream/ribbon chart where x = month CGA and each flowing ribbon encodes how the **composition** of HDA phases (orienting / sustained / inattention / termination) evolves group-by-group across 0–36 months. Unlike the static TrajectoryChart, the composition morphs as a continuous ribbon rather than a single line, making it easy to see phase transitions at a glance.

### Data schema
Add a new key to `dashboard_data.json`:

```json
"hda_composition": {
  "by_group": {
    "VPT":  [{ "month": 0, "orienting": 0.22, "sustained": 0.40, "inattention": 0.28, "termination": 0.10 }, ...],
    "ASIB": [...],
    "TD":   [...]
  }
}
```

Time points follow the canonical invariant: `[0, 1, 2, 3, 6, 9, 12, 24, 36]`.

Add a backend builder stub `build_hda_stream()` in `dashboard/pipelines/build_dashboard_data.py` with a TODO comment for real data wiring. Add a corresponding mock generator in `generate_synthetic_dashboard_data.py`.

### Hook to create
In `web/src/api/hooks.ts`, add:

```ts
export function useHdaComposition() {
  return useQuery({ queryKey: ["hda_composition"], queryFn: () => client.get("/hda-composition") });
}
```

### Component requirements

Create `web/src/routes/CgaMilestoneRiver.tsx`:

- Feature-flag gate: `useFeatureFlag("CGA_RIVER")` — return null if disabled
- Use `@nivo/stream` (already bundled) for the stream/ribbon rendering
- x-axis ticks locked to CGA months `[0, 1, 2, 3, 6, 9, 12, 24, 36]`
- Color scheme: orienting = `var(--blue)`, sustained = `var(--green)`, inattention = `var(--purple)`, termination = `var(--red)` (matching existing HDA palette in `results.jsx`)
- Controls:
  - `Segmented` for group selection: All / VPT / ASIB / TD
  - `Segmented` for phase filter: All Phases / Sustained Only / Orienting Only
  - checkbox toggle: "Animate on load"
- Right-side helper panel (collapsible):
  - heading: "What am I looking at?"
  - brief plain-language explanation of HDA phases
  - link to the Gloss tooltip for `HDA`
- Empty / loading state: skeleton ribbons at 40% opacity
- Screen reader: `<figure>` wrapper with `aria-label` summarizing the dominant group trajectory
- Keyboard: tab to group buttons, Enter activates

### CSS module
Create `web/src/routes/CgaMilestoneRiver.module.css` with:
- `.page` layout matching `FeatureRoutes.module.css` grid
- `.helperPanel` collapsible side drawer (right, 280px wide on desktop, full-width drawer on mobile)
- `.controls` row flex with gap

---

## 3. WIDGET B — County Comparator (`CountyComparator.tsx`)

### What it is
A side-by-side dual-county comparison view for SDoH context and participant engagement patterns, directly inspired by the CDC Autism Data Visualization Tool's dual area selection. Builds on the existing `SdohMap.tsx` Leaflet + D3 infrastructure rather than recreating it.

### URL behavior
`/county-comparator?left=richland&right=lexington`

Both selections sync to URL params via `useSearchParams`. Shareable links pre-populate both panels.

### Component requirements

Create `web/src/routes/CountyComparator.tsx`:

- Feature-flag gate: `useFeatureFlag("COUNTY_COMPARATOR")`
- Import and reuse the existing map component from `SdohMap.tsx` as a controlled sub-component; add a `selectedCounty` + `onCountySelect` prop to the existing map component (refactor minimally)
- Layout: two equal columns on desktop, stacked on mobile
- Each column:
  - county `<select>` picker OR click-on-map selection (either approach fine)
  - small repeat of the SC county map with the selected county highlighted in `--usc-garnet`
  - summary `Card` showing:
    - county name + FIPS code
    - enrolled participant count
    - visit completion rate (%)
    - median household income proxy
    - SDoH score (0–1 index)
    - CPTd gap context note if data available
- Below both columns:
  - 4 mirrored horizontal bar charts (one per metric) showing both counties side by side, bars emanating from a center axis
  - delta chips: `+12%` / `–8%` comparisons
  - plain-language "County Context" paragraph (1–2 sentences auto-generated from the data values)
- Loading / no-data graceful fallback

### Schema addition
Add to `dashboard_data.json`:

```json
"county_profiles": [
  {
    "county": "Richland",
    "fips": "45079",
    "enrolled": 42,
    "completion_rate": 0.81,
    "sdoh_score": 0.44,
    "median_income_bracket": "medium",
    "cptd_gap_mean": 2.1
  },
  ...
]
```

Add mock generator stub in `generate_synthetic_dashboard_data.py`.

---

## 4. WIDGET C — Participant Passport Timeline (`ParticipantTimeline.tsx`)

### What it is
An interactive horizontal swimlane timeline view. Each row = one participant. X-axis = month CGA. Events plotted as distinct geometric marks. Combines swimplot, operational audit trail, and QA review into one unified surface — replacing the need to cross-reference Participants, QA, and Runs tabs manually.

### Component requirements

Create `web/src/routes/ParticipantTimeline.tsx`:

- Feature-flag gate: `useFeatureFlag("PARTICIPANT_TIMELINE_V2")`
- X-axis: CGA months `[0, 1, 2, 3, 6, 9, 12, 24, 36]` as fixed snap points; allow zooming between snap points
- Y-axis: one swimlane row per participant (virtual scroll for large N, use `@tanstack/virtual` if available or standard windowing)
- Event mark types (shape + color, never color alone):
  - ◆ Diamond = visit completed (green)
  - △ Triangle = QA flag (amber)
  - ■ Square = MATLAB / pipeline run (blue)
  - ✕ Cross = visit failed / withdrawn (red)
  - ○ Circle = REDCap milestone (slate)
- Hover on any mark: compact `Tooltip` showing event type, date, CGA, and status
- Click on any mark: opens `StageDrawer`-style side panel (reuse or extend existing `StageDrawer` component from pipeline)
- Filters (top bar):
  - group (VPT / ASIB / TD / all)
  - QA status (pass / pending / reject / all)
  - event type multi-select
  - participant search input
- Right detail panel (triggered by row click):
  - participant metadata (from existing `ParticipantDetail` data)
  - visit completion summary
  - HRV mini-metrics (RMSSD, RSA, SDNN) at last visit
  - missingness note
- Keyboard: full arrow-key navigation across marks; Enter to open detail; Escape to close
- Screen reader: `aria-label` per row summarizing participant status

---

## 5. WIDGET D — Model Confidence Terrain (`ModelConfidenceTerrain.tsx`)

### What it is
Extends the existing `ShapExplorer` beeswarm into a 3D terrain / surface map of model confidence. X = feature value, Y = timeWindow (CGA), Z = mean |SHAP| contribution. Reveals the _interaction structure_ of model explanations across developmental time — not just feature ranking.

### Component requirements

Create `web/src/routes/ModelConfidenceTerrain.tsx`:

- Feature-flag gate: `useFeatureFlag("MODEL_CONFIDENCE_TERRAIN")`
- Read from existing `useShapValues()` hook; extend schema with a `timeWindow` dimension if not already present
- Render modes (toggle via `Segmented`):
  - **Terrain** — Three.js `PlaneGeometry` mesh with height-mapped Z values (reuse `three-d.jsx` approach from v2 folder)
  - **Contour** — D3 contour lines drawn on SVG
  - **Heatmap** — standard 2D color grid fallback for performance
- Controls:
  - feature select dropdown (populated from SHAP data feature list)
  - modality filter: ECG / HDA / Temperature / all
  - time window filter
  - color scale toggle: sequential (for single feature) / diverging (for SHAP sign)
- Plain-language explainer card (always visible):
  - "Higher terrain = stronger model influence at this combination of feature value and age"
  - "Use this chart to find where the model listens hardest in developmental time"
  - caution note about SHAP interpretation limits
- Graceful 2D fallback if WebGL is unavailable (`canvas.getContext('webgl')` check on mount)
- No PII exposed; all data is already de-identified SHAP aggregates

---

## 6. WIDGET E — Attrition Funnel (`AttritionFunnel.tsx`)

### What it is
A product-analytics-style retention funnel adapted for longitudinal infant research. Each stage = a visit or milestone gate. Shows N, % retained, % dropped, reason-code breakdown, and a trend over calendar time. Makes NIH R01 retention arguments visually immediate.

### Data schema
Add to `dashboard_data.json`:

```json
"attrition_funnel": {
  "stages": [
    { "id": "screened",    "label": "Screened",          "n": 380, "retained_pct": 100 },
    { "id": "consented",   "label": "Consented",         "n": 302, "retained_pct": 79.5 },
    { "id": "enrolled",    "label": "Enrolled",          "n": 260, "retained_pct": 68.4 },
    { "id": "v1",          "label": "Visit 1 Complete",  "n": 248, "retained_pct": 65.3 },
    { "id": "v2",          "label": "Visit 2 Complete",  "n": 231, "retained_pct": 60.8 },
    { "id": "v3",          "label": "Visit 3 Complete",  "n": 210, "retained_pct": 55.3 },
    { "id": "v36mo",       "label": "36-Month Complete", "n": 172, "retained_pct": 45.3 }
  ],
  "reason_codes": [
    { "stage_id": "consented", "reason": "declined_consent", "n": 42, "pct": 54 },
    { "stage_id": "consented", "reason": "eligibility",      "n": 36, "pct": 46 },
    ...
  ],
  "trend_by_quarter": [
    { "quarter": "2024-Q1", "stage_id": "enrolled", "n": 18 },
    ...
  ]
}
```

### Component requirements

Create `web/src/routes/AttritionFunnel.tsx`:

- Feature-flag gate: `useFeatureFlag("ATTRITION_FUNNEL_V2")`
- Main funnel chart:
  - horizontal bar funnel (wider = more participants)
  - label: stage name, N, % retained, drop-off arrow with % lost
  - color gradient from `--usc-garnet` (full) to lighter tint (attrited)
  - hover: tooltip with reason code breakdown pie/donut mini-chart
  - click: expand reason-code panel below the funnel for that stage
- Subgroup filters:
  - cohort group (VPT / ASIB / TD)
  - sex
  - GA band (< 32 wks / 32–37 wks / full term)
- Trend chart (below):
  - small sparkline or line chart per stage showing enrolled N over calendar quarters
  - toggle between absolute N and retention %
- Export button: "Copy for NIH Report" → copies a text summary of the retention stats to clipboard

---

## 7. CDC-STYLE CHART MAPPINGS (`PublicInsights.tsx`)

### What it is
A public-facing, plain-language insight page modeled on the CDC Autism Data Visualization Tool's five narrative "trend" sections. Same underlying data as internal tools — different presentation layer.

### Component requirements

Create `web/src/routes/PublicInsights.tsx`:

- Feature-flag gate: `useFeatureFlag("PUBLIC_INSIGHTS")`
- No participant-level data; all aggregated only
- Page structure: 5 named insight sections, each with a heading, 1-sentence description, and primary chart

**Section 1 — "How infant heart rhythms change over development"**
- Chart: multi-line RMSSD / RSA / SDNN trajectory by group, with 95% CI bands
- Toggle: confidence intervals on/off (CDC-style)
- Toggle: metric (RMSSD / RSA / SDNN)
- Plain-language y-axis label: "Heart rate variability (higher = more regulated)"

**Section 2 — "Where our families live — geographic overview"**
- Chart: SC county choropleth colored by enrollment count or completion rate
- Source: existing `SdohMap` data, reuse the map component
- No exact addresses or precise participant locations

**Section 3 — "Who is in the study — group breakdown"**
- Chart: grouped bar chart of VPT / ASIB / TD by sex and gestational age band
- Plain-language heading: "Study families by infant type and birth characteristics"

**Section 4 — "When developmental milestones first appear"**
- Chart: cumulative incidence curve showing what % of infants in each group first show a Sustained Attention HDA window, by CGA month
- Resembles CDC's early-identification cumulative prevalence curve

**Section 5 — "Compare two groups"**
- Dual-picker: left group + right group (VPT / ASIB / TD / sex-stratified / GA-stratified)
- Side-by-side bar chart: 4 key metrics compared (enrollment rate, completion rate, RMSSD at 12 mo, sustained-attention latency)
- Delta chip showing difference
- Plain-language "What this tells us" paragraph below

**Global requirements for this route:**
- minimum body text: 16px
- no technical jargon without inline plain-language tooltip
- all chart titles phrased as questions or statements, not axis labels
- each section has a "Learn more" link pointing to the appropriate internal route
- "About this data" footer accordion explaining the NANO study and data sources

---

## 8. GUIDED INTERACTIVE DEMO FLOWS (`GuidedExplorer.tsx`)

### What it is
A hypothesis-first, CDC-inspired guided exploration mode. Instead of presenting raw axis pickers, it presents named research question cards. Clicking a card pre-configures the chart state. Inspired by CDC DHDS's "Explore Data by Indicator" pattern.

### Component requirements

Create `web/src/routes/GuidedExplorer.tsx`:

- Feature-flag gate: `useFeatureFlag("GUIDED_EXPLORER")`
- Page layout: 5 hypothesis cards in a 2-up grid (3 on desktop)
- Each card shows:
  - short question: e.g. "Does RSA grow faster in TD than VPT infants?"
  - data badge: e.g. "RSA · Trajectory"
  - group indicator chips
  - "Explore →" button
- Clicking a card:
  - navigates to the relevant existing or new route
  - pre-populates state via URL params: e.g. `/results?metric=rsa&groups=VPT,TD&overlay=ci`
  - OR renders the chart inline on the same page (preferred for demo mode)
- Five hypothesis cards to implement:

| ID | Question | Target | Pre-config |
|----|----------|--------|-----------|
| H1 | Does RSA grow faster in TD than VPT infants? | `Results` route | metric=rsa, groups=VPT+TD |
| H2 | Are ASIB infants' sustained-attention windows shorter at 6 months? | `CgaMilestoneRiver` | group=ASIB, month=6, phase=sustained |
| H3 | Does county SDoH score predict visit completion? | `CountyComparator` | left=high-sdoh, right=low-sdoh |
| H4 | Which physiological features drive the model most at 3 months? | `ShapExplorer` | timeWindow=m3 |
| H5 | How does attrition differ between cohort groups? | `AttritionFunnel` | subgroup=group |

- After chart renders inline, show `Buddy` AI assistant narration bubble below: a 1–2 sentence plain-language interpretation of what the chart shows (stub the content if Buddy is not live)
- Include a "Start over" button that resets to card grid

---

## 9. EXECUTIVE MODE (`ExecutiveMode.tsx`)

### What it is
A simplified, curated view for PIs, NIH program officers, and funders. Activated via `?mode=executive` URL param OR the dedicated `/executive` route. Collapses navigation to 5 key screens. One-click export placeholder.

### Component requirements

Create `web/src/routes/ExecutiveMode.tsx`:

- Feature-flag gate: `useFeatureFlag("EXECUTIVE_MODE")`
- Render a simplified AppShell wrapper that shows only: Overview, Results, PublicInsights, AttritionFunnel, Publications
- Above the content: a banner: "Executive Summary View — Showing key study metrics only · [Exit]"
- KPI row at top of every executive-mode page: Enrolled N / Target N / Visit Completion % / AUROC best model
- "Export Executive Summary" button at top-right:
  - uses existing `pptxgen` (already bundled)
  - generates a 5-slide PDF/PPTX:
    - Slide 1: Lab + study overview (meta.generated_at, target N, groups)
    - Slide 2: Enrollment trajectory chart
    - Slide 3: HRV trajectory chart (RMSSD, 3 groups)
    - Slide 4: ML model AUROC table
    - Slide 5: Attrition funnel summary
  - stub the slide content from existing data hooks; add TODO for real formatting
- URL param behavior: `?mode=executive` on any existing route also activates the simplified nav without redirecting

---

## 10. ACCESSIBILITY IMPLEMENTATION (apply across ALL new work)

Apply these accessibility fixes to every new component AND retroactively to the following existing components: `StatusDot`, `PipelineDAG`, `TrajectoryChart`, `ShapExplorer`, `SdohMap`, `AppShell`, `Tooltip`, `Button`, `Segmented`.

### 10.1 Status and state indicators — not color alone

Every indicator that currently uses only color MUST also use shape or text:

```tsx
// BEFORE (color only):
<span style={{ background: map[kind] }} />

// AFTER (color + shape + aria):
const MARKS = { running: '●', queued: '◌', done: '✓', fail: '✗', idle: '○' };
const LABELS = { running: 'Running', queued: 'Queued', done: 'Done', fail: 'Failed', idle: 'Idle' };

<span
  style={{ color: map[kind] }}
  aria-label={LABELS[kind]}
  role="img"
  title={LABELS[kind]}
>
  {MARKS[kind]}
</span>
```

### 10.2 Keyboard access for SVG interactive elements

Every SVG element with `onClick` needs keyboard parity:

```tsx
// Add to every clickable SVG node:
<g
  onClick={() => onSelect(n.id)}
  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(n.id)}
  tabIndex={0}
  role="button"
  aria-label={`${n.label}: ${n.done} done, ${n.fail} failed`}
  aria-pressed={selected === n.id}
  style={{ cursor: 'pointer' }}
>
```

### 10.3 Tooltip persistence — WCAG 1.4.13

Update `web/src/components/primitives/Tooltip.tsx` to add a `persistent` prop:

```tsx
interface TooltipProps {
  persistent?: boolean; // stays visible until Escape or explicit dismiss
  // ... existing props
}
```

When `persistent=true`, the tooltip remains visible on blur and only closes on Escape key or click-outside. All chart tooltips in new routes should use `persistent`.

### 10.4 Focus-visible styles

Add to every CSS module for interactive elements:

```css
.button:focus-visible,
.segmentedOption:focus-visible,
.chartMark:focus-visible {
  outline: 2px solid var(--usc-garnet);
  outline-offset: 2px;
  border-radius: 2px;
}
```

### 10.5 Skip navigation link

In `web/src/components/shell/AppShell.tsx`, add as the very first child element:

```tsx
<a
  href="#main-content"
  className={styles.skipNav}
>
  Skip to main content
</a>

// In AppShell.module.css:
.skipNav {
  position: absolute;
  top: -100%;
  left: 8px;
  z-index: 9999;
  padding: 8px 16px;
  background: var(--usc-garnet);
  color: #fff;
  font-weight: 600;
  border-radius: 0 0 4px 4px;
  text-decoration: none;
}
.skipNav:focus {
  top: 0;
}
```

Also add `id="main-content"` to the main content region of AppShell.

### 10.6 ARIA live regions for real-time data

In `Overview.tsx`, wrap KPI values in live regions:

```tsx
<span
  aria-live="polite"
  aria-atomic="true"
>
  {kpi.value}
</span>
```

### 10.7 Contrast audit

- Minimum contrast for body text: **4.5:1** (WCAG AA normal text)
- Minimum contrast for large text / icons: **3:1**
- Any `fontSize < 12` in a chart that carries meaning must use `C.s600` or darker, not `C.s300/s400`
- In all new CSS modules, define a `--text-muted` token that is verified ≥ 3:1 against the card background

### 10.8 Chart accessibility summaries

Every new chart component should accept an optional `summary` prop:

```tsx
interface ChartProps {
  summary?: string; // read by screen readers
}

// Inside component:
{summary && (
  <figcaption className="sr-only">{summary}</figcaption>
)}
```

---

## 11. VISUAL + UX STYLE REQUIREMENTS

Maintain the current ESD Lab visual identity (USC garnet, Source Serif 4, JetBrains Mono) while improving clarity and public-health legibility.

### Design principles
- CDC-style: comparison-first, confidence-interval-aware, audience-segmented
- Academic dashboard credibility: charts over decoration, data density balanced with whitespace
- Progressive disclosure: KPI summary first → hover for detail → click for deep dive
- No startup-style visual gimmicks (no blobs, no flashy gradients, no confetti)
- Clinical calm: muted palette with strong color only for action / alert / key data

### Chart standards (apply to every new chart)
Every chart component must render:
1. A `SectionLabel` with chart type
2. A heading (Source Serif 4, 18–24px)
3. A 1-line subtitle / helper line (13px, muted)
4. Units on axes
5. Legend if > 1 series
6. "Source / context" note if helpful (10px, muted, bottom)
7. Empty state: `"No data available for this filter combination"`
8. Loading state: subtle pulse / skeleton
9. Error state: `"Unable to load data — check pipeline status"`

### Typography scale (match existing tokens)
- Page title: Source Serif 4, 32px, weight 600
- Section heading: Source Serif 4, 24px, weight 600
- Chart heading: Source Serif 4, 18px, weight 600
- Body / helper: system-ui or Inter, 13–14px
- Mono labels, axis ticks: JetBrains Mono, 10–11px

---

## 12. DATA GOVERNANCE AND PRIVACY

Because this handles pediatric physiological research data:

- All new routes that show participant-level detail MUST check for an `authorized` context or feature flag before rendering raw identifiers
- Public-facing routes (`PublicInsights`, `ExecutiveMode` in public export mode) must render only **aggregated** data — no participant IDs, no precise addresses, no raw ECG traces
- Geographic data in `CountyComparator` and `PublicInsights` must use county-level granularity only — no ZIP codes, no census tract IDs that could narrow to < 20 participants
- Add a `PHI_SCRUB_REQUIRED` comment wherever participant-level data is rendered, pointing to the existing `hipaa_utils.py` scrubber
- Every new route file should begin with a comment block:

```tsx
/**
 * @route CgaMilestoneRiver
 * @data-sensitivity: AGGREGATED — no PII
 * @auth-required: false (internal demo mode only)
 * @hipaa-note: All data rendered here is group-level aggregates. No PHI present.
 */
```

---

## 13. FOLDER STRUCTURE FOR NEW FILES

```
web/src/
├── routes/
│   ├── CgaMilestoneRiver.tsx          ← new
│   ├── CgaMilestoneRiver.module.css   ← new
│   ├── CountyComparator.tsx           ← new
│   ├── CountyComparator.module.css    ← new
│   ├── ParticipantTimeline.tsx        ← new
│   ├── ParticipantTimeline.module.css ← new
│   ├── ModelConfidenceTerrain.tsx     ← new
│   ├── ModelConfidenceTerrain.module.css ← new
│   ├── AttritionFunnel.tsx            ← new
│   ├── AttritionFunnel.module.css     ← new
│   ├── GuidedExplorer.tsx             ← new
│   ├── GuidedExplorer.module.css      ← new
│   ├── PublicInsights.tsx             ← new
│   ├── PublicInsights.module.css      ← new
│   ├── ExecutiveMode.tsx              ← new
│   └── ExecutiveMode.module.css       ← new
├── components/
│   ├── insights/
│   │   ├── CdcStyleLine.tsx           ← reusable plain-language trajectory chart
│   │   ├── CumulativeCurve.tsx        ← milestone cumulative incidence
│   │   ├── DualGroupComparator.tsx    ← two-entity comparison chart
│   │   └── InsightSection.tsx         ← heading + chart + helper text wrapper
│   ├── comparison/
│   │   ├── CountyCard.tsx             ← single-county summary card
│   │   └── MirroredBarChart.tsx       ← back-to-back bar chart
│   ├── timeline/
│   │   ├── SwimLane.tsx               ← single participant row
│   │   ├── EventMark.tsx              ← geometric mark with tooltip
│   │   └── TimelineAxis.tsx           ← shared CGA x-axis
│   └── explainability/
│       ├── TerrainSurface.tsx         ← Three.js terrain render
│       ├── ContourFallback.tsx        ← D3 contour 2D fallback
│       └── ShapExplainerCard.tsx      ← plain-language card

dashboard/pipelines/
├── build_hda_stream.py                ← new stub
├── build_attrition_funnel.py          ← new stub
└── build_county_profiles.py           ← new stub (extends build_geo_data.py)
```

---

## 14. IMPLEMENTATION ORDER

Implement strictly in this sequence to respect data dependencies:

1. **Schema additions** — add the 3 new JSON keys to `generate_synthetic_dashboard_data.py` and update `dashboard_schema.md`
2. **Hook additions** — add `useHdaComposition`, `useCountyProfiles`, `useAttritionFunnel` to `web/src/api/hooks.ts` and `schemas.ts`
3. **Feature flag additions** — register all 8 new flags
4. **Shared new components** — `CountyCard`, `MirroredBarChart`, `SwimLane`, `EventMark`, `TimelineAxis`, `InsightSection`, `CdcStyleLine`
5. **Accessibility fixes** — `StatusDot`, `Tooltip`, `AppShell` (skip nav), `Button`, `Segmented` focus states
6. **Routes in priority order:**
   1. `CountyComparator`
   2. `CgaMilestoneRiver`
   3. `AttritionFunnel`
   4. `ParticipantTimeline`
   5. `GuidedExplorer`
   6. `PublicInsights`
   7. `ModelConfidenceTerrain`
   8. `ExecutiveMode`
7. **Route registration** — add all 8 to `App.tsx`
8. **Navigation wiring** — add to `AppShell` nav if needed; mark new/beta routes with a `Badge` chip

---

## 15. OUTPUT FORMAT FROM THE CODING AGENT

For each of the 8 routes, produce output in this exact format:

```
### [Route Name]
**Files changed/created:**
- web/src/routes/RouteName.tsx
- web/src/routes/RouteName.module.css
- web/src/components/.../NewComponent.tsx (if applicable)
- web/src/api/hooks.ts (additions only)
- web/src/api/schemas.ts (additions only)
- dashboard/pipelines/build_X.py (stub only)

**Schema additions:** (paste JSON fragment)
**Feature flag key:** FLAG_NAME
**Accessibility notes:** (2–3 lines)
**Backend wiring TODOs:** (1–3 bullet points)
```

---

## 16. SUCCESS CRITERIA

The implementation is complete and correct when:

- [ ] All 8 routes compile cleanly with zero TypeScript errors
- [ ] All 8 routes are registered in `App.tsx` and deep-linkable
- [ ] All new routes are feature-flag gated
- [ ] New visual language is consistent with existing app tokens and typography
- [ ] `CountyComparator` URL params sync (`?left=X&right=Y`)
- [ ] `CgaMilestoneRiver` uses canonical CGA time points `[0,1,2,3,6,9,12,24,36]`
- [ ] `AttritionFunnel` shows N, %, drop-off, and at least stub reason codes
- [ ] `ParticipantTimeline` uses shape + color for event marks (not color alone)
- [ ] `ModelConfidenceTerrain` gracefully degrades to 2D heatmap if WebGL unavailable
- [ ] `PublicInsights` has no participant-level data and reads at a non-specialist level
- [ ] `GuidedExplorer` pre-configures chart state from hypothesis card click
- [ ] `ExecutiveMode` exports at least a stub PPTX via pptxgen
- [ ] Skip-nav link added to `AppShell`
- [ ] `StatusDot` uses shape + color (not color alone)
- [ ] All new SVG interactive elements are keyboard accessible
- [ ] Tooltip persistence prop added and used in at least 3 chart components
- [ ] All new routes have a PHI data-sensitivity comment block
- [ ] `dashboard_schema.md` updated with the 3 new JSON keys
- [ ] All new mock data generated in `generate_synthetic_dashboard_data.py`

---

*End of prompt — implement all sections above as a single coherent codebase extension.*
