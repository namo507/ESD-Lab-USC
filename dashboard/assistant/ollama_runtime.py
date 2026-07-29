"""Dependency-free client for Ollama's native management API.

Chat generation goes through :mod:`dashboard.assistant.provider` and Ollama's
OpenAI-compatible ``/v1`` surface.  Model management (health, installed tags,
pull, preload) has no OpenAI equivalent, so it is handled here with the standard
library only: operator tooling must keep working before dashboard dependencies
are installed, and importing this module never performs I/O.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Callable, Iterator

DEFAULT_HOST = "http://127.0.0.1:11434"
DEFAULT_TIMEOUT_SECONDS = 5.0
PULL_TIMEOUT_SECONDS = 1800.0
DEFAULT_KEEP_ALIVE = "30m"


class OllamaRuntimeError(RuntimeError):
    """Ollama management call failed in a way the operator should see."""


def host_from_api_base(api_base: str | None) -> str:
    """Return the Ollama root URL for an OpenAI-compatible ``/v1`` base URL."""
    candidate = (api_base or "").strip().rstrip("/")
    if not candidate:
        return DEFAULT_HOST
    if not candidate.lower().startswith(("http://", "https://")):
        candidate = f"http://{candidate}"
    if candidate.lower().endswith("/v1"):
        candidate = candidate[: -len("/v1")]
    return candidate.rstrip("/") or DEFAULT_HOST


def _request(
    host: str,
    path: str,
    *,
    payload: dict[str, Any] | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> Any:
    url = f"{host_from_api_base(host)}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", "replace").strip()
    except urllib.error.HTTPError as exc:  # pragma: no cover - network edge
        detail = exc.read().decode("utf-8", "replace").strip()
        raise OllamaRuntimeError(f"Ollama returned HTTP {exc.code}: {detail}") from exc
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise OllamaRuntimeError(f"Ollama is not reachable at {host}: {exc}") from exc
    if not body:
        return {}
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:  # pragma: no cover - network edge
        raise OllamaRuntimeError("Ollama returned a non-JSON response.") from exc


def _stream_ndjson(
    host: str,
    path: str,
    payload: dict[str, Any],
    *,
    timeout: float,
) -> Iterator[dict[str, Any]]:
    url = f"{host_from_api_base(host)}{path}"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/x-ndjson"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            for raw_line in response:
                line = raw_line.decode("utf-8", "replace").strip()
                if not line:
                    continue
                try:
                    parsed = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, dict):
                    yield parsed
    except urllib.error.HTTPError as exc:  # pragma: no cover - network edge
        detail = exc.read().decode("utf-8", "replace").strip()
        raise OllamaRuntimeError(f"Ollama returned HTTP {exc.code}: {detail}") from exc
    except (urllib.error.URLError, OSError) as exc:
        raise OllamaRuntimeError(f"Ollama is not reachable at {host}: {exc}") from exc


def server_version(
    host: str = DEFAULT_HOST, *, timeout: float = DEFAULT_TIMEOUT_SECONDS
) -> str:
    payload = _request(host, "/api/version", timeout=timeout)
    return str(payload.get("version") or "") if isinstance(payload, dict) else ""


def installed_models(
    host: str = DEFAULT_HOST, *, timeout: float = DEFAULT_TIMEOUT_SECONDS
) -> list[str]:
    payload = _request(host, "/api/tags", timeout=timeout)
    models = payload.get("models") if isinstance(payload, dict) else None
    if not isinstance(models, list):
        return []
    names: list[str] = []
    for entry in models:
        if isinstance(entry, dict):
            name = str(entry.get("name") or entry.get("model") or "").strip()
            if name:
                names.append(name)
    return sorted(names)


def model_installed(
    model: str,
    host: str = DEFAULT_HOST,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> bool:
    """Report whether ``model`` is present, tolerating an implicit ``:latest``."""
    wanted = (model or "").strip()
    if not wanted:
        return False
    names = installed_models(host, timeout=timeout)
    variants = {wanted, f"{wanted}:latest"}
    if wanted.endswith(":latest"):
        variants.add(wanted[: -len(":latest")])
    return any(name in variants for name in names)


def pull_model(
    model: str,
    host: str = DEFAULT_HOST,
    *,
    timeout: float = PULL_TIMEOUT_SECONDS,
    on_progress: Callable[[str], None] | None = None,
) -> bool:
    """Download ``model`` into the Ollama server, reporting coarse progress."""
    wanted = (model or "").strip()
    if not wanted:
        raise OllamaRuntimeError("No Ollama model name was provided to pull.")

    last_status = ""
    last_percent = -1
    for event in _stream_ndjson(
        host, "/api/pull", {"model": wanted, "stream": True}, timeout=timeout
    ):
        error = str(event.get("error") or "").strip()
        if error:
            raise OllamaRuntimeError(f"Ollama could not pull {wanted}: {error}")
        status = str(event.get("status") or "").strip()
        total = event.get("total")
        completed = event.get("completed")
        percent = -1
        if isinstance(total, (int, float)) and total > 0:
            done = completed if isinstance(completed, (int, float)) else 0
            percent = int(min(100.0, max(0.0, (done / total) * 100.0)))
        if on_progress is not None and status:
            # Report each new phase, and each whole 5% of a download phase.
            if status != last_status or (percent >= 0 and percent // 5 != last_percent // 5):
                suffix = f" {percent}%" if percent >= 0 else ""
                on_progress(f"{status}{suffix}")
        if status:
            last_status = status
        if percent >= 0:
            last_percent = percent
    return True


def ensure_model(
    model: str,
    host: str = DEFAULT_HOST,
    *,
    timeout: float = PULL_TIMEOUT_SECONDS,
    on_progress: Callable[[str], None] | None = None,
) -> bool:
    """Pull ``model`` only when it is missing; return ``True`` if a pull ran."""
    if model_installed(model, host):
        return False
    pull_model(model, host, timeout=timeout, on_progress=on_progress)
    return True


def warm_model(
    model: str,
    host: str = DEFAULT_HOST,
    *,
    keep_alive: str = DEFAULT_KEEP_ALIVE,
    timeout: float = 300.0,
) -> bool:
    """Preload ``model`` so the first dashboard question is not a cold start."""
    payload = {"model": model, "prompt": "", "stream": False, "keep_alive": keep_alive}
    result = _request(host, "/api/generate", payload=payload, timeout=timeout)
    return bool(isinstance(result, dict) and not result.get("error"))


def health(
    model: str | None = None,
    host: str = DEFAULT_HOST,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Return a sanitized runtime snapshot for operator tooling and status."""
    snapshot: dict[str, Any] = {
        "host": host_from_api_base(host),
        "reachable": False,
        "version": "",
        "models": [],
        "model": model or "",
        "model_installed": False,
        "error": None,
    }
    try:
        snapshot["version"] = server_version(host, timeout=timeout)
        snapshot["models"] = installed_models(host, timeout=timeout)
        snapshot["reachable"] = True
    except OllamaRuntimeError as exc:
        snapshot["error"] = str(exc)
        return snapshot
    if model:
        variants = {model, f"{model}:latest"}
        snapshot["model_installed"] = any(
            name in variants for name in snapshot["models"]
        )
    return snapshot


__all__ = [
    "DEFAULT_HOST",
    "DEFAULT_KEEP_ALIVE",
    "OllamaRuntimeError",
    "ensure_model",
    "health",
    "host_from_api_base",
    "installed_models",
    "model_installed",
    "pull_model",
    "server_version",
    "warm_model",
]
