"""Resilient OpenAI-compatible providers for the dashboard assistant.

Every supported backend speaks the OpenAI chat-completions protocol, so one
client implementation serves all of them:

``gemini``
    Google's OpenAI-compatible endpoint. Fast and concise, and the default
    first tier when a key is configured.
``nvidia``
    NVIDIA's hosted build API running Nemotron.
``nvidia-nim``
    A self-hosted NVIDIA NIM, accepted only after the explicit
    ``DASHBOARD_ASSISTANT_SELF_HOSTED_ENABLED`` opt-in.
``local``
    An OpenAI-compatible runtime on the operator's machine, such as Docker
    Model Runner. Needs no credential and keeps the assistant answering when
    every hosted tier is unreachable.

Providers differ only in the vendor-specific request knobs used to suppress a
visible reasoning trace, which :meth:`ProviderConfig.request_extras` resolves
per family. Sending NVIDIA's ``chat_template_kwargs`` to Gemini is rejected with
HTTP 400, so this separation is load-bearing rather than cosmetic.

:class:`FallbackProvider` chains configured tiers in order and moves to the next
one when a tier is unconfigured or failing, which is what keeps the assistant
answering through a single provider outage.

Importing this module never imports the OpenAI SDK or contacts a provider, so
the dashboard process stays healthy when assistant dependencies or credentials
are absent.
"""

from __future__ import annotations

import importlib.util
import random
import re
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Iterator, Protocol, Sequence

NVIDIA_HOSTED_API_BASE = "https://integrate.api.nvidia.com/v1"
NVIDIA_NEMOTRON_MODEL = "nvidia/nemotron-3-super-120b-a12b"
NVIDIA_HOSTED_RUNTIME = "nvidia-build-api"
NVIDIA_SELF_HOSTED_RUNTIME = "nvidia-nim"

# Google's OpenAI-compatible surface. ``reasoning_effort`` is the supported way
# to ask for a direct answer instead of a reasoning trace.
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/openai"
GEMINI_DEFAULT_MODEL = "gemini-3.5-flash"
GEMINI_RUNTIME = "gemini-openai-compat"

# Docker Model Runner exposes an OpenAI-compatible endpoint on the host. The
# published default port is stable across Docker Desktop releases.
LOCAL_API_BASE = "http://localhost:12434/engines/v1"
LOCAL_DEFAULT_MODEL = "ai/nemotron-3-nano"
LOCAL_RUNTIME = "docker-model-runner"

PROVIDER_ALIASES = {
    "": "nvidia",
    "nvidia": "nvidia",
    "nvidia-hosted": "nvidia",
    "nvidia-build": "nvidia",
    "nvidia-build-api": "nvidia",
    "openai-compatible": "nvidia",
    "nim": "nvidia-nim",
    "nvidia-nim": "nvidia-nim",
    "self-hosted": "nvidia-nim",
    "self-hosted-nim": "nvidia-nim",
    "gemini": "gemini",
    "google": "gemini",
    "google-gemini": "gemini",
    "gemini-openai": "gemini",
    "gemini-openai-compat": "gemini",
    "local": "local",
    "docker": "local",
    "docker-model-runner": "local",
    "model-runner": "local",
    "ollama": "local",
    "llama-server": "local",
}

# Providers that authenticate with a bearer token supplied by the operator.
CREDENTIALED_PROVIDERS = frozenset({"nvidia", "gemini"})

