from __future__ import annotations

import json
from pathlib import Path

from k8s.pipeline.config import PROJECT_ROOT, PipelineConfig
from k8s.pipeline.freshness import readings_freshness_payload
from k8s.pipeline.ledger import EventLedger
from k8s.pipeline.observability import cluster_topology_payload, pipeline_status_payload


def make_config(tmp_path: Path) -> PipelineConfig:
    data_dir = tmp_path / "dashboard-data"
    return PipelineConfig(
        project_root=PROJECT_ROOT,
        data_dir=data_dir,
        readings_watch_path=tmp_path / "esd-lab-readings",
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
        debounce_seconds=5.0,
        watcher_poll_seconds=1.0,
        watcher_heartbeat_path=data_dir / "readings_watcher_heartbeat.json",
        watcher_heartbeat_max_age_seconds=30.0,
        max_retries=3,
        retry_base_seconds=1.0,
        retry_max_seconds=30.0,
        lease_ttl_seconds=30.0,
        k8s_api_timeout_seconds=0.1,
        k8s_worker_image="",
        k8s_worker_service_account="esd-lab-dashboard",
        k8s_readings_pvc="",
        k8s_data_pvc="",
        worker_ttl_seconds_after_finished=86400,
        pages_deploy_hook_url=None,
    )


def test_local_topology_returns_simulated_components(tmp_path):
    config = make_config(tmp_path)

    payload = cluster_topology_payload(config)

    assert payload["mode"] == "local"
    assert payload["summary"]["health"] == "simulated"
    assert any(component["role"] == "dashboard" for component in payload["components"])


def test_freshness_and_pipeline_status_read_ledger(tmp_path):
    config = make_config(tmp_path)
    config.readings_data_path.parent.mkdir(parents=True)
    config.lab_readings_path.parent.mkdir(parents=True)
    config.readings_data_path.write_text(
        json.dumps(
            {
                "meta": {"generated_at": "2026-06-01T10:00:00"},
                "summary": {"total_readings": 4, "total_pages": 88},
            }
        ),
        encoding="utf-8",
    )
    config.lab_readings_path.write_text(
        json.dumps(
            {
                "generated_at": "2026-06-01T10:01:00",
                "summary": {"count": 4, "total_pages": 88},
                "readings": [],
            }
        ),
        encoding="utf-8",
    )
    ledger = EventLedger(config)
    ledger.write_status(
        state="succeeded",
        last_success={
            "event_id": "event-1",
            "trigger_source": "unit-test",
            "finished_at": "2026-06-01T10:01:00Z",
        },
    )
    ledger.append(
        {"event_id": "event-1", "trigger_source": "unit-test", "status": "succeeded"}
    )

    freshness = readings_freshness_payload(config)
    pipeline = pipeline_status_payload(config)

    assert freshness["total_indexed"] == 4
    assert freshness["last_event_id"] == "event-1"
    assert pipeline["state"] == "succeeded"
    assert pipeline["events"][0]["event_id"] == "event-1"
