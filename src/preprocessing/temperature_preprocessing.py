"""Temperature data preprocessing for NANO Study.

Provides hourly statistics, gradient-based artifact flagging, day-level
completeness filtering, and a consolidated feature extractor.

Typical usage::

    stats = compute_hourly_cptd_stats(temp_df)
    temp_df = flag_abnormal_gradients(temp_df)
    features = compute_temperature_features(temp_df)
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.utils.logging_utils import get_pipeline_logger, log_pipeline_step

logger = get_pipeline_logger(__name__)

# Normothermia window (°C) for neonatal temperature monitoring
_NORMOTHERMIA_LOW = 36.5
_NORMOTHERMIA_HIGH = 37.5


def compute_hourly_cptd_stats(temp_df: pd.DataFrame) -> pd.DataFrame:
    """Compute hourly descriptive statistics for CPTd (core–peripheral temp difference).

    Args:
        temp_df: DataFrame with columns ``timestamp`` (datetime-like) and
            ``cptd`` (core–peripheral temperature difference in °C).

    Returns:
        DataFrame indexed by hour with columns
        ``mean_cptd``, ``std_cptd``, ``min_cptd``, ``max_cptd``, ``n_obs``.
    """
    df = temp_df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.set_index("timestamp")

    hourly = (
        df["cptd"]
        .resample("1h")
        .agg(mean_cptd="mean", std_cptd="std", min_cptd="min", max_cptd="max", n_obs="count")
        .reset_index()
    )
    logger.info("compute_hourly_cptd_stats: %d hours computed.", len(hourly))
    return hourly


def flag_abnormal_gradients(
    temp_df: pd.DataFrame,
    max_gradient_per_min: float = 0.5,
) -> pd.DataFrame:
    """Flag rows where the temperature changes faster than the physiological limit.

    Computes the per-minute rate of change between consecutive readings and
    marks rows where |Δtemp / Δmin| > ``max_gradient_per_min``.

    Args:
        temp_df: DataFrame with ``timestamp`` (datetime-like) and ``cptd`` columns.
        max_gradient_per_min: Maximum allowable temperature change (°C/min).

    Returns:
        Input DataFrame with an added boolean column ``abnormal_gradient``
        (True = rate of change exceeds threshold).
    """
    df = temp_df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)

    delta_temp = df["cptd"].diff().abs()
    delta_min = df["timestamp"].diff().dt.total_seconds() / 60.0
    gradient = delta_temp / delta_min.replace(0, np.nan)

    df["abnormal_gradient"] = gradient > max_gradient_per_min
    df["abnormal_gradient"] = df["abnormal_gradient"].fillna(False)

    n_flagged = int(df["abnormal_gradient"].sum())
    logger.info(
        "flag_abnormal_gradients: %d/%d rows flagged (threshold=%.2f °C/min).",
        n_flagged, len(df), max_gradient_per_min,
    )
    return df


def drop_invalid_days(
    temp_df: pd.DataFrame,
    daily_stats_df: pd.DataFrame,
    min_valid_pct: float = 80.0,
) -> pd.DataFrame:
    """Remove observations from days that fail a data-completeness threshold.

    Args:
        temp_df: Temperature DataFrame with a ``timestamp`` column.
        daily_stats_df: DataFrame with columns ``date`` (date-like) and
            ``valid_pct`` (percentage of valid readings for that day).
        min_valid_pct: Minimum valid-data percentage required to keep a day.

    Returns:
        Filtered ``temp_df`` with rows from insufficient days removed.
    """
    n_input = len(temp_df)
    df = temp_df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["_date"] = df["timestamp"].dt.date

    daily_stats_df = daily_stats_df.copy()
    daily_stats_df["date"] = pd.to_datetime(daily_stats_df["date"]).dt.date
    valid_days = set(daily_stats_df.loc[daily_stats_df["valid_pct"] >= min_valid_pct, "date"])

    df = df[df["_date"].isin(valid_days)].drop(columns=["_date"]).reset_index(drop=True)
    log_pipeline_step(logger, "drop_invalid_days", n_input, len(df))
    return df


def compute_temperature_features(temp_df: pd.DataFrame) -> dict[str, float]:
    """Extract summary temperature features from a preprocessed temperature DataFrame.

    Args:
        temp_df: DataFrame with a ``cptd`` column (core–peripheral temperature
            difference in °C). Rows flagged with ``abnormal_gradient`` are
            excluded if that column is present.

    Returns:
        Dict with keys:
            - ``mean_cpTd``: Mean CPTd (°C).
            - ``std_cpTd``: Standard deviation of CPTd (°C).
            - ``min_cpTd``: Minimum CPTd (°C).
            - ``max_cpTd``: Maximum CPTd (°C).
            - ``pct_time_normothermic``: % of observations within normothermic range.
    """
    df = temp_df.copy()
    if "abnormal_gradient" in df.columns:
        df = df[~df["abnormal_gradient"]]

    vals = df["cptd"].dropna().to_numpy(dtype=np.float64)
    if len(vals) == 0:
        return {
            "mean_cpTd": np.nan,
            "std_cpTd": np.nan,
            "min_cpTd": np.nan,
            "max_cpTd": np.nan,
            "pct_time_normothermic": np.nan,
        }

    normothermic = ((vals >= _NORMOTHERMIA_LOW) & (vals <= _NORMOTHERMIA_HIGH)).mean() * 100.0

    return {
        "mean_cpTd": float(np.mean(vals)),
        "std_cpTd": float(np.std(vals, ddof=1)),
        "min_cpTd": float(np.min(vals)),
        "max_cpTd": float(np.max(vals)),
        "pct_time_normothermic": float(normothermic),
    }
