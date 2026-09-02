#!/usr/bin/env python3
"""Keep the browser-facing dashboard fixture in step with the runtime payload.

`web/public/dashboard/data/dashboard_data.json` is what a plain `vite build`
or `vite dev` serves at `/dashboard/data/dashboard_data.json`, which is the URL
`useStudyData` and `useRedcapData` fetch. The live runtime serves that same URL
from `dashboard/data/dashboard_data.json` instead, and the Pages build deletes
the fixture outright in favour of the privacy-validated public snapshots.

So the fixture only matters in previews -- and nothing regenerated it. It sat
two months behind the payload it mirrors, which meant every preview route, the
contrast probe included, rendered numbers the runtime had long since replaced.
Deriving it here, the way `build_lab_readings_index.py` derives
`web/lab-readings.json`, is what makes that drift impossible to miss.

    python scripts/sync_public_dashboard_fixture.py
    python scripts/sync_public_dashboard_fixture.py --check   # CI: fail on drift
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = PROJECT_ROOT / "dashboard" / "data" / "dashboard_data.json"
DEFAULT_TARGET = (
    PROJECT_ROOT / "web" / "public" / "dashboard" / "data" / "dashboard_data.json"
)


def _load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def render(payload: Any) -> str:
    """Serialize deterministically so a no-op refresh produces no diff."""
    return json.dumps(payload, indent=2, ensure_ascii=False, allow_nan=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET)
    parser.add_argument(
        "--check",
        action="store_true",
        help="report drift and exit non-zero instead of rewriting the fixture",
    )
    args = parser.parse_args(argv)

    if not args.source.exists():
        print(
            f"{args.source} is missing; run `make dashboard-refresh` first",
            file=sys.stderr,
        )
        return 1

    try:
        payload = _load(args.source)
    except json.JSONDecodeError as exc:
        print(f"{args.source} is not valid JSON: {exc}", file=sys.stderr)
        return 1

    expected = render(payload)
    current = args.target.read_text(encoding="utf-8") if args.target.exists() else None

    if current == expected:
        print(f"public dashboard fixture is in sync with {_rel(args.source)}")
        return 0

    if args.check:
        source_stamp = (payload.get("meta") or {}).get("generated_at", "unknown")
        target_stamp = "absent"
        if current is not None:
            try:
                target_stamp = (json.loads(current).get("meta") or {}).get(
                    "generated_at", "unknown"
                )
            except json.JSONDecodeError:
                target_stamp = "unreadable"
        print(
            f"{_rel(args.target)} has drifted from {_rel(args.source)}\n"
            f"  runtime payload generated_at: {source_stamp}\n"
            f"  browser fixture generated_at: {target_stamp}\n"
            "  run `python scripts/sync_public_dashboard_fixture.py` to refresh",
            file=sys.stderr,
        )
        return 1

    args.target.parent.mkdir(parents=True, exist_ok=True)
    args.target.write_text(expected, encoding="utf-8")
    print(f"wrote {_rel(args.target)} from {_rel(args.source)}")
    return 0


def _rel(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


if __name__ == "__main__":
    raise SystemExit(main())
