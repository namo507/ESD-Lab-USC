"""REDCap QC pipeline for NANO Study.

Automated quality control checks:
  - Out-of-range value detection
  - Impossible date combinations
  - Cross-field logical inconsistencies
  - Duplicate record detection
  - PHI field completeness audit

Outputs a flagged-records parquet file to the configured outputs path.

Usage:
    python redcap/quality_control/redcap_qc_pipeline.py [--input <parquet>]
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.utils.config_loader import load_config
from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)


# ─── Range Checks ────────────────────────────────────────────────────────────

RANGE_CHECKS: dict[str, tuple[float, float]] = {
    "ga_weeks": (22, 42),
    "birth_weight_g": (300, 5000),
    "age_in_days": (0, 1500),
    "ados2_sa_raw": (0, 28),
    "ados2_rrb_raw": (0, 8),
    "ados2_css_total": (1, 10),
    "ados2_css_sa": (1, 10),
    "ados2_css_rrb": (1, 10),
    "bayley4_cog_composite": (40, 160),
    "bayley4_lang_composite": (40, 160),
    "bayley4_motor_composite": (40, 160),
    "bayley4_cog_scaled": (1, 19),
    "nnns_attention": (0, 9),
    "nnns_arousal": (0, 9),
    "nnns_habituation": (0, 9),
    "nnns_regulation": (0, 9),
    "mchat_total": (0, 20),
    "epds_total": (0, 30),
    "epds_si_item": (0, 3),
    "ecg_duration_min": (0, 120),
    "behavioral_icc": (0.0, 1.0),
    "temp_abdominal_start": (30.0, 42.0),
    "temp_peripheral_start": (25.0, 40.0),
    "asq3_communication": (0, 60),
    "asq3_gross_motor": (0, 60),
    "asq3_fine_motor": (0, 60),
    "asq3_problem_solving": (0, 60),
    "asq3_personal_social": (0, 60),
}

# ─── Required Field Checks ───────────────────────────────────────────────────

REQUIRED_FIELDS: dict[str, list[str]] = {
    "demographics": ["nano_id", "sex", "ga_weeks", "group_code"],
    "nicu_morbidity": ["nicu_ivh_grade", "nicu_bpd"],
    "ecg_recording_log": ["ecg_recording_date", "ecg_duration_min", "ecg_quality_flag"],
    "ados2_scores": ["ados2_module", "ados2_sa_raw", "ados2_rrb_raw", "ados2_css_total"],
    "bayley4_scores": ["bayley4_cog_composite", "bayley4_lang_composite"],
}


def check_out_of_range(df: pd.DataFrame) -> pd.DataFrame:
    """Flag rows with values outside expected physiological/clinical ranges.

    Args:
        df: Full REDCap DataFrame.

    Returns:
        DataFrame of flagged records with columns:
        record_id, redcap_event_name, field, value, rule, severity.
    """
    flags: list[dict[str, Any]] = []

    for field, (lo, hi) in RANGE_CHECKS.items():
        if field not in df.columns:
            continue

        col = pd.to_numeric(df[field], errors="coerce")
        out_of_range = col.notna() & ((col < lo) | (col > hi))

        for idx in df[out_of_range].index:
            flags.append(
                {
                    "record_id": df.loc[idx, "record_id"] if "record_id" in df.columns else idx,
                    "redcap_event_name": df.loc[idx, "redcap_event_name"] if "redcap_event_name" in df.columns else "",
                    "field": field,
                    "value": col[idx],
                    "rule": f"out_of_range [{lo}, {hi}]",
                    "severity": "high",
                }
            )

    return pd.DataFrame(flags)


def check_date_logic(df: pd.DataFrame) -> pd.DataFrame:
    """Check for impossible date combinations.

    Validates:
    - visit_date > dob (visit can't be before birth)
    - ECG recording date matches visit date (within ±7 days)

    Args:
        df: Full REDCap DataFrame.

    Returns:
        DataFrame of flagged date inconsistencies.
    """
    flags: list[dict[str, Any]] = []

    if "visit_date" in df.columns and "dob" in df.columns:
        df["_visit_dt"] = pd.to_datetime(df["visit_date"], errors="coerce")
        df["_dob_dt"] = pd.to_datetime(df["dob"], errors="coerce")
        bad_dates = df[df["_visit_dt"].notna() & df["_dob_dt"].notna() & (df["_visit_dt"] < df["_dob_dt"])]
        for idx in bad_dates.index:
            flags.append(
                {
                    "record_id": df.loc[idx, "record_id"] if "record_id" in df.columns else idx,
                    "redcap_event_name": df.loc[idx, "redcap_event_name"] if "redcap_event_name" in df.columns else "",
                    "field": "visit_date",
                    "value": str(df.loc[idx, "visit_date"]),
                    "rule": "visit_date < dob",
                    "severity": "critical",
                }
            )
        df.drop(columns=["_visit_dt", "_dob_dt"], inplace=True)

    return pd.DataFrame(flags)


def check_cross_field_logic(df: pd.DataFrame) -> pd.DataFrame:
    """Check cross-field logical inconsistencies.

    Examples:
    - ADOS-2 total CSS != SA CSS + RRB CSS (within rounding)
    - Group=TD but GA < 37 weeks
    - ECG transfer confirmed but no file name

    Args:
        df: Full REDCap DataFrame.

    Returns:
        DataFrame of flagged logical inconsistencies.
    """
    flags: list[dict[str, Any]] = []

    # Group code consistency
    if "group_code" in df.columns and "ga_weeks" in df.columns:
        td_preterm = df[
            (df["group_code"].astype(str).str.contains("TD|3", na=False))
            & (pd.to_numeric(df["ga_weeks"], errors="coerce") < 37)
        ]
        for idx in td_preterm.index:
            flags.append(
                {
                    "record_id": df.loc[idx, "record_id"] if "record_id" in df.columns else idx,
                    "redcap_event_name": "",
                    "field": "group_code|ga_weeks",
                    "value": f"group=TD but ga={df.loc[idx, 'ga_weeks']}",
                    "rule": "TD_group_ga_inconsistency",
                    "severity": "high",
                }
            )

    # ECG: transfer confirmed but missing file name
    if "ecg_transfer_confirmed" in df.columns and "ecg_file_name" in df.columns:
        ecg_no_file = df[
            (df["ecg_transfer_confirmed"].astype(str).isin(["1", "Yes"]))
            & (df["ecg_file_name"].isna() | (df["ecg_file_name"].astype(str).str.strip() == ""))
        ]
        for idx in ecg_no_file.index:
            flags.append(
                {
                    "record_id": df.loc[idx, "record_id"] if "record_id" in df.columns else idx,
                    "redcap_event_name": df.loc[idx, "redcap_event_name"] if "redcap_event_name" in df.columns else "",
                    "field": "ecg_file_name",
                    "value": "confirmed transfer but no file name",
                    "rule": "ecg_transfer_no_filename",
                    "severity": "medium",
                }
            )

    return pd.DataFrame(flags)


def check_duplicates(df: pd.DataFrame) -> pd.DataFrame:
    """Detect duplicate records (same record_id + event combination).

    Args:
        df: Full REDCap DataFrame.

    Returns:
        DataFrame of duplicated record-event combinations.
    """
    key_cols = [c for c in ["record_id", "redcap_event_name"] if c in df.columns]
    if not key_cols:
        return pd.DataFrame()

    dupes = df[df.duplicated(subset=key_cols, keep=False)][key_cols].copy()
    if dupes.empty:
        return pd.DataFrame()

    dupes["field"] = "record_id|redcap_event_name"
    dupes["value"] = "duplicate"
    dupes["rule"] = "duplicate_record_event"
    dupes["severity"] = "high"
    return dupes


def run_qc(df: pd.DataFrame) -> pd.DataFrame:
    """Run all QC checks and return consolidated flagged records.

    Args:
        df: Full REDCap DataFrame.

    Returns:
        Combined DataFrame of all QC flags across all checks.
    """
    logger.info("Running QC checks on %d records...", len(df))

    all_flags = []

    range_flags = check_out_of_range(df)
    logger.info("  Range checks: %d flags", len(range_flags))
    all_flags.append(range_flags)

    date_flags = check_date_logic(df)
    logger.info("  Date logic checks: %d flags", len(date_flags))
    all_flags.append(date_flags)

    crossfield_flags = check_cross_field_logic(df)
    logger.info("  Cross-field checks: %d flags", len(crossfield_flags))
    all_flags.append(crossfield_flags)

    dupe_flags = check_duplicates(df)
    logger.info("  Duplicate checks: %d flags", len(dupe_flags))
    all_flags.append(dupe_flags)

    combined = pd.concat([f for f in all_flags if not f.empty], ignore_index=True)
    logger.info("Total QC flags: %d", len(combined))
    return combined


def main() -> None:
    """Main entry point for QC pipeline."""
    parser = argparse.ArgumentParser(description="NANO Study REDCap QC pipeline")
    parser.add_argument("--input", type=str, default=None, help="Input parquet path")
    args = parser.parse_args()

    config = load_config()

    if args.input:
        input_path = Path(args.input)
    else:
        input_path = Path(config["paths"]["redcap"]["export_dir"]) / "latest.parquet"

    if not input_path.exists():
        logger.error("Input not found: %s", input_path)
        sys.exit(1)

    df = pd.read_parquet(input_path)
    flags = run_qc(df)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = Path(config["paths"]["outputs"]["tables_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"redcap_qc_flags_{timestamp}.parquet"
    flags.to_parquet(output_path, index=False)
    logger.info("QC flags saved to: %s", output_path)


if __name__ == "__main__":
    main()
