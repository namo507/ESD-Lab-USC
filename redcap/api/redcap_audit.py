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
