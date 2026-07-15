"""Tests for operations health-check automation."""

from __future__ import annotations

import json
import os
import shutil
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
    assert 'request.headers.get("CF-Connecting-IP")' in worker
    assert 'headers.set("X-ESD-Original-Client-IP"' in worker
    assert (
        'fallbackApiResponse(url, directFallbackRequest, "no-healthy-origin", env)'
        in worker
    )
    assert 'path === "/api/buddy"' in worker
    assert "sanitizeNanoForBuddy" in worker
    assert "DASHBOARD_ASSISTANT_API_KEY" in worker
    assert "BUDDY_PROVIDER_MODEL" in worker
    assert "buddyFallbackResponse(request, url, env, reason)" in worker
    assert "cleanBuddyProviderOutput" in worker


def test_pages_packager_rejects_participant_rows_in_public_nano_payload():
    payload = {
        "schema": "nano-dashboard.v1",
        "nano": {
            "meta": {"study": "NANO", "aggregate_only": True},
            "schedule": {"participant_ids": ["NANO-1043"]},
        },
    }

    with pytest.raises(ValueError, match="forbidden key"):
        build_pages_site._validate_public_nano_payload(payload)


def test_pages_buddy_document_index_includes_tracked_ecg_protocol():
    payload = build_pages_site._build_public_buddy_documents(Path.cwd())
    paths = {document["relative_path"] for document in payload["documents"]}

    assert payload["schema"] == "nano-buddy-documents.v1"
    assert "docs/ecg_processing_protocol.md" in paths


