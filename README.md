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

### Shareable Public Link

You can expose the live dashboard publicly with:

```bash
make dashboard-share
```

That command starts the dashboard, starts the tunnel sidecar, and prints the
active public dashboard URL.

The public link will be one of these forms:

- Quick share URL: `https://<random-subdomain>.trycloudflare.com/dashboard/`
- Stable branded URL: `https://dashboard.esdlabsc.com/dashboard/`

By default, the runtime uses a Cloudflare quick tunnel, so the printed public
URL is temporary and the hostname is random. Do not document or bookmark a
previous quick-tunnel URL as a permanent dashboard address, because it changes
when the tunnel is recreated.

For temporary sharing, always rerun `make dashboard-share` and send only the
latest quick-share URL printed by the script.

If you want a stable branded hostname such as
`https://dashboard.esdlabsc.com/dashboard/`, create a named
Cloudflare Tunnel, configure its public hostname in Cloudflare, and set these
variables in `.env` before running the same command:

```bash
CLOUDFLARE_TUNNEL_TOKEN=...
DASHBOARD_PUBLIC_HOSTNAME=dashboard.esdlabsc.com
```

After that, `make dashboard-share` prints the branded public link instead of a
random `trycloudflare.com` URL.

The share link stays live while the Docker services keep running.

To verify the runtime is still healthy and auto-rebuilding continuously:

```bash
make dashboard-smoke
```

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