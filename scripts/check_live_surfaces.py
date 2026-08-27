#!/usr/bin/env python3
"""Probe the public dashboard surfaces that should stay continuously healthy.

The canonical React dashboard lives at ``https://esd-lab-namo.pages.dev/``.
The runtime-share preview, when present, lives on the non-production Pages
branch and wraps the current local tunnel origin.

This script keeps those checks in one place so GitHub Actions, local operators,
and repair workflows do not drift.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

# Ensure the scripts directory is on sys.path for sibling imports, so this
# module works regardless of the current working directory or invocation style.
_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from check_site_health import check  # noqa: E402

_REPO_ROOT = Path(__file__).resolve().parent.parent


def _freshness_contract() -> tuple[str, dict[str, int]]:
    """Read the published cadence and SLA from the portfolio config.

    Was a pair of literals here (``"every_5_minutes"`` / 15 minutes) duplicated
    from build_pages_site.py and neither derived from the config that emits
    them, which let the published contract drift off the sync it described.
    """
    if str(_REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(_REPO_ROOT))
    from redcap.api.multi_project import (  # noqa: E402
        cadence_label,
        load_portfolio_config,
        sla_payload,
    )

    config = load_portfolio_config(_REPO_ROOT / "config" / "redcap_projects.yml")
    return (
        cadence_label(config.refresh_cadence_seconds),
        sla_payload(config.sla_seconds),
    )


DEFAULT_CANONICAL_URL = "https://esd-lab-namo.pages.dev/"
DEFAULT_RUNTIME_URL = "https://runtime-share.esd-lab-namo.pages.dev/"
METRICS_PATH = "/dashboard/data/dashboard_metrics.json"
RETIRED_REDCAP_PATH = "/api/redcap"
METRICS_SCHEMA = "dashboard.metrics.v1"
METRICS_VERSION_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
EXPECTED_PROJECTS = 8
PROBE_USER_AGENT = "ESD-Lab-USC-health-probe/1.0"
DEFAULT_CANONICAL_ROUTES = (
    "/",
    "/overview",
    "/participants",
    "/runs",
    "/qa",
    "/results",
    "/redcap",
    "/redcap-portfolio",
    "/nano/dashboard",
    "/public-insights",
)


def join_route(base_url: str, route: str) -> str:
    normalized_route = route if route.startswith("/") else f"/{route}"
    return urljoin(base_url.rstrip("/") + "/", normalized_route)


def _fetch(request: Request, timeout: int) -> tuple[int, bytes]:
    try:
        with urlopen(request, timeout=timeout) as response:  # noqa: S310
            return response.status, response.read()
    except HTTPError as exc:
        return exc.code, exc.read()


def validate_live_metrics(
    payload: object,
    *,
    max_age_minutes: float,
    now: dt.datetime | None = None,
) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise ValueError("dashboard metrics must be a JSON object")
    if payload.get("schema") != METRICS_SCHEMA:
        raise ValueError(f"dashboard metrics schema must be {METRICS_SCHEMA}")
    if payload.get("aggregate_only") is not True:
        raise ValueError("dashboard metrics are not aggregate-only")
    if not METRICS_VERSION_RE.fullmatch(str(payload.get("data_version", ""))):
        raise ValueError("dashboard metrics data_version is invalid")

    source = payload.get("source")
    if not isinstance(source, dict):
        raise ValueError("dashboard metrics source is missing")
    if (
        source.get("kind") != "live"
        or source.get("transport") != "api"
        or source.get("system") != "REDCap"
    ):
        raise ValueError("dashboard metrics are not from the live REDCap API")
    expected_cadence, expected_sla = _freshness_contract()
    if source.get("cadence") != expected_cadence:
        raise ValueError(f"dashboard metrics cadence is not {expected_cadence}")
    if source.get("projects_total") != EXPECTED_PROJECTS:
        raise ValueError("dashboard metrics do not cover all eight projects")
    if source.get("projects_ok") != EXPECTED_PROJECTS:
        raise ValueError("dashboard metrics do not report 8/8 project health")
    sla = source.get("sla")
    if sla != expected_sla:
        raise ValueError(
            "dashboard metrics freshness SLA must be "
            f"{expected_sla['max_age_minutes']} minutes"
        )

    projects = payload.get("projects")
    if not isinstance(projects, list) or len(projects) != EXPECTED_PROJECTS:
        raise ValueError("dashboard metrics must contain exactly eight projects")
    if any(
        not isinstance(project, dict) or project.get("status") != "ok"
        for project in projects
    ):
        raise ValueError("dashboard metrics contain an unhealthy project")

    generated_at = str(payload.get("generated_at", ""))
    try:
        generated = dt.datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("dashboard metrics generated_at is invalid") from exc
    if generated.tzinfo is None:
        raise ValueError("dashboard metrics generated_at must include a timezone")
    current = now or dt.datetime.now(dt.timezone.utc)
    age_minutes = (current - generated.astimezone(dt.timezone.utc)).total_seconds() / 60
    if age_minutes < -5:
        raise ValueError("dashboard metrics timestamp is unexpectedly in the future")
    if age_minutes > max_age_minutes:
        raise ValueError(
            f"dashboard metrics are stale ({age_minutes:.1f}m > {max_age_minutes:.1f}m)"
        )
    return {
        "schema": METRICS_SCHEMA,
        "projects_total": EXPECTED_PROJECTS,
        "projects_ok": EXPECTED_PROJECTS,
        "age_minutes": round(max(0.0, age_minutes), 2),
    }


def probe_dashboard_metrics(
    base_url: str, *, timeout: int, max_age_minutes: float
) -> dict[str, object]:
    url = join_route(base_url, METRICS_PATH)
    print(f"[surface] live-metrics -> {url}")
    try:
        status, raw = _fetch(
            Request(
                url,
                headers={
                    "Accept": "application/json",
                    "User-Agent": PROBE_USER_AGENT,
                },
            ),
            timeout,
        )
        if status != 200:
            raise ValueError(f"dashboard metrics returned HTTP {status}")
        details = validate_live_metrics(
            json.loads(raw.decode("utf-8")), max_age_minutes=max_age_minutes
        )
    except (
        json.JSONDecodeError,
        UnicodeDecodeError,
        URLError,
        OSError,
        ValueError,
    ) as exc:
        print(f"[FAIL] live dashboard metrics: {exc}")
        return {"name": "live-metrics", "url": url, "ok": False, "error": str(exc)}
    print(
        "[OK] live dashboard metrics: "
        f"{details['projects_ok']}/{details['projects_total']} projects, "
        f"age={details['age_minutes']}m"
    )
    return {"name": "live-metrics", "url": url, "ok": True, **details}


def probe_retired_redcap(base_url: str, *, timeout: int) -> dict[str, object]:
    url = join_route(base_url, RETIRED_REDCAP_PATH)
    print(f"[surface] retired-redcap-proxy -> {url}")
    request = Request(
        url,
        data=b'{"content":"project"}',
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": PROBE_USER_AGENT,
        },
    )
    try:
        status, _raw = _fetch(request, timeout)
    except (URLError, OSError) as exc:
        print(f"[FAIL] retired REDCap proxy probe: {exc}")
        return {
            "name": "retired-redcap-proxy",
            "url": url,
            "ok": False,
            "error": str(exc),
        }
    ok = status == 410
    if not ok:
        print(f"[FAIL] public REDCap proxy expected HTTP 410, got {status}")
    else:
        print("[OK] public REDCap proxy is permanently retired (HTTP 410)")
    return {
        "name": "retired-redcap-proxy",
        "url": url,
        "ok": ok,
        "status": status,
    }


def probe(
    *,
    name: str,
    url: str,
    timeout: int,
    min_bytes: int,
    must_contain: list[str],
    max_stamp_age_hours: float | None,
    probe_assistant: bool,
    require_assistant_ready: bool,
    probe_api_origin: bool,
) -> dict[str, object]:
    print(f"[surface] {name} -> {url}")
    exit_code = check(
        url=url,
        timeout=timeout,
        min_bytes=min_bytes,
        must_contain=must_contain,
        max_stamp_age_hours=max_stamp_age_hours,
        assistant_status_path="/api/assistant/status",
        probe_assistant=probe_assistant,
        require_assistant_ready=require_assistant_ready,
        probe_api_origin=probe_api_origin,
    )
    return {"name": name, "url": url, "ok": exit_code == 0, "exit_code": exit_code}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--canonical-url",
        default=os.environ.get("CANONICAL_PAGES_URL", DEFAULT_CANONICAL_URL),
        help="Canonical Cloudflare Pages dashboard URL.",
    )
    parser.add_argument(
        "--canonical-route",
        action="append",
        default=None,
        help="Canonical SPA route to probe. Can be passed multiple times.",
    )
    parser.add_argument(
        "--runtime-url",
        default=os.environ.get(
            "RUNTIME_PAGES_URL",
            os.environ.get("CLOUDFLARE_RUNTIME_PAGES_URL", DEFAULT_RUNTIME_URL),
        ),
        help="Runtime-share Pages preview URL.",
    )
    parser.add_argument(
        "--skip-runtime",
        action="store_true",
        help="Only check the canonical Pages site.",
    )
    parser.add_argument("--timeout", type=int, default=25)
    parser.add_argument("--canonical-min-bytes", type=int, default=8192)
    parser.add_argument("--runtime-min-bytes", type=int, default=2048)
    parser.add_argument(
        "--max-stamp-age-hours",
        type=float,
        default=None,
        help="Fail canonical routes when the deploy stamp is older than this.",
    )
    parser.add_argument(
        "--allow-assistant-unready",
        action="store_true",
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--require-assistant-ready",
        action="store_true",
        help="Also require the hosted assistant provider to report ready=true.",
    )
    parser.add_argument(
        "--probe-api-origin",
        action="store_true",
        help=(
            "Also probe the optional backend origin declared in the Pages meta tag. "
            "By default the public Pages fallback worker is enough for surface health."
        ),
    )
    metrics_group = parser.add_mutually_exclusive_group()
    metrics_group.add_argument(
        "--require-live-metrics",
        dest="require_live_metrics",
        action="store_true",
        help="Require a fresh aggregate-only 8/8 REDCap portfolio snapshot.",
    )
    metrics_group.add_argument(
        "--skip-live-metrics",
        dest="require_live_metrics",
        action="store_false",
        help="Skip REDCap portfolio and retired-proxy checks for local-only probes.",
    )
    parser.set_defaults(require_live_metrics=True)
    parser.add_argument(
        "--max-metrics-age-minutes",
        type=float,
        default=float(
            os.environ.get(
                "REDCAP_METRICS_MAX_AGE_MINUTES",
                _freshness_contract()[1]["max_age_minutes"],
            )
        ),
        help="Maximum accepted age for the live REDCap aggregate snapshot.",
    )
    parser.add_argument("--json", action="store_true", help="Print JSON summary.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    routes = args.canonical_route or list(DEFAULT_CANONICAL_ROUTES)
    results: list[dict[str, object]] = []

    for route in routes:
        results.append(
            probe(
                name=f"canonical{route}",
                url=join_route(args.canonical_url, route),
                timeout=args.timeout,
                min_bytes=args.canonical_min_bytes,
                must_contain=["esd-deploy-stamp", "NANO"],
                max_stamp_age_hours=args.max_stamp_age_hours,
                probe_assistant=True,
                require_assistant_ready=(
                    args.require_assistant_ready and not args.allow_assistant_unready
                ),
                probe_api_origin=args.probe_api_origin,
            )
        )

    if args.require_live_metrics:
        results.append(
            probe_dashboard_metrics(
                args.canonical_url,
                timeout=args.timeout,
                max_age_minutes=args.max_metrics_age_minutes,
            )
        )
        results.append(probe_retired_redcap(args.canonical_url, timeout=args.timeout))

    if not args.skip_runtime and args.runtime_url:
        results.append(
            probe(
                name="runtime-share",
                url=args.runtime_url,
                timeout=args.timeout,
                min_bytes=args.runtime_min_bytes,
                must_contain=["Dashboard"],
                max_stamp_age_hours=None,
                probe_assistant=False,
                require_assistant_ready=False,
                probe_api_origin=False,
            )
        )

    failed = [item for item in results if not item["ok"]]
    summary = {"ok": not failed, "checked": len(results), "failed": failed}
    if args.json:
        print(json.dumps({"summary": summary, "results": results}, indent=2))
    elif failed:
        print(
            "[FAIL] unhealthy surfaces: "
            + ", ".join(str(item["name"]) for item in failed)
        )
    else:
        print(f"[OK] all live surfaces healthy ({len(results)} checked)")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
