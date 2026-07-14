#!/usr/bin/env python3
"""Validate repository GitHub Actions wiring for the dashboard health loop."""

from __future__ import annotations

import re
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
    "daily-health-sweep.yml",
}

REQUIRED_ACTION_MAJORS = {
    "checkout": "v7",
    "github-script": "v9",
    "setup-node": "v6",
    "setup-python": "v6",
    "upload-artifact": "v7",
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
    if "sync_local_llm.yml" in present:
        errors.append(
            "sync_local_llm.yml: obsolete local-model workflow must stay removed"
        )
    ci_text = (WORKFLOW_DIR / "ci.yml").read_text(encoding="utf-8")
    if "docker://rhysd/actionlint:1.7.7" not in ci_text:
        errors.append("ci.yml: pinned actionlint release is required")


def check_official_action_runtimes(
    workflow_name: str, path: Path, errors: list[str]
) -> None:
    text = path.read_text(encoding="utf-8")
    for action, major in re.findall(
        r"uses:\s+actions/(checkout|github-script|setup-node|setup-python|upload-artifact)@(v\d+)",
        text,
    ):
        required = REQUIRED_ACTION_MAJORS[action]
        if major != required:
            errors.append(
                f"{workflow_name}: actions/{action}@{major} targets an obsolete "
                f"runtime; use actions/{action}@{required}"
            )


def check_ci(data: dict[str, Any], errors: list[str]) -> None:
    text = (WORKFLOW_DIR / "ci.yml").read_text(encoding="utf-8")
    for snippet in (
        "Prepare writable bind-mount paths",
        "mkdir -p logs web/build dashboard/data data/processed models",
        "chmod -R a+rwX logs web dashboard/data data models",
    ):
        if snippet not in text:
            errors.append(
                "ci.yml: dashboard Docker job must prepare writable bind mounts; "
                f"missing {snippet!r}"
            )


def check_secret_conditions(
    workflow_name: str, data: dict[str, Any], errors: list[str]
) -> None:
    """GitHub does not allow direct secret lookups in step/job conditions."""
    jobs = data.get("jobs", {})
    if not isinstance(jobs, dict):
        return
    for job_name, raw_job in jobs.items():
        if not isinstance(raw_job, dict):
            continue
        job_condition = str(raw_job.get("if", ""))
        if "secrets." in job_condition:
            errors.append(
                f"{workflow_name}: jobs.{job_name}.if references secrets directly; "
                "map the secret into env first"
            )
        steps = raw_job.get("steps", [])
        if not isinstance(steps, list):
            continue
        for index, raw_step in enumerate(steps):
            if not isinstance(raw_step, dict):
                continue
            condition = str(raw_step.get("if", ""))
            if "secrets." in condition:
                label = raw_step.get("name") or f"step {index + 1}"
                errors.append(
                    f"{workflow_name}: {label!r} references secrets directly in if; "
                    "map the secret into env first"
                )


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
        "Close recovered sweep issue",
    ]
    for snippet in required_snippets:
        if snippet not in step_text:
            errors.append(f"daily-health-sweep.yml: missing step snippet {snippet!r}")


def check_uptime_monitor(data: dict[str, Any], errors: list[str]) -> None:
    trigger = workflow_on(data)
    if not isinstance(trigger, dict) or "schedule" not in trigger:
        errors.append("uptime-monitor.yml: schedule trigger missing")
    text = (WORKFLOW_DIR / "uptime-monitor.yml").read_text(encoding="utf-8")
    if "scripts/check_live_surfaces.py" not in text:
        errors.append("uptime-monitor.yml: live surface probe missing")
    if "redeploy-pages" in text or "/dispatches" in text:
        errors.append(
            "uptime-monitor.yml: automated Pages redispatch loop must stay disabled"
        )
    if "--skip-runtime" not in text:
        errors.append(
            "uptime-monitor.yml: durable monitor must ignore ephemeral runtime preview"
        )


def check_deploy_pages(data: dict[str, Any], errors: list[str]) -> None:
    trigger = workflow_on(data)
    if not isinstance(trigger, dict):
        errors.append("deploy-pages.yml: on must be a mapping")
        return
    if "repository_dispatch" in trigger:
        errors.append(
            "deploy-pages.yml: repository_dispatch is forbidden to prevent stale-origin loops"
        )
    text = (WORKFLOW_DIR / "deploy-pages.yml").read_text(encoding="utf-8")
    for snippet in (
        "scripts/build_pages_site.py",
        "scripts/check_live_surfaces.py",
        "cloudflare/wrangler-action@v4",
    ):
        if snippet not in text:
            errors.append(f"deploy-pages.yml: missing {snippet!r}")
    if "--probe-api-origin" in text:
        errors.append(
            "deploy-pages.yml: smoke check must accept intentional fallback-only builds"
        )


def check_docker_publish(data: dict[str, Any], errors: list[str]) -> None:
    text = (WORKFLOW_DIR / "docker-build.yml").read_text(encoding="utf-8")
    for snippet in (
        "DOCKERHUB_CONFIGURED: ${{ secrets.DOCKERHUB_USERNAME != '' && secrets.DOCKERHUB_TOKEN != '' }}",
        "env.DOCKERHUB_CONFIGURED == 'true'",
        "username: ${{ secrets.DOCKERHUB_USERNAME }}",
        "password: ${{ secrets.DOCKERHUB_TOKEN }}",
    ):
        if snippet not in text:
            errors.append(
                f"docker-build.yml: credential-aware publish guard missing {snippet!r}"
            )


def check_redcap_sync(data: dict[str, Any], errors: list[str]) -> None:
    text = (WORKFLOW_DIR / "redcap_sync.yml").read_text(encoding="utf-8")
    for snippet in (
        "REDCAP_CONFIGURED:",
        "r-lib/actions/setup-r@v2",
        "if: env.REDCAP_CONFIGURED == 'true'",
        "if: env.REDCAP_CONFIGURED != 'true'",
        "if: env.REDCAP_CONFIGURED == 'true' && env.PAGES_DEPLOY_HOOK_URL != ''",
    ):
        if snippet in text:
            continue
        errors.append(
            f"redcap_sync.yml: credential-aware skip guard missing {snippet!r}"
        )


def main() -> int:
    errors: list[str] = []
    check_required_files(errors)

    workflows: dict[str, dict[str, Any]] = {}
    for path in sorted(WORKFLOW_DIR.glob("*.yml")):
        try:
            workflows[path.name] = load_workflow(path)
            check_official_action_runtimes(path.name, path, errors)
            check_secret_conditions(path.name, workflows[path.name], errors)
        except ValueError as exc:
            errors.append(str(exc))

    if "daily-health-sweep.yml" in workflows:
        check_daily_health_sweep(workflows["daily-health-sweep.yml"], errors)
    if "ci.yml" in workflows:
        check_ci(workflows["ci.yml"], errors)
    if "uptime-monitor.yml" in workflows:
        check_uptime_monitor(workflows["uptime-monitor.yml"], errors)
    if "deploy-pages.yml" in workflows:
        check_deploy_pages(workflows["deploy-pages.yml"], errors)
    if "docker-build.yml" in workflows:
        check_docker_publish(workflows["docker-build.yml"], errors)
    if "redcap_sync.yml" in workflows:
        check_redcap_sync(workflows["redcap_sync.yml"], errors)

    if errors:
        for error in errors:
            print(f"[FAIL] {error}")
        return 1

    print(f"[OK] {len(workflows)} GitHub workflow files validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
