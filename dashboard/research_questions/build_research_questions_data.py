"""
Build / refresh the research-questions JSON payload for the dashboard.

This pipeline is the single source of truth bridge between:

    dashboard/research_questions/research_questions.md   (human-editable SOP)
    dashboard/research_questions/research_questions.json (dashboard-consumed payload)
    dashboard/data/dashboard_data.json (embedded rollup block)

What it does
------------
1. Loads the canonical JSON catalog (questions + metadata).
2. Validates required fields on every question.
3. Recomputes rollups (by_category, by_type_tag, by_status, by_priority)
   so the JSON is always internally consistent.
4. Writes the refreshed JSON back atomically.
5. If invoked with --embed, injects a condensed `research_questions`
   block into dashboard/data/dashboard_data.json so the live dashboard
   has everything it needs in a single fetch.

Design notes
------------
* Pure standard library + PyYAML-free: keeps the nightly runtime
  image small and avoids version drift.
* Atomic write via tempfile + os.replace so partial failures never
  leave the UI reading a half-written payload.
* Exit code is non-zero on validation failure — suitable for CI.

Usage
-----
    python dashboard/research_questions/build_research_questions_data.py
    python dashboard/research_questions/build_research_questions_data.py --check
    python dashboard/research_questions/build_research_questions_data.py --embed
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #

HERE = Path(__file__).resolve().parent
CATALOG = HERE / "research_questions.json"
SOP = HERE / "research_questions.md"
DASHBOARD_DATA = HERE.parent / "data" / "dashboard_data.json"

# --------------------------------------------------------------------------- #
# Controlled vocabularies — must mirror research_questions.md
# --------------------------------------------------------------------------- #

CATEGORIES = {
    "Dataset Structure",
    "Clinical Assessments",
    "Missing Data",
    "ML Targets",
    "Statistical Modeling",
    "Data Harmonization",
    "NDA Compliance",
    "Reproducibility",
}

TYPE_TAGS = {
    "Data Infrastructure",
    "Data Cleaning",
    "Data Harmonization",
    "ML Pipeline",
    "Statistical Modeling",
    "Feature Engineering",
    "NDA Compliance",
    "Manuscript Writing",
}

STATUS_VALUES = {"open", "in_progress", "blocked", "resolved"}
PRIORITY_VALUES = {"critical", "high", "medium", "low"}

REQUIRED_FIELDS = (
    "id",
    "category",
    "type_tag",
    "status",
    "priority",
    "question",
    "summary",
    "implementation",
    "assets",
    "widgets",
)

# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def load_catalog(path: Path = CATALOG) -> dict[str, Any]:
    """Load the canonical JSON catalog, failing fast on malformed JSON."""
    if not path.exists():
        raise FileNotFoundError(f"Missing research questions catalog: {path}")
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def validate(catalog: dict[str, Any]) -> list[str]:
    """Return a list of validation issues. Empty list == clean."""
    issues: list[str] = []
    qs = catalog.get("questions", [])
    if not qs:
        issues.append("No questions found in catalog.")
        return issues

    seen_ids: set[str] = set()
    for q in qs:
        rid = q.get("id", "<missing id>")

        for field in REQUIRED_FIELDS:
            if field not in q:
                issues.append(f"{rid}: missing required field '{field}'")

        if rid in seen_ids:
            issues.append(f"Duplicate id: {rid}")
        seen_ids.add(rid)

        if q.get("category") not in CATEGORIES:
            issues.append(f"{rid}: bad category {q.get('category')!r}")
        if q.get("type_tag") not in TYPE_TAGS:
            issues.append(f"{rid}: bad type_tag {q.get('type_tag')!r}")
        if q.get("status") not in STATUS_VALUES:
            issues.append(f"{rid}: bad status {q.get('status')!r}")
        if q.get("priority") not in PRIORITY_VALUES:
            issues.append(f"{rid}: bad priority {q.get('priority')!r}")

        if not isinstance(q.get("assets", []), list):
            issues.append(f"{rid}: assets must be a list")
        if not isinstance(q.get("widgets", []), list):
            issues.append(f"{rid}: widgets must be a list")

    return issues


def compute_rollups(catalog: dict[str, Any]) -> dict[str, dict[str, int]]:
    """Count questions by category, type_tag, status, priority."""
    qs = catalog["questions"]
    rollups = {
        "by_category": {k: 0 for k in sorted(CATEGORIES)},
        "by_type_tag": {k: 0 for k in sorted(TYPE_TAGS)},
        "by_status": {k: 0 for k in sorted(STATUS_VALUES)},
        "by_priority": {k: 0 for k in sorted(PRIORITY_VALUES)},
    }
    rollups["by_category"].update(Counter(q["category"] for q in qs))
    rollups["by_type_tag"].update(Counter(q["type_tag"] for q in qs))
    rollups["by_status"].update(Counter(q["status"] for q in qs))
    rollups["by_priority"].update(Counter(q["priority"] for q in qs))
    return rollups


def compute_matrix(catalog: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Build a Category × Type-tag heatmap payload.

    Returns a list of {category, type_tag, count, ids[]} rows — easier
    for Chart.js + the card grid than a 2-D array.
    """
    pairs: dict[tuple[str, str], list[str]] = {}
    for q in catalog["questions"]:
        key = (q["category"], q["type_tag"])
        pairs.setdefault(key, []).append(q["id"])

    matrix = [
        {
            "category": cat,
            "type_tag": tag,
            "count": len(ids),
            "ids": sorted(ids),
        }
        for (cat, tag), ids in pairs.items()
    ]
    matrix.sort(key=lambda r: (r["category"], r["type_tag"]))
    return matrix


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    """Write JSON atomically so the dashboard never reads a torn file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=str(path.parent),
        delete=False,
        suffix=".tmp",
    ) as tmp:
        json.dump(payload, tmp, indent=2, ensure_ascii=False)
        tmp.write("\n")
        tmp_name = tmp.name
    os.replace(tmp_name, path)


def embed_into_dashboard(
    catalog: dict[str, Any],
    path: Path = DASHBOARD_DATA,
) -> None:
    """Inject a condensed rollup block into dashboard_data.json."""
    if not path.exists():
        # Synthetic / production pipelines recreate this file; nothing to do.
        return

    with path.open("r", encoding="utf-8") as fh:
        dash = json.load(fh)

    dash["research_questions"] = {
        "meta": catalog["meta"],
        "questions": catalog["questions"],
        "rollups": catalog["rollups"],
        "matrix": catalog["matrix"],
    }
    atomic_write_json(path, dash)


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate only; do not rewrite the JSON.",
    )
    parser.add_argument(
        "--embed",
        action="store_true",
        help="Also embed the rollup block into dashboard_data.json.",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=CATALOG,
        help="Path to research_questions.json (default: repo location).",
    )
    args = parser.parse_args(argv)

    catalog = load_catalog(args.catalog)

    issues = validate(catalog)
    if issues:
        for msg in issues:
            print(f"[invalid] {msg}", file=sys.stderr)
        return 2

    catalog["rollups"] = compute_rollups(catalog)
    catalog["matrix"] = compute_matrix(catalog)
    catalog["meta"]["last_updated"] = datetime.now(timezone.utc).date().isoformat()
    catalog["meta"]["total_questions"] = len(catalog["questions"])

    if args.check:
        print(f"OK  · {len(catalog['questions'])} questions validated")
        return 0

    atomic_write_json(args.catalog, catalog)
    print(f"wrote {args.catalog} ({len(catalog['questions'])} questions)")

    if args.embed:
        embed_into_dashboard(catalog)
        print(f"embedded rollup into {DASHBOARD_DATA}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
