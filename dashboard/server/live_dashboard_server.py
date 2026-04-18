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
import subprocess
import sys
import threading
from datetime import datetime
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional


PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.pipelines import build_dashboard_data, build_readings_index
from src.utils.logging_utils import get_pipeline_logger


DATA_DIR = PROJECT_ROOT / "dashboard" / "data"
RUNTIME_STATUS_PATH = DATA_DIR / "runtime_status.json"
WATCHABLE_SUFFIXES = {".csv", ".json", ".parquet", ".pdf", ".py", ".yaml", ".yml"}

logger = get_pipeline_logger(__name__)


def atomic_write_json(output_path: Path, payload: dict[str, Any]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    temp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    temp_path.replace(output_path)


def build_watch_list(readings_dir: Path, config_path: Path) -> list[Path]:
    """Assemble the small set of inputs that should trigger a rebuild."""
    watched = [
        readings_dir,
        config_path,
        PROJECT_ROOT / "config" / "study_parameters.yml",
        PROJECT_ROOT / "data" / "data_dictionary" / "NANO_master_data_dictionary.csv",
        PROJECT_ROOT / "dashboard" / "pipelines" / "build_dashboard_data.py",
        PROJECT_ROOT / "dashboard" / "pipelines" / "generate_synthetic_dashboard_data.py",
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
        watched.extend([
            build_dashboard_data.DEFAULT_REDCAP_PATH,
            build_dashboard_data.DEFAULT_REDCAP_PATH.with_suffix(".csv"),
            build_dashboard_data.DEFAULT_FEATURE_PATH,
            build_dashboard_data.DEFAULT_FEATURE_PATH.with_suffix(".csv"),
            build_dashboard_data.DEFAULT_METRICS_PATH,
            PROJECT_ROOT / "dashboard" / "pipelines" / "bootstrap_dashboard_demo_inputs.py",
        ])
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
        stat = path.stat()
        hasher.update(f"file:{path}:{stat.st_mtime_ns}:{stat.st_size}".encode("utf-8"))
        return hasher.hexdigest()

    for child in sorted(path.rglob("*")):
        if not child.is_file():
            continue
        if child.suffix.lower() not in WATCHABLE_SUFFIXES:
            continue
        stat = child.stat()
        relative = child.relative_to(path)
        hasher.update(f"dir:{relative}:{stat.st_mtime_ns}:{stat.st_size}".encode("utf-8"))
    return hasher.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


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
            "watch_interval_seconds": interval_seconds,
            "fallback_synthetic": fallback_synthetic,
            "dashboard": {},
            "readings": {},
            "watched_inputs": [str(path.relative_to(PROJECT_ROOT)) if path.is_relative_to(PROJECT_ROOT) else str(path) for path in self.watch_list],
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
        dashboard_args = [
            "--config", str(self.config_path),
            "--output", str(DATA_DIR / "dashboard_data.json"),
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
            "--readings-dir", str(self.readings_dir),
            "--output", str(DATA_DIR / "readings_data.json"),
            ],
        )
        if readings_code != 0:
            errors.append(f"readings build exited with code {readings_code}")

        finished_at = datetime.now().isoformat(timespec="seconds")
        with self.state_lock:
            self.state["status"] = "ok" if not errors else "degraded"
            self.state["build_count"] += 1
            self.state["last_build_reason"] = reason
            self.state["last_build_started_at"] = started_at
            self.state["last_build_finished_at"] = finished_at
            self.state["errors"] = errors
        self._refresh_state_from_outputs()

    def start(self) -> None:
        self.rebuild("startup")
        if self.interval_seconds <= 0:
            return

        self.watch_thread = threading.Thread(target=self._watch_loop, name="dashboard-watch", daemon=True)
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
            latest = self._take_snapshot()
            if latest == self.snapshot:
                continue
            self.snapshot = latest
            self.rebuild("source-change")


class RepoRequestHandler(SimpleHTTPRequestHandler):
    """Serve the repository root and expose a tiny health endpoint."""

    def __init__(self, *args: Any, runtime: DashboardRuntime, directory: str, **kwargs: Any) -> None:
        self.runtime = runtime
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self) -> None:
        if self.path in {"/", ""}:
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "/dashboard/")
            self.end_headers()
            return

        if self.path == "/api/healthz":
            payload = self.runtime.read_state()
            status = HTTPStatus.OK if payload.get("dashboard") else HTTPStatus.SERVICE_UNAVAILABLE
            body = json.dumps(payload, indent=2).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return

        super().do_GET()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format: str, *args: Any) -> None:
        logger.info("http | " + format, *args)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Serve the live NANO dashboard with auto-rebuilds.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--interval", type=int, default=20, help="Polling interval in seconds.")
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
    runtime.start()

    handler = partial(
        RepoRequestHandler,
        runtime=runtime,
        directory=str(PROJECT_ROOT),
    )
    httpd = ThreadingHTTPServer((args.host, args.port), handler)
    logger.info("Serving dashboard on http://%s:%s/dashboard/", args.host, args.port)
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