# Request-shaping family per normalized provider name.
PROVIDER_FAMILIES = {
    "nvidia": "nvidia",
    "nvidia-nim": "nvidia",
    "gemini": "gemini",
    "local": "openai",
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


@dataclass(frozen=True)
class ProviderConfig:
    """Provider-only configuration, separated from dashboard grounding knobs."""

    enabled: bool = True
    provider: str = "nvidia"
    runtime: str = NVIDIA_HOSTED_RUNTIME
    api_base: str = NVIDIA_HOSTED_API_BASE
    api_key: str | None = None
    model: str = NVIDIA_NEMOTRON_MODEL
    # Dashboard chat needs short final answers, not a visible reasoning trace.
    enable_thinking: bool = False
    reasoning_budget: int = 0
    request_timeout_seconds: float = 180.0
    max_retries: int = 6
    retry_base_seconds: float = 2.0
    retry_max_seconds: float = 30.0
    retry_jitter: float = 0.25
    queue_timeout_seconds: float = 180.0
    max_concurrency: int = 2
    circuit_failure_threshold: int = 3
    circuit_recovery_seconds: float = 60.0
    self_hosted_enabled: bool = False
    self_hosted_base_url: str = "http://nemotron-nim:8000/v1"
    # Operator-facing tier name, used in status payloads and chain diagnostics.
    label: str = ""

    @property
    def normalized_provider(self) -> str:
        value = (self.provider or "nvidia").strip().lower()
        return PROVIDER_ALIASES.get(value, value)

    @property
    def family(self) -> str:
        """Return the request-shaping family for this provider."""
        return PROVIDER_FAMILIES.get(self.normalized_provider, "openai")

    @property
    def uses_self_hosted_nim(self) -> bool:
        return self.normalized_provider == "nvidia-nim"

    @property
    def requires_api_key(self) -> bool:
        """Return True when this provider cannot authenticate without a key."""
        return self.normalized_provider in CREDENTIALED_PROVIDERS

    @property
    def effective_api_base(self) -> str:
        if self.uses_self_hosted_nim:
            return self.self_hosted_base_url.rstrip("/")
        return self.api_base.rstrip("/")

    @property
    def effective_runtime(self) -> str:
        if self.uses_self_hosted_nim:
            return NVIDIA_SELF_HOSTED_RUNTIME
        return self.runtime or NVIDIA_HOSTED_RUNTIME

    @property
    def effective_label(self) -> str:
        return self.label.strip() or f"{self.normalized_provider}:{self.model}"

    def request_extras(self) -> dict[str, Any]:
        """Return vendor knobs that keep the reasoning trace out of the answer.

        Each vendor rejects the others' fields, so this is resolved per family
        rather than sent as a merged superset.
        """
        if self.family == "nvidia":
            return {
                "extra_body": {
                    "chat_template_kwargs": {
                        "enable_thinking": bool(self.enable_thinking)
                    },
                    "reasoning_budget": max(0, int(self.reasoning_budget)),
                }
            }
        if self.family == "gemini":
            # Gemini bills thinking tokens against max_tokens, so leaving this
            # on can return a length-truncated answer with no visible content.
            return {} if self.enable_thinking else {"reasoning_effort": "none"}
        # A generic OpenAI-compatible runtime is given no vendor extras at all;
        # unknown fields are a 400 on most servers.
        return {}


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

    Nemotron may place reasoning in ``content`` rather than a dedicated field and
    may emit an orphan ``</think>`` marker even when thinking is disabled.  This
    boundary therefore treats tagged or recognizable planning text as private.
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

    # NVIDIA can return a leading closing marker for non-thinking completions.
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


class NVIDIAOpenAIProvider:
    """NVIDIA hosted/NIM provider with bounded, retry-safe generation."""

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
        self._breaker = _CircuitBreaker(
            failure_threshold=config.circuit_failure_threshold,
            recovery_seconds=config.circuit_recovery_seconds,
            clock=clock,
        )

    def _configuration_error(self) -> ProviderError | None:
        if not self.config.enabled:
            return ProviderError(
                "Assistant is disabled by configuration.", state="disabled"
            )
        if self.config.normalized_provider not in PROVIDER_FAMILIES:
            return ProviderError(
                "The configured assistant provider is not supported.",
                state="degraded",
            )
        if self.config.uses_self_hosted_nim and not self.config.self_hosted_enabled:
            return ProviderError(
                "Self-hosted NVIDIA NIM is disabled; explicitly opt in before using it.",
                state="disabled",
            )
        if not self.config.effective_api_base:
            return ProviderError(
                "The assistant provider base URL is not configured.", state="degraded"
            )
        if not self.config.model:
            return ProviderError(
                "The assistant model identifier is not configured.", state="degraded"
            )
        if (
            self.config.requires_api_key
            and not (self.config.api_key or "").strip()
            and self._client is None
            and self._client_factory is None
        ):
            return ProviderError(
                f"Assistant credentials are missing for the "
                f"{self.config.normalized_provider} provider.",
                state="credentials-missing",
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
            message = (
                f"Assistant provider {self.config.effective_label} "
                "is configured and ready."
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
            "self_hosted": self.config.uses_self_hosted_nim,
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

            key = (self.config.api_key or "").strip()
            if not key and not self.config.requires_api_key:
                # Local and self-hosted runtimes ignore the value, but the
                # OpenAI client refuses to construct without one.
                key = f"unused-{self.config.normalized_provider}"
            self._client = OpenAI(
                base_url=self.config.effective_api_base,
                api_key=key,
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
        kwargs: dict[str, Any] = {
            "model": self.config.model,
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
            "max_tokens": max(1, int(max_tokens)),
            "stream": stream,
            **self.config.request_extras(),
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

        if numeric_status == 429 or "ratelimit" in name or "rate limit" in text:
            return ProviderError(
                "The assistant provider is rate-limited. Please try again shortly.",
                state="rate-limited",
                http_status=429,
                retryable=True,
            )
        if numeric_status in {408, 504} or "timeout" in name or "timed out" in text:
            return ProviderError(
                "The assistant provider request timed out. Please try again.",
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
                "The assistant provider is currently unreachable.",
                state="provider-unreachable",
                http_status=503,
                retryable=True,
            )
        if numeric_status in {409, 425}:
            return ProviderError(
                "The assistant provider could not complete the request yet.",
                state="degraded",
                http_status=503,
                retryable=True,
            )
        return ProviderError(
            "The assistant provider could not complete this request.",
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
                        "message": (
                            f"Assistant provider {self.config.effective_label} "
                            "probe succeeded."
                        ),
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


# A generic name for the same class, since it serves every provider family.
OpenAICompatibleProvider = NVIDIAOpenAIProvider


class FallbackProvider:
    """Try each configured provider tier in order until one answers.

    A tier is skipped when it is unconfigured (no credential, unsupported
    provider) and abandoned when it raises. Ordering is the operator's stated
    preference, so the first healthy tier always wins and the chain only
    degrades downward under real failure.

    Streaming has one hard rule: once a tier has yielded visible text, its
    failure propagates instead of falling through. Restarting on a later tier
    would replay a partial answer and show the reader duplicated text.
    """

    def __init__(self, tiers: Sequence[AssistantProvider]) -> None:
        if not tiers:
            raise ValueError("FallbackProvider requires at least one tier")
        self._tiers = tuple(tiers)
        self._lock = threading.Lock()
        self._active_index = 0
        self._last_error: str | None = None

    @property
    def tiers(self) -> tuple[AssistantProvider, ...]:
        return self._tiers

    def _tier_label(self, provider: AssistantProvider) -> str:
        config = getattr(provider, "config", None)
        if config is not None:
            return str(getattr(config, "effective_label", "") or "provider")
        return "provider"

    def _set_active(self, index: int) -> None:
        with self._lock:
            self._active_index = index

    def _selectable(
        self, prefer_providers: Sequence[str] | None = None
    ) -> list[tuple[int, AssistantProvider]]:
        """Return tiers worth attempting, healthiest-first within the order.

        ``prefer_providers`` reorders the candidates without filtering them, so
        a routing preference can put the strongest tier first for a hard
        question while every other tier stays available as a fallback. A tier
        whose family is not named keeps its configured position behind those
        that are.
        """
        candidates: list[tuple[int, AssistantProvider]] = []
        for index, provider in enumerate(self._tiers):
            status = provider.status()
            if status.get("ready") or status.get("can_attempt"):
                candidates.append((index, provider))

        if not prefer_providers:
            return candidates

        rank = {name: order for order, name in enumerate(prefer_providers)}
        unranked = len(rank)

        def sort_key(item: tuple[int, AssistantProvider]) -> tuple[int, int]:
            index, provider = item
            # normalized_provider names the tier exactly ("gemini",
            # "nvidia", "local"); `family` is coarser and groups local under
            # "openai", which would not distinguish tiers here.
            config = getattr(provider, "config", None)
            name = str(getattr(config, "normalized_provider", "") or "")
            # Ties keep configured order, so the sort stays deterministic.
            return (rank.get(name, unranked), index)

        return sorted(candidates, key=sort_key)

    def active(self) -> AssistantProvider:
        with self._lock:
            index = min(self._active_index, len(self._tiers) - 1)
        return self._tiers[index]

    def status(self) -> dict[str, Any]:
        """Report the chain's best tier, with every tier's state attached."""
        tier_states: list[dict[str, Any]] = []
        chosen: dict[str, Any] | None = None
        chosen_index = 0

        for index, provider in enumerate(self._tiers):
            status = dict(provider.status())
            label = self._tier_label(provider)
            tier_states.append(
                {
                    "order": index,
                    "label": label,
                    "provider": status.get("provider"),
                    "runtime": status.get("runtime"),
                    "model_id": status.get("model_id"),
                    "state": status.get("state"),
                    "ready": bool(status.get("ready")),
                    "can_attempt": bool(status.get("can_attempt")),
                    "message": status.get("message"),
                }
            )
            if chosen is None and status.get("ready"):
                chosen, chosen_index = status, index

        if chosen is None:
            for index, provider in enumerate(self._tiers):
                status = dict(provider.status())
                if status.get("can_attempt"):
                    chosen, chosen_index = status, index
                    break

        if chosen is None:
            chosen = dict(self._tiers[0].status())
            chosen_index = 0

        self._set_active(chosen_index)
        merged = dict(chosen)
        merged["fallback_chain"] = tier_states
        merged["fallback_tiers"] = len(self._tiers)
        merged["active_tier"] = chosen_index
        merged["active_tier_label"] = tier_states[chosen_index]["label"]
        merged["fallback_ready_tiers"] = sum(1 for tier in tier_states if tier["ready"])
        if self._last_error and not merged.get("last_error"):
            merged["last_error"] = self._last_error
        return merged

    def probe(self) -> dict[str, Any]:
        last_error: ProviderError | None = None
        attempted: list[str] = []

        for index, provider in self._selectable():
            label = self._tier_label(provider)
            attempted.append(label)
            try:
                result = dict(provider.probe())
            except ProviderError as exc:
                last_error = exc
                self._last_error = str(exc)
                continue
            self._set_active(index)
            result["active_tier"] = index
            result["active_tier_label"] = label
            result["attempted_tiers"] = attempted
            return result

        if last_error is not None:
            raise last_error
        raise ProviderError(
            "No assistant provider tier is configured for a probe.",
            state="credentials-missing",
        )

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int,
        temperature: float,
        top_p: float,
        response_format: dict[str, Any] | None = None,
        prefer_providers: Sequence[str] | None = None,
    ) -> str:
        last_error: ProviderError | None = None

        for index, provider in self._selectable(prefer_providers):
            try:
                answer = provider.complete(
                    messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    response_format=response_format,
                )
            except ProviderError as exc:
                last_error = exc
                self._last_error = f"{self._tier_label(provider)}: {exc}"
                continue
            self._set_active(index)
            self._last_error = None
            return answer

        raise last_error or ProviderError(
            "No assistant provider tier is currently available.",
            state="degraded",
        )

    def stream(
        self,
        messages: list[dict[str, str]],
        *,
        max_tokens: int,
        temperature: float,
        top_p: float,
        cancel_event: threading.Event | None = None,
        prefer_providers: Sequence[str] | None = None,
    ) -> Iterator[str]:
        last_error: ProviderError | None = None

        for index, provider in self._selectable(prefer_providers):
            emitted = False
            try:
                for chunk in provider.stream(
                    messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p,
                    cancel_event=cancel_event,
                ):
                    emitted = True
                    yield chunk
            except ProviderError as exc:
                last_error = exc
                self._last_error = f"{self._tier_label(provider)}: {exc}"
                if emitted:
                    # Half an answer is already on screen; a retry elsewhere
                    # would duplicate it.
                    raise
                continue
            self._set_active(index)
            self._last_error = None
            return

        raise last_error or ProviderError(
            "No assistant provider tier is currently available.",
            state="degraded",
        )


def build_provider(
    config: ProviderConfig,
    *,
    client: Any | None = None,
    client_factory: Callable[..., Any] | None = None,
    sleep: Callable[[float], None] = time.sleep,
    random_value: Callable[[], float] = random.random,
    clock: Callable[[], float] = time.monotonic,
) -> NVIDIAOpenAIProvider:
    """Build the configured provider without performing network I/O."""
    return NVIDIAOpenAIProvider(
        config,
        client=client,
        client_factory=client_factory,
        sleep=sleep,
        random_value=random_value,
        clock=clock,
    )


def build_provider_chain(
    configs: Sequence[ProviderConfig],
    *,
    client: Any | None = None,
    client_factory: Callable[..., Any] | None = None,
    sleep: Callable[[float], None] = time.sleep,
    random_value: Callable[[], float] = random.random,
    clock: Callable[[], float] = time.monotonic,
) -> AssistantProvider:
    """Build a single provider, or a failover chain when several are given.

    A one-entry chain returns the bare provider so existing single-provider
    behaviour and diagnostics are completely unchanged.
    """
    if not configs:
        raise ValueError("build_provider_chain requires at least one configuration")

    providers = [
        build_provider(
            config,
            client=client,
            client_factory=client_factory,
            sleep=sleep,
            random_value=random_value,
            clock=clock,
        )
        for config in configs
    ]
    if len(providers) == 1:
        return providers[0]
    return FallbackProvider(providers)


__all__ = [
    "AssistantProvider",
    "CREDENTIALED_PROVIDERS",
    "GEMINI_API_BASE",
    "GEMINI_DEFAULT_MODEL",
    "GEMINI_RUNTIME",
    "LOCAL_API_BASE",
    "LOCAL_DEFAULT_MODEL",
    "LOCAL_RUNTIME",
    "NVIDIA_HOSTED_API_BASE",
    "NVIDIA_HOSTED_RUNTIME",
    "NVIDIA_NEMOTRON_MODEL",
    "NVIDIAOpenAIProvider",
    "OpenAICompatibleProvider",
    "PROVIDER_ALIASES",
    "PROVIDER_FAMILIES",
    "FallbackProvider",
    "ProviderConfig",
    "ProviderError",
    "build_provider",
    "build_provider_chain",
    "completion_content",
    "sanitize_response_content",
    "stream_content",
]
