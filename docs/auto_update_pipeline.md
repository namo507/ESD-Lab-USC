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
| `dashboard/pipelines/build_org_site_data.py`              | Python | Refresh the ESD Lab public-site metadata block and impact feed. |
| `dashboard/pipelines/build_readings_index.py`             | Python | Re-index the `ESD Lab readings/` library. |

The first three write `dashboard/data/dashboard_data.json`. The readings
pipeline writes `dashboard/data/readings_data.json`. The dashboard
(`dashboard/index.html`) reloads them automatically in live mode and on
page refresh in static mode.

`build_dashboard_data.py` now calls the organization-site builder logic
internally, so `dashboard/data/dashboard_data.json` includes the
`organization_site` block used by the ESD Lab organization snapshot and
impact explorer.

## 2. Nightly schedule

```
03:05  scripts/redcap_daily_sync.py            # pulls REDCap, runs QC
03:40  dashboard/pipelines/build_dashboard_data.py
03:45  rsync dashboard_data.json → lab-share   # makes it visible to everyone
```

The cron line lives in `scripts/crontab.nano` (checked in). Update
that file to change the schedule; the deploy script applies it.

The readings index is not tied to the REDCap cron. In live mode, the
dashboard runtime watches `ESD Lab readings/` and regenerates the index
whenever a new file lands in that folder.

## 3. Live Docker mode

```bash
docker compose up --build dashboard
```

What that does:

1. Serves the repository root at `http://localhost:8080/`.
2. Redirects `/` to `/dashboard/`.
3. Polls dashboard inputs and `ESD Lab readings/` every 20 seconds.
4. Rebuilds `dashboard_data.json`, `readings_data.json`, and `runtime_status.json` when an input changes.

To verify the running container is healthy and the watcher is still triggering rebuilds:

```bash
python scripts/check_dashboard_runtime.py --base-url http://127.0.0.1:8080
```

For a public share link from a local machine:

```bash
make dashboard-share      # auto mode: prefer named tunnel, fall back to Pages wrapper
make share-named          # require stable named tunnel; fail if .env incomplete
make share-quick          # one-off random hostname (no wrapper deploy)
```

The canonical public URL is the **Cloudflare Pages wrapper** at
`https://esd-lab-namo.pages.dev/`. The wrapper iframes whichever cloudflared
origin is currently live; the wrapper URL itself never rotates.

When auto/quick mode runs, the script:

1. starts the dashboard runtime (Docker Compose or host Python fallback).
2. starts the cloudflared tunnel.
3. captures the new origin URL.
4. **regenerates** `dashboard/public/pages_wrapper/index.html` and
   `dist/pages-wrapper/index.html` so the iframe target is fresh.
5. prints a `Canonical public URL` block plus an `Ephemeral cloudflared
   origin` block separately. Only the canonical URL should ever be published.

After every quick-tunnel run, the share script auto-deploys the regenerated
wrapper to Pages when `CLOUDFLARE_API_TOKEN` is available. If that token is
not present, deploy the wrapper manually:

```bash
# Requires CLOUDFLARE_API_TOKEN with Pages:Edit + Account:Read scopes.
# Targets the production alias on the project's main branch by default.
make pages-deploy
# = wrangler@3.112.0 pages deploy dist/pages-wrapper \
#       --project-name $CLOUDFLARE_PAGES_PROJECT \
#       --branch $CLOUDFLARE_PAGES_BRANCH (default main) \
#       --commit-dirty=true
```

To promote to Tier 1 (a stable branded hostname instead of the wrapper),
configure a named Cloudflare tunnel and set both `.env` values:

```bash
CLOUDFLARE_TUNNEL_TOKEN=...
DASHBOARD_PUBLIC_HOSTNAME=dashboard.esdlabsc.com
```

`make share-named` then prints `https://dashboard.esdlabsc.com/dashboard/`
as the canonical URL and skips the wrapper rebuild.

Cloudflare account prerequisites required for the named-tunnel path:

- The DNS zone (`esdlabsc.com`) must be attached to the Cloudflare account.
- A named Tunnel must exist in Cloudflare Zero Trust with a public hostname
  mapped to `http://dashboard:8080` (Compose service) or
  `http://localhost:8080` (host-mode runtime).

If those prerequisites are missing, the share script never silently degrades
— it warns explicitly that it is falling back to a quick tunnel behind the
Pages wrapper.

## 4. Running it manually

