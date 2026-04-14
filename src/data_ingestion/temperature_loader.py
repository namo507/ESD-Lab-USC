"""Temperature data loader for NANO Study.

Loads Squirrel datalogger CSV exports, computes central-peripheral
temperature difference (CPTd = abdominal - peripheral), and validates
data completeness requirements.

All paths are loaded from config (config/paths.yml).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.utils.config_loader import load_config
from src.utils.hipaa_utils import safe_load_data
from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)

# ─── Constants ───────────────────────────────────────────────────────────────

SQUIRREL_SAMPLING_INTERVAL_MIN = 1  # 1-minute interval
MIN_VALID_DATA_PCT = 80.0  # require >= 80% valid data per 24h period
SECONDS_PER_DAY = 86400
SAMPLES_PER_DAY = 1440  # at 1-min intervals

VALID_ABDOMINAL_RANGE = (30.0, 42.0)  # °C
VALID_PERIPHERAL_RANGE = (25.0, 40.0)  # °C


def load_squirrel_csv(
    file_path: Path,
    abdominal_col: str | None = None,
    peripheral_col: str | None = None,
) -> pd.DataFrame:
    """Load a Squirrel datalogger temperature CSV file.

    Squirrel files have a standard header with logger metadata lines
    followed by timestamp + channel data. Channel names may vary by
    logger configuration.

    Args:
        file_path: Path to the Squirrel CSV export file.
        abdominal_col: Column name for abdominal (central) temperature.
            If None, auto-detected from column headers.
        peripheral_col: Column name for peripheral temperature.
            If None, auto-detected from column headers.

    Returns:
        DataFrame with columns:
            - timestamp: pd.Timestamp at 1-min intervals
            - temp_abdominal: Abdominal temperature (°C)
            - temp_peripheral: Peripheral temperature (°C)
            - cpTd: Central-Peripheral Temperature difference (°C)

    Raises:
        FileNotFoundError: If file_path does not exist.
        ValueError: If temperature columns cannot be identified.
    """
    if not file_path.exists():
        raise FileNotFoundError(f"Temperature file not found: {file_path}")

    safe_load_data(file_path)
    logger.info("Loading Squirrel temperature file: %s", file_path.name)

    # Squirrel files often have metadata lines at top — skip until numeric data
    df = pd.read_csv(
        file_path,
        sep=",",
        header=0,
        skiprows=_detect_header_rows(file_path),
        dtype=str,
        on_bad_lines="warn",
    )
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    # Detect timestamp column
    ts_col = next(
        (c for c in df.columns if "time" in c or "date" in c or "datetime" in c),
        None,
    )

    # Detect temperature channels
    if abdominal_col is None:
        abdominal_col = _find_temperature_column(
            df.columns, keywords=["abdom", "central", "core", "ch1", "channel1"]
        )
    if peripheral_col is None:
        peripheral_col = _find_temperature_column(
            df.columns, keywords=["periph", "distal", "skin", "ch2", "channel2"]
        )

    if abdominal_col is None or peripheral_col is None:
        raise ValueError(
            f"Could not identify temperature columns in {file_path.name}. "
            f"Available columns: {list(df.columns)}"
        )

    result = pd.DataFrame()
    if ts_col:
        result["timestamp"] = pd.to_datetime(df[ts_col], errors="coerce")
    else:
        # Generate synthetic timestamps at 1-min intervals
        result["timestamp"] = pd.date_range(
            start="2000-01-01",
            periods=len(df),
            freq="1min",
        )

    result["temp_abdominal"] = pd.to_numeric(df[abdominal_col], errors="coerce")
    result["temp_peripheral"] = pd.to_numeric(df[peripheral_col], errors="coerce")

    # Validate ranges
    result["temp_abdominal"] = result["temp_abdominal"].where(
        result["temp_abdominal"].between(*VALID_ABDOMINAL_RANGE)
    )
    result["temp_peripheral"] = result["temp_peripheral"].where(
        result["temp_peripheral"].between(*VALID_PERIPHERAL_RANGE)
    )

    # Compute CPTd
    result["cpTd"] = result["temp_abdominal"] - result["temp_peripheral"]

    logger.info(
        "Temperature file loaded: %d rows. Valid abdominal=%.1f%%, peripheral=%.1f%%",
        len(result),
        result["temp_abdominal"].notna().mean() * 100,
        result["temp_peripheral"].notna().mean() * 100,
    )
    return result


def _detect_header_rows(file_path: Path, max_skip: int = 20) -> int:
    """Detect number of metadata header rows to skip in Squirrel CSV.

    Args:
        file_path: Path to the CSV file.
        max_skip: Maximum lines to check.

    Returns:
        Number of header rows to skip.
    """
    with open(file_path, "r", errors="replace") as f:
        for i, line in enumerate(f):
            if i >= max_skip:
                break
            # First line that starts with a digit or valid datetime is data
            stripped = line.strip()
            if stripped and (stripped[0].isdigit() or stripped.startswith("20")):
                return i
    return 0


def _find_temperature_column(columns: Any, keywords: list[str]) -> str | None:
    """Find a temperature column matching any keyword.

    Args:
        columns: Iterable of column name strings.
        keywords: Keywords to search for (case-insensitive).

    Returns:
        Matching column name, or None if not found.
    """
    for col in columns:
        for kw in keywords:
            if kw in col.lower():
                return col
    return None


def validate_daily_completeness(
    df: pd.DataFrame,
    min_valid_pct: float = MIN_VALID_DATA_PCT,
) -> pd.DataFrame:
    """Flag 24-hour periods with insufficient valid temperature data.

    Periods with < min_valid_pct valid samples are flagged and statistics
    are computed per day.

    Args:
        df: Temperature DataFrame with 'timestamp' and 'temp_abdominal' columns.
        min_valid_pct: Minimum percentage of valid samples required per day.

    Returns:
        DataFrame indexed by date with columns:
            - n_samples: Total samples
            - n_valid_abdominal: Valid abdominal readings
            - n_valid_peripheral: Valid peripheral readings
            - pct_valid: Percentage of valid samples
            - meets_threshold: Boolean flag
    """
    if "timestamp" not in df.columns:
        raise ValueError("DataFrame must have 'timestamp' column for daily aggregation.")

    df = df.copy()
    df["date"] = df["timestamp"].dt.date

    daily_stats = (
        df.groupby("date")
        .agg(
            n_samples=("temp_abdominal", "size"),
            n_valid_abdominal=("temp_abdominal", lambda x: x.notna().sum()),
            n_valid_peripheral=("temp_peripheral", lambda x: x.notna().sum()),
        )
        .reset_index()
    )

    daily_stats["pct_valid"] = (
        daily_stats["n_valid_abdominal"] / SAMPLES_PER_DAY * 100
    ).clip(upper=100.0)

    daily_stats["meets_threshold"] = daily_stats["pct_valid"] >= min_valid_pct

    n_valid_days = daily_stats["meets_threshold"].sum()
    n_total_days = len(daily_stats)
    logger.info(
        "Daily completeness: %d/%d days meet %.0f%% threshold.",
        n_valid_days, n_total_days, min_valid_pct,
    )
    return daily_stats


def load_temperature_file(
    file_path: Path,
    participant_id: str | None = None,
    event: str | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load a single temperature file and validate completeness.

    Args:
        file_path: Path to Squirrel CSV export.
        participant_id: Optional participant ID for metadata.
        event: Optional REDCap event name for metadata.

    Returns:
        Tuple of:
            - temperature DataFrame (1-min intervals)
            - daily_stats DataFrame (per-day completeness)
    """
    df = load_squirrel_csv(file_path)

    if participant_id:
        df["participant_id"] = participant_id
    if event:
        df["event"] = event

    daily_stats = validate_daily_completeness(df)

    return df, daily_stats
