# ESD Lab NANO Dashboard, Prompt Set V2: Dynamic, Dyadic and Decision-Support Visualizations

## System Context for the Coding Agent

This prompt is the **third** specification layer for the live NANO Dashboard in this repository. The active dashboard frontend is the React 18 + Vite + TypeScript + Tailwind/TanStack Query app under `web/`, not the legacy static shell under `dashboard/`. Treat the following files as the authoritative implementation anchors for this prompt:

- `web/src/App.tsx`: lazy route registration with `React.lazy` + `Suspense`
- `web/src/components/shell/Sidebar.tsx`: sidebar groups and feature-gated nav items
- `web/src/config/featureFlags.ts`: feature-flag registry
- `web/src/routes/`: route modules; most analytics pages already reuse `FeatureRoutes.module.css`
- `web/src/api/schemas.ts`: Zod response contracts
- `web/src/api/hooks.ts`: TanStack Query hooks
- `web/src/api/mockServer.ts`: local mock payloads, dev fallbacks, and assistant passthrough rules
- `web/src/components/shell/Buddy.tsx` and `web/src/components/shell/ChatDrawer.tsx`: ESD Buddy hover insights and the assistant drawer
- `web/src/store/ui.ts`, `web/src/styles/tokens.css`, and `web/src/styles/global.css`: light/dark theme state, warm/garnet tokens, gradients, typography, and shared UI surfaces
- `dashboard/server/live_dashboard_server.py`: live `/api` and `/api/v2` backend handlers
- `dashboard/pipelines/build_dashboard_data.py`: aggregate dashboard payload builder

Any older instruction in this document that says `src/...`, `pages/...`, or assumes a pre-existing 3D wrapper should be read against the actual `web/src/...` structure above. Any new frontend API surface must be mirrored across `web/src/api/schemas.ts`, `web/src/api/hooks.ts`, `web/src/api/mockServer.ts`, and `dashboard/server/live_dashboard_server.py`.

The checked-in route inventory already covers the current 2D operator shell: Overview, Results, Participants, Window QA, Runs, REDCap, MATLAB, Presentation Maker, HDA Timeline Player, Thermal Heatmap, Swimmer Plot, Attrition, SDOH Map, SHAP Explorer, Cluster Viewer, Model Leaderboard, Cascade DAG, ECG Quality, Spatial Matrix, and Attachment Heatmap. The earlier prompt stack's Layer 2 Three.js surfaces are **not** present in this branch's `web/src/App.tsx`, and `web/package.json` does **not** currently include `three`, `@react-three/fiber`, `@react-three/drei`, or an existing `EsdCanvas.tsx`. Therefore this V2 layer must target the live `web/` app as it exists today: 2D-first by default, with any 3D mode treated as an explicit optional prerequisite rather than assumed baseline infrastructure.

**The guiding principle of V2: stop visualizing one infant at one moment, and start visualizing relationships across time.** The live dashboard already has strong single-subject or group-summary surfaces (`Results`, `HdaPlayer`, `ClusterViewer`, `CascadeDag`, `SwimmerPlot`, `AttachmentHeatmap`), but it still lacks dyadic coupling, state-space dynamics, explicit transition-bypass metrics, and counterfactual intervention views. The underlying science is about something the shipped app still does not render directly: two bodies coupling to each other (the study runs two synchronized CamnTech Actiheart-5 monitors, one on the caregiver and one on the infant), arousal and attention moving together as a dynamical system, discrete state transitions, and counterfactual reasoning about cascades. V2 targets exactly those gaps.

***

## Scientific grounding and an honesty note on statistics

The features below are grounded in the ESD Lab's own framework as described in the source volume the lab provided: **Bradshaw et al., "Autonomic and attentional pathways in the emergence of autism," in _Advances in Child Development and Behavior_, Vol. 69 (Elsevier, 2025)**, together with the companion chapters in the same volume on attachment and the secure base script, on spatial assessment, on emotion development, and on home visiting. Key constructs used throughout: RSA and RSA suppression, HRV, Heart Rate Characteristic (HRC) scores from NICU monitoring, Heart Rate Defined Sustained Attention (the chapter's term is HRDSA; the dashboard's existing pages call the same construct HDA), the three attention phases (orienting, sustained, termination), Coordinated Visual Attention (CVA), head-mounted eye tracking (HMET), the elevated-likelihood / low-likelihood / preterm grouping (the chapter uses EL/LL/PT; the live dashboard should normalize this to ASIB/TD/VPT at the API boundary), and the developmental cascades framework.

**Honesty requirement for the implementing team:** several specific numbers appear in the chapter (for example, reported figures around NICU sampling volume, the proportion of NICU time with abnormal heart-rate indices, a preterm pilot model fit, infant face-availability versus face-gaze percentages at 4 and 8 months, and lab-versus-home differences in caregiver-reported negative reactivity, household income, and travel distance). Some of those numbers in the chapter are themselves citing earlier ESD Lab publications. Do **not** hardcode any of those values into shipped UI copy as if they were established facts without first confirming the exact figure and its source against the primary publication. Where this prompt repeats a value for context, treat it as "approximately, pending verification," not as ground truth. If a number cannot be verified, show the metric computed live from the dashboard's own data rather than a literature value, and label literature comparisons clearly as such.

***

## Absolute safety rules (repo-grounded)

