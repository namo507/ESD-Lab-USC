#!/usr/bin/env python3
"""Validate and prepare the Ollama-backed dashboard assistant.

This command performs no generation by default. It validates the environment,
reports a sanitized readiness state, checks that the configured model is
installed in Ollama, and can refresh repository grounding.  ``--probe-provider``
uses the provider abstraction's non-generation probe; ``--ensure-model`` pulls
the configured model when it is missing.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.assistant import ollama_runtime  # noqa: E402
from dashboard.assistant.local_chat_assistant import (  # noqa: E402
    DashboardChatAssistant,
)


def _load_dotenv() -> None:
    try:
        from dotenv import load_dotenv
    except Exception:
        return
    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        load_dotenv(env_path, override=False)


def _install_dependencies(*, dry_run: bool) -> None:
    requirements = PROJECT_ROOT / "dashboard" / "requirements.txt"
    command = [sys.executable, "-m", "pip", "install", "-r", str(requirements)]
    if dry_run:
        print("would_install_dependencies: " + " ".join(command))
        return
    subprocess.check_call(command)


def _sanitize(value: Any) -> Any:
    """Remove secret-shaped fields before printing operator diagnostics."""
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            lowered = str(key).lower()
            if any(part in lowered for part in ("api_key", "token", "authorization")):
                continue
            cleaned[str(key)] = _sanitize(item)
        return cleaned
    if isinstance(value, (list, tuple)):
        return [_sanitize(item) for item in value]
    return value


def _provider_probe(assistant: DashboardChatAssistant) -> dict[str, Any]:
    method = getattr(assistant, "probe_provider", None)
    if callable(method):
        result = method()
        if isinstance(result, dict):
            if "ready" not in result and "ok" in result:
                result = {**result, "ready": bool(result.get("ok"))}
            return result
        return {"ready": bool(result)}

    provider = getattr(assistant, "provider", None) or getattr(
        assistant, "_provider", None
    )
    method = getattr(provider, "probe", None)
    if not callable(method):
        raise RuntimeError(
            "The configured assistant provider does not expose a non-generation probe."
        )
    result = method()
    if isinstance(result, dict):
        if "ready" not in result and "ok" in result:
            result = {**result, "ready": bool(result.get("ok"))}
        return result
    return {"ready": bool(result)}


def _reindex(assistant: DashboardChatAssistant, *, dry_run: bool) -> dict[str, Any]:
    if dry_run:
        return {
            "reindexed": False,
            "dry_run": True,
            "source": "dashboard/data/dashboard_data.json",
        }
    context = assistant.build_context(
        "When was REDCap last synced and how many carry-forward anomalies are active?"
    )
    citations = list(context.get("citations") or [])
    return {
        "reindexed": True,
        "citation_count": len(citations),
        "citations": citations,
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate and prepare the Ollama dashboard assistant."
    )
    parser.add_argument(
        "--validate-config",
        action="store_true",
        help="Validate canonical provider configuration (the default action).",
    )
    parser.add_argument(
        "--probe-provider",
        action="store_true",
        help="Run the provider abstraction's non-generation connectivity probe.",
    )
    parser.add_argument(
        "--reindex",
        action="store_true",
        help="Refresh repository grounding context without generating text.",
    )
    parser.add_argument(
        "--require-ready",
        action="store_true",
        help="Exit non-zero unless provider status is ready.",
    )
    parser.add_argument(
        "--ensure-model",
        action="store_true",
        help="Pull the configured Ollama model when it is not installed yet.",
    )
    parser.add_argument(
        "--warm-model",
        action="store_true",
        help="Preload the model so the first dashboard question is not a cold start.",
    )
    parser.add_argument(
        "--install-deps",
        action="store_true",
        help="Install dashboard/requirements.txt before validating.",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    _load_dotenv()
    args = parse_args(argv)

    if args.install_deps:
        _install_dependencies(dry_run=args.dry_run)

    assistant = DashboardChatAssistant()
    status = _sanitize(assistant.get_status())
    payload: dict[str, Any] = {"status": status}

    host = ollama_runtime.host_from_api_base(str(status.get("api_base") or ""))
    model = str(status.get("model_id") or "")
    runtime_health = ollama_runtime.health(model, host)
    payload["runtime"] = runtime_health

    if args.ensure_model and not args.dry_run and runtime_health.get("reachable"):
        try:
            pulled = ollama_runtime.ensure_model(
                model, host, on_progress=lambda line: print(f"pull: {line}")
            )
            payload["model_pull"] = {"ok": True, "pulled": pulled}
            runtime_health = ollama_runtime.health(model, host)
            payload["runtime"] = runtime_health
        except ollama_runtime.OllamaRuntimeError as exc:
            payload["model_pull"] = {"ok": False, "error": str(exc)}

    if args.warm_model and not args.dry_run and runtime_health.get("model_installed"):
        try:
            payload["model_warm"] = {"ok": ollama_runtime.warm_model(model, host)}
        except ollama_runtime.OllamaRuntimeError as exc:
            payload["model_warm"] = {"ok": False, "error": str(exc)}

    if args.reindex:
        payload["grounding"] = _sanitize(_reindex(assistant, dry_run=args.dry_run))

    probe_ready = True
    if args.probe_provider and not args.dry_run:
        try:
            probe = _sanitize(_provider_probe(assistant))
        except Exception as exc:  # provider returns sanitized failures; keep CLI safe
            probe = {
                "ready": False,
                "state": getattr(exc, "state", "degraded"),
                "message": str(exc),
            }
        payload["probe"] = probe
        probe_ready = bool(probe.get("ready"))

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True, default=str))
    else:
        print(f"provider: {status.get('provider', 'ollama')}")
        print(f"runtime: {status.get('runtime', 'ollama')}")
        print(f"model: {status.get('model_id') or status.get('model') or 'unknown'}")
        print(f"state: {status.get('state', 'degraded')}")
        print(f"ready: {bool(status.get('ready'))}")
        print(f"message: {status.get('message', '')}")
        print(f"ollama_host: {runtime_health.get('host', '')}")
        print(f"ollama_reachable: {bool(runtime_health.get('reachable'))}")
        print(f"ollama_version: {runtime_health.get('version') or 'unknown'}")
        print(f"model_installed: {bool(runtime_health.get('model_installed'))}")
        if not runtime_health.get("reachable"):
            print("hint: start the runtime with `make ollama-up`")
        elif not runtime_health.get("model_installed"):
            print(f"hint: install the model with `make ollama-pull` ({model})")
        if "grounding" in payload:
            print(
                "grounding_reindexed: "
                f"{bool(payload['grounding'].get('reindexed'))} "
                f"citations={payload['grounding'].get('citation_count', 0)}"
            )
        if "probe" in payload:
            print(f"probe_state: {payload['probe'].get('state', 'unknown')}")
            print(f"probe_ready: {bool(payload['probe'].get('ready'))}")
            print(f"probe_message: {payload['probe'].get('message', '')}")

    runtime_ready = bool(
        runtime_health.get("reachable") and runtime_health.get("model_installed")
    )
    if args.require_ready and (
        not status.get("ready") or not probe_ready or not runtime_ready
    ):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
