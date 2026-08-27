# NANO Website — One-Page Overview

> The TL;DR. Start here, then branch into the operational docs.

## What is canonical now

The canonical website UI lives in `web/` and is served locally by
`dashboard/server/live_dashboard_server.py`.

- Public landing route: `/`
- Operator dashboard route: `/esd-lab`
- Additive NANO Study dashboard route: `/nano/dashboard`
- Legacy `/dashboard/` route: redirect only

## Files that make it go

| Role | File |
|------|------|
| Public/app UI | `web/src/**` |
| Local runtime server | `dashboard/server/live_dashboard_server.py` |
| Generated data payloads | `dashboard/data/dashboard_data.json`, `dashboard/data/readings_data.json`, `dashboard/data/runtime_status.json` |
| Kubernetes/event status | `dashboard/data/readings_pipeline_status.json`, `dashboard/data/readings_pipeline_events.jsonl` |
| Demo generator | `dashboard/pipelines/generate_synthetic_dashboard_data.py` |
| Python production pipeline | `dashboard/pipelines/build_dashboard_data.py` |
| R production pipeline | `dashboard/pipelines/build_dashboard_data.R` |
| Pages packaging | `scripts/build_pages_site.py` |
| Runtime-share wrapper | `scripts/build_pages_wrapper.py` |
| Historical recovery | Git tag `pre-dashboard-space-sweep-2026-07-14` |

## Documentation map

| Topic | Doc |
|-------|-----|
| How to open the current UI | `docs/dashboard_guide.md` |
| NANO Study dashboard, data contract, and Buddy | `docs/nano_dashboard.md` |
| How the runtime auto-refresh works | `docs/auto_update_pipeline.md` |
| How Pages deploys are packaged | `docs/pages_deploy.md` |
| How to keep the glossary honest | `docs/data_context_skill.md` |
| What was archived and why | `docs/archive_manifest.md` |
| Kubernetes readings automation | `docs/kubernetes_event_pipeline.md` |
| Kubernetes failure runbook | `docs/kubernetes_runbook.md` |

## Invariants worth remembering

* Python and R pipelines still produce the same payload schema documented in `dashboard/context_skill/references/dashboard_schema.md`.
* No PHI leaves the secure mount; rendered values stay group-level or surrogate-only.
* Cloudflare Pages and localhost now share the same SPA shell and route model.
* Cluster observability is additive: `/esd-lab` shows Kubernetes topology and
  readings pipeline status when available, and a labeled local fallback when
  Kubernetes is disabled.
* Retired dashboard sources can be inspected or restored from the pre-sweep Git tag without bloating the active tree.
