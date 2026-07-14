"""Tests for the live dashboard readings/runtime helpers."""

from __future__ import annotations

import http.client
import json
import threading
from contextlib import contextmanager
from functools import partial
from io import BytesIO

import pandas as pd
import pytest

from dashboard.assistant.local_chat_assistant import (
    AssistantConfig,
    DashboardChatAssistant,
)
from dashboard.pipelines import (
    bootstrap_dashboard_demo_inputs,
    build_dashboard_data,
    build_org_site_data,
    build_readings_index,
)
from dashboard.server import live_dashboard_server
from dashboard.server.live_dashboard_server import is_runtime_healthy, snapshot_path


class _UnusedRuntime:
    def read_state(self):
        return {"status": "ok", "dashboard": {}, "readings": {}, "errors": []}


class _UnusedAssistant:
    def get_status(self):
        return {"ready": True, "state": "ready"}

    def answer(self, message, history=None):  # pragma: no cover - test guard
        raise AssertionError("assistant should not be called")

    def stream(self, message, history=None):  # pragma: no cover - test guard
        raise AssertionError("assistant should not be called")

    def plan_presentation(self, concept, options=None):  # pragma: no cover
        raise AssertionError("assistant should not be called")


class _UnusedJobs:
    def create(self, concept, options):  # pragma: no cover - test guard
        raise AssertionError("job store should not be called")


class _NeverProvider:
    def status(self):
        return {
            "ready": True,
            "can_attempt": True,
            "state": "ready",
            "dependencies": {"test": True},
        }

    def complete(self, **kwargs):  # pragma: no cover - invalid requests stop first
        raise AssertionError("provider should not be called")

    def stream(self, **kwargs):  # pragma: no cover - invalid requests stop first
        raise AssertionError("provider should not be called")


@contextmanager
def _running_api_server(tmp_path, *, assistant=None, jobs=None):
    handler = partial(
        live_dashboard_server.RepoRequestHandler,
        runtime=_UnusedRuntime(),
        assistant=assistant or _UnusedAssistant(),
        jobs=jobs or _UnusedJobs(),
        directory=str(tmp_path),
    )
    server = live_dashboard_server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield int(server.server_address[1])
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def _api_request(port, method, path, payload=None, *, headers=None):
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request_headers = dict(headers or {})
    if body is not None:
        request_headers.setdefault("Content-Type", "application/json")
        request_headers.setdefault("Content-Length", str(len(body)))
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
    try:
        connection.request(method, path, body=body, headers=request_headers)
        response = connection.getresponse()
        raw_body = response.read()
        response_headers = {
            name.casefold(): value for name, value in response.getheaders()
        }
        decoded = (
            json.loads(raw_body)
            if raw_body
            and response_headers.get("content-type", "").startswith("application/json")
            else None
        )
        return response.status, response_headers, decoded
    finally:
        connection.close()


def test_runtime_paths_honor_relative_and_absolute_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("DASHBOARD_DATA_DIR", "tmp/dashboard-runtime")
    assert (
        live_dashboard_server._configured_runtime_path(
            "DASHBOARD_DATA_DIR",
            tmp_path / "unused",
        )
        == live_dashboard_server.PROJECT_ROOT / "tmp/dashboard-runtime"
    )

    absolute_output = tmp_path / "lab-readings.json"
    monkeypatch.setenv("LAB_READINGS_OUTPUT", str(absolute_output))
    assert (
        live_dashboard_server._configured_runtime_path(
            "LAB_READINGS_OUTPUT",
            live_dashboard_server.PROJECT_ROOT / "web" / "lab-readings.json",
        )
        == absolute_output
    )


def test_build_payload_indexes_readings(tmp_path):
    """Reading index should count files and expose repo-relative links."""
    readings_dir = tmp_path / "esd-lab-readings"
    readings_dir.mkdir()
    (
        readings_dir
        / "Emotion-understanding-in-infants_2025_Advances-in-Child-Development.pdf"
    ).write_text("pdf")
    (readings_dir / "ResearchStrategy_Final.pdf").write_text("pdf")

    payload = build_readings_index.build_payload(readings_dir)

    assert payload["summary"]["total_readings"] == 2
    assert any(
        item["relative_href"].startswith("../esd-lab-readings/")
        for item in payload["readings"]
    )
    assert {item["category"] for item in payload["readings"]}


