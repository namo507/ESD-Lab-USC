#!/usr/bin/env python3
"""Indexer entrypoint: rebuild on corpus change, and on a weekly floor.

Polling rather than inotify, matching the dashboard server's own watch loop:
it keeps the runtime dependency surface small so the image stays reproducible,
and a rebuild that starts a few seconds late costs nothing.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.assistant.retrieval import (  # noqa: E402
    APPROVED_ARTIFACTS,
    APPROVED_ROOTS,
    build_index,
)

WEEKLY = 7 * 24 * 3600


def corpus_fingerprint() -> str:
    """Hash of every approved source's path, size, and mtime."""
    digest = hashlib.sha256()
    for rel, _ in APPROVED_ROOTS:
        base = PROJECT_ROOT / rel
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            if path.is_file():
                stat = path.stat()
                digest.update(f"{path}:{stat.st_size}:{int(stat.st_mtime)}".encode())
    for rel in APPROVED_ARTIFACTS:
        path = PROJECT_ROOT / rel
        if path.exists():
            stat = path.stat()
            digest.update(f"{path}:{stat.st_size}:{int(stat.st_mtime)}".encode())
    return digest.hexdigest()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--interval", type=int, default=120)
    parser.add_argument("--embed-base-url", default="http://ollama:11434")
    args = parser.parse_args(argv)

    def rebuild(reason: str) -> None:
        print(f"[indexer] rebuilding: {reason}", flush=True)
        try:
            manifest = build_index(embed_base_url=args.embed_base_url)
            print(
                f"[indexer] {manifest['chunks']} chunks in {manifest['duration_seconds']}s",
                flush=True,
            )
        except Exception as exc:  # noqa: BLE001
            # A failed rebuild leaves the previous index in place and in service.
            print(
                f"[indexer] rebuild failed, keeping previous index: {exc}", flush=True
            )

    rebuild("startup")
    if not args.watch:
        return 0

    fingerprint = corpus_fingerprint()
    last_full = time.time()
    while True:
        time.sleep(args.interval)
        current = corpus_fingerprint()
        if current != fingerprint:
            fingerprint = current
            rebuild("corpus changed")
            last_full = time.time()
        elif time.time() - last_full > WEEKLY:
            rebuild("weekly floor")
            last_full = time.time()


if __name__ == "__main__":
    raise SystemExit(main())
