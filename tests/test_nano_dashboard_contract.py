"""Contract tests for the aggregate-only NANO dashboard namespace."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import pandas as pd

from dashboard.pipelines import build_dashboard_data, generate_synthetic_dashboard_data
from dashboard.pipelines.nano_study import (
    ASSESSMENT_APPLICABILITY,
    NANO_TARGET,
    NANO_TARGETS,
    NANO_TIMEPOINTS,
    NANO_WINDOWS,
    build_nano_contract,
)

REQUIRED_SECTIONS = {
    "meta",
    "enrollment",
    "attention",
    "autonomic",
    "schedule",
    "pipeline",
    "pipeline_summary",
    "assessments",
    "inventory",
    "checklists",
    "redcap",
    "models",
    "library",
}


def _walk(value: Any):
    if isinstance(value, Mapping):
        for key, inner in value.items():
            yield str(key), inner
            yield from _walk(inner)
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        for inner in value:
            yield from _walk(inner)


def test_synthetic_nano_contract_has_complete_typed_sections():
    nano = build_nano_contract(
        "2026-07-14T12:00:00Z", source="synthetic_demo", aggregates={}
    )

    assert REQUIRED_SECTIONS.issubset(nano)
    assert nano["meta"] == {
        "study": "NANO",
        "long_name": "Neurodevelopment of Autonomic and Neural Organization",
        "state": "Actively Enrolling",
        "as_of": "2026-07-14",
        "n_target": 260,
        "source": "synthetic",
        "aggregate_only": True,
    }

    enrollment = nano["enrollment"]
    assert isinstance(enrollment["enrolled"], int)
    assert isinstance(enrollment["active"], int)
    assert isinstance(enrollment["retention_pct"], float)
    assert len(enrollment["by_group"]) == 3
    assert [row["stage"] for row in enrollment["funnel"]] == [
        "Referred",
        "Screened",
        "Consented",
        "Enrolled",
        "Active",
    ]

    attention = nano["attention"]
    assert isinstance(attention["hda_sustained_pct"], float)
    assert [row["phase"] for row in attention["phases"]] == [
        "Sustained",
        "Orienting",
        "Termination",
        "Inattention",
    ]
    assert round(sum(row["pct"] for row in attention["phases"]), 1) == 100.0
    assert [row["window"] for row in attention["by_window"]] == list(NANO_WINDOWS)
    assert len(attention["by_group_window"]) == len(NANO_TARGETS) * len(NANO_WINDOWS)
    for row in attention["by_group_window"]:
        phase_total = sum(
            row[key]
            for key in (
                "sustained_pct",
                "orienting_pct",
                "termination_pct",
                "inattention_pct",
            )
        )
        assert round(phase_total, 1) == 100.0
    assert len(nano["autonomic"]["by_group_window"]) == len(NANO_TARGETS) * len(
        NANO_WINDOWS
    )

    assert [row["id"] for row in nano["schedule"]["timepoints"]] == list(
        NANO_TIMEPOINTS
    )
    for row in nano["schedule"]["timepoints"]:
        assert all(
            isinstance(row[key], int)
            for key in ("due", "upcoming_14d", "overdue", "completed")
        )
        assert row["due"] == row["upcoming_14d"] + row["overdue"]
        assert row["window_adherence_pct"] is None or isinstance(
            row["window_adherence_pct"], float
        )

    assert [row["stage"] for row in nano["pipeline"]] == [
        "Ingested",
        "ECG preproc",
        "Temp preproc",
        "Behavioral coding",
        "Feature matrix",
        "Imputation (MICE m=20)",
        "Model-ready",
    ]
    assert all(
        isinstance(row["qa_passed"], int)
        and row["qa_passed"] <= row["count"]
        and isinstance(row["delta_7d"], int)
        for row in nano["pipeline"]
    )
    assert nano["pipeline_summary"]["qa_passed_sessions"] > 0

    assessments = nano["assessments"]
    assert len(assessments) == len(ASSESSMENT_APPLICABILITY) * len(NANO_TIMEPOINTS)
    assert {row["instrument"] for row in assessments} == set(ASSESSMENT_APPLICABILITY)
    assert all(
        isinstance(row["complete"], int)
        and isinstance(row["expected"], int)
        and row["complete"] <= row["expected"]
        and isinstance(row["applicable"], bool)
        for row in assessments
    )

    inventory_items = {row["item"] for row in nano["inventory"]}
    assert {
        "Actiheart-5 ECG",
        "Squirrel temp datalogger",
        "HeRO monitor access",
        "Eye tracker",
        "Bayley-4 kit",
        "ADOS-2 kit",
        "AOSI kit",
        "ECG electrodes",
        "Temperature sensor consumables",
    }.issubset(inventory_items)
    assert nano["checklists"]["onboarding"]
    assert nano["checklists"]["visit_prep"]
    assert nano["checklists"]["qc"]
    assert nano["redcap"]["sync_health"] in {"ok", "stale", "error"}
    assert nano["models"]["aim3_status"] in {
        "not_started",
        "training",
        "evaluated",
    }
    assert nano["library"]["href"].startswith("/")
    assert nano["library"]["api_href"] == "/api/readings/library"
    json.loads(json.dumps(nano, allow_nan=False))


def test_nano_enrollment_targets_and_funnel_are_coherent():
    nano = build_nano_contract(source="synthetic_demo", aggregates={})
    enrollment = nano["enrollment"]

    assert NANO_TARGET == 260
    assert NANO_TARGETS == {"ASIB": 65, "PT": 130, "TD": 65}
    assert nano["meta"]["n_target"] == NANO_TARGET
    assert nano["study_meta"]["n_target"] == NANO_TARGET
    assert enrollment["target"] == NANO_TARGET
    assert sum(row["target"] for row in enrollment["by_group"]) == NANO_TARGET
    assert enrollment["enrolled"] == sum(
        row["enrolled"] for row in enrollment["by_group"]
    )
    assert enrollment["total"] == enrollment["enrolled"]
    assert (
        enrollment["asib"] + enrollment["pt"] + enrollment["td"]
        == enrollment["enrolled"]
    )
    funnel_counts = [row["n"] for row in enrollment["funnel"]]
    assert funnel_counts == sorted(funnel_counts, reverse=True)
    assert enrollment["funnel"][-2]["n"] == enrollment["enrolled"]
    assert enrollment["funnel"][-1]["n"] == enrollment["active"]


def test_nano_derives_enrollment_and_research_series_from_aggregate_sources():
    aggregates = {
        "enrollment": {
            "by_group": {
                "ASIB": {"current": 7},
                "PT": {"current": 11},
                "TD": {"current": 5},
            }
        },
        "redcap_audit": {"summary": {"active_participants": 21}},
        "attrition_funnel": {
            "stages": [
                {"id": "screened", "n": 100},
                {"id": "consented", "n": 80},
                {"id": "enrolled", "n": 50},
            ]
        },
        "hda_composition": {
            "by_group": {
                "ASIB": [
                    {
                        "month": month,
                        "orienting": 0.25,
                        "sustained": 0.35,
                        "termination": 0.15,
                        "inattention": 0.25,
                    }
                    for month in (1, 2, 3, 6, 9, 12)
                ],
                "VPT": [
                    {
                        "month": month,
                        "orienting": 0.20,
                        "sustained": 0.40,
                        "termination": 0.15,
                        "inattention": 0.25,
                    }
                    for month in (1, 2, 3, 6, 9, 12)
                ],
                "TD": [
                    {
                        "month": month,
                        "orienting": 0.15,
                        "sustained": 0.50,
                        "termination": 0.15,
                        "inattention": 0.20,
                    }
                    for month in (1, 2, 3, 6, 9, 12)
                ],
            }
        },
        "trajectories": {
            "months": [1, 2, 3, 6, 9, 12],
            "by_group": {
                "ASIB": {"mean": {"RSA": [2.1, 2.2, 2.3, 2.5, 2.6, 2.7]}},
                "PT": {"mean": {"RSA": [1.8, 1.9, 2.0, 2.2, 2.3, 2.4]}},
                "TD": {"mean": {"RSA": [2.4, 2.5, 2.6, 2.8, 2.9, 3.0]}},
            },
        },
        "redcap_meta": {"record_count": 23},
        "redcap_ops": {
            "freshness": {
                "status": "fresh",
                "generated_at": "2026-07-14T10:00:00Z",
            }
        },
    }

    nano = build_nano_contract(
        "2026-07-14T12:00:00Z",
        source="redcap_live + feature_matrix",
        aggregates=aggregates,
    )

    assert nano["meta"]["source"] == "secure"
    assert nano["enrollment"]["enrolled"] == 23
    assert nano["enrollment"]["active"] == 21
    assert [row["n"] for row in nano["enrollment"]["funnel"]] == [
        46,
        46,
        37,
        23,
        21,
    ]
    assert nano["attention"]["hda_sustained_pct"] == 41.2
    pt_window = next(
        row
        for row in nano["attention"]["by_group_window"]
        if row["group"] == "PT" and row["window"] == "1-3m"
    )
    assert pt_window["sustained_pct"] == 40.0
    assert nano["autonomic"]["rsa_baseline_ms2"] == 2.125
    assert nano["redcap"]["sync_health"] == "ok"
    assert nano["redcap"]["api_token_valid"] is True


def test_secure_missing_sources_emit_typed_awaiting_data_without_fabrication():
    nano = build_nano_contract(
        "not-a-date",
        source="redcap_live",
        aggregates={
            "enrollment": {"by_group": None},
            "hda_composition": {"by_group": "invalid"},
            "trajectories": {"months": None},
            "redcap_trackers": {"enrollment": "invalid"},
            "data_quality": {"qc_flags": None},
            "ml_performance": {"models": "invalid"},
        },
    )

    assert nano["meta"]["source"] == "secure"
    assert nano["enrollment"]["enrolled"] == 0
    assert nano["enrollment"]["active"] == 0
    assert nano["enrollment"]["retention_pct"] is None
    assert nano["attention"]["hda_sustained_pct"] is None
    assert all(row["pct"] is None for row in nano["attention"]["phases"])
    assert all(
        row[key] is None
        for row in nano["attention"]["by_group_window"]
        for key in (
            "sustained_pct",
            "orienting_pct",
            "termination_pct",
            "inattention_pct",
        )
    )
    assert nano["autonomic"]["rsa_baseline_ms2"] is None
    assert all(row["completed"] == 0 for row in nano["schedule"]["timepoints"])
    assert all(
        row["window_adherence_pct"] is None for row in nano["schedule"]["timepoints"]
    )
    assert all(row["status"] == "awaiting_data" for row in nano["inventory"])
    assert all(row["expected"] == 0 for row in nano["assessments"])
    assert nano["redcap"]["sync_health"] == "error"
    assert nano["redcap"]["api_token_valid"] is False
    assert nano["models"]["aim3_status"] == "not_started"
    assert nano["models"]["best_metric"] is None
    json.loads(json.dumps(nano, allow_nan=False))


def test_public_nano_contract_contains_no_identifier_or_raw_signal_shape():
    nano = build_nano_contract(source="synthetic_demo", aggregates={})
    forbidden_keys = {
        "participant",
        "participant_id",
        "participantid",
        "record_id",
        "recordid",
        "mrn",
        "dob",
        "date_of_birth",
        "first_name",
        "last_name",
        "free_text",
        "notes",
        "raw_signal",
        "waveform",
        "flagged_participants",
        "individual_traces",
        "hda_features",
    }

    for key, _value in _walk(nano):
        assert key.lower() not in forbidden_keys
    serialized = json.dumps(nano)
    assert not re.search(r"\b(?:NANO|ASIB|PT|TD)-\d+\b", serialized)


def test_nano_builder_does_not_passthrough_unapproved_aggregate_fields():
    nano = build_nano_contract(
        source="redcap_live",
        aggregates={
            "enrollment": {"by_ga_stratum": {"24_26w": 3, "private-family-label": 99}},
            "site_breakdown": [
                {"site": "private-family-label", "count": 2, "record_id": "secret"}
            ],
            "inventory": [
                {
                    "item": "Actiheart-5 ECG",
                    "available": 2,
                    "status": "private-family-label",
                    "serial_number": "secret",
                }
            ],
            "checklists": {
                "onboarding": [
                    {
                        "key": "consent",
                        "label": "private-family-label",
                        "done": 1,
                        "total": 2,
                        "record_id": "secret",
                    }
                ]
            },
            "library": {
                "href": "https://private-family-label.example",
                "label": "private-family-label",
            },
        },
    )
    serialized = json.dumps(nano)

    assert "private-family-label" not in serialized
    assert "serial_number" not in serialized
    assert '"record_id"' not in serialized
    assert nano["library"]["href"] == "/#library"
    assert nano["enrollment"]["by_ga_stratum"] == {"24_26w": 3}


def test_synthetic_payload_nano_enrollment_matches_top_level_aggregate():
    payload = generate_synthetic_dashboard_data.build_payload()
    aggregate_enrolled = sum(
        int(group["current"]) for group in payload["enrollment"]["by_group"].values()
    )

    assert payload["nano"]["enrollment"]["enrolled"] == aggregate_enrolled
    assert payload["nano"]["meta"]["source"] == "synthetic"
    assert REQUIRED_SECTIONS.issubset(payload["nano"])


def test_operational_enrollment_keeps_pre_window_cohort_and_current_month():
    current_month = pd.Timestamp.now().strftime("%Y-%m")
    redcap = pd.DataFrame(
        [
            {
                "redcap_event_name": "nicu_admission",
                "enrollment_date": "2020-01-15",
                "group_assignment": "ASIB",
                "ga_weeks": 25,
            },
            {
                "redcap_event_name": "nicu_admission",
                "enrollment_date": f"{current_month}-05",
                "group_assignment": "PT",
                "ga_weeks": 30,
            },
            {
                "redcap_event_name": "nicu_admission",
                "enrollment_date": f"{current_month}-06",
                "group_assignment": "TD",
                "ga_weeks": 39,
            },
        ]
    )

    enrollment = build_dashboard_data.build_enrollment(redcap)

    assert enrollment["months"][-1] == current_month
    assert enrollment["by_group"]["ASIB"]["current"] == 1
    assert enrollment["by_group"]["PT"]["current"] == 1
    assert enrollment["by_group"]["TD"]["current"] == 1
    assert enrollment["by_ga_stratum"] == {
        "24_26w": 1,
        "27_29w": 0,
        "30_32w": 1,
        "full_term": 1,
    }


def test_dashboard_refresh_runs_the_nano_aware_payload_builder():
    makefile = Path("Makefile").read_text(encoding="utf-8")
    target = re.search(
        r"^dashboard-refresh:.*?(?=^[A-Za-z0-9_-]+:|\Z)",
        makefile,
        flags=re.MULTILINE | re.DOTALL,
    )

    assert target is not None
    assert "dashboard/pipelines/build_dashboard_data.py" in target.group(0)
    assert "--fallback-synthetic" in target.group(0)


def test_generated_browser_artifact_contains_only_aggregate_nano_contract():
    path = Path("dashboard/data/nano_dashboard_data.json")
    payload = json.loads(path.read_text(encoding="utf-8"))

    assert set(payload) == {"schema", "nano"}
    assert payload["schema"] == "nano-dashboard.v1"
    assert payload["nano"]["meta"]["aggregate_only"] is True
    assert REQUIRED_SECTIONS.issubset(payload["nano"])

    forbidden_keys = {
        "participant",
        "participants",
        "participant_id",
        "participant_ids",
        "record_id",
        "record_ids",
        "subject_id",
        "subject_ids",
        "mrn",
        "dob",
        "date_of_birth",
        "first_name",
        "last_name",
        "free_text",
        "notes",
        "raw_signal",
        "waveform",
        "flagged_participants",
        "individual_traces",
        "hda_features",
    }
    for key, _value in _walk(payload["nano"]):
        assert key.casefold() not in forbidden_keys
    assert not re.search(
        r"\b(?:NANO|ASIB|PT|TD|VPT)[-_ ]?\d+\b",
        json.dumps(payload),
        flags=re.IGNORECASE,
    )
