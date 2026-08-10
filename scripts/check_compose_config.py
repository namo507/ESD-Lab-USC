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

REQUIRED_DASHBOARD_ENVIRONMENT = {
    "DASHBOARD_ASSISTANT_ENABLED",
    "DASHBOARD_ASSISTANT_PROVIDER",
    "DASHBOARD_ASSISTANT_LOCAL_ENABLED",
    "DASHBOARD_ASSISTANT_LOCAL_REQUEST_TIMEOUT_SECONDS",
    "DASHBOARD_ASSISTANT_LOCAL_MAX_RETRIES",
    "DASHBOARD_ASSISTANT_FALLBACK_ENABLED",
    "DASHBOARD_ASSISTANT_FALLBACK_PROVIDER",
    "DASHBOARD_ASSISTANT_FALLBACK_API_BASE",
    "DASHBOARD_ASSISTANT_FALLBACK_API_KEY",
    "DASHBOARD_ASSISTANT_FALLBACK_MODEL",
    "DASHBOARD_ASSISTANT_API_KEY",
    "DASHBOARD_ASSISTANT_LOAD_DOTENV",
    "DASHBOARD_AUDIT_RATE_LIMIT_REQUESTS",
    "DASHBOARD_PRESENTATION_JOB_DB",
    "DASHBOARD_PRESENTATION_MAX_CONCEPT_CHARS",
    "DASHBOARD_PRESENTATION_JOB_TTL_SECONDS",
    "DASHBOARD_PRESENTATION_MAX_TOKENS",
    "DASHBOARD_TRUSTED_CLOUDFLARE_WORKER_ZONE",
    "K8S_MODE_ENABLED",
    "K8S_NAMESPACE",
    "PIPELINE_ENVIRONMENT",
    "READINGS_WATCH_PATH",
    "READINGS_PIPELINE_STATUS_PATH",
    "PIPELINE_MAX_RETRIES",
    "NANO_ID_SALT",
    "PARTICIPANT_ID_SALT",
    "NANO_DATA_ROOT",
    "REDCAP_ABC_SURVEYS_TOKEN",
    "REDCAP_IPSA_SURVEYS_TOKEN",
    "REDCAP_ACTION_TOKEN",
    "REDCAP_IPSA_LAB_TOKEN",
    "REDCAP_ABC_LAB_TOKEN",
    "REDCAP_NICO_TOKEN",
    "REDCAP_NANO_SURVEYS_TOKEN",
    "REDCAP_NANO_LAB_TOKEN",
}

LOCAL_MODEL_KEY = "esd-buddy"
LOCAL_MODEL_ARTIFACT = (
    "${DASHBOARD_ASSISTANT_LOCAL_MODEL_ARTIFACT:-ai/qwen3.5:4b-q4_K_M}"
)


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


def _port_is_loopback_only(port: Any) -> bool:
    if isinstance(port, str):
        return port.startswith("127.0.0.1:") or port.startswith("[::1]:")
    if isinstance(port, dict):
        return str(port.get("host_ip") or "") in {"127.0.0.1", "::1"}
    return False


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

    if dashboard.get("env_file"):
        errors.append(
            f"{path}: dashboard must use an explicit application environment "
            "allowlist instead of loading the whole .env"
        )
    dashboard_environment = _service_environment(dashboard)
    missing_environment = sorted(
        REQUIRED_DASHBOARD_ENVIRONMENT - dashboard_environment.keys()
    )
    if missing_environment:
        errors.append(
            f"{path}: dashboard application allowlist is missing: "
            + ", ".join(missing_environment)
        )
    for forbidden_key in (
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_TUNNEL_TOKEN",
        "CLOUDFLARED_TUNNEL_TOKEN",
    ):
        if forbidden_key in dashboard_environment:
            errors.append(
                f"{path}: dashboard environment must not include {forbidden_key}"
            )
    if dashboard_environment.get("DASHBOARD_ASSISTANT_LOAD_DOTENV") != "false":
        errors.append(f"{path}: dashboard must hard-disable implicit .env loading")
    if dashboard_environment.get("NANO_ID_SALT") != (
        "${NANO_ID_SALT:-${PARTICIPANT_ID_SALT:-}}"
    ):
        errors.append(f"{path}: NANO_ID_SALT must preserve the participant-salt alias")

    if dashboard_environment.get("DASHBOARD_ASSISTANT_PROVIDER") != (
        "${DASHBOARD_ASSISTANT_PROVIDER:-docker-model-runner}"
    ):
        errors.append(f"{path}: Docker Model Runner must be the default provider")
    service_models = dashboard.get("models") or {}
    model_binding = (
        service_models.get(LOCAL_MODEL_KEY)
        if isinstance(service_models, dict)
        else None
    )
    if not isinstance(model_binding, dict):
        errors.append(f"{path}: dashboard must bind the {LOCAL_MODEL_KEY} model")
    else:
        if model_binding.get("endpoint_var") != "DASHBOARD_ASSISTANT_LOCAL_API_BASE":
            errors.append(f"{path}: local model endpoint injection is misconfigured")
        if model_binding.get("model_var") != "DASHBOARD_ASSISTANT_LOCAL_MODEL":
            errors.append(f"{path}: local model identifier injection is misconfigured")

    models = data.get("models") or {}
    local_model = models.get(LOCAL_MODEL_KEY) if isinstance(models, dict) else None
    if not isinstance(local_model, dict):
        errors.append(f"{path}: missing top-level {LOCAL_MODEL_KEY} model")
    else:
        if local_model.get("model") != LOCAL_MODEL_ARTIFACT:
            errors.append(
                f"{path}: {LOCAL_MODEL_KEY} must default to ai/qwen3.5:4b-q4_K_M"
            )
        if local_model.get("context_size") != 8192:
            errors.append(f"{path}: {LOCAL_MODEL_KEY} context_size must be 8192")

    ports = dashboard.get("ports") or []
    if not ports or not all(_port_is_loopback_only(port) for port in ports):
        errors.append(f"{path}: dashboard host ports must bind to loopback only")

    security_opt = dashboard.get("security_opt") or []
    if "no-new-privileges:true" not in security_opt:
        errors.append(f"{path}: dashboard must set no-new-privileges:true")
    cap_drop = dashboard.get("cap_drop") or []
    if "ALL" not in cap_drop:
        errors.append(f"{path}: dashboard must drop all Linux capabilities")

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
        expected_profile = (
            "share" if service_name == "dashboard-share" else "share-named"
        )
        if expected_profile not in profiles:
            errors.append(
                f"{path}: {service_name} must be in the {expected_profile} profile"
            )
        if service_name == "dashboard-share-named" and "share" in profiles:
            errors.append(
                f"{path}: named tunnel must not start with the quick share profile"
            )
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
        if service_name == "dashboard-share-named":
            command = str(service.get("command") or "")
            if "--token-file /run/secrets/cloudflare-tunnel-token" not in command:
                errors.append(
                    f"{path}: named tunnel must read its token from a Compose secret"
                )
            if "--token " in command:
                errors.append(
                    f"{path}: named tunnel token must not appear in command arguments"
                )
            secret_targets = {
                (
                    str(item.get("target") or item.get("source") or "")
                    if isinstance(item, dict)
                    else str(item)
                )
                for item in (service.get("secrets") or [])
            }
            if "cloudflare-tunnel-token" not in secret_targets:
                errors.append(
                    f"{path}: named tunnel must mount cloudflare-tunnel-token"
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
