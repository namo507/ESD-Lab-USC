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


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = PROJECT_ROOT / "dashboard" / "data"
DEFAULT_LLM_CONFIG_PATH = PROJECT_ROOT / "config" / "llm_model.json"
DEFAULT_MODEL_ID = "bartowski/Qwen2.5-1.5B-Instruct-GGUF"
DEFAULT_MODEL_DIR = PROJECT_ROOT / "models" / "local_llms" / "Qwen2.5-1.5B-Instruct-GGUF"
DEFAULT_MODEL_FILE = "Qwen2.5-1.5B-Instruct-Q3_K_S.gguf"
DEFAULT_CONTEXT_WINDOW = 1536
DEFAULT_BATCH_SIZE = 128
DEFAULT_MAX_NEW_TOKENS = 128
DEFAULT_THREAD_COUNT = max(1, min(os.cpu_count() or 4, 4))
CONTEXT_WINDOW_TOKEN_RESERVE = 320
APPROX_CONTEXT_CHARS_PER_TOKEN = 2
SUMMARY_KEYS = (
    "meta",
    "enrollment",
    "visit_completion",
    "data_quality",
    "ml_performance",
    "redcap_audit",
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
        "xgboost",
        "random",
        "forest",
        "confusion",
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
    if not DEFAULT_LLM_CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(DEFAULT_LLM_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


class AssistantUnavailable(RuntimeError):
    """Raised when the assistant is configured but cannot answer yet."""

    def __init__(self, message: str, status: dict[str, Any], http_status: int = 503):
        super().__init__(message)
        self.status = status
        self.http_status = http_status


@dataclass(slots=True)
class AssistantConfig:
    enabled: bool = True
    model_id: str = DEFAULT_MODEL_ID
    model_dir: Path = DEFAULT_MODEL_DIR
    model_file: str = DEFAULT_MODEL_FILE
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
        llm_config = _read_llm_model_config()
        config_model_dir = PROJECT_ROOT / "models" if llm_config else DEFAULT_MODEL_DIR
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
                or llm_config.get("filename")
                or DEFAULT_MODEL_FILE
            ),
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
                default=0.05,
            ),
            top_p=_parse_float(os.getenv("DASHBOARD_ASSISTANT_TOP_P"), default=0.9),
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
                default=DEFAULT_BATCH_SIZE,
            ),
            thread_count=_parse_int(
                os.getenv("DASHBOARD_ASSISTANT_THREADS")
                or os.getenv("LLM_N_THREADS"),
                default=DEFAULT_THREAD_COUNT,
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
        elif available_memory_gib and available_memory_gib < self.config.min_available_memory_gib:
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

    def answer(self, message: str, history: list[dict[str, str]] | None = None) -> dict[str, Any]:
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
            raise AssistantUnavailable(self._last_error, self.get_status(), http_status=503) from exc

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
            raise AssistantUnavailable(self._last_error, self.get_status(), http_status=503) from exc

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
        raw_text = self._complete_text(generator, messages, max_tokens=max_tokens, json_mode=True)
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
                raise AssistantUnavailable(self._last_error, self.get_status(), http_status=503) from exc
        except Exception as exc:  # pragma: no cover - depends on runtime model stack
            self._last_error = f"Assistant generation failed: {exc}"
            raise AssistantUnavailable(self._last_error, self.get_status(), http_status=503) from exc

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
        reading_fragments, reading_fragment_index = _build_reading_catalog_fragments(readings)

        if focus_sections == {"readings"}:
            reading_ranked = sorted(
                reading_fragments,
                key=lambda item: _score_reading_match(question_tokens, reading_fragment_index.get(item[0], {})),
                reverse=True,
            )
            reading_matches = [
                reading_fragment_index[path]
                for path, _ in reading_ranked
                if _score_reading_match(question_tokens, reading_fragment_index.get(path, {})) > 0
            ][:3]

            context_parts = [
                f"- {text}"
                for path, text in summary_fragments
                if path in {"meta.study.name", "meta.data_source", "readings.summary.total_readings"}
            ]
            citations = [
                path
                for path, _ in summary_fragments
                if path in {"meta.study.name", "meta.data_source", "readings.summary.total_readings"}
            ]
            for item in reading_matches:
                context_parts.append(f"- {_reading_match_context_text(item)}")
                citations.append(f"readings.catalog[{item['id']}]")

            top_score = 0.0
            if reading_ranked:
                top_score = _score_reading_match(question_tokens, reading_fragment_index.get(reading_ranked[0][0], {}))

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
                fragments.extend(_flatten_context(value, prefix=key))

        if readings:
            fragments.extend(_flatten_context(readings.get("summary", {}), prefix="readings.summary"))
            fragments.extend(reading_fragments)

        ranked = sorted(
            (
                item
                for item in fragments
                if _should_include_fragment(item[0], focus_sections)
            ),
            key=lambda item: _score_fragment(question_tokens, item[0], item[1], focus_sections),
            reverse=True,
        )

        top_score = 0.0
        if ranked:
            top_score = _score_fragment(question_tokens, ranked[0][0], ranked[0][1], focus_sections)

        core_summary_paths = {"meta.study.name", "meta.data_source"}
        context_parts: list[str] = []
        citations: list[str] = []
        used_paths: set[str] = set()
        target_citation_count = max(1, len(focus_sections)) if focus_sections else 4

        ranked_summary = sorted(
            summary_fragments,
            key=lambda item: _score_fragment(question_tokens, item[0], item[1], focus_sections),
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

        remaining = max(self._effective_context_char_budget() - len("\n".join(context_parts)), 0)
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

        grounded_threshold = FOCUSED_CONFIDENCE_SCORE_THRESHOLD if focus_sections else LOW_CONFIDENCE_SCORE_THRESHOLD
        grounded = bool(ranked) and top_score >= grounded_threshold
        if reading_matches and focus_sections == {"readings"}:
            grounded = True

        return {
            "context": "\n".join(part for part in context_parts if part),
            "citations": citations[:6],
            "grounded": grounded,
            "focus_sections": sorted(focus_sections),
            "reading_matches": reading_matches,
            "reading_metadata_only": bool(reading_matches) and focus_sections == {"readings"},
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
                self._last_error = f"Assistant dependencies could not be imported: {exc}"
                raise AssistantUnavailable(self._last_error, self.get_status(), http_status=503) from exc

            model_path = self._resolve_model_path()
            if model_path is None:
                self._last_error = "Assistant model file is missing. Download the configured GGUF asset first."
                raise AssistantUnavailable(self._last_error, self.get_status(), http_status=503)

            try:
                self._generator = Llama(
                    model_path=str(model_path),
                    n_ctx=max(512, self.config.context_window),
                    n_batch=max(32, min(self.config.batch_size, self.config.context_window)),
                    n_threads=max(1, min(self.config.thread_count, os.cpu_count() or 1)),
                    verbose=False,
                )
                self._last_error = None
            except Exception as exc:  # pragma: no cover - depends on local GGUF stack
                self._last_error = f"Assistant model failed to initialize: {exc}"
                raise AssistantUnavailable(self._last_error, self.get_status(), http_status=503) from exc

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
        return "\n".join(f"- {text}" for _, text in self._build_summary_fragments(payload, readings))

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
        readings_summary = readings.get("summary", {})
        fragments: list[tuple[str, str]] = []

        fragments.append(("meta.study.name", f"Study: {study.get('name', 'NANO Study')}"))
        fragments.append(("meta.data_source", f"Data source: {meta.get('data_source', 'unknown')}"))

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
        fragments.append((open_query_path, f"Open REDCap queries: {open_queries if open_queries is not None else 'unknown'}"))

        fragments.append(
            (
                "readings.summary.total_readings",
                f"Indexed readings: {readings_summary.get('total_readings', 0)}",
            )
        )

        if by_group:
            group_summary = ", ".join(
                f"{group}: {stats.get('current', 'unknown')}/{stats.get('target', 'unknown')}"
                for group, stats in by_group.items()
            )
            fragments.append(("enrollment.by_group", f"Enrollment by group: {group_summary}"))

        best_index, best = _find_best_model_card(payload.get("ml_performance", {}).get("models") or [])
        if best is not None:
            best_name = best.get("model_name") or best.get("name") or "best model"
            best_auc = best.get("auroc") or best.get("roc_auc")
            fragments.append((f"ml_performance.models[{best_index}]", f"Best model: {best_name} ({best_auc})"))

        return fragments

    def _build_fact_map(self, payload: dict[str, Any], readings: dict[str, Any]) -> dict[str, Any]:
        enrollment = payload.get("enrollment", {})
        overall = enrollment.get("overall", {})
        by_group = enrollment.get("by_group", {})
        readings_summary = readings.get("summary", {})
        best_index, best_model = _find_best_model_card(payload.get("ml_performance", {}).get("models") or [])

        enrollment_total_current = overall.get("current")
        enrollment_total_target = overall.get("target") or payload.get("meta", {}).get("study", {}).get("n_target")

        if enrollment_total_current is None and by_group:
            current_values = [stats.get("current") for stats in by_group.values() if isinstance(stats, dict)]
            if current_values and all(isinstance(value, (int, float)) for value in current_values):
                enrollment_total_current = int(sum(current_values))

        if enrollment_total_target is None and by_group:
            target_values = [stats.get("target") for stats in by_group.values() if isinstance(stats, dict)]
            if target_values and all(isinstance(value, (int, float)) for value in target_values):
                enrollment_total_target = int(sum(target_values))

        return {
            "indexed_readings": readings_summary.get("total_readings"),
            "enrollment_total_current": enrollment_total_current,
            "enrollment_total_target": enrollment_total_target,
            "enrollment_by_group": by_group,
            "best_model": {
                "index": best_index,
                "name": (best_model or {}).get("model_name") or (best_model or {}).get("name"),
                "auroc": (best_model or {}).get("auroc") or (best_model or {}).get("roc_auc"),
            } if best_model else None,
        }

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
            self.config.context_window - self.config.max_new_tokens - CONTEXT_WINDOW_TOKEN_RESERVE,
            256,
        )
        derived_budget = available_prompt_tokens * APPROX_CONTEXT_CHARS_PER_TOKEN
        return max(1200, min(self.config.context_char_budget, derived_budget))

    def _response_token_limit(self, question: str) -> int:
        question_tokens = set(_tokenize(question))
        if question_tokens & DETAIL_REQUEST_TOKENS:
            return max(64, min(self.config.max_new_tokens, DETAILED_RESPONSE_TOKEN_LIMIT))
        return max(48, min(self.config.max_new_tokens, CONCISE_RESPONSE_TOKEN_LIMIT))

    def _maybe_short_circuit_response(self, question: str, context: dict[str, Any]) -> str | None:
        question_tokens = set(_tokenize(question))
        reading_matches = context.get("reading_matches") or []
        facts = context.get("facts") or {}

        if question_tokens & {"reading", "readings"} and question_tokens & {"count", "how", "many", "number", "indexed"}:
            indexed_readings = facts.get("indexed_readings")
            if isinstance(indexed_readings, (int, float)):
                return f"There are {int(indexed_readings)} indexed readings in the dashboard library."

        if question_tokens & {"enrollment", "enrolled"} and question_tokens & {"group", "groups", "cohort", "cohorts"}:
            shortcut = self._format_enrollment_by_group_response(facts.get("enrollment_by_group") or {})
            if shortcut is not None:
                return shortcut

        if question_tokens & {"enrollment", "enrolled"} and question_tokens & {"current", "participants", "participant", "total", "overall"}:
            current = facts.get("enrollment_total_current")
            target = facts.get("enrollment_total_target")
            if isinstance(current, (int, float)) and isinstance(target, (int, float)):
                return f"Current enrollment is {int(current)} of {int(target)} participants."

        if context.get("reading_metadata_only") and question_tokens & READING_SUMMARY_REQUEST_TOKENS:
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
            display_name = item.get("display_name") or item.get("relative_path") or "file unavailable"
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

    def _format_enrollment_by_group_response(self, by_group: dict[str, Any]) -> str | None:
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
    meminfo_path = Path("/proc/meminfo")
    if meminfo_path.exists():
        for line in meminfo_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("MemAvailable:"):
                parts = line.split()
                if len(parts) >= 2:
                    return int(parts[1]) / 1024 / 1024

    try:
        page_size = os.sysconf("SC_PAGE_SIZE")
        available_pages = os.sysconf("SC_AVPHYS_PAGES")
        return (page_size * available_pages) / 1024 / 1024 / 1024
    except (ValueError, OSError, AttributeError):
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
        elif top_section in {"enrollment", "ml_performance", "redcap_audit", "data_quality", "visit_completion", "readings"}:
            section_bonus = 2.0

    return section_bonus + (path_overlap * 4.0) + (overlap * 2.0) - (len(path) / 200.0) - (min(len(text), 240) / 500.0)


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


def _find_best_model_card(model_cards: list[dict[str, Any]]) -> tuple[int, dict[str, Any] | None]:
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
            reading_id = str(item.get("id") or item.get("display_name") or item.get("title") or "reading")
            if reading_id in seen_ids:
                continue
            seen_ids.add(reading_id)

            title = (item.get("title") or item.get("display_name") or reading_id).strip()
            display_name = item.get("display_name") or item.get("relative_path") or reading_id
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
    if question_tokens & {"research", "strategy", "grant", "analytic", "analysis", "design", "measure", "measures"}:
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
        if all(isinstance(item, (str, int, float, bool)) or item is None for item in value[:8]):
            if all(isinstance(item, (int, float)) or item is None for item in value[:8]) and len(value) > 4:
                return fragments
            fragments.append((prefix, ", ".join(_format_scalar_value(item) for item in value[:8] if item is not None)))
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
    title = _clean_text(raw.get("title") or raw.get("heading") or raw.get("name"), max_len=120)
    bullets = _coerce_bullets(
        raw.get("bullets") or raw.get("points") or raw.get("content") or raw.get("body")
    )
    if not title and not bullets:
        return None

    return {
        "type": slide_type,
        "title": title or "Untitled slide",
        "subtitle": _clean_text(raw.get("subtitle") or raw.get("subhead"), max_len=160) or None,
        "bullets": bullets,
        "example": _clean_text(raw.get("example") or raw.get("worked_example"), max_len=300) or None,
        "analogy": _clean_text(raw.get("analogy") or raw.get("metaphor"), max_len=300) or None,
        "note": _clean_text(
            raw.get("note") or raw.get("speaker_note") or raw.get("notes"), max_len=300
        ) or None,
        "citations": _coerce_citations(
            raw.get("citations") or raw.get("references") or raw.get("grounding")
        ),
        "visual": _clean_text(
            raw.get("visual") or raw.get("visual_direction") or raw.get("visual_cue"), max_len=160
        ) or None,
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
        slide_count = int(raw.get("slide_count") or raw.get("slides") or PRESENTATION_DEFAULT_SLIDE_COUNT)
    except (TypeError, ValueError):
        slide_count = PRESENTATION_DEFAULT_SLIDE_COUNT
    slide_count = max(PRESENTATION_MIN_SLIDES, min(PRESENTATION_MAX_SLIDES, slide_count))

    tone = _clean_text(raw.get("tone"), max_len=80) or PRESENTATION_DEFAULT_TONE

    return {
        "audience_level": audience,
        "slide_count": slide_count,
        "include_analogy": _as_bool(
            raw.get("include_analogy", raw.get("analogy")), default=True
        ),
        "include_worked_example": _as_bool(
            raw.get("include_worked_example", raw.get("worked_example", raw.get("example"))),
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
        "slide's \"citations\" array." + citation_hint
        if grounded
        else "The concept is general and is NOT grounded in local study data. Do not invent "
        "lab citations, study numbers, or NANO-specific facts. Leave \"citations\" arrays empty "
        "and set \"disclaimer\" to a short note that this is a general explanation."
    )

    schema = (
        '{\n'
        '  "title": string,\n'
        '  "subtitle": string,\n'
        '  "audience_level": "beginner" | "intermediate" | "advanced",\n'
        '  "summary": string,            // one sentence\n'
        '  "disclaimer": string | null,\n'
        '  "slides": [\n'
        '    {\n'
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
        '    }\n'
        '  ]\n'
        '}'
    )

    system = (
        "You are a presentation planner embedded in the ESD Lab dashboard. "
        "You turn a single concept into a minimal, calm, easy-to-understand slide deck. "
        f"Write in a {options['tone']} tone for a {options['audience_level']} audience. "
        "Return ONE valid JSON object and NOTHING else: no prose, no markdown, no code fences. "
        "Deck structure, in order: exactly one title slide, then one short why-this-matters slide, "
        "then two to four concept slides, "
        + ("then one analogy slide, " if options["include_analogy"] else "")
        + ("then one worked-example slide, " if options["include_worked_example"] else "")
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
    subtitle = _clean_text(
        raw.get("subtitle") or raw.get("deck_subtitle"), max_len=160
    ) or f"A simple, {options['audience_level']}-friendly explainer"
    summary = _clean_text(
        raw.get("summary") or raw.get("one_sentence_summary") or raw.get("overview"),
        max_len=240,
    ) or f"A clear, {options['audience_level']} introduction to {concept_title}."

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
            "title", title, subtitle=subtitle,
            visual="clean title with a thin garnet divider",
        )
    if not concept_slides:
        concept_slides = [
            _scaffold_slide(
                "concept", f"What {concept_title} means", bullets=[summary],
            )
        ]
    if why_slide is None:
        why_slide = _scaffold_slide(
            "why", "Why this matters",
            bullets=[
                f"{concept_title} shows up in everyday situations",
                "A simple mental model makes it easier to use",
                "Getting the basics first prevents confusion later",
            ],
        )
    if options["include_analogy"] and analogy_slide is None:
        analogy_slide = _scaffold_slide(
            "analogy", "A helpful analogy",
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
            "example", "A worked example",
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
            "recap", "Recap",
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
        bullets = [] if slide["type"] == "title" else slide["bullets"][:PRESENTATION_MAX_BULLETS]
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