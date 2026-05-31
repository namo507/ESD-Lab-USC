"""Focused unit tests for the presentation-plan helpers and SPA routing.

These cover the model-independent pieces: option normalization, deck-plan
normalization / response shape, JSON extraction, prompt construction, and the
SPA route whitelist regression for the new route. The local GGUF generator is
never invoked here.
"""

from __future__ import annotations

import threading
import time

from dashboard.assistant.local_chat_assistant import (
    AssistantConfig,
    AssistantUnavailable,
    DashboardChatAssistant,
    build_presentation_messages,
    extract_json_object,
    normalize_deck_plan,
    normalize_presentation_options,
)
from dashboard.server import live_dashboard_server as server
from dashboard.server.live_dashboard_server import (
    PresentationJobStore,
    _start_presentation_job_worker,
    _run_presentation_job,
    is_spa_route,
)


def _grounding(grounded: bool = False, citations=None):
    return {"grounded": grounded, "citations": citations or [], "focus_sections": []}


_OK_PLAN = {
    "plan": {
        "title": "T", "subtitle": "s", "audience_level": "beginner", "summary": "x",
        "disclaimer": None, "grounded": False, "citations": [],
        "slides": [{"id": "t", "type": "title", "title": "T", "bullets": [], "citations": []}],
    },
    "status": {"ready": True},
}


class _OkAssistant:
    def plan_presentation(self, concept, options=None):
        return _OK_PLAN


class _UnavailableAssistant:
    def plan_presentation(self, concept, options=None):
        raise AssistantUnavailable("model-missing: download the GGUF asset", {"ready": False}, http_status=503)


class _CrashAssistant:
    def plan_presentation(self, concept, options=None):
        raise RuntimeError("RAW MODEL TENSOR DUMP 0xDEADBEEF")


def test_normalize_options_applies_defaults():
    opts = normalize_presentation_options({})
    assert opts == {
        "audience_level": "beginner",
        "slide_count": 6,
        "include_analogy": True,
        "include_worked_example": True,
        "tone": "calm, simple, and non-technical",
    }


def test_normalize_options_clamps_and_coerces():
    opts = normalize_presentation_options(
        {"audience": "expert", "slides": 99, "analogy": "no", "worked_example": False}
    )
    assert opts["audience_level"] == "beginner"  # unknown -> default
    assert opts["slide_count"] == 10  # clamped to max
    assert opts["include_analogy"] is False
    assert opts["include_worked_example"] is False

    low = normalize_presentation_options({"slide_count": 1, "audience_level": "advanced"})
    assert low["slide_count"] == 3  # clamped to min
    assert low["audience_level"] == "advanced"


def test_extract_json_object_handles_fences_and_trailing_commas():
    text = 'Sure!\n```json\n{"title":"X","slides":[{"type":"concept","title":"A"},],}\n```'
    parsed = extract_json_object(text)
    assert parsed is not None
    assert parsed["title"] == "X"
    assert isinstance(parsed["slides"], list)


def test_extract_json_object_returns_none_for_garbage():
    assert extract_json_object("no json here at all") is None
    assert extract_json_object("") is None


def test_normalize_deck_plan_enforces_structure_and_caps():
    raw = {
        "title": "Understanding Gradient Descent",
        "slides": [
            {
                "type": "concept",
                "title": "The idea",
                "bullets": ["one", "two", "three", "four", "five", "six", "seven"],
            }
        ],
    }
    opts = normalize_presentation_options({})
    plan = normalize_deck_plan(raw, concept="gradient descent", options=opts, grounding=_grounding())

    types = [s["type"] for s in plan["slides"]]
    assert types[0] == "title"
    assert types[-1] == "recap"
    assert "why" in types
    assert "analogy" in types  # default include
    assert "example" in types  # default include
    # Bullet cap enforced on every slide.
    assert all(len(s["bullets"]) <= 5 for s in plan["slides"])
    # Every slide carries the strict contract keys.
    for slide in plan["slides"]:
        assert set(slide) == {
            "id", "type", "title", "subtitle", "bullets",
            "example", "analogy", "note", "citations", "visual",
        }


