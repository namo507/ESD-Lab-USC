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
import json
import os
from urllib.parse import urljoin

from check_site_health import check

DEFAULT_CANONICAL_URL = "https://esd-lab-namo.pages.dev/"
DEFAULT_RUNTIME_URL = "https://runtime-share.esd-lab-namo.pages.dev/"
DEFAULT_CANONICAL_ROUTES = (
    "/",
    "/overview",
    "/participants",
    "/runs",
    "/qa",
    "/results",
    "/redcap",
    "/public-insights",
)


def join_route(base_url: str, route: str) -> str:
    normalized_route = route if route.startswith("/") else f"/{route}"
    return urljoin(base_url.rstrip("/") + "/", normalized_route)


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
        help="Require only a 200 assistant status response, not ready=true.",
    )
    parser.add_argument(
        "--probe-api-origin",
        action="store_true",
        help=(
            "Also probe the optional backend origin declared in the Pages meta tag. "
            "By default the public Pages fallback worker is enough for surface health."
        ),
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
                require_assistant_ready=not args.allow_assistant_unready,
                probe_api_origin=args.probe_api_origin,
            )
        )

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
