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
    ) -> tuple[dict[str, Any], list[dict[str, str]], Any]:
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
        generator = self._ensure_generator()
        return context, messages, generator

    def answer(self, message: str, history: list[dict[str, str]] | None = None) -> dict[str, Any]:
        context, messages, generator = self._prepare_request(message, history)

        try:
            output = generator.create_chat_completion(
                messages=messages,
                max_tokens=self.config.max_new_tokens,
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
        _context, messages, generator = self._prepare_request(message, history)

        try:
            chunks = generator.create_chat_completion(
                messages=messages,
                max_tokens=self.config.max_new_tokens,
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

    def build_context(self, question: str) -> dict[str, Any]:
        payload = self._load_dashboard_payload()
        readings = self._load_readings_payload()
        question_tokens = set(_tokenize(question))
        focus_sections = _detect_focus_sections(question_tokens)
        summary_fragments = self._build_summary_fragments(payload, readings)
        summary_paths = {path for path, _ in summary_fragments}

        fragments = []
        for key in SUMMARY_KEYS:
            value = payload.get(key)
            if value:
                fragments.extend(_flatten_context(value, prefix=key))

        if readings:
            fragments.extend(_flatten_context(readings.get("summary", {}), prefix="readings.summary"))
            fragments.extend(_flatten_context(readings.get("featured", [])[:3], prefix="readings.featured"))

        ranked = sorted(
            (
                item
                for item in fragments
                if _should_include_fragment(item[0], focus_sections)
            ),
            key=lambda item: _score_fragment(question_tokens, item[0], item[1], focus_sections),
            reverse=True,
        )

        context_parts = [f"- {text}" for _, text in summary_fragments]
        citations: list[str] = []
        remaining = max(self._effective_context_char_budget() - len("\n".join(context_parts)), 0)
        target_citation_count = max(1, len(focus_sections)) if focus_sections else 4

        ranked_summary = sorted(
            summary_fragments,
            key=lambda item: _score_fragment(question_tokens, item[0], item[1], focus_sections),
            reverse=True,
        )
        for path, text in ranked_summary:
            if focus_sections and _top_section(path) not in focus_sections:
                continue
            score = _score_fragment(question_tokens, path, text, focus_sections)
            if score <= 0 and citations:
                continue
            if path not in citations:
                citations.append(path)
            if len(citations) >= target_citation_count:
                break

        for path, text in ranked:
            if not text or path in citations or path in summary_paths:
                continue
            line = f"- {path}: {text}"
            if len(line) > remaining:
                continue
            context_parts.append(line)
            if len(citations) < target_citation_count:
                citations.append(path)
            remaining -= len(line) + 1
            if len(citations) >= 8:
                break

        return {
            "context": "\n".join(part for part in context_parts if part),
            "citations": citations[:6],
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
                    "Repeat exact counts, group labels, model names, and AUROC values verbatim when they appear in context. "
                    "Do not add qualitative judgments, speculation, or interpretations that are not explicitly stated. "
                    "If a list is requested, include every listed item from context and nothing else. "
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
        if not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8"))

    def _load_readings_payload(self) -> dict[str, Any]:
        path = self.data_dir / "readings_data.json"
        if not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8"))

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
            fragments.append((prefix, json.dumps(scalar_subset, ensure_ascii=True, sort_keys=True)))
        for key, item in value.items():
            if isinstance(item, (dict, list)):
                fragments.extend(_flatten_context(item, prefix=f"{prefix}.{key}"))
        return fragments

    if isinstance(value, list):
        if not value:
            return fragments
        if all(isinstance(item, (str, int, float, bool)) or item is None for item in value[:8]):
            fragments.append((prefix, json.dumps(value[:8], ensure_ascii=True)))
            return fragments
        for index, item in enumerate(value[:6]):
            fragments.extend(_flatten_context(item, prefix=f"{prefix}[{index}]"))
        return fragments

    fragments.append((prefix, str(value)))
    return fragments