# Changelog

All notable changes to the NANO Study repository will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Performance
- Removed the render-blocking Google Fonts `@import` from `tokens.css`. It sat
  on the critical path of every route and, being a CSS `@import`, was
  discovered only after its own stylesheet had parsed -- a serialized blocking
  request rather than a parallel one. First contentful paint on
  `/redcap-portfolio` went from **12,988 ms to 136 ms** when the font CDN was
  unreachable, which is the worst case the dependency made possible.
- None of the three families it fetched (Source Serif 4, Source Sans 3,
  JetBrains Mono) are ESD brand typefaces, and Libre Franklin -- which is --
  was already self-hosted and shadowing them in the cascade, so they largely
  never rendered. Font stacks now lead with Libre Franklin; the mono stack uses
  local system faces.
- Dropped `fonts.googleapis.com` and `fonts.gstatic.com` from the CSP, so the
  site no longer sends visitor IP and user-agent to a third party on load.

### Fixed
- **CI had been red on `main` for every commit since 2026-08-28.** Four jobs
  were failing at once and each had a different cause, so nothing about the
  red X said which. All four are fixed and verified locally against the same
  gates CI runs.
- **`black --check` failed the whole `test-python` matrix, and took `isort`
  and `flake8` down with it.** Seventeen files had never been formatted at the
  repository's own 88-column setting -- fourteen of them the automation scripts
  added over the last week, plus `src/models/ml_pipeline.py`,
  `src/models/markov_chain_models.py` and `tests/test_nano_buddy.py`. Because
  the formatting step ran first and failed, the two steps behind it were
  skipped on every run, which hid a real `flake8` error underneath: `E741` on
  an `l` loop variable in `scripts/benchmark_local_models.py`. Formatted, and
  the loop variable renamed to `layer`.
- **The Docker runtime smoke test asserted a route the server had already
  retired.** `scripts/check_dashboard_runtime.py` required `/dashboard/` to
  land on `/overview`, but `/overview` was replaced by `/esd-lab` and the
  runtime now 301s every legacy dashboard path straight there
  (`LEGACY_DASHBOARD_PATHS`). The check failed the instant the container came
  up healthy, which is the worst kind of false alarm: the runtime was fine and
  the probe said it was broken. It now reads the front door from one constant
  and asserts that `/overview` and `/dashboard/` both redirect to it, so the
  retirement is covered rather than contradicted.
- **The contrast probe was scoring the front door under two names it never
  measures.** `/` and `/overview` both redirect to `/esd-lab`, so the probe
  loaded that one page twice and failed it against a 60-text-node floor sized
  for a data route. The front door is a deliberately sparse landing page: it
  renders 21 text nodes when perfectly healthy, close enough to the ~18 of an
  error page that a node count cannot tell them apart. The guard now resolves
  per landed path, `/esd-lab` is measured under its own name, and the sparse
  page is certified by a content marker instead of a node count. The marker is
  matched on `textContent`, not `innerText`: `innerText` applies CSS
  `text-transform`, and this page uppercases the marker, so an `innerText`
  match failed on a page that was rendering it correctly.
- **A real WCAG AA failure on the front door, which the broken guard had been
  hiding.** With the probe measuring `/esd-lab` for the first time, the `ask`
  submit button came back at 4.26:1 in both themes and all four interaction
  states, under the 4.5 a 16px bold label needs: a Cool White (`#f4f4f6`) label
  on a Discovery Blue fill. The brand layer gains
  `--esd-on-discovery-blue: #ffffff`, the palette's answer for a label sitting
  on that fill, measuring 4.68:1 -- the most any label can reach on it. A
  token rather than a literal because the front door's CSS module is guarded
  by `darkModeSurfaceGuard.test.ts`, which rejects hardcoded colours there,
  and it caught the first attempt.
