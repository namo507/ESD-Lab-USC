# Implementation Prompt: Documentation + How-to + Visual Tutorial for the NANO Study Dashboard

> Paste everything below into your coding agent (Claude Code, Cursor, etc.) that has access to the dashboard repository. It is written as a complete, self contained build brief. A "Context Pack" is included so the agent does not need to re-crawl the site, but the agent should still verify the live values and the actual component/router stack before writing code.

---

## 0. Meta instructions for the implementing agent

- Read the Context Pack (Section 7) first. It is a snapshot of the live site captured on 2026-06-29 from `https://esd-lab-namo.pages.dev/` and `https://esd-lab-namo.pages.dev/overview`. Treat numbers as live and changeable, never hard-code them into prose.
- Before coding, open the repo and confirm the real stack: framework, router, styling system, and where the existing nav and sections are defined. The Context Pack lists what was observed from the rendered output, not from source. If anything in the Pack conflicts with the code, the code wins.
- Match the existing visual language exactly (Section 6). Do not introduce a new design system, new fonts, or heavy dependencies. This site is minimal, serif-led, and warm. Keep it that way.
- Do not invent study facts, citations, metric values, or terminology definitions. Pull copy from existing components, the live API hooks, and the indexed reading library. Where a definition is needed and not present in the codebase, mark it `TODO: confirm with lab` rather than guessing.
- Write nothing that exposes PHI. This is a HIPAA-audited surface. Use only the de-identified, NANO-ID-style examples already used on the site.
- Avoid em dashes in all user-facing copy. Use commas, colons, or parentheses.

---

## 1. Objective

Add two new, first-class areas to the NANO Study Dashboard without disturbing the existing public landing page (`/`) or operator console (`/overview`):

1. A **Documentation** area that explains the full information architecture, the data flow, every section shown on both surfaces, and the domain vocabulary, so a new clinician, researcher, or operator can understand what the dashboard is and what every number means.
2. A **How-to** area that teaches beginners how to actually use the dashboard features, step by step, anchored by an **aesthetic, minimal, visual tutorial** (a guided spotlight tour over the real UI plus annotated still walkthroughs).

Both must feel native to the current site: same serif, same maroon accent, same calm spacing, same hover-aware Buddy guide.

---

## 2. Scope

### In scope
- New route `/docs` (Documentation) and `/how-to` (How-to). If the router prefers a single area, use `/docs` with a `How-to` tab; keep both reachable by direct URL.
- A Documentation reference covering: the two surfaces, the glossary, the data architecture and pipeline, a section-by-section reference for the public landing, a panel-by-panel reference for the operator console, the assistant, and compliance.
- A How-to area with task-based, beginner-friendly walkthroughs for every interactive feature.
- One reusable **visual guided tour** component (spotlight overlay with numbered steps) plus minimal annotated still figures.
- Navigation entry points: a `Docs` link in the public top nav, a `Documentation` and `Help / Tour` entry in the operator sidebar, and a contextual "How do I read this?" affordance wired into the Buddy guide.

### Out of scope (do not build now)
- No change to study data, pipeline logic, or the operator panels themselves.
- No new auth, no new backend, no analytics vendor.
- No rewrite of existing sections. You may add `id` and `data-tour` attributes to existing elements, nothing more.

---

## 3. Inputs and variables

Use placeholders so the work is reusable and not pinned to today's snapshot.

- `{docs_route}` default `/docs`
- `{howto_route}` default `/how-to`
- `{public_nav_label}` default `Docs`
- `{tour_trigger_label}` default `Take the tour`
- `{primary_accent}` default the existing deep maroon (confirm exact token in code; observed near `#6E1423` to `#7B1E2B`)
- `{paper_bg}` default the existing warm off-white (observed near `#FBFAF8`)
- `{serif_display}` the existing display serif used in headings (confirm in code)
- `{audience}` in {clinician, researcher, operator, new_lab_member}; the How-to defaults to `new_lab_member`
- `{live_values_source}` the existing API hooks already powering the operator routes; documentation must read from these, never duplicate values in static copy

---

## 4. Detailed requirements: Documentation (`/docs`)

