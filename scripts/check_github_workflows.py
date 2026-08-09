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
    "download-artifact": "v8",
}

REDCAP_PORTFOLIO_TOKENS = (
    "REDCAP_ABC_SURVEYS_TOKEN",
    "REDCAP_IPSA_SURVEYS_TOKEN",
    "REDCAP_ACTION_TOKEN",
    "REDCAP_IPSA_LAB_TOKEN",
    "REDCAP_ABC_LAB_TOKEN",
    "REDCAP_NICO_TOKEN",
    "REDCAP_NANO_SURVEYS_TOKEN",
    "REDCAP_NANO_LAB_TOKEN",
)


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
    dockerignore = (ROOT / ".dockerignore").read_text(encoding="utf-8").splitlines()
    for pattern in (".env*", "*.bak"):
        if pattern not in dockerignore:
            errors.append(f".dockerignore: secret boundary missing {pattern!r}")
    env_example = (ROOT / ".env.example").read_text(encoding="utf-8")
    for token_name in REDCAP_PORTFOLIO_TOKENS:
        if f"{token_name}=" not in env_example:
            errors.append(f".env.example: missing placeholder {token_name}")
    if "dashboard/data/dashboard_metrics.json" not in (ROOT / ".gitignore").read_text(
        encoding="utf-8"
    ):
        errors.append(".gitignore: generated dashboard metrics must stay untracked")


def check_pages_redcap_boundary(errors: list[str]) -> None:
    function_text = (ROOT / "functions" / "api" / "redcap.js").read_text(
        encoding="utf-8"
    )
    packager_text = (ROOT / "scripts" / "build_pages_site.py").read_text(
        encoding="utf-8"
    )
    for label, text in (
        ("functions/api/redcap.js", function_text),
        ("scripts/build_pages_site.py", packager_text),
    ):
        for forbidden in ("REDCAP_API_TOKEN", "REDCAP_API_URL"):
            if forbidden in text:
                errors.append(f"{label}: public Pages path references {forbidden}")
    if "status: 410" not in function_text or "permanently retired" not in function_text:
        errors.append("functions/api/redcap.js: retired proxy must return HTTP 410")
    for snippet in (
        "retiredRedcapResponse",
        "dashboard_metrics.json",
        "_validate_public_dashboard_metrics",
        "legacy_dashboard_data.unlink()",
    ):
        if snippet not in packager_text:
            errors.append(
                f"scripts/build_pages_site.py: secure packaging missing {snippet!r}"
            )


