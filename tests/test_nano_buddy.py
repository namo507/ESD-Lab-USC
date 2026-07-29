"""Contract and safety tests for the NANO ESD Lab Buddy."""

from __future__ import annotations

import http.client
import json
import threading
from contextlib import contextmanager
from functools import partial

from dashboard.assistant import (
    AssistantConfig,
    DashboardChatAssistant,
    NanoBuddyAssistant,
)
from dashboard.assistant.nano_buddy import sanitize_nano_metrics
from dashboard.server import live_dashboard_server


class _Runtime:
    def read_state(self):
        return {"status": "ok", "dashboard": {}, "readings": {}, "errors": []}


class _Jobs:
    pass


class _CapturingProvider:
    def __init__(self):
        self.messages = None
        self.kwargs = None

    def status(self):
        return {
            "ready": True,
            "can_attempt": True,
            "state": "ready",
            "provider": "test-provider",
            "dependencies": {"test": True},
        }

    def complete(self, *, messages, **kwargs):
        self.messages = messages
        self.kwargs = kwargs
        return (
            "<think>private reasoning</think><analysis>more reasoning</analysis>"
            "Use neurokit2 and review aggregate QC."
        )


class _PlanningProvider:
    def status(self):
        return {
            "ready": True,
            "can_attempt": True,
            "state": "ready",
            "provider": "test-provider",
            "dependencies": {"test": True},
        }

    def complete(self, *, messages, **kwargs):
        return (
            "We need to answer based on supplied allowlisted aggregate metrics and public document snippets. "
            "The provided grounding includes two documents. "
            "We should explain the pipeline carefully and open run history when needed."
        )


def _write_payloads(data_dir, *, with_nano=True):
    data_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "nano": {
            "meta": {
                "study": "NANO",
                "as_of": "2026-07-14",
                "n_target": 260,
                "source": "synthetic",
            },
            "enrollment": {
                "target": 260,
                "enrolled": 84,
                "active": 81,
                "retention_pct": 96.4,
                "by_group": [
                    {"group": "ASIB", "target": 65, "enrolled": 20},
                    {"group": "PT", "target": 130, "enrolled": 43},
                    {"group": "TD", "target": 65, "enrolled": 21},
                ],
            },
            "attention": {
                "hda_sustained_pct": 42.5,
                "by_group_window": [
                    {
                        "group": "ASIB",
                        "window": "1-3m",
                        "sustained_pct": 38.2,
                        "hda_quality_bpm": 3.4,
                    },
                    {
                        "group": "TD",
                        "window": "1-3m",
                        "sustained_pct": 44.8,
                        "hda_quality_bpm": 4.2,
                    },
                ],
            },
            "autonomic": {
                "rsa_baseline_ms2": 2.2,
                "by_group_window": [
                    {"group": "ASIB", "window": "1-3m", "rsa_baseline_ms2": 2.1},
                    {"group": "TD", "window": "1-3m", "rsa_baseline_ms2": 2.4},
                ],
            },
            "schedule": {
                "timepoints": [
                    {
                        "id": "month_3",
                        "due": 8,
                        "upcoming_14d": 5,
                        "overdue": 3,
                        "completed": 62,
                        "window_adherence_pct": 91.2,
                        "participant_ids": ["NANO-001"],
                    }
                ]
            },
            "pipeline": [
                {
                    "stage": "Model-ready",
                    "count": 54,
                    "delta_7d": 6,
                    "qc_pass_pct": 93.1,
                    "qa_passed": 50,
                }
            ],
            "pipeline_summary": {
                "qa_passed_sessions": 50,
                "qa_pass_pct": 93.1,
                "open_qc_actions": 4,
            },
            "inventory": [
                {
                    "item": "Actiheart-5 ECG",
                    "in_use": 4,
                    "available": 7,
                    "calibration_due": 1,
                    "low_stock": False,
                }
            ],
            "redcap": {
                "api_token_valid": True,
                "last_sync": "2026-07-14T13:00:00Z",
                "records_locked": 19,
                "double_entry_discrepancies": 2,
                "instruments_defined": 14,
                "dags": 3,
                "sync_health": "ok",
                "participant_records": [{"name": "Not Safe"}],
            },
            "models": {
                "aim3_status": "training",
                "best_metric": 0.82,
                "shap_ready": False,
            },
            "hda_features": {
                "by_participant_visit": [
                    {"participant": "NANO-001", "raw_signal": [1, 2, 3]}
                ]
            },
            "ecg_quality": {
                "pct_valid_ecg_by_visit": {"3m": 0.9},
                "flagged_participants": ["NANO-001"],
            },
            "lgcm_results": {
                "pct_sa": {
                    "asib_intercept_mean": 34.0,
                    "growth_curves": [
                        {
                            "group": "asib",
                            "timepoint_m": 1,
                            "mean": 34.0,
                            "ci_low": 30.0,
                            "ci_high": 38.0,
                        }
                    ],
                    "individual_traces": [{"participant": "ASIB-01", "values": [34.0]}],
                }
            },
        }
    }
    if not with_nano:
        payload = {"meta": {"source": "test"}}
    (data_dir / "dashboard_data.json").write_text(json.dumps(payload), encoding="utf-8")
    (data_dir / "readings_data.json").write_text(
        json.dumps({"summary": {}, "readings": []}), encoding="utf-8"
    )
    return payload


