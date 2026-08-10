#!/usr/bin/env python3
"""Print the assistant's resolved provider failover order.

Answers "which backend will actually answer, and what happens when it fails"
without generating a token or printing a credential. ``--probe`` additionally
contacts each tier's model catalog, which is a non-billable reachability check.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.assistant.local_chat_assistant import AssistantConfig  # noqa: E402
from dashboard.assistant.provider import (  # noqa: E402
    ProviderError,
    build_provider,
    build_provider_chain,
)
from src.utils.env_loader import load_project_env  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--probe",
        action="store_true",
        help="Contact each tier's model catalog. Generates no text.",
    )
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    load_project_env()

    config = AssistantConfig.from_env()
    tiers = config.provider_configs()
    provider = build_provider_chain(tiers)
    status = provider.status()

    report = {
        "requested_order": list(config.resolved_chain()),
        "active_order": [tier.effective_label for tier in tiers],
        "state": status.get("state"),
        "active_tier": status.get("active_tier_label")
        or f"{status.get('provider')}:{status.get('model_id')}",
        "tiers": [
            {
                "order": index,
                "label": tier.effective_label,
                "provider": tier.normalized_provider,
                "family": tier.family,
                "api_base": tier.effective_api_base,
                "model": tier.model,
                "needs_key": tier.requires_api_key,
                "request_extras": tier.request_extras(),
            }
            for index, tier in enumerate(tiers)
        ],
    }

    if args.probe:
        for entry, tier in zip(report["tiers"], tiers):
            try:
                result = build_provider(tier).probe()
                entry["probe"] = {
                    "ok": True,
                    "models_returned": result.get("models_returned"),
                    "model_visible": result.get("model_visible"),
                }
            except ProviderError as exc:
                entry["probe"] = {"ok": False, "state": exc.state, "detail": str(exc)}
            except Exception as exc:  # noqa: BLE001
                entry["probe"] = {"ok": False, "detail": type(exc).__name__}

    if args.json:
        print(json.dumps(report, indent=2))
        return 0

    print("ESD Buddy provider failover order")
    print("=" * 68)
    print(f"  requested   {', '.join(report['requested_order']) or 'default'}")
    print(f"  active      {report['active_tier']}")
    print(f"  state       {report['state']}")
    print()

    if not report["tiers"]:
        print("  No usable tier. Set a Gemini or NVIDIA key, or enable the local tier.")
        return 1

    for entry in report["tiers"]:
        print(f"  [{entry['order']}] {entry['label']}")
        print(f"       endpoint  {entry['api_base']}")
        print(
            f"       family    {entry['family']}  (extras: {entry['request_extras']})"
        )
        probe = entry.get("probe")
        if probe is not None:
            if probe.get("ok"):
                print(
                    f"       probe     reachable, {probe.get('models_returned')} "
                    f"models served"
                )
            else:
                print(f"       probe     unavailable ({probe.get('state', 'error')})")
        print()

    print(f"  {len(report['tiers'])} tier(s) configured.")
    if len(report["tiers"]) == 1:
        print("  No backup tier. Add a second provider so one outage cannot")
        print("  take ESD Buddy offline.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
