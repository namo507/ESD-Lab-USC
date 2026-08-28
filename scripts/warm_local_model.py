#!/usr/bin/env python3
"""Load the serving model into memory and keep it there.

On the CPU tier a cold load costs roughly 45 seconds while the generation it
gates takes under two. That ratio makes residency the single largest speed lever
available, so the model is loaded deliberately at startup rather than lazily on
whichever unlucky visitor asks the first question.

    python scripts/warm_local_model.py
    python scripts/warm_local_model.py --check    # report residency, load nothing
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OLLAMA = os.environ.get("ESD_OLLAMA_URL", "http://127.0.0.1:11434")
DEFAULT_MODEL = os.environ.get("DASHBOARD_ASSISTANT_LOCAL_MODEL", "esd-buddy")
KEEP_ALIVE = os.environ.get("OLLAMA_KEEP_ALIVE", "24h")


def _post(path: str, payload: dict, timeout: int) -> dict | None:
    request = urllib.request.Request(
        f"{OLLAMA}{path}", data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            return json.load(response)
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None


def resident_models() -> list[dict]:
    """What Ollama currently holds in memory, as opposed to on disk."""
    try:
        with urllib.request.urlopen(f"{OLLAMA}/api/ps", timeout=10) as response:  # noqa: S310
            return json.load(response).get("models", [])
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return []


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--check", action="store_true", help="report residency without loading")
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args(argv)

    resident = {m.get("name", "").split(":")[0] for m in resident_models()}
    wanted = args.model.split(":")[0]

    if args.check:
        held = resident_models()
        if not held:
            print("  no model resident")
            return 1
        for m in held:
            gb = m.get("size", 0) / 1e9
            print(f"  {m.get('name'):<24} {gb:5.2f} GB resident, expires {m.get('expires_at', '?')[:19]}")
        return 0 if wanted in resident else 1

    if wanted in resident:
        print(f"  {args.model} already resident; refreshing keep_alive to {KEEP_ALIVE}")

    started = time.perf_counter()
    # An empty prompt loads the weights without spending tokens generating.
    out = _post("/api/generate", {"model": args.model, "keep_alive": KEEP_ALIVE, "prompt": ""}, args.timeout)
    if out is None:
        print(f"  FAILED to warm {args.model} at {OLLAMA}", file=sys.stderr)
        return 1
    elapsed = time.perf_counter() - started
    load = out.get("load_duration", 0) / 1e9

    # Verify, do not assume. A successful call is not proof of residency: with
    # OLLAMA_MAX_LOADED_MODELS at its limit the runtime can accept the request,
    # serve it, and evict the model again, which is exactly what happened when
    # benchmarking left other models loaded.
    held = {m.get("name", "").split(":")[0] for m in resident_models()}
    if wanted not in held:
        print(
            f"  {args.model} did not stay resident (currently: {', '.join(sorted(held)) or 'nothing'}).\n"
            f"  Raise OLLAMA_MAX_LOADED_MODELS or unload the models crowding it out.",
            file=sys.stderr,
        )
        return 1

    print(f"  warmed {args.model} in {elapsed:.1f}s (load {load:.1f}s), held for {KEEP_ALIVE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