- **The canonical Docker stack's local model tier pointed at a runtime that
  could not serve it.** `docker-compose.yml` set
  `DASHBOARD_ASSISTANT_LOCAL_API_BASE` to Docker Model Runner on the host
  gateway while `DASHBOARD_ASSISTANT_LOCAL_MODEL` stayed `esd-buddy` -- and
  `esd-buddy` only exists inside the stack's own `ollama` service, built there
  by `scripts/sync_local_model.py`. Nothing reconciles the two at runtime: the
  assistant posts whatever model name it is given to whatever endpoint it is
  given, so every local-tier request could only 404. The fallback rungs had
  the same shape, `phi4-mini:latest` and `qwen2.5:1.5b` being Ollama tags
  rather than Model Runner `ai/...` references. The endpoint now addresses the
  in-stack service and matches `local.default_api_base` in
  `config/llm_model.json`. Because the tier is opt-in
  (`DASHBOARD_ASSISTANT_LOCAL_ENABLED` defaults to false), the stack looked
  healthy the whole time. `scripts/check_compose_config.py` now fails when an
  endpoint and its model names describe different runtimes, in either
  direction, with the contract test in `tests/test_ops_automation.py` updated:
  it had asserted `host.docker.internal` for all three Compose files, which is
  what pinned the canonical stack to the wrong endpoint.
- **`chaos_suite.py` reported a missing precondition as a failure.** The
  `model-down` scenario called a hard fail, "sparse-only retrieval returned
  nothing", on any host without a built retrieval index -- a fresh checkout
  and CI included. `retrieval.search()` is behaving correctly there; there is
  simply nothing to search. That one scenario failed the whole sweep, and
  `check_automations.py` with it. It now skips on a missing index, matching
  the `gpu-missing` scenario beside it, and keeps the fail for the case that
  matters: an index that exists but returns nothing. With a real index built,
  all nine scenarios pass.
- **The `dashboard-image` Trivy scan failed on three fixable HIGH CVEs.** This
  one was red on `main` too, for every Docker Build run back to 2026-08-28, so
  it is not this branch's -- but it is the last check between this PR and a
  green board, and both halves are one-line bumps. `browserslist` 4.28.2, in
  `web/package-lock.json` via `autoprefixer`, carries CVE-2026-73088
  (prototype pollution) and CVE-2026-73089 (unbounded memory growth), both
  fixed in 4.28.7; the lockfile now resolves 4.28.8. `tar` 7.5.19 is not in the
  web dependency tree at all -- it is bundled inside the npm the image installs
  globally, and carries CVE-2026-73566 (DoS via a crafted long-path archive),
  fixed in 7.5.21. `NPM_VERSION` moves 11.19.0 to 11.19.1, which bundles
  7.5.22, rather than adding a fourth surgical replacement beside the existing
  `ip-address` and `brace-expansion` patches. Both fixed versions were checked
  against the artifacts the scan actually reads: the resolved lockfile, and the
  unpacked npm tarball.
- **The Pages `_redirects` file sent legacy paths through a retired route.**
  `/dashboard*` pointed at `/overview`, which `_worker.js` then redirects to
  `/esd-lab` -- two hops to reach one page, through a route the SPA no longer
  renders. The static table now names the same targets as the worker's own
  retired-route set, and covers `/overview` and `/discovery/overview` too.
- **The browser dashboard fixture had drifted two months behind the payload it
  mirrors.** `web/public/dashboard/data/dashboard_data.json` is what a static
  preview serves at `/dashboard/data/dashboard_data.json`, the URL
  `useStudyData` and `useRedcapData` fetch; the live runtime serves that same
  URL from `dashboard/data/dashboard_data.json` instead. Nothing regenerated
  the fixture, so previews and the contrast probe rendered numbers from
  2026-07-01 against a runtime payload from 2026-08-28. It is now derived by
  `scripts/sync_public_dashboard_fixture.py`, the way
  `build_lab_readings_index.py` derives `web/lab-readings.json`, wired into
  `make dashboard-refresh`, gated in CI with `--check`, and covered by a
  contract test.
- **QA keyboard shortcuts could file a decision against the wrong visit.**
  `qaSelectedEpoch` lives in the global UI store rather than component state,
  so it does not reset when you move between visits. The keydown effect
  depended only on `[selected, total]`, so opening one visit and then another
  with the same epoch count left both unchanged: the listener was never
  rebuilt and kept the previous visit's `visitId` and mutation. A keyboard
  accept/reject then wrote the decision -- and its audit entry -- against the
  visit you had just navigated away from. Mouse clicks were unaffected, which
  is why it went unnoticed. `setDecision` is now memoised and the effect lists
  it, so the handler always holds the visit on screen. Covered by a regression
  test that fails against the old code with the exact symptom.
