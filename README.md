# NANO Study — ESD Lab, University of South Carolina

> **⚠️ HIPAA WARNING**
> This repository contains code and configuration for a longitudinal infant study involving Protected Health Information (PHI).
> - **NEVER** commit raw data, participant identifiers, or PHI to this repository.
> - All data must be stored on the USC Secure Server and accessed via config paths only.
> - All contributors must complete CITI Human Subjects Training before accessing data.
> - Unauthorized disclosure of PHI may result in civil and criminal penalties under HIPAA.

---

## Study Overview

The **NANO Study** (Neurodevelopment of Autonomic and Neural Organization) is a 5-year NIH R01-funded longitudinal investigation tracking **260 very preterm (VPT) infants** from NICU admission through age 3 years. Conducted at the **Early Social Development (ESD) Lab, University of South Carolina**.

**Principal Investigator:** Dr. Jessica Bradshaw
**Co-Investigators:** Dr. Christian O'Reilly (ECG/ML), Dr. Robin Dail (NICU), Dr. Caitlin Hudac

### Research Goals
- Characterize autonomic nervous system maturation in VPT infants using cardiac and temperature biomarkers
- Identify early NICU-based physiological predictors of developmental outcomes (ASD, cognitive delay)
- Develop ML models for early detection of atypical neurodevelopmental trajectories

### Participant Groups
| Group | Description | N (target) |
|-------|-------------|------------|
| ASIB  | Autism Spectrum with Infant Biomarkers (VPT with ASD traits) | ~65 |
| PT    | Preterm typical development | ~130 |
| TD    | Term-born typical development | ~65 |

### Visit Schedule
| Event | Timepoint | Key Instruments |
|-------|-----------|-----------------|
| nicu_admission | NICU entry | Demographics, NICU morbidity, HeRO ECG |
| month_1 | 1 month CGA | NNNS-II, ECG, Temp |
| month_2 | 2 months CGA | NNNS-II, ECG, Temp, Behavioral coding |
| month_3 | 3 months CGA | NNNS-II, ECG, Temp, CSBS |
| month_6 | 6 months | ECG, Temp, Bayley-4, ASQ-3 |
| month_9 | 9 months | ECG, Temp, M-CHAT, CSBS |
| month_12 | 12 months | ECG, Temp, Bayley-4, ADOS-2 |
| month_24 | 24 months | Questionnaires only (PRAPARE, EPDS, ASQ-3) |
| month_36 | 36 months | ADOS-2, Bayley-4, ECG, HMET |

---

## Data Streams & Pipeline

```
+-------------------------------------------------------------------------+
|                     NANO STUDY DATA FLOW                                |
|                                                                         |
|  NICU / Lab Visit                                                       |
|  +--------------+  +-----------------+  +------------------------+     |
|  | HeRO Monitor |  | Actiheart-5 ECG  |  |  Squirrel Dataloggers  |    |
|  | (NICU ECG)   |  | (1024 Hz R-R)    |  |  (Skin Temp, 1-min)    |    |
|  +------+-------+  +--------+--------+  +-----------+------------+     |
|         |                   |                        |                  |
|         +-------------------+------------------------+                  |
|                             |                                           |
|                             v                                           |
|                  +---------------------+                               |
|                  |  USC Secure Server  |   <- HIPAA-encrypted storage  |
|                  |  (No PHI in repo)   |                               |
|                  +----------+----------+                               |
|                             |                                           |
|         +-------------------+------------------------+                  |
|         |                   |                        |                  |
|         v                   v                        v                  |
|  +-------------+  +------------------+  +-----------------------+      |
|  |  ECG Preproc|  |  Temp Preproc    |  |  Behavioral Coding    |      |
|  |  (neurokit2)|  |  (CPTd compute)  |  |  (DataVyu parser)     |      |
|  +------+------+  +--------+---------+  +----------+------------+      |
|         |                  |                        |                   |
|         +------------------+------------------------+                   |
|                             |                                           |
|                             v                                           |
|                  +---------------------+                               |
|                  |  REDCap Database    | <- Demographics, Assessments  |
|                  |  (API merge)        |   Questionnaires, Double-entry|
|                  +----------+----------+                               |
|                             |                                           |
|                             v                                           |
|                  +---------------------+                               |
|                  |  Feature Matrix     | <- HRV, RSA, HDA phases,      |
|                  |  (per participant   |   Temp gradients, LGCM        |
|                  |   per timepoint)    |   intercepts/slopes           |
|                  +----------+----------+                               |
|                             |                                           |
|                             v                                           |
|                  +---------------------+                               |
|                  |  Multiple           | <- MICE (m=20), 2-level       |
|                  |  Imputation         |   imputation, Rubin's rules   |
|                  +----------+----------+                               |
|                             |                                           |
|         +-------------------+------------------------+                  |
|         |                   |                        |                  |
|         v                   v                        v                  |
|  +-------------+  +------------------+  +-----------------------+      |
|  |  ML Models  |  |  Mixed Effects   |  |  Latent Growth Curves |      |
|  |  RF/XGB/CNN |  |  lme4/nlme       |  |  lavaan LGCMs         |      |
|  +------+------+  +--------+---------+  +----------+------------+      |
|         +------------------+------------------------+                   |
|                             |                                           |
|                             v                                           |
|                  +---------------------+                               |
|                  |   Manuscripts       | <- LaTeX/RMarkdown, figures   |
|                  |   (reports/)        |   results tables, SHAP plots  |
|                  +---------------------+                               |
+-------------------------------------------------------------------------+
```

