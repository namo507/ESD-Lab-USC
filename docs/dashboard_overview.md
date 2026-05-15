# NANO Dashboard — One-Page Overview

> The TL;DR. Start here, branch out to the other docs.

## What we built

A small, self-contained dashboard for the NANO Study that answers four
questions at a glance:

1. **Where is enrollment today?**
2. **Is the data clean?**
3. **Are the ML models any good?**
4. **Are groups (ASIB / PT / TD) diverging on biomarkers?**

Plus a clickable pipeline diagram, a cohort table with surrogate IDs,
and hint pop-ups on every KPI card so the numbers self-explain.

## Files that make it go

| Role | File |
|------|------|
| UI (what you open) | `dashboard/index.html` |
| Data it reads | `dashboard/data/dashboard_data.json` |
| Demo generator | `dashboard/pipelines/generate_synthetic_dashboard_data.py` |
| Python production pipeline | `dashboard/pipelines/build_dashboard_data.py` |
| R production pipeline | `dashboard/pipelines/build_dashboard_data.R` |
| Context / glossary skill | `dashboard/context_skill/` |
| Deprecation of `redcap_audit.py` stub | `redcap/api/redcap_audit.py` → forwards |
| Archive | `archive/2026-04-17_dashboard_refactor/` |

## Documentation map

| Topic | Doc |
|-------|-----|
| How to open and read the dashboard | `docs/dashboard_guide.md` |
| How to run / schedule the pipeline | `docs/auto_update_pipeline.md` |
| How to keep the glossary honest | `docs/data_context_skill.md` |
| What was archived and why | `docs/archive_manifest.md` |

## Invariants worth remembering

* Python and R pipelines produce the **same JSON schema**, documented
  once in `dashboard/context_skill/references/dashboard_schema.md`.
* No PHI ever leaves the secure mount. The dashboard is group-level
  or surrogate-IDs only.
* The UI is pure HTML + Chart.js; no server required.
* Every archived file is reversible with one `cp`.