Build a documentation hub with a left sticky table of contents (collapsible on mobile) and a readable single-column content well. Reuse the existing eyebrow + serif heading pattern. Each doc page deep-links to the live section it describes (use the hash anchors that already exist on the landing page, listed in the Pack).

Author these pages in this order, because this is the natural reading flow from "what is this" to "how the data is made" to "what every screen shows":

1. **Overview: what the dashboard is**
   Purpose, who it is for (clinicians, researchers, lab operators), and the one-line study framing already on the site: a five-year longitudinal study of 260 infants across very preterm, autism-sibling, and term-born cohorts, where every form, ECG segment, HDA label, and model output traces back to one de-identified clinical pipeline.

2. **The two surfaces**
   Explain the split clearly: the **public narrative surface** (`/`) tells the longitudinal infant story, the live pipeline, the cohort-level questions, and the assistant, without dropping users into the operator shell. The **operator console** (`/overview`) is the working lab cockpit. Include a "when should I use which" table and how to move between them (the `Operator view` toggle and the `Landing` button).

3. **Glossary of terms**
   A scannable, linkable glossary. Cover at least: NANO Study, HDA (Heart-Defined Attention), the four attention states (orienting, sustained, inattention, termination), VPT (very preterm), ASIB (autism sibling), TD (typically developing), CGA (corrected gestational age, used in visit labels like `cga_12mo`), RMSSD, RSA, HRV, epoch / window (5-second ECG segment), Actiheart-5 (1024 Hz chest ECG), Pan-Tompkins R-peak detection, CWT (continuous wavelet transform), SHAP attribution, DBSCAN cluster shifts, HeRO HRC scores, DataVyu video coding, dual-thermistor thermal gradients, SQI (signal quality index), REDCap, LM Studio, ADOS-2 CSS, XGBoost, trajectory, parquet / long-form export, PHI, HIPAA, de-identification, IRB. Pull any definition that already exists in the UI; mark the rest `TODO: confirm with lab`.

4. **Data architecture: from chest to claim**
   Document the five-layer flow exactly as the Architecture section presents it: Edge capture (devices and sensors) to REDCap and forms (metadata and capture) to SQI and HDA labels (preprocess and QA) to Parquet outputs (features and long-form tables) to XGBoost and trajectories (models and inference). Then document the six pipeline stages (Section 7) with what "done" and "fail" counts mean.

5. **Public landing reference, section by section**
   One subsection per landing anchor, each describing what is shown, what the numbers mean, and what is interactive. Cover Overview/hero, Metrics, Aims, Architecture, Pipeline, QA, Cohort, Model Studio, Assistant, Library. Use the Pack as the source of truth for content and interactions.

6. **Operator console reference, panel by panel**
   Document the sidebar groups and every item: Lab Operations (Overview, Intakes and Stories, Window QA), Active Studies (NANO Study VPT, Home Study, FiSCAL-ASD), and Data Infrastructure (Clinical Pipeline, REDCap Sync, Pipeline Health, MATLAB Bridge, Results and Trajectories, HDA Timeline, Thermal Heatmap, Swimmer Plot, Attrition, ECG Quality, SDOH Map). Document the top bar too: the `Ask the lab` search, the session timer, `Force Sync` and the sync status, the clock, and `System`.

7. **The assistant (Ask the lab)**
   Explain that it is an in-page, operationally grounded assistant, what it is good for (explain the study, unpack HDA, summarize a result, decide when to switch into the operator routes), the starter prompt chips, and the privacy note that LM Studio prompts are PHI-scrubbed before they leave the browser.

8. **Compliance and privacy**
   Document the HIPAA-compliant audit logging, the PHI processing zone banner, identifier stripping via the REDCap proxy, the `PHI leaks: 0` indicator, the IRB protocol number shown in the console, and the session run identifier pattern (for example `run_2026_115_a`).

9. **Data sources and refresh**
   Note that metrics come from the live API hooks already powering the operator routes, that the reading Library is auto-built from the `esd-lab-readings/` corpus and shows its index date, and that the operator console exposes `Force Sync` and a last-sync timestamp.

Documentation acceptance: every landing section and every operator panel named in the Pack has a corresponding documented entry; every entry links to the live location; no value is hard-coded where a live hook exists.

---

## 5. Detailed requirements: How-to (`/how-to`)

