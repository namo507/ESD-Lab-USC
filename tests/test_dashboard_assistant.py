"""Tests for the dashboard chat assistant scaffolding."""

from __future__ import annotations

import json

from dashboard.assistant.local_chat_assistant import (
    AssistantConfig,
    DashboardChatAssistant,
)


def test_build_context_prioritizes_matching_dashboard_fragments(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()

    dashboard_payload = {
        "meta": {
            "data_source": "repo_demo_inputs",
            "study": {"name": "NANO Study"},
        },
        "enrollment": {
            "overall": {"current": 209, "target": 260},
            "by_group": {
                "ASIB": {"current": 54, "target": 65},
                "PT": {"current": 104, "target": 130},
            },
        },
        "redcap_audit": {"summary": {"open_queries": 78}},
        "ml_performance": {
            "models": [
                {"model_name": "Random Forest", "auroc": 0.82},
                {"model_name": "1D-CNN + LSTM", "auroc": 0.899},
            ]
        },
        "organization_site": {
            "stories": [
                {
                    "title": "Enrollment news",
                    "summary": "Current model story with noisy terms.",
                },
            ]
        },
    }
    readings_payload = {
        "summary": {"total_readings": 20},
        "featured": [{"title": "Autonomic pathways in autism"}],
    }

    (data_dir / "dashboard_data.json").write_text(json.dumps(dashboard_payload))
    (data_dir / "readings_data.json").write_text(json.dumps(readings_payload))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context(
        "What is the best model AUROC and current enrollment?"
    )

    assert "Enrollment total: 209 of 260" in context["context"]
    assert any(citation == "enrollment.overall" for citation in context["citations"])
    assert any(
        citation == "ml_performance.models[1]" for citation in context["citations"]
    )
    assert not any(
        citation.startswith("organization_site") for citation in context["citations"]
    )


def test_assistant_short_circuits_next_wave_feature_context(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()

    dashboard_payload = {
        "meta": {
            "data_source": "repo_demo_inputs",
            "study": {"name": "NANO Study"},
        },
        "hda_composition": {
            "by_group": {
                "VPT": [
                    {
                        "month": 0,
                        "orienting": 0.34,
                        "sustained": 0.27,
                        "inattention": 0.21,
                        "termination": 0.18,
                    }
                ],
                "ASIB": [],
                "TD": [],
            }
        },
        "attrition_funnel": {
            "stages": [{"label": "Analysis-ready", "retainedPct": 81.4}]
        },
        "county_profiles": [
            {
                "county": "Richland County",
                "fips": "45079",
                "participants": 42,
                "sdohScore": 58,
            }
        ],
    }
    (data_dir / "dashboard_data.json").write_text(json.dumps(dashboard_payload))
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context("Explain the CGA milestone river")
    response = assistant._maybe_short_circuit_response(
        "Explain the CGA milestone river",
        context,
    )

    assert response is not None
    assert "CGA Milestone River" in response
    assert "hda_composition" in response


def test_status_reports_missing_model_when_dependencies_are_available(
    tmp_path, monkeypatch
):
    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=tmp_path,
    )

    monkeypatch.setattr(
        assistant,
        "_probe_dependencies",
        lambda: {"available": True, "missing": []},
    )
    monkeypatch.setattr(
        "dashboard.assistant.local_chat_assistant._available_memory_gib",
        lambda: 32.0,
    )

    status = assistant.get_status()

    assert not status["ready"]
    assert status["state"] == "model-missing"
    assert "model" in status["message"].lower()


def test_status_ready_when_local_gguf_exists(tmp_path, monkeypatch):
    model_dir = tmp_path / "model"
    model_dir.mkdir()
    (model_dir / "demo.gguf").write_bytes(b"GGUF")

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=model_dir, model_file="demo.gguf"),
        data_dir=tmp_path,
    )

    monkeypatch.setattr(
        assistant,
        "_probe_dependencies",
        lambda: {"available": True, "missing": []},
    )
    monkeypatch.setattr(
        "dashboard.assistant.local_chat_assistant._available_memory_gib",
        lambda: 2.0,
    )

    status = assistant.get_status()

    assert status["ready"] is True
    assert status["state"] == "ready"
    assert status["model_path"].endswith("demo.gguf")


