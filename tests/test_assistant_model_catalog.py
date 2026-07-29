"""Tests for the Ollama assistant model catalog."""

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
    OLLAMA_API_BASE,
    OLLAMA_DEFAULT_MODEL,
    OLLAMA_RUNTIME,
)


def test_catalog_selects_local_ollama_independent_of_host_capacity():
    constrained = select_catalog_model(memory_gib=0.25, disk_free_gib=0.1)
    capable = select_catalog_model(memory_gib=256.0, disk_free_gib=1000.0)

    assert constrained == capable
    assert constrained["provider"] == "ollama"
    assert constrained["runtime"] == OLLAMA_RUNTIME
    assert constrained["api_base"] == OLLAMA_API_BASE
    assert constrained["model_id"] == OLLAMA_DEFAULT_MODEL
    assert constrained["filename"] is None


def test_historical_tier_names_normalize_to_the_local_tier():
    for old_tier in ("tiny", "balanced", "quality", "clinical", "hosted", "auto"):
        assert normalize_tier(old_tier) == "local"


def test_provider_config_has_no_local_weight_fallbacks():
    config = build_llm_config(select_catalog_model())

    assert config["schema_version"] == CATALOG_VERSION
    assert config["policy"] == "ollama-local-default"
    assert config["fallbacks"] == []
    assert config["filename"] is None
    assert config["remote"]["enabled"] is False


def test_runtime_selection_migrates_legacy_gguf_config_without_path(tmp_path):
    selected = select_runtime_model_config(
        {
            "repo_id": "historical/local-checkpoint",
            "filename": "historical.gguf",
            "tier": "balanced",
        },
        project_root=tmp_path,
    )

    assert selected["provider"] == "ollama"
    assert selected["model_id"] == OLLAMA_DEFAULT_MODEL
    assert selected["filename"] is None
    assert "resolved_path" not in selected
    assert find_existing_model_path(selected, tmp_path) is None


def test_runtime_selection_preserves_explicit_ollama_values(tmp_path):
    selected = select_runtime_model_config(
        {
            "provider": "ollama",
            "runtime": "ollama-remote",
            "api_base": "http://gpu-box.lab.internal:11434/v1",
            "model_id": "qwen2.5:7b-instruct",
        },
        project_root=tmp_path,
    )

    assert selected["runtime"] == "ollama-remote"
    assert selected["api_base"] == "http://gpu-box.lab.internal:11434/v1"
    assert selected["model_id"] == "qwen2.5:7b-instruct"
    assert selected["repo_id"] == "qwen2.5:7b-instruct"
