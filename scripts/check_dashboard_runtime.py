#!/usr/bin/env python3
"""Smoke-test the live dashboard Docker runtime.

Checks that:

1. The health endpoint reports an ok state.
2. The dashboard page and JSON endpoints are readable.
3. The watcher loop triggers a rebuild after a watched file mtime change.
4. Dashboard JSON remains strict-JSON-safe.
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TOUCH_PATH = PROJECT_ROOT / "config" / "study_parameters.yml"


def _strict_json_loads(raw: bytes) -> Any:
    return json.loads(
        raw.decode("utf-8"),
        parse_constant=lambda constant: (_ for _ in ()).throw(
            ValueError(f"invalid JSON constant: {constant}")
        ),
    )


def fetch_bytes(url: str, timeout: int = 10) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.read()


def fetch_json(url: str, timeout: int = 10) -> Any:
    return _strict_json_loads(fetch_bytes(url, timeout=timeout))


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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Smoke-test the live dashboard Docker runtime."
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--touch-path", type=Path, default=DEFAULT_TOUCH_PATH)
    args = parser.parse_args(argv)

    base_url = args.base_url.rstrip("/")
    health_url = f"{base_url}/api/healthz"
    page_url = f"{base_url}/dashboard/"
    runtime_url = f"{base_url}/dashboard/data/runtime_status.json"
    dashboard_url = f"{base_url}/dashboard/data/dashboard_data.json"
    readings_url = f"{base_url}/dashboard/data/readings_data.json"

    health = wait_for(
        "healthy dashboard runtime",
        args.timeout,
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
    print(
        "health-ok "
        f"status={health['status']} "
        f"build_count={health.get('build_count', 0)}"
    )

    page_html = fetch_bytes(page_url).decode("utf-8")
    if "NANO Study" not in page_html:
        raise RuntimeError("dashboard HTML did not contain the expected title")

    runtime_before = fetch_json(runtime_url)
    dashboard = fetch_json(dashboard_url)
    readings = fetch_json(readings_url)

    if not dashboard.get("meta"):
        raise RuntimeError("dashboard payload is missing meta")
    if "data_source" not in dashboard["meta"]:
        raise RuntimeError("dashboard payload is missing data_source")
    if not readings.get("summary"):
        raise RuntimeError("readings payload is missing summary")

    args.touch_path.touch()
    target_build_count = int(runtime_before.get("build_count", 0)) + 1

    runtime_after = wait_for(
        "watcher-triggered rebuild",
        args.timeout,
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
            if (payload := fetch_json(runtime_url))
            else None
        ),
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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
