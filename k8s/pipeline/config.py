"""Configuration for the readings event pipeline.

The defaults keep the current local runtime unchanged. Kubernetes-specific
values are opt-in via environment variables and are intentionally represented as
plain strings/paths so Helm can wire them without code changes.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "dashboard" / "data"


def parse_bool(value: str | None, *, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_float(value: str | None, *, default: float) -> float:
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def parse_int(value: str | None, *, default: int) -> int:
    try:
        return int(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def resolve_path(value: str | None, default: Path) -> Path:
    raw = value.strip() if value else ""
    if not raw:
        return default
    path = Path(raw)
    return path if path.is_absolute() else PROJECT_ROOT / path


def default_namespace() -> str:
    namespace_path = Path("/var/run/secrets/kubernetes.io/serviceaccount/namespace")
    if namespace_path.exists():
        try:
            namespace = namespace_path.read_text(encoding="utf-8").strip()
            if namespace:
                return namespace
        except OSError:
            pass
    return "default"


@dataclass(frozen=True)
class PipelineConfig:
    project_root: Path
    data_dir: Path
    readings_watch_path: Path
    readings_data_path: Path
    lab_readings_path: Path
    status_path: Path
    ledger_path: Path
    event_state_path: Path
    lease_path: Path
    web_package_trigger_path: Path
    config_path: Path
    environment: str
    k8s_mode_enabled: bool
    k8s_namespace: str
    cluster_visualization_enabled: bool
    assistant_cluster_context_enabled: bool
    debounce_seconds: float
    watcher_poll_seconds: float
    max_retries: int
    retry_base_seconds: float
    retry_max_seconds: float
    lease_ttl_seconds: float
    k8s_api_timeout_seconds: float
    k8s_worker_image: str
    k8s_worker_service_account: str
    k8s_readings_pvc: str
    k8s_data_pvc: str
    pages_deploy_hook_url: str | None

    @classmethod
    def from_env(cls) -> "PipelineConfig":
        data_dir = resolve_path(os.getenv("DASHBOARD_DATA_DIR"), DATA_DIR)
        readings_watch_path = resolve_path(
            os.getenv("READINGS_WATCH_PATH"),
            PROJECT_ROOT / "ESD Lab readings",
        )
        return cls(
            project_root=PROJECT_ROOT,
            data_dir=data_dir,
            readings_watch_path=readings_watch_path,
            readings_data_path=resolve_path(
                os.getenv("READINGS_DATA_OUTPUT"),
                data_dir / "readings_data.json",
            ),
            lab_readings_path=resolve_path(
                os.getenv("LAB_READINGS_OUTPUT"),
                PROJECT_ROOT / "web" / "lab-readings.json",
            ),
            status_path=resolve_path(
                os.getenv("READINGS_PIPELINE_STATUS_PATH"),
                data_dir / "readings_pipeline_status.json",
            ),
            ledger_path=resolve_path(
                os.getenv("READINGS_PIPELINE_LEDGER_PATH"),
                data_dir / "readings_pipeline_events.jsonl",
            ),
            event_state_path=resolve_path(
                os.getenv("READINGS_EVENT_STATE_PATH"),
                data_dir / "readings_event_state.json",
            ),
            lease_path=resolve_path(
                os.getenv("READINGS_PIPELINE_LEASE_PATH"),
                data_dir / "readings_pipeline.lock",
            ),
            web_package_trigger_path=resolve_path(
                os.getenv("WEB_PACKAGE_TRIGGER_PATH"),
                data_dir / "web_package_trigger.json",
            ),
            config_path=resolve_path(
                os.getenv("DASHBOARD_CONFIG_PATH"),
                PROJECT_ROOT / "config" / "paths.yml",
            ),
            environment=os.getenv("PIPELINE_ENVIRONMENT", "local"),
            k8s_mode_enabled=parse_bool(os.getenv("K8S_MODE_ENABLED")),
            k8s_namespace=os.getenv("K8S_NAMESPACE") or default_namespace(),
            cluster_visualization_enabled=parse_bool(
                os.getenv("CLUSTER_VISUALIZATION_ENABLED"),
                default=True,
            ),
            assistant_cluster_context_enabled=parse_bool(
                os.getenv("ASSISTANT_CLUSTER_CONTEXT_ENABLED"),
                default=True,
            ),
            debounce_seconds=parse_float(
                os.getenv("READINGS_EVENT_DEBOUNCE_SECONDS"),
                default=5.0,
            ),
            watcher_poll_seconds=parse_float(
                os.getenv("READINGS_WATCHER_POLL_SECONDS"),
                default=2.0,
            ),
            max_retries=max(1, parse_int(os.getenv("PIPELINE_MAX_RETRIES"), default=3)),
            retry_base_seconds=parse_float(
                os.getenv("PIPELINE_RETRY_BASE_SECONDS"),
                default=1.0,
            ),
            retry_max_seconds=parse_float(
                os.getenv("PIPELINE_RETRY_MAX_SECONDS"),
                default=30.0,
            ),
            lease_ttl_seconds=parse_float(
                os.getenv("PIPELINE_LEASE_TTL_SECONDS"),
                default=900.0,
            ),
            k8s_api_timeout_seconds=parse_float(
                os.getenv("K8S_API_TIMEOUT_SECONDS"),
                default=2.5,
            ),
            k8s_worker_image=os.getenv("K8S_WORKER_IMAGE", ""),
            k8s_worker_service_account=os.getenv(
                "K8S_WORKER_SERVICE_ACCOUNT",
                "esd-lab-dashboard",
            ),
            k8s_readings_pvc=os.getenv("K8S_READINGS_PVC", ""),
            k8s_data_pvc=os.getenv("K8S_DATA_PVC", ""),
            pages_deploy_hook_url=os.getenv("PAGES_DEPLOY_HOOK_URL") or None,
        )

    @property
    def mode_label(self) -> str:
        return "kubernetes" if self.k8s_mode_enabled else "local"

    def relative_to_project(self, path: Path) -> str:
        try:
            return str(path.relative_to(self.project_root))
        except ValueError:
            return path.name
