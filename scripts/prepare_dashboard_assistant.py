#!/usr/bin/env python3
"""Prepare or inspect the local dashboard assistant model assets."""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.assistant.local_chat_assistant import AssistantConfig
from dashboard.assistant.local_chat_assistant import DashboardChatAssistant


def available_memory_gib() -> float:
    meminfo_path = Path("/proc/meminfo")
    if meminfo_path.exists():
        for line in meminfo_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("MemAvailable:"):
                parts = line.split()
                if len(parts) >= 2:
                    return int(parts[1]) / 1024 / 1024
    return 0.0


def main(argv: list[str] | None = None) -> int:
    try:
        from dotenv import load_dotenv
    except Exception:
        load_dotenv = None

    env_path = PROJECT_ROOT / ".env"
    if load_dotenv and env_path.exists():
        load_dotenv(env_path, override=False)

    parser = argparse.ArgumentParser(
        description="Inspect or download the local model assets for the dashboard assistant."
    )
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--model-id",
        default=os.getenv("DASHBOARD_ASSISTANT_MODEL_ID", "bartowski/Qwen2.5-1.5B-Instruct-GGUF"),
    )
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=Path(
            os.getenv(
                "DASHBOARD_ASSISTANT_MODEL_DIR",
                "models/local_llms/Qwen2.5-1.5B-Instruct-GGUF",
            )
        ),
    )
    parser.add_argument(
        "--model-file",
        default=os.getenv("DASHBOARD_ASSISTANT_MODEL_FILE", "Qwen2.5-1.5B-Instruct-Q3_K_S.gguf"),
    )
    args = parser.parse_args(argv)

    model_dir = args.model_dir
    if not model_dir.is_absolute():
        model_dir = PROJECT_ROOT / model_dir

    config = AssistantConfig.from_env()
    config.model_id = args.model_id
    config.model_dir = model_dir
    config.model_file = args.model_file

    assistant = DashboardChatAssistant(config=config)
    status = assistant.get_status()
    disk = shutil.disk_usage(PROJECT_ROOT)
    disk_free_gib = disk.free / 1024 / 1024 / 1024
    mem_gib = available_memory_gib()

    print(f"assistant_state: {status['state']}")
    print(f"model_id: {config.model_id}")
    print(f"model_dir: {config.model_dir}")
    print(f"model_file: {config.model_file}")
    print(f"model_path: {status.get('model_path') or '(not found)'}")
    print(f"available_memory_gib: {mem_gib:.2f}")
    print(f"disk_free_gib: {disk_free_gib:.2f}")
    print(f"dependencies_available: {status['dependencies']['available']}")
    if status["dependencies"].get("missing"):
        print("missing_dependencies: " + ", ".join(status["dependencies"]["missing"]))
    print(f"message: {status['message']}")

    if not args.download:
        return 0

    target_path = model_dir / config.model_file
    if target_path.exists() and not args.force:
        print("Model file already exists. Use --force to redownload.")
        return 0

    try:
        from huggingface_hub import hf_hub_download
    except Exception as exc:
        print(f"huggingface_hub is unavailable: {exc}", file=sys.stderr)
        return 1

    model_dir.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {config.model_id}:{config.model_file} to {model_dir} ...")
    hf_hub_download(
        repo_id=config.model_id,
        filename=config.model_file,
        local_dir=str(model_dir),
        force_download=args.force,
    )
    print("Dashboard assistant model download complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())