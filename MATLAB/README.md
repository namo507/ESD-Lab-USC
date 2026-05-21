# MATLAB · NANO Study integration

> **Purpose.** Bridge MATLAB analytic scripts that handle the large, densely sampled physiological signals (ECG, temperature, HRV, HDA) into the same Python and R dashboard pipeline that already consumes REDCap and feature outputs. This folder is the canonical home for every MATLAB asset in the repository.

## Why this folder exists

The dashboard build pipeline (`dashboard/pipelines/build_dashboard_data.py` and `.R`) merges three streams on the `NANO-####` surrogate ID and the visit event key. Two of those streams (REDCap exports and the processed feature matrix) already had a Python or R touch point. The third stream — derived features computed in MATLAB — did not have a canonical handoff format. This folder adds one without changing the rest of the pipeline.

The recommended pattern is the file handoff. A MATLAB script writes a tidy table to `data/interim/matlab/` as a Parquet file (Parquet is native in MATLAB R2022a or later). The Python merge step picks it up on the next `make dashboard-refresh`. The new `matlab_integration` block in `dashboard/data/dashboard_data.json` is what drives the new MATLAB section in the SPA at `/matlab`.

```
┌─────────────────────┐    parquetwrite     ┌──────────────────────────────┐
│   MATLAB script     │ ──────────────────▶ │ data/interim/matlab/*.parquet │
│   (HRV, HDA, Temp)  │     manifest.json   │                              │
└─────────────────────┘ ──────────────────▶ └──────────────────────────────┘
                                                          │
                                                          ▼
                                               build_dashboard_data.py
                                                          │
                                                          ▼
                                              dashboard_data.json
                                                          │
                                                          ▼
                                              /matlab section in SPA
```

## Folder layout

```
MATLAB/
├── README.md                          # this file
├── config/
│   └── nano_config.example.m          # paths + secrets template (copy to nano_config.m)
├── +nano/                             # MATLAB package, called as nano.<function>
│   ├── loadConfig.m                   # resolve repo root + secure mount + outputs
│   ├── writeDashboardManifest.m       # emit manifest.json the Python merge reads
│   ├── pullRedcap.m                   # webread wrapper for the REDCap API
│   └── auditLog.m                     # append a structured run log entry
├── scripts/
│   ├── export_hrv_features.m          # ECG → IBI → HRV features → Parquet
│   ├── export_temperature_features.m  # Squirrel logger → 1-min gradients → Parquet
│   ├── export_hda_phases.m            # HRV epochs → HDA phase labels → Parquet
│   └── run_all.m                      # orchestrate every export + write manifest
├── examples/
│   └── synthetic_demo.m               # runs everything against the synthetic demo
└── tests/
    └── test_smoke.m                   # round-trip sanity check, no real data needed
```

## Quick start

```matlab
% 1. From the repo root, open MATLAB and add this folder to the path
addpath(genpath(fullfile(pwd, 'MATLAB')));

% 2. Copy the config template and edit it (kept out of git)
copyfile('MATLAB/config/nano_config.example.m', 'MATLAB/config/nano_config.m');
edit MATLAB/config/nano_config.m

% 3. Smoke test (no real data, no secure mount required)
run('MATLAB/examples/synthetic_demo.m');

% 4. Production run against the secure mount
run('MATLAB/scripts/run_all.m');
```

Then on the Python side:

```bash
make dashboard-refresh
```

The MATLAB section in the SPA at `https://esd-lab-namo.pages.dev/matlab` will reflect the new run within a minute.

## Data contract

Every Parquet file written under `data/interim/matlab/` must include these columns so the Python merge can join cleanly:

| Column | Type | Notes |
|--------|------|-------|
| `study_id` | string | NANO-#### surrogate ID, never the raw participant ID |
| `event` | string | longitudinal event key, e.g. `month_6_arm_1` |
| `epoch_start` | datetime | UTC, ISO 8601 |
| `epoch_sec` | int32 | epoch length in seconds |
| `<feature>` | numeric | one or more derived features, e.g. `rmssd`, `pnn50`, `lf_hf` |
| `qa_flag` | string | one of `excellent`, `good`, `marginal`, `reject` |

The manifest written to `data/interim/matlab/manifest.json` is a small JSON describing the run, the file list, the row counts per file, and the MATLAB version. The Python merge reads it to populate the dashboard freshness chip.

## Connecting to REDCap from MATLAB

For the densely sampled scripts that need visit metadata directly, MATLAB can hit the REDCap API without going through the Python layer. Use `nano.pullRedcap` for a thin wrapper:

```matlab
cfg = nano.loadConfig();
T = nano.pullRedcap(cfg, struct('events', {{ 'month_6_arm_1' }}, 'fields', {{ 'study_id', 'sex', 'cga_wks' }}));
```

The token and URL are read from environment variables set in the MATLAB session, the same `REDCAP_API_TOKEN` and `REDCAP_API_URL` that the Python and R modules use. PHI fields stay on the secure mount.

## HIPAA + safety

- Raw signals never leave the USC Secure Server mount. Only derived, group-level or surrogate-id'd feature tables are written under `data/interim/matlab/`.
- The `.gitignore` already excludes `data/**`, `MATLAB/config/nano_config.m`, and any `*.parquet` or `*.csv` checked in by mistake.
- Every script is wrapped by `nano.auditLog` so the run leaves a row in `logs/matlab_runs.csv`.
- The Python merge calls `drop_phi` from `dashboard/pipelines/build_dashboard_data.py` on the joined frame before anything reaches the JSON payload.
