"""Tests for runtime health gating on the eight-project REDCap snapshot."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from dashboard.server.redcap_portfolio_health import evaluate_portfolio_metrics


def _metrics(generated_at: str = "2026-08-10T12:00:00Z") -> dict:
    return {
        "schema": "dashboard.metrics.v1",
        "data_version": "sha256:test",
        "generated_at": generated_at,
        "aggregate_only": True,
        "source": {
            "kind": "live",
            "projects_total": 8,
            "projects_ok": 8,
        },
        "portfolio": {"status": "ok"},
        "projects": [
            {"key": f"project-{index}", "status": "ok"} for index in range(8)
        ],
    }


def test_fresh_eight_project_snapshot_is_ready(tmp_path):
    path = tmp_path / "dashboard_metrics.json"
    path.write_text(json.dumps(_metrics()), encoding="utf-8")

    health = evaluate_portfolio_metrics(
        path,
        required=True,
        now=datetime(2026, 8, 10, 12, 10, tzinfo=timezone.utc),
    )

    assert health["status"] == "ok"
    assert health["ready"] is True
    assert health["projects_ok"] == 8
    assert health["projects_total"] == 8
    assert health["age_seconds"] == 600


def test_required_stale_snapshot_fails_readiness(tmp_path):
    path = tmp_path / "dashboard_metrics.json"
    path.write_text(json.dumps(_metrics()), encoding="utf-8")

    health = evaluate_portfolio_metrics(
        path,
        required=True,
        max_age_seconds=900,
        now=datetime(2026, 8, 10, 12, 16, tzinfo=timezone.utc),
    )

    assert health["status"] == "stale"
    assert health["ready"] is False
    assert health["reason"] == "aggregate_snapshot_stale"


def test_partial_snapshot_reports_actual_project_count(tmp_path):
    path = tmp_path / "dashboard_metrics.json"
    payload = _metrics("2026-08-10T12:15:00Z")
    payload["source"].update({"kind": "partial", "projects_ok": 7})
    payload["projects"][-1]["status"] = "error"
    path.write_text(json.dumps(payload), encoding="utf-8")

    health = evaluate_portfolio_metrics(
        path,
        required=True,
        now=datetime(2026, 8, 10, 12, 16, tzinfo=timezone.utc),
    )

    assert health["status"] == "partial"
    assert health["ready"] is False
    assert health["projects_ok"] == 7
    assert health["expected_projects"] == 8


def test_missing_optional_snapshot_is_visible_without_blocking(tmp_path):
    health = evaluate_portfolio_metrics(
        tmp_path / "missing.json",
        required=False,
    )

    assert health["status"] == "missing"
    assert health["ready"] is True
    assert health["required"] is False