def test_summary_derives_enrollment_total_from_groups(tmp_path):
    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=tmp_path,
    )

    summary = assistant._build_summary_block(
        payload={
            "meta": {"study": {"name": "NANO Study", "n_target": 260}},
            "enrollment": {
                "by_group": {
                    "ASIB": {"current": 53, "target": 65},
                    "PT": {"current": 105, "target": 130},
                    "TD": {"current": 53, "target": 65},
                }
            },
            "redcap_audit": {"summary": {"open_queries": 78}},
        },
        readings={"summary": {"total_readings": 20}},
    )

    assert "Enrollment total: 211 of 260" in summary
    assert "Open REDCap queries: 78" in summary


def test_summary_uses_best_model_actual_index(tmp_path):
    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=tmp_path,
    )

    fragments = assistant._build_summary_fragments(
        payload={
            "meta": {"study": {"name": "NANO Study", "n_target": 260}},
            "enrollment": {"overall": {"current": 211, "target": 260}},
            "ml_performance": {
                "models": [
                    {"name": "Random Forest", "auroc": 0.82},
                    {"name": "1D-CNN + LSTM", "auroc": 0.899},
                    {"name": "XGBoost", "auroc": 0.859},
                ]
            },
        },
        readings={"summary": {"total_readings": 20}},
    )

    assert (
        "ml_performance.models[1]",
        "Best model: 1D-CNN + LSTM (0.899)",
    ) in fragments


def test_assistant_answers_redcap_runtime_parity_from_ops_payload(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()
    (data_dir / "dashboard_data.json").write_text(
        json.dumps(
            {
                "meta": {
                    "data_source": "repo_demo_inputs",
                    "study": {"name": "NANO Study"},
                },
                "redcap_ops": {
                    "runtime_parity": {
                        "pages": "abc12345",
                        "docker": "abc12345",
                        "k8s": "abc12345",
                    }
                },
            }
        )
    )
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context("Are Pages, Docker, and K8s in runtime parity?")
    response = assistant._maybe_short_circuit_response(
        "Are Pages, Docker, and K8s in runtime parity?",
        context,
    )

    assert response is not None
    assert "in sync" in response
    assert "pages=abc12345" in response


def test_assistant_answers_redcap_furthest_behind_from_trackers(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()
    (data_dir / "dashboard_data.json").write_text(
        json.dumps(
            {
                "meta": {
                    "data_source": "repo_demo_inputs",
                    "study": {"name": "NANO Study"},
                },
                "redcap_trackers": {
                    "enrollment": [
                        {
                            "event": "6_months_arm_1",
                            "label": "6 months",
                            "expected": 50,
                            "completed": 45,
                        },
                        {
                            "event": "24_months_arm_1",
                            "label": "24 months",
                            "expected": 40,
                            "completed": 20,
                        },
                    ]
                },
            }
        )
    )
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context("Which REDCap event is furthest behind target?")
    response = assistant._maybe_short_circuit_response(
        "Which REDCap event is furthest behind target?",
        context,
    )

    assert response is not None
    assert "24 months is furthest behind target" in response
    assert "20/40 complete" in response


def test_assistant_answers_redcap_epds_next_wave_from_clinical_payload(tmp_path):
    data_dir = tmp_path / "dashboard-data"
    data_dir.mkdir()
    (data_dir / "dashboard_data.json").write_text(
        json.dumps(
            {
                "meta": {
                    "data_source": "repo_demo_inputs",
                    "study": {"name": "NANO Study"},
                },
                "clinical_cutoffs": {"epds_positive": 10, "epds_high": 13},
                "redcap_clinical": {
                    "epds_trajectory": [
                        {
                            "event": "24_months_arm_1",
                            "label": "24 Months",
                            "screen_positive": 7,
                            "high_concern": 3,
                            "self_harm_flags": 1,
                        },
                        {
                            "event": "36_months_arm_1",
                            "label": "36 Months",
                            "screen_positive": 5,
                            "high_concern": 2,
                            "self_harm_flags": 0,
                        },
                    ]
                },
                "redcap_schedule": {"upcoming_visits": []},
            }
        )
    )
    (data_dir / "readings_data.json").write_text(json.dumps({"summary": {}}))

    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing-model"),
        data_dir=data_dir,
    )

    context = assistant.build_context("How many mothers are EPDS screen-positive?")
    response = assistant._maybe_short_circuit_response(
        "How many mothers are EPDS screen-positive?",
        context,
    )

    assert response is not None
    assert "12 screen-positive" in response
    assert "cutoff >= 10" in response