Task-oriented and written for someone who has never seen the dashboard. Each how-to is a short card: a one-line goal, 3 to 6 numbered steps, and one minimal visual (an annotated still or an inline "Show me" button that launches the relevant tour step). Keep verbs first and sentences short.

Author at least these how-tos:

- Get oriented in 5 minutes (read the enrollment banner, the Attention Pulse card, and the About the Study card).
- Navigate the site (use the top nav, which smooth-scrolls to sections; meet the Buddy guide and its hover tips).
- Read the live Pipeline (what the six stage cards mean, and how to read done versus fail).
- Explore the Specific Aims (expand and collapse a card to reveal Hypothesis, Method, Outcome; use "Ask about Aim N").
- Inspect the Data Architecture (select a layer on the left to update the detail panel; use "Open pipeline detail" and "Open REDCap sync").
- Use the Cohort table (filter by group, read Participant, Group, Visit, Site, Status, and open the full participant table).
- Try the Model Studio (move the input sliders, watch the risk gauge update, press "Explain features", press "Reset inputs"). State clearly that the sliders are illustrative and do not change study data.
- Ask the lab (open the assistant, use a starter chip, ask a follow up).
- Search the Library (search by title, author, or abstract; read the composition, cadence, and depth charts).
- Switch to Operator view (what changes, the sidebar appears, the compliance banner, how to return with `Landing`).
- Operator basics (run `Force Sync`, read the session timer, open `System`).

How-to acceptance: every interactive feature found on either surface has exactly one matching how-to; each how-to has a visual; nothing references PHI.

---

## 6. The visual tutorial (the centerpiece)

Build one reusable, minimal, aesthetic guided tour, plus lightweight annotated stills. This is the thing the user most wants, so make it feel crafted, not bolted on.

### 6.1 Guided spotlight tour (primary)
- A `{tour_trigger_label}` button appears in the How-to area, in the public top nav (small), and inside the Buddy guide ("Walk me through it").
- On launch, dim the page with a soft scrim, cut a rounded spotlight hole around the real target element, and float a small tooltip card with: a step counter (for example `3 / 9`), a short serif title, one or two sentences of plain copy, and `Back` / `Next` / `Skip` controls. Let the Buddy mascot present each step so the tour feels like the existing brand, not a generic library.
- Drive targets with `data-tour="..."` attributes added to existing elements (nav items, the Attention Pulse card, an Aim card, the Architecture layer list, a Pipeline stage, the Cohort filter, a Model Studio slider, the Assistant input, the Library search, the Operator view toggle). The tour reads an ordered step list, scrolls each target into view, then positions the spotlight and tooltip.
- Provide at least two tracks: a **Public tour** over `/` and an **Operator tour** over `/overview`. A step may navigate routes between tracks.

### 6.2 Annotated stills (fallback and in-line teaching)
- For each How-to card, render a minimal figure: a cropped, calm screenshot or a clean SVG line sketch of the panel, with small numbered maroon pins that map to the steps. No drop shadows beyond the existing card style, no skeuomorphism. These also serve users who prefer reading to touring, and they are the graceful fallback when motion is reduced.

### 6.3 Behavior, accessibility, performance
- Keyboard support: `Tab` order trapped inside the tooltip, `Esc` to exit, arrow keys for `Next` / `Back`.
- Respect `prefers-reduced-motion`: disable the spotlight animation and crossfade, fall back to the annotated stills.
- Mobile: the spotlight becomes a bottom-sheet tooltip; targets still scroll into view.
- Remember completion in a privacy-safe way (no PHI). A small `localStorage` flag like `nano_tour_seen` is acceptable for a "resume or restart" affordance, but do not store any clinical data.
- Dependency budget: prefer a tiny custom overlay (roughly 150 to 250 lines) over a heavy tour library, so it stays fast on Cloudflare Pages and matches the site exactly. If a library is unavoidable, justify it and theme it fully.

Tutorial acceptance: the public tour and operator tour each run end to end; spotlight aligns to real elements after scroll; keyboard and reduced-motion paths work; nothing blocks the main thread noticeably; the visual matches the site's serif and maroon language.

---

## 7. Context Pack (live snapshot, 2026-06-29)

This is what the two pages render. Use it as the content source. Verify against the live hooks and the repo before shipping.

