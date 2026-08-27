# Repository Structure Contract

## Canonical Frontend

`web/` is the only active frontend. Cloudflare Pages deploys the packaged Vite
build from `web/build/` through `scripts/build_pages_site.py`.

`dashboard/` is the Python runtime, API, assistant, and data-pipeline layer.
The retired static shell is recoverable from the annotated pre-sweep tag in
`docs/archive_manifest.md`; no duplicate frontend implementation remains in the
active tree.

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

## Automation Entry Points

`Makefile` is the top-level operator surface for routine development, health
checks, packaging, and sharing commands.

`scripts/` contains the narrower automation entry points behind those targets.
See `scripts/README.md` for the current health, build, deploy, and maintenance
script catalog.

`make clean-space` removes rebuildable legacy model weights and stale local
tool environments while preserving `.env`, current ML metrics, runtime data,
`web/build`, and `web/node_modules`.

## R Environment

`renv.lock` remains at the repository root because R scripts are spread across
`dashboard/pipelines/`, `redcap/`, `reports/templates/`, and `src/`. Moving the
lockfile would require a broader R project split.
