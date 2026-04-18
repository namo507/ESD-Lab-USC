"""REDCap audit module — completeness and data quality summary.

Checks completeness by participant and event, flags missing records,
and generates an HTML summary report for PI review.

Usage:
    python redcap/api/redcap_audit.py [--output reports/data_quality/]
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from dotenv import load_dotenv
from jinja2 import Template

load_dotenv()

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from src.utils.config_loader import load_config
from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)

# ─── HTML Report Template ────────────────────────────────────────────────────

REPORT_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>NANO Study REDCap Audit Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2rem; }
    h1 { color: #73000a; }
    h2 { color: #555; border-bottom: 1px solid #ccc; padding-bottom: 0.3rem; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #73000a; color: white; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .flag-high { background-color: #ffe0e0; color: #a00; font-weight: bold; }
    .flag-med  { background-color: #fff3cd; }
    .flag-ok   { background-color: #d4edda; }
    .summary-box { background: #f4f4f4; border-left: 4px solid #73000a;
                   padding: 1rem; margin-bottom: 1.5rem; }
  </style>
</head>
<body>
<h1>NANO Study — REDCap Data Completeness Audit</h1>
<div class="summary-box">
  <strong>Generated:</strong> {{ timestamp }}<br>
  <strong>Total Participants:</strong> {{ n_participants }}<br>
  <strong>Total Records:</strong> {{ n_records }}<br>
  <strong>Events Audited:</strong> {{ n_events }}
</div>

<h2>Completeness by Event</h2>
{{ event_table }}

<h2>Participants with Missing Required Instruments</h2>
{{ missing_table }}

<h2>Records Flagged for Review</h2>
{{ flagged_table }}

<p style="color:#666; font-size:0.85em;">
  HIPAA NOTICE: This report contains de-identified aggregate statistics only.
  Participant IDs are masked. Do not share outside the study team.
</p>
</body>
</html>
"""


def compute_completeness(
    df: pd.DataFrame,
    events: list[str],
    required_fields_by_event: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    """Compute completeness statistics by event and participant.

    Args:
        df: DataFrame with all REDCap records. Must contain
            'record_id' and 'redcap_event_name' columns.
        events: List of event names to audit.
        required_fields_by_event: Optional dict mapping event names to
            lists of required field names for that event.

    Returns:
        Dict with 'by_event' (completeness per event) and
        'missing_records' (participants missing expected records).
    """
    results: dict[str, Any] = {
        "by_event": {},
        "missing_records": [],
        "n_participants": df["record_id"].nunique(),
        "n_records": len(df),
        "n_events": len(events),
    }

    all_participants = df["record_id"].unique()

    for event in events:
        event_df = df[df["redcap_event_name"] == event]
        n_expected = len(all_participants)
        n_present = event_df["record_id"].nunique()
        missing_ids = set(all_participants) - set(event_df["record_id"].unique())

        if required_fields_by_event and event in required_fields_by_event:
            req_fields = [
                f for f in required_fields_by_event[event] if f in event_df.columns
            ]
            if req_fields:
                pct_complete = (
                    event_df[req_fields].notna().all(axis=1).mean() * 100
                )
            else:
                pct_complete = float("nan")
        else:
            if len(event_df) > 0:
                pct_complete = event_df.notna().mean().mean() * 100
            else:
                pct_complete = 0.0

        results["by_event"][event] = {
            "n_expected": n_expected,
            "n_present": n_present,
            "n_missing": len(missing_ids),
            "pct_enrolled": round(n_present / n_expected * 100, 1) if n_expected else 0,
            "pct_complete": round(pct_complete, 1),
        }

        for pid in missing_ids:
            results["missing_records"].append(
                {"record_id": pid, "missing_event": event}
            )

    return results


def generate_html_report(audit_results: dict[str, Any], output_path: Path) -> None:
    """Render and save the HTML audit report.

    Args:
        audit_results: Output from compute_completeness().
        output_path: Path where HTML report will be saved.
    """
    # Build event completeness table
    event_rows = []
    for event, stats in audit_results["by_event"].items():
        css_class = (
            "flag-high"
            if stats["pct_enrolled"] < 70
            else ("flag-med" if stats["pct_enrolled"] < 85 else "flag-ok")
        )
        event_rows.append(
            f"<tr class='{css_class}'>"
            f"<td>{event}</td>"
            f"<td>{stats['n_expected']}</td>"
            f"<td>{stats['n_present']}</td>"
            f"<td>{stats['n_missing']}</td>"
            f"<td>{stats['pct_enrolled']}%</td>"
            f"<td>{stats['pct_complete']}%</td>"
            "</tr>"
        )
    event_header = (
        "<table><tr><th>Event</th><th>Expected</th><th>Present</th>"
        "<th>Missing</th><th>% Enrolled</th><th>% Complete</th></tr>"
    )
    event_table = event_header + "".join(event_rows) + "</table>"

    # Missing records table (mask IDs with first/last chars)
    missing_records = audit_results["missing_records"]
    if missing_records:
        missing_rows = []
        for rec in missing_records[:100]:  # limit display
            pid = str(rec["record_id"])
            masked = pid[:4] + "****" if len(pid) > 4 else "****"
            missing_rows.append(
                f"<tr><td>{masked}</td><td>{rec['missing_event']}</td></tr>"
            )
        missing_table = (
            "<table><tr><th>Participant (masked)</th><th>Missing Event</th></tr>"
            + "".join(missing_rows)
            + "</table>"
        )
        if len(missing_records) > 100:
            missing_table += f"<p>... and {len(missing_records)-100} more.</p>"
    else:
        missing_table = "<p>No missing records detected.</p>"

    flagged_table = "<p>Run QC pipeline for detailed flagged records.</p>"

    template = Template(REPORT_TEMPLATE)
    html = template.render(
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        n_participants=audit_results["n_participants"],
        n_records=audit_results["n_records"],
        n_events=audit_results["n_events"],
        event_table=event_table,
        missing_table=missing_table,
        flagged_table=flagged_table,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")
    logger.info("Audit report saved to: %s", output_path)


def main() -> None:
    """Main entry point for REDCap audit script."""
    parser = argparse.ArgumentParser(description="NANO Study REDCap audit")
    parser.add_argument(
        "--input",
        type=str,
        default=None,
        help="Path to REDCap export parquet file (uses latest if not specified)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="reports/data_quality",
        help="Output directory for HTML report",
    )
    args = parser.parse_args()

    config = load_config()

    if args.input:
        input_path = Path(args.input)
    else:
        export_dir = Path(config["paths"]["redcap"]["export_dir"])
        input_path = export_dir / "latest.parquet"

    if not input_path.exists():
        logger.error("Input file not found: %s. Run redcap_pull.py first.", input_path)
        sys.exit(1)

    df = pd.read_parquet(input_path)
    logger.info("Loaded %d records from %s", len(df), input_path)

    # Load event names from config
    redcap_cfg_path = Path("config/redcap_config.yml")
    with open(redcap_cfg_path) as f:
        import yaml
        redcap_cfg = yaml.safe_load(f)

    events = [e["event_name"] for e in redcap_cfg.get("events", [])]
    audit_results = compute_completeness(df, events)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = Path(args.output) / f"redcap_audit_{timestamp}.html"
    generate_html_report(audit_results, output_path)


if __name__ == "__main__":
    main()
