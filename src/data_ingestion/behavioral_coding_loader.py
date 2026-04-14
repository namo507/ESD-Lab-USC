"""Behavioral coding data loader for NANO Study.

Parses DataVyu export files, extracts onset/offset of infant looks and
interactive behavior events, and merges with ECG timeline.

DataVyu exports are spreadsheet-like files with time-coded behavior codes.
This module handles the standard NANO Study DataVyu coding scheme.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.utils.config_loader import load_config
from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)

# ─── NANO DataVyu Coding Columns ─────────────────────────────────────────────

# Standard column structure for NANO DataVyu exports
# DataVyu exports a CSV where each row is a time-coded event
DATAVYU_COLUMNS = {
    "onset": "onset",              # onset time in milliseconds
    "offset": "offset",            # offset time in milliseconds
    "code1": "look_direction",     # infant look direction (C=caregiver, O=object, A=away, .)
    "code2": "affect_valence",     # infant affect (P=positive, N=negative, U=uncertain, .)
    "code3": "caregiver_action",   # caregiver behavior code
}

# HDA phase labels used in NANO
HDA_PHASE_LABELS = ["orienting", "sustained_attention", "termination", "inattention"]


def load_datavyu_export(file_path: Path) -> pd.DataFrame:
    """Load a DataVyu export CSV file.

    DataVyu exports coding data as a flat CSV with onset/offset times
    in milliseconds and behavior codes in subsequent columns.

    Args:
        file_path: Path to the DataVyu export .csv or .opf file.

    Returns:
        DataFrame with columns: onset_ms, offset_ms, duration_ms,
        look_direction, affect_valence, caregiver_action.

    Raises:
        FileNotFoundError: If file_path does not exist.
    """
    if not file_path.exists():
        raise FileNotFoundError(f"DataVyu export not found: {file_path}")

    logger.info("Loading DataVyu file: %s", file_path.name)

    # DataVyu CSV export — auto-detect header structure
    df = pd.read_csv(file_path, header=0, dtype=str, on_bad_lines="warn")
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    # Detect onset/offset columns
    onset_col = next(
        (c for c in df.columns if c in ("onset", "onset_time", "start", "start_time")),
        None,
    )
    offset_col = next(
        (c for c in df.columns if c in ("offset", "offset_time", "end", "end_time")),
        None,
    )

    if onset_col is None or offset_col is None:
        raise ValueError(
            f"Could not find onset/offset columns in {file_path.name}. "
            f"Columns found: {list(df.columns)}"
        )

    result = pd.DataFrame()
    result["onset_ms"] = pd.to_numeric(df[onset_col], errors="coerce")
    result["offset_ms"] = pd.to_numeric(df[offset_col], errors="coerce")
    result["duration_ms"] = result["offset_ms"] - result["onset_ms"]

    # Map behavior code columns
    code_cols = [c for c in df.columns if re.match(r"code\d+|ordinal", c)]
    for i, col in enumerate(code_cols[:4]):
        result[f"code_{i+1}"] = df[col].fillna(".")

    # Rename based on NANO coding scheme if standard columns exist
    if "look_direction" in df.columns:
        result["look_direction"] = df["look_direction"].fillna(".")
    elif "code_1" in result.columns:
        result["look_direction"] = result["code_1"]

    # Remove rows with invalid timestamps
    result = result[result["onset_ms"].notna() & result["offset_ms"].notna()].copy()
    result = result[result["duration_ms"] > 0].copy()
    result = result.sort_values("onset_ms").reset_index(drop=True)

    logger.info(
        "DataVyu: loaded %d valid coded events (%.1f min total coded).",
        len(result),
        result["duration_ms"].sum() / 60000,
    )
    return result


def extract_look_bouts(
    datavyu_df: pd.DataFrame,
    look_code: str = "C",
    min_look_duration_ms: float = 500.0,
) -> pd.DataFrame:
    """Extract sustained look bouts to caregiver/object.

    Args:
        datavyu_df: DataFrame from load_datavyu_export().
        look_code: Code value identifying looks of interest ('C'=caregiver).
        min_look_duration_ms: Minimum duration for a valid look bout (ms).

    Returns:
        DataFrame of look bout events with onset_ms, offset_ms, duration_ms.
    """
    look_col = "look_direction" if "look_direction" in datavyu_df.columns else "code_1"
    looks = datavyu_df[
        (datavyu_df[look_col] == look_code)
        & (datavyu_df["duration_ms"] >= min_look_duration_ms)
    ].copy()

    logger.info(
        "Extracted %d look bouts (code='%s', min_dur=%.0f ms).",
        len(looks), look_code, min_look_duration_ms,
    )
    return looks[["onset_ms", "offset_ms", "duration_ms"]].reset_index(drop=True)


def merge_with_ecg_timeline(
    behavioral_df: pd.DataFrame,
    ecg_df: pd.DataFrame,
    ecg_time_col: str = "cumulative_ms",
    window_ms: float = 5000.0,
) -> pd.DataFrame:
    """Time-lock behavioral events to ECG IBI timeline.

    For each behavioral event onset, extracts the ECG window
    spanning [onset - window_ms, onset + window_ms].

    Args:
        behavioral_df: DataFrame of behavioral events with onset_ms column.
        ecg_df: ECG DataFrame with cumulative timestamp in milliseconds.
        ecg_time_col: Column in ecg_df with cumulative time in ms.
        window_ms: Window size around each event onset (ms).

    Returns:
        DataFrame with behavioral event metadata plus merged ECG window
        summary statistics.
    """
    if ecg_time_col not in ecg_df.columns:
        # Compute cumulative time from IBI series
        ecg_df = ecg_df.copy()
        ecg_df[ecg_time_col] = ecg_df["ibi_ms"].cumsum()

    results = []
    for _, event_row in behavioral_df.iterrows():
        onset = event_row["onset_ms"]
        window_start = onset - window_ms
        window_end = onset + window_ms

        ecg_window = ecg_df[
            (ecg_df[ecg_time_col] >= window_start)
            & (ecg_df[ecg_time_col] <= window_end)
        ]

        if len(ecg_window) < 3:
            continue

        row: dict[str, Any] = {
            "onset_ms": onset,
            "offset_ms": event_row.get("offset_ms", np.nan),
            "duration_ms": event_row.get("duration_ms", np.nan),
            "n_ibi_in_window": len(ecg_window),
            "mean_ibi_window": ecg_window["ibi_ms"].mean(),
            "min_ibi_window": ecg_window["ibi_ms"].min(),
            "max_ibi_window": ecg_window["ibi_ms"].max(),
            "hr_decel_bpm": (
                60000.0 / ecg_window["ibi_ms"].max()
                - 60000.0 / ecg_window["ibi_ms"].mean()
            ),
        }
        results.append(row)

    if not results:
        logger.warning("No behavioral events could be merged with ECG timeline.")
        return pd.DataFrame()

    merged_df = pd.DataFrame(results)
    logger.info(
        "Merged %d behavioral events with ECG timeline.", len(merged_df)
    )
    return merged_df
