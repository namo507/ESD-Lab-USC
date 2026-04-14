"""Tests for src/preprocessing/ecg_preprocessing.py."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from src.preprocessing.ecg_preprocessing import (
    bandpass_filter,
    remove_ecg_artifacts,
    reject_windows,
    preprocess_ecg_pipeline,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_synthetic_signal(n_samples: int = 10240, fs: int = 1024) -> np.ndarray:
    """Return a synthetic ECG-like sine wave signal."""
    rng = np.random.default_rng(99)
    t = np.arange(n_samples) / fs
    # 1 Hz heartbeat base + 10 Hz noise carrier + white noise
    signal = (
        np.sin(2 * np.pi * 1.2 * t) * 0.8
        + np.sin(2 * np.pi * 10 * t) * 0.1
        + rng.normal(0, 0.05, n_samples)
    )
    return signal.astype(np.float64)


def _make_clean_ibi(n: int = 400) -> np.ndarray:
    """Return a clean IBI array with no artifacts."""
    rng = np.random.default_rng(11)
    return rng.normal(loc=800, scale=25, size=n).clip(600, 1100)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_bandpass_filter_output_shape():
    """Filtered signal must have the same length as the input."""
    signal = _make_synthetic_signal(n_samples=5120)
    filtered = bandpass_filter(signal, low_hz=0.5, high_hz=40.0, sampling_rate=1024)
    assert filtered.shape == signal.shape


def test_bandpass_filter_reduces_dc():
    """Bandpass filter should attenuate near-DC component significantly."""
    fs = 1024
    t = np.arange(fs * 5) / fs
    dc_signal = np.ones(len(t)) * 5.0 + np.sin(2 * np.pi * 1.0 * t)
    filtered = bandpass_filter(dc_signal, low_hz=0.5, high_hz=40.0, sampling_rate=fs)
    # Mean of filtered output should be much smaller than original DC offset
    assert abs(np.mean(filtered)) < abs(np.mean(dc_signal))


def test_artifact_removal_removes_outliers():
    """IBIs beyond 4 SD should be removed (not present in cleaned output)."""
    rng = np.random.default_rng(42)
    ibi = rng.normal(800, 20, size=200)
    # Inject 5 clear outliers far beyond 4 SD
    ibi[[10, 50, 100, 150, 190]] = [2500.0, 50.0, 2800.0, 45.0, 3000.0]
    cleaned, mask = remove_ecg_artifacts(ibi, threshold_sd=3.5)
    # All injected outliers should be excluded from cleaned output
    assert len(cleaned) < len(ibi)
    # Cleaned values should all be within a reasonable range
    assert cleaned.max() < 2000.0
    assert cleaned.min() > 100.0


def test_artifact_removal_mask_length():
    """Mask returned by artifact removal must match input length."""
    ibi = np.array([750, 800, 820, 780, 900, 750], dtype=float)
    _, mask = remove_ecg_artifacts(ibi, threshold_sd=3.5)
    assert len(mask) == len(ibi)


def test_reject_windows_max_contiguous():
    """Window with 6 consecutive NaN beats should be rejected."""
    ibi = np.full(300, 800.0)
    # Inject a run of 6 consecutive NaN values starting at position 50
    ibi[50:56] = np.nan
    # Use default max_contiguous_missing=5; this window should be rejected
    valid = reject_windows(ibi, window_size_beats=300, max_contiguous_missing=5)
    assert valid.shape[0] == 1
    assert valid[0] is np.bool_(False)


def test_reject_windows_pct_threshold():
    """Window with 15% NaN should be rejected when threshold is 10%."""
    n = 300
    ibi = np.full(n, 800.0)
    n_nan = int(n * 0.15)
    ibi[:n_nan] = np.nan
    valid = reject_windows(ibi, window_size_beats=n, max_missing_pct=0.10)
    assert not valid[0]


def test_reject_windows_clean_passes():
    """A clean IBI window with no NaN should be accepted."""
    ibi = np.full(300, 800.0)
    valid = reject_windows(ibi, window_size_beats=300, max_missing_pct=0.10, max_contiguous_missing=5)
    assert valid[0]


def test_preprocess_pipeline_returns_dataframe(synthetic_ecg_ibi):
    """Full pipeline must return a DataFrame with 'ibi_ms' and 'quality_flag' columns."""
    # Build a synthetic raw ECG-like signal from the IBI fixture
    signal = _make_synthetic_signal(n_samples=20480, fs=1024)
    try:
        result = preprocess_ecg_pipeline(signal, sampling_rate=1024)
        assert isinstance(result, pd.DataFrame)
        assert "ibi_ms" in result.columns
        assert "quality_flag" in result.columns
    except ImportError:
        pytest.skip("neurokit2/biosppy not installed; skipping pipeline test.")


def test_preprocess_pipeline_pct_valid(synthetic_ecg_ibi):
    """For clean synthetic input >80% of the quality_flag values should be 1."""
    signal = _make_synthetic_signal(n_samples=20480, fs=1024)
    try:
        result = preprocess_ecg_pipeline(signal, sampling_rate=1024)
        pct_valid = result["quality_flag"].mean()
        assert pct_valid > 0.80, f"Only {pct_valid:.1%} windows are valid"
    except ImportError:
        pytest.skip("neurokit2/biosppy not installed; skipping pipeline test.")
