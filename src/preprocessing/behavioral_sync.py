"""Behavioral-ECG synchronization utilities for NANO Study.

Provides time-locking of HDA phases to behavioral events, look-bout
frequency analysis, and multi-modal timeline construction.

Typical usage::

    locked = time_lock_hda_to_behavior(hda_df, behavioral_df)
    timeline = merge_behavioral_physio_timeline(ecg_df, behavioral_df, temp_df)
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)

_HDA_PHASES = ["orienting", "sustained_attention", "termination", "inattention"]


def time_lock_hda_to_behavior(
    hda_df: pd.DataFrame,
    behavioral_df: pd.DataFrame,
    window_sec: float = 5.0,
) -> pd.DataFrame:
    """Time-lock HDA phases to behavioral event onsets.

    For each behavioral event, computes the relative frequency of each HDA
    phase within ``window_sec`` seconds *preceding* event onset.

    Args:
        hda_df: DataFrame with columns ``timestamp_ms`` and ``phase``.
        behavioral_df: DataFrame with column ``onset_ms`` (event onset in ms)
            and any other behavioral columns (preserved in output).
        window_sec: Window length in seconds preceding each event onset.

    Returns:
        Copy of ``behavioral_df`` with added columns
        ``hda_pct_<phase>`` for each HDA phase.
    """
    hda = hda_df.copy()
    beh = behavioral_df.copy()
    window_ms = window_sec * 1000.0

    phase_cols = {p: [] for p in _HDA_PHASES}

    for onset in beh["onset_ms"]:
        window_data = hda[
            (hda["timestamp_ms"] >= onset - window_ms) & (hda["timestamp_ms"] < onset)
        ]
        if len(window_data) == 0:
            for p in _HDA_PHASES:
                phase_cols[p].append(np.nan)
        else:
            counts = window_data["phase"].value_counts(normalize=True)
            for p in _HDA_PHASES:
                phase_cols[p].append(float(counts.get(p, 0.0)))

    for p in _HDA_PHASES:
        beh[f"hda_pct_{p}"] = phase_cols[p]

    logger.info(
        "time_lock_hda_to_behavior: locked %d events (window=%.1fs).", len(beh), window_sec
    )
    return beh


def compute_phase_frequencies_by_look(
    hda_df: pd.DataFrame,
    look_bouts_df: pd.DataFrame,
) -> pd.DataFrame:
    """Compute the proportion of each HDA phase during and around look bouts.

    Args:
        hda_df: DataFrame with ``timestamp_ms`` and ``phase`` columns.
        look_bouts_df: DataFrame with ``onset_ms`` and ``offset_ms`` columns
            defining look-bout intervals.

    Returns:
        DataFrame with one row per look bout and columns
        ``onset_ms``, ``offset_ms``, ``duration_ms``, and
        ``hda_pct_<phase>`` for each HDA phase.
    """
    rows = []
    for _, bout in look_bouts_df.iterrows():
        onset = float(bout["onset_ms"])
        offset = float(bout["offset_ms"])
        segment = hda_df[
            (hda_df["timestamp_ms"] >= onset) & (hda_df["timestamp_ms"] <= offset)
        ]
        row: dict[str, float] = {"onset_ms": onset, "offset_ms": offset, "duration_ms": offset - onset}
        if len(segment) == 0:
            for p in _HDA_PHASES:
                row[f"hda_pct_{p}"] = np.nan
        else:
            counts = segment["phase"].value_counts(normalize=True)
            for p in _HDA_PHASES:
                row[f"hda_pct_{p}"] = float(counts.get(p, 0.0))
        rows.append(row)

    result = pd.DataFrame(rows)
    logger.info("compute_phase_frequencies_by_look: processed %d look bouts.", len(result))
    return result


def merge_behavioral_physio_timeline(
    ecg_df: pd.DataFrame,
    behavioral_df: pd.DataFrame,
    temp_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Create a unified multi-modal timeline at 1-second resolution.

    Resamples ECG (IBI), behavioral coding, and optionally temperature data
    onto a common 1-second grid using forward-fill for slow-changing signals.

    Args:
        ecg_df: DataFrame with ``timestamp_ms`` and ``ibi_ms`` columns
            (output of preprocess_ecg_pipeline).
        behavioral_df: DataFrame with ``onset_ms``, ``offset_ms``, and
            ``behavior_code`` columns.
        temp_df: Optional temperature DataFrame with ``timestamp`` and
            ``cptd`` columns.

    Returns:
        DataFrame indexed by ``time_sec`` (integer seconds from start) with
        columns ``ibi_ms``, ``behavior_code``, and optionally ``cptd``.
    """
    ecg = ecg_df.copy()
    ecg["time_sec"] = (ecg["timestamp_ms"] // 1000).astype(int)
    ecg_resampled = ecg.groupby("time_sec")["ibi_ms"].mean()

    t_min = int(ecg["time_sec"].min())
    t_max = int(ecg["time_sec"].max())
    timeline = pd.DataFrame(index=pd.RangeIndex(t_min, t_max + 1, name="time_sec"))
    timeline = timeline.join(ecg_resampled)

    # Map behavioral events onto timeline
    beh = behavioral_df.copy()
    timeline["behavior_code"] = np.nan
    for _, row in beh.iterrows():
        onset_sec = int(row["onset_ms"] // 1000)
        offset_sec = int(row["offset_ms"] // 1000)
        timeline.loc[onset_sec:offset_sec, "behavior_code"] = row["behavior_code"]

    if temp_df is not None:
        temp = temp_df.copy()
        temp["timestamp"] = pd.to_datetime(temp["timestamp"])
        temp["time_sec"] = (temp["timestamp"].astype(np.int64) // 10 ** 9).astype(int)
        temp_resampled = temp.set_index("time_sec")["cptd"].reindex(timeline.index).ffill()
        timeline["cptd"] = temp_resampled

    timeline = timeline.reset_index()
    logger.info("merge_behavioral_physio_timeline: timeline has %d seconds.", len(timeline))
    return timeline
