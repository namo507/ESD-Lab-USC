"""Tests for the NVIDIA assistant provider catalog."""

from __future__ import annotations

from dashboard.assistant.model_catalog import (
    CATALOG_VERSION,
    build_llm_config,
    find_existing_model_path,
    normalize_tier,
    select_catalog_model,
    select_runtime_model_config,
)
from dashboard.assistant.provider import (
    NVIDIA_HOSTED_API_BASE,
    NVIDIA_HOSTED_RUNTIME,
    NVIDIA_NEMOTRON_MODEL,
)


def test_catalog_selects_nvidia_hosted_independent_of_host_capacity():
    constrained = select_catalog_model(memory_gib=0.25, disk_free_gib=0.1)
    capable = select_catalog_model(memory_gib=256.0, disk_free_gib=1000.0)

    assert constrained == capable
    assert constrained["provider"] == "nvidia"
    assert constrained["runtime"] == NVIDIA_HOSTED_RUNTIME
    assert constrained["api_base"] == NVIDIA_HOSTED_API_BASE
    assert constrained["model_id"] == NVIDIA_NEMOTRON_MODEL
    assert constrained["filename"] is None


def test_historical_tier_names_normalize_to_hosted_provider():
    for old_tier in ("tiny", "balanced", "quality", "clinical", "medical", "auto"):
        assert normalize_tier(old_tier) == "hosted"


def test_provider_config_has_no_local_weight_fallbacks():
    config = build_llm_config(select_catalog_model())

    assert config["schema_version"] == CATALOG_VERSION
    assert config["policy"] == "nvidia-hosted-default"
    assert config["fallbacks"] == []
    assert config["filename"] is None
    assert config["self_hosted"]["enabled"] is False


def test_runtime_selection_migrates_legacy_gguf_config_without_path(tmp_path):
    selected = select_runtime_model_config(
        {
            "repo_id": "historical/local-checkpoint",
            "filename": "historical.gguf",
            "tier": "balanced",
        },
        project_root=tmp_path,
    )

    assert selected["provider"] == "nvidia"
    assert selected["model_id"] == NVIDIA_NEMOTRON_MODEL
    assert selected["filename"] is None
    assert "resolved_path" not in selected
    assert find_existing_model_path(selected, tmp_path) is None


def test_runtime_selection_preserves_explicit_nvidia_provider_values(tmp_path):
    selected = select_runtime_model_config(
        {
            "provider": "nvidia",
            "runtime": "custom-nvidia-runtime",
            "api_base": "https://provider.example/v1",
            "model_id": "nvidia/custom-model",
        },
        project_root=tmp_path,
    )

    assert selected["runtime"] == "custom-nvidia-runtime"
    assert selected["api_base"] == "https://provider.example/v1"
    assert selected["model_id"] == "nvidia/custom-model"
    assert selected["repo_id"] == "nvidia/custom-model"
