"""Lease helpers for single-run pipeline execution."""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .ledger import atomic_write_json
from .ledger import read_json
from .ledger import utc_now


@dataclass(frozen=True)
class Lease:
    owner: str
    acquired_at: str
    expires_at_ts: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "owner": self.owner,
            "acquired_at": self.acquired_at,
            "expires_at_ts": self.expires_at_ts,
        }


class FileLease:
    """Atomic local/shared-volume lease.

    It is deliberately conservative: stale leases are removed only after the TTL
    has elapsed, and release is owner-checked.
    """

    def __init__(self, path: Path, ttl_seconds: float) -> None:
        self.path = path
        self.ttl_seconds = max(0.1, ttl_seconds)

    def read(self) -> dict[str, Any]:
        return read_json(self.path)

    def acquire(self, owner: str) -> bool:
        now = time.time()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = Lease(
            owner=owner,
            acquired_at=utc_now(),
            expires_at_ts=now + self.ttl_seconds,
        ).as_dict()

        while True:
            try:
                fd = os.open(str(self.path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            except FileExistsError:
                current = self.read()
                expires_at = float(current.get("expires_at_ts") or 0.0)
                if expires_at > now:
                    return False
                try:
                    self.path.unlink()
                except FileNotFoundError:
                    continue
                except OSError:
                    return False
                continue
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(json.dumps(payload, indent=2))
            return True

    def refresh(self, owner: str) -> bool:
        current = self.read()
        if current.get("owner") != owner:
            return False
        current["expires_at_ts"] = time.time() + self.ttl_seconds
        current["refreshed_at"] = utc_now()
        atomic_write_json(self.path, current)
        return True

    def release(self, owner: str) -> bool:
        current = self.read()
        if current.get("owner") != owner:
            return False
        try:
            self.path.unlink()
        except FileNotFoundError:
            pass
        return True


class LeaseManager:
    """Lease facade with room for Kubernetes Lease integration.

    Kubernetes mode still uses the shared file lease as the authoritative v1
    lock because the worker and local tests both have the mounted data volume.
    The watcher can additionally create Kubernetes Jobs with `parallelism: 1`.
    """

    def __init__(self, path: Path, ttl_seconds: float) -> None:
        self.file_lease = FileLease(path, ttl_seconds)

    def acquire(self, owner: str) -> bool:
        return self.file_lease.acquire(owner)

    def release(self, owner: str) -> bool:
        return self.file_lease.release(owner)

    def read(self) -> dict[str, Any]:
        return self.file_lease.read()
