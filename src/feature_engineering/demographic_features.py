"""Demographic and clinical feature encoding for NANO Study.

Encodes gestational age bins, group membership, morbidity scores,
and SES indicators from REDCap data into ML-ready features.

Typical usage::

    demo_df = build_demographic_feature_matrix(redcap_df)
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder

from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)

_GA_BINS = [(24, 26, 0), (27, 29, 1), (30, 32, 2), (33, 99, 3)]
_GROUP_CODES = ["ASIB", "PT", "TD"]


def encode_ga_bins(ga_weeks_series: pd.Series) -> pd.Series:
    """Ordinal-encode gestational age into 4 clinical bins.

    Bins:
        - 0: 24–26 weeks
        - 1: 27–29 weeks
        - 2: 30–32 weeks
        - 3: 33+ weeks (including term)

    Args:
        ga_weeks_series: Series of gestational age values in weeks.

    Returns:
        Integer Series with ordinal GA bin codes; NaN for out-of-range values.
    """
    ga = pd.to_numeric(ga_weeks_series, errors="coerce")
    result = pd.Series(np.nan, index=ga.index, dtype="Int64")
    for low, high, code in _GA_BINS:
        mask = (ga >= low) & (ga <= high)
        result[mask] = code
    logger.info("encode_ga_bins: encoded %d GA values.", int(ga.notna().sum()))
    return result


def encode_group_membership(group_code_series: pd.Series) -> pd.DataFrame:
    """One-hot encode ASIB/PT/TD group membership.

    Args:
        group_code_series: Series of group code strings (``'ASIB'``, ``'PT'``, ``'TD'``).

    Returns:
        DataFrame with boolean columns ``group_ASIB``, ``group_PT``, ``group_TD``.
    """
    dummies = pd.get_dummies(group_code_series.astype(str), prefix="group")
    for group in _GROUP_CODES:
        col = f"group_{group}"
        if col not in dummies.columns:
            dummies[col] = False
    ordered_cols = [f"group_{g}" for g in _GROUP_CODES]
    result = dummies[ordered_cols].astype(bool)
    logger.info("encode_group_membership: one-hot encoded %d rows.", len(result))
    return result


def compute_morbidity_score(nicu_df: pd.DataFrame) -> pd.Series:
    """Compute composite NICU morbidity score [0–10] from individual diagnoses.

    Scoring:
        - IVH: grade 0–4 → mapped to 0–4.
        - BPD: none=0, mild=1, moderate=2, severe=3.
        - NEC: present=1.
        - ROP: present=1.
        - Sepsis: present=1.

    Args:
        nicu_df: DataFrame with columns ``ivh_grade``, ``bpd_severity``,
            ``nec``, ``rop``, ``sepsis`` (all numeric or binary).

    Returns:
        Integer Series of composite morbidity scores clipped to [0, 10].
    """
    df = nicu_df.copy()

    ivh = pd.to_numeric(df.get("ivh_grade", 0), errors="coerce").fillna(0).clip(0, 4)
    bpd = pd.to_numeric(df.get("bpd_severity", 0), errors="coerce").fillna(0).clip(0, 3)
    nec = pd.to_numeric(df.get("nec", 0), errors="coerce").fillna(0).clip(0, 1)
    rop = pd.to_numeric(df.get("rop", 0), errors="coerce").fillna(0).clip(0, 1)
    sepsis = pd.to_numeric(df.get("sepsis", 0), errors="coerce").fillna(0).clip(0, 1)

    score = (ivh + bpd + nec + rop + sepsis).clip(0, 10).astype(int)
    logger.info(
        "compute_morbidity_score: mean=%.2f, range=[%d, %d].",
        float(score.mean()), int(score.min()), int(score.max()),
    )
    return score


def encode_ses_indicators(redcap_df: pd.DataFrame) -> pd.DataFrame:
    """Encode socioeconomic status indicators as ordinal features.

    Encodings:
        - ``maternal_education``: 0=<HS, 1=HS/GED, 2=some college, 3=bachelor's, 4=graduate.
        - ``income_bracket``: 0=<$20k, 1=$20–40k, 2=$40–60k, 3=$60–80k, 4=>$80k.
        - ``insurance_type``: 0=none, 1=Medicaid, 2=private.

    Args:
        redcap_df: REDCap export DataFrame with SES columns.

    Returns:
        DataFrame with ordinal-encoded columns
        ``mat_edu_ord``, ``income_ord``, ``insurance_ord``.
    """
    df = redcap_df.copy()

    edu_map = {"<hs": 0, "hs": 1, "ged": 1, "some_college": 2, "bachelors": 3, "graduate": 4}
    income_map = {"<20k": 0, "20-40k": 1, "40-60k": 2, "60-80k": 3, ">80k": 4}
    insurance_map = {"none": 0, "medicaid": 1, "private": 2}

    out = pd.DataFrame(index=df.index)
    out["mat_edu_ord"] = (
        df.get("maternal_education", pd.Series(np.nan, index=df.index))
        .astype(str).str.lower().str.strip().map(edu_map)
    )
    out["income_ord"] = (
        df.get("income_bracket", pd.Series(np.nan, index=df.index))
        .astype(str).str.lower().str.strip().map(income_map)
    )
    out["insurance_ord"] = (
        df.get("insurance_type", pd.Series(np.nan, index=df.index))
        .astype(str).str.lower().str.strip().map(insurance_map)
    )

    logger.info("encode_ses_indicators: encoded SES for %d rows.", len(out))
    return out


def build_demographic_feature_matrix(redcap_df: pd.DataFrame) -> pd.DataFrame:
    """Assemble the full demographic/clinical feature matrix from REDCap data.

    Args:
        redcap_df: REDCap export DataFrame with GA, group, NICU, and SES fields.

    Returns:
        Feature DataFrame with columns:
            - ``ga_bin``: Ordinal GA bin.
            - ``group_ASIB``, ``group_PT``, ``group_TD``: One-hot group flags.
            - ``morbidity_score``: Composite NICU morbidity.
            - ``mat_edu_ord``, ``income_ord``, ``insurance_ord``: SES ordinals.
    """
    df = redcap_df.copy()

    ga_col = "ga_at_birth_weeks" if "ga_at_birth_weeks" in df.columns else df.columns[0]
    ga_bins = encode_ga_bins(df.get(ga_col, pd.Series(np.nan, index=df.index)))

    group_col = "group_code" if "group_code" in df.columns else None
    if group_col:
        group_dummies = encode_group_membership(df[group_col])
    else:
        group_dummies = pd.DataFrame(
            {f"group_{g}": False for g in _GROUP_CODES}, index=df.index
        )

    morbidity = compute_morbidity_score(df)
    ses = encode_ses_indicators(df)

    result = pd.concat(
        [ga_bins.rename("ga_bin"), group_dummies, morbidity.rename("morbidity_score"), ses],
        axis=1,
    )
    logger.info("build_demographic_feature_matrix: %d rows × %d columns.", *result.shape)
    return result
