"""Resilient OpenAI-compatible providers for the dashboard assistant.

The dashboard defaults to NVIDIA's hosted build API.  A self-hosted NVIDIA
NIM endpoint uses the same protocol, but is accepted only after the explicit
``DASHBOARD_ASSISTANT_SELF_HOSTED_ENABLED`` opt-in has been set.  Importing this
module never imports the OpenAI SDK or contacts the provider, which keeps the
dashboard process healthy when assistant dependencies or credentials are not
available.
"""

from __future__ import annotations

import importlib.util
import random
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, Iterator, Protocol

NVIDIA_HOSTED_API_BASE = "https://integrate.api.nvidia.com/v1"
NVIDIA_NEMOTRON_MODEL = "nvidia/nemotron-3-super-120b-a12b"
NVIDIA_HOSTED_RUNTIME = "nvidia-build-api"
NVIDIA_SELF_HOSTED_RUNTIME = "nvidia-nim"

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
}


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
    enable_thinking: bool = True
    reasoning_budget: int = 16384
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

    @property
    def normalized_provider(self) -> str:
        value = (self.provider or "nvidia").strip().lower()
        return PROVIDER_ALIASES.get(value, value)

    @property
    def uses_self_hosted_nim(self) -> bool:
        return self.normalized_provider == "nvidia-nim"

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


def completion_content(response: Any) -> str:
    choices = _read_attr(response, "choices", []) or []
    if not choices:
        return ""
    message = _read_attr(choices[0], "message", {}) or {}
    return _content_text(_read_attr(message, "content", "")).strip()


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
        if self.config.normalized_provider not in {"nvidia", "nvidia-nim"}:
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
            not self.config.uses_self_hosted_nim
            and not (self.config.api_key or "").strip()
            and self._client is None
            and self._client_factory is None
        ):
            return ProviderError(
                "NVIDIA assistant credentials are missing.",
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
            message = "NVIDIA assistant provider is configured and ready."

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
            if self.config.uses_self_hosted_nim and not key:
                key = "self-hosted-nim"
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
            "extra_body": {
                "chat_template_kwargs": {
                    "enable_thinking": bool(self.config.enable_thinking)
                },
                "reasoning_budget": max(0, int(self.config.reasoning_budget)),
            },
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
                "The NVIDIA assistant is rate-limited. Please try again shortly.",
                state="rate-limited",
                http_status=429,
                retryable=True,
            )
        if numeric_status in {408, 504} or "timeout" in name or "timed out" in text:
            return ProviderError(
                "The NVIDIA assistant request timed out. Please try again.",
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
                "The NVIDIA assistant provider is currently unreachable.",
                state="provider-unreachable",
                http_status=503,
                retryable=True,
            )
        if numeric_status in {409, 425}:
            return ProviderError(
                "The NVIDIA assistant could not complete the request yet.",
                state="degraded",
                http_status=503,
                retryable=True,
            )
        return ProviderError(
            "The NVIDIA assistant could not complete this request.",
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
                        "message": "NVIDIA assistant provider probe succeeded.",
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
                            yield content
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


__all__ = [
    "AssistantProvider",
    "NVIDIA_HOSTED_API_BASE",
    "NVIDIA_HOSTED_RUNTIME",
    "NVIDIA_NEMOTRON_MODEL",
    "NVIDIAOpenAIProvider",
    "ProviderConfig",
    "ProviderError",
    "build_provider",
    "completion_content",
    "stream_content",
]