def test_build_payload_extracts_grant_material_category(tmp_path):
    """Grant-like filenames should be categorized separately from articles."""
    readings_dir = tmp_path / "esd-lab-readings"
    readings_dir.mkdir()
    (readings_dir / "SpecificAims_BradshawR01_A1.pdf").write_text("pdf")

    payload = build_readings_index.build_payload(readings_dir)

    assert payload["readings"][0]["category"] == "Grant Materials"
    assert payload["readings"][0]["source"] == "Grant Materials"


def test_derive_title_from_excerpt_uses_article_title_not_chapter_label():
    """Excerpt parsing should keep the real article title.

    Chapter prefixes should be removed.
    """
    excerpt = (
        "CHAPTER FOUR "
        "Autonomic and attentional pathways in the emergence of autism: "
        "bridging mechanisms and real-world contexts in infancy "
        "Jessica Bradshaw a , b , *, Emma Platt a , b"
    )

    derived = build_readings_index.derive_title_from_excerpt(excerpt)

    assert derived == (
        "Autonomic and attentional pathways in the emergence of autism: "
        "bridging mechanisms and real-world contexts in infancy"
    )


def test_extract_authors_from_excerpt_skips_affiliations():
    """Author extraction should capture names only.

    Affiliation fragments should be excluded.
    """
    excerpt = (
        "CHAPTER THREE "
        "Emotion understanding in infants and young children: "
        "How input shapes emotional development "
        "Vanessa LoBue a , *, Marianella Casasola b , Lisa M. Oakes c "
        "a University of Rutgers b University of California"
    )

    authors = build_readings_index.extract_authors_from_excerpt(excerpt)

    assert authors == [
        "Vanessa LoBue",
        "Marianella Casasola",
        "Lisa M. Oakes",
    ]


def test_main_writes_json_output(tmp_path):
    """CLI entry point should emit a JSON payload to the requested path."""
    readings_dir = tmp_path / "esd-lab-readings"
    readings_dir.mkdir()
    (
        readings_dir / "Childhood-essentialism_2025_Advances-in-Child-Development.pdf"
    ).write_text("pdf")
    output_path = tmp_path / "readings.json"
    cache_path = tmp_path / ".readings_cache.json"

    exit_code = build_readings_index.main(
        [
            "--readings-dir",
            str(readings_dir),
            "--output",
            str(output_path),
            "--cache",
            str(cache_path),
        ]
    )

    payload = json.loads(output_path.read_text())
    assert exit_code == 0
    assert payload["meta"]["total_readings"] == 1


def test_snapshot_path_changes_when_directory_changes(tmp_path):
    """Watch snapshots should change when a file is modified."""
    watch_dir = tmp_path / "watched"
    watch_dir.mkdir()
    tracked_file = watch_dir / "paper.pdf"
    tracked_file.write_text("first")

    before = snapshot_path(watch_dir)
    tracked_file.write_text("second")
    after = snapshot_path(watch_dir)

    assert before != after


def test_is_runtime_healthy_requires_ok_state_and_outputs():
    """Health checks should require a clean ok state with both payloads present."""
    assert is_runtime_healthy(
        {
            "status": "ok",
            "dashboard": {"generated_at": "2026-04-18T21:04:10"},
            "readings": {"generated_at": "2026-04-18T21:04:15"},
            "errors": [],
        }
    )
    assert not is_runtime_healthy(
        {
            "status": "degraded",
            "dashboard": {"generated_at": "2026-04-18T21:04:10"},
            "readings": {"generated_at": "2026-04-18T21:04:15"},
            "errors": ["watch loop failure"],
        }
    )


def test_assistant_rate_limiter_is_bounded_and_recovers():
    limiter = live_dashboard_server.SlidingWindowRateLimiter(2, 10)

    assert limiter.allow("visitor", now=0) == (True, 0)
    assert limiter.allow("visitor", now=1) == (True, 0)
    assert limiter.allow("visitor", now=2) == (False, 8)
    assert limiter.allow("other", now=2) == (True, 0)
    assert limiter.allow("visitor", now=11) == (True, 0)


def test_dashboard_cors_only_allows_same_origin_or_explicit_local_origin():
    allowed = {"http://localhost:5173"}

    assert live_dashboard_server._origin_allowed(
        "https://dashboard.example.org", "dashboard.example.org", allowed
    )
    assert live_dashboard_server._origin_allowed(
        "http://localhost:5173", "127.0.0.1:8080", allowed
    )
    assert not live_dashboard_server._origin_allowed(
        "https://attacker.example", "dashboard.example.org", allowed
    )
    assert not live_dashboard_server._origin_allowed(
        "null", "dashboard.example.org", allowed
    )


