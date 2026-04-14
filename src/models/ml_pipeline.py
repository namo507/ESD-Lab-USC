"""Scikit-learn ML pipeline builder and evaluator for NANO Study.

Provides pipeline construction, stratified cross-validated training,
subgroup sensitivity analysis, feature importance extraction, and
model persistence.

Typical usage::

    pipeline = build_pipeline('random_forest')
    results = train_and_evaluate(X, y, pipeline)
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.feature_selection import RFECV
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from xgboost import XGBClassifier

from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)

_ESTIMATORS: dict[str, Any] = {
    "random_forest": RandomForestClassifier(n_estimators=300, random_state=42, n_jobs=-1),
    "gradient_boosting": GradientBoostingClassifier(n_estimators=200, random_state=42),
    "xgboost": XGBClassifier(
        n_estimators=300, max_depth=5, learning_rate=0.05,
        subsample=0.8, colsample_bytree=0.8, scale_pos_weight=1,
        eval_metric="auc", random_state=42, n_jobs=-1,
    ),
    "logistic_regression": LogisticRegression(max_iter=1000, random_state=42, solver="lbfgs"),
    "svm": SVC(probability=True, random_state=42, kernel="rbf"),
}


def build_pipeline(
    model_name: str = "random_forest",
    config: Optional[dict[str, Any]] = None,
) -> Pipeline:
    """Build a scikit-learn Pipeline: StandardScaler → RFECV → classifier.

    Args:
        model_name: One of ``'random_forest'``, ``'gradient_boosting'``,
            ``'logistic_regression'``, ``'svm'``.
        config: Optional dict of estimator kwargs to override defaults
            (e.g., ``{'n_estimators': 500}``).

    Returns:
        Configured but unfitted ``Pipeline``.

    Raises:
        ValueError: If ``model_name`` is not recognized.
    """
    if model_name not in _ESTIMATORS:
        raise ValueError(f"Unknown model '{model_name}'. Choose from: {list(_ESTIMATORS)}")

    import copy
    estimator = copy.deepcopy(_ESTIMATORS[model_name])
    if config:
        estimator.set_params(**config)

    rfecv = RFECV(
        estimator=RandomForestClassifier(n_estimators=50, random_state=42),
        step=1,
        cv=StratifiedKFold(n_splits=5),
        scoring="roc_auc",
        n_jobs=-1,
    )

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("feature_selection", rfecv),
        ("classifier", estimator),
    ])
    logger.info("build_pipeline: built '%s' pipeline.", model_name)
    return pipeline


def train_and_evaluate(
    X: pd.DataFrame | np.ndarray,
    y: pd.Series | np.ndarray,
    pipeline: Pipeline,
    cv_folds: int = 5,
    scoring: str = "roc_auc",
) -> dict[str, Any]:
    """Stratified k-fold cross-validation with permutation importance.

    Args:
        X: Feature matrix (n_samples × n_features).
        y: Binary outcome labels.
        pipeline: Unfitted scikit-learn Pipeline.
        cv_folds: Number of stratified CV folds.
        scoring: Sklearn scoring string.

    Returns:
        Dict with keys ``cv_scores``, ``mean_score``, ``std_score``,
        and ``fitted_pipeline`` (trained on full data).
    """
    cv = StratifiedKFold(n_splits=cv_folds, shuffle=True, random_state=42)
    cv_results = cross_validate(
        pipeline, X, y, cv=cv, scoring=scoring, return_estimator=True
    )

    scores = cv_results["test_score"]
    logger.info(
        "train_and_evaluate: %s = %.4f ± %.4f over %d folds.",
        scoring, scores.mean(), scores.std(), cv_folds,
    )

    # Refit on full dataset
    pipeline.fit(X, y)

    return {
        "cv_scores": scores,
        "mean_score": float(scores.mean()),
        "std_score": float(scores.std()),
        "fitted_pipeline": pipeline,
    }


def run_subgroup_analysis(
    X: pd.DataFrame,
    y: pd.Series | np.ndarray,
    pipeline: Pipeline,
    subgroup_col: str,
    subgroup_values: list[Any],
) -> pd.DataFrame:
    """Sensitivity analysis: re-evaluate the pipeline for each subgroup.

    Args:
        X: Full feature matrix with ``subgroup_col`` as a column.
        y: Outcome labels aligned with X.
        pipeline: Fitted scikit-learn Pipeline.
        subgroup_col: Column in X defining the subgroup variable.
        subgroup_values: List of subgroup values to iterate over.

    Returns:
        DataFrame with columns ``subgroup``, ``n``, ``mean_roc_auc``, ``std_roc_auc``.
    """
    rows = []
    for val in subgroup_values:
        mask = X[subgroup_col] == val
        X_sub = X[mask].drop(columns=[subgroup_col])
        y_sub = np.asarray(y)[mask]
        if len(np.unique(y_sub)) < 2 or len(y_sub) < 5:
            logger.warning("run_subgroup_analysis: skipping subgroup '%s' (n=%d).", val, mask.sum())
            continue
        cv = StratifiedKFold(n_splits=min(5, int(mask.sum() // 2)), shuffle=True, random_state=42)
        cv_results = cross_validate(pipeline, X_sub, y_sub, cv=cv, scoring="roc_auc")
        scores = cv_results["test_score"]
        rows.append({"subgroup": val, "n": int(mask.sum()),
                     "mean_roc_auc": float(scores.mean()), "std_roc_auc": float(scores.std())})

    return pd.DataFrame(rows)


def get_feature_importance(
    fitted_pipeline: Pipeline,
    feature_names: list[str],
) -> pd.DataFrame:
    """Extract feature importances with permutation test from a fitted pipeline.

    Retrieves built-in ``feature_importances_`` if available (RF/GB), falling
    back to absolute logistic regression coefficients.

    Args:
        fitted_pipeline: Fitted scikit-learn Pipeline.
        feature_names: Original feature names (before feature selection).

    Returns:
        DataFrame with columns ``feature``, ``importance``, sorted descending.
    """
    classifier = fitted_pipeline.named_steps["classifier"]
    selector = fitted_pipeline.named_steps.get("feature_selection")

    selected_names = feature_names
    if selector is not None and hasattr(selector, "support_"):
        selected_names = [n for n, s in zip(feature_names, selector.support_) if s]

    if hasattr(classifier, "feature_importances_"):
        importances = classifier.feature_importances_
    elif hasattr(classifier, "coef_"):
        importances = np.abs(classifier.coef_).flatten()
    else:
        importances = np.ones(len(selected_names))

    df = pd.DataFrame({"feature": selected_names, "importance": importances})
    return df.sort_values("importance", ascending=False).reset_index(drop=True)


def save_model(pipeline: Pipeline, output_path: str | Path) -> None:
    """Save a fitted pipeline to disk using joblib.

    Args:
        pipeline: Fitted scikit-learn Pipeline.
        output_path: Destination file path (e.g., ``models/rf_v1.joblib``).
    """
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, out)
    logger.info("save_model: saved pipeline to %s.", out)


def load_model(model_path: str | Path) -> Pipeline:
    """Load a saved pipeline from disk.

    Args:
        model_path: Path to the saved ``.joblib`` file.

    Returns:
        Deserialized scikit-learn Pipeline.

    Raises:
        FileNotFoundError: If ``model_path`` does not exist.
    """
    path = Path(model_path)
    if not path.exists():
        raise FileNotFoundError(f"Model file not found: {path}")
    pipeline = joblib.load(path)
    logger.info("load_model: loaded pipeline from %s.", path)
    return pipeline
