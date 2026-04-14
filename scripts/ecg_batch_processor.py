"""Batch ECG processor for NANO Study physiological data.

Finds all ECG files in the configured raw ECG directory, processes each
through the full preprocessing + HRV feature extraction pipeline using a
multiprocessing pool, and saves results as parquet files.

Usage::

    python scripts/ecg_batch_processor.py [--workers 4] [--dry-run]
"""

from __future__ import annotations

import argparse
import logging
import multiprocessing
import os
import sys
import traceback
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.utils.config_loader import load_config
from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)

ECG_EXTENSIONS = {".csv", ".txt", ".edf", ".bdf", ".parquet"}


def discover_ecg_files(raw_ecg_dir: str | Path) -> list[Path]:
    """Recursively discover all ECG data files in a directory.

    Args:
        raw_ecg_dir: Root directory to search for ECG files.

    Returns:
        Sorted list of Path objects matching known ECG extensions.
    """
    root = Path(raw_ecg_dir)
    if not root.exists():
        logger.warning("raw_ecg_dir does not exist: %s", root)
        return []
    files = sorted(
        p for p in root.rglob("*") if p.suffix.lower() in ECG_EXTENSIONS
    )
    logger.info("Discovered %d ECG files in %s.", len(files), root)
    return files


def load_ecg_file(path: Path) -> Optional[pd.DataFrame]:
    """Load an ECG file into a DataFrame, supporting CSV and parquet formats.

    Args:
        path: Path to the ECG data file.

    Returns:
        DataFrame with at minimum a 'signal' or 'ibi_ms' column, or None on error.
    """
    try:
        if path.suffix.lower() == ".parquet":
            return pd.read_parquet(path)
        return pd.read_csv(path, dtype=float, comment="#")
    except Exception as exc:
        logger.error("Failed to load %s: %s", path.name, exc)
        return None


def process_single_file(args: tuple[Path, Path, bool]) -> dict:
    """Process one ECG file through the full preprocessing and HRV pipeline.

    This function is designed to be called inside a multiprocessing.Pool.

    Args:
        args: Tuple of (ecg_path, output_dir, dry_run).

    Returns:
        Dict with keys 'file', 'status', 'n_features', and optional 'error'.
    """
    ecg_path, output_dir, dry_run = args
    result: dict = {"file": str(ecg_path), "status": "ok", "n_features": 0}

    try:
        df = load_ecg_file(ecg_path)
        if df is None:
            result["status"] = "load_error"
            return result

        # Attempt HRV feature extraction
        if "ibi_ms" in df.columns:
            from src.preprocessing.hrv_features import extract_all_hrv_features

            ibi = df["ibi_ms"].dropna().values
            features = extract_all_hrv_features(ibi)
            features_df = pd.DataFrame([features])
            features_df["source_file"] = ecg_path.name
            features_df["processed_at"] = datetime.now().isoformat()
            result["n_features"] = len(features)
        else:
            # Raw signal path: preprocess first
            from src.preprocessing.ecg_preprocessing import preprocess_ecg_pipeline
            from src.preprocessing.hrv_features import extract_all_hrv_features

            if "signal" not in df.columns:
                result["status"] = "no_signal_column"
                return result

            fs_col = df.attrs.get("sampling_rate", 1024)
            preprocessed = preprocess_ecg_pipeline(df["signal"].values, sampling_rate=fs_col)
            valid_ibi = preprocessed.loc[
                preprocessed["quality_flag"] == 1, "ibi_ms"
            ].values
            features = extract_all_hrv_features(valid_ibi)
            features_df = pd.DataFrame([features])
            features_df["source_file"] = ecg_path.name
            features_df["processed_at"] = datetime.now().isoformat()
            result["n_features"] = len(features)

        if not dry_run:
            output_dir.mkdir(parents=True, exist_ok=True)
            out_path = output_dir / f"{ecg_path.stem}_hrv_features.parquet"
            features_df.to_parquet(out_path, index=False)
            result["output"] = str(out_path)
        else:
            result["output"] = "[dry_run – not written]"

    except ImportError as exc:
        result["status"] = "import_error"
        result["error"] = str(exc)
    except Exception as exc:
        result["status"] = "error"
        result["error"] = traceback.format_exc()
        logger.error("Error processing %s: %s", ecg_path.name, exc)

    return result


def run_batch(
    ecg_files: list[Path],
    output_dir: Path,
    n_workers: int = 4,
    dry_run: bool = False,
) -> pd.DataFrame:
    """Process a list of ECG files in parallel.

    Args:
        ecg_files: List of ECG file paths to process.
        output_dir: Directory where HRV feature parquet files are saved.
        n_workers: Number of parallel worker processes.
        dry_run: If True, skip writing output files.

    Returns:
        Summary DataFrame with one row per processed file.
    """
    try:
        from tqdm import tqdm
        progress = tqdm
    except ImportError:
        progress = iter  # type: ignore[assignment]

    task_args = [(f, output_dir, dry_run) for f in ecg_files]

    with multiprocessing.Pool(processes=n_workers) as pool:
        results = list(progress(pool.imap_unordered(process_single_file, task_args), total=len(task_args)))

    summary = pd.DataFrame(results)
    n_ok = (summary["status"] == "ok").sum()
    logger.info(
        "Batch processing complete: %d/%d files succeeded.", n_ok, len(ecg_files)
    )
    return summary


def main() -> None:
    """Entry point for the ECG batch processor."""
    parser = argparse.ArgumentParser(description="Batch ECG processor for NANO Study.")
    parser.add_argument("--workers", type=int, default=4, help="Number of worker processes.")
    parser.add_argument("--dry-run", action="store_true", help="Skip writing output files.")
    args = parser.parse_args()

    cfg = load_config()
    nano_root = os.environ.get("NANO_DATA_ROOT", "")
    raw_ecg_dir = cfg.get("raw", {}).get("ecg_dir", f"{nano_root}/raw/ecg").replace(
        "${NANO_DATA_ROOT}", nano_root
    )
    output_dir = Path(
        cfg.get("processed", {})
        .get("hrv_features_dir", f"{nano_root}/processed/ecg/hrv_features")
        .replace("${NANO_DATA_ROOT}", nano_root)
    )

    ecg_files = discover_ecg_files(raw_ecg_dir)
    if not ecg_files:
        logger.info("No ECG files found. Exiting.")
        return

    summary = run_batch(ecg_files, output_dir, n_workers=args.workers, dry_run=args.dry_run)
    logger.info("Summary:\n%s", summary["status"].value_counts().to_string())


if __name__ == "__main__":
    main()