- `tests/test_imputation.py` ran nowhere. It was excluded via
  `--ignore=tests/test_imputation.py` in **three** workflows (`ci.yml`,
  `daily-health-sweep.yml`, `devcontainer-ci.yml`), added in an unrelated
  "NANO docs" commit with no explanation. All 8 tests pass in 1.4s and their
  dependencies are already in `requirements.txt`, so the exclusion was costing
  coverage of a 228-line analysis module for nothing. Removed everywhere; the
  suite goes from 301 to 309 passing locally (311 in CI, where R and rpy2 are
  installed and two locally-skipped tests also run).
- The R setup step could hang for the entire CI job budget. `r-lib/actions/setup-r`
  runs `apt-get update`, and when the Azure Ubuntu mirror stops answering, apt
  falls back to `archive.ubuntu.com` and can stall there indefinitely: on
  2026-08-19 both `test-python` jobs sat 19 minutes inside a single index fetch
  with no output, burned the whole 20-minute job timeout, and reported
  `cancelled` -- which reads as a human cancellation rather than a broken run.
  The step now carries `timeout-minutes: 12` in `ci.yml` and
  `daily-health-sweep.yml` -- sized against measured healthy runs of 3m15s and
  5m51s -- so a dead mirror fails fast, against the step that caused it, while
  still leaving 8 minutes of job budget. The step was also misnamed
  "Set up R for rpy2-backed tests"; nothing under `tests/`
  references rpy2, robjects or Rscript, and R is in fact there for the `rpy2`
  pin in `requirements.txt`. Renamed to say so.
- `test-contrast` no longer depends on apt being reachable. `npx playwright
  install --with-deps chromium` stalled on the identical
  `archive.ubuntu.com ... noble-security InRelease` fetch that hung the R step,
  twice in a row, against a ~60s healthy cost. Only the `--with-deps` half
  touches apt; the probe just needs a Chromium that runs, and a plain
  `playwright install` pulls the browser from Playwright's CDN. The step now
  tries the full install under a 5-minute bound and falls back to the
  browser-only install when the apt path stalls, so a dead Ubuntu mirror
  degrades instead of failing the run. Only a real Playwright failure fails
  the step now.

### Added
- Contrast probe in CI (`web/scripts/contrast-probe.mjs`, `npm run test:contrast`).
  Renders the built app across 15 routes in both themes, at rest and under
  forced `:hover` / `:focus-visible` / `:active`, and fails the build on any
  WCAG contrast failure. Four rounds of contrast bugs reached production before
  anything measured them; a stylesheet reads fine and renders at 1.1:1.
- The probe carries a **render guard**, which is the part that matters. A page
  that fails to load has no text and therefore no failures, which is
  indistinguishable from a clean pass — the first run of this probe reported a
  perfect score against six blank error pages. Every route must clear a minimum
  text-node count or the run fails with an explicit refusal to certify.
  `/nano/dashboard` is excluded by name because it reads live-REDCap artefacts
  absent from CI; adding it back without that data trips the guard rather than
  passing quietly.
- The state sweep measures every text-owning element in a control's subtree,
  not just direct text children. A label wrapped in a span -- `<a><span
  class=title>` -- has no direct text node, so checking direct children alone
  skipped those controls entirely; the wrapper is also usually not where the
  colour lives, so the descendant is the right thing to measure.
- The colour parser understands `color(srgb r g b / a)`, which is how Chromium
  serialises `color-mix()`. Without it the background walk skipped straight
  past any `color-mix()` surface to a lighter ancestor and reported a
  dark-blue button as white-on-white at 1.00:1.

