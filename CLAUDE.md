# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

The **NANO Study** codebase — a HIPAA-governed, NIH R01 longitudinal infant-neurodevelopment study at the ESD Lab, University of South Carolina. It is a **polyglot monorepo**, not a single app:

- **Python** — research pipelines (`src/`) and the dashboard runtime/API/assistant/data layer (`dashboard/`, `scripts/`).
- **R** — imputation, mixed-effects models, and latent growth curves (`.R` files under `src/`, `dashboard/pipelines/`, `redcap/`, `reports/templates/`; environment pinned by `renv.lock` at the root).
- **TypeScript/React** — the canonical frontend (`web/`, Vite + React 18), deployed to Cloudflare Pages.
- **MATLAB** — signal-analysis code (`MATLAB/`).
- **Docker / Kubernetes** — deployment (`docker/`, `k8s/helm/`, `docker-compose.yml`).

There is **no `app.py`**. The running service is `dashboard/server/live_dashboard_server.py`, launched via Docker Compose / Make targets.

## HIPAA — non-negotiable constraints

This study handles PHI. Before touching data code:

- **Never** commit raw data, participant identifiers, or PHI. All real data lives on the USC Secure Server and is reached only through config paths (`config/paths.yml` + `.env` → `NANO_DATA_ROOT` and friends).
- `.gitignore` is already PHI-aware (blocks `*.csv`, `*.edf`, `*_PHI*`, `participant_*`, `raw/**`, credentials, etc.) — extend it in the same spirit rather than loosening it.
- When the secure mount is absent, the runtime **falls back to synthetic dashboard data** so the UI still renders. Assume you are working against synthetic/demo data locally.

## Architecture: how the two dashboards fit together

The layout contract in [docs/repository_structure.md](docs/repository_structure.md) is authoritative. The key mental model:

- `web/` is the **only** active frontend (React/Vite/TS). It is a static SPA.
- `dashboard/` is the **Python runtime + API + assistant + data-pipeline layer**. It does not contain a second frontend.
- They are decoupled through **generated JSON payloads** in `dashboard/data/` (e.g. `dashboard_data.json`, `readings_data.json`). Pipelines under `dashboard/pipelines/` build these payloads from REDCap/feature data (or synthetic fallbacks); the frontend and the live server consume them. `web/lab-readings.json` is a build-time browser derivative of `dashboard/data/readings_data.json`.
- `dashboard/server/live_dashboard_server.py` serves the SPA + JSON + public reading PDFs, **and** runs a polling watch loop that rebuilds the JSON payloads when inputs change and indexes new PDFs dropped into `esd-lab-readings/`.
- **NANO Buddy** (`dashboard/assistant/`) is a repo-grounded assistant backed by an NVIDIA OpenAI-compatible endpoint (via the `openai` client); grounding indexes are (re)built by `scripts/prepare_dashboard_assistant.py`.

### Research data flow (`src/`)

REDCap + device streams (HeRO / Actiheart ECG, Squirrel temperature loggers, DataVyu behavioral coding) → `src/data_ingestion/` → `src/preprocessing/` (ECG/HRV via neurokit2, temperature, de-identification) → `src/feature_engineering/` → **imputation** (MICE, in R: `src/imputation/mice_imputation.R`) → **models** (Python ML: `ml_pipeline.py`, `deep_learning_ecg.py`, `transformer_ecg.py`; R: `mixed_effects_models.R`, `latent_growth_curves.R`) → `reports/`. The Python↔R boundary is bridged with `rpy2`.

### Config is centralized

Runtime behavior is driven by `config/*.yml|json` and `.env`. `src/utils/config_loader.load_config()` is the single validated entry; `make check-env` calls it to verify setup.

## Common commands

Python tooling runs out of the Makefile's `.venv` (created by `make install`). The dev container uses a separate `.devcontainer/.venv`.

```bash
# Setup
make install          # create .venv + pip install -r requirements.txt + pre-commit hooks
make install-r        # renv::restore() for R deps
make check-env        # validate .env + config/paths.yml

# Tests (pytest, configured with pythonpath=["."] and --cov=src)
make test             # full suite with coverage
make test-fast        # skip @pytest.mark.slow integration tests
.venv/bin/pytest tests/test_hrv_features.py -v          # single file
.venv/bin/pytest tests/test_hrv_features.py -k some_case # single test by name

# Lint / format (black + flake8 + isort over src/ tests/ scripts/ redcap/)
make lint
make format

# Live dashboard (Python runtime, http://localhost:8080)
make dashboard-up        # docker/compose.dev.yml: build + serve
make dashboard-refresh   # rebuild all dashboard JSON + readings index locally
make dashboard-smoke     # health-check the runtime + auto-rebuild loop

# Frontend (web/, run from repo root)
npm --prefix web run dev        # Vite dev server
npm --prefix web run build      # tsc --noEmit && vite build
npm --prefix web run test       # vitest
npm --prefix web run lint       # eslint
npm --prefix web run typecheck  # tsc --noEmit

# Cloudflare Pages (frontend build is gated behind many VITE_FEATURE_* flags — see the pages-build target)
make pages-build
make pages-deploy

# REDCap / pipeline
make redcap-sync        # pull records, run QC, email summary
make run-pipeline       # full analysis pipeline (checks env first)

# Ops
make docker-health      # check/repair the dashboard container
make ops-check          # validate compose + canonical public surfaces
make k8s-helm-lint      # render/validate Helm templates
```

Two Compose files exist and are **not** interchangeable: root `docker-compose.yml` is the canonical stack (`make up`/`down`/`logs`), while `docker/compose.dev.yml` runs the live dashboard (`make dashboard-*`).

## Public sharing (Cloudflare)

The dashboard is exposed publicly via Cloudflare Pages (`esd-lab-namo.pages.dev`) plus quick/named tunnels. `make dashboard-share` prints a **temporary, random** `trycloudflare.com` URL — never bookmark a previous one as permanent. `make share-live` supervises the runtime + tunnel continuously. Named/stable hosting requires `CLOUDFLARE_TUNNEL_TOKEN` + `DASHBOARD_PUBLIC_HOSTNAME` in `.env`. `functions/api/redcap.js` is the Pages Function that proxies REDCap at the edge.

## Repo conventions worth knowing

- `renv.lock` is intentionally kept at the repo root because R scripts are spread across several directories; don't relocate it.
- `make clean-space` removes only rebuildable artifacts (legacy model weights, stale tool venvs, `web/build-merge`) — it preserves `.env`, current metrics, runtime data, `web/build`, and `node_modules`.
- `.github/copilot-instructions.md` is a generic "premium frontend UI craftsmanship" skill (immersive UI, GSAP/Framer Motion, performance/accessibility guardrails) — apply it when doing polished `web/` frontend work; it is not repo-operations guidance.
- Longstanding known issues and their fixes are tracked in [BUGS_AND_FIXES.md](BUGS_AND_FIXES.md) and [TECH_DEBT.md](TECH_DEBT.md); notable retired/archived artifacts are recorded in `docs/archive_manifest.md` and recoverable from an annotated pre-sweep git tag.
