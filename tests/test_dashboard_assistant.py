"""Tests for the dashboard chat assistant scaffolding."""

from __future__ import annotations

import json

from dashboard.assistant.local_chat_assistant import AssistantConfig
from dashboard.assistant.local_chat_assistant import DashboardChatAssistant


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
                {"title": "Enrollment news", "summary": "Current model story with noisy terms."},
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

    context = assistant.build_context("What is the best model AUROC and current enrollment?")

    assert "Enrollment total: 209 of 260" in context["context"]
    assert any(citation == "enrollment.overall" for citation in context["citations"])
    assert any(citation == "ml_performance.models[1]" for citation in context["citations"])
    assert not any(citation.startswith("organization_site") for citation in context["citations"])


def test_status_reports_missing_model_when_dependencies_are_available(tmp_path, monkeypatch):
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

    assert ("ml_performance.models[1]", "Best model: 1D-CNN + LSTM (0.899)") in fragments