### Fixed
- 20 further contrast failures on `/participants`, `/publications`, `/qa`,
  `/runs` and `/redcap-portfolio`, found only once CI built with mocks: those
  routes had rendered too thin to measure in earlier sweeps, so the previous
  "0 failures" was true of what rendered rather than of the whole site. Causes
  were the familiar ones plus a new shape — **surfaces that do not flip with
  the theme**. The run-log and ECG scope panels paint `--terminal-bg`, dark in
  both themes, so theme-flipping tokens on them broke in *light* mode
  (`--slate-500` at 3.30, `--blue` at 3.94, `--red` at 4.40). Same for
  `--on-gold`, which lightened in dark while `--usc-gold` stayed put: gold on
  gold, **1.00:1**. Added `--terminal-muted` / `--terminal-accent` /
  `--terminal-danger`, `--red-ink`, and a `--tag-*` set for publication tag
  badges whose fills sit under pinned white text.
- Site-wide contrast sweep: **70 failures to 0**, measured across 16 routes in
  both themes, resting plus forced `:hover` / `:focus-visible` / `:active`.
  Nearly every one was a token doing two jobs at once:
  - **Fill hues used as text.** `--slate-400` (2.56:1), `--slate-500` (4.08:1),
    `--blue-ink` at the raw brand hue (4.01:1), `--green` on a KPI delta
    (3.20:1). Darkened in light, lifted in dark.
  - **One token serving both a fill and the text on it.** `--toolbar-blue` and
    `--sidebar-blue` coloured an eyebrow *and* filled a button behind white
    text, so fixing either end broke the other. Split into a fill and an `-ink`
    pair. Study chips got the same treatment: the chart palette carries
    documented CVD validation as *marks* (a 3:1 job) but was also the
    background for white chip labels (a 4.5 job, failing at 3.25-4.45), so
    `--study-*-chip` variants were added and the validated palette left alone.
  - **Selected states repainted on hover.** The segmented control's `.btn:hover`
    set a pale fill on the *already-selected* segment while its on-brand text
    stayed put: 1.17:1 in light, 1.35:1 in dark. Hovering the segment you are
    already on no longer repaints it.
  - **Third-party Leaflet.** Attribution ink, the credit link, and the zoom
    glyphs all failed on maps outside the existing `.satellite-map-soft`
    wrapper. The zoom buttons stay white in both themes and are deliberately
    excluded from the dark link lift. The disabled zoom control was 1.75:1;
    disabled controls are exempt from WCAG 1.4.3, so that one is a legibility
    fix rather than a conformance fix, lifted to ~3:1 so it still reads as
    greyed out.
- Contrast fixes for `DataProvenance` and the ESD Buddy assistant drawer, the
  two shared components left over from the NANO sweep. Measured by rendering
  the production build across six routes in both themes and computing contrast
  against each element's nearest opaque painted ancestor: **DataProvenance 3 ->
  0, assistant drawer 14 -> 0**, with 26 failures cleared site-wide, no new
  failures and no regressions.
- Three root causes, all token-level rather than component-level:
  - **Fill hues used as text.** `--green` (2.89:1 on its own tint) and
    `--purple` (3.55:1) coloured the provenance status pills. A colour chosen
    to fill a shape is rarely legible as 11px type on a wash of itself, and one
    value cannot serve both themes -- the accessible light ink measures 2.84:1
    on the dark card. Added `--green-ink` / `--purple-ink` pairs that flip.
  - **Surfaces that never flipped.** `--sand-tint`, `--mint-tint`,
    `--sage-tint` and `--ocean-tint` were defined only in the light block, so
    in dark mode the text tokens above them inverted to near-white while the
    panels stayed near-white: `--warm-fg2` on `--sand-tint` measured **1.10:1**.
    Same for `--fg-on-brand`, which stayed white while brand fills inverted to
    light blue (1.99:1), and a hardcoded `rgba(255,255,255,0.92)` panel in the
    readings map. A colour token is only half a theme; the surface has to move
    with the ink.
  - **Muted tiers too faint to be text.** `--warm-fg4` (4.00:1) and
    `--warm-fg5` (2.10:1) carry real 10-12px labels, timestamps and empty-state
    dashes, as do `--warm-500` (4.32:1) and `--fg3` (3.75:1). Darkened in light
    and lifted in dark, keeping each tier visibly distinct from its neighbour.
