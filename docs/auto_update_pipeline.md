# Dashboard Auto-Update Pipeline — How It Works

> Audience: anyone who needs to know how / when the dashboard refreshes,
> how to run it manually, and what to do if it fails.

## 1. What actually runs

Two pipelines produce the **same** output JSON, so the dashboard is
indifferent to which one was used:

| Script | Language | When to use |
|--------|----------|-------------|
| `dashboard/pipelines/generate_synthetic_dashboard_data.py` | Python | Demos, onboarding, smoke tests. No real data needed. |
| `dashboard/pipelines/build_dashboard_data.py`             | Python | Nightly cron on the analysis server. |
| `dashboard/pipelines/build_dashboard_data.R`              | R      | Ad-hoc rebuilds from R (analysts working in RStudio). |

Each writes `dashboard/data/dashboard_data.json`. The dashboard
(`dashboard/index.html`) reloads it on every page refresh.

## 2. Nightly schedule

```
03:05  scripts/redcap_daily_sync.py            # pulls REDCap, runs QC
03:40  dashboard/pipelines/build_dashboard_data.py
03:45  rsync dashboard_data.json → lab-share   # makes it visible to everyone
```

The cron line lives in `scripts/crontab.nano` (checked in). Update
that file to change the schedule; the deploy script applies it.

## 3. Running it manually

```bash
# Inside the project root, VPN connected, .env configured

# (A) Smoke test (no REDCap access needed)
python dashboard/pipelines/generate_synthetic_dashboard_data.py

# (B) Full run against the real secure mount
python dashboard/pipelines/build_dashboard_data.py

# (C) Full run but gracefully fall back to synthetic if REDCap is down
python dashboard/pipelines/build_dashboard_data.py --fallback-synthetic

# (D) R version (equivalent output)
Rscript dashboard/pipelines/build_dashboard_data.R
```

After any of these, open `dashboard/index.html` in your browser.

## 4. Inputs

| Input | Default path | Required? | What if missing |
|-------|--------------|-----------|-----------------|
| REDCap mirror  | `${NANO_DATA_ROOT}/processed/redcap_latest.parquet`  | Yes (prod) | Pipeline errors; use `--fallback-synthetic` |
| Feature matrix | `${NANO_DATA_ROOT}/processed/feature_matrix.parquet` | Yes (prod) | Pipeline errors; use `--fallback-synthetic` |
| Data dictionary | `data/data_dictionary/NANO_master_data_dictionary.csv` | Recommended | PHI scrub is skipped (unsafe) |
| Model metrics  | `${NANO_DATA_ROOT}/models/_metrics.json`             | Optional | `ml_performance` is empty; the ML tab says "no model run yet" |

## 5. Outputs

| File | Schema | Who reads it |
|------|--------|--------------|
| `dashboard/data/dashboard_data.json` | Documented in `dashboard/context_skill/references/dashboard_schema.md` | `dashboard/index.html` (Chart.js) |
| `logs/dashboard_build_<date>.log`    | plain text | Research Programmer when debugging |

## 6. Safety & privacy

* All columns flagged `phi_flag=true` in the data dictionary are
  stripped **before** any aggregation.
* Participant IDs are hashed with the salt in `NANO_ID_SALT` (env var)
  to produce stable `NANO-####` surrogates. The salt never enters the
  repo.
* If the data dictionary is missing, `drop_phi` logs a warning and
  leaves the frame untouched. In that state you should re-run with
  `--fallback-synthetic` until the dictionary is restored.

## 7. Failure playbook

| Symptom | Probable cause | Fix |
|---------|----------------|-----|
| `FileNotFoundError: redcap_latest.parquet` | VPN down or secure mount not attached | Re-mount, retry |
| Pipeline runs but dashboard shows stale numbers | Browser cache | Hard-refresh (`Cmd+Shift+R`) |
| Trajectories chart is empty | `feature_matrix.parquet` missing `month` column | Re-run feature engineering |
| ML tab is empty | `_metrics.json` missing or older than 30 days | Re-run `src/models/train_all.py` |
| Nightly cron failed silently | Check `logs/dashboard_build_<date>.log` | If missing, check cron mail or `scripts/redcap_daily_sync.py` |

## 8. Adding a new section to the dashboard

1. Add the data to `build_payload` (both Python and R) so the JSON gets
   a new key.
2. Mirror the same key in
   `dashboard/pipelines/generate_synthetic_dashboard_data.py`.
3. Add a new section + Chart.js block to `dashboard/index.html`.
4. Document the key in
   `dashboard/context_skill/references/dashboard_schema.md`.
5. Run `python dashboard/context_skill/extract_context.py --check` to
   make sure the three stay in sync.

## 9. Rolling back

Because the output JSON is self-contained, rolling back is trivial:

```bash
git checkout <last-good-sha> -- dashboard/data/dashboard_data.json
```

The dashboard will immediately reflect the old payload.
