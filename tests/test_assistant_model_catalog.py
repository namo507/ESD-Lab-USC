"""Tests for local assistant model catalog selection."""

from __future__ import annotations

from dashboard.assistant.model_catalog import (
    build_llm_config,
    select_catalog_model,
    select_runtime_model_config,
)


def test_auto_selection_prefers_balanced_when_host_fits():
    selected = select_catalog_model(memory_gib=3.5, disk_free_gib=8.0)

    assert selected["tier"] == "balanced"
    assert selected["filename"] == "SmolLM2-1.7B-Instruct-Q4_K_M.gguf"


def test_auto_selection_uses_tiny_when_memory_is_low():
    selected = select_catalog_model(memory_gib=1.0, disk_free_gib=8.0)

    assert selected["tier"] == "tiny"
    assert selected["filename"] == "SmolLM2-360M-Instruct-Q2_K.gguf"


def test_runtime_selection_uses_present_tiny_fallback(tmp_path, monkeypatch):
    primary = select_catalog_model(tier="balanced")
    config = build_llm_config(primary)
    tiny_dir = tmp_path / "models" / "local_llms" / "runtime"
    tiny_dir.mkdir(parents=True)
    tiny_path = tiny_dir / "SmolLM2-360M-Instruct-Q2_K.gguf"
    tiny_path.write_bytes(b"GGUF")

    monkeypatch.setattr(
        "dashboard.assistant.model_catalog.available_memory_gib",
        lambda: 1.0,
    )

    selected = select_runtime_model_config(config, project_root=tmp_path)

    assert selected["tier"] == "tiny"
    assert selected["resolved_path"] == str(tiny_path)


def test_runtime_selection_honors_requested_tier_when_present(tmp_path, monkeypatch):
    primary = select_catalog_model(tier="balanced")
    config = build_llm_config(primary)
    accuracy_dir = tmp_path / "models" / "local_llms" / "Qwen2.5-1.5B-Instruct-GGUF"
    accuracy_dir.mkdir(parents=True)
    accuracy_path = accuracy_dir / "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf"
    accuracy_path.write_bytes(b"GGUF")

    monkeypatch.setattr(
        "dashboard.assistant.model_catalog.available_memory_gib",
        lambda: 4.0,
    )

    selected = select_runtime_model_config(
        config,
        requested_tier="accuracy",
        project_root=tmp_path,
    )

    assert selected["tier"] == "accuracy"
    assert selected["resolved_path"] == str(accuracy_path)