def test_normalize_deck_plan_disclaimer_and_citation_gating():
    # Ungrounded: a disclaimer is added and no citations survive.
    ungrounded = normalize_deck_plan(
        {"slides": [{"type": "concept", "title": "A", "bullets": ["x"], "citations": ["fake.ref"]}]},
        concept="photosynthesis",
        options=normalize_presentation_options({}),
        grounding=_grounding(grounded=False),
    )
    assert ungrounded["grounded"] is False
    assert ungrounded["disclaimer"]
    assert ungrounded["citations"] == []
    assert all(s["citations"] == [] for s in ungrounded["slides"])

    # Grounded: deck-level citations pass through and slide refs are kept.
    grounded = normalize_deck_plan(
        {"slides": [{"type": "concept", "title": "A", "bullets": ["x"], "citations": ["enrollment.overall"]}]},
        concept="HRV",
        options=normalize_presentation_options({}),
        grounding=_grounding(grounded=True, citations=["meta.study.name"]),
    )
    assert grounded["grounded"] is True
    assert grounded["citations"] == ["meta.study.name"]
    assert any("enrollment.overall" in s["citations"] for s in grounded["slides"])


def test_normalize_deck_plan_respects_toggle_off():
    opts = normalize_presentation_options({"include_analogy": False, "include_worked_example": False})
    plan = normalize_deck_plan({}, concept="entropy", options=opts, grounding=_grounding())
    types = [s["type"] for s in plan["slides"]]
    assert "analogy" not in types
    assert "example" not in types
    assert types[0] == "title" and types[-1] == "recap"


def test_build_presentation_messages_shape_and_grounding_rules():
    opts = normalize_presentation_options({})
    msgs = build_presentation_messages("HRV", opts, "Study: NANO", _grounding(grounded=True, citations=["meta.study.name"]))
    assert [m["role"] for m in msgs] == ["system", "user"]
    system = msgs[0]["content"]
    assert "JSON" in system
    assert "meta.study.name" in system  # grounded citation hint surfaced

    ungrounded = build_presentation_messages("black holes", opts, "", _grounding(grounded=False))
    assert "do not invent" in ungrounded[0]["content"].lower()


def test_spa_route_whitelist_includes_new_and_existing_routes():
    # New route + hard-refresh sub-paths resolve as SPA routes.
    assert is_spa_route("/presentation-maker")
    assert is_spa_route("/presentation-maker/anything")
    # Existing routes still resolve (regression guard, incl. /matlab).
    assert is_spa_route("/matlab")
    assert is_spa_route("/overview")
    assert is_spa_route("/redcap")
    # API endpoints are never treated as SPA document routes.
    assert not is_spa_route("/api/presentation/plan")


# ---------------------------------------------------------------------------
# Async presentation job lifecycle (transport)
# ---------------------------------------------------------------------------


def test_job_create_is_queued_without_result_or_error(tmp_path):
    store = PresentationJobStore(db_path=tmp_path / "jobs.sqlite3")
    job = store.create("What is RMSSD?", {"audience_level": "beginner"})
    assert job["status"] == "queued"
    view = store.public_view(job)
    assert view["status"] == "queued"
    assert "result" not in view and "error" not in view
    assert view["progress_message"]
    assert view["poll_after_ms"] > 0


def test_job_worker_success_carries_result(tmp_path):
    store = PresentationJobStore(db_path=tmp_path / "jobs.sqlite3")
    job = store.create("rmssd", {})
    assert store.claim(job["job_id"], "worker-1")
    _run_presentation_job(
        store,
        _OkAssistant(),
        threading.Semaphore(1),
        job["job_id"],
        "worker-1",
    )
    done = store.get(job["job_id"])
    assert done["status"] == "succeeded"
    view = store.public_view(done)
    assert view["result"]["plan"]["slides"][0]["type"] == "title"
    assert "error" not in view


def test_job_worker_assistant_unavailable_is_clean_failure(tmp_path):
    store = PresentationJobStore(db_path=tmp_path / "jobs.sqlite3")
    job = store.create("rmssd", {})
    lock = threading.Semaphore(1)
    assert store.claim(job["job_id"], "worker-1")
    _run_presentation_job(store, _UnavailableAssistant(), lock, job["job_id"], "worker-1")
    view = store.public_view(store.get(job["job_id"]))
    assert view["status"] == "failed"
    assert "download the GGUF" in view["error"]
    assert "result" not in view
    # Lock must be released even on failure.
    assert lock.acquire(blocking=False)
    lock.release()


def test_job_worker_unexpected_error_does_not_leak_model_text(tmp_path):
    store = PresentationJobStore(db_path=tmp_path / "jobs.sqlite3")
    job = store.create("rmssd", {})
    assert store.claim(job["job_id"], "worker-1")
    _run_presentation_job(
        store,
        _CrashAssistant(),
        threading.Semaphore(1),
        job["job_id"],
        "worker-1",
    )
    view = store.public_view(store.get(job["job_id"]))
    assert view["status"] == "failed"
    assert "RAW MODEL" not in view["error"]
    assert view["error"] == "Generation failed unexpectedly. Please try again."


