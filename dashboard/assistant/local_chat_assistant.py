"""Local GGUF-backed dashboard assistant.

The assistant integrates with the live dashboard without affecting the rest of
the runtime. Model loading is lazy and optional, and the default local model is
small enough to run inside this dev container.
"""

from __future__ import annotations

import json
import os
import re
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dashboard.assistant.model_catalog import (
    available_memory_gib as _catalog_available_memory_gib,
    find_existing_model_path as _catalog_find_existing_model_path,
    model_dir_for as _catalog_model_dir_for,
    read_llm_config as _catalog_read_llm_config,
    select_runtime_model_config,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = PROJECT_ROOT / "dashboard" / "data"
DEFAULT_LLM_CONFIG_PATH = PROJECT_ROOT / "config" / "llm_model.json"
DEFAULT_MODEL_ID = "bartowski/SmolLM2-1.7B-Instruct-GGUF"
DEFAULT_MODEL_DIR = (
    PROJECT_ROOT / "models" / "local_llms" / "SmolLM2-1.7B-Instruct-GGUF"
)
DEFAULT_MODEL_FILE = "SmolLM2-1.7B-Instruct-Q4_K_M.gguf"
DEFAULT_CONTEXT_WINDOW = 4096
DEFAULT_BATCH_SIZE = 256
DEFAULT_MAX_NEW_TOKENS = 320
DEFAULT_THREAD_COUNT = max(1, min(os.cpu_count() or 4, 4))
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
    "redcap_ops",
    "matlab_integration",
    "cohort_table",
    "organization_site",
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
        "redcap",
        "audit",
        "active",
        "withdrawn",
        "review",
    },
    "redcap_visit_health": {
        "redcap",
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
        "redcap",
        "freshness",
        "fresh",
        "synced",
        "sync",
        "source",
        "records",
        "anomalies",
    },
    "redcap_completion_stats": {
        "redcap",
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
        "redcap",
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
        "redcap",
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
        "redcap",
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
    "participant_operations": {
        "participant",
        "participants",
        "role",
        "roles",
        "id",
        "legend",
        "dual",
        "enrollment",
        "nino",
        "nico",
        "anonico",
        "nano",
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
        "redcap",
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
CONCISE_RESPONSE_TOKEN_LIMIT = 96
DETAILED_RESPONSE_TOKEN_LIMIT = 144
LOW_CONFIDENCE_SCORE_THRESHOLD = 3.0
FOCUSED_CONFIDENCE_SCORE_THRESHOLD = 5.0

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


def _read_llm_model_config() -> dict[str, Any]:
    return _catalog_read_llm_config(DEFAULT_LLM_CONFIG_PATH)


def _find_existing_model_path(filename: str) -> Path | None:
    if not filename:
        return None
    return _catalog_find_existing_model_path({"filename": filename}, PROJECT_ROOT)


def _select_llm_model_config(llm_config: dict[str, Any]) -> dict[str, Any]:
    if not llm_config:
        return {}
    return select_runtime_model_config(
        llm_config,
        requested_tier=os.getenv("DASHBOARD_ASSISTANT_TIER"),
        project_root=PROJECT_ROOT,
    )


class AssistantUnavailable(RuntimeError):
    """Raised when the assistant is configured but cannot answer yet."""

    def __init__(self, message: str, status: dict[str, Any], http_status: int = 503):
        super().__init__(message)
        self.status = status
        self.http_status = http_status


@dataclass
class AssistantConfig:
    enabled: bool = True
    model_id: str = DEFAULT_MODEL_ID
    model_dir: Path = DEFAULT_MODEL_DIR
    model_file: str = DEFAULT_MODEL_FILE
    model_tier: str = "balanced"
    model_label: str = "SmolLM2 1.7B Q4"
    model_license: str = "Apache-2.0"
    auto_download: bool = False
    device_preference: str = "cpu"
    max_new_tokens: int = DEFAULT_MAX_NEW_TOKENS
    temperature: float = 0.05
    top_p: float = 0.9
    context_char_budget: int = 6000
    min_available_memory_gib: float = 1.2
    history_turns: int = 6
    context_window: int = DEFAULT_CONTEXT_WINDOW
    batch_size: int = DEFAULT_BATCH_SIZE
    thread_count: int = DEFAULT_THREAD_COUNT
    # Presentation-planner specific knobs (tunable without touching chat).
    presentation_max_new_tokens: int = PRESENTATION_MAX_NEW_TOKENS
    presentation_context_char_cap: int = PRESENTATION_CONTEXT_CHAR_CAP
    presentation_json_mode: bool = True

    @classmethod
    def from_env(cls) -> "AssistantConfig":
        llm_config = _select_llm_model_config(_read_llm_model_config())
        resolved_model_path = (
            Path(str(llm_config.get("resolved_path")))
            if llm_config.get("resolved_path")
            else None
        )
        config_model_dir = (
            resolved_model_path.parent
            if resolved_model_path is not None
            else (
                _catalog_model_dir_for(llm_config, PROJECT_ROOT)
                if llm_config
                else DEFAULT_MODEL_DIR
            )
        )
        return cls(
            enabled=_parse_bool(os.getenv("DASHBOARD_ASSISTANT_ENABLED"), default=True),
            model_id=(
                os.getenv("DASHBOARD_ASSISTANT_MODEL_ID")
                or llm_config.get("repo_id")
                or DEFAULT_MODEL_ID
            ),
            model_dir=Path(
                os.getenv("DASHBOARD_ASSISTANT_MODEL_DIR")
                or os.getenv("LLM_MODEL_DIR")
                or str(config_model_dir)
            ),
            model_file=(
                os.getenv("DASHBOARD_ASSISTANT_MODEL_FILE")
                or (
                    resolved_model_path.name
                    if resolved_model_path is not None
                    else None
                )
                or llm_config.get("filename")
                or DEFAULT_MODEL_FILE
            ),
            model_tier=str(
                os.getenv("DASHBOARD_ASSISTANT_TIER")
                or llm_config.get("tier")
                or "balanced"
            ),
            model_label=str(llm_config.get("label") or "local GGUF"),
            model_license=str(llm_config.get("license") or ""),
            auto_download=_parse_bool(
                os.getenv("DASHBOARD_ASSISTANT_AUTO_DOWNLOAD"),
                default=False,
            ),
            device_preference=os.getenv("DASHBOARD_ASSISTANT_DEVICE", "cpu"),
            max_new_tokens=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_MAX_NEW_TOKENS")
                or os.getenv("LLM_MAX_TOKENS"),
                default=int(llm_config.get("max_tokens") or DEFAULT_MAX_NEW_TOKENS),
            ),
            temperature=_parse_float(
                os.getenv("DASHBOARD_ASSISTANT_TEMPERATURE")
                or os.getenv("LLM_TEMPERATURE"),
                default=float(llm_config.get("temperature") or 0.05),
            ),
            top_p=_parse_float(
                os.getenv("DASHBOARD_ASSISTANT_TOP_P"),
                default=float(llm_config.get("top_p") or 0.9),
            ),
            context_char_budget=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_CONTEXT_BUDGET"),
                default=6000,
            ),
            min_available_memory_gib=_parse_float(
                os.getenv("DASHBOARD_ASSISTANT_MIN_MEMORY_GIB"),
                default=float(llm_config.get("min_memory_gib") or 1.2),
            ),
            history_turns=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_HISTORY_TURNS"),
                default=6,
            ),
            context_window=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_CONTEXT_WINDOW")
                or os.getenv("LLM_N_CTX"),
                default=int(llm_config.get("context_length") or DEFAULT_CONTEXT_WINDOW),
            ),
            batch_size=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_BATCH_SIZE"),
                default=int(llm_config.get("batch_size") or DEFAULT_BATCH_SIZE),
            ),
            thread_count=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_THREADS") or os.getenv("LLM_N_THREADS"),
                default=int(llm_config.get("thread_count") or DEFAULT_THREAD_COUNT),
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


