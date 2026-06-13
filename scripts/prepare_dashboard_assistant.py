#!/usr/bin/env python3
"""Bootstrap, inspect, or download the local dashboard assistant assets."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.assistant.local_chat_assistant import (  # noqa: E402
    AssistantConfig,
    DashboardChatAssistant,
)
from dashboard.assistant.model_catalog import (  # noqa: E402
    available_memory_gib,
    build_llm_config,
    catalog_models,
    find_existing_model_path,
    free_disk_gib,
    model_dir_for,
    read_llm_config,
    select_catalog_model,
    write_llm_config,
)


def _load_dotenv() -> None:
    try:
        from dotenv import load_dotenv
    except Exception:
        return

    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        load_dotenv(env_path, override=False)


def _install_dependencies(*, dry_run: bool = False) -> None:
    requirements = PROJECT_ROOT / "dashboard" / "requirements.txt"
    cmd = [sys.executable, "-m", "pip", "install", "-r", str(requirements)]
    if dry_run:
        print("would_install_dependencies: " + " ".join(cmd))
        return
    print("installing_assistant_dependencies: " + " ".join(cmd))
    subprocess.check_call(cmd)


def _manual_model(args: argparse.Namespace) -> dict[str, Any] | None:
    if not args.model_id and not args.model_file:
        return None
    if not args.model_id or not args.model_file:
        raise SystemExit("--model-id and --model-file must be provided together.")

    model_dir = args.model_dir or (
        PROJECT_ROOT / "models" / "local_llms" / args.model_id.split("/")[-1]
    )
    if not model_dir.is_absolute():
        model_dir = PROJECT_ROOT / model_dir

    return {
        "tier": args.tier,
        "label": "Manual GGUF",
        "repo_id": args.model_id,
        "filename": args.model_file,
        "model_dir": str(model_dir),
        "params_b": None,
        "context_length": args.context_window,
        "min_memory_gib": args.min_memory_gib,
        "min_disk_gib": args.min_disk_gib,
        "max_tokens": args.max_tokens,
        "batch_size": args.batch_size,
        "thread_count": args.threads,
        "temperature": args.temperature,
        "top_p": args.top_p,
        "license": "unknown",
        "priority": 99,
        "source": "manual",
        "reason": "Manual command-line override.",
    }


def _assistant_config_from_model(model: dict[str, Any]) -> AssistantConfig:
    return AssistantConfig(
        model_id=str(model["repo_id"]),
        model_dir=model_dir_for(model, PROJECT_ROOT),
        model_file=str(model["filename"]),
        model_tier=str(model.get("tier") or "manual"),
        model_label=str(model.get("label") or "local GGUF"),
        model_license=str(model.get("license") or ""),
        max_new_tokens=int(model.get("max_tokens") or 320),
        min_available_memory_gib=float(model.get("min_memory_gib") or 1.2),
        context_window=int(model.get("context_length") or 4096),
        batch_size=int(model.get("batch_size") or 256),
        thread_count=int(model.get("thread_count") or 4),
        temperature=float(model.get("temperature") or 0.05),
        top_p=float(model.get("top_p") or 0.9),
    )


def _print_status(
    model: dict[str, Any],
    *,
    use_runtime_config: bool = False,
) -> dict[str, Any]:
    assistant = (
        DashboardChatAssistant()
        if use_runtime_config
        else DashboardChatAssistant(config=_assistant_config_from_model(model))
    )
    config = assistant.config
    status = assistant.get_status()
    memory_gib = available_memory_gib()
    disk_gib = free_disk_gib(PROJECT_ROOT)
    target_path = model_dir_for(model, PROJECT_ROOT) / str(model["filename"])

    print(f"target_tier: {model.get('tier')}")
    print(f"target_label: {model.get('label')}")
    print(f"target_license: {model.get('license')}")
    print(f"target_path: {target_path}")
    print(f"active_tier: {config.model_tier}")
    print(f"active_label: {config.model_label}")
    print(f"active_license: {config.model_license}")
    print(f"assistant_state: {status['state']}")
    print(f"model_id: {config.model_id}")
    print(f"model_dir: {config.model_dir}")
    print(f"model_file: {config.model_file}")
    print(f"model_path: {status.get('model_path') or '(not found)'}")
    print(f"available_memory_gib: {memory_gib:.2f}")
    print(f"disk_free_gib: {disk_gib:.2f}")
    print(f"dependencies_available: {status['dependencies']['available']}")
    if status["dependencies"].get("missing"):
        print("missing_dependencies: " + ", ".join(status["dependencies"]["missing"]))
    print(f"message: {status['message']}")
    return status


def _download_model(
    model: dict[str, Any],
    *,
    force: bool = False,
    dry_run: bool = False,
    retries: int = 3,
) -> Path:
    target_dir = model_dir_for(model, PROJECT_ROOT)
    target_path = target_dir / str(model["filename"])

    if target_path.exists() and not force:
        print(f"model_ready: {target_path}")
        return target_path

    if dry_run:
        print(
            "would_download_model: "
            f"{model['repo_id']}:{model['filename']} -> {target_dir}"
        )
        return target_path

    try:
        from huggingface_hub import hf_hub_download
    except Exception as exc:
        raise SystemExit(
            "huggingface_hub is unavailable. Run with --install-deps first, "
            "or install dashboard/requirements.txt in this Python environment. "
            f"Import error: {exc}"
        ) from exc

    target_dir.mkdir(parents=True, exist_ok=True)
    print(f"downloading_model: {model['repo_id']}:{model['filename']}")
    last_error: Exception | None = None
    for attempt in range(1, max(1, retries) + 1):
        try:
            hf_hub_download(
                repo_id=str(model["repo_id"]),
                filename=str(model["filename"]),
                local_dir=str(target_dir),
                force_download=force,
                token=os.getenv("HF_TOKEN") or None,
            )
            print(f"downloaded_model: {target_path}")
            return target_path
        except Exception as exc:  # noqa: BLE001 - retrying public downloads
            last_error = exc
            if attempt >= retries:
                break
            wait_s = min(2**attempt, 10)
            print(f"download_retry: attempt={attempt} wait_s={wait_s} error={exc}")
            time.sleep(wait_s)

    raise SystemExit(f"model_download_failed: {last_error}")


def _models_to_download(
    selected: dict[str, Any],
    *,
    include_fallbacks: bool,
) -> list[dict[str, Any]]:
    if not include_fallbacks:
        return [selected]
    seen = {f"{selected['repo_id']}|{selected['filename']}"}
    models = [selected]
    for model in sorted(
        catalog_models(),
        key=lambda item: item["priority"],
        reverse=True,
    ):
        key = f"{model['repo_id']}|{model['filename']}"
        if key in seen:
            continue
        seen.add(key)
        models.append(model)
    return models


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect, configure, and bootstrap the local GGUF assistant."
    )
    parser.add_argument(
        "--tier",
        default=os.getenv("DASHBOARD_ASSISTANT_TIER", "auto"),
        help="Model tier: auto, tiny, balanced, accuracy, or quality.",
    )
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--download-fallbacks", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--install-deps", action="store_true")
    parser.add_argument("--write-config", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--validate-ready", action="store_true")
    parser.add_argument("--model-id")
    parser.add_argument("--model-dir", type=Path)
    parser.add_argument("--model-file")
    parser.add_argument("--context-window", type=int, default=4096)
    parser.add_argument("--min-memory-gib", type=float, default=1.2)
    parser.add_argument("--min-disk-gib", type=float, default=1.0)
    parser.add_argument("--max-tokens", type=int, default=320)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--temperature", type=float, default=0.05)
    parser.add_argument("--top-p", type=float, default=0.9)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    _load_dotenv()
    args = parse_args(argv)

    memory_gib = available_memory_gib()
    disk_gib = free_disk_gib(PROJECT_ROOT)
    manual_model = _manual_model(args)
    selected = manual_model or select_catalog_model(
        tier=args.tier,
        memory_gib=memory_gib,
        disk_free_gib=disk_gib,
    )

    if args.write_config:
        config = build_llm_config(selected)
        if args.dry_run:
            print("would_write_config: config/llm_model.json")
        else:
            write_llm_config(config)
            print(
                "wrote_config: "
                f"config/llm_model.json "
                f"({config['selected_tier']}, {config['filename']})"
            )
    elif not read_llm_config():
        print(
            "config_notice: config/llm_model.json is missing; "
            "rerun with --write-config."
        )

    if args.install_deps:
        _install_dependencies(dry_run=args.dry_run)

    _print_status(selected, use_runtime_config=manual_model is None)

    if args.download:
        for model in _models_to_download(
            selected,
            include_fallbacks=args.download_fallbacks,
        ):
            _download_model(model, force=args.force, dry_run=args.dry_run)

    if args.validate_ready and not args.dry_run:
        ready_model = selected
        existing_path = find_existing_model_path(selected, PROJECT_ROOT)
        if existing_path is None:
            raise SystemExit("assistant_validation_failed: selected model is missing")
        ready_model = {**selected, "model_dir": str(existing_path.parent)}
        status = _print_status(ready_model)
        if not status.get("ready"):
            raise SystemExit(f"assistant_validation_failed: {status.get('message')}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
