# NANO Website — One-Page Overview

> The TL;DR. Start here, then branch into the operational docs.

## What is canonical now

The canonical website UI lives in `web/` and is served locally by
`dashboard/server/live_dashboard_server.py`.

- Public landing route: `/`
- Operator dashboard route: `/overview`
- Legacy `/dashboard/` route: redirect only

## Files that make it go

| Role | File |
|------|------|
| Public/app UI | `web/src/**` |
| Local runtime server | `dashboard/server/live_dashboard_server.py` |
| Generated data payloads | `dashboard/data/dashboard_data.json`, `dashboard/data/readings_data.json`, `dashboard/data/runtime_status.json` |
| Demo generator | `dashboard/pipelines/generate_synthetic_dashboard_data.py` |
| Python production pipeline | `dashboard/pipelines/build_dashboard_data.py` |
| R production pipeline | `dashboard/pipelines/build_dashboard_data.R` |
| Pages packaging | `scripts/build_pages_site.py` |
| Runtime-share wrapper | `scripts/build_pages_wrapper.py` |
| Archive | `archive/2026-05-18_legacy_dashboard_ui/` |

## Documentation map

| Topic | Doc |
|-------|-----|
| How to open the current UI | `docs/dashboard_guide.md` |
| How the runtime auto-refresh works | `docs/auto_update_pipeline.md` |
| How Pages deploys are packaged | `docs/pages_deploy.md` |
| How to keep the glossary honest | `docs/data_context_skill.md` |
| What was archived and why | `docs/archive_manifest.md` |

## Invariants worth remembering

* Python and R pipelines still produce the same payload schema documented in `dashboard/context_skill/references/dashboard_schema.md`.
* No PHI leaves the secure mount; rendered values stay group-level or surrogate-only.
* Cloudflare Pages and localhost now share the same SPA shell and route model.
* The retired static dashboard shell was archived unchanged and can still be restored if needed.
