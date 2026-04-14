"""Python-based imputation utilities for NANO Study.

Assesses missingness mechanisms (MCAR/MAR/MNAR) and performs
multivariate imputation using sklearn's IterativeImputer (MICE-style),
with documented assumptions written to a text report.

Typical usage::

    p_values = assess_missingness_mechanism(df, target_col='rmssd')
    df_imputed = impute_with_mice(df)
    document_imputation_assumptions(df, output_path='reports/imputation_report.txt')
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.experimental import enable_iterative_imputer  # noqa: F401
from sklearn.impute import IterativeImputer
from sklearn.linear_model import BayesianRidge, LogisticRegression

from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)


def assess_missingness_mechanism(
    df: pd.DataFrame,
    target_col: str,
) -> dict[str, float]:
    """Test whether missingness in ``target_col`` is related to other variables (MAR).

    Fits a logistic regression predicting missingness indicator (1=missing, 0=observed)
    from all other complete numeric columns. A statistically significant predictor
    suggests Missing At Random (MAR) rather than MCAR.

    Args:
        df: Input DataFrame.
        target_col: Column whose missingness pattern is being tested.

    Returns:
        Dict mapping each predictor column name to its logistic regression
        coefficient p-value. A low p-value (<0.05) suggests MAR.
    """
    df = df.copy()
    missing_indicator = df[target_col].isna().astype(int)

    # Drop columns with all-NaN and non-numeric
    numeric_cols = [
        c for c in df.select_dtypes(include=np.number).columns
        if c != target_col and df[c].notna().sum() > 10
    ]
    if not numeric_cols:
        logger.warning("assess_missingness_mechanism: no complete numeric predictors found.")
        return {}

    X = df[numeric_cols].fillna(df[numeric_cols].median())
    y = missing_indicator

    if y.sum() == 0 or y.sum() == len(y):
        logger.info("assess_missingness_mechanism: no missing values in '%s', MCAR assumption holds.", target_col)
        return {col: 1.0 for col in numeric_cols}

    model = LogisticRegression(max_iter=500, solver="lbfgs", random_state=42)
    model.fit(X, y)

    # Approximate Wald p-values: z = coef / SE, SE from diagonal of inv(X^T X) * scale
    from scipy import stats as scipy_stats
    n, p = X.shape
    pred_prob = model.predict_proba(X)[:, 1]
    W = np.diag(pred_prob * (1 - pred_prob))
    XW = X.values.T @ W
    try:
        cov = np.linalg.pinv(XW @ X.values)
        se = np.sqrt(np.diag(cov))
        z_scores = model.coef_.flatten() / (se + 1e-12)
        p_values = [float(2 * scipy_stats.norm.sf(abs(z))) for z in z_scores]
    except np.linalg.LinAlgError:
        p_values = [np.nan] * p

    result = dict(zip(numeric_cols, p_values))
    sig_predictors = [col for col, p_val in result.items() if p_val < 0.05]
    if sig_predictors:
        logger.info(
            "assess_missingness_mechanism: '%s' MAR suggested by: %s.",
            target_col, sig_predictors,
        )
    else:
        logger.info(
            "assess_missingness_mechanism: '%s' consistent with MCAR (no significant predictors).",
            target_col,
        )
    return result


def impute_with_mice(
    df: pd.DataFrame,
    max_iter: int = 10,
    random_state: int = 42,
) -> pd.DataFrame:
    """Impute missing values using sklearn IterativeImputer (MICE-style).

    Uses BayesianRidge as the base estimator. Non-numeric columns are
    preserved unchanged.

    Args:
        df: DataFrame with missing values.
        max_iter: Number of imputation iterations.
        random_state: Random seed.

    Returns:
        DataFrame with numeric missing values imputed. Original non-numeric
        columns are reattached unchanged.
    """
    numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
    non_numeric_cols = [c for c in df.columns if c not in numeric_cols]

    n_missing_before = int(df[numeric_cols].isna().sum().sum())
    logger.info(
        "impute_with_mice: %d missing values across %d numeric columns (max_iter=%d).",
        n_missing_before, len(numeric_cols), max_iter,
    )

    imputer = IterativeImputer(
        estimator=BayesianRidge(),
        max_iter=max_iter,
        random_state=random_state,
        verbose=0,
        imputation_order="ascending",
        min_value=df[numeric_cols].min().min(),
        max_value=df[numeric_cols].max().max(),
    )

    imputed_array = imputer.fit_transform(df[numeric_cols])
    imputed_df = pd.DataFrame(imputed_array, columns=numeric_cols, index=df.index)

    n_missing_after = int(imputed_df.isna().sum().sum())
    logger.info(
        "impute_with_mice: %d missing values remain after imputation.", n_missing_after
    )

    result = pd.concat([imputed_df, df[non_numeric_cols]], axis=1)
    return result[df.columns]


def document_imputation_assumptions(
    df: pd.DataFrame,
    output_path: Optional[str | Path] = None,
) -> str:
    """Assess and document missingness assumptions for all columns with missing data.

    For each column with missing values, runs ``assess_missingness_mechanism``
    and classifies as MCAR, MAR, or potential MNAR.

    Args:
        df: Input DataFrame.
        output_path: Optional path for writing the text report.
            If None, report is returned as a string only.

    Returns:
        Multi-line string containing the imputation assumptions report.
    """
    from datetime import datetime

    lines = [
        "=" * 70,
        "NANO Study – Imputation Assumptions Report",
        f"Generated: {datetime.now().isoformat()}",
        f"Dataset shape: {df.shape[0]} rows × {df.shape[1]} columns",
        "=" * 70,
        "",
    ]

    numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
    cols_with_missing = [c for c in numeric_cols if df[c].isna().any()]

    if not cols_with_missing:
        lines.append("No missing values found in numeric columns. No imputation required.")
    else:
        lines.append(f"Columns with missing values ({len(cols_with_missing)}):")
        lines.append("")

        for col in cols_with_missing:
            n_miss = int(df[col].isna().sum())
            pct_miss = n_miss / len(df) * 100
            p_values = assess_missingness_mechanism(df, target_col=col)

            sig = {k: v for k, v in p_values.items() if v < 0.05}
            if len(sig) == 0:
                mechanism = "MCAR (no significant predictors of missingness)"
            elif pct_miss > 40:
                mechanism = "Potential MNAR – high missingness rate; verify data collection process"
            else:
                top_predictors = sorted(sig, key=lambda k: sig[k])[:3]
                mechanism = f"MAR – predicted by: {top_predictors}"

            lines += [
                f"  Column: {col}",
                f"    Missing: {n_miss}/{len(df)} ({pct_miss:.1f}%)",
                f"    Mechanism: {mechanism}",
                "",
            ]

    lines += ["=" * 70, "End of Report", "=" * 70]
    report = "\n".join(lines)

    if output_path is not None:
        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(report, encoding="utf-8")
        logger.info("document_imputation_assumptions: report written to %s.", out)

    return report