### 7.1 Brand and chrome
- Identity: `ESD Lab`, `NANO . UofSC` on the public surface; `Early Social Development Lab, Institute for Mind and Brain, University of South Carolina` on the console.
- Persistent on `/`: top nav, a maroon `Ask the lab` button, a `System` button, an enrollment banner (`NANO Study . Actively Enrolling . 231 / 260 participants` with `Learn more about participating`), a bottom-center HIPAA session pill (`HIPAA session run_2026_115_a <time>`) with an `Operator view` toggle, a floating maroon sparkle button (assistant), and the Buddy mascot (a small round face, bottom-left) that shows hover-aware guidance.
- Public top nav anchors and their hash targets: Overview (`#`/top), Metrics (`#metrics`), Aims (`#aims`), Architecture (`#architecture`), Pipeline (`#pipeline`), QA (`#qa`), Cohort (`#cohort`), Model and Studio (`#studio`, eyebrow reads MODEL STUDIO), Assistant (`#assistant`), Library (`#library`). Unknown paths like `/docs` currently fall back to the landing top, so `/docs` and `/how-to` are free to claim.

### 7.2 Public landing, section by section
- **Hero / Overview**: eyebrow `LIVE NANO PIPELINE . 72 STAGES IN FLIGHT`; headline `The heartbeat of every baby's first year.`; intro paragraph about centering the NANO Study, the live pipeline, the cohort questions, and the assistant. Card `ATTENTION PULSE 70.1%` (labeled windows in sustained attention) with a legend Orienting 18%, Sustained 70%, Inattention 8%, Termination 4%, plus bars VPT 70%, ASIB 66%, TD 75%. Card `ABOUT THE STUDY` with the longitudinal framing and stats Enrolled 231/260, RMSSD 44.0 ms, Epochs 7,131, PHI leaks 0.
- **Metrics** (`LAB PULSE`, `What's moving today.`): cards Infants enrolled 231/260 (recruitment narrative), Epochs 24h 7,131 (signal throughput), Median RMSSD 44.0 ms (trajectory benchmark), Assistant-ready context 1,417 (explainer surface). Then `DYNAMICS AND DYADS, Relationships across time.` with Co-regulation (Open), Cascade Sim (Open), and a synchrony chart (r 0.96, lead-lag +5.3s, coupled 6/8). These dyad previews are feature-flagged v2, NANO-ID only.
- **Aims** (`SPECIFIC AIMS`, `Three questions, one trajectory.`): three expandable cards. Aim 01 Maturation of autonomic regulation of attention (compare ASIB, VPT, TD on how HDA matures; ages 1-3 months; Hypothesis, Method, Outcome shown when expanded; `Ask about Aim 01`). Aim 02 HDA x interactive behavior coordination (ages 6, 9, 12 months). Aim 03 Predicting ASD symptoms at age 3 (infant features to age-3 outcome).
- **Architecture** (`DATA ARCHITECTURE`, `From chest to claim.`): a left layer selector with Edge capture (devices and sensors), REDCap and forms (metadata and capture), SQI and HDA labels (preprocess and QA), Parquet outputs (features and long-form tables), XGBoost and trajectories (models and inference). The right panel shows the selected layer's detail (for Edge capture: Actiheart-5 continuous chest ECG at 1024 Hz, head-mounted eye tracking for naturalistic attention, session logs and caregiver context) with `Open pipeline detail` and `Open REDCap sync`.
- **Pipeline** (`PIPELINE`, `The NANO pipeline, live.`, `Open run history`): six stage cards. Stage 01 Ingest, value 14, Actiheart-5 + REDCap, 1,824 done . 0 fail. Stage 02 Preprocess, 9, filter . detect R-peaks, 1,786 done . 38 fail. Stage 03 Window QA, 27, epoch-level review, 1,641 done . 145 fail. Stage 04 HRV features, 18, time and freq domain, 847 done . 2 fail. Stage 05 HDA labeling, 4, phase classification, 612 done . 0 fail. Stage 06 Merge . de-id, 0, long-form parquet, 421 done . 0 fail.
- **QA** (`QUALITY AND FLOW`, `An agent watching the wires.`): a dark Agentic QA `Pipeline watchlist` card (QA: 185 stage failures surfaced for human review; Flow: NANO-0102 reached cga_12mo at Prisma Midlands with pass QA status; Run: run_2026_115_a is running in auto, 18 visits, owned by jbradshaw; `Ask the assistant`). A `Recent participant flow, The last four hours` list of NANO IDs with cohort, visit, and site.
- **Cohort** (`COHORT SNAPSHOT`, `Every infant, every visit.`, `Open participant table`): a `FILTER` dropdown (All groups) with a participants-shown count, and a table with columns Participant, Group, Visit, Site, Status. Example rows include NANO-0102 VPT cga_12mo Prisma Midlands pass, NANO-0107 VPT cga_12mo Prisma Midlands pending, NANO-0114 ASIB cga_9mo USC Lab pass, NANO-0121 TD cga_6mo USC Lab pass, NANO-0134 VPT cga_6mo Prisma Midlands reject.
- **Model Studio** (`MODEL STUDIO`, `Adjust the infant profile.`): a left `Input features, Per-infant predictors` card with sliders RMSSD @ 3mo (38.4 ms), Sustained HDA (52%), Max HR deceleration (7.2 bpm), CGA at 3mo visit (49.0 wk), Ectopic beats (1.3%), plus `Reset inputs` and `Explain features`. A right radial gauge showing Estimated age-3 symptom likelihood (for example 19.5%) with Algorithm XGBoost, Train split 80/20, Feature groups 24, Status Calibrated. The sliders are explicitly illustrative and do not leave the landing page.
- **Assistant** (`AI ASSISTANT`, `Ask the lab anything.`): an in-page assistant with starter chips Walk me through the NANO Study, Explain what HDA means in this pipeline, How is the classifier validated, What should a clinician look at first on this site.
- **Library** (`ANCHOR READING`, `Where this work points.`): a search box (title, author, abstract); `INDEXED CORPUS, The reading library, in numbers` auto-built from `esd-lab-readings/`, indexed Jun 25, with 20 readings, 634 pages, 3 sources, 24.2 MB indexed; a Library composition by source (Advances in Child Development and Behavior 16, Grant Materials 3, Child Development Perspectives 1); a reading list with page counts; Publication cadence by year (2022 one, 2025 fifteen, Undated four); Reading depth by length buckets; and a frequent indexed terms cloud (developmental, attention, attachment, autism, autonomic, early, family, infants, intervention, model).