class DashboardChatAssistant:
    """Chat assistant that uses a local GGUF checkpoint when available."""

    def __init__(
        self,
        *,
        config: AssistantConfig | None = None,
        data_dir: Path = DEFAULT_DATA_DIR,
    ) -> None:
        self.data_dir = data_dir
        self._lock = threading.Lock()
        self._generator = None
        self._last_error: str | None = None
        self._json_cache: dict[Path, tuple[int, Any]] = {}

        self._maybe_load_dotenv()
        self.config = config or AssistantConfig.from_env()

    def get_status(self) -> dict[str, Any]:
        deps = self._probe_dependencies()
        available_memory_gib = _available_memory_gib()
        memory_gib = round(available_memory_gib, 2)
        model_path = self._resolve_model_path()
        model_ready = model_path is not None

        state = "ready"
        message = "Assistant is ready to answer dashboard questions."
        can_chat = True

        if not self.config.enabled:
            state = "disabled"
            message = "Assistant is disabled by configuration."
            can_chat = False
        elif not deps["available"]:
            state = "dependencies-missing"
            message = (
                "Assistant dependencies are missing. Install the assistant setup "
                "requirements on the target machine before enabling chat."
            )
            can_chat = False
        elif (
            available_memory_gib
            and available_memory_gib < self.config.min_available_memory_gib
        ):
            state = "memory-insufficient"
            message = (
                "The current machine does not have enough free memory for the "
                f"configured model. At least {self.config.min_available_memory_gib:.1f} GiB "
                "free memory is recommended."
            )
            can_chat = False
        elif not model_ready:
            state = "model-missing"
            message = (
                "The local GGUF model file is not present yet. Run the assistant "
                f"preparation script to download {self.config.model_file}."
            )
            can_chat = False
        elif self._last_error:
            state = "degraded"
            message = self._last_error
            can_chat = False

        return {
            "enabled": self.config.enabled,
            "state": state,
            "ready": can_chat,
            "message": message,
            "runtime": "llama-cpp-python",
            "model_id": self.config.model_id,
            "model_tier": self.config.model_tier,
            "model_label": self.config.model_label,
            "model_license": self.config.model_license,
            "model_dir": str(self.config.model_dir),
            "model_file": self.config.model_file,
            "model_path": str(model_path) if model_path else None,
            "auto_download": self.config.auto_download,
            "device_preference": self.config.device_preference,
            "dependencies": deps,
            "available_memory_gib": memory_gib,
            "recommended_memory_gib": self.config.min_available_memory_gib,
            "generator_loaded": self._generator is not None,
            "last_error": self._last_error,
            "freshness": self._assistant_freshness_status(),
        }

    def _prepare_request(
        self,
        message: str,
        history: list[dict[str, str]] | None = None,
    ) -> tuple[dict[str, Any], list[dict[str, str]]]:
        prompt = (message or "").strip()
        if not prompt:
            raise AssistantUnavailable(
                "Please ask a question before submitting.",
                self.get_status(),
                http_status=400,
            )

        status = self.get_status()
        if not status["ready"]:
            raise AssistantUnavailable(status["message"], status, http_status=503)

        context = self.build_context(prompt)
        messages = self._build_messages(
            question=prompt,
            history=history or [],
            context_block=context["context"],
        )
        return context, messages

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

        generator = self._ensure_generator()

        try:
            output = generator.create_chat_completion(
                messages=messages,
                max_tokens=self._response_token_limit(message),
                temperature=self.config.temperature,
                top_p=self.config.top_p,
            )
        except Exception as exc:  # pragma: no cover - depends on runtime model stack
            self._last_error = f"Assistant generation failed: {exc}"
            raise AssistantUnavailable(
                self._last_error, self.get_status(), http_status=503
            ) from exc

        reply = ""
        choices = (output or {}).get("choices") or []
        if choices:
            message_payload = choices[0].get("message") or {}
            reply = (message_payload.get("content") or "").strip()

        if not reply:
            reply = (
                "I do not have enough grounded dashboard context to answer that yet. "
                "Try asking about enrollment, data quality, model performance, or readings."
            )

        return {
            "reply": reply,
            "citations": context["citations"],
            "status": self.get_status(),
        }

    def stream(self, message: str, history: list[dict[str, str]] | None = None):
        context, messages = self._prepare_request(message, history)
        quick_reply = self._maybe_short_circuit_response(message, context)
        if quick_reply is not None:
            yield quick_reply
            return

        generator = self._ensure_generator()

        try:
            chunks = generator.create_chat_completion(
                messages=messages,
                max_tokens=self._response_token_limit(message),
                temperature=self.config.temperature,
                top_p=self.config.top_p,
                stream=True,
            )
            for chunk in chunks:
                choices = (chunk or {}).get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                content = delta.get("content") or ""
                if content:
                    yield str(content)
        except Exception as exc:  # pragma: no cover - depends on runtime model stack
            self._last_error = f"Assistant generation failed: {exc}"
            raise AssistantUnavailable(
                self._last_error, self.get_status(), http_status=503
            ) from exc

    def plan_presentation(
        self,
        concept: str,
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Generate a strict, structured slide-deck plan for ``concept``.

        Reuses the same local generator, readiness checks, and grounding
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
        if not status["ready"]:
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

        generator = self._ensure_generator()
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
        """Run a non-streaming completion and return the assistant text.

        When ``json_mode`` is requested and enabled in config, the call uses
        llama-cpp-python's ``response_format={"type": "json_object"}`` grammar
        constraint so the model is forced to emit syntactically valid JSON. If
        the installed runtime predates that kwarg, we transparently fall back to
        a plain completion (the extract-and-repair path still applies).
        """
        kwargs: dict[str, Any] = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": self.config.temperature,
            "top_p": self.config.top_p,
        }
        use_json = json_mode and self.config.presentation_json_mode
        if use_json:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            output = generator.create_chat_completion(**kwargs)
        except TypeError:
            # Older llama-cpp-python without response_format support.
            kwargs.pop("response_format", None)
            try:
                output = generator.create_chat_completion(**kwargs)
            except Exception as exc:  # pragma: no cover - runtime model stack
                self._last_error = f"Assistant generation failed: {exc}"
                raise AssistantUnavailable(
                    self._last_error, self.get_status(), http_status=503
                ) from exc
        except Exception as exc:  # pragma: no cover - depends on runtime model stack
            self._last_error = f"Assistant generation failed: {exc}"
            raise AssistantUnavailable(
                self._last_error, self.get_status(), http_status=503
            ) from exc

        choices = (output or {}).get("choices") or []
        if not choices:
            return ""
        message_payload = choices[0].get("message") or {}
        return (message_payload.get("content") or "").strip()

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
        target_citation_count = max(1, len(focus_sections)) if focus_sections else 4

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

        for path, text in ranked:
            if not text or path in used_paths or path in summary_paths:
                continue
            if path in reading_fragment_index and len(reading_matches) < 3:
                reading_matches.append(reading_fragment_index[path])
            line = f"- {text}"
            if len(line) > remaining:
                continue
            context_parts.append(line)
            used_paths.add(path)
            if len(citations) < target_citation_count and path not in citations:
                citations.append(path)
            remaining -= len(line) + 1
            if len(citations) >= 8:
                break

        grounded_threshold = (
            FOCUSED_CONFIDENCE_SCORE_THRESHOLD
            if focus_sections
            else LOW_CONFIDENCE_SCORE_THRESHOLD
        )
        grounded = bool(ranked) and top_score >= grounded_threshold
        if reading_matches and focus_sections == {"readings"}:
            grounded = True

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

    def _ensure_generator(self):
        if self._generator is not None:
            return self._generator

        with self._lock:
            if self._generator is not None:
                return self._generator

            status = self.get_status()
            if not status["ready"]:
                raise AssistantUnavailable(status["message"], status, http_status=503)

            try:
                from llama_cpp import Llama
            except Exception as exc:  # pragma: no cover - optional runtime path
                self._last_error = (
                    f"Assistant dependencies could not be imported: {exc}"
                )
                raise AssistantUnavailable(
                    self._last_error, self.get_status(), http_status=503
                ) from exc

            model_path = self._resolve_model_path()
            if model_path is None:
                self._last_error = "Assistant model file is missing. Download the configured GGUF asset first."
                raise AssistantUnavailable(
                    self._last_error, self.get_status(), http_status=503
                )

            try:
                self._generator = Llama(
                    model_path=str(model_path),
                    n_ctx=max(512, self.config.context_window),
                    n_batch=max(
                        32, min(self.config.batch_size, self.config.context_window)
                    ),
                    n_threads=max(
                        1, min(self.config.thread_count, os.cpu_count() or 1)
                    ),
                    verbose=False,
                )
                self._last_error = None
            except Exception as exc:  # pragma: no cover - depends on local GGUF stack
                self._last_error = f"Assistant model failed to initialize: {exc}"
                raise AssistantUnavailable(
                    self._last_error, self.get_status(), http_status=503
                ) from exc

        return self._generator

    def _build_messages(
        self,
        *,
        question: str,
        history: list[dict[str, str]],
        context_block: str,
    ) -> list[dict[str, str]]:
        recent_history = history[-self.config.history_turns :]
        messages = [
            {
                "role": "system",
                "content": (
                    "You are the NANO Study dashboard assistant embedded in the ESD Lab live dashboard. "
                    "Answer only from the provided dashboard context and do not invent facts. "
                    "Be concise by default: answer in 2-4 sentences or short bullets unless the user explicitly asks for more detail. "
                    "Repeat exact counts, group labels, model names, and AUROC values verbatim when they appear in context. "
                    "Do not add qualitative judgments, speculation, or interpretations that are not explicitly stated. "
                    "If a list is requested, include every listed item from context and nothing else. "
                    "For library or reading questions, the dashboard context may contain only indexed metadata and short excerpts, not full document text. "
                    "In that case, limit your answer to the title, file name, source, authors, page count, excerpt, or keywords that appear in context and explicitly say full-text details are not indexed here. "
                    "If the answer is not grounded in the supplied context, say that you cannot verify it from the dashboard data provided. "
                    "Do not include protected health information or speculate about participants.\n\n"
                    "Local assistant runtime policy: the configured no-API model tier is "
                    f"{self.config.model_tier}; the active model label is {self.config.model_label}; "
                    f"the model license is {self.config.model_license or 'unspecified'}. "
                    "If asked about model choice, explain that the dashboard uses the configured local GGUF model when present and has smaller local fallbacks for constrained hosts.\n\n"
                    "You also know about the REDCap Visit Health Monitor, which tracks CSBS caregiver questionnaire completion across 6m, 9m, 12m, and 24m timepoints and detects R1-R5 carry-forward anomalies from visit_date and CSBS completion states. "
                    "Tier-3 REDCap writeback is disabled by default and, when enabled, must use the audited server-side allowlist with an operator token and explicit confirmation; the browser never holds a REDCap token.\n\n"
                    f"Dashboard context:\n{context_block}"
                ),
            }
        ]

        for item in recent_history:
            role = (item.get("role") or "user").strip().lower()
            content = (item.get("content") or "").strip()
            if role not in {"user", "assistant"} or not content:
                continue
            messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": question})
        return messages

    def _resolve_model_path(self) -> Path | None:
        model_dir = self.config.model_dir
        if model_dir.is_file():
            return model_dir

        if self.config.model_file:
            explicit_path = model_dir / self.config.model_file
            if explicit_path.exists():
                return explicit_path
            return None

        candidates = sorted(model_dir.glob("*.gguf")) if model_dir.exists() else []
        return candidates[0] if candidates else None

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
        participant_operations = payload.get("participant_operations") or {}
        participant_operations_summary = (
            participant_operations.get("summary")
            if isinstance(participant_operations, dict)
            else {}
        ) or {}
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
        redcap_visit_records = (
            redcap_visit_health.get("data")
            if isinstance(redcap_visit_health, dict)
            else []
        )
        best_index, best_model = _find_best_model_card(
            payload.get("ml_performance", {}).get("models") or []
        )
        shap = payload.get("ml_performance", {}).get("shap") or []

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
            "hda_groups": (
                sorted(str(group) for group in hda_by_group.keys())
                if isinstance(hda_by_group, dict)
                else []
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

    def _readings_freshness_status(self) -> dict[str, Any]:
        try:
            from k8s.pipeline import PipelineConfig
            from k8s.pipeline import readings_freshness_payload

            config = PipelineConfig.from_env()
            return readings_freshness_payload(config)
        except Exception:
            return {}

    def _cluster_pipeline_status(self) -> dict[str, Any]:
        try:
            from k8s.pipeline import PipelineConfig
            from k8s.pipeline import pipeline_status_payload

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
            from k8s.pipeline import PipelineConfig
            from k8s.pipeline import assistant_freshness_payload

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
        for module_name in ("llama_cpp",):
            try:
                __import__(module_name)
            except Exception:
                missing.append(module_name)
        return {"available": not missing, "missing": missing}

    def _maybe_load_dotenv(self) -> None:
        try:
            from dotenv import load_dotenv
        except Exception:
            return

        env_path = PROJECT_ROOT / ".env"
        if env_path.exists():
            load_dotenv(env_path, override=False)

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

        if question_tokens & {"redcap", "nda", "completeness", "missingness"}:
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
    return _catalog_available_memory_gib()


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
