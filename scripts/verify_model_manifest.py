#!/usr/bin/env python3
"""Re-verify every pinned model digest against the live registry.

A drifting tag is a silent model swap: ``qwen2.5:14b`` can point at different
weights next month, and nothing about the deployment would look different. This
turns that into a build failure.

    python scripts/verify_model_manifest.py
    python scripts/verify_model_manifest.py --local   # also check on-disk blobs
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.resolve_local_models import (  # noqa: E402
    MANIFEST_PATH,
    ResolutionError,
    fetch_manifest,
)

MODEL_MEDIA_TYPE = "application/vnd.ollama.image.model"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--local",
        action="store_true",
        help="also verify blobs present under models/ollama",
    )
    args = parser.parse_args(argv)

    if not MANIFEST_PATH.exists():
        print(
            "models/MANIFEST.json missing; run `make models-resolve` first",
            file=sys.stderr,
        )
        return 1

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    failures: list[str] = []

    for entry in manifest.get("models", []):
        ref = entry["ref"]
        name, _, tag = ref.partition(":")
        try:
            live = fetch_manifest(name, tag or "latest")
        except ResolutionError as exc:
            failures.append(f"{ref}: {exc}")
            continue
        layers = [
            lyr
            for lyr in live.get("layers", [])
            if lyr.get("mediaType") == MODEL_MEDIA_TYPE
        ]
        if not layers:
            failures.append(f"{ref}: no model layer in the live manifest")
            continue
        live_digest = layers[0]["digest"]
        if live_digest != entry["digest"]:
            failures.append(
                f"{ref}: DIGEST DRIFT\n    pinned {entry['digest']}\n    live   {live_digest}"
            )
            continue
        print(f"  ok  {ref:<28} {entry['digest'][:26]}…  {entry['license']}")

        if args.local:
            blob = (
                PROJECT_ROOT
                / "models"
                / "ollama"
                / "blobs"
                / live_digest.replace(":", "-")
            )
            if not blob.exists():
                failures.append(
                    f"{ref}: pinned blob not present at {blob.relative_to(PROJECT_ROOT)}"
                )

    if failures:
        print("\nFAILED:", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        return 1
    print(
        f"\n{len(manifest.get('models', []))} models verified against the live registry."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
