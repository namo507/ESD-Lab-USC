"""DEPRECATED — moved to `scripts/generate_data_quality_report.py`.

Reason for archival
-------------------
This module duplicated ~90% of the functionality in
``scripts/generate_data_quality_report.py`` (both built the same
HTML QC report). To prevent two-source-of-truth bugs, the audit logic
was consolidated into the `scripts/` version. A full snapshot of the
original file is preserved at::

    archive/2026-04-17_dashboard_refactor/redcap_audit.py

Replacement
-----------
Use either::

    python scripts/generate_data_quality_report.py
    python dashboard/pipelines/build_dashboard_data.py

The dashboard pipeline's ``build_redcap_audit()`` function now owns
the aggregation logic (see
``dashboard/context_skill/references/qc_flags.md``).

This stub forwards any legacy invocation to the canonical script
so existing cron lines keep working.
"""
from __future__ import annotations

import runpy
import sys
import warnings
from pathlib import Path
from typing import Any

import pandas as pd


def compute_completeness(
    df: pd.DataFrame,
    events: list[str],
    required_fields_by_event: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    """Return event-level completeness stats for legacy callers and tests.

    The full REDCap audit script moved out of this module, but a small part of
    the old public surface is still used by tests and older call sites.
    """
    results: dict[str, Any] = {
        "by_event": {},
        "missing_records": [],
        "n_participants": df["record_id"].nunique(),
        "n_records": len(df),
        "n_events": len(events),
    }

    all_participants = df["record_id"].dropna().unique()

    for event in events:
        event_df = df[df["redcap_event_name"] == event]
        n_expected = len(all_participants)
        n_present = event_df["record_id"].nunique()
        missing_ids = set(all_participants) - set(event_df["record_id"].dropna().unique())

        if required_fields_by_event and event in required_fields_by_event:
            req_fields = [
                field for field in required_fields_by_event[event] if field in event_df.columns
            ]
            if req_fields:
                pct_complete = event_df[req_fields].notna().all(axis=1).mean() * 100
            else:
                pct_complete = float("nan")
        else:
            pct_complete = event_df.notna().mean().mean() * 100 if len(event_df) > 0 else 0.0

        results["by_event"][event] = {
            "n_expected": n_expected,
            "n_present": n_present,
            "n_missing": len(missing_ids),
            "pct_enrolled": round(n_present / n_expected * 100, 1) if n_expected else 0,
            "pct_complete": round(pct_complete, 1),
        }

        for participant_id in missing_ids:
            results["missing_records"].append(
                {"record_id": participant_id, "missing_event": event}
            )

    return results


def main() -> int:
    warnings.warn(
        "redcap/api/redcap_audit.py is deprecated — forwarding to "
        "scripts/generate_data_quality_report.py. Update your cron entries.",
        DeprecationWarning, stacklevel=2,
    )
    target = Path(__file__).resolve().parents[2] / "scripts" / "generate_data_quality_report.py"
    if not target.exists():
        print("[fatal] replacement script not found:", target, file=sys.stderr)
        return 2
    runpy.run_path(str(target), run_name="__main__")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
