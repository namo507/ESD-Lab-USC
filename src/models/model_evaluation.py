"""Unified model evaluation utilities for NANO Study.

Computes classification and regression metrics, bootstrap confidence
intervals, ablation studies, and cross-model comparison tables.

Typical usage::

    metrics = compute_classification_metrics(y_true, y_pred, y_prob)
    ci = bootstrap_ci(compute_classification_metrics, y_true, y_pred)
"""

from __future__ import annotations

from typing import Callable, Optional

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.metrics import (
    average_precision_score,
    balanced_accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    roc_auc_score,
)

from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)


def compute_classification_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_prob: Optional[np.ndarray] = None,
) -> dict[str, float]:
    """Compute standard binary classification metrics.

    Args:
        y_true: Ground-truth binary labels.
        y_pred: Predicted binary labels.
        y_prob: Optional predicted probabilities for the positive class.

    Returns:
        Dict with keys: ``auroc``, ``auprc``, ``f1``, ``balanced_accuracy``,
        ``sensitivity``, ``specificity``.
    """
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)

    f1 = float(f1_score(y_true, y_pred, zero_division=0))
    bal_acc = float(balanced_accuracy_score(y_true, y_pred))

    # Sensitivity (recall for class 1) and specificity
    tp = int(((y_pred == 1) & (y_true == 1)).sum())
    fn = int(((y_pred == 0) & (y_true == 1)).sum())
    tn = int(((y_pred == 0) & (y_true == 0)).sum())
    fp = int(((y_pred == 1) & (y_true == 0)).sum())
    sensitivity = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    specificity = tn / (tn + fp) if (tn + fp) > 0 else 0.0

    metrics: dict[str, float] = {
        "f1": f1,
        "balanced_accuracy": bal_acc,
        "sensitivity": float(sensitivity),
        "specificity": float(specificity),
        "auroc": np.nan,
        "auprc": np.nan,
    }

    if y_prob is not None:
        y_prob = np.asarray(y_prob)
        try:
            metrics["auroc"] = float(roc_auc_score(y_true, y_prob))
            metrics["auprc"] = float(average_precision_score(y_true, y_prob))
        except ValueError as exc:
            logger.warning("compute_classification_metrics: %s", exc)

    return metrics


