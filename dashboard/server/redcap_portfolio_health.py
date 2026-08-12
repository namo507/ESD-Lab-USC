"""Health evaluation for the aggregate-only REDCap portfolio snapshot."""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence


EXPECTED_SCHEMA = "dashboard.metrics.v1"
DEFAULT_EXPECTED_PROJECTS = 8
DEFAULT_MAX_AGE_SECONDS = 900
_TRUE_VALUES = {"1", "true", "yes", "on"}


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in _TRUE_VALUES


def _utc_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _result(
    status: str,
    reason: str,
    *,
    required: bool,
    expected_projects: int,
    max_age_seconds: int,
    generated_at: str | None = None,
    age_seconds: float | None = None,
    projects_ok: int | None = None,
    projects_total: int | None = None,
    data_version: str | None = None,
) -> dict[str, Any]:
    healthy = status == "ok"
    return {
        "status": status,
        "ready": healthy or not required,
        "required": required,
        "reason": reason,
        "schema": EXPECTED_SCHEMA,
        "generated_at": generated_at,
        "age_seconds": age_seconds,
        "max_age_seconds": max_age_seconds,
        "projects_ok": projects_ok,
        "projects_total": projects_total,
        "expected_projects": expected_projects,
        "data_version": data_version,
    }


def evaluate_portfolio_metrics(
    path: Path,
    *,
    required: bool = False,
    expected_projects: int = DEFAULT_EXPECTED_PROJECTS,
    max_age_seconds: int = DEFAULT_MAX_AGE_SECONDS,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Return a non-sensitive health summary for a metrics artifact."""

    if expected_projects <= 0:
        raise ValueError("expected_projects must be positive")
    if max_age_seconds <= 0:
        raise ValueError("max_age_seconds must be positive")
    if not path.is_file():
        return _result(
            "missing",
            "aggregate_snapshot_missing",
            required=required,
            expected_projects=expected_projects,
            max_age_seconds=max_age_seconds,
        )

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return _result(
            "invalid",
            "aggregate_snapshot_unreadable",
            required=required,
            expected_projects=expected_projects,
            max_age_seconds=max_age_seconds,
        )
    if not isinstance(payload, dict):
        return _result(
            "invalid",
            "aggregate_snapshot_not_an_object",
            required=required,
            expected_projects=expected_projects,
            max_age_seconds=max_age_seconds,
        )

    source = payload.get("source")
    portfolio = payload.get("portfolio")
    projects = payload.get("projects")
    generated_at = payload.get("generated_at")
    projects_ok = source.get("projects_ok") if isinstance(source, dict) else None
    projects_total = (
        source.get("projects_total") if isinstance(source, dict) else None
    )
    shared = {
        "required": required,
        "expected_projects": expected_projects,
        "max_age_seconds": max_age_seconds,
        "generated_at": generated_at if isinstance(generated_at, str) else None,
        "projects_ok": projects_ok if isinstance(projects_ok, int) else None,
        "projects_total": projects_total if isinstance(projects_total, int) else None,
        "data_version": (
            payload.get("data_version")
            if isinstance(payload.get("data_version"), str)
            else None
        ),
    }

    if (
        payload.get("schema") != EXPECTED_SCHEMA
        or payload.get("aggregate_only") is not True
        or not isinstance(source, dict)
        or not isinstance(portfolio, dict)
        or not isinstance(projects, list)
    ):
        return _result("invalid", "aggregate_contract_invalid", **shared)

    project_rows_healthy = (
        len(projects) == expected_projects
        and all(
            isinstance(project, dict) and project.get("status") == "ok"
            for project in projects
        )
    )
    if (
        source.get("kind") != "live"
        or projects_ok != expected_projects
        or projects_total != expected_projects
        or portfolio.get("status") != "ok"
        or not project_rows_healthy
    ):
        return _result("partial", "portfolio_not_fully_healthy", **shared)

    generated = _utc_timestamp(generated_at)
    if generated is None:
        return _result("invalid", "generated_at_invalid", **shared)
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    current = current.astimezone(timezone.utc)
    age_seconds = (current - generated).total_seconds()
    shared["age_seconds"] = round(max(0.0, age_seconds), 3)
    if age_seconds < -300:
        return _result("invalid", "generated_at_too_far_in_future", **shared)
    if age_seconds > max_age_seconds:
        return _result("stale", "aggregate_snapshot_stale", **shared)
    return _result("ok", "aggregate_snapshot_fresh", **shared)


def portfolio_health_from_env(*, now: datetime | None = None) -> dict[str, Any]:
    """Evaluate the configured runtime snapshot without exposing credentials."""

    data_dir = Path(os.getenv("DASHBOARD_DATA_DIR", "dashboard/data"))
    path = Path(
        os.getenv(
            "REDCAP_PORTFOLIO_METRICS_PATH",
            str(data_dir / "dashboard_metrics.json"),
        )
    )
    return evaluate_portfolio_metrics(
        path,
        required=_env_bool("REDCAP_PORTFOLIO_REQUIRED", False),
        expected_projects=int(
            os.getenv(
                "REDCAP_PORTFOLIO_EXPECTED_PROJECTS",
                str(DEFAULT_EXPECTED_PROJECTS),
            )
        ),
        max_age_seconds=int(
            os.getenv(
                "REDCAP_PORTFOLIO_MAX_AGE_SECONDS",
                str(DEFAULT_MAX_AGE_SECONDS),
            )
        ),
        now=now,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--path",
        type=Path,
        default=Path("dashboard/data/dashboard_metrics.json"),
    )
    parser.add_argument(
        "--expected-projects", type=int, default=DEFAULT_EXPECTED_PROJECTS
    )
    parser.add_argument(
        "--max-age-seconds", type=int, default=DEFAULT_MAX_AGE_SECONDS
    )
    parser.add_argument("--quiet", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    payload = evaluate_portfolio_metrics(
        args.path,
        required=True,
        expected_projects=args.expected_projects,
        max_age_seconds=args.max_age_seconds,
    )
    if not args.quiet:
        print(json.dumps(payload, sort_keys=True))
    return 0 if payload["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
