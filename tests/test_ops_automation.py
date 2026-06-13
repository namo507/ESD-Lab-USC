"""Tests for operations health-check automation."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import check_docker_health  # noqa: E402
import check_live_surfaces  # noqa: E402


def test_join_route_keeps_canonical_origin():
    assert (
        check_live_surfaces.join_route("https://example.test/base", "overview")
        == "https://example.test/overview"
    )
    assert (
        check_live_surfaces.join_route("https://example.test/base/", "/qa")
        == "https://example.test/qa"
    )


def test_live_surface_main_probes_canonical_routes_and_runtime(monkeypatch):
    calls: list[dict[str, object]] = []

    def fake_check(**kwargs):
        calls.append(kwargs)
        return 0

    monkeypatch.setattr(check_live_surfaces, "check", fake_check)

    exit_code = check_live_surfaces.main(
        [
            "--canonical-url",
            "https://example.test/base",
            "--canonical-route",
            "/",
            "--canonical-route",
            "overview",
            "--runtime-url",
            "https://runtime.example.test/",
            "--json",
        ]
    )

    assert exit_code == 0
    assert [call["url"] for call in calls] == [
        "https://example.test/",
        "https://example.test/overview",
        "https://runtime.example.test/",
    ]
    assert calls[0]["probe_assistant"] is True
    assert calls[-1]["probe_assistant"] is False


def test_compose_health_requires_every_requested_service(monkeypatch, tmp_path):
    def fake_run_command(command, cwd=None):
        return subprocess.CompletedProcess(
            command,
            0,
            stdout=json.dumps(
                [
                    {
                        "Service": "dashboard",
                        "State": "running",
                        "Health": "healthy",
                    }
                ]
            ),
            stderr="",
        )

    monkeypatch.setattr(check_docker_health, "run_command", fake_run_command)

    with pytest.raises(RuntimeError, match="dashboard-share"):
        check_docker_health.check_compose_services(
            ["docker", "compose"],
            tmp_path / "compose.yml",
            None,
            ["dashboard", "dashboard-share"],
            [],
        )


def test_repair_compose_services_targets_requested_services(monkeypatch, tmp_path):
    calls: list[list[str]] = []

    def fake_run_command(command, cwd=None):
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    monkeypatch.setattr(check_docker_health, "run_command", fake_run_command)

    check_docker_health.repair_compose_services(
        ["docker", "compose"],
        tmp_path / "compose.yml",
        "esd-test",
        ["dashboard"],
        ["share"],
    )

    assert calls == [
        [
            "docker",
            "compose",
            "-f",
            str(tmp_path / "compose.yml"),
            "--profile",
            "share",
            "-p",
            "esd-test",
            "up",
            "-d",
            "dashboard",
        ]
    ]
