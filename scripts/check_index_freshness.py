#!/usr/bin/env python3
"""Healthcheck for the indexer: is the manifest present and recent enough?

Used as the container healthcheck. "Running" is not the same as "producing", so
a builder whose manifest has gone stale reports unhealthy and autoheal restarts
it.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MANIFEST = PROJECT_ROOT / "dashboard" / "data" / "index_manifest.json"

#: Weekly rebuild plus a generous margin. Past this the index is not tracking
#: the corpus any more.
DEFAULT_MAX_AGE_SECONDS = 10 * 24 * 3600


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-age-seconds", type=int, default=DEFAULT_MAX_AGE_SECONDS)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    def say(message: str) -> None:
        if not args.quiet:
            print(message)

    if not MANIFEST.exists():
        say("index_manifest.json missing")
        return 1
    age = time.time() - MANIFEST.stat().st_mtime
    if age > args.max_age_seconds:
        say(
            f"index manifest is {age / 86400:.1f} d old (max {args.max_age_seconds / 86400:.1f} d)"
        )
        return 1
    say(f"index manifest is {age / 3600:.1f} h old")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