@pytest.mark.skipif(shutil.which("node") is None, reason="Node is not installed")
def test_generated_pages_worker_blocks_phi_and_grounds_document_provider(tmp_path):
    worker_path = tmp_path / "worker.mjs"
    worker_path.write_text(build_pages_site._worker_source(None), encoding="utf-8")
    environment = os.environ.copy()
    environment["WORKER_URL"] = worker_path.as_uri()
    script = r"""
const worker = (await import(process.env.WORKER_URL)).default;
const providerCalls = [];
globalThis.fetch = async (input, init = {}) => {
  providerCalls.push({ input: String(input), body: String(init.body || "") });
  const providerPayload = {
    choices: [{ message: { content: "Use neurokit2 and review aggregate QC." } }],
  };
  return new Response(JSON.stringify(providerPayload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

const nano = {
  schema: "nano-dashboard.v1",
  nano: {
    meta: { study: "NANO", as_of: "2026-07-14", n_target: 260, aggregate_only: true },
    enrollment: { target: 260, enrolled: 210 },
    library: { indexed_documents: 1 },
  },
};
const docs = {
  schema: "nano-buddy-documents.v1",
  documents: [
    {
      title: "ECG Processing SOP",
      relative_path: "docs/ecg_processing_protocol.md",
      excerpt: "Use a 3-lead configuration, record a five-minute baseline, "
        + "run ECG preprocessing with neurokit2, and review aggregate QC flags.",
      search_text: "ECG preprocessing protocol lead configuration baseline duration neurokit2 aggregate QC steps",
      source: "tracked repository documentation",
      category: "SOP and methods",
      keywords: ["ecg", "preprocessing", "protocol"],
    },
    {
      title: "Repository Archive and Retention Manifest",
      relative_path: "docs/archive_manifest.md",
      excerpt: "Approved processing records are retained when a protocol "
        + "requires a configuration and baseline duration.",
      search_text: "approved processing protocol configuration baseline duration required",
      source: "tracked repository documentation",
      category: "governance",
      keywords: ["approved", "protocol"],
    },
    {
      title: "Temperature Processing Guide",
      relative_path: "docs/temperature_processing_guide.md",
      excerpt: "Temperature processing guidance covers sensor calibration and artifact review.",
      search_text: "temperature processing guidance sensor calibration artifact review",
      source: "tracked repository documentation",
      category: "SOP and methods",
      keywords: ["temperature", "processing", "guidance"],
    },
  ],
};
const assets = {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.endsWith("nano_dashboard_data.json")) return new Response(JSON.stringify(nano));
    if (path.endsWith("buddy_documents.json")) return new Response(JSON.stringify(docs));
    if (path.endsWith("readings_data.json")) return new Response(JSON.stringify({ featured: [], readings: [] }));
    return new Response("not found", { status: 404 });
  },
};
const env = { ASSETS: assets, DASHBOARD_ASSISTANT_API_KEY: "test-only" };

async function ask(message) {
  const response = await worker.fetch(new Request("https://example.test/api/buddy", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://example.test" },
    body: JSON.stringify({ message, context: { section: "nano" } }),
  }), env);
  return { status: response.status, payload: await response.json() };
}

for (const message of [
  "How is caregiver Jane Doe doing after 07/04/2026? Her phone is 803-555-1212.",
  "Email family@example.org about NANO-1043.",
  "Look up the family at 123 Main Street.",
  "The Social Security number is 123-45-6789.",
]) {
  const result = await ask(message);
  if (result.status !== 200 || result.payload.refused !== true) {
    throw new Error(`PHI request was not refused: ${message}`);
  }
}
if (providerCalls.length !== 0) throw new Error("PHI reached the provider");

const result = await ask(
  "According to the approved ECG processing protocol, what lead configuration "
    + "and baseline duration are required?",
);
if (result.status !== 200 || result.payload.refused !== false) {
  throw new Error("Valid document question failed");
}
if (result.payload.citations?.[0]?.path !== "docs/ecg_processing_protocol.md") {
  throw new Error("Document citation missing");
}
if (result.payload.citations?.length !== 1) {
  throw new Error("A marginal document match leaked into citations");
}
if (providerCalls.length !== 1) throw new Error("Provider was not called exactly once");
const providerBody = JSON.parse(providerCalls[0].body);
if (providerBody.max_tokens !== 420) throw new Error("Buddy response token budget regressed");
const grounding = providerBody.messages
  .map((message) => message.content)
  .join(" ")
  .toLowerCase();
if (!grounding.includes("neurokit2") || !grounding.includes("documents")) {
  throw new Error("Document snippet was absent from provider grounding");
}

const comparison = await ask("Compare the ECG processing protocol with the temperature processing guidance.");
const comparisonPaths = comparison.payload.citations?.map((citation) => citation.path) || [];
if (comparisonPaths.length !== 2
    || !comparisonPaths.includes("docs/ecg_processing_protocol.md")
    || !comparisonPaths.includes("docs/temperature_processing_guide.md")) {
  throw new Error(`Comparison sources were not both retained: ${comparisonPaths.join(", ")}`);
}
if (providerCalls.length !== 2) throw new Error("Comparison did not reach the provider exactly once");
const comparisonGrounding = JSON.parse(providerCalls[1].body).messages
  .map((message) => message.content)
  .join(" ")
  .toLowerCase();
if (!comparisonGrounding.includes("ecg_processing_protocol.md")
    || !comparisonGrounding.includes("temperature_processing_guide.md")) {
  throw new Error("Comparison grounding omitted one of the approved documents");
}
"""
    result = subprocess.run(
        ["node", "--input-type=module", "--eval", script],
        cwd=Path.cwd(),
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr or result.stdout


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
        assert environment["DASHBOARD_ASSISTANT_ENABLED"] == (
            "${DASHBOARD_ASSISTANT_ENABLED:-true}"
        )
        assert environment["DASHBOARD_ASSISTANT_LOAD_DOTENV"] == "false"
        assert environment["NANO_ID_SALT"] == (
            "${NANO_ID_SALT:-${PARTICIPANT_ID_SALT:-}}"
        )
        assert "DASHBOARD_PRESENTATION_JOB_DB" in environment
        assert "READINGS_WATCH_PATH" in environment
        assert "PIPELINE_MAX_RETRIES" in environment
        assert "NANO_DATA_ROOT" in environment
        assert "HF_HOME" not in environment
        assert services["dashboard"].get("env_file") is None
        assert all(
            str(port).startswith("127.0.0.1:")
            for port in services["dashboard"]["ports"]
        )
        assert "no-new-privileges:true" in services["dashboard"]["security_opt"]
        assert "ALL" in services["dashboard"]["cap_drop"]
        for secret_name in (
            "CLOUDFLARE_API_TOKEN",
            "CLOUDFLARE_TUNNEL_TOKEN",
            "CLOUDFLARED_TUNNEL_TOKEN",
        ):
            assert secret_name not in environment
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
        assert "share" in services["dashboard-share"]["profiles"]
        assert "share-named" in services["dashboard-share-named"]["profiles"]
        assert "share" not in services["dashboard-share-named"]["profiles"]
        named_command = services["dashboard-share-named"]["command"]
        assert "--token-file /run/secrets/cloudflare-tunnel-token" in named_command
        assert "--token " not in named_command
        assert (
            services["autoheal"]["environment"]["AUTOHEAL_CONTAINER_LABEL"]
            == "com.esdlabusc.autoheal"
        )


@pytest.mark.skipif(shutil.which("docker") is None, reason="Docker CLI unavailable")
def test_compose_preserves_assistant_disable_override():
    root = Path(__file__).resolve().parents[1]
    env = dict(os.environ)
    env["DASHBOARD_ASSISTANT_ENABLED"] = "false"
    completed = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            "/dev/null",
            "-f",
            str(root / "docker-compose.yml"),
            "config",
            "--format",
            "json",
        ],
        cwd=root,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(completed.stdout)
    dashboard_env = payload["services"]["dashboard"]["environment"]
    assert dashboard_env["DASHBOARD_ASSISTANT_ENABLED"] == "false"
    assert dashboard_env["DASHBOARD_ASSISTANT_LOAD_DOTENV"] == "false"


def test_share_script_normalizes_legacy_tunnel_token_for_compose_secret():
    root = Path(__file__).resolve().parents[1]
    script = (root / "scripts" / "share_dashboard.sh").read_text(encoding="utf-8")
    assert 'export CLOUDFLARE_TUNNEL_TOKEN="$named_tunnel_token"' in script


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
