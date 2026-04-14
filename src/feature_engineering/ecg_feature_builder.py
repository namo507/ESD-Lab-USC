"""ECG feature matrix builder for NANO Study.

Constructs a per-participant, per-timepoint feature matrix from
preprocessed ECG/HRV data, including percentile aggregation,
temporal slope computation, cross-modal correlations, and
multicollinearity pruning.

Typical usage::

    features = build_ecg_feature_matrix("NANO-0042", "3mo", processed_ecg_dir)
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform

from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)


def compute_percentile_features(hrv_dict_list: list[dict[str, float]]) -> dict[str, float]:
    """Compute 1st/50th/99th percentile and IQR of all HRV measures across windows.

    Args:
        hrv_dict_list: List of HRV feature dicts (one per window).

    Returns:
        Flat dict with keys ``<feature>_p1``, ``<feature>_p50``,
        ``<feature>_p99``, ``<feature>_iqr`` for each HRV feature.
    """
    if not hrv_dict_list:
        return {}

    all_keys = set().union(*[d.keys() for d in hrv_dict_list])
    result: dict[str, float] = {}

    for key in sorted(all_keys):
        vals = np.array([d.get(key, np.nan) for d in hrv_dict_list], dtype=np.float64)
        vals = vals[~np.isnan(vals)]
        if len(vals) == 0:
            result[f"{key}_p1"] = np.nan
            result[f"{key}_p50"] = np.nan
            result[f"{key}_p99"] = np.nan
            result[f"{key}_iqr"] = np.nan
        else:
            p1, p25, p50, p75, p99 = np.percentile(vals, [1, 25, 50, 75, 99])
            result[f"{key}_p1"] = float(p1)
            result[f"{key}_p50"] = float(p50)
            result[f"{key}_p99"] = float(p99)
            result[f"{key}_iqr"] = float(p75 - p25)

    return result


def compute_temporal_slope(
    feature_series: np.ndarray | pd.Series,
    time_points: np.ndarray | pd.Series,
) -> dict[str, float]:
    """Compute the linear slope of a feature across gestational-age time points.

    Args:
        feature_series: Feature values at each time point (medians recommended).
        time_points: Corresponding time points (e.g., gestational age in weeks).

    Returns:
        Dict with keys ``slope``, ``intercept``, ``r_value``, ``p_value``, ``stderr``.
    """
    x = np.asarray(time_points, dtype=np.float64)
    y = np.asarray(feature_series, dtype=np.float64)
    valid = ~(np.isnan(x) | np.isnan(y))
    if valid.sum() < 2:
        return {"slope": np.nan, "intercept": np.nan, "r_value": np.nan, "p_value": np.nan, "stderr": np.nan}

    slope, intercept, r_value, p_value, stderr = stats.linregress(x[valid], y[valid])
    return {
        "slope": float(slope),
        "intercept": float(intercept),
        "r_value": float(r_value),
        "p_value": float(p_value),
        "stderr": float(stderr),
    }


def compute_cross_modal_correlation(
    hrv_features_df: pd.DataFrame,
    temp_features_df: pd.DataFrame,
) -> pd.DataFrame:
    """Compute Pearson r between aligned HRV and temperature features with Fisher Z.

    Both DataFrames must have the same index (participant/timepoint).

    Args:
        hrv_features_df: HRV feature DataFrame (rows = observations).
        temp_features_df: Temperature feature DataFrame (same index).

    Returns:
        DataFrame with columns ``hrv_feature``, ``temp_feature``,
        ``pearson_r``, ``fisher_z``, ``p_value``, ``n``.
    """
    rows = []
    for hrv_col in hrv_features_df.columns:
        for temp_col in temp_features_df.columns:
            x = hrv_features_df[hrv_col]
            y = temp_features_df[temp_col]
            combined = pd.DataFrame({"x": x, "y": y}).dropna()
            n = len(combined)
            if n < 3:
                continue
            r, p = stats.pearsonr(combined["x"], combined["y"])
            z = float(np.arctanh(np.clip(r, -0.9999, 0.9999)))
            rows.append({"hrv_feature": hrv_col, "temp_feature": temp_col,
                         "pearson_r": r, "fisher_z": z, "p_value": p, "n": n})
    return pd.DataFrame(rows)


def prune_multicollinear_features(
    feature_df: pd.DataFrame,
    threshold: float = 0.90,
) -> pd.DataFrame:
    """Remove highly correlated features using hierarchical clustering.

    Computes the Pearson correlation matrix, converts to a distance matrix,
    and uses average-linkage clustering to group features with |r| ≥ threshold.
    Retains the first (alphabetically) feature from each cluster.

    Args:
        feature_df: Feature DataFrame (rows = samples, cols = features).
        threshold: Absolute correlation threshold above which features
            are considered redundant.

    Returns:
        Pruned DataFrame with multicollinear features removed.
    """
    df = feature_df.dropna(axis=1, how="all").copy()
    if df.shape[1] < 2:
        return feature_df

    corr = df.corr().abs().fillna(0)
    dist = (1.0 - corr).clip(lower=0)
    condensed = squareform(dist.values, checks=False)
    Z = linkage(condensed, method="average")
    dist_threshold = 1.0 - threshold
    labels = fcluster(Z, dist_threshold, criterion="distance")

    kept: list[str] = []
    seen_clusters: set[int] = set()
    for col, label in sorted(zip(df.columns, labels)):
        if label not in seen_clusters:
            kept.append(col)
            seen_clusters.add(label)

    logger.info(
        "prune_multicollinear_features: %d → %d features (threshold=%.2f).",
        df.shape[1], len(kept), threshold,
    )
    return feature_df[kept]


def build_ecg_feature_matrix(
    participant_id: str,
    event: str,
    processed_ecg_dir: str | Path,
) -> pd.Series:
    """Build a flat HRV feature Series for one participant at one timepoint.

    Loads all windowed HRV feature files from ``processed_ecg_dir`` matching
    the participant and event, aggregates across windows using percentile
    features, and returns a named Series.

    Args:
        participant_id: NANO participant ID (already hashed if de-identified).
        event: Timepoint label (e.g., ``'baseline'``, ``'3mo'``).
        processed_ecg_dir: Directory containing ``<participant_id>_<event>_hrv_window_*.parquet``
            files.

    Returns:
        Named ``pd.Series`` of HRV features for this participant/event.
        Returns an empty Series if no files are found.
    """
    ecg_dir = Path(processed_ecg_dir)
    pattern = f"{participant_id}_{event}_hrv_window_*.parquet"
    files = sorted(ecg_dir.glob(pattern))

    if not files:
        logger.warning(
            "build_ecg_feature_matrix: no files found for %s @ %s in %s.",
            participant_id, event, ecg_dir,
        )
        return pd.Series(dtype=float, name=f"{participant_id}_{event}")

    hrv_dicts: list[dict[str, float]] = []
    for f in files:
        window_df = pd.read_parquet(f)
        hrv_dicts.append(window_df.iloc[0].to_dict())

    features = compute_percentile_features(hrv_dicts)
    series = pd.Series(features, name=f"{participant_id}_{event}")
    logger.info(
        "build_ecg_feature_matrix: %d features from %d windows (%s @ %s).",
        len(series), len(files), participant_id, event,
    )
    return series
