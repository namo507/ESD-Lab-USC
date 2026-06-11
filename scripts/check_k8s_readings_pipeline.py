#!/usr/bin/env python3
"""Smoke-check the readings pipeline observability contract."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def fetch_json(url: str, timeout: int) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "ESD-Lab-USC-k8s-pipeline-smoke/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"{url} did not return a JSON object")
    return payload


def wait_for(url: str, timeout: int, predicate) -> dict[str, Any]:
    deadline = time.time() + timeout
    last: dict[str, Any] = {}
    while time.time() < deadline:
        last = fetch_json(url, timeout=timeout)
        if predicate(last):
            return last
        time.sleep(1)
    raise RuntimeError(f"Timed out waiting for {url}; last={last}")


def run_local_worker(readings_dir: Path, timeout: int) -> None:
    env = os.environ.copy()
    env["READINGS_WATCH_PATH"] = str(readings_dir)
    env.setdefault("CLUSTER_VISUALIZATION_ENABLED", "true")
    env.setdefault("ASSISTANT_CLUSTER_CONTEXT_ENABLED", "true")
    command = [
        sys.executable,
        "-m",
        "k8s.pipeline.worker",
        "--trigger-source",
        "smoke",
        "--path",
        "k8s_smoke_reading.txt",
    ]
    completed = subprocess.run(
        command,
        cwd=PROJECT_ROOT,
        env=env,
        timeout=timeout,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"local readings worker failed with {completed.returncode}")


def simulate_local_change(readings_dir: Path, timeout: int) -> None:
    readings_dir.mkdir(parents=True, exist_ok=True)
    smoke_file = readings_dir / "k8s_smoke_reading.txt"
    previous = smoke_file.read_text(encoding="utf-8") if smoke_file.exists() else None
    smoke_file.write_text(
        "Kubernetes readings pipeline smoke file. No PHI.\n",
        encoding="utf-8",
    )
    try:
        run_local_worker(readings_dir, timeout)
    finally:
        if previous is None:
            smoke_file.unlink(missing_ok=True)
        else:
            smoke_file.write_text(previous, encoding="utf-8")
        run_local_worker(readings_dir, timeout)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--mode", choices=("local", "kubernetes"), default="local")
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument(
        "--readings-dir",
        type=Path,
        default=PROJECT_ROOT / "esd-lab-readings",
    )
    parser.add_argument(
        "--skip-simulate-change",
        action="store_true",
        help="Only validate APIs; do not run the local worker.",
    )
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")

    if args.mode == "local" and not args.skip_simulate_change:
        simulate_local_change(args.readings_dir, args.timeout)

    pipeline = wait_for(
        f"{base_url}/api/cluster/pipeline",
        args.timeout,
        lambda payload: payload.get("state")
        in {"succeeded", "watching", "idle", "locked"},
    )
    freshness = fetch_json(f"{base_url}/api/readings/freshness", args.timeout)
    assistant = fetch_json(f"{base_url}/api/assistant/status", args.timeout)
    topology = fetch_json(f"{base_url}/api/cluster/topology", args.timeout)

    if not (PROJECT_ROOT / "dashboard/data/readings_data.json").exists():
        raise RuntimeError("dashboard/data/readings_data.json is missing")
    if not (PROJECT_ROOT / "web/lab-readings.json").exists():
        raise RuntimeError("web/lab-readings.json is missing")
    if int(freshness.get("total_indexed") or 0) <= 0:
        raise RuntimeError("readings freshness did not report indexed readings")
    if "freshness" not in assistant:
        raise RuntimeError("assistant status did not include freshness")

    print(
        "k8s-readings-smoke-ok "
        f"mode={pipeline.get('mode')} "
        f"state={pipeline.get('state')} "
        f"readings={freshness.get('total_indexed')} "
        f"topology={topology.get('summary', {}).get('health')}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
