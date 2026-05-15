"""Materialize repo-local dashboard inputs for local development.

This script creates deterministic, deidentified dashboard source files under
the repository so the production dashboard aggregation pipeline can run in a
local workspace without access to the USC secure mount.

Outputs:

- ``data/processed/redcap_latest.csv``
- ``data/processed/feature_matrix.csv``
- ``models/_metrics.json``

Each row includes ``dashboard_input_source=repo_demo_inputs`` so downstream
code can label the resulting dashboard payload honestly.
"""
from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from dashboard.pipelines import generate_synthetic_dashboard_data as synthetic


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REDCAP_OUTPUT = PROJECT_ROOT / "data" / "processed" / "redcap_latest.csv"
DEFAULT_FEATURE_OUTPUT = PROJECT_ROOT / "data" / "processed" / "feature_matrix.csv"
DEFAULT_METRICS_OUTPUT = PROJECT_ROOT / "models" / "_metrics.json"
SOURCE_LABEL = "repo_demo_inputs"

INSTRUMENTS = [
    "demographics",
    "nicu_morbidity",
    "nnns_attention_1_3m",
    "ecg_recording_log",
    "temperature_recording_log",
    "behavioral_coding_log",
    "csbs_social_communication",
    "bayley4_scores",
    "ados2_scores",
    "mchat_r_tf",
    "asq3_milestones",
    "prapare_sdoh",
    "epds_maternal_depression",
    "hmet_recording_log",
]


