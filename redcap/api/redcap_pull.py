"""REDCap API pull module for NANO Study longitudinal data.

Pulls all records from REDCap using paginated API requests.
Exports to the config-defined path only — never saves to repo.

Usage:
    python redcap/api/redcap_pull.py [--event month_12_arm_1] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
import redcap
import yaml
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Add project root to path for config_loader
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.utils.config_loader import load_config
from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)


def get_redcap_project() -> redcap.Project:
    """Instantiate and return an authenticated REDCap Project object.

    Returns:
        redcap.Project: Authenticated project instance.

    Raises:
        EnvironmentError: If REDCAP_API_TOKEN or REDCAP_API_URL not set.
    """
    api_url = os.environ.get("REDCAP_API_URL")
    api_token = os.environ.get("REDCAP_API_TOKEN")

    if not api_url or not api_token:
        raise EnvironmentError(
            "REDCAP_API_TOKEN and REDCAP_API_URL must be set in .env. "
            "Copy .env.example → .env and configure."
        )

    logger.info("Connecting to REDCap at %s", api_url)
    return redcap.Project(api_url, api_token)


def pull_records(
    project: redcap.Project,
    events: list[str] | None = None,
    fields: list[str] | None = None,
    chunk_size: int = 500,
) -> pd.DataFrame:
    """Pull all longitudinal records from REDCap with pagination.

    Args:
        project: Authenticated REDCap Project instance.
        events: List of event names to pull. If None, pulls all events.
        fields: List of field names to pull. If None, pulls all fields.
        chunk_size: Number of records per API request.

    Returns:
        pd.DataFrame: Combined DataFrame of all records across all pages.
    """
    logger.info(
        "Pulling REDCap records (chunk_size=%d, events=%s)", chunk_size, events
    )

    # Get total record count for pagination planning
    all_record_ids: list[str] = project.export_records(
        fields=["record_id"],
        format_type="df",
    )["record_id"].tolist() if fields and "record_id" not in fields else []

    # Use redcap library's built-in chunked export
    kwargs: dict[str, Any] = {
        "format_type": "df",
        "df_kwargs": {"dtype": str},  # preserve all as string initially
    }
    if events:
        kwargs["events"] = events
    if fields:
        kwargs["fields"] = fields

    chunks: list[pd.DataFrame] = []
    record_ids = project.export_records(fields=["record_id"])
    all_ids = list(record_ids.keys()) if isinstance(record_ids, dict) else []

    # Paginate in chunks of chunk_size record IDs
    if all_ids:
        for i in range(0, len(all_ids), chunk_size):
            chunk_ids = all_ids[i : i + chunk_size]
            chunk_kwargs = dict(kwargs)
            chunk_kwargs["records"] = chunk_ids
            df_chunk = project.export_records(**chunk_kwargs)
            chunks.append(df_chunk)
            logger.info(
                "Pulled records %d-%d of %d",
                i + 1,
                min(i + chunk_size, len(all_ids)),
                len(all_ids),
            )
    else:
        # Pull all at once if record list unavailable
        df_all = project.export_records(**kwargs)
        chunks.append(df_all)

    if not chunks:
        logger.warning("No records returned from REDCap.")
        return pd.DataFrame()

    df = pd.concat(chunks, ignore_index=True)
    logger.info("Pulled %d records, %d columns total.", len(df), len(df.columns))
    return df


def export_to_path(df: pd.DataFrame, export_dir: Path, dry_run: bool = False) -> Path:
    """Export DataFrame to the configured secure data path as parquet.

    Args:
        df: DataFrame of REDCap records to export.
        export_dir: Directory path for export (from config/paths.yml).
        dry_run: If True, log export details but do not write file.

    Returns:
        Path: Path to the exported file.
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = export_dir / f"redcap_export_{timestamp}.parquet"

    if dry_run:
        logger.info("[DRY RUN] Would export %d records to: %s", len(df), out_path)
        return out_path

    export_dir.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out_path, index=False, engine="pyarrow")

    # Also update latest symlink
    latest_path = export_dir / "latest.parquet"
    if latest_path.exists() or latest_path.is_symlink():
        latest_path.unlink()
    latest_path.symlink_to(out_path.name)

    logger.info("Exported %d records to: %s", len(df), out_path)
    return out_path


def main() -> None:
    """Main entry point for REDCap pull script."""
    parser = argparse.ArgumentParser(description="Pull REDCap records for NANO Study")
    parser.add_argument(
        "--event",
        type=str,
        default=None,
        help="Pull only a specific REDCap event (e.g., month_12_arm_1)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Connect and count records but do not write output file",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=500,
        help="Number of records per API request (default: 500)",
    )
    args = parser.parse_args()

    config = load_config()
    export_dir = Path(config["paths"]["redcap"]["export_dir"])

    events = [args.event] if args.event else None

    project = get_redcap_project()
    df = pull_records(project, events=events, chunk_size=args.chunk_size)

    if df.empty:
        logger.warning("Empty export — check REDCap API token and project settings.")
        sys.exit(1)

    out_path = export_to_path(df, export_dir, dry_run=args.dry_run)
    if not args.dry_run:
        logger.info("REDCap pull complete: %s", out_path)


if __name__ == "__main__":
    main()
