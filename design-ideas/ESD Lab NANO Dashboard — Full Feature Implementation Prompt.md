# ESD Lab NANO Dashboard — Repo-Aligned Feature Expansion Prompt

## Goal

Implement the non-duplicative feature expansions for the live NANO Dashboard without breaking any existing UI surface. Work against the current React SPA under `web/`, extend existing pages when a feature already has a clear owner, and only create new routes for features that do not already exist in comparable form.

This prompt supersedes older instructions that assumed a generic `src/pages` layout, route-object lazy config, or a standalone FastAPI router tree.

***

## Start With Targeted Search

Before editing, confirm these anchors with targeted search rather than broad exploration:

- `web/src/main.tsx`
- `web/src/App.tsx`
- `web/src/components/shell/AppShell.tsx`
- `web/src/components/shell/Sidebar.tsx`
- `web/src/api/client.ts`
- `web/src/api/hooks.ts`
- `web/src/api/schemas.ts`
- `web/src/api/mockServer.ts`
- `web/src/routes/Overview.tsx`
- `web/src/routes/Results.tsx`
- `web/src/routes/Redcap.tsx`
- `web/src/routes/Matlab.tsx`
- `web/src/routes/ParticipantDetail.tsx`
- `dashboard/server/live_dashboard_server.py`
- `dashboard/pipelines/build_dashboard_data.py`
- `dashboard/data/dashboard_data.json`

Recommended search commands:

```bash
rg --files web/src
rg "Route path=|const .* = lazy" web/src/App.tsx
rg "const NAV_GROUPS" web/src/components/shell/Sidebar.tsx
rg "/api/" web/src/api/{hooks.ts,mockServer.ts}
rg "def do_GET|/api/" dashboard/server/live_dashboard_server.py
rg "trajectories|visit_completion|data_quality|ml_performance|cohort_table" dashboard/data/dashboard_data.json
```

***

## Confirmed Repo Facts

- The active frontend is the React SPA in `web/`, not the legacy static dashboard in `dashboard/`.
- Routing uses React Router v6 `<Routes>` inside `web/src/App.tsx`.
- New route files belong in `web/src/routes/`, not `src/pages/`.
- New routes are registered through `React.lazy` constants plus `<Route>` elements, not route-object `lazy()` config.
- The app shell and sidebar navigation are controlled by `web/src/components/shell/AppShell.tsx` and `web/src/components/shell/Sidebar.tsx`.
- API typing and TanStack Query hooks live in `web/src/api/schemas.ts` and `web/src/api/hooks.ts`.
- Development and current Pages fallback data still depend heavily on `web/src/api/mockServer.ts`, so every new endpoint needs a mock implementation there.
- The local backend/runtime is handled by `dashboard/server/live_dashboard_server.py`; it is not currently organized as a FastAPI router tree.
- Aggregate dashboard data is built by `dashboard/pipelines/build_dashboard_data.py` and materialized at `dashboard/data/dashboard_data.json`.
- Existing aggregate payload already exposes useful blocks that should be reused where possible: `trajectories`, `visit_completion`, `data_quality`, `ml_performance`, and `cohort_table`.
- There is an important group-code mismatch today: frontend schemas and components use `VPT`, while the aggregate builder and payload use `PT`. Normalize that at the API boundary before expanding cohort-level features.
- The styling system is mixed: existing routes use CSS Modules, shared tokens in `web/src/styles/tokens.css`, app-wide styles in `web/src/styles/global.css`, and selective Tailwind utility classes. Do not assume a pure Tailwind app.

***

## Hard Rules