def test_mutating_dashboard_routes_require_operator_token():
    assert live_dashboard_server._mutation_requires_operator(
        "POST", "/api/v2/redcap-visit-entry"
    )
    assert live_dashboard_server._mutation_requires_operator(
        "POST", "/api/publications/sync/trigger"
    )
    assert live_dashboard_server._mutation_requires_operator(
        "PATCH", "/api/visits/NANO-001/epochs/0"
    )
    assert not live_dashboard_server._mutation_requires_operator("POST", "/api/chat")
    assert not live_dashboard_server._mutation_requires_operator("POST", "/api/audit")


def test_allowed_cors_origin_echoes_credentials_header(monkeypatch, tmp_path):
    monkeypatch.setenv("DASHBOARD_CORS_ALLOWED_ORIGINS", "http://localhost:5173")

    with _running_api_server(tmp_path) as port:
        status, headers, _ = _api_request(
            port,
            "OPTIONS",
            "/api/chat",
            headers={"Origin": "http://localhost:5173"},
        )

    assert status == 204
    assert headers["access-control-allow-origin"] == "http://localhost:5173"
    assert headers["access-control-allow-credentials"] == "true"


def test_untrusted_cors_origin_does_not_receive_credentials(monkeypatch, tmp_path):
    monkeypatch.setenv("DASHBOARD_CORS_ALLOWED_ORIGINS", "http://localhost:5173")

    with _running_api_server(tmp_path) as port:
        status, headers, _ = _api_request(
            port,
            "OPTIONS",
            "/api/chat",
            headers={"Origin": "https://attacker.example"},
        )

    assert status == 403
    assert "access-control-allow-origin" not in headers
    assert "access-control-allow-credentials" not in headers


def test_audit_endpoint_is_browser_usable_and_writes_bounded_event(
    monkeypatch, tmp_path
):
    audit_path = tmp_path / "audit" / "hipaa_access.log"
    monkeypatch.setattr(live_dashboard_server, "AUDIT_LOG_PATH", audit_path)
    monkeypatch.setattr(
        live_dashboard_server,
        "AUDIT_RATE_LIMITER",
        live_dashboard_server.SlidingWindowRateLimiter(0, 60),
    )

    with _running_api_server(tmp_path) as port:
        status, _, response = _api_request(
            port,
            "POST",
            "/api/audit",
            {
                "ts": "2026-07-14T12:00:00Z",
                "action": "route.navigate",
                "scope": "/overview",
                "detail": {"source": "navigation", "count": 1},
            },
        )

    assert status == 204
    assert response is None
    assert json.loads(audit_path.read_text(encoding="utf-8")) == {
        "action": "route.navigate",
        "detail": {"count": 1, "source": "navigation"},
        "scope": "/overview",
        "ts": "2026-07-14T12:00:00Z",
    }


@pytest.mark.parametrize(
    "payload,error_fragment",
    [
        (
            {
                "action": "unknown.action",
                "scope": "/overview",
                "detail": {},
            },
            "not recognized",
        ),
        (
            {
                "action": "route.navigate",
                "scope": "/overview",
                "detail": {"nested": {"not": "allowed"}},
            },
            "text, numbers, or booleans",
        ),
        (
            {
                "action": "route.navigate",
                "scope": "x" * (live_dashboard_server.AUDIT_SCOPE_MAX_CHARS + 1),
                "detail": {},
            },
            "scope must not exceed",
        ),
    ],
)
def test_audit_endpoint_rejects_unbounded_or_invalid_fields(
    monkeypatch, tmp_path, payload, error_fragment
):
    monkeypatch.setattr(
        live_dashboard_server,
        "AUDIT_RATE_LIMITER",
        live_dashboard_server.SlidingWindowRateLimiter(0, 60),
    )

    with _running_api_server(tmp_path) as port:
        status, _, response = _api_request(port, "POST", "/api/audit", payload)

    assert status == 400
    assert error_fragment in response["error"]


