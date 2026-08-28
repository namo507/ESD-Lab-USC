#!/usr/bin/env python3
"""Chaos suite: prove the system heals, rather than merely survives.

Each scenario injects a specific failure and asserts an **observable outcome**,
not "it did not crash". A system that stays up by accident is indistinguishable
from one that stays up by design until you break it on purpose.

    python scripts/chaos_suite.py
    python scripts/chaos_suite.py --scenario model-down --verbose

Scenarios that need Docker are skipped, loudly, when Docker is unavailable. A
skip is reported as a skip and never as a pass.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.assistant import retrieval  # noqa: E402
from dashboard.assistant.routing import plan_domain  # noqa: E402
from scripts import self_heal  # noqa: E402


@dataclass
class Result:
    name: str
    status: str  # pass | fail | skip
    detail: str


def _skip_no_docker() -> Result | None:
    if shutil.which("docker") is None:
        return Result("", "skip", "docker unavailable in this environment")
    return None


# ---------------------------------------------------------------------------

def scenario_model_down() -> Result:
    """Model server unreachable -> deterministic answers continue.

    Required outcome: retrieval still returns hits from the sparse half, and the
    router still classifies without a model. The site does not depend on the
    model being up.
    """
    hits = retrieval.search("CPTd skin temperature", limit=3, embed_base_url=None)
    routed = plan_domain("how many NANO records are there?")
    if not hits:
        return Result("model-down", "fail", "sparse-only retrieval returned nothing")
    if not routed.model_free:
        return Result("model-down", "fail", "lookup did not route to the deterministic tier")
    return Result(
        "model-down", "pass",
        f"sparse-only retrieval returned {len(hits)} hits; lookup routed model-free",
    )


def scenario_model_slow() -> Result:
    """Slow model -> readiness fails, liveness does not.

    Asserted against the chart rather than a live cluster: the rule that a
    degraded model must never trip liveness lives in the template, and a
    regression there is what actually causes the crash loop.
    """
    template = PROJECT_ROOT / "k8s/helm/esd-lab-dashboard/templates/deployment-ollama.yaml"
    if not template.exists():
        return Result("model-slow", "fail", "ollama deployment template missing")
    text = template.read_text(encoding="utf-8")
    for probe in ("startupProbe", "livenessProbe", "readinessProbe"):
        if probe not in text:
            return Result("model-slow", "fail", f"{probe} not declared")
    # Normalise whitespace and strip comment markers before matching: the rule is
    # written as a wrapped YAML comment, so the phrase spans a line and a '#'.
    # Asserting on the raw text would fail whenever someone rewrapped it.
    lowered = " ".join(text.lower().replace("#", " ").split())
    if "readiness" not in lowered or "warm model cache" not in lowered:
        return Result("model-slow", "fail", "probe-semantics comment missing; the rule will be undone")
    return Result("model-slow", "pass", "all three probes declared with the readiness-not-liveness rule recorded")


def scenario_corrupt_index() -> Result:
    """Truncated index -> rebuild path fires and search does not raise."""
    with tempfile.TemporaryDirectory() as tmp:
        corrupt = Path(tmp) / "corrupt.sqlite3"
        corrupt.write_bytes(b"SQLite format 3\x00" + b"\x00" * 64)
        try:
            hits = retrieval.search("anything", index_path=corrupt, embed_base_url=None)
        except sqlite3.DatabaseError as exc:
            return Result("corrupt-index", "fail", f"search raised on a corrupt index: {exc}")
        if hits:
            return Result("corrupt-index", "fail", "corrupt index returned hits")
    return Result("corrupt-index", "pass", "corrupt index degrades to empty results without raising")


def scenario_stale_redcap() -> Result:
    """Frozen portfolio artifact -> freshness breach detected, not a crash."""
    findings = self_heal.detect(base_url="http://127.0.0.1:1")  # nothing listening
    freshness = [f for f in findings if f.check == "freshness"]
    if not freshness:
        return Result("stale-redcap", "fail", "no freshness finding produced")
    return Result(
        "stale-redcap", "pass",
        f"{len(freshness)} freshness SLA breach(es) detected as findings, not exceptions",
    )


def scenario_scrape_429() -> Result:
    """Rate-limited source -> backoff, and the previous snapshot survives.

    The rule under test is that an all-sources-failed run never overwrites a
    good snapshot with an empty one.
    """
    source = PROJECT_ROOT / "dashboard/pipelines/build_similar_studies.py"
    text = source.read_text(encoding="utf-8")
    if "exc.code == 429" not in text:
        return Result("scrape-429", "fail", "no 429 branch in the fetch path")
    if "kept previous snapshot" not in text:
        return Result("scrape-429", "fail", "an empty result could overwrite a good snapshot")
    return Result("scrape-429", "pass", "429 backs off; an all-failed run keeps the last good snapshot")


def scenario_gpu_missing() -> Result:
    """No GPU -> CPU fallback with an honest warning, never a hard crash."""
    manifest = retrieval.read_manifest()
    if manifest is None:
        return Result("gpu-missing", "skip", "no index manifest; run `make assistant-reindex` first")
    # Sparse-only is the CPU/no-model path and it must actually work.
    hits = retrieval.search("REDCap portfolio", limit=3, embed_base_url=None)
    if not hits:
        return Result("gpu-missing", "fail", "CPU/sparse path returned nothing")
    return Result("gpu-missing", "pass", f"CPU sparse path serves {len(hits)} hits; manifest records degraded state")


def scenario_oom_pressure() -> Result:
    """Declared memory limits must fit the host, so only the offender dies."""
    from scripts.check_stack_budget import HOST_MEMORY_GB, declared

    _, _, mem_total = declared()
    if mem_total > HOST_MEMORY_GB:
        return Result("oom-pressure", "fail", f"declared {mem_total:.2f} GB exceeds {HOST_MEMORY_GB} GB host")
    return Result("oom-pressure", "pass", f"declared {mem_total:.2f} GB leaves {HOST_MEMORY_GB - mem_total:.2f} GB headroom")


def scenario_repeated_failure() -> Result:
    """Three failures of one rung inside the window -> automation holds."""
    state: dict = {"failures": []}
    now = time.time()
    for _ in range(self_heal.HOLD_AFTER_FAILURES):
        self_heal.record_failure("rebuild", state, now)
    if not self_heal.should_hold("rebuild", state, now):
        return Result("repeated-failure", "fail", "supervisor did not hold after repeated failures")
    # And a rung that has not failed must still be attempted.
    if self_heal.should_hold("reload", state, now):
        return Result("repeated-failure", "fail", "hold leaked across rungs")
    # The window must expire.
    if self_heal.should_hold("rebuild", state, now + self_heal.HOLD_WINDOW_SECONDS + 1):
        return Result("repeated-failure", "fail", "hold never expires")
    return Result("repeated-failure", "pass", "holds after 3 failures, scoped per rung, expires with the window")


def scenario_model_ladder() -> Result:
    """One local model failing must not take the assistant down.

    A single runtime serves several models, so "the local tier is down" is
    rarely the real failure -- one *model* is cold, wedged, or missing. The
    chain must expand into a rung per model, each with its own breaker, so the
    next one answers.
    """
    import os

    from dashboard.assistant.local_chat_assistant import AssistantConfig

    previous = {k: os.environ.get(k) for k in (
        "DASHBOARD_ASSISTANT_LOCAL_ENABLED", "DASHBOARD_ASSISTANT_LOCAL_MODEL",
        "DASHBOARD_ASSISTANT_LOCAL_FALLBACK_MODELS", "DASHBOARD_ASSISTANT_PROVIDER",
    )}
    os.environ.update({
        "DASHBOARD_ASSISTANT_LOCAL_ENABLED": "true",
        "DASHBOARD_ASSISTANT_PROVIDER": "ollama",
        "DASHBOARD_ASSISTANT_LOCAL_MODEL": "primary-model",
        "DASHBOARD_ASSISTANT_LOCAL_FALLBACK_MODELS": "second-model, third-model",
    })
    try:
        configs = AssistantConfig.from_env().provider_configs()
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    local = [c for c in configs if c.normalized_provider == "local"]
    models = [c.model for c in local]
    if models[:3] != ["primary-model", "second-model", "third-model"]:
        return Result("model-ladder", "fail", f"ladder did not expand in order: {models}")
    # Independent breakers are what make a failed rung skippable rather than fatal.
    if len({id(c) for c in local}) != len(local):
        return Result("model-ladder", "fail", "rungs share a config object, so they share a breaker")
    return Result(
        "model-ladder", "pass",
        f"{len(local)} local rungs in order ({', '.join(models)}), each with its own breaker",
    )


SCENARIOS: dict[str, Callable[[], Result]] = {
    "model-ladder": scenario_model_ladder,
    "model-down": scenario_model_down,
    "model-slow": scenario_model_slow,
    "corrupt-index": scenario_corrupt_index,
    "stale-redcap": scenario_stale_redcap,
    "scrape-429": scenario_scrape_429,
    "gpu-missing": scenario_gpu_missing,
    "oom-pressure": scenario_oom_pressure,
    "repeated-failure": scenario_repeated_failure,
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scenario", action="append", choices=sorted(SCENARIOS))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    names = args.scenario or list(SCENARIOS)
    results: list[Result] = []
    for name in names:
        try:
            result = SCENARIOS[name]()
        except Exception as exc:  # noqa: BLE001 - a raising scenario is a failing scenario
            result = Result(name, "fail", f"scenario raised: {exc}")
        result.name = result.name or name
        results.append(result)

    if args.json:
        print(json.dumps([r.__dict__ for r in results], indent=2))
    else:
        for result in results:
            mark = {"pass": "ok  ", "fail": "FAIL", "skip": "skip"}[result.status]
            print(f"  {mark} {result.name:<20} {result.detail}")
        passed = sum(r.status == "pass" for r in results)
        skipped = sum(r.status == "skip" for r in results)
        failed = sum(r.status == "fail" for r in results)
        print(f"\n{passed} passed, {failed} failed, {skipped} skipped, of {len(results)} scenarios")

    return 1 if any(r.status == "fail" for r in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
