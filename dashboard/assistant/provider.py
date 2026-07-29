"""Resilient Ollama provider seam for the dashboard assistant.

The dashboard talks to a local `Ollama <https://github.com/ollama/ollama>`_
server through its OpenAI-compatible ``/v1`` surface.  A remote Ollama host
(another workstation, a GPU box, or the Compose ``ollama`` service) is the same
protocol and is selected purely by base URL.  Importing this module never
imports the OpenAI SDK or contacts the provider, which keeps the dashboard
process healthy when the assistant runtime is not running.
"""

from __future__ import annotations

import importlib.util
import random
import re
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Iterator, Protocol

OLLAMA_API_BASE = "http://127.0.0.1:11434/v1"
OLLAMA_DEFAULT_MODEL = "llama3.2:3b"
OLLAMA_RUNTIME = "ollama"
OLLAMA_REMOTE_RUNTIME = "ollama-remote"
# Ollama needs no credential; the SDK still requires a non-empty placeholder.
OLLAMA_PLACEHOLDER_KEY = "ollama"

# Base URLs left behind by the retired hosted-provider configuration. They are
# unreachable now, so a stale .env, Compose file, or Helm value silently falls
# back to the local runtime instead of failing every assistant request.
RETIRED_API_BASE_HOSTS = (
    "integrate.api.nvidia.com",
    "nemotron-nim",
    "api.openai.com",
)

PROVIDER_ALIASES = {
    "": "ollama",
    "ollama": "ollama",
    "ollama-local": "ollama",
    "local": "ollama",
    "openai-compatible": "ollama",
    "ollama-remote": "ollama-remote",
    "remote": "ollama-remote",
    # Retired hosted-provider names keep older deployments importable.
    "nvidia": "ollama",
    "nvidia-hosted": "ollama",
    "nvidia-build": "ollama",
    "nvidia-build-api": "ollama",
    "nim": "ollama",
    "nvidia-nim": "ollama",
    "self-hosted": "ollama",
    "self-hosted-nim": "ollama",
}

_REASONING_TAG_PATTERN = re.compile(
    r"</?(?:think|analysis|reasoning)\s*>", re.IGNORECASE
)
_REASONING_BLOCK_PATTERN = re.compile(
    r"<(?:think|analysis|reasoning)\s*>.*?</(?:think|analysis|reasoning)\s*>",
    re.IGNORECASE | re.DOTALL,
)
_REASONING_OPEN_PATTERN = re.compile(
    r"<(?:think|analysis|reasoning)\s*>", re.IGNORECASE
)
_FINAL_ANSWER_PATTERN = re.compile(
    r"(?:^|\n|[.!?]\s+)\s*(?:final\s+answer|answer)\s*:\s*",
    re.IGNORECASE,
)
_PLANNING_PREFIX_PATTERN = re.compile(
    r"^(?:(?:we|i)\s+(?:need|must|should|have)\s+to\s+"
    r"(?:answer|respond|explain|analy[sz]e|craft)|"
    r"(?:the\s+)?user\s+(?:asks|wants|requested)|"
    r"(?:let(?:'s|\s+us))\s+(?:reason|analy[sz]e|craft)|analysis\s*:)",
    re.IGNORECASE,
)
_PLANNING_MARKERS = (
    "must answer",
    "provided context",
    "dashboard context",
    "context only",
    "be concise",
    "concise answer",
    "do not invent",
    "must not invent",
    "should not add",
    "grounded in",
    "hidden reasoning",
)
_PLANNING_PREFIXES = tuple(
    f"{subject} {intent} to {action}"
    for subject in ("we", "i")
    for intent in ("need", "must", "should", "have")
    for action in ("answer", "respond", "explain", "analyze", "analyse", "craft")
) + (
    "the user asks",
    "the user wants",
    "the user requested",
    "user asks",
    "user wants",
    "user requested",
    "let's reason",
    "let's analyze",
    "let's analyse",
    "let's craft",
    "let us reason",
    "let us analyze",
    "let us analyse",
    "let us craft",
    "analysis:",
)
_REASONING_TAGS = (
    "<think>",
    "</think>",
    "<analysis>",
    "</analysis>",
    "<reasoning>",
    "</reasoning>",
)


