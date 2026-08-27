"""Serve the repository dashboard and rebuild its JSON inputs on change.

The server has two responsibilities:

1. Serve the public SPA, current aggregate runtime JSON, and explicitly public
   PDFs from the reading library.
2. Monitor the dashboard inputs and rebuild the generated JSON payloads when
   source files change.

The watch loop is polling-based on purpose. It keeps the runtime dependency
surface small so the Docker image can stay lightweight and reproducible.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import ipaddress
import json
import math
import os
import posixpath
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
from collections import deque
from datetime import datetime
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qs, unquote, urlparse

import requests

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from dashboard.assistant import (
    AssistantUnavailable,
    BuddyRequestError,
    DashboardChatAssistant,
    NanoBuddyAssistant,
)
from dashboard.pipelines import build_dashboard_data, build_readings_index
from dashboard.pipelines.participant_operations import (
    build_participant_operations,
    operation_lookup,
)
from dashboard.server import data_features
from k8s.pipeline import (
    PipelineConfig,
    assistant_freshness_payload,
    cluster_topology_payload,
    pipeline_status_payload,
    readings_freshness_payload,
)
from k8s.pipeline.ledger import read_json as read_optional_json
from src.utils.logging_utils import get_pipeline_logger


def _configured_runtime_path(name: str, default: Path) -> Path:
    configured = Path(os.getenv(name, str(default))).expanduser()
    return configured if configured.is_absolute() else PROJECT_ROOT / configured


DATA_DIR = _configured_runtime_path(
    "DASHBOARD_DATA_DIR",
    PROJECT_ROOT / "dashboard" / "data",
)
RUNTIME_STATUS_PATH = DATA_DIR / "runtime_status.json"
AUDIT_LOG_PATH = DATA_DIR / "hipaa_access.log"
LAB_READINGS_OUTPUT_PATH = _configured_runtime_path(
    "LAB_READINGS_OUTPUT",
    PROJECT_ROOT / "web" / "lab-readings.json",
)
CONTROLS_PATH = Path(
    os.getenv(
        "DASHBOARD_CONTROLS_PATH",
        str(build_dashboard_data.DASHBOARD_CONTROLS_PATH),
    )
)
SPA_BUILD_DIR = PROJECT_ROOT / "web" / "build"
WATCHABLE_SUFFIXES = {".csv", ".json", ".parquet", ".pdf", ".py", ".yaml", ".yml"}
SPA_ROUTE_PREFIXES = (
    "/discovery",
    "/nano",
    "/nico",
    "/overview",
    "/docs",
    "/how-to",
    "/participants",
    "/qa",
    "/results",
    "/runs",
    "/redcap",
    "/matlab",
    "/presentation-maker",
    "/hda-player",
    "/thermal-heatmap",
    "/swimmer-plot",
    "/attrition",
    "/sdoh-map",
    "/shap-explorer",
    "/cluster-viewer",
    "/model-leaderboard",
    "/cascade-dag",
    "/ecg-quality",
    "/spatial-assessments",
    "/attachment-heatmap",
    "/dyad-coregulation",
    "/multimodal",
    "/phase-portrait",
    "/cva-theater",
    "/hr-deceleration",
    "/stillface",
    "/hda-bypass",
    "/passport",
    "/archetypes",
    "/cascade-sim",
    "/eco-validity",
    "/stream-coverage",
    "/cga-river",
    "/county-comparator",
    "/participant-timeline",
    "/model-terrain",
    "/attrition-funnel",
    "/guided-explorer",
    "/public-insights",
    "/executive",
    "/pipeline-health",
    "/data-explorer",
    "/publications",
    "/changelog",
)
LEGACY_DASHBOARD_PATHS = {"/dashboard", "/dashboard/", "/dashboard/index.html"}
PUBLIC_RUNTIME_DATA_ROUTES = {
    f"/dashboard/data/{name}": DATA_DIR / name
    for name in (
        "dashboard_data.json",
        "nano_dashboard_data.json",
        "readings_data.json",
        "runtime_status.json",
    )
}
PUBLIC_READING_SUFFIXES = {".pdf"}

logger = get_pipeline_logger(__name__)
ASSISTANT_CHAT_LOCK = threading.Semaphore(1)


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


ASSISTANT_REQUEST_QUEUE_TIMEOUT_SECONDS = max(
    0.0,
    _float_env("DASHBOARD_ASSISTANT_QUEUE_TIMEOUT_SECONDS", 90.0),
)
ASSISTANT_QUEUE_TIMEOUT_MESSAGE = (
    "The assistant is still finishing another response. "
    "Please try again in a few seconds."
)

REDCAP_CONTRACT = build_dashboard_data.load_redcap_contract()
REDCAP_EVENTS = {
    "SIX_MONTH": "6_months_arm_1",
    "NINE_MONTH": "9_months_arm_1",
    "TWELVE_MONTH": "12_months_arm_1",
    "TWENTY_FOUR_MONTH": "24_months_arm_1",
}
REDCAP_CSBS_INSTRUMENT = REDCAP_CONTRACT["instruments"]["carry_forward"]["instrument"]
REDCAP_VISIT_DATE_FIELD = REDCAP_CONTRACT["instruments"]["visit_date_field"]
COMPLETE_STATUS_MAP = {
    "0": "incomplete",
    "1": "unverified",
    "2": "complete",
    "": "not_started",
    "SKIP": "skipped",
}
REDCAP_VISIT_KEYS = (
    ("sixMonth", "SIX_MONTH", "6m"),
    ("nineMonth", "NINE_MONTH", "9m"),
    ("twelveMonth", "TWELVE_MONTH", "12m"),
    ("twentyFourMonth", "TWENTY_FOUR_MONTH", "24m"),
)

LEGACY_STUDY_TARGETS = {"VPT": 130, "ASIB": 65, "TD": 65}
LEGACY_STAGE_CATALOG = {
    "ingest": {
        "short": "Actiheart-5 + REDCap",
        "description": "Pull raw ECG captures and matched visit metadata into the de-identified dashboard pipeline.",
    },
    "preprocess": {
        "short": "filter · detect R-peaks",
        "description": "Bandpass filtering, R-peak detection, and inter-beat interval extraction ahead of QA.",
    },
    "qa": {
        "short": "epoch-level review",
        "description": "Surface 5-second windows for automated and operator QA review before downstream features.",
    },
    "hrv": {
        "short": "time- & freq-domain",
        "description": "Compute RMSSD, SDNN, and frequency-domain HRV features for the visible cohort slice.",
    },
    "hda": {
        "short": "phase classification",
        "description": "Assign heart-defined attention phase labels and confidence for accepted windows.",
    },
    "merge": {
        "short": "long-form parquet",
        "description": "Join REDCap, HRV, HDA, and de-identified cohort metadata into dashboard-ready payloads.",
    },
}
LEGACY_VISIT_LOG = [
    {
        "ts": "2026-04-25 09:18",
        "actor": "system",
        "event": "merge.parquet written",
        "kind": "ok",
        "detail": "dashboard payload refreshed from the de-identified cohort export.",
    },
    {
        "ts": "2026-04-25 09:14",
        "actor": "system",
        "event": "HDA labels emitted",
        "kind": "ok",
        "detail": "Heart-defined attention phases written for accepted epochs.",
    },
    {
        "ts": "2026-04-25 09:11",
        "actor": "system",
        "event": "HRV features computed",
        "kind": "ok",
        "detail": "RMSSD, SDNN, and related autonomic features available for the visit.",
    },
    {
        "ts": "2026-04-25 09:07",
        "actor": "operator",
        "event": "QA accepted",
        "kind": "ok",
        "detail": "Signal-quality review completed with only minor ectopic flags.",
    },
    {
        "ts": "2026-04-25 08:58",
        "actor": "system",
        "event": "ingest complete",
        "kind": "info",
        "detail": "Actiheart-5 source capture ingested and matched to visit metadata.",
    },
]
LEGACY_EPOCH_STORE: dict[str, list[dict[str, Any]]] = {}


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

MAX_REQUEST_BODY_BYTES = max(
    1024,
    _env_int("DASHBOARD_MAX_REQUEST_BODY_BYTES", 1024 * 1024),
)
BUDDY_MAX_REQUEST_BODY_BYTES = max(
    1024,
    min(
        MAX_REQUEST_BODY_BYTES,
        _env_int("DASHBOARD_BUDDY_MAX_REQUEST_BODY_BYTES", 32 * 1024),
    ),
)
PRESENTATION_MAX_CONCEPT_CHARS = max(
    1,
    _env_int("DASHBOARD_PRESENTATION_MAX_CONCEPT_CHARS", 6000),
)
ASSISTANT_RATE_LIMIT_REQUESTS = max(
    0,
    _env_int("DASHBOARD_ASSISTANT_RATE_LIMIT_REQUESTS", 12),
)
ASSISTANT_RATE_LIMIT_WINDOW_SECONDS = max(
    1.0,
    _env_float("DASHBOARD_ASSISTANT_RATE_LIMIT_WINDOW_SECONDS", 60.0),
)
ASSISTANT_RATE_LIMIT_PATHS = frozenset(
    {
        "/api/chat",
        "/api/buddy",
        "/api/assistant/chat",
        "/api/presentation/jobs",
        "/api/presentation/plan",
    }
)
AUDIT_RATE_LIMIT_REQUESTS = max(
    0,
    _env_int("DASHBOARD_AUDIT_RATE_LIMIT_REQUESTS", 120),
)
AUDIT_RATE_LIMIT_WINDOW_SECONDS = max(
    1.0,
    _env_float("DASHBOARD_AUDIT_RATE_LIMIT_WINDOW_SECONDS", 60.0),
)
AUDIT_ACTION_MAX_CHARS = 80
AUDIT_SCOPE_MAX_CHARS = 256
AUDIT_TIMESTAMP_MAX_CHARS = 64
AUDIT_DETAIL_MAX_ITEMS = 32
AUDIT_DETAIL_KEY_MAX_CHARS = 64
AUDIT_DETAIL_VALUE_MAX_CHARS = 512
AUDIT_DETAIL_MAX_BYTES = 4096
CLOUDFLARE_WORKER_EGRESS_IP = ipaddress.ip_address("2a06:98c0:3600::103")
ORIGINAL_CLIENT_IP_HEADER = "X-ESD-Original-Client-IP"
CLOUDFLARE_WORKER_ZONE_HEADER = "CF-Worker"
TRUSTED_CLOUDFLARE_WORKER_ZONE = (
    os.getenv("DASHBOARD_TRUSTED_CLOUDFLARE_WORKER_ZONE", "")
    .strip()
    .lower()
    .rstrip(".")
)
AUDIT_ALLOWED_ACTIONS = frozenset(
    {
        "auth.login",
        "auth.timeout",
        "epoch.decision",
        "export.bibtex",
        "export.csv",
        "export.pdf",
        "export.pptx",
        "presentation.generate",
        "publication.tags.update",
        "publications.sync.trigger",
        "route.navigate",
        "run.stop",
        "run.trigger",
        "snapshot.create",
    }
)
PROTECTED_POST_PATHS = frozenset(
    {
        "/api/controls",
        "/api/publications/sync/trigger",
        "/api/redcap/writeback",
        "/api/snapshots",
        "/api/v2/redcap-visit-entry",
    }
)


class SlidingWindowRateLimiter:
    """Small in-process limiter for paid assistant generation endpoints."""

    def __init__(
        self, limit: int, window_seconds: float, *, max_tracked_keys: int = 4096
    ) -> None:
        self.limit = max(0, int(limit))
        self.window_seconds = max(1.0, float(window_seconds))
        self.max_tracked_keys = max(1, int(max_tracked_keys))
        self._requests: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, *, now: float | None = None) -> tuple[bool, int]:
        if self.limit == 0:
            return True, 0
        timestamp = time.monotonic() if now is None else now
        cutoff = timestamp - self.window_seconds
        with self._lock:
            if (
                key not in self._requests
                and len(self._requests) >= self.max_tracked_keys
            ):
                for tracked_key, tracked_requests in list(self._requests.items()):
                    while tracked_requests and tracked_requests[0] <= cutoff:
                        tracked_requests.popleft()
                    if not tracked_requests:
                        self._requests.pop(tracked_key, None)
            if (
                key not in self._requests
                and len(self._requests) >= self.max_tracked_keys
            ):
                key = "overflow"
            requests = self._requests.setdefault(key, deque())
            while requests and requests[0] <= cutoff:
                requests.popleft()
            if len(requests) >= self.limit:
                retry_after = max(
                    1,
                    math.ceil(requests[0] + self.window_seconds - timestamp),
                )
                return False, retry_after
            requests.append(timestamp)
        return True, 0


ASSISTANT_RATE_LIMITER = SlidingWindowRateLimiter(
    ASSISTANT_RATE_LIMIT_REQUESTS,
    ASSISTANT_RATE_LIMIT_WINDOW_SECONDS,
)
AUDIT_RATE_LIMITER = SlidingWindowRateLimiter(
    AUDIT_RATE_LIMIT_REQUESTS,
    AUDIT_RATE_LIMIT_WINDOW_SECONDS,
)
AUDIT_LOG_LOCK = threading.Lock()


def _configured_cors_origins() -> set[str]:
    raw = os.getenv(
        "DASHBOARD_CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )
    return {origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()}


def _origin_allowed(origin: str, host: str, allowed_origins: set[str]) -> bool:
    normalized = origin.strip().rstrip("/")
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False
    if normalized in allowed_origins:
        return True
    return parsed.netloc.casefold() == host.strip().casefold()


def _mutation_requires_operator(method: str, request_path: str) -> bool:
    if method.upper() == "PATCH":
        return request_path.startswith("/api/")
    return method.upper() == "POST" and request_path in PROTECTED_POST_PATHS


def _validated_audit_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate and bound one browser audit event before writing it to disk."""

    action = payload.get("action")
    if not isinstance(action, str):
        raise ValueError("audit action must be text")
    action = action.strip()
    if not action or len(action) > AUDIT_ACTION_MAX_CHARS:
        raise ValueError(
            f"audit action must be between 1 and {AUDIT_ACTION_MAX_CHARS} characters"
        )
    if action not in AUDIT_ALLOWED_ACTIONS:
        raise ValueError("audit action is not recognized")

    scope = payload.get("scope", "")
    if not isinstance(scope, str):
        raise ValueError("audit scope must be text")
    scope = scope.strip()
    if len(scope) > AUDIT_SCOPE_MAX_CHARS:
        raise ValueError(
            f"audit scope must not exceed {AUDIT_SCOPE_MAX_CHARS} characters"
        )
    if any(ord(char) < 32 for char in scope):
        raise ValueError("audit scope must not contain control characters")

    raw_timestamp = payload.get("ts")
    if raw_timestamp is None:
        timestamp = datetime.now().isoformat(timespec="seconds")
    elif isinstance(raw_timestamp, str):
        timestamp = raw_timestamp.strip()
    else:
        raise ValueError("audit timestamp must be text")
    if not timestamp or len(timestamp) > AUDIT_TIMESTAMP_MAX_CHARS:
        raise ValueError("audit timestamp is invalid")
    try:
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("audit timestamp must be ISO-8601") from exc

    raw_detail = payload.get("detail", {})
    if not isinstance(raw_detail, dict):
        raise ValueError("audit detail must be an object")
    if len(raw_detail) > AUDIT_DETAIL_MAX_ITEMS:
        raise ValueError(
            f"audit detail must not exceed {AUDIT_DETAIL_MAX_ITEMS} fields"
        )

    detail: dict[str, str | int | float | bool] = {}
    for key, value in raw_detail.items():
        if not isinstance(key, str):
            raise ValueError("audit detail keys must be text")
        normalized_key = key.strip()
        if not normalized_key or len(normalized_key) > AUDIT_DETAIL_KEY_MAX_CHARS:
            raise ValueError(
                "audit detail keys must be between 1 and "
                f"{AUDIT_DETAIL_KEY_MAX_CHARS} characters"
            )
        if any(ord(char) < 32 for char in normalized_key):
            raise ValueError("audit detail keys must not contain control characters")
        if isinstance(value, str):
            if len(value) > AUDIT_DETAIL_VALUE_MAX_CHARS:
                raise ValueError(
                    "audit detail text values must not exceed "
                    f"{AUDIT_DETAIL_VALUE_MAX_CHARS} characters"
                )
            detail[normalized_key] = value
        elif isinstance(value, bool):
            detail[normalized_key] = value
        elif isinstance(value, int):
            if len(str(value)) > AUDIT_DETAIL_VALUE_MAX_CHARS:
                raise ValueError("audit detail number is too large")
            detail[normalized_key] = value
        elif isinstance(value, float) and math.isfinite(value):
            detail[normalized_key] = value
        else:
            raise ValueError("audit detail values must be text, numbers, or booleans")

    if (
        len(json.dumps(detail, ensure_ascii=False).encode("utf-8"))
        > AUDIT_DETAIL_MAX_BYTES
    ):
        raise ValueError(
            f"audit detail must not exceed {AUDIT_DETAIL_MAX_BYTES} encoded bytes"
        )

    return {
        "ts": timestamp,
        "action": action,
        "scope": scope,
        "detail": detail,
    }