1. Never modify or remove existing route paths such as `/`, `/overview`, `/participants`, `/results`, `/redcap`, `/matlab`, or `/presentation-maker`.
2. Never change existing component props, outlet context shapes, or existing TanStack Query key names.
3. All new backend routes must be additive under `/api/v2/...`.
4. Every new frontend route must be added through the existing lazy-import pattern in `web/src/App.tsx`.
5. Every new backend endpoint must also be mirrored in `web/src/api/mockServer.ts` so local development and current Pages fallback builds still render.
6. Every new endpoint must have a Zod schema in `web/src/api/schemas.ts` and a TanStack Query hook in `web/src/api/hooks.ts` with explicit `staleTime` and `gcTime`.
7. All new UI must reuse the existing primitives and design tokens before introducing new abstractions.
8. All new features must be guarded by feature flags in `web/src/config/featureFlags.ts`, defaulting to `false`.
9. All participant-facing data must remain de-identified. Use surrogate NANO IDs only. Never expose names, DOBs, addresses, MRNs, or exact identifiers.
10. Append sidebar entries only. Do not restructure the existing sidebar grouping model.
11. If a requested feature already has a clear owner route, extend that route instead of creating a duplicate page.
12. Normalize `PT` and `VPT` consistently at the API boundary so existing UI components keep working.
13. Prefer additive cards, sections, and panels. Do not remove or visually replace the current page content.
14. Keep the current desktop-first shell intact. Avoid regressions on narrower widths, but do not turn this into a separate mobile redesign.

***

## Feature Triage: What To Extend vs. What To Build

When a requested feature overlaps an existing page, do not create a duplicate route.

| Requested Surface | Action | Owner Files |
|---|---|---|
| RSA Growth Curves | Extend the existing Results page. Do not create a standalone `/rsa-trajectories` page. | `web/src/routes/Results.tsx`, `web/src/components/charts/TrajectoryChart.tsx` |
| REDCap Completeness Scorecard | Extend the existing REDCap page. Do not create a standalone `/redcap-completeness` page. | `web/src/routes/Redcap.tsx` |
| HDA Quick Preview on session detail | There is no dedicated session-detail page in the SPA. Add this to Participant Detail. | `web/src/routes/ParticipantDetail.tsx` |
| MATLAB Processing Queue enrichment | Extend the existing MATLAB page, optionally cross-linking from Runs. | `web/src/routes/Matlab.tsx`, `web/src/routes/Runs.tsx` |
| Overview research progress rings | Extend the existing Overview page. | `web/src/routes/Overview.tsx` |
| Cluster Viewer | Keep as a new analysis route, but do not confuse it with the existing infrastructure-focused cluster panel. | `web/src/routes/ClusterViewer.tsx`, `web/src/components/cluster/ClusterOpsPanel.tsx` |

Ignore duplicate standalone route ideas for RSA Growth Curves and REDCap Completeness. Implement those as additive enhancements inside their current owner pages.

***

## Phase 1 — Foundation

### 1.1 Feature Flags

Create `web/src/config/featureFlags.ts`:

```ts
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
  CASCADE_DAG: false,
  REDCAP_COMPLETENESS: false,
  ECG_QUALITY_MONITOR: false,
  SPATIAL_ASSESSMENT_MATRIX: false,
  ATTACHMENT_HEATMAP: false,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
```

Create `web/src/hooks/useFeatureFlag.ts`:

```ts
import { FEATURE_FLAGS, type FeatureFlag } from "@/config/featureFlags";

export function useFeatureFlag(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}
```

Use this hook to guard all new routes and all new additive sections. If a feature is disabled, render `null`.

### 1.2 API Envelope, Group Normalization, and Mock Parity

For all new `/api/v2` list-style endpoints, use a consistent response envelope:

```ts
type ApiListMeta = {
  generatedAt: string;
  participantCount: number;
  source?: "mock" | "live" | "aggregate";
};

type ApiListResponse<T> = {
  data: T[];
  meta: ApiListMeta;
};
```

Implement new endpoint handling in `dashboard/server/live_dashboard_server.py` and add matching mock responders in `web/src/api/mockServer.ts`.

Before wiring new cohort-level features, introduce one consistent normalization rule for group codes:

- Backend aggregate builders currently emit `PT`.
- Existing frontend schemas and components expect `VPT`.
- Normalize this at the API boundary or widen the schema carefully, but do not break existing pages that already assume `VPT`.

### 1.3 Prefer Reuse Before New Storage

Before inventing new backend persistence, check whether the feature can reuse the existing aggregate payload in `dashboard/data/dashboard_data.json`.

Existing blocks already cover:

- `trajectories`
- `visit_completion`
- `data_quality`
- `ml_performance`
- `cohort_table`

Only create truly new `/api/v2` builders for data that is not already present in those blocks, such as per-session HDA timelines, per-hour thermal grids, or per-hour ECG QC surfaces.

