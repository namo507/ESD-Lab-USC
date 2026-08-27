from __future__ import annotations

import json
import time
from dataclasses import replace
from pathlib import Path

from k8s.pipeline.config import PROJECT_ROOT, PipelineConfig
from k8s.pipeline.k8s_api import KubernetesApiClient
from k8s.pipeline.lease import FileLease
from k8s.pipeline.ledger import EventDeduper
from k8s.pipeline.watcher import write_heartbeat
from k8s.pipeline.worker import run_pipeline


def make_config(tmp_path: Path, readings_dir: Path) -> PipelineConfig:
    data_dir = tmp_path / "dashboard-data"
    return PipelineConfig(
        project_root=PROJECT_ROOT,
        data_dir=data_dir,
        readings_watch_path=readings_dir,
        readings_data_path=data_dir / "readings_data.json",
        lab_readings_path=tmp_path / "web" / "lab-readings.json",
        status_path=data_dir / "readings_pipeline_status.json",
        ledger_path=data_dir / "readings_pipeline_events.jsonl",
        event_state_path=data_dir / "readings_event_state.json",
        lease_path=data_dir / "readings_pipeline.lock",
        web_package_trigger_path=data_dir / "web_package_trigger.json",
        config_path=PROJECT_ROOT / "config" / "paths.yml",
        environment="test",
        k8s_mode_enabled=False,
        k8s_namespace="default",
        cluster_visualization_enabled=True,
        assistant_cluster_context_enabled=True,
        debounce_seconds=3.0,
        watcher_poll_seconds=0.25,
        watcher_heartbeat_path=data_dir / "readings_watcher_heartbeat.json",
        watcher_heartbeat_max_age_seconds=30.0,
        max_retries=1,
        retry_base_seconds=0.01,
        retry_max_seconds=0.01,
        lease_ttl_seconds=30.0,
        k8s_api_timeout_seconds=0.1,
        k8s_worker_image="",
        k8s_worker_service_account="esd-lab-dashboard",
        k8s_readings_pvc="",
        k8s_data_pvc="",
        worker_ttl_seconds_after_finished=86400,
        pages_deploy_hook_url=None,
    )


def test_event_deduper_collapses_duplicate_events(tmp_path):
    deduper = EventDeduper(tmp_path / "state.json", debounce_seconds=5)

    assert deduper.should_accept("abc", now=10)
    deduper.mark_seen("abc", now=10)

    assert not deduper.should_accept("abc", now=12)
    assert deduper.should_accept("abc", now=16)

    deduper.mark_poisoned("abc")
    assert not deduper.should_accept("abc", now=30)


def test_file_lease_allows_one_owner_and_expires(tmp_path):
    lease = FileLease(tmp_path / "pipeline.lock", ttl_seconds=10)

    assert lease.acquire("owner-a")
    assert not lease.acquire("owner-b")
    assert lease.release("owner-b") is False
    assert lease.release("owner-a") is True

    assert lease.acquire("owner-a")
    payload = lease.read()
    payload["expires_at_ts"] = time.time() - 1
    lease.path.write_text(json.dumps(payload), encoding="utf-8")
    assert lease.acquire("owner-b")


def test_worker_rebuilds_readings_and_lab_payloads(tmp_path):
    readings_dir = tmp_path / "esd-lab-readings"
    readings_dir.mkdir()
    (readings_dir / "Autonomic-pathways_2025.pdf").write_text("placeholder")
    config = make_config(tmp_path, readings_dir)

    exit_code = run_pipeline(
        config=config,
        event_id="event-test",
        trigger_source="unit-test",
        signature="sig-test",
        paths=["Autonomic-pathways_2025.pdf"],
    )

    assert exit_code == 0
    readings = json.loads(config.readings_data_path.read_text(encoding="utf-8"))
    lab = json.loads(config.lab_readings_path.read_text(encoding="utf-8"))
    status = json.loads(config.status_path.read_text(encoding="utf-8"))

    assert readings["summary"]["total_readings"] == 1
    assert lab["summary"]["count"] == 1
    assert status["state"] == "succeeded"
    assert status["last_success"]["event_id"] == "event-test"


def test_watcher_heartbeat_is_atomic_and_machine_readable(tmp_path):
    readings_dir = tmp_path / "esd-lab-readings"
    readings_dir.mkdir()
    config = make_config(tmp_path, readings_dir)

    heartbeat = write_heartbeat(config, now=1234.5)

    payload = json.loads(heartbeat.read_text(encoding="utf-8"))
    assert payload["schema"] == "readings_watcher_heartbeat.v1"
    assert payload["timestamp"] == 1234.5
    assert not heartbeat.with_suffix(heartbeat.suffix + ".tmp").exists()


def test_kubernetes_jobs_use_configured_finished_ttl(monkeypatch, tmp_path):
    readings_dir = tmp_path / "esd-lab-readings"
    readings_dir.mkdir()
    config = replace(
        make_config(tmp_path, readings_dir),
        k8s_worker_image="example/dashboard:test",
        k8s_readings_pvc="readings-rwx",
        k8s_data_pvc="data-rwx",
        worker_ttl_seconds_after_finished=321,
    )
    captured: dict[str, object] = {}
    client = KubernetesApiClient(config)

    def fake_request(method, path, payload=None):
        captured["payload"] = payload
        return {"ok": True}

    monkeypatch.setattr(client, "request", fake_request)
    client.create_readings_job(
        event_id="event-test",
        trigger_source="unit-test",
        signature="sig-test",
    )

    manifest = captured["payload"]
    assert isinstance(manifest, dict)
    assert manifest["spec"]["ttlSecondsAfterFinished"] == 321