def test_job_unknown_returns_none(tmp_path):
    store = PresentationJobStore(db_path=tmp_path / "jobs.sqlite3")
    assert store.get("does-not-exist") is None


def test_job_expires_after_ttl(tmp_path):
    store = PresentationJobStore(db_path=tmp_path / "jobs.sqlite3", ttl_seconds=0.0)
    job = store.create("rmssd", {})
    assert store.claim(job["job_id"], "worker-1")
    store.complete_failure(job["job_id"], "worker-1", "expired soon")
    time.sleep(0.01)
    assert store.get(job["job_id"]) is None


def test_job_lock_busy_times_out_to_failure(monkeypatch, tmp_path):
    monkeypatch.setattr(server, "PRESENTATION_JOB_LOCK_TIMEOUT", 0.05)
    store = PresentationJobStore(db_path=tmp_path / "jobs.sqlite3")
    job = store.create("rmssd", {})
    busy = threading.Semaphore(1)
    busy.acquire()  # hold the lock so the worker cannot acquire it
    assert store.claim(job["job_id"], "worker-1")
    _run_presentation_job(store, _OkAssistant(), busy, job["job_id"], "worker-1")
    view = store.public_view(store.get(job["job_id"]))
    assert view["status"] == "failed"
    assert "busy" in view["error"].lower()


def test_job_registry_is_bounded(tmp_path):
    store = PresentationJobStore(db_path=tmp_path / "jobs.sqlite3", max_jobs=5)
    ids = [store.create(f"c{i}", {})["job_id"] for i in range(20)]
    # Registry never exceeds the bound; older jobs are evicted.
    assert store.count() <= 5
    # The most recent job is retained.
    assert store.get(ids[-1]) is not None


def test_job_survives_restart_and_is_recoverable(tmp_path):
    db_path = tmp_path / "jobs.sqlite3"
    first = PresentationJobStore(db_path=db_path, stale_seconds=0.01)
    job = first.create("rmssd", {})
    assert first.claim(job["job_id"], "dead-worker")
    time.sleep(0.02)

    restarted = PresentationJobStore(db_path=db_path, stale_seconds=0.01)
    assert restarted.recoverable_job_ids() == [job["job_id"]]


def test_recoverable_job_can_finish_after_restart(tmp_path):
    db_path = tmp_path / "jobs.sqlite3"
    first = PresentationJobStore(db_path=db_path, stale_seconds=0.01)
    job = first.create("rmssd", {})
    assert first.claim(job["job_id"], "dead-worker")
    time.sleep(0.02)

    restarted = PresentationJobStore(db_path=db_path, stale_seconds=0.01)
    assert _start_presentation_job_worker(
        restarted,
        _OkAssistant(),
        threading.Semaphore(1),
        job["job_id"],
    )
    deadline = time.time() + 1.0
    while time.time() < deadline:
        done = restarted.get(job["job_id"])
        if done and done["status"] == "succeeded":
            break
        time.sleep(0.01)
    assert restarted.get(job["job_id"])["status"] == "succeeded"


# ---------------------------------------------------------------------------
# JSON-mode runtime knob (version-guarded fallback)
# ---------------------------------------------------------------------------


def test_complete_text_uses_json_mode_then_falls_back(tmp_path):
    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing", presentation_json_mode=True),
        data_dir=tmp_path,
    )
    seen = []

    class FakeGen:
        def create_chat_completion(self, **kwargs):
            seen.append("response_format" in kwargs)
            if "response_format" in kwargs:
                raise TypeError("unexpected keyword argument 'response_format'")
            return {"choices": [{"message": {"content": '{"ok": true}'}}]}

    text = assistant._complete_text(
        FakeGen(), [{"role": "user", "content": "hi"}], max_tokens=64, json_mode=True
    )
    assert text == '{"ok": true}'
    # First call tried JSON mode, second fell back without it.
    assert seen == [True, False]


def test_complete_text_respects_disabled_json_mode(tmp_path):
    assistant = DashboardChatAssistant(
        config=AssistantConfig(model_dir=tmp_path / "missing", presentation_json_mode=False),
        data_dir=tmp_path,
    )
    seen = {}

    class FakeGen:
        def create_chat_completion(self, **kwargs):
            seen["response_format"] = "response_format" in kwargs
            return {"choices": [{"message": {"content": "x"}}]}

    assistant._complete_text(
        FakeGen(), [{"role": "user", "content": "q"}], max_tokens=8, json_mode=True
    )
    assert seen["response_format"] is False
