"""HTML data quality report generator for NANO Study.

Loads the latest REDCap export and QC flags, computes completeness
statistics by participant/group/event, and renders a Jinja2 HTML dashboard
saved to reports/data_quality/.

Usage::

    python scripts/generate_data_quality_report.py [--output reports/data_quality/]
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.utils.config_loader import load_config
from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)

# ---------------------------------------------------------------------------
# Inline Jinja2 HTML template
# ---------------------------------------------------------------------------

_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>NANO Study – Data Quality Dashboard</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2rem; color: #333; }
    h1   { color: #73000a; border-bottom: 3px solid #73000a; padding-bottom: .5rem; }
    h2   { color: #555; margin-top: 2rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0 2rem; }
    th    { background: #73000a; color: #fff; padding: 8px 12px; text-align: left; }
    td    { border: 1px solid #ddd; padding: 7px 12px; }
    tr:nth-child(even) { background: #f7f7f7; }
    .box  { background: #f4f4f4; border-left: 4px solid #73000a;
            padding: 1rem; margin-bottom: 1.5rem; border-radius: 4px; }
    .ok   { color: #276625; font-weight: bold; }
    .warn { color: #b07a00; font-weight: bold; }
    .bad  { color: #a00; font-weight: bold; }
  </style>
</head>
<body>
<h1>NANO Study – Data Quality Dashboard</h1>
<div class="box">
  <strong>Generated:</strong> {{ generated_at }}<br>
  <strong>Total participants:</strong> {{ n_participants }}<br>
  <strong>Total records:</strong> {{ n_records }}<br>
  <strong>Source:</strong> {{ source_file }}
</div>

<h2>Completeness by Event</h2>
<table>
  <tr><th>Event</th><th>N Present</th><th>N Expected</th><th>% Complete</th></tr>
  {% for row in completeness_by_event %}
  <tr>
    <td>{{ row.event }}</td>
    <td>{{ row.n_present }}</td>
    <td>{{ row.n_expected }}</td>
    <td class="{{ 'ok' if row.pct >= 90 else ('warn' if row.pct >= 70 else 'bad') }}">
      {{ "%.1f"|format(row.pct) }}%
    </td>
  </tr>
  {% endfor %}
</table>

<h2>Completeness by Group</h2>
<table>
  <tr><th>Group</th><th>N</th><th>Mean % Complete</th></tr>
  {% for row in completeness_by_group %}
  <tr>
    <td>{{ row.group }}</td>
    <td>{{ row.n }}</td>
    <td class="{{ 'ok' if row.pct >= 90 else ('warn' if row.pct >= 70 else 'bad') }}">
      {{ "%.1f"|format(row.pct) }}%
    </td>
  </tr>
  {% endfor %}
</table>

<h2>Outlier Flags Summary</h2>
<table>
  <tr><th>Column</th><th>N Outliers</th></tr>
  {% for row in outlier_summary %}
  <tr><td>{{ row.col }}</td><td>{{ row.n }}</td></tr>
  {% endfor %}
</table>

<h2>Imputation Status</h2>
<table>
  <tr><th>Column</th><th>N Missing</th><th>% Missing</th><th>Status</th></tr>
  {% for row in imputation_status %}
  <tr>
    <td>{{ row.col }}</td>
    <td>{{ row.n_missing }}</td>
    <td>{{ "%.1f"|format(row.pct_missing) }}%</td>
    <td>{{ row.status }}</td>
  </tr>
  {% endfor %}
</table>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def _load_latest_export(cfg: dict[str, Any]) -> pd.DataFrame:
    """Load the most recent REDCap export parquet or CSV.

    Args:
        cfg: Loaded paths configuration dict.

    Returns:
        DataFrame of REDCap records, or an empty stub if no file found.
    """
    nano_root = os.environ.get("NANO_DATA_ROOT", "")
    export_dir = Path(
        cfg.get("redcap", {})
        .get("latest_export_dir", f"{nano_root}/redcap_exports/latest")
        .replace("${NANO_DATA_ROOT}", nano_root)
    )

    for ext in ("*.parquet", "*.csv"):
        files = sorted(export_dir.glob(ext))
        if files:
            path = files[-1]
            logger.info("Loading REDCap export: %s", path)
            return (pd.read_parquet(path) if path.suffix == ".parquet"
                    else pd.read_csv(path, dtype=str))

    logger.warning("No REDCap export found in %s; using empty DataFrame.", export_dir)
    return pd.DataFrame(columns=["record_id", "redcap_event_name", "group_code"])


def _compute_completeness_by_event(df: pd.DataFrame) -> list[dict]:
    """Compute per-event completeness statistics.

    Args:
        df: REDCap records DataFrame.

    Returns:
        List of dicts with keys event, n_present, n_expected, pct.
    """
    rows = []
    if "redcap_event_name" not in df.columns:
        return rows
    n_participants = df["record_id"].nunique() if "record_id" in df.columns else len(df)
    for event, grp in df.groupby("redcap_event_name"):
        pct = grp.notna().mean().mean() * 100
        rows.append(
            {
                "event": event,
                "n_present": grp["record_id"].nunique() if "record_id" in grp.columns else len(grp),
                "n_expected": n_participants,
                "pct": round(pct, 1),
            }
        )
    return rows


def _compute_completeness_by_group(df: pd.DataFrame) -> list[dict]:
    """Compute per-group completeness statistics.

    Args:
        df: REDCap records DataFrame.

    Returns:
        List of dicts with keys group, n, pct.
    """
    rows = []
    if "group_code" not in df.columns:
        return rows
    for group, grp in df.groupby("group_code"):
        pct = grp.notna().mean().mean() * 100
        rows.append({"group": group, "n": len(grp), "pct": round(pct, 1)})
    return rows


def _compute_outlier_summary(df: pd.DataFrame, n_sd: float = 3.5) -> list[dict]:
    """Flag numeric columns with values beyond n_sd standard deviations.

    Args:
        df: Input DataFrame.
        n_sd: Number of standard deviations for outlier threshold.

    Returns:
        List of dicts with keys col, n.
    """
    rows = []
    for col in df.select_dtypes(include="number").columns:
        col_data = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(col_data) < 5:
            continue
        z = (col_data - col_data.mean()).abs() / (col_data.std() + 1e-9)
        n_outliers = int((z > n_sd).sum())
        if n_outliers > 0:
            rows.append({"col": col, "n": n_outliers})
    return rows


def _compute_imputation_status(df: pd.DataFrame) -> list[dict]:
    """Summarise missingness per column.

    Args:
        df: Input DataFrame.

    Returns:
        List of dicts with keys col, n_missing, pct_missing, status.
    """
    rows = []
    for col in df.columns:
        n_missing = int(df[col].isna().sum())
        if n_missing == 0:
            continue
        pct = n_missing / len(df) * 100
        status = "High – MNAR risk" if pct > 40 else ("Moderate – MAR candidate" if pct > 10 else "Low – MCAR likely")
        rows.append({"col": col, "n_missing": n_missing, "pct_missing": round(pct, 1), "status": status})
    return rows


def generate_report(output_dir: Path, dry_run: bool = False) -> Path:
    """Generate the HTML data quality report.

    Args:
        output_dir: Directory where the report HTML is saved.
        dry_run: If True, return the path without writing the file.

    Returns:
        Path to the generated (or would-be) HTML report.
    """
    try:
        from jinja2 import Template
    except ImportError as exc:
        logger.error("jinja2 is required: %s", exc)
        raise

    cfg = load_config()
    df = _load_latest_export(cfg)

    context: dict[str, Any] = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "n_participants": df["record_id"].nunique() if "record_id" in df.columns else 0,
        "n_records": len(df),
        "source_file": str(cfg.get("redcap", {}).get("latest_export_dir", "unknown")),
        "completeness_by_event": _compute_completeness_by_event(df),
        "completeness_by_group": _compute_completeness_by_group(df),
        "outlier_summary": _compute_outlier_summary(df),
        "imputation_status": _compute_imputation_status(df),
    }

    html = Template(_HTML_TEMPLATE).render(**context)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / f"data_quality_report_{timestamp}.html"

    if not dry_run:
        out_path.write_text(html, encoding="utf-8")
        logger.info("Report saved to %s", out_path)
    else:
        logger.info("[DRY RUN] Would write report to %s", out_path)

    return out_path


def main() -> None:
    """Entry point for the data quality report generator."""
    parser = argparse.ArgumentParser(description="Generate NANO data quality HTML report.")
    parser.add_argument(
        "--output",
        default="reports/data_quality",
        help="Output directory for the HTML report.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Do not write file.")
    args = parser.parse_args()

    out_path = generate_report(Path(args.output), dry_run=args.dry_run)
    print(f"Report: {out_path}")


if __name__ == "__main__":
    main()