class PresentationConceptTooLong(ValueError):
    """Raised when a presentation request exceeds the bounded concept input."""


def _validated_presentation_request(
    payload: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    concept = payload.get("concept")
    if not isinstance(concept, str):
        raise ValueError("Presentation concept must be text.")
    concept = concept.strip()
    if not concept:
        raise ValueError("Please enter a concept you want explained.")
    if len(concept) > PRESENTATION_MAX_CONCEPT_CHARS:
        raise PresentationConceptTooLong(
            "Presentation concept is too long; limit it to "
            f"{PRESENTATION_MAX_CONCEPT_CHARS} characters."
        )

    options = payload.get("options", {})
    if not isinstance(options, dict):
        raise ValueError("Presentation options must be a JSON object.")
    return concept, options


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
        CONTROLS_PATH,
        PROJECT_ROOT / "data" / "data_dictionary" / "NANO_master_data_dictionary.csv",
        PROJECT_ROOT / "dashboard" / "pipelines" / "build_dashboard_data.py",
        PROJECT_ROOT / "dashboard" / "pipelines" / "build_org_site_data.py",
        PROJECT_ROOT
        / "dashboard"
        / "pipelines"
        / "generate_synthetic_dashboard_data.py",
        PROJECT_ROOT / "dashboard" / "pipelines" / "build_readings_index.py",
        PROJECT_ROOT / "scripts" / "build_lab_readings_index.py",
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


def _normalize_group(value: Any) -> str:
    return "VPT" if value == "PT" else str(value or "VPT")


def _dashboard_payload() -> dict[str, Any]:
    return read_json(DATA_DIR / "dashboard_data.json")


def _dashboard_payload_hash(payload: dict[str, Any]) -> str:
    visit_health = payload.get("redcap_visit_health")
    visit_rows = (
        visit_health.get("data")
        if isinstance(visit_health, dict) and isinstance(visit_health.get("data"), list)
        else visit_health
    )
    return build_dashboard_data._payload_hash(
        payload.get("redcap_completion_stats"),
        visit_rows,
        payload.get("redcap_trackers"),
        payload.get("redcap_timeline"),
    )


def _dashboard_controls_payload() -> dict[str, Any]:
    return build_dashboard_data.load_dashboard_controls(CONTROLS_PATH)


def _write_dashboard_controls(payload: dict[str, Any]) -> dict[str, Any]:
    controls = build_dashboard_data.normalize_dashboard_controls(payload)
    CONTROLS_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp_path = CONTROLS_PATH.with_suffix(CONTROLS_PATH.suffix + ".tmp")
    temp_path.write_text(json.dumps(controls, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(CONTROLS_PATH)
    return controls


def _redcap_ops_payload() -> dict[str, Any]:
    payload = _dashboard_payload()
    controls = _dashboard_controls_payload()
    ops = (
        payload.get("redcap_ops") if isinstance(payload.get("redcap_ops"), dict) else {}
    )
    meta = (
        payload.get("redcap_meta")
        if isinstance(payload.get("redcap_meta"), dict)
        else {}
    )
    generated_at = str(
        (ops.get("freshness") or {}).get("generated_at")
        or meta.get("generated_at")
        or ""
    )
    age_hours = 0.0
    if generated_at:
        try:
            parsed = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
            age_hours = max(
                0.0, (datetime.now(parsed.tzinfo) - parsed).total_seconds() / 3600
            )
        except ValueError:
            age_hours = float((ops.get("freshness") or {}).get("age_hours") or 0.0)
    content_hash = _dashboard_payload_hash(payload)
    runtime = os.getenv("DASHBOARD_RUNTIME", "docker")
    runtime_parity = dict(ops.get("runtime_parity") or {})
    runtime_parity[runtime] = content_hash
    sla_hours = float(
        (controls.get("anomaly_thresholds") or {}).get("freshness_sla_hours", 48)
    )
    freshness_status = (
        str((ops.get("freshness") or {}).get("status") or "").strip().lower()
    )
    if freshness_status not in {"fresh", "stale"}:
        freshness_status = "fresh" if age_hours <= sla_hours else "stale"
    return {
        "freshness": {
            "generated_at": generated_at,
            "age_hours": round(age_hours, 2),
            "source": (ops.get("freshness") or {}).get("source")
            or meta.get("source")
            or "unknown",
            "status": freshness_status,
            "sla_hours": sla_hours,
        },
        "runtime_parity": runtime_parity,
        "run_ledger": ops.get("run_ledger") or [],
        "controls_snapshot": controls,
        "content_hash": content_hash,
        "runtime": runtime,
    }


def _operator_authorized(headers: Any) -> bool:
    token = (
        os.getenv("DASHBOARD_OPERATOR_TOKEN")
        or os.getenv("REDCAP_WRITEBACK_OPERATOR_TOKEN")
        or ""
    ).strip()
    if not token:
        return False
    supplied = str(headers.get("X-Operator-Token") or "").strip()
    auth = str(headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        supplied = auth.split(" ", 1)[1].strip()
    return bool(supplied) and secrets_compare(supplied, token)


def secrets_compare(left: str, right: str) -> bool:
    return hmac.compare_digest(left, right)


def _participant_count(payload: dict[str, Any]) -> int:
    enrollment = payload.get("enrollment") or {}
    by_group = enrollment.get("by_group") or {}
    total = 0
    for block in by_group.values():
        if isinstance(block, dict):
            total += int(block.get("current") or 0)
    if total:
        return total
    cohort = payload.get("cohort_table") or []
    return len(cohort) if isinstance(cohort, list) else 0


def _api_list(
    data: list[dict[str, Any]],
    payload: dict[str, Any] | None = None,
    *,
    source: str = "aggregate",
    participant_count: int | None = None,
) -> dict[str, Any]:
    payload = payload or _dashboard_payload()
    generated_at = payload.get("meta", {}).get(
        "generated_at"
    ) or datetime.now().isoformat(timespec="seconds")
    return {
        "data": data,
        "meta": {
            "generatedAt": generated_at,
            "participantCount": (
                participant_count
                if participant_count is not None
                else _participant_count(payload)
            ),
            "source": source,
        },
    }


def _legacy_group_counts(payload: dict[str, Any]) -> dict[str, dict[str, int]]:
    raw = (payload.get("enrollment") or {}).get("by_group") or {}
    groups = {
        code: {"count": 0, "target": target}
        for code, target in LEGACY_STUDY_TARGETS.items()
    }
    for raw_group, block in raw.items():
        if not isinstance(block, dict):
            continue
        group = _normalize_group(raw_group)
        groups[group] = {
            "count": int(block.get("current") or groups[group]["count"]),
            "target": int(block.get("target") or groups[group]["target"]),
        }
    return groups


def _legacy_study_summary() -> dict[str, Any]:
    payload = _dashboard_payload()
    groups = _legacy_group_counts(payload)
    enrolled = sum(item["count"] for item in groups.values())
    target = int(
        payload.get("meta", {}).get("study", {}).get("n_target")
        or sum(item["target"] for item in groups.values())
        or 260
    )
    return {
        "enrolled": enrolled,
        "target": target,
        "groups": groups,
    }


def _legacy_stage_rows() -> list[dict[str, Any]]:
    rows = []
    for row in data_features.stages_rows():
        meta = LEGACY_STAGE_CATALOG.get(
            str(row.get("id") or ""),
            {
                "short": str(row.get("label") or row.get("id") or "stage"),
                "description": "Pipeline stage status from the live dashboard runtime.",
            },
        )
        rows.append(
            {
                "id": str(row.get("id") or "stage"),
                "label": str(row.get("label") or "Stage"),
                "short": meta["short"],
                "description": meta["description"],
                "inflight": int(row.get("inflight") or 0),
                "queued": int(row.get("queued") or 0),
                "done": int(row.get("done") or 0),
                "fail": int(row.get("fail") or 0),
                "rate": float(row.get("rate") or 0),
                "eta": str(row.get("eta") or "—"),
            }
        )
    return rows


def _legacy_runs(limit: int) -> list[dict[str, Any]]:
    rows = data_features.runs_rows()
    bounded = rows[: max(1, limit)]
    return [
        {
            "id": str(row.get("id") or "run"),
            "triggered": str(row.get("triggered") or ""),
            "actor": str(row.get("actor") or "system"),
            "scope": str(row.get("scope") or "nightly"),
            "status": str(row.get("status") or "idle"),
            "duration": str(row.get("duration") or "0m"),
            "stage": str(row.get("stage") or "merge"),
            "windows": int(row.get("windows") or 0),
        }
        for row in bounded
    ]


def _participant_operations_lookup(
    payload: dict[str, Any],
    fallback_rows: list[dict[str, Any]] | None = None,
) -> dict[str, dict[str, Any]]:
    lookup = operation_lookup(payload.get("participant_operations"))
    if lookup:
        return lookup
    cohort = payload.get("cohort_table")
    if not isinstance(cohort, list) or not cohort:
        cohort = fallback_rows or []
    return operation_lookup(build_participant_operations(cohort))


def _legacy_participants() -> list[dict[str, Any]]:
    payload = _dashboard_payload()
    rows = data_features.participants_from_payload(payload)
    operations = _participant_operations_lookup(payload, rows)
    return [
        {
            "id": str(row.get("id") or "NANO-0000"),
            "group": _normalize_group(row.get("group")),
            "cga_wks": float(row.get("cga_wks") or 0),
            "sex": str(row.get("sex") or "X"),
            "visit": str(row.get("visit") or "cga_12mo"),
            "windows": int(row.get("windows") or 0),
            "qa": str(row.get("qa") or "pending"),
            "rmssd": row.get("rmssd"),
            "hf": row.get("hf"),
            "hda": row.get("hda"),
            "updated": str(row.get("updated") or "now"),
            "enrolled": str(row.get("enrolled") or ""),
            "site": str(row.get("site") or "USC Lab"),
            "operations": operations.get(str(row.get("id") or "NANO-0000")),
        }
        for row in rows
    ]


def _legacy_participant_detail(nano_id: str) -> dict[str, Any] | None:
    subject = next(
        (row for row in _legacy_participants() if row["id"] == nano_id), None
    )
    if subject is None:
        return None
    return {
        **subject,
        "visit_log": [dict(item) for item in LEGACY_VISIT_LOG],
    }


def _make_legacy_epochs() -> list[dict[str, Any]]:
    flags = [
        "clean",
        "clean",
        "clean",
        "clean",
        "clean",
        "clean",
        "clean",
        "ectopic",
        "motion",
        "noise",
        "clean",
        "clean",
        "flatline",
        "clean",
    ]
    rows: list[dict[str, Any]] = []
    t0 = 0
    for idx in range(64):
        flag = flags[(idx * 7 + 3) % len(flags)]
        sqi = (
            0.78 + (idx % 7) * 0.03
            if flag == "clean"
            else (
                0.55 - (idx % 4) * 0.05
                if flag == "ectopic"
                else 0.32 if flag == "motion" else 0.18 if flag == "noise" else 0.04
            )
        )
        rows.append(
            {
                "idx": idx,
                "t0": t0,
                "t1": t0 + 5,
                "flag": flag,
                "sqi": round(max(0.02, min(0.99, sqi)), 2),
                "ibi_n": (
                    8 + (idx % 3)
                    if flag == "clean"
                    else 6 if flag == "ectopic" else 4 if flag == "motion" else 2
                ),
                "decision": "auto",
            }
        )
        t0 += 5
    return rows


def _legacy_epochs_for_visit(visit_id: str) -> list[dict[str, Any]]:
    if visit_id not in LEGACY_EPOCH_STORE:
        LEGACY_EPOCH_STORE[visit_id] = _make_legacy_epochs()
    return LEGACY_EPOCH_STORE[visit_id]


def _legacy_update_epoch_decision(
    visit_id: str, idx: int, decision: str
) -> dict[str, Any] | None:
    epochs = _legacy_epochs_for_visit(visit_id)
    if idx < 0 or idx >= len(epochs):
        return None
    epochs[idx] = {
        **epochs[idx],
        "decision": decision,
    }
    return dict(epochs[idx])


def _legacy_trajectory(metric: str) -> dict[str, Any]:
    payload = _dashboard_payload()
    normalized_metric = metric.lower()
    source_metric = {
        "rmssd": "RMSSD",
        "sdnn": "SDNN",
        "hf": None,
    }.get(normalized_metric, "RMSSD")
    trajectories = payload.get("trajectories") or {}
    months = trajectories.get("months") or [3, 6, 9, 12, 18, 24]
    by_group = trajectories.get("by_group") or {}
    groups = _legacy_group_counts(payload)

    if source_metric is None:
        base_months = [3, 6, 9, 12, 18, 24]
        base = 280
        step = 35
        return {
            "months": base_months,
            "series": {
                "VPT": [
                    {
                        "x": month,
                        "y": base + idx * step + (-1 if idx == 5 else 0),
                        "n": max(4, groups["VPT"]["count"] - idx * 8),
                    }
                    for idx, month in enumerate(base_months)
                ],
                "ASIB": [
                    {
                        "x": month,
                        "y": base + 4 + idx * (step + 0.4),
                        "n": max(4, round(groups["ASIB"]["count"] - idx * 1.5)),
                    }
                    for idx, month in enumerate(base_months)
                ],
                "TD": [
                    {
                        "x": month,
                        "y": base + 7 + idx * (step + 0.7),
                        "n": max(4, groups["TD"]["count"] - idx),
                    }
                    for idx, month in enumerate(base_months)
                ],
            },
        }

    series: dict[str, list[dict[str, Any]]] = {"VPT": [], "ASIB": [], "TD": []}
    for raw_group, block in by_group.items():
        group = _normalize_group(raw_group)
        means = (block.get("mean") or {}).get(source_metric) or []
        ci = (block.get("ci") or {}).get(source_metric) or {}
        lows = ci.get("low") or []
        highs = ci.get("high") or []
        current_n = groups[group]["count"]
        points: list[dict[str, Any]] = []
        for idx, month in enumerate(months):
            mean = means[idx] if idx < len(means) else None
            if mean is None:
                continue
            point: dict[str, Any] = {
                "x": float(month),
                "y": round(float(mean), 3),
                "n": max(4, current_n - idx * (8 if group == "VPT" else 2)),
            }
            low = lows[idx] if idx < len(lows) else None
            high = highs[idx] if idx < len(highs) else None
            if low is not None and high is not None:
                point["ci"] = [round(float(low), 3), round(float(high), 3)]
            points.append(point)
        series[group] = points

    filtered_months = sorted(
        {int(point["x"]) for group_points in series.values() for point in group_points}
    )
    return {
        "months": filtered_months,
        "series": series,
    }


def _legacy_hda_distribution() -> dict[str, Any]:
    payload = _dashboard_payload()
    groups = _legacy_group_counts(payload)
    block = payload.get("hda_composition") or {}
    by_group = block.get("by_group") if isinstance(block, dict) else None
    if not isinstance(by_group, dict):
        by_group = {}
    out: dict[str, dict[str, int]] = {}
    for group in ("VPT", "ASIB", "TD"):
        points = (
            by_group.get(group) or by_group.get("PT" if group == "VPT" else group) or []
        )
        latest = next(
            (point for point in reversed(points) if isinstance(point, dict)),
            None,
        )
        scale = max(24, groups[group]["count"] * 6)
        if latest is None:
            latest = {
                "orienting": 0.25,
                "sustained": 0.45,
                "inattention": 0.22,
                "termination": 0.08,
            }
        out[group] = {
            phase: int(round(float(latest.get(phase, 0)) * scale))
            for phase in ("orienting", "sustained", "inattention", "termination")
        }
    return out


def _legacy_redcap_events() -> list[dict[str, Any]]:
    return data_features.redcap_event_rows(_dashboard_payload())


def _legacy_matlab_integration() -> dict[str, Any]:
    payload = _dashboard_payload()
    matlab = payload.get("matlab_integration")
    return matlab if isinstance(matlab, dict) else {}


def _v2_rsa_trajectories(age_basis: str) -> dict[str, Any]:
    payload = _dashboard_payload()
    trajectories = payload.get("trajectories") or {}
    months = trajectories.get("months") or [0, 1, 2, 3, 6, 9, 12, 24, 36]
    by_group = trajectories.get("by_group") or {}
    enrollment = payload.get("enrollment", {}).get("by_group", {})
    rows: list[dict[str, Any]] = []
    for raw_group, block in by_group.items():
        group = _normalize_group(raw_group)
        means = (block.get("mean") or {}).get("RSA") or []
        ci = (block.get("ci") or {}).get("RSA") or {}
        lows = ci.get("low") or []
        highs = ci.get("high") or []
        current_n = int(
            (enrollment.get(raw_group) or enrollment.get(group) or {}).get("current")
            or 24
        )
        for idx, month in enumerate(months):
            mean = means[idx] if idx < len(means) else None
            if mean is None:
                continue
            adjusted = float(month)
            chronological = adjusted + (
                2.0 if group == "VPT" else 0.8 if group == "ASIB" else 0.0
            )
            age = chronological if age_basis == "chronological" else adjusted
            band = 0.06
            rows.append(
                {
                    "group": group,
                    "ageMonths": age,
                    "adjustedAgeMonths": adjusted,
                    "chronologicalAgeMonths": chronological,
                    "mean": round(float(mean), 3),
                    "ciLow": round(
                        float(
                            lows[idx]
                            if idx < len(lows) and lows[idx] is not None
                            else mean - band
                        ),
                        3,
                    ),
                    "ciHigh": round(
                        float(
                            highs[idx]
                            if idx < len(highs) and highs[idx] is not None
                            else mean + band
                        ),
                        3,
                    ),
                    "n": max(6, current_n - idx * (9 if group == "VPT" else 3)),
                }
            )
    return _api_list(rows, payload)


def _v2_redcap_completeness() -> dict[str, Any]:
    payload = _dashboard_payload()
    cohort = payload.get("cohort_table") or []
    operations = _participant_operations_lookup(payload)
    instruments = [
        ("visit_intake_v2", True, 18),
        ("medical_history_v1", True, 22),
        ("bayley4_scores", True, 16),
        ("mchat_r_tf", True, 12),
        ("caregiver_q_v3", False, 14),
        ("temperature_recording_log", False, 10),
    ]
    deadline = (
        os.getenv("VITE_NDA_DEADLINE") or os.getenv("NDA_DEADLINE") or "2026-08-01"
    )
    rows: list[dict[str, Any]] = []
    for p_idx, participant in enumerate(cohort[:24]):
        nano_id = str(participant.get("nano_id") or f"NANO-{p_idx + 1:04d}")
        group = _normalize_group(participant.get("group"))
        ops = operations.get(nano_id, {})
        checklist = ops.get("questionnaire_checklist") if isinstance(ops, dict) else []
        base = float(participant.get("completeness_pct") or 82)
        for f_idx, (instrument, nda_required, total_required) in enumerate(instruments):
            missing = max(0, int(round((100 - base) / 18)) + ((p_idx + f_idx) % 3) - 1)
            completeness = max(
                0.0, min(100.0, ((total_required - missing) / total_required) * 100)
            )
            workflow_state = None
            if isinstance(checklist, list) and checklist:
                matched = checklist[f_idx % len(checklist)]
                if isinstance(matched, dict):
                    workflow_state = matched.get("status")
            rows.append(
                {
                    "nanoId": nano_id,
                    "group": group,
                    "instrument": instrument,
                    "completenessPct": round(completeness, 1),
                    "requiredMissing": missing,
                    "requiredTotal": total_required,
                    "ndaRequired": nda_required,
                    "dueDate": deadline if nda_required else None,
                    "status": (
                        "complete"
                        if missing == 0
                        else "watch" if missing <= 2 else "missing"
                    ),
                    "workflowState": workflow_state
                    or ("complete" if missing == 0 else "missing"),
                    "enrollmentType": (
                        ops.get("enrollment_type")
                        if isinstance(ops, dict)
                        else "single"
                    ),
                    "studies": (
                        ops.get("study_roles") if isinstance(ops, dict) else ["NANO"]
                    ),
                    "visitType": (
                        ops.get("visit_type")
                        if isinstance(ops, dict)
                        else "CGA longitudinal"
                    ),
                    "formPolicy": (
                        (ops.get("form_policy") or {}).get("mode")
                        if isinstance(ops, dict)
                        else "single_study"
                    ),
                    "schedulingRisk": (
                        ops.get("scheduling_risk") if isinstance(ops, dict) else "low"
                    ),
                    "linkingId": (
                        ops.get("linking_id") if isinstance(ops, dict) else None
                    ),
                }
            )
    return _api_list(rows, payload)


def _redcap_event_config() -> dict[str, str]:
    return {
        "SIX_MONTH": os.getenv("REDCAP_EVENT_6M", REDCAP_EVENTS["SIX_MONTH"]),
        "NINE_MONTH": os.getenv("REDCAP_EVENT_9M", REDCAP_EVENTS["NINE_MONTH"]),
        "TWELVE_MONTH": os.getenv("REDCAP_EVENT_12M", REDCAP_EVENTS["TWELVE_MONTH"]),
        "TWENTY_FOUR_MONTH": os.getenv(
            "REDCAP_EVENT_24M", REDCAP_EVENTS["TWENTY_FOUR_MONTH"]
        ),
    }


def _redcap_csbs_instrument() -> str:
    return os.getenv("REDCAP_CSBS_INSTRUMENT", REDCAP_CSBS_INSTRUMENT)


def _redcap_visit_date_field() -> str:
    return os.getenv("REDCAP_VISIT_DATE_FIELD", REDCAP_VISIT_DATE_FIELD)


def _redcap_visit_options() -> list[dict[str, str]]:
    events = _redcap_event_config()
    return [
        {"key": key, "label": label, "eventName": events[event_key]}
        for key, event_key, label in REDCAP_VISIT_KEYS
    ]


def _redcap_visit_health_envelope(
    data: list[dict[str, Any]],
    *,
    source: str = "live",
    error: str | None = None,
) -> dict[str, Any]:
    payload = {
        "data": data,
        "meta": {
            "generatedAt": datetime.now().isoformat(timespec="seconds"),
            "participantCount": len(data),
            "source": source,
        },
        "anomalies": [
            {"recordId": row["recordId"], "risks": row["anomalyFlags"]}
            for row in data
            if row.get("hasCarryForwardRisk")
        ],
        "visitOptions": _redcap_visit_options(),
    }
    if error:
        payload["error"] = error
    return payload


def _nullable_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _redcap_surrogate_id(record_id: str) -> str:
    salt = (
        os.getenv("PARTICIPANT_ID_SALT")
        or os.getenv("NANO_ID_SALT")
        or "nano_default_salt"
    )
    return build_dashboard_data._surrogate_id(record_id, salt)


def _redcap_status(value: Any, *, skipped: bool = False) -> str:
    if skipped:
        return "skipped"
    key = str(value or "").strip().upper()
    if key.endswith(".0") and key[:-2].isdigit():
        key = key[:-2]
    return COMPLETE_STATUS_MAP.get(
        key, COMPLETE_STATUS_MAP.get(key.lower(), "not_started")
    )


def _redcap_row_has_skip_code(row: dict[str, Any]) -> bool:
    instrument = _redcap_csbs_instrument()
    for key, value in row.items():
        if str(value or "").strip().upper() != "SKIP":
            continue
        if instrument in key or "csbs" in key.lower():
            return True
    return False


def _empty_redcap_timepoint(event_name: str) -> dict[str, Any]:
    return {
        "eventName": event_name,
        "visitDate": None,
        "csbsStatus": "not_started",
        "csbsTimestamp": None,
    }


def _redcap_timepoint_from_row(
    row: dict[str, Any] | None,
    event_name: str,
) -> dict[str, Any]:
    if not row:
        return _empty_redcap_timepoint(event_name)
    instrument = _redcap_csbs_instrument()
    status_field = f"{instrument}_complete"
    timestamp_field = f"{instrument}_timestamp"
    return {
        "eventName": event_name,
        "visitDate": _nullable_text(row.get(_redcap_visit_date_field())),
        "csbsStatus": _redcap_status(
            row.get(status_field),
            skipped=_redcap_row_has_skip_code(row),
        ),
        "csbsTimestamp": _nullable_text(row.get(timestamp_field)),
    }


def _detect_carry_forward_risk(record: dict[str, Any]) -> list[str]:
    flags: list[str] = []
    sequence = [
        ("6m", record["sixMonth"]),
        ("9m", record["nineMonth"]),
        ("12m", record["twelveMonth"]),
        ("24m", record["twentyFourMonth"]),
    ]

    if sequence[0][1]["csbsStatus"] == "incomplete" and sequence[1][1]["visitDate"]:
        flags.append("R1")
    if sequence[1][1]["csbsStatus"] == "incomplete" and sequence[2][1]["visitDate"]:
        flags.append("R2")
    if (
        sequence[0][1]["csbsStatus"] == "not_started"
        and sequence[1][1]["csbsStatus"] == "complete"
    ):
        flags.append("R3")
    if (
        sequence[1][1]["csbsStatus"] == "not_started"
        and sequence[2][1]["csbsStatus"] == "complete"
    ):
        flags.append("R4")
    if sequence[2][1]["csbsStatus"] == "incomplete" and sequence[3][1]["visitDate"]:
        flags.append("R5")
    return flags


def _redcap_flat_records_to_visit_health(
    records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    events = _redcap_event_config()
    event_to_key = {
        events[event_key]: key for key, event_key, _label in REDCAP_VISIT_KEYS
    }
    grouped: dict[str, dict[str, dict[str, Any]]] = {}
    for row in records:
        if not isinstance(row, dict):
            continue
        record_id = _nullable_text(row.get("record_id") or row.get("study_id"))
        event_name = _nullable_text(row.get("redcap_event_name"))
        if not record_id:
            continue
        bucket = grouped.setdefault(record_id, {})
        if event_name in event_to_key:
            bucket[event_to_key[event_name]] = row
        elif not event_name:
            bucket.setdefault("sixMonth", row)

    visit_records: list[dict[str, Any]] = []
    for record_id, rows_by_visit in grouped.items():
        record = {
            "recordId": record_id,
            "sixMonth": _redcap_timepoint_from_row(
                rows_by_visit.get("sixMonth"), events["SIX_MONTH"]
            ),
            "nineMonth": _redcap_timepoint_from_row(
                rows_by_visit.get("nineMonth"), events["NINE_MONTH"]
            ),
            "twelveMonth": _redcap_timepoint_from_row(
                rows_by_visit.get("twelveMonth"), events["TWELVE_MONTH"]
            ),
            "twentyFourMonth": _redcap_timepoint_from_row(
                rows_by_visit.get("twentyFourMonth"), events["TWENTY_FOUR_MONTH"]
            ),
            "anomalyFlags": [],
            "hasCarryForwardRisk": False,
        }
        flags = _detect_carry_forward_risk(record)
        record["recordId"] = _redcap_surrogate_id(record_id)
        record["anomalyFlags"] = flags
        record["hasCarryForwardRisk"] = bool(flags)
        visit_records.append(record)

    return sorted(
        visit_records,
        key=lambda row: (not row["hasCarryForwardRisk"], row["recordId"]),
    )


def _fetch_redcap_flat_records() -> list[dict[str, Any]]:
    token = os.environ.get("REDCAP_API_TOKEN", "")
    api_url = os.environ.get("REDCAP_API_URL", "")
    if not token or not api_url:
        raise EnvironmentError("REDCAP_API_TOKEN or REDCAP_API_URL not configured")

    response = requests.post(
        api_url,
        data={
            "token": token,
            "content": "record",
            "format": "json",
            "returnFormat": "json",
            "type": "flat",
            "exportSurveyFields": "true",
            "exportDataAccessGroups": "false",
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        raise ValueError("REDCap API returned an unexpected payload")
    return [row for row in payload if isinstance(row, dict)]


def _v2_redcap_visit_health() -> dict[str, Any]:
    try:
        raw_records = _fetch_redcap_flat_records()
    except EnvironmentError as exc:
        return _redcap_visit_health_envelope([], source="mock", error=str(exc))
    except (requests.RequestException, ValueError) as exc:
        logger.warning("REDCap visit-health pull failed: %s", exc)
        return _redcap_visit_health_envelope(
            [],
            source="mock",
            error="REDCap API request failed; check backend logs and credentials.",
        )
    return _redcap_visit_health_envelope(
        _redcap_flat_records_to_visit_health(raw_records)
    )


def _v2_redcap_visit_detail(record_id: str) -> dict[str, Any] | None:
    target = unquote(record_id).strip()
    if not target:
        return None
    health = _v2_redcap_visit_health()
    return next((row for row in health["data"] if row["recordId"] == target), None)


def _v2_redcap_missing_data() -> dict[str, Any]:
    health = _v2_redcap_visit_health()
    skipped = [
        row
        for row in health["data"]
        if any(
            row[key]["csbsStatus"] == "skipped"
            for key, _event_key, _label in REDCAP_VISIT_KEYS
        )
    ]
    payload = _redcap_visit_health_envelope(
        skipped,
        source=str(health.get("meta", {}).get("source") or "live"),
        error=health.get("error"),
    )
    return payload


def _import_redcap_visit_date(
    *,
    record_id: str,
    event_name: str,
    visit_date: str,
) -> dict[str, Any]:
    token = os.environ.get("REDCAP_API_TOKEN", "")
    api_url = os.environ.get("REDCAP_API_URL", "")
    if not token or not api_url:
        raise EnvironmentError("REDCAP_API_TOKEN or REDCAP_API_URL not configured")

    record = {
        "record_id": record_id,
        "redcap_event_name": event_name,
        _redcap_visit_date_field(): visit_date,
    }
    response = requests.post(
        api_url,
        data={
            "token": token,
            "content": "record",
            "format": "json",
            "type": "flat",
            "overwriteBehavior": "normal",
            "returnContent": "count",
            "returnFormat": "json",
            "data": json.dumps([record]),
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    count = int(payload.get("count", 0)) if isinstance(payload, dict) else 0
    errors = payload.get("errors", []) if isinstance(payload, dict) else []
    return {
        "success": not errors,
        "count": count,
        "errors": errors if isinstance(errors, list) else [str(errors)],
        "recordId": record_id,
        "eventName": event_name,
        "visitDate": visit_date,
    }


def _redcap_writeback_enabled() -> bool:
    controls = _dashboard_controls_payload()
    flags = (
        controls.get("feature_flags")
        if isinstance(controls.get("feature_flags"), dict)
        else {}
    )
    return bool(flags.get("redcap.writeback"))


def _allowed_redcap_writeback_fields() -> set[str]:
    configured = {
        item.strip()
        for item in os.getenv("REDCAP_WRITEBACK_COMPLETE_FIELDS", "").split(",")
        if item.strip()
    }
    return {
        _redcap_visit_date_field(),
        f"{_redcap_csbs_instrument()}_complete",
        *configured,
    }


def _validate_redcap_writeback_value(field: str, value: str) -> bool:
    if field == _redcap_visit_date_field():
        try:
            datetime.strptime(value, "%Y-%m-%d")
            return True
        except ValueError:
            return False
    if field.endswith("_complete"):
        return value in {"", "0", "1", "2", "SKIP"}
    return False


def _append_redcap_writeback_audit(entry: dict[str, Any]) -> None:
    audit_path = DATA_DIR / "redcap_writeback_audit.jsonl"
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    with audit_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, sort_keys=True) + "\n")


def _trigger_pages_deploy_hook(reason: str, audit_id: str) -> None:
    hook_url = os.getenv("PAGES_DEPLOY_HOOK_URL", "").strip()
    if not hook_url:
        return
    try:
        requests.post(
            hook_url,
            json={
                "event_type": reason,
                "client_payload": {
                    "audit_id": audit_id,
                    "runtime": os.getenv("DASHBOARD_RUNTIME", "docker"),
                },
            },
            timeout=10,
        )
    except requests.RequestException as exc:
        logger.warning("Pages deploy hook failed after REDCap writeback: %s", exc)


def _import_redcap_field_value(
    *,
    record_id: str,
    event_name: str,
    field: str,
    value: str,
) -> dict[str, Any]:
    token = os.environ.get("REDCAP_API_TOKEN", "")
    api_url = os.environ.get("REDCAP_API_URL", "")
    if not token or not api_url:
        raise EnvironmentError("REDCAP_API_TOKEN or REDCAP_API_URL not configured")

    record = {
        "record_id": record_id,
        "redcap_event_name": event_name,
        field: value,
    }
    response = requests.post(
        api_url,
        data={
            "token": token,
            "content": "record",
            "format": "json",
            "type": "flat",
            "overwriteBehavior": "normal",
            "returnContent": "count",
            "returnFormat": "json",
            "data": json.dumps([record]),
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    count = int(payload.get("count", 0)) if isinstance(payload, dict) else 0
    errors = payload.get("errors", []) if isinstance(payload, dict) else []
    return {
        "success": not errors,
        "count": count,
        "errors": errors if isinstance(errors, list) else [str(errors)],
        "recordId": record_id,
        "eventName": event_name,
        "field": field,
        "newValue": value,
    }


def _redcap_app_url() -> str | None:
    app_url = os.getenv("REDCAP_APP_URL", "").strip()
    if app_url:
        return app_url.rstrip("/") + "/"
    api_url = os.getenv("REDCAP_API_URL", "").strip()
    if "/api" not in api_url:
        return None
    return api_url.split("/api", 1)[0].rstrip("/") + "/"


def _visit_age(raw: str) -> float:
    try:
        return float(raw)
    except ValueError:
        return {
            "nicu_dc": 0,
            "cga_3mo": 3,
            "cga_6mo": 6,
            "cga_9mo": 9,
            "cga_12mo": 12,
            "cga_18mo": 18,
            "cga_24mo": 24,
        }.get(raw, 12)


def _v2_hda_session(nano_id: str, visit_age_raw: str) -> dict[str, Any]:
    visit_age = _visit_age(visit_age_raw)
    phases = ["orienting", "sustained", "inattention", "termination"]
    rows = []
    for idx in range(72):
        phase = phases[0 if idx < 10 else 1 if idx < 48 else 2 if idx < 64 else 3]
        rows.append(
            {
                "nanoId": nano_id,
                "visitAge": visit_age,
                "t0": idx * 5,
                "t1": idx * 5 + 5,
                "phase": phase,
                "confidence": round(0.74 + ((idx * 7) % 19) / 100, 2),
                "rmssd": round(28 + visit_age * 0.9 + math.sin(idx / 4) * 4, 2),
                "sqi": round(0.72 + ((idx * 5) % 23) / 100, 2),
            }
        )
    return _api_list(rows, source="live", participant_count=1)


def _v2_thermal_heatmap(nano_id: str) -> dict[str, Any]:
    rows = []
    for idx in range(7 * 24):
        day = idx // 24 + 1
        hour = idx % 24
        central = 36.6 + math.sin((hour - 5) / 4) * 0.25 + day * 0.015
        peripheral = 35.9 + math.cos(hour / 5) * 0.38 - day * 0.01
        rows.append(
            {
                "nanoId": nano_id,
                "day": day,
                "hour": hour,
                "centralTemp": round(central, 2),
                "peripheralTemp": round(peripheral, 2),
                "gradient": round(central - peripheral, 2),
                "hrc": round(
                    4.4 + math.sin(idx / 9) * 1.2 + (0.6 if hour > 18 else 0), 2
                ),
                "medicalEvent": (
                    "care cluster"
                    if day == 2 and hour == 7
                    else "feeding hold" if day == 5 and hour == 19 else None
                ),
            }
        )
    return _api_list(rows, source="live", participant_count=1)


def _v2_cohort_swimmer() -> dict[str, Any]:
    payload = _dashboard_payload()
    cohort = payload.get("cohort_table") or []
    operations = _participant_operations_lookup(payload)
    visits = [
        ("nicu_dc", 0),
        ("cga_3mo", 3),
        ("cga_6mo", 6),
        ("cga_9mo", 9),
        ("cga_12mo", 12),
        ("cga_18mo", 18),
        ("cga_24mo", 24),
    ]
    rows = []
    for idx, participant in enumerate(cohort[:60]):
        nano_id = str(participant.get("nano_id") or f"NANO-{idx + 1:04d}")
        last_label = str(participant.get("last_visit") or "12 Months").lower()
        completed = 1 + max(
            0,
            min(
                len(visits) - 1,
                next(
                    (
                        i
                        for i, (_, month) in enumerate(visits)
                        if f"{month}" in last_label
                    ),
                    4,
                ),
            ),
        )
        rows.append(
            {
                "nanoId": nano_id,
                "group": _normalize_group(participant.get("group")),
                "enrolledAt": f"2024-{(idx % 12) + 1:02d}-{(idx % 24) + 1:02d}",
                "lastVisit": visits[min(completed - 1, len(visits) - 1)][0],
                "completedVisits": completed,
                "expectedVisits": len(visits),
                "completionPct": round((completed / len(visits)) * 100, 1),
                "dropoutRisk": (
                    "high"
                    if participant.get("qc_status") == "Review"
                    else "watch" if idx % 5 == 0 else "low"
                ),
                "milestones": [
                    {
                        "visit": visit,
                        "month": month,
                        "status": (
                            "complete"
                            if i < completed
                            else (
                                "missed"
                                if i == completed and idx % 5 == 0
                                else "scheduled"
                            )
                        ),
                    }
                    for i, (visit, month) in enumerate(visits)
                ],
                "operations": operations.get(nano_id),
            }
        )
    return _api_list(rows, payload)


def _normalize_composition(values: list[float]) -> dict[str, float]:
    total = sum(values) or 1.0
    normalized = [round(value / total, 3) for value in values]
    drift = round(1.0 - sum(normalized), 3)
    normalized[1] = round(normalized[1] + drift, 3)
    return {
        "orienting": normalized[0],
        "sustained": normalized[1],
        "inattention": normalized[2],
        "termination": normalized[3],
    }


def _v2_hda_composition() -> dict[str, Any]:
    payload = _dashboard_payload()
    block = payload.get("hda_composition") or {}
    by_group = block.get("by_group") if isinstance(block, dict) else None
    if isinstance(by_group, dict) and by_group:
        return {
            "byGroup": {
                _normalize_group(group): [
                    {
                        "month": float(point.get("month", idx)),
                        "orienting": float(point.get("orienting", 0)),
                        "sustained": float(point.get("sustained", 0)),
                        "inattention": float(point.get("inattention", 0)),
                        "termination": float(point.get("termination", 0)),
                    }
                    for idx, point in enumerate(points)
                    if isinstance(point, dict)
                ]
                for group, points in by_group.items()
                if isinstance(points, list)
            },
            "meta": _api_list([], payload)["meta"],
        }

    months = [0, 1, 2, 3, 6, 9, 12, 24, 36]
    specs = {
        "VPT": ([0.25, 0.34, 0.29, 0.12], [-0.006, 0.025, -0.012, -0.006]),
        "ASIB": ([0.27, 0.31, 0.28, 0.14], [-0.005, 0.015, -0.006, -0.004]),
        "TD": ([0.24, 0.39, 0.23, 0.14], [-0.007, 0.03, -0.015, -0.008]),
    }
    return {
        "byGroup": {
            group: [
                {
                    "month": month,
                    **_normalize_composition(
                        [base[i] + slope[i] * idx for i in range(4)]
                    ),
                }
                for idx, month in enumerate(months)
            ]
            for group, (base, slope) in specs.items()
        },
        "meta": _api_list([], payload)["meta"],
    }


def _v2_attrition_funnel() -> dict[str, Any]:
    payload = _dashboard_payload()
    attrition_block = payload.get("attrition_funnel")
    enrollment = payload.get("enrollment", {}).get("by_group", {})
    rows = []
    for raw_group, group_block in enrollment.items():
        group = _normalize_group(raw_group)
        count = int(group_block.get("current") or 0)
        rows.extend(
            [
                {"from": "enrolled", "to": "nicu_dc", "value": count, "group": group},
                {
                    "from": "nicu_dc",
                    "to": "cga_6mo",
                    "value": round(count * 0.84),
                    "group": group,
                },
                {
                    "from": "cga_6mo",
                    "to": "cga_12mo",
                    "value": round(count * 0.62),
                    "group": group,
                },
                {
                    "from": "cga_12mo",
                    "to": "cga_24mo",
                    "value": round(count * 0.28),
                    "group": group,
                },
            ]
        )
    default_stages = [
        {"id": "screened", "label": "Screened", "n": 380, "retainedPct": 100},
        {"id": "consented", "label": "Consented", "n": 302, "retainedPct": 79.5},
        {"id": "enrolled", "label": "Enrolled", "n": 260, "retainedPct": 68.4},
        {"id": "v1", "label": "Visit 1 Complete", "n": 248, "retainedPct": 65.3},
        {"id": "v2", "label": "Visit 2 Complete", "n": 231, "retainedPct": 60.8},
        {"id": "v3", "label": "Visit 3 Complete", "n": 210, "retainedPct": 55.3},
        {"id": "v36mo", "label": "36-Month Complete", "n": 172, "retainedPct": 45.3},
    ]
    default_reasons = [
        {"stageId": "consented", "reason": "declined consent", "n": 42, "pct": 54},
        {"stageId": "consented", "reason": "eligibility", "n": 36, "pct": 46},
        {"stageId": "v2", "reason": "missed visit window", "n": 15, "pct": 48},
        {"stageId": "v2", "reason": "unable to contact", "n": 10, "pct": 32},
        {"stageId": "v36mo", "reason": "study fatigue", "n": 23, "pct": 41},
        {"stageId": "v36mo", "reason": "scheduling conflict", "n": 19, "pct": 34},
    ]
    trend = [
        {
            "quarter": quarter,
            "stageId": stage["id"],
            "n": max(0, round(stage["n"] * (0.36 + qi * 0.085) - si * 3)),
            "retainedPct": round(
                min(100, stage["retainedPct"] * (0.72 + qi * 0.04)), 1
            ),
        }
        for qi, quarter in enumerate(
            [
                "2024-Q1",
                "2024-Q2",
                "2024-Q3",
                "2024-Q4",
                "2025-Q1",
                "2025-Q2",
                "2025-Q3",
                "2025-Q4",
            ]
        )
        for si, stage in enumerate(default_stages)
    ]
    envelope = _api_list(rows, payload)
    if isinstance(attrition_block, dict):
        stages = [
            {
                "id": str(stage.get("id") or ""),
                "label": str(stage.get("label") or stage.get("id") or ""),
                "n": int(stage.get("n") or 0),
                "retainedPct": float(
                    stage.get("retained_pct", stage.get("retainedPct", 0)) or 0
                ),
            }
            for stage in attrition_block.get("stages", [])
            if isinstance(stage, dict)
        ] or default_stages
        reasons = [
            {
                "stageId": str(reason.get("stage_id", reason.get("stageId", ""))),
                "reason": str(reason.get("reason") or ""),
                "n": int(reason.get("n") or 0),
                "pct": float(reason.get("pct") or 0),
            }
            for reason in attrition_block.get(
                "reason_codes", attrition_block.get("reasonCodes", [])
            )
            if isinstance(reason, dict)
        ] or default_reasons
        trends = [
            {
                "quarter": str(point.get("quarter") or ""),
                "stageId": str(point.get("stage_id", point.get("stageId", ""))),
                "n": int(point.get("n") or 0),
                "retainedPct": float(
                    point.get("retained_pct", point.get("retainedPct", 0)) or 0
                ),
            }
            for point in attrition_block.get(
                "trend_by_quarter", attrition_block.get("trendByQuarter", [])
            )
            if isinstance(point, dict)
        ] or trend
    else:
        stages = default_stages
        reasons = default_reasons
        trends = trend
    return {
        **envelope,
        "stages": stages,
        "reasonCodes": reasons,
        "trendByQuarter": trends,
    }


def _v2_sdoh_map() -> dict[str, Any]:
    rows = [
        ("Richland", "45079", 34.0007, -81.0348, 74, 0.43, 87, 72),
        ("Lexington", "45063", 33.9815, -81.2362, 39, 0.31, 91, 78),
        ("Greenville", "45045", 34.8526, -82.3940, 31, 0.37, 89, 75),
        ("Charleston", "45019", 32.7765, -79.9311, 22, 0.28, 92, 81),
        ("Florence", "45041", 34.1954, -79.7626, 18, 0.52, 81, 69),
    ]
    return _api_list(
        [
            {
                "county": county,
                "fips": fips,
                "lat": lat,
                "lng": lng,
                "participants": participants,
                "deprivationIndex": deprivation,
                "broadbandPct": broadband,
                "foodAccessPct": round(100 - deprivation * 45, 1),
                "meanCompletion": completion,
            }
            for county, fips, lat, lng, participants, deprivation, broadband, completion in rows
        ]
    )


def _v2_county_profiles() -> dict[str, Any]:
    payload = _dashboard_payload()
    existing = payload.get("county_profiles")
    if isinstance(existing, list) and existing:
        rows = [
            {
                "county": str(row.get("county") or ""),
                "fips": str(row.get("fips") or ""),
                "enrolled": int(row.get("enrolled") or 0),
                "completionRate": float(
                    row.get("completion_rate", row.get("completionRate", 0)) or 0
                ),
                "sdohScore": float(row.get("sdoh_score", row.get("sdohScore", 0)) or 0),
                "medianIncomeBracket": str(
                    row.get(
                        "median_income_bracket",
                        row.get("medianIncomeBracket", "medium"),
                    )
                ),
                "cptdGapMean": row.get("cptd_gap_mean", row.get("cptdGapMean")),
            }
            for row in existing
            if isinstance(row, dict)
        ]
        return _api_list(rows, payload)

    sdoh = _v2_sdoh_map()["data"]
    rows = [
        {
            "county": row["county"],
            "fips": row["fips"],
            "enrolled": row["participants"],
            "completionRate": round(row["meanCompletion"] / 100, 3),
            "sdohScore": row["deprivationIndex"],
            "medianIncomeBracket": (
                "low"
                if row["deprivationIndex"] > 0.48
                else "medium" if row["deprivationIndex"] > 0.34 else "high"
            ),
            "cptdGapMean": round(1.5 + row["deprivationIndex"] * 1.4, 2),
        }
        for row in sdoh
    ]
    return _api_list(rows, payload)


def _v2_shap_values() -> dict[str, Any]:
    payload = _dashboard_payload()
    cohort = payload.get("cohort_table") or []
    features = payload.get("ml_performance", {}).get("shap") or [
        {"feature": "rmssd_mean_m6", "label": "RMSSD mean @ 6mo"},
        {"feature": "rsa_slope_0_12", "label": "RSA slope 0-12mo"},
    ]
    modalities = ["ecg", "hda", "redcap", "thermal", "demographic"]
    rows = []
    for p_idx, participant in enumerate(cohort[:24]):
        for f_idx, feature in enumerate(features[:8]):
            rows.append(
                {
                    "participantId": str(
                        participant.get("nano_id") or f"NANO-{p_idx + 1:04d}"
                    ),
                    "feature": str(
                        feature.get("feature") or feature.get("label") or "feature"
                    ),
                    "label": str(
                        feature.get("label") or feature.get("feature") or "Feature"
                    ),
                    "value": round(0.8 + p_idx * 0.08 + f_idx * 0.12, 2),
                    "shap": round(
                        math.sin(p_idx * 0.9 + f_idx) * 0.18
                        + (
                            0.04
                            if _normalize_group(participant.get("group")) == "VPT"
                            else -0.02
                        ),
                        3,
                    ),
                    "modality": modalities[f_idx % len(modalities)],
                    "timeWindow": "0-12 mo" if f_idx % 2 else "6-24 mo",
                }
            )
    return _api_list(rows, payload)


def _v2_cluster_tsne() -> dict[str, Any]:
    payload = _dashboard_payload()
    cohort = payload.get("cohort_table") or []
    rows = []
    for idx, participant in enumerate(cohort[:50]):
        group = _normalize_group(participant.get("group"))
        for t_idx, timepoint in enumerate([6, 12, 24]):
            rows.append(
                {
                    "nanoId": str(participant.get("nano_id") or f"NANO-{idx + 1:04d}"),
                    "group": group,
                    "x": round(math.cos(idx * 0.7 + t_idx) * 7 + t_idx * 2, 2),
                    "y": round(
                        math.sin(idx * 0.5 + t_idx) * 5
                        + (1.5 if group == "VPT" else -1),
                        2,
                    ),
                    "cluster": (
                        "regulated"
                        if group == "TD"
                        else (
                            "watchful"
                            if participant.get("qc_status") == "Review"
                            else "maturing"
                        )
                    ),
                    "timepoint": timepoint,
                    "outcomeScore": round(
                        62
                        + t_idx * 7
                        + (8 if group == "TD" else 0)
                        - (5 if participant.get("qc_status") == "Review" else 0),
                        1,
                    ),
                }
            )
    return _api_list(rows, payload)


def _v2_model_leaderboard() -> dict[str, Any]:
    payload = _dashboard_payload()
    models = payload.get("ml_performance", {}).get("models") or []
    rows = [
        {
            "modelId": str(model.get("slug") or model.get("name") or "model")
            .replace(" ", "_")
            .lower(),
            "name": str(model.get("name") or "Model"),
            "auroc": float(model.get("auroc") or 0),
            "sensitivity": float(model.get("sensitivity") or 0),
            "specificity": float(model.get("specificity") or 0),
            "f1": float(model.get("f1") or 0),
            "calibration": round(0.04 + idx * 0.009, 3),
            "features": 24 + idx * 12,
            "updatedAt": payload.get("meta", {}).get("generated_at")
            or datetime.now().isoformat(timespec="seconds"),
        }
        for idx, model in enumerate(models)
        if isinstance(model, dict)
    ]
    return _api_list(rows, payload)


def _v2_model_detail(model_id: str) -> dict[str, Any]:
    rows = [
        {
            "modelId": model_id,
            "epoch": idx + 1,
            "trainAuroc": round(
                0.72 + idx * 0.025 + (0.04 if model_id == "cnn_lstm" else 0), 3
            ),
            "validationAuroc": round(
                0.70 + idx * 0.021 + (0.05 if model_id == "cnn_lstm" else 0), 3
            ),
            "ablation": ["no HDA", "no ECG", "no REDCap", "no thermal"][idx % 4],
            "ablationDelta": round(-0.018 - (idx % 4) * 0.011, 3),
        }
        for idx in range(8)
    ]
    return _api_list(rows)


def _v2_cascade_dag() -> dict[str, Any]:
    rows = [
        (
            "NICU stress physiology",
            "Autonomic regulation",
            "context",
            "physiology",
            0.78,
            "HRC + RSA coupling",
        ),
        (
            "Autonomic regulation",
            "Sustained attention",
            "physiology",
            "attention",
            0.72,
            "HDA phase stability",
        ),
        (
            "Caregiver co-regulation",
            "Sustained attention",
            "family",
            "attention",
            0.54,
            "home-study linkage",
        ),
        (
            "Sustained attention",
            "Social communication",
            "attention",
            "behavior",
            0.64,
            "CSBS + M-CHAT",
        ),
        (
            "Thermal stability",
            "Autonomic regulation",
            "physiology",
            "physiology",
            0.48,
            "central-peripheral gradient",
        ),
        (
            "Social communication",
            "Adaptive outcome",
            "behavior",
            "outcome",
            0.69,
            "Bayley + Vineland",
        ),
    ]
    return _api_list(
        [
            {
                "source": source,
                "target": target,
                "sourceDomain": source_domain,
                "targetDomain": target_domain,
                "weight": weight,
                "evidence": evidence,
            }
            for source, target, source_domain, target_domain, weight, evidence in rows
        ]
    )


def _v2_ecg_quality(nano_id: str) -> dict[str, Any]:
    artifacts = ["none", "none", "none", "ectopic", "motion", "noise", "flatline"]
    rows = []
    for idx in range(12 * 12):
        hour = idx // 12
        minute = (idx % 12) * 5
        artifact = artifacts[(idx * 5) % len(artifacts)]
        sqi = (
            0.78 + ((idx * 3) % 18) / 100
            if artifact == "none"
            else 0.35 + ((idx * 7) % 27) / 100
        )
        rows.append(
            {
                "nanoId": nano_id,
                "hour": hour,
                "minute": minute,
                "sqi": round(min(0.98, sqi), 2),
                "artifactType": artifact,
                "pass": artifact == "none" or sqi >= 0.7,
                "lead": "Actiheart-5 ch I",
            }
        )
    return _api_list(rows, participant_count=1, source="live")


def _v2_ecg_quality_summary() -> dict[str, Any]:
    return _api_list(
        [
            {"label": "ECG QC pass rate", "value": 92.4, "target": 90, "status": "ok"},
            {
                "label": "Artifact review queue",
                "value": 18,
                "target": 24,
                "status": "ok",
            },
            {"label": "Late transfers", "value": 4, "target": 0, "status": "watch"},
            {
                "label": "NDA-ready windows",
                "value": 88.6,
                "target": 95,
                "status": "watch",
            },
        ]
    )


def _wave(
    length: int, base: float, amp: float, period: float, phase: float = 0.0
) -> list[float]:
    return [
        round(
            base
            + math.sin(i / period + phase) * amp
            + math.cos(i / (period * 0.47) + phase) * amp * 0.28,
            3,
        )
        for i in range(length)
    ]


def _v2_dyad_coregulation(nano_id: str, visit_age_raw: str) -> dict[str, Any]:
    del nano_id
    visit_age = _visit_age(visit_age_raw)
    length = 210
    caregiver_rsa = _wave(length, 4.7 + visit_age * 0.015, 0.23, 9, 0.4)
    infant_rsa = [
        round(v - 0.42 + math.sin((i - 5) / 10) * 0.18 + math.cos(i / 17) * 0.08, 3)
        for i, v in enumerate(caregiver_rsa)
    ]
    caregiver_hp = _wave(length, 470, 24, 11, 0.8)
    infant_hp = [
        round(v - 42 + math.sin((i - 4) / 8) * 18, 2)
        for i, v in enumerate(caregiver_hp)
    ]
    phases = ["orienting", "sustained", "sustained", "inattention", "termination"]
    return {
        "fs": 1,
        "caregiver": {"rsa": caregiver_rsa, "heartPeriod": caregiver_hp},
        "infant": {
            "rsa": infant_rsa,
            "heartPeriod": infant_hp,
            "hdaPhase": [phases[(i // 38) % len(phases)] for i in range(length)],
        },
        "events": [
            {"onset": 42, "type": "arousal_spike"},
            {"onset": 96, "type": "still_face"},
            {"onset": 138, "type": "reunion"},
            {"onset": 172, "type": "arousal_spike"},
        ],
        "groupContext": [
            {"group": "ASIB", "synchronyIndex": 0.49, "leadLagSec": 3.2},
            {"group": "TD", "synchronyIndex": 0.61, "leadLagSec": 4.6},
            {"group": "VPT", "synchronyIndex": 0.44, "leadLagSec": 2.1},
        ],
    }


def _v2_multimodal(nano_id: str, visit_age_raw: str) -> dict[str, Any]:
    del nano_id
    visit_age = _visit_age(visit_age_raw)
    duration = 210
    ecg_t: list[float] = []
    ecg_mv: list[float] = []
    r_peaks: list[float] = []
    next_peak = 0.74
    for idx in range(duration * 4 + 1):
        t = round(idx / 4, 2)
        if t >= next_peak:
            r_peaks.append(round(next_peak, 2))
            next_peak += 0.72 + math.sin(t / 13) * 0.05
        recent = r_peaks[-2:]
        peak_distance = min([abs(t - peak) for peak in recent], default=2)
        qrs = (
            1.05 * math.exp(-((peak_distance / 0.035) ** 2))
            if peak_distance < 0.08
            else 0
        )
        ecg_t.append(t)
        ecg_mv.append(
            round(math.sin(t * 8.5) * 0.08 + math.sin(t * 1.7) * 0.04 + qrs - 0.18, 3)
        )
    rsa_t = list(range(duration + 1))
    rsa_power = []
    for t in rsa_t:
        social_boost = 48 if 52 < t < 82 else 64 if 128 < t < 164 else 0
        rsa_power.append(
            round(
                52
                + visit_age * 1.7
                + math.sin(t / 10) * 18
                + math.cos(t / 23) * 9
                + social_boost,
                2,
            )
        )
    return {
        "ecg": {"t": ecg_t, "mv": ecg_mv, "rPeaks": r_peaks},
        "rsa": {"t": rsa_t, "hfPower": rsa_power},
        "hda": {
            "epochs": [
                {"start": 0, "end": 24, "phase": "orienting"},
                {"start": 24, "end": 86, "phase": "sustained"},
                {"start": 86, "end": 112, "phase": "inattention"},
                {"start": 112, "end": 170, "phase": "sustained"},
                {"start": 170, "end": 194, "phase": "termination"},
                {"start": 194, "end": 210, "phase": "orienting"},
            ]
        },
        "gaze": {
            "events": [
                {"t": 8, "target": "object", "duration": 16},
                {"t": 30, "target": "caregiver-face", "duration": 18},
                {"t": 54, "target": "caregiver-face", "duration": 24},
                {"t": 84, "target": "object", "duration": 28},
                {"t": 122, "target": "caregiver-face", "duration": 14},
                {"t": 142, "target": "caregiver-face", "duration": 24},
                {"t": 174, "target": "object", "duration": 22},
            ]
        },
    }


def _v2_phase_portrait(nano_id: str, visit_age_raw: str) -> dict[str, Any]:
    del nano_id
    visit_age = _visit_age(visit_age_raw)
    length = 240
    t = list(range(length))
    arousal = [
        round(
            0.52 + math.sin(i / 18) * 0.24 + math.cos(i / 7) * 0.08 + visit_age * 0.003,
            3,
        )
        for i in t
    ]
    attention = [
        round(
            0.54 + math.cos(i / 21) * 0.24 - math.sin(i / 9) * 0.07 + visit_age * 0.002,
            3,
        )
        for i in t
    ]
    return {
        "fs": 1,
        "arousal": arousal,
        "attention": attention,
        "t": t,
        "prototypes": [
            {
                "group": group,
                "points": [
                    {
                        "arousal": round(
                            0.48 + gi * 0.035 + math.sin(i / 9 + gi) * 0.16, 3
                        ),
                        "attention": round(
                            0.56 - gi * 0.018 + math.cos(i / 11 + gi) * 0.16, 3
                        ),
                    }
                    for i in range(60)
                ],
            }
            for gi, group in enumerate(["ASIB", "TD", "VPT"])
        ],
    }


def _v2_cva(nano_id: str, visit_age_raw: str) -> dict[str, Any]:
    del nano_id, visit_age_raw
    infant_targets = ["toy", "face", "toy", "away", "toy", "other", "face", "toy"]
    caregiver_targets = [
        "toy",
        "infant_face",
        "toy",
        "toy",
        "toy",
        "other",
        "infant_face",
        "toy",
    ]
    cursor = 0
    infant = []
    for idx, target in enumerate(infant_targets):
        start = cursor
        end = start + 18 + (idx % 3) * 7
        cursor = end
        infant.append(
            {
                "start": start,
                "end": end,
                "target": target,
                **({"toyId": f"toy-{idx % 3 + 1}"} if target == "toy" else {}),
            }
        )
    cursor = 0
    caregiver = []
    for idx, target in enumerate(caregiver_targets):
        start = cursor
        end = start + 20 + ((idx + 1) % 3) * 6
        cursor = end
        caregiver.append(
            {
                "start": start,
                "end": end,
                "target": target,
                **({"toyId": f"toy-{idx % 3 + 1}"} if target == "toy" else {}),
            }
        )
    return {
        "durationSec": 210,
        "infantGaze": infant,
        "caregiverGaze": caregiver,
        "faceAvailability": [
            {"start": 12, "end": 68},
            {"start": 92, "end": 132},
            {"start": 154, "end": 198},
        ],
        "scaffoldEvents": [
            {"t": 35, "type": "name"},
            {"t": 89, "type": "touch"},
            {"t": 148, "type": "position"},
        ],
    }


def _v2_hr_deceleration(group_filter: str, age_bin: str) -> dict[str, Any]:
    groups = ["ASIB", "TD", "VPT"] if group_filter == "all" else [group_filter]
    pre_sec = 6
    post_sec = 12
    fs = 2
    length = (pre_sec + post_sec) * fs + 1
    episodes = []
    for gi, group in enumerate(groups):
        for idx in range(18):
            depth = 5.2 if group == "TD" else 4.2 if group == "ASIB" else 5.8
            hr = []
            for sample in range(length):
                t = (sample - pre_sec * fs) / fs
                trough = -depth * math.exp(-(((t - 3.2 - gi * 0.3) / 3.1) ** 2))
                hr.append(
                    round(132 + gi * 3 + math.sin(sample / 4 + idx) * 1.3 + trough, 2)
                )
            episodes.append(
                {
                    "nanoid": f"NANO-{100 + gi * 30 + idx:04d}",
                    "group": _normalize_group(group),
                    "ageBin": age_bin,
                    "hr": hr,
                }
            )
    return {"preSec": pre_sec, "postSec": post_sec, "fs": fs, "episodes": episodes}


def _v2_stillface(nano_id: str, visit_age_raw: str) -> dict[str, Any]:
    del nano_id
    visit_age = _visit_age(visit_age_raw)
    phases = [
        {"name": "baseline", "startSec": 0, "endSec": 45},
        {"name": "play", "startSec": 45, "endSec": 105},
        {"name": "stillface", "startSec": 105, "endSec": 155},
        {"name": "reunion", "startSec": 155, "endSec": 215},
    ]
    rsa = []
    for i in range(216):
        phase_shift = (
            -0.42 if 105 <= i < 155 else 0.2 if i >= 155 else 0.16 if i >= 45 else 0
        )
        rsa.append(
            round(4.15 + visit_age * 0.018 + phase_shift + math.sin(i / 11) * 0.14, 3)
        )
    caregiver = [
        round(v + 0.28 + math.sin(i / 15) * 0.08, 3) for i, v in enumerate(rsa)
    ]
    return {"phases": phases, "rsa": rsa, "caregiverRsa": caregiver, "fs": 1}


def _v2_hda_transitions() -> dict[str, Any]:
    transitions = []
    for group in ["ASIB", "TD", "VPT"]:
        bypass = 0.34 if group == "ASIB" else 0.29 if group == "VPT" else 0.18
        sustained = 0.62 if group == "TD" else 0.48 if group == "VPT" else 0.43
        transitions.extend(
            [
                {
                    "group": group,
                    "ageBin": "6mo",
                    "from": "orienting",
                    "to": "sustained",
                    "probability": sustained,
                    "ci95": [round(sustained - 0.06, 2), round(sustained + 0.06, 2)],
                },
                {
                    "group": group,
                    "ageBin": "6mo",
                    "from": "orienting",
                    "to": "termination",
                    "probability": bypass,
                    "ci95": [round(bypass - 0.05, 2), round(bypass + 0.05, 2)],
                },
                {
                    "group": group,
                    "ageBin": "6mo",
                    "from": "sustained",
                    "to": "termination",
                    "probability": 0.22,
                    "ci95": [0.17, 0.27],
                },
                {
                    "group": group,
                    "ageBin": "6mo",
                    "from": "sustained",
                    "to": "inattention",
                    "probability": 0.16,
                    "ci95": [0.11, 0.21],
                },
            ]
        )
    cohort = (_dashboard_payload().get("cohort_table") or [])[:20]
    if not cohort:
        cohort = [
            {"nano_id": f"NANO-{100 + i:04d}", "group": ["VPT", "ASIB", "TD"][i % 3]}
            for i in range(20)
        ]
    per_participant = []
    for idx, participant in enumerate(cohort):
        group = _normalize_group(participant.get("group"))
        per_participant.append(
            {
                "nanoid": str(participant.get("nano_id") or f"NANO-{idx + 1:04d}"),
                "group": group,
                "ageBin": f"{[3, 6, 9, 12][idx % 4]}mo",
                "bypassIndex": round(
                    0.35
                    + (-0.16 if group == "TD" else 0.12 if group == "ASIB" else 0.02)
                    + math.sin(idx) * 0.07,
                    2,
                ),
                "sustainedDwellSec": round(
                    24
                    + (9 if group == "TD" else 0)
                    - (3 if group == "ASIB" else 0)
                    + math.cos(idx) * 4,
                    1,
                ),
            }
        )
    return {"transitions": transitions, "perParticipant": per_participant}


def _v2_passport(nano_id: str) -> dict[str, Any]:
    payload = _dashboard_payload()
    cohort = payload.get("cohort_table") or []
    participant = next((p for p in cohort if p.get("nano_id") == nano_id), None) or {}
    operations = _participant_operations_lookup(payload).get(nano_id)
    group = _normalize_group(participant.get("group") or "VPT")
    modalities = ["RSA", "HDA", "CVA", "Attachment", "Spatial", "Risk"]
    timeline = []
    for mi, modality in enumerate(modalities):
        for ai, age in enumerate([3, 6, 9, 12, 18, 24]):
            timeline.append(
                {
                    "ageMonths": age,
                    "modality": modality,
                    "metric": (
                        "model score"
                        if modality == "Risk"
                        else "sustained dwell" if modality == "HDA" else "summary z"
                    ),
                    "value": round(
                        0.42 + mi * 0.08 + ai * 0.035 + math.sin(ai + mi) * 0.05, 3
                    ),
                    "groupMean": round(0.5 + mi * 0.06 + ai * 0.025, 3),
                    "groupSd": 0.12,
                }
            )
    return {
        "group": group,
        "sex": (
            str(participant.get("sex") or "F")[:1]
            if str(participant.get("sex") or "F")[:1] in {"F", "M", "X"}
            else "F"
        ),
        "gestationalAge": float(
            participant.get("gestational_age") or participant.get("cga_wks") or 30.4
        ),
        "timeline": timeline,
        "milestones": [
            {"ageMonths": 3, "label": "baseline physiology"},
            {"ageMonths": 12, "label": "midpoint review"},
            {"ageMonths": 24, "label": "outcome prep"},
        ],
        **(
            {
                "nicu": {
                    "hrcSummary": "HRC summary available",
                    "thermalSummary": "Thermal gradient stable",
                }
            }
            if group == "VPT"
            else {}
        ),
        "outcome": {
            "adosCSS": 2 if group == "TD" else 4 if group == "ASIB" else 3,
            "ageMonths": 36,
        },
        "operations": operations,
    }


def _v2_archetypes(measure: str) -> dict[str, Any]:
    labels = ["steady regulators", "late gain", "variable recovery"]
    archetypes = []
    for idx, label in enumerate(labels):
        archetypes.append(
            {
                "id": idx + 1,
                "label": label,
                "meanCurve": [
                    {
                        "ageMonths": age,
                        "value": round(
                            0.42
                            + idx * 0.16
                            + ai * (0.035 + idx * 0.008)
                            + math.sin(ai + idx) * 0.03,
                            3,
                        ),
                    }
                    for ai, age in enumerate([3, 6, 9, 12, 18, 24])
                ],
                "band": [
                    {
                        "lo": round(0.34 + idx * 0.16 + ai * 0.03, 3),
                        "hi": round(0.52 + idx * 0.16 + ai * 0.04, 3),
                    }
                    for ai in range(6)
                ],
            }
        )
    cohort = (_dashboard_payload().get("cohort_table") or [])[:21]
    if not cohort:
        cohort = [
            {"nano_id": f"NANO-{100 + i:04d}", "group": ["VPT", "ASIB", "TD"][i % 3]}
            for i in range(21)
        ]
    return {
        "measure": measure,
        "archetypes": archetypes,
        "members": [
            {
                "nanoid": str(participant.get("nano_id") or f"NANO-{idx + 1:04d}"),
                "group": _normalize_group(participant.get("group")),
                "archetypeId": idx % 3 + 1,
                "posterior": round(0.58 + ((idx * 7) % 35) / 100, 2),
            }
            for idx, participant in enumerate(cohort)
        ],
    }


def _v2_cascade_paths() -> dict[str, Any]:
    return {
        "nodes": [
            {
                "id": "rsa_9mo",
                "label": "RSA at 9 Months CGA",
                "domain": "physiology",
                "group": "physiology",
                "manipulable": True,
            },
            {
                "id": "rsa_12mo",
                "label": "RSA at 12 Months CGA",
                "domain": "physiology",
                "group": "physiology",
                "manipulable": True,
            },
            {
                "id": "rmssd_3mo",
                "label": "RMSSD at 3 Months CGA",
                "domain": "physiology",
                "group": "physiology",
                "manipulable": True,
            },
            {
                "id": "hda_sustained_6mo",
                "label": "% Sustained Attention at 6mo",
                "domain": "attention",
                "group": "attention",
                "manipulable": True,
            },
            {
                "id": "hda_orienting_9mo",
                "label": "% Orienting at 9mo",
                "domain": "attention",
                "group": "attention",
                "manipulable": True,
            },
            {
                "id": "motor_sitting_6mo",
                "label": "Arms-Free Sitting by 6mo",
                "domain": "motor",
                "group": "motor",
                "manipulable": True,
            },
            {
                "id": "gaze_caregiver_9mo",
                "label": "% Gaze to Caregiver at 9mo",
                "domain": "social",
                "group": "social",
                "manipulable": True,
            },
            {
                "id": "language_csbs_12mo",
                "label": "CSBS Score at 12 Months",
                "domain": "language",
                "group": "language",
                "manipulable": True,
            },
            {
                "id": "outcome_36m",
                "label": "ASD Symptom Score at 36 Months",
                "domain": "outcome",
                "group": "outcome",
                "manipulable": False,
            },
        ],
        "paths": [
            {
                "from": "rmssd_3mo",
                "to": "hda_sustained_6mo",
                "beta": 0.31,
                "se": 0.07,
                "delta_beta": 0.08,
            },
            {
                "from": "rsa_9mo",
                "to": "gaze_caregiver_9mo",
                "beta": 0.29,
                "se": 0.08,
                "delta_beta": 0.18,
            },
            {
                "from": "hda_sustained_6mo",
                "to": "language_csbs_12mo",
                "beta": -0.24,
                "se": 0.09,
                "delta_beta": -0.17,
            },
            {
                "from": "hda_orienting_9mo",
                "to": "language_csbs_12mo",
                "beta": -0.18,
                "se": 0.07,
                "delta_beta": -0.04,
            },
            {
                "from": "motor_sitting_6mo",
                "to": "language_csbs_12mo",
                "beta": -0.16,
                "se": 0.06,
                "delta_beta": -0.05,
            },
            {
                "from": "gaze_caregiver_9mo",
                "to": "outcome_36m",
                "beta": -0.28,
                "se": 0.1,
                "delta_beta": -0.22,
            },
            {
                "from": "language_csbs_12mo",
                "to": "outcome_36m",
                "beta": -0.46,
                "se": 0.1,
                "delta_beta": -0.19,
            },
            {
                "from": "rsa_12mo",
                "to": "outcome_36m",
                "beta": 0.21,
                "se": 0.08,
                "delta_beta": 0.16,
            },
        ],
        "baseline": [
            {"nodeId": "rsa_9mo", "value": 0},
            {"nodeId": "rsa_12mo", "value": 0},
            {"nodeId": "rmssd_3mo", "value": 0},
            {"nodeId": "hda_sustained_6mo", "value": 0},
            {"nodeId": "outcome_36m", "value": 0},
        ],
        "cohort_diffs": {
            "rsa_9mo:gaze_caregiver_9mo": {"delta_beta": 0.18},
            "hda_sustained_6mo:language_csbs_12mo": {"delta_beta": -0.17},
            "gaze_caregiver_9mo:outcome_36m": {"delta_beta": -0.22},
            "language_csbs_12mo:outcome_36m": {"delta_beta": -0.19},
        },
        "fit": {"rmsea": 0.047, "cfi": 0.94},
    }


def _v2_eco_validity() -> dict[str, Any]:
    return {
        "arms": ["lab", "home"],
        "behavior": [
            {
                "metric": "negative reactivity",
                "lab": 0.58,
                "home": 0.49,
                "test": "Welch t",
                "p": 0.04,
            },
            {
                "metric": "engagement score",
                "lab": 0.62,
                "home": 0.71,
                "test": "Welch t",
                "p": 0.03,
            },
        ],
        "quality": [
            {"metric": "valid ECG", "lab": 87.4, "home": 84.2},
            {"metric": "valid behavior video", "lab": 92.1, "home": 89.7},
            {"metric": "complete forms", "lab": 95.3, "home": 93.8},
        ],
        "representation": [
            {
                "metric": "BIPOC enrollment",
                "lab": 39.2,
                "home": 47.1,
                "localReference": 43.5,
            },
            {
                "metric": "rural households",
                "lab": 14.4,
                "home": 24.8,
                "localReference": 22.1,
            },
            {"metric": "median round-trip miles", "lab": 42, "home": 18},
        ],
    }


def _v2_stream_coverage(nano_id: str, visit_age_raw: str) -> dict[str, Any]:
    del nano_id, visit_age_raw
    return {
        "durationSec": 240,
        "streams": [
            {
                "name": "ecg_infant",
                "valid": [
                    {"start": 0, "end": 74},
                    {"start": 86, "end": 168},
                    {"start": 181, "end": 240},
                ],
            },
            {
                "name": "ecg_caregiver",
                "valid": [{"start": 0, "end": 112}, {"start": 120, "end": 240}],
            },
            {"name": "audio", "valid": [{"start": 4, "end": 240}]},
            {
                "name": "video",
                "valid": [{"start": 0, "end": 92}, {"start": 101, "end": 240}],
            },
            {"name": "markers", "valid": [{"start": 0, "end": 240}]},
        ],
        "syncOffsetsMs": [
            {"pair": "ecg_infant · markers", "offsetMs": 12},
            {"pair": "ecg_caregiver · markers", "offsetMs": -18},
            {"pair": "video · audio", "offsetMs": 34},
        ],
    }


def ensure_public_spa_build() -> None:
    """Build the React SPA used by the public Pages site for local runtime use."""
    reuse_existing = os.getenv(
        "DASHBOARD_REUSE_EXISTING_SPA_BUILD", ""
    ).strip().lower() in {
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
        raise RuntimeError(
            f"built SPA missing expected entrypoint: {SPA_BUILD_DIR / 'index.html'}"
        )


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
            else:
                lab_readings_code = self._run_pipeline_command(
                    PROJECT_ROOT / "scripts" / "build_lab_readings_index.py",
                    [
                        "--input",
                        str(DATA_DIR / "readings_data.json"),
                        "--output",
                        str(LAB_READINGS_OUTPUT_PATH),
                        "--pdf-dir",
                        str(self.readings_dir),
                    ],
                )
                if lab_readings_code != 0:
                    errors.append(
                        f"lab readings build exited with code {lab_readings_code}"
                    )
        except Exception as exc:  # pragma: no cover - runtime hardening path
            logger.exception("Unexpected rebuild failure")
            errors.append(f"unexpected rebuild failure: {exc}")

        if not (DATA_DIR / "dashboard_data.json").exists():
            errors.append("dashboard_data.json was not created")
        if not (DATA_DIR / "readings_data.json").exists():
            errors.append("readings_data.json was not created")
        if not LAB_READINGS_OUTPUT_PATH.exists():
            errors.append("lab-readings.json was not created")

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

        count = int(
            conn.execute("SELECT COUNT(*) FROM presentation_jobs").fetchone()[0]
        )
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

        count = int(
            conn.execute("SELECT COUNT(*) FROM presentation_jobs").fetchone()[0]
        )
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
                    "Queued — waiting for the assistant provider.",
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
                    progress_message = 'Queued — waiting for the assistant provider.'
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

    def complete_success(
        self, job_id: str, worker_id: str, result: dict[str, Any]
    ) -> None:
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

    def _get(
        self, job_id: str, *, release_stale: bool = False
    ) -> dict[str, Any] | None:
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
            return int(
                conn.execute("SELECT COUNT(*) FROM presentation_jobs").fetchone()[0]
            )

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
                "The assistant stayed busy too long. Please try again in a moment.",
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
    """Serve public dashboard assets and APIs without exposing repository files."""

    def __init__(
        self,
        *args: Any,
        runtime: DashboardRuntime,
        assistant: DashboardChatAssistant,
        jobs: PresentationJobStore,
        directory: str,
        buddy: NanoBuddyAssistant | None = None,
        **kwargs: Any,
    ) -> None:
        self.runtime = runtime
        self.assistant = assistant
        self.buddy = buddy
        self.jobs = jobs
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self) -> None:
        request_path = urlparse(self.path).path
        query = parse_qs(urlparse(self.path).query)

        if self._redirect_legacy_dashboard(request_path):
            return

        if request_path == "/api/healthz":
            payload = self.runtime.read_state()
            k8s_config = PipelineConfig.from_env()
            if k8s_config.k8s_mode_enabled or k8s_config.cluster_visualization_enabled:
                pipeline = pipeline_status_payload(k8s_config)
                payload = {
                    **payload,
                    "kubernetes": {
                        "mode": k8s_config.mode_label,
                        "namespace": k8s_config.k8s_namespace,
                        "pipeline_state": pipeline.get("state"),
                        "last_event_id": (
                            pipeline.get("last_success", {}).get("event_id")
                            if isinstance(pipeline.get("last_success"), dict)
                            else pipeline.get("last_event_id")
                        ),
                    },
                }
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

        if request_path == "/api/buddy":
            self._send_json(self._buddy().get_status())
            return

        if request_path == "/api/study/summary":
            self._send_json(_legacy_study_summary())
            return

        if request_path == "/api/pipeline/stages":
            self._send_json(_legacy_stage_rows())
            return

        if request_path == "/api/runs":
            limit = int((query.get("limit") or [20])[0] or 20)
            self._send_json(_legacy_runs(limit))
            return

        if request_path == "/api/participants":
            self._send_json(_legacy_participants())
            return

        if request_path.startswith("/api/participants/"):
            participant_id = request_path[len("/api/participants/") :].strip("/")
            participant = _legacy_participant_detail(unquote(participant_id))
            if participant is None:
                self._send_json(
                    {"error": "Participant not found"},
                    status=HTTPStatus.NOT_FOUND,
                )
                return
            self._send_json(participant)
            return

        if request_path.startswith("/api/visits/") and request_path.endswith("/epochs"):
            visit_id = request_path[len("/api/visits/") : -len("/epochs")].strip("/")
            self._send_json(_legacy_epochs_for_visit(unquote(visit_id)))
            return

        if request_path == "/api/results/trajectory":
            metric = (query.get("metric") or ["rmssd"])[0]
            self._send_json(_legacy_trajectory(metric))
            return

        if request_path == "/api/results/hda":
            self._send_json(_legacy_hda_distribution())
            return

        if request_path == "/api/redcap/events":
            self._send_json(_legacy_redcap_events())
            return

        if request_path == "/api/matlab/integration":
            self._send_json(_legacy_matlab_integration())
            return

        if request_path == "/api/assistant/status":
            self._send_json(self._assistant_status_payload())
            return

        if request_path == "/api/ops":
            self._send_json(_redcap_ops_payload())
            return

        if request_path == "/api/controls":
            self._send_json(_dashboard_controls_payload())
            return

        if request_path == "/api/assistant/freshness":
            config = PipelineConfig.from_env()
            self._send_json(
                assistant_freshness_payload(
                    config,
                    assistant_status=self.assistant.get_status(),
                )
            )
            return

        if request_path == "/api/cluster/topology":
            self._send_json(cluster_topology_payload(PipelineConfig.from_env()))
            return

        if request_path == "/api/cluster/pipeline":
            self._send_json(pipeline_status_payload(PipelineConfig.from_env()))
            return

        if request_path == "/api/readings/freshness":
            self._send_json(readings_freshness_payload(PipelineConfig.from_env()))
            return

        if request_path == "/api/readings/library":
            self._send_json(self._readings_library_payload())
            return

        if request_path == "/api/admin/capabilities":
            self._send_json(data_features.admin_capabilities())
            return

        if request_path == "/api/publications/tags":
            self._send_json(data_features.publication_tags())
            return

        if request_path == "/api/publications/sync/status":
            self._send_json(data_features.get_sync_status())
            return

        if request_path == "/api/publications":
            self._send_json(
                data_features.list_publications(data_features.parse_query_params(query))
            )
            return

        if request_path.startswith("/api/publications/"):
            identifier = request_path[len("/api/publications/") :].strip("/")
            publication = data_features.get_publication(unquote(identifier))
            if publication is None:
                self._send_json(
                    {"error": "Publication not found"},
                    status=HTTPStatus.NOT_FOUND,
                )
                return
            self._send_json(publication)
            return

        if request_path.startswith("/api/changelog/diff/"):
            change_id = request_path[len("/api/changelog/diff/") :].strip("/")
            entry = data_features.changelog_diff(change_id)
            if entry is None:
                self._send_json(
                    {"error": "Change entry not found"},
                    status=HTTPStatus.NOT_FOUND,
                )
                return
            self._send_json(entry)
            return

        if request_path.startswith("/api/changelog/"):
            parts = request_path[len("/api/changelog/") :].strip("/").split("/")
            if len(parts) == 2:
                self._send_json(
                    data_features.entity_history(
                        unquote(parts[0]),
                        unquote(parts[1]),
                    )
                )
                return

        if request_path == "/api/changelog":
            query = parse_qs(urlparse(self.path).query)
            self._send_json(
                data_features.list_changelog(data_features.parse_query_params(query))
            )
            return

        if request_path.startswith("/api/snapshots/") and request_path.endswith(
            "/export"
        ):
            tag = request_path[len("/api/snapshots/") : -len("/export")].strip("/")
            payload = data_features.export_snapshot(
                unquote(tag),
                _dashboard_payload(),
            )
            if payload is None:
                self._send_json(
                    {"error": "Snapshot not found"},
                    status=HTTPStatus.NOT_FOUND,
                )
                return
            self._send_json(payload)
            return

        if request_path == "/api/snapshots":
            self._send_json(data_features.list_snapshots())
            return

        if request_path.startswith("/api/v2/"):
            self._handle_v2_api(request_path)
            return

        if request_path.startswith("/api/presentation/jobs/"):
            job_id = request_path[len("/api/presentation/jobs/") :].strip("/")
            if job_id:
                self._handle_get_presentation_job(job_id)
                return

        super().do_GET()

    def do_HEAD(self) -> None:
        request_path = urlparse(self.path).path
        if self._redirect_legacy_dashboard(request_path):
            return
        if request_path == "/api/buddy":
            body = json.dumps(self._buddy().get_status(), indent=2).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        super().do_HEAD()

    def do_POST(self) -> None:
        request_path = urlparse(self.path).path
        if self._reject_oversized_body():
            return
        if (
            request_path == "/api/buddy"
            and self.headers.get("Origin")
            and not self._allowed_cors_origin()
        ):
            self._send_json(
                {"error": "Origin is not allowed"},
                status=HTTPStatus.FORBIDDEN,
            )
            return
        if _mutation_requires_operator("POST", request_path) and not (
            _operator_authorized(self.headers)
        ):
            self._send_json(
                {"error": "Operator token required"},
                status=HTTPStatus.FORBIDDEN,
            )
            return
        if request_path in ASSISTANT_RATE_LIMIT_PATHS:
            allowed, retry_after = ASSISTANT_RATE_LIMITER.allow(
                self._client_rate_limit_key()
            )
            if not allowed:
                self._send_json(
                    {
                        "error": "Assistant request limit reached. Please try again shortly.",
                        "status": "rate-limited",
                    },
                    status=HTTPStatus.TOO_MANY_REQUESTS,
                    headers={"Retry-After": str(retry_after)},
                )
                return
        if request_path == "/api/audit":
            allowed, retry_after = AUDIT_RATE_LIMITER.allow(
                self._client_rate_limit_key()
            )
            if not allowed:
                self._send_json(
                    {
                        "error": "Audit request limit reached. Please try again shortly.",
                        "status": "rate-limited",
                    },
                    status=HTTPStatus.TOO_MANY_REQUESTS,
                    headers={"Retry-After": str(retry_after)},
                )
                return
        if request_path == "/api/assistant/chat":
            self._handle_stream_chat()
            return

        if request_path == "/api/buddy":
            self._handle_buddy()
            return

        if request_path == "/api/table/query":
            self._handle_table_query()
            return

        if request_path == "/api/publications/sync/trigger":
            self._send_json(data_features.sync_publications())
            return

        if request_path == "/api/snapshots":
            self._handle_create_snapshot()
            return

        if request_path == "/api/controls":
            self._handle_update_controls()
            return

        if request_path == "/api/redcap/writeback":
            self._handle_redcap_writeback()
            return

        if request_path == "/api/v2/redcap-visit-entry":
            self._handle_redcap_visit_entry()
            return

        if request_path == "/api/audit":
            self._handle_audit()
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
            message = payload.get("message")
            history = payload.get("history")
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
                {"error": "Unexpected chat failure. Please try again."},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def do_PATCH(self) -> None:
        request_path = urlparse(self.path).path
        if self._reject_oversized_body():
            return
        if _mutation_requires_operator("PATCH", request_path) and not (
            _operator_authorized(self.headers)
        ):
            self._send_json(
                {"error": "Operator token required"},
                status=HTTPStatus.FORBIDDEN,
            )
            return
        if request_path.startswith("/api/visits/") and "/epochs/" in request_path:
            parts = request_path[len("/api/visits/") :].strip("/").split("/")
            if len(parts) == 3 and parts[1] == "epochs":
                try:
                    payload = self._read_json_body()
                    decision = str(payload.get("decision") or "").strip()
                    if decision not in {"auto", "accept", "reject"}:
                        self._send_json(
                            {"error": "decision must be one of auto, accept, reject"},
                            status=HTTPStatus.BAD_REQUEST,
                        )
                        return
                    updated = _legacy_update_epoch_decision(
                        unquote(parts[0]), int(parts[2]), decision
                    )
                    if updated is None:
                        self._send_json(
                            {"error": "Epoch not found"},
                            status=HTTPStatus.NOT_FOUND,
                        )
                        return
                    self._send_json(updated)
                except ValueError as exc:
                    self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
                return
        if request_path.startswith("/api/publications/") and request_path.endswith(
            "/tags"
        ):
            identifier = request_path[len("/api/publications/") : -len("/tags")].strip(
                "/"
            )
            self._handle_update_publication_tags(unquote(identifier))
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Unknown API endpoint")

    def translate_path(self, path: str) -> str:
        try:
            decoded_path = unquote(urlparse(path).path, errors="strict")
        except UnicodeDecodeError:
            return str(SPA_BUILD_DIR / "__not_found__")
        if "\x00" in decoded_path:
            return str(SPA_BUILD_DIR / "__not_found__")

        # Decode once, then normalize URL separators and dot segments before
        # consulting any allowlist. This keeps encoded reading filenames usable
        # while ensuring aliases such as /dashboard//data/... cannot fall
        # through to a stale copy bundled in the SPA build.
        parsed_path = posixpath.normpath("/" + decoded_path.lstrip("/"))
        spa_root = SPA_BUILD_DIR.resolve()
        if is_spa_route(parsed_path):
            spa_index = (spa_root / "index.html").resolve()
            if spa_index.is_relative_to(spa_root) and spa_index.is_file():
                return str(spa_index)
            return str(SPA_BUILD_DIR / "__not_found__")

        # Runtime data must win over the copy bundled by Vite so a successful
        # watcher rebuild is visible immediately on the live dashboard.
        runtime_data_path = PUBLIC_RUNTIME_DATA_ROUTES.get(parsed_path)
        if (
            runtime_data_path is not None
            and not runtime_data_path.is_symlink()
            and runtime_data_path.is_file()
        ):
            return str(runtime_data_path)

        # Dotfiles and dot-directories must never be reachable through the
        # public tunnel, even if a similarly named file enters the build tree.
        segments = [segment for segment in parsed_path.split("/") if segment]
        if any(segment.startswith(".") for segment in segments):
            return str(SPA_BUILD_DIR / "__not_found__")

        spa_candidate = (spa_root / parsed_path.lstrip("/")).resolve()
        if spa_candidate.is_relative_to(spa_root) and spa_candidate.is_file():
            return str(spa_candidate)

        readings_prefix = "/esd-lab-readings/"
        if parsed_path.startswith(readings_prefix):
            readings_root = (PROJECT_ROOT / "esd-lab-readings").resolve()
            reading_candidate = (
                readings_root / parsed_path[len(readings_prefix) :]
            ).resolve()
            if (
                reading_candidate.is_file()
                and reading_candidate.is_relative_to(readings_root)
                and reading_candidate.suffix.lower() in PUBLIC_READING_SUFFIXES
            ):
                return str(reading_candidate)

        return str(SPA_BUILD_DIR / "__not_found__")

    def end_headers(self) -> None:
        request_path = urlparse(self.path).path
        if request_path.startswith("/api/"):
            allowed_origin = self._allowed_cors_origin()
            if allowed_origin:
                self.send_header("Access-Control-Allow-Origin", allowed_origin)
                self.send_header("Access-Control-Allow-Credentials", "true")
                self.send_header(
                    "Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS"
                )
                self.send_header(
                    "Access-Control-Allow-Headers",
                    "Content-Type, Accept, Authorization, X-Operator-Token",
                )
                self.send_header("Access-Control-Max-Age", "600")
            self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        request_path = urlparse(self.path).path
        if request_path.startswith("/api/"):
            if self.headers.get("Origin") and not self._allowed_cors_origin():
                self.send_error(HTTPStatus.FORBIDDEN, "Origin is not allowed")
                return
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return
        self.send_error(HTTPStatus.METHOD_NOT_ALLOWED, "OPTIONS not allowed")

    def log_message(self, format: str, *args: Any) -> None:
        logger.info("http | " + format, *args)

    def _read_json_body(
        self, *, max_bytes: int = MAX_REQUEST_BODY_BYTES
    ) -> dict[str, Any]:
        content_length = self.headers.get("Content-Length")
        if not content_length:
            raise ValueError("Missing request body.")
        try:
            length = int(content_length)
        except ValueError as exc:
            raise ValueError("Invalid Content-Length header.") from exc
        if length < 0:
            raise ValueError("Invalid Content-Length header.")
        if length > max_bytes:
            raise ValueError("Request body exceeds the configured size limit.")
        raw_body = self.rfile.read(length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("Request body must be valid JSON.") from exc
        if not isinstance(payload, dict):
            raise ValueError("Request body must be a JSON object.")
        return payload

    def _reject_oversized_body(self) -> bool:
        content_length = self.headers.get("Content-Length")
        if content_length is None:
            return False
        try:
            length = int(content_length)
        except ValueError:
            self._send_json(
                {"error": "Invalid Content-Length header."},
                status=HTTPStatus.BAD_REQUEST,
            )
            return True
        if length < 0:
            self._send_json(
                {"error": "Invalid Content-Length header."},
                status=HTTPStatus.BAD_REQUEST,
            )
            return True
        if length <= MAX_REQUEST_BODY_BYTES:
            return False
        self._send_json(
            {
                "error": "Request body exceeds the configured size limit.",
                "maxBytes": MAX_REQUEST_BODY_BYTES,
            },
            status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
        )
        return True

    def _allowed_cors_origin(self) -> str | None:
        origin = str(self.headers.get("Origin") or "").strip()
        if not origin:
            return None
        host = str(self.headers.get("Host") or "").strip()
        if _origin_allowed(origin, host, _configured_cors_origins()):
            return origin.rstrip("/")
        return None

    def _client_rate_limit_key(self) -> str:
        cloudflare_ip = str(self.headers.get("CF-Connecting-IP") or "").strip()
        if cloudflare_ip:
            try:
                parsed_cloudflare_ip = ipaddress.ip_address(cloudflare_ip)
            except ValueError:
                parsed_cloudflare_ip = None
            worker_zone = (
                str(self.headers.get(CLOUDFLARE_WORKER_ZONE_HEADER) or "")
                .strip()
                .lower()
                .rstrip(".")
            )
            if (
                parsed_cloudflare_ip == CLOUDFLARE_WORKER_EGRESS_IP
                and TRUSTED_CLOUDFLARE_WORKER_ZONE
                and worker_zone == TRUSTED_CLOUDFLARE_WORKER_ZONE
            ):
                original_ip = str(
                    self.headers.get(ORIGINAL_CLIENT_IP_HEADER) or ""
                ).strip()
                try:
                    parsed_original_ip = ipaddress.ip_address(original_ip)
                except ValueError:
                    parsed_original_ip = None
                if parsed_original_ip is not None:
                    return f"cf-original:{parsed_original_ip.compressed}"
            return f"cf:{cloudflare_ip}"
        return f"peer:{self.client_address[0]}"

    def _send_json(
        self,
        payload: Any,
        *,
        status: int | HTTPStatus = HTTPStatus.OK,
        headers: dict[str, str] | None = None,
    ) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def _buddy(self) -> NanoBuddyAssistant:
        if self.buddy is None:
            self.buddy = NanoBuddyAssistant(self.assistant)
        return self.buddy

    def _handle_buddy(self) -> None:
        content_type = str(self.headers.get("Content-Type") or "")
        if content_type.split(";", 1)[0].strip().casefold() != "application/json":
            self._send_json(
                {"error": "Buddy requests require Content-Type: application/json."},
                status=HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
            )
            return
        try:
            payload = self._read_json_body(max_bytes=BUDDY_MAX_REQUEST_BODY_BYTES)
            result = self._buddy().answer(
                payload.get("message"), context=payload.get("context")
            )
            self._send_json(result)
        except BuddyRequestError as exc:
            self._send_json({"error": str(exc)}, status=exc.http_status)
        except ValueError as exc:
            status = (
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE
                if "size limit" in str(exc).casefold()
                else HTTPStatus.BAD_REQUEST
            )
            self._send_json({"error": str(exc)}, status=status)
        except Exception:  # pragma: no cover - defensive API path
            logger.exception("Buddy request failed")
            self._send_json(
                {
                    "answer": (
                        "Buddy is temporarily offline, but dashboard metrics remain available."
                    ),
                    "citations": [],
                    "used_metrics": [],
                    "refused": False,
                },
                status=HTTPStatus.SERVICE_UNAVAILABLE,
            )

    def _handle_table_query(self) -> None:
        try:
            payload = self._read_json_body()
            self._send_json(
                data_features.query_virtual_table(payload, _dashboard_payload())
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - defensive endpoint path
            logger.exception("Table query failed")
            self._send_json(
                {"error": f"Unexpected table query failure: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def _handle_create_snapshot(self) -> None:
        try:
            payload = self._read_json_body()
            tag = str(payload.get("tag") or "").strip()
            description = str(payload.get("description") or "").strip()
            if not data_features.is_safe_snapshot_tag(tag):
                self._send_json(
                    {"error": "Snapshot tag must be a lowercase slug."},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return
            self._send_json(
                data_features.create_snapshot(
                    tag,
                    description,
                    payload=_dashboard_payload(),
                ),
                status=HTTPStatus.CREATED,
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - defensive endpoint path
            logger.exception("Snapshot creation failed")
            self._send_json(
                {"error": f"Unexpected snapshot failure: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def _handle_redcap_visit_entry(self) -> None:
        try:
            payload = self._read_json_body()
            record_id = str(payload.get("recordId") or "").strip()
            event_name = str(payload.get("eventName") or "").strip()
            visit_date = str(payload.get("visitDate") or "").strip()
            allowed_events = {item["eventName"] for item in _redcap_visit_options()}
            if not record_id:
                self._send_json(
                    {"error": "recordId is required"}, status=HTTPStatus.BAD_REQUEST
                )
                return
            if event_name not in allowed_events:
                self._send_json(
                    {"error": "eventName is not configured for visit entry"},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return
            try:
                datetime.strptime(visit_date, "%Y-%m-%d")
            except ValueError:
                self._send_json(
                    {"error": "visitDate must use YYYY-MM-DD"},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return
            self._send_json(
                _import_redcap_visit_date(
                    record_id=record_id,
                    event_name=event_name,
                    visit_date=visit_date,
                )
            )
        except EnvironmentError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.SERVICE_UNAVAILABLE)
        except requests.RequestException as exc:
            logger.warning("REDCap visit-date import failed: %s", exc)
            self._send_json(
                {
                    "error": "REDCap import failed; check backend logs and token import rights."
                },
                status=HTTPStatus.BAD_GATEWAY,
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - defensive endpoint path
            logger.exception("REDCap visit-date entry failed")
            self._send_json(
                {"error": f"Unexpected visit entry failure: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def _handle_update_controls(self) -> None:
        try:
            if not _operator_authorized(self.headers):
                self._send_json(
                    {"error": "Operator token required"}, status=HTTPStatus.FORBIDDEN
                )
                return
            payload = self._read_json_body()
            controls = _write_dashboard_controls(payload)
            self._send_json({"ok": True, "controls": controls})
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - defensive endpoint path
            logger.exception("Dashboard controls update failed")
            self._send_json(
                {"error": f"Unexpected controls failure: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def _handle_redcap_writeback(self) -> None:
        try:
            if not _redcap_writeback_enabled():
                self._send_json(
                    {"error": "REDCap writeback is disabled"},
                    status=HTTPStatus.FORBIDDEN,
                )
                return
            if not _operator_authorized(self.headers):
                self._send_json(
                    {"error": "Operator token required"}, status=HTTPStatus.FORBIDDEN
                )
                return
            payload = self._read_json_body()
            record_id = str(payload.get("recordId") or "").strip()
            event_name = str(
                payload.get("event") or payload.get("eventName") or ""
            ).strip()
            field = str(payload.get("field") or "").strip()
            value = str(payload.get("value") or "").strip()
            reason = str(payload.get("reason") or "").strip()
            confirmed = (
                payload.get("confirm") is True
                or str(payload.get("confirmToken") or "") == "WRITEBACK"
            )
            allowed_events = {item["eventName"] for item in _redcap_visit_options()}
            allowed_fields = _allowed_redcap_writeback_fields()

            if not confirmed:
                self._send_json(
                    {"error": "Explicit confirmation is required"},
                    status=HTTPStatus.FORBIDDEN,
                )
                return
            if not record_id:
                self._send_json(
                    {"error": "recordId is required"}, status=HTTPStatus.BAD_REQUEST
                )
                return
            if event_name not in allowed_events:
                self._send_json(
                    {"error": "event is not configured for REDCap writeback"},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return
            if field not in allowed_fields:
                self._send_json(
                    {"error": "field is not allowlisted for REDCap writeback"},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return
            if not _validate_redcap_writeback_value(field, value):
                self._send_json(
                    {
                        "error": "value is invalid for the requested REDCap writeback field"
                    },
                    status=HTTPStatus.BAD_REQUEST,
                )
                return
            if not reason:
                self._send_json(
                    {"error": "reason is required for the audit trail"},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return

            result = _import_redcap_field_value(
                record_id=record_id,
                event_name=event_name,
                field=field,
                value=value,
            )
            audit_id = f"redcap-writeback-{uuid.uuid4().hex[:12]}"
            audit_entry = {
                "audit_id": audit_id,
                "ts": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
                "recordId": record_id,
                "event": event_name,
                "field": field,
                "newValue": value,
                "reason": reason,
                "success": bool(result.get("success")),
            }
            _append_redcap_writeback_audit(audit_entry)
            _trigger_pages_deploy_hook("redcap-writeback", audit_id)
            self._send_json(
                {**result, "ok": bool(result.get("success")), "auditId": audit_id}
            )
        except EnvironmentError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.SERVICE_UNAVAILABLE)
        except requests.RequestException as exc:
            logger.warning("REDCap writeback failed: %s", exc)
            self._send_json(
                {
                    "error": "REDCap writeback failed; check backend logs and import rights."
                },
                status=HTTPStatus.BAD_GATEWAY,
            )
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - defensive endpoint path
            logger.exception("REDCap writeback failed")
            self._send_json(
                {"error": f"Unexpected writeback failure: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def _handle_update_publication_tags(self, identifier: str) -> None:
        try:
            payload = self._read_json_body()
            raw_tags = payload.get("tags") or []
            if not isinstance(raw_tags, list):
                self._send_json(
                    {"error": "tags must be an array"},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return
            publication = data_features.update_publication_tags(
                identifier,
                [str(tag) for tag in raw_tags],
            )
            if publication is None:
                self._send_json(
                    {"error": "Publication not found"},
                    status=HTTPStatus.NOT_FOUND,
                )
                return
            self._send_json(publication)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - defensive endpoint path
            logger.exception("Publication tag update failed")
            self._send_json(
                {"error": f"Unexpected tag update failure: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )

    def _handle_audit(self) -> None:
        try:
            payload = _validated_audit_payload(self._read_json_body())
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            with AUDIT_LOG_LOCK:
                AUDIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
                with AUDIT_LOG_PATH.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(payload, sort_keys=True) + "\n")
        except Exception as exc:  # pragma: no cover - best effort audit path
            logger.warning("Audit write failed: %s", exc)
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def _assistant_status_payload(self) -> dict[str, Any]:
        payload = self.assistant.get_status()
        provider_state = str(payload.get("state") or "degraded")
        if provider_state == "ready" and payload.get("ready"):
            status = "ready"
            error = None
        elif provider_state in {"disabled", "credentials-missing", "unloaded"}:
            status = "unloaded"
            error = payload.get("message")
        else:
            status = "error"
            error = payload.get("last_error") or payload.get("message")

        config = PipelineConfig.from_env()
        status_payload = {
            "status": status,
            "state": provider_state,
            "error": error,
            "provider": payload.get("provider"),
            "model": payload.get("model_id"),
            "model_tier": payload.get("model_tier"),
            "model_label": payload.get("model_label"),
            "model_license": payload.get("model_license"),
            "runtime": payload.get("runtime"),
        }

        # Publish which provider tier is answering and how much failover is left.
        # Endpoints and credentials are deliberately excluded; only the
        # operator-facing "provider:model" label and readiness cross the boundary.
        fallback = payload.get("fallback")
        if isinstance(fallback, dict):
            status_payload["providers"] = {
                "enabled": bool(fallback.get("enabled")),
                "tiers": fallback.get("tiers"),
                "ready_tiers": fallback.get("ready_tiers"),
                "active_tier": fallback.get("active_tier"),
                "active_tier_label": fallback.get("active_tier_label"),
                "chain": [
                    {
                        "order": tier.get("order"),
                        "label": tier.get("label"),
                        "ready": bool(tier.get("ready")),
                    }
                    for tier in (fallback.get("chain") or [])
                    if isinstance(tier, dict)
                ],
            }

        if config.assistant_cluster_context_enabled:
            status_payload["freshness"] = assistant_freshness_payload(
                config,
                assistant_status=payload,
            )
            if isinstance(payload.get("freshness"), dict) and payload["freshness"].get(
                "redcap"
            ):
                status_payload["freshness"]["redcap"] = payload["freshness"]["redcap"]
        return status_payload

    def _readings_library_payload(self) -> dict[str, Any]:
        config = PipelineConfig.from_env()
        payload = read_optional_json(config.lab_readings_path)
        if payload:
            return {
                "schema": "readings_library.v1",
                "mode": config.mode_label,
                **payload,
            }

        readings_payload = read_optional_json(config.readings_data_path)
        readings = (
            readings_payload.get("readings") or readings_payload.get("featured") or []
        )
        summary = readings_payload.get("summary") or {}
        return {
            "schema": "readings_library.v1",
            "mode": config.mode_label,
            "generated_at": readings_payload.get("meta", {}).get("generated_at", ""),
            "summary": {
                "count": summary.get("total_readings", len(readings)),
                "total_pages": summary.get("total_pages", 0),
                "total_size_mb": summary.get("total_size_mb", 0),
            },
            "readings": [
                {
                    "id": item.get("id") or item.get("title") or "reading",
                    "title": item.get("title")
                    or item.get("display_name")
                    or "Untitled",
                    "year": item.get("year"),
                    "category": item.get("category") or "Other",
                    "source": item.get("source") or "",
                    "keywords": item.get("keywords") or [],
                    "abstract": item.get("excerpt") or "",
                    "page_count": item.get("page_count") or 0,
                    "size_mb": item.get("size_mb") or 0,
                    "href": item.get("relative_href") or "#",
                    "bucket": f"{item.get('category') or 'Other'} · {item.get('year') or 'n/a'}",
                }
                for item in readings
                if isinstance(item, dict)
            ],
        }

    def _handle_v2_api(self, request_path: str) -> None:
        query = parse_qs(urlparse(self.path).query)
        try:
            if request_path == "/api/v2/rsa-trajectories":
                age_basis = (query.get("age") or ["adjusted"])[0]
                self._send_json(_v2_rsa_trajectories(age_basis))
                return
            if request_path == "/api/v2/redcap-completeness":
                self._send_json(_v2_redcap_completeness())
                return
            if request_path == "/api/v2/redcap-visit-health":
                self._send_json(_v2_redcap_visit_health())
                return
            if request_path.startswith("/api/v2/redcap-visit-health/"):
                record_id = request_path[len("/api/v2/redcap-visit-health/") :].strip(
                    "/"
                )
                detail = _v2_redcap_visit_detail(record_id)
                if detail is None:
                    self._send_json(
                        {"error": "REDCap visit record not found"},
                        status=HTTPStatus.NOT_FOUND,
                    )
                    return
                self._send_json(detail)
                return
            if request_path == "/api/v2/redcap-missing-data":
                self._send_json(_v2_redcap_missing_data())
                return
            if request_path == "/api/v2/redcap-open":
                target = _redcap_app_url()
                if not target:
                    self._send_json(
                        {"error": "REDCap application URL is not configured"},
                        status=HTTPStatus.SERVICE_UNAVAILABLE,
                    )
                    return
                self.send_response(HTTPStatus.FOUND)
                self.send_header("Location", target)
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return
            if request_path == "/api/v2/cohort-swimmer":
                self._send_json(_v2_cohort_swimmer())
                return
            if request_path == "/api/v2/hda-composition":
                self._send_json(_v2_hda_composition())
                return
            if request_path == "/api/v2/attrition-funnel":
                self._send_json(_v2_attrition_funnel())
                return
            if request_path == "/api/v2/county-profiles":
                self._send_json(_v2_county_profiles())
                return
            if request_path == "/api/v2/sdoh-map":
                self._send_json(_v2_sdoh_map())
                return
            if request_path == "/api/v2/shap-values":
                self._send_json(_v2_shap_values())
                return
            if request_path == "/api/v2/cluster-tsne":
                self._send_json(_v2_cluster_tsne())
                return
            if request_path == "/api/v2/model-leaderboard":
                self._send_json(_v2_model_leaderboard())
                return
            if request_path.startswith("/api/v2/model-leaderboard/"):
                model_id = request_path[len("/api/v2/model-leaderboard/") :].strip("/")
                self._send_json(_v2_model_detail(model_id))
                return
            if request_path == "/api/v2/cascade-dag":
                self._send_json(_v2_cascade_dag())
                return
            if request_path == "/api/v2/ecg-quality-summary":
                self._send_json(_v2_ecg_quality_summary())
                return
            if request_path == "/api/v2/hr-deceleration":
                group = (query.get("group") or ["ASIB"])[0]
                age_bin = (query.get("ageBin") or ["6mo"])[0]
                self._send_json(_v2_hr_deceleration(group, age_bin))
                return
            if request_path == "/api/v2/hda-transitions":
                self._send_json(_v2_hda_transitions())
                return
            if request_path == "/api/v2/archetypes":
                measure = (query.get("measure") or ["rsa"])[0]
                self._send_json(_v2_archetypes(measure))
                return
            if request_path == "/api/v2/cascade-paths":
                self._send_json(_v2_cascade_paths())
                return
            if request_path == "/api/v2/eco-validity":
                self._send_json(_v2_eco_validity())
                return
            if request_path.startswith("/api/v2/multimodal/"):
                parts = request_path[len("/api/v2/multimodal/") :].strip("/").split("/")
                if len(parts) == 2:
                    self._send_json(_v2_multimodal(parts[0], parts[1]))
                    return
            if request_path.startswith("/api/v2/dyad/coregulation/"):
                parts = (
                    request_path[len("/api/v2/dyad/coregulation/") :]
                    .strip("/")
                    .split("/")
                )
                if len(parts) == 2:
                    self._send_json(_v2_dyad_coregulation(parts[0], parts[1]))
                    return
            if request_path.startswith("/api/v2/phase-portrait/"):
                parts = (
                    request_path[len("/api/v2/phase-portrait/") :].strip("/").split("/")
                )
                if len(parts) == 2:
                    self._send_json(_v2_phase_portrait(parts[0], parts[1]))
                    return
            if request_path.startswith("/api/v2/cva/"):
                parts = request_path[len("/api/v2/cva/") :].strip("/").split("/")
                if len(parts) == 2:
                    self._send_json(_v2_cva(parts[0], parts[1]))
                    return
            if request_path.startswith("/api/v2/stillface/"):
                parts = request_path[len("/api/v2/stillface/") :].strip("/").split("/")
                if len(parts) == 2:
                    self._send_json(_v2_stillface(parts[0], parts[1]))
                    return
            if request_path.startswith("/api/v2/passport/"):
                nano_id = request_path[len("/api/v2/passport/") :].strip("/")
                self._send_json(_v2_passport(nano_id))
                return
            if request_path.startswith("/api/v2/stream-coverage/"):
                parts = (
                    request_path[len("/api/v2/stream-coverage/") :]
                    .strip("/")
                    .split("/")
                )
                if len(parts) == 2:
                    self._send_json(_v2_stream_coverage(parts[0], parts[1]))
                    return
            if request_path.startswith("/api/v2/hda-session/"):
                parts = (
                    request_path[len("/api/v2/hda-session/") :].strip("/").split("/")
                )
                if len(parts) == 2:
                    self._send_json(_v2_hda_session(parts[0], parts[1]))
                    return
            if request_path.startswith("/api/v2/thermal-heatmap/"):
                nano_id = request_path[len("/api/v2/thermal-heatmap/") :].strip("/")
                self._send_json(_v2_thermal_heatmap(nano_id))
                return
            if request_path.startswith("/api/v2/ecg-quality/"):
                nano_id = request_path[len("/api/v2/ecg-quality/") :].strip("/")
                self._send_json(_v2_ecg_quality(nano_id))
                return
        except Exception as exc:  # pragma: no cover - defensive endpoint path
            logger.exception("v2 API request failed: %s", request_path)
            self._send_json(
                {"error": f"Unexpected v2 API failure: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )
            return

        self._send_json({"error": "Unknown API endpoint"}, status=HTTPStatus.NOT_FOUND)

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
            message = payload.get("message")
            history = payload.get("history")
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        if not ASSISTANT_CHAT_LOCK.acquire(
            timeout=ASSISTANT_REQUEST_QUEUE_TIMEOUT_SECONDS
        ):
            self._send_ndjson(
                [
                    {"error": ASSISTANT_QUEUE_TIMEOUT_MESSAGE},
                ]
            )
            return

        response_stream = None
        try:
            # ``DashboardChatAssistant.stream`` is a generator, so none of its
            # shared message/history validation runs until the first iteration.
            # Advance it once before committing a 200 response; malformed or
            # oversized input can then retain its stable HTTP error status.
            try:
                response_stream = iter(self.assistant.stream(message, history=history))
                first_delta = next(response_stream, None)
            except AssistantUnavailable as exc:
                self._send_json(
                    {"error": str(exc), "status": exc.status},
                    status=exc.http_status,
                )
                return
            except Exception as exc:  # pragma: no cover - defensive preflight path
                logger.exception("Streaming chat request failed before response")
                self._send_json(
                    {"error": "Unexpected chat failure."},
                    status=HTTPStatus.INTERNAL_SERVER_ERROR,
                )
                return

            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()

            if first_delta is not None:
                self.wfile.write(
                    json.dumps({"delta": first_delta}).encode("utf-8") + b"\n"
                )
                self.wfile.flush()
            for delta in response_stream:
                self.wfile.write(json.dumps({"delta": delta}).encode("utf-8") + b"\n")
                self.wfile.flush()
            self.wfile.write(json.dumps({"done": True}).encode("utf-8") + b"\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            # Browser cancellation is expected. Closing the iterator propagates
            # cancellation to the provider so the remote stream is closed and the
            # circuit breaker is not poisoned by a disconnected client.
            logger.debug("Streaming assistant client disconnected")
        except AssistantUnavailable as exc:
            try:
                self.wfile.write(
                    json.dumps({"error": str(exc)}).encode("utf-8") + b"\n"
                )
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
        except Exception as exc:  # pragma: no cover - defensive API path
            logger.exception("Streaming chat request failed")
            try:
                self.wfile.write(
                    json.dumps({"error": "Unexpected chat failure."}).encode("utf-8")
                    + b"\n"
                )
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
        finally:
            close_stream = getattr(response_stream, "close", None)
            if callable(close_stream):
                close_stream()
            ASSISTANT_CHAT_LOCK.release()

    def _handle_presentation_plan(self) -> None:
        """Generate a structured slide-deck plan via the assistant provider.

        Reuses the same provider and the shared request lock as the chat
        endpoint, but returns a single structured JSON deck plan rather than a
        free-form streamed reply. Errors mirror the operational style of the
        existing assistant endpoints and never leak raw model text.
        """
        try:
            concept, options = _validated_presentation_request(self._read_json_body())
        except PresentationConceptTooLong as exc:
            self._send_json(
                {
                    "error": str(exc),
                    "maxChars": PRESENTATION_MAX_CONCEPT_CHARS,
                },
                status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
            )
            return
        except ValueError as exc:
            self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return

        if not ASSISTANT_CHAT_LOCK.acquire(
            timeout=ASSISTANT_REQUEST_QUEUE_TIMEOUT_SECONDS
        ):
            self._send_json(
                {"error": ASSISTANT_QUEUE_TIMEOUT_MESSAGE},
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
                {"error": "Unexpected presentation failure. Please try again."},
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
            concept, options = _validated_presentation_request(self._read_json_body())
        except PresentationConceptTooLong as exc:
            self._send_json(
                {
                    "error": str(exc),
                    "maxChars": PRESENTATION_MAX_CONCEPT_CHARS,
                },
                status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
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
        default=PROJECT_ROOT / "esd-lab-readings",
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
    buddy = NanoBuddyAssistant(assistant)
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
        buddy=buddy,
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
