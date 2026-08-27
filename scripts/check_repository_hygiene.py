#!/usr/bin/env python3
"""Fail when non-runtime archives or oversized artifacts enter the Git tree."""

from __future__ import annotations

import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MAX_TRACKED_FILE_BYTES = 20 * 1024 * 1024

FORBIDDEN_PREFIXES = (
    "ESD Lab Brand Files/",
    "archive/",
    "design-ideas/",
    "design-qa/",
    "reports/NANO_statistical_analysis_files/",
)
FORBIDDEN_PATHS = {
    "NANO_Dashboard_Docs_HowTo_Implementation_Prompt.md",
    "dashboard/app.js",
    "dashboard/index.html",
    "dashboard/primitives.js",
    "dashboard/styles.css",
    "design-qa.md",
    "reports/NANO_statistical_analysis.html",
    "scripts/parse_css.py",
}


def tracked_files() -> list[str]:
    completed = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=PROJECT_ROOT,
        check=True,
        capture_output=True,
    )
    return [
        item.decode("utf-8", errors="surrogateescape")
        for item in completed.stdout.split(b"\0")
        if item
    ]


def main() -> int:
    errors: list[str] = []
    total_bytes = 0
    paths = tracked_files()

    for relative_path in paths:
        if relative_path in FORBIDDEN_PATHS or relative_path.startswith(
            FORBIDDEN_PREFIXES
        ):
            errors.append(f"retired path is tracked: {relative_path}")

        path = PROJECT_ROOT / relative_path
        if not path.is_file():
            continue
        size = path.stat().st_size
        total_bytes += size
        if size > MAX_TRACKED_FILE_BYTES:
            errors.append(
                f"tracked file exceeds 20 MiB ({size / 1024 / 1024:.1f} MiB): "
                f"{relative_path}"
            )

    if errors:
        print("Repository hygiene check failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        f"Repository hygiene OK: {len(paths)} tracked files, "
        f"{total_bytes / 1024 / 1024:.1f} MiB in the working tree."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
