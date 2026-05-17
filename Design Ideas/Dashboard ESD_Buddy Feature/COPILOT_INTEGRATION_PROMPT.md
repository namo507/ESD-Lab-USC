# GitHub Copilot — NANO Dashboard Integration Prompt (v2, merged)

Drop the prompt section below verbatim into Copilot Chat against `github.com/namo507/ESD-Lab-USC`. It is the merged, conflict-resolved version of the original integration brief and the v2 draft. Reference implementation: `Dashboard ESD.html` in this repo's design package — every visual decision is already made there. When in doubt, open it and match.

---

## Prompt

You are an expert UX/UI frontend engineer integrating the **ESD Lab Design System** into the live NANO Dashboard. A working React prototype already exists at `Dashboard ESD.html` (single-file Babel JSX, no build step). Port it into the production codebase with the rules below. Do **not** improvise visuals — every value is load-bearing.

### 1. Stack
- **Framework:** React 18 + Vite + TypeScript. Convert prototype `.jsx` → `.tsx`, type props strictly.
- **Styling:** Tailwind CSS, configured to read tokens from `src/styles/tokens.css` via `theme.extend`. Do NOT inline hex values — every Tailwind color/spacing/radius must trace back to a token. Add a small CSS layer for the things Tailwind handles poorly here (focus rings, dotted-underline `<Gloss>`, animated dashed flow lines).
- **Routing:** `react-router-dom` v6. Map: `/` → Pipeline overview, `/participants`, `/participants/:id`, `/qa/:id?`, `/results`, `/runs`, `/redcap`.
- **State:** TanStack Query for server state, Zustand for UI state (selected epoch, filters). No Redux.
- **Icons:** `lucide-react`. **Strict rule: every icon `strokeWidth={1.5}`.**

### 2. Design tokens — DO NOT REDEFINE
Source of truth: `src/styles/tokens.css` (verbatim copy of `colors_and_type.css` from the design system). Tailwind reads it via `theme.extend.colors` and `extend.fontFamily`. Hard rules:
- **USC Garnet `#73000A`** only on: primary button, active-nav top/left rule, brand mark, critical callouts. Never as a fill behind body text.
- **USC Gold `#FFCC00`** only on: focus rings, accept-pip on QA tiles, study-progress accent. **Never behind text** (fails contrast).
- **Page background** `#FAFAF9` warm off-white (or `#F9FAFB` if your Tailwind preset already ships it). Never pure white at page level.
- **Cards:** `#FFFFFF` + `1px solid #E6E5E2` + `rounded-[2px]` + **NO SHADOWS**. Hover = border `#C9C7C2`. Never shadow + border together.
- **Radii:** 2px default, 4px badges, `0` on tables/figures, `999px` only on avatars.
- **Animation budget:** ≤180ms. Easing: `cubic-bezier(0.2, 0, 0, 1)` for entrances, `cubic-bezier(0.4, 0, 0.2, 1)` for hover. No spring, no scale-up.

### 3. Type system
- **Source Serif 4** — page titles, h1, KPI value numerals, lede passages (e.g. "From Actiheart-5 to manuscript", "HRV features").
- **Source Sans 3** — h2/h3/h4, body, UI labels, dense tabular data text. (If you must substitute, Inter is acceptable — but Source Sans 3 is preferred and shipped.)
- **JetBrains Mono** — every number, stat, ID (`NANO-XXXX`), file path, run id (`run_2026_115_a`), timestamp, metric value (`231/260`, `1,824`, `92%`, `38.4 ms`). Always `font-feature-settings: 'tnum' 1` for tabular numerals.
- Scale (px): display 48 / h1 32 / h2 24 / h3 19 / body 15 / small 13 / micro 11. Min UI text 12px.

### 4. Layout & shell
- **HIPAA banner** (full-width, muted red/pink, top of every authenticated route): *"HIPAA notice · this dashboard exposes PHI from the NANO study. Do not share credentials or screenshots. All access is logged to `audit/hipaa_access.log`."*
- **Top nav:** brand block ("ESD Lab" / "NANO STUDY · USC" stacked, mono small caps for the line 2). Horizontal links: Pipeline · Participants · QA review · Results · Runs · REDCap. Active = 2px Garnet top border. Right side: global search ("NANO-XXXX, group, visit…") with `⌘K` chip, user avatar, run-status pulse.
- **Sidebar** (per existing prototype): study progress card, group counts, quick links. Active item = 2px Garnet left rule + `--bg-active` fill.

