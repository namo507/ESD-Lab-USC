#!/usr/bin/env python3
"""Check Docker daemon, Compose services, and optional HTTP endpoints.

This script is intended for local/devcontainer smoke checks before running
runtime scripts that depend on Docker services.
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


def run_command(command: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
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


def check_compose_services(compose_cmd: list[str], project_name: str | None, services: list[str]) -> list[dict[str, Any]]:
    command = [*compose_cmd]
    if project_name:
        command.extend(["-p", project_name])
    command.extend(["ps", "--format", "json"])

    result = run_command(command, cwd=PROJECT_ROOT)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip() or "unknown error"
        raise RuntimeError(f"Failed to query Compose services: {detail}")

    rows = parse_compose_ps_json(result.stdout)
    if not rows:
        raise RuntimeError("No Compose services were found. Is docker-compose.yml up?")

    if services:
        requested = set(services)
        rows = [
            row
            for row in rows
            if str(row.get("Service") or row.get("Name") or "") in requested
        ]
        if not rows:
            raise RuntimeError(
                "Requested services were not found in Compose status: " + ", ".join(services)
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
        raise RuntimeError("Compose service health check failed: " + "; ".join(unhealthy))

    return rows


def check_http_endpoint(url: str, timeout: int) -> int:
    request = urllib.request.Request(url, headers={"User-Agent": "dashboard-docker-health/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return int(response.status)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate Docker daemon and docker compose service health."
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
        "--json",
        action="store_true",
        help="Print structured JSON output.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    ensure_docker_daemon()
    compose_cmd = resolve_compose_command()
    services = check_compose_services(compose_cmd, args.project_name or None, args.service)

    checked_urls: list[dict[str, Any]] = []
    for url in args.check_url:
        status_code = check_http_endpoint(url, timeout=args.timeout)
        if status_code < 200 or status_code >= 400:
            raise RuntimeError(f"Endpoint check failed: {url} returned HTTP {status_code}")
        checked_urls.append({"url": url, "status": status_code})

    output = {
        "ok": True,
        "compose_command": " ".join(compose_cmd),
        "service_count": len(services),
        "services": services,
        "url_checks": checked_urls,
    }

    if args.json:
        print(json.dumps(output, indent=2))
    else:
        print(
            "docker-health-ok "
            f"services={len(services)} "
            f"compose={' '.join(compose_cmd)}"
        )
        for item in checked_urls:
            print(f"url-ok url={item['url']} status={item['status']}")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"docker-health-failed reason={exc}", file=sys.stderr)
        raise SystemExit(1)