### 1.4 Dependencies

Install only what is needed for the slice currently being implemented.

Start with:

```bash
cd web
npm install d3 recharts
```

Then add libraries only when a specific route needs them:

```bash
npm install @nivo/core @nivo/sankey
npm install react-leaflet leaflet
```

Do not install `deck.gl`, `@visx/visx`, or `@nivo/chord` unless an implemented route proves they are necessary.

Keep shared chart helpers under the existing `web/src/components/charts/` directory and extend its barrel export pattern.

***

## Phase 2 — Extend Existing Routes Instead of Duplicating Them

### 2.1 Overview — Research Progress Rings

**Owner file:** `web/src/routes/Overview.tsx`

Use `SWIMMER_PLOT` for the progress-summary section.

Add a new section below the current Overview content. Do not replace or restyle the existing DAG, cluster panel, map, or participant flow surfaces.

Render four SVG progress rings showing:

- enrolled participants vs target
- expected visit-form completion
- ECG QC pass rate
- NDA-required REDCap completeness

Use existing token colors and typography. Animate ring stroke offset on load. Prefer additive summary cards or a compact grid that visually fits the current warm dashboard language.

Data sources:

- `useStudySummary()` for enrollment
- new swimmer/completeness/QC summary endpoints where needed
- existing aggregate `visit_completion` data when sufficient

### 2.2 Results — RSA Growth Curves Enhancement

**Owner files:** `web/src/routes/Results.tsx`, `web/src/components/charts/TrajectoryChart.tsx`

Use `RSA_GROWTH_CURVES`.

Do not create a new `/rsa-trajectories` route.

Add an additive RSA Growth Curves panel to the existing Results page:

- fetch `/api/v2/rsa-trajectories`
- allow adjusted vs chronological age as a query parameter
- render group lines plus confidence bands
- reuse the page's existing table pattern for exact values
- keep the current Results page hero, HDA panel, and manuscript table intact

If possible, extend `TrajectoryChart.tsx` or add a sibling chart component inside `web/src/components/charts/`.

### 2.3 REDCap — Completeness Scorecard Enhancement

**Owner file:** `web/src/routes/Redcap.tsx`

Use `REDCAP_COMPLETENESS`.

Do not create a new `/redcap-completeness` route.

Add a completeness scorecard panel to the existing REDCap page:

- fetch `/api/v2/redcap-completeness`
- render a participant-by-instrument completeness matrix
- add NDA-required highlighting and summary bars
- show a top alert banner when required fields are missing near the configured deadline
- preserve the current REDCap sync event table and field-map panel

Pass the deadline through `VITE_NDA_DEADLINE`.

### 2.4 MATLAB — Processing Queue Enrichment

**Owner files:** `web/src/routes/Matlab.tsx`, optionally `web/src/routes/Runs.tsx`

Use `ECG_QUALITY_MONITOR` for the additive queue card.

Add a collapsible section labeled `MATLAB Processing Queue` below the existing MATLAB content. Do not replace the current inventory, scripts, throughput, or options sections.

Show:

- `batchId`
- `participantCount`
- `matlabVersion`
- `processingStatus`
- `artifactRate`
- `startedAt`
- `completedAt`

Source from the current MATLAB integration block where possible and supplement with a new ECG QC summary endpoint only where needed.

### 2.5 Participant Detail — HDA Quick Preview

**Owner file:** `web/src/routes/ParticipantDetail.tsx`

Use `HDA_TIMELINE_PLAYER`.

There is no existing session-detail tab system. Do not invent a full tab architecture unless you first confirm a nearby reusable pattern.

Instead, add a compact `HDA Preview` card or local segmented section near the ECG preview. This should render a minimized version of the HDA timeline player for the current participant and visit context.

***

## Phase 3 — Net-New Routes

All new route files belong in `web/src/routes/`.

Add them through the existing pattern in `web/src/App.tsx`:

```tsx
const HdaPlayer = lazy(() => import("@/routes/HdaPlayer").then((m) => ({ default: m.HdaPlayer })));

// inside <Routes>
<Route path="/hda-player" element={<HdaPlayer />} />
```