def check_official_action_runtimes(
    workflow_name: str, path: Path, errors: list[str]
) -> None:
    text = path.read_text(encoding="utf-8")
    for action, major in re.findall(
        r"uses:\s+actions/(checkout|download-artifact|github-script|setup-node|setup-python|upload-artifact)@(v\d+)",
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
    concurrency = as_mapping(
        data.get("concurrency", {}), "deploy-pages.yml concurrency"
    )
    if concurrency.get("group") != "pages-production-deploy":
        errors.append("deploy-pages.yml: shared Pages deploy concurrency group missing")
    if concurrency.get("cancel-in-progress") is not False:
        errors.append(
            "deploy-pages.yml: an active production deploy must not be cancelled"
        )
    jobs = as_mapping(data.get("jobs", {}), "deploy-pages.yml jobs")
    deploy = as_mapping(jobs.get("deploy", {}), "deploy-pages.yml jobs.deploy")
    if deploy.get("environment") != "redcap-sync":
        errors.append(
            "deploy-pages.yml: deploy job must use the redcap-sync environment"
        )
    permissions = as_mapping(
        data.get("permissions", {}), "deploy-pages.yml permissions"
    )
    if permissions != {"contents": "read"}:
        errors.append("deploy-pages.yml: only contents: read permission is allowed")
    text = (WORKFLOW_DIR / "deploy-pages.yml").read_text(encoding="utf-8")
    for snippet in (
        "scripts/sync_redcap_portfolio.py --require-all",
        "dashboard/data/dashboard_metrics.json",
        "scripts/build_pages_site.py",
        "scripts/check_live_surfaces.py",
        "cloudflare/wrangler-action@v4",
        'VITE_USE_MOCKS: "false"',
        "--require-live-metrics",
        "--max-metrics-age-minutes 15",
        'canonical_url="https://${CLOUDFLARE_PAGES_PROJECT}.pages.dev/"',
        '--canonical-url "$canonical_url"',
    ):
        if snippet not in text:
            errors.append(f"deploy-pages.yml: missing {snippet!r}")
    for token_name in REDCAP_PORTFOLIO_TOKENS:
        if f"secrets.{token_name}" not in text:
            errors.append(f"deploy-pages.yml: missing secret {token_name}")
    if "--probe-api-origin" in text:
        errors.append(
            "deploy-pages.yml: smoke check must accept intentional fallback-only builds"
        )
    if "https://esd-lab-namo.pages.dev/" in text:
        errors.append(
            "deploy-pages.yml: smoke URL must derive from CLOUDFLARE_PAGES_PROJECT"
        )
    for forbidden in (
        'VITE_USE_MOCKS: "true"',
        "REDCAP_API_TOKEN",
        "git add ",
        "git commit ",
        "git push",
        "actions/upload-artifact",
    ):
        if forbidden in text:
            errors.append(
                f"deploy-pages.yml: forbidden production wiring {forbidden!r}"
            )


def check_docker_publish(data: dict[str, Any], errors: list[str]) -> None:
    jobs = as_mapping(data.get("jobs", {}), "docker-build.yml jobs")
    dashboard = as_mapping(
        jobs.get("dashboard-image", {}), "docker-build.yml jobs.dashboard-image"
    )
    scan_permissions = as_mapping(
        dashboard.get("permissions", {}),
        "docker-build.yml jobs.dashboard-image.permissions",
    )
    if scan_permissions.get("packages") == "write":
        errors.append(
            "docker-build.yml: PR build/scan job must not receive packages: write"
        )
    publish = as_mapping(
        jobs.get("publish-dashboard-image", {}),
        "docker-build.yml jobs.publish-dashboard-image",
    )
    publish_permissions = as_mapping(
        publish.get("permissions", {}),
        "docker-build.yml jobs.publish-dashboard-image.permissions",
    )
    if publish_permissions.get("packages") != "write":
        errors.append(
            "docker-build.yml: main-only publish job requires packages: write"
        )
    if publish.get("needs") != "dashboard-image":
        errors.append(
            "docker-build.yml: publish job must depend on the scanned dashboard image"
        )
    publish_condition = str(publish.get("if", ""))
    if "github.event_name == 'push'" not in publish_condition or (
        "github.ref == 'refs/heads/main'" not in publish_condition
    ):
        errors.append("docker-build.yml: publish job must be restricted to main pushes")

    text = (WORKFLOW_DIR / "docker-build.yml").read_text(encoding="utf-8")
    for snippet in (
        "IMAGE_NAME: ghcr.io/${{ github.repository_owner }}/esd-lab-usc-dashboard",
        "docker/setup-buildx-action@v4",
        "docker/build-push-action@v7",
        "outputs: type=docker,dest=${{ runner.temp }}/dashboard-image.tar",
        'docker load --input "$RUNNER_TEMP/dashboard-image.tar"',
        "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25",
        'exit-code: "1"',
        "severity: CRITICAL,HIGH",
        "actions/upload-artifact@v7",
        "archive: false",
        "actions/download-artifact@v8",
        "EXPECTED_IMAGE_TAR_SHA256:",
        "docker/login-action@v4",
        "registry: ghcr.io",
        "password: ${{ secrets.GITHUB_TOKEN }}",
        'docker push "$IMAGE_REF"',
        'docker push "$IMAGE_NAME:latest"',
    ):
        if snippet not in text:
            errors.append(
                f"docker-build.yml: secure GHCR publish contract missing {snippet!r}"
            )
    for forbidden in ("DOCKERHUB_", "continue-on-error", "docker scout"):
        if forbidden in text:
            errors.append(
                f"docker-build.yml: obsolete or false-green scan wiring found {forbidden!r}"
            )

    steps = dashboard.get("steps", [])
    if not isinstance(steps, list):
        errors.append("docker-build.yml: dashboard-image steps must be a list")
        return
    step_names = [str(step.get("name", "")) for step in steps if isinstance(step, dict)]
    scan_order = [
        "Build dashboard image",
        "Load dashboard image for scanning",
        "Scan dashboard image for fixable high-severity CVEs",
        "Record scanned image artifact digest",
        "Preserve scanned image for main-only publish",
    ]
    try:
        positions = [step_names.index(name) for name in scan_order]
    except ValueError:
        errors.append(
            "docker-build.yml: build, scan, and scanned-artifact steps are required"
        )
    else:
        if positions != sorted(positions):
            errors.append(
                "docker-build.yml: image must be built, loaded, scanned, and "
                "preserved in that order"
            )
    if "Log in to GitHub Container Registry" in step_names:
        errors.append(
            "docker-build.yml: scan job must not receive registry credentials"
        )

    publish_steps = publish.get("steps", [])
    if not isinstance(publish_steps, list):
        errors.append("docker-build.yml: publish-dashboard-image steps must be a list")
        return
    publish_names = [
        str(step.get("name", "")) for step in publish_steps if isinstance(step, dict)
    ]
    for required in (
        "Download scanned dashboard image",
        "Log in to GitHub Container Registry",
        "Publish dashboard image",
    ):
        if required not in publish_names:
            errors.append(f"docker-build.yml: publish job missing {required!r}")
    if "Build dashboard image" in publish_names:
        errors.append(
            "docker-build.yml: publish job must push the scanned artifact without rebuilding"
        )


def check_redcap_sync(data: dict[str, Any], errors: list[str]) -> None:
    trigger = workflow_on(data)
    if not isinstance(trigger, dict):
        errors.append("redcap_sync.yml: on must be a mapping")
        return
    schedule = trigger.get("schedule")
    if not isinstance(schedule, list) or not any(
        isinstance(item, dict) and item.get("cron") == "*/5 * * * *"
        for item in schedule
    ):
        errors.append("redcap_sync.yml: five-minute schedule is required")
    if "workflow_dispatch" not in trigger:
        errors.append("redcap_sync.yml: workflow_dispatch trigger missing")

    permissions = as_mapping(data.get("permissions", {}), "redcap_sync.yml permissions")
    if permissions != {"contents": "read"}:
        errors.append("redcap_sync.yml: only contents: read permission is allowed")
    concurrency = as_mapping(data.get("concurrency", {}), "redcap_sync.yml concurrency")
    if concurrency.get("group") != "pages-production-deploy":
        errors.append("redcap_sync.yml: shared Pages deploy concurrency group missing")
    if concurrency.get("cancel-in-progress") is not False:
        errors.append(
            "redcap_sync.yml: an active production deploy must not be cancelled"
        )

    jobs = as_mapping(data.get("jobs", {}), "redcap_sync.yml jobs")
    job = as_mapping(
        jobs.get("sync-and-deploy", {}), "redcap_sync.yml jobs.sync-and-deploy"
    )
    if job.get("environment") != "redcap-sync":
        errors.append("redcap_sync.yml: sync job must use the redcap-sync environment")

    text = (WORKFLOW_DIR / "redcap_sync.yml").read_text(encoding="utf-8")
    for snippet in (
        "scripts/sync_redcap_portfolio.py --require-all",
        "dashboard/data/dashboard_metrics.json",
        'VITE_USE_MOCKS: "false"',
        "cloudflare/wrangler-action@v4",
        "--require-live-metrics",
        "--max-metrics-age-minutes 15",
    ):
        if snippet not in text:
            errors.append(f"redcap_sync.yml: secure live sync missing {snippet!r}")
    for token_name in REDCAP_PORTFOLIO_TOKENS:
        if f"secrets.{token_name}" not in text:
            errors.append(f"redcap_sync.yml: missing secret {token_name}")
    for forbidden in (
        'VITE_USE_MOCKS: "true"',
        "REDCAP_API_TOKEN",
        "PAGES_DEPLOY_HOOK_URL",
        "git add ",
        "git commit ",
        "git push",
        "actions/upload-artifact",
        "contents: write",
    ):
        if forbidden in text:
            errors.append(f"redcap_sync.yml: forbidden production wiring {forbidden!r}")


def main() -> int:
    errors: list[str] = []
    check_required_files(errors)
    check_pages_redcap_boundary(errors)

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
