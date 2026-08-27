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


# ---------------------------------------------------------------------------
# Domain axis
#
# The class above answers "how hard is this question". This second axis answers
# "what kind of question is it", which is what decides *which* model should see
# it rather than how many tokens it gets. The two compose: a question is both a
# complexity class and a domain, and the tier order is chosen from the pair.
#
# Classification here must never require a model call. Spinning up an LLM to
# decide which LLM to use would defeat the entire purpose -- the deterministic
# tier exists precisely so that the common case never loads a model at all.
# ---------------------------------------------------------------------------

QuestionDomain = Literal["deterministic", "clinical", "operational", "exploratory", "refused"]

#: Assessment instruments, biomarkers, and clinical vocabulary. A question using
#: these wants domain knowledge, so it prefers the biomedical specialist when one
#: is loaded.
CLINICAL_MARKERS: tuple[str, ...] = (
    "ados", "bayley", "nnns", "m-chat", "mchat", "csbs", "asq-3", "asq3",
    "prapare", "epds", "vineland", "mullen",
    "rsa", "hrv", "rmssd", "vagal", "parasympathetic", "sympathetic",
    "autonomic", "heart rate variability", "respiratory sinus",
    "cptd", "skin temperature", "thermoregulation",
    "gestational age", "corrected age", "preterm", "very preterm", "vpt",
    "nicu", "morbidity", "apgar",
    "autism", "asd", "adhd", "developmental delay", "diagnosis", "diagnostic",
    "biomarker", "phenotype", "cascade",
    "eye tracking", "gaze", "still-face", "stillface", "coregulation",
    # Instruments and visits are asked about by these words far more often
    # than by an assessment's name.
    "instrument", "instruments", "assessment", "assessments", "visit", "visits",
    "visit schedule", "cga", "month visit",
    # Cohort codes from the lab context pack.
    "asib", "vpt", "td group", "pt group", "cohort",
)

#: Pipeline, freshness, and platform questions. These want the generalist plus
#: the operational context pack.
OPERATIONAL_MARKERS: tuple[str, ...] = (
    "pipeline", "redcap", "sync", "freshness", "stale", "healthz", "health check",
    "deploy", "docker", "kubernetes", "helm", "container", "restart",
    "index", "reindex", "embedding", "vector", "retrieval",
    "how current", "how old", "last updated", "last run", "last sync",
    "dashboard", "route", "endpoint", "api", "cron", "workflow",
    "error", "failing", "failed", "down", "outage", "circuit breaker",
)

#: Questions the deterministic tier answers outright from a metric lookup, with
#: no model in the loop at all. Target is under 100 ms.
DETERMINISTIC_MARKERS: tuple[str, ...] = (
    "how many", "how much", "count of", "total number",
    "when did", "when was", "last sync", "last updated", "how current",
    "what is the status", "status of", "is the", "are the",
    "list the studies", "which studies", "how many studies", "how many projects",
)


#: One boundary-anchored pattern per marker, compiled once at import. Hyphens and
#: other punctuation inside a marker are escaped, and \b is only meaningful next
#: to a word character, so markers such as "asq-3" anchor on their outer edges.
_MARKER_RE: dict[str, re.Pattern[str]] = {
    marker: re.compile(rf"(?<!\w){re.escape(marker)}(?!\w)")
    for marker in set(CLINICAL_MARKERS + OPERATIONAL_MARKERS + DETERMINISTIC_MARKERS)
}


#: A count question: answered from an artifact, never from a model.
_COUNT_RE = re.compile(r"\bhow (?:many|much)\b|\b(?:count|total number) of\b", re.IGNORECASE)

#: Wording that needs two or more facts held together rather than one looked up.
_RELATIONAL_RE = re.compile(
    r"\brelationship between\b|\bdifference between\b|\bcompare\b|\bversus\b|\bvs\.?\b"
    r"|\bhow does .{0,40} relate\b|\brelate to\b",
    re.IGNORECASE,
)


def _marker_hit(text: str, markers: tuple[str, ...]) -> bool:
    """Whether any marker appears in ``text`` as whole words.

    Bare substring matching is wrong here and quietly so: "are the" is a
    lookup marker, and it also sits inside "comp\u200bare the ACTION and IPSA
    designs" \u2014 an exploratory question that was being routed as a
    deterministic lookup because of it. Anchoring on word boundaries is what
    stops a marker from matching the middle of an unrelated word.
    """
    return any(_MARKER_RE[marker].search(text) for marker in markers)