### 7.3 Operator console (`/overview`)
- Header: `Early Social Development Lab`, `UofSC . IMB`, an `Ask the lab` search (placeholder example `NANO-0173 RMSSD trend?`), a session timer, a `Landing` button, `System`, a clock, a maroon `Force Sync` button, and a sync status (for example `not synced`).
- Compliance banner: `PHI processing zone . HIPAA-compliant audit logging is active. All exports are stripped of identifiers via REDCap proxy; LM Studio prompts are PHI-scrubbed before they leave the browser.` plus `IRB Pro00115234` and the session age.
- Left sidebar groups and items: Lab Operations (Overview, Intakes and Stories, Window QA with a count), Active Studies (NANO Study VPT with a count, Home Study, FiSCAL-ASD), Data Infrastructure (Clinical Pipeline, REDCap Sync, Pipeline Health tagged NEW, MATLAB Bridge, Results and Trajectories, HDA Timeline, Thermal Heatmap, Swimmer Plot, Attrition, ECG Quality, SDOH Map).
- Main: eyebrow `LAB PULSE . <date>`; headline `Live NANO Pipeline and Lab Operations`; an intro describing the signal path (Actiheart-5 1024 Hz ingest, Pan-Tompkins R-peak detection, continuous wavelet transforms for RSA, SHAP attribution, DBSCAN cluster shifts, six stages one heartbeat; HeRO HRC scores, DataVyu video coding, dual-thermistor thermal gradients converging on the de-identified export; click any node for stage detail). Controls `Trajectories` and `Last 24 h`. Five KPI cards: Active enrollees 231/260 (4 new, cohort building VPT . ASIB . TD, +4 this wk), Evaluations pending (families count, awaiting HDA phase labels and ADOS-2 CSS feedback), Epochs processed 24h 7,131 windows (Actiheart-5 ECG 5-s segments through CWT-derived RSA, +312 vs yesterday), REDCap health 47.9% (payload age, flags, delta RMSSD), Publications 2 indexed (last sync timestamp). Below, a `72 epochs in flight . 6 stages . live` pipeline funnel of circular stage nodes with done counts, with the tip `click any stage for detail`.

