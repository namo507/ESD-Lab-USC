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
| `data/` | Gitkeep placeholders; data dictionary | Data Coordinator | 8% |
| `redcap/` | REDCap API, hooks, instruments, QC | RA / Data Coordinator | 12% |
| `src/` | Python/R research-analysis package: ingestion, preprocessing, features, imputation, models, visualization | Research Programmer / Analysts | 24% |
| `web/` | Canonical React/Vite frontend deployed to Cloudflare Pages | Research Programmer | 10% |
| `dashboard/` | Python dashboard runtime, API surface, assistant, and JSON builders | Research Programmer | 10% |
| `k8s/` | Helm manifests and Kubernetes event-pipeline automation | Research Programmer / DevOps | 4% |
| `docker/` | Dockerfile and Compose files (`compose.dev.yml`, `compose.prod.yml`) | Research Programmer / DevOps | 4% |
| `notebooks/` | Exploration, walkthroughs, demos | All | 5% |
| `scripts/` | Batch processing, cron jobs, pipeline runners | Research Programmer | 5% |
| `tests/` | pytest unit/integration tests | Research Programmer | 5% |
| `docs/` | SOPs, guides, compliance checklists | PI / All | 4% |
| `reports/` | Figures, data quality reports, manuscript drafts | All | 4% |

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
automatically indexes new PDFs added under `esd-lab-readings/`. The canonical
frontend lives in `web/`; `dashboard/` is the Python runtime and data layer.
See `docs/repository_structure.md` for the current layout contract.

```bash
# Start the live dashboard
docker compose -f docker/compose.dev.yml up --build dashboard

# Open it locally
open http://localhost:8080/
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

Current stable public entrypoints:

- Public wrapper: [https://esd-lab-namo.pages.dev/](https://esd-lab-namo.pages.dev/)
- Direct dashboard origin: the current `make dashboard-share` URL printed for the active Cloudflare quick tunnel session

### Shareable Public Links

You can expose the live dashboard publicly with:

```bash
make dashboard-share
```

For continuous supervision (recommended while actively editing localhost):

```bash
make share-live
```

`make share-live` runs in continuous quick-tunnel mode, keeps the local dashboard
runtime and cloudflared tunnel alive, auto-restarts them if they stop, and
refreshes the runtime-share preview when the temporary hostname rotates. The
canonical Pages worker accepts only a healthy durable API origin; otherwise it
stays in fallback-only mode so stale tunnels cannot take the website down.

That command starts the local website runtime, starts the tunnel sidecar, and
prints the active public site URL for the current session.

The Cloudflare-hosted links currently used for sharing this repository are:

- Public wrapper: [https://esd-lab-namo.pages.dev/](https://esd-lab-namo.pages.dev/)
- Active direct site URL from `make dashboard-share`: `https://<random-subdomain>.trycloudflare.com/`

The Pages frontend is live at `https://esd-lab-namo.pages.dev/` and no longer
depends on `esd-lab-namo.sc.edu`. A stable named backend tunnel still needs a
hostname under a DNS zone controlled in this Cloudflare account; `pages.dev` is
Cloudflare-owned and cannot be used as the tunnel DNS zone. Until such a domain
is attached, the canonical site serves its safe fallback assistant while the
current direct quick-tunnel URL exposes the live NVIDIA-backed runtime.

By default, `make dashboard-share` uses a Cloudflare quick tunnel, so the
printed public URL is temporary and the hostname is random. Do not document or
bookmark a previous quick-tunnel URL as a permanent dashboard address because
it changes whenever the tunnel is recreated.

For temporary sharing, always rerun `make dashboard-share` and send only the
latest quick-share URL printed by the script.

To move from the current quick-tunnel-backed wrapper to a stable branded
hostname such as `https://dashboard.esdlabsc.com/`, attach the DNS
zone to the Cloudflare account, create a named public hostname, and set these
variables in `.env` before running the same command:

```bash
CLOUDFLARE_TUNNEL_TOKEN=...
DASHBOARD_PUBLIC_HOSTNAME=dashboard.esdlabsc.com
```

After that, `make dashboard-share` selects named-tunnel mode and can print the
custom-domain link instead of a random `trycloudflare.com` URL. The equivalent
explicit command is `make share-named`; use `make share-quick` only for a
temporary preview.

The share link stays live while the Docker services keep running.

To verify the runtime is still healthy and auto-rebuilding continuously:

```bash
make dashboard-smoke
```

---

## Docker/Compose Health Check

Before sharing or running the dashboard, you can verify Docker and Compose service health:

```bash
make docker-preflight
make docker-health
make docker-share-health
make ops-check
```

These checks cover:

- `docker-preflight`: Docker daemon and Compose availability before services start.
- `docker-health`: dashboard service health, `/api/healthz`, and automatic `docker compose up -d dashboard` repair when needed.
- `docker-share-health`: dashboard plus the selected share sidecar (`dashboard-share` or `dashboard-share-named`), with repair.
- `ops-check`: Compose config plus the canonical Pages and runtime-share public surfaces.

`make dashboard-share` runs the lightweight Docker preflight before it starts
or refreshes the share sidecar. Run `make docker-share-health` after sharing is
up when you want to verify the tunnel container too.

---

## Contributing

See [CONTRIBUTING.md](docs/governance/CONTRIBUTING.md) for branching strategy, commit conventions, and PR checklist.

All contributors must:
1. Complete CITI Human Subjects (Social/Behavioral) training
2. Sign the USC IRB data use agreement
3. Never commit PHI or raw data files
4. Use config paths for all data access

---

## License

MIT License — see [LICENSE](LICENSE)