1. Do not break or rename existing routes, query keys, assistant endpoints, or shell components. Append and extend; do not silently repurpose a shipped surface.
2. All new pages are lazy-loaded from `web/src/App.tsx` with `React.lazy` + `Suspense`.
3. All new features are registered in `web/src/config/featureFlags.ts`, default to `false`, and use the `DYN_` prefix.
4. All new routes are appended to `web/src/App.tsx`, and the new `Dynamics & Dyads` nav group is appended in `web/src/components/shell/Sidebar.tsx` after the existing `data` group and before `tools`.
5. Every new `/api/v2/*` surface must ship with four matching changes: contract in `web/src/api/schemas.ts`, hook in `web/src/api/hooks.ts`, dev/mock payload in `web/src/api/mockServer.ts`, and live handler in `dashboard/server/live_dashboard_server.py`.
6. HIPAA compliance remains absolute: no PHI on the frontend, NANOID identifiers only. Dyadic data is doubly sensitive, so caregiver records must also be NANOID-keyed (for example `NANO-0173-CG`), never named.
7. Use the existing warm/garnet design system from `web/src/styles/tokens.css` and `web/src/styles/global.css`, and reuse existing primitives and route patterns (`Card`, `Button`, `Segmented`, `SectionLabel`, `Gloss`, `FeatureRoutes.module.css`) before inventing new layout systems.
8. ESD Buddy, the landing/overview surfaces, and Presentation Maker must stay in sync with the new features. New DYN surfaces are not complete until `web/src/components/shell/Buddy.tsx`, `web/src/components/shell/ChatDrawer.tsx`, and any affected public-facing discovery surfaces are updated with the same vocabulary and navigation targets.
9. Dark and light mode parity is mandatory. New gradients, typography accents, pills, and chart colors must be token-driven, readable under `data-theme="light"` and `data-theme="dark"`, and must not overlap or visually collide with `Sidebar`, `TopNav`, `Buddy`, `ChatDrawer`, or the floating assistant FAB.

***

## Phase 0, V2: shared utilities and dependencies

Most V2 features compute coupling and dynamics on the client. Keep the dependency footprint lean and reuse what the live `web/` app already ships.

```bash
# Already present in web/package.json: recharts, d3, @nivo/sankey, @tanstack/react-query, zod
# No additional 2D dependency is required for contours or Sankey-style flow.
# Only install the 3D stack if a page truly retains the optional 3D mode:
npm install three @react-three/fiber @react-three/drei
```

Create `web/src/lib/signal/` for small, well-tested, pure functions (no external numeric library needed for any of this):

- `windowedCrossCorrelation(a: number[], b: number[], maxLagSamples: number, windowSamples: number, stepSamples: number)`: returns a 2D array `corr[windowIndex][lagIndex]`, the engine behind dyadic lag surfaces. Document units (samples to seconds) at the call site.
- `pearson(a, b)` and `lagShift(series, lag)`: helpers for the above.
- `peristimulusAverage(series, eventOnsets, preSamples, postSamples)`: returns the mean and 95% bootstrap band of an event-locked window, the engine behind heart-rate deceleration profiles.
- `phaseBin2D(x: number[], y: number[], bins: number)`: occupancy histogram for the arousal-attention phase portrait.

Create `web/src/components/dyn/` for shared V2 React components:

- `LagSurface.tsx`: renders a `corr[window][lag]` matrix as a 2D heatmap by default. If a true 3D mode is still justified after implementation review, add `web/src/components/dyn/EsdCanvas.tsx` and keep the 3D terrain behind an explicit toggle and a WebGL fallback instead of assuming pre-existing Layer 2 canvas infrastructure.
- `DualTrack.tsx`: a synchronized two-lane time-series lane pair with a shared brush and a shared scrubber, used by several features so the caregiver lane and infant lane always stay aligned.
- `MetricChip.tsx`: a small labeled statistic chip in garnet tokens, with an optional "verify against source" info affordance for any value that originates from the literature rather than from live data.
- `RouteDataTable.tsx` (recommended): one shared table-toggle wrapper so every DYN page exposes the same accessible "Show data table" affordance, spacing, and keyboard behavior.
- `DynamicRoutes.module.css` (optional): only if `FeatureRoutes.module.css` cannot express a repeated DYN-specific grid. Keep naming and spacing aligned with the existing feature-route CSS rather than introducing a third visual language.

Every V2 page must expose a "Show data table" toggle that renders the same underlying numbers as an accessible HTML table, pair every chart or canvas with a sibling `role="img"` description, and degrade gracefully if its API endpoint is unavailable.

***

## DYN Page 1 (flagship): Dyadic Autonomic Co-Regulation (`/dyad-coregulation`)

**Feature flag:** `DYN_CO_REGULATION_BRAID`

**Concept.** This is the feature the dashboard most conspicuously lacks. The study records two synchronized Actiheart-5 streams, caregiver and infant, during naturalistic interaction. Co-regulation, the moment-to-moment coupling of two autonomic systems, is a central construct in the polyvagal and developmental-cascades framing, yet none of the 22 existing or proposed features render the dyad at all. This page makes the coupling visible and quantifiable.

**Why it is new (non-redundancy).** The live repo already has group-level RSA growth curves inside `Results` and single-session physiology in `HdaPlayer`, but neither renders caregiver and infant influencing each other in real time. This page is strictly dyadic and strictly temporal.

**New metrics surfaced.**
- **Synchrony index** per session: the peak of the windowed cross-correlation between caregiver and infant RSA (or instantaneous heart period), averaged across windows.
- **Lead-lag (s):** the lag at which coupling peaks, signed so that positive means the caregiver leads the infant. The hypothesis that healthy dyads show caregiver-led regulation that the infant gradually internalizes is directly testable here.
- **Coupling stability:** variance of the lead-lag across the session (a jittery lead-lag suggests fragile co-regulation).
- **Recovery concordance:** after an infant arousal spike, how tightly caregiver RSA tracks the infant's return to baseline.

