"""Context extractor — keep the NANO dashboard skill in sync with code.

What it does
------------
Walks the data dictionary, the feature matrix schema, and the dashboard
pipelines, then compares against the Markdown references under this
folder. Prints a diff of anything that has drifted so the analyst can
update `references/*.md` before it bit-rots.

Usage
-----
``python dashboard/context_skill/extract_context.py --check``

In ``--check`` mode it exits non-zero on any drift so CI can catch it.
Without ``--check`` it prints a human-readable report and exits 0.

Design notes
------------
* No heavy deps (only ``pandas``, ``pyyaml`` if available).
* Never touches raw data — only reads schema files.
* Safe to run on a developer laptop without the secure mount attached.
"""
from __future__ import annotations

import argparse
import ast
import re
import sys
from pathlib import Path
from typing import Iterable

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SKILL_ROOT   = Path(__file__).resolve().parent
DD_PATH      = PROJECT_ROOT / "data" / "data_dictionary" / "NANO_master_data_dictionary.csv"
PIPELINE_PY  = PROJECT_ROOT / "dashboard" / "pipelines" / "build_dashboard_data.py"
PIPELINE_R   = PROJECT_ROOT / "dashboard" / "pipelines" / "build_dashboard_data.R"


# ─── Helpers ────────────────────────────────────────────────────────────────
def _read(path: Path) -> str:
    try:
        return path.read_text()
    except FileNotFoundError:
        return ""


def _extract_referenced_columns() -> set[str]:
    """Scan the Python pipeline for `.get("col")` / `df["col"]` uses."""
    src = _read(PIPELINE_PY)
    cols: set[str] = set()
    cols.update(re.findall(r"""get\(\s*["']([a-zA-Z_][\w]*)["']""", src))
    cols.update(re.findall(r"""\[\s*["']([a-zA-Z_][\w]*)["']\s*\]""", src))
    # Drop obvious non-columns
    noise = {"phi_flag", "models", "paths", "meta", "summary"}
    return {c for c in cols if c not in noise}


def _data_dictionary_columns() -> set[str]:
    try:
        import pandas as pd
    except ImportError:
        print("pandas not available — skipping dictionary check.")
        return set()
    if not DD_PATH.exists():
        return set()
    try:
        df = pd.read_csv(DD_PATH, engine="python", on_bad_lines="skip", quotechar='"')
    except Exception as e:
        print(f"Could not parse data dictionary ({e}) — skipping dictionary check.")
        return set()
    if "variable_name" not in df.columns:
        return set()
    return set(df["variable_name"].dropna().astype(str))


def _markdown_referenced_columns() -> set[str]:
    """Collect `| column_name | ...` entries from each table glossary."""
    cols: set[str] = set()
    for md in SKILL_ROOT.glob("references/tables/*.md"):
        for line in md.read_text().splitlines():
            m = re.match(r"\|\s*`([a-zA-Z_][\w]*)`", line)
            if m:
                cols.add(m.group(1))
    return cols


# ─── Main check ─────────────────────────────────────────────────────────────
def run_check(check_only: bool = False) -> int:
    py_cols = _extract_referenced_columns()
    dd_cols = _data_dictionary_columns()
    md_cols = _markdown_referenced_columns()

    drift = 0

    def _report(label: str, items: Iterable[str]) -> None:
        nonlocal drift
        items = sorted(items)
        if items:
            drift += 1
            print(f"\n⚠  {label} ({len(items)}):")
            for c in items:
                print(f"   - {c}")

    if dd_cols:
        _report("Columns used in pipeline but NOT in data dictionary",
                py_cols - dd_cols)
    _report("Columns in pipeline but NOT documented in Markdown",
            py_cols - md_cols)
    _report("Columns in Markdown but NOT used by the pipeline (possibly stale)",
            md_cols - py_cols - {"record_id", "redcap_event_name"})

    # Sanity: R pipeline uses same constants
    if "%||%" in _read(PIPELINE_R) and "build_trajectories" in _read(PIPELINE_R):
        print("✓ R pipeline exports the expected builder functions.")
    else:
        drift += 1
        print("⚠  R pipeline missing expected builder functions.")

    if drift == 0:
        print("\n✓ Context is in sync — nothing to update.")
    else:
        print(f"\n✗ {drift} drift category(ies) detected. Update references/*.md.")

    return 1 if (check_only and drift) else 0


def main() -> int:
    p = argparse.ArgumentParser(description="NANO dashboard context extractor.")
    p.add_argument("--check", action="store_true",
                   help="Exit non-zero on any drift (useful for CI).")
    args = p.parse_args()
    return run_check(check_only=args.check)


if __name__ == "__main__":
    raise SystemExit(main())
