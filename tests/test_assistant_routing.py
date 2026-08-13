"""The assistant's tier routing is a decision table, so it is tested as one.

The chain already fails over on availability. These tests cover the axis that
was missing: choosing a tier by what the question needs, so a hard question
does not get a fast, shallow answer from the cheapest model.
"""

from __future__ import annotations

import pytest

from dashboard.assistant.routing import (
    RoutingDecision,
    classify_question,
    order_tiers,
    plan_route,
)

ALL_FAMILIES = ("gemini", "nvidia", "local")


# --- classification --------------------------------------------------------


@pytest.mark.parametrize(
    "question",
    [
        "how many participants are enrolled?",
        "when did REDCap last sync",
        "what is the completion rate",
        "status of the NANO study",
        "list the active instruments",
    ],
)
def test_lookups_are_quick(question):
    assert classify_question(question) == "quick"


@pytest.mark.parametrize(
    "question",
    [
        "compare NANO and NICO enrollment",
        "why did the REDCap sync fail",
        "walk me through the completion calculation",
        "what are the pros and cons of suppressing small cells",
        "should we widen the freshness SLA",
        "diagnose the drop in IPSA completion",
    ],
)
def test_reasoning_questions_are_deep(question):
    assert classify_question(question) == "deep"


def test_a_verbose_lookup_is_still_a_lookup():
    # Length alone must not escalate: this is one fact, asked politely.
    question = (
        "Hi, I was wondering if you could tell me how many participants are "
        "currently enrolled in the NANO study as of this morning please"
    )
    assert classify_question(question) == "quick"


def test_a_long_question_without_markers_escalates():
    question = " ".join(["word"] * 50)
    assert classify_question(question) == "deep"


def test_multipart_questions_escalate():
    assert classify_question("show the rate and then explain the dip") == "deep"
    assert classify_question("what is the rate? what about NICO?") == "deep"


def test_pasted_stack_traces_escalate():
    assert classify_question("fix this:\n```\nTraceback\n```") == "deep"


def test_a_long_thread_lifts_a_quick_question_to_standard():
    # Deep in a conversation, a terse follow-up usually depends on everything
    # before it, so the cheapest tier is no longer the safe default.
    assert classify_question("how many now?", history_turns=0) == "quick"
    assert classify_question("how many now?", history_turns=8) == "standard"


def test_empty_input_does_not_escalate():
    assert classify_question("") == "quick"
    assert classify_question("   ") == "quick"


# --- tier ordering ---------------------------------------------------------


def test_quick_questions_go_to_the_fastest_tier_first():
    assert order_tiers(ALL_FAMILIES, "quick")[0] == "gemini"


def test_deep_questions_go_to_the_most_capable_tier_first():
    assert order_tiers(ALL_FAMILIES, "deep")[0] == "nvidia"


def test_every_available_tier_stays_in_the_order():
    # Reordering is a preference, never a filter: an outage on the preferred
    # tier must still be able to fall through to the others.
    for question_class in ("quick", "standard", "deep"):
        assert set(order_tiers(ALL_FAMILIES, question_class)) == set(ALL_FAMILIES)


def test_ordering_is_stable_and_deduplicated():
    assert order_tiers(("gemini", "gemini", "local"), "quick") == ("gemini", "local")
    first = order_tiers(ALL_FAMILIES, "deep")
    assert first == order_tiers(tuple(reversed(ALL_FAMILIES)), "deep")


def test_a_single_configured_tier_is_returned_unchanged():
    assert order_tiers(("local",), "deep") == ("local",)


def test_unknown_families_are_kept_but_ranked_last():
    order = order_tiers(("mystery", "gemini"), "quick")
    assert order[0] == "gemini"
    assert "mystery" in order


def test_no_configured_tiers_yields_an_empty_order():
    assert order_tiers((), "deep") == ()
    assert order_tiers(("",), "quick") == ()


# --- full plan -------------------------------------------------------------


def plan(question: str, families=ALL_FAMILIES, **kwargs) -> RoutingDecision:
    return plan_route(
        question,
        families,
        concise_tokens=256,
        detailed_tokens=1024,
        base_temperature=0.7,
        **kwargs,
    )


def test_a_lookup_gets_the_fast_tier_a_tight_ceiling_and_low_temperature():
    decision = plan("how many participants are enrolled?")

    assert decision.question_class == "quick"
    assert decision.tier_order[0] == "gemini"
    assert decision.max_tokens == 256
    # One right answer: sampling buys nothing and costs determinism.
    assert decision.temperature == pytest.approx(0.2)