class AssistantProvider(Protocol):
    """Small provider surface consumed by :class:`DashboardChatAssistant`."""

    def status(self) -> dict[str, Any]: ...

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int,
        temperature: float,
        top_p: float,
        response_format: dict[str, Any] | None = None,
    ) -> str: ...

    def probe(self) -> dict[str, Any]:
        """Validate provider reachability without creating a completion."""
        ...

    def stream(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int,
        temperature: float,
        top_p: float,
        cancel_event: threading.Event | None = None,
    ) -> Iterator[str]: ...


def normalize_api_base(value: str | None) -> str:
    """Return a usable Ollama ``/v1`` base URL, dropping retired endpoints."""
    candidate = (value or "").strip().rstrip("/")
    if not candidate:
        return OLLAMA_API_BASE
    lowered = candidate.lower()
    if any(host in lowered for host in RETIRED_API_BASE_HOSTS):
        return OLLAMA_API_BASE
    if not lowered.startswith(("http://", "https://")):
        candidate = f"http://{candidate}"
        lowered = candidate.lower()
    # Accept a bare Ollama host (OLLAMA_HOST style) and add the OpenAI surface.
    if not lowered.rstrip("/").endswith("/v1"):
        candidate = f"{candidate.rstrip('/')}/v1"
    return candidate


def _is_local_host(api_base: str) -> bool:
    lowered = api_base.lower()
    return any(
        f"//{host}" in lowered or f"//{host}:" in lowered
        for host in (
            "localhost",
            "127.0.0.1",
            "0.0.0.0",
            "[::1]",
            "host.docker.internal",
        )
    )


@dataclass(frozen=True)
class ProviderConfig:
    """Provider-only configuration, separated from dashboard grounding knobs."""

    enabled: bool = True
    provider: str = "ollama"
    runtime: str = OLLAMA_RUNTIME
    api_base: str = OLLAMA_API_BASE
    api_key: str | None = None
    model: str = OLLAMA_DEFAULT_MODEL
    # Dashboard chat needs short final answers, not a visible reasoning trace.
    enable_thinking: bool = False
    reasoning_budget: int = 0
    # A local runtime fails fast and recovers fast, so the queue never stacks up
    # behind a stalled request the way a metered hosted endpoint could.
    request_timeout_seconds: float = 120.0
    max_retries: int = 2
    retry_base_seconds: float = 0.5
    retry_max_seconds: float = 4.0
    retry_jitter: float = 0.25
    queue_timeout_seconds: float = 120.0
    max_concurrency: int = 2
    circuit_failure_threshold: int = 3
    circuit_recovery_seconds: float = 30.0
    # A local runtime can be stopped at any moment, so status runs a cheap,
    # cached liveness check rather than reporting readiness from configuration
    # alone. Generation paths never wait on it.
    status_probe_enabled: bool = True
    status_probe_ttl_seconds: float = 15.0
    status_probe_timeout_seconds: float = 1.0
    # Deprecated hosted-provider knobs: accepted so older callers still build,
    # and honored only as a plain base-URL override for a remote Ollama host.
    self_hosted_enabled: bool = False
    self_hosted_base_url: str = ""

    @property
    def normalized_provider(self) -> str:
        value = (self.provider or "ollama").strip().lower()
        return PROVIDER_ALIASES.get(value, value)

    @property
    def effective_api_base(self) -> str:
        override = (self.self_hosted_base_url or "").strip()
        if self.self_hosted_enabled and override:
            normalized = normalize_api_base(override)
            if normalized != OLLAMA_API_BASE:
                return normalized
        return normalize_api_base(self.api_base)

    @property
    def uses_remote_host(self) -> bool:
        return not _is_local_host(self.effective_api_base)

    @property
    def effective_runtime(self) -> str:
        runtime = (self.runtime or "").strip().lower()
        if runtime in {
            "",
            "nvidia-build-api",
            "nvidia-nim",
            "pages-edge-nvidia-build-api",
        }:
            runtime = ""
        if runtime:
            return runtime
        return OLLAMA_REMOTE_RUNTIME if self.uses_remote_host else OLLAMA_RUNTIME

    @property
    def effective_api_key(self) -> str:
        return (self.api_key or "").strip() or OLLAMA_PLACEHOLDER_KEY


