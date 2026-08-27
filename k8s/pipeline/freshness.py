"""Read-only freshness projections for APIs and assistant context."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .config import PipelineConfig
from .ledger import EventLedger
from .ledger import read_json
from .ledger import summarize_readings_payload
from .ledger import utc_now


def _file_signature(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"exists": False}
    stat = path.stat()
    return {
        "exists": True,
        "size_bytes": stat.st_size,
        "modified_at": stat.st_mtime,
    }


def changed_since_last_run(config: PipelineConfig, last_indexed_at: str | None) -> int:
    if not last_indexed_at or not config.readings_watch_path.exists():
        return 0
    # Keep this cheap and conservative. We avoid parsing timestamps to preserve
    # portability across local/Kubernetes runtimes; the watcher does precise
    # event detection, while this field is just an operator hint.
    status = EventLedger(config).read_status()
    return int(status.get("files_changed_since_last_run") or 0)


def readings_freshness_payload(config: PipelineConfig | None = None) -> dict[str, Any]:
    config = config or PipelineConfig.from_env()
    ledger = EventLedger(config)
    status = ledger.read_status()
    readings_summary = summarize_readings_payload(config.readings_data_path)
    lab_payload = read_json(config.lab_readings_path)
    lab_summary = (
        lab_payload.get("summary")
        if isinstance(lab_payload.get("summary"), dict)
        else {}
    )

    last_success = (
        status.get("last_success")
        if isinstance(status.get("last_success"), dict)
        else {}
    )
    last_indexed_at = (
        last_success.get("finished_at")
        or readings_summary.get("generated_at")
        or lab_payload.get("generated_at")
    )
    return {
        "schema": "readings_freshness.v1",
        "mode": config.mode_label,
        "generated_at": utc_now(),
        "last_indexed_at": last_indexed_at,
        "readings_generated_at": readings_summary.get("generated_at"),
        "lab_readings_generated_at": lab_payload.get("generated_at"),
        "total_indexed": readings_summary.get("total_readings")
        or lab_summary.get("count")
        or 0,
        "total_pages": readings_summary.get("total_pages")
        or lab_summary.get("total_pages")
        or 0,
        "files_changed_since_last_run": changed_since_last_run(config, last_indexed_at),
        "last_trigger": last_success.get("trigger_source")
        or status.get("last_trigger_source"),
        "last_event_id": last_success.get("event_id") or status.get("last_event_id"),
        "warnings": [
            event
            for event in ledger.latest_failed_events(limit=5)
            if event.get("status") in {"failed", "poisoned"}
        ],
        "paths": {
            "readings_data": config.relative_to_project(config.readings_data_path),
            "lab_readings": config.relative_to_project(config.lab_readings_path),
        },
        "files": {
            "readings_data": _file_signature(config.readings_data_path),
            "lab_readings": _file_signature(config.lab_readings_path),
        },
    }


def assistant_freshness_payload(
    config: PipelineConfig | None = None,
    *,
    assistant_status: dict[str, Any] | None = None,
) -> dict[str, Any]:
    config = config or PipelineConfig.from_env()
    readings = readings_freshness_payload(config)
    ledger = EventLedger(config)
    status = ledger.read_status()
    return {
        "schema": "assistant_freshness.v1",
        "mode": config.mode_label,
        "generated_at": utc_now(),
        "assistant": assistant_status or {},
        "readings": {
            "last_indexed_at": readings.get("last_indexed_at"),
            "total_indexed": readings.get("total_indexed"),
            "payload_version": readings.get("readings_generated_at"),
            "lab_payload_version": readings.get("lab_readings_generated_at"),
        },
        "pipeline": {
            "state": status.get("state", "idle"),
            "last_event_id": status.get("last_event_id"),
            "last_success": status.get("last_success"),
            "last_failure": status.get("last_failure"),
            "warnings": readings.get("warnings", []),
        },
    }
