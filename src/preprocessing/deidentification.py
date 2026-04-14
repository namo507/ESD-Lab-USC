"""De-identification pipeline for NANO Study participant data.

Strips PHI fields, converts dates to age offsets, hashes participant IDs,
and writes a full audit log of all transformations applied.

Typical usage::

    df_clean = deidentify_dataset(df, audit_log_path="logs/deidentification_audit.txt")
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from src.utils.hipaa_utils import audit_trail, hash_participant_id
from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)


def strip_phi_fields(
    df: pd.DataFrame,
    phi_fields: list[str] | None = None,
) -> tuple[pd.DataFrame, list[str]]:
    """Replace PHI column values with NaN and record which columns were cleared.

    Args:
        df: Input DataFrame potentially containing PHI.
        phi_fields: List of column names to treat as PHI. Defaults to
            ``['dob', 'visit_date', 'ecg_recording_date']``.

    Returns:
        Tuple of (sanitized DataFrame, list of columns that were cleared).
    """
    if phi_fields is None:
        phi_fields = ["dob", "visit_date", "ecg_recording_date"]

    out = df.copy()
    cleared: list[str] = []
    for col in phi_fields:
        if col in out.columns:
            out[col] = np.nan
            cleared.append(col)
            logger.info("strip_phi_fields: cleared column '%s'.", col)
        else:
            logger.debug("strip_phi_fields: column '%s' not present, skipping.", col)
    return out, cleared


def replace_dates_with_age_offsets(
    df: pd.DataFrame,
    dob_col: str = "dob",
    date_cols: list[str] | None = None,
) -> pd.DataFrame:
    """Convert date columns to integer age-in-days offsets from date of birth.

    The DOB column itself is then removed from the output to ensure no
    birth dates remain in the dataset.

    Args:
        df: Input DataFrame with ``dob_col`` and date columns to convert.
        dob_col: Column name containing date of birth.
        date_cols: List of date column names to convert to age_in_days.
            Defaults to ``['visit_date']``.

    Returns:
        DataFrame with date columns replaced by ``<col>_age_days`` integer columns
        and ``dob_col`` removed.

    Raises:
        KeyError: If ``dob_col`` is missing from the DataFrame.
    """
    if date_cols is None:
        date_cols = ["visit_date"]

    if dob_col not in df.columns:
        raise KeyError(f"DOB column '{dob_col}' not found in DataFrame.")

    out = df.copy()
    dob = pd.to_datetime(out[dob_col], errors="coerce")

    for col in date_cols:
        if col not in out.columns:
            logger.debug("replace_dates_with_age_offsets: column '%s' not present.", col)
            continue
        event_date = pd.to_datetime(out[col], errors="coerce")
        out[f"{col}_age_days"] = (event_date - dob).dt.days.astype("Int64")
        out = out.drop(columns=[col])
        logger.info("replace_dates_with_age_offsets: '%s' → '%s_age_days'.", col, col)

    out = out.drop(columns=[dob_col])
    logger.info("replace_dates_with_age_offsets: removed '%s' column.", dob_col)
    return out


def hash_all_participant_ids(
    df: pd.DataFrame,
    id_col: str = "participant_id",
) -> pd.DataFrame:
    """Replace participant IDs with SHA-256 pseudonymous hashes.

    Args:
        df: Input DataFrame with a participant ID column.
        id_col: Name of the participant ID column.

    Returns:
        DataFrame with ``id_col`` values replaced by hashed identifiers.

    Raises:
        KeyError: If ``id_col`` is missing from the DataFrame.
    """
    if id_col not in df.columns:
        raise KeyError(f"ID column '{id_col}' not found in DataFrame.")

    out = df.copy()
    out[id_col] = out[id_col].astype(str).map(hash_participant_id)
    logger.info("hash_all_participant_ids: hashed %d participant IDs.", len(out))
    return out


@audit_trail
def deidentify_dataset(
    df: pd.DataFrame,
    audit_log_path: Optional[str | Path] = None,
) -> pd.DataFrame:
    """Run the full de-identification pipeline on a participant DataFrame.

    Steps applied in order:
        1. Strip PHI fields (DOB, visit dates, ECG recording dates).
        2. Replace dates with age-in-days offsets (from DOB).
        3. Hash all participant IDs with SHA-256.

    Args:
        df: Raw participant DataFrame potentially containing PHI.
        audit_log_path: Optional path for writing a plain-text audit log
            of all transformations. If None, only logger output is produced.

    Returns:
        De-identified copy of the input DataFrame.
    """
    audit_lines: list[str] = [
        f"=== NANO Study De-identification Audit Log ===",
        f"Timestamp: {datetime.now().isoformat()}",
        f"Input rows: {len(df)} | Input columns: {list(df.columns)}",
        "",
    ]

    out, cleared_cols = strip_phi_fields(df)
    audit_lines.append(f"[1] strip_phi_fields: cleared {cleared_cols}")

    try:
        out = replace_dates_with_age_offsets(out)
        audit_lines.append("[2] replace_dates_with_age_offsets: completed")
    except KeyError as exc:
        audit_lines.append(f"[2] replace_dates_with_age_offsets: skipped ({exc})")
        logger.warning("replace_dates_with_age_offsets skipped: %s", exc)

    try:
        out = hash_all_participant_ids(out)
        audit_lines.append("[3] hash_all_participant_ids: completed (SHA-256)")
    except KeyError as exc:
        audit_lines.append(f"[3] hash_all_participant_ids: skipped ({exc})")
        logger.warning("hash_all_participant_ids skipped: %s", exc)

    audit_lines += [
        "",
        f"Output rows: {len(out)} | Output columns: {list(out.columns)}",
        "=== End Audit Log ===",
    ]

    if audit_log_path is not None:
        log_path = Path(audit_log_path)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text("\n".join(audit_lines), encoding="utf-8")
        logger.info("deidentify_dataset: audit log written to %s.", log_path)

    return out