Do not introduce route-object lazy config. The app already wraps the route tree in `Suspense` with `PageFallback`, so keep using that model.

Append sidebar entries in `web/src/components/shell/Sidebar.tsx`. Use existing Lucide icon names through the current `Icon` helper's kebab-case convention.

### Route 1: HDA Timeline Player (`/hda-player`)

**Feature flag:** `HDA_TIMELINE_PLAYER`

**File:** `web/src/routes/HdaPlayer.tsx`

Implementation notes:

- Use `useParticipants()` for the participant selector rather than inventing a second participant list source.
- Fetch `/api/v2/hda-session/:nanoid/:visitAge`.
- Render three synchronized SVG tracks with `d3`.
- Use the actual existing HDA vocabulary from `web/src/api/schemas.ts`: `orienting`, `sustained`, `inattention`, `termination`.
- Add play, pause, step, speed, and scrubber controls.
- Implement compare mode by issuing a second query and rendering a second synchronized stack.

### Route 2: NICU Thermal Heatmap (`/thermal-heatmap`)

**Feature flag:** `THERMAL_HEATMAP`

**File:** `web/src/routes/ThermalHeatmap.tsx`

Implementation notes:

- Filter participants to the normalized VPT/PT cohort only.
- Fetch `/api/v2/thermal-heatmap/:nanoid`.
- Render a day-by-hour SVG heatmap using `d3`.
- Use small SVG markers for `medicalEvent`; do not use emoji glyphs.
- Add a secondary HRC trend chart and CSV export.

### Route 3: Cohort Swimmer Plot (`/swimmer-plot`)

**Feature flag:** `SWIMMER_PLOT`

**File:** `web/src/routes/SwimmerPlot.tsx`

Implementation notes:

- Fetch `/api/v2/cohort-swimmer`.
- Render an SVG swimmer plot with filters and sort controls.
- Reuse the existing table/filter language from `web/src/routes/Participants.tsx` rather than inventing a separate control style.
- A row click should open an additive right-side detail panel or adjacent card, not a global drawer framework.

### Route 4: Attrition and Missing Data (`/attrition`)

**Feature flag:** `ATTRITION_FUNNEL`

**File:** `web/src/routes/Attrition.tsx`

Implementation notes:

- Use `@nivo/sankey` for the left panel.
- Fetch `/api/v2/attrition-funnel` for cohort flow.
- Reuse `/api/v2/redcap-completeness` for the right-side missingness matrix when possible.
- Preserve the current visual language used by existing pipeline cards.

### Route 5: SDOH Geographic Map (`/sdoh-map`)

**Feature flag:** `SDOH_MAP`

**File:** `web/src/routes/SdohMap.tsx`

Implementation notes:

- Fetch `/api/v2/sdoh-map`.
- Bundle county GeoJSON at `web/public/sc-counties.geojson`.
- Use `react-leaflet` and `leaflet`.
- Add a scatter plot below the map using existing chart styling conventions.
- Do not confuse this route with the existing reading-geography component in `web/src/components/warm/ReadingsGeoMap.tsx`.

### Route 6: SHAP Explorer (`/shap-explorer`)

**Feature flag:** `SHAP_BEESWARM`

**File:** `web/src/routes/ShapExplorer.tsx`

Implementation notes:

- Fetch `/api/v2/shap-values`.
- Render a d3 beeswarm.
- Filter by time window and modality.
- Support participant highlighting on click.
- Add a compact global summary bar chart alongside the beeswarm.

### Route 7: Outcome Clusters (`/cluster-viewer`)

**Feature flag:** `CLUSTER_VIEWER`

**File:** `web/src/routes/ClusterViewer.tsx`

Implementation notes:

- Fetch `/api/v2/cluster-tsne`.
- Keep the route path `/cluster-viewer`, but label the sidebar item something like `Outcome Clusters` so it is not confused with the existing infrastructure cluster panel.
- Use `recharts` for the scatter if the point count stays modest; fall back to a more manual SVG or canvas approach only if needed.
- Add the timepoint slider, tooltip, and cluster summary panel.

### Route 8: Model Leaderboard (`/model-leaderboard`)

**Feature flag:** `MODEL_LEADERBOARD`

**File:** `web/src/routes/ModelLeaderboard.tsx`

