#!/usr/bin/env python3
"""Build the REDCap metadata watcher artifact for the dashboard website.

Reads every configured REDCap project through export-only calls and publishes
one aggregate artifact describing instrument structure, event wiring, and form
completion across the portfolio. See ``redcap/api/portfolio_metadata.py`` for
the read-only, no-item-text, and small-cell guarantees this build enforces.

    python scripts/build_redcap_portfolio_data.py
    python scripts/build_redcap_portfolio_data.py --require-all
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path
from typing import Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from redcap.api.multi_project import (  # noqa: E402
    PortfolioConfigError,
    RedcapApiClient,
    RedcapRequestError,
    load_portfolio_config,
    write_json_atomic,
)
from redcap.api.portfolio_metadata import (  # noqa: E402
    ProjectSnapshot,
    ReadOnlyRedcapClient,
    ReadOnlyViolation,
    RequestPacer,
    assert_no_tokens,
    build_metadata_payload,
    fetch_project_snapshot,
)
from src.utils.env_loader import load_project_env  # noqa: E402

DEFAULT_CONFIG = PROJECT_ROOT / "config" / "redcap_projects.yml"
DEFAULT_OUTPUT = PROJECT_ROOT / "dashboard" / "data" / "redcap_portfolio.json"

# The metadata pass runs alongside the scheduled enrollment sync. Pacing its
# calls keeps the two from arriving at REDCap as one burst.
DEFAULT_MIN_INTERVAL_SECONDS = 1.25


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--min-interval-seconds",
        type=float,
        default=DEFAULT_MIN_INTERVAL_SECONDS,
        help="Floor on the interval between outbound REDCap calls.",
    )
    parser.add_argument(
        "--require-all",
        action="store_true",
        help="Fail without writing when any project cannot be read.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    load_project_env()

    try:
        config = load_portfolio_config(args.config)
    except PortfolioConfigError as exc:
        logging.error("REDCap metadata build failed: %s", exc)
        return 1

    api_url = os.environ.get(config.api_url_env, "").strip()
    if not api_url.startswith(("https://", "http://")):
        logging.error("REDCap metadata build failed: missing %s", config.api_url_env)
        return 1

    pacer = RequestPacer(args.min_interval_seconds)
    snapshots: list[ProjectSnapshot] = []
    tokens: list[str] = []

    for spec in config.projects:
        token = os.environ.get(spec.token_env, "").strip()
        if not token:
            # Name the variable that is missing, never the value it should hold.
            logging.warning("Skipping %s: %s is not set", spec.key, spec.token_env)
            snapshots.append(
                ProjectSnapshot(spec=spec, status="error", error_code="missing_token")
            )
            continue
        tokens.append(token)

        client = ReadOnlyRedcapClient(
            RedcapApiClient(
                api_url,
                token,
                timeout_seconds=config.timeout_seconds,
                retries=config.retries,
                backoff_seconds=config.backoff_seconds,
            ),
            pacer=pacer,
        )

        logging.info("Reading REDCap metadata for %s", spec.key)
        try:
            snapshot = fetch_project_snapshot(spec, client)
        except (RedcapRequestError, ReadOnlyViolation) as exc:
            # Every project fails independently and carries only a stable code.
            code = getattr(exc, "code", None) or str(exc)
            logging.warning("Metadata read failed for %s: %s", spec.key, code)
            snapshots.append(
                ProjectSnapshot(spec=spec, status="error", error_code=str(code))
            )
            continue
        except Exception:
            logging.warning("Metadata read failed for %s: internal_error", spec.key)
            snapshots.append(
                ProjectSnapshot(spec=spec, status="error", error_code="internal_error")
            )
            continue

        snapshots.append(snapshot)
        logging.info(
            "%s: %d instruments, %d fields, %d events (%d identifier fields withheld)",
            spec.key,
            len(snapshot.instruments),
            len(snapshot.fields),
            len(snapshot.events),
            snapshot.identifier_fields_withheld,
        )

    failures = sum(1 for snapshot in snapshots if not snapshot.ok)
    if failures and args.require_all:
        logging.error(
            "REDCap metadata build incomplete: %d project(s) failed", failures
        )
        return 1

    payload = build_metadata_payload(config, snapshots)

    try:
        assert_no_tokens(payload, tokens)
    except ReadOnlyViolation:
        logging.error("REDCap metadata build failed: token_in_payload")
        return 1

    try:
        output_path = write_json_atomic(payload, args.output)
    except OSError:
        logging.error("REDCap metadata build failed: output_write_error")
        return 1

    logging.info(
        "Wrote REDCap metadata watcher artifact to %s "
        "(%d/%d projects, %d instruments, %d fields)",
        output_path,
        payload["projects_ok"],
        payload["projects_total"],
        payload["instruments_total"],
        payload["fields_total"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
