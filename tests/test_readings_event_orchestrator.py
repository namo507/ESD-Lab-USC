from __future__ import annotations

import json
import time
from pathlib import Path

from dashboard.k8s_pipeline.config import PROJECT_ROOT, PipelineConfig
from dashboard.k8s_pipeline.lease import FileLease
from dashboard.k8s_pipeline.ledger import EventDeduper
from dashboard.k8s_pipeline.worker import run_pipeline


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
        max_retries=1,
        retry_base_seconds=0.01,
        retry_max_seconds=0.01,
        lease_ttl_seconds=30.0,
        k8s_api_timeout_seconds=0.1,
        k8s_worker_image="",
        k8s_worker_service_account="esd-lab-dashboard",
        k8s_readings_pvc="",
        k8s_data_pvc="",
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
    lease = FileLease(tmp_path / "pipeline.lock", ttl_seconds=0.2)

    assert lease.acquire("owner-a")
    assert not lease.acquire("owner-b")
    assert lease.release("owner-b") is False
    assert lease.release("owner-a") is True

    assert lease.acquire("owner-a")
    time.sleep(0.25)
    assert lease.acquire("owner-b")


def test_worker_rebuilds_readings_and_lab_payloads(tmp_path):
    readings_dir = tmp_path / "ESD Lab readings"
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