def test_audit_endpoint_rate_limits_per_client(monkeypatch, tmp_path):
    monkeypatch.setattr(
        live_dashboard_server,
        "AUDIT_LOG_PATH",
        tmp_path / "audit" / "hipaa_access.log",
    )
    monkeypatch.setattr(
        live_dashboard_server,
        "AUDIT_RATE_LIMITER",
        live_dashboard_server.SlidingWindowRateLimiter(1, 60),
    )
    payload = {"action": "route.navigate", "scope": "/overview", "detail": {}}

    with _running_api_server(tmp_path) as port:
        first_status, _, _ = _api_request(port, "POST", "/api/audit", payload)
        second_status, headers, response = _api_request(
            port, "POST", "/api/audit", payload
        )

    assert first_status == 204
    assert second_status == 429
    assert int(headers["retry-after"]) >= 1
    assert response["status"] == "rate-limited"


def test_worker_original_client_ip_requires_sentinel_and_trusted_zone(monkeypatch):
    class StubHandler:
        client_address = ("127.0.0.1", 1234)

        def __init__(self, headers):
            self.headers = headers

    key = live_dashboard_server.RepoRequestHandler._client_rate_limit_key
    original_header = live_dashboard_server.ORIGINAL_CLIENT_IP_HEADER
    worker_header = live_dashboard_server.CLOUDFLARE_WORKER_ZONE_HEADER
    worker_ip = str(live_dashboard_server.CLOUDFLARE_WORKER_EGRESS_IP)
    trusted_zone = "esd-lab-namo.pages.dev"
    monkeypatch.setattr(
        live_dashboard_server,
        "TRUSTED_CLOUDFLARE_WORKER_ZONE",
        trusted_zone,
    )

    assert (
        key(
            StubHandler(
                {
                    "CF-Connecting-IP": worker_ip,
                    worker_header: trusted_zone,
                    original_header: "203.0.113.41",
                }
            )
        )
        == "cf-original:203.0.113.41"
    )
    assert (
        key(
            StubHandler(
                {
                    "CF-Connecting-IP": worker_ip,
                    worker_header: trusted_zone,
                    original_header: "not-an-ip",
                }
            )
        )
        == f"cf:{worker_ip}"
    )
    assert (
        key(
            StubHandler(
                {
                    "CF-Connecting-IP": worker_ip,
                    worker_header: "attacker.example",
                    original_header: "203.0.113.41",
                }
            )
        )
        == f"cf:{worker_ip}"
    )
    assert (
        key(
            StubHandler(
                {
                    "CF-Connecting-IP": worker_ip,
                    original_header: "203.0.113.41",
                }
            )
        )
        == f"cf:{worker_ip}"
    )
    assert (
        key(
            StubHandler(
                {
                    "CF-Connecting-IP": "198.51.100.9",
                    original_header: "203.0.113.41",
                }
            )
        )
        == "cf:198.51.100.9"
    )
    assert key(StubHandler({original_header: "203.0.113.41"})) == "peer:127.0.0.1"


