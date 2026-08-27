#!/usr/bin/env python3
"""Evaluate presentation planning through the configured assistant provider.

The default mode is offline and only validates configuration/normalization
fixtures. Pass ``--live`` explicitly to send metered requests to the configured
NVIDIA OpenAI-compatible endpoint.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.assistant.local_chat_assistant import (  # noqa: E402
    PRESENTATION_MIN_SLIDES,
    DashboardChatAssistant,
    normalize_deck_plan,
)

BENCHMARK_CONCEPTS: list[tuple[str, str, bool]] = [
    ("What is RMSSD?", "beginner", True),
    ("How does the MATLAB handoff work?", "intermediate", True),
    ("Explain heart-rate defined attention to a new RA.", "beginner", True),
    ("What is REDCap and why does the lab use it?", "beginner", True),
    ("Explain gradient descent to a beginner.", "beginner", False),
    ("Explain how a rainbow forms.", "beginner", False),
]


def _load_dotenv() -> None:
    """Load the one repository ``.env`` through the shared loader."""
    try:
        from src.utils.env_loader import load_project_env
    except Exception:
        return
    load_project_env()


def _valid_plan(plan: dict[str, Any]) -> tuple[bool, str]:
    slides = list(plan.get("slides") or [])
    if len(slides) < PRESENTATION_MIN_SLIDES:
        return False, f"only {len(slides)} slides"
    if slides[0].get("type") != "title" or slides[-1].get("type") != "recap":
        return False, "title/recap boundary missing"
    if any(len(slide.get("bullets") or []) > 5 for slide in slides):
        return False, "bullet cap exceeded"
    return True, "ok"


def _offline_fixture() -> dict[str, Any]:
    raw = {
        "title": "Grounded planning fixture",
        "slides": [
            {"type": "title", "title": "Grounded planning fixture"},
            {"type": "why", "title": "Why it matters", "bullets": ["One"]},
            {"type": "concept", "title": "Core idea", "bullets": ["Two"]},
            {"type": "concept", "title": "Evidence", "bullets": ["Three"]},
            {"type": "recap", "title": "Recap", "bullets": ["Four"]},
        ],
    }
    plan = normalize_deck_plan(
        raw,
        concept="Grounded planning fixture",
        options={
            "audience_level": "beginner",
            "slide_count": 6,
            "include_analogy": True,
            "include_worked_example": True,
        },
        grounding={"grounded": False, "citations": []},
    )
    valid, reason = _valid_plan(plan)
    return {"valid": valid, "reason": reason, "slides": len(plan.get("slides") or [])}


def _live_row(
    assistant: DashboardChatAssistant,
    concept: str,
    audience: str,
    expected_grounded: bool,
) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        result = assistant.plan_presentation(
            concept,
            options={
                "audience_level": audience,
                "slide_count": 6,
                "include_analogy": True,
                "include_worked_example": True,
            },
        )
        plan = result["plan"]
        valid, reason = _valid_plan(plan)
        grounded = bool(plan.get("grounded"))
        return {
            "concept": concept,
            "latency_seconds": round(time.perf_counter() - started, 3),
            "valid": valid,
            "reason": reason,
            "grounded": grounded,
            "grounding_ok": grounded == expected_grounded or not expected_grounded,
            "slides": len(plan.get("slides") or []),
        }
    except Exception as exc:
        return {
            "concept": concept,
            "latency_seconds": round(time.perf_counter() - started, 3),
            "valid": False,
            "reason": f"{type(exc).__name__}: {exc}",
            "grounded": False,
            "grounding_ok": False,
            "slides": 0,
        }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--live",
        action="store_true",
        help="Send metered provider requests. Omitted by default.",
    )
    parser.add_argument("--out", type=Path)
    args = parser.parse_args(argv)

    _load_dotenv()
    assistant = DashboardChatAssistant()
    status = assistant.get_status()
    results: dict[str, Any] = {
        "mode": "live" if args.live else "offline",
        "provider": status.get("provider"),
        "runtime": status.get("runtime"),
        "model": status.get("model_id") or status.get("model"),
        "state": status.get("state"),
        "offline_fixture": _offline_fixture(),
        "rows": [],
    }

    if args.live:
        if not status.get("ready"):
            print(
                f"Provider is not ready: {status.get('state')} - {status.get('message')}",
                file=sys.stderr,
            )
            return 2
        print("Live mode sends metered NVIDIA provider requests.")
        results["rows"] = [
            _live_row(assistant, concept, audience, grounded)
            for concept, audience, grounded in BENCHMARK_CONCEPTS
        ]
        latencies = [row["latency_seconds"] for row in results["rows"]]
        results["summary"] = {
            "valid_rate": round(
                sum(1 for row in results["rows"] if row["valid"])
                / max(1, len(results["rows"])),
                3,
            ),
            "mean_latency_seconds": round(statistics.mean(latencies), 3),
            "max_latency_seconds": round(max(latencies), 3),
        }

    rendered = json.dumps(results, indent=2, sort_keys=True)
    print(rendered)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(rendered + "\n", encoding="utf-8")

    return 0 if results["offline_fixture"]["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
