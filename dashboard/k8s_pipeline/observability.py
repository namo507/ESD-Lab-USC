"""Cluster topology and pipeline status projections."""

from __future__ import annotations

from typing import Any

from .config import PipelineConfig
from .freshness import readings_freshness_payload
from .k8s_api import KubernetesApiClient
from .k8s_api import KubernetesApiError
from .ledger import EventLedger
from .ledger import utc_now


def _condition_status(item: dict[str, Any]) -> str:
    conditions = item.get("status", {}).get("conditions") or []
    for condition in conditions:
        if condition.get("type") in {"Ready", "Available", "Complete"}:
            return "ok" if condition.get("status") == "True" else "degraded"
    return "unknown"


def _pod_phase(pod: dict[str, Any]) -> str:
    return str(pod.get("status", {}).get("phase") or "Unknown").lower()


def _deployment_status(item: dict[str, Any]) -> str:
    spec_replicas = int(item.get("spec", {}).get("replicas") or 0)
    ready = int(item.get("status", {}).get("readyReplicas") or 0)
    if spec_replicas == ready and spec_replicas > 0:
        return "ok"
    if ready > 0:
        return "degraded"
    return "unavailable"


def _job_status(item: dict[str, Any]) -> str:
    status = item.get("status", {})
    if status.get("succeeded"):
        return "succeeded"
    if status.get("failed"):
        return "failed"
    if status.get("active"):
        return "running"
    return "queued"


def _local_topology(
    config: PipelineConfig, *, reason: str | None = None
) -> dict[str, Any]:
    components = [
        {
            "id": "local-runtime",
            "name": "Local dashboard runtime",
            "kind": "process",
            "status": "ok",
            "role": "dashboard",
        },
        {
            "id": "local-watcher",
            "name": "Polling watcher",
            "kind": "thread",
            "status": "ok",
            "role": "readings-watcher",
        },
        {
            "id": "local-pipeline",
            "name": "Readings index pipeline",
            "kind": "subprocess",
            "status": "idle",
            "role": "pipeline-worker",
        },
    ]
    return {
        "schema": "cluster_topology.v1",
        "mode": config.mode_label,
        "enabled": config.cluster_visualization_enabled,
        "generated_at": utc_now(),
        "degraded": bool(reason),
        "errors": [reason] if reason else [],
        "summary": {
            "nodes": 1,
            "pods": 0,
            "deployments": 0,
            "jobs": 0,
            "cronjobs": 0,
            "health": "simulated" if not config.k8s_mode_enabled else "degraded",
        },
        "components": components,
        "edges": [
            {"from": "local-watcher", "to": "local-pipeline"},
            {"from": "local-pipeline", "to": "local-runtime"},
        ],
    }


def cluster_topology_payload(config: PipelineConfig | None = None) -> dict[str, Any]:
    config = config or PipelineConfig.from_env()
    if not config.cluster_visualization_enabled:
        payload = _local_topology(config, reason="Cluster visualization is disabled.")
        payload["enabled"] = False
        return payload

    if not config.k8s_mode_enabled:
        return _local_topology(config)

    client = KubernetesApiClient(config)
    if not client.available:
        return _local_topology(config, reason="Kubernetes API is unavailable.")

    errors: list[str] = []
    try:
        nodes_payload = client.list_nodes()
    except KubernetesApiError as exc:
        nodes_payload = {"items": []}
        errors.append(str(exc))
    try:
        pods_payload = client.list_pods()
        deployments_payload = client.list_deployments()
        jobs_payload = client.list_jobs()
        cronjobs_payload = client.list_cronjobs()
    except KubernetesApiError as exc:
        pods_payload = {"items": []}
        deployments_payload = {"items": []}
        jobs_payload = {"items": []}
        cronjobs_payload = {"items": []}
        errors.append(str(exc))

    nodes = nodes_payload.get("items") or []
    pods = pods_payload.get("items") or []
    deployments = deployments_payload.get("items") or []
    jobs = jobs_payload.get("items") or []
    cronjobs = cronjobs_payload.get("items") or []

    components: list[dict[str, Any]] = []
    for item in nodes:
        meta = item.get("metadata", {})
        components.append(
            {
                "id": f"node:{meta.get('name', 'unknown')}",
                "name": meta.get("name", "unknown"),
                "kind": "node",
                "status": _condition_status(item),
                "role": "worker",
            }
        )
    for item in deployments:
        meta = item.get("metadata", {})
        labels = meta.get("labels") or {}
        if labels.get("app.kubernetes.io/name") != "esd-lab-dashboard":
            continue
        components.append(
            {
                "id": f"deployment:{meta.get('name')}",
                "name": meta.get("name"),
                "kind": "deployment",
                "status": _deployment_status(item),
                "role": labels.get("app.kubernetes.io/component", "deployment"),
                "ready": item.get("status", {}).get("readyReplicas") or 0,
                "desired": item.get("spec", {}).get("replicas") or 0,
            }
        )
    for item in pods:
        meta = item.get("metadata", {})
        labels = meta.get("labels") or {}
        if labels.get("app.kubernetes.io/name") != "esd-lab-dashboard":
            continue
        components.append(
            {
                "id": f"pod:{meta.get('name')}",
                "name": meta.get("name"),
                "kind": "pod",
                "status": _pod_phase(item),
                "role": labels.get("app.kubernetes.io/component", "pod"),
                "node": item.get("spec", {}).get("nodeName"),
            }
        )
    for item in jobs[-10:]:
        meta = item.get("metadata", {})
        labels = meta.get("labels") or {}
        if labels.get("app.kubernetes.io/name") != "esd-lab-dashboard":
            continue
        components.append(
            {
                "id": f"job:{meta.get('name')}",
                "name": meta.get("name"),
                "kind": "job",
                "status": _job_status(item),
                "role": labels.get("app.kubernetes.io/component", "job"),
            }
        )

    return {
        "schema": "cluster_topology.v1",
        "mode": config.mode_label,
        "enabled": True,
        "generated_at": utc_now(),
        "degraded": bool(errors),
        "errors": errors[:5],
        "summary": {
            "nodes": len(nodes),
            "pods": len(pods),
            "deployments": len(deployments),
            "jobs": len(jobs),
            "cronjobs": len(cronjobs),
            "health": "degraded" if errors else "ok",
        },
        "components": components,
        "edges": [
            {"from": "deployment:esd-readings-watcher", "to": "job:readings-worker"},
            {"from": "job:readings-worker", "to": "deployment:esd-lab-dashboard"},
        ],
    }


def pipeline_status_payload(config: PipelineConfig | None = None) -> dict[str, Any]:
    config = config or PipelineConfig.from_env()
    ledger = EventLedger(config)
    status = ledger.read_status()
    events = ledger.read_events(limit=25)
    freshness = readings_freshness_payload(config)
    last_success = (
        status.get("last_success")
        if isinstance(status.get("last_success"), dict)
        else None
    )
    last_failure = (
        status.get("last_failure")
        if isinstance(status.get("last_failure"), dict)
        else None
    )
    return {
        "schema": "cluster_pipeline.v1",
        "mode": config.mode_label,
        "generated_at": utc_now(),
        "state": status.get("state", "idle"),
        "queue_depth": int(status.get("queue_depth") or 0),
        "running": status.get("state") == "running",
        "last_run": status.get("last_run"),
        "last_success": last_success,
        "last_failure": last_failure,
        "last_duration_ms": status.get("last_duration_ms"),
        "last_trigger": status.get("last_trigger_source"),
        "freshness": freshness,
        "events": events,
        "degraded": bool(last_failure and status.get("state") == "failed"),
    }
