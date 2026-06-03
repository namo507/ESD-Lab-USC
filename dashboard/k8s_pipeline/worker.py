"""Readings pipeline worker.

Runs inside a Kubernetes Job or directly in local smoke tests.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from .config import PipelineConfig
from .ledger import EventBatch
from .ledger import EventDeduper
from .ledger import EventLedger
from .ledger import atomic_write_json
from .ledger import sanitize_relative_path
from .lease import LeaseManager


def _run(command: list[str], *, cwd: Path) -> tuple[int, float]:
    started = time.monotonic()
    completed = subprocess.run(command, cwd=cwd, check=False)
    return completed.returncode, (time.monotonic() - started) * 1000


def _read_readings_count(path: Path) -> int:
    if not path.exists():
        return 0
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return 0
    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    return int(summary.get("total_readings") or summary.get("count") or 0)


def _maybe_emit_pages_hook(config: PipelineConfig, payload: dict[str, Any]) -> None:
    atomic_write_json(config.web_package_trigger_path, payload)
    if not config.pages_deploy_hook_url:
        return
    body = json.dumps(
        {
            "event_type": "readings-index-updated",
            "client_payload": {
                "event_id": payload.get("event_id"),
                "finished_at": payload.get("finished_at"),
                "total_readings": payload.get("total_readings"),
            },
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        config.pages_deploy_hook_url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        response.read()


def run_pipeline(
    *,
    config: PipelineConfig,
    event_id: str,
    trigger_source: str,
    signature: str,
    paths: list[str],
) -> int:
    ledger = EventLedger(config)
    lease = LeaseManager(config.lease_path, config.lease_ttl_seconds)
    owner = f"{event_id}:{uuid.uuid4().hex[:8]}"
    if not lease.acquire(owner):
        current = lease.read()
        ledger.append(
            {
                "event_id": event_id,
                "trigger_source": trigger_source,
                "signature": signature,
                "status": "skipped",
                "reason": "lease-held",
                "lease_owner": current.get("owner"),
                "paths": paths,
            }
        )
        ledger.write_status(
            state="locked",
            lock_owner=current.get("owner"),
            last_event_id=event_id,
            last_trigger_source=trigger_source,
        )
        return 0

    started = time.monotonic()
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    ledger.append(
        {
            "event_id": event_id,
            "trigger_source": trigger_source,
            "signature": signature,
            "status": "running",
            "paths": paths,
            "started_at": started_at,
        }
    )
    ledger.write_status(
        state="running",
        last_event_id=event_id,
        last_trigger_source=trigger_source,
        last_run={
            "event_id": event_id,
            "trigger_source": trigger_source,
            "started_at": started_at,
            "paths": paths,
        },
    )

    try:
        last_error = ""
        for attempt in range(1, config.max_retries + 1):
            readings_code, readings_ms = _run(
                [
                    sys.executable,
                    str(
                        config.project_root
                        / "dashboard"
                        / "pipelines"
                        / "build_readings_index.py"
                    ),
                    "--readings-dir",
                    str(config.readings_watch_path),
                    "--output",
                    str(config.readings_data_path),
                ],
                cwd=config.project_root,
            )
            lab_code, lab_ms = (1, 0.0)
            if readings_code == 0:
                lab_code, lab_ms = _run(
                    [
                        sys.executable,
                        str(
                            config.project_root
                            / "scripts"
                            / "build_lab_readings_index.py"
                        ),
                        "--input",
                        str(config.readings_data_path),
                        "--output",
                        str(config.lab_readings_path),
                        "--pdf-dir",
                        str(config.readings_watch_path),
                    ],
                    cwd=config.project_root,
                )
            if readings_code == 0 and lab_code == 0:
                finished_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                duration_ms = int((time.monotonic() - started) * 1000)
                total_readings = _read_readings_count(config.readings_data_path)
                success = {
                    "event_id": event_id,
                    "trigger_source": trigger_source,
                    "finished_at": finished_at,
                    "duration_ms": duration_ms,
                    "attempt": attempt,
                    "total_readings": total_readings,
                    "readings_ms": int(readings_ms),
                    "lab_readings_ms": int(lab_ms),
                }
                _maybe_emit_pages_hook(
                    config,
                    {
                        **success,
                        "schema": "web_package_trigger.v1",
                        "deploy_hook_configured": bool(config.pages_deploy_hook_url),
                    },
                )
                ledger.append(
                    {
                        **success,
                        "signature": signature,
                        "status": "succeeded",
                        "paths": paths,
                    }
                )
                ledger.write_status(
                    state="succeeded",
                    last_event_id=event_id,
                    last_trigger_source=trigger_source,
                    last_duration_ms=duration_ms,
                    files_changed_since_last_run=0,
                    last_success=success,
                    last_failure=None,
                )
                return 0

            last_error = (
                f"build_readings_index={readings_code}; "
                f"build_lab_readings_index={lab_code}"
            )
            ledger.append(
                {
                    "event_id": event_id,
                    "trigger_source": trigger_source,
                    "signature": signature,
                    "status": "retrying",
                    "attempt": attempt,
                    "error": last_error,
                    "paths": paths,
                }
            )
            if attempt < config.max_retries:
                delay = min(
                    config.retry_max_seconds,
                    config.retry_base_seconds * (2 ** (attempt - 1)),
                )
                time.sleep(delay)

        finished_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        duration_ms = int((time.monotonic() - started) * 1000)
        failure = {
            "event_id": event_id,
            "trigger_source": trigger_source,
            "finished_at": finished_at,
            "duration_ms": duration_ms,
            "attempts": config.max_retries,
            "error": last_error,
        }
        EventDeduper(config.event_state_path, config.debounce_seconds).mark_poisoned(
            signature
        )
        ledger.append(
            {
                **failure,
                "signature": signature,
                "status": "poisoned",
                "paths": paths,
            }
        )
        ledger.write_status(
            state="failed",
            last_event_id=event_id,
            last_trigger_source=trigger_source,
            last_duration_ms=duration_ms,
            last_failure=failure,
        )
        return 1
    finally:
        lease.release(owner)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--trigger-source", default=os.getenv("READINGS_TRIGGER_SOURCE", "manual")
    )
    parser.add_argument("--event-id", default=os.getenv("READINGS_EVENT_ID"))
    parser.add_argument("--signature", default=os.getenv("READINGS_EVENT_SIGNATURE"))
    parser.add_argument("--path", action="append", default=[])
    args = parser.parse_args(argv)

    config = PipelineConfig.from_env()
    paths = [
        sanitize_relative_path(path, config.readings_watch_path) for path in args.path
    ]
    if not paths:
        paths = ["reconcile"]
    batch = EventBatch.create(trigger_source=args.trigger_source, paths=paths)
    event_id = args.event_id or batch.event_id
    signature = args.signature or batch.signature
    return run_pipeline(
        config=config,
        event_id=event_id,
        trigger_source=args.trigger_source,
        signature=signature,
        paths=paths,
    )


if __name__ == "__main__":
    raise SystemExit(main())