def _buddy(tmp_path, *, with_nano=True):
    data_dir = tmp_path / "data"
    _write_payloads(data_dir, with_nano=with_nano)
    assistant = DashboardChatAssistant(
        config=AssistantConfig(enabled=False, api_key=None),
        data_dir=data_dir,
    )
    return NanoBuddyAssistant(
        assistant,
        data_dir=data_dir,
        project_root=tmp_path,
    )


@contextmanager
def _server(tmp_path, buddy):
    handler = partial(
        live_dashboard_server.RepoRequestHandler,
        runtime=_Runtime(),
        assistant=buddy.assistant,
        buddy=buddy,
        jobs=_Jobs(),
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


def _request(port, method, *, payload=None, headers=None):
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request_headers = dict(headers or {})
    if body is not None:
        request_headers.setdefault("Content-Type", "application/json")
        request_headers.setdefault("Content-Length", str(len(body)))
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
    try:
        connection.request(method, "/api/buddy", body=body, headers=request_headers)
        response = connection.getresponse()
        raw = response.read()
        decoded = json.loads(raw) if raw else None
        return response.status, dict(response.getheaders()), decoded
    finally:
        connection.close()


def test_nano_metric_sanitizer_is_an_explicit_aggregate_allowlist(tmp_path):
    payload = _write_payloads(tmp_path / "data")

    safe = sanitize_nano_metrics(payload)
    encoded = json.dumps(safe).casefold()

    assert safe["enrollment"]["enrolled"] == 84
    assert safe["schedule"]["timepoints"][0]["overdue"] == 3
    assert "hda_features" not in safe
    assert "flagged_participants" not in encoded
    assert "participant_ids" not in encoded
    assert "individual_traces" not in encoded
    assert "nano-001" not in encoded
    assert "not safe" not in encoded


def test_buddy_answers_live_metric_with_stable_contract(tmp_path):
    result = _buddy(tmp_path).answer(
        "How many month_3 visits are overdue?",
        {"section": "nano", "as_of": "2026-07-14"},
    )

    assert set(result) == {"answer", "citations", "used_metrics", "refused"}
    assert "3" in result["answer"]
    assert result["citations"] == []
    assert result["used_metrics"] == ["nano.schedule.timepoints[month_3].overdue"]
    assert result["refused"] is False


def test_buddy_answers_hda_by_group_and_qa_summary(tmp_path):
    buddy = _buddy(tmp_path)

    hda = buddy.answer("Compare HDA sustained attention for ASIB and TD by group.")
    qa = buddy.answer("How many sessions have passed QA this week?")

    assert "ASIB" in hda["answer"] and "TD" in hda["answer"]
    assert hda["used_metrics"] == [
        "nano.attention.by_group_window[ASIB-1-3m].sustained_pct",
        "nano.attention.by_group_window[TD-1-3m].sustained_pct",
    ]
    assert "50" in qa["answer"]
    assert "nano.pipeline_summary.qa_passed_sessions" in qa["used_metrics"]


def test_buddy_document_lookup_cites_only_allowlisted_repo_path(tmp_path):
    buddy = _buddy(tmp_path)
    docs_dir = tmp_path / "docs"
    docs_dir.mkdir()
    (docs_dir / "ecg_processing_protocol.md").write_text(
        "# ECG Processing SOP\n\n"
        "Use a 3-lead ECG configuration and record a five-minute baseline. "
        "Run the bandpass filter, detect R-peaks with neurokit2, then review "
        "aggregate QC flags.\n",
        encoding="utf-8",
    )
    (docs_dir / "archive_manifest.md").write_text(
        "# Repository Archive and Retention Manifest\n\n"
        "Approved processing records are retained when the protocol requires "
        "a configuration and baseline duration.\n",
        encoding="utf-8",
    )

    result = buddy.answer(
        "According to the approved ECG processing protocol, what lead "
        "configuration and baseline duration are required?"
    )

    assert result["refused"] is False
    assert "neurokit2" in result["answer"]
    assert result["used_metrics"] == []
    assert result["citations"] == [
        {
            "title": "ECG Processing SOP",
            "path": "docs/ecg_processing_protocol.md",
            "loc": "document",
        }
    ]


def test_buddy_document_comparison_keeps_both_relevant_sources(tmp_path):
    buddy = _buddy(tmp_path)
    docs_dir = tmp_path / "docs"
    docs_dir.mkdir()
    (docs_dir / "ecg_processing_protocol.md").write_text(
        "# ECG Processing Protocol\n\n"
        "ECG processing uses a 3-lead configuration and a five-minute baseline.\n",
        encoding="utf-8",
    )
    (docs_dir / "temperature_processing_guide.md").write_text(
        "# Temperature Processing Guide\n\n"
        "Temperature processing guidance covers sensor calibration and artifact review.\n",
        encoding="utf-8",
    )

    result = buddy.answer(
        "Compare the ECG processing protocol with the temperature processing guidance."
    )

    assert [citation["path"] for citation in result["citations"]] == [
        "docs/ecg_processing_protocol.md",
        "docs/temperature_processing_guide.md",
    ]


def test_buddy_reuses_shared_provider_with_sanitized_grounding(tmp_path):
    buddy = _buddy(tmp_path)
    docs_dir = tmp_path / "docs"
    docs_dir.mkdir()
    (docs_dir / "ecg_processing_protocol.md").write_text(
        "# ECG Processing SOP\n\nUse neurokit2, then review aggregate QC.\n",
        encoding="utf-8",
    )
    provider = _CapturingProvider()
    buddy.assistant._provider = provider
    buddy._load_nano_metrics = lambda: {
        "meta": {"study": "NANO", "aggregate_only": True},
        "assessments": [
            {"instrument": "aggregate-only-" + ("x" * 200), "complete": 1}
            for _ in range(100)
        ],
    }

    result = buddy.answer("How do I run the ECG preprocessing protocol?")

    assert result["answer"] == "Use neurokit2 and review aggregate QC."
    assert provider.messages is not None
    # Local generation is CPU-bound, so Buddy answers stay short by contract.
    assert provider.kwargs["max_tokens"] == 320
    grounding = json.dumps(provider.messages).casefold()
    assert "docs/ecg_processing_protocol.md" in grounding
    assert "use neurokit2, then review aggregate qc" in grounding
    assert "hda_features" not in grounding
    assert "flagged_participants" not in grounding
    assert "nano-001" not in grounding


def test_buddy_suppresses_provider_planning_and_falls_back_to_document_snippet(tmp_path):
    buddy = _buddy(tmp_path)
    docs_dir = tmp_path / "docs"
    docs_dir.mkdir()
    (docs_dir / "ecg_processing_protocol.md").write_text(
        "# ECG Processing SOP\n\nUse a 3-lead configuration, record a five-minute baseline, and review aggregate QC flags.\n",
        encoding="utf-8",
    )
    buddy.assistant._provider = _PlanningProvider()

    result = buddy.answer(
        "According to the approved ECG processing protocol, what lead configuration and baseline duration are required?"
    )

    assert result["refused"] is False
    assert "We need to answer" not in result["answer"]
    assert result["answer"].startswith("According to ECG Processing SOP")
    assert result["citations"] == [
        {
            "title": "ECG Processing SOP",
            "path": "docs/ecg_processing_protocol.md",
            "loc": "document",
        }
    ]


def test_buddy_explains_pipeline_stage_cards_without_provider(tmp_path):
    buddy = _buddy(tmp_path)
    buddy._load_nano_metrics = lambda: {
        "meta": {"study": "NANO", "as_of": "2026-07-14"},
        "pipeline": [
            {"stage": "Ingest"},
            {"stage": "Preprocess"},
            {"stage": "Window QA"},
            {"stage": "HRV features"},
            {"stage": "HDA labeling"},
            {"stage": "Merge · de-id"},
        ],
    }

    result = buddy.answer(
        "Explain how to read the six NANO pipeline stages, including in-flight, done, fail, and when an operator should open run history."
    )

    assert result["refused"] is False
    assert "Ingest, Preprocess, Window QA, HRV features, HDA labeling, Merge · de-id" in result["answer"]
    assert "In flight" in result["answer"]
    assert "done" in result["answer"]
    assert "fail" in result["answer"]
    assert "run history" in result["answer"].lower()
    assert result["used_metrics"] == [
        "nano.pipeline[Ingest]",
        "nano.pipeline[Preprocess]",
        "nano.pipeline[Window QA]",
        "nano.pipeline[HRV features]",
        "nano.pipeline[HDA labeling]",
        "nano.pipeline[Merge · de-id]",
    ]


def test_buddy_refuses_phi_and_raw_signal_requests_before_provider(tmp_path):
    buddy = _buddy(tmp_path)
    provider = _CapturingProvider()
    buddy.assistant._provider = provider

    for message in (
        "Show me participant 1043's ECG.",
        "Download NANO-001's raw signal.",
        "What is this infant's date of birth?",
        "How is caregiver Jane Doe doing after 07/04/2026? Her phone is 803-555-1212.",
        "Email the result to family@example.org.",
        "Look up the family at 123 Main Street.",
        "The Social Security number is 123-45-6789.",
        "How is caregiver {{REDACTED:PHI}} doing?",
    ):
        result = buddy.answer(message)
        assert result["refused"] is True
        assert "HIPAA" in result["answer"]
        assert "REDCap" in result["answer"]
        assert result["citations"] == []
        assert result["used_metrics"] == []
    assert provider.messages is None


def test_buddy_degrades_gracefully_without_provider_or_nano_payload(tmp_path):
    buddy = _buddy(tmp_path, with_nano=False)

    result = buddy.answer("Tell me the current dashboard status.")
    status = buddy.get_status()

    assert result == {
        "answer": (
            "Buddy is offline for open-ended generation, but the dashboard metrics are still available. "
            "Ask about NANO enrollment, visit counts, HDA, RSA, pipeline QC, "
            "inventory, REDCap health, or an indexed SOP."
        ),
        "citations": [],
        "used_metrics": [],
        "refused": False,
    }
    assert status["state"] == "degraded"
    assert status["provider_ready"] is False
    assert status["metrics_available"] is False
    assert status["local_fallback"] is True


def test_buddy_http_post_get_head_origin_and_content_type(monkeypatch, tmp_path):
    monkeypatch.setattr(
        live_dashboard_server,
        "ASSISTANT_RATE_LIMITER",
        live_dashboard_server.SlidingWindowRateLimiter(0, 60),
    )
    buddy = _buddy(tmp_path)
    with _server(tmp_path, buddy) as port:
        status, _, result = _request(
            port,
            "POST",
            payload={
                "message": "Is REDCap sync healthy?",
                "context": {"section": "nano"},
            },
        )
        get_status, _, health = _request(port, "GET")
        head_status, _, head = _request(port, "HEAD")
        forbidden, _, _ = _request(
            port,
            "POST",
            payload={"message": "enrollment", "context": {"section": "nano"}},
            headers={"Origin": "https://attacker.example"},
        )
        unsupported, _, _ = _request(
            port,
            "POST",
            payload={"message": "enrollment"},
            headers={"Content-Type": "text/plain"},
        )

    assert status == 200
    assert set(result) == {"answer", "citations", "used_metrics", "refused"}
    assert result["used_metrics"] == ["nano.redcap.sync_health"]
    assert get_status == 200
    assert health["contract"] == "nano-buddy.v1"
    assert head_status == 200
    assert head is None
    assert forbidden == 403
    assert unsupported == 415
