"""HRV feature extraction from cleaned IBI series.

Computes time-domain, Poincaré, nonlinear (sample entropy), RSA via CWT,
HDA phase identification, and a consolidated feature extractor.

Typical usage::

    features = extract_all_hrv_features(ibi_ms, timestamps_ms)
"""

from __future__ import annotations

import warnings
from typing import Optional

import numpy as np
import pandas as pd
from scipy import signal, stats

from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)


def compute_time_domain_hrv(ibi_ms: np.ndarray | pd.Series) -> dict[str, float]:
    """Compute standard time-domain HRV measures.

    Args:
        ibi_ms: Inter-beat intervals in milliseconds (artifact-free).

    Returns:
        Dict with keys:
            - ``mean_ibi``: Mean IBI (ms).
            - ``sdnn``: Standard deviation of IBIs (ms).
            - ``rmssd``: Root mean square of successive differences (ms).
            - ``cvnn``: Coefficient of variation (sdnn / mean_ibi).
            - ``hti``: HRV triangular index (total_beats / histogram_peak_count).
    """
    arr = np.asarray(ibi_ms, dtype=np.float64)
    arr = arr[~np.isnan(arr)]
    if len(arr) < 2:
        return {"mean_ibi": np.nan, "sdnn": np.nan, "rmssd": np.nan, "cvnn": np.nan, "hti": np.nan}

    mean_ibi = float(np.mean(arr))
    sdnn = float(np.std(arr, ddof=1))
    successive_diffs = np.diff(arr)
    rmssd = float(np.sqrt(np.mean(successive_diffs ** 2)))
    cvnn = sdnn / mean_ibi if mean_ibi != 0 else np.nan

    counts, _ = np.histogram(arr, bins=max(10, len(arr) // 10))
    hti = float(len(arr) / counts.max()) if counts.max() > 0 else np.nan

    return {"mean_ibi": mean_ibi, "sdnn": sdnn, "rmssd": rmssd, "cvnn": cvnn, "hti": hti}


def compute_poincare_features(ibi_ms: np.ndarray | pd.Series) -> dict[str, float]:
    """Compute Poincaré plot features (SD1, SD2, and their ratio).

    Args:
        ibi_ms: Inter-beat intervals in milliseconds.

    Returns:
        Dict with keys ``sd1``, ``sd2``, ``sd1_sd2_ratio``.
    """
    arr = np.asarray(ibi_ms, dtype=np.float64)
    arr = arr[~np.isnan(arr)]
    if len(arr) < 2:
        return {"sd1": np.nan, "sd2": np.nan, "sd1_sd2_ratio": np.nan}

    x1 = arr[:-1]
    x2 = arr[1:]
    sd1 = float(np.std((x2 - x1) / np.sqrt(2), ddof=1))
    sd2 = float(np.std((x2 + x1) / np.sqrt(2), ddof=1))
    ratio = sd1 / sd2 if sd2 != 0 else np.nan
    return {"sd1": sd1, "sd2": sd2, "sd1_sd2_ratio": ratio}


def compute_sample_entropy(
    ibi_ms: np.ndarray | pd.Series,
    m: int = 2,
    r: float = 0.2,
) -> float:
    """Compute sample entropy of an IBI series.

    Uses tolerance r * std(ibi_ms). Falls back to manual computation
    if antropy is unavailable.

    Args:
        ibi_ms: Inter-beat intervals in milliseconds.
        m: Embedding dimension (template length).
        r: Tolerance multiplier (fraction of SD).

    Returns:
        Sample entropy scalar (float). Returns NaN for series too short.
    """
    arr = np.asarray(ibi_ms, dtype=np.float64)
    arr = arr[~np.isnan(arr)]
    if len(arr) < 2 * m + 1:
        return np.nan

    try:
        import antropy as ant  # type: ignore[import]
        return float(ant.sample_entropy(arr, order=m, metric="chebyshev"))
    except ImportError:
        pass

    tolerance = r * float(np.std(arr, ddof=1))
    n = len(arr)

    def _count_templates(length: int) -> int:
        count = 0
        for i in range(n - length):
            template = arr[i : i + length]
            for j in range(n - length):
                if i == j:
                    continue
                if np.max(np.abs(arr[j : j + length] - template)) < tolerance:
                    count += 1
        return count

    cm = _count_templates(m)
    cm1 = _count_templates(m + 1)
    if cm == 0:
        return np.nan
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return float(-np.log(cm1 / cm)) if cm1 > 0 else np.nan


def compute_rsa_cwt(
    ibi_ms: np.ndarray | pd.Series,
    resp_band: tuple[float, float] = (0.12, 0.4),
    fs: float = 4.0,
) -> float:
    """Estimate RSA power via continuous wavelet transform (CWT).

    Resamples the IBI series to ``fs`` Hz, applies a complex Morlet CWT,
    and integrates power within the respiratory frequency band.

    Args:
        ibi_ms: Inter-beat intervals in milliseconds.
        resp_band: (low_hz, high_hz) defining the RSA/respiratory band.
        fs: Target resampling frequency (Hz) for the CWT.

    Returns:
        Mean CWT power in the respiratory band (float).
    """
    arr = np.asarray(ibi_ms, dtype=np.float64)
    arr = arr[~np.isnan(arr)]
    if len(arr) < 10:
        return np.nan

    # Resample IBI to uniform grid
    cumulative_time = np.cumsum(arr) / 1000.0  # seconds
    uniform_time = np.arange(cumulative_time[0], cumulative_time[-1], 1.0 / fs)
    ibi_resampled = np.interp(uniform_time, cumulative_time, arr)

    # Build frequency axis and scale for Morlet CWT
    freqs = np.linspace(resp_band[0], resp_band[1], 20)
    scales = fs / (freqs * 2 * np.pi)  # approximate Morlet scale → frequency

    try:
        import pywt  # type: ignore[import]
        coeff, _ = pywt.cwt(ibi_resampled, scales, "morl", sampling_period=1.0 / fs)
        power = np.mean(np.abs(coeff) ** 2)
    except ImportError:
        cwt = getattr(signal, "cwt", None)
        morlet2 = getattr(signal, "morlet2", None)
        if callable(cwt) and callable(morlet2):
            coeff = cwt(ibi_resampled, morlet2, scales)
            power = float(np.mean(np.abs(coeff) ** 2))
        else:
            freqs_psd, psd = signal.welch(
                ibi_resampled,
                fs=fs,
                nperseg=min(256, len(ibi_resampled)),
            )
            band = (freqs_psd >= resp_band[0]) & (freqs_psd <= resp_band[1])
            if not np.any(band):
                return np.nan
            power = float(np.trapezoid(psd[band], freqs_psd[band]))

    return float(power)


def identify_hda_phases(
    ibi_ms: np.ndarray | pd.Series,
    timestamps_ms: np.ndarray | pd.Series,
) -> pd.DataFrame:
    """Segment IBI series into HDA attention phases.

    Phases are assigned based on IBI trajectory relative to the series median:
        - ``orienting``: rapid IBI increase (>+5%) at series onset.
        - ``sustained_attention``: IBI within ±10% of median.
        - ``termination``: IBI decrease below 90% of median.
        - ``inattention``: IBI remains low or highly variable.

    Args:
        ibi_ms: Inter-beat intervals in milliseconds.
        timestamps_ms: Corresponding timestamps in milliseconds.

    Returns:
        DataFrame with columns ``timestamp_ms``, ``ibi_ms``, ``phase``.
    """
    arr = np.asarray(ibi_ms, dtype=np.float64)
    ts = np.asarray(timestamps_ms, dtype=np.float64)
    median_ibi = float(np.nanmedian(arr))

    phases: list[str] = []
    for i, val in enumerate(arr):
        if np.isnan(val):
            phases.append("inattention")
            continue
        ratio = val / median_ibi if median_ibi > 0 else 1.0
        if i < len(arr) * 0.15 and ratio > 1.05:
            phases.append("orienting")
        elif 0.90 <= ratio <= 1.10:
            phases.append("sustained_attention")
        elif ratio < 0.90:
            phases.append("termination")
        else:
            phases.append("inattention")

    return pd.DataFrame({"timestamp_ms": ts, "ibi_ms": arr, "phase": phases})


def extract_all_hrv_features(
    ibi_ms: np.ndarray | pd.Series,
    timestamps_ms: Optional[np.ndarray | pd.Series] = None,
) -> dict[str, float]:
    """Extract the full HRV feature set from a cleaned IBI series.

    Calls all individual feature functions and returns a flat dict
    suitable for building a feature matrix row.

    Args:
        ibi_ms: Cleaned inter-beat intervals in milliseconds.
        timestamps_ms: Optional timestamps aligned with ``ibi_ms``.

    Returns:
        Flat dict of all HRV features. Keys are prefixed with the
        domain (e.g., ``td_mean_ibi``, ``pc_sd1``, ``sampen``, ``rsa``).
    """
    features: dict[str, float] = {}

    td = compute_time_domain_hrv(ibi_ms)
    features.update({f"td_{k}": v for k, v in td.items()})

    pc = compute_poincare_features(ibi_ms)
    features.update({f"pc_{k}": v for k, v in pc.items()})

    features["sampen"] = compute_sample_entropy(ibi_ms)
    features["rsa_cwt_power"] = compute_rsa_cwt(ibi_ms)

    if timestamps_ms is not None:
        hda_df = identify_hda_phases(ibi_ms, timestamps_ms)
        phase_counts = hda_df["phase"].value_counts(normalize=True)
        for phase in ["orienting", "sustained_attention", "termination", "inattention"]:
            features[f"hda_pct_{phase}"] = float(phase_counts.get(phase, 0.0))

    return features
