"""Small Kubernetes API client using the in-pod service account."""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .config import PipelineConfig

SERVICE_ACCOUNT_DIR = Path("/var/run/secrets/kubernetes.io/serviceaccount")


class KubernetesApiError(RuntimeError):
    pass


class KubernetesApiClient:
    def __init__(self, config: PipelineConfig) -> None:
        self.config = config
        self.host = os.getenv("KUBERNETES_SERVICE_HOST")
        self.port = os.getenv("KUBERNETES_SERVICE_PORT", "443")
        self.token_path = SERVICE_ACCOUNT_DIR / "token"
        self.ca_path = SERVICE_ACCOUNT_DIR / "ca.crt"

    @property
    def available(self) -> bool:
        return bool(self.host and self.token_path.exists())

    def _url(self, path: str) -> str:
        if not self.host:
            raise KubernetesApiError("Kubernetes service host is unavailable")
        return f"https://{self.host}:{self.port}{path}"

    def request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.available:
            raise KubernetesApiError("Kubernetes service account is unavailable")
        token = self.token_path.read_text(encoding="utf-8").strip()
        body = None
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        context = ssl.create_default_context(cafile=str(self.ca_path))
        request = urllib.request.Request(
            self._url(path),
            data=body,
            method=method,
            headers=headers,
        )
        try:
            with urllib.request.urlopen(
                request,
                timeout=self.config.k8s_api_timeout_seconds,
                context=context,
            ) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise KubernetesApiError(
                f"Kubernetes API {method} {path} failed: {exc.code} {detail[:300]}"
            ) from exc
        except Exception as exc:
            raise KubernetesApiError(
                f"Kubernetes API {method} {path} unavailable: {exc}"
            ) from exc
        if not raw:
            return {}
        data = json.loads(raw.decode("utf-8"))
        return data if isinstance(data, dict) else {}

    def list_nodes(self) -> dict[str, Any]:
        return self.request("GET", "/api/v1/nodes")

    def list_pods(self) -> dict[str, Any]:
        return self.request(
            "GET",
            f"/api/v1/namespaces/{self.config.k8s_namespace}/pods",
        )

    def list_deployments(self) -> dict[str, Any]:
        return self.request(
            "GET",
            f"/apis/apps/v1/namespaces/{self.config.k8s_namespace}/deployments",
        )

    def list_jobs(self) -> dict[str, Any]:
        return self.request(
            "GET",
            f"/apis/batch/v1/namespaces/{self.config.k8s_namespace}/jobs",
        )

    def list_cronjobs(self) -> dict[str, Any]:
        return self.request(
            "GET",
            f"/apis/batch/v1/namespaces/{self.config.k8s_namespace}/cronjobs",
        )

    def create_readings_job(
        self,
        *,
        event_id: str,
        trigger_source: str,
        signature: str,
    ) -> dict[str, Any]:
        if not self.config.k8s_worker_image:
            raise KubernetesApiError("K8S_WORKER_IMAGE is required to create Jobs")
        if not self.config.k8s_readings_pvc or not self.config.k8s_data_pvc:
            raise KubernetesApiError("K8S_READINGS_PVC and K8S_DATA_PVC are required")

        safe_suffix = "".join(
            ch for ch in event_id.lower() if ch.isalnum() or ch == "-"
        )
        name = f"esd-readings-pipeline-{safe_suffix[-32:]}"
        env = [
            {"name": "K8S_MODE_ENABLED", "value": "true"},
            {"name": "K8S_NAMESPACE", "value": self.config.k8s_namespace},
            {"name": "READINGS_EVENT_ID", "value": event_id},
            {"name": "READINGS_EVENT_SIGNATURE", "value": signature},
            {"name": "READINGS_TRIGGER_SOURCE", "value": trigger_source},
            {"name": "READINGS_WATCH_PATH", "value": "/app/ESD Lab readings"},
            {"name": "DASHBOARD_DATA_DIR", "value": "/app/dashboard/data"},
            {
                "name": "READINGS_DATA_OUTPUT",
                "value": "/app/dashboard/data/readings_data.json",
            },
            {
                "name": "LAB_READINGS_OUTPUT",
                "value": "/app/dashboard/data/lab-readings.json",
            },
            {
                "name": "READINGS_PIPELINE_STATUS_PATH",
                "value": "/app/dashboard/data/readings_pipeline_status.json",
            },
            {
                "name": "READINGS_PIPELINE_LEDGER_PATH",
                "value": "/app/dashboard/data/readings_pipeline_events.jsonl",
            },
            {
                "name": "READINGS_EVENT_STATE_PATH",
                "value": "/app/dashboard/data/readings_event_state.json",
            },
            {
                "name": "READINGS_PIPELINE_LEASE_PATH",
                "value": "/app/dashboard/data/readings_pipeline.lock",
            },
            {
                "name": "READINGS_EVENT_DEBOUNCE_SECONDS",
                "value": str(self.config.debounce_seconds),
            },
            {"name": "PIPELINE_MAX_RETRIES", "value": str(self.config.max_retries)},
            {
                "name": "CLUSTER_VISUALIZATION_ENABLED",
                "value": str(self.config.cluster_visualization_enabled).lower(),
            },
            {
                "name": "ASSISTANT_CLUSTER_CONTEXT_ENABLED",
                "value": str(self.config.assistant_cluster_context_enabled).lower(),
            },
        ]
        if self.config.pages_deploy_hook_url:
            env.append(
                {
                    "name": "PAGES_DEPLOY_HOOK_URL",
                    "valueFrom": {
                        "secretKeyRef": {
                            "name": "esd-lab-dashboard-secrets",
                            "key": "pagesDeployHookUrl",
                            "optional": True,
                        }
                    },
                }
            )

        manifest = {
            "apiVersion": "batch/v1",
            "kind": "Job",
            "metadata": {
                "name": name,
                "labels": {
                    "app.kubernetes.io/name": "esd-lab-dashboard",
                    "app.kubernetes.io/component": "readings-pipeline-worker",
                    "readings.esdlabusc.edu/event-id": event_id[:63],
                },
            },
            "spec": {
                "backoffLimit": 0,
                "ttlSecondsAfterFinished": 86400,
                "template": {
                    "metadata": {
                        "labels": {
                            "app.kubernetes.io/name": "esd-lab-dashboard",
                            "app.kubernetes.io/component": "readings-pipeline-worker",
                        }
                    },
                    "spec": {
                        "serviceAccountName": self.config.k8s_worker_service_account,
                        "restartPolicy": "Never",
                        "containers": [
                            {
                                "name": "worker",
                                "image": self.config.k8s_worker_image,
                                "imagePullPolicy": "IfNotPresent",
                                "command": [
                                    "python",
                                    "-m",
                                    "dashboard.k8s_pipeline.worker",
                                ],
                                "env": env,
                                "volumeMounts": [
                                    {
                                        "name": "readings",
                                        "mountPath": "/app/ESD Lab readings",
                                        "readOnly": False,
                                    },
                                    {
                                        "name": "dashboard-data",
                                        "mountPath": "/app/dashboard/data",
                                    },
                                ],
                                "resources": {
                                    "requests": {"cpu": "250m", "memory": "512Mi"},
                                    "limits": {"cpu": "1", "memory": "1Gi"},
                                },
                            }
                        ],
                        "volumes": [
                            {
                                "name": "readings",
                                "persistentVolumeClaim": {
                                    "claimName": self.config.k8s_readings_pvc
                                },
                            },
                            {
                                "name": "dashboard-data",
                                "persistentVolumeClaim": {
                                    "claimName": self.config.k8s_data_pvc
                                },
                            },
                        ],
                    },
                },
            },
        }
        return self.request(
            "POST",
            f"/apis/batch/v1/namespaces/{self.config.k8s_namespace}/jobs",
            manifest,
        )
