"""Latent Growth Curve Model (LGCM)-derived trajectory features for NANO Study.

Fits linear and quadratic growth models to longitudinal feature series and
extracts model parameters as ML-ready features.

Typical usage::

    traj = extract_trajectory_features(participant_df, feature_cols, time_col='month')
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats
from scipy.optimize import curve_fit

from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)


def fit_linear_growth(
    feature_series: np.ndarray | pd.Series,
    time_points: np.ndarray | pd.Series,
) -> dict[str, float]:
    """Fit a linear growth model to a feature across time points.

    Model: ``y = intercept + slope * t + ε``

    Args:
        feature_series: Observed feature values at each time point.
        time_points: Numeric time points (e.g., gestational age in weeks,
            or months post-discharge).

    Returns:
        Dict with keys:
            - ``intercept``: Model intercept (value at t=0).
            - ``slope``: Linear rate of change per time unit.
            - ``residual_var``: Variance of residuals (σ²).
            - ``r_squared``: Proportion of variance explained.
    """
    x = np.asarray(time_points, dtype=np.float64)
    y = np.asarray(feature_series, dtype=np.float64)
    valid = ~(np.isnan(x) | np.isnan(y))

    if valid.sum() < 2:
        return {"intercept": np.nan, "slope": np.nan, "residual_var": np.nan, "r_squared": np.nan}

    slope, intercept, r_value, p_value, stderr = stats.linregress(x[valid], y[valid])
    y_hat = intercept + slope * x[valid]
    residual_var = float(np.var(y[valid] - y_hat, ddof=2)) if valid.sum() > 2 else np.nan

    return {
        "intercept": float(intercept),
        "slope": float(slope),
        "residual_var": residual_var,
        "r_squared": float(r_value ** 2),
    }


def fit_quadratic_growth(
    feature_series: np.ndarray | pd.Series,
    time_points: np.ndarray | pd.Series,
) -> dict[str, float]:
    """Fit a quadratic growth model to a feature across time points.

    Model: ``y = intercept + linear_slope * t + quad_slope * t² + ε``

    Args:
        feature_series: Observed feature values at each time point.
        time_points: Numeric time points.

    Returns:
        Dict with keys:
            - ``intercept``: Model intercept.
            - ``linear_slope``: First-order coefficient.
            - ``quad_slope``: Second-order (quadratic) coefficient.
            - ``residual_var``: Variance of residuals.
            - ``r_squared``: Proportion of variance explained.
    """
    x = np.asarray(time_points, dtype=np.float64)
    y = np.asarray(feature_series, dtype=np.float64)
    valid = ~(np.isnan(x) | np.isnan(y))

    if valid.sum() < 3:
        return {
            "intercept": np.nan,
            "linear_slope": np.nan,
            "quad_slope": np.nan,
            "residual_var": np.nan,
            "r_squared": np.nan,
        }

    xv, yv = x[valid], y[valid]
    coeffs = np.polyfit(xv, yv, deg=2)
    quad_slope, linear_slope, intercept = float(coeffs[0]), float(coeffs[1]), float(coeffs[2])

    y_hat = np.polyval(coeffs, xv)
    ss_res = float(np.sum((yv - y_hat) ** 2))
    ss_tot = float(np.sum((yv - yv.mean()) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else np.nan
    residual_var = ss_res / (len(xv) - 3) if len(xv) > 3 else np.nan

    return {
        "intercept": intercept,
        "linear_slope": linear_slope,
        "quad_slope": quad_slope,
        "residual_var": float(residual_var),
        "r_squared": float(r_squared),
    }


def extract_trajectory_features(
    participant_df: pd.DataFrame,
    feature_cols: list[str],
    time_col: str = "month",
) -> pd.Series:
    """Extract LGCM intercept and slope parameters for all features.

    For each feature, fits both linear and quadratic growth models and
    includes all growth parameters as ML-ready features.

    Args:
        participant_df: Longitudinal DataFrame with ``time_col`` and
            one column per feature in ``feature_cols``.
        feature_cols: Feature columns to model over time.
        time_col: Column containing numeric time points.

    Returns:
        Flat ``pd.Series`` of growth parameters for all features,
        e.g. ``hrv_rmssd_lin_slope``, ``hrv_rmssd_quad_slope``.
    """
    time_points = participant_df[time_col].to_numpy(dtype=np.float64)
    features: dict[str, float] = {}

    for col in feature_cols:
        if col not in participant_df.columns:
            logger.warning("extract_trajectory_features: column '%s' not found, skipping.", col)
            continue
        vals = participant_df[col].to_numpy(dtype=np.float64)

        lin = fit_linear_growth(vals, time_points)
        for k, v in lin.items():
            features[f"{col}_lin_{k}"] = v

        quad = fit_quadratic_growth(vals, time_points)
        for k, v in quad.items():
            features[f"{col}_quad_{k}"] = v

    logger.info(
        "extract_trajectory_features: %d trajectory features from %d input features.",
        len(features), len(feature_cols),
    )
    return pd.Series(features)