**Implementation.**

```
Route: /dyad-coregulation
Component: web/src/routes/CoRegulation.tsx
API: GET /api/v2/dyad/coregulation/:nanoid/:visitAge   (new endpoint)
  Response: {
    fs: number,                                  // samples per second after resampling
    caregiver: { rsa: number[], heartPeriod: number[] },
    infant:    { rsa: number[], heartPeriod: number[], hdaPhase: string[] },
    events: { onset: number, type: "arousal_spike" | "still_face" | "reunion" }[]
  }
```

**Construction.**
- **The braid (2D first, optional 3D enhancement):** ship a readable paired-ribbon or spline view in 2D first so the live dashboard works without WebGL. If the optional Three.js stack is later added, mirror the same geometry inside `web/src/components/dyn/EsdCanvas.tsx` using `drei` `<CatmullRomLine>` ribbons running along the time axis. The caregiver ribbon is garnet, the infant ribbon is blue. The lateral distance between the two ribbons at each time point is mapped inversely to instantaneous coupling: when caregiver and infant are tightly coupled the ribbons twist close together into a tight braid, and when they decouple the ribbons splay apart. A faint set of "rung" lines connects the ribbons at fixed intervals so the twisting reads clearly.
- **The lag surface (linked 2D default, optional 3D terrain):** below or beside the braid, render the full windowed cross-correlation matrix, time on one axis, lag on the other, correlation as color (diverging garnet-to-blue). A bright ridge above the zero-lag line means the caregiver consistently leads; a ridge below means the infant leads. This single panel is the analytic heart of the feature.
- **Event-locked overlay:** vertical markers for arousal spikes, still-face onset, and reunion. Selecting a marker snaps both the braid camera and the lag surface to that window.
- **Group context:** a small-multiples strip of the synchrony index and lead-lag distributions for ASIB, TD, and VPT, so a single dyad can be read against its group.

**Interactions.** Scrub time with `DualTrack`. Toggle the central signal between RSA and heart period. Toggle the lag surface between 2D heatmap and 3D terrain. Hover any window to see the exact correlation, lag, and the underlying caregiver and infant values.

***

## DYN Page 2 (flagship): Arousal–Attention Phase Portrait (`/phase-portrait`)

**Feature flag:** `DYN_AROUSAL_ATTENTION_PORTRAIT`

**Concept.** The chapter frames development through a dynamic-systems lens and argues that adaptive engagement is the coupling of autonomic arousal with attention. A phase portrait is the natural dynamical-systems view: plot arousal on one axis and attentional engagement on the other, then let a session trace a trajectory that loops through that state space. Clean co-regulation looks like tight orbits inside an "adaptive engagement" region; dysregulation looks like trajectories that escape into high-arousal, low-attention corners and struggle to return.

**Why it is new (non-redundancy).** No live route plots state against state. `ClusterViewer` clusters static features and `HdaPlayer` plays phases on a timeline, but neither shows the continuous orbit of arousal versus attention or the geometry of where a dyad spends its time.

**New metrics surfaced.**
- **Occupancy fraction** of the adaptive-engagement region (defined as moderate arousal plus sustained attention).
- **Mean recovery time** to re-enter the adaptive region after leaving it.
- **Trajectory entropy:** how predictable versus chaotic the orbit is, a candidate marker of regulatory flexibility.
- **Attractor centroid drift** across age, computed per participant across visits.

**Implementation.**

```
Route: /phase-portrait
Component: web/src/routes/PhasePortrait.tsx
API: GET /api/v2/phase-portrait/:nanoid/:visitAge       (new endpoint)
  Response: {
    fs: number,
    arousal: number[],          // e.g. normalized inverse heart period or RSA-derived arousal proxy
    attention: number[],        // continuous HDA engagement score 0..1
    t: number[]
  }
```

**Construction.**
- **2D portrait (default):** arousal on X, attention on Y. Use the already-installed `d3` contour utilities to render an occupancy density (where the dyad spends time) as soft garnet contours, then overlay the time-ordered trajectory as a line whose color fades from cool (early in session) to warm (late). Shade the adaptive-engagement region as a subtle warm box.
- **3D portrait (optional toggle):** only if the optional 3D stack is added, lift the same trajectory into a tube inside `web/src/components/dyn/EsdCanvas.tsx` where the third axis is time, so the orbit becomes a readable helix-like coil, with the occupancy density projected onto the floor plane.
- **Group prototypes:** overlay faint average trajectories for ASIB, TD, and VPT so an individual orbit can be compared to its group's typical orbit shape.

**Interactions.** Scrub time to animate a dot along the trajectory. Toggle 2D and 3D. Toggle whether the adaptive-engagement region boundaries are auto-derived from the TD group or set manually. Hover any point to read the underlying arousal, attention, and timestamp.

***

## DYN Page 3 (flagship): Coordinated Visual Attention Theater (`/cva-theater`)

**Feature flag:** `DYN_CVA_GAZE_THEATER`

