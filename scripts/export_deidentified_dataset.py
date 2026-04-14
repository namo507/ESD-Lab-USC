"""Deidentified dataset exporter for NANO Study.

Loads the merged feature matrix from the processed directory, applies the
full de-identification pipeline, and writes the output to
deidentified/analysis_datasets/ with a timestamp suffix. All transformation
steps are documented in an audit log.

Usage::

    python scripts/export_deidentified_dataset.py [--input <path>] [--dry-run]
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.preprocessing.deidentification import deidentify_dataset
from src.utils.config_loader import load_config
from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)


def _resolve_path(template: str) -> Path:
    """Substitute NANO_DATA_ROOT env var in a path template.

    Args:
        template: Path string potentially containing '${NANO_DATA_ROOT}'.

    Returns:
        Resolved Path object.
    """
    nano_root = os.environ.get("NANO_DATA_ROOT", "")
    return Path(template.replace("${NANO_DATA_ROOT}", nano_root))


def find_latest_feature_matrix(feature_matrix_dir: Path) -> Optional[Path]:
    """Return the most recently modified parquet or CSV file in a directory.

    Args:
        feature_matrix_dir: Directory to search for feature matrix files.

    Returns:
        Path to the latest file, or None if no file found.
    """
    candidates = sorted(
        [*feature_matrix_dir.glob("*.parquet"), *feature_matrix_dir.glob("*.csv")],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None


def load_feature_matrix(path: Path) -> pd.DataFrame:
    """Load a feature matrix from parquet or CSV.

    Args:
        path: Path to the feature matrix file.

    Returns:
        Loaded DataFrame.

    Raises:
        ValueError: If the file format is unsupported.
    """
    logger.info("Loading feature matrix from %s", path)
    if path.suffix == ".parquet":
        return pd.read_parquet(path)
    elif path.suffix == ".csv":
        return pd.read_csv(path, dtype=str)
    else:
        raise ValueError(f"Unsupported file format: {path.suffix}")


def write_audit_log(
    audit_lines: list[str],
    audit_log_dir: Path,
    timestamp: str,
) -> Path:
    """Write transformation audit log to a timestamped text file.

    Args:
        audit_lines: List of audit log lines to write.
        audit_log_dir: Directory where audit logs are stored.
        timestamp: Timestamp string used in the filename.

    Returns:
        Path to the written audit log file.
    """
    audit_log_dir.mkdir(parents=True, exist_ok=True)
    audit_path = audit_log_dir / f"deidentification_audit_{timestamp}.txt"
    audit_path.write_text("\n".join(audit_lines), encoding="utf-8")
    logger.info("Audit log written to %s", audit_path)
    return audit_path


def export_deidentified(
    input_path: Optional[Path] = None,
    output_dir: Optional[Path] = None,
    audit_log_dir: Optional[Path] = None,
    dry_run: bool = False,
) -> dict[str, Path]:
    """Run the deidentification export pipeline.

    Args:
        input_path: Path to the feature matrix to deidentify. If None,
            the latest file in the configured directory is used.
        output_dir: Directory for the deidentified output. If None,
            uses the configured deidentified/analysis_datasets directory.
        audit_log_dir: Directory for the audit log. If None, uses the
            configured deidentified/audit_logs directory.
        dry_run: If True, skip writing output files.

    Returns:
        Dict with keys 'output', 'audit_log' pointing to written files.
    """
    cfg = load_config()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if input_path is None:
        feature_dir = _resolve_path(
            cfg.get("processed", {}).get("feature_matrices_dir", "${NANO_DATA_ROOT}/processed/feature_matrices")
        )
        input_path = find_latest_feature_matrix(feature_dir)
        if input_path is None:
            logger.error("No feature matrix found in %s", feature_dir)
            raise FileNotFoundError(f"No feature matrix in {feature_dir}")

    if output_dir is None:
        output_dir = _resolve_path(
            cfg.get("deidentified", {}).get("analysis_dataset_dir", "${NANO_DATA_ROOT}/deidentified/analysis_datasets")
        )
    if audit_log_dir is None:
        audit_log_dir = _resolve_path(
            cfg.get("deidentified", {}).get("audit_log_dir", "${NANO_DATA_ROOT}/deidentified/audit_logs")
        )

    df = load_feature_matrix(input_path)
    logger.info("Loaded %d rows × %d columns.", *df.shape)

    audit_lines = [
        "=== NANO Study Export De-identification Audit ===",
        f"Timestamp         : {timestamp}",
        f"Source file       : {input_path}",
        f"Input shape       : {df.shape[0]} rows × {df.shape[1]} columns",
        f"Input columns     : {list(df.columns)}",
        "",
    ]

    df_clean = deidentify_dataset(df, audit_log_path=None)

    audit_lines += [
        "Transformations applied:",
        "  [1] strip_phi_fields – DOB, visit dates set to NaN",
        "  [2] replace_dates_with_age_offsets – dates → age_in_days integers",
        "  [3] hash_all_participant_ids – SHA-256 pseudonymisation",
        "",
        f"Output shape : {df_clean.shape[0]} rows × {df_clean.shape[1]} columns",
        f"Output columns: {list(df_clean.columns)}",
    ]

    out_path = output_dir / f"analysis_dataset_deidentified_{timestamp}.parquet"
    audit_path = audit_log_dir / f"deidentification_audit_{timestamp}.txt"

    if not dry_run:
        output_dir.mkdir(parents=True, exist_ok=True)
        df_clean.to_parquet(out_path, index=False)
        logger.info("Deidentified dataset saved to %s", out_path)
        audit_path = write_audit_log(audit_lines, audit_log_dir, timestamp)
    else:
        logger.info("[DRY RUN] Would write output to %s", out_path)
        logger.info("[DRY RUN] Would write audit log to %s", audit_path)

    return {"output": out_path, "audit_log": audit_path}


def main() -> None:
    """Entry point for the deidentified dataset exporter."""
    parser = argparse.ArgumentParser(description="Export deidentified NANO analysis dataset.")
    parser.add_argument("--input", type=Path, default=None, help="Path to input feature matrix.")
    parser.add_argument("--output-dir", type=Path, default=None, help="Output directory.")
    parser.add_argument("--dry-run", action="store_true", help="Skip writing files.")
    args = parser.parse_args()

    paths = export_deidentified(
        input_path=args.input,
        output_dir=args.output_dir,
        dry_run=args.dry_run,
    )
    print(f"Output  : {paths['output']}")
    print(f"Audit   : {paths['audit_log']}")


if __name__ == "__main__":
    main()
