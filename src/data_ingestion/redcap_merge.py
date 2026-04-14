"""REDCap data merge module for NANO Study.

Merges REDCap demographic/clinical data with physiological data
(ECG, temperature, behavioral) using participant ID + visit event
as join keys.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from src.utils.config_loader import load_config
from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)

# Columns that identify a unique participant-visit record
JOIN_KEYS = ["participant_id", "event"]

# REDCap field names that map to join keys
REDCAP_ID_FIELD = "record_id"  # nano_id in REDCap
REDCAP_EVENT_FIELD = "redcap_event_name"


def load_redcap_export(export_path: Path) -> pd.DataFrame:
    """Load REDCap export from parquet file.

    Args:
        export_path: Path to parquet file exported by redcap/api/redcap_pull.py.

    Returns:
        DataFrame with REDCap records. ID column renamed to participant_id
        and event column normalized to 'event'.

    Raises:
        FileNotFoundError: If export_path does not exist.
    """
    if not export_path.exists():
        raise FileNotFoundError(
            f"REDCap export not found: {export_path}. "
            "Run `python redcap/api/redcap_pull.py` first."
        )

    df = pd.read_parquet(export_path)

    # Normalize column names to standard join keys
    rename_map: dict[str, str] = {}
    if REDCAP_ID_FIELD in df.columns and "participant_id" not in df.columns:
        rename_map[REDCAP_ID_FIELD] = "participant_id"
    if REDCAP_EVENT_FIELD in df.columns and "event" not in df.columns:
        rename_map[REDCAP_EVENT_FIELD] = "event"
    if "nano_id" in df.columns and "participant_id" not in df.columns:
        rename_map["nano_id"] = "participant_id"

    if rename_map:
        df = df.rename(columns=rename_map)

    logger.info(
        "Loaded REDCap export: %d records, %d columns from %s",
        len(df), len(df.columns), export_path.name,
    )
    return df


def merge_redcap_with_physio(
    redcap_df: pd.DataFrame,
    physio_df: pd.DataFrame,
    how: str = "left",
    physio_suffix: str = "_physio",
) -> pd.DataFrame:
    """Merge REDCap data with physiological feature matrix.

    Args:
        redcap_df: REDCap demographics/assessments DataFrame.
            Must have 'participant_id' and 'event' columns.
        physio_df: Physiological features DataFrame (HRV, temperature, etc.).
            Must have 'participant_id' and 'event' columns.
        how: Join type ('left', 'inner', 'outer', 'right').
        physio_suffix: Suffix for overlapping non-key columns from physio_df.

    Returns:
        Merged DataFrame with REDCap and physiological features combined.
    """
    _validate_join_keys(redcap_df, "redcap_df")
    _validate_join_keys(physio_df, "physio_df")

    # Check for key overlap
    overlap_before = len(
        set(redcap_df["participant_id"].unique())
        & set(physio_df["participant_id"].unique())
    )
    logger.info(
        "Merging: %d REDCap records × %d physio records | %d overlapping participants.",
        len(redcap_df), len(physio_df), overlap_before,
    )

    merged = redcap_df.merge(
        physio_df,
        on=JOIN_KEYS,
        how=how,
        suffixes=("", physio_suffix),
    )

    _log_merge_statistics(redcap_df, physio_df, merged, how)
    return merged


def merge_all_sources(
    redcap_df: pd.DataFrame,
    hrv_df: pd.DataFrame | None = None,
    temperature_df: pd.DataFrame | None = None,
    behavioral_df: pd.DataFrame | None = None,
    how: str = "left",
) -> pd.DataFrame:
    """Merge REDCap data with all available physiological sources.

    Args:
        redcap_df: REDCap demographics/assessments DataFrame.
        hrv_df: HRV feature matrix (from src/preprocessing/hrv_features.py).
        temperature_df: Temperature statistics DataFrame.
        behavioral_df: Behavioral coding summary DataFrame.
        how: Join type for all merges.

    Returns:
        Fully merged DataFrame across all data sources.
    """
    base_df = redcap_df.copy()
    n_before = len(base_df)

    if hrv_df is not None and not hrv_df.empty:
        base_df = merge_redcap_with_physio(base_df, hrv_df, how=how, physio_suffix="_hrv")
        logger.info("After HRV merge: %d rows (was %d).", len(base_df), n_before)

    if temperature_df is not None and not temperature_df.empty:
        base_df = merge_redcap_with_physio(
            base_df, temperature_df, how=how, physio_suffix="_temp"
        )
        logger.info("After temperature merge: %d rows.", len(base_df))

    if behavioral_df is not None and not behavioral_df.empty:
        base_df = merge_redcap_with_physio(
            base_df, behavioral_df, how=how, physio_suffix="_beh"
        )
        logger.info("After behavioral merge: %d rows.", len(base_df))

    return base_df


def _validate_join_keys(df: pd.DataFrame, df_name: str) -> None:
    """Raise ValueError if required join key columns are missing.

    Args:
        df: DataFrame to check.
        df_name: Name for error messages.

    Raises:
        ValueError: If participant_id or event columns are missing.
    """
    for key in JOIN_KEYS:
        if key not in df.columns:
            raise ValueError(
                f"'{df_name}' is missing required join key column: '{key}'. "
                f"Columns present: {list(df.columns)}"
            )


def _log_merge_statistics(
    left: pd.DataFrame,
    right: pd.DataFrame,
    merged: pd.DataFrame,
    how: str,
) -> None:
    """Log merge outcome statistics.

    Args:
        left: Left DataFrame before merge.
        right: Right DataFrame before merge.
        merged: Resulting merged DataFrame.
        how: Join type used.
    """
    n_left = len(left)
    n_right = len(right)
    n_merged = len(merged)
    n_unmatched = merged.iloc[:, len(left.columns) :].isna().all(axis=1).sum()

    logger.info(
        "Merge complete (how='%s'): %d left + %d right → %d rows. "
        "Rows with no physio match: %d",
        how, n_left, n_right, n_merged, n_unmatched,
    )
