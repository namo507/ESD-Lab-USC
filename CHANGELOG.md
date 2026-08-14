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
