#!/usr/bin/env python3
"""Benchmark the local presentation planner across models and runtime knobs.

Measures, per (model x concept), the wall-clock latency, whether a valid
structured deck plan came back, and whether grounding behaved as expected.
Use it to pick the best speed/accuracy tradeoff for ``plan_presentation`` on a
given host. It only exercises models whose GGUF files are present locally, so it
is safe to run anywhere; absent candidates are skipped with a note.

Requires ``llama-cpp-python`` and at least one local GGUF (the same stack the
live assistant uses). It never downloads anything.

Examples
--------
    # Sweep the model in config/llm_model.json + its fallbacks, JSON mode on:
    python scripts/benchmark_presentation_planner.py

    # Compare JSON mode on vs off for whatever models are present:
    python scripts/benchmark_presentation_planner.py --compare-json-mode

    # Point at an explicit model file:
    python scripts/benchmark_presentation_planner.py \
        --model models/local_llms/runtime/SmolLM2-360M-Instruct-Q2_K.gguf
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.assistant.local_chat_assistant import (  # noqa: E402
    AssistantConfig,
    DashboardChatAssistant,
    PRESENTATION_MIN_SLIDES,
)

DEFAULT_LLM_CONFIG = PROJECT_ROOT / "config" / "llm_model.json"

# Mix of lab-grounded and deliberately general concepts.
BENCHMARK_CONCEPTS: list[tuple[str, str, bool]] = [
    # (concept, options-audience, expected_grounded_hint)
    ("What is RMSSD?", "beginner", True),
    ("How does the MATLAB handoff work?", "intermediate", True),
    ("Explain heart-rate defined attention to a new RA.", "beginner", True),
    ("What is REDCap and why does the lab use it?", "beginner", True),
    ("Explain gradient descent to a beginner.", "beginner", False),
    ("Explain how a rainbow forms.", "beginner", False),
]


@dataclass
class Candidate:
    label: str
    model_dir: Path
    model_file: str


def _candidates_from_config(config_path: Path) -> list[Candidate]:
    out: list[Candidate] = []
    if not config_path.exists():
        return out
    cfg = json.loads(config_path.read_text(encoding="utf-8"))
    models_dir = PROJECT_ROOT / "models"

    def add(entry: dict) -> None:
        filename = entry.get("filename")
        if not filename:
            return
        out.append(Candidate(label=entry.get("repo_id", filename), model_dir=models_dir, model_file=filename))

    add(cfg)
    for fb in cfg.get("fallbacks", []) or []:
        add(fb)
    return out


def _resolve_present(candidate: Candidate) -> Path | None:
    """Return the on-disk GGUF for a candidate, searching common locations."""
    search = [
        candidate.model_dir / candidate.model_file,
        PROJECT_ROOT / "models" / candidate.model_file,
        PROJECT_ROOT / "models" / "local_llms" / "runtime" / candidate.model_file,
    ]
    for path in search:
        if path.exists():
            return path
    # Fallback: any matching basename under models/
    matches = list((PROJECT_ROOT / "models").rglob(candidate.model_file))
    return matches[0] if matches else None


def _build_assistant(model_path: Path, *, json_mode: bool) -> DashboardChatAssistant:
    config = AssistantConfig(
        enabled=True,
        model_dir=model_path.parent,
        model_file=model_path.name,
        auto_download=False,
        presentation_json_mode=json_mode,
    )
    return DashboardChatAssistant(config=config)


def _validate_plan(plan: dict) -> tuple[bool, str]:
    slides = plan.get("slides") or []
    if len(slides) < PRESENTATION_MIN_SLIDES:
        return False, f"only {len(slides)} slides"
    types = [s.get("type") for s in slides]
    if types[0] != "title" or types[-1] != "recap":
        return False, "structure broken (title/recap)"
    if any(len(s.get("bullets") or []) > 5 for s in slides):
        return False, "bullet cap exceeded"
    return True, "ok"


def _run_one(assistant: DashboardChatAssistant, concept: str, audience: str) -> dict:
    options = {"audience_level": audience, "slide_count": 6, "include_analogy": True, "include_worked_example": True}
    start = time.perf_counter()
    try:
        result = assistant.plan_presentation(concept, options=options)
        elapsed = time.perf_counter() - start
        plan = result["plan"]
        valid, reason = _validate_plan(plan)
        return {
            "latency_s": round(elapsed, 2),
            "valid": valid,
            "reason": reason,
            "grounded": bool(plan.get("grounded")),
            "slides": len(plan.get("slides") or []),
        }
    except Exception as exc:  # noqa: BLE001 - benchmark wants to record failures
        return {
            "latency_s": round(time.perf_counter() - start, 2),
            "valid": False,
            "reason": f"error: {type(exc).__name__}",
            "grounded": False,
            "slides": 0,
        }


def _benchmark_candidate(model_path: Path, *, json_mode: bool) -> dict:
    assistant = _build_assistant(model_path, json_mode=json_mode)
    status = assistant.get_status()
    if not status.get("ready"):
        return {"ready": False, "message": status.get("message"), "rows": []}

    rows = []
    for concept, audience, expected_grounded in BENCHMARK_CONCEPTS:
        row = _run_one(assistant, concept, audience)
        row["concept"] = concept
        row["expected_grounded"] = expected_grounded
        row["grounding_ok"] = (row["grounded"] == expected_grounded) or not expected_grounded
        rows.append(row)
        print(
            f"    {concept[:42]:42s}  {row['latency_s']:6.2f}s  "
            f"valid={'Y' if row['valid'] else 'N'}  grounded={'Y' if row['grounded'] else 'N'}  ({row['reason']})"
        )
    return {"ready": True, "rows": rows}


def _summarize(rows: list[dict]) -> dict:
    if not rows:
        return {"valid_rate": 0.0, "mean_latency_s": 0.0, "p95_latency_s": 0.0}
    valid_rate = sum(1 for r in rows if r["valid"]) / len(rows)
    lats = sorted(r["latency_s"] for r in rows)
    p95 = lats[max(0, int(len(lats) * 0.95) - 1)]
    return {
        "valid_rate": round(valid_rate, 3),
        "mean_latency_s": round(statistics.mean(lats), 2),
        "p95_latency_s": round(p95, 2),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_LLM_CONFIG)
    parser.add_argument("--model", action="append", default=[], help="Explicit GGUF path(s) to test.")
    parser.add_argument("--compare-json-mode", action="store_true", help="Run each model with JSON mode on AND off.")
    parser.add_argument("--out", type=Path, default=None, help="Optional path to write raw JSON results.")
    args = parser.parse_args(argv)

    try:
        import llama_cpp  # noqa: F401
    except Exception:
        print(
            "llama-cpp-python is not installed in this environment.\n"
            "Install it and at least one local GGUF, then re-run on the target host.",
            file=sys.stderr,
        )
        return 0

    candidates: list[tuple[str, Path]] = []
    for raw in args.model:
        path = Path(raw)
        if path.exists():
            candidates.append((path.name, path))
        else:
            print(f"[skip] explicit model not found: {raw}", file=sys.stderr)
    for cand in _candidates_from_config(args.config):
        resolved = _resolve_present(cand)
        if resolved is None:
            print(f"[skip] not present locally: {cand.label} ({cand.model_file})")
            continue
        candidates.append((cand.label, resolved))

    if not candidates:
        print("No local GGUF models found to benchmark.", file=sys.stderr)
        return 0

    modes = [True, False] if args.compare_json_mode else [True]
    report: dict = {"results": []}

    for label, path in candidates:
        for json_mode in modes:
            tag = f"{label}  [json_mode={'on' if json_mode else 'off'}]"
            print(f"\n=== {tag} ===\n  {path}")
            outcome = _benchmark_candidate(path, json_mode=json_mode)
            if not outcome["ready"]:
                print(f"  not ready: {outcome.get('message')}")
                continue
            summary = _summarize(outcome["rows"])
            grounding_ok = sum(1 for r in outcome["rows"] if r["grounding_ok"]) / len(outcome["rows"])
            print(
                f"  -> valid_rate={summary['valid_rate']:.0%}  "
                f"mean={summary['mean_latency_s']}s  p95={summary['p95_latency_s']}s  "
                f"grounding_ok={grounding_ok:.0%}"
            )
            report["results"].append(
                {"model": label, "path": str(path), "json_mode": json_mode,
                 "summary": summary, "grounding_ok": round(grounding_ok, 3), "rows": outcome["rows"]}
            )

    # Recommendation: prefer high valid_rate, then low mean latency.
    ranked = sorted(
        report["results"],
        key=lambda r: (-r["summary"]["valid_rate"], r["summary"]["mean_latency_s"]),
    )
    if ranked:
        best = ranked[0]
        print(
            f"\nRECOMMENDED: {best['model']} (json_mode={'on' if best['json_mode'] else 'off'}) "
            f"-> valid_rate={best['summary']['valid_rate']:.0%}, mean={best['summary']['mean_latency_s']}s"
        )
        report["recommended"] = {"model": best["model"], "json_mode": best["json_mode"], "summary": best["summary"]}

    if args.out:
        args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nWrote raw results to {args.out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
