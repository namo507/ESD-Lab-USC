#!/usr/bin/env python3
"""Check Docker daemon, Compose services, and optional HTTP endpoints.

This script is intended for local/devcontainer smoke checks before running
runtime scripts that depend on Docker services. When `--repair` is provided it
will bring requested Compose services back up and re-run the health checks.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_COMPOSE_FILE = PROJECT_ROOT / "docker" / "compose.dev.yml"


def run_command(
    command: list[str], cwd: Path | None = None
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
    )


def resolve_compose_command() -> list[str]:
    if shutil.which("docker"):
        probe = run_command(["docker", "compose", "version"])
        if probe.returncode == 0:
            return ["docker", "compose"]
    if shutil.which("docker-compose"):
        probe = run_command(["docker-compose", "version"])
        if probe.returncode == 0:
            return ["docker-compose"]
    raise RuntimeError(
        "Docker Compose was not found. Install Docker with the Compose plugin or docker-compose."
    )


def ensure_docker_daemon() -> None:
    if not shutil.which("docker"):
        raise RuntimeError("Docker CLI is not installed or not on PATH.")

    probe = run_command(["docker", "info", "--format", "{{json .ServerVersion}}"])
    if probe.returncode != 0:
        detail = (probe.stderr or probe.stdout).strip() or "unknown error"
        raise RuntimeError(f"Docker daemon is not reachable: {detail}")


def parse_compose_ps_json(raw: str) -> list[dict[str, Any]]:
    text = raw.strip()
    if not text:
        return []

    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [row for row in parsed if isinstance(row, dict)]
    except json.JSONDecodeError:
        pass

    rows: list[dict[str, Any]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            parsed_line = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed_line, dict):
            rows.append(parsed_line)
    return rows


def is_healthy_status(value: str) -> bool:
    normalized = (value or "").strip().lower()
    if not normalized:
        return True
    return "healthy" in normalized or normalized in {"running", "up"}


def is_running_state(value: str) -> bool:
    normalized = (value or "").strip().lower()
    return normalized in {"running", "up"} or normalized.startswith("running")


def compose_base_command(
    compose_cmd: list[str],
    compose_file: Path,
    project_name: str | None,
    profiles: list[str],
) -> list[str]:
    command = [*compose_cmd, "-f", str(compose_file)]
    for profile in profiles:
        command.extend(["--profile", profile])
    if project_name:
        command.extend(["-p", project_name])
    return command


def check_compose_services(
    compose_cmd: list[str],
    compose_file: Path,
    project_name: str | None,
    services: list[str],
    profiles: list[str],
) -> list[dict[str, Any]]:
    command = compose_base_command(compose_cmd, compose_file, project_name, profiles)
    command.extend(["ps", "--format", "json"])

    result = run_command(command, cwd=PROJECT_ROOT)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip() or "unknown error"
        raise RuntimeError(f"Failed to query Compose services: {detail}")

    rows = parse_compose_ps_json(result.stdout)
    if not rows:
        raise RuntimeError(
            "No Compose services were found. Is docker/compose.dev.yml up?"
        )

    if services:
        requested = set(services)
        rows = [
            row
            for row in rows
            if str(row.get("Service") or row.get("Name") or "") in requested
        ]
        present = {str(row.get("Service") or row.get("Name") or "") for row in rows}
        missing = sorted(requested - present)
        if missing:
            raise RuntimeError(
                "Requested services were not found in Compose status: "
                + ", ".join(missing)
            )

    unhealthy: list[str] = []
    for row in rows:
        service = str(row.get("Service") or row.get("Name") or "unknown")
        state = str(row.get("State") or row.get("Status") or "")
        health = str(row.get("Health") or "")

        if not is_running_state(state):
            unhealthy.append(f"{service}: state={state or 'unknown'}")
            continue
        if not is_healthy_status(health):
            unhealthy.append(f"{service}: health={health}")

    if unhealthy:
        raise RuntimeError(
            "Compose service health check failed: " + "; ".join(unhealthy)
        )

    return rows


def query_compose_ps_rows(
    compose_cmd: list[str],
    compose_file: Path,
    project_name: str | None,
    profiles: list[str],
) -> list[dict[str, Any]]:
    """Best-effort snapshot of Compose service rows (never raises)."""
    command = compose_base_command(compose_cmd, compose_file, project_name, profiles)
    command.extend(["ps", "--format", "json"])
    result = run_command(command, cwd=PROJECT_ROOT)
    if result.returncode != 0:
        return []
    return parse_compose_ps_json(result.stdout)


def find_unhealthy_running_services(
    rows: list[dict[str, Any]], services: list[str]
) -> list[str]:
    """Services that are up but failing their healthcheck (hung-but-alive)."""
    requested = set(services)
    names: list[str] = []
    for row in rows:
        service = str(row.get("Service") or row.get("Name") or "")
        if requested and service not in requested:
            continue
        state = str(row.get("State") or row.get("Status") or "")
        health = str(row.get("Health") or "")
        if is_running_state(state) and "unhealthy" in health.strip().lower():
            names.append(service)
    return names


def repair_compose_services(
    compose_cmd: list[str],
    compose_file: Path,
    project_name: str | None,
    services: list[str],
    profiles: list[str],
) -> None:
    targets = services or ["dashboard"]
    base = compose_base_command(compose_cmd, compose_file, project_name, profiles)

    # 1. Restart any service that is alive but failing its healthcheck. A plain
    #    `up -d` is a no-op for an already-running container, so a hung process
    #    would otherwise never recover through this repair path.
    rows = query_compose_ps_rows(compose_cmd, compose_file, project_name, profiles)
    stale = find_unhealthy_running_services(rows, targets)
    if stale:
        run_command([*base, "restart", *stale], cwd=PROJECT_ROOT)

    # 2. (Re)create any service that is missing or stopped.
    result = run_command([*base, "up", "-d", *targets], cwd=PROJECT_ROOT)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip() or "unknown error"
        raise RuntimeError(f"Compose repair failed: {detail}")


def check_http_endpoint(url: str, timeout: int) -> int:
    request = urllib.request.Request(
        url, headers={"User-Agent": "dashboard-docker-health/1.0"}
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return int(response.status)


def check_http_endpoints(urls: list[str], timeout: int) -> list[dict[str, Any]]:
    checked_urls: list[dict[str, Any]] = []
    for url in urls:
        status_code = check_http_endpoint(url, timeout=timeout)
        if status_code < 200 or status_code >= 400:
            raise RuntimeError(
                f"Endpoint check failed: {url} returned HTTP {status_code}"
            )
        checked_urls.append({"url": url, "status": status_code})
    return checked_urls


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate Docker daemon and docker compose service health."
    )
    parser.add_argument(
        "--compose-file",
        type=Path,
        default=DEFAULT_COMPOSE_FILE,
        help="Docker Compose file to inspect.",
    )
    parser.add_argument(
        "--profile",
        action="append",
        default=[],
        help="Compose profile to include. Can be passed multiple times.",
    )
    parser.add_argument(
        "--project-name",
        default="",
        help="Optional Docker Compose project name (same as docker compose -p).",
    )
    parser.add_argument(
        "--service",
        action="append",
        default=[],
        help="Compose service name to require. Can be passed multiple times.",
    )
    parser.add_argument(
        "--check-url",
        action="append",
        default=[],
        help="Optional URL to verify with HTTP 2xx/3xx response. Can be passed multiple times.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=10,
        help="HTTP timeout in seconds for --check-url probes.",
    )
    parser.add_argument(
        "--wait-seconds",
        type=int,
        default=90,
        help="How long to wait for repaired Compose services to become healthy.",
    )
    parser.add_argument(
        "--repair",
        action="store_true",
        help="Bring requested Compose services up and retry when health checks fail.",
    )
    parser.add_argument(
        "--daemon-only",
        action="store_true",
        help="Only verify Docker daemon and Compose availability; skip service and URL checks.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print structured JSON output.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    ensure_docker_daemon()
    compose_cmd = resolve_compose_command()
    compose_file = args.compose_file
    if not compose_file.is_absolute():
        compose_file = PROJECT_ROOT / compose_file

    if args.daemon_only:
        output = {
            "ok": True,
            "compose_command": " ".join(compose_cmd),
            "compose_file": str(compose_file.relative_to(PROJECT_ROOT)),
            "service_count": 0,
            "services": [],
            "url_checks": [],
            "repair_attempted": False,
        }
        if args.json:
            print(json.dumps(output, indent=2))
        else:
            print(
                "docker-preflight-ok "
                f"compose={' '.join(compose_cmd)} "
                f"file={compose_file.relative_to(PROJECT_ROOT)}"
            )
        return 0

    repair_attempted = False
    try:
        services = check_compose_services(
            compose_cmd,
            compose_file,
            args.project_name or None,
            args.service,
            args.profile,
        )
    except RuntimeError:
        if not args.repair:
            raise
        repair_attempted = True
        repair_compose_services(
            compose_cmd,
            compose_file,
            args.project_name or None,
            args.service,
            args.profile,
        )
        services = wait_for_compose_services(
            compose_cmd,
            compose_file,
            args.project_name or None,
            args.service,
            args.profile,
            args.wait_seconds,
        )

    try:
        checked_urls = check_http_endpoints(args.check_url, timeout=args.timeout)
    except Exception:
        if not args.repair:
            raise
        repair_attempted = True
        repair_compose_services(
            compose_cmd,
            compose_file,
            args.project_name or None,
            args.service,
            args.profile,
        )
        services = wait_for_compose_services(
            compose_cmd,
            compose_file,
            args.project_name or None,
            args.service,
            args.profile,
            args.wait_seconds,
        )
        checked_urls = check_http_endpoints(args.check_url, timeout=args.timeout)

    output = {
        "ok": True,
        "compose_command": " ".join(compose_cmd),
        "compose_file": str(compose_file.relative_to(PROJECT_ROOT)),
        "service_count": len(services),
        "services": services,
        "url_checks": checked_urls,
        "repair_attempted": repair_attempted,
    }

    if args.json:
        print(json.dumps(output, indent=2))
    else:
        print(
            "docker-health-ok "
            f"services={len(services)} "
            f"compose={' '.join(compose_cmd)} "
            f"repaired={'yes' if repair_attempted else 'no'}"
        )
        for item in checked_urls:
            print(f"url-ok url={item['url']} status={item['status']}")

    return 0


def wait_for_compose_services(
    compose_cmd: list[str],
    compose_file: Path,
    project_name: str | None,
    services: list[str],
    profiles: list[str],
    wait_seconds: int,
) -> list[dict[str, Any]]:
    import time

    deadline = time.time() + wait_seconds
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            return check_compose_services(
                compose_cmd,
                compose_file,
                project_name,
                services,
                profiles,
            )
        except RuntimeError as exc:
            last_error = exc
            time.sleep(3)
    if last_error is not None:
        raise RuntimeError(f"Compose services did not become healthy: {last_error}")
    raise RuntimeError("Compose services did not become healthy")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"docker-health-failed reason={exc}", file=sys.stderr)
        raise SystemExit(1)
