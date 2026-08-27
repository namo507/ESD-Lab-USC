#!/usr/bin/env python3
"""Report on the single ``.env`` file without revealing any secret value.

Answers the questions that matter when credentials are spread across a team:
is the one file present, is it readable only by its owner, which documented
keys are still blank, which keys are set but undocumented, and are there stray
side files still holding credentials that nothing loads.

Secret-shaped values are always masked. ``--json`` emits the same report for
scripting, and ``--require`` fails the command when named keys are unset, which
is what makes this usable as a pre-flight gate in the Makefile.
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

from src.utils.env_loader import (  # noqa: E402
    ENV_PATH,
    ENV_TEMPLATE_PATH,
    env_report,
    is_secret_key,
    mask,
    read_env_file,
)

# The eight REDCap project tokens the portfolio sync needs to report 8/8 healthy.
REDCAP_TOKEN_KEYS = (
    "REDCAP_ABC_SURVEYS_TOKEN",
    "REDCAP_IPSA_SURVEYS_TOKEN",
    "REDCAP_ACTION_TOKEN",
    "REDCAP_IPSA_LAB_TOKEN",
    "REDCAP_ABC_LAB_TOKEN",
    "REDCAP_NICO_TOKEN",
    "REDCAP_NANO_SURVEYS_TOKEN",
    "REDCAP_NANO_LAB_TOKEN",
)

# At least one assistant tier must be usable or ESD Buddy has nothing to call.
ASSISTANT_TIER_KEYS = (
    "DASHBOARD_ASSISTANT_GEMINI_API_KEY",
    "DASHBOARD_ASSISTANT_API_KEY",
    "DASHBOARD_ASSISTANT_LOCAL_ENABLED",
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Emit the report as JSON.")
    parser.add_argument(
        "--require",
        action="append",
        default=[],
        metavar="KEY",
        help="Fail when this key is unset or blank. Repeatable.",
    )
    parser.add_argument(
        "--require-redcap",
        action="store_true",
        help="Fail unless all eight REDCap project tokens are set.",
    )
    parser.add_argument(
        "--require-assistant",
        action="store_true",
        help="Fail unless at least one assistant provider tier is usable.",
    )
    parser.add_argument(
        "--show-values",
        action="store_true",
        help="Print non-secret values. Secrets stay masked either way.",
    )
    return parser


def _print_human(report: dict, values: dict[str, str], show_values: bool) -> None:
    print("ESD Lab environment report")
    print("=" * 60)
    print(f"  file          {report['env_path']}")
    print(f"  present       {'yes' if report['env_present'] else 'NO'}")
    print(f"  permissions   {report['env_mode'] or 'n/a'}")
    print(f"  template      {report['template_path']}")
    print(
        f"  keys          {report['configured_keys']} configured "
        f"of {len(values)} present, {report['documented_keys']} documented"
    )

    print("\nREDCap project tokens")
    for key in REDCAP_TOKEN_KEYS:
        value = values.get(key, "")
        state = "set" if value.strip() else "MISSING"
        print(f"  {state:8s} {key:32s} {mask(value) if value.strip() else ''}")

    print("\nAssistant provider tiers")
    gemini = values.get("DASHBOARD_ASSISTANT_GEMINI_API_KEY", "").strip()
    nvidia = values.get("DASHBOARD_ASSISTANT_API_KEY", "").strip()
    local = values.get("DASHBOARD_ASSISTANT_LOCAL_ENABLED", "").strip().lower()
    chain = values.get("DASHBOARD_ASSISTANT_FALLBACK_CHAIN", "").strip()
    print(f"  gemini    {'ready' if gemini else 'no key'}")
    print(f"  nvidia    {'ready' if nvidia else 'no key'}")
    print(f"  local     {'enabled' if local in {'1', 'true', 'yes', 'on'} else 'off'}")
    print(f"  order     {chain or 'default (primary first, then remaining tiers)'}")

    if report["blank_keys"]:
        print(f"\nBlank keys ({len(report['blank_keys'])})")
        for key in report["blank_keys"]:
            print(f"  {key}")

    if report["missing_from_env"]:
        print(f"\nDocumented but absent from .env ({len(report['missing_from_env'])})")
        for key in report["missing_from_env"]:
            print(f"  {key}")

    if report["undocumented_keys"]:
        print(f"\nSet but not in .env.example ({len(report['undocumented_keys'])})")
        for key in report["undocumented_keys"]:
            print(f"  {key}")

    if report["stray_files"]:
        print("\nStray credential files -- nothing loads these; fold in and delete")
        for path in report["stray_files"]:
            print(f"  {path}")

    if show_values:
        print("\nValues (secrets masked)")
        for key, value in sorted(values.items()):
            print(f"  {key:44s} {mask(value) if is_secret_key(key) else value}")


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if not ENV_PATH.is_file():
        print(f"ERROR: {ENV_PATH} not found. Copy {ENV_TEMPLATE_PATH.name} to .env.")
        return 1

    report = env_report()
    values = read_env_file()

    required = list(args.require)
    if args.require_redcap:
        required.extend(REDCAP_TOKEN_KEYS)

    failures = [key for key in required if not values.get(key, "").strip()]

    if args.require_assistant and not any(
        values.get(key, "").strip().lower() not in {"", "false", "0", "no", "off"}
        for key in ASSISTANT_TIER_KEYS
    ):
        failures.append("<no usable assistant provider tier>")

    if args.json:
        print(json.dumps({**report, "failures": failures}, indent=2))
    else:
        _print_human(report, values, args.show_values)
        if report["env_mode"] not in {"0o600", "0o400"}:
            print(
                f"\nWARNING: {ENV_PATH} is {report['env_mode']}; "
                "run `chmod 600 .env` so only you can read it."
            )
        if failures:
            print("\nFAILED required checks:")
            for key in failures:
                print(f"  {key}")
        else:
            print("\nAll requested checks passed.")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
