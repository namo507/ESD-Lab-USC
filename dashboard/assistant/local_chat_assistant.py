"""Grounded ESD Lab dashboard assistant backed by NVIDIA Nemotron.

Grounding and deterministic dashboard answers remain local to this module.  A
small, lazy provider seam handles hosted NVIDIA generation so provider failures
never prevent the rest of the dashboard from starting or serving data.
"""

from __future__ import annotations

import json
import os
import re
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from dashboard.assistant.provider import (
    GEMINI_API_BASE,
    GEMINI_DEFAULT_MODEL,
    GEMINI_RUNTIME,
    LOCAL_API_BASE,
    LOCAL_DEFAULT_MODEL,
    LOCAL_RUNTIME,
    NVIDIA_HOSTED_API_BASE,
    NVIDIA_HOSTED_RUNTIME,
    NVIDIA_NEMOTRON_MODEL,
    AssistantProvider,
    ProviderConfig,
    ProviderError,
    build_provider,
    build_provider_chain,
    completion_content,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = PROJECT_ROOT / "dashboard" / "data"
DEFAULT_LLM_CONFIG_PATH = PROJECT_ROOT / "config" / "llm_model.json"
DEFAULT_MODEL_ID = NVIDIA_NEMOTRON_MODEL
# Nullable legacy fields remain in status responses for older dashboard clients.
DEFAULT_MODEL_DIR: Path | None = None
DEFAULT_MODEL_FILE: str | None = None
DEFAULT_CONTEXT_WINDOW = 32768
DEFAULT_BATCH_SIZE = 0
DEFAULT_MAX_NEW_TOKENS = 16384
DEFAULT_THREAD_COUNT = 0
DEFAULT_MAX_MESSAGE_CHARS = 6000
DEFAULT_MAX_HISTORY_CHARS = 8000
EMPTY_GROUNDED_REPLY = (
    "I do not have enough grounded dashboard context to answer that yet. "
    "Try asking about enrollment, data quality, model performance, or readings."
)
CONTEXT_WINDOW_TOKEN_RESERVE = 320
APPROX_CONTEXT_CHARS_PER_TOKEN = 2
SUMMARY_KEYS = (
    "meta",
    "enrollment",
    "visit_completion",
    "data_quality",
    "ml_performance",
    "trajectories",
    "hda_composition",
    "attrition_funnel",
    "county_profiles",
    "participant_operations",
    "redcap_audit",
    "redcap_meta",
    "redcap_completion_stats",
    "redcap_visit_health",
    "redcap_trackers",
    "redcap_timeline",
    "redcap_clinical",
    "redcap_integrity",
    "redcap_schedule",
    "redcap_respondent",
    "redcap_platform",
    "redcap_predictive",
    "clinical_cutoffs",
    "redcap_ops",
    "matlab_integration",
    "cohort_table",
    "organization_site",
    "nano",
    "nico",
    "shared",
    "lab_operations",
)
TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_]{2,}")
SECTION_KEYWORDS: dict[str, set[str]] = {
    "enrollment": {
        "enrollment",
        "enrolled",
        "recruitment",
        "participant",
        "participants",
        "cohort",
        "group",
        "groups",
        "target",
        "asib",
        "pt",
        "td",
    },
    "visit_completion": {
        "visit",
        "visits",
        "completion",
        "completed",
        "event",
        "events",
        "nicu",
        "month",
        "months",
    },
    "data_quality": {
        "quality",
        "missing",
        "missingness",
        "discrepancy",
        "discrepancies",
        "rejected",
    },
    "redcap_audit": {
        "query",
        "queries",
        "audit",
        "active",
        "withdrawn",
        "review",
    },
    "redcap_visit_health": {
        "csbs",
        "visit",
        "visits",
        "carry",
        "forward",
        "carry-forward",
        "anomaly",
        "anomalies",
        "completeness",
        "complete",
        "incomplete",
        "unverified",
        "skipped",
        "skip",
        "not",
        "started",
        "6",
        "9",
        "12",
        "24",
        "r1",
        "r2",
        "r3",
        "r4",
        "r5",
        "freshness",
        "synced",
        "sync",
        "visit_date",
    },
    "redcap_meta": {
        "freshness",
        "fresh",
        "synced",
        "sync",
        "source",
        "records",
        "anomalies",
    },
    "redcap_completion_stats": {
        "csbs",
        "completeness",
        "complete",
        "incomplete",
        "unverified",
        "skipped",
        "not",
        "started",
        "6",
        "9",
        "12",
        "24",
    },
    "redcap_trackers": {
        "tracker",
        "trackers",
        "target",
        "behind",
        "event",
        "events",
        "funnel",
        "queue",
        "instrument",
        "heatwall",
        "scheduled",
        "expected",
        "completed",
    },
    "redcap_timeline": {
        "timeline",
        "swimlane",
        "swimlanes",
        "event",
        "events",
        "visit",
        "visits",
        "record",
        "records",
    },
    "redcap_ops": {
        "runtime",
        "parity",
        "sync",
        "synced",
        "freshness",
        "fresh",
        "pages",
        "docker",
        "k8s",
        "kubernetes",
        "ledger",
        "controls",
        "knobs",
    },
    "redcap_clinical": {
        "clinical",
        "epds",
        "depression",
        "maternal",
        "screen",
        "positive",
        "developmental",
        "asq",
        "mcdi",
        "csbs",
        "ados",
        "autism",
        "risk",
        "constellation",
        "cascade",
    },
    "redcap_integrity": {
        "integrity",
        "nullity",
        "missingness",
        "double",
        "entry",
        "diff",
        "response",
        "quality",
        "branching",
        "validation",
        "radar",
    },
    "redcap_schedule": {
        "schedule",
        "scheduling",
        "forecast",
        "upcoming",
        "overdue",
        "visit",
        "window",
        "adherence",
        "beeswarm",
        "retention",
        "survival",
        "calendar",
        "lag",
    },
    "redcap_respondent": {
        "respondent",
        "caregiver",
        "fatigue",
        "concordance",
    },
    "redcap_platform": {
        "platform",
        "api",
        "logging",
        "log",
        "audit",
        "report",
        "reports",
        "file",
        "repository",
        "user",
        "users",
        "dag",
    },
    "redcap_predictive": {
        "predictive",
        "prediction",
        "attrition",
        "risk",
        "incompletion",
        "early",
        "warning",
        "memo",
        "weekly",
        "natural",
        "language",
    },
    "clinical_cutoffs": {
        "epds",
        "cutoff",
        "cutoffs",
        "threshold",
        "thresholds",
        "epsilon",
        "privacy",
        "window",
    },
    "participant_operations": {
        "role",
        "roles",
        "id",
        "legend",
        "dual",
        "nino",
        "nico",
        "anonico",
        "aih",
        "eh",
        "form",
        "forms",
        "packet",
        "questionnaire",
        "questionnaires",
        "scheduling",
        "risk",
        "linking",
        "numbering",
        "intervention",
        "workflow",
        "workflows",
    },
    "lab_operations": {
        "lab",
        "operations",
        "workflow",
        "workflows",
        "role",
        "roles",
        "handoff",
        "handoffs",
        "coordinator",
        "coordinators",
        "graduate",
        "grad",
        "undergraduate",
        "undergrad",
        "supervisor",
        "supervisors",
        "sam",
        "bradshaw",
        "grant",
        "grants",
        "coding",
        "scoring",
        "assessment",
        "assessments",
        "family",
        "families",
        "phase",
        "phases",
        "priority",
        "priorities",
        "rollout",
        "quick",
        "wins",
        "data",
        "dataset",
        "datasets",
        "management",
        "report",
        "reports",
        "reporting",
        "demographic",
        "demographics",
        "projection",
        "projections",
        "budget",
        "finance",
        "systems",
        "audit",
        "tool",
        "tools",
        "owner",
        "owners",
        "ownership",
        "storage",
        "external",
        "collaboration",
        "collaborations",
        "website",
        "esdlabsc",
        "metric",
        "metrics",
        "business",
        "hours",
        "visit",
        "visits",
    },
    "database_features": {
        "data",
        "explorer",
        "sql",
        "table",
        "tables",
        "publication",
        "publications",
        "pubmed",
        "orcid",
        "crossref",
        "citation",
        "citations",
        "bibtex",
        "changelog",
        "change",
        "history",
        "snapshot",
        "snapshots",
        "version",
        "diff",
    },
    "ml_performance": {
        "model",
        "models",
        "auroc",
        "auc",
        "roc",
        "performance",
        "accuracy",
        "sensitivity",
        "specificity",
        "f1",
        "cnn",
        "lstm",
        "leaderboard",
        "shap",
        "beeswarm",
        "xgboost",
        "random",
        "forest",
        "confusion",
        "terrain",
        "contour",
        "confidence",
        "gradient",
    },
    "trajectories": {
        "trajectory",
        "trajectories",
        "rsa",
        "growth",
        "curve",
        "curves",
        "rmss",
        "rmssd",
        "sdnn",
        "hda",
        "age",
        "adjusted",
        "chronological",
        "cga",
        "river",
        "milestone",
        "milestones",
    },
    "hda_composition": {
        "hda",
        "cga",
        "river",
        "milestone",
        "milestones",
        "composition",
        "phase",
        "phases",
        "orienting",
        "regulation",
        "termination",
        "recovery",
    },
    "attrition_funnel": {
        "attrition",
        "retention",
        "funnel",
        "dropout",
        "dropouts",
        "reason",
        "reasons",
        "nih",
        "report",
        "retained",
        "consented",
        "enrolled",
    },
    "county_profiles": {
        "county",
        "counties",
        "comparator",
        "compare",
        "profile",
        "profiles",
        "sdoh",
        "adi",
        "rurality",
        "transportation",
        "broadband",
        "completion",
    },
    "matlab_integration": {
        "matlab",
        "parquet",
        "manifest",
        "queue",
        "processing",
        "artifact",
        "handoff",
        "thermal",
        "hda",
        "hrv",
    },
    "cohort_table": {
        "swimmer",
        "attrition",
        "retention",
        "funnel",
        "passport",
        "timeline",
        "swimlane",
        "dropout",
        "cohort",
        "participant",
        "participants",
        "completion",
        "missingness",
        "nda",
    },
    "readings": {
        "reading",
        "readings",
        "library",
        "paper",
        "papers",
        "article",
        "articles",
        "literature",
        "research",
        "strategy",
        "grant",
        "document",
        "pdf",
        "protocol",
        "summary",
        "summarize",
        "summarise",
        "design",
        "analytic",
        "analysis",
        "measure",
        "measures",
    },
    "organization_site": {
        "nano",
        "newborn",
        "purpose",
        "website",
        "site",
        "esd",
        "lab",
        "news",
        "story",
        "stories",
        "contact",
        "resources",
        "resource",
        "mission",
        "team",
        "public",
        "insight",
        "insights",
        "executive",
        "summary",
        "stakeholder",
        "stakeholders",
    },
    "cluster": {
        "cluster",
        "kubernetes",
        "k8s",
        "pipeline",
        "watcher",
        "worker",
        "job",
        "jobs",
        "cronjob",
        "freshness",
        "indexed",
        "healthy",
        "health",
    },
    "dynamics": {
        "dyad",
        "dyadic",
        "coregulation",
        "co-regulation",
        "synchrony",
        "lead",
        "lag",
        "phase",
        "portrait",
        "arousal",
        "attention",
        "cva",
        "gaze",
        "stillface",
        "still-face",
        "suppression",
        "bypass",
        "passport",
        "archetype",
        "archetypes",
        "cascade",
        "simulator",
        "eco-validity",
        "ecological",
        "stream",
        "coverage",
    },
}
READING_SUMMARY_REQUEST_TOKENS = {
    "summarize",
    "summarise",
    "summary",
    "explain",
    "explanation",
    "outline",
    "design",
    "measure",
    "measures",
    "method",
    "methods",
    "analytic",
    "analysis",
    "plan",
    "strategy",
    "protocol",
}
DETAIL_REQUEST_TOKENS = {
    "compare",
    "detail",
    "details",
    "explain",
    "how",
    "list",
    "outline",
    "summarize",
    "summarise",
    "summary",
    "why",
}
NANO_EXPLAINER_TOKENS = {
    "5",
    "five",
    "child",
    "eli5",
    "kid",
    "kids",
    "old",
    "simple",
    "simply",
    "year",
    "years",
}
CONCISE_RESPONSE_TOKEN_LIMIT = 96
DETAILED_RESPONSE_TOKEN_LIMIT = 144
DEFAULT_GENERATION_QUEUE_TIMEOUT_SECONDS = 90.0
LOW_CONFIDENCE_SCORE_THRESHOLD = 3.0
FOCUSED_CONFIDENCE_SCORE_THRESHOLD = 5.0
DEFAULT_CONTEXT_EVIDENCE_LIMIT = 8
FOCUSED_CONTEXT_EVIDENCE_LIMIT = 6
MIN_RELEVANT_FRAGMENT_SCORE = 1.0

# ---- Presentation planning -------------------------------------------------
PRESENTATION_AUDIENCE_LEVELS = ("beginner", "intermediate", "advanced")
PRESENTATION_SLIDE_TYPES = ("title", "why", "concept", "analogy", "example", "recap")
PRESENTATION_DEFAULT_SLIDE_COUNT = 6
PRESENTATION_MIN_SLIDES = 3
PRESENTATION_MAX_SLIDES = 10
PRESENTATION_MAX_BULLETS = 5
PRESENTATION_DEFAULT_TONE = "calm, simple, and non-technical"
PRESENTATION_CONTEXT_CHAR_CAP = 1200
PRESENTATION_MAX_NEW_TOKENS = 768
PRESENTATION_GENERAL_DISCLAIMER = (
    "This deck is a general, simplified explanation. It is not drawn from ESD Lab "
    "or NANO study materials, so it carries no lab-specific citations."
)


