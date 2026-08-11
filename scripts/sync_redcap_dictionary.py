#!/usr/bin/env python3
"""Export the structural REDCap data dictionary for every configured project.

Reuses the portfolio's project configuration and its hardened API client, so
tokens are read from the same environment variables and never logged.

The artifact describes instrument *structure* only. Verbatim item text is not
exported (the labels belong to licensed assessments), and fields REDCap flags
as direct identifiers are withheld with only a count retained. See
``redcap/api/dictionary.py`` for the reasoning.
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

from redcap.api.dictionary import (  # noqa: E402
    build_dictionary_payload,
    build_project_dictionary,
)
from redcap.api.multi_project import (  # noqa: E402
    PortfolioConfigError,
    RedcapApiClient,
    RedcapRequestError,
    load_portfolio_config,
    write_json_atomic,
)
from src.utils.env_loader import load_project_env  # noqa: E402

DEFAULT_CONFIG = PROJECT_ROOT / "config" / "redcap_projects.yml"
DEFAULT_OUTPUT = PROJECT_ROOT / "dashboard" / "data" / "redcap_dictionary.json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
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
        logging.error("REDCap dictionary sync failed: %s", exc)
        return 1

    api_url = os.environ.get(config.api_url_env, "").strip()
    if not api_url:
        logging.error("REDCap dictionary sync failed: missing %s", config.api_url_env)
        return 1

    projects: list[dict] = []
    failures = 0

    for spec in config.projects:
        token = os.environ.get(spec.token_env, "").strip()
        if not token:
            # Name the variable, never the value.
            logging.warning("Skipping %s: %s is not set", spec.key, spec.token_env)
            projects.append(
                {"key": spec.key, "study": spec.study, "error": "missing_token"}
            )
            failures += 1
            continue

        client = RedcapApiClient(
            api_url,
            token,
            timeout_seconds=config.timeout_seconds,
            retries=config.retries,
            backoff_seconds=config.backoff_seconds,
        )

        logging.info("Reading dictionary for %s", spec.key)
        try:
            instruments = client._post({"content": "instrument"})
            metadata = client._post({"content": "metadata"})
        except RedcapRequestError as exc:
            # exc carries a stable code only; REDCap bodies never reach the log.
            logging.warning("Dictionary read failed for %s: %s", spec.key, exc.code)
            projects.append({"key": spec.key, "study": spec.study, "error": exc.code})
            failures += 1
            continue

        entry = build_project_dictionary(
            key=spec.key,
            study=spec.study,
            project_id=spec.expected_project_id,
            title=spec.expected_title,
            instruments=instruments if isinstance(instruments, list) else [],
            metadata=metadata if isinstance(metadata, list) else [],
        )
        projects.append(entry)
        logging.info(
            "%s: %d instruments, %d fields (%d identifier fields withheld)",
            spec.key,
            entry["instruments_total"],
            entry["fields_total"],
            entry["identifier_fields_withheld"],
        )

    if failures and args.require_all:
        logging.error(
            "REDCap dictionary sync incomplete: %d project(s) failed", failures
        )
        return 1

    payload = build_dictionary_payload(projects)
    try:
        output_path = write_json_atomic(payload, args.output)
    except OSError:
        logging.error("REDCap dictionary sync failed: output_write_error")
        return 1

    logging.info(
        "Wrote structural dictionary to %s (%d/%d projects, %d instruments, %d fields)",
        output_path,
        payload["projects_ok"],
        payload["projects_total"],
        payload["instruments_total"],
        payload["fields_total"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
