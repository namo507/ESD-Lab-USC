#!/usr/bin/env python3
"""Validate Docker Compose files without requiring Docker.

This is a local/devcontainer preflight for environments where the Docker CLI or
daemon is unavailable. It is not a full replacement for `docker compose config`;
CI still runs the real Docker build and runtime smoke test.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FILES = [
    PROJECT_ROOT / "docker-compose.yml",
    PROJECT_ROOT / "docker" / "compose.dev.yml",
    PROJECT_ROOT / "docker" / "compose.prod.yml",
]


def _load_yaml(path: Path) -> dict[str, Any]:
    try:
        payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ValueError(f"{path}: YAML parse failed: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"{path}: expected a mapping at document root")
    return payload


def _compose_relative(compose_file: Path, value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return (compose_file.parent / path).resolve()


def _build_context(compose_file: Path, service: dict[str, Any]) -> Path:
    build = service.get("build")
    if isinstance(build, str):
        return _compose_relative(compose_file, build)
    if isinstance(build, dict):
        raw_context = str(build.get("context") or ".")
        return _compose_relative(compose_file, raw_context)
    raise ValueError("dashboard service must define build context")


def _dockerfile_path(context: Path, service: dict[str, Any]) -> Path:
    build = service.get("build")
    dockerfile = "Dockerfile"
    if isinstance(build, dict):
        dockerfile = str(build.get("dockerfile") or dockerfile)
    path = Path(dockerfile)
    if path.is_absolute():
        return path
    return (context / path).resolve()


def _parse_volume_string(raw: str) -> tuple[str, str, str]:
    parts = raw.split(":", 2)
    if len(parts) < 2:
        return raw, "", ""
    if len(parts) == 2:
        return parts[0], parts[1], ""
    return parts[0], parts[1], parts[2]


def _service_volumes(service: dict[str, Any]) -> list[tuple[str, str, str]]:
    parsed: list[tuple[str, str, str]] = []
    for volume in service.get("volumes") or []:
        if isinstance(volume, str):
            parsed.append(_parse_volume_string(volume))
        elif isinstance(volume, dict):
            parsed.append(
                (
                    str(volume.get("source") or ""),
                    str(volume.get("target") or volume.get("destination") or ""),
                    str(volume.get("mode") or ""),
                )
            )
    return parsed


def _service_environment(service: dict[str, Any]) -> dict[str, str]:
    environment = service.get("environment") or {}
    if isinstance(environment, dict):
        return {str(key): str(value) for key, value in environment.items()}
    if isinstance(environment, list):
        parsed: dict[str, str] = {}
        for entry in environment:
            if not isinstance(entry, str) or "=" not in entry:
                continue
            key, value = entry.split("=", 1)
            parsed[key] = value
        return parsed
    return {}


def validate_compose(path: Path) -> list[str]:
    errors: list[str] = []
    data = _load_yaml(path)
    services = data.get("services")
    if not isinstance(services, dict):
        return [f"{path}: missing top-level services mapping"]

    networks = data.get("networks")
    if not isinstance(networks, dict) or not networks:
        errors.append(f"{path}: missing top-level named networks mapping")

    dashboard = services.get("dashboard")
    if not isinstance(dashboard, dict):
        errors.append(f"{path}: missing dashboard service")
        return errors

    try:
        context = _build_context(path, dashboard)
    except ValueError as exc:
        errors.append(f"{path}: {exc}")
        context = PROJECT_ROOT
    if not context.exists():
        errors.append(f"{path}: build context does not exist: {context}")

    dockerfile = _dockerfile_path(context, dashboard)
    if not dockerfile.exists():
        errors.append(f"{path}: dockerfile does not exist: {dockerfile}")

    healthcheck = dashboard.get("healthcheck")
    if not isinstance(healthcheck, dict) or not healthcheck.get("test"):
        errors.append(f"{path}: dashboard service must define healthcheck.test")

    volumes = _service_volumes(dashboard)
    for source, target, _mode in volumes:
        if "ESD Lab readings" in source or "ESD Lab readings" in target:
            errors.append(
                f"{path}: stale spaced readings path in volume {source}:{target}"
            )
        if source.startswith("."):
            source_path = _compose_relative(path, source)
            if not source_path.exists():
                errors.append(f"{path}: volume source does not exist: {source_path}")

    if path.name == "compose.dev.yml":
        if ("..", "/app", "") not in volumes:
            errors.append(f"{path}: dev compose should bind repository root to /app")
        if not any(target == "/app/web/node_modules" for _, target, _ in volumes):
            errors.append(
                f"{path}: dev compose must preserve image frontend dependencies "
                "at /app/web/node_modules"
            )
    if path.name == "docker-compose.yml":
        if (".", "/app", "") not in volumes:
            errors.append(f"{path}: root compose should bind repository root to /app")
    if path.name == "compose.prod.yml":
        required_targets = {"/app/dashboard/data", "/app/esd-lab-readings"}
        actual_targets = {target for _source, target, _mode in volumes}
        missing = sorted(required_targets - actual_targets)
        if missing:
            errors.append(
                f"{path}: prod compose missing volume target(s): {', '.join(missing)}"
            )

    for service_name, service in services.items():
        if not isinstance(service, dict):
            errors.append(f"{path}: service {service_name} must be a mapping")
            continue
        if service.get("restart") != "unless-stopped":
            errors.append(f"{path}: {service_name} must set restart: unless-stopped")
        if not service.get("networks"):
            errors.append(f"{path}: {service_name} must attach to a named network")

    for service_name in ("dashboard-share", "dashboard-share-named"):
        service = services.get(service_name)
        if not isinstance(service, dict):
            errors.append(f"{path}: missing {service_name} service")
            continue
        profiles = service.get("profiles") or []
        if "share" not in profiles:
            errors.append(f"{path}: {service_name} must be in the share profile")
        image = str(service.get("image") or "")
        if not image.startswith("cloudflare/cloudflared:"):
            errors.append(
                f"{path}: {service_name} image should pin cloudflare/cloudflared"
            )
        if service.get("env_file"):
            errors.append(
                f"{path}: {service_name} must not load env_file; "
                "cloudflared logs environment keys and can expose secrets"
            )
        environment = _service_environment(service)
        if (
            environment.get("TUNNEL_TRANSPORT_PROTOCOL")
            != "${CLOUDFLARE_TUNNEL_PROTOCOL:-http2}"
        ):
            errors.append(
                f"{path}: {service_name} must default TUNNEL_TRANSPORT_PROTOCOL "
                "to ${CLOUDFLARE_TUNNEL_PROTOCOL:-http2}"
            )

    return errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "compose_files",
        nargs="*",
        type=Path,
        default=DEFAULT_FILES,
        help="Compose files to validate.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON result.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    checked: list[str] = []
    errors: list[str] = []

    for raw_path in args.compose_files:
        path = raw_path if raw_path.is_absolute() else PROJECT_ROOT / raw_path
        checked.append(str(path.relative_to(PROJECT_ROOT)))
        if not path.exists():
            errors.append(f"{path}: file does not exist")
            continue
        errors.extend(validate_compose(path))

    result = {"checked": checked, "ok": not errors, "errors": errors}
    if args.json:
        print(json.dumps(result, indent=2))
    elif errors:
        for error in errors:
            print(error, file=sys.stderr)
    else:
        print("Compose config preflight passed: " + ", ".join(checked))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
