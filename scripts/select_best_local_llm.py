#!/usr/bin/env python3
"""Write the vetted no-API local GGUF model config."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.assistant.model_catalog import (  # noqa: E402
    DEFAULT_LLM_CONFIG_PATH,
    available_memory_gib,
    build_llm_config,
    free_disk_gib,
    model_fits_host,
    select_catalog_model,
    write_llm_config,
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tier",
        default=os.getenv("DASHBOARD_ASSISTANT_TIER", "auto"),
        help="Model tier to select: auto, tiny, balanced, accuracy, or quality.",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_LLM_CONFIG_PATH)
    parser.add_argument(
        "--print-json",
        action="store_true",
        help="Print the generated config instead of writing it.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    memory_gib = available_memory_gib()
    disk_gib = free_disk_gib(PROJECT_ROOT)
    selected = select_catalog_model(
        tier=args.tier,
        memory_gib=memory_gib,
        disk_free_gib=disk_gib,
    )
    config = build_llm_config(selected)

    if args.print_json:
        print(json.dumps(config, indent=2, ensure_ascii=True))
    else:
        write_llm_config(config, args.output)
        host_fit = model_fits_host(
            selected,
            memory_gib=memory_gib,
            disk_free_gib=disk_gib,
            include_disk=True,
        )
        print(
            "[ok] wrote "
            f"{args.output}: {config['repo_id']}:{config['filename']} "
            f"(tier={config['selected_tier']}, host_fit={host_fit})"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
