"""Readings filesystem watcher for Kubernetes and local smoke runs."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from .config import PipelineConfig
from .k8s_api import KubernetesApiClient, KubernetesApiError
from .ledger import EventBatch, EventDeduper, EventLedger, sanitize_relative_path

WATCHABLE_SUFFIXES = {".csv", ".json", ".parquet", ".pdf", ".py", ".yaml", ".yml"}


def write_heartbeat(config: PipelineConfig, *, now: float | None = None) -> Path:
    """Atomically publish watcher liveness on the shared dashboard volume."""
    timestamp = time.time() if now is None else now
    path = config.watcher_heartbeat_path
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "readings_watcher_heartbeat.v1",
        "pid": os.getpid(),
        "timestamp": timestamp,
        "updated_at": dt.datetime.fromtimestamp(
            timestamp, tz=dt.timezone.utc
        ).isoformat(),
    }
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)
    return path


def snapshot_tree(root: Path) -> dict[str, tuple[int, int]]:
    if not root.exists():
        return {}
    snapshot: dict[str, tuple[int, int]] = {}
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in WATCHABLE_SUFFIXES:
            continue
        try:
            stat = path.stat()
        except FileNotFoundError:
            continue
        snapshot[sanitize_relative_path(path, root)] = (stat.st_mtime_ns, stat.st_size)
    return snapshot


def changed_paths(
    previous: dict[str, tuple[int, int]],
    current: dict[str, tuple[int, int]],
) -> list[str]:
    keys = set(previous) | set(current)
    return sorted(key for key in keys if previous.get(key) != current.get(key))


def _start_local_worker(config: PipelineConfig, batch: EventBatch) -> int:
    env = os.environ.copy()
    env["READINGS_EVENT_ID"] = batch.event_id
    env["READINGS_EVENT_SIGNATURE"] = batch.signature
    env["READINGS_TRIGGER_SOURCE"] = batch.trigger_source
    command = [
        sys.executable,
        "-m",
        "k8s.pipeline.worker",
        "--trigger-source",
        batch.trigger_source,
    ]
    for path in batch.paths:
        command.extend(["--path", path])
    return subprocess.run(
        command, cwd=config.project_root, env=env, check=False
    ).returncode


def enqueue_batch(config: PipelineConfig, batch: EventBatch) -> bool:
    ledger = EventLedger(config)
    deduper = EventDeduper(config.event_state_path, config.debounce_seconds)
    if not deduper.should_accept(batch.signature):
        ledger.append(
            {
                "event_id": batch.event_id,
                "trigger_source": batch.trigger_source,
                "signature": batch.signature,
                "status": "deduped",
                "paths": batch.paths,
            }
        )
        return False
    deduper.mark_seen(batch.signature)
    ledger.append(
        {
            "event_id": batch.event_id,
            "trigger_source": batch.trigger_source,
            "signature": batch.signature,
            "status": "queued",
            "paths": batch.paths,
        }
    )
    ledger.write_status(
        state="queued",
        queue_depth=1,
        last_event_id=batch.event_id,
        last_trigger_source=batch.trigger_source,
        files_changed_since_last_run=len(batch.paths),
    )

    if config.k8s_mode_enabled:
        try:
            KubernetesApiClient(config).create_readings_job(
                event_id=batch.event_id,
                trigger_source=batch.trigger_source,
                signature=batch.signature,
            )
            return True
        except KubernetesApiError as exc:
            ledger.append(
                {
                    "event_id": batch.event_id,
                    "trigger_source": batch.trigger_source,
                    "signature": batch.signature,
                    "status": "failed",
                    "error": str(exc),
                    "paths": batch.paths,
                }
            )
            ledger.write_status(state="failed", last_failure={"error": str(exc)})
            return False

    return _start_local_worker(config, batch) == 0


def run_once(config: PipelineConfig, trigger_source: str) -> bool:
    snapshot = snapshot_tree(config.readings_watch_path)
    paths = sorted(snapshot) or ["reconcile"]
    return enqueue_batch(
        config,
        EventBatch.create(trigger_source=trigger_source, paths=paths),
    )


def watch_forever(config: PipelineConfig) -> int:
    ledger = EventLedger(config)
    ledger.write_status(state="watching", queue_depth=0)
    write_heartbeat(config)
    previous = snapshot_tree(config.readings_watch_path)
    pending: set[str] = set()
    last_change = 0.0

    while True:
        time.sleep(max(0.25, config.watcher_poll_seconds))
        write_heartbeat(config)
        current = snapshot_tree(config.readings_watch_path)
        changed = changed_paths(previous, current)
        previous = current
        if changed:
            pending.update(changed)
            last_change = time.monotonic()
            continue
        if pending and time.monotonic() - last_change >= config.debounce_seconds:
            batch = EventBatch.create(
                trigger_source="filesystem",
                paths=sorted(pending),
            )
            enqueue_batch(config, batch)
            pending.clear()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--once", action="store_true", help="Run one reconcile event and exit."
    )
    parser.add_argument("--trigger-source", default="scheduled-reconcile")
    args = parser.parse_args(argv)
    config = PipelineConfig.from_env()
    if args.once:
        return 0 if run_once(config, args.trigger_source) else 1
    return watch_forever(config)


if __name__ == "__main__":
    raise SystemExit(main())
