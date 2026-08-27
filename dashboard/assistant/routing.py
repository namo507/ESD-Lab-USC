"""Pick which assistant tier answers, based on what was asked.

The provider chain in :mod:`dashboard.assistant.provider` fails over on
*availability*: it tries each tier in a fixed order and moves on when one is
down. That is the right behaviour for an outage and the wrong one for a hard
question, because a request that needs the 120B model still starts at the fast
one and gets a fast, shallow answer.

This module adds the missing axis. It classifies a question, then produces a
tier order for that class. Availability failover still applies underneath: the
order here is a *preference*, and a tier that is down is skipped exactly as
before.

The policy is speed-first by design. Most questions asked of this dashboard are
lookups -- "how many participants", "when did REDCap last sync" -- and the
fastest tier answers them correctly. Escalation is the exception, reserved for
questions whose wording shows they need reasoning rather than recall.

Nothing here calls a model or touches the network, so the whole policy is
testable as a pure function.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Literal, Sequence

QuestionClass = Literal["quick", "standard", "deep"]

# How capable and how fast each tier is, relative to the others in this
# deployment. Keyed on ProviderConfig.normalized_provider -- the tier name --
# rather than on a model id, so swapping the model behind a tier does not
# silently change routing.
CAPABILITY_RANK: dict[str, int] = {
    "nvidia": 3,
    "nvidia-nim": 3,
    "gemini": 2,
    "local": 1,
}
SPEED_RANK: dict[str, int] = {
    "gemini": 3,
    "local": 2,
    "nvidia": 1,
    "nvidia-nim": 1,
}

# Wording that shows the answer needs reasoning over several facts rather than
# retrieval of one. Deliberately about the *shape* of the question, not its
# topic -- a topic list would rot as the dashboard grows.
DEEP_MARKERS: tuple[str, ...] = (
    "compare",
    "contrast",
    "difference between",
    "trade-off",
    "tradeoff",
    "why does",
    "why did",
    "why is",
    "root cause",
    "diagnose",
    "debug",
    "derive",
    "prove",
    "reconcile",
    "implication",
    "walk me through",
    "step by step",
    "step-by-step",
    "pros and cons",
    "recommend",
    "should we",
    "what would happen",
    "how should",
    "design",
    "rewrite",
    "refactor",
    "summarize the differences",
)

# Wording that shows a single fact is wanted. These beat length: "how many
# participants are enrolled in the NANO study right now" is still a lookup.
QUICK_MARKERS: tuple[str, ...] = (
    "how many",
    "how much",
    "when did",
    "when was",
    "what is the",
    "what's the",
    "who is",
    "list the",
    "show me the",
    "status of",
    "last sync",
    "count of",
    "is there",
    "are there",
    "does the",
)

# A question carrying several requests at once needs a model that can hold
# them together.
_MULTIPART = re.compile(
    r"\b(and then|after that|also tell me|as well as)\b|\?.*\?", re.IGNORECASE
)
_CODE_BLOCK = re.compile(r"```|\bstack trace\b|\btraceback\b", re.IGNORECASE)

# Word counts at which a question stops looking like a lookup.
QUICK_WORD_CEILING = 12
DEEP_WORD_FLOOR = 45


@dataclass(frozen=True)
class RoutingDecision:
    """The plan for one request."""

    question_class: QuestionClass
    #: Provider families in the order they should be attempted.
    tier_order: tuple[str, ...]
    max_tokens: int
    temperature: float
    #: Short, loggable explanation. Never contains the question itself, which
    #: may carry text a coordinator typed about a participant.
    reason: str

    def as_log_fields(self) -> dict[str, object]:
        return {
            "question_class": self.question_class,
            "tier_order": list(self.tier_order),
            "max_tokens": self.max_tokens,
            "reason": self.reason,
        }


def _normalize(question: str) -> str:
    return re.sub(r"\s+", " ", str(question or "")).strip().lower()


def classify_question(question: str, *, history_turns: int = 0) -> QuestionClass:
    """Sort a question into the class that decides its routing.

    ``history_turns`` is the number of prior turns in the conversation. A long
    thread is itself evidence of a harder task, so it nudges the class up.
    """
    text = _normalize(question)
    if not text:
        return "quick"

    words = len(text.split())

    if _CODE_BLOCK.search(text):
        return "deep"
    if any(marker in text for marker in DEEP_MARKERS):
        return "deep"
    if _MULTIPART.search(text):
        return "deep"
    if words >= DEEP_WORD_FLOOR:
        return "deep"

    # A quick marker wins over length: these are lookups however verbosely
    # they are phrased.
    if any(marker in text for marker in QUICK_MARKERS):
        return "quick" if history_turns < 6 else "standard"
    if words <= QUICK_WORD_CEILING:
        return "quick" if history_turns < 6 else "standard"

    return "standard"


def order_tiers(
    providers: Sequence[str],
    question_class: QuestionClass,
) -> tuple[str, ...]:
    """Order the available tiers for a class, most preferred first.

    Ties break on the other axis, so the ordering is total and therefore
    stable: two tiers never swap places between identical calls.
    """
    known = [name for name in providers if name]
    if not known:
        return ()

    if question_class == "deep":
        # Capability first; among equals prefer the faster one.
        key = lambda name: (  # noqa: E731 - a sort key reads better inline
            -CAPABILITY_RANK.get(name, 0),
            -SPEED_RANK.get(name, 0),
            name,
        )
    else:
        # Speed first; among equals prefer the more capable one.
        key = lambda name: (  # noqa: E731
            -SPEED_RANK.get(name, 0),
            -CAPABILITY_RANK.get(name, 0),
            name,
        )

    # dict.fromkeys keeps first occurrence, so a duplicated tier does not
    # earn two attempts.
    return tuple(sorted(dict.fromkeys(known), key=key))


def plan_route(
    question: str,
    providers: Iterable[str],
    *,
    concise_tokens: int,
    detailed_tokens: int,
    base_temperature: float,
    history_turns: int = 0,
) -> RoutingDecision:
    """Produce the full plan: class, tier order, token ceiling, temperature.

    Token ceilings come from the caller because they are already policy
    elsewhere in the assistant; this function only chooses between them.
    """
    question_class = classify_question(question, history_turns=history_turns)
    tier_order = order_tiers(list(providers), question_class)

    if question_class == "deep":
        max_tokens = max(1, int(detailed_tokens))
        temperature = float(base_temperature)
        reason = "reasoning markers or length; strongest tier first"
    elif question_class == "standard":
        max_tokens = max(1, int(concise_tokens))
        temperature = float(base_temperature)
        reason = "no lookup or reasoning markers; fastest tier first"
    else:
        max_tokens = max(1, int(concise_tokens))
        # A lookup has one right answer, so sampling buys nothing and costs
        # both determinism and time.
        temperature = min(float(base_temperature), 0.2)
        reason = "lookup markers or short question; fastest tier first"

    return RoutingDecision(
        question_class=question_class,
        tier_order=tier_order,
        max_tokens=max_tokens,
        temperature=temperature,
        reason=reason,
    )


__all__ = [
    "CAPABILITY_RANK",
    "DEEP_MARKERS",
    "QUICK_MARKERS",
    "SPEED_RANK",
    "QuestionClass",
    "RoutingDecision",
    "classify_question",
    "order_tiers",
    "plan_route",
]