def test_a_reasoning_question_escalates_and_gets_room_to_answer():
    decision = plan("compare NANO and NICO completion and explain the gap")

    assert decision.question_class == "deep"
    assert decision.tier_order[0] == "nvidia"
    assert decision.max_tokens == 1024
    assert decision.temperature == pytest.approx(0.7)


def test_the_plan_degrades_to_whatever_is_configured():
    # Only the local tier available: a deep question still routes, to it.
    decision = plan("why did the sync fail", families=("local",))
    assert decision.tier_order == ("local",)
    assert decision.question_class == "deep"


def test_token_ceilings_are_never_below_one():
    decision = plan_route(
        "how many?",
        ALL_FAMILIES,
        concise_tokens=0,
        detailed_tokens=0,
        base_temperature=0.7,
    )
    assert decision.max_tokens >= 1


def test_log_fields_carry_the_decision_but_never_the_question():
    question = "how many participants named in the intake note are enrolled?"
    fields = plan(question).as_log_fields()

    assert set(fields) == {"question_class", "tier_order", "max_tokens", "reason"}
    assert question not in str(fields)
    # The reason is a fixed phrase, not interpolated user text.
    assert "lookup markers" in str(fields["reason"])


def test_decisions_are_deterministic():
    question = "compare NANO and NICO enrollment"
    assert plan(question) == plan(question)


# --- chain integration -----------------------------------------------------


class _StubConfig:
    def __init__(self, name: str) -> None:
        self.normalized_provider = name
        self.effective_label = name


class _StubTier:
    """Minimal provider: records calls, optionally fails."""

    def __init__(self, name: str, *, healthy: bool = True, fails: bool = False) -> None:
        self.config = _StubConfig(name)
        self.name = name
        self._healthy = healthy
        self._fails = fails
        self.calls = 0

    def status(self) -> dict:
        return {"ready": self._healthy, "can_attempt": self._healthy}

    def complete(self, messages, **kwargs) -> str:
        self.calls += 1
        if self._fails:
            from dashboard.assistant.provider import ProviderError

            raise ProviderError(f"{self.name} down", state="degraded")
        return f"answer from {self.name}"


def build_chain(*tiers):
    from dashboard.assistant.provider import FallbackProvider

    return FallbackProvider(list(tiers))


def test_chain_honours_the_routing_preference():
    gemini, nvidia, local = _StubTier("gemini"), _StubTier("nvidia"), _StubTier("local")
    chain = build_chain(gemini, nvidia, local)

    reply = chain.complete(
        [{"role": "user", "content": "compare the studies"}],
        max_tokens=512,
        temperature=0.7,
        top_p=0.9,
        prefer_providers=order_tiers(("gemini", "nvidia", "local"), "deep"),
    )

    # Deep question: the strongest tier answered even though it is second in
    # the configured order.
    assert reply == "answer from nvidia"
    assert gemini.calls == 0


def test_default_order_is_unchanged_without_a_preference():
    gemini, nvidia = _StubTier("gemini"), _StubTier("nvidia")
    chain = build_chain(gemini, nvidia)

    reply = chain.complete(
        [{"role": "user", "content": "how many?"}],
        max_tokens=128,
        temperature=0.2,
        top_p=0.9,
    )

    assert reply == "answer from gemini"


def test_preference_reorders_but_never_filters():
    # The preferred tier is down; the chain must still reach the others.
    gemini, nvidia = _StubTier("gemini"), _StubTier("nvidia", fails=True)
    chain = build_chain(gemini, nvidia)

    reply = chain.complete(
        [{"role": "user", "content": "why did it fail"}],
        max_tokens=512,
        temperature=0.7,
        top_p=0.9,
        prefer_providers=("nvidia", "gemini"),
    )

    assert nvidia.calls == 1
    assert reply == "answer from gemini"


def test_unhealthy_tiers_are_still_skipped_entirely():
    down, up = _StubTier("nvidia", healthy=False), _StubTier("gemini")
    chain = build_chain(down, up)

    reply = chain.complete(
        [{"role": "user", "content": "compare"}],
        max_tokens=512,
        temperature=0.7,
        top_p=0.9,
        prefer_providers=("nvidia", "gemini"),
    )

    assert down.calls == 0
    assert reply == "answer from gemini"
