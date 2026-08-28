#!/usr/bin/env python3
"""Continuously refresh REDCap-backed artifacts and assistant grounding.

This is the local automation loop for keeping the dashboard and Buddy current
as records change in REDCap. Each cycle runs the full aggregate-only flow:

1) sync portfolio metrics from all configured REDCap projects
2) rebuild REDCap project metadata artifact
3) refresh structural REDCap dictionary snapshot
4) rebuild dashboard aggregate payload
5) refresh reading index payload used by the web shell
6) reindex assistant grounding corpus

Optional: run assistant evaluation fixtures each cycle.

Examples:
  python scripts/redcap_sync_watch.py --interval 900
  python scripts/redcap_sync_watch.py --once
  python scripts/redcap_sync_watch.py --interval 600 --with-eval
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable or "python3"


@dataclass(frozen=True)
class Step:
    name: str
    args: tuple[str, ...]


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")


def _run_step(step: Step) -> None:
    command = [PYTHON, *step.args]
    print(f"[{_timestamp()}] {step.name}")
    completed = subprocess.run(command, cwd=PROJECT_ROOT, check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"step_failed:{step.name}")


def _build_steps(*, with_eval: bool) -> list[Step]:
    steps = [
        Step(
            name="Sync REDCap portfolio aggregates",
            args=("scripts/sync_redcap_portfolio.py", "--require-all"),
        ),
        Step(
            name="Build REDCap portfolio metadata",
            args=("scripts/build_redcap_portfolio_data.py", "--require-all"),
        ),
        Step(
            name="Refresh REDCap dictionary",
            args=("scripts/sync_redcap_dictionary.py",),
        ),
        Step(
            name="Build dashboard aggregate payload",
            args=(
                "dashboard/pipelines/build_dashboard_data.py",
                "--bootstrap-demo-inputs",
                "--fallback-synthetic",
            ),
        ),
        Step(
            name="Refresh web readings index",
            args=("scripts/build_lab_readings_index.py",),
        ),
        Step(
            name="Reindex assistant grounding",
            args=("scripts/prepare_dashboard_assistant.py", "--reindex"),
        ),
    ]
    if with_eval:
        steps.append(
            Step(
                name="Run assistant routing/refusal/citation eval",
                args=("scripts/run_assistant_eval.py",),
            )
        )
    return steps


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--interval",
        type=int,
        default=900,
        help="Seconds between cycles (default: 900).",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run one cycle and exit.",
    )
    parser.add_argument(
        "--with-eval",
        action="store_true",
        help="Run assistant eval fixtures at the end of each cycle.",
    )
    parser.add_argument(
        "--continue-on-error",
        action="store_true",
        help="Log failed cycles and continue looping.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    if args.interval <= 0:
        raise SystemExit("interval must be > 0")

    steps = _build_steps(with_eval=args.with_eval)
    cycle = 0

    while True:
        cycle += 1
        print(f"\n[{_timestamp()}] starting sync cycle {cycle}")
        try:
            for step in steps:
                _run_step(step)
            print(f"[{_timestamp()}] cycle {cycle} complete")
        except RuntimeError as exc:
            print(f"[{_timestamp()}] cycle {cycle} failed: {exc}", file=sys.stderr)
            if not args.continue_on_error:
                return 1

        if args.once:
            return 0

        print(f"[{_timestamp()}] sleeping {args.interval}s")
        time.sleep(args.interval)


if __name__ == "__main__":
    raise SystemExit(main())
