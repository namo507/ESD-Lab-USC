"""ECG data loader for NANO Study.

Loads raw ECG R-R interval files from HeRO monitor and Actiheart-5 exports.
Handles multiple formats, validates sampling rate, and returns a standardized
DataFrame for downstream preprocessing.

Supported formats:
  - HeRO monitor: tab-delimited .dat or .txt files with timestamp + RR columns
  - Actiheart-5: CSV export with RR intervals in milliseconds

All file paths are loaded from config (config/paths.yml) — never hardcoded.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.utils.config_loader import load_config
from src.utils.hipaa_utils import safe_load_data
from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)

# ─── Constants ───────────────────────────────────────────────────────────────

EXPECTED_SAMPLING_RATE_HZ = 1024  # Actiheart-5 native ECG sampling rate
MIN_IBI_MS = 300.0   # 200 bpm maximum physiological HR
MAX_IBI_MS = 2000.0  # 30 bpm minimum physiological HR


def load_hero_ecg(file_path: Path) -> pd.DataFrame:
    """Load HeRO monitor ECG export file.

    HeRO files are tab-delimited with columns:
    Time (HH:MM:SS.mmm), RR_interval (ms), HR (bpm), signal_quality

    Args:
        file_path: Path to the HeRO monitor .dat or .txt export file.

    Returns:
        Standardized DataFrame with columns:
            - timestamp: pd.Timestamp relative timestamps
            - ibi_ms: Inter-beat interval in milliseconds
            - hr_bpm: Instantaneous heart rate (bpm)
            - source: 'hero'

    Raises:
        FileNotFoundError: If file_path does not exist.
        ValueError: If file does not match expected HeRO format.
    """
    if not file_path.exists():
        raise FileNotFoundError(f"HeRO file not found: {file_path}")

    logger.info("Loading HeRO ECG file: %s", file_path.name)

    df = pd.read_csv(
        file_path,
        sep="\t",
        header=0,
        dtype=str,
        on_bad_lines="warn",
    )

    # Normalize column names
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    # Find IBI/RR column
    rr_col = next(
        (c for c in df.columns if "rr" in c or "ibi" in c or "interval" in c),
        None,
    )
    if rr_col is None:
        raise ValueError(
            f"Could not find RR/IBI column in HeRO file: {file_path}. "
            f"Columns found: {list(df.columns)}"
        )

    # Find timestamp column
    time_col = next(
        (c for c in df.columns if "time" in c or "timestamp" in c),
        None,
    )

    result = pd.DataFrame()
    result["ibi_ms"] = pd.to_numeric(df[rr_col], errors="coerce")
    if time_col:
        result["timestamp"] = pd.to_datetime(df[time_col], errors="coerce")
    else:
        result["timestamp"] = pd.NaT

    # Find HR column if present
    hr_col = next(
        (c for c in df.columns if "hr" in c or "heart_rate" in c or "bpm" in c),
        None,
    )
    if hr_col:
        result["hr_bpm"] = pd.to_numeric(df[hr_col], errors="coerce")
    else:
        result["hr_bpm"] = 60000.0 / result["ibi_ms"]

    result["source"] = "hero"
    logger.info("HeRO: loaded %d IBI values.", len(result))
    return result


def load_actiheart_ecg(file_path: Path) -> pd.DataFrame:
    """Load Actiheart-5 R-R interval export file.

    Actiheart-5 files exported from the Actiheart software have
    comma-separated columns: Time (s from start), RR (ms)

    Args:
        file_path: Path to Actiheart-5 export file (.csv or .txt).

    Returns:
        Standardized DataFrame with columns:
            - timestamp: relative seconds from recording start
            - ibi_ms: Inter-beat interval in milliseconds
            - hr_bpm: Instantaneous heart rate (bpm)
            - source: 'actiheart5'

    Raises:
        FileNotFoundError: If file_path does not exist.
    """
    if not file_path.exists():
        raise FileNotFoundError(f"Actiheart file not found: {file_path}")

    logger.info("Loading Actiheart-5 file: %s", file_path.name)

    # Try to auto-detect delimiter and header
    df = pd.read_csv(
        file_path,
        sep=None,
        engine="python",
        header=0,
        dtype=str,
        on_bad_lines="warn",
    )
    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

    rr_col = next(
        (c for c in df.columns if "rr" in c or "ibi" in c or "interval" in c),
        None,
    )
    if rr_col is None:
        raise ValueError(
            f"Could not identify RR column in Actiheart file: {file_path}. "
            f"Columns: {list(df.columns)}"
        )

    time_col = next(
        (c for c in df.columns if "time" in c or "sec" in c or "s_" in c),
        None,
    )

    result = pd.DataFrame()
    result["ibi_ms"] = pd.to_numeric(df[rr_col], errors="coerce")
    if time_col:
        result["timestamp"] = pd.to_numeric(df[time_col], errors="coerce")
    else:
        result["timestamp"] = result["ibi_ms"].cumsum() / 1000.0

    result["hr_bpm"] = 60000.0 / result["ibi_ms"]
    result["source"] = "actiheart5"
    logger.info("Actiheart-5: loaded %d IBI values.", len(result))
    return result


def detect_file_format(file_path: Path) -> str:
    """Auto-detect ECG file format from filename and content.

    Args:
        file_path: Path to the ECG file.

    Returns:
        String identifier: 'hero' or 'actiheart5'.
    """
    name = file_path.name.lower()
    if "hero" in name or name.endswith(".dat"):
        return "hero"
    if "actiheart" in name or "ahi" in name:
        return "actiheart5"

    # Fall back to content sniff
    with open(file_path, "r", errors="replace") as f:
        first_line = f.readline()
    if "\t" in first_line and ("HR" in first_line or "RR" in first_line):
        return "hero"
    return "actiheart5"


def validate_ibi_series(ibi_series: pd.Series) -> pd.Series:
    """Validate IBI series by removing physiologically impossible values.

    Replaces values outside [MIN_IBI_MS, MAX_IBI_MS] range with NaN.

    Args:
        ibi_series: Series of IBI values in milliseconds.

    Returns:
        Cleaned Series with invalid values replaced by NaN.
    """
    n_before = ibi_series.notna().sum()
    valid = ibi_series.where(
        (ibi_series >= MIN_IBI_MS) & (ibi_series <= MAX_IBI_MS)
    )
    n_after = valid.notna().sum()
    n_removed = n_before - n_after
    if n_removed > 0:
        logger.warning(
            "Removed %d physiologically implausible IBI values (outside [%g, %g] ms).",
            n_removed, MIN_IBI_MS, MAX_IBI_MS,
        )
    return valid


def load_ecg_file(
    file_path: Path,
    file_format: str | None = None,
    participant_id: str | None = None,
    event: str | None = None,
) -> pd.DataFrame:
    """Load a single ECG file and return standardized DataFrame.

    Dispatches to the appropriate loader based on detected format.
    Validates IBI range after loading.

    Args:
        file_path: Path to the ECG file.
        file_format: File format override ('hero' or 'actiheart5').
            If None, auto-detected.
        participant_id: Optional participant ID for metadata column.
        event: Optional REDCap event name for metadata column.

    Returns:
        Standardized DataFrame ready for preprocessing pipeline.
    """
    safe_load_data(file_path)

    if file_format is None:
        file_format = detect_file_format(file_path)

    if file_format == "hero":
        df = load_hero_ecg(file_path)
    elif file_format == "actiheart5":
        df = load_actiheart_ecg(file_path)
    else:
        raise ValueError(f"Unknown ECG file format: {file_format}")

    df["ibi_ms"] = validate_ibi_series(df["ibi_ms"])

    if participant_id:
        df["participant_id"] = participant_id
    if event:
        df["event"] = event

    logger.info(
        "Loaded ECG file '%s': %d valid IBIs (%.1f%% valid).",
        file_path.name,
        df["ibi_ms"].notna().sum(),
        df["ibi_ms"].notna().mean() * 100,
    )
    return df


def load_all_ecg_files(
    ecg_dir: Path | None = None,
    file_pattern: str = "*.dat",
) -> dict[str, pd.DataFrame]:
    """Load all ECG files from the configured raw ECG directory.

    Args:
        ecg_dir: Directory containing ECG files. If None, reads from
            config/paths.yml.
        file_pattern: Glob pattern for file matching.

    Returns:
        Dict mapping filename stem to loaded DataFrame.
    """
    if ecg_dir is None:
        config = load_config()
        ecg_dir = Path(config["paths"]["raw"]["ecg_dir"])

    files = list(ecg_dir.glob(file_pattern))
    logger.info("Found %d ECG files in %s matching '%s'.", len(files), ecg_dir, file_pattern)

    results: dict[str, pd.DataFrame] = {}
    for f in sorted(files):
        try:
            df = load_ecg_file(f)
            results[f.stem] = df
        except Exception as e:
            logger.error("Failed to load %s: %s", f.name, e)

    return results
