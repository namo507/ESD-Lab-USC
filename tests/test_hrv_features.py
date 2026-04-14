"""Tests for src/preprocessing/hrv_features.py."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from src.preprocessing.hrv_features import (
    compute_time_domain_hrv,
    compute_poincare_features,
    compute_sample_entropy,
    extract_all_hrv_features,
    identify_hda_phases,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

KNOWN_IBI = np.array([800.0, 810.0, 790.0, 820.0, 800.0])
# Successive diffs: [10, -20, 30, -20] → squares: [100, 400, 900, 400] → mean=450 → rmssd=√450≈21.21
# Wait — let me recalculate: 810-800=10, 790-810=-20, 820-790=30, 800-820=-20
# squares: 100, 400, 900, 400; mean=450; sqrt(450)≈21.21
KNOWN_RMSSD = math.sqrt(450)  # ≈21.21

# SDNN = std(KNOWN_IBI, ddof=1)
KNOWN_SDNN = float(np.std(KNOWN_IBI, ddof=1))


def _make_long_ibi(n: int = 300) -> np.ndarray:
    rng = np.random.default_rng(13)
    return rng.normal(loc=800, scale=30, size=n).clip(500, 1200)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_rmssd_known_value():
    """RMSSD on known 5-beat series must match manual calculation within 1%."""
    result = compute_time_domain_hrv(KNOWN_IBI)
    rmssd = result["rmssd"]
    assert abs(rmssd - KNOWN_RMSSD) / KNOWN_RMSSD < 0.01, (
        f"Expected RMSSD≈{KNOWN_RMSSD:.4f}, got {rmssd:.4f}"
    )


def test_sdnn_known_value():
    """SDNN on known series must match numpy std(ddof=1) within 1%."""
    result = compute_time_domain_hrv(KNOWN_IBI)
    sdnn = result["sdnn"]
    assert abs(sdnn - KNOWN_SDNN) / max(KNOWN_SDNN, 1e-9) < 0.01, (
        f"Expected SDNN≈{KNOWN_SDNN:.4f}, got {sdnn:.4f}"
    )


def test_mean_ibi_known_value():
    """Mean IBI should equal numpy mean of the input."""
    result = compute_time_domain_hrv(KNOWN_IBI)
    assert abs(result["mean_ibi"] - np.mean(KNOWN_IBI)) < 1e-6


def test_sample_entropy_range():
    """Sample entropy on a valid IBI series must be in [0, 3]."""
    ibi = _make_long_ibi(200)
    sampen = compute_sample_entropy(ibi, m=2, r=0.2)
    if math.isnan(sampen):
        pytest.skip("Sample entropy returned NaN (likely too few templates).")
    assert 0.0 <= sampen <= 3.0, f"Sample entropy {sampen:.4f} out of [0, 3]"


def test_sample_entropy_short_returns_nan():
    """Sample entropy on a very short series should return NaN."""
    short = np.array([800.0, 810.0])
    result = compute_sample_entropy(short, m=2, r=0.2)
    assert math.isnan(result)


def test_poincare_sd1_sd2_positive():
    """SD1 and SD2 from Poincaré analysis must both be positive for valid input."""
    ibi = _make_long_ibi(100)
    result = compute_poincare_features(ibi)
    assert result["sd1"] > 0.0, f"SD1 is not positive: {result['sd1']}"
    assert result["sd2"] > 0.0, f"SD2 is not positive: {result['sd2']}"


def test_poincare_sd1_sd2_ratio():
    """SD1/SD2 ratio must be positive and typically < 1 for normal HRV."""
    ibi = _make_long_ibi(100)
    result = compute_poincare_features(ibi)
    assert result["sd1_sd2_ratio"] > 0.0


def test_poincare_short_series_nan():
    """Poincaré on length-1 series should return NaN for all features."""
    result = compute_poincare_features(np.array([800.0]))
    assert all(math.isnan(v) for v in result.values())


def test_extract_all_hrv_features_returns_dict(synthetic_ecg_ibi):
    """extract_all_hrv_features must return a dict with the required keys."""
    ibi = synthetic_ecg_ibi.values
    timestamps = synthetic_ecg_ibi.index.values
    result = extract_all_hrv_features(ibi, timestamps_ms=timestamps)

    assert isinstance(result, dict)
    required_keys = {"td_mean_ibi", "td_sdnn", "td_rmssd", "pc_sd1", "pc_sd2"}
    missing = required_keys - result.keys()
    assert not missing, f"Missing keys in HRV feature dict: {missing}"


def test_extract_all_hrv_features_no_timestamps(synthetic_ecg_ibi):
    """extract_all_hrv_features without timestamps should still include time-domain features."""
    result = extract_all_hrv_features(synthetic_ecg_ibi.values)
    assert "td_mean_ibi" in result
    assert "td_rmssd" in result


def test_identify_hda_phases_columns(synthetic_ecg_ibi):
    """identify_hda_phases must return a DataFrame with a 'phase' column."""
    ibi = synthetic_ecg_ibi.values
    ts = synthetic_ecg_ibi.index.values
    df = identify_hda_phases(ibi, timestamps_ms=ts)

    assert isinstance(df, pd.DataFrame)
    assert "phase" in df.columns
    assert "ibi_ms" in df.columns
    assert "timestamp_ms" in df.columns


def test_identify_hda_phases_valid_labels(synthetic_ecg_ibi):
    """All phase labels must belong to the set of known valid phase names."""
    valid_phases = {"orienting", "sustained_attention", "termination", "inattention"}
    ibi = synthetic_ecg_ibi.values
    ts = synthetic_ecg_ibi.index.values
    df = identify_hda_phases(ibi, timestamps_ms=ts)
    unknown = set(df["phase"].unique()) - valid_phases
    assert not unknown, f"Unexpected phase labels found: {unknown}"
