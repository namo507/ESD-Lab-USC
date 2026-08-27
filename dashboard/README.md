# Dashboard Runtime Package

`dashboard/` is the Python runtime and data-pipeline layer. It is not the
canonical frontend.

## Current Responsibilities

| Path | Purpose |
|------|---------|
| `server/live_dashboard_server.py` | Local HTTP runtime, API endpoints, SPA serving, rebuild watcher |
| `pipelines/` | Python/R builders for dashboard JSON payloads |
| `assistant/` | Grounded assistant orchestration and NVIDIA OpenAI-compatible provider |
| `context_skill/` | Dashboard schema/context references for grounded assistant behavior |
| `data/` | Generated, de-identified dashboard payloads and runtime status |
| `research_questions/` | Research-question source material and generated dashboard block |
| `requirements.txt` | Docker/runtime Python dependencies |

The tracked payload snapshot intentionally uses the repository's de-identified
demo inputs (`meta.data_source=repo_demo_inputs` and
`redcap_meta.source=synthetic-fallback`) so Pages remains usable without REDCap
credentials. Only `organization_site` is refreshed from the public ESD Lab
website. A deployment must not describe the aggregate study/REDCap snapshot as
live production data unless the source fields report the authenticated source.

The browser UI lives in `web/`. Legacy static files were removed from the active
tree after route redirects moved into the Python server and Pages worker. Their
recovery tag is documented in `docs/archive_manifest.md`.

The HTTP runtime uses a strict public-file boundary: it serves the built SPA,
the three de-identified runtime JSON payloads, and PDF files from
`esd-lab-readings/`. Repository files, dotfiles, configuration, audit logs, and
all other dashboard data files return 404 and must never be exposed by a tunnel.

Kubernetes automation code lives under `k8s/pipeline/`; Helm manifests live
under `k8s/helm/`.