def _atomic_write_json(output_path: Path, payload: dict[str, Any]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    temp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    temp_path.replace(output_path)


def _month_starts(total_months: int) -> list[date]:
    today = date.today().replace(day=1)
    starts: list[date] = []
    for offset in range(total_months - 1, -1, -1):
        year = today.year
        month = today.month - offset
        while month <= 0:
            month += 12
            year -= 1
        while month > 12:
            month -= 12
            year += 1
        starts.append(date(year, month, 1))
    return starts


def _event_completion_probability(group: str, month: int) -> float:
    base = {"ASIB": 0.91, "PT": 0.94, "TD": 0.98}[group]
    attrition = 0.01 * month
    if month == 24:
        attrition += 0.04
    return max(0.55, base - attrition)


def _month_label_to_date(month_label: str, rng: np.random.Generator) -> date:
    year, month = [int(part) for part in month_label.split("-")]
    day = int(rng.integers(1, 28))
    return date(year, month, day)


def _generate_participants(rng: np.random.Generator) -> list[dict[str, Any]]:
    enrollment = synthetic.generate_enrollment()
    month_labels = enrollment["months"]
    participants: list[dict[str, Any]] = []
    next_record_id = 1001

    for group, group_payload in enrollment["by_group"].items():
        cumulative = group_payload["monthly"]
        increments = [cumulative[0], *[curr - prev for prev, curr in zip(cumulative[:-1], cumulative[1:])]]

        for month_label, increment in zip(month_labels, increments):
            for _ in range(int(max(0, increment))):
                ga_weeks = int(rng.integers(24, 33) if group != "TD" else rng.integers(37, 41))
                birth_weight_mean = 1650 if group != "TD" else 3325
                participants.append({
                    "record_id": next_record_id,
                    "group": group,
                    "enrollment_date": _month_label_to_date(month_label, rng),
                    "ga_weeks": ga_weeks,
                    "birth_weight_g": int(np.clip(rng.normal(birth_weight_mean, 375), 450, 5200)),
                    "sex": "M" if rng.random() < 0.52 else "F",
                    "withdrawn": False,
                })
                next_record_id += 1

    withdrawn_count = min(15, len(participants))
    for participant in rng.choice(participants, size=withdrawn_count, replace=False):
        participant["withdrawn"] = True

    participants.sort(key=lambda item: (item["enrollment_date"], item["group"], item["record_id"]))
    return participants


def _build_redcap_records(participants: list[dict[str, Any]], rng: np.random.Generator) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    now = datetime.now().date()

    for participant in participants:
        completed_events: list[tuple[str, str]] = []
        participant_rows: list[dict[str, Any]] = []
        months_since_enrollment = max(
            0,
            (now.year - participant["enrollment_date"].year) * 12 + (now.month - participant["enrollment_date"].month),
        )

        for event_name, event_month, event_label in synthetic.EVENTS:
            if event_month > months_since_enrollment:
                continue

            if event_name == "nicu_admission":
                visit_completed = 1
            else:
                visit_completed = int(rng.random() < _event_completion_probability(participant["group"], event_month))

            if participant["withdrawn"] and event_month >= 12:
                visit_completed = 0

            row = {
                "record_id": participant["record_id"],
                "redcap_event_name": event_name,
                "group_assignment": participant["group"],
                "dashboard_input_source": SOURCE_LABEL,
                "enrollment_date": participant["enrollment_date"].isoformat() if event_name == "nicu_admission" else None,
                "visit_completed": visit_completed,
                "withdrawn": int(event_name == "nicu_admission" and participant["withdrawn"]),
                "open_query": int(rng.random() < (0.06 if visit_completed else 0.02)),
                "pi_review_needed": int(rng.random() < 0.03),
                "double_entry_pending": int(rng.random() < 0.02),
                "double_entry_mismatch": int(rng.random() < 0.015),
                "value_out_of_range": int(rng.random() < 0.025),
                "ecg_transfer_late": int(event_month in {0, 1, 2, 3, 6, 9, 12} and rng.random() < 0.035),
                "temp_quality_rejected": int(event_month in {0, 1, 2, 3, 6, 9, 12} and rng.random() < 0.02),
                "ga_weeks": participant["ga_weeks"],
                "birth_weight_g": participant["birth_weight_g"],
                "sex": participant["sex"],
                "last_completed_event": event_label,
                "record_completeness_pct": 0.0,
                "qc_status": "OK",
            }

            for instrument in INSTRUMENTS:
                complete_col = f"{instrument}_complete"
                if visit_completed:
                    completion_probability = 0.9
                    if instrument in {"behavioral_coding_log", "hmet_recording_log"}:
                        completion_probability -= 0.12
                    if instrument in {"prapare_sdoh", "epds_maternal_depression"}:
                        completion_probability -= 0.08
                    row[complete_col] = 2 if rng.random() < completion_probability else 1
                else:
                    row[complete_col] = 0

            if visit_completed:
                completed_events.append((event_name, event_label))
            participant_rows.append(row)

        if not participant_rows:
            continue

        completeness_cols = [key for key in participant_rows[0] if key.endswith("_complete")]
        completeness_values = [
            100.0 * (row[col] == 2)
            for row in participant_rows
            for col in completeness_cols
        ]
        completeness_pct = round(float(np.mean(completeness_values)), 1) if completeness_values else 0.0
        last_completed_event = completed_events[-1][1] if completed_events else "NICU Admission"
        qc_status = "Review" if any(
            row["open_query"] or row["pi_review_needed"] or row["double_entry_mismatch"]
            for row in participant_rows
        ) else "OK"

        for row in participant_rows:
            row["last_completed_event"] = last_completed_event
            row["record_completeness_pct"] = completeness_pct
            row["qc_status"] = qc_status
            rows.append(row)

    return pd.DataFrame(rows)


def _build_feature_matrix(redcap_df: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    feature_rows: list[dict[str, Any]] = []
    event_month_map = {event: month for event, month, _ in synthetic.EVENTS}

    participant_offsets: dict[int, dict[str, float]] = {}
    biomarker_slopes = {
        "rsa": {"ASIB": 0.038, "PT": 0.081, "TD": 0.109},
        "rmssd": {"ASIB": 0.62, "PT": 1.09, "TD": 1.38},
        "sdnn": {"ASIB": 0.71, "PT": 1.18, "TD": 1.47},
        "hda_sa_pct": {"ASIB": -1.45, "PT": -3.95, "TD": -5.45},
    }
    biomarker_bases = {"rsa": 3.15, "rmssd": 28.0, "sdnn": 35.5, "hda_sa_pct": 452.0}

    completed_rows = redcap_df[redcap_df["visit_completed"] == 1].copy()
    for row in completed_rows.itertuples(index=False):
        record_id = int(row.record_id)
        event_name = str(row.redcap_event_name)
        month = int(event_month_map[event_name])
        group = str(row.group_assignment)
        participant_offsets.setdefault(
            record_id,
            {
                "rsa": float(rng.normal(0, 0.11)),
                "rmssd": float(rng.normal(0, 2.2)),
                "sdnn": float(rng.normal(0, 2.8)),
                "hda_sa_pct": float(rng.normal(0, 24.0)),
            },
        )
        offsets = participant_offsets[record_id]

        feature_rows.append({
            "record_id": record_id,
            "event": event_name,
            "month": month,
            "group": group,
            "dashboard_input_source": SOURCE_LABEL,
            "rsa": round(biomarker_bases["rsa"] + biomarker_slopes["rsa"][group] * month + offsets["rsa"] + rng.normal(0, 0.08), 3),
            "rmssd": round(biomarker_bases["rmssd"] + biomarker_slopes["rmssd"][group] * month + offsets["rmssd"] + rng.normal(0, 1.3), 3),
            "sdnn": round(biomarker_bases["sdnn"] + biomarker_slopes["sdnn"][group] * month + offsets["sdnn"] + rng.normal(0, 1.6), 3),
            "hda_sa_pct": round(biomarker_bases["hda_sa_pct"] + biomarker_slopes["hda_sa_pct"][group] * month + offsets["hda_sa_pct"] + rng.normal(0, 18.0), 3),
            "cptd_mean": round(2.8 + {"ASIB": 0.24, "PT": 0.12, "TD": 0.05}[group] + rng.normal(0, 0.18), 3),
            "sample_entropy": round(1.35 + rng.normal(0, 0.08), 3),
            "sd1": round(18.0 + month * 0.22 + rng.normal(0, 1.1), 3),
            "sd2": round(36.0 + month * 0.28 + rng.normal(0, 1.7), 3),
            "nnns_attention": round(5.5 + rng.normal(0, 1.0), 3),
            "mchat_total": round(max(0.0, rng.normal(2.6 if group == "ASIB" else 1.4, 1.0)), 3),
            "bayley_cog": round(rng.normal(92 if group == "ASIB" else 101, 9), 3),
        })

    return pd.DataFrame(feature_rows)


def materialize_demo_inputs(
    redcap_output: Path = DEFAULT_REDCAP_OUTPUT,
    feature_output: Path = DEFAULT_FEATURE_OUTPUT,
    metrics_output: Path = DEFAULT_METRICS_OUTPUT,
) -> dict[str, Path]:
    rng = np.random.default_rng(synthetic.SEED)
    participants = _generate_participants(rng)
    redcap_df = _build_redcap_records(participants, rng)
    feature_df = _build_feature_matrix(redcap_df, rng)
    metrics = synthetic.generate_ml_performance()

    redcap_output.parent.mkdir(parents=True, exist_ok=True)
    feature_output.parent.mkdir(parents=True, exist_ok=True)
    metrics_output.parent.mkdir(parents=True, exist_ok=True)

    redcap_df.to_csv(redcap_output, index=False)
    feature_df.to_csv(feature_output, index=False)
    _atomic_write_json(metrics_output, metrics)

    return {
        "redcap": redcap_output,
        "feature_matrix": feature_output,
        "metrics": metrics_output,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Materialize repo-local dashboard demo inputs.")
    parser.add_argument("--redcap-output", type=Path, default=DEFAULT_REDCAP_OUTPUT)
    parser.add_argument("--feature-output", type=Path, default=DEFAULT_FEATURE_OUTPUT)
    parser.add_argument("--metrics-output", type=Path, default=DEFAULT_METRICS_OUTPUT)
    args = parser.parse_args(argv)

    paths = materialize_demo_inputs(
        redcap_output=args.redcap_output,
        feature_output=args.feature_output,
        metrics_output=args.metrics_output,
    )
    print(f"Wrote demo REDCap mirror -> {paths['redcap']}")
    print(f"Wrote demo feature matrix -> {paths['feature_matrix']}")
    print(f"Wrote demo model metrics -> {paths['metrics']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())