---

## Directory Structure & Job Duties

| Directory | Purpose | Primary Role | % Effort |
|-----------|---------|--------------|----------|
| `config/` | YAML config files; data paths; study parameters | All | 5% |
| `data/` | Gitkeep placeholders; data dictionary | Data Coordinator | 10% |
| `redcap/` | REDCap API, hooks, instruments, QC | RA / Data Coordinator | 20% |
| `src/data_ingestion/` | Load ECG, temp, behavioral, REDCap data | Research Programmer | 10% |
| `src/preprocessing/` | ECG cleaning, HRV, temperature pipeline | Research Programmer / Co-I O'Reilly | 15% |
| `src/feature_engineering/` | Feature matrix construction | Research Programmer / Co-I O'Reilly | 10% |
| `src/imputation/` | MICE multiple imputation | Biostatistician | 5% |
| `src/models/` | ML, deep learning, mixed effects, LGCMs | Co-I O'Reilly / Biostatistician | 15% |
| `src/visualization/` | Publication-quality figures | Research Programmer | 5% |
| `src/utils/` | Config, logging, HIPAA utilities | Research Programmer | 5% |
| `notebooks/` | Exploration, walkthroughs, demos | All | 5% |
| `scripts/` | Batch processing, cron jobs, pipeline runners | Research Programmer | 5% |
| `tests/` | pytest unit/integration tests | Research Programmer | 5% |
| `docs/` | SOPs, guides, compliance checklists | PI / All | 5% |
| `reports/` | Figures, data quality reports, manuscript drafts | All | 5% |

---

## Setup

### Prerequisites
- Python >= 3.10
- R >= 4.3
- Access to USC Secure Server (VPN required)
- REDCap API token (from PI)
- CITI training certificate on file

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/namo507/ESD-Lab-USC.git
cd ESD-Lab-USC

# 2. Install Python dependencies
make install

# 3. Install R dependencies (run inside R or RStudio)
# renv::restore()  # uses renv.lock

# 4. Mount the secure data drive
# macOS example:
# sudo mount -t smbfs //your_netid@secure.research.sc.edu/nano_study /Volumes/nano_secure
# Update NANO_DATA_ROOT in .env after mounting

# 5. Configure environment
cp .env.example .env
# Edit .env with your actual credentials (NEVER commit .env)

# 6. Verify setup
make test
```

### Environment Configuration

```bash
cp .env.example .env
# Fill in:
#   REDCAP_API_TOKEN=<your_token>
#   NANO_DATA_ROOT=/Volumes/nano_secure   # or Linux mount point
#   REDCAP_API_URL=https://redcap.sc.edu/api/
```

## Live Dashboard

The repository now includes a live dashboard runtime that serves the repo,
rebuilds `dashboard/data/dashboard_data.json` when source inputs change, and
automatically indexes new PDFs added under `ESD Lab readings/`.

```bash
# Start the live dashboard
docker compose up --build dashboard

# Open it locally
open http://localhost:8080/dashboard/
```

Useful shortcuts:

```bash
make dashboard-refresh
make dashboard-up
make dashboard-smoke
make dashboard-logs
```

If the secure data mount is unavailable, the runtime falls back to synthetic
dashboard data so the UI and the readings library still render cleanly.

### Dev Container

This repository can also be opened in a VS Code dev container. The dev container:

- uses Python 3.11 plus R so the main Python, notebook, and R bridge workflows work in one environment
- keeps its virtualenv under `.devcontainer/.venv` so it does not overwrite a host-side `.venv`
- runs `.devcontainer/post-create.sh` on first create to install Python dependencies and bootstrap `renv`

To reopen the current workspace in the container, use the VS Code command palette and run `Dev Containers: Reopen in Container` after Docker Desktop is running.

Current canonical public entrypoint:

- **Stable**: [https://esd-lab-namo.pages.dev/](https://esd-lab-namo.pages.dev/) — Cloudflare Pages wrapper. The wrapper iframes the live dashboard origin; only this URL should ever be published. Promoted to a named tunnel hostname (`https://esd-lab-namo.sc.edu/dashboard/`) once USC IT creates the CNAME at the registrar (DNSMadeEasy). See [docs/cloudflare_cutover_blockers.md](docs/cloudflare_cutover_blockers.md) for the exact remaining step.

### Public Dashboard Sharing

There is exactly **one** canonical public URL for the dashboard at any time.
The share workflow exposes three explicit modes so the URL is never
ambiguous:

| Command | Mode | Canonical URL | Stable? |
|---------|------|---------------|---------|
| `make share-named`       | named  | `https://dashboard.esdlabsc.com/dashboard/`            | yes — DNS-backed |
| `make dashboard-share`   | auto   | named when configured, otherwise → ⬇ Pages wrapper     | yes (wrapper URL) |
| `make share-quick`       | quick  | `https://esd-lab-namo.pages.dev/` (Pages wrapper)      | yes (wrapper URL) |

The Pages wrapper at **`https://esd-lab-namo.pages.dev/`** iframes whichever
cloudflared origin the share script just brought up. The wrapper URL itself
never rotates; the iframe target inside it is regenerated automatically every
run from `dashboard/public/pages_wrapper/template.html` and deployed with
`make pages-deploy`.

If Docker Compose is unavailable, the same command falls back to the local
Python dashboard runtime on `127.0.0.1:8080` and starts a host-side
`cloudflared` tunnel instead.

#### Tier 1 — stable named tunnel (preferred)

Set both values in `.env` and run `make share-named`:

```bash
CLOUDFLARE_TUNNEL_TOKEN=...
DASHBOARD_PUBLIC_HOSTNAME=dashboard.esdlabsc.com
```

Prerequisites in the Cloudflare account:

1. The DNS zone (e.g. `esdlabsc.com`) attached to Cloudflare.
2. A named Tunnel created in the Cloudflare Zero Trust dashboard with a
   public hostname pointing at `http://dashboard:8080` (Compose service
   name) or the host's `http://localhost:8080`.
3. The Tunnel token copied into `.env`.

If those prerequisites are missing, `make share-named` exits non-zero rather
than silently degrading to a quick tunnel.

#### Tier 2 — Pages wrapper + quick origin (default fallback)

`make dashboard-share` (with both values blank) starts a quick Cloudflare
tunnel and rebuilds the Pages wrapper to embed the new origin URL. The team
keeps sharing the same canonical wrapper URL:

> **`https://esd-lab-namo.pages.dev/`**

The wrapper artifact is written to `dist/pages-wrapper/index.html` plus a
preview at `dashboard/public/pages_wrapper/index.html` and a manifest at
`dashboard/public/pages_wrapper/manifest.json`. To push the regenerated
wrapper to Pages:

```bash
# Prereqs: export CLOUDFLARE_API_TOKEN (Pages:Edit + Account:Read scopes).
# Override branch/project via CLOUDFLARE_PAGES_BRANCH (default: main) and
# CLOUDFLARE_PAGES_PROJECT (default: esd-lab-namo).
make pages-deploy   # wrangler@3.112.0 pages deploy dist/pages-wrapper --branch main --commit-dirty=true
```

If `CLOUDFLARE_API_TOKEN` is not available in the operator's shell, use the
git-connected fallback documented in
[`dashboard/public/pages_wrapper/README.md`](dashboard/public/pages_wrapper/README.md):
push the regenerated `dashboard/public/pages_wrapper/index.html` to the
branch the `esd-lab-namo` Pages project watches; Cloudflare redeploys
automatically.

The cloudflared origin (`https://<random>.trycloudflare.com/dashboard/`) is
printed *separately* and labelled "Ephemeral cloudflared origin (do NOT
publish)" so it is never confused with the canonical URL.

#### Tier 3 — quick tunnel only

`make share-quick` skips the Pages wrapper entirely and prints only the
ephemeral hostname. Use this for a one-off share where rotation is fine.

### Verifying the share

```bash
make dashboard-smoke    # local /api/healthz + watcher liveness check
curl -I "$(cat ${XDG_RUNTIME_DIR:-/tmp}/esd-lab-usc-share/last_origin.txt)"
```

The most recent origin URL is recorded in
`${XDG_RUNTIME_DIR:-/tmp}/esd-lab-usc-share/last_origin.txt` so callers can
re-verify without re-running the share. The share link stays live while the
local dashboard process and the `cloudflared` process keep running.

### Local Dashboard Assistant

The live dashboard now includes a collapsible chat assistant wired to a local
GGUF model backend. The default target is
`bartowski/Qwen2.5-1.5B-Instruct-GGUF` with the
`Qwen2.5-1.5B-Instruct-Q3_K_S.gguf` file, which is still small enough to run in
this dev container with the tuned assistant settings.

Use these commands to install the runtime and fetch the model locally:

```bash
pip install -r dashboard/requirements-assistant.txt
make assistant-status
make assistant-prepare
```

Detailed setup notes are in [docs/dashboard_ai_assistant.md](docs/dashboard_ai_assistant.md).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branching strategy, commit conventions, and PR checklist.

All contributors must:
1. Complete CITI Human Subjects (Social/Behavioral) training
2. Sign the USC IRB data use agreement
3. Never commit PHI or raw data files
4. Use config paths for all data access

---

## License

MIT License — see [LICENSE](LICENSE)