def _env_first(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value is not None and value.strip():
            return value.strip()
    return None


class AssistantUnavailable(RuntimeError):
    """Raised when the assistant is configured but cannot answer yet."""

    def __init__(self, message: str, status: dict[str, Any], http_status: int = 503):
        super().__init__(message)
        self.status = status
        self.http_status = http_status


@dataclass
class AssistantConfig:
    enabled: bool = True
    provider: str = "nvidia"
    runtime: str = NVIDIA_HOSTED_RUNTIME
    api_base: str = NVIDIA_HOSTED_API_BASE
    api_key: str | None = field(default=None, repr=False)
    model_id: str = DEFAULT_MODEL_ID
    model_dir: Path | None = DEFAULT_MODEL_DIR
    model_file: str | None = DEFAULT_MODEL_FILE
    model_tier: str = "hosted"
    model_label: str = "NVIDIA Nemotron 3 Super 120B A12B"
    model_license: str = "NVIDIA API terms"
    auto_download: bool = False
    device_preference: str = "provider-managed"
    enable_thinking: bool = False
    reasoning_budget: int = 0
    max_new_tokens: int = DEFAULT_MAX_NEW_TOKENS
    temperature: float = 0.2
    top_p: float = 0.95
    stream_enabled: bool = True
    request_timeout_seconds: float = 180.0
    max_retries: int = 6
    retry_base_seconds: float = 2.0
    retry_max_seconds: float = 30.0
    retry_jitter: float = 0.25
    max_concurrency: int = 2
    circuit_failure_threshold: int = 3
    circuit_recovery_seconds: float = 60.0
    self_hosted_enabled: bool = False
    self_hosted_base_url: str = "http://nemotron-nim:8000/v1"
    # Ordered failover tiers. The first entry is the primary; each later entry
    # is tried only when every earlier one is unconfigured or failing.
    fallback_chain: tuple[str, ...] = ()
    gemini_api_key: str | None = field(default=None, repr=False)
    gemini_api_base: str = GEMINI_API_BASE
    gemini_model: str = GEMINI_DEFAULT_MODEL
    local_enabled: bool = False
    local_api_base: str = LOCAL_API_BASE
    local_model: str = LOCAL_DEFAULT_MODEL
    #: Additional local models to fall back through, best first.
    #:
    #: One runtime can serve several models, so "the local tier is down" is
    #: rarely true -- what actually happens is that one *model* fails: it is
    #: still loading, it returns an empty answer, or it trips its breaker. A
    #: ladder of models on the same runtime turns that into a degradation
    #: rather than an outage, and each rung keeps its own circuit breaker.
    local_fallback_models: tuple[str, ...] = ()
    context_char_budget: int = 12000
    # Deprecated local-runtime knobs remain constructor-compatible only.
    min_available_memory_gib: float = 0.0
    history_turns: int = 6
    max_message_chars: int = DEFAULT_MAX_MESSAGE_CHARS
    max_history_chars: int = DEFAULT_MAX_HISTORY_CHARS
    context_window: int = DEFAULT_CONTEXT_WINDOW
    batch_size: int = DEFAULT_BATCH_SIZE
    thread_count: int = DEFAULT_THREAD_COUNT
    generation_queue_timeout_seconds: float = 180.0
    # Presentation-planner specific knobs (tunable without touching chat).
    presentation_max_new_tokens: int = PRESENTATION_MAX_NEW_TOKENS
    presentation_context_char_cap: int = PRESENTATION_CONTEXT_CHAR_CAP
    presentation_json_mode: bool = True

    @classmethod
    def from_env(cls) -> "AssistantConfig":
        provider = _env_first("DASHBOARD_ASSISTANT_PROVIDER") or "nvidia"
        normalized_provider = provider.strip().lower()
        provider_requests_self_hosted = normalized_provider in {
            "nim",
            "nvidia-nim",
            "self-hosted",
            "self-hosted-nim",
        }
        self_hosted_enabled = _parse_bool(
            os.getenv("DASHBOARD_ASSISTANT_SELF_HOSTED_ENABLED"), default=False
        )
        use_self_hosted = provider_requests_self_hosted or self_hosted_enabled
        effective_provider = "nvidia-nim" if use_self_hosted else provider
        return cls(
            enabled=_parse_bool(os.getenv("DASHBOARD_ASSISTANT_ENABLED"), default=True),
            provider=effective_provider,
            runtime=(
                "nvidia-nim"
                if use_self_hosted
                else (
                    _env_first("DASHBOARD_ASSISTANT_RUNTIME") or NVIDIA_HOSTED_RUNTIME
                )
            ),
            api_base=(
                _env_first("DASHBOARD_ASSISTANT_API_BASE", "OPENAI_BASE_URL")
                or NVIDIA_HOSTED_API_BASE
            ),
            api_key=_env_first("DASHBOARD_ASSISTANT_API_KEY", "OPENAI_API_KEY"),
            model_id=(
                _env_first("DASHBOARD_ASSISTANT_MODEL", "DASHBOARD_ASSISTANT_MODEL_ID")
                or DEFAULT_MODEL_ID
            ),
            model_dir=None,
            model_file=None,
            model_tier="self-hosted" if use_self_hosted else "hosted",
            model_label="NVIDIA Nemotron 3 Super 120B A12B",
            model_license="NVIDIA API terms",
            auto_download=False,
            device_preference=(
                "self-hosted-gpu" if use_self_hosted else "provider-managed"
            ),
            enable_thinking=_parse_bool(
                os.getenv("DASHBOARD_ASSISTANT_ENABLE_THINKING"), default=False
            ),
            reasoning_budget=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_REASONING_BUDGET"), default=0
            ),
            max_new_tokens=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_MAX_NEW_TOKENS"),
                default=DEFAULT_MAX_NEW_TOKENS,
            ),
            temperature=_parse_float(
                os.getenv("DASHBOARD_ASSISTANT_TEMPERATURE"),
                default=0.2,
            ),
            top_p=_parse_float(
                os.getenv("DASHBOARD_ASSISTANT_TOP_P"),
                default=0.95,
            ),
            stream_enabled=_parse_bool(
                os.getenv("DASHBOARD_ASSISTANT_STREAM"), default=True
            ),
            request_timeout_seconds=_parse_float(
                os.getenv("DASHBOARD_ASSISTANT_REQUEST_TIMEOUT_SECONDS"),
                default=180.0,
            ),
            max_retries=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_MAX_RETRIES"), default=6
            ),
            retry_base_seconds=_parse_float(
                os.getenv("DASHBOARD_ASSISTANT_RETRY_BASE_SECONDS"), default=2.0
            ),
            retry_max_seconds=_parse_float(
                os.getenv("DASHBOARD_ASSISTANT_RETRY_MAX_SECONDS"), default=30.0
            ),
            retry_jitter=_parse_float(
                os.getenv("DASHBOARD_ASSISTANT_RETRY_JITTER"), default=0.25
            ),
            max_concurrency=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_MAX_CONCURRENCY"), default=2
            ),
            circuit_failure_threshold=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_CIRCUIT_FAILURE_THRESHOLD"), default=3
            ),
            circuit_recovery_seconds=_parse_float(
                os.getenv("DASHBOARD_ASSISTANT_CIRCUIT_RECOVERY_SECONDS"),
                default=60.0,
            ),
            self_hosted_enabled=self_hosted_enabled,
            self_hosted_base_url=(
                _env_first("DASHBOARD_ASSISTANT_SELF_HOSTED_BASE_URL")
                or "http://nemotron-nim:8000/v1"
            ),
            fallback_chain=_parse_chain(
                os.getenv("DASHBOARD_ASSISTANT_FALLBACK_CHAIN")
            ),
            gemini_api_key=_env_first(
                "DASHBOARD_ASSISTANT_GEMINI_API_KEY",
                "GEMINI_API_KEY",
                "GOOGLE_API_KEY",
            ),
            gemini_api_base=(
                _env_first("DASHBOARD_ASSISTANT_GEMINI_API_BASE") or GEMINI_API_BASE
            ),
            gemini_model=(
                _env_first("DASHBOARD_ASSISTANT_GEMINI_MODEL")
                or GEMINI_DEFAULT_MODEL
            ),
            local_enabled=_parse_bool(
                os.getenv("DASHBOARD_ASSISTANT_LOCAL_ENABLED"), default=False
            ),
            local_api_base=(
                _env_first("DASHBOARD_ASSISTANT_LOCAL_API_BASE") or LOCAL_API_BASE
            ),
            local_fallback_models=_parse_chain(
                os.getenv("DASHBOARD_ASSISTANT_LOCAL_FALLBACK_MODELS")
            ),
            local_model=(
                _env_first("DASHBOARD_ASSISTANT_LOCAL_MODEL") or LOCAL_DEFAULT_MODEL
            ),
            context_char_budget=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_CONTEXT_BUDGET"),
                default=12000,
            ),
            history_turns=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_HISTORY_TURNS"),
                default=6,
            ),
            max_message_chars=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_MAX_MESSAGE_CHARS"),
                default=DEFAULT_MAX_MESSAGE_CHARS,
            ),
            max_history_chars=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_MAX_HISTORY_CHARS"),
                default=DEFAULT_MAX_HISTORY_CHARS,
            ),
            context_window=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_CONTEXT_WINDOW"),
                default=DEFAULT_CONTEXT_WINDOW,
            ),
            generation_queue_timeout_seconds=_parse_float(
                os.getenv("DASHBOARD_ASSISTANT_QUEUE_TIMEOUT_SECONDS"),
                default=180.0,
            ),
            presentation_max_new_tokens=_parse_int(
                os.getenv("DASHBOARD_PRESENTATION_MAX_TOKENS"),
                default=PRESENTATION_MAX_NEW_TOKENS,
            ),
            presentation_context_char_cap=_parse_int(
                os.getenv("DASHBOARD_PRESENTATION_CONTEXT_CAP"),
                default=PRESENTATION_CONTEXT_CHAR_CAP,
            ),
            presentation_json_mode=_parse_bool(
                os.getenv("DASHBOARD_PRESENTATION_JSON_MODE"),
                default=True,
            ),
        )

    # ── Provider failover ────────────────────────────────────────────────
    # Tier order when the operator has not pinned one explicitly: the fastest
    # credentialed cloud tier, then the strongest, then a local runtime that
    # needs no credential and no network.
    DEFAULT_FALLBACK_CHAIN = ("gemini", "nvidia", "local")

    def _tier_config(self, tier: str) -> ProviderConfig | None:
        """Build one named tier, or None when it is not usable as configured.

        When a tier is also the explicitly selected primary provider, the
        generic ``DASHBOARD_ASSISTANT_*`` values take precedence over the
        tier-specific ones, so pointing ``DASHBOARD_ASSISTANT_PROVIDER`` at a
        backend and setting only the generic key still works.
        """
        name = tier.strip().lower()
        primary = ProviderConfig(provider=self.provider).normalized_provider

        if name in {"gemini", "google"}:
            key = (self.gemini_api_key or "").strip()
            base = self.gemini_api_base
            model = self.gemini_model
            if primary == "gemini":
                key = key or (self.api_key or "").strip()
                if self.api_base and self.api_base != NVIDIA_HOSTED_API_BASE:
                    base = self.api_base
                if self.model_id and self.model_id != DEFAULT_MODEL_ID:
                    model = self.model_id
            if not key:
                return None
            return self._with_shared_limits(
                provider="gemini",
                runtime=GEMINI_RUNTIME,
                api_base=base,
                api_key=key,
                model=model,
                label=f"gemini:{model}",
            )

        if name in {"local", "docker", "docker-model-runner"}:
            base = self.local_api_base
            model = self.local_model
            if primary == "local":
                if self.api_base and self.api_base != NVIDIA_HOSTED_API_BASE:
                    base = self.api_base
                if self.model_id and self.model_id != DEFAULT_MODEL_ID:
                    model = self.model_id
            elif not self.local_enabled:
                return None
            return self._with_shared_limits(
                provider="local",
                runtime=LOCAL_RUNTIME,
                api_base=base,
                api_key=None,
                model=model,
                label=f"local:{model}",
            )

        if name in {"nim", "nvidia-nim", "self-hosted", "self-hosted-nim"}:
            if not self.self_hosted_enabled:
                return None
            return self._with_shared_limits(
                provider="nvidia-nim",
                runtime="nvidia-nim",
                api_base=self.self_hosted_base_url,
                api_key=self.api_key,
                model=self.model_id,
                label=f"nvidia-nim:{self.model_id}",
                self_hosted=True,
            )

        if name in {"nvidia", "nvidia-hosted", "nvidia-build-api"}:
            if not (self.api_key or "").strip():
                return None
            return self._with_shared_limits(
                provider="nvidia",
                runtime=NVIDIA_HOSTED_RUNTIME,
                api_base=self.api_base or NVIDIA_HOSTED_API_BASE,
                api_key=self.api_key,
                model=self.model_id,
                label=f"nvidia:{self.model_id}",
            )

        return None

    def _with_shared_limits(
        self,
        *,
        provider: str,
        runtime: str,
        api_base: str,
        api_key: str | None,
        model: str,
        label: str,
        self_hosted: bool = False,
    ) -> ProviderConfig:
        """Apply the shared timeout, retry, and concurrency policy to a tier."""
        return ProviderConfig(
            enabled=self.enabled,
            provider=provider,
            runtime=runtime,
            api_base=api_base,
            api_key=api_key,
            model=model,
            label=label,
            enable_thinking=self.enable_thinking,
            reasoning_budget=max(0, self.reasoning_budget),
            request_timeout_seconds=max(0.1, self.request_timeout_seconds),
            max_retries=max(0, self.max_retries),
            retry_base_seconds=max(0.0, self.retry_base_seconds),
            retry_max_seconds=max(0.0, self.retry_max_seconds),
            retry_jitter=max(0.0, self.retry_jitter),
            queue_timeout_seconds=max(0.0, self.generation_queue_timeout_seconds),
            max_concurrency=max(1, self.max_concurrency),
            circuit_failure_threshold=max(1, self.circuit_failure_threshold),
            circuit_recovery_seconds=max(0.0, self.circuit_recovery_seconds),
            self_hosted_enabled=self_hosted or self.self_hosted_enabled,
            self_hosted_base_url=self.self_hosted_base_url,
        )

    def resolved_chain(self) -> tuple[str, ...]:
        """Return the tier order this configuration will actually attempt."""
        if self.fallback_chain:
            return self.fallback_chain
        primary = ProviderConfig(provider=self.provider).normalized_provider
        rest = [tier for tier in self.DEFAULT_FALLBACK_CHAIN if tier != primary]
        return (primary, *rest)

    def _local_tier_configs(self) -> list[ProviderConfig]:
        """Every local model, best first, as its own failover rung.

        The primary local model comes first, then each entry of
        ``local_fallback_models``. They share a runtime and an API base but not a
        circuit breaker: provider.py keys breakers per config, so a model that is
        cold, wedged, or returning empty answers opens only its own and the next
        rung is tried immediately.
        """
        primary = self._tier_config("local")
        if primary is None:
            return []

        configs = [primary]
        for model in self.local_fallback_models:
            name = model.strip()
            if not name or name == primary.model:
                continue
            configs.append(
                self._with_shared_limits(
                    provider="local",
                    runtime=LOCAL_RUNTIME,
                    api_base=primary.api_base,
                    api_key=None,
                    model=name,
                    label=f"local:{name}",
                )
            )
        return configs

    def provider_configs(self) -> list[ProviderConfig]:
        """Build the ordered failover chain.

        Unusable tiers -- a cloud provider with no key, a local runtime that was
        not opted into -- are dropped rather than left in the chain to fail on
        every request. The primary is always kept so a fully unconfigured
        assistant still reports its intended provider instead of vanishing.
        """
        configs: list[ProviderConfig] = []
        seen: set[tuple[str, str]] = set()

        for tier in self.resolved_chain():
            # The local tier expands into a ladder; every other tier is one rung.
            if tier.strip().lower() in {"local", "docker", "docker-model-runner"}:
                tier_configs = self._local_tier_configs()
            else:
                single = self._tier_config(tier)
                tier_configs = [single] if single is not None else []

            for config in tier_configs:
                identity = (config.normalized_provider, config.model)
                if identity in seen:
                    continue
                seen.add(identity)
                configs.append(config)

        return configs or [self.provider_config()]

    def provider_config(self) -> ProviderConfig:
        provider = "nvidia-nim" if self.self_hosted_enabled else self.provider
        runtime = "nvidia-nim" if self.self_hosted_enabled else self.runtime
        return ProviderConfig(
            enabled=self.enabled,
            provider=provider,
            runtime=runtime,
            api_base=self.api_base,
            api_key=self.api_key,
            model=self.model_id,
            label=f"{provider}:{self.model_id}",
            enable_thinking=self.enable_thinking,
            reasoning_budget=max(0, self.reasoning_budget),
            request_timeout_seconds=max(0.1, self.request_timeout_seconds),
            max_retries=max(0, self.max_retries),
            retry_base_seconds=max(0.0, self.retry_base_seconds),
            retry_max_seconds=max(0.0, self.retry_max_seconds),
            retry_jitter=max(0.0, self.retry_jitter),
            queue_timeout_seconds=max(0.0, self.generation_queue_timeout_seconds),
            max_concurrency=max(1, self.max_concurrency),
            circuit_failure_threshold=max(1, self.circuit_failure_threshold),
            circuit_recovery_seconds=max(0.0, self.circuit_recovery_seconds),
            self_hosted_enabled=self.self_hosted_enabled,
            self_hosted_base_url=self.self_hosted_base_url,
        )


