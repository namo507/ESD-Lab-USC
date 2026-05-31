"""Serve the repository dashboard and rebuild its JSON inputs on change.

The server has two responsibilities:

1. Serve the repository root so the dashboard can open linked docs, code, and
   PDFs from the reading library.
2. Monitor the dashboard inputs and rebuild the generated JSON payloads when
   source files change.

The watch loop is polling-based on purpose. It keeps the runtime dependency
surface small so the Docker image can stay lightweight and reproducible.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import posixpath
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse


PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.pipelines import build_dashboard_data, build_readings_index
from dashboard.assistant import AssistantUnavailable, DashboardChatAssistant
from src.utils.logging_utils import get_pipeline_logger


DATA_DIR = PROJECT_ROOT / "dashboard" / "data"
RUNTIME_STATUS_PATH = DATA_DIR / "runtime_status.json"
SPA_BUILD_DIR = PROJECT_ROOT / "web" / "build"
WATCHABLE_SUFFIXES = {".csv", ".json", ".parquet", ".pdf", ".py", ".yaml", ".yml"}
SPA_ROUTE_PREFIXES = (
    "/overview",
    "/participants",
    "/qa",
    "/results",
    "/runs",
    "/redcap",
    "/matlab",
    "/presentation-maker",
)
LEGACY_DASHBOARD_PATHS = {"/dashboard", "/dashboard/", "/dashboard/index.html"}

logger = get_pipeline_logger(__name__)
ASSISTANT_CHAT_LOCK = threading.Semaphore(1)

# ---- Async presentation jobs ----------------------------------------------
# Jobs are persisted in SQLite so polls can hop across workers and in-flight
# jobs can be recovered after a process restart on the same host.
def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


PRESENTATION_JOB_TTL_SECONDS = _env_float(
    "DASHBOARD_PRESENTATION_JOB_TTL_SECONDS",
    900.0,
)  # 15 min before a finished job is reaped
PRESENTATION_JOB_MAX = _env_int("DASHBOARD_PRESENTATION_JOB_MAX", 64)
PRESENTATION_JOB_LOCK_TIMEOUT = _env_float(
    "DASHBOARD_PRESENTATION_JOB_LOCK_TIMEOUT",
    180.0,
)  # max wait for the model lock inside a worker
PRESENTATION_JOB_STALE_SECONDS = _env_float(
    "DASHBOARD_PRESENTATION_JOB_STALE_SECONDS",
    15.0,
)
PRESENTATION_JOB_HEARTBEAT_SECONDS = _env_float(
    "DASHBOARD_PRESENTATION_JOB_HEARTBEAT_SECONDS",
    3.0,
)
PRESENTATION_JOB_POLL_QUEUED_MS = _env_int(
    "DASHBOARD_PRESENTATION_POLL_QUEUED_MS",
    900,
)
PRESENTATION_JOB_POLL_RUNNING_MS = _env_int(
    "DASHBOARD_PRESENTATION_POLL_RUNNING_MS",
    1400,
)
PRESENTATION_JOB_POLL_SLOW_MS = _env_int(
    "DASHBOARD_PRESENTATION_POLL_SLOW_MS",
    2400,
)
PRESENTATION_JOB_POLL_SLOW_AFTER_SECONDS = _env_float(
    "DASHBOARD_PRESENTATION_POLL_SLOW_AFTER_SECONDS",
    18.0,
)
PRESENTATION_JOB_DB_PATH = Path(
    os.getenv(
        "DASHBOARD_PRESENTATION_JOB_DB",
        str(DATA_DIR / "presentation_jobs.sqlite3"),
    )
)
PRESENTATION_TERMINAL_STATES = {"succeeded", "failed", "expired"}


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts).isoformat(timespec="seconds")


def atomic_write_json(output_path: Path, payload: dict[str, Any]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    temp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    temp_path.replace(output_path)


def is_runtime_healthy(state: dict[str, Any]) -> bool:
    """Return whether the runtime is healthy enough for external checks."""
    return (
        state.get("status") == "ok"
        and bool(state.get("dashboard"))
        and bool(state.get("readings"))
        and not state.get("errors")
    )


def build_watch_list(readings_dir: Path, config_path: Path) -> list[Path]:
    """Assemble the small set of inputs that should trigger a rebuild."""
    watched = [
        readings_dir,
        config_path,
        PROJECT_ROOT / "config" / "study_parameters.yml",
        PROJECT_ROOT / "data" / "data_dictionary" / "NANO_master_data_dictionary.csv",
        PROJECT_ROOT / "dashboard" / "pipelines" / "build_dashboard_data.py",
        PROJECT_ROOT / "dashboard" / "pipelines" / "build_org_site_data.py",
        PROJECT_ROOT
        / "dashboard"
        / "pipelines"
        / "generate_synthetic_dashboard_data.py",
        PROJECT_ROOT / "dashboard" / "pipelines" / "build_readings_index.py",
    ]

    try:
        cfg = build_dashboard_data.load_config(config_path)
        resolved = build_dashboard_data._resolve_paths(cfg)
        for key in (
            "processed.redcap_latest",
            "deidentified.redcap_latest",
            "processed.feature_matrix",
            "models.metrics",
            "data_dictionary",
        ):
            path = resolved.get(key)
            if path is not None:
                watched.append(path)
        watched.extend(
            [
                build_dashboard_data.DEFAULT_REDCAP_PATH,
                build_dashboard_data.DEFAULT_REDCAP_PATH.with_suffix(".csv"),
                build_dashboard_data.DEFAULT_FEATURE_PATH,
                build_dashboard_data.DEFAULT_FEATURE_PATH.with_suffix(".csv"),
                build_dashboard_data.DEFAULT_METRICS_PATH,
                PROJECT_ROOT
                / "dashboard"
                / "pipelines"
                / "bootstrap_dashboard_demo_inputs.py",
            ]
        )
    except Exception as exc:  # pragma: no cover - best effort only
        logger.warning("Unable to resolve configured watch paths: %s", exc)

    unique: list[Path] = []
    seen: set[str] = set()
    for path in watched:
        key = str(path)
        if key not in seen:
            unique.append(path)
            seen.add(key)
    return unique


def snapshot_path(path: Path) -> str:
    """Create a stable digest of a file or directory for change detection."""
    hasher = hashlib.sha256()
    if not path.exists():
        hasher.update(f"missing:{path}".encode("utf-8"))
        return hasher.hexdigest()

    if path.is_file():
        try:
            stat = path.stat()
        except FileNotFoundError:
            hasher.update(f"missing:{path}".encode("utf-8"))
            return hasher.hexdigest()
        hasher.update(f"file:{path}:{stat.st_mtime_ns}:{stat.st_size}".encode("utf-8"))
        return hasher.hexdigest()

    for child in sorted(path.rglob("*")):
        if not child.is_file():
            continue
        if child.suffix.lower() not in WATCHABLE_SUFFIXES:
            continue
        try:
            stat = child.stat()
        except FileNotFoundError:
            continue
        relative = child.relative_to(path)
        hasher.update(
            f"dir:{relative}:{stat.st_mtime_ns}:{stat.st_size}".encode("utf-8")
        )
    return hasher.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def ensure_public_spa_build() -> None:
    """Build the React SPA used by the public Pages site for local runtime use."""
    reuse_existing = os.getenv("DASHBOARD_REUSE_EXISTING_SPA_BUILD", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if reuse_existing and (SPA_BUILD_DIR / "index.html").exists():
        logger.info(
            "Reusing existing public SPA shell from %s",
            SPA_BUILD_DIR,
        )
        return

    logger.info("Building public SPA shell for local runtime from web/")
    env = dict(os.environ)
    env.setdefault("VITE_USE_MOCKS", "true")
    env.setdefault("VITE_LIVE_ASSISTANT", "true")
    env.setdefault("VITE_OUT_DIR", "build")

    completed = subprocess.run(
        ["npm", "--prefix", "web", "run", "build"],
        cwd=PROJECT_ROOT,
        env=env,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"web build failed with exit code {completed.returncode}")
    if not (SPA_BUILD_DIR / "index.html").exists():
        raise RuntimeError(f"built SPA missing expected entrypoint: {SPA_BUILD_DIR / 'index.html'}")


def is_spa_route(request_path: str) -> bool:
    if request_path in {"", "/"}:
        return True
    return any(
        request_path == prefix or request_path.startswith(f"{prefix}/")
        for prefix in SPA_ROUTE_PREFIXES
    )


class DashboardRuntime:
    """Own the watch loop and the generated runtime status."""

    def __init__(
        self,
        interval_seconds: int,
        readings_dir: Path,
        config_path: Path,
        fallback_synthetic: bool,
    ) -> None:
        self.interval_seconds = interval_seconds
        self.readings_dir = readings_dir
        self.config_path = config_path
        self.fallback_synthetic = fallback_synthetic
        self.watch_list = build_watch_list(readings_dir, config_path)
        self.state_lock = threading.Lock()
        self.stop_event = threading.Event()
        self.watch_thread: Optional[threading.Thread] = None
        self.snapshot = self._take_snapshot()
        self.state: dict[str, Any] = {
            "generated_at": None,
            "status": "starting",
            "build_count": 0,
            "last_build_reason": "startup",
            "last_build_started_at": None,
            "last_build_finished_at": None,
            "last_successful_build_finished_at": None,
            "watch_interval_seconds": interval_seconds,
            "fallback_synthetic": fallback_synthetic,
            "dashboard": {},
            "readings": {},
            "watched_inputs": [
                (
                    str(path.relative_to(PROJECT_ROOT))
                    if path.is_relative_to(PROJECT_ROOT)
                    else str(path)
                )
                for path in self.watch_list
            ],
            "errors": [],
        }

    def _take_snapshot(self) -> dict[str, str]:
        return {str(path): snapshot_path(path) for path in self.watch_list}

    def _refresh_state_from_outputs(self) -> None:
        dashboard_payload = read_json(DATA_DIR / "dashboard_data.json")
        readings_payload = read_json(DATA_DIR / "readings_data.json")
        with self.state_lock:
            self.state["dashboard"] = dashboard_payload.get("meta", {})
            self.state["readings"] = {
                **readings_payload.get("meta", {}),
                **readings_payload.get("summary", {}),
            }
            self.state["generated_at"] = datetime.now().isoformat(timespec="seconds")
            atomic_write_json(RUNTIME_STATUS_PATH, self.state)

    def _persist_state(self) -> None:
        with self.state_lock:
            self.state["generated_at"] = datetime.now().isoformat(timespec="seconds")
            atomic_write_json(RUNTIME_STATUS_PATH, self.state)

    def _mark_degraded(self, message: str) -> None:
        with self.state_lock:
            existing_errors = [
                error for error in self.state.get("errors", []) if error != message
            ]
            self.state["status"] = "degraded"
            self.state["errors"] = [message, *existing_errors][:5]
        self._persist_state()

    def _run_pipeline_command(self, script_path: Path, args: list[str]) -> int:
        command = [sys.executable, str(script_path), *args]
        logger.info("Running rebuild command: %s", " ".join(command))
        completed = subprocess.run(command, cwd=PROJECT_ROOT, check=False)
        return completed.returncode

    def rebuild(self, reason: str) -> None:
        """Rebuild dashboard and readings JSON payloads and persist runtime status."""
        started_at = datetime.now().isoformat(timespec="seconds")
        errors: list[str] = []

        logger.info("Rebuilding dashboard assets (%s)", reason)
        try:
            dashboard_args = [
                "--config",
                str(self.config_path),
                "--output",
                str(DATA_DIR / "dashboard_data.json"),
                "--bootstrap-demo-inputs",
            ]
            if self.fallback_synthetic:
                dashboard_args.append("--fallback-synthetic")
            dashboard_code = self._run_pipeline_command(
                PROJECT_ROOT / "dashboard" / "pipelines" / "build_dashboard_data.py",
                dashboard_args,
            )
            if dashboard_code != 0:
                errors.append(f"dashboard build exited with code {dashboard_code}")

            readings_code = self._run_pipeline_command(
                PROJECT_ROOT / "dashboard" / "pipelines" / "build_readings_index.py",
                [
                    "--readings-dir",
                    str(self.readings_dir),
                    "--output",
                    str(DATA_DIR / "readings_data.json"),
                ],
            )
            if readings_code != 0:
                errors.append(f"readings build exited with code {readings_code}")
        except Exception as exc:  # pragma: no cover - runtime hardening path
            logger.exception("Unexpected rebuild failure")
            errors.append(f"unexpected rebuild failure: {exc}")

        if not (DATA_DIR / "dashboard_data.json").exists():
            errors.append("dashboard_data.json was not created")
        if not (DATA_DIR / "readings_data.json").exists():
            errors.append("readings_data.json was not created")

        finished_at = datetime.now().isoformat(timespec="seconds")
        with self.state_lock:
            self.state["status"] = "ok" if not errors else "degraded"
            self.state["build_count"] += 1
            self.state["last_build_reason"] = reason
            self.state["last_build_started_at"] = started_at
            self.state["last_build_finished_at"] = finished_at
            self.state["errors"] = errors
            if not errors:
                self.state["last_successful_build_finished_at"] = finished_at
        self._refresh_state_from_outputs()

    def start(self) -> None:
        self.rebuild("startup")
        if self.interval_seconds <= 0:
            return

        self.watch_thread = threading.Thread(
            target=self._watch_loop, name="dashboard-watch", daemon=True
        )
        self.watch_thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        if self.watch_thread is not None:
            self.watch_thread.join(timeout=2)

    def read_state(self) -> dict[str, Any]:
        with self.state_lock:
            return dict(self.state)

    def _watch_loop(self) -> None:
        while not self.stop_event.wait(self.interval_seconds):
            try:
                latest = self._take_snapshot()
                if latest == self.snapshot:
                    continue
                self.snapshot = latest
                self.rebuild("source-change")
            except Exception as exc:  # pragma: no cover - defensive runtime path
                logger.exception("Watch loop iteration failed")
                self._mark_degraded(f"watch loop failure: {exc}")


class PresentationJobStore:
    """SQLite-backed registry of async presentation-plan jobs.

    The store only tracks transport state. Plan quality, grounding, and schema
    normalization remain inside ``DashboardChatAssistant.plan_presentation``.
    """

    def __init__(
        self,
        *,
        db_path: Path = PRESENTATION_JOB_DB_PATH,
        ttl_seconds: float = PRESENTATION_JOB_TTL_SECONDS,
        max_jobs: int = PRESENTATION_JOB_MAX,
        stale_seconds: float = PRESENTATION_JOB_STALE_SECONDS,
        queued_poll_ms: int = PRESENTATION_JOB_POLL_QUEUED_MS,
        running_poll_ms: int = PRESENTATION_JOB_POLL_RUNNING_MS,
        slow_running_poll_ms: int = PRESENTATION_JOB_POLL_SLOW_MS,
        slow_running_after_seconds: float = PRESENTATION_JOB_POLL_SLOW_AFTER_SECONDS,
    ) -> None:
        self._db_path = db_path
        self._ttl = ttl_seconds
        self._max = max_jobs
        self._stale = stale_seconds
        self._queued_poll_ms = max(250, queued_poll_ms)
        self._running_poll_ms = max(250, running_poll_ms)
        self._slow_running_poll_ms = max(self._running_poll_ms, slow_running_poll_ms)
        self._slow_running_after = slow_running_after_seconds
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            self._db_path,
            timeout=30,
            isolation_level=None,
            check_same_thread=False,
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout = 30000")
        return conn

    def _initialize(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS presentation_jobs (
                    job_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    created_ts REAL NOT NULL,
                    updated_ts REAL NOT NULL,
                    expires_at REAL,
                    concept TEXT NOT NULL,
                    options_json TEXT NOT NULL,
                    result_json TEXT,
                    error TEXT,
                    progress_message TEXT,
                    worker_id TEXT,
                    heartbeat_at REAL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_presentation_jobs_status ON presentation_jobs(status)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_presentation_jobs_expires ON presentation_jobs(expires_at)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_presentation_jobs_heartbeat ON presentation_jobs(status, heartbeat_at)"
            )

    @staticmethod
    def _decode_json(payload: str | None) -> Any:
        if not payload:
            return None
        return json.loads(payload)

    @staticmethod
    def _encode_json(payload: Any) -> str:
        return json.dumps(payload, separators=(",", ":"))

    def _fetch_job(
        self,
        conn: sqlite3.Connection,
        job_id: str,
    ) -> dict[str, Any] | None:
        row = conn.execute(
            "SELECT * FROM presentation_jobs WHERE job_id = ?",
            (job_id,),
        ).fetchone()
        return self._row_to_job(row) if row is not None else None

    def _row_to_job(self, row: sqlite3.Row) -> dict[str, Any]:
        created_ts = float(row["created_ts"])
        updated_ts = float(row["updated_ts"])
        return {
            "job_id": row["job_id"],
            "status": row["status"],
            "created_at": _iso(created_ts),
            "updated_at": _iso(updated_ts),
            "concept": row["concept"],
            "options": self._decode_json(row["options_json"]) or {},
            "result": self._decode_json(row["result_json"]),
            "error": row["error"],
            "progress_message": row["progress_message"],
            "worker_id": row["worker_id"],
            "heartbeat_at": row["heartbeat_at"],
            "_created_ts": created_ts,
            "_updated_ts": updated_ts,
            "_expires_at": row["expires_at"],
        }

    def _release_stale_claims(
        self,
        conn: sqlite3.Connection,
        *,
        job_id: str | None = None,
    ) -> None:
        now = time.time()
        params: list[Any] = [
            now,
            "Queued — recovering after restart.",
            now - self._stale,
        ]
        query = (
            "UPDATE presentation_jobs "
            "SET status = 'queued', worker_id = NULL, heartbeat_at = NULL, "
            "updated_ts = ?, progress_message = ? "
            "WHERE status IN ('queued', 'running') "
            "AND worker_id IS NOT NULL "
            "AND heartbeat_at IS NOT NULL "
            "AND heartbeat_at <= ?"
        )
        if job_id is not None:
            query += " AND job_id = ?"
            params.append(job_id)
        conn.execute(query, params)

    def _prune(self, conn: sqlite3.Connection) -> None:
        now = time.time()
        conn.execute(
            "DELETE FROM presentation_jobs WHERE status IN ('succeeded', 'failed', 'expired') "
            "AND expires_at IS NOT NULL AND expires_at <= ?",
            (now,),
        )

        count = int(conn.execute("SELECT COUNT(*) FROM presentation_jobs").fetchone()[0])
        if count <= self._max:
            return

        overflow = count - self._max
        conn.execute(
            "DELETE FROM presentation_jobs WHERE job_id IN ("
            "SELECT job_id FROM presentation_jobs "
            "WHERE status IN ('succeeded', 'failed', 'expired') "
            "ORDER BY created_ts ASC LIMIT ?)",
            (overflow,),
        )

        count = int(conn.execute("SELECT COUNT(*) FROM presentation_jobs").fetchone()[0])
        if count <= self._max:
            return

        overflow = count - self._max
        conn.execute(
            "DELETE FROM presentation_jobs WHERE job_id IN ("
            "SELECT job_id FROM presentation_jobs ORDER BY created_ts ASC LIMIT ?)",
            (overflow,),
        )

    def create(self, concept: str, options: dict[str, Any]) -> dict[str, Any]:
        now = time.time()
        job_id = uuid.uuid4().hex
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO presentation_jobs (
                    job_id, status, created_ts, updated_ts, expires_at,
                    concept, options_json, result_json, error, progress_message,
                    worker_id, heartbeat_at
                ) VALUES (?, 'queued', ?, ?, NULL, ?, ?, NULL, NULL, ?, NULL, NULL)
                """,
                (
                    job_id,
                    now,
                    now,
                    concept,
                    self._encode_json(options),
                    "Queued — waiting for the local model.",
                ),
            )
            self._prune(conn)
            job = self._fetch_job(conn, job_id)
        if job is None:
            raise RuntimeError(f"presentation job {job_id} was pruned unexpectedly")
        return job

    def claim(self, job_id: str, worker_id: str) -> bool:
        now = time.time()
        with self._connect() as conn:
            self._prune(conn)
            self._release_stale_claims(conn, job_id=job_id)
            updated = conn.execute(
                """
                UPDATE presentation_jobs
                SET status = 'queued',
                    worker_id = ?,
                    heartbeat_at = ?,
                    updated_ts = ?,
                    progress_message = 'Queued — waiting for the local model.'
                WHERE job_id = ?
                  AND status IN ('queued', 'running')
                  AND worker_id IS NULL
                """,
                (worker_id, now, now, job_id),
            )
            return updated.rowcount > 0

    def heartbeat(self, job_id: str, worker_id: str) -> bool:
        now = time.time()
        with self._connect() as conn:
            updated = conn.execute(
                """
                UPDATE presentation_jobs
                SET heartbeat_at = ?, updated_ts = ?
                WHERE job_id = ? AND worker_id = ?
                  AND status IN ('queued', 'running')
                """,
                (now, now, job_id, worker_id),
            )
            return updated.rowcount > 0

    def mark_running(self, job_id: str, worker_id: str, progress_message: str) -> None:
        now = time.time()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE presentation_jobs
                SET status = 'running', progress_message = ?,
                    updated_ts = ?, heartbeat_at = ?
                WHERE job_id = ? AND worker_id = ?
                """,
                (progress_message, now, now, job_id, worker_id),
            )

    def complete_success(self, job_id: str, worker_id: str, result: dict[str, Any]) -> None:
        now = time.time()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE presentation_jobs
                SET status = 'succeeded', result_json = ?, error = NULL,
                    progress_message = NULL, worker_id = NULL, heartbeat_at = NULL,
                    updated_ts = ?, expires_at = ?
                WHERE job_id = ? AND worker_id = ?
                """,
                (
                    self._encode_json(result),
                    now,
                    now + self._ttl,
                    job_id,
                    worker_id,
                ),
            )

    def complete_failure(self, job_id: str, worker_id: str, error: str) -> None:
        now = time.time()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE presentation_jobs
                SET status = 'failed', result_json = NULL, error = ?,
                    progress_message = NULL, worker_id = NULL, heartbeat_at = NULL,
                    updated_ts = ?, expires_at = ?
                WHERE job_id = ? AND worker_id = ?
                """,
                (error, now, now + self._ttl, job_id, worker_id),
            )

    def release_stale_claims(self, *, job_id: str | None = None) -> None:
        with self._connect() as conn:
            self._prune(conn)
            self._release_stale_claims(conn, job_id=job_id)

    def _get(self, job_id: str, *, release_stale: bool = False) -> dict[str, Any] | None:
        with self._connect() as conn:
            self._prune(conn)
            if release_stale:
                self._release_stale_claims(conn, job_id=job_id)
            return self._fetch_job(conn, job_id)

    def get(self, job_id: str) -> dict[str, Any] | None:
        return self._get(job_id)

    def recoverable_job_ids(self) -> list[str]:
        with self._connect() as conn:
            self._prune(conn)
            self._release_stale_claims(conn)
            rows = conn.execute(
                """
                SELECT job_id FROM presentation_jobs
                WHERE status IN ('queued', 'running')
                  AND worker_id IS NULL
                ORDER BY created_ts ASC
                """
            ).fetchall()
        return [str(row["job_id"]) for row in rows]

    def should_recover(self, job: dict[str, Any]) -> bool:
        return job["status"] in {"queued", "running"} and not job.get("worker_id")

    def count(self) -> int:
        with self._connect() as conn:
            return int(conn.execute("SELECT COUNT(*) FROM presentation_jobs").fetchone()[0])

    def _poll_after_ms(self, job: dict[str, Any]) -> int | None:
        if job["status"] in PRESENTATION_TERMINAL_STATES:
            return None
        age = max(0.0, time.time() - float(job.get("_created_ts") or time.time()))
        if job["status"] == "queued":
            return self._queued_poll_ms
        if age >= self._slow_running_after:
            return self._slow_running_poll_ms
        return self._running_poll_ms

    def public_view(self, job: dict[str, Any]) -> dict[str, Any]:
        """User-safe projection — no worker ids, no raw model text."""
        view: dict[str, Any] = {
            "job_id": job["job_id"],
            "status": job["status"],
            "created_at": job["created_at"],
            "updated_at": job["updated_at"],
            "progress_message": job.get("progress_message"),
        }
        poll_after_ms = self._poll_after_ms(job)
        if poll_after_ms is not None:
            view["poll_after_ms"] = poll_after_ms
        if job["status"] == "succeeded" and job.get("result") is not None:
            view["result"] = job["result"]
        if job["status"] in {"failed", "expired"} and job.get("error"):
            view["error"] = job["error"]
        return view


def _job_heartbeat_loop(
    store: PresentationJobStore,
    job_id: str,
    worker_id: str,
    stop_event: threading.Event,
) -> None:
    while not stop_event.wait(PRESENTATION_JOB_HEARTBEAT_SECONDS):
        if not store.heartbeat(job_id, worker_id):
            return


def _start_presentation_job_worker(
    store: PresentationJobStore,
    assistant: DashboardChatAssistant,
    lock: threading.Semaphore,
    job_id: str,
) -> bool:
    worker_id = uuid.uuid4().hex
    if not store.claim(job_id, worker_id):
        return False
    worker = threading.Thread(
        target=_run_presentation_job,
        args=(store, assistant, lock, job_id, worker_id),
        name=f"presentation-job-{job_id[:8]}",
        daemon=True,
    )
    worker.start()
    return True


def _run_presentation_job(
    store: PresentationJobStore,
    assistant: DashboardChatAssistant,
    lock: threading.Semaphore,
    job_id: str,
    worker_id: str,
) -> None:
    """Background worker: wait for the model lock, then generate the deck plan."""
    job = store._get(job_id, release_stale=False)
    if job is None:
        return

    heartbeat_stop = threading.Event()
    heartbeat = threading.Thread(
        target=_job_heartbeat_loop,
        args=(store, job_id, worker_id, heartbeat_stop),
        name=f"presentation-heartbeat-{job_id[:8]}",
        daemon=True,
    )
    heartbeat.start()

    acquired = False
    try:
        acquired = lock.acquire(timeout=PRESENTATION_JOB_LOCK_TIMEOUT)
        if not acquired:
            store.complete_failure(
                job_id,
                worker_id,
                "The local assistant stayed busy too long. Please try again in a moment.",
            )
            return

        store.mark_running(job_id, worker_id, progress_message="Composing your deck…")
        job = store._get(job_id, release_stale=False)
        if job is None:
            return
        result = assistant.plan_presentation(job["concept"], options=job["options"])
        store.complete_success(job_id, worker_id, result)
    except AssistantUnavailable as exc:
        store.complete_failure(job_id, worker_id, str(exc))
    except Exception:  # pragma: no cover - defensive worker path
        logger.exception("Presentation job %s failed", job_id)
        store.complete_failure(
            job_id,
            worker_id,
            "Generation failed unexpectedly. Please try again.",
        )
    finally:
        heartbeat_stop.set()
        heartbeat.join(timeout=1)
        if acquired:
            lock.release()


class RepoRequestHandler(SimpleHTTPRequestHandler):
    """Serve the repository root and expose a tiny health endpoint."""

    def __init__(
        self,
        *args: Any,
        runtime: DashboardRuntime,
        assistant: DashboardChatAssistant,
        jobs: PresentationJobStore,
        directory: str,
        **kwargs: Any,
    ) -> None:
        self.runtime = runtime
        self.assistant = assistant
        self.jobs = jobs
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self) -> None:
        request_path = urlparse(self.path).path

        if self._redirect_legacy_dashboard(request_path):
            return

        if request_path == "/api/healthz":
            payload = self.runtime.read_state()
            status = (
                HTTPStatus.OK
                if is_runtime_healthy(payload)
                else HTTPStatus.SERVICE_UNAVAILABLE
            )
            body = json.dumps(payload, indent=2).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return

        if request_path == "/api/chat/status":
            self._send_json(self.assistant.get_status())
            return

        if request_path == "/api/assistant/status":
            self._send_json(self._assistant_status_payload())
            return

        if request_path.startswith("/api/presentation/jobs/"):
            job_id = request_path[len("/api/presentation/jobs/"):].strip("/")
            if job_id:
                self._handle_get_presentation_job(job_id)
                return

        super().do_GET()

    def do_HEAD(self) -> None:
        request_path = urlparse(self.path).path
        if self._redirect_legacy_dashboard(request_path):
            return
        super().do_HEAD()

    def do_POST(self) -> None:
        request_path = urlparse(self.path).path
        if request_path == "/api/assistant/chat":
            self._handle_stream_chat()
            return

        if request_path == "/api/presentation/jobs":
            self._handle_create_presentation_job()
            return

        if request_path == "/api/presentation/plan":
            self._handle_presentation_plan()
            return

        if request_path != "/api/chat":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API endpoint")
            return

        try:
            payload = self._read_json_body()
            message = (payload.get("message") or "").strip()
            history = payload.get("history") or []
            result = self.assistant.answer(message, history=history)
            self._send_json(result)
        except AssistantUnavailable as exc:
            self._send_json(
                {
                    "error": str(exc),
                    "status": exc.status,
                },
                status=exc.http_status,
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - defensive API path
            logger.exception("Chat request failed")
            self._send_json(
                {"error": f"Unexpected chat failure: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def translate_path(self, path: str) -> str:
        parsed_path = urlparse(path).path
        if is_spa_route(parsed_path):
            return str(SPA_BUILD_DIR / "index.html")

        spa_candidate = (SPA_BUILD_DIR / parsed_path.lstrip("/")).resolve()
        if spa_candidate.exists() and spa_candidate.is_relative_to(SPA_BUILD_DIR.resolve()):
            return str(spa_candidate)

        repo_candidate = (PROJECT_ROOT / parsed_path.lstrip("/")).resolve()
        if repo_candidate.exists() and repo_candidate.is_relative_to(PROJECT_ROOT.resolve()):
            return str(repo_candidate)

        return str(repo_candidate)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        logger.info("http | " + format, *args)

    def _read_json_body(self) -> dict[str, Any]:
        content_length = self.headers.get("Content-Length")
        if not content_length:
            raise ValueError("Missing request body.")
        try:
            length = int(content_length)
        except ValueError as exc:
            raise ValueError("Invalid Content-Length header.") from exc
        raw_body = self.rfile.read(length)
        try:
            return json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("Request body must be valid JSON.") from exc

    def _send_json(
        self,
        payload: dict[str, Any],
        *,
        status: int | HTTPStatus = HTTPStatus.OK,
    ) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _assistant_status_payload(self) -> dict[str, Any]:
        payload = self.assistant.get_status()
        if payload.get("ready"):
            status = "ready"
            error = None
        elif payload.get("state") in {"disabled", "model-missing", "unloaded"}:
            status = "unloaded"
            error = payload.get("message")
        else:
            status = "error"
            error = payload.get("last_error") or payload.get("message")

        return {
            "status": status,
            "error": error,
            "model": payload.get("model_id"),
        }

    def _redirect_legacy_dashboard(self, request_path: str) -> bool:
        if request_path not in LEGACY_DASHBOARD_PATHS:
            return False
        self.send_response(HTTPStatus.MOVED_PERMANENTLY)
        self.send_header("Location", "/overview")
        self.end_headers()
        return True

    def _send_ndjson(
        self,
        chunks: list[dict[str, Any]],
        *,
        status: int | HTTPStatus = HTTPStatus.OK,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        for chunk in chunks:
            self.wfile.write(json.dumps(chunk).encode("utf-8") + b"\n")
            self.wfile.flush()

    def _handle_stream_chat(self) -> None:
        try:
            payload = self._read_json_body()
            message = (payload.get("message") or "").strip()
            history = payload.get("history") or []
            if not message:
                self._send_json({"error": "Please ask a question before submitting."}, status=HTTPStatus.BAD_REQUEST)
                return
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        if not ASSISTANT_CHAT_LOCK.acquire(blocking=False):
            self._send_ndjson([
                {"error": "model busy — another request in flight"},
            ])
            return

        try:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

            for delta in self.assistant.stream(message, history=history):
                self.wfile.write(json.dumps({"delta": delta}).encode("utf-8") + b"\n")
                self.wfile.flush()
            self.wfile.write(json.dumps({"done": True}).encode("utf-8") + b"\n")
            self.wfile.flush()
        except AssistantUnavailable as exc:
            self.wfile.write(json.dumps({"error": str(exc)}).encode("utf-8") + b"\n")
            self.wfile.flush()
        except Exception as exc:  # pragma: no cover - defensive API path
            logger.exception("Streaming chat request failed")
            self.wfile.write(json.dumps({"error": f"Unexpected chat failure: {exc}"}).encode("utf-8") + b"\n")
            self.wfile.flush()
        finally:
            ASSISTANT_CHAT_LOCK.release()

    def _handle_presentation_plan(self) -> None:
        """Generate a structured slide-deck plan via the local assistant.

        Reuses the same generator and the shared model lock as the chat
        endpoint, but returns a single structured JSON deck plan rather than a
        free-form streamed reply. Errors mirror the operational style of the
        existing assistant endpoints and never leak raw model text.
        """
        try:
            payload = self._read_json_body()
            concept = (payload.get("concept") or "").strip()
            options = payload.get("options") or {}
            if not isinstance(options, dict):
                options = {}
            if not concept:
                self._send_json(
                    {"error": "Please enter a concept you want explained."},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        if not ASSISTANT_CHAT_LOCK.acquire(blocking=False):
            self._send_json(
                {"error": "model busy — another request in flight"},
                status=HTTPStatus.SERVICE_UNAVAILABLE,
            )
            return

        try:
            result = self.assistant.plan_presentation(concept, options=options)
            self._send_json(result)
        except AssistantUnavailable as exc:
            self._send_json(
                {"error": str(exc), "status": exc.status},
                status=exc.http_status,
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - defensive API path
            logger.exception("Presentation plan request failed")
            self._send_json(
                {"error": f"Unexpected presentation failure: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )
        finally:
            ASSISTANT_CHAT_LOCK.release()

    def _handle_create_presentation_job(self) -> None:
        """Create an async deck-plan job and return immediately (202).

        Returns fast without touching the model. The model lock is acquired by
        the background worker, so creation never blocks on another generation.
        """
        try:
            payload = self._read_json_body()
            concept = (payload.get("concept") or "").strip()
            options = payload.get("options") or {}
            if not isinstance(options, dict):
                options = {}
            if not concept:
                self._send_json(
                    {"error": "Please enter a concept you want explained."},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        job = self.jobs.create(concept, options)
        _start_presentation_job_worker(
            self.jobs,
            self.assistant,
            ASSISTANT_CHAT_LOCK,
            job["job_id"],
        )
        created = self.jobs.get(job["job_id"]) or job
        self._send_json(
            self.jobs.public_view(created),
            status=HTTPStatus.ACCEPTED,
        )

    def _handle_get_presentation_job(self, job_id: str) -> None:
        self.jobs.release_stale_claims(job_id=job_id)
        job = self.jobs.get(job_id)
        if job is None:
            self._send_json(
                {
                    "error": "This presentation job was not found or has expired.",
                    "status": "expired",
                },
                status=HTTPStatus.NOT_FOUND,
            )
            return
        if self.jobs.should_recover(job):
            _start_presentation_job_worker(
                self.jobs,
                self.assistant,
                ASSISTANT_CHAT_LOCK,
                job_id,
            )
            job = self.jobs.get(job_id) or job
        self._send_json(self.jobs.public_view(job))


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Serve the live NANO dashboard with auto-rebuilds."
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument(
        "--interval", type=int, default=20, help="Polling interval in seconds."
    )
    parser.add_argument(
        "--readings-dir",
        type=Path,
        default=PROJECT_ROOT / "ESD Lab readings",
        help="Directory containing PDFs and supporting reading materials.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=PROJECT_ROOT / "config" / "paths.yml",
        help="Path to config/paths.yml.",
    )
    parser.add_argument(
        "--fallback-synthetic",
        action="store_true",
        help="Fallback to synthetic dashboard data when live inputs are unavailable.",
    )
    args = parser.parse_args(argv)

    runtime = DashboardRuntime(
        interval_seconds=args.interval,
        readings_dir=args.readings_dir,
        config_path=args.config,
        fallback_synthetic=args.fallback_synthetic,
    )
    ensure_public_spa_build()
    runtime.start()
    assistant = DashboardChatAssistant()
    presentation_jobs = PresentationJobStore()
    for job_id in presentation_jobs.recoverable_job_ids():
        _start_presentation_job_worker(
            presentation_jobs,
            assistant,
            ASSISTANT_CHAT_LOCK,
            job_id,
        )

    handler = partial(
        RepoRequestHandler,
        runtime=runtime,
        assistant=assistant,
        jobs=presentation_jobs,
        directory=str(PROJECT_ROOT),
    )
    httpd = ThreadingHTTPServer((args.host, args.port), handler)
    logger.info(
        "Serving public website shell on http://%s:%s/ (overview at /overview)",
        args.host,
        args.port,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:  # pragma: no cover - manual shutdown path
        logger.info("Stopping dashboard server")
    finally:
        runtime.stop()
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
