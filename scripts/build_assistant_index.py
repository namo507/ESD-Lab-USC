#!/usr/bin/env python3
"""Rebuild the assistant's retrieval index from the approved corpus.

    python scripts/build_assistant_index.py
    python scripts/build_assistant_index.py --sparse-only   # no embedding service

The build writes into a staging file and renames it over the live index, so a
query arriving mid-rebuild is served by the previous index right up to the
rename. There is no window in which a half-built index answers anything.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.assistant.retrieval import build_index  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--embed-base-url", default="http://127.0.0.1:11434")
    parser.add_argument(
        "--index-path",
        type=Path,
        default=None,
        help="Write somewhere other than the live index. Used by health checks, which "
        "must verify the build works without replacing a good index with a worse one.",
    )
    parser.add_argument(
        "--sparse-only",
        action="store_true",
        help="Build FTS5 only. Retrieval still works and gets measurably worse; "
        "the manifest records degraded=true so the status endpoint can say so.",
    )
    args = parser.parse_args(argv)

    try:
        kwargs = {"embed_base_url": None if args.sparse_only else args.embed_base_url}
        if args.index_path is not None:
            kwargs["index_path"] = args.index_path
        manifest = build_index(**kwargs)
    except Exception as exc:  # noqa: BLE001 - surfaced to the operator verbatim
        print(f"index build failed: {exc}", file=sys.stderr)
        return 1

    print(json.dumps({k: v for k, v in manifest.items() if k != "sources"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