### 7.4 Design language (match this)
- Background: warm off-white paper. Text: near-black charcoal. Accent: deep maroon for buttons, the Force Sync control, chart lines, and active states.
- Headings: large display serif. Eyebrows: uppercase, letter-spaced, muted grey, small. Body: clean sans-serif.
- Cards: white, hairline border, generous radius, soft, lots of whitespace. Charts read as thin maroon sparklines. Group tags (VPT, ASIB, TD) are small muted pills. Status reads as plain words (pass, pending, reject).
- Mood: clinical but warm, calm, minimal. The Buddy mascot is the friendly guide layer.
- Exact hex, font names, radii, and spacing tokens must be read from the codebase, not eyeballed from this Pack.

---

## 8. Constraints

- Do not modify existing section logic or data. Additive only: new routes, new components, and `id` / `data-tour` hooks on existing elements.
- No heavy dependencies. Keep the bundle lean for Cloudflare Pages. The tour overlay should be near-custom.
- Reuse existing tokens, components, and the Buddy guide. No second design system.
- Accessibility: keyboard, focus management, `prefers-reduced-motion`, mobile bottom-sheet behavior, and sufficient contrast on the scrim and tooltip.
- Privacy: no PHI anywhere in docs, how-tos, figures, or tour copy. Use de-identified NANO-ID examples only. Any persisted state is non-clinical.
- Copy style: plain, short, verb-first, no em dashes. Documentation is reference-grade; How-to is friendly and concrete.

---

## 9. Output format expected from you (the implementing agent)

1. A short plan: routes, new components, and the list of existing elements you will tag with `data-tour`.
2. The code changes: `{docs_route}` and `{howto_route}` pages, the documentation content modules, the how-to cards, the guided tour overlay component, the annotated still figures, and the nav and sidebar entry points.
3. The step definitions for both tours (public and operator) as a readable ordered config.
4. A brief QA checklist result against Section 10.
5. A list of every `TODO: confirm with lab` you inserted, so the lab can fill real definitions.

---

## 10. Success criteria (verifiable)

- A first-time user can open `{docs_route}`, understand the two surfaces, and find a plain-language definition for HDA, RMSSD, VPT, ASIB, TD, CGA, epoch, and de-identification.
- Every landing section in 7.2 and every operator panel in 7.3 has a documentation entry that deep-links to the live location.
- Every interactive feature has exactly one How-to with a visual.
- The public tour and the operator tour each complete end to end, with the spotlight correctly aligned after scrolling, on desktop and mobile.
- Keyboard-only and reduced-motion users can complete the same learning path via focus order and the annotated stills.
- No hard-coded metric values where a live hook exists. No PHI. No em dashes in user-facing copy.
- Lighthouse performance and accessibility on `{docs_route}` stay within a few points of the existing landing page.

---

## 11. Edge cases and fallbacks

- If the router does not support adding routes cleanly, mount Documentation and How-to as full sections with their own hash anchors on a dedicated page and keep direct URLs working.
- If a `data-tour` target is missing or hidden (feature-flagged v2 previews, or an empty cohort), the tour skips that step gracefully and logs nothing user-visible.
- If the live API hook is unavailable, documentation shows the field label and a neutral "value loads live" placeholder, never a stale number.
- If `prefers-reduced-motion` is on, skip spotlight animation and present the annotated stills inline.
- If a glossary term has no source-of-truth definition in the code or corpus, render it with a `TODO: confirm with lab` tag rather than inventing one.
- On very small screens, the docs TOC collapses into an accordion and the tour tooltip becomes a bottom sheet.

---

## 12. Optional reusability variables

- `{audience}` to switch the How-to tone (new_lab_member, clinician, researcher, operator).
- `{tour_track}` in {public, operator, full} to compose tours.
- `{detail_level}` in {summary, comprehensive} for the documentation depth.
- `{include_stills}` boolean to ship annotated figures with or without the live tour.
