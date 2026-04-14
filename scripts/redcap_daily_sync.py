"""Daily REDCap synchronisation script for NANO Study.

Pulls new records from REDCap, runs the QC pipeline, flags incomplete
records, and sends a summary email to the PI.

Usage::

    python scripts/redcap_daily_sync.py [--dry-run]
"""

from __future__ import annotations

import argparse
import logging
import os
import smtplib
import sys
from datetime import datetime
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import pandas as pd

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)

LOG_FILE = Path(__file__).resolve().parents[1] / "logs" / "redcap_sync.log"
COMPLETION_THRESHOLD = 0.80


def _setup_file_logging() -> None:
    """Attach a rotating file handler to the root logger."""
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    fh = logging.FileHandler(LOG_FILE, encoding="utf-8")
    fh.setFormatter(
        logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")
    )
    logging.getLogger().addHandler(fh)


def pull_new_records(dry_run: bool = False) -> pd.DataFrame:
    """Pull all current REDCap records via the project API.

    Args:
        dry_run: If True, return a minimal stub DataFrame instead of calling the API.

    Returns:
        DataFrame of REDCap records.
    """
    if dry_run:
        logger.info("[DRY RUN] Skipping live REDCap pull; returning stub DataFrame.")
        return pd.DataFrame(
            [
                {
                    "record_id": "NANO-0001",
                    "redcap_event_name": "baseline_arm_1",
                    "nano_id": "N001",
                    "ga_weeks": "32",
                }
            ]
        )

    from redcap.api.redcap_pull import get_redcap_project, pull_records

    project = get_redcap_project()
    df = pull_records(project)
    logger.info("Pulled %d records from REDCap.", len(df))
    return df


def run_qc(df: pd.DataFrame) -> pd.DataFrame:
    """Apply the REDCap QC pipeline to the pulled records.

    Args:
        df: Raw REDCap records DataFrame.

    Returns:
        DataFrame annotated with QC flags.
    """
    from redcap.quality_control.redcap_qc_pipeline import run_qc as _run_qc

    flagged = _run_qc(df)
    n_flags = int((flagged.get("qc_flag", pd.Series(dtype=int)) > 0).sum())
    logger.info("QC pipeline complete: %d records flagged.", n_flags)
    return flagged


def flag_incomplete_records(
    df: pd.DataFrame,
    threshold: float = COMPLETION_THRESHOLD,
) -> pd.DataFrame:
    """Identify records where fewer than ``threshold`` of fields are complete.

    Args:
        df: REDCap records DataFrame (QC-annotated).
        threshold: Minimum fraction of non-null fields required (default 0.80).

    Returns:
        Subset DataFrame of records below the completion threshold.
    """
    completeness = df.notna().mean(axis=1)
    incomplete = df[completeness < threshold].copy()
    logger.info(
        "flag_incomplete_records: %d/%d records below %.0f%% completion.",
        len(incomplete),
        len(df),
        threshold * 100,
    )
    return incomplete


def send_summary_email(
    n_records: int,
    n_flagged: int,
    n_incomplete: int,
    dry_run: bool = False,
) -> None:
    """Send a daily sync summary email to the PI.

    Args:
        n_records: Total records pulled.
        n_flagged: Records with QC flags.
        n_incomplete: Records below completion threshold.
        dry_run: If True, log email content instead of sending.

    Raises:
        EnvironmentError: If required SMTP environment variables are missing.
    """
    smtp_host = os.environ.get("SMTP_HOST", "localhost")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_password = os.environ.get("SMTP_PASSWORD", "")
    pi_email = os.environ.get("PI_EMAIL", smtp_user)

    body = (
        f"NANO Study – REDCap Daily Sync Summary\n"
        f"{'=' * 45}\n"
        f"Date/Time : {datetime.now().isoformat()}\n"
        f"Records pulled    : {n_records}\n"
        f"QC-flagged        : {n_flagged}\n"
        f"Incomplete (<80%) : {n_incomplete}\n"
        f"\nLog file: {LOG_FILE}\n"
    )

    if dry_run:
        logger.info("[DRY RUN] Would send email to %s:\n%s", pi_email, body)
        return

    if not smtp_user or not pi_email:
        logger.warning("SMTP credentials not configured; skipping email.")
        return

    msg = MIMEText(body)
    msg["Subject"] = f"[NANO] REDCap Daily Sync – {datetime.now().date()}"
    msg["From"] = smtp_user
    msg["To"] = pi_email

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            if smtp_password:
                server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, [pi_email], msg.as_string())
        logger.info("Summary email sent to %s.", pi_email)
    except Exception as exc:  # pragma: no cover
        logger.error("Failed to send email: %s", exc)


def main() -> None:
    """Entry point for the daily REDCap sync cron job."""
    parser = argparse.ArgumentParser(description="NANO Study daily REDCap sync.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate sync without writing data or sending email.",
    )
    args = parser.parse_args()

    _setup_file_logging()
    logger.info("=== NANO REDCap daily sync started (dry_run=%s) ===", args.dry_run)

    try:
        df = pull_new_records(dry_run=args.dry_run)
        flagged_df = run_qc(df)
        incomplete_df = flag_incomplete_records(flagged_df)

        n_qc_flagged = int(
            (flagged_df.get("qc_flag", pd.Series(0, index=flagged_df.index)) > 0).sum()
        )

        send_summary_email(
            n_records=len(df),
            n_flagged=n_qc_flagged,
            n_incomplete=len(incomplete_df),
            dry_run=args.dry_run,
        )

        logger.info("=== NANO REDCap daily sync completed successfully ===")
    except Exception as exc:
        logger.exception("Daily sync failed: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()
