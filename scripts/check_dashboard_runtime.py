#!/usr/bin/env python3
"""Smoke-test the live dashboard runtime and optional public share.

Checks that:

1. The health endpoint reports an ok state.
2. The dashboard page and JSON endpoints are readable.
3. The watcher loop triggers a rebuild after a watched file mtime change.
4. The Pages wrapper embeds a live dashboard origin when requested.
5. An optional repair path can refresh the quick tunnel and redeploy Pages.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TOUCH_PATH = PROJECT_ROOT / "config" / "study_parameters.yml"
DEFAULT_PAGES_URL = "https://esd-lab-namo.pages.dev/"
FRAME_URL_RE = re.compile(
    r'<iframe[^>]*id=["\']dashboard-frame["\'][^>]*src=["\']([^"\']+)["\']',
    re.IGNORECASE,
)


def _strict_json_loads(raw: bytes) -> Any:
    return json.loads(
        raw.decode("utf-8"),
        parse_constant=lambda constant: (_ for _ in ()).throw(
            ValueError(f"invalid JSON constant: {constant}")
        ),
    )


def fetch_bytes(url: str, timeout: int = 10) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "ESD-Lab-USC-dashboard-watchdog/1.0",
            "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def fetch_text(url: str, timeout: int = 10) -> str:
    return fetch_bytes(url, timeout=timeout).decode("utf-8")


def fetch_json(url: str, timeout: int = 10) -> Any:
    return _strict_json_loads(fetch_bytes(url, timeout=timeout))


def extract_dashboard_frame_url(page_html: str) -> str:
    match = FRAME_URL_RE.search(page_html)
    if not match:
        raise RuntimeError("Pages wrapper did not contain a dashboard-frame iframe src")
    return match.group(1)


def wait_for(description: str, timeout: int, probe, interval: float = 2.0):
    deadline = time.time() + timeout
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            result = probe()
            if result:
                return result
        except Exception as exc:  # pragma: no cover - exercised in runtime validation
            last_error = exc
        time.sleep(interval)
    if last_error is not None:
        raise RuntimeError(
            f"Timed out waiting for {description}: {last_error}"
        ) from last_error
    raise RuntimeError(f"Timed out waiting for {description}")


def probe_dashboard_runtime(base_url: str, timeout: int) -> dict[str, Any]:
    health_url = f"{base_url}/api/healthz"
    page_url = f"{base_url}/dashboard/"
    runtime_url = f"{base_url}/dashboard/data/runtime_status.json"
    dashboard_url = f"{base_url}/dashboard/data/dashboard_data.json"
    readings_url = f"{base_url}/dashboard/data/readings_data.json"

    health = wait_for(
        "healthy dashboard runtime",
        timeout,
        lambda: (
            (
                payload
                if payload.get("status") == "ok"
                and payload.get("dashboard")
                and payload.get("readings")
                else None
            )
            if (payload := fetch_json(health_url))
            else None
        ),
    )

    page_html = fetch_text(page_url, timeout=timeout)
    if "NANO Study" not in page_html:
        raise RuntimeError("dashboard HTML did not contain the expected title")

    runtime = fetch_json(runtime_url, timeout=timeout)
    dashboard = fetch_json(dashboard_url, timeout=timeout)
    readings = fetch_json(readings_url, timeout=timeout)

    if not dashboard.get("meta"):
        raise RuntimeError("dashboard payload is missing meta")
    if "data_source" not in dashboard["meta"]:
        raise RuntimeError("dashboard payload is missing data_source")
    if not readings.get("summary"):
        raise RuntimeError("readings payload is missing summary")

    return {
        "health": health,
        "runtime": runtime,
        "dashboard": dashboard,
        "readings": readings,
    }


def exercise_rebuild(
    base_url: str,
    timeout: int,
    touch_path: Path,
    runtime_before: dict[str, Any],
) -> dict[str, Any]:
    runtime_url = f"{base_url}/dashboard/data/runtime_status.json"
    touch_path.touch()
    target_build_count = int(runtime_before.get("build_count", 0)) + 1

    return wait_for(
        "watcher-triggered rebuild",
        timeout,
        lambda: (
            (
                payload
                if payload.get("status") == "ok"
                and int(payload.get("build_count", 0)) >= target_build_count
                and payload.get("last_build_reason") == "source-change"
                and payload.get("last_build_finished_at")
                != runtime_before.get("last_build_finished_at")
                else None
            )
            if (payload := fetch_json(runtime_url, timeout=timeout))
            else None
        ),
    )


def probe_pages_wrapper(pages_url: str, timeout: int) -> dict[str, str]:
    wrapper_html = fetch_text(pages_url, timeout=timeout)
    origin_url = extract_dashboard_frame_url(wrapper_html)
    origin_html = fetch_text(origin_url, timeout=timeout)
    if "NANO Study" not in origin_html:
        raise RuntimeError("embedded dashboard origin did not contain the expected title")
    return {"wrapper_url": pages_url, "origin_url": origin_url}


def repair_public_share(mode: str) -> None:
    command = (
        "if [[ -f .env ]]; then set -a; source .env; set +a; fi; "
        f"bash scripts/share_dashboard.sh --mode {mode}"
    )
    subprocess.run(["bash", "-lc", command], cwd=PROJECT_ROOT, check=True)


def run_cycle(args: argparse.Namespace, *, exercise_watcher: bool) -> None:
    base_url = args.base_url.rstrip("/")
    runtime_state = probe_dashboard_runtime(base_url, args.timeout)

    health = runtime_state["health"]
    dashboard = runtime_state["dashboard"]
    readings = runtime_state["readings"]

    print(
        "health-ok "
        f"status={health['status']} "
        f"build_count={health.get('build_count', 0)}"
    )

    if exercise_watcher:
        runtime_after = exercise_rebuild(
            base_url,
            args.timeout,
            args.touch_path,
            runtime_state["runtime"],
        )
        print(
            "rebuild-ok "
            f"build_count={runtime_after.get('build_count')} "
            f"finished_at={runtime_after.get('last_build_finished_at')}"
        )

    print(
        "payload-ok "
        f"data_source={dashboard['meta'].get('data_source')} "
        f"total_readings={readings['summary'].get('total_readings', 0)}"
    )

    if args.pages_url:
        public_share = probe_pages_wrapper(args.pages_url, timeout=args.timeout)
        print(
            "share-ok "
            f"wrapper={public_share['wrapper_url']} "
            f"origin={public_share['origin_url']}"
        )


def run_with_optional_repair(args: argparse.Namespace, *, exercise_watcher: bool) -> None:
    try:
        run_cycle(args, exercise_watcher=exercise_watcher)
        return
    except Exception as exc:
        if not args.repair_share:
            raise
        print(f"share-repair-needed reason={exc}")

    repair_public_share(args.share_mode)
    run_cycle(args, exercise_watcher=exercise_watcher)
    print(f"share-repair-ok mode={args.share_mode}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Smoke-test the live dashboard runtime and optional public share."
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--touch-path", type=Path, default=DEFAULT_TOUCH_PATH)
    parser.add_argument(
        "--pages-url",
        default="",
        help=f"Canonical public Pages wrapper URL to verify (for example: {DEFAULT_PAGES_URL})",
    )
    parser.add_argument(
        "--repair-share",
        action="store_true",
        help="If checks fail, refresh the public share via scripts/share_dashboard.sh and make pages-deploy.",
    )
    parser.add_argument(
        "--share-mode",
        choices=("auto", "named", "quick"),
        default="quick",
        help="Share mode to use when --repair-share triggers a live-share refresh.",
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Continuously verify the local runtime and optional Pages wrapper using lightweight checks.",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=120,
        help="Seconds between watch cycles when --watch is enabled.",
    )
    parser.add_argument(
        "--max-cycles",
        type=int,
        default=0,
        help="Optional cap on watch cycles. 0 means run continuously.",
    )
    args = parser.parse_args(argv)

    if args.watch:
        cycle_count = 0
        while True:
            cycle_count += 1
            print(f"watch-cycle={cycle_count}")
            run_with_optional_repair(args, exercise_watcher=False)
            if args.max_cycles and cycle_count >= args.max_cycles:
                break
            time.sleep(args.interval)
    else:
        run_with_optional_repair(args, exercise_watcher=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
