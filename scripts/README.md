# Scripts Directory Guide

The `scripts/` directory is the canonical home for repository automation that is not tied to a single Python package module.

## Health And Verification

Use these when checking local runtime, deployment, or repository wiring:

- `check_compose_config.py` validates `docker/compose.dev.yml` and `docker/compose.prod.yml` without requiring Docker.
- `check_dashboard_runtime.py` smoke-tests the local dashboard runtime, its generated JSON payloads, and the Pages wrapper.
- `check_docker_health.py` validates Docker daemon access, Compose service health, and optional HTTP endpoints.
- `check_github_workflows.py` validates workflow file wiring and required fields.
- `check_k8s_readings_pipeline.py` probes the readings-library pipeline endpoints against a running dashboard.
- `check_live_surfaces.py` probes the public Pages routes that should remain healthy.
- `check_repository_hygiene.py` rejects retired archive paths and tracked files larger than 20 MiB.
- `check_site_health.py` performs a lightweight HTML and assistant-status health probe against a single public URL.

## Build And Deploy

Use these when packaging or publishing the website surfaces:

- `build_pages_site.py` packages the canonical Cloudflare Pages build from `web/build/`.
- `build_pages_wrapper.py` regenerates the runtime-share Pages wrapper that embeds the live dashboard origin.
- `share_dashboard.sh` starts the dashboard runtime, publishes a Cloudflare tunnel, and optionally keeps the Pages wrapper/current origin synchronized.
- `watch_pages_site.py` watches site inputs and rebuilds the canonical Pages artifact.
- `watch_pages_wrapper.py` watches runtime-share inputs and refreshes the runtime wrapper preview.

## Data Refresh And Content Generation

Use these when regenerating dashboard-facing data artifacts:

- `build_lab_readings_index.py` derives `web/lab-readings.json` from the dashboard readings payload.
- `prepare_dashboard_assistant.py` validates the ordered local/hosted provider chain, reports sanitized readiness, and refreshes grounding context.
- `generate_data_quality_report.py` writes HTML data-quality reports.
- `export_deidentified_dataset.py` produces de-identified analysis exports.
- `redcap_daily_sync.py` runs the REDCap sync and downstream QC workflow.
- `run_full_pipeline.sh` executes the end-to-end batch pipeline.

## Maintenance Utilities

Use these for housekeeping and non-core operator workflows:

- `backup_verification.sh` verifies secure-server backups.
- `benchmark_presentation_planner.py` validates presentation planning and optionally runs an explicitly metered live-provider benchmark.
- `ecg_batch_processor.py` batch-processes ECG inputs.
- `prune_logs.sh` deletes old local log files.
- `make clean-space` is opt-in disk housekeeping. It removes rebuildable local
  model weights, tool caches, extra virtual environments, and generated deploy
  artifacts while preserving live data, metrics, `.env`, `web/build`, and
  `node_modules`.

## Recommended Entry Points

Start with these commands before reaching for individual scripts:

```bash
make compose-validate
python3 scripts/check_github_workflows.py
python3 scripts/check_live_surfaces.py --allow-assistant-unready --json
python3 scripts/check_dashboard_runtime.py --base-url http://127.0.0.1:8080
bash scripts/share_dashboard.sh --mode auto
```

The Makefile remains the top-level operator surface. Reach for individual scripts when you need a narrower check, direct debugging, or CI parity.
