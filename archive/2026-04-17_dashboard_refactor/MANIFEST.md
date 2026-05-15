# Archive Manifest — 2026-04-17 Dashboard Refactor

Every file archived during the dashboard consolidation. Each entry
lists **what** was archived, **why**, and the **replacement** path so
any historical invocation can be re-routed.

## Scope

This archive is conservative: we keep a full copy of the original file
(unchanged) so the refactor is reversible. The live location (the same
file in the repo) is replaced with a small **deprecation stub** that
forwards to the canonical replacement, so no existing cron, CI
pipeline, or README instruction breaks.

## Inventory

| Original path | Replacement path | Reason | Date | Reviewer |
|---------------|------------------|--------|------|----------|
| `redcap/api/redcap_audit.py` | `scripts/generate_data_quality_report.py` + `dashboard/pipelines/build_dashboard_data.py::build_redcap_audit()` | Duplicated ~90% of QC-report logic with `scripts/generate_data_quality_report.py`; the two drifted out of sync. Consolidated into the script-side module. | 2026-04-17 | claude |

## Restoration procedure

If any archived file needs to come back:

```bash
cp archive/2026-04-17_dashboard_refactor/<filename> redcap/api/<filename>
```

Then update the header docstring to remove the deprecation notice and
re-add the file to the cron (`scripts/redcap_daily_sync.py` still
expects it only through the deprecation stub, so cron will keep
running either way).

## What was NOT archived

The following files were reviewed and **kept in place** because they
are not duplicates:

* `redcap/api/redcap_pull.py` — production REDCap pull (PyCap) used by
  the daily cron. Still canonical.
* `redcap/api/redcap_push.py` — writes annotations back to REDCap.
  Unique; no duplicate exists.
* `redcap/api/redcap_r_pull.R` — R-side pull used by statisticians
  working in RMarkdown. Intentionally separate language surface.
* `scripts/generate_data_quality_report.py` — replacement for the
  archived audit module. Kept and now the sole owner of the QC HTML
  report.

## Review + ownership

* Reviewer: Research Programmer
* Approver (pending): PI (Dr. Bradshaw)
* Next review: after one full cron cycle (2026-04-25)