class DashboardChatAssistant:
    """Grounded assistant with a lazy, injectable generation provider."""

    def __init__(
        self,
        *,
        config: AssistantConfig | None = None,
        data_dir: Path = DEFAULT_DATA_DIR,
        provider: AssistantProvider | None = None,
        client: Any | None = None,
        client_factory: Callable[..., Any] | None = None,
    ) -> None:
        self.data_dir = data_dir
        self._lock = threading.Lock()
        # ``_generator`` is retained as a deprecated fake-client injection hook.
        # Production generation always flows through ``_provider``.
        self._generator = None
        self._last_error: str | None = None
        self._json_cache: dict[Path, tuple[int, Any]] = {}

        self._maybe_load_dotenv()
        self.config = config or AssistantConfig.from_env()
        self._provider = provider or build_provider_chain(
            self.config.provider_configs(),
            client=client,
            client_factory=client_factory,
        )

    def get_status(self) -> dict[str, Any]:
        provider_status = self._provider.status()
        status = {
            "enabled": self.config.enabled,
            "state": provider_status.get("state", "degraded"),
            "ready": bool(provider_status.get("ready")),
            "can_attempt": bool(
                provider_status.get("can_attempt", provider_status.get("ready"))
            ),
            "message": provider_status.get("message")
            or "Assistant provider status is unavailable.",
            "provider": provider_status.get("provider") or self.config.provider,
            "runtime": provider_status.get("runtime") or self.config.runtime,
            "api_base": provider_status.get("api_base") or self.config.api_base,
            # Report the tier that will actually answer. With a failover chain
            # the active provider is often not the configured primary, and
            # showing the primary's model would name a backend that is not
            # serving this request.
            "model_id": provider_status.get("model_id") or self.config.model_id,
            "model_tier": self.config.model_tier,
            "model_label": provider_status.get("active_tier_label")
            or self.config.model_label,
            "model_license": self.config.model_license,
            "model_dir": (
                str(self.config.model_dir)
                if self.config.model_dir is not None
                else None
            ),
            "model_file": self.config.model_file,
            "model_path": None,
            "auto_download": False,
            "device_preference": self.config.device_preference,
            "dependencies": provider_status.get("dependencies")
            or self._probe_dependencies(),
            "available_memory_gib": None,
            "recommended_memory_gib": None,
            "generator_loaded": bool(
                self._generator is not None
                or getattr(self._provider, "_client", None) is not None
            ),
            "provider_loaded": self._provider is not None,
            "inference_busy": bool(provider_status.get("active_requests", 0)),
            "active_requests": provider_status.get("active_requests", 0),
            "max_concurrency": provider_status.get("max_concurrency"),
            "queue_timeout_seconds": provider_status.get("queue_timeout_seconds"),
            "request_timeout_seconds": provider_status.get("request_timeout_seconds"),
            "max_retries": provider_status.get("max_retries"),
            "circuit_breaker": provider_status.get("circuit_breaker"),
            "self_hosted": provider_status.get("self_hosted", False),
            "failure_state": provider_status.get("failure_state"),
            "last_error": provider_status.get("last_error") or self._last_error,
            "input_limits": {
                "message_chars": max(1, int(self.config.max_message_chars)),
                "history_chars": max(0, int(self.config.max_history_chars)),
                "history_entries": max(0, int(self.config.history_turns)),
            },
            "freshness": self._assistant_freshness_status(),
        }

        # Surface failover state so the dashboard can show which tier answered
        # and how much backup is left. Never includes credentials or endpoints
        # beyond the already-public api_base.
        chain = provider_status.get("fallback_chain")
        if isinstance(chain, list):
            status["fallback"] = {
                "enabled": True,
                "tiers": provider_status.get("fallback_tiers", len(chain)),
                "ready_tiers": provider_status.get("fallback_ready_tiers", 0),
                "active_tier": provider_status.get("active_tier", 0),
                "active_tier_label": provider_status.get("active_tier_label"),
                "chain": chain,
            }
        else:
            status["fallback"] = {
                "enabled": False,
                "tiers": 1,
                "ready_tiers": 1 if status["ready"] else 0,
                "active_tier": 0,
                "active_tier_label": f"{status['provider']}:{status['model_id']}",
                "chain": [],
            }
        return status

    def _prepare_request(
        self,
        message: str,
        history: list[dict[str, str]] | None = None,
    ) -> tuple[dict[str, Any], list[dict[str, str]]]:
        if not isinstance(message, str):
            raise AssistantUnavailable(
                "The assistant message must be text.",
                self.get_status(),
                http_status=400,
            )

        prompt = message.strip()
        if not prompt:
            raise AssistantUnavailable(
                "Please ask a question before submitting.",
                self.get_status(),
                http_status=400,
            )
        max_message_chars = max(1, int(self.config.max_message_chars))
        if len(prompt) > max_message_chars:
            raise AssistantUnavailable(
                f"The assistant message is too long; limit it to {max_message_chars} characters.",
                self.get_status(),
                http_status=413,
            )

        normalized_history = self._normalize_history(history)

        context = self.build_context(prompt)
        messages = self._build_messages(
            question=prompt,
            history=normalized_history,
            context_block=context["context"],
        )
        return context, messages

    def _normalize_history(
        self, history: list[dict[str, str]] | None
    ) -> list[dict[str, str]]:
        """Validate and pack recent chat history into a bounded prompt budget.

        History is browser-supplied context, not trusted grounding. Keeping only
        well-formed user/assistant entries prevents malformed payloads from
        crashing generation and stops old or oversized turns from consuming the
        model context reserved for current dashboard evidence.
        """
        if history is None:
            return []
        if not isinstance(history, list):
            raise AssistantUnavailable(
                "Assistant history must be a list of chat messages.",
                self.get_status(),
                http_status=400,
            )

        validated: list[dict[str, str]] = []
        for item in history:
            if not isinstance(item, dict):
                raise AssistantUnavailable(
                    "Each assistant history item must be a chat message object.",
                    self.get_status(),
                    http_status=400,
                )
            role = item.get("role")
            content = item.get("content")
            if not isinstance(role, str) or role.strip().lower() not in {
                "user",
                "assistant",
            }:
                raise AssistantUnavailable(
                    "Assistant history roles must be user or assistant.",
                    self.get_status(),
                    http_status=400,
                )
            if not isinstance(content, str):
                raise AssistantUnavailable(
                    "Assistant history content must be text.",
                    self.get_status(),
                    http_status=400,
                )
            content = content.strip()
            if content:
                validated.append({"role": role.strip().lower(), "content": content})

        max_entries = max(0, int(self.config.history_turns))
        max_chars = max(0, int(self.config.max_history_chars))
        if not max_entries or not max_chars:
            return []

        packed_reversed: list[dict[str, str]] = []
        chars_used = 0
        for item in reversed(validated[-max_entries:]):
            item_chars = len(item["content"])
            if chars_used + item_chars > max_chars:
                break
            packed_reversed.append(item)
            chars_used += item_chars
        return list(reversed(packed_reversed))

    def answer(
        self, message: str, history: list[dict[str, str]] | None = None
    ) -> dict[str, Any]:
        context, messages = self._prepare_request(message, history)
        quick_reply = self._maybe_short_circuit_response(message, context)
        if quick_reply is not None:
            return {
                "reply": quick_reply,
                "citations": context["citations"],
                "status": self.get_status(),
            }

        try:
            provider = self._ensure_provider()
            reply = provider.complete(
                messages=messages,
                max_tokens=self._response_token_limit(message),
                temperature=self.config.temperature,
                top_p=self.config.top_p,
            )
        except ProviderError as exc:
            self._raise_provider_unavailable(exc)

        if not reply:
            reply = EMPTY_GROUNDED_REPLY

        return {
            "reply": reply,
            "citations": context["citations"],
            "status": self.get_status(),
        }

    def complete_grounded_answer(
        self,
        *,
        message: str,
        system_prompt: str,
        context_block: str,
        max_tokens: int | None = None,
    ) -> str:
        """Generate from caller-supplied, already-sanitized grounding.

        This is the narrow reuse seam for API surfaces such as the NANO Buddy.
        It deliberately does not load the dashboard's broad chat context.  The
        caller owns a strict aggregate/document allowlist, while generation
        still uses this assistant's configured provider, queue, timeout,
        retries, and circuit breaker.  No second model runtime is created.
        """

        if not isinstance(message, str) or not message.strip():
            raise AssistantUnavailable(
                "Please ask a question before submitting.",
                self.get_status(),
                http_status=400,
            )
        if not isinstance(system_prompt, str) or not system_prompt.strip():
            raise ValueError("system_prompt must be non-empty text")
        if not isinstance(context_block, str):
            raise ValueError("context_block must be text")

        messages = [
            {
                "role": "system",
                "content": (
                    system_prompt.strip()
                    + "\n\nAllowed grounding (aggregate and non-PHI only):\n"
                    + context_block.strip()
                ),
            },
            {"role": "user", "content": message.strip()},
        ]
        try:
            provider = self._ensure_provider()
            reply = provider.complete(
                messages=messages,
                max_tokens=max(
                    48,
                    min(
                        int(max_tokens or self._response_token_limit(message)),
                        int(self.config.max_new_tokens),
                    ),
                ),
                temperature=self.config.temperature,
                top_p=self.config.top_p,
            )
        except ProviderError as exc:
            self._raise_provider_unavailable(exc)
        return reply.strip() if reply else EMPTY_GROUNDED_REPLY

    def stream(self, message: str, history: list[dict[str, str]] | None = None):
        context, messages = self._prepare_request(message, history)
        quick_reply = self._maybe_short_circuit_response(message, context)
        if quick_reply is not None:
            yield quick_reply
            return

        try:
            provider = self._ensure_provider()
            if not self.config.stream_enabled:
                content = provider.complete(
                    messages=messages,
                    max_tokens=self._response_token_limit(message),
                    temperature=self.config.temperature,
                    top_p=self.config.top_p,
                )
                if content:
                    yield content
                else:
                    yield EMPTY_GROUNDED_REPLY
                return
            emitted = False
            for content in provider.stream(
                messages=messages,
                max_tokens=self._response_token_limit(message),
                temperature=self.config.temperature,
                top_p=self.config.top_p,
            ):
                if not content:
                    continue
                emitted = True
                yield content
            if not emitted:
                yield EMPTY_GROUNDED_REPLY
        except GeneratorExit:
            # Closing this generator propagates into the provider, which closes the
            # remote stream without recording a model-health failure.
            raise
        except ProviderError as exc:
            self._raise_provider_unavailable(exc)

    def plan_presentation(
        self,
        concept: str,
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Generate a strict, structured slide-deck plan for ``concept``.

        Reuses the same provider, readiness checks, and grounding
        context as the chat assistant, but drives a dedicated
        presentation-planning prompt that must return a single JSON object.

        The model output is parsed and, if the JSON is malformed, retried once
        with a repair instruction. A parseable-but-incomplete object is repaired
        into a valid deck by :func:`normalize_deck_plan`; only an entirely
        unparseable response raises so the caller can surface a clean error
        instead of leaking raw model text.
        """
        topic = (concept or "").strip()
        if not topic:
            raise AssistantUnavailable(
                "Please enter a concept you want explained before generating.",
                self.get_status(),
                http_status=400,
            )

        status = self.get_status()
        if not status.get("can_attempt", status.get("ready")):
            raise AssistantUnavailable(status["message"], status, http_status=503)

        opts = normalize_presentation_options(options or {})
        context = self.build_context(topic)
        grounding = {
            "grounded": bool(context.get("grounded")),
            "citations": list(context.get("citations") or [])[:6],
            "focus_sections": list(context.get("focus_sections") or []),
        }
        context_cap = max(400, int(self.config.presentation_context_char_cap))
        context_block = (context.get("context") or "")[:context_cap]
        max_tokens = max(256, int(self.config.presentation_max_new_tokens))

        generator = self._ensure_provider()
        messages = build_presentation_messages(topic, opts, context_block, grounding)
        raw_text = self._complete_text(
            generator, messages, max_tokens=max_tokens, json_mode=True
        )
        raw_plan = extract_json_object(raw_text)

        if raw_plan is None:
            repair_messages = [
                *messages,
                {"role": "assistant", "content": raw_text[:600]},
                {
                    "role": "user",
                    "content": (
                        "That was not valid JSON. Respond again with ONLY a single valid "
                        "JSON object that matches the requested schema. No prose, no "
                        "explanation, no markdown code fences."
                    ),
                },
            ]
            raw_text = self._complete_text(
                generator, repair_messages, max_tokens=max_tokens, json_mode=True
            )
            raw_plan = extract_json_object(raw_text)

        if raw_plan is None:
            self._last_error = None  # not a model-health failure; just a bad sample
            raise AssistantUnavailable(
                "The assistant could not produce a valid presentation plan. "
                "Please try again, optionally with a simpler concept.",
                self.get_status(),
                http_status=502,
            )

        plan = normalize_deck_plan(
            raw_plan, concept=topic, options=opts, grounding=grounding
        )
        return {"plan": plan, "status": self.get_status()}

    def _complete_text(
        self,
        generator: Any,
        messages: list[dict[str, str]],
        *,
        max_tokens: int,
        json_mode: bool = False,
    ) -> str:
        """Run a non-streaming provider completion and return visible content.

        OpenAI-compatible JSON mode is attempted first.  The narrow legacy
        branch exists only for deterministic fake clients and older compatible
        gateways; it does not load or select a local model runtime.
        """
        use_json = json_mode and self.config.presentation_json_mode
        response_format = {"type": "json_object"} if use_json else None

        complete = getattr(generator, "complete", None)
        if callable(complete):
            try:
                return complete(
                    messages,
                    max_tokens=max_tokens,
                    temperature=self.config.temperature,
                    top_p=self.config.top_p,
                    response_format=response_format,
                )
            except ProviderError as exc:
                self._raise_provider_unavailable(exc)

        create = getattr(generator, "create_chat_completion", None)
        if not callable(create):
            raise AssistantUnavailable(
                "The assistant client does not expose chat completions.",
                self.get_status(),
                http_status=503,
            )
        kwargs: dict[str, Any] = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": self.config.temperature,
            "top_p": self.config.top_p,
        }
        if response_format is not None:
            kwargs["response_format"] = response_format
        try:
            output = create(**kwargs)
        except TypeError:
            kwargs.pop("response_format", None)
            output = create(**kwargs)
        return completion_content(output)

    def build_context(self, question: str) -> dict[str, Any]:
        payload = self._load_dashboard_payload()
        readings = self._load_readings_payload()
        question_tokens = set(_tokenize(question))
        focus_sections = _detect_focus_sections(question_tokens)
        summary_fragments = self._build_summary_fragments(payload, readings)
        summary_paths = {path for path, _ in summary_fragments}
        reading_fragments, reading_fragment_index = _build_reading_catalog_fragments(
            readings
        )

        if focus_sections == {"readings"}:
            reading_ranked = sorted(
                reading_fragments,
                key=lambda item: _score_reading_match(
                    question_tokens, reading_fragment_index.get(item[0], {})
                ),
                reverse=True,
            )
            reading_matches = [
                reading_fragment_index[path]
                for path, _ in reading_ranked
                if _score_reading_match(
                    question_tokens, reading_fragment_index.get(path, {})
                )
                > 0
            ][:3]

            context_parts = [
                f"- {text}"
                for path, text in summary_fragments
                if path
                in {
                    "meta.study.name",
                    "meta.data_source",
                    "readings.summary.total_readings",
                }
            ]
            citations = [
                path
                for path, _ in summary_fragments
                if path
                in {
                    "meta.study.name",
                    "meta.data_source",
                    "readings.summary.total_readings",
                }
            ]
            for item in reading_matches:
                context_parts.append(f"- {_reading_match_context_text(item)}")
                citations.append(f"readings.catalog[{item['id']}]")

            top_score = 0.0
            if reading_ranked:
                top_score = _score_reading_match(
                    question_tokens,
                    reading_fragment_index.get(reading_ranked[0][0], {}),
                )

            return {
                "context": "\n".join(part for part in context_parts if part),
                "citations": citations[:6],
                "grounded": bool(reading_matches),
                "focus_sections": ["readings"],
                "reading_matches": reading_matches,
                "reading_metadata_only": bool(reading_matches),
                "top_score": top_score,
                "facts": self._build_fact_map(payload, readings),
            }

        fragments = []
        for key in SUMMARY_KEYS:
            if key == "meta":
                continue
            value = payload.get(key)
            if value:
                if key == "redcap_visit_health":
                    fragments.extend(self._build_redcap_visit_health_fragments(payload))
                elif key == "redcap_clinical":
                    fragments.extend(self._build_redcap_next_wave_fragments(payload))
                elif key == "lab_operations":
                    fragments.extend(self._build_lab_operations_fragments(payload))
                elif key in {
                    "redcap_integrity",
                    "redcap_schedule",
                    "redcap_respondent",
                    "redcap_platform",
                    "redcap_predictive",
                    "clinical_cutoffs",
                }:
                    continue
                else:
                    fragments.extend(_flatten_context(value, prefix=key))

        if readings:
            fragments.extend(
                _flatten_context(readings.get("summary", {}), prefix="readings.summary")
            )
            fragments.extend(reading_fragments)

        ranked = sorted(
            (
                item
                for item in fragments
                if _should_include_fragment(item[0], focus_sections)
            ),
            key=lambda item: _score_fragment(
                question_tokens, item[0], item[1], focus_sections
            ),
            reverse=True,
        )

        top_score = 0.0
        if ranked:
            top_score = _score_fragment(
                question_tokens, ranked[0][0], ranked[0][1], focus_sections
            )

        core_summary_paths = {"meta.study.name", "meta.data_source"}
        context_parts: list[str] = []
        citations: list[str] = []
        used_paths: set[str] = set()

        ranked_summary = sorted(
            summary_fragments,
            key=lambda item: _score_fragment(
                question_tokens, item[0], item[1], focus_sections
            ),
            reverse=True,
        )
        summary_limit = len(core_summary_paths) + (2 if focus_sections else 3)

        for path, text in summary_fragments:
            if path not in core_summary_paths:
                continue
            context_parts.append(f"- {text}")
            citations.append(path)
            used_paths.add(path)

        for path, text in ranked_summary:
            if path in used_paths:
                continue
            if focus_sections and _top_section(path) not in focus_sections:
                continue
            score = _score_fragment(question_tokens, path, text, focus_sections)
            if score <= 0 and citations:
                continue
            context_parts.append(f"- {text}")
            citations.append(path)
            used_paths.add(path)
            if len(context_parts) >= summary_limit:
                break

        remaining = max(
            self._effective_context_char_budget() - len("\n".join(context_parts)), 0
        )
        reading_matches: list[dict[str, Any]] = []
        evidence_limit = (
            FOCUSED_CONTEXT_EVIDENCE_LIMIT
            if focus_sections
            else DEFAULT_CONTEXT_EVIDENCE_LIMIT
        )
        evidence_count = 0

        for path, text in ranked:
            if not text or path in used_paths or path in summary_paths:
                continue
            score = _score_fragment(question_tokens, path, text, focus_sections)
            if score < MIN_RELEVANT_FRAGMENT_SCORE:
                break
            if path in reading_fragment_index and len(reading_matches) < 3:
                reading_matches.append(reading_fragment_index[path])
            line = f"- {text}"
            if len(line) > remaining:
                continue
            context_parts.append(line)
            used_paths.add(path)
            evidence_count += 1
            if len(citations) < 6 and path not in citations:
                citations.append(path)
            remaining -= len(line) + 1
            if evidence_count >= evidence_limit or remaining <= 0:
                break

        grounded_threshold = (
            FOCUSED_CONFIDENCE_SCORE_THRESHOLD
            if focus_sections
            else LOW_CONFIDENCE_SCORE_THRESHOLD
        )
        grounded = bool(ranked) and top_score >= grounded_threshold
        if reading_matches and focus_sections == {"readings"}:
            grounded = True

        if (
            {"nano", "study"} <= question_tokens
            and question_tokens & {"explain", "describe", "what"}
            and question_tokens & NANO_EXPLAINER_TOKENS
        ):
            organization_site = payload.get("organization_site") or {}
            public_studies = (
                organization_site.get("studies")
                if isinstance(organization_site, dict)
                else []
            )
            for index, study in enumerate(public_studies or []):
                if (
                    not isinstance(study, dict)
                    or "nano"
                    not in str(study.get("title") or study.get("slug") or "").lower()
                ):
                    continue
                source_path = f"organization_site.studies[{index}]"
                citations = [source_path, *[c for c in citations if c != source_path]]
                break

        return {
            "context": "\n".join(part for part in context_parts if part),
            "citations": citations[:6],
            "grounded": grounded,
            "focus_sections": sorted(focus_sections),
            "reading_matches": reading_matches,
            "reading_metadata_only": bool(reading_matches)
            and focus_sections == {"readings"},
            "top_score": top_score,
            "facts": self._build_fact_map(payload, readings),
        }

    def _ensure_provider(self) -> AssistantProvider:
        """Return the configured provider without contacting it."""
        # Historical tests and downstream scripts sometimes assign a fake client
        # to ``_generator``.  Preserve that injection seam by placing the fake
        # behind the provider adapter instead of calling it directly.
        if (
            self._generator is not None
            and getattr(self._provider, "_client", None) is None
        ):
            with self._lock:
                if getattr(self._provider, "_client", None) is None:
                    self._provider = build_provider(
                        self.config.provider_config(), client=self._generator
                    )

        status = self._provider.status()
        if not status.get("can_attempt", status.get("ready")):
            raise AssistantUnavailable(
                str(status.get("message") or "Assistant provider is unavailable."),
                self.get_status(),
                http_status=503,
            )
        return self._provider

    def _ensure_generator(self) -> AssistantProvider:
        """Deprecated name retained for import/runtime compatibility."""
        return self._ensure_provider()

    def _raise_provider_unavailable(self, exc: ProviderError) -> None:
        self._last_error = str(exc)
        raise AssistantUnavailable(
            str(exc), self.get_status(), http_status=exc.http_status
        ) from exc

    def probe_provider(self) -> dict[str, Any]:
        """Perform a sanitized, non-generation provider reachability probe."""
        try:
            provider = self._ensure_provider()
            result = provider.probe()
        except AssistantUnavailable as exc:
            return {
                "ok": False,
                "state": exc.status.get("state", "degraded"),
                "message": str(exc),
                "http_status": exc.http_status,
                "status": exc.status,
            }
        except ProviderError as exc:
            self._last_error = str(exc)
            return {
                "ok": False,
                "state": exc.state,
                "message": str(exc),
                "http_status": exc.http_status,
                "status": self.get_status(),
            }
        return {**result, "status": self.get_status()}

    def _build_messages(
        self,
        *,
        question: str,
        history: list[dict[str, str]],
        context_block: str,
    ) -> list[dict[str, str]]:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are the NANO Study dashboard assistant embedded in the ESD Lab live dashboard. "
                    "Return only the final user-facing answer. Never output analysis, planning, task instructions, prompt text, or hidden reasoning. "
                    "Start directly with the answer, do not restate the question, and match the audience or reading level the user requests. "
                    "Answer only from the provided dashboard context and do not invent facts. "
                    "Be concise by default: answer in 2-4 short bullets or sentences unless the user explicitly asks for more detail. "
                    "Use readable Markdown spacing: when an answer has multiple parts, put each part on its own bullet line. Do not add a heading to a short answer. "
                    "Repeat exact counts, group labels, model names, and AUROC values verbatim when they appear in context. "
                    "Do not add qualitative judgments, speculation, or interpretations that are not explicitly stated. "
                    "If the context shows only study operations and not the study's scientific purpose, explain only those operations and say the full purpose is not stated. "
                    "If a list is requested, include every listed item from context and nothing else. "
                    "For library or reading questions, the dashboard context may contain only indexed metadata and short excerpts, not full document text. "
                    "In that case, limit your answer to the title, file name, source, authors, page count, excerpt, or keywords that appear in context and explicitly say full-text details are not indexed here. "
                    "If the answer is not grounded in the supplied context, say that you cannot verify it from the dashboard data provided. "
                    "Do not include protected health information or speculate about participants.\n\n"
                    "You also know about the REDCap Visit Health Monitor, which tracks CSBS caregiver questionnaire completion across 6m, 9m, 12m, and 24m timepoints and detects R1-R5 carry-forward anomalies from visit_date and CSBS completion states. "
                    "The REDCap next-wave layer adds clinical instrument intelligence, data-integrity sentinels, visit-window forecasting, respondent burden, platform API monitoring, attrition early-warning, and public privacy controls through the redcap_clinical, redcap_integrity, redcap_schedule, redcap_respondent, redcap_platform, redcap_predictive, and clinical_cutoffs keys. "
                    "Tier-3 REDCap writeback is disabled by default and, when enabled, must use the audited server-side allowlist with an operator token and explicit confirmation; the browser never holds a REDCap token.\n\n"
                    "The lab_operations key is the source of truth for the Nano-first operational rollout. It covers current priority, dashboard surface status, reporting/data-management priorities, systems audit tracks, budget-reporting guardrails, external collaboration and public-website integration status, four workflow phases, coordinator/graduate/undergraduate/supervisor handoffs, draft metrics, daily check-ins, business-hour/visit-window guardrails, and the current family-facing data-sharing boundary.\n\n"
                    f"Dashboard context:\n{context_block}"
                ),
            }
        ]

        messages.extend(history)

        messages.append({"role": "user", "content": question})
        return messages

    def _resolve_model_path(self) -> Path | None:
        """Compatibility helper: hosted/NIM providers do not use a model file."""
        return None

    def _load_dashboard_payload(self) -> dict[str, Any]:
        path = self.data_dir / "dashboard_data.json"
        return self._load_json_file_cached(path)

    def _load_readings_payload(self) -> dict[str, Any]:
        path = self.data_dir / "readings_data.json"
        return self._load_json_file_cached(path)

    def _load_json_file_cached(self, path: Path) -> dict[str, Any]:
        if not path.exists():
            return {}
        signature = path.stat().st_mtime_ns
        cached = self._json_cache.get(path)
        if cached and cached[0] == signature:
            return cached[1]
        payload = json.loads(path.read_text(encoding="utf-8"))
        self._json_cache[path] = (signature, payload)
        return payload

    def _build_summary_block(
        self,
        payload: dict[str, Any],
        readings: dict[str, Any],
    ) -> str:
        return "\n".join(
            f"- {text}" for _, text in self._build_summary_fragments(payload, readings)
        )

    def _build_redcap_visit_health_fragments(
        self,
        payload: dict[str, Any],
    ) -> list[tuple[str, str]]:
        meta = payload.get("redcap_meta") or {}
        completion = payload.get("redcap_completion_stats") or {}
        visit_health = payload.get("redcap_visit_health") or {}
        trackers = payload.get("redcap_trackers") or {}
        ops = payload.get("redcap_ops") or {}
        records = visit_health.get("data") if isinstance(visit_health, dict) else []
        anomaly_codes = {
            "R1": "6m CSBS incomplete and 9m visit_date set",
            "R2": "9m CSBS incomplete and 12m visit_date set",
            "R3": "6m CSBS blank but 9m CSBS complete",
            "R4": "9m CSBS blank but 12m CSBS complete",
            "R5": "12m CSBS incomplete and 24m visit_date set",
        }
        fragments: list[tuple[str, str]] = []

        if meta:
            fragments.append(
                (
                    "redcap_meta",
                    "REDCap freshness: "
                    f"generated_at={meta.get('generated_at') or 'unknown'}, "
                    f"records={meta.get('record_count', 0)}, "
                    f"anomalies={meta.get('anomaly_count', 0)}, "
                    f"source={meta.get('source') or 'unknown'}",
                )
            )

        for event_name, stats in completion.items():
            if not isinstance(stats, dict):
                continue
            fragments.append(
                (
                    f"redcap_completion_stats.{event_name}",
                    "REDCap CSBS completeness "
                    f"{stats.get('label') or event_name}: "
                    f"{stats.get('complete', 0)} complete, "
                    f"{stats.get('unverified', 0)} unverified, "
                    f"{stats.get('incomplete', 0)} incomplete, "
                    f"{stats.get('not_started', 0)} not started, "
                    f"{stats.get('skipped', 0)} skipped of {stats.get('total', 0)}.",
                )
            )

        tracker_rows = (
            (trackers.get("enrollment") or [])[:12]
            if isinstance(trackers, dict)
            else []
        )
        for row in tracker_rows:
            if not isinstance(row, dict):
                continue
            expected = int(row.get("expected") or 0)
            completed = int(row.get("completed") or 0)
            pct = (completed / expected) * 100 if expected else 0
            fragments.append(
                (
                    f"redcap_trackers.enrollment.{row.get('event')}",
                    "REDCap enrollment tracker "
                    f"{row.get('label') or row.get('event')}: "
                    f"{completed}/{expected} completed ({pct:.1f}%), "
                    f"scheduled={row.get('scheduled', 0)}.",
                )
            )

        queue = trackers.get("queue_funnel") if isinstance(trackers, dict) else []
        if isinstance(queue, list) and queue:
            fragments.append(
                (
                    "redcap_trackers.queue_funnel",
                    "REDCap queue funnel: "
                    + ", ".join(
                        f"{item.get('stage')}={item.get('count')}"
                        for item in queue
                        if isinstance(item, dict)
                    ),
                )
            )

        if isinstance(ops, dict):
            freshness = (
                ops.get("freshness") if isinstance(ops.get("freshness"), dict) else {}
            )
            parity = (
                ops.get("runtime_parity")
                if isinstance(ops.get("runtime_parity"), dict)
                else {}
            )
            if freshness:
                fragments.append(
                    (
                        "redcap_ops.freshness",
                        "REDCap ops freshness: "
                        f"generated_at={freshness.get('generated_at') or 'unknown'}, "
                        f"age_hours={freshness.get('age_hours', 0)}, "
                        f"source={freshness.get('source') or 'unknown'}.",
                    )
                )
            if parity:
                unique_hashes = sorted(
                    {str(value) for value in parity.values() if value}
                )
                fragments.append(
                    (
                        "redcap_ops.runtime_parity",
                        "REDCap runtime parity hashes: "
                        + ", ".join(f"{key}={value}" for key, value in parity.items())
                        + f"; in_sync={len(unique_hashes) <= 1}.",
                    )
                )

        if not isinstance(records, list):
            return fragments

        flagged = [
            row
            for row in records
            if isinstance(row, dict) and row.get("hasCarryForwardRisk")
        ][:25]
        for index, row in enumerate(flagged):
            flags = [str(flag) for flag in row.get("anomalyFlags") or []]
            flag_text = ", ".join(
                f"{flag} ({anomaly_codes.get(flag, 'unknown')})" for flag in flags
            )
            fragments.append(
                (
                    f"redcap_visit_health.data[{row.get('recordId') or index}]",
                    "REDCap carry-forward record "
                    f"{row.get('recordId')}: flags {flag_text or 'none'}; "
                    f"6m={_redcap_timepoint_text(row.get('sixMonth'))}; "
                    f"9m={_redcap_timepoint_text(row.get('nineMonth'))}; "
                    f"12m={_redcap_timepoint_text(row.get('twelveMonth'))}; "
                    f"24m={_redcap_timepoint_text(row.get('twentyFourMonth'))}.",
                )
            )

        if len(records) > len(flagged):
            fragments.append(
                (
                    "redcap_visit_health.rollup",
                    f"REDCap visit-health records indexed: {len(records)}; flagged records included in context: {len(flagged)}.",
                )
            )
        return fragments

    def _build_redcap_next_wave_fragments(
        self,
        payload: dict[str, Any],
    ) -> list[tuple[str, str]]:
        clinical = payload.get("redcap_clinical") or {}
        integrity = payload.get("redcap_integrity") or {}
        schedule = payload.get("redcap_schedule") or {}
        respondent = payload.get("redcap_respondent") or {}
        platform = payload.get("redcap_platform") or {}
        predictive = payload.get("redcap_predictive") or {}
        cutoffs = payload.get("clinical_cutoffs") or (
            (payload.get("redcap_ops") or {})
            .get("controls_snapshot", {})
            .get("clinical_cutoffs", {})
            if isinstance(payload.get("redcap_ops"), dict)
            else {}
        )

        def num(value: Any, default: float = 0.0) -> float:
            try:
                parsed = float(value)
            except (TypeError, ValueError):
                return default
            return parsed if parsed == parsed else default

        fragments: list[tuple[str, str]] = []
        epds = clinical.get("epds_trajectory") if isinstance(clinical, dict) else []
        if isinstance(epds, list) and epds:
            positive = sum(
                num(row.get("screen_positive")) for row in epds if isinstance(row, dict)
            )
            high = sum(
                num(row.get("high_concern")) for row in epds if isinstance(row, dict)
            )
            self_harm = sum(
                num(row.get("self_harm_flags")) for row in epds if isinstance(row, dict)
            )
            fragments.append(
                (
                    "redcap_clinical.epds_trajectory",
                    "REDCap EPDS trajectory: "
                    f"{int(positive)} screen-positive (cutoff >= {cutoffs.get('epds_positive', 10)}), "
                    f"{int(high)} high-concern (cutoff >= {cutoffs.get('epds_high', 13)}), "
                    f"{int(self_harm)} self-harm item flags across {len(epds)} event summaries.",
                )
            )

        dev = clinical.get("developmental_grid") if isinstance(clinical, dict) else []
        if isinstance(dev, list) and dev:
            zone_counts: dict[str, int] = {}
            for row in dev:
                if not isinstance(row, dict):
                    continue
                zone = str(row.get("zone") or "context")
                zone_counts[zone] = zone_counts.get(zone, 0) + 1
            fragments.append(
                (
                    "redcap_clinical.developmental_grid",
                    "REDCap developmental grid domains: "
                    + ", ".join(
                        f"{key}={value}" for key, value in sorted(zone_counts.items())
                    )
                    + f" across {len(dev)} aggregate domain rows.",
                )
            )

        family_risk = clinical.get("family_risk") if isinstance(clinical, dict) else []
        if isinstance(family_risk, list) and family_risk:
            verify_needed = sum(
                1
                for row in family_risk
                if isinstance(row, dict) and not row.get("field_verified")
            )
            fragments.append(
                (
                    "redcap_clinical.family_risk",
                    f"REDCap family-risk constellation axes indexed: {len(family_risk)}; {verify_needed} axes still need metadata verification.",
                )
            )

        upcoming = schedule.get("upcoming_visits") if isinstance(schedule, dict) else []
        if isinstance(upcoming, list):
            overdue = sum(
                1
                for row in upcoming
                if isinstance(row, dict) and num(row.get("due_in_days")) < 0
            )
            fragments.append(
                (
                    "redcap_schedule.upcoming_visits",
                    f"REDCap next-30-days visit forecast: {len(upcoming)} hashed records due or approaching, {overdue} overdue.",
                )
            )

        adherence = (
            schedule.get("window_adherence") if isinstance(schedule, dict) else []
        )
        if isinstance(adherence, list) and adherence:
            latest = adherence[-1] if isinstance(adherence[-1], dict) else {}
            fragments.append(
                (
                    "redcap_schedule.window_adherence",
                    "REDCap visit-window adherence: "
                    f"{len(adherence)} event summaries; latest {latest.get('label') or latest.get('event') or 'event'} "
                    f"mean delta {latest.get('mean_delta_days', 0)} days.",
                )
            )

        nullity = integrity.get("nullity_matrix") if isinstance(integrity, dict) else []
        diffs = (
            integrity.get("double_entry_diffs") if isinstance(integrity, dict) else []
        )
        if isinstance(nullity, list) or isinstance(diffs, list):
            mean_nullity = (
                sum(
                    num(row.get("missing_fraction"))
                    for row in nullity
                    if isinstance(row, dict)
                )
                / max(1, len(nullity))
                if isinstance(nullity, list)
                else 0
            )
            fragments.append(
                (
                    "redcap_integrity",
                    f"REDCap integrity sentinels: mean nullity {mean_nullity:.3f} across {len(nullity) if isinstance(nullity, list) else 0} matrix cells; "
                    f"{len(diffs) if isinstance(diffs, list) else 0} double-entry diffs.",
                )
            )

        burden = (
            respondent.get("caregiver_burden") if isinstance(respondent, dict) else []
        )
        if isinstance(burden, list) and burden:
            burden_text = "; ".join(
                f"{row.get('label') or row.get('respondent')}: {row.get('completed', 0)}/{row.get('assigned', 0)} completed"
                for row in burden
                if isinstance(row, dict)
            )
            fragments.append(
                (
                    "redcap_respondent.caregiver_burden",
                    f"REDCap caregiver burden: {burden_text}.",
                )
            )

        audit_log = platform.get("audit_log") if isinstance(platform, dict) else []
        reports = platform.get("reports") if isinstance(platform, dict) else []
        files = platform.get("file_repository") if isinstance(platform, dict) else []
        users = platform.get("users") if isinstance(platform, dict) else []
        if any(isinstance(item, list) for item in [audit_log, reports, files, users]):
            fragments.append(
                (
                    "redcap_platform",
                    f"REDCap platform API surfaces: audit_log={len(audit_log) if isinstance(audit_log, list) else 0}, "
                    f"reports={len(reports) if isinstance(reports, list) else 0}, "
                    f"file_repository={len(files) if isinstance(files, list) else 0}, "
                    f"users={len(users) if isinstance(users, list) else 0}. Browser token exposure remains disabled.",
                )
            )

        risk = predictive.get("attrition_risk") if isinstance(predictive, dict) else []
        if isinstance(risk, list):
            high = [
                row
                for row in risk
                if isinstance(row, dict) and str(row.get("risk_band")) == "high"
            ]
            top = risk[0] if risk and isinstance(risk[0], dict) else {}
            fragments.append(
                (
                    "redcap_predictive.attrition_risk",
                    f"REDCap attrition early-warning: {len(risk)} hashed risk scores, {len(high)} high risk; "
                    f"top record {top.get('recordId') or 'n/a'} score {top.get('risk_score', 'n/a')}.",
                )
            )

        memo = predictive.get("weekly_memo") if isinstance(predictive, dict) else {}
        if isinstance(memo, dict) and memo:
            highlights = (
                memo.get("highlights")
                if isinstance(memo.get("highlights"), list)
                else []
            )
            fragments.append(
                (
                    "redcap_predictive.weekly_memo",
                    f"REDCap weekly study memo status: {memo.get('status') or 'unknown'}; "
                    + "; ".join(str(item) for item in highlights[:3]),
                )
            )

        if cutoffs:
            fragments.append(
                (
                    "clinical_cutoffs",
                    "Clinical controls snapshot: "
                    f"epds_positive={cutoffs.get('epds_positive', 10)}, "
                    f"epds_high={cutoffs.get('epds_high', 13)}, "
                    f"visit_window_days={cutoffs.get('visit_window_days', 30)}, "
                    f"dp_epsilon={cutoffs.get('dp_epsilon', 1)}.",
                )
            )
        return fragments

    def _build_lab_operations_fragments(
        self,
        payload: dict[str, Any],
    ) -> list[tuple[str, str]]:
        operations = payload.get("lab_operations") or {}
        if not isinstance(operations, dict):
            return []

        priority = (
            operations.get("priority")
            if isinstance(operations.get("priority"), dict)
            else {}
        )
        surfaces = (
            operations.get("dashboard_surface_status")
            if isinstance(operations.get("dashboard_surface_status"), list)
            else []
        )
        phases = (
            operations.get("workflow_phases")
            if isinstance(operations.get("workflow_phases"), list)
            else []
        )
        roles = (
            operations.get("role_workflows")
            if isinstance(operations.get("role_workflows"), list)
            else []
        )
        metrics = (
            operations.get("draft_metrics")
            if isinstance(operations.get("draft_metrics"), list)
            else []
        )
        routine = (
            operations.get("daily_routine")
            if isinstance(operations.get("daily_routine"), list)
            else []
        )
        controls = (
            operations.get("rollout_controls")
            if isinstance(operations.get("rollout_controls"), list)
            else []
        )
        family = (
            operations.get("family_data_sharing")
            if isinstance(operations.get("family_data_sharing"), dict)
            else {}
        )
        quick_wins = (
            operations.get("quick_wins")
            if isinstance(operations.get("quick_wins"), list)
            else []
        )
        reporting = (
            operations.get("reporting_management")
            if isinstance(operations.get("reporting_management"), dict)
            else {}
        )
        reporting_reviews = (
            operations.get("reporting_reviews")
            if isinstance(operations.get("reporting_reviews"), list)
            else []
        )
        priority_datasets = (
            operations.get("priority_datasets")
            if isinstance(operations.get("priority_datasets"), list)
            else []
        )
        systems_audit = (
            operations.get("systems_audit")
            if isinstance(operations.get("systems_audit"), list)
            else []
        )
        budget = (
            operations.get("budget_reporting")
            if isinstance(operations.get("budget_reporting"), dict)
            else {}
        )
        collaborations = (
            operations.get("external_collaborations")
            if isinstance(operations.get("external_collaborations"), list)
            else []
        )
        next_month = (
            operations.get("next_month_reporting")
            if isinstance(operations.get("next_month_reporting"), list)
            else []
        )

        fragments: list[tuple[str, str]] = []
        if priority:
            fragments.append(
                (
                    "lab_operations.priority",
                    "Lab operations priority: "
                    f"primary objective={priority.get('primary_objective')}; "
                    f"secondary objective={priority.get('secondary_objective')}; "
                    f"current priority={priority.get('current_priority')}; "
                    f"decision dependency={priority.get('decision_dependency')}.",
                )
            )

        if reporting:
            source_alignment = reporting.get("source_alignment")
            source_text = ""
            if isinstance(source_alignment, list):
                source_text = " Sources: " + "; ".join(
                    f"{row.get('study')}: {row.get('anchor')} - {row.get('operational_relevance')}"
                    for row in source_alignment
                    if isinstance(row, dict)
                )
            fragments.append(
                (
                    "lab_operations.reporting_management",
                    "Reporting management: "
                    f"status={reporting.get('status')}; "
                    f"goal={reporting.get('goal')}; "
                    f"priority_note={reporting.get('priority_note')}; "
                    f"alignment_rule={reporting.get('alignment_rule')}."
                    f"{source_text}",
                )
            )

        if reporting_reviews:
            fragments.append(
                (
                    "lab_operations.reporting_reviews",
                    "Reporting review queue: "
                    + " | ".join(
                        f"{row.get('area')} ({row.get('status')}): source={row.get('source_system')}; "
                        f"why={row.get('why_actionable')}; breakdowns={', '.join(str(item) for item in (row.get('breakdowns') or [])[:6])}; next={row.get('next_action')}"
                        for row in reporting_reviews
                        if isinstance(row, dict)
                    ),
                )
            )

        if priority_datasets:
            fragments.append(
                (
                    "lab_operations.priority_datasets",
                    "Priority data sets: "
                    + " | ".join(
                        f"{row.get('name')} ({row.get('study')}, {row.get('readiness')}): "
                        f"owner={row.get('owner')}; source={row.get('source_system')}; "
                        f"pull_speed={row.get('pull_speed')}; use={row.get('report_use')}"
                        for row in priority_datasets
                        if isinstance(row, dict)
                    ),
                )
            )

        if systems_audit:
            fragments.append(
                (
                    "lab_operations.systems_audit",
                    "Systems and workflow audit: "
                    + " | ".join(
                        f"{row.get('track')} ({row.get('status')}): "
                        f"captures={', '.join(str(item) for item in (row.get('captures') or [])[:5])}; "
                        f"output={row.get('output')}"
                        for row in systems_audit
                        if isinstance(row, dict)
                    ),
                )
            )

        if budget:
            fragments.append(
                (
                    "lab_operations.budget_reporting",
                    "Budget reporting: "
                    f"goal={budget.get('goal')}; current_gap={budget.get('current_gap')}; "
                    f"ready_now={'; '.join(str(item) for item in (budget.get('ready_now') or []))}; "
                    f"needs_alignment={'; '.join(str(item) for item in (budget.get('needs_alignment') or []))}; "
                    f"guardrail={budget.get('guardrail')}.",
                )
            )

        if collaborations:
            fragments.append(
                (
                    "lab_operations.external_collaborations",
                    "External collaboration and website integration: "
                    + " | ".join(
                        f"{row.get('partner')} ({row.get('status')}): value={row.get('current_value')}; "
                        f"gap={row.get('operational_gap')}; next={row.get('next_action')}"
                        for row in collaborations
                        if isinstance(row, dict)
                    ),
                )
            )

        if next_month:
            fragments.append(
                (
                    "lab_operations.next_month_reporting",
                    "Next-month reporting candidates: "
                    + " | ".join(
                        f"{row.get('metric')} ({row.get('status')}): owner={row.get('owner')}; "
                        f"source={row.get('source')}; decision_use={row.get('decision_use')}"
                        for row in next_month
                        if isinstance(row, dict)
                    ),
                )
            )

        for index, surface in enumerate(surfaces[:8]):
            if not isinstance(surface, dict):
                continue
            fragments.append(
                (
                    f"lab_operations.dashboard_surface_status[{index}]",
                    "Dashboard surface status "
                    f"{surface.get('area')}: status={surface.get('status')}; "
                    f"shown={surface.get('shown')}; next_need={surface.get('next_need')}.",
                )
            )

        for index, phase in enumerate(phases):
            if not isinstance(phase, dict):
                continue
            fragments.append(
                (
                    f"lab_operations.workflow_phases[{index}]",
                    "Lab workflow phase "
                    f"{phase.get('phase')} ({phase.get('timeframe')}): "
                    f"status={phase.get('status')}; focus={phase.get('study_focus')}; "
                    f"tasks={'; '.join(str(item) for item in (phase.get('tasks') or [])[:5])}; "
                    f"outputs={'; '.join(str(item) for item in (phase.get('outputs') or [])[:3])}.",
                )
            )

        if roles:
            fragments.append(
                (
                    "lab_operations.role_workflows",
                    "Lab role handoffs: "
                    + " | ".join(
                        f"{row.get('role')}: {row.get('focus')} Handoff: {row.get('handoff')}"
                        for row in roles
                        if isinstance(row, dict)
                    ),
                )
            )

        if metrics:
            fragments.append(
                (
                    "lab_operations.draft_metrics",
                    "Draft lab metrics: "
                    + "; ".join(
                        f"{row.get('name')} ({row.get('kind')}, {row.get('status')}): {row.get('definition')}"
                        for row in metrics
                        if isinstance(row, dict)
                    ),
                )
            )

        if routine:
            fragments.append(
                (
                    "lab_operations.daily_routine",
                    "Daily lab routine: "
                    + "; ".join(
                        f"{row.get('block')}: {row.get('purpose')}"
                        for row in routine
                        if isinstance(row, dict)
                    ),
                )
            )

        if controls:
            fragments.append(
                (
                    "lab_operations.rollout_controls",
                    "Lab rollout controls: "
                    + "; ".join(str(item) for item in controls),
                )
            )

        if quick_wins:
            fragments.append(
                (
                    "lab_operations.quick_wins",
                    "Lab quick wins: " + "; ".join(str(item) for item in quick_wins),
                )
            )

        if family:
            fragments.append(
                (
                    "lab_operations.family_data_sharing",
                    "Family-facing data sharing: "
                    f"current_state={family.get('current_state')}; "
                    f"near_term_policy={family.get('near_term_policy')}; "
                    f"future_option={family.get('future_option')}.",
                )
            )

        return fragments

    def _build_summary_fragments(
        self,
        payload: dict[str, Any],
        readings: dict[str, Any],
    ) -> list[tuple[str, str]]:
        meta = payload.get("meta", {})
        study = meta.get("study", {})
        enrollment = payload.get("enrollment", {})
        overall = enrollment.get("overall", {})
        by_group = enrollment.get("by_group", {})
        data_quality = payload.get("data_quality", {})
        redcap_audit_summary = payload.get("redcap_audit", {}).get("summary", {})
        redcap_meta = payload.get("redcap_meta") or {}
        redcap_visit_health = payload.get("redcap_visit_health") or {}
        redcap_ops = payload.get("redcap_ops") or {}
        redcap_clinical = payload.get("redcap_clinical") or {}
        redcap_schedule = payload.get("redcap_schedule") or {}
        redcap_predictive = payload.get("redcap_predictive") or {}
        participant_operations = payload.get("participant_operations") or {}
        lab_operations = payload.get("lab_operations") or {}
        participant_operations_summary = (
            participant_operations.get("summary")
            if isinstance(participant_operations, dict)
            else {}
        ) or {}
        lab_priority = (
            lab_operations.get("priority")
            if isinstance(lab_operations, dict)
            and isinstance(lab_operations.get("priority"), dict)
            else {}
        )
        lab_phases = (
            lab_operations.get("workflow_phases")
            if isinstance(lab_operations, dict)
            and isinstance(lab_operations.get("workflow_phases"), list)
            else []
        )
        lab_reporting = (
            lab_operations.get("reporting_management")
            if isinstance(lab_operations, dict)
            and isinstance(lab_operations.get("reporting_management"), dict)
            else {}
        )
        readings_summary = readings.get("summary", {})
        fragments: list[tuple[str, str]] = []

        fragments.append(
            ("meta.study.name", f"Study: {study.get('name', 'NANO Study')}")
        )
        fragments.append(
            ("meta.data_source", f"Data source: {meta.get('data_source', 'unknown')}")
        )

        enrollment_current = overall.get("current")
        enrollment_target = overall.get("target") or study.get("n_target")
        enrollment_path = "enrollment.overall"

        if enrollment_current is None and by_group:
            current_values = [stats.get("current") for stats in by_group.values()]
            if all(isinstance(value, (int, float)) for value in current_values):
                enrollment_current = int(sum(current_values))
                enrollment_path = "enrollment.by_group"

        if enrollment_target is None and by_group:
            target_values = [stats.get("target") for stats in by_group.values()]
            if all(isinstance(value, (int, float)) for value in target_values):
                enrollment_target = int(sum(target_values))
                enrollment_path = "enrollment.by_group"

        fragments.append(
            (
                enrollment_path,
                "Enrollment total: "
                f"{enrollment_current if enrollment_current is not None else 'unknown'} "
                f"of {enrollment_target if enrollment_target is not None else 'unknown'}",
            )
        )

        open_queries = data_quality.get("open_queries")
        open_query_path = "data_quality.open_queries"
        if open_queries is None:
            open_queries = redcap_audit_summary.get("open_queries")
            open_query_path = "redcap_audit.summary.open_queries"
        fragments.append(
            (
                open_query_path,
                f"Open REDCap queries: {open_queries if open_queries is not None else 'unknown'}",
            )
        )

        if redcap_meta:
            fragments.append(
                (
                    "redcap_meta.generated_at",
                    "REDCap synced: "
                    f"{redcap_meta.get('generated_at') or 'unknown'}; "
                    f"records: {redcap_meta.get('record_count', 0)}; "
                    f"carry-forward anomalies: {redcap_meta.get('anomaly_count', 0)}; "
                    f"source: {redcap_meta.get('source') or 'unknown'}",
                )
            )
        if isinstance(redcap_visit_health, dict):
            fragments.append(
                (
                    "redcap_visit_health.anomaly_count",
                    f"REDCap visit-health anomaly count: {redcap_visit_health.get('anomaly_count', 0)}",
                )
            )
        if isinstance(redcap_ops, dict):
            freshness = (
                redcap_ops.get("freshness")
                if isinstance(redcap_ops.get("freshness"), dict)
                else {}
            )
            parity = (
                redcap_ops.get("runtime_parity")
                if isinstance(redcap_ops.get("runtime_parity"), dict)
                else {}
            )
            if freshness:
                fragments.append(
                    (
                        "redcap_ops.freshness",
                        "REDCap ops freshness: "
                        f"{freshness.get('generated_at') or 'unknown'}; "
                        f"age_hours: {freshness.get('age_hours', 0)}; "
                        f"source: {freshness.get('source') or 'unknown'}",
                    )
                )
            if parity:
                hashes = {str(value) for value in parity.values() if value}
                fragments.append(
                    (
                        "redcap_ops.runtime_parity",
                        "Runtime parity: "
                        f"{'in sync' if len(hashes) <= 1 else 'drift detected'}; "
                        + ", ".join(f"{key}={value}" for key, value in parity.items()),
                    )
                )
        if isinstance(redcap_clinical, dict):
            epds = redcap_clinical.get("epds_trajectory")
            if isinstance(epds, list) and epds:
                positive = sum(
                    int(row.get("screen_positive") or 0)
                    for row in epds
                    if isinstance(row, dict)
                )
                high = sum(
                    int(row.get("high_concern") or 0)
                    for row in epds
                    if isinstance(row, dict)
                )
                fragments.append(
                    (
                        "redcap_clinical.epds_trajectory",
                        f"EPDS screen-positive needing review: {positive}; high-concern: {high}",
                    )
                )
        if isinstance(redcap_schedule, dict):
            upcoming = redcap_schedule.get("upcoming_visits")
            if isinstance(upcoming, list):
                overdue = sum(
                    1
                    for row in upcoming
                    if isinstance(row, dict) and int(row.get("due_in_days") or 0) < 0
                )
                fragments.append(
                    (
                        "redcap_schedule.upcoming_visits",
                        f"Next-30-days REDCap visit forecast: {len(upcoming)} due or approaching; {overdue} overdue",
                    )
                )
        if isinstance(redcap_predictive, dict):
            risk = redcap_predictive.get("attrition_risk")
            if isinstance(risk, list):
                high = sum(
                    1
                    for row in risk
                    if isinstance(row, dict) and row.get("risk_band") == "high"
                )
                fragments.append(
                    (
                        "redcap_predictive.attrition_risk",
                        f"REDCap attrition early-warning scores: {len(risk)} hashed records; {high} high risk",
                    )
                )

        fragments.append(
            (
                "readings.summary.total_readings",
                f"Indexed readings: {readings_summary.get('total_readings', 0)}",
            )
        )
        freshness = self._readings_freshness_status()
        if freshness:
            fragments.append(
                (
                    "readings.freshness.last_indexed_at",
                    "Readings last indexed: "
                    f"{freshness.get('last_indexed_at') or 'unknown'}; "
                    f"total indexed: {freshness.get('total_indexed', 0)}",
                )
            )
            warnings = freshness.get("warnings") or []
            if warnings:
                fragments.append(
                    (
                        "readings.freshness.warnings",
                        f"Readings ingest warnings: {len(warnings)} pending failed or poisoned events",
                    )
                )

        pipeline = self._cluster_pipeline_status()
        if pipeline:
            state = pipeline.get("state", "unknown")
            last_success = pipeline.get("last_success") or {}
            fragments.append(
                (
                    "cluster.pipeline.health",
                    "Cluster readings pipeline: "
                    f"{state}; last successful event: "
                    f"{last_success.get('event_id') or 'none'}; "
                    f"last trigger: {pipeline.get('last_trigger') or 'unknown'}",
                )
            )

        if by_group:
            group_summary = ", ".join(
                f"{group}: {stats.get('current', 'unknown')}/{stats.get('target', 'unknown')}"
                for group, stats in by_group.items()
            )
            fragments.append(
                ("enrollment.by_group", f"Enrollment by group: {group_summary}")
            )

        if participant_operations_summary:
            source_doc = (
                participant_operations.get("meta", {}).get("source_doc")
                if isinstance(participant_operations, dict)
                else None
            )
            fragments.append(
                (
                    "participant_operations.summary",
                    "Participant operations: "
                    f"{participant_operations_summary.get('single', 0)} single, "
                    f"{participant_operations_summary.get('dual', 0)} dual, "
                    f"{participant_operations_summary.get('risk_watch', 0)} watch-risk, "
                    f"{participant_operations_summary.get('risk_high', 0)} high-risk. "
                    f"Source doc: {source_doc or 'not listed'}",
                )
            )

        if lab_priority:
            active_phase = next(
                (
                    phase
                    for phase in lab_phases
                    if isinstance(phase, dict) and phase.get("status") == "active"
                ),
                lab_phases[0] if lab_phases else {},
            )
            fragments.append(
                (
                    "lab_operations.priority",
                    "Lab operations priority: "
                    f"{lab_priority.get('current_priority')}; "
                    f"active phase: {active_phase.get('phase') or 'not listed'} "
                    f"({active_phase.get('timeframe') or 'timeframe unknown'}).",
                )
            )
        if lab_reporting:
            fragments.append(
                (
                    "lab_operations.reporting_management",
                    "Lab reporting management: "
                    f"{lab_reporting.get('status') or 'status unknown'}; "
                    f"{lab_reporting.get('priority_note') or lab_reporting.get('goal') or 'priority note not listed'}",
                )
            )

        best_index, best = _find_best_model_card(
            payload.get("ml_performance", {}).get("models") or []
        )
        if best is not None:
            best_name = best.get("model_name") or best.get("name") or "best model"
            best_auc = best.get("auroc") or best.get("roc_auc")
            fragments.append(
                (
                    f"ml_performance.models[{best_index}]",
                    f"Best model: {best_name} ({best_auc})",
                )
            )

        return fragments

    def _build_fact_map(
        self, payload: dict[str, Any], readings: dict[str, Any]
    ) -> dict[str, Any]:
        enrollment = payload.get("enrollment", {})
        overall = enrollment.get("overall", {})
        by_group = enrollment.get("by_group", {})
        readings_summary = readings.get("summary", {})
        trajectories = payload.get("trajectories", {})
        data_quality = payload.get("data_quality", {})
        matlab = payload.get("matlab_integration", {})
        cohort = payload.get("cohort_table") or []
        participant_operations = payload.get("participant_operations") or {}
        organization_site = payload.get("organization_site") or {}
        lab_operations = payload.get("lab_operations") or {}
        participant_operations_summary = (
            participant_operations.get("summary")
            if isinstance(participant_operations, dict)
            else {}
        )
        hda_composition = payload.get("hda_composition") or {}
        hda_by_group = (
            hda_composition.get("by_group") if isinstance(hda_composition, dict) else {}
        )
        attrition_funnel = payload.get("attrition_funnel") or {}
        attrition_stages = (
            attrition_funnel.get("stages") if isinstance(attrition_funnel, dict) else []
        )
        county_profiles = payload.get("county_profiles") or []
        redcap_meta = payload.get("redcap_meta") or {}
        redcap_completion_stats = payload.get("redcap_completion_stats") or {}
        redcap_visit_health = payload.get("redcap_visit_health") or {}
        redcap_trackers = payload.get("redcap_trackers") or {}
        redcap_ops = payload.get("redcap_ops") or {}
        redcap_clinical = payload.get("redcap_clinical") or {}
        redcap_integrity = payload.get("redcap_integrity") or {}
        redcap_schedule = payload.get("redcap_schedule") or {}
        redcap_respondent = payload.get("redcap_respondent") or {}
        redcap_platform = payload.get("redcap_platform") or {}
        redcap_predictive = payload.get("redcap_predictive") or {}
        clinical_cutoffs = payload.get("clinical_cutoffs") or {}
        nano_payload = payload.get("nano") or {}
        nano_pipeline = (
            nano_payload.get("pipeline") if isinstance(nano_payload, dict) else []
        )
        redcap_visit_records = (
            redcap_visit_health.get("data")
            if isinstance(redcap_visit_health, dict)
            else []
        )
        best_index, best_model = _find_best_model_card(
            payload.get("ml_performance", {}).get("models") or []
        )
        shap = payload.get("ml_performance", {}).get("shap") or []
        public_studies = (
            organization_site.get("studies")
            if isinstance(organization_site, dict)
            else []
        )
        nano_public_study = next(
            (
                study
                for study in (public_studies or [])
                if isinstance(study, dict)
                and "nano" in str(study.get("title") or study.get("slug") or "").lower()
            ),
            {},
        )

        enrollment_total_current = overall.get("current")
        enrollment_total_target = overall.get("target") or payload.get("meta", {}).get(
            "study", {}
        ).get("n_target")

        if enrollment_total_current is None and by_group:
            current_values = [
                stats.get("current")
                for stats in by_group.values()
                if isinstance(stats, dict)
            ]
            if current_values and all(
                isinstance(value, (int, float)) for value in current_values
            ):
                enrollment_total_current = int(sum(current_values))

        if enrollment_total_target is None and by_group:
            target_values = [
                stats.get("target")
                for stats in by_group.values()
                if isinstance(stats, dict)
            ]
            if target_values and all(
                isinstance(value, (int, float)) for value in target_values
            ):
                enrollment_total_target = int(sum(target_values))

        return {
            "indexed_readings": readings_summary.get("total_readings"),
            "readings_freshness": self._readings_freshness_status(),
            "cluster_pipeline": self._cluster_pipeline_status(),
            "enrollment_total_current": enrollment_total_current,
            "enrollment_total_target": enrollment_total_target,
            "enrollment_by_group": by_group,
            "trajectory_biomarkers": trajectories.get("biomarkers") or [],
            "trajectory_months": trajectories.get("months") or [],
            "rmssd_latest_by_group": self._latest_metric_by_group(
                trajectories, "RMSSD"
            ),
            "top_shap_features": shap[:5],
            "matlab_version": (matlab.get("manifest") or {}).get("matlab_version"),
            "matlab_files": matlab.get("files") or [],
            "data_quality": data_quality,
            "cohort_rows": len(cohort) if isinstance(cohort, list) else 0,
            "participant_operations_summary": (
                participant_operations_summary
                if isinstance(participant_operations_summary, dict)
                else {}
            ),
            "participant_operations_doc": (
                participant_operations.get("meta", {}).get("source_doc")
                if isinstance(participant_operations, dict)
                else None
            ),
            "nano_public_study": nano_public_study,
            "participant_id_legend": (
                participant_operations.get("id_legend") or []
                if isinstance(participant_operations, dict)
                else []
            ),
            "participant_form_policies": (
                participant_operations.get("form_policy_options") or []
                if isinstance(participant_operations, dict)
                else []
            ),
            "participant_workflow_steps": (
                participant_operations.get("workflow_steps") or []
                if isinstance(participant_operations, dict)
                else []
            ),
            "lab_operations": (
                lab_operations if isinstance(lab_operations, dict) else {}
            ),
            "lab_operations_priority": (
                lab_operations.get("priority") or {}
                if isinstance(lab_operations, dict)
                else {}
            ),
            "lab_operations_phases": (
                lab_operations.get("workflow_phases") or []
                if isinstance(lab_operations, dict)
                else []
            ),
            "lab_operations_roles": (
                lab_operations.get("role_workflows") or []
                if isinstance(lab_operations, dict)
                else []
            ),
            "lab_operations_metrics": (
                lab_operations.get("draft_metrics") or []
                if isinstance(lab_operations, dict)
                else []
            ),
            "lab_operations_family": (
                lab_operations.get("family_data_sharing") or {}
                if isinstance(lab_operations, dict)
                else {}
            ),
            "lab_operations_surfaces": (
                lab_operations.get("dashboard_surface_status") or []
                if isinstance(lab_operations, dict)
                else []
            ),
            "lab_operations_reporting": (
                lab_operations.get("reporting_management") or {}
                if isinstance(lab_operations, dict)
                else {}
            ),
            "lab_operations_reporting_reviews": (
                lab_operations.get("reporting_reviews") or []
                if isinstance(lab_operations, dict)
                else []
            ),
            "lab_operations_priority_datasets": (
                lab_operations.get("priority_datasets") or []
                if isinstance(lab_operations, dict)
                else []
            ),
            "lab_operations_systems_audit": (
                lab_operations.get("systems_audit") or []
                if isinstance(lab_operations, dict)
                else []
            ),
            "lab_operations_budget": (
                lab_operations.get("budget_reporting") or {}
                if isinstance(lab_operations, dict)
                else {}
            ),
            "lab_operations_collaborations": (
                lab_operations.get("external_collaborations") or []
                if isinstance(lab_operations, dict)
                else []
            ),
            "lab_operations_next_month": (
                lab_operations.get("next_month_reporting") or []
                if isinstance(lab_operations, dict)
                else []
            ),
            "hda_groups": (
                sorted(str(group) for group in hda_by_group.keys())
                if isinstance(hda_by_group, dict)
                else []
            ),
            "nano_pipeline": (
                nano_pipeline if isinstance(nano_pipeline, list) else []
            ),
            "hda_month_count": (
                max(
                    (
                        len(points)
                        for points in hda_by_group.values()
                        if isinstance(points, list)
                    ),
                    default=0,
                )
                if isinstance(hda_by_group, dict)
                else 0
            ),
            "attrition_stage_count": (
                len(attrition_stages) if isinstance(attrition_stages, list) else 0
            ),
            "attrition_last_stage": (
                attrition_stages[-1]
                if isinstance(attrition_stages, list) and attrition_stages
                else None
            ),
            "county_profile_count": (
                len(county_profiles) if isinstance(county_profiles, list) else 0
            ),
            "redcap_meta": redcap_meta if isinstance(redcap_meta, dict) else {},
            "redcap_freshness": self._redcap_freshness_status(),
            "redcap_completion_stats": (
                redcap_completion_stats
                if isinstance(redcap_completion_stats, dict)
                else {}
            ),
            "redcap_trackers": (
                redcap_trackers if isinstance(redcap_trackers, dict) else {}
            ),
            "redcap_ops": redcap_ops if isinstance(redcap_ops, dict) else {},
            "redcap_clinical": (
                redcap_clinical if isinstance(redcap_clinical, dict) else {}
            ),
            "redcap_integrity": (
                redcap_integrity if isinstance(redcap_integrity, dict) else {}
            ),
            "redcap_schedule": (
                redcap_schedule if isinstance(redcap_schedule, dict) else {}
            ),
            "redcap_respondent": (
                redcap_respondent if isinstance(redcap_respondent, dict) else {}
            ),
            "redcap_platform": (
                redcap_platform if isinstance(redcap_platform, dict) else {}
            ),
            "redcap_predictive": (
                redcap_predictive if isinstance(redcap_predictive, dict) else {}
            ),
            "clinical_cutoffs": (
                clinical_cutoffs if isinstance(clinical_cutoffs, dict) else {}
            ),
            "redcap_visit_records": (
                redcap_visit_records if isinstance(redcap_visit_records, list) else []
            ),
            "best_model": (
                {
                    "index": best_index,
                    "name": (best_model or {}).get("model_name")
                    or (best_model or {}).get("name"),
                    "auroc": (best_model or {}).get("auroc")
                    or (best_model or {}).get("roc_auc"),
                }
                if best_model
                else None
            ),
        }

    def _latest_metric_by_group(
        self, trajectories: dict[str, Any], metric: str
    ) -> dict[str, dict[str, Any]]:
        if not isinstance(trajectories, dict):
            return {}

        months = trajectories.get("months")
        by_group = trajectories.get("by_group")
        if not isinstance(months, list) or not isinstance(by_group, dict):
            return {}

        latest: dict[str, dict[str, Any]] = {}
        for group, group_payload in by_group.items():
            if not isinstance(group_payload, dict):
                continue
            mean = group_payload.get("mean")
            values = mean.get(metric) if isinstance(mean, dict) else None
            if not isinstance(values, list):
                continue

            limit = min(len(months), len(values))
            for index in range(limit - 1, -1, -1):
                value = values[index]
                if isinstance(value, (int, float)) and value == value:
                    latest[str(group)] = {
                        "month": months[index],
                        "value": value,
                    }
                    break

        return latest

    def _readings_freshness_status(self) -> dict[str, Any]:
        try:
            from k8s.pipeline import PipelineConfig, readings_freshness_payload

            config = PipelineConfig.from_env()
            return readings_freshness_payload(config)
        except Exception:
            return {}

    def _cluster_pipeline_status(self) -> dict[str, Any]:
        try:
            from k8s.pipeline import PipelineConfig, pipeline_status_payload

            config = PipelineConfig.from_env()
            if not config.assistant_cluster_context_enabled:
                return {}
            return pipeline_status_payload(config)
        except Exception:
            return {}

    def _redcap_freshness_status(self) -> dict[str, Any]:
        payload = self._load_dashboard_payload()
        ops = payload.get("redcap_ops") or {}
        freshness = ops.get("freshness") if isinstance(ops, dict) else {}
        meta = payload.get("redcap_meta") or {}
        if isinstance(freshness, dict) and freshness:
            return {
                "generated_at": freshness.get("generated_at"),
                "record_count": (
                    meta.get("record_count") if isinstance(meta, dict) else None
                ),
                "anomaly_count": (
                    meta.get("anomaly_count") if isinstance(meta, dict) else None
                ),
                "source": freshness.get("source"),
                "status": freshness.get("status"),
                "age_hours": freshness.get("age_hours"),
                "sla_hours": freshness.get("sla_hours"),
            }
        if not isinstance(meta, dict):
            return {}
        return {
            "generated_at": meta.get("generated_at"),
            "record_count": meta.get("record_count"),
            "anomaly_count": meta.get("anomaly_count"),
            "source": meta.get("source"),
            "status": meta.get("status"),
        }

    def _assistant_freshness_status(self) -> dict[str, Any]:
        freshness: dict[str, Any] = {}
        try:
            from k8s.pipeline import PipelineConfig, assistant_freshness_payload

            config = PipelineConfig.from_env()
            if config.assistant_cluster_context_enabled:
                freshness = assistant_freshness_payload(config, assistant_status={})
        except Exception:
            freshness = {}
        redcap = self._redcap_freshness_status()
        if redcap:
            freshness["redcap"] = redcap
        return freshness

    def _probe_dependencies(self) -> dict[str, Any]:
        missing: list[str] = []
        for module_name in ("openai",):
            try:
                __import__(module_name)
            except Exception:
                missing.append(module_name)
        return {"available": not missing, "missing": missing}

    def _maybe_load_dotenv(self) -> None:
        """Load the one repository ``.env`` unless the runtime opts out.

        Containers set ``DASHBOARD_ASSISTANT_LOAD_DOTENV=false`` so the process
        receives only the explicit application allowlist from Compose.
        """
        if not _parse_bool(os.getenv("DASHBOARD_ASSISTANT_LOAD_DOTENV"), default=True):
            return
        try:
            from src.utils.env_loader import load_project_env
        except Exception:
            return
        load_project_env()

    def _effective_context_char_budget(self) -> int:
        available_prompt_tokens = max(
            self.config.context_window
            - self.config.max_new_tokens
            - CONTEXT_WINDOW_TOKEN_RESERVE,
            256,
        )
        derived_budget = available_prompt_tokens * APPROX_CONTEXT_CHARS_PER_TOKEN
        return max(1200, min(self.config.context_char_budget, derived_budget))

    def _response_token_limit(self, question: str) -> int:
        question_tokens = set(_tokenize(question))
        if question_tokens & DETAIL_REQUEST_TOKENS:
            return max(
                64, min(self.config.max_new_tokens, DETAILED_RESPONSE_TOKEN_LIMIT)
            )
        return max(48, min(self.config.max_new_tokens, CONCISE_RESPONSE_TOKEN_LIMIT))

    def _maybe_short_circuit_response(
        self, question: str, context: dict[str, Any]
    ) -> str | None:
        question_tokens = set(_tokenize(question))
        reading_matches = context.get("reading_matches") or []
        facts = context.get("facts") or {}

        if (
            {"nano", "study"} <= question_tokens
            and question_tokens & {"explain", "describe", "what"}
            and question_tokens & NANO_EXPLAINER_TOKENS
        ):
            return self._format_nano_study_explainer_response(
                facts.get("nano_public_study") or {}
            )

        def as_number(value: Any, default: float = 0.0) -> float:
            try:
                parsed = float(value)
            except (TypeError, ValueError):
                return default
            return parsed if parsed == parsed else default

        if question_tokens & {"model", "models"} and question_tokens & {
            "active",
            "api",
            "assistant",
            "configured",
            "fallback",
            "gguf",
            "hosted",
            "llm",
            "local",
            "nemotron",
            "nvidia",
            "no",
            "provider",
            "selected",
            "smaller",
            "tier",
        }:
            return self._format_local_model_policy_response()

        if question_tokens & {"rmss", "rmssd"}:
            return self._format_rmssd_response(facts.get("rmssd_latest_by_group") or {})

        if question_tokens & {
            "website",
            "esdlabsc",
            "external",
            "collaboration",
            "collaborations",
        }:
            collaborations = facts.get("lab_operations_collaborations") or []
            if isinstance(collaborations, list) and collaborations:
                return "External collaboration and website status: " + " ".join(
                    f"{row.get('partner')} ({row.get('status')}): {row.get('current_value')} Gap: {row.get('operational_gap')} Next: {row.get('next_action')}"
                    for row in collaborations
                    if isinstance(row, dict)
                )

        if question_tokens & {"budget", "finance"}:
            budget = facts.get("lab_operations_budget") or {}
            if isinstance(budget, dict) and budget:
                ready = "; ".join(str(item) for item in (budget.get("ready_now") or []))
                needs = "; ".join(
                    str(item) for item in (budget.get("needs_alignment") or [])
                )
                return (
                    f"Budget reporting goal: {budget.get('goal')} "
                    f"Current gap: {budget.get('current_gap')} "
                    f"Ready now: {ready or 'not listed'}. "
                    f"Needs alignment: {needs or 'not listed'}. "
                    f"Guardrail: {budget.get('guardrail')}"
                )

        if question_tokens & {
            "systems",
            "system",
            "audit",
            "tools",
            "storage",
            "owner",
            "owners",
            "ownership",
        }:
            audit = facts.get("lab_operations_systems_audit") or []
            if isinstance(audit, list) and audit:
                return "Systems and workflow audit: " + " ".join(
                    f"{row.get('track')} ({row.get('status')}): capture {', '.join(str(item) for item in (row.get('captures') or [])[:4])}; output {row.get('output')}."
                    for row in audit
                    if isinstance(row, dict)
                )

        if question_tokens & {
            "demographic",
            "demographics",
            "projection",
            "projections",
            "dataset",
            "datasets",
            "report",
            "reports",
            "reporting",
            "management",
        }:
            reporting = facts.get("lab_operations_reporting") or {}
            reviews = facts.get("lab_operations_reporting_reviews") or []
            datasets = facts.get("lab_operations_priority_datasets") or []
            next_month = facts.get("lab_operations_next_month") or []
            if isinstance(reporting, dict) and (
                reporting or reviews or datasets or next_month
            ):
                parts: list[str] = []
                if reporting:
                    parts.append(
                        f"Reporting goal: {reporting.get('goal')} Priority: {reporting.get('priority_note')} Alignment rule: {reporting.get('alignment_rule')}"
                    )
                if isinstance(reviews, list) and reviews:
                    parts.append(
                        "Review queue: "
                        + " ".join(
                            f"{row.get('area')} ({row.get('status')}): {row.get('next_action')}"
                            for row in reviews
                            if isinstance(row, dict)
                        )
                    )
                if isinstance(datasets, list) and datasets:
                    parts.append(
                        "Priority data sets: "
                        + " ".join(
                            f"{row.get('name')} ({row.get('study')}, {row.get('readiness')}), owner {row.get('owner')}, pull {row.get('pull_speed')}."
                            for row in datasets
                            if isinstance(row, dict)
                        )
                    )
                if isinstance(next_month, list) and next_month:
                    parts.append(
                        "Next-month candidates: "
                        + " ".join(
                            f"{row.get('metric')} ({row.get('status')}): {row.get('decision_use')}"
                            for row in next_month
                            if isinstance(row, dict)
                        )
                    )
                return " ".join(parts)

        if question_tokens & {
            "operations",
            "workflow",
            "workflows",
            "rollout",
            "phase",
            "phases",
            "priority",
        }:
            if question_tokens & {
                "nano",
                "nico",
                "grant",
                "priority",
                "phase",
                "phases",
                "rollout",
                "workflow",
                "workflows",
            }:
                priority = facts.get("lab_operations_priority") or {}
                phases = facts.get("lab_operations_phases") or []
                if isinstance(priority, dict) and isinstance(phases, list) and priority:
                    active_phase = next(
                        (
                            phase
                            for phase in phases
                            if isinstance(phase, dict)
                            and phase.get("status") == "active"
                        ),
                        phases[0] if phases else {},
                    )
                    phase_text = "; ".join(
                        f"{phase.get('phase')} ({phase.get('timeframe')}, {phase.get('status')})"
                        for phase in phases
                        if isinstance(phase, dict)
                    )
                    return (
                        f"Current priority: {priority.get('current_priority')} "
                        f"Active phase: {active_phase.get('phase')} ({active_phase.get('timeframe')}). "
                        f"The rollout phases are: {phase_text}."
                    )

        if question_tokens & {
            "coordinator",
            "coordinators",
            "graduate",
            "grad",
            "undergraduate",
            "undergrad",
            "supervisor",
            "supervisors",
            "handoff",
            "handoffs",
            "roles",
        }:
            roles = facts.get("lab_operations_roles") or []
            if isinstance(roles, list) and roles:
                return "Role handoffs: " + " ".join(
                    f"{row.get('role')}: {row.get('focus')} Handoff: {row.get('handoff')}"
                    for row in roles
                    if isinstance(row, dict)
                )

        if question_tokens & {
            "metric",
            "metrics",
            "standardize",
            "standardized",
            "coding",
            "scoring",
        }:
            metrics = facts.get("lab_operations_metrics") or []
            if isinstance(metrics, list) and metrics:
                return "Draft aligned metrics: " + " ".join(
                    f"{row.get('name')} ({row.get('kind')}, {row.get('status')}): {row.get('definition')}"
                    for row in metrics
                    if isinstance(row, dict)
                )

        if question_tokens & {
            "family",
            "families",
            "share",
            "sharing",
            "visualization",
            "visualizations",
        }:
            family = facts.get("lab_operations_family") or {}
            if isinstance(family, dict) and family:
                return (
                    "Family-facing data sharing is intentionally limited right now. "
                    f"Current state: {family.get('current_state')} "
                    f"Near-term policy: {family.get('near_term_policy')} "
                    f"Future option: {family.get('future_option')}"
                )

        if question_tokens & {
            "shown",
            "showing",
            "dashboard",
            "website",
            "surface",
            "surfaces",
            "feature",
            "features",
            "status",
        }:
            surfaces = facts.get("lab_operations_surfaces") or []
            if (
                question_tokens
                & {
                    "shown",
                    "showing",
                    "surface",
                    "surfaces",
                    "feature",
                    "features",
                    "status",
                }
                and isinstance(surfaces, list)
                and surfaces
            ):
                return "Dashboard surface status: " + " ".join(
                    f"{row.get('area')} is {row.get('status')}: {row.get('shown')}"
                    for row in surfaces
                    if isinstance(row, dict)
                )

        if question_tokens & {"reading", "readings"} and question_tokens & {
            "count",
            "how",
            "many",
            "number",
            "indexed",
        }:
            indexed_readings = facts.get("indexed_readings")
            if isinstance(indexed_readings, (int, float)):
                return f"There are {int(indexed_readings)} indexed readings in the dashboard library."

        if question_tokens & {
            "reading",
            "readings",
            "indexed",
            "freshness",
            "latest",
            "new",
            "updated",
        }:
            if question_tokens & {"freshness", "latest", "new", "updated", "indexed"}:
                freshness = facts.get("readings_freshness") or {}
                total = freshness.get("total_indexed") or facts.get("indexed_readings")
                indexed_at = freshness.get("last_indexed_at") or "unknown"
                warnings = freshness.get("warnings") or []
                if total is not None:
                    warning_text = (
                        f" There are {len(warnings)} pending ingest warnings."
                        if warnings
                        else " There are no pending ingest warnings in the current status."
                    )
                    return (
                        f"The readings library last indexed at {indexed_at} "
                        f"and currently has {int(total)} indexed readings."
                        f"{warning_text}"
                    )

        inflight_requested = "inflight" in question_tokens or {
            "in",
            "flight",
        } <= question_tokens
        if question_tokens & {"pipeline", "stage", "stages"} and (
            inflight_requested
            or question_tokens
            & {
                "done",
                "explain",
                "fail",
                "failed",
                "history",
                "open",
                "operator",
                "read",
                "run",
            }
        ):
            pipeline_rows = facts.get("nano_pipeline") or []
            stage_names = [
                str(row.get("stage") or "").strip()
                for row in pipeline_rows[:6]
                if isinstance(row, dict) and str(row.get("stage") or "").strip()
            ]
            if stage_names:
                return (
                    "Read the six NANO pipeline cards left to right: "
                    f"{', '.join(stage_names)}. "
                    "In flight is work currently moving through a stage, done is completed windows or jobs, and fail is a surfaced exception that needs review. "
                    "Open run history when a stage shows any fail count, when in-flight work looks stuck, or when the operator needs the run-level detail behind a stage total."
                )

        if question_tokens & {
            "cluster",
            "kubernetes",
            "k8s",
            "pipeline",
            "watcher",
            "worker",
        }:
            if question_tokens & {"healthy", "health", "status", "pipeline"}:
                pipeline = facts.get("cluster_pipeline") or {}
                state = pipeline.get("state") or "unknown"
                last_success = pipeline.get("last_success") or {}
                last_failure = pipeline.get("last_failure") or {}
                if last_failure:
                    return (
                        "The cluster readings pipeline is degraded: "
                        f"state is {state}, and the last failure was "
                        f"{last_failure.get('error') or 'not detailed'}."
                    )
                return (
                    "The cluster readings pipeline status is "
                    f"{state}. Last successful event: "
                    f"{last_success.get('event_id') or 'none recorded yet'}."
                )

        if question_tokens & {"enrollment", "enrolled"} and question_tokens & {
            "group",
            "groups",
            "cohort",
            "cohorts",
        }:
            shortcut = self._format_enrollment_by_group_response(
                facts.get("enrollment_by_group") or {}
            )
            if shortcut is not None:
                return shortcut

        if question_tokens & {"enrollment", "enrolled"} and question_tokens & {
            "current",
            "participants",
            "participant",
            "total",
            "overall",
        }:
            current = facts.get("enrollment_total_current")
            target = facts.get("enrollment_total_target")
            if isinstance(current, (int, float)) and isinstance(target, (int, float)):
                return f"Current enrollment is {int(current)} of {int(target)} participants."

        if question_tokens & {"cga", "river", "milestone", "milestones"}:
            groups = facts.get("hda_groups") or []
            month_count = facts.get("hda_month_count") or 0
            return (
                "The CGA Milestone River summarizes HDA phase composition over corrected gestational age months. "
                "It uses the aggregate hda_composition payload, normalized phase shares, and VPT/ASIB/TD grouping. "
                f"Current indexed groups are {', '.join(groups) if groups else 'not listed'} across {month_count or 'the configured'} month points."
            )

        if question_tokens & {
            "participant",
            "participants",
            "id",
            "legend",
            "numbering",
        } and question_tokens & {"id", "legend", "numbering", "5", "9", "series"}:
            legend = facts.get("participant_id_legend") or []
            summary = facts.get("participant_operations_summary") or {}
            doc = (
                facts.get("participant_operations_doc")
                or "docs/participant_operations_workflow.md"
            )
            legend_text = "; ".join(
                f"{item.get('code')}: {item.get('meaning')}"
                for item in legend[:4]
                if isinstance(item, dict)
            )
            return (
                "Participant operations use visible role codes so staff do not have to infer study membership from memory. "
                f"{legend_text or 'NANO-primary uses 5-series, NICO/ANONICO primary uses 9-series, and DUAL marks cross-study enrollment.'} "
                f"Current operations context lists {summary.get('dual', 0)} dual-enrolled participants. Source doc: {doc}."
            )

        if question_tokens & {
            "dual",
            "aih",
            "eh",
            "form",
            "forms",
            "linking",
        } and question_tokens & {"dual", "aih", "eh", "form", "forms"}:
            policies = facts.get("participant_form_policies") or []
            policy_text = "; ".join(
                f"{item.get('label')}: {item.get('rule')}"
                for item in policies[:3]
                if isinstance(item, dict)
            )
            doc = (
                facts.get("participant_operations_doc")
                or "docs/participant_operations_workflow.md"
            )
            return (
                "For dual-enrolled participants, the dashboard policy defaults to one master AIH/EH unless a backend data-pull rule requires study-specific duplicates. "
                f"{policy_text} Source doc: {doc}."
            )

        if question_tokens & {
            "packet",
            "questionnaire",
            "questionnaires",
            "scheduling",
            "risk",
        }:
            steps = facts.get("participant_workflow_steps") or []
            summary = facts.get("participant_operations_summary") or {}
            step_text = "; ".join(str(step) for step in steps[:5])
            return (
                "Before scheduling, staff should verify enrollment type, study role, visit marker, form policy, linked-form ID, questionnaire checklist, and packet requirements. "
                f"Workflow steps: {step_text or 'operations workflow steps are not listed in the current payload'}. "
                f"Current risk counts: watch={summary.get('risk_watch', 0)}, high={summary.get('risk_high', 0)}."
            )

        if question_tokens & {"county", "counties", "comparator"}:
            profile_count = facts.get("county_profile_count")
            return (
                "The County Comparator pairs two county-level profiles with the SDOH map, mirrored access bars, and recruitment/completion context. "
                "It stays aggregate-only: county FIPS/name, rurality, ADI, broadband, transportation, and participant counts are shown without participant identity. "
                f"The current payload includes {profile_count if profile_count is not None else 'an unknown number of'} county profiles."
            )

        if question_tokens & {"passport", "timeline", "swimlane", "swimlanes"}:
            cohort_rows = facts.get("cohort_rows")
            return (
                "The Participant Passport Timeline shows de-identified NANO IDs as swim lanes across visit, CGA, HDA, REDCap, and ECG events. "
                "The route filters by group, event type, and age window, then opens a scrubbed detail drawer for selected events. "
                f"The current cohort context has {cohort_rows if cohort_rows is not None else 'no counted'} rows."
            )

        if question_tokens & {"terrain", "contour"} or (
            question_tokens & {"model", "confidence"}
            and question_tokens & {"terrain", "map", "surface"}
        ):
            best = facts.get("best_model") or {}
            return (
                "The Model Confidence Terrain turns SHAP/model-confidence summaries into contour-style explanatory surfaces, with heatmap and 3D terrain controls reserved for richer model payloads. "
                "Each view keeps a local explainer card so users can read what the shape means before interpreting it. "
                f"The current best indexed model is {best.get('name') or 'not identified'}."
            )

        if question_tokens & {"guided", "hypothesis", "hypotheses"}:
            return (
                "The Guided Explorer offers five hypothesis cards that open preconfigured visualizations: CGA-HDA convergence, county access context, timeline adherence, model confidence, and attrition pressure. "
                "The assistant narration is tied to each card so future route updates can reuse the same feature vocabulary."
            )

        if question_tokens & {"public", "insight", "insights"}:
            return (
                "The Public Insights route is an aggregate, CDC-style story surface for stakeholders. "
                "It combines study reach, enrollment trajectory, county context, HDA development patterns, and retention trends while avoiding participant-level rows."
            )

        if question_tokens & {"executive", "stakeholder", "stakeholders"}:
            last_stage = facts.get("attrition_last_stage") or {}
            retained = (
                last_stage.get("retainedPct") if isinstance(last_stage, dict) else None
            )
            return (
                "Executive Mode provides a compact stakeholder dashboard with enrollment, completion, model, SDOH, and retention KPIs plus a PPTX export. "
                f"Current retention is {retained if retained is not None else 'not listed'}% at the final indexed funnel stage."
            )

        if question_tokens & {"attrition", "retention", "funnel"}:
            stage_count = facts.get("attrition_stage_count")
            last_stage = facts.get("attrition_last_stage") or {}
            retained = (
                last_stage.get("retainedPct") if isinstance(last_stage, dict) else None
            )
            return (
                "The Attrition Funnel v2 shows consent-to-analysis retention stages, coded dropout reasons, quarter trends, subgroup filters, and a copy-ready NIH report summary. "
                f"The current funnel has {stage_count or 'the configured'} stages and final retained percentage {retained if retained is not None else 'not available'}."
            )

        if question_tokens & {"feature", "features", "route", "routes", "new"}:
            return (
                "The expanded dashboard surfaces are Data Explorer, Publications, Change History, RSA growth curves, REDCap completeness, HDA timeline/player, "
                "thermal heatmap, cohort swimmer plot, attrition and missingness, SDOH map, SHAP explorer, "
                "CGA Milestone River, County Comparator, Participant Passport Timeline, Model Confidence Terrain, Attrition Funnel v2, Guided Explorer, Public Insights, Executive Mode, "
                "Outcome Clusters, Model Leaderboard, Cascade DAG, ECG Quality Monitor, Spatial Assessment Matrix, "
                "Attachment Heatmap, and the Dynamics & Dyads layer: Co-Regulation, Phase Portrait, CVA Theater, "
                "HR Deceleration, Still-Face, HDA Bypass, Passport, Archetypes, Cascade Simulator, Eco-Validity, "
                "and Stream Coverage. They use de-identified NANO IDs and v2 API contracts."
            )

        if question_tokens & {"explorer", "sql", "table", "tables"}:
            return (
                "The Data Explorer route exposes four de-identified virtual tables: participants, runs, stages, and REDCap events. "
                "It supports sorting, column filters, pagination, column visibility, and CSV export of the currently filtered rows. "
                "The participant whitelist excludes DOB, MRN, caregiver IDs, address, and names."
            )

        if question_tokens & {
            "publication",
            "publications",
            "pubmed",
            "orcid",
            "crossref",
            "citation",
            "bibtex",
        }:
            return (
                "The Publications route stores normalized PubMed/ORCID-style records in the Python runtime database, enriches DOI records with citation-count metadata when external sync is enabled, "
                "adds deterministic research tags, formats APA citations, and exports the filtered set as BibTeX."
            )

        if question_tokens & {"changelog", "snapshot", "snapshots", "version", "diff"}:
            return (
                "The Change History route shows a de-identified audit timeline, filters by entity/action/date/actor/version tag, opens diffs, and creates dataset snapshot checkpoints with row counts and checksums. "
                "PHI fields are redacted before changed fields or snapshots reach the frontend."
            )

        if question_tokens & {
            "coregulation",
            "co-regulation",
            "dyad",
            "dyadic",
            "synchrony",
        }:
            return (
                "The Co-Regulation route aligns caregiver and infant Actiheart-derived streams. "
                "It summarizes synchrony index, signed caregiver/infant lead-lag, coupling stability, recovery concordance, "
                "and a windowed cross-correlation lag surface. Caregiver streams stay NANOID-keyed and never named."
            )

        if question_tokens & {"phase", "portrait", "arousal"} and question_tokens & {
            "attention",
            "orbit",
            "trajectory",
        }:
            return (
                "The Phase Portrait route plots arousal against attentional engagement so a session becomes an orbit through state space. "
                "Adaptive occupancy, recovery time, entropy, and centroid drift are computed from the endpoint values."
            )

        if question_tokens & {"cva", "gaze", "visual"}:
            return (
                "The CVA Theater aligns infant and caregiver gaze ribbons, shades face availability, and highlights overlapping targets as coordinated visual attention bouts. "
                "The face-availability gap and sticky-look index are recomputed from the de-identified segment data."
            )

        if question_tokens & {"bypass", "transition", "transitions"}:
            return (
                "The HDA Bypass route tests the orienting-to-termination hypothesis by comparing P(orienting to termination) with P(orienting to sustained). "
                "It also shows transition intervals and participant-level bypass index trends by age."
            )

        if question_tokens & {"cascade", "simulator", "what-if", "counterfactual"}:
            return (
                "The Cascade Simulator is a model-projection tool, not a clinical predictor. "
                "Slider changes propagate through fitted standardized paths and the page always surfaces uncertainty and model fit."
            )

        if question_tokens & {"rsa", "trajectory", "trajectories", "curve", "curves"}:
            biomarkers = facts.get("trajectory_biomarkers") or []
            months = facts.get("trajectory_months") or []
            return (
                "The RSA growth-curve panel compares normalized VPT, ASIB, and TD group trajectories with confidence bands. "
                f"Available trajectory biomarkers in the aggregate payload are {', '.join(map(str, biomarkers)) or 'not listed'}, "
                f"across {len(months)} visit-age points."
            )

        if question_tokens & {"shap", "beeswarm", "leaderboard", "model", "models"}:
            best = facts.get("best_model") or {}
            shap_features = facts.get("top_shap_features") or []
            labels = [
                str(item.get("label") or item.get("feature"))
                for item in shap_features
                if isinstance(item, dict)
            ][:3]
            return (
                f"The model leaderboard is anchored on the aggregate model metrics; the current best model is {best.get('name') or 'not identified'} "
                f"with AUROC {best.get('auroc') or 'not listed'}. "
                f"Top SHAP features include {', '.join(labels) if labels else 'no indexed feature labels'}."
            )

        if question_tokens & {"matlab", "queue", "artifact", "parquet"}:
            files = facts.get("matlab_files") or []
            version = facts.get("matlab_version") or "unknown"
            file_names = [
                str(item.get("name"))
                for item in files
                if isinstance(item, dict) and item.get("name")
            ][:4]
            return (
                f"The MATLAB queue enrichment reads the existing MATLAB integration block, including MATLAB {version}. "
                f"Current derived files include {', '.join(file_names) if file_names else 'no files listed'}, and artifact rate is derived from file QA pass percentages."
            )

        if question_tokens & {"epds", "depression", "maternal"}:
            clinical = facts.get("redcap_clinical") or {}
            cutoffs = facts.get("clinical_cutoffs") or {}
            epds = clinical.get("epds_trajectory") if isinstance(clinical, dict) else []
            if isinstance(epds, list) and epds:
                positive = sum(
                    as_number(row.get("screen_positive"))
                    for row in epds
                    if isinstance(row, dict)
                )
                high = sum(
                    as_number(row.get("high_concern"))
                    for row in epds
                    if isinstance(row, dict)
                )
                self_harm = sum(
                    as_number(row.get("self_harm_flags"))
                    for row in epds
                    if isinstance(row, dict)
                )
                return (
                    f"EPDS has {int(positive)} screen-positive summaries at cutoff >= {cutoffs.get('epds_positive', 10)}, "
                    f"{int(high)} high-concern summaries at cutoff >= {cutoffs.get('epds_high', 13)}, "
                    f"and {int(self_harm)} self-harm item flags. Coordinator review should start with high-concern and self-harm flags, then cross-check upcoming visit burden."
                )

        if question_tokens & {
            "forecast",
            "upcoming",
            "overdue",
            "next",
        } and question_tokens & {"visit", "visits", "days", "30"}:
            schedule = facts.get("redcap_schedule") or {}
            upcoming = (
                schedule.get("upcoming_visits") if isinstance(schedule, dict) else []
            )
            if isinstance(upcoming, list):
                overdue = [
                    row
                    for row in upcoming
                    if isinstance(row, dict) and as_number(row.get("due_in_days")) < 0
                ]
                approaching = len(upcoming) - len(overdue)
                first = (
                    upcoming[0] if upcoming and isinstance(upcoming[0], dict) else {}
                )
                return (
                    f"The next-30-days REDCap forecast has {len(upcoming)} hashed records: {len(overdue)} overdue and {approaching} approaching. "
                    f"The first listed window is {first.get('recordId', 'n/a')} at {first.get('label') or first.get('event') or 'unknown visit'} with due_in_days={first.get('due_in_days', 'n/a')}."
                )

        if question_tokens & {
            "integrity",
            "nullity",
            "diff",
            "double",
            "branching",
            "validation",
            "sentinel",
        }:
            integrity = facts.get("redcap_integrity") or {}
            nullity = (
                integrity.get("nullity_matrix") if isinstance(integrity, dict) else []
            )
            diffs = (
                integrity.get("double_entry_diffs")
                if isinstance(integrity, dict)
                else []
            )
            quality = (
                integrity.get("response_quality") if isinstance(integrity, dict) else []
            )
            branching = (
                integrity.get("branching_violations")
                if isinstance(integrity, dict)
                else []
            )
            radar = (
                integrity.get("validation_radar") if isinstance(integrity, dict) else []
            )
            if any(
                isinstance(item, list)
                for item in [nullity, diffs, quality, branching, radar]
            ):
                mean_nullity = (
                    sum(
                        as_number(row.get("missing_fraction"))
                        for row in nullity
                        if isinstance(row, dict)
                    )
                    / max(1, len(nullity))
                    if isinstance(nullity, list)
                    else 0
                )
                return (
                    f"Integrity sentinels show mean nullity {mean_nullity:.1%} across {len(nullity) if isinstance(nullity, list) else 0} cells, "
                    f"{len(diffs) if isinstance(diffs, list) else 0} double-entry diffs, "
                    f"{len(quality) if isinstance(quality, list) else 0} response-quality rows, "
                    f"{len(branching) if isinstance(branching, list) else 0} branching checks, and "
                    f"{len(radar) if isinstance(radar, list) else 0} validation radar rows."
                )

        if question_tokens & {"caregiver", "respondent", "fatigue"}:
            respondent = facts.get("redcap_respondent") or {}
            burden = (
                respondent.get("caregiver_burden")
                if isinstance(respondent, dict)
                else []
            )
            if isinstance(burden, list) and burden:
                text = "; ".join(
                    f"{row.get('label') or row.get('respondent')}: {row.get('completed', 0)}/{row.get('assigned', 0)} completed, fatigue_index={row.get('fatigue_index', 0)}"
                    for row in burden
                    if isinstance(row, dict)
                )
                return f"Caregiver burden summary: {text}."

        if question_tokens & {
            "platform",
            "logging",
            "log",
            "report",
            "reports",
            "repository",
            "users",
            "dag",
        }:
            platform = facts.get("redcap_platform") or {}
            if isinstance(platform, dict):
                audit = (
                    platform.get("audit_log")
                    if isinstance(platform.get("audit_log"), list)
                    else []
                )
                reports = (
                    platform.get("reports")
                    if isinstance(platform.get("reports"), list)
                    else []
                )
                files = (
                    platform.get("file_repository")
                    if isinstance(platform.get("file_repository"), list)
                    else []
                )
                users = (
                    platform.get("users")
                    if isinstance(platform.get("users"), list)
                    else []
                )
                return (
                    f"REDCap platform surfaces indexed: audit_log={len(audit)}, reports={len(reports)}, file_repository={len(files)}, users={len(users)}. "
                    "These are designed for server-side scheduled pulls; the browser proxy still blocks token-backed platform access."
                )

        if question_tokens & {
            "attrition",
            "incompletion",
            "risk",
            "early",
            "warning",
            "predictive",
        } and question_tokens & {"redcap", "risk", "attrition", "incompletion"}:
            predictive = facts.get("redcap_predictive") or {}
            risks = (
                predictive.get("attrition_risk") if isinstance(predictive, dict) else []
            )
            if isinstance(risks, list):
                high = [
                    row
                    for row in risks
                    if isinstance(row, dict) and row.get("risk_band") == "high"
                ]
                top = risks[0] if risks and isinstance(risks[0], dict) else {}
                drivers = (
                    top.get("drivers") if isinstance(top.get("drivers"), list) else []
                )
                return (
                    f"Attrition early-warning has {len(risks)} hashed risk scores and {len(high)} high-risk records. "
                    f"The top listed record is {top.get('recordId', 'n/a')} with score {top.get('risk_score', 'n/a')} and drivers {', '.join(map(str, drivers)) or 'not listed'}."
                )

        if question_tokens & {"memo", "weekly", "narrative"} and question_tokens & {
            "redcap",
            "study",
            "status",
        }:
            predictive = facts.get("redcap_predictive") or {}
            memo = predictive.get("weekly_memo") if isinstance(predictive, dict) else {}
            if isinstance(memo, dict) and memo:
                highlights = (
                    memo.get("highlights")
                    if isinstance(memo.get("highlights"), list)
                    else []
                )
                return (
                    f"{memo.get('title') or 'Weekly REDCap study memo'} is {memo.get('status') or 'available'}. "
                    + (
                        " Highlights: "
                        + "; ".join(str(item) for item in highlights[:4])
                        if highlights
                        else ""
                    )
                )

        redcap_tokens = {
            "redcap",
            "csbs",
            "carry",
            "forward",
            "anomaly",
            "anomalies",
            "r1",
            "r2",
            "r3",
            "r4",
            "r5",
        }
        if question_tokens & redcap_tokens and question_tokens & {
            "freshness",
            "fresh",
            "synced",
            "sync",
            "last",
            "when",
        }:
            redcap = facts.get("redcap_freshness") or {}
            if redcap:
                return (
                    "REDCap last synced at "
                    f"{redcap.get('generated_at') or 'unknown'} from "
                    f"{redcap.get('source') or 'unknown source'} with "
                    f"{redcap.get('record_count', 0)} records and "
                    f"{redcap.get('anomaly_count', 0)} carry-forward anomalies."
                )

        if question_tokens & {
            "runtime",
            "runtimes",
            "parity",
            "sync",
            "synced",
        } and question_tokens & {
            "pages",
            "docker",
            "k8s",
            "kubernetes",
            "sync",
            "synced",
            "parity",
        }:
            ops = facts.get("redcap_ops") or {}
            parity = ops.get("runtime_parity") if isinstance(ops, dict) else {}
            if isinstance(parity, dict) and parity:
                hashes = {str(value) for value in parity.values() if value}
                detail = ", ".join(f"{key}={value}" for key, value in parity.items())
                return (
                    f"The REDCap runtime parity panel is {'in sync' if len(hashes) <= 1 else 'showing drift'}. "
                    f"Current hashes: {detail}."
                )

        if question_tokens & {"event", "events"} and question_tokens & {
            "target",
            "behind",
            "furthest",
            "farthest",
        }:
            trackers = facts.get("redcap_trackers") or {}
            rows = trackers.get("enrollment") if isinstance(trackers, dict) else []
            if isinstance(rows, list) and rows:
                ranked = sorted(
                    [
                        row
                        for row in rows
                        if isinstance(row, dict) and int(row.get("expected") or 0) > 0
                    ],
                    key=lambda row: (
                        (int(row.get("expected") or 0) - int(row.get("completed") or 0))
                        / max(int(row.get("expected") or 0), 1),
                        int(row.get("expected") or 0) - int(row.get("completed") or 0),
                    ),
                    reverse=True,
                )
                if ranked:
                    row = ranked[0]
                    expected = int(row.get("expected") or 0)
                    completed = int(row.get("completed") or 0)
                    gap = expected - completed
                    pct = (completed / expected) * 100 if expected else 0
                    return (
                        f"{row.get('label') or row.get('event')} is furthest behind target: "
                        f"{completed}/{expected} complete ({pct:.1f}%), a gap of {gap}."
                    )

        requested_codes = sorted(question_tokens & {"r1", "r2", "r3", "r4", "r5"})
        if requested_codes and question_tokens & {
            "record",
            "records",
            "flagged",
            "which",
            "list",
        }:
            records = facts.get("redcap_visit_records") or []
            code = requested_codes[0].upper()
            matches = [
                str(row.get("recordId"))
                for row in records
                if isinstance(row, dict)
                and code
                in {str(flag).upper() for flag in row.get("anomalyFlags") or []}
            ]
            definitions = {
                "R1": "6m CSBS incomplete and 9m visit_date set",
                "R2": "9m CSBS incomplete and 12m visit_date set",
                "R3": "6m CSBS blank but 9m CSBS complete",
                "R4": "9m CSBS blank but 12m CSBS complete",
                "R5": "12m CSBS incomplete and 24m visit_date set",
            }
            return (
                f"{code} means {definitions.get(code, 'the requested REDCap anomaly code')}. "
                f"Flagged de-identified records: {', '.join(matches[:20]) if matches else 'none in the current payload'}"
                f"{' +' + str(len(matches) - 20) + ' more' if len(matches) > 20 else ''}."
            )

        if question_tokens & {
            "carry",
            "forward",
            "anomaly",
            "anomalies",
            "flags",
            "flagged",
        }:
            redcap = facts.get("redcap_meta") or {}
            records = facts.get("redcap_visit_records") or []
            if isinstance(records, list):
                flagged = [
                    row
                    for row in records
                    if isinstance(row, dict) and row.get("hasCarryForwardRisk")
                ]
                code_counts: dict[str, int] = {}
                for row in flagged:
                    for flag in row.get("anomalyFlags") or []:
                        code_counts[str(flag)] = code_counts.get(str(flag), 0) + 1
                code_text = (
                    ", ".join(
                        f"{code}={count}" for code, count in sorted(code_counts.items())
                    )
                    or "no R-code flags"
                )
                return (
                    f"There are {redcap.get('anomaly_count', len(flagged))} active REDCap carry-forward anomalies "
                    f"across {redcap.get('record_count', len(records))} records. "
                    f"Flag mix: {code_text}."
                )

        if question_tokens & {
            "csbs",
            "completeness",
            "complete",
            "incomplete",
            "skipped",
        }:
            completion = facts.get("redcap_completion_stats") or {}
            event_lookup = [
                ("24", "24_months_arm_1"),
                ("12", "12_months_arm_1"),
                ("9", "9_months_arm_1"),
                ("6", "6_months_arm_1"),
            ]
            event_name = next(
                (event for token, event in event_lookup if token in question_tokens),
                None,
            )
            if event_name and isinstance(completion, dict):
                stats = completion.get(event_name) or {}
                if isinstance(stats, dict):
                    return (
                        f"{stats.get('label') or event_name} CSBS completeness: "
                        f"{stats.get('complete', 0)} complete, "
                        f"{stats.get('unverified', 0)} unverified, "
                        f"{stats.get('incomplete', 0)} incomplete, "
                        f"{stats.get('not_started', 0)} not started, "
                        f"{stats.get('skipped', 0)} skipped of {stats.get('total', 0)} total."
                    )

        if question_tokens & {"nda", "completeness", "missingness"}:
            dq = facts.get("data_quality") or {}
            flags = dq.get("qc_flags") or {}
            missing_required = flags.get("missing_required_fields")
            return (
                "The REDCap completeness scorecard focuses on NDA-required instruments, participant-by-instrument completeness, "
                "and missing required fields near the configured deadline. "
                f"The aggregate QC block currently lists missing_required_fields={missing_required if missing_required is not None else 'not available'}."
            )

        if question_tokens & {"ecg", "quality", "sqi", "artifact"}:
            dq = facts.get("data_quality") or {}
            flags = dq.get("qc_flags") or {}
            return (
                "The ECG Quality Monitor shows per-window SQI and artifact markers, then can export a Markdown QC report. "
                f"The aggregate QC block lists ecg_transfer_late={flags.get('ecg_transfer_late', 'not available')} and temp_quality_rejected={flags.get('temp_quality_rejected', 'not available')}."
            )

        if (
            context.get("reading_metadata_only")
            and question_tokens & READING_SUMMARY_REQUEST_TOKENS
        ):
            return self._format_reading_metadata_response(reading_matches)

        if not context.get("grounded"):
            if reading_matches:
                return self._format_reading_metadata_response(reading_matches)
            return (
                "I can't verify that from the indexed NANO dashboard context right now. "
                "Try asking about enrollment, visit completion, data quality, model performance, or a specific reading title."
            )

        return None

    def _format_local_model_policy_response(self) -> str:
        """Describe the configured provider chain without generating text.

        This answer must work with no credentials at all, so it reads from
        configuration rather than contacting any provider.
        """
        tiers = self.config.provider_configs()
        order = "\n".join(
            f"  {index + 1}. {tier.effective_label} via {tier.effective_runtime}"
            for index, tier in enumerate(tiers)
        )
        backup = (
            "a lower tier takes over automatically"
            if len(tiers) > 1
            else "no backup tier is configured"
        )

        return (
            "Assistant provider policy:\n\n"
            f"- Failover order (first healthy tier answers):\n{order}\n"
            f"- On failure: {backup}. A tier with no credential is skipped rather "
            "than retried on every request.\n"
            "- All tiers speak the OpenAI chat-completions protocol through the "
            "dashboard backend; the browser never receives provider credentials.\n"
            "- Resilience: bounded concurrency, queue timeout, retry/backoff with "
            "jitter, and circuit-breaker degradation keep the dashboard responsive.\n"
            "- Self-hosting: NVIDIA NIM is optional and disabled by default because "
            "that model requires dedicated high-end GPU infrastructure."
        )

    def _format_nano_study_explainer_response(
        self, public_study: dict[str, Any]
    ) -> str:
        """Give a child-friendly overview using only facts present in the dashboard."""
        if public_study:
            details = public_study.get("details") or []
            source_parts = [
                public_study.get("summary"),
                public_study.get("audience"),
                *(details if isinstance(details, list) else []),
            ]
            source_text = " ".join(
                str(part).strip() for part in source_parts if str(part or "").strip()
            )
            normalized_source = " ".join(source_text.lower().split())
            compensation = str(public_study.get("compensation") or "").strip()
            lines: list[str] = []
            if "newborn" in normalized_source and "first 3 years" in normalized_source:
                lines.append(
                    "- The NANO Study follows newborn babies as they grow through their first 3 years."
                )
            if all(term in normalized_source for term in ("social", "language")) and (
                "motor" in normalized_source or "movement" in normalized_source
            ):
                lines.append(
                    "- The team watches early social, movement, and language skills, "
                    "like noticing how babies learn new things."
                )
            if "feedback" in normalized_source and "tips" in normalized_source:
                lines.append(
                    "- Families receive feedback and tips that can support their child's development."
                )
            if compensation:
                lines.append(f"- Families can earn {compensation} for taking part.")
            if lines:
                return "\n".join(lines)
        return (
            "- The NANO Study is the lab's main study project right now.\n"
            "- Think of it like a big class folder: the team keeps family visits and study forms organized.\n"
            "- The dashboard uses group-level, de-identified information, so it does not show private family details.\n"
            "- The dashboard does not state the study's full science question, so I should not make that part up."
        )

    def _format_rmssd_response(self, latest_by_group: dict[str, Any]) -> str:
        definition = (
            "RMSSD is the root mean square of successive IBI differences; "
            "in this dashboard it is an aggregate HRV/vagal-tone marker from accepted ECG windows."
        )

        if not isinstance(latest_by_group, dict) or not latest_by_group:
            return definition

        lines: list[str] = []
        for group in sorted(latest_by_group):
            item = latest_by_group.get(group)
            if not isinstance(item, dict):
                continue
            value = item.get("value")
            month = item.get("month")
            if not isinstance(value, (int, float)):
                continue
            month_text = _format_scalar_value(month)
            lines.append(
                f"- {group}: {_format_scalar_value(value)} ms at {month_text} months CGA."
            )

        if not lines:
            return definition

        return (
            f"{definition}\n\n"
            "Current indexed RMSSD values:\n"
            + "\n".join(lines)
            + "\n\nI read `rmss` as RMSSD; these are aggregate trajectory values, not participant-level PHI."
        )

    def _format_reading_metadata_response(self, matches: list[dict[str, Any]]) -> str:
        if not matches:
            return (
                "I can only verify indexed reading metadata here, and I do not have a grounded full-text match for that request. "
                "Try asking for a specific reading title, source, author, or page count."
            )

        items: list[str] = []
        for item in matches[:3]:
            title = item.get("title") or item.get("display_name") or "Untitled reading"
            display_name = (
                item.get("display_name")
                or item.get("relative_path")
                or "file unavailable"
            )
            source = item.get("source") or "unknown source"
            page_count = item.get("page_count")
            authors = item.get("authors_display")
            excerpt = item.get("excerpt")

            detail_parts = [f"{title} [{display_name}]", source]
            if isinstance(page_count, int):
                detail_parts.append(f"{page_count} pages")
            if authors and authors != "Unknown authors":
                detail_parts.append(authors)
            detail = ", ".join(detail_parts)
            if excerpt:
                detail = f"{detail} - {excerpt}"
            items.append(detail)

        return (
            "I found matching reading records, but I can't verify a full summary from this assistant because only indexed metadata and short excerpts are available here, not the full PDF text. "
            f"Best matches: {'; '.join(items)}. Open the matching PDF if you need the exact longitudinal design, measures, or analytic plan."
        )

    def _format_enrollment_by_group_response(
        self, by_group: dict[str, Any]
    ) -> str | None:
        if not by_group:
            return None

        parts: list[str] = []
        for group, stats in by_group.items():
            if not isinstance(stats, dict):
                continue
            current = stats.get("current")
            target = stats.get("target")
            label = stats.get("label") or group
            if current is None:
                continue
            segment = f"{group}: {int(current)}"
            if isinstance(target, (int, float)):
                segment += f" of {int(target)}"
            segment += f" ({label})"
            parts.append(segment)

        if not parts:
            return None

        return "Enrollment by group: " + "; ".join(parts) + "."


def _available_memory_gib() -> float:
    """Deprecated compatibility probe; provider readiness is host-memory agnostic."""
    return 0.0


def _parse_bool(value: str | None, *, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_int(value: str | None, *, default: int) -> int:
    try:
        return int(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def _parse_float(value: str | None, *, default: float) -> float:
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def _parse_chain(value: str | None) -> tuple[str, ...]:
    """Parse a comma or space separated provider failover order.

    An empty setting returns an empty tuple, which leaves the default tier
    order in place rather than disabling failover.
    """
    if not value:
        return ()
    parts = [part.strip().lower() for part in value.replace(" ", ",").split(",")]
    ordered: list[str] = []
    for part in parts:
        if part and part not in ordered:
            ordered.append(part)
    return tuple(ordered)


def _tokenize(text: str) -> list[str]:
    return [token.lower() for token in TOKEN_PATTERN.findall(text or "")]


def _score_fragment(
    question_tokens: set[str],
    path: str,
    text: str,
    focus_sections: set[str],
) -> float:
    haystack = f"{path} {text}".lower()
    path_text = path.lower().replace(".", " ").replace("[", " ").replace("]", " ")
    overlap = sum(1 for token in question_tokens if token in haystack)
    path_overlap = sum(1 for token in question_tokens if token in path_text)
    top_section = _top_section(path)

    section_bonus = 0.0
    if focus_sections:
        if top_section in focus_sections:
            section_bonus = 6.0
        elif top_section == "meta":
            section_bonus = 1.0
        elif top_section == "organization_site":
            section_bonus = -8.0
        else:
            section_bonus = -4.0
    else:
        if top_section == "organization_site":
            section_bonus = -4.0
        elif top_section in {
            "enrollment",
            "ml_performance",
            "redcap_audit",
            "redcap_meta",
            "redcap_completion_stats",
            "redcap_visit_health",
            "data_quality",
            "visit_completion",
            "readings",
        }:
            section_bonus = 2.0

    return (
        section_bonus
        + (path_overlap * 4.0)
        + (overlap * 2.0)
        - (len(path) / 200.0)
        - (min(len(text), 240) / 500.0)
    )


def _detect_focus_sections(question_tokens: set[str]) -> set[str]:
    focus_sections: set[str] = set()
    for section, keywords in SECTION_KEYWORDS.items():
        if question_tokens & keywords:
            focus_sections.add(section)
    return focus_sections


def _should_include_fragment(path: str, focus_sections: set[str]) -> bool:
    top_section = _top_section(path)

    if not focus_sections:
        return top_section != "organization_site"

    if top_section == "meta":
        return True

    return top_section in focus_sections


def _top_section(path: str) -> str:
    return path.split(".", 1)[0].split("[", 1)[0]


def _find_best_model_card(
    model_cards: list[dict[str, Any]],
) -> tuple[int, dict[str, Any] | None]:
    best_index = -1
    best_score = float("-inf")
    best_card: dict[str, Any] | None = None

    for index, item in enumerate(model_cards):
        score = float(item.get("auroc") or item.get("roc_auc") or 0)
        if score > best_score:
            best_index = index
            best_score = score
            best_card = item

    return best_index, best_card


def _build_reading_catalog_fragments(
    readings: dict[str, Any],
) -> tuple[list[tuple[str, str]], dict[str, dict[str, Any]]]:
    fragments: list[tuple[str, str]] = []
    fragment_index: dict[str, dict[str, Any]] = {}
    seen_ids: set[str] = set()

    for bucket in ("featured", "readings"):
        for item in readings.get(bucket, []) or []:
            if not isinstance(item, dict):
                continue
            reading_id = str(
                item.get("id")
                or item.get("display_name")
                or item.get("title")
                or "reading"
            )
            if reading_id in seen_ids:
                continue
            seen_ids.add(reading_id)

            title = (
                item.get("title") or item.get("display_name") or reading_id
            ).strip()
            display_name = (
                item.get("display_name") or item.get("relative_path") or reading_id
            )
            source = item.get("source") or "unknown source"
            category = item.get("category") or "unknown category"
            authors_display = item.get("authors_display") or "Unknown authors"
            page_count = item.get("page_count")
            excerpt = item.get("excerpt") or ""
            keywords = ", ".join((item.get("keywords") or [])[:6])
            relative_path = item.get("relative_path") or ""
            search_text = item.get("search_text") or ""

            detail_parts = [
                f"Reading title: {title}",
                f"file: {display_name}",
                f"source: {source}",
                f"category: {category}",
            ]
            if authors_display:
                detail_parts.append(f"authors: {authors_display}")
            if page_count:
                detail_parts.append(f"pages: {page_count}")
            if excerpt:
                detail_parts.append(f"excerpt: {excerpt}")
            if keywords:
                detail_parts.append(f"keywords: {keywords}")
            if relative_path:
                detail_parts.append(f"path: {relative_path}")

            path = f"readings.catalog[{reading_id}]"
            text = "; ".join(detail_parts)
            fragments.append((path, text))
            fragment_index[path] = {
                "title": title,
                "display_name": display_name,
                "source": source,
                "category": category,
                "authors_display": authors_display,
                "page_count": page_count,
                "excerpt": excerpt,
                "relative_path": relative_path,
                "search_text": search_text,
                "id": reading_id,
            }

    return fragments, fragment_index


def _score_reading_match(question_tokens: set[str], item: dict[str, Any]) -> float:
    if not item:
        return 0.0

    title_haystack = " ".join(
        [
            str(item.get("title") or ""),
            str(item.get("display_name") or ""),
            str(item.get("source") or ""),
            str(item.get("category") or ""),
        ]
    ).lower()
    metadata_haystack = " ".join(
        [
            str(item.get("excerpt") or ""),
            str(item.get("search_text") or ""),
            str(item.get("relative_path") or ""),
        ]
    ).lower()

    score = 0.0
    for token in question_tokens:
        if token in title_haystack:
            score += 5.0
        elif token in metadata_haystack:
            score += 2.0

    if item.get("category") == "Grant Materials":
        score += 2.0
    if "researchstrategy" in str(item.get("display_name") or "").lower():
        score += 3.0
    if question_tokens & {
        "research",
        "strategy",
        "grant",
        "analytic",
        "analysis",
        "design",
        "measure",
        "measures",
    }:
        if item.get("category") == "Grant Materials":
            score += 6.0

    return score


def _reading_match_context_text(item: dict[str, Any]) -> str:
    detail_parts = [
        f"Reading title: {item.get('title') or item.get('display_name') or 'Untitled reading'}",
        f"file: {item.get('display_name') or item.get('relative_path') or 'file unavailable'}",
        f"source: {item.get('source') or 'unknown source'}",
    ]
    if item.get("category"):
        detail_parts.append(f"category: {item['category']}")
    if item.get("authors_display"):
        detail_parts.append(f"authors: {item['authors_display']}")
    if item.get("page_count"):
        detail_parts.append(f"pages: {item['page_count']}")
    if item.get("excerpt"):
        detail_parts.append(f"excerpt: {item['excerpt']}")
    return "; ".join(detail_parts)


def _redcap_timepoint_text(value: Any) -> str:
    if not isinstance(value, dict):
        return "not started"
    status = value.get("csbsStatus") or "not_started"
    visit_date = value.get("visitDate") or "no visit date"
    return f"{status}, {visit_date}"


def _flatten_context(value: Any, *, prefix: str) -> list[tuple[str, str]]:
    fragments: list[tuple[str, str]] = []

    if value is None:
        return fragments

    if isinstance(value, dict):
        scalar_subset = {
            key: item
            for key, item in value.items()
            if isinstance(item, (str, int, float, bool)) or item is None
        }
        if scalar_subset:
            fragments.append((prefix, _compact_scalar_mapping(scalar_subset)))
        for key, item in value.items():
            if isinstance(item, (dict, list)):
                fragments.extend(_flatten_context(item, prefix=f"{prefix}.{key}"))
        return fragments

    if isinstance(value, list):
        if not value:
            return fragments
        if prefix.endswith(".months"):
            return fragments
        if all(
            isinstance(item, (str, int, float, bool)) or item is None
            for item in value[:8]
        ):
            if (
                all(
                    isinstance(item, (int, float)) or item is None for item in value[:8]
                )
                and len(value) > 4
            ):
                return fragments
            fragments.append(
                (
                    prefix,
                    ", ".join(
                        _format_scalar_value(item)
                        for item in value[:8]
                        if item is not None
                    ),
                )
            )
            return fragments
        for index, item in enumerate(value[:6]):
            fragments.extend(_flatten_context(item, prefix=f"{prefix}[{index}]"))
        return fragments

    fragments.append((prefix, str(value)))
    return fragments


def _compact_scalar_mapping(value: dict[str, Any]) -> str:
    parts: list[str] = []
    for key, item in value.items():
        if item is None:
            continue
        label = key.replace("_", " ")
        parts.append(f"{label}: {_format_scalar_value(item)}")
    return "; ".join(parts)


def _format_scalar_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float):
        return f"{value:.3f}".rstrip("0").rstrip(".")
    return str(value)


# ---------------------------------------------------------------------------
# Presentation planning helpers (pure functions, model-independent)
# ---------------------------------------------------------------------------


def _as_bool(value: Any, *, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _clean_text(value: Any, *, max_len: int = 240) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        value = " ".join(str(part) for part in value)
    text = re.sub(r"\s+", " ", str(value)).strip()
    # Strip stray markdown emphasis / bullet glyphs the model may emit.
    text = text.strip("*•-–—> ").strip()
    if len(text) > max_len:
        text = text[: max_len - 1].rstrip() + "…"
    return text


def _title_case_concept(concept: str) -> str:
    cleaned = _clean_text(concept, max_len=80)
    if not cleaned:
        return "This Concept"
    if cleaned.isupper() or cleaned.islower():
        return cleaned[:1].upper() + cleaned[1:]
    return cleaned


def _coerce_bullets(value: Any, *, limit: int = PRESENTATION_MAX_BULLETS) -> list[str]:
    items: list[str] = []
    if isinstance(value, (list, tuple)):
        raw_items = list(value)
    elif isinstance(value, str):
        raw_items = re.split(r"[\n;]+|(?:^|\s)[•\-\*]\s+", value)
    elif value is None:
        raw_items = []
    else:
        raw_items = [value]

    for item in raw_items:
        cleaned = _clean_text(item, max_len=160)
        if cleaned and cleaned not in items:
            items.append(cleaned)
        if len(items) >= limit:
            break
    return items


def _normalize_slide_type(value: Any) -> str:
    candidate = _clean_text(value, max_len=24).lower()
    if candidate in PRESENTATION_SLIDE_TYPES:
        return candidate
    aliases = {
        "cover": "title",
        "intro": "title",
        "introduction": "why",
        "motivation": "why",
        "overview": "why",
        "definition": "concept",
        "detail": "concept",
        "deep-dive": "concept",
        "metaphor": "analogy",
        "comparison": "analogy",
        "worked-example": "example",
        "worked_example": "example",
        "walkthrough": "example",
        "summary": "recap",
        "conclusion": "recap",
        "takeaways": "recap",
    }
    return aliases.get(candidate, "concept")


def _normalize_raw_slide(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None

    slide_type = _normalize_slide_type(
        raw.get("type") or raw.get("slide_type") or raw.get("kind")
    )
    title = _clean_text(
        raw.get("title") or raw.get("heading") or raw.get("name"), max_len=120
    )
    bullets = _coerce_bullets(
        raw.get("bullets") or raw.get("points") or raw.get("content") or raw.get("body")
    )
    if not title and not bullets:
        return None

    return {
        "type": slide_type,
        "title": title or "Untitled slide",
        "subtitle": _clean_text(raw.get("subtitle") or raw.get("subhead"), max_len=160)
        or None,
        "bullets": bullets,
        "example": _clean_text(
            raw.get("example") or raw.get("worked_example"), max_len=300
        )
        or None,
        "analogy": _clean_text(raw.get("analogy") or raw.get("metaphor"), max_len=300)
        or None,
        "note": _clean_text(
            raw.get("note") or raw.get("speaker_note") or raw.get("notes"), max_len=300
        )
        or None,
        "citations": _coerce_citations(
            raw.get("citations") or raw.get("references") or raw.get("grounding")
        ),
        "visual": _clean_text(
            raw.get("visual") or raw.get("visual_direction") or raw.get("visual_cue"),
            max_len=160,
        )
        or None,
    }


def _coerce_citations(value: Any, *, limit: int = 4) -> list[str]:
    items: list[str] = []
    raw_items = value if isinstance(value, (list, tuple)) else [value] if value else []
    for item in raw_items:
        cleaned = _clean_text(item, max_len=120)
        if cleaned and cleaned not in items:
            items.append(cleaned)
        if len(items) >= limit:
            break
    return items


def normalize_presentation_options(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Coerce a raw options payload into a validated, defaulted option set."""
    raw = raw or {}

    audience = _clean_text(
        raw.get("audience_level") or raw.get("audience"), max_len=24
    ).lower()
    if audience not in PRESENTATION_AUDIENCE_LEVELS:
        audience = "beginner"

    try:
        slide_count = int(
            raw.get("slide_count")
            or raw.get("slides")
            or PRESENTATION_DEFAULT_SLIDE_COUNT
        )
    except (TypeError, ValueError):
        slide_count = PRESENTATION_DEFAULT_SLIDE_COUNT
    slide_count = max(
        PRESENTATION_MIN_SLIDES, min(PRESENTATION_MAX_SLIDES, slide_count)
    )

    tone = _clean_text(raw.get("tone"), max_len=80) or PRESENTATION_DEFAULT_TONE

    return {
        "audience_level": audience,
        "slide_count": slide_count,
        "include_analogy": _as_bool(
            raw.get("include_analogy", raw.get("analogy")), default=True
        ),
        "include_worked_example": _as_bool(
            raw.get(
                "include_worked_example", raw.get("worked_example", raw.get("example"))
            ),
            default=True,
        ),
        "tone": tone,
    }


def build_presentation_messages(
    concept: str,
    options: dict[str, Any],
    context_block: str,
    grounding: dict[str, Any],
) -> list[dict[str, str]]:
    """Build the JSON-only presentation-planning chat messages."""
    grounded = bool(grounding.get("grounded"))
    citation_hint = ""
    if grounded and grounding.get("citations"):
        citation_hint = (
            " Grounded dashboard references you may cite verbatim: "
            + "; ".join(str(c) for c in grounding["citations"][:6])
            + "."
        )

    grounding_rule = (
        "The concept overlaps indexed NANO/ESD Lab study context provided below. "
        "Where a slide uses that context, add the matching reference string to that "
        'slide\'s "citations" array.' + citation_hint
        if grounded
        else "The concept is general and is NOT grounded in local study data. Do not invent "
        'lab citations, study numbers, or NANO-specific facts. Leave "citations" arrays empty '
        'and set "disclaimer" to a short note that this is a general explanation.'
    )

    schema = (
        "{\n"
        '  "title": string,\n'
        '  "subtitle": string,\n'
        '  "audience_level": "beginner" | "intermediate" | "advanced",\n'
        '  "summary": string,            // one sentence\n'
        '  "disclaimer": string | null,\n'
        '  "slides": [\n'
        "    {\n"
        '      "id": string,\n'
        '      "type": "title" | "why" | "concept" | "analogy" | "example" | "recap",\n'
        '      "title": string,\n'
        '      "subtitle": string | null,\n'
        '      "bullets": string[],      // 3-5 short bullets, <= ~12 words each\n'
        '      "example": string | null,\n'
        '      "analogy": string | null,\n'
        '      "note": string | null,    // optional speaker note\n'
        '      "citations": string[],\n'
        '      "visual": string | null   // abstract/geometric direction only\n'
        "    }\n"
        "  ]\n"
        "}"
    )

    system = (
        "You are a presentation planner embedded in the ESD Lab dashboard. "
        "You turn a single concept into a minimal, calm, easy-to-understand slide deck. "
        f"Write in a {options['tone']} tone for a {options['audience_level']} audience. "
        "Return ONE valid JSON object and NOTHING else: no prose, no markdown, no code fences. "
        "Deck structure, in order: exactly one title slide, then one short why-this-matters slide, "
        "then two to four concept slides, "
        + ("then one analogy slide, " if options["include_analogy"] else "")
        + (
            "then one worked-example slide, "
            if options["include_worked_example"]
            else ""
        )
        + "then one recap slide. "
        "Rules: at most five bullets per slide; aim for twelve words or fewer per bullet; "
        "prefer plain language over jargon; never include protected health information. "
        f"{grounding_rule}\n\n"
        "JSON schema to follow exactly:\n"
        f"{schema}\n\n"
        "Grounded study context (may be empty):\n"
        f"{context_block or '(no grounded study context available)'}"
    )

    user = (
        f"Concept to explain: {concept}\n"
        f"Audience level: {options['audience_level']}\n"
        f"Target slide count: {options['slide_count']}\n"
        f"Include analogy slide: {'yes' if options['include_analogy'] else 'no'}\n"
        f"Include worked-example slide: {'yes' if options['include_worked_example'] else 'no'}\n"
        "Respond with the JSON object only."
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def extract_json_object(text: str) -> dict[str, Any] | None:
    """Best-effort extraction of a single JSON object from model output."""
    if not text:
        return None

    candidate = text.strip()
    # Drop surrounding markdown code fences if present.
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", candidate, flags=re.DOTALL)
    if fence:
        candidate = fence.group(1).strip()

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    snippet = candidate[start : end + 1]

    for attempt in (snippet, re.sub(r",\s*([}\]])", r"\1", snippet)):
        try:
            parsed = json.loads(attempt)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def normalize_deck_plan(
    raw_plan: dict[str, Any] | None,
    *,
    concept: str,
    options: dict[str, Any],
    grounding: dict[str, Any],
) -> dict[str, Any]:
    """Repair a parsed plan into the strict, render-ready deck contract.

    A parseable-but-incomplete object is filled out so the deck always honours
    the title -> why -> concepts -> (analogy) -> (example) -> recap structure,
    the five-bullet cap, and grounding/citation gating. Synthesized slides use
    generic scaffolding text only; no lab-specific facts are invented.
    """
    raw = raw_plan if isinstance(raw_plan, dict) else {}
    grounded = bool(grounding.get("grounded"))
    deck_citations = list(grounding.get("citations") or []) if grounded else []
    concept_title = _title_case_concept(concept)

    title = _clean_text(raw.get("title") or raw.get("deck_title"), max_len=120) or (
        f"Understanding {concept_title}"
    )
    subtitle = (
        _clean_text(raw.get("subtitle") or raw.get("deck_subtitle"), max_len=160)
        or f"A simple, {options['audience_level']}-friendly explainer"
    )
    summary = (
        _clean_text(
            raw.get("summary")
            or raw.get("one_sentence_summary")
            or raw.get("overview"),
            max_len=240,
        )
        or f"A clear, {options['audience_level']} introduction to {concept_title}."
    )

    if not grounded:
        disclaimer: str | None = PRESENTATION_GENERAL_DISCLAIMER
    else:
        disclaimer = _clean_text(raw.get("disclaimer"), max_len=240) or None

    model_slides: list[dict[str, Any]] = []
    if isinstance(raw.get("slides"), list):
        for item in raw["slides"]:
            normalized = _normalize_raw_slide(item)
            if normalized:
                model_slides.append(normalized)

    def first_of(slide_type: str) -> dict[str, Any] | None:
        return next((s for s in model_slides if s["type"] == slide_type), None)

    title_slide = first_of("title")
    why_slide = first_of("why")
    recap_slide = first_of("recap")
    analogy_slide = first_of("analogy") if options["include_analogy"] else None
    example_slide = first_of("example") if options["include_worked_example"] else None
    concept_slides = [s for s in model_slides if s["type"] == "concept"]

    reserved = 3  # title + why + recap
    if analogy_slide is not None or options["include_analogy"]:
        reserved += 1
    if example_slide is not None or options["include_worked_example"]:
        reserved += 1
    concept_budget = max(1, options["slide_count"] - reserved)
    if len(concept_slides) > concept_budget:
        concept_slides = concept_slides[:concept_budget]

    if title_slide is None:
        title_slide = _scaffold_slide(
            "title",
            title,
            subtitle=subtitle,
            visual="clean title with a thin garnet divider",
        )
    if not concept_slides:
        concept_slides = [
            _scaffold_slide(
                "concept",
                f"What {concept_title} means",
                bullets=[summary],
            )
        ]
    if why_slide is None:
        why_slide = _scaffold_slide(
            "why",
            "Why this matters",
            bullets=[
                f"{concept_title} shows up in everyday situations",
                "A simple mental model makes it easier to use",
                "Getting the basics first prevents confusion later",
            ],
        )
    if options["include_analogy"] and analogy_slide is None:
        analogy_slide = _scaffold_slide(
            "analogy",
            "A helpful analogy",
            bullets=[
                "Compare it to a familiar everyday system",
                "The same cause and effect pattern applies",
                "The analogy breaks down at the finest detail",
            ],
            analogy=f"{concept_title} behaves like a familiar everyday process.",
            visual="two side-by-side panels joined by an arrow",
        )
    if options["include_worked_example"] and example_slide is None:
        example_slide = _scaffold_slide(
            "example",
            "A worked example",
            bullets=[
                "Start from a concrete, simple case",
                "Apply the idea one step at a time",
                "Check the result against intuition",
            ],
            example=f"A short step-by-step walkthrough of {concept_title}.",
            visual="numbered steps stacked vertically",
        )
    if recap_slide is None:
        recap_bullets = [s["bullets"][0] for s in concept_slides if s["bullets"]]
        recap_slide = _scaffold_slide(
            "recap",
            "Recap",
            bullets=recap_bullets[:PRESENTATION_MAX_BULLETS] or [summary],
            visual="three-line summary with a gold underline",
        )

    ordered: list[dict[str, Any]] = [title_slide, why_slide, *concept_slides]
    if analogy_slide is not None:
        ordered.append(analogy_slide)
    if example_slide is not None:
        ordered.append(example_slide)
    ordered.append(recap_slide)

    slides: list[dict[str, Any]] = []
    for index, slide in enumerate(ordered, start=1):
        bullets = (
            []
            if slide["type"] == "title"
            else slide["bullets"][:PRESENTATION_MAX_BULLETS]
        )
        citations = list(slide.get("citations") or []) if grounded else []
        slides.append(
            {
                "id": f"{slide['type']}-{index}",
                "type": slide["type"],
                "title": slide["title"],
                "subtitle": slide.get("subtitle"),
                "bullets": bullets,
                "example": slide.get("example"),
                "analogy": slide.get("analogy"),
                "note": slide.get("note"),
                "citations": citations,
                "visual": slide.get("visual"),
            }
        )

    return {
        "title": title,
        "subtitle": subtitle,
        "audience_level": options["audience_level"],
        "summary": summary,
        "disclaimer": disclaimer,
        "grounded": grounded,
        "citations": deck_citations,
        "concept": _clean_text(concept, max_len=160),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "slides": slides,
    }


def _scaffold_slide(
    slide_type: str,
    title: str,
    *,
    subtitle: str | None = None,
    bullets: list[str] | None = None,
    example: str | None = None,
    analogy: str | None = None,
    visual: str | None = None,
) -> dict[str, Any]:
    return {
        "type": slide_type,
        "title": title,
        "subtitle": subtitle,
        "bullets": list(bullets or []),
        "example": example,
        "analogy": analogy,
        "note": None,
        "citations": [],
        "visual": visual,
    }
