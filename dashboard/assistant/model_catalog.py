"""Local GGUF model catalog for the dashboard assistant.

The assistant intentionally uses public GGUF checkpoints and llama.cpp so it can
run without API keys. This module is the shared source of truth for model
selection, download targets, and host-fit checks.
"""

from __future__ import annotations

import copy
import json
import os
import shutil
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LLM_CONFIG_PATH = PROJECT_ROOT / "config" / "llm_model.json"
LOCAL_MODEL_ROOT = PROJECT_ROOT / "models" / "local_llms"
DEFAULT_TIER = "balanced"
CATALOG_VERSION = 3
DEFAULT_THREAD_COUNT = 4


MODEL_CATALOG: tuple[dict[str, Any], ...] = (
    {
        "tier": "tiny",
        "label": "SmolLM2 360M Q2",
        "repo_id": "bartowski/SmolLM2-360M-Instruct-GGUF",
        "filename": "SmolLM2-360M-Instruct-Q2_K.gguf",
        "model_dir": "models/local_llms/runtime",
        "params_b": 0.36,
        "context_length": 2048,
        "min_memory_gib": 0.35,
        "min_disk_gib": 0.35,
        "max_tokens": 192,
        "batch_size": 128,
        "thread_count": min(DEFAULT_THREAD_COUNT, 4),
        "temperature": 0.05,
        "top_p": 0.9,
        "license": "Apache-2.0",
        "priority": 10,
        "source": "built-in-catalog",
        "reason": "Emergency fast fallback for constrained Docker and laptop hosts.",
    },
    {
        "tier": "balanced",
        "label": "SmolLM2 1.7B Q4",
        "repo_id": "bartowski/SmolLM2-1.7B-Instruct-GGUF",
        "filename": "SmolLM2-1.7B-Instruct-Q4_K_M.gguf",
        "model_dir": "models/local_llms/SmolLM2-1.7B-Instruct-GGUF",
        "params_b": 1.7,
        "context_length": 4096,
        "min_memory_gib": 2.4,
        "min_disk_gib": 1.4,
        "max_tokens": 320,
        "batch_size": 256,
        "thread_count": DEFAULT_THREAD_COUNT,
        "temperature": 0.05,
        "top_p": 0.9,
        "license": "Apache-2.0",
        "priority": 30,
        "source": "built-in-catalog",
        "reason": "Default no-API local model: stronger grounded QA while staying CPU-friendly.",
    },
    {
        "tier": "accuracy",
        "label": "Qwen2.5 1.5B Q4",
        "repo_id": "bartowski/Qwen2.5-1.5B-Instruct-GGUF",
        "filename": "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
        "model_dir": "models/local_llms/Qwen2.5-1.5B-Instruct-GGUF",
        "params_b": 1.5,
        "context_length": 4096,
        "min_memory_gib": 2.2,
        "min_disk_gib": 1.2,
        "max_tokens": 320,
        "batch_size": 256,
        "thread_count": DEFAULT_THREAD_COUNT,
        "temperature": 0.05,
        "top_p": 0.9,
        "license": "Apache-2.0",
        "priority": 25,
        "source": "built-in-catalog",
        "reason": "Accuracy-oriented 1.5B fallback for hosts that already carry Qwen GGUFs.",
    },
    {
        "tier": "quality",
        "label": "Qwen2.5 3B Q4",
        "repo_id": "bartowski/Qwen2.5-3B-Instruct-GGUF",
        "filename": "Qwen2.5-3B-Instruct-Q4_K_M.gguf",
        "model_dir": "models/local_llms/Qwen2.5-3B-Instruct-GGUF",
        "params_b": 3.09,
        "context_length": 8192,
        "min_memory_gib": 5.0,
        "min_disk_gib": 2.4,
        "max_tokens": 384,
        "batch_size": 256,
        "thread_count": DEFAULT_THREAD_COUNT,
        "temperature": 0.05,
        "top_p": 0.9,
        "license": "Qwen Research License",
        "priority": 40,
        "source": "built-in-catalog",
        "reason": "Optional larger local model for workstation hosts with more memory headroom.",
    },
    {
        "tier": "clinical",
        "label": "BioMistral 7B Q4",
        "repo_id": "BioMistral/BioMistral-7B-GGUF",
        "filename": "ggml-model-Q4_K_M.gguf",
        "model_dir": "models/local_llms/BioMistral-7B-GGUF",
        "params_b": 7.0,
        "context_length": 2048,
        "min_memory_gib": 8.5,
        "min_disk_gib": 4.7,
        "max_tokens": 384,
        "batch_size": 128,
        "thread_count": DEFAULT_THREAD_COUNT,
        "temperature": 0.03,
        "top_p": 0.85,
        "license": "Apache-2.0",
        "priority": 55,
        "source": "built-in-catalog",
        "reason": (
            "Preferred no-API clinical tier for biomedical and psychiatric "
            "dashboard questions; falls back automatically on smaller hosts."
        ),
    },
)