### 5. Pipeline Overview (build first)
Exact layout. Numbers below are the live values to wire from the API; render them with the prototype's formatting.
- **Header:** Serif title *"From Actiheart-5 to manuscript"*. Subtitle: *"6 stages · 7,131 windows processed this study · 72 currently in flight."* Actions: secondary "Last 24 h" toggle, primary Garnet **"Run pipeline"** button.
- **KPI strip (4-col grid):**
  1. **ENROLLED** — `231 / 260` · green `+4 / wk` · subtext `VPT · ASIB · TD`.
  2. **WINDOWS · 24 H** — `1,824` · green `+312` · `ECG 5-s epochs ingested` · sparkline.
  3. **QA PASS RATE** — `92%` · green `+0.4 pp` · `target ≥ 90 %` · sparkline.
  4. **MEDIAN RMSSD** — `38.4 ms ±0.6` · `cohort · all visits` · sparkline.
- **Live Pipeline DAG:** Ingest → Preprocess → Window QA → HRV features → HDA labeling → Merge · de-id. Circular nodes; "IN FLIGHT" pill above any node with active tasks (e.g. `14 IN FLIGHT` Ingest, `27 IN FLIGHT` Window QA). Throughput between nodes (`312/h`, `248/h`). Beneath each node: stage name, sub-description, completion stats (`1,824 done · 0 fail`). Edges with active flow render an animated dashed line; idle edges are static.
- **Bottom split-panel:**
  - **Left — Stage detail (HRV features):** descriptions of RMSSD, SDNN, pNN50, LF/HF; current throughput, queued count, 99.8 % pass rate, throughput sparkline (24 h).
  - **Right — Recent runs:** dense list. Run ID (`run_2026_115_a`), trigger (`auto`, `nightly`), initiator (`jbradshaw`, `cron`), status pill (running / done / fail), duration.

### 6. Components to port (1:1 from prototype)
- `primitives/`: `Badge`, `Button` (primary/secondary/ghost/danger/gold), `Card`, `Icon`, `KPI`, `Sparkline`, `Segmented`, `Tooltip`, **`Gloss`**, `SectionLabel`. `Tooltip` MUST accept a `gloss` prop that looks up the term in `src/lib/glossary.ts` (single source of truth: RMSSD, HF, pNN50, SDNN, LF, IBI, CGA, PMA, VPT, ASIB, TD, HDA, SQI, Epoch, Window, Ectopic, Orienting, Sustained, Inattention, Termination, RedCap, Actiheart5, PHI, HIPAA). Any acronym in body copy gets a 1px dotted underline and tooltip on hover/focus.
- `shell/`: `TopNav`, `Sidebar`, `HipaaBanner`.
- `pipeline/`: `PipelineDAG`, `PipelineSankey`, `PipelineKanban`, `StageDrawer`. Animated dashed flow only when `inflight > 0`.
- `qa/`: `EpochTile` (mini-ECG SVG + SQI bar + decision pip), `EpochInspector`, keyboard handlers (`A`/`R`/`←`/`→`).
- `charts/`: `TrajectoryChart` (CI ribbon + line + endpoint markers), `HDABarStack`, `EnrollmentBar`. Inline SVG only — no chart library.

### 7. ECG & SQI rules
- Reuse the deterministic `ecgPath(width, height, seed, flag)` generator from the prototype for ALL UI ECG previews. **Do not** plot real PHI on the client — render server-side PNG/SVG, pass a signed URL.
- Flag → color: `clean` neutral fg · `ectopic` `#A06000` · `motion` `#A06000` · `noise` red · `flatline` red.
- SQI thresholds: ≥0.7 green · 0.5–0.7 gold · 0.3–0.5 `#D97706` · <0.3 red. Auto-reject < 0.4. Auto-accept > 0.7. 0.4–0.7 surfaces for human review.

