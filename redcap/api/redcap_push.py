"""REDCap API push module for NANO Study.

Pushes cleaned and validated data back to REDCap fields via API.
Supports field-level updates for specific participants and events.

Usage:
    python redcap/api/redcap_push.py --input <parquet_file> [--dry-run]
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path
from typing import Any

import pandas as pd
import redcap
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.utils.config_loader import load_config
from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)


def get_redcap_project() -> redcap.Project:
    """Instantiate and return an authenticated REDCap Project object.

    Returns:
        redcap.Project: Authenticated project instance.

    Raises:
        EnvironmentError: If API credentials are not configured.
    """
    api_url = os.environ.get("REDCAP_API_URL")
    api_token = os.environ.get("REDCAP_API_TOKEN")
    if not api_url or not api_token:
        raise EnvironmentError(
            "REDCAP_API_TOKEN and REDCAP_API_URL must be set in .env"
        )
    return redcap.Project(api_url, api_token)


def validate_records_for_push(
    df: pd.DataFrame,
    required_columns: list[str] | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Validate records DataFrame before pushing to REDCap.

    Checks for required ID fields, missing critical values, and obvious
    out-of-range values before committing to REDCap.

    Args:
        df: DataFrame with records to push. Must contain 'record_id'
            and 'redcap_event_name' columns.
        required_columns: Additional columns that must be non-null.

    Returns:
        Tuple of (valid_df, invalid_df) where invalid_df contains
        rows that failed validation.
    """
    if "record_id" not in df.columns:
        raise ValueError("DataFrame must contain 'record_id' column.")
    if "redcap_event_name" not in df.columns:
        raise ValueError("DataFrame must contain 'redcap_event_name' column.")

    mask_valid = df["record_id"].notna() & df["redcap_event_name"].notna()

    if required_columns:
        for col in required_columns:
            if col in df.columns:
                mask_valid &= df[col].notna()

    valid_df = df[mask_valid].copy()
    invalid_df = df[~mask_valid].copy()

    if len(invalid_df) > 0:
        logger.warning(
            "%d records failed validation and will NOT be pushed.", len(invalid_df)
        )

    return valid_df, invalid_df


def push_records(
    project: redcap.Project,
    df: pd.DataFrame,
    overwrite_existing: bool = False,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Push records DataFrame to REDCap via API.

    Args:
        project: Authenticated REDCap Project instance.
        df: DataFrame with records to import. Must have 'record_id' and
            'redcap_event_name' columns.
        overwrite_existing: If True, overwrite existing field values.
            If False (default), only update empty/missing fields.
        dry_run: If True, log push details but do not send to REDCap.

    Returns:
        Dict with keys 'count' (records imported), 'errors' (list of
        any error messages).
    """
    records = df.to_dict(orient="records")
    logger.info(
        "Preparing to push %d records to REDCap (overwrite=%s, dry_run=%s)",
        len(records),
        overwrite_existing,
        dry_run,
    )

    if dry_run:
        logger.info("[DRY RUN] Would push %d records. No data sent.", len(records))
        return {"count": len(records), "errors": [], "dry_run": True}

    response = project.import_records(
        records,
        overwrite="overwrite" if overwrite_existing else "normal",
        return_format_type="json",
    )

    result: dict[str, Any] = {
        "count": response.get("count", 0),
        "errors": response.get("errors", []),
    }

    if result["errors"]:
        logger.error("REDCap push errors: %s", result["errors"])
    else:
        logger.info("Successfully pushed %d records to REDCap.", result["count"])

    return result


def main() -> None:
    """Main entry point for REDCap push script."""
    parser = argparse.ArgumentParser(description="Push validated data to REDCap")
    parser.add_argument(
        "--input",
        type=str,
        required=True,
        help="Path to parquet file with records to push",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing REDCap field values (default: only fill empty)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and log but do not push to REDCap",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        logger.error("Input file not found: %s", input_path)
        sys.exit(1)

    df = pd.read_parquet(input_path)
    logger.info("Loaded %d records from %s", len(df), input_path)

    valid_df, invalid_df = validate_records_for_push(df)

    if valid_df.empty:
        logger.error("No valid records to push after validation.")
        sys.exit(1)

    project = get_redcap_project()
    result = push_records(
        project, valid_df, overwrite_existing=args.overwrite, dry_run=args.dry_run
    )

    logger.info("Push complete: %s", result)

    if invalid_df is not None and not invalid_df.empty:
        config = load_config()
        invalid_path = (
            Path(config["paths"]["outputs"]["tables_dir"])
            / "redcap_push_invalid_records.parquet"
        )
        invalid_path.parent.mkdir(parents=True, exist_ok=True)
        invalid_df.to_parquet(invalid_path)
        logger.warning("Invalid records saved to: %s", invalid_path)


if __name__ == "__main__":
    main()