```bash
# Inside the project root, VPN connected, .env configured

# (A) Smoke test (no REDCap access needed)
python dashboard/pipelines/generate_synthetic_dashboard_data.py

# (A2) Re-index the readings library
python dashboard/pipelines/build_readings_index.py

# (A3) Inspect or refresh the public-site organization payload only
python dashboard/pipelines/build_org_site_data.py

# (B) Full run against the real secure mount
python dashboard/pipelines/build_dashboard_data.py

# (C) Full run but gracefully fall back to synthetic if REDCap is down
python dashboard/pipelines/build_dashboard_data.py --fallback-synthetic

# (D) R version (equivalent output)
Rscript dashboard/pipelines/build_dashboard_data.R
```

After any of these, open `dashboard/index.html` in your browser, or run
the Docker service for automatic refreshes.

## 5. Inputs

| Input | Default path | Required? | What if missing |
|-------|--------------|-----------|-----------------|
| REDCap mirror  | `${NANO_DATA_ROOT}/processed/redcap_latest.parquet`  | Yes (prod) | Pipeline errors; use `--fallback-synthetic` |
| Feature matrix | `${NANO_DATA_ROOT}/processed/feature_matrix.parquet` | Yes (prod) | Pipeline errors; use `--fallback-synthetic` |
| Data dictionary | `data/data_dictionary/NANO_master_data_dictionary.csv` | Recommended | PHI scrub is skipped (unsafe) |
| Model metrics  | `${NANO_DATA_ROOT}/models/_metrics.json`             | Optional | `ml_performance` is empty; the ML tab says "no model run yet" |
| ESD Lab readings | `ESD Lab readings/` | Optional | Reading library renders empty state |
| ESD Lab public site | `https://www.esdlabsc.com/` | Optional | `organization_site` falls back to the bundled snapshot |

## 6. Outputs

| File | Schema | Who reads it |
|------|--------|--------------|
| `dashboard/data/dashboard_data.json` | Documented in `dashboard/context_skill/references/dashboard_schema.md` | `dashboard/index.html` (Chart.js) |
| `dashboard/data/readings_data.json` | Reading metadata summary + searchable cards | `dashboard/index.html` |
| `dashboard/data/runtime_status.json` | Last rebuild state + watcher health | Live dashboard runtime + operators |
| `logs/dashboard_build_<date>.log`    | plain text | Research Programmer when debugging |

The dashboard JSON now also contains an `organization_site` block with:

* organization summary KPIs,
* mission and study metadata,
* family pathway and contact links,
* a unified `impact_feed` for publications, news mentions, and participant stories.

## 7. Safety & privacy

* All columns flagged `phi_flag=true` in the data dictionary are
  stripped **before** any aggregation.
* Participant IDs are hashed with the salt in `NANO_ID_SALT` (env var)
  to produce stable `NANO-####` surrogates. The salt never enters the
  repo.
* If the data dictionary is missing, `drop_phi` logs a warning and
  leaves the frame untouched. In that state you should re-run with
  `--fallback-synthetic` until the dictionary is restored.

The readings index only uses committed filenames and file metadata. It
does not extract PDF contents or transmit documents anywhere.

## 8. Failure playbook

| Symptom | Probable cause | Fix |
|---------|----------------|-----|
| `FileNotFoundError: redcap_latest.parquet` | VPN down or secure mount not attached | Re-mount, retry |
| Pipeline runs but dashboard shows stale numbers | Browser cache | Hard-refresh (`Cmd+Shift+R`) |
| Trajectories chart is empty | `feature_matrix.parquet` missing `month` column | Re-run feature engineering |
| ML tab is empty | `_metrics.json` missing or older than 30 days | Re-run `src/models/train_all.py` |
| Reading library did not update | `build_readings_index.py` did not run or file extension is unsupported | Re-run the readings index or check the live service logs |
| ESD Lab organization section looks stale | The public site fetch failed during the last build | Re-run the build with network access and inspect `organization_site.meta.errors` |
| Nightly cron failed silently | Check `logs/dashboard_build_<date>.log` | If missing, check cron mail or `scripts/redcap_daily_sync.py` |

## 9. Adding a new section to the dashboard

1. Add the data to `build_payload` so the JSON gets a new key.
2. If the section depends on public or external metadata, isolate the fetch
   and parse logic in a helper module similar to `build_org_site_data.py`.
3. Mirror the same key in
   `dashboard/pipelines/generate_synthetic_dashboard_data.py`.
4. Add a new section + Chart.js block to `dashboard/index.html`.
5. Document the key in
   `dashboard/context_skill/references/dashboard_schema.md`.
6. Run `python dashboard/context_skill/extract_context.py --check` to
   make sure the three stay in sync.

## 10. Rolling back

Because the output JSON is self-contained, rolling back is trivial:

```bash
git checkout <last-good-sha> -- dashboard/data/dashboard_data.json
```

The dashboard will immediately reflect the old payload.