Implementation notes:

- Fetch `/api/v2/model-leaderboard` for the list view.
- If expanded rows need more detail than the list endpoint provides, add `/api/v2/model-leaderboard/:modelId` for learning curve and ablation detail.
- Reuse the existing table style patterns already present in Participants, Results, Redcap, and Matlab routes.

### Route 9: Developmental Cascade DAG (`/cascade-dag`)

**Feature flag:** `CASCADE_DAG`

**File:** `web/src/routes/CascadeDag.tsx`

Implementation notes:

- Fetch `/api/v2/cascade-dag`.
- Build the SVG force-directed DAG with `d3-force`.
- Reuse motion and annotation ideas from `web/src/components/warm/AnimatedDAG.tsx` where appropriate.
- Use node colors tied to developmental domains, not arbitrary new palette choices.

### Route 10: ECG Quality Monitor (`/ecg-quality`)

**Feature flag:** `ECG_QUALITY_MONITOR`

**File:** `web/src/routes/EcgQuality.tsx`

Implementation notes:

- Fetch `/api/v2/ecg-quality/:nanoid`.
- If overview or MATLAB summary cards need aggregate values, add `/api/v2/ecg-quality-summary` as a separate additive endpoint.
- Render the quality grid with SVG and `d3`.
- Use small SVG markers for artifact type rather than emoji.
- Add export of a Markdown QC report.

### Route 11: Spatial Assessment Matrix (`/spatial-assessments`)

**Feature flag:** `SPATIAL_ASSESSMENT_MATRIX`

**File:** `web/src/routes/SpatialAssessmentMatrix.tsx`

Implementation notes:

- Static route, no API required.
- Source the dataset from a local module such as `web/src/data/spatialAssessments.ts`.
- Render a filterable, sortable table consistent with current route table patterns.
- Add CSV export.

### Route 12: Attachment Correlation Heatmap (`/attachment-heatmap`)

**Feature flag:** `ATTACHMENT_HEATMAP`

**File:** `web/src/routes/AttachmentHeatmap.tsx`

Implementation notes:

- Static route, no live API.
- Source the matrix from a local module such as `web/src/data/attachmentCorrelations.ts`.
- Use a d3 SVG heatmap with hover detail.
- Use the existing garnet and blue token family rather than introducing a new color system.

***

## Phase 4 — Backend Contracts for New and Extended Surfaces

Implement new live endpoint branches in `dashboard/server/live_dashboard_server.py` and back them with helper builders in `dashboard/pipelines/` when aggregate reuse is insufficient.

Every endpoint below should return a top-level `data` array and a `meta` object with `generatedAt` and `participantCount`.

| Endpoint | Consumer |
|---|---|
| `GET /api/v2/rsa-trajectories` | Results route enhancement |
| `GET /api/v2/redcap-completeness` | Redcap enhancement, Attrition missingness panel |
| `GET /api/v2/hda-session/:nanoid/:visitAge` | HDA Player route, Participant Detail preview |
| `GET /api/v2/thermal-heatmap/:nanoid` | Thermal Heatmap route |
| `GET /api/v2/cohort-swimmer` | Swimmer Plot route, Overview progress summaries |
| `GET /api/v2/attrition-funnel` | Attrition route |
| `GET /api/v2/sdoh-map` | SDOH route |
| `GET /api/v2/shap-values` | SHAP route, Cluster tooltip cross-reference |
| `GET /api/v2/cluster-tsne` | Cluster Viewer route |
| `GET /api/v2/model-leaderboard` | Model Leaderboard route |
| `GET /api/v2/model-leaderboard/:modelId` | Expanded model detail if needed |
| `GET /api/v2/cascade-dag` | Cascade DAG route |
| `GET /api/v2/ecg-quality/:nanoid` | ECG Quality route |
| `GET /api/v2/ecg-quality-summary` | Overview rings, MATLAB queue enrichment |

Backend requirements:

- enforce de-identification in every response
- normalize `PT` and `VPT` consistently
- reuse aggregate builder outputs when possible before inventing a new store
- provide deterministic mock/demo fallbacks so the web app can still run locally without secure data mounts

***

## Phase 5 — Frontend Integration Details