- Made the `esd-2026` dark button ramp internally coherent. Its `--usc-garnet`
  ramp *lightened* as you interacted (base `#3366ff`, hover `#4c78ff`, active
  `#91baf4`) while the text on it stayed white, so a primary button would get
  less readable the more you touched it -- 4.68 at rest, 3.86 on hover, 1.99
  pressed. It now descends like the light ramp, keeping white legible through
  all three states (4.68 / 5.86 / 8.14). No rendered pixel changes today:
  every `.v-primary` on the site sits inside `[data-brand="esd-2026"]`, where
  the more specific `brand-esd.css` rule already supplies a coherent ramp and
  the corrected `--fg-on-brand`. This closes the latent case of one rendering
  outside that wrapper.
- The REDCap sync advertised a freshness SLA it missed every single time. The
  dashboard published `every_5_minutes` with a 15-minute staleness budget,
  taken from the `*/5` cron rather than from the sync. GitHub throttles
  scheduled workflows under load and does not honour that cron: across 30
  consecutive scheduled runs the interval was min 18.3 / median 28.4 / mean
  30.5 / p95 47.1 / max 56.6 minutes. **Not one of the 29 intervals came in
  under 15 minutes**, so the SLA was breached 29 times out of 29 and the
  "Live" badge was a coin flip against a budget nothing could meet.
  The published contract is now cadence 1800s (30 min, matching measured
  delivery) and SLA 5400s (90 min). 90 minutes is 3x cadence -- the same ratio
  the frontend already falls back to when an artifact omits `sla_seconds` --
  and clears the worst staleness measured (max gap 56.6 + ~3.4 min run) with
  room for a tail worse than a 15-hour sample shows.
- The cron itself is unchanged. `*/5` is a *request*, and asking less often can
  only make the sync less fresh; what was wrong was describing the request as
  though it were the delivery. Both are now commented to say so.
- Root cause of the drift: the number lived in five places and only one of them
  was the config. `build_pages_site.py` and `check_live_surfaces.py` each
  hardcoded `"every_5_minutes"` and a 15-minute SLA to validate an artifact
  generated from `config/redcap_projects.yml`, so the config could move without
  them. Both now derive the expected values from that config through the same
  `cadence_label()` / `sla_payload()` helpers the emitter uses, making producer
  and validators impossible to separate.
- The portfolio page polled every five minutes on the same false premise,
  refetching identical bytes about six times per actual update. It now polls at
  half the cadence the artifact itself publishes.
- The NANO dashboard's details surface had no dark-mode block at all. Its
  palette stayed at light values while the page around it went to `#07090f`,
  so every section heading rendered near-black on near-black -- measured at
  luminance 13 against a page at 9, roughly 1:1 contrast, effectively
  invisible. Headings, card values, progress tracks, disclosure links, and the
  assistant prompts now all carry dark treatments; heading contrast is 244
  against 9. Light mode is byte-for-byte unchanged.
- Darkening those cards turned out to be only half the job: anything *inside*
  a card that names its own ink or rule keeps the value it was tuned for on
  white. The detail tables rendered near-black text on a near-black card and
  flashed a white bar on row hover. Dark treatments added for table text,
  captions, rules, header ink, row hover, and the scrollbar *track*, plus the
  disclosure's open/hover bar, the system card's headings and terms, and the
  prompt buttons. `.safetyState` keeps its amber hue rather than flattening to
  the generic card colour -- on a caution panel the wash is the affordance.
- The NANO "Open reading library" call to action rendered **white on white in
  both themes**, not just dark. `NanoStudyDashboard.module.css` carries
  `.page a { color: inherit }`, which is also specificity (0,1,1) and is
  bundled after the details module, so `.libraryAction a` lost the tie on
  source order and the button inherited its banner's white onto its own white
  pill. Settled with `:any-link`.
- Discovery Blue is a fill colour, and the NANO study page used it as small
  text in 40+ places: 4.01-4.29 against that page's own surfaces in light and
  3.70-4.25 in dark, under the 4.5 body copy needs in either theme. Split into
  `--blue` (exact brand hue, for fills, borders, and large display type) and
  `--blue-text` (darkened in light, lifted in dark). `.kpiStatus` stays on
  `--blue`: at >=24px it is large text and already clears the 3:1 bar. Also
  fixed the `·` separator at 1.83:1 and the NEW tag at 4.17:1. Measured on the
  rendered page, contrast failures went from 46 to 4 in light and 62 to 3 in
  dark; the details surface is at 0 in both. The remainder are in two shared
  components that render here but are not NANO stylesheets -- `DataProvenance`
  and `ChatDrawer` -- left for a separately scoped change.
