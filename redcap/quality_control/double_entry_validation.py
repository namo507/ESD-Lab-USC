"""Double-entry validation for NANO Study REDCap data.

Compares two data-entry instances for the same record and flags
discrepancies above a configurable threshold.

In REDCap longitudinal studies, double entry is implemented by:
  1. Having two RAs enter the same data independently under different
     REDCap user accounts or using a second data entry form set.
  2. Exporting both entry instances and running this comparison.

Usage:
    python redcap/quality_control/double_entry_validation.py \
        --entry1 <parquet_entry1> --entry2 <parquet_entry2>
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.utils.config_loader import load_config
from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)


def align_double_entry_datasets(
    df1: pd.DataFrame,
    df2: pd.DataFrame,
    id_cols: list[str] | None = None,
) -> pd.DataFrame:
    """Align two double-entry DataFrames on participant ID and event.

    Args:
        df1: First data entry instance.
        df2: Second data entry instance.
        id_cols: Columns to join on. Defaults to
            ['record_id', 'redcap_event_name'].

    Returns:
        Merged DataFrame with suffixes '_e1' and '_e2' for paired columns.
    """
    if id_cols is None:
        id_cols = [c for c in ["record_id", "redcap_event_name"] if c in df1.columns]

    if not id_cols:
        raise ValueError("No ID columns found for alignment.")

    merged = df1.merge(df2, on=id_cols, suffixes=("_e1", "_e2"), how="inner")
    logger.info(
        "Aligned %d matching records across both entry instances.", len(merged)
    )
    return merged


def compare_fields(
    merged: pd.DataFrame,
    fields_to_compare: list[str] | None = None,
    numeric_tolerance: float = 0.001,
) -> pd.DataFrame:
    """Compare field values between two data entry instances.

    Args:
        merged: Merged DataFrame from align_double_entry_datasets().
        fields_to_compare: List of base field names to compare.
            If None, compares all columns that have both _e1 and _e2 versions.
        numeric_tolerance: Absolute tolerance for numeric comparisons
            (to handle rounding differences).

    Returns:
        DataFrame of discrepancies with columns:
        record_id, redcap_event_name, field, value_e1, value_e2, discrepancy_type.
    """
    if fields_to_compare is None:
        # Auto-detect fields with both _e1 and _e2 versions
        e1_cols = {c.replace("_e1", "") for c in merged.columns if c.endswith("_e1")}
        e2_cols = {c.replace("_e2", "") for c in merged.columns if c.endswith("_e2")}
        fields_to_compare = sorted(e1_cols & e2_cols)

    discrepancies: list[dict[str, Any]] = []

    for field in fields_to_compare:
        col_e1 = f"{field}_e1"
        col_e2 = f"{field}_e2"

        if col_e1 not in merged.columns or col_e2 not in merged.columns:
            continue

        s1 = merged[col_e1]
        s2 = merged[col_e2]

        # Try numeric comparison first
        n1 = pd.to_numeric(s1, errors="coerce")
        n2 = pd.to_numeric(s2, errors="coerce")
        both_numeric = n1.notna() & n2.notna()

        # Numeric discrepancies
        numeric_mismatch = both_numeric & (np.abs(n1 - n2) > numeric_tolerance)
        # String discrepancies (for non-numeric)
        str_mismatch = (
            ~both_numeric
            & s1.notna()
            & s2.notna()
            & (s1.astype(str).str.strip() != s2.astype(str).str.strip())
        )
        # One entry missing
        one_missing = s1.isna() ^ s2.isna()

        for mask, dtype in [
            (numeric_mismatch, "numeric_mismatch"),
            (str_mismatch, "string_mismatch"),
            (one_missing, "one_entry_missing"),
        ]:
            for idx in merged[mask].index:
                record_id = merged.loc[idx, "record_id"] if "record_id" in merged.columns else idx
                event = merged.loc[idx, "redcap_event_name"] if "redcap_event_name" in merged.columns else ""
                discrepancies.append(
                    {
                        "record_id": record_id,
                        "redcap_event_name": event,
                        "field": field,
                        "value_e1": merged.loc[idx, col_e1],
                        "value_e2": merged.loc[idx, col_e2],
                        "discrepancy_type": dtype,
                    }
                )

    df_disc = pd.DataFrame(discrepancies)
    logger.info("Found %d discrepancies across %d fields.", len(df_disc), len(fields_to_compare))
    return df_disc


def compute_agreement_statistics(discrepancies: pd.DataFrame, merged: pd.DataFrame) -> dict[str, Any]:
    """Compute inter-rater agreement statistics.

    Args:
        discrepancies: Output from compare_fields().
        merged: The merged double-entry DataFrame.

    Returns:
        Dict with overall_agreement_pct, n_discrepancies_by_type, fields_with_most_errors.
    """
    if discrepancies.empty:
        return {
            "overall_agreement_pct": 100.0,
            "n_discrepancies_by_type": {},
            "fields_with_most_errors": [],
        }

    total_comparisons = len(merged) * len(discrepancies["field"].unique()) if len(merged) > 0 else 1
    agreement_pct = max(0, (1 - len(discrepancies) / max(total_comparisons, 1)) * 100)

    return {
        "overall_agreement_pct": round(agreement_pct, 2),
        "n_discrepancies_by_type": discrepancies["discrepancy_type"].value_counts().to_dict(),
        "fields_with_most_errors": discrepancies["field"].value_counts().head(10).to_dict(),
    }


def main() -> None:
    """Main entry point for double-entry validation."""
    parser = argparse.ArgumentParser(
        description="NANO Study REDCap double-entry validation"
    )
    parser.add_argument("--entry1", type=str, required=True, help="First entry parquet path")
    parser.add_argument("--entry2", type=str, required=True, help="Second entry parquet path")
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.001,
        help="Numeric tolerance for float comparisons (default: 0.001)",
    )
    args = parser.parse_args()

    df1 = pd.read_parquet(args.entry1)
    df2 = pd.read_parquet(args.entry2)
    logger.info("Entry 1: %d records | Entry 2: %d records", len(df1), len(df2))

    merged = align_double_entry_datasets(df1, df2)
    discrepancies = compare_fields(merged, numeric_tolerance=args.tolerance)
    stats = compute_agreement_statistics(discrepancies, merged)

    logger.info("Agreement statistics: %s", stats)

    config = load_config()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = Path(config["paths"]["outputs"]["tables_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)

    if not discrepancies.empty:
        out_path = output_dir / f"double_entry_discrepancies_{timestamp}.parquet"
        discrepancies.to_parquet(out_path, index=False)
        logger.info("Discrepancies saved to: %s", out_path)
    else:
        logger.info("No discrepancies found — perfect double-entry agreement.")


if __name__ == "__main__":
    main()