def test_chat_http_boundaries_reject_invalid_input_before_success_headers(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(
        live_dashboard_server,
        "ASSISTANT_RATE_LIMITER",
        live_dashboard_server.SlidingWindowRateLimiter(0, 60),
    )
    assistant = DashboardChatAssistant(
        config=AssistantConfig(
            model_dir=tmp_path / "missing",
            max_message_chars=5,
            max_history_chars=10,
            history_turns=2,
        ),
        data_dir=tmp_path,
        provider=_NeverProvider(),
    )

    with _running_api_server(tmp_path, assistant=assistant) as port:
        cases = [
            ("/api/chat", {"message": 12, "history": []}, 400, "must be text"),
            (
                "/api/assistant/chat",
                {"message": 12, "history": []},
                400,
                "must be text",
            ),
            ("/api/chat", {"message": "123456", "history": []}, 413, "too long"),
            (
                "/api/assistant/chat",
                {"message": "123456", "history": []},
                413,
                "too long",
            ),
            (
                "/api/assistant/chat",
                {"message": "hello", "history": "not-a-list"},
                400,
                "history must be a list",
            ),
        ]
        for path, payload, expected_status, error_fragment in cases:
            status, headers, response = _api_request(port, "POST", path, payload)
            assert status == expected_status
            assert headers["content-type"].startswith("application/json")
            assert error_fragment in response["error"]


def test_presentation_concept_limit_precedes_sync_and_job_work(monkeypatch, tmp_path):
    class SpyAssistant(_UnusedAssistant):
        plan_calls = 0

        def plan_presentation(self, concept, options=None):
            self.plan_calls += 1
            raise AssertionError("oversized concept reached the model")

    class SpyJobs(_UnusedJobs):
        create_calls = 0

        def create(self, concept, options):
            self.create_calls += 1
            raise AssertionError("oversized concept reached the job store")

    monkeypatch.setattr(
        live_dashboard_server,
        "ASSISTANT_RATE_LIMITER",
        live_dashboard_server.SlidingWindowRateLimiter(0, 60),
    )
    assistant = SpyAssistant()
    jobs = SpyJobs()
    payload = {
        "concept": "x" * (live_dashboard_server.PRESENTATION_MAX_CONCEPT_CHARS + 1),
        "options": {},
    }

    with _running_api_server(tmp_path, assistant=assistant, jobs=jobs) as port:
        sync_status, _, sync_response = _api_request(
            port, "POST", "/api/presentation/plan", payload
        )
        job_status, _, job_response = _api_request(
            port, "POST", "/api/presentation/jobs", payload
        )

    assert sync_status == 413
    assert job_status == 413
    assert (
        sync_response["maxChars"]
        == live_dashboard_server.PRESENTATION_MAX_CONCEPT_CHARS
    )
    assert (
        job_response["maxChars"] == live_dashboard_server.PRESENTATION_MAX_CONCEPT_CHARS
    )
    assert assistant.plan_calls == 0
    assert jobs.create_calls == 0


def test_json_request_body_must_be_an_object_and_within_limit():
    class StubHandler:
        def __init__(self, body: bytes) -> None:
            self.headers = {"Content-Length": str(len(body))}
            self.rfile = BytesIO(body)

    payload = live_dashboard_server.RepoRequestHandler._read_json_body(
        StubHandler(b'{"message":"hello"}')
    )
    assert payload == {"message": "hello"}

    with pytest.raises(ValueError, match="JSON object"):
        live_dashboard_server.RepoRequestHandler._read_json_body(
            StubHandler(b'["not", "an", "object"]')
        )


def test_materialize_demo_inputs_writes_expected_dashboard_sources(tmp_path):
    """Repo-local demo input bootstrap should emit reusable dashboard files."""
    redcap_path = tmp_path / "redcap_latest.csv"
    feature_path = tmp_path / "feature_matrix.csv"
    metrics_path = tmp_path / "_metrics.json"

    paths = bootstrap_dashboard_demo_inputs.materialize_demo_inputs(
        redcap_output=redcap_path,
        feature_output=feature_path,
        metrics_output=metrics_path,
    )

    redcap = pd.read_csv(paths["redcap"])
    feature_matrix = pd.read_csv(paths["feature_matrix"])
    metrics = json.loads(paths["metrics"].read_text())

    assert {
        "record_id",
        "redcap_event_name",
        "group_assignment",
        "dashboard_input_source",
    }.issubset(redcap.columns)
    assert redcap["dashboard_input_source"].eq("repo_demo_inputs").all()
    assert {
        "record_id",
        "event",
        "group",
        "month",
        "rsa",
        "rmssd",
        "sdnn",
        "hda_sa_pct",
    }.issubset(feature_matrix.columns)
    assert feature_matrix["dashboard_input_source"].eq("repo_demo_inputs").all()
    assert "models" in metrics and metrics["models"]


def test_build_payload_serializes_sparse_trajectory_values_as_null(tmp_path):
    """Dashboard payloads should stay strict-JSON-safe.

    Sparse trajectory cells must serialize as null.
    """
    redcap_path = tmp_path / "redcap_latest.csv"
    feature_path = tmp_path / "feature_matrix.csv"
    metrics_path = tmp_path / "_metrics.json"

    paths = bootstrap_dashboard_demo_inputs.materialize_demo_inputs(
        redcap_output=redcap_path,
        feature_output=feature_path,
        metrics_output=metrics_path,
    )

    redcap = pd.read_csv(paths["redcap"])
    feature_matrix = pd.read_csv(paths["feature_matrix"])
    metrics = json.loads(paths["metrics"].read_text())
    sparse_features = feature_matrix.loc[
        ~((feature_matrix["group"] == "ASIB") & (feature_matrix["month"] == 36))
    ].copy()

    payload = build_dashboard_data.build_payload(
        redcap=redcap,
        features=sparse_features,
        dd=None,
        metrics=metrics,
        salt="test_salt",
        data_source="repo_demo_inputs",
        organization_site=build_org_site_data.build_payload(allow_network=False),
    )

    assert payload["trajectories"]["by_group"]["ASIB"]["mean"]["RSA"][-1] is None
    assert payload["organization_site"]["impact_feed"]
    json.loads(json.dumps(payload, allow_nan=False))
