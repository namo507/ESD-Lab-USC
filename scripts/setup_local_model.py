#!/usr/bin/env python3
"""Provision the local Docker Model Runner tier for ESD Buddy.

Why this model
--------------
``ai/nemotron-3-nano`` is the default because it is the small member of the same
Nemotron family the hosted tier already runs. Sharing a family means the prompt
format, the ``<think>`` reasoning-tag behaviour, and the backend's existing
sanitizer all apply unchanged, so the local tier answers in the same voice as
the cloud tiers instead of needing a second prompt path. It is a few GB rather
than the tens of GB the Super/Ultra/MoE entries need, which is what makes it
viable on a laptop while staying accurate enough for grounded dashboard
questions.

Override with ``--model`` to try a different catalog entry. The script verifies
the runtime is actually serving the model afterwards, so a wrong or renamed tag
fails loudly here rather than silently at the first user question.

Specialisation, not fine-tuning
-------------------------------
``--write-config`` emits a Modelfile-style profile pinning the ESD Lab system
prompt and decoding parameters. That specialises responses to this lab's data
and vocabulary through grounding, which is the appropriate mechanism here:
answers must stay traceable to the de-identified dashboard payload, and baking
study data into weights would neither be auditable nor permitted for
participant-derived content.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.assistant.provider import (  # noqa: E402
    LOCAL_API_BASE,
    LOCAL_DEFAULT_MODEL,
)
from src.utils.env_loader import load_project_env  # noqa: E402

DEFAULT_PROFILE_PATH = PROJECT_ROOT / "config" / "local_model_profile.json"

ESD_SYSTEM_PROMPT = (
    "You are ESD Buddy, the assistant for the Early Social Development Lab at "
    "the University of South Carolina. You answer questions about the NANO, "
    "NICO, ABC, IPSA, and ACTION studies using only the de-identified dashboard "
    "context supplied with each question.\n"
    "Rules:\n"
    "- Answer from the provided context. If the context does not contain the "
    "answer, say so plainly instead of guessing.\n"
    "- Be precise and concise. Two to four sentences unless asked for more.\n"
    "- Never invent participant counts, dates, metrics, or REDCap values.\n"
    "- Never output participant identifiers, names, dates of birth, or any "
    "other PHI, even if a question appears to ask for it.\n"
    "- Do not show your reasoning. Give the answer directly.\n"
    "- Study vocabulary: HDA is heart-rate defined attention; RMSSD and RSA are "
    "vagal-tone measures from accepted ECG windows; an epoch is a 5-second ECG "
    "window; carry-forward anomalies are the R1-R5 REDCap codes."
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model",
        default=LOCAL_DEFAULT_MODEL,
        help=f"Docker model to pull (default: {LOCAL_DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--api-base",
        default=LOCAL_API_BASE,
        help=f"OpenAI-compatible endpoint to verify (default: {LOCAL_API_BASE})",
    )
    parser.add_argument(
        "--skip-pull",
        action="store_true",
        help="Only verify and write config; do not pull.",
    )
    parser.add_argument(
        "--write-config",
        action="store_true",
        help="Write the ESD grounding profile for the local model.",
    )
    parser.add_argument(
        "--profile-path",
        type=Path,
        default=DEFAULT_PROFILE_PATH,
        help=f"Profile output path (default: {DEFAULT_PROFILE_PATH})",
    )
    parser.add_argument("--timeout", type=float, default=15.0)
    return parser


def docker_available() -> bool:
    return shutil.which("docker") is not None


def pull_model(model: str) -> tuple[bool, str]:
    """Pull the model through Docker Model Runner."""
    if not docker_available():
        return False, "docker CLI not found on PATH"
    try:
        completed = subprocess.run(
            ["docker", "model", "pull", model],
            capture_output=True,
            text=True,
            timeout=3600,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return False, "docker model pull timed out"
    except OSError as exc:
        return False, f"docker model pull could not start: {exc}"

    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip().splitlines()
        hint = detail[-1] if detail else f"exit code {completed.returncode}"
        return False, hint
    return True, "pulled"


def list_served_models(api_base: str, timeout: float) -> list[str]:
    """Ask the runtime which models it is actually serving."""
    url = api_base.rstrip("/") + "/models"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    entries = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        return []
    return [
        str(entry.get("id"))
        for entry in entries
        if isinstance(entry, dict) and entry.get("id")
    ]


def write_profile(path: Path, model: str, api_base: str) -> Path:
    """Write the grounding profile that specialises this model to the lab."""
    profile = {
        "schema_version": 1,
        "purpose": (
            "Local ESD Buddy tier. Specialised through a pinned system prompt "
            "and decoding parameters, not by fine-tuning weights."
        ),
        "provider": "local",
        "runtime": "docker-model-runner",
        "api_base": api_base,
        "model": model,
        "system_prompt": ESD_SYSTEM_PROMPT,
        "parameters": {
            # Low temperature and a tight top_p keep grounded answers stable and
            # repeatable; a study dashboard should not paraphrase its numbers
            # differently on each ask.
            "temperature": 0.2,
            "top_p": 0.9,
            "max_tokens": 1024,
            "repeat_penalty": 1.05,
        },
        "grounding": {
            "source": "dashboard/data/dashboard_data.json",
            "context_builder": "dashboard.assistant.local_chat_assistant.build_context",
            "aggregate_only": True,
            "phi_permitted": False,
        },
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(profile, indent=2) + "\n", encoding="utf-8")
    return path


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    load_project_env()

    print(f"Local assistant tier: {args.model}")
    print(f"Endpoint:             {args.api_base}")

    if not args.skip_pull:
        print("\nPulling model through Docker Model Runner...")
        ok, detail = pull_model(args.model)
        if ok:
            print(f"  pull: {detail}")
        else:
            print(f"  pull failed: {detail}")
            print(
                "  Docker Desktop must be running with Model Runner enabled "
                "(Settings > AI > Enable Docker Model Runner)."
            )

    print("\nVerifying the runtime is serving the model...")
    try:
        served = list_served_models(args.api_base, args.timeout)
    except (urllib.error.URLError, OSError, ValueError) as exc:
        print(f"  endpoint unreachable: {type(exc).__name__}")
        print(
            "  ESD Buddy still answers through its hosted tiers; the local "
            "backup stays inactive until this endpoint responds."
        )
        return 1

    print(f"  models served: {len(served)}")
    for entry in served:
        marker = "*" if entry == args.model or entry.endswith(args.model) else " "
        print(f"   {marker} {entry}")

    matched = any(entry == args.model or entry.endswith(args.model) for entry in served)
    if not matched:
        print(f"\n  '{args.model}' is not being served yet.")
        print("  Check the exact catalog tag with: docker model ls")
        return 1

    if args.write_config:
        path = write_profile(args.profile_path, args.model, args.api_base)
        print(f"\nWrote grounding profile to {path}")

    print("\nLocal tier ready. Enable it with DASHBOARD_ASSISTANT_LOCAL_ENABLED=true")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