- The readings index no longer degrades silently. Without `pypdf` every PDF
  yields no page count, no embedded title, and no excerpt, so categories and
  titles fall back to filename guesses -- a structurally valid index that is
  materially worse, which previously overwrote the good one with nothing
  reported. `build_readings_index.py` now warns loudly, refuses to replace a
  PDF-backed index unless `--allow-degraded-overwrite` is passed, and exits
  non-zero under `--require-pdf-metadata`.
- `/redcap-portfolio` is now in the canonical surface list, so
  `check_live_surfaces.py` monitors it like every other route.
- The portfolio page no longer invents its own staleness threshold. It had used
  `refresh_cadence_seconds * 2`, disagreeing with every other surface on the
  site about when the same artifact goes stale; the backend now publishes
  `sla_seconds` and the page reads it.

### Changed
- Theme consistency pass over all 74 stylesheets. Audited every raw hex against
  the ESD palette, separating legitimate `var(--token, #fallback)` fallbacks
  (312, fine) from real token bypasses. Off-brand values dropped from 94 to 71,
  and the shared shell layer -- which renders on every route -- is now clean.
- Added a single `--shadow-ink` token. Six stylesheets each carried their own
  near-identical navy (`#07112b`, `#0b1c45`, `#0d265d`, `#112969`) to tint
  elevation shadows, so shadows drifted in hue between surfaces sitting side by
  side. Dark mode uses black, because a navy tint reads as haze on a dark
  ground.