### 8. Data contracts (typed)
Add to `src/api/` with Zod schemas. Field names match the prototype's mock data exactly.
```
GET   /api/study/summary
GET   /api/pipeline/stages              → Stage[] (id,label,short,description,inflight,queued,done,fail,rate,eta)
GET   /api/runs?limit=N                 → Run[]
GET   /api/runs/:id/logs (SSE)
POST  /api/runs                         body={scope,stages,workers}
GET   /api/participants
GET   /api/participants/:id
GET   /api/visits/:visitId/epochs       → Epoch[] (idx,t0,t1,flag,sqi,ibi_n,decision)
PATCH /api/visits/:visitId/epochs/:idx  body={decision:'accept'|'reject'|'auto'}
GET   /api/results/trajectory?metric=rmssd|hf|sdnn
GET   /api/results/hda
GET   /api/redcap/events?since=…
```
Optimistic updates on epoch decisions; reconcile on PATCH success.

### 9. HIPAA / safety rails — NON-NEGOTIABLE
- HIPAA banner mandatory on every authenticated route.
- Auth: USC SSO + CITI attestation gate. Idle timeout 30 min — render countdown chip in TopNav.
- All PHI-adjacent fields tagged `phi: true` in OpenAPI; client refuses to render PHI in any export view. CSV export strips them server-side.
- Append `audit/hipaa_access.log` on: route navigation, epoch decision, run trigger, export.
- No `console.log` of participant data. No PHI in URL/query. No PHI to localStorage.

### 10. Accessibility
- `:focus-visible` everywhere: 2px gold ring at 2px offset. Do NOT suppress.
- Tooltips: `role="tooltip"`, opens on hover AND focus.
- QA epoch grid: `role="grid"`, arrow-key roving tabindex, `aria-label` per cell ("Epoch 12, SQI 0.87, clean, accepted").
- Tables: visually-hidden `<caption>`, `<th scope="col">`, `aria-sort` on sortable headers.
- Color is never the only signal — every status has a glyph or text label.

### 11. Tweaks panel
Floating bottom-right panel. Toggles:
- **Pipeline visualization:** DAG (default) · Sankey · Kanban.
- **Density:** Comfortable · Compact.
- **HIPAA banner:** show/hide (dev only — production forces on).

### 12. File layout
```
src/
  styles/tokens.css              ← verbatim from design system
  styles/global.css
  lib/glossary.ts                ← Gloss dictionary
  lib/ecgPath.ts
  api/{client,schemas,hooks}.ts
  components/{primitives,shell,pipeline,qa,charts}/
  routes/{Overview,Participants,ParticipantDetail,QA,Results,Runs,Redcap}.tsx
  store/ui.ts                    ← Zustand
  App.tsx
tailwind.config.ts               ← reads tokens.css via theme.extend
```

### 13. Acceptance checks
PR ships only if all are true:
- [ ] All 7 routes render against the live API; no mock fallbacks behind feature flags.
- [ ] Pipeline overview supports `?view=dag|sankey|kanban` and persists to user prefs.
- [ ] QA route accepts/rejects an epoch with `A`/`R`, optimistic UI, server reconciles.
- [ ] `npm run lint` clean, `npm run typecheck` clean, `npm run test` covers epoch reducer + glossary lookups.
- [ ] Lighthouse a11y ≥ 95 on every route.
- [ ] **No HEX literals** in any component file — all `var(--…)` or Tailwind tokens.
- [ ] No font besides Source Serif 4, Source Sans 3, JetBrains Mono.
- [ ] HIPAA banner present on every route except `/login`.
- [ ] No icon without `strokeWidth={1.5}`.
- [ ] No `box-shadow` on cards anywhere.
- [ ] `npm run build` produces no chunk > 250 kB gzipped.

### 14. Out of scope (do NOT add)
- Marketing pages, public landing, dark mode, mobile breakpoints below 1024px (desktop-only research tool).
- Stock photography, hero gradients, emoji (except the single ⚠️ on HIPAA-sensitive docs).
- Any chart library beyond inline SVG.
- New brand colors. New font families. New border radii.

### 15. Working order
1. Tokens → Tailwind config → primitives → port `Tooltip`/`Gloss` first (everything else uses them).
2. Shell + routing skeleton with placeholder screens.
3. **Pipeline overview** (DAG only) wired to `/api/pipeline/stages` + KPI strip + recent runs.
4. Participants table + detail.
5. **QA review** — biggest payoff; ship behind flag if needed.
6. Results, Runs (with SSE log stream), REDCap.
7. Sankey + Kanban variants.
8. A11y pass + Lighthouse.
