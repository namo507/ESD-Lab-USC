# Repository Structure Contract

## Canonical Frontend

`web/` is the only active frontend. Cloudflare Pages deploys the packaged Vite
build from `web/build/` through `scripts/build_pages_site.py`.

`dashboard/` is the Python runtime, API, assistant, and data-pipeline layer.
The old static dashboard shell is archived under
`archive/2026-05-18_legacy_dashboard_ui/`; the files left in `dashboard/` are
redirect/deprecation stubs.

## Data Locations

| Location | Contract |
|----------|----------|
| `data/` | Repo-safe placeholders, data dictionary, and synthetic/demo processed files only |
| `dashboard/data/` | Generated dashboard payloads consumed by the runtime and frontend |
| `web/src/data/` | Small static TypeScript/JSON fixtures bundled by Vite |
| `web/lab-readings.json` | Local/build-time browser-facing derivative of `dashboard/data/readings_data.json` |
| `esd-lab-readings/` | Committed reading PDFs scanned by `dashboard/pipelines/build_readings_index.py` |

Raw participant data and PHI stay outside git on the secure server.

In Kubernetes, `LAB_READINGS_OUTPUT` may point at
`/app/dashboard/data/lab-readings.json` so the readings-library API can refresh
on the mounted data PVC without mutating the image filesystem. The source of
truth remains `dashboard/data/readings_data.json`.

## Infrastructure

| Area | Canonical Location |
|------|--------------------|
| Docker Compose | `docker/compose.dev.yml`, `docker/compose.prod.yml` |
| Docker image | `docker/dashboard/Dockerfile` |
| Kubernetes Helm | `k8s/helm/` |
| Kubernetes Python automation | `k8s/pipeline/` |

## R Environment

`renv.lock` remains at the repository root because R scripts are spread across
`dashboard/pipelines/`, `redcap/`, `reports/templates/`, and `src/`. Moving the
lockfile would require a broader R project split.
