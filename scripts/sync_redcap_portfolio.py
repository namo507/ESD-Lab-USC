#!/usr/bin/env python3
"""Build the aggregate-only dashboard metrics artifact from eight REDCap projects."""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from redcap.api.multi_project import (  # noqa: E402
    PortfolioConfigError,
    PortfolioSyncError,
    load_portfolio_config,
    sync_portfolio,
    write_json_atomic,
)

DEFAULT_CONFIG = PROJECT_ROOT / "config" / "redcap_projects.yml"
DEFAULT_OUTPUT = PROJECT_ROOT / "dashboard" / "data" / "dashboard_metrics.json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Synchronize de-identified aggregate metrics from the REDCap portfolio."
        )
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG,
        help=f"Portfolio configuration path (default: {DEFAULT_CONFIG})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Atomic JSON output path (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--require-all",
        action="store_true",
        help="Fail without writing when any of the eight projects cannot sync.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    try:
        config = load_portfolio_config(args.config)
        payload = sync_portfolio(config, require_all=args.require_all)
        output_path = write_json_atomic(payload, args.output)
    except (PortfolioConfigError, PortfolioSyncError) as exc:
        logging.error("REDCap portfolio sync failed: %s", exc)
        return 1
    except OSError:
        logging.error("REDCap portfolio sync failed: output_write_error")
        return 1

    source = payload["source"]
    logging.info(
        "Wrote aggregate-only REDCap metrics to %s (%d/%d projects healthy)",
        output_path,
        source["projects_ok"],
        source["projects_total"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