def compute_regression_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
) -> dict[str, float]:
    """Compute standard regression metrics.

    Args:
        y_true: Ground-truth continuous values.
        y_pred: Predicted continuous values.

    Returns:
        Dict with keys: ``r2``, ``rmse``, ``mae``, ``pearson_r``, ``pearson_p``.
    """
    y_true = np.asarray(y_true, dtype=np.float64)
    y_pred = np.asarray(y_pred, dtype=np.float64)

    r2 = float(r2_score(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mae = float(mean_absolute_error(y_true, y_pred))
    pearson_r, pearson_p = stats.pearsonr(y_true, y_pred)

    return {
        "r2": r2,
        "rmse": rmse,
        "mae": mae,
        "pearson_r": float(pearson_r),
        "pearson_p": float(pearson_p),
    }


def bootstrap_ci(
    metric_func: Callable[..., dict[str, float]],
    y_true: np.ndarray,
    y_pred: np.ndarray,
    n_samples: int = 2000,
    ci: float = 0.95,
    y_prob: Optional[np.ndarray] = None,
    random_state: int = 42,
) -> dict[str, dict[str, float]]:
    """Bootstrap confidence intervals for all metrics returned by ``metric_func``.

    Args:
        metric_func: Callable that accepts ``(y_true, y_pred[, y_prob])`` and
            returns a dict of metric name → value.
        y_true: Ground-truth labels.
        y_pred: Predicted labels or values.
        n_samples: Number of bootstrap resamples.
        ci: Confidence level (e.g., 0.95 for 95% CI).
        y_prob: Optional probability array (passed as kwarg if not None).
        random_state: Random seed for reproducibility.

    Returns:
        Dict mapping each metric name to a sub-dict with keys
        ``mean``, ``lower``, ``upper``.
    """
    rng = np.random.default_rng(random_state)
    n = len(y_true)
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)

    bootstrap_scores: dict[str, list[float]] = {}

    for _ in range(n_samples):
        idx = rng.integers(0, n, size=n)
        kwargs: dict = {}
        if y_prob is not None:
            kwargs["y_prob"] = np.asarray(y_prob)[idx]
        try:
            m = metric_func(y_true[idx], y_pred[idx], **kwargs)
        except Exception:
            continue
        for k, v in m.items():
            bootstrap_scores.setdefault(k, []).append(v)

    alpha = (1.0 - ci) / 2.0
    result: dict[str, dict[str, float]] = {}
    for k, vals in bootstrap_scores.items():
        arr = np.array(vals)
        result[k] = {
            "mean": float(np.nanmean(arr)),
            "lower": float(np.nanpercentile(arr, alpha * 100)),
            "upper": float(np.nanpercentile(arr, (1 - alpha) * 100)),
        }
    return result


def ablation_study(
    X: pd.DataFrame,
    y: np.ndarray | pd.Series,
    feature_groups: dict[str, list[str]],
    pipeline: object,
    cv_folds: int = 5,
    scoring: str = "roc_auc",
) -> pd.DataFrame:
    """Sequential feature group ablation: evaluate pipeline removing one group at a time.

    Args:
        X: Full feature DataFrame.
        y: Outcome labels.
        feature_groups: Dict mapping group name → list of feature column names.
        pipeline: Unfitted scikit-learn Pipeline (cloned for each ablation run).
        cv_folds: Number of CV folds.
        scoring: Scoring metric string.

    Returns:
        DataFrame with columns ``ablated_group``, ``n_features_removed``,
        ``mean_score``, ``std_score``.
    """
    from sklearn.base import clone
    from sklearn.model_selection import cross_val_score

    rows = []
    # Baseline (all features)
    base_scores = cross_val_score(
        clone(pipeline), X, y,
        cv=StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=42),
        scoring=scoring,
    )
    rows.append({
        "ablated_group": "none (baseline)",
        "n_features_removed": 0,
        "mean_score": float(base_scores.mean()),
        "std_score": float(base_scores.std()),
    })

    for group_name, cols in feature_groups.items():
        cols_to_drop = [c for c in cols if c in X.columns]
        X_ablated = X.drop(columns=cols_to_drop)
        try:
            from sklearn.model_selection import StratifiedKFold as SKF
            scores = cross_val_score(
                clone(pipeline), X_ablated, y,
                cv=SKF(n_splits=cv_folds, shuffle=True, random_state=42),
                scoring=scoring,
            )
            rows.append({
                "ablated_group": group_name,
                "n_features_removed": len(cols_to_drop),
                "mean_score": float(scores.mean()),
                "std_score": float(scores.std()),
            })
        except Exception as exc:
            logger.warning("ablation_study: group '%s' failed: %s", group_name, exc)

    return pd.DataFrame(rows)


def compare_models(results_dict: dict[str, dict[str, float]]) -> pd.DataFrame:
    """Assemble a summary DataFrame comparing multiple models.

    Args:
        results_dict: Dict mapping model name → metrics dict (as returned
            by ``compute_classification_metrics`` or ``compute_regression_metrics``).

    Returns:
        DataFrame with models as rows and metrics as columns, sorted by
        ``auroc`` descending (or first available metric).
    """
    rows = [{"model": name, **metrics} for name, metrics in results_dict.items()]
    df = pd.DataFrame(rows)
    sort_col = "auroc" if "auroc" in df.columns else df.columns[1]
    df = df.sort_values(sort_col, ascending=False).reset_index(drop=True)
    logger.info("compare_models: comparing %d models.", len(df))
    return df



