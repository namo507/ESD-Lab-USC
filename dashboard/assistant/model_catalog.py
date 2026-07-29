"""Assistant model catalog and legacy selection compatibility helpers.

Weight files are owned by the Ollama server, not by this repository.  The public
function names here are retained so deployment/preparation tooling keeps
importing cleanly; every selection resolves to the configured Ollama model tag
instead of a filesystem path.
"""

from __future__ import annotations

import copy
import json
import shutil
from pathlib import Path
from typing import Any

from dashboard.assistant.provider import (
    OLLAMA_API_BASE,
    OLLAMA_DEFAULT_MODEL,
    OLLAMA_RUNTIME,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LLM_CONFIG_PATH = PROJECT_ROOT / "config" / "llm_model.json"
# Kept as a compatibility constant; Ollama stores weights under its own root.
LOCAL_MODEL_ROOT = PROJECT_ROOT / "models" / "local_llms"
DEFAULT_TIER = "local"
CATALOG_VERSION = 5
DEFAULT_THREAD_COUNT = 0

MODEL_CATALOG: tuple[dict[str, Any], ...] = (
    {
        "tier": "local",
        "label": "Ollama llama3.2 3B Instruct (local)",
        "provider": "ollama",
        "runtime": OLLAMA_RUNTIME,
        "api_base": OLLAMA_API_BASE,
        "repo_id": OLLAMA_DEFAULT_MODEL,
        "model_id": OLLAMA_DEFAULT_MODEL,
        "filename": None,
        "model_dir": None,
        "context_length": 8192,
        "max_tokens": 768,
        "temperature": 0.2,
        "top_p": 0.9,
        "license": "Llama 3.2 Community License",
        "priority": 100,
        "source": "ollama",
        "reason": (
            "Default local runtime: ~2 GB, CPU-friendly, and fast enough for "
            "short grounded dashboard answers without any provider account."
        ),
    },
)

TIER_ALIASES = {
    "": DEFAULT_TIER,
    "auto": DEFAULT_TIER,
    "default": DEFAULT_TIER,
    "local": DEFAULT_TIER,
    "ollama": DEFAULT_TIER,
    # Historical tiers now resolve to the single supported provider runtime.
    "hosted": DEFAULT_TIER,
    "nvidia": DEFAULT_TIER,
    "nvidia-build-api": DEFAULT_TIER,
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
    """Compatibility-only host probe; model selection does not use it."""
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
    """Ollama enforces its own memory limits; selection is host-independent."""
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
    return {
        "schema_version": CATALOG_VERSION,
        "policy": "ollama-local-default",
        "selected_tier": DEFAULT_TIER,
        **entry,
        "remote": {
            "enabled": False,
            "runtime": "ollama-remote",
            "api_base": "http://ollama:11434/v1",
        },
        "fallbacks": [],
        "catalog": [copy.deepcopy(entry)],
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
    return [selected] if selected else []


def find_existing_model_path(
    model: dict[str, Any], project_root: Path = PROJECT_ROOT
) -> None:
    """Weight files live in the Ollama store, never in the repository tree."""
    return None


def select_runtime_model_config(
    config: dict[str, Any],
    *,
    requested_tier: str | None = None,
    project_root: Path = PROJECT_ROOT,
) -> dict[str, Any]:
    """Normalize old or new config into the Ollama provider entry."""
    selected = copy.deepcopy(MODEL_CATALOG[0])
    if isinstance(config, dict):
        provider = str(config.get("provider") or "").strip().lower()
        if provider in {"ollama", "ollama-remote", "local"}:
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
            selected["repo_id"] = selected.get("model_id") or OLLAMA_DEFAULT_MODEL
    selected["tier"] = DEFAULT_TIER
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