### 5.1 Files You Will Touch on the Frontend

- `web/src/App.tsx`
- `web/src/components/shell/Sidebar.tsx`
- `web/src/api/schemas.ts`
- `web/src/api/hooks.ts`
- `web/src/api/mockServer.ts`
- `web/src/config/featureFlags.ts`
- `web/src/hooks/useFeatureFlag.ts`
- new route files under `web/src/routes/`
- new or extended chart helpers under `web/src/components/charts/`

### 5.2 Route Registration Pattern

Use the existing lazy-import style already present in `web/src/App.tsx`. Do not switch the app to a different router configuration style.

### 5.3 Sidebar Registration Pattern

Append new nav items in `web/src/components/shell/Sidebar.tsx` by extending the existing `NAV_GROUPS` constant. Do not change the grouping model.

### 5.4 Styling Pattern

Prefer the same route-level pattern used by current screens:

- route component in `web/src/routes/FeatureName.tsx`
- optional `web/src/routes/FeatureName.module.css`
- shared primitives from `web/src/components/primitives/`
- shared tokens from `web/src/styles/tokens.css`

Tailwind utility classes are acceptable when consistent with nearby code, but do not add a new global style system or override the existing token layer.

### 5.5 Accessibility Pattern

All new charts must live inside a container with `role="img"` and a clear `aria-label`.

Add keyboard support where a chart is interactive, especially for scrubbers, row selection, and route-level filters.

***

## Phase 6 — Validation and Regression Safety

At minimum, run these after the relevant slices land:

```bash
cd web
npm run typecheck
npm run test
npm run build
```

If backend Python files were changed, also run a narrow syntax validation such as:

```bash
python3 -m py_compile dashboard/server/live_dashboard_server.py dashboard/pipelines/build_dashboard_data.py
```

Update or add focused frontend tests where they protect real regressions:

- extend `web/src/test/sidebarNav.test.tsx` for appended nav entries
- add feature-flag smoke coverage where useful
- add route-level render tests only for new high-risk pages

Do not widen test edits unnecessarily.

***

## Acceptance Checklist

- [ ] All 12 net-new routes are lazy-loaded through the existing pattern in `web/src/App.tsx`.
- [ ] Existing owner pages were extended additively: Overview, Results, Redcap, Matlab, and Participant Detail.
- [ ] No duplicate standalone `/rsa-trajectories` or `/redcap-completeness` routes were added.
- [ ] All new features default to disabled in `web/src/config/featureFlags.ts`.
- [ ] Every new `/api/v2` endpoint has a matching schema, hook, and mock responder.
- [ ] `PT` vs `VPT` normalization is handled without breaking existing components.
- [ ] No existing route paths were changed or removed.
- [ ] No existing TanStack Query keys were renamed or removed.
- [ ] The existing sidebar still renders correctly and new items are appended only.
- [ ] No PHI is exposed anywhere in the frontend or mock payloads.
- [ ] All new charts include accessible labeling.
- [ ] `npm run typecheck`, `npm run test`, and `npm run build` pass in `web/`.
- [ ] The app still works in mock mode, not only against the live runtime.

***

## Recommended Build Order

1. Feature flags and `useFeatureFlag`.
2. API envelope types, schema additions, and `PT`/`VPT` normalization.
3. First live endpoint plus matching mock responder.
4. Overview progress rings.
5. Redcap completeness enhancement.
6. Swimmer Plot route.
7. Results RSA enhancement.
8. HDA Player route.
9. Thermal Heatmap route.
10. Attrition route.
11. SDOH Map route.
12. SHAP Explorer, Cluster Viewer, and Model Leaderboard.
13. Cascade DAG route.
14. Matlab queue enrichment and Participant Detail HDA preview.
15. ECG Quality route.
16. Spatial Assessment Matrix and Attachment Heatmap.

***

## Explicit Non-Goals

- Do not migrate the legacy `dashboard/` static frontend into the SPA as part of this work.
- Do not replace the current shell, typography system, or warm dashboard visual language.
- Do not add unused charting dependencies up front.
- Do not create duplicate pages for features already owned by Results, Redcap, Overview, Matlab, or Participant Detail.
- Do not rely on a live backend only; preserve mock-mode development.