def classify_domain(question: str) -> QuestionDomain:
    """Sort a question by what it is about, not by how hard it is.

    The order of these tests is the whole policy, and it is deliberate. Earlier
    versions checked topic before question-shape, which mis-routed twice: "how
    many instruments does NANO have" went to the clinical specialist because it
    said *instruments*, and "what is the relationship between NANO and NICO"
    went to the deterministic tier because it opened with *what is the*. Shape
    outranks topic, and both outrank the fallback.

        1. PHI            -- absolute, wins outright
        2. count          -- a lookup, whatever else it mentions
        3. relational     -- never a lookup, however short
        4. clinical topic -- domain vocabulary
        5. operational    -- platform and freshness
        6. lookup marker  -- short, plain question
        7. exploratory    -- everything else
    """
    text = _normalize(question)
    if not text:
        return "deterministic"

    # Imported lazily so this module stays cheap to import and free of the
    # provider/assistant dependency chain.
    from dashboard.assistant.nano_buddy import is_phi_or_raw_request

    if is_phi_or_raw_request(question):
        return "refused"

    # A count is answered from an artifact even when it names a system or an
    # instrument. Routing it to a model turns a sub-100 ms answer into a slow one.
    if _COUNT_RE.search(text):
        return "deterministic"

    # Relational wording needs two facts held together, so it is never a lookup.
    if _RELATIONAL_RE.search(text):
        return "exploratory"

    if _marker_hit(text, CLINICAL_MARKERS):
        return "clinical"

    operational = _marker_hit(text, OPERATIONAL_MARKERS)
    deterministic = _marker_hit(text, DETERMINISTIC_MARKERS)

    if operational:
        return "operational"
    if deterministic and len(text.split()) <= QUICK_WORD_CEILING:
        return "deterministic"
    if deterministic:
        return "deterministic"
    return "exploratory"


#: Which provider tier each domain prefers, ahead of the availability ordering.
DOMAIN_TIER_PREFERENCE: dict[str, tuple[str, ...]] = {
    "deterministic": ("deterministic",),
    "clinical": ("specialist", "local", "nvidia"),
    "operational": ("local", "nvidia"),
    "exploratory": ("local", "nvidia"),
    "refused": ("deterministic",),
}


@dataclass(frozen=True)
class DomainDecision:
    """The domain half of a routing plan."""

    domain: QuestionDomain
    #: Tier families to prefer, before availability failover is applied.
    preferred_tiers: tuple[str, ...]
    #: True when no model should be consulted at all.
    model_free: bool
    #: True when retrieval should run wide, with the reranker.
    full_retrieval: bool
    reason: str

    def as_log_fields(self) -> dict[str, object]:
        return {
            "domain": self.domain,
            "preferred_tiers": list(self.preferred_tiers),
            "model_free": self.model_free,
            "full_retrieval": self.full_retrieval,
            "reason": self.reason,
        }


def plan_domain(question: str) -> DomainDecision:
    """Classify a question's domain and say how it should be served."""
    domain = classify_domain(question)
    reasons = {
        "refused": "PHI or raw-signal request; guard fired before any retrieval",
        "deterministic": "metric lookup; answered from artifacts with no model",
        "clinical": "assessment or biomarker vocabulary; prefer the biomedical specialist",
        "operational": "platform or freshness question; generalist plus context pack",
        "exploratory": "open question; generalist with full hybrid retrieval",
    }
    return DomainDecision(
        domain=domain,
        preferred_tiers=DOMAIN_TIER_PREFERENCE[domain],
        model_free=domain in ("deterministic", "refused"),
        full_retrieval=domain == "exploratory",
        reason=reasons[domain],
    )


__all__ = [
    "CAPABILITY_RANK",
    "CLINICAL_MARKERS",
    "DETERMINISTIC_MARKERS",
    "DEEP_MARKERS",
    "DOMAIN_TIER_PREFERENCE",
    "DomainDecision",
    "OPERATIONAL_MARKERS",
    "QuestionDomain",
    "classify_domain",
    "plan_domain",
    "QUICK_MARKERS",
    "SPEED_RANK",
    "QuestionClass",
    "RoutingDecision",
    "classify_question",
    "order_tiers",
    "plan_route",
]
