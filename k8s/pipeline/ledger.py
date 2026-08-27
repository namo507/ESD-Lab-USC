"""Small JSON/JSONL ledger used by the readings pipeline.

The ledger is intentionally file-backed so it works in local mode and on a
shared Kubernetes volume. Records are lightweight and PHI-safe: they never store
absolute paths and event streams carry only readings-relative file names.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import PipelineConfig

SCHEMA_VERSION = "readings_pipeline.v1"
PHIISH_TOKEN_RE = re.compile(
    r"\b(?:MRN|DOB|SSN|NANO-\d{3,}|[0-9]{2}[-_/][0-9]{2}[-_/][0-9]{2,4})\b",
    re.IGNORECASE,
)


def utc_now() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace(
            "+00:00",
            "Z",
        )
    )


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    temp_path.replace(path)


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def sanitize_relative_path(path: Path | str, base: Path | None = None) -> str:
    candidate = Path(path)
    if base is not None:
        try:
            candidate = candidate.resolve().relative_to(base.resolve())
        except Exception:
            candidate = Path(candidate.name)
    value = str(candidate).replace("\\", "/")
    value = value.lstrip("/")
    value = PHIISH_TOKEN_RE.sub("{{REDACTED}}", value)
    return value or "unknown"


def event_signature(paths: list[str], *, trigger_source: str) -> str:
    hasher = hashlib.sha256()
    hasher.update(trigger_source.encode("utf-8"))
    for path in sorted(paths):
        hasher.update(b"\0")
        hasher.update(path.encode("utf-8"))
    return hasher.hexdigest()[:24]


@dataclass(frozen=True)
class EventBatch:
    event_id: str
    trigger_source: str
    paths: list[str]
    signature: str
    created_at: str

    @classmethod
    def create(cls, *, trigger_source: str, paths: list[str]) -> "EventBatch":
        clean_paths = sorted({path for path in paths if path})
        signature = event_signature(clean_paths, trigger_source=trigger_source)
        return cls(
            event_id=f"readings-{int(time.time())}-{signature[:8]}",
            trigger_source=trigger_source,
            paths=clean_paths,
            signature=signature,
            created_at=utc_now(),
        )


class EventDeduper:
    """Collapse duplicate event batches within a short debounce window."""

    def __init__(self, state_path: Path, debounce_seconds: float) -> None:
        self.state_path = state_path
        self.debounce_seconds = max(0.0, debounce_seconds)

    def _state(self) -> dict[str, Any]:
        return read_json(self.state_path)

    def should_accept(self, signature: str, *, now: float | None = None) -> bool:
        now = time.time() if now is None else now
        state = self._state()
        if signature in set(state.get("poisoned_signatures") or []):
            return False
        last_signature = state.get("last_signature")
        last_seen = float(state.get("last_seen_ts") or 0.0)
        if (
            signature == last_signature
            and self.debounce_seconds > 0
            and now - last_seen < self.debounce_seconds
        ):
            return False
        return True

    def mark_seen(self, signature: str, *, now: float | None = None) -> None:
        now = time.time() if now is None else now
        state = self._state()
        state["last_signature"] = signature
        state["last_seen_ts"] = now
        atomic_write_json(self.state_path, state)

    def mark_poisoned(self, signature: str) -> None:
        state = self._state()
        poisoned = list(
            dict.fromkeys([*(state.get("poisoned_signatures") or []), signature])
        )
        state["poisoned_signatures"] = poisoned[-100:]
        atomic_write_json(self.state_path, state)


class EventLedger:
    def __init__(self, config: PipelineConfig) -> None:
        self.config = config

    def append(self, event: dict[str, Any]) -> dict[str, Any]:
        record = {
            "schema": SCHEMA_VERSION,
            "recorded_at": utc_now(),
            **event,
        }
        self.config.ledger_path.parent.mkdir(parents=True, exist_ok=True)
        with self.config.ledger_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, sort_keys=True) + "\n")
        return record

    def read_events(self, limit: int = 25) -> list[dict[str, Any]]:
        if not self.config.ledger_path.exists():
            return []
        lines = self.config.ledger_path.read_text(encoding="utf-8").splitlines()
        events: list[dict[str, Any]] = []
        for line in lines[-max(1, limit) :]:
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                events.append(payload)
        return events

    def read_status(self) -> dict[str, Any]:
        return read_json(self.config.status_path)

    def write_status(self, **updates: Any) -> dict[str, Any]:
        previous = self.read_status()
        payload = {
            "schema": SCHEMA_VERSION,
            "mode": self.config.mode_label,
            "environment": self.config.environment,
            "updated_at": utc_now(),
            **previous,
            **updates,
        }
        payload["updated_at"] = utc_now()
        atomic_write_json(self.config.status_path, payload)
        return payload

    def latest_failed_events(self, limit: int = 5) -> list[dict[str, Any]]:
        return [
            event
            for event in reversed(self.read_events(limit=100))
            if event.get("status") in {"failed", "poisoned"}
        ][:limit]


def summarize_readings_payload(path: Path) -> dict[str, Any]:
    payload = read_json(path)
    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
    return {
        "generated_at": meta.get("generated_at") or payload.get("generated_at"),
        "latest_modified_at": summary.get("latest_modified_at")
        or meta.get("latest_modified_at"),
        "total_readings": summary.get("total_readings")
        or meta.get("total_readings")
        or summary.get("count"),
        "total_pages": summary.get("total_pages"),
    }
