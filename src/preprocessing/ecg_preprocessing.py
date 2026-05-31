"""ECG preprocessing pipeline for NANO Study.

Full ECG preprocessing including bandpass filtering, R-peak detection,
artifact removal, window rejection, and HIPAA-compliant audit logging.

Typical usage::

    cleaned = preprocess_ecg_pipeline(raw_signal, sampling_rate=1024)
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from pathlib import Path
from scipy.signal import butter, sosfiltfilt

from src.utils.config_loader import load_config
from src.utils.hipaa_utils import audit_trail, safe_load_data
from src.utils.logging_utils import get_pipeline_logger, log_pipeline_step

logger = get_pipeline_logger(__name__)


def bandpass_filter(
    signal: np.ndarray,
    low_hz: float = 0.5,
    high_hz: float = 40.0,
    sampling_rate: int = 1024,
    order: int = 4,
) -> np.ndarray:
    """Apply a Butterworth bandpass filter to an ECG signal.

    Args:
        signal: 1-D raw ECG signal array.
        low_hz: Low-cut frequency in Hz.
        high_hz: High-cut frequency in Hz.
        sampling_rate: Sampling rate in Hz.
        order: Filter order.

    Returns:
        Bandpass-filtered signal array of the same shape.
    """
    nyq = sampling_rate / 2.0
    sos = butter(order, [low_hz / nyq, high_hz / nyq], btype="band", output="sos")
    return sosfiltfilt(sos, signal).astype(np.float64)


def detect_rpeaks(
    signal: np.ndarray,
    sampling_rate: int = 1024,
) -> np.ndarray:
    """Detect R-peaks in a filtered ECG signal via NeuroKit2.

    Args:
        signal: 1-D bandpass-filtered ECG signal.
        sampling_rate: Sampling rate in Hz.

    Returns:
        Array of R-peak sample indices.
    """
    try:
        import neurokit2 as nk  # type: ignore[import]
        _, info = nk.ecg_peaks(signal, sampling_rate=sampling_rate, method="pantompkins1985")
        return info["ECG_R_Peaks"].astype(int)
    except ImportError:
        logger.warning("neurokit2 not available; falling back to biosppy R-peak detection.")
        try:
            from biosppy.signals.ecg import christov_segmenter  # type: ignore[import]
            rpeaks = christov_segmenter(signal=signal, sampling_rate=sampling_rate)["rpeaks"]
            return rpeaks.astype(int)
        except ImportError:
            logger.error("Neither neurokit2 nor biosppy available.")
            raise


def remove_ecg_artifacts(
    ibi_series: np.ndarray | pd.Series,
    threshold_sd: float = 3.5,
) -> tuple[np.ndarray, np.ndarray]:
    """Remove IBI outliers using a robust center/spread estimate.

    Args:
        ibi_series: Inter-beat interval values in milliseconds.
        threshold_sd: Standard deviation multiplier for outlier threshold.

    Returns:
        Tuple of (cleaned_ibi, mask) where mask is a boolean array (True = valid).
    """
    arr = np.asarray(ibi_series, dtype=np.float64)
    finite_mask = np.isfinite(arr)
    median = np.nanmedian(arr)
    mad = np.nanmedian(np.abs(arr[finite_mask] - median)) if finite_mask.any() else np.nan

    if np.isfinite(mad) and mad > 0:
        center = median
        spread = 1.4826 * mad
    else:
        center = np.nanmean(arr)
        spread = np.nanstd(arr)

    if not np.isfinite(spread) or spread == 0:
        mask = finite_mask.copy()
    else:
        mask = finite_mask & (np.abs(arr - center) <= threshold_sd * spread)

    n_removed = int((~mask).sum())
    if n_removed > 0:
        logger.info("remove_ecg_artifacts: removed %d outlier beats (>%.1f SD).", n_removed, threshold_sd)
    return arr[mask], mask


def reject_windows(
    ibi_series: np.ndarray | pd.Series,
    window_size_beats: int = 300,
    max_missing_pct: float = 0.10,
    max_contiguous_missing: int = 5,
) -> np.ndarray:
    """Reject IBI windows that exceed missingness or contiguous-gap thresholds.

    Args:
        ibi_series: IBI values in milliseconds (NaN = missing beat).
        window_size_beats: Number of beats per window.
        max_missing_pct: Maximum fraction of missing beats allowed per window.
        max_contiguous_missing: Maximum length of consecutive missing beats allowed.

    Returns:
        Boolean array of length == number of windows; True = window is valid.
    """
    arr = np.asarray(ibi_series, dtype=np.float64)
    n_windows = max(1, len(arr) // window_size_beats)
    valid = np.zeros(n_windows, dtype=bool)

    for w in range(n_windows):
        start = w * window_size_beats
        end = start + window_size_beats
        window = arr[start:end]
        missing_mask = np.isnan(window)
        missing_pct = missing_mask.mean()
        if missing_pct > max_missing_pct:
            continue
        max_run = _max_contiguous_true(missing_mask)
        if max_run > max_contiguous_missing:
            continue
        valid[w] = True

    logger.info(
        "reject_windows: %d/%d windows passed (window_size=%d beats).",
        int(valid.sum()), n_windows, window_size_beats,
    )
    return valid


def _max_contiguous_true(mask: np.ndarray) -> int:
    """Return the length of the longest run of True values in a boolean array."""
    if not mask.any():
        return 0
    max_run = current = 0
    for val in mask:
        if val:
            current += 1
            max_run = max(max_run, current)
        else:
            current = 0
    return max_run


@audit_trail
def preprocess_ecg_pipeline(
    raw_signal: np.ndarray,
    sampling_rate: int = 1024,
    threshold_sd: float = 3.5,
) -> pd.DataFrame:
    """Run the full ECG preprocessing pipeline.

    Steps:
        1. Bandpass filter (0.5–40 Hz).
        2. R-peak detection via NeuroKit2.
        3. IBI computation from R-peak intervals.
        4. Artifact removal (>3.5 SD outliers).
        5. Window rejection (10% missing / 5 contiguous gaps).
        6. Quality flag assignment.

    Args:
        raw_signal: 1-D raw ECG signal array (float).
        sampling_rate: Sampling rate in Hz.
        threshold_sd: SD multiplier for artifact removal.

    Returns:
        DataFrame with columns:
            - ``ibi_ms``: cleaned inter-beat intervals in milliseconds.
            - ``quality_flag``: 1 = artifact-free window, 0 = rejected.
    """
    n_input = len(raw_signal)
    logger.info("preprocess_ecg_pipeline: input signal length=%d samples at %d Hz.", n_input, sampling_rate)

    filtered = bandpass_filter(raw_signal, sampling_rate=sampling_rate)
    rpeaks = detect_rpeaks(filtered, sampling_rate=sampling_rate)

    # Convert R-peak sample indices → IBI in milliseconds
    ibi_ms = np.diff(rpeaks) / sampling_rate * 1000.0

    cleaned_ibi, artifact_mask = remove_ecg_artifacts(ibi_ms, threshold_sd=threshold_sd)
    window_valid = reject_windows(cleaned_ibi)

    n_windows = len(window_valid)
    window_size = len(cleaned_ibi) // n_windows if n_windows else len(cleaned_ibi)

    quality_flag = np.zeros(len(cleaned_ibi), dtype=int)
    for w, valid in enumerate(window_valid):
        start = w * window_size
        end = start + window_size
        quality_flag[start:end] = int(valid)

    result = pd.DataFrame({"ibi_ms": cleaned_ibi, "quality_flag": quality_flag})
    log_pipeline_step(logger, "preprocess_ecg_pipeline", n_input, len(result))
    return result