class ProviderError(RuntimeError):
    """Stable, sanitized provider failure suitable for an API response."""

    def __init__(
        self,
        message: str,
        *,
        state: str = "degraded",
        http_status: int = 503,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.state = state
        self.http_status = http_status
        self.retryable = retryable


class _CircuitBreaker:
    """Thread-safe closed/open/half-open circuit breaker."""

    def __init__(
        self,
        *,
        failure_threshold: int,
        recovery_seconds: float,
        clock: Callable[[], float],
    ) -> None:
        self._threshold = max(1, int(failure_threshold))
        self._recovery_seconds = max(0.0, float(recovery_seconds))
        self._clock = clock
        self._lock = threading.Lock()
        self._failures = 0
        self._opened_until = 0.0
        self._probe_in_flight = False

    def allow_request(self) -> bool:
        with self._lock:
            now = self._clock()
            if not self._opened_until:
                return True
            if now < self._opened_until:
                return False
            if self._probe_in_flight:
                return False
            self._probe_in_flight = True
            return True

    def record_success(self) -> None:
        with self._lock:
            self._failures = 0
            self._opened_until = 0.0
            self._probe_in_flight = False

    def record_failure(self) -> None:
        with self._lock:
            self._failures += 1
            if self._probe_in_flight or self._failures >= self._threshold:
                self._opened_until = self._clock() + self._recovery_seconds
            self._probe_in_flight = False

    def cancel_probe(self) -> None:
        with self._lock:
            self._probe_in_flight = False

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            now = self._clock()
            is_open = bool(self._opened_until and now < self._opened_until)
            half_open = bool(self._opened_until and not is_open)
            return {
                "state": (
                    "open" if is_open else ("half-open" if half_open else "closed")
                ),
                "failures": self._failures,
                "failure_threshold": self._threshold,
                "retry_after_seconds": (
                    round(max(0.0, self._opened_until - now), 3) if is_open else 0.0
                ),
            }


def _read_attr(value: Any, name: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def _content_text(content: Any) -> str:
    """Return visible response content without exposing reasoning fields."""
    if isinstance(content, str):
        return content
    if not isinstance(content, (list, tuple)):
        return ""
    parts: list[str] = []
    for item in content:
        item_type = str(_read_attr(item, "type", "text") or "text").lower()
        if item_type not in {"text", "output_text"}:
            continue
        text = _read_attr(item, "text", "")
        if isinstance(text, str):
            parts.append(text)
        else:
            nested = _read_attr(text, "value", "")
            if isinstance(nested, str):
                parts.append(nested)
    return "".join(parts)


def _looks_like_internal_planning(text: str) -> bool:
    """Identify provider planning prose without matching ordinary first-person text."""
    normalized = " ".join(text.strip().lower().split())
    if not normalized or not _PLANNING_PREFIX_PATTERN.match(normalized):
        return False
    if normalized.startswith(("we need to answer", "i need to answer")):
        return True
    marker_count = sum(marker in normalized[:800] for marker in _PLANNING_MARKERS)
    return marker_count >= 2


def _could_start_internal_planning(text: str) -> bool:
    """Keep an undecided stream prefix private until it cannot be planning."""
    normalized = " ".join(text.strip().lower().split())
    if not normalized:
        return True
    if _PLANNING_PREFIX_PATTERN.match(normalized):
        return True
    return any(prefix.startswith(normalized) for prefix in _PLANNING_PREFIXES)


def sanitize_response_content(content: str) -> str:
    """Return final answer text while suppressing model reasoning artifacts.

    Small local models routinely place reasoning in ``content`` rather than a
    dedicated field, and thinking-capable Ollama models can emit an orphan
    ``</think>`` marker.  This boundary therefore treats tagged or recognizable
    planning text as private.
    """
    text = (content or "").lstrip("\ufeff")
    if not text.strip():
        return ""

    previous = None
    while previous != text:
        previous = text
        text = _REASONING_BLOCK_PATTERN.sub("", text)

    # Never expose an unterminated reasoning block. Preserve only content that
    # appeared before the opening marker, if any.
    open_match = _REASONING_OPEN_PATTERN.search(text)
    if open_match is not None:
        text = text[: open_match.start()]

    # Models can return a leading closing marker for non-thinking completions.
    text = _REASONING_TAG_PATTERN.sub("", text).strip()
    if not text:
        return ""

    if _looks_like_internal_planning(text):
        final_markers = list(_FINAL_ANSWER_PATTERN.finditer(text))
        if not final_markers:
            return ""
        text = text[final_markers[-1].end() :].strip()

    return text


class _ReasoningTagFilter:
    """Strip reasoning tags safely when a marker is split across stream chunks."""

    def __init__(self) -> None:
        self._buffer = ""
        self._inside_reasoning = False

    @staticmethod
    def _partial_tag_length(value: str) -> int:
        lowered = value.lower()
        return max(
            (
                size
                for tag in _REASONING_TAGS
                for size in range(1, min(len(tag), len(lowered)) + 1)
                if lowered.endswith(tag[:size])
            ),
            default=0,
        )

    def feed(self, content: str) -> list[str]:
        self._buffer += content
        visible: list[str] = []

        while self._buffer:
            match = _REASONING_TAG_PATTERN.search(self._buffer)
            if match is not None:
                prefix = self._buffer[: match.start()]
                if prefix and not self._inside_reasoning:
                    visible.append(prefix)
                tag = match.group(0).lower()
                self._inside_reasoning = not tag.startswith("</")
                self._buffer = self._buffer[match.end() :]
                continue

            keep = self._partial_tag_length(self._buffer)
            flush = self._buffer[:-keep] if keep else self._buffer
            if flush and not self._inside_reasoning:
                visible.append(flush)
            self._buffer = self._buffer[-keep:] if keep else ""
            break

        return visible

    def finish(self) -> str:
        # An unfinished tag or reasoning block is private and intentionally lost.
        if self._inside_reasoning or self._partial_tag_length(self._buffer):
            self._buffer = ""
            return ""
        visible = self._buffer
        self._buffer = ""
        return visible


def completion_content(response: Any) -> str:
    choices = _read_attr(response, "choices", []) or []
    if not choices:
        return ""
    message = _read_attr(choices[0], "message", {}) or {}
    return sanitize_response_content(_content_text(_read_attr(message, "content", "")))


def stream_content(chunk: Any) -> str:
    choices = _read_attr(chunk, "choices", []) or []
    if not choices:
        return ""
    delta = _read_attr(choices[0], "delta", {}) or {}
    # Deliberately ignore reasoning_content, tool calls, and metadata chunks.
    return _content_text(_read_attr(delta, "content", ""))


class OllamaProvider:
    """Local/remote Ollama provider with bounded, retry-safe generation."""

    def __init__(
        self,
        config: ProviderConfig,
        *,
        client: Any | None = None,
        client_factory: Callable[..., Any] | None = None,
        sleep: Callable[[float], None] = time.sleep,
        random_value: Callable[[], float] = random.random,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.config = config
        self._client = client
        self._client_factory = client_factory
        self._client_lock = threading.Lock()
        self._sleep = sleep
        self._random_value = random_value
        self._slots = threading.BoundedSemaphore(max(1, config.max_concurrency))
        self._active_lock = threading.Lock()
        self._active_requests = 0
        self._last_state: str | None = None
        self._last_error: str | None = None
        self._clock = clock
        self._liveness_lock = threading.Lock()
        self._liveness_cache: tuple[float, dict[str, Any]] | None = None
        self._breaker = _CircuitBreaker(
            failure_threshold=config.circuit_failure_threshold,
            recovery_seconds=config.circuit_recovery_seconds,
            clock=clock,
        )

    def _liveness(self) -> dict[str, Any] | None:
        """Cheap cached check that the runtime is up and holds the model.

        Returns ``None`` when the check does not apply: a disabled probe, or an
        injected client that stands in for the runtime.  Never raises, and never
        blocks longer than the configured probe timeout.
        """
        if not self.config.status_probe_enabled:
            return None
        if self._client is not None or self._client_factory is not None:
            return None

        ttl = max(0.0, float(self.config.status_probe_ttl_seconds))
        now = self._clock()
        with self._liveness_lock:
            cached = self._liveness_cache
            if cached is not None and now - cached[0] < ttl:
                return cached[1]

        # Imported lazily so this module keeps its import-time I/O guarantee.
        from dashboard.assistant import ollama_runtime

        timeout = max(0.1, float(self.config.status_probe_timeout_seconds))
        snapshot: dict[str, Any]
        try:
            installed = ollama_runtime.installed_models(
                ollama_runtime.host_from_api_base(self.config.effective_api_base),
                timeout=timeout,
            )
            wanted = {self.config.model, f"{self.config.model}:latest"}
            snapshot = {
                "reachable": True,
                "model_installed": any(name in wanted for name in installed),
                "installed_models": installed,
            }
        except Exception:
            # A probe failure is only ever a status signal, never a request error.
            snapshot = {
                "reachable": False,
                "model_installed": None,
                "installed_models": [],
            }

        with self._liveness_lock:
            self._liveness_cache = (self._clock(), snapshot)
        return snapshot

    def _configuration_error(self) -> ProviderError | None:
        if not self.config.enabled:
            return ProviderError(
                "Assistant is disabled by configuration.", state="disabled"
            )
        if self.config.normalized_provider not in {"ollama", "ollama-remote"}:
            return ProviderError(
                "The configured assistant provider is not supported.",
                state="degraded",
            )
        if not self.config.effective_api_base:
            return ProviderError(
                "The assistant provider base URL is not configured.", state="degraded"
            )
        if not self.config.model:
            return ProviderError(
                "The assistant model identifier is not configured.", state="degraded"
            )
        return None

    def _dependency_available(self) -> bool:
        return bool(
            self._client is not None
            or self._client_factory is not None
            or importlib.util.find_spec("openai") is not None
        )

    def status(self) -> dict[str, Any]:
        config_error = self._configuration_error()
        dependency_available = self._dependency_available()
        circuit = self._breaker.snapshot()
        with self._active_lock:
            active_requests = self._active_requests

        if config_error is not None:
            state = config_error.state
            ready = False
            can_attempt = False
            message = str(config_error)
        elif not dependency_available:
            state = "degraded"
            ready = False
            can_attempt = False
            message = "The OpenAI-compatible client dependency is not installed."
        elif circuit["state"] == "open":
            state = "degraded"
            ready = False
            can_attempt = False
            message = (
                "The assistant provider circuit is temporarily open after repeated "
                "failures. The dashboard remains available."
            )
        elif self._last_state:
            state = self._last_state
            ready = False
            can_attempt = True
            message = (
                "The provider is available for another attempt; the previous request "
                f"ended in state {self._last_state}."
            )
        else:
            state = "ready"
            ready = True
            can_attempt = True
            message = "Ollama assistant provider is configured and ready."

        # Configuration alone cannot prove a local runtime is up, and reporting
        # "ready" for a stopped server would send the user into a failing chat.
        liveness = self._liveness() if state == "ready" else None
        if liveness is not None and not liveness.get("reachable"):
            state = "provider-unreachable"
            ready = False
            can_attempt = True
            message = (
                "The Ollama assistant runtime is not reachable. Start it with "
                "`make ollama-up` and try again."
            )
        elif liveness is not None and liveness.get("model_installed") is False:
            state = "model-missing"
            ready = False
            can_attempt = False
            message = (
                f"The assistant model {self.config.model!r} is not installed in "
                "Ollama. Run `make ollama-pull` to download it."
            )

        return {
            "enabled": self.config.enabled,
            "provider": self.config.normalized_provider,
            "runtime": self.config.effective_runtime,
            "api_base": self.config.effective_api_base,
            "model_id": self.config.model,
            "state": state,
            "ready": ready,
            "can_attempt": can_attempt,
            "healthy": state == "ready",
            "message": message,
            "last_error": self._last_error,
            "failure_state": self._last_state,
            "dependencies": {
                "available": dependency_available,
                "missing": [] if dependency_available else ["openai"],
            },
            "active_requests": active_requests,
            "max_concurrency": max(1, self.config.max_concurrency),
            "queue_timeout_seconds": self.config.queue_timeout_seconds,
            "request_timeout_seconds": self.config.request_timeout_seconds,
            "max_retries": max(0, self.config.max_retries),
            "circuit_breaker": circuit,
            "self_hosted": True,
            "remote_host": self.config.uses_remote_host,
            "runtime_reachable": (
                None if liveness is None else bool(liveness.get("reachable"))
            ),
            "model_installed": (
                None if liveness is None else liveness.get("model_installed")
            ),
        }

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        with self._client_lock:
            if self._client is not None:
                return self._client
            if self._client_factory is not None:
                try:
                    self._client = self._client_factory(self.config)
                except TypeError:
                    self._client = self._client_factory()
                return self._client

            try:
                from openai import OpenAI
            except Exception as exc:
                raise ProviderError(
                    "The OpenAI-compatible client dependency is not installed.",
                    state="degraded",
                ) from exc

            self._client = OpenAI(
                base_url=self.config.effective_api_base,
                # Ollama ignores the credential; the SDK requires a non-empty one.
                api_key=self.config.effective_api_key,
                timeout=max(0.1, self.config.request_timeout_seconds),
                # Retry behavior is centralized here so queue/circuit state remains
                # deterministic and observable.
                max_retries=0,
            )
            return self._client

    def _create(self, **kwargs: Any) -> Any:
        client = self._get_client()
        chat = _read_attr(client, "chat")
        completions = _read_attr(chat, "completions") if chat is not None else None
        create = _read_attr(completions, "create") if completions is not None else None
        if callable(create):
            return create(**kwargs)
        # A narrow compatibility hook makes existing deterministic fake clients
        # usable without keeping any llama.cpp runtime dependency.
        legacy_create = _read_attr(client, "create_chat_completion")
        if callable(legacy_create):
            return legacy_create(**kwargs)
        raise ProviderError(
            "The assistant client does not expose chat completions.", state="degraded"
        )

    def _request_kwargs(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int,
        temperature: float,
        top_p: float,
        stream: bool,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        # Only fields Ollama's OpenAI-compatible surface implements are sent, so
        # a request never fails on a parameter the local runtime cannot honor.
        kwargs: dict[str, Any] = {
            "model": self.config.model,
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max(1, int(max_tokens)),
            "stream": stream,
        }
        if response_format is not None:
            kwargs["response_format"] = response_format
        return kwargs

    def _acquire_slot(self) -> None:
        config_error = self._configuration_error()
        if config_error is not None:
            raise config_error
        timeout = max(0.0, float(self.config.queue_timeout_seconds))
        if not self._slots.acquire(timeout=timeout):
            raise ProviderError(
                "The assistant request queue is full. Please try again shortly.",
                state="degraded",
                http_status=429,
                retryable=True,
            )
        with self._active_lock:
            self._active_requests += 1
        if not self._breaker.allow_request():
            self._release_slot()
            raise ProviderError(
                "The assistant provider is temporarily degraded. Please try again shortly.",
                state="degraded",
                http_status=503,
                retryable=True,
            )

    def _release_slot(self) -> None:
        with self._active_lock:
            self._active_requests = max(0, self._active_requests - 1)
        self._slots.release()

    def _classify_error(self, exc: BaseException) -> ProviderError:
        if isinstance(exc, ProviderError):
            return exc
        status_code = _read_attr(exc, "status_code")
        response = _read_attr(exc, "response")
        if status_code is None and response is not None:
            status_code = _read_attr(response, "status_code")
        try:
            numeric_status = int(status_code) if status_code is not None else None
        except (TypeError, ValueError):
            numeric_status = None
        name = type(exc).__name__.lower()
        text = str(exc).lower()

        # A model that has not been pulled yet is the one failure an operator can
        # fix directly, so it gets its own state and instruction.
        if (
            numeric_status == 404
            or "try pulling it" in text
            or "model not found" in text
        ):
            return ProviderError(
                f"The assistant model {self.config.model!r} is not installed in "
                "Ollama. Run `make ollama-pull` to download it.",
                state="model-missing",
                http_status=503,
                retryable=False,
            )
        if numeric_status == 429 or "ratelimit" in name or "rate limit" in text:
            return ProviderError(
                "The assistant runtime is busy. Please try again shortly.",
                state="rate-limited",
                http_status=429,
                retryable=True,
            )
        if numeric_status in {408, 504} or "timeout" in name or "timed out" in text:
            return ProviderError(
                "The assistant request timed out. Please try again.",
                state="timeout",
                http_status=504,
                retryable=True,
            )
        if (
            (numeric_status is not None and numeric_status >= 500)
            or "connection" in name
            or "connect" in text
            or "unreachable" in text
        ):
            return ProviderError(
                "The Ollama assistant runtime is not reachable. Start it with "
                "`make ollama-up` and try again.",
                state="provider-unreachable",
                http_status=503,
                retryable=True,
            )
        if numeric_status in {409, 425}:
            return ProviderError(
                "The assistant could not complete the request yet.",
                state="degraded",
                http_status=503,
                retryable=True,
            )
        return ProviderError(
            "The assistant could not complete this request.",
            state="degraded",
            http_status=503,
            retryable=False,
        )

    def _retry_delay(self, attempt: int) -> float:
        base = max(0.0, float(self.config.retry_base_seconds))
        cap = max(base, float(self.config.retry_max_seconds))
        exponential = min(cap, base * (2 ** max(0, attempt)))
        jitter = max(0.0, float(self.config.retry_jitter))
        return exponential * (1.0 + jitter * max(0.0, self._random_value()))

    def _record_success(self) -> None:
        self._last_state = None
        self._last_error = None
        self._breaker.record_success()

    def _record_failure(self, error: ProviderError) -> None:
        self._last_state = error.state
        self._last_error = str(error)
        self._breaker.record_failure()

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int,
        temperature: float,
        top_p: float,
        response_format: dict[str, Any] | None = None,
    ) -> str:
        self._acquire_slot()
        try:
            kwargs = self._request_kwargs(
                messages,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                stream=False,
                response_format=response_format,
            )
            for attempt in range(max(0, self.config.max_retries) + 1):
                try:
                    response = self._create(**kwargs)
                    self._record_success()
                    return completion_content(response)
                except Exception as exc:
                    error = self._classify_error(exc)
                    if not error.retryable or attempt >= max(
                        0, self.config.max_retries
                    ):
                        self._record_failure(error)
                        raise error from exc
                    self._sleep(self._retry_delay(attempt))
            return ""  # pragma: no cover - loop always returns or raises
        finally:
            self._release_slot()

    def probe(self) -> dict[str, Any]:
        """Call the provider's model catalog without consuming generation tokens."""
        self._acquire_slot()
        try:
            for attempt in range(max(0, self.config.max_retries) + 1):
                try:
                    client = self._get_client()
                    models = _read_attr(client, "models")
                    list_models = (
                        _read_attr(models, "list") if models is not None else None
                    )
                    if not callable(list_models):
                        raise ProviderError(
                            "The assistant client does not expose a provider probe.",
                            state="degraded",
                        )
                    response = list_models()
                    data = _read_attr(response, "data", []) or []
                    ids = {
                        str(_read_attr(item, "id", ""))
                        for item in data
                        if _read_attr(item, "id", "")
                    }
                    self._record_success()
                    return {
                        "ok": True,
                        "state": "ready",
                        "message": "Ollama assistant provider probe succeeded.",
                        "provider": self.config.normalized_provider,
                        "runtime": self.config.effective_runtime,
                        "model_id": self.config.model,
                        "model_visible": self.config.model in ids if ids else None,
                        "models_returned": len(data),
                    }
                except Exception as exc:
                    error = self._classify_error(exc)
                    if not error.retryable or attempt >= max(
                        0, self.config.max_retries
                    ):
                        self._record_failure(error)
                        raise error from exc
                    self._sleep(self._retry_delay(attempt))
            raise AssertionError(
                "provider probe retry loop exhausted"
            )  # pragma: no cover
        finally:
            self._release_slot()

    def stream(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int,
        temperature: float,
        top_p: float,
        cancel_event: threading.Event | None = None,
    ) -> Iterator[str]:
        self._acquire_slot()
        remote_stream: Any | None = None
        try:
            kwargs = self._request_kwargs(
                messages,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                stream=True,
            )
            for attempt in range(max(0, self.config.max_retries) + 1):
                emitted = False
                reasoning_buffer: list[str] = []
                tag_filter = _ReasoningTagFilter()
                buffer_reasoning = bool(self.config.enable_thinking)
                planning_prefix = ""
                planning_decided = buffer_reasoning
                try:
                    remote_stream = self._create(**kwargs)
                    for chunk in remote_stream:
                        if cancel_event is not None and cancel_event.is_set():
                            close = _read_attr(remote_stream, "close")
                            if callable(close):
                                close()
                            self._breaker.cancel_probe()
                            return
                        content = stream_content(chunk)
                        if content:
                            emitted = True
                            if buffer_reasoning:
                                reasoning_buffer.append(content)
                                continue
                            for visible in tag_filter.feed(content):
                                if planning_decided:
                                    yield visible
                                    continue
                                planning_prefix += visible
                                if _looks_like_internal_planning(planning_prefix):
                                    buffer_reasoning = True
                                    planning_decided = True
                                    reasoning_buffer.append(planning_prefix)
                                    planning_prefix = ""
                                elif not _could_start_internal_planning(
                                    planning_prefix
                                ):
                                    planning_decided = True
                                    yield planning_prefix
                                    planning_prefix = ""
                    if buffer_reasoning:
                        visible = sanitize_response_content("".join(reasoning_buffer))
                        if visible:
                            yield visible
                    else:
                        tail = tag_filter.finish()
                        if tail:
                            if planning_decided:
                                yield tail
                            else:
                                planning_prefix += tail
                        if planning_prefix:
                            visible = sanitize_response_content(planning_prefix)
                            if visible:
                                yield visible
                    self._record_success()
                    return
                except GeneratorExit:
                    close = _read_attr(remote_stream, "close")
                    if callable(close):
                        close()
                    self._breaker.cancel_probe()
                    raise
                except Exception as exc:
                    close = _read_attr(remote_stream, "close")
                    if callable(close):
                        close()
                    error = self._classify_error(exc)
                    # Never replay a partial answer; that would duplicate visible text.
                    if (
                        emitted
                        or not error.retryable
                        or attempt >= max(0, self.config.max_retries)
                    ):
                        self._record_failure(error)
                        raise error from exc
                    self._sleep(self._retry_delay(attempt))
        finally:
            self._release_slot()


def build_provider(
    config: ProviderConfig,
    *,
    client: Any | None = None,
    client_factory: Callable[..., Any] | None = None,
    sleep: Callable[[float], None] = time.sleep,
    random_value: Callable[[], float] = random.random,
    clock: Callable[[], float] = time.monotonic,
) -> OllamaProvider:
    """Build the configured provider without performing network I/O."""
    return OllamaProvider(
        config,
        client=client,
        client_factory=client_factory,
        sleep=sleep,
        random_value=random_value,
        clock=clock,
    )


__all__ = [
    "AssistantProvider",
    "OLLAMA_API_BASE",
    "OLLAMA_DEFAULT_MODEL",
    "OLLAMA_PLACEHOLDER_KEY",
    "OLLAMA_REMOTE_RUNTIME",
    "OLLAMA_RUNTIME",
    "OllamaProvider",
    "ProviderConfig",
    "ProviderError",
    "build_provider",
    "completion_content",
    "normalize_api_base",
    "sanitize_response_content",
    "stream_content",
]
