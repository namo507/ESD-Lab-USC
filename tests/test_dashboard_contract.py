"""Dashboard payload contract tests."""

from __future__ import annotations

import json

from dashboard.pipelines import build_dashboard_data
from dashboard.pipelines import build_org_site_data
from dashboard.pipelines import generate_synthetic_dashboard_data


def test_synthetic_payload_contains_organization_site_block():
    payload = generate_synthetic_dashboard_data.build_payload()

    assert "organization_site" in payload
    assert payload["organization_site"]["summary"]["current_public_studies"] >= 1
    assert payload["organization_site"]["impact_feed"]
    json.loads(json.dumps(payload, allow_nan=False))


def test_production_payload_includes_organization_site_block(tmp_path):
    redcap_path = tmp_path / "redcap_latest.csv"
    feature_path = tmp_path / "feature_matrix.csv"
    metrics_path = tmp_path / "_metrics.json"

    from dashboard.pipelines import bootstrap_dashboard_demo_inputs

    paths = bootstrap_dashboard_demo_inputs.materialize_demo_inputs(
        redcap_output=redcap_path,
        feature_output=feature_path,
        metrics_output=metrics_path,
    )

    import pandas as pd

    redcap = pd.read_csv(paths["redcap"])
    feature_matrix = pd.read_csv(paths["feature_matrix"])
    metrics = json.loads(paths["metrics"].read_text())
    organization_site = build_org_site_data.build_payload(allow_network=False)

    payload = build_dashboard_data.build_payload(
        redcap=redcap,
        features=feature_matrix,
        dd=None,
        metrics=metrics,
        salt="test_salt",
        data_source="repo_demo_inputs",
        organization_site=organization_site,
    )

    assert payload["organization_site"]["summary"]["partner_count"] >= 1
    assert payload["organization_site"]["contact"]["signup_url"]
    assert any(item["kind"] == "story" for item in payload["organization_site"]["impact_feed"])
    json.loads(json.dumps(payload, allow_nan=False))