TIER_ALIASES = {
    "default": DEFAULT_TIER,
    "fast": "tiny",
    "small": "tiny",
    "balanced": "balanced",
    "smart": "balanced",
    "accurate": "accuracy",
    "accuracy": "accuracy",
    "quality": "quality",
    "large": "quality",
    "clinical": "clinical",
    "medical": "clinical",
    "biomedical": "clinical",
    "biomistral": "clinical",
    "auto": "auto",
}


def catalog_models() -> list[dict[str, Any]]:
    """Return defensive copies of the built-in catalog entries."""
    return [copy.deepcopy(model) for model in MODEL_CATALOG]


def normalize_tier(tier: str | None) -> str:
    value = (tier or "auto").strip().lower()
    return TIER_ALIASES.get(value, value)


def available_memory_gib() -> float:
    """Best-effort cross-platform available-memory probe."""
    try:
        import psutil  # type: ignore

        return float(psutil.virtual_memory().available) / 1024 / 1024 / 1024
    except Exception:
        pass

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


def free_disk_gib(path: Path = PROJECT_ROOT) -> float:
    usage = shutil.disk_usage(path)
    return float(usage.free) / 1024 / 1024 / 1024


def model_key(model: dict[str, Any]) -> str:
    return f"{model.get('repo_id', '')}|{model.get('filename', '')}"


def model_dir_for(model: dict[str, Any], project_root: Path = PROJECT_ROOT) -> Path:
    configured = str(model.get("model_dir") or "").strip()
    if configured:
        path = Path(configured)
        return path if path.is_absolute() else project_root / path

    repo_name = str(model.get("repo_id") or "runtime").split("/")[-1]
    return project_root / "models" / "local_llms" / repo_name


def model_fits_host(
    model: dict[str, Any],
    *,
    memory_gib: float | None = None,
    disk_free_gib: float | None = None,
    include_disk: bool = False,
) -> bool:
    if memory_gib and memory_gib > 0:
        if float(model.get("min_memory_gib") or 0.0) > memory_gib:
            return False
    if include_disk and disk_free_gib and disk_free_gib > 0:
        min_disk = float(model.get("min_disk_gib") or 0.0)
        if min_disk + 0.25 > disk_free_gib:
            return False
    return True


def select_catalog_model(
    *,
    tier: str | None = None,
    memory_gib: float | None = None,
    disk_free_gib: float | None = None,
) -> dict[str, Any]:
    """Select a catalog entry for this host.

    Explicit tiers are honored even when they are optimistic for the current
    host. The "auto" tier chooses the highest-priority model that fits memory
    and disk, falling back to the balanced default when probes are unavailable.
    """
    normalized = normalize_tier(tier)
    models = catalog_models()

    if normalized != "auto":
        for model in models:
            if model.get("tier") == normalized:
                return model

    if not memory_gib or memory_gib <= 0:
        for model in models:
            if model.get("tier") == DEFAULT_TIER:
                return model

    fitting = [
        model
        for model in models
        if model_fits_host(
            model,
            memory_gib=memory_gib,
            disk_free_gib=disk_free_gib,
            include_disk=bool(disk_free_gib),
        )
    ]
    if fitting:
        return sorted(fitting, key=lambda item: item.get("priority", 0), reverse=True)[0]

    return sorted(models, key=lambda item: item.get("min_memory_gib", 0.0))[0]


def build_llm_config(selected: dict[str, Any]) -> dict[str, Any]:
    primary = _public_model_entry(selected)
    fallback_entries = [
        _public_model_entry(model)
        for model in sorted(
            catalog_models(), key=lambda item: item["priority"], reverse=True
        )
        if model_key(model) != model_key(primary)
    ]

    return {
        "schema_version": CATALOG_VERSION,
        "policy": "local-free-no-api",
        "selected_tier": primary.get("tier", DEFAULT_TIER),
        **primary,
        "fallbacks": fallback_entries,
        "catalog": [_public_model_entry(model) for model in catalog_models()],
    }


def write_llm_config(
    config: dict[str, Any],
    path: Path = DEFAULT_LLM_CONFIG_PATH,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(config, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )


def read_llm_config(path: Path = DEFAULT_LLM_CONFIG_PATH) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def configured_models(
    config: dict[str, Any],
    *,
    requested_tier: str | None = None,
) -> list[dict[str, Any]]:
    """Expand primary, fallback, and v2 catalog model entries in priority order."""
    models: list[dict[str, Any]] = []

    normalized_tier = normalize_tier(requested_tier)
    catalog = config.get("catalog") if isinstance(config.get("catalog"), list) else []
    if requested_tier and normalized_tier != "auto":
        models.extend(
            entry
            for entry in catalog
            if isinstance(entry, dict)
            and normalize_tier(str(entry.get("tier"))) == normalized_tier
        )

    primary = {
        key: value
        for key, value in config.items()
        if key not in {"fallbacks", "catalog"}
    }
    if primary.get("repo_id") or primary.get("filename"):
        models.append(primary)

    fallbacks = config.get("fallbacks") or []
    models.extend(entry for entry in fallbacks if isinstance(entry, dict))

    if catalog:
        models.extend(entry for entry in catalog if isinstance(entry, dict))

    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for model in models:
        key = model_key(model)
        if key in seen or not (model.get("repo_id") and model.get("filename")):
            continue
        seen.add(key)
        deduped.append(copy.deepcopy(model))
    return deduped


def find_existing_model_path(
    model: dict[str, Any],
    project_root: Path = PROJECT_ROOT,
) -> Path | None:
    filename = str(model.get("filename") or "").strip()
    if not filename:
        return None

    search_roots = [
        model_dir_for(model, project_root),
        project_root / "models",
        project_root / "models" / "local_llms",
        project_root / "models" / "local_llms" / "runtime",
    ]
    seen: set[Path] = set()

    for root in search_roots:
        try:
            root = root.resolve()
        except Exception:
            continue
        if root in seen or not root.exists():
            continue
        seen.add(root)

        direct_path = root / filename
        if direct_path.exists():
            return direct_path

        matches = sorted(root.rglob(filename))
        if matches:
            return matches[0]

    return None


def select_runtime_model_config(
    config: dict[str, Any],
    *,
    requested_tier: str | None = None,
    project_root: Path = PROJECT_ROOT,
) -> dict[str, Any]:
    candidates = configured_models(config, requested_tier=requested_tier)
    if not candidates:
        return {}

    memory_gib = available_memory_gib()
    selected_priority = candidates[0].get("priority", 0)
    first_present: dict[str, Any] | None = None
    for candidate in candidates:
        resolved_path = find_existing_model_path(candidate, project_root)
        if resolved_path is None:
            continue
        selected = copy.deepcopy(candidate)
        selected["resolved_path"] = str(resolved_path)
        if first_present is None:
            first_present = selected
        if (not memory_gib or memory_gib <= 0) and (
            candidate.get("priority", 0) > selected_priority
        ):
            continue
        if model_fits_host(selected, memory_gib=memory_gib):
            return selected

    if first_present is not None:
        return first_present

    return copy.deepcopy(candidates[0])


def _public_model_entry(model: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "tier",
        "label",
        "repo_id",
        "filename",
        "model_dir",
        "params_b",
        "context_length",
        "min_memory_gib",
        "min_disk_gib",
        "max_tokens",
        "batch_size",
        "thread_count",
        "temperature",
        "top_p",
        "license",
        "priority",
        "source",
        "reason",
    )
    return {key: copy.deepcopy(model[key]) for key in keys if key in model}