- Replaced off-canon colors with brand tokens: `#274fcc` and `#2856e8` (both
  near-misses for the brand's `--brand-600` #2450e6), a `#7ae2ad` status dot
  (now `--status-green`), `#5a43a3`/`#eee9ff` (now the `--purple` pair), and
  `#fff8f3` body text on brand backgrounds (now `--fg-on-brand`).
- Confirmed absent: `#005CBE` and `#2A61E6`, the two drift hexes the brand
  guidelines call out as bugs, appear nowhere in the codebase.

### Added
- Speed-first tier routing for ESD Buddy (`dashboard/assistant/routing.py`).
  The provider chain already failed over on *availability*; it had no notion of
  question difficulty, so a request needing the 120B model still started at the
  fast tier and got a fast, shallow answer. Questions are now classified as
  quick, standard, or deep from the shape of the wording -- reasoning markers,
  multi-part structure, pasted stack traces, length -- and each class gets a
  tier order, a token ceiling, and a temperature. Lookups stay on the fastest
  tier at low temperature; only questions that show they need reasoning
  escalate.
- The preference reorders the chain without filtering it, so an outage on the
  preferred tier still falls through to the rest exactly as before. Routing is
  a pure function with no network access, covered by 34 tests including the
  chain integration.
- REDCap metadata watcher at `/redcap-portfolio` (`make redcap-portfolio`).
  Five tabs over one pre-built artifact: a portfolio roll-up of all eight
  projects, per-project detail with completion by instrument and by event,
  cross-project instrument comparison with field-level harmonization verdicts,
  a searchable field index with CSV export, and a definitions tab that states
  what every number means. A freshness stamp reads the artifact's own
  timestamp and marks it stale once it is older than the portfolio SLA.
- `redcap/api/portfolio_metadata.py` builds that artifact through an
  export-only client. Content types outside the export allowlist are refused
  before a request is built, as is any request carrying a REDCap write
  parameter, so an import or delete cannot be issued through it. One record
  export per project reads only the record ID and `<form>_complete` status
  fields; those rows are reduced to per-instrument and per-event counts and
  dropped in the same function.
- The artifact inherits the dictionary's exclusions -- no verbatim item text,
  identifier-flagged fields withheld with only a count kept -- and applies the
  portfolio's small-cell rule to every record-derived count. When one bucket of
  a completion breakdown is suppressed the rest goes with it, so the hidden
  number cannot be recovered by subtraction. `scripts/build_pages_site.py`
  re-validates all of it, including a scan for published small cells, before
  the payload can reach Pages.
- Structural REDCap instrument dictionary (`make redcap-dictionary`). Exports
  every project's survey instruments, field names, field types, form grouping,
  and required/branching counts across all eight projects -- 278 instruments and
  21,905 fields -- and surfaces them as an Instruments tab on `/redcap` that
  follows the study scope and links each project to its REDCap home.
- Two deliberate exclusions, enforced in code and asserted by tests: verbatim
  `field_label` text is never exported, because for these projects it is the
  item wording of licensed assessments (Bayley-4, M-CHAT, ADOS-2, EPDS, CSBS);
  and fields REDCap flags as direct identifiers are withheld, keeping only a
  count so totals still reconcile. `scripts/build_pages_site.py` re-validates
  both before publishing, so a regression upstream fails the deploy.
- Portfolio study scope: the sidebar selector now offers ABC, IPSA, ACTION,
  NICO, NANO and an All option, derived from the metrics payload rather than a
  hardcoded list, so a sixth study appears without a code change. Selection
  drives every metric on Overview and persists across routes.
- Interactive study cards on Overview. Selecting a study rescopes the page,
  replacing the second static grid that duplicated the summary row.
- The REDCap route follows the study scope: project counts, instrument totals,
  and form completion narrow to the selected study, with its project links
  beside them.
- The participant table filters by study for NANO and NICO. ABC, IPSA, and
  ACTION have no rows in the de-identified feed, so those scopes show an
  explicit notice rather than an empty table that reads as zero enrollment.
- "Open in REDCap" project-home links per study, behind the build-time
  `VITE_REDCAP_APP_ORIGIN`. Links carry only the project id and are hidden
  entirely when the origin is unset, which is the public Pages default.
- Single canonical `.env` loader (`src/utils/env_loader.py`) used by the REDCap
  sync, dashboard server, assistant, and operator scripts, with a
  dependency-free parser for containers without `python-dotenv` and a rule that
  existing environment values always win over the file.
- `make env-doctor` / `make env-verify` (`scripts/env_doctor.py`): masked report
  of which keys are set, blank, undocumented, or sitting in stray `.env.*` side
  files that nothing loads.
- ESD Buddy provider failover chain: Gemini (`gemini-3.5-flash`) as the fast
  primary, NVIDIA Nemotron hosted next, then a local Docker Model Runner tier
  that needs no credential or network. Unconfigured tiers are skipped and the
  first healthy tier answers.
- `make assistant-chain` (`scripts/assistant_chain.py`) to print the resolved
  failover order, and `make model-pull` (`scripts/setup_local_model.py`) to pull,
  verify, and write the ESD grounding profile for the local tier.
- Assistant status now publishes which provider tier is answering and how much
  failover headroom remains, surfaced in the ESD Buddy drawer.
- Additive NANO Study dashboard at `/nano/dashboard` with ESD-branded motion,
  aggregate enrollment and visit operations, HDA/RSA research metrics, pipeline
  quality, assessments, equipment and compliance status, REDCap health, and
  reading-library links.
- Complete aggregate-only `nano` payload contract with a coherent synthetic
  fallback, null-safe rendering, and explicit source/as-of metadata.
- NANO ESD Lab Buddy adapter at `/api/buddy`, reusing the existing repository-
  grounded assistant with metric provenance, document citations, offline
  fallback behavior, and strict PHI or raw-signal refusal.
- Dashboard Master feature release: Multimodal Synchrony Visualizer, redesigned Guided Explorer, REDCap completeness drawer, Public Insights sharing/IRB context, Infant Passport visit detail, SDOH priority overlay, and Cascade Simulator overlays.
- AI Buddy and Ask AI fast paths for the new dashboard routes, Executive PPTX export, multimodal synchrony windows, and REDCap/public-insights guidance.
- Explicit Pages build flags for the newly released dashboard surfaces so future website builds keep the assistant, metrics, and visualizations in sync.
- Initial repository scaffold for NANO Study (NIH R01 longitudinal infant study)
- Complete directory structure: config, data, redcap, src, notebooks, scripts, tests, docs, reports
- HIPAA-compliant `.gitignore` excluding all raw data and PHI file types
- `config/paths.yml` with env-var substitution for all data paths
- `config/redcap_config.yml` with project IDs, event names, field mappings
- `config/study_parameters.yml` with participant groups, GA bins, primary DVs
- `config/model_config.yml` with ML hyperparameters and CV settings
- REDCap API scripts: pull, push, audit (Python), and R pull via REDCapR
- REDCap JavaScript hooks: auto-complete DOB, participant ID validator, visit completion checker, ECG flag
- ECG loader, temperature loader, behavioral coding loader, REDCap merge module
- Full ECG preprocessing pipeline via neurokit2/biosppy
- HRV feature extraction: mean IBI, SDNN, RMSSD, CVNN, HTI, SD1/SD2, sample entropy, RSA, HDA phases
- Temperature preprocessing with CPTd computation
- Behavioral synchronization: time-locks HDA phases to behavioral events
- Deidentification module with audit logging
- Feature engineering: ECG feature matrix, trajectory features (LGCM intercepts/slopes), demographic features
- Multiple imputation via MICE (R) and IterativeImputer (Python)
- ML pipeline: Random Forest, XGBoost, SVM with GridSearchCV + permutation importance
- Deep learning: 1D-CNN with LSTM and self-supervised pre-training
- Transformer model for continuous ADOS CSS regression
- Mixed-effects models (lme4/nlme) and latent growth curve models (lavaan)
- Markov chain models for HDA phase transitions
- Visualization: trajectory plots, ECG heatmaps, missingness heatmap, ROC curves
- Utility modules: config loader, structured logging, HIPAA utilities
- 7 Jupyter notebooks for exploration, walkthrough, and demo
- Batch processing scripts and daily cron sync
- pytest test suite with synthetic ECG, mock REDCap, imputation, and deidentification tests
- Documentation: data flow, REDCap setup, ECG protocol, HIPAA checklist, onboarding guide
- GitHub Actions CI: pytest + black + flake8 on develop/main
- PR template and issue templates

### Changed
- Overview shows only metrics that have a value. Three of the five summary
  tiles were permanently "-" for NANO, which read as broken data; the count of
  unpublished measures is now stated in one line instead.
- The study selector's active state uses Discovery Blue. It previously used
  indigo (#6366F1) and teal (#14B8A6), neither of which is in the ESD palette.
- The Buddy hover highlight is a soft tint that eases in, replacing a hard
  border and yellow ring that appeared and vanished with no transition. The
  bubble stays mounted so entry and exit animate, and moving between hotspots
  crossfades rather than swapping text under the reader.
- Assistant status reports the tier that will actually answer instead of always
  naming the configured primary.

### Fixed
- `deploy-pages.yml` triggered on the REDCap sync *scripts* but not the modules
  they depend on, so editing `redcap/api/multi_project.py`,
  `redcap/api/dictionary.py`, or `src/utils/env_loader.py` changed what gets
  published without triggering a deploy.
- `check_k8s_readings_pipeline.py` dumped a raw `URLError` traceback when the
  dashboard was not running. It now fails cleanly with the reason and how to
  start the dashboard, matching `check_docker_health.py`.
- Three runtime pipeline artifacts (`readings_pipeline_status.json`,
  `readings_event_state.json`, `web_package_trigger.json`) were not gitignored,
  so a local pipeline run left untracked files that could be committed by
  accident. Their siblings were already ignored.
- Assistant copy across the health checks, share script, Pages fallback, and
  frontend help content said "NVIDIA assistant" when the assistant has been a
  Gemini/NVIDIA/local provider chain since the failover work.
- `parseProject` dropped `project_id` from the metrics payload, so the REDCap
  project id was published by the backend but unavailable to the frontend.
- A stored `activeStudy` of `BOTH` from the retired NANO/NICO toggle now
  migrates to the portfolio scope instead of being treated as invalid.
- `scripts/sync_redcap_portfolio.py` never read `.env`, so a plain invocation
  ran without any of the eight REDCap project tokens.
- Band-power integration in `src/preprocessing/hrv_features.py` binds
  `np.trapezoid` when available, so it keeps working under NumPy 2.x where
  `np.trapz` was removed.

---

## [0.1.0] - 2024-01-15

### Added
- Repository initialized with NANO Study README
