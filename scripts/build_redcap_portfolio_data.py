#!/usr/bin/env python3
"""Build the aggregate-only REDCap portfolio metadata artifact.

The output powers the Portfolio, Study Detail, Instrument Comparison, and Field
Explorer panels on ``/redcap``.  It describes how the eight REDCap projects are
built (instruments, events, fields) plus small-cell-suppressed completion
counts.  No participant identifier or response value is ever written.
"""

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
    write_json_atomic,
)
from redcap.api.portfolio_metadata import (  # noqa: E402
    FIELD_INDEX_FILENAME,
    split_field_index,
    sync_portfolio_metadata,
)

DEFAULT_CONFIG = PROJECT_ROOT / "config" / "redcap_projects.yml"
DEFAULT_OUTPUT = PROJECT_ROOT / "dashboard" / "data" / "redcap_portfolio.json"


def _load_dotenv() -> None:
    """Read repo-root credentials for local runs; CI injects real secrets."""

    try:
        from dotenv import load_dotenv
    except Exception:
        return
    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        load_dotenv(env_path, override=False)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
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
    _load_dotenv()

    try:
        config = load_portfolio_config(args.config)
        payload = sync_portfolio_metadata(config, require_all=args.require_all)
        summary, field_index = split_field_index(payload)
        output_path = write_json_atomic(summary, args.output)
        index_path = write_json_atomic(
            field_index, args.output.parent / FIELD_INDEX_FILENAME
        )
    except (PortfolioConfigError, PortfolioSyncError) as exc:
        logging.error("REDCap portfolio metadata build failed: %s", exc)
        return 1
    except OSError:
        logging.error("REDCap portfolio metadata build failed: output_write_error")
        return 1

    source = summary["source"]
    totals = summary["totals"]
    logging.info(
        "Wrote REDCap portfolio metadata to %s "
        "(%d/%d projects, %d instruments, %d fields)",
        output_path,
        source["projects_ok"],
        source["projects_total"],
        totals["instruments"],
        totals["fields"],
    )
    logging.info(
        "Wrote REDCap field index to %s (%d rows)",
        index_path,
        summary["field_index"]["rows"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
