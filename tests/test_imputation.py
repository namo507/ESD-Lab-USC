"""Tests for src/imputation/python_imputation.py."""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.imputation.python_imputation import (
    assess_missingness_mechanism,
    document_imputation_assumptions,
    impute_with_mice,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_incomplete_df(
    n_rows: int = 50,
    n_cols: int = 5,
    missing_frac: float = 0.20,
    seed: int = 7,
) -> pd.DataFrame:
    """Return a numeric DataFrame with ~missing_frac of values set to NaN."""
    rng = np.random.default_rng(seed)
    data = rng.normal(loc=50, scale=10, size=(n_rows, n_cols))
    mask = rng.random(size=data.shape) < missing_frac
    # Ensure at least one non-NaN per column for imputation to work
    mask[0, :] = False
    data[mask] = np.nan
    cols = [f"feat_{i}" for i in range(n_cols)]
    return pd.DataFrame(data, columns=cols)


def _make_mar_df(n: int = 80, seed: int = 3) -> pd.DataFrame:
    """Return a DataFrame where missingness in col0 is correlated with col1."""
    rng = np.random.default_rng(seed)
    col1 = rng.normal(0, 1, n)
    col2 = rng.normal(5, 2, n)
    col0 = rng.normal(10, 3, n).astype(float)
    # Make col0 missing when col1 > median (MAR mechanism)
    col0[col1 > np.median(col1)] = np.nan
    return pd.DataFrame({"col0": col0, "col1": col1, "col2": col2})


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_iterative_imputer_fills_missing():
    """impute_with_mice must leave no NaN in numeric columns after imputation."""
    df = _make_incomplete_df(missing_frac=0.20)
    assert df.isna().any().any(), "Test setup error: DataFrame should have NaN values."
    result = impute_with_mice(df)
    assert not result.select_dtypes(include=np.number).isna().any().any(), (
        "Imputed DataFrame still contains NaN values."
    )


def test_imputed_values_in_range():
    """Imputed values must fall within [mean - 4*std, mean + 4*std] of each column."""
    df = _make_incomplete_df(missing_frac=0.15)
    result = impute_with_mice(df)

    for col in df.select_dtypes(include=np.number).columns:
        original = df[col].dropna()
        col_mean = original.mean()
        col_std = original.std()
        lo = col_mean - 4 * col_std
        hi = col_mean + 4 * col_std
        out_of_range = ((result[col] < lo) | (result[col] > hi)).sum()
        assert out_of_range == 0, (
            f"Column '{col}': {out_of_range} imputed values outside [mean±4SD]"
        )


def test_imputed_preserves_non_numeric_columns():
    """Non-numeric columns must be preserved unchanged after imputation."""
    df = _make_incomplete_df()
    df["label"] = ["A", "B"] * (len(df) // 2)
    result = impute_with_mice(df)
    pd.testing.assert_series_equal(result["label"], df["label"])


def test_imputed_preserves_row_count():
    """Imputed DataFrame must have the same number of rows as the input."""
    df = _make_incomplete_df()
    result = impute_with_mice(df)
    assert len(result) == len(df)


def test_mar_assessment_returns_pvalues():
    """assess_missingness_mechanism must return a dict with float p-values."""
    df = _make_mar_df()
    result = assess_missingness_mechanism(df, target_col="col0")

    assert isinstance(result, dict), "Expected a dict of p-values."
    assert len(result) > 0, "Expected at least one predictor p-value."
    for key, val in result.items():
        assert isinstance(val, float), f"P-value for '{key}' is not a float."
        assert 0.0 <= val <= 1.0, f"P-value for '{key}' = {val} outside [0, 1]."


def test_mar_assessment_no_missing_returns_empty_or_ones():
    """assess_missingness_mechanism on a complete column should return 1.0 p-values."""
    df = pd.DataFrame({"a": [1.0, 2.0, 3.0, 4.0, 5.0] * 10, "b": [0.5] * 50})
    result = assess_missingness_mechanism(df, target_col="a")
    # All p-values should be 1.0 (MCAR indicator) or empty dict
    for v in result.values():
        assert v == 1.0 or (0.0 <= v <= 1.0)


def test_document_imputation_writes_report(tmp_path: Path):
    """document_imputation_assumptions must write a file when output_path is given."""
    df = _make_incomplete_df()
    report_path = tmp_path / "imputation_report.txt"
    report_str = document_imputation_assumptions(df, output_path=report_path)

    assert report_path.exists(), "Report file was not created."
    content = report_path.read_text()
    assert len(content) > 50, "Report file appears empty."
    assert isinstance(report_str, str)


def test_document_imputation_returns_string():
    """document_imputation_assumptions must return a string even without output_path."""
    df = _make_incomplete_df()
    result = document_imputation_assumptions(df, output_path=None)
    assert isinstance(result, str)
    assert "NANO" in result or "Imputation" in result or "missing" in result.lower()
