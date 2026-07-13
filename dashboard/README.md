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

The browser UI lives in `web/`. The legacy static files still present at
`dashboard/index.html`, `dashboard/app.js`, `dashboard/styles.css`, and
`dashboard/primitives.js` are stubs that redirect or point to the archived
copies under `archive/2026-05-18_legacy_dashboard_ui/`.

Kubernetes automation code lives under `k8s/pipeline/`; Helm manifests live
under `k8s/helm/`.
