"""Tests for src/preprocessing/deidentification.py."""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.preprocessing.deidentification import (
    deidentify_dataset,
    hash_all_participant_ids,
    replace_dates_with_age_offsets,
    strip_phi_fields,
)
from src.utils.hipaa_utils import hash_participant_id


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_phi_df() -> pd.DataFrame:
    """Return a minimal DataFrame containing PHI-like fields."""
    return pd.DataFrame(
        {
            "participant_id": ["NANO-0001", "NANO-0002"],
            "dob": ["1990-01-15", "1985-06-20"],
            "visit_date": ["2022-03-01", "2022-04-15"],
            "ga_weeks": [38, 32],
            "group_code": ["ASD", "TD"],
        }
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_phi_fields_removed():
    """strip_phi_fields must set 'dob' column values to NaN."""
    df = _make_phi_df()
    result, cleared = strip_phi_fields(df, phi_fields=["dob"])
    assert "dob" in result.columns
    assert result["dob"].isna().all(), "dob column should be entirely NaN after strip"
    assert "dob" in cleared


def test_phi_fields_non_phi_columns_intact():
    """Non-PHI columns must be unchanged after strip_phi_fields."""
    df = _make_phi_df()
    result, _ = strip_phi_fields(df, phi_fields=["dob"])
    pd.testing.assert_series_equal(result["ga_weeks"], df["ga_weeks"])


def test_dates_replaced_with_age_offsets():
    """replace_dates_with_age_offsets must compute correct age_in_days == 365."""
    df = pd.DataFrame(
        {
            "participant_id": ["NANO-0001"],
            "dob": ["2021-03-01"],
            "visit_date": ["2022-03-01"],
        }
    )
    result = replace_dates_with_age_offsets(df, dob_col="dob", date_cols=["visit_date"])
    assert "visit_date_age_days" in result.columns
    age = result["visit_date_age_days"].iloc[0]
    assert int(age) == 365, f"Expected 365 days, got {age}"


def test_dates_replaced_dob_removed():
    """DOB column must be removed from the output after age-offset replacement."""
    df = pd.DataFrame(
        {
            "participant_id": ["NANO-0001"],
            "dob": ["2021-03-01"],
            "visit_date": ["2022-03-01"],
        }
    )
    result = replace_dates_with_age_offsets(df)
    assert "dob" not in result.columns


def test_participant_ids_hashed():
    """hash_all_participant_ids must remove the 'NANO-' prefix from all values."""
    df = _make_phi_df()
    result = hash_all_participant_ids(df, id_col="participant_id")
    for val in result["participant_id"]:
        assert not str(val).startswith("NANO-"), (
            f"Original NANO- prefix found in hashed ID: {val}"
        )


def test_hash_is_deterministic():
    """Hashing the same participant ID twice must yield identical results."""
    h1 = hash_participant_id("NANO-0001", salt="test_salt")
    h2 = hash_participant_id("NANO-0001", salt="test_salt")
    assert h1 == h2, "Hash function is not deterministic"


def test_hash_different_ids_differ():
    """NANO-0001 and NANO-0002 must produce different hash values."""
    h1 = hash_participant_id("NANO-0001", salt="test_salt")
    h2 = hash_participant_id("NANO-0002", salt="test_salt")
    assert h1 != h2, "Different IDs should produce different hashes"


def test_no_phi_patterns_in_output():
    """After full deidentify_dataset no YYYY-MM-DD dates or NANO-XXXX IDs should remain."""
    df = _make_phi_df()
    result = deidentify_dataset(df)

    date_pattern = re.compile(r"\d{4}-\d{2}-\d{2}")
    nano_pattern = re.compile(r"NANO-\d{4}")

    for col in result.columns:
        for val in result[col].dropna().astype(str):
            assert not date_pattern.search(val), (
                f"PHI date pattern found in column '{col}': {val}"
            )
            assert not nano_pattern.search(val), (
                f"NANO ID pattern found in column '{col}': {val}"
            )


def test_deidentify_preserves_row_count():
    """deidentify_dataset must not drop any rows."""
    df = _make_phi_df()
    result = deidentify_dataset(df)
    assert len(result) == len(df)


def test_deidentify_returns_dataframe():
    """deidentify_dataset must return a pd.DataFrame."""
    df = _make_phi_df()
    result = deidentify_dataset(df)
    assert isinstance(result, pd.DataFrame)