**Concept.** The HMET work captures where the infant looks and, with caregiver coding, where the caregiver attends, during home interaction. The striking finding in the chapter is a face-availability versus face-gaze gap (the caregiver's face is available far more than the infant actually looks at it) and group differences in CVA (infants at elevated likelihood show longer single-toy looks and fewer CVA bouts). This page renders the **temporal choreography** of joint attention between the two partners.

**Why it is new (non-redundancy).** The live repo has no route that shows dyadic gaze overlap over time. This page answers "with whom, and when": the overlap of two gaze streams, the CVA bouts, and the face-availability gap. If a future room-scale spatial page lands later, it should cross-link here, but this V2 feature must not depend on a route that is absent in the current branch.

**New metrics surfaced.**
- **Face-availability gap:** percent of time the caregiver face is available minus percent of time the infant gazes at it. Show the two bars side by side, with the gap annotated.
- **CVA bout count and mean CVA duration** per session, contrasted by group and age.
- **Sticky-look index:** the 90th percentile of single-target look duration, the candidate signature of reduced attention shifting.
- **Scaffold-to-shift latency:** if caregiver scaffolding events (naming, touching, positioning a toy) are coded, the median time from a scaffold event to the infant's next attention shift.

**Implementation.**

```
Route: /cva-theater
Component: web/src/routes/CvaTheater.tsx
API: GET /api/v2/cva/:nanoid/:visitAge                  (new endpoint)
  Response: {
    durationSec: number,
    infantGaze:    { start: number, end: number, target: "face" | "toy" | "other" | "away", toyId?: string }[],
    caregiverGaze: { start: number, end: number, target: "infant_face" | "toy" | "other", toyId?: string }[],
    faceAvailability: { start: number, end: number }[],
    scaffoldEvents?: { t: number, type: "name" | "touch" | "position" }[]
  }
```

**Construction.**
- **Dual gaze ribbon (via `DualTrack`):** two stacked lanes, infant on top, caregiver below, each segmented and colored by target. A third thin lane shows face availability as a backdrop band.
- **CVA overlap band:** wherever infant and caregiver share the same target at the same time, render a highlighted CVA band spanning both lanes. This makes joint attention literally the overlap of the two streams.
- **Availability-gap panel:** the side-by-side bar comparison described above, recomputed live for the selected session and window.
- **Target transition chord (optional):** a small d3 chord diagram of the infant's target-to-target transitions, foreshadowing the sticky-look pattern.

**Interactions.** Brush a time window to recompute all metrics for that window only. Filter to CVA-only segments. Toggle scaffold markers. Hover a CVA band to see its duration and shared target.

***

## DYN Page 4: Heart-Rate Deceleration Profiles (`/hr-deceleration`)

**Feature flag:** `DYN_HR_DECELERATION_PROFILES`

**Concept.** Sustained attention is defined physiologically by heart-rate deceleration, indexed by the depth and duration of the deceleration. This page renders the **event-locked average** heart-rate curve aligned to attention onset, the cardiac analog of an event-related potential, contrasted by group and age.

**Why it is new (non-redundancy).** The HDA Timeline Player shows one session's phase sequence. This page averages across many attention episodes and many participants to reveal the canonical deceleration signature and how its depth and recovery differ by group, which a single-session player cannot show.

**New metrics surfaced.** Mean deceleration depth (beats per minute below baseline), time-to-trough, deceleration duration, and a compensatory-depth flag testing the chapter's hypothesis that some infants need deeper decelerations to reach comparable engagement.

**Implementation.**

```
Route: /hr-deceleration
Component: web/src/routes/HrDeceleration.tsx
API: GET /api/v2/hr-deceleration?group=ASIB&ageBin=3mo   (new endpoint)
  Response: {
    preSec: number, postSec: number, fs: number,
    episodes: { nanoid, group, ageBin, hr: number[] }[]   // each aligned to attention onset at t=0
  }
```

**Construction.** Use `peristimulusAverage` to compute the mean curve and 95% band per group, drawn with recharts as overlaid lines with shaded bands. A vertical zero line marks attention onset; a baseline reference line marks pre-onset mean. Annotate trough depth and time-to-trough with `MetricChip`. Provide a small-multiples grid faceted by age bin.

**Interactions.** Select groups and age bins to overlay. Toggle individual faint episode traces behind the average. Toggle alignment to attention onset versus attention termination.

***

## DYN Page 5: Still-Face and Suppression Explorer (`/stillface`)

**Feature flag:** `DYN_STILLFACE_SUPPRESSION`

**Concept.** RSA suppression, the canonical index of regulatory engagement, is computed in the chapter as the change in RSA between an engaged play phase and a stress phase (for example the ignore or still-face phase). This page renders the full structured paradigm (baseline, play, still-face or ignore, reunion) and the suppression and recovery it produces.

**Why it is new (non-redundancy).** RSA Growth Curves shows RSA against age. This page shows RSA modulation **within** a structured paradigm, which is a different axis entirely, and surfaces suppression and recovery as first-class metrics.

**New metrics surfaced.** Suppression magnitude (play minus stress), recovery magnitude (reunion minus stress), suppression-to-recovery ratio, and a "blunted suppression" flag.

**Implementation.**

```
Route: /stillface
Component: web/src/routes/StillFace.tsx
API: GET /api/v2/stillface/:nanoid/:visitAge            (new endpoint)
  Response: {
    phases: { name: "baseline" | "play" | "stillface" | "reunion", startSec, endSec }[],
    rsa: number[], fs: number,
    caregiverRsa?: number[]                              // optional, enables dyadic suppression overlay
  }
```

**Construction.** A phase-banded RSA time series (recharts area with shaded phase backgrounds in warm tokens). A compact paradigm summary showing mean RSA per phase as connected points, so suppression and recovery read as the down-then-up shape. If caregiver RSA is present, overlay it to show whether the caregiver suppresses alongside the infant. Group distribution chips for suppression and recovery.

**Interactions.** Step phase by phase. Toggle the dyadic caregiver overlay. Compare two visits of the same participant side by side to show developmental change in suppression.

***

## DYN Page 6: HDA Bypass Index and Transition Dynamics (`/hda-bypass`)

**Feature flag:** `DYN_HDA_BYPASS_INDEX`

**Concept.** The chapter's specific, falsifiable hypothesis is that elevated-likelihood infants transition more often from orienting directly to termination, bypassing sustained attention. The live app already shows phase sequences in `HdaPlayer`, but it does not yet compute a dedicated bypass metric. This page is the rigorous analytic route: it computes and tracks the bypass tendency as a number, with confidence intervals and group contrasts.

**Why it is new (non-redundancy).** The current dashboard offers timelines, not a dedicated transition-bypass analysis. This page is quantitative and hypothesis-driven, and it tracks the metric across age rather than rendering only one session's sequence.

**New metrics surfaced.**
- **Bypass index:** P(orienting to termination) divided by P(orienting to sustained), per participant.
- **Sustained-attention dwell time** from the continuous-time model.
- Group-level transition matrices with 95% intervals, and the bypass index plotted against age per group.

**Implementation.**

```
Route: /hda-bypass
Component: web/src/routes/HdaBypass.tsx
API: GET /api/v2/hda-transitions?group=ASIB&ageBin=6mo   (new endpoint)
  Response: {
    transitions: { group, ageBin, from: string, to: string, probability: number, ci95: [number, number] }[],
    perParticipant: { nanoid, group, ageBin, bypassIndex: number, sustainedDwellSec: number }[]
  }
```

**Construction.** Reuse the existing `@nivo/sankey` dependency for a flow from orienting through sustained and termination, with the orienting-to-termination path highlighted when the bypass index is elevated. Beside it, render a transition-probability matrix as a labeled grid with intervals. Below, add a scatter of bypass index against age, colored by group, with group trend lines. Use `MetricChip` for the headline bypass index.

**Interactions.** Toggle group and age bin. Switch the Sankey between groups with a smooth transition. Click a participant point to open their HDA Timeline Player session. If a future transition-geometry page lands in another branch, add a reciprocal link then rather than hard-coding a dependency here.

***

## DYN Page 7: Infant Developmental Passport (`/passport`)

**Feature flag:** `DYN_INFANT_PASSPORT`

**Concept.** A single-screen longitudinal synthesis for one participant that stitches together every modality the study collects: RSA trajectory, HDA and attention metrics, NICU history if preterm (HRC and thermal summary), CVA summary, attachment and spatial assessment results, social-communication milestones, and the eventual outcome, all on one shared age axis with study milestones marked.

**Why it is new (non-redundancy).** The existing per-infant pages are per-modality (thermal for one infant, HDA for one infant). There is no unified longitudinal profile that lets a reviewer see an entire developmental story at once. This is the case-review and stakeholder-demo surface.

**New metrics surfaced.** A per-participant **cascade-completeness score** (how much of their expected longitudinal data is present), a **risk-trend sparkline** (model-predicted outcome as it updates with each new visit), and **deviation-from-group bands** for each modality.

**Implementation.**

```
Route: /passport
Component: web/src/routes/Passport.tsx
API: GET /api/v2/passport/:nanoid                        (new endpoint; aggregates existing per-modality data server side)
  Response: {
    group, sex, gestationalAge,
    timeline: { ageMonths: number, modality: string, metric: string, value: number, groupMean?: number, groupSd?: number }[],
    milestones: { ageMonths: number, label: string }[],
    nicu?: { hrcSummary, thermalSummary },
    outcome?: { adosCSS, ageMonths }
  }
```

**Construction.** A vertical stack of aligned mini-panels sharing one age axis, each a small recharts sparkline with a faint group band behind it. A header card with the participant's group, gestational age, and current risk trend. A "completeness" ring reusing the progress-ring pattern already shipped in `web/src/routes/Overview.tsx`. Every panel deep-links to its full page (the RSA panel links to the existing `Results` route with participant context applied, and so on).

**Interactions.** Type or pick a NANOID. Toggle group bands on and off. Export the passport to the existing PresentationMaker as a single slide.

***

## DYN Page 8: Trajectory Archetypes Atlas (`/archetypes`)

**Feature flag:** `DYN_TRAJECTORY_ARCHETYPES`

**Concept.** ASD heterogeneity is a headline theme of the chapter, including transient, delayed, and persistent patterns. Cross-sectional clustering (the existing ClusterViewer) cannot capture trajectory **shape**. This page surfaces longitudinal subtypes (for example from group-based trajectory modeling) for RSA, attention, or social-communication, showing the canonical shapes and who follows which.

**Why it is new (non-redundancy).** ClusterViewer clusters static feature vectors. This page clusters whole trajectories and renders the archetypal curves, a fundamentally different question (developmental shape, not a single-timepoint snapshot).

**New metrics surfaced.** Archetype membership and posterior probability per participant, archetype prevalence by group, and a "trajectory instability" flag for participants whose membership is ambiguous.

**Implementation.**

```
Route: /archetypes
Component: web/src/routes/Archetypes.tsx
API: GET /api/v2/archetypes?measure=rsa                   (new endpoint)
  Response: {
    measure: string,
    archetypes: { id: number, label: string, meanCurve: { ageMonths, value }[], band: { lo, hi }[] }[],
    members: { nanoid, group, archetypeId, posterior: number }[]
  }
```

**Construction.** A small-multiples grid, one panel per archetype, each showing the archetypal mean curve with its band and a light spaghetti of member trajectories behind it. A stacked-bar panel showing archetype prevalence within ASIB, TD, and VPT. A selectable measure (RSA, attention, social-communication).

**Interactions.** Switch measure. Click an archetype to list its members and open any member's Passport. Highlight a single participant across all archetype panels to show their fit.

***

## DYN Page 9: Cascade Intervention Simulator (`/cascade-sim`)

**Feature flag:** `DYN_CASCADE_SIMULATOR`

**Concept.** The chapter stresses that this science aims at actionable early detection and intervention. The live dashboard's `CascadeDag` route already **describes** the pathways. This page lets a user reason **counterfactually** over them: nudge an early parameter (for example, improve 3-month RSA suppression or sustained-attention dwell) and propagate the change through the fitted cascade paths to a predicted change in the 36-month outcome, with an uncertainty band.

**Why it is new (non-redundancy).** Every cascade view so far is read-only structure. This is an interactive what-if tool, decision support rather than description. It is the natural action layer on top of the existing cascade and model pages.

**New metrics surfaced.** Predicted outcome shift for a given early-parameter change, percent of the effect that is mediated through each intermediate node, and the highest-leverage early target (which single early change moves the outcome most).

**Implementation.**

```
Route: /cascade-sim
Component: web/src/routes/CascadeSimulator.tsx
API: GET /api/v2/cascade-paths                            (new endpoint; returns fitted standardized path coefficients + covariance)
POST /api/v2/cascade-sim                                  (optional; server-side propagation for heavier models)
  GET Response: {
    nodes: { id, label, domain }[],
    paths: { from, to, beta, se }[],
    baseline: { nodeId, value }[]
  }
```

**Construction.** A left control panel of sliders, one per manipulable early node, each anchored at the cohort baseline. A right panel showing the predicted outcome distribution before and after the manipulation (two overlaid densities) plus a tornado bar of per-node leverage. Propagate effects along the DAG in `useMemo`, summing standardized indirect effects, and draw the uncertainty band from the supplied standard errors. Make explicit, in on-screen copy, that this is a model-based projection and not a clinical prediction.

**Interactions.** Drag sliders to update the projection live. "Find highest-leverage target" auto-solves the single most influential early change. "Open the cascade" links to `/cascade-dag` with the manipulated path emphasized; if a future river-style cascade route lands later, wire it as a secondary link rather than a prerequisite.

**Honesty guardrail for this page specifically.** Because this feature outputs forward-looking numbers, the UI must label every output as a model projection with an uncertainty band, must never phrase an output as a prediction about a named individual, and must surface the fitted model's own goodness-of-fit so users can judge how much to trust the projection.

***

## DYN Page 10: Ecological Validity and Equity Panel (`/eco-validity`)

**Feature flag:** `DYN_ECOVALIDITY_EQUITY`

**Concept.** A core argument of the chapter is that home-based, naturalistic data collection is both more ecologically valid and more inclusive than lab-based collection. This page operationalizes that argument as a living comparison: lab versus home on behavior (for example caregiver-reported negative reactivity), on data quality (percent valid behavioral and ECG data), and on representation (income, rurality, travel distance, BIPOC enrollment), all computed from the dashboard's own enrollment data.

**Why it is new (non-redundancy).** SdohMap shows geography; Attrition shows dropout. Neither contrasts the lab and home arms on validity and equity, which is the lab's stated mission metric.

**New metrics surfaced.** Lab-versus-home deltas for negative reactivity, valid-data percentage, median household income, median round-trip distance, and a composite representation index relative to the local population.

**Implementation.**

```
Route: /eco-validity
Component: web/src/routes/EcoValidity.tsx
API: GET /api/v2/eco-validity                             (new endpoint)
  Response: {
    arms: ("lab" | "home")[],
    behavior: { metric: string, lab: number, home: number, test?: string, p?: number }[],
    quality:  { metric: string, lab: number, home: number }[],
    representation: { metric: string, lab: number, home: number, localReference?: number }[]
  }
```

**Construction.** A set of paired-bar comparisons (lab versus home) grouped under Behavior, Data Quality, and Representation headers, each annotated with the delta and, where supplied, a test statistic. A representation panel that places lab and home against a local reference line. Use `MetricChip` with the verify affordance for any value compared to an external population figure.

**Interactions.** Toggle metric groups. Filter to a date range or a specific study. Export the comparison to PresentationMaker for grant and IRB reporting.

***

## DYN Page 11 (optional): Multimodal Stream Coverage Timeline (`/stream-coverage`)

**Feature flag:** `DYN_STREAM_COVERAGE`

**Concept.** The home apparatus synchronizes several streams: two ECG channels, audio, video, and LED or microcontroller event markers. REDCap Completeness tracks completeness at the form level. This page tracks it at the **signal** level: for a given session, which streams were valid at which moments, where they dropped, and how well they were synchronized.

**Why it is new (non-redundancy).** REDCap Completeness is about questionnaire and visit data. This is about raw signal coverage and synchronization, a different and currently unserved QA need that sits naturally next to Window QA and Runs.

**New metrics surfaced.** Per-stream valid-coverage percentage, count and location of dropouts, and a cross-stream synchronization-offset estimate.

**Implementation.**

```
Route: /stream-coverage
Component: web/src/routes/StreamCoverage.tsx
API: GET /api/v2/stream-coverage/:nanoid/:visitAge        (new endpoint)
  Response: {
    durationSec: number,
    streams: { name: "ecg_infant" | "ecg_caregiver" | "audio" | "video" | "markers", valid: { start, end }[] }[],
    syncOffsetsMs?: { pair: string, offsetMs: number }[]
  }
```

**Construction.** A multi-track Gantt-style coverage chart, one lane per stream, valid spans in green tokens and gaps in warm-fg muted, with dropout markers. A small synchronization panel listing pairwise offsets. Clicking a gap in the infant or caregiver ECG lane links to the relevant Window QA epoch.

***

## Cross-links to existing pages

After implementing the V2 pages, add these affordances to existing routes in the live `web/` app (each guarded by the relevant `DYN_` flag so it appears only when the target feature is enabled):

- `web/src/routes/Overview.tsx`: add a `Dynamics & Dyads` discovery section near the existing progress/discovery surfaces, with mini cards for the V2 pages.
- `web/src/routes/HdaPlayer.tsx`: add `View co-regulation`, `View phase portrait`, and `See bypass analysis` actions for the current NANOID and visit age.
- `web/src/routes/Results.tsx`: from the RSA growth panel, add `View suppression paradigm` and `Open developmental passport` actions when participant context is available.
- `web/src/routes/CascadeDag.tsx`: add `Run a what-if` linking to `/cascade-sim`.
- `web/src/routes/ClusterViewer.tsx`: add `View trajectory archetypes` linking to `/archetypes`.
- `web/src/routes/Participants.tsx` and `web/src/routes/ParticipantDetail.tsx`: add `Open developmental passport` for the active NANOID.
- `web/src/routes/SwimmerPlot.tsx` and `web/src/routes/QA.tsx`: where a specific session is in focus, add `View stream coverage` and `Open developmental passport` links.
- `web/src/routes/PresentationMaker.tsx`: accept seeded launches from Passport, Eco-Validity, and Cascade Simulator rather than creating duplicate export flows.

If future branches later land room-scale spatial pages or transition-geometry pages, add reciprocal links then. Do not block this V2 work on routes that are absent from the current branch.

***

## AI Buddy, landing, and presentation sync

These features are not complete until the conversational and discovery surfaces know about them:

- `web/src/components/shell/Buddy.tsx`: add `data-insight` mappings for DYN route cards, metric chips, and new CTA surfaces so hover help stays current.
- `web/src/components/shell/ChatDrawer.tsx`: extend `BUDDY_FAST_PATHS` with prompts for co-regulation, phase portrait, CVA, still-face, HDA bypass, passport, eco-validity, and cascade simulation.
- `dashboard/assistant/local_chat_assistant.py`: update the assistant's route inventory, feature descriptions, and grounded vocabulary so the live assistant can explain the DYN surfaces without hallucinating stale route names.
- `web/src/api/mockServer.ts`: add mock `/api/v2/*` payloads plus DYN-aware mock assistant responses so local development and Pages preview remain coherent.
- `web/src/routes/Landing.tsx`: if the public landing is meant to preview the DYN layer, add a small gated discovery block or assistant seed prompts behind the same `DYN_` flags; do not expose dead links when flags are off.
- `web/src/routes/PresentationMaker.tsx`: route passport, eco-validity, and cascade-simulator export intents through the existing seeded Presentation Maker flow instead of inventing a parallel slide generator.

***

## Layout, symmetry, and theme consistency

- Default new analytic routes to the same hero/card rhythm as existing feature pages by reusing `web/src/routes/FeatureRoutes.module.css` or deriving a small companion CSS module from it. Match the current split-grid patterns instead of ad hoc absolute positioning.
- Respect the layout constraints in `web/src/components/shell/AppShell.tsx`: the sidebar, top nav, footer, Buddy, chat drawer, and floating assistant FAB already consume fixed visual territory. No new sticky inspector, legend, or control rail may sit beneath or collide with them.
- Validate at the shell's practical widths (`1480`, `1280`, `1100`, `1024`) plus a narrower public/landing width if DYN cards appear outside the shell. Collapse to one column before any chart labels, pills, or filters overlap.
- Keep tables, long legends, and filter bars inside overflow-managed wrappers rather than letting labels spill over cards.
- Any gradient headline, accent wash, inverse badge, or subtle text treatment must be token-driven via `web/src/styles/tokens.css` and `web/src/styles/global.css`. Do not hardcode light-only or dark-only color assumptions.
- Check typography, gradient text, and subdued labels under `light`, `dark`, and `system` theme modes from `web/src/store/ui.ts`. Contrast and font weight must remain legible in both themes.

***

## Shared performance, accessibility, and degradation (V2 specifics)

Follow the live dashboard's existing performance and accessibility conventions, with these additions:

- **Compute off the render path.** All cross-correlation, peri-stimulus averaging, contouring, and cascade propagation run in `useMemo` keyed on the data and parameters, never inside `useFrame` and never re-run on hover. For sessions long enough to make windowed cross-correlation expensive, move `web/src/lib/signal` work into a Web Worker and stream results in.
- **Dyadic privacy.** Caregiver streams are PHI-adjacent. Enforce NANOID-only keys for caregivers, and ensure no endpoint returns a caregiver identifier, timestamp tied to a real date, or any free-text note.
- **Honesty in the UI.** Any number that comes from the literature rather than from live data must render through `MetricChip` with the verify affordance and a source label. The Cascade Simulator must always show its uncertainty band and the underlying model fit, and must never present an output as an individual clinical prediction.
- **Accessibility.** Every chart and canvas has a sibling `role="img"` description and a "Show data table" toggle. Color encodings pair with shape, label, or position so they remain legible under deuteranopia and protanopia. The braid and phase portrait, being motion-heavy, respect `prefers-reduced-motion` by rendering a static representative frame.
- **Graceful degradation.** Each page handles an empty or unavailable endpoint by showing an explanatory empty state, not a crash. If optional Three.js views are added, create a dedicated WebGL error boundary and static SVG fallback under `web/src/components/dyn/` instead of assuming absent Layer 2 infrastructure.

***

## Recommended build order for V2

1. **Phase 0 V2:** add `web/src/lib/signal`, `web/src/components/dyn`, matching schema/hook/mock stubs, and unit tests under the existing `web/src/test` + Vitest setup. Validate `windowedCrossCorrelation` and `peristimulusAverage` with synthetic signals before any UI work.
2. **DYN Page 4 (HR Deceleration):** simplest, reuses `peristimulusAverage` and recharts, validates the event-locked pattern.
3. **DYN Page 5 (Still-Face):** reuses phase-banded time series, low risk, high scientific value.
4. **DYN Page 1 (Co-Regulation):** the flagship, validates `windowedCrossCorrelation`, `LagSurface`, and `DualTrack` end to end.
5. **DYN Page 2 (Phase Portrait):** validates occupancy contouring from the existing `d3` bundle and the 2D-to-3D toggle if that optional mode remains.
6. **DYN Page 3 (CVA Theater):** validates dyadic segment overlap and windowed metric recomputation.
7. **DYN Page 6 (HDA Bypass):** validates the existing `@nivo/sankey` flow and the transition-matrix grid.
8. **DYN Page 7 (Passport):** synthesis page, depends on a server-side aggregation endpoint, high stakeholder value.
9. **DYN Page 8 (Archetypes):** depends on trajectory-model output from the backend.
10. **DYN Page 10 (Eco-Validity):** depends on enrollment-arm data, mission reporting value.
11. **DYN Page 9 (Cascade Simulator):** build after the cascade-path endpoint is fitted and validated, since it is the most consequential output.
12. **DYN Page 11 (Stream Coverage, optional):** build last, alongside or after signal-level QA work.

***

## Feature flag registration summary (V2)

Add these to `web/src/config/featureFlags.ts` (all default `false`):

| Flag | Route | Nav Label | Icon | Primary tech |
|---|---|---|---|---|
| `DYN_CO_REGULATION_BRAID` | `/dyad-coregulation` | Co-Regulation | `git-merge` | 2D + optional 3D |
| `DYN_AROUSAL_ATTENTION_PORTRAIT` | `/phase-portrait` | Phase Portrait | `git-commit` | 2D + optional 3D |
| `DYN_CVA_GAZE_THEATER` | `/cva-theater` | CVA Theater | `eye` | 2D |
| `DYN_HR_DECELERATION_PROFILES` | `/hr-deceleration` | HR Deceleration | `activity` | 2D |
| `DYN_STILLFACE_SUPPRESSION` | `/stillface` | Still-Face | `pause-circle` | 2D |
| `DYN_HDA_BYPASS_INDEX` | `/hda-bypass` | HDA Bypass | `shuffle` | 2D (`@nivo/sankey`) |
| `DYN_INFANT_PASSPORT` | `/passport` | Passport | `id-card` | 2D |
| `DYN_TRAJECTORY_ARCHETYPES` | `/archetypes` | Archetypes | `git-branch` | 2D |
| `DYN_CASCADE_SIMULATOR` | `/cascade-sim` | Cascade Sim | `sliders` | 2D interactive |
| `DYN_ECOVALIDITY_EQUITY` | `/eco-validity` | Eco-Validity | `scale` | 2D |
| `DYN_STREAM_COVERAGE` | `/stream-coverage` | Stream Coverage | `layers` | 2D |

Append this sidebar section in `web/src/components/shell/Sidebar.tsx` after the existing `data` group and before `tools`, and add matching lazy imports + routes in `web/src/App.tsx`:

```typescript
{
  id: "dyn",
  title: "Dynamics & Dyads",
  items: [
    { to: "/dyad-coregulation", label: "Co-Regulation",   icon: "git-merge",    flag: "DYN_CO_REGULATION_BRAID" },
    { to: "/phase-portrait",     label: "Phase Portrait",   icon: "git-commit",   flag: "DYN_AROUSAL_ATTENTION_PORTRAIT" },
    { to: "/cva-theater",        label: "CVA Theater",      icon: "eye",          flag: "DYN_CVA_GAZE_THEATER" },
    { to: "/hr-deceleration",    label: "HR Deceleration",  icon: "activity",     flag: "DYN_HR_DECELERATION_PROFILES" },
    { to: "/stillface",          label: "Still-Face",       icon: "pause-circle", flag: "DYN_STILLFACE_SUPPRESSION" },
    { to: "/hda-bypass",         label: "HDA Bypass",       icon: "shuffle",      flag: "DYN_HDA_BYPASS_INDEX" },
    { to: "/passport",           label: "Passport",         icon: "id-card",      flag: "DYN_INFANT_PASSPORT" },
    { to: "/archetypes",         label: "Archetypes",       icon: "git-branch",   flag: "DYN_TRAJECTORY_ARCHETYPES" },
    { to: "/cascade-sim",        label: "Cascade Sim",      icon: "sliders",      flag: "DYN_CASCADE_SIMULATOR" },
    { to: "/eco-validity",       label: "Eco-Validity",     icon: "scale",        flag: "DYN_ECOVALIDITY_EQUITY" },
    { to: "/stream-coverage",    label: "Stream Coverage",  icon: "layers",       flag: "DYN_STREAM_COVERAGE" },
  ]
}
```

***

## One-paragraph rationale to include in the pull request description

This layer deliberately moves the dashboard from single-subject snapshots to relationships across time. It adds the dyad (caregiver-infant autonomic co-regulation and coordinated visual attention), the dynamical-systems view (the arousal-attention phase portrait), the canonical physiological signatures the current routes still skip (event-locked heart-rate deceleration and structured still-face suppression), a rigorous transition-bypass analysis that complements the existing HDA surfaces, a longitudinal synthesis surface (the infant passport), a trajectory-shape view of heterogeneity that cross-sectional clustering cannot provide (the archetypes atlas), an action layer on top of the cascade model (the what-if simulator), and a direct operationalization of the lab's inclusivity argument (the ecological-validity and equity panel). None of these duplicates an existing shipped route, and each is grounded in a specific construct from the ESD Lab's own framework.
