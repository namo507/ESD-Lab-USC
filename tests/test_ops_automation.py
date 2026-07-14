"""Tests for operations health-check automation."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import build_pages_site  # noqa: E402
import check_compose_config  # noqa: E402
import check_docker_health  # noqa: E402
import check_live_surfaces  # noqa: E402
import check_site_health  # noqa: E402


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
    assert calls[0]["require_assistant_ready"] is False
    assert calls[-1]["probe_assistant"] is False


def test_pages_packager_rejects_ephemeral_origin_without_network(monkeypatch, tmp_path):
    probed: list[str] = []

    def fake_probe(origin, timeout):
        probed.append(origin)
        return True

    monkeypatch.setattr(build_pages_site, "_api_origin_is_healthy", fake_probe)

    assert (
        build_pages_site._resolve_api_origin(
            "https://expired.trycloudflare.com",
            tmp_path / "missing.json",
        )
        is None
    )
    assert probed == []


def test_pages_packager_emits_fallback_only_worker(monkeypatch, tmp_path):
    build_dir = tmp_path / "build"
    out_dir = tmp_path / "out"
    build_dir.mkdir()
    (build_dir / "index.html").write_text(
        '<html><head></head><body><div id="root"></div>NANO</body></html>',
        encoding="utf-8",
    )
    monkeypatch.setattr(build_pages_site, "REPO_ROOT", tmp_path)

    output = build_pages_site.build(
        build_dir=build_dir,
        out_dir=out_dir,
        manifest_path=tmp_path / "missing.json",
        api_origin="https://expired.trycloudflare.com",
        stamp="2026-07-13T00:00:00Z",
    )

    html = output.read_text(encoding="utf-8")
    worker = (out_dir / "_worker.js").read_text(encoding="utf-8")
    assert 'name="esd-api-mode" content="fallback-only"' in html
    assert 'name="esd-api-origin"' not in html
    assert "const API_ORIGIN = null;" in worker
    assert (
        'fallbackApiResponse(url, directFallbackRequest, "no-healthy-origin")' in worker
    )


def test_site_health_accepts_provider_degraded_fallback(monkeypatch):
    page = (
        '<html><head><meta name="esd-deploy-stamp" '
        'content="2026-07-13T00:00:00Z"></head><body>NANO</body></html>'
    ).encode()
    fallback_status = json.dumps(
        {
            "status": "fallback",
            "ready": False,
            "fallback": True,
            "model": "pages://fallback-assistant",
        }
    ).encode()

    def fake_fetch(url, timeout):
        if url.endswith("/api/assistant/status"):
            return 200, fallback_status
        return 200, page

    monkeypatch.setattr(check_site_health, "_fetch", fake_fetch)

    assert (
        check_site_health.check(
            url="https://example.test/",
            timeout=2,
            min_bytes=1,
            must_contain=["NANO"],
            max_stamp_age_hours=None,
            assistant_status_path="/api/assistant/status",
            probe_assistant=True,
            require_assistant_ready=False,
            probe_api_origin=True,
        )
        == 0
    )


def test_site_health_rejects_canonical_quick_tunnel_origin(monkeypatch):
    page = (
        '<html><head><meta name="esd-api-origin" '
        'content="https://expired.trycloudflare.com"></head><body>NANO</body></html>'
    ).encode()
    monkeypatch.setattr(check_site_health, "_fetch", lambda url, timeout: (200, page))

    assert (
        check_site_health.check(
            url="https://example.test/",
            timeout=2,
            min_bytes=1,
            must_contain=["NANO"],
            max_stamp_age_hours=None,
            assistant_status_path="/api/assistant/status",
            probe_assistant=True,
            require_assistant_ready=False,
            probe_api_origin=False,
        )
        == 1
    )


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


def test_share_compose_defaults_cloudflared_to_http2():
    root = Path(__file__).resolve().parents[1]
    for compose_file in [
        root / "docker-compose.yml",
        root / "docker" / "compose.dev.yml",
        root / "docker" / "compose.prod.yml",
    ]:
        errors = check_compose_config.validate_compose(compose_file)
        assert errors == []


def test_compose_uses_nvidia_contract_and_scoped_autoheal():
    root = Path(__file__).resolve().parents[1]
    for compose_file in [
        root / "docker-compose.yml",
        root / "docker" / "compose.dev.yml",
        root / "docker" / "compose.prod.yml",
    ]:
        payload = yaml.safe_load(compose_file.read_text(encoding="utf-8"))
        services = payload["services"]
        environment = services["dashboard"]["environment"]

        assert environment["DASHBOARD_ASSISTANT_PROVIDER"].endswith("-nvidia}")
        assert "nemotron-3-super-120b-a12b" in environment["DASHBOARD_ASSISTANT_MODEL"]
        assert "${" in environment["DASHBOARD_ASSISTANT_API_KEY"]
        assert "HF_HOME" not in environment
        for key in (
            "DASHBOARD_ASSISTANT_RETRY_MAX_SECONDS",
            "DASHBOARD_ASSISTANT_RETRY_JITTER",
            "DASHBOARD_ASSISTANT_MAX_CONCURRENCY",
            "DASHBOARD_ASSISTANT_CIRCUIT_FAILURE_THRESHOLD",
            "DASHBOARD_ASSISTANT_CIRCUIT_RECOVERY_SECONDS",
        ):
            assert key in environment

        for service_name in ("dashboard", "dashboard-share", "dashboard-share-named"):
            assert services[service_name]["labels"]["com.esdlabusc.autoheal"] == "true"
        for service_name in ("dashboard-share", "dashboard-share-named"):
            assert services[service_name]["healthcheck"]["test"][-1] == "ready"
        assert (
            services["autoheal"]["environment"]["AUTOHEAL_CONTAINER_LABEL"]
            == "com.esdlabusc.autoheal"
        )


def test_helm_nvidia_key_is_secret_backed_and_reliability_is_configured():
    root = Path(__file__).resolve().parents[1]
    chart = root / "k8s" / "helm" / "esd-lab-dashboard"
    values = yaml.safe_load((chart / "values.yaml").read_text(encoding="utf-8"))
    configmap = (chart / "templates" / "configmap.yaml").read_text(encoding="utf-8")
    deployment = (chart / "templates" / "deployment-dashboard.yaml").read_text(
        encoding="utf-8"
    )

    assert values["assistant"]["provider"] == "nvidia"
    assert values["assistant"]["apiKeySecretKey"] == "dashboardAssistantApiKey"
    for key in (
        "DASHBOARD_ASSISTANT_RETRY_MAX_SECONDS",
        "DASHBOARD_ASSISTANT_RETRY_JITTER",
        "DASHBOARD_ASSISTANT_MAX_CONCURRENCY",
        "DASHBOARD_ASSISTANT_CIRCUIT_FAILURE_THRESHOLD",
        "DASHBOARD_ASSISTANT_CIRCUIT_RECOVERY_SECONDS",
    ):
        assert key in configmap
    assert "- name: DASHBOARD_ASSISTANT_API_KEY" in deployment
    assert "secretKeyRef:" in deployment
    assert "DASHBOARD_ASSISTANT_API_KEY:" not in configmap


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

    base = [
        "docker",
        "compose",
        "-f",
        str(tmp_path / "compose.yml"),
        "--profile",
        "share",
        "-p",
        "esd-test",
    ]
    # Repair first probes service health (empty output -> nothing unhealthy),
    # then (re)creates the requested services with `up -d`.
    assert calls == [
        base + ["ps", "--format", "json"],
        base + ["rm", "--force"],
        base + ["up", "-d", "dashboard"],
    ]


def test_repair_compose_services_restarts_unhealthy_running(monkeypatch, tmp_path):
    """A running-but-unhealthy service is bounced before `up -d` runs."""
    calls: list[list[str]] = []

    def fake_run_command(command, cwd=None):
        calls.append(command)
        stdout = ""
        if "ps" in command:
            stdout = json.dumps(
                [{"Service": "dashboard", "State": "running", "Health": "unhealthy"}]
            )
        return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")

    monkeypatch.setattr(check_docker_health, "run_command", fake_run_command)

    check_docker_health.repair_compose_services(
        ["docker", "compose"],
        tmp_path / "compose.yml",
        None,
        ["dashboard"],
        [],
    )

    base = ["docker", "compose", "-f", str(tmp_path / "compose.yml")]
    assert calls == [
        base + ["ps", "--format", "json"],
        base + ["restart", "dashboard"],
        base + ["rm", "--force"],
        base + ["up", "-d", "dashboard"],
    ]


def test_project_cleanup_never_uses_daemon_wide_prune(monkeypatch, tmp_path):
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
        [],
    )

    flattened = " ".join(part for command in calls for part in command)
    assert "system prune" not in flattened
    assert ["-p", "esd-test", "rm", "--force"] == calls[1][-4:]
