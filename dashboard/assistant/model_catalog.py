"""Assistant model/provider catalog and legacy compatibility helpers.

Docker Model Runner owns the local OCI artifact and serves it over an
OpenAI-compatible endpoint; the repository never stores model weights.  Hosted
Nemotron remains the second provider in the documented runtime chain.
"""

from __future__ import annotations

import copy
import json
import shutil
from pathlib import Path
from typing import Any

from dashboard.assistant.provider import (
    DOCKER_MODEL_RUNNER_API_BASE,
    DOCKER_MODEL_RUNNER_MODEL,
    DOCKER_MODEL_RUNNER_RUNTIME,
    NVIDIA_HOSTED_API_BASE,
    NVIDIA_HOSTED_RUNTIME,
    NVIDIA_NEMOTRON_MODEL,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LLM_CONFIG_PATH = PROJECT_ROOT / "config" / "llm_model.json"
# Kept as a compatibility constant; no runtime path reads from this directory.
LOCAL_MODEL_ROOT = PROJECT_ROOT / "models" / "local_llms"
DEFAULT_TIER = "local-primary"
CATALOG_VERSION = 5
DEFAULT_THREAD_COUNT = 0

MODEL_CATALOG: tuple[dict[str, Any], ...] = (
    {
        "tier": "local-primary",
        "label": "Qwen 3.5 4B Q4_K_M",
        "provider": "docker-model-runner",
        "runtime": DOCKER_MODEL_RUNNER_RUNTIME,
        "api_base": DOCKER_MODEL_RUNNER_API_BASE,
        "repo_id": DOCKER_MODEL_RUNNER_MODEL,
        "model_id": DOCKER_MODEL_RUNNER_MODEL,
        "filename": None,
        "model_dir": None,
        "context_length": 8192,
        "max_tokens": 256,
        "temperature": 0.2,
        "top_p": 0.95,
        "license": "See Docker model artifact metadata",
        "priority": 100,
        "source": "docker-model-runner",
        "reason": (
            "Compact local primary selected for low-latency private inference; "
            "Compose injects its endpoint and model identifier."
        ),
    },
    {
        "tier": "hosted-fallback",
        "label": "NVIDIA Nemotron 3 Super 120B A12B",
        "provider": "nvidia",
        "runtime": NVIDIA_HOSTED_RUNTIME,
        "api_base": NVIDIA_HOSTED_API_BASE,
        "repo_id": NVIDIA_NEMOTRON_MODEL,
        "model_id": NVIDIA_NEMOTRON_MODEL,
        "filename": None,
        "model_dir": None,
        "context_length": 32768,
        "max_tokens": 256,
        "temperature": 0.2,
        "top_p": 0.95,
        "license": "NVIDIA API terms",
        "priority": 50,
        "source": "nvidia-build-api",
        "reason": (
            "Hosted quality fallback used only when the local provider fails "
            "before any visible response text."
        ),
    },
)

TIER_ALIASES = {
    "": DEFAULT_TIER,
    "auto": DEFAULT_TIER,
    "default": DEFAULT_TIER,
    "hosted": DEFAULT_TIER,
    "hosted-fallback": DEFAULT_TIER,
    "local-primary": DEFAULT_TIER,
    "docker": DEFAULT_TIER,
    "dmr": DEFAULT_TIER,
    "docker-model-runner": DEFAULT_TIER,
    "nvidia": DEFAULT_TIER,
    "nvidia-build-api": DEFAULT_TIER,
    # Historical tiers now resolve to the single supported provider runtime.
    "tiny": DEFAULT_TIER,
    "fast": DEFAULT_TIER,
    "small": DEFAULT_TIER,
    "balanced": DEFAULT_TIER,
    "smart": DEFAULT_TIER,
    "accurate": DEFAULT_TIER,
    "accuracy": DEFAULT_TIER,
    "quality": DEFAULT_TIER,
    "large": DEFAULT_TIER,
    "clinical": DEFAULT_TIER,
    "medical": DEFAULT_TIER,
    "biomedical": DEFAULT_TIER,
}


def catalog_models() -> list[dict[str, Any]]:
    return [copy.deepcopy(model) for model in MODEL_CATALOG]


def normalize_tier(tier: str | None) -> str:
    value = (tier or DEFAULT_TIER).strip().lower()
    return TIER_ALIASES.get(value, value)


def available_memory_gib() -> float:
    """Compatibility-only host probe; provider selection does not use it."""
    try:
        import psutil  # type: ignore

        return float(psutil.virtual_memory().available) / 1024 / 1024 / 1024
    except Exception:
        return 0.0


def free_disk_gib(path: Path = PROJECT_ROOT) -> float:
    return float(shutil.disk_usage(path).free) / 1024 / 1024 / 1024


def model_key(model: dict[str, Any]) -> str:
    return str(model.get("model_id") or model.get("repo_id") or "")


def model_dir_for(model: dict[str, Any], project_root: Path = PROJECT_ROOT) -> Path:
    """Return a harmless compatibility path; provider runtime ignores it."""
    configured = str(model.get("model_dir") or "").strip()
    if configured:
        path = Path(configured)
        return path if path.is_absolute() else project_root / path
    return project_root / "models" / "local_llms"


def model_fits_host(
    model: dict[str, Any],
    *,
    memory_gib: float | None = None,
    disk_free_gib: float | None = None,
    include_disk: bool = False,
) -> bool:
    """Hosted selection is independent of dashboard host memory and disk."""
    return True


def select_catalog_model(
    *,
    tier: str | None = None,
    memory_gib: float | None = None,
    disk_free_gib: float | None = None,
) -> dict[str, Any]:
    return copy.deepcopy(MODEL_CATALOG[0])


def build_llm_config(selected: dict[str, Any] | None = None) -> dict[str, Any]:
    entry = _public_model_entry(selected or MODEL_CATALOG[0])
    fallback = _public_model_entry(MODEL_CATALOG[1])
    return {
        "schema_version": CATALOG_VERSION,
        "policy": "local-first-hosted-fallback",
        "selected_tier": DEFAULT_TIER,
        **entry,
        "self_hosted": {
            "enabled": False,
            "runtime": "nvidia-nim",
            "api_base": "http://nemotron-nim:8000/v1",
        },
        "fallbacks": [fallback],
        "failover": {
            "trigger": "provider failure before first visible streamed token",
            "final_fallback": "deterministic repository-grounded answer",
        },
        "adaptation": {
            "strategy": "retrieval-augmented-generation",
            "fine_tuned": False,
            "evaluation_gate": "make assistant-eval",
        },
        "catalog": [copy.deepcopy(entry), copy.deepcopy(fallback)],
    }


def write_llm_config(
    config: dict[str, Any], path: Path = DEFAULT_LLM_CONFIG_PATH
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(config, indent=2, ensure_ascii=True) + "\n", encoding="utf-8"
    )


def read_llm_config(path: Path = DEFAULT_LLM_CONFIG_PATH) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def configured_models(
    config: dict[str, Any], *, requested_tier: str | None = None
) -> list[dict[str, Any]]:
    selected = select_runtime_model_config(
        config, requested_tier=requested_tier, project_root=PROJECT_ROOT
    )
    configured = [selected] if selected else []
    for fallback in config.get("fallbacks", []) if isinstance(config, dict) else []:
        if isinstance(fallback, dict):
            configured.append(copy.deepcopy(fallback))
    return configured


def find_existing_model_path(
    model: dict[str, Any], project_root: Path = PROJECT_ROOT
) -> None:
    """Local model files are intentionally not part of the provider runtime."""
    return None


def select_runtime_model_config(
    config: dict[str, Any],
    *,
    requested_tier: str | None = None,
    project_root: Path = PROJECT_ROOT,
) -> dict[str, Any]:
    """Normalize old or new config into an allowlisted provider entry."""
    selected = copy.deepcopy(MODEL_CATALOG[0])
    if isinstance(config, dict):
        provider = str(config.get("provider") or "").strip().lower()
        if provider in {"nvidia", "nvidia-nim", "nim"}:
            selected = copy.deepcopy(MODEL_CATALOG[1])
        if provider in {
            "docker",
            "dmr",
            "docker-model-runner",
            "local",
            "nvidia",
            "nvidia-nim",
            "nim",
        }:
            for source_key, target_key in (
                ("provider", "provider"),
                ("runtime", "runtime"),
                ("api_base", "api_base"),
                ("model", "model_id"),
                ("model_id", "model_id"),
                ("repo_id", "repo_id"),
                ("label", "label"),
                ("max_tokens", "max_tokens"),
                ("temperature", "temperature"),
                ("top_p", "top_p"),
            ):
                value = config.get(source_key)
                if value not in {None, ""}:
                    selected[target_key] = copy.deepcopy(value)
            selected["repo_id"] = selected.get("model_id") or selected.get("repo_id")
    selected["tier"] = str(selected.get("tier") or DEFAULT_TIER)
    selected["filename"] = None
    selected["model_dir"] = None
    selected.pop("resolved_path", None)
    return selected


def _public_model_entry(model: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "tier",
        "label",
        "provider",
        "runtime",
        "api_base",
        "repo_id",
        "model_id",
        "filename",
        "model_dir",
        "context_length",
        "max_tokens",
        "temperature",
        "top_p",
        "license",
        "priority",
        "source",
        "reason",
    )
    return {key: copy.deepcopy(model.get(key)) for key in keys}


__all__ = [
    "CATALOG_VERSION",
    "DEFAULT_LLM_CONFIG_PATH",
    "DEFAULT_TIER",
    "LOCAL_MODEL_ROOT",
    "MODEL_CATALOG",
    "available_memory_gib",
    "build_llm_config",
    "catalog_models",
    "configured_models",
    "find_existing_model_path",
    "free_disk_gib",
    "model_dir_for",
    "model_fits_host",
    "model_key",
    "normalize_tier",
    "read_llm_config",
    "select_catalog_model",
    "select_runtime_model_config",
    "write_llm_config",
]
