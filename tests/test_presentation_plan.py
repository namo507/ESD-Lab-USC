"""Focused unit tests for the presentation-plan helpers and SPA routing.

These cover the model-independent pieces: option normalization, deck-plan
normalization / response shape, JSON extraction, prompt construction, and the
SPA route whitelist regression for the new route. The local GGUF generator is
never invoked here.
"""

from __future__ import annotations

from dashboard.assistant.local_chat_assistant import (
    build_presentation_messages,
    extract_json_object,
    normalize_deck_plan,
    normalize_presentation_options,
)
from dashboard.server.live_dashboard_server import is_spa_route


def _grounding(grounded: bool = False, citations=None):
    return {"grounded": grounded, "citations": citations or [], "focus_sections": []}


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
