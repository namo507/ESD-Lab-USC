#!/usr/bin/env python3
"""Validate repository GitHub Actions wiring for the dashboard health loop."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_DIR = ROOT / ".github" / "workflows"

REQUIRED_WORKFLOWS = {
    "ci.yml",
    "deploy-pages.yml",
    "docker-build.yml",
    "redcap_sync.yml",
    "uptime-monitor.yml",
    "k8s-validate.yml",
    "sync_local_llm.yml",
    "daily-health-sweep.yml",
}


def load_workflow(path: Path) -> dict[str, Any]:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ValueError(f"{path}: invalid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"{path}: expected a mapping at the document root")
    return data


def workflow_on(data: dict[str, Any]) -> Any:
    # PyYAML still follows YAML 1.1 and can parse the key "on" as True.
    return data.get("on", data.get(True, {}))


def as_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label}: expected a mapping")
    return value


def check_required_files(errors: list[str]) -> None:
    if not WORKFLOW_DIR.exists():
        errors.append(".github/workflows is missing")
        return
    present = {path.name for path in WORKFLOW_DIR.glob("*.yml")}
    missing = sorted(REQUIRED_WORKFLOWS - present)
    if missing:
        errors.append(f"missing required workflows: {', '.join(missing)}")


def check_daily_health_sweep(data: dict[str, Any], errors: list[str]) -> None:
    trigger = workflow_on(data)
    if not isinstance(trigger, dict):
        errors.append("daily-health-sweep.yml: on must be a mapping")
        return
    if "workflow_dispatch" not in trigger:
        errors.append("daily-health-sweep.yml: workflow_dispatch trigger missing")
    schedule = trigger.get("schedule")
    if not isinstance(schedule, list) or not schedule:
        errors.append("daily-health-sweep.yml: daily schedule missing")

    permissions = as_mapping(
        data.get("permissions", {}), "daily-health-sweep.yml permissions"
    )
    if permissions.get("contents") != "write":
        errors.append("daily-health-sweep.yml: contents: write permission required")
    if permissions.get("issues") != "write":
        errors.append("daily-health-sweep.yml: issues: write permission required")

    if "concurrency" not in data:
        errors.append("daily-health-sweep.yml: concurrency block missing")

    jobs = as_mapping(data.get("jobs", {}), "daily-health-sweep.yml jobs")
    if "sweep" not in jobs:
        errors.append("daily-health-sweep.yml: sweep job missing")
        return
    sweep = as_mapping(jobs["sweep"], "daily-health-sweep.yml jobs.sweep")
    steps = sweep.get("steps")
    if not isinstance(steps, list) or not steps:
        errors.append("daily-health-sweep.yml: sweep job has no steps")
        return
    step_text = "\n".join(str(step) for step in steps)
    required_snippets = [
        "scripts/check_github_workflows.py",
        "make pages-build",
        "pytest tests/",
        "scripts/check_dashboard_runtime.py",
        "web/scripts/visual-health-check.mjs",
        "scripts/check_live_surfaces.py",
    ]
    for snippet in required_snippets:
        if snippet not in step_text:
            errors.append(f"daily-health-sweep.yml: missing step snippet {snippet!r}")


def check_uptime_monitor(data: dict[str, Any], errors: list[str]) -> None:
    trigger = workflow_on(data)
    if not isinstance(trigger, dict) or "schedule" not in trigger:
        errors.append("uptime-monitor.yml: schedule trigger missing")
    text = (WORKFLOW_DIR / "uptime-monitor.yml").read_text(encoding="utf-8")
    if "redeploy-pages" not in text:
        errors.append("uptime-monitor.yml: redeploy repository_dispatch missing")
    if "scripts/check_live_surfaces.py" not in text:
        errors.append("uptime-monitor.yml: live surface probe missing")


def check_deploy_pages(data: dict[str, Any], errors: list[str]) -> None:
    trigger = workflow_on(data)
    if not isinstance(trigger, dict):
        errors.append("deploy-pages.yml: on must be a mapping")
        return
    if "repository_dispatch" not in trigger:
        errors.append("deploy-pages.yml: repository_dispatch trigger missing")
    text = (WORKFLOW_DIR / "deploy-pages.yml").read_text(encoding="utf-8")
    for snippet in (
        "scripts/build_pages_site.py",
        "scripts/check_live_surfaces.py",
        "cloudflare/wrangler-action",
    ):
        if snippet not in text:
            errors.append(f"deploy-pages.yml: missing {snippet!r}")


def main() -> int:
    errors: list[str] = []
    check_required_files(errors)

    workflows: dict[str, dict[str, Any]] = {}
    for path in sorted(WORKFLOW_DIR.glob("*.yml")):
        try:
            workflows[path.name] = load_workflow(path)
        except ValueError as exc:
            errors.append(str(exc))

    if "daily-health-sweep.yml" in workflows:
        check_daily_health_sweep(workflows["daily-health-sweep.yml"], errors)
    if "uptime-monitor.yml" in workflows:
        check_uptime_monitor(workflows["uptime-monitor.yml"], errors)
    if "deploy-pages.yml" in workflows:
        check_deploy_pages(workflows["deploy-pages.yml"], errors)

    if errors:
        for error in errors:
            print(f"[FAIL] {error}")
        return 1

    print(f"[OK] {len(workflows)} GitHub workflow files validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
