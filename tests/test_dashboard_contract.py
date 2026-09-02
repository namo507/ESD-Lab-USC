"""Dashboard payload contract tests."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import yaml

from dashboard.pipelines import (
    build_dashboard_data,
    build_org_site_data,
    generate_synthetic_dashboard_data,
)


def test_synthetic_payload_contains_organization_site_block():
    payload = generate_synthetic_dashboard_data.build_payload()

    assert "organization_site" in payload
    assert payload["organization_site"]["summary"]["current_public_studies"] >= 1
    assert payload["organization_site"]["impact_feed"]
    json.loads(json.dumps(payload, allow_nan=False))


def test_synthetic_payload_contains_next_wave_aggregate_blocks():
    payload = generate_synthetic_dashboard_data.build_payload()

    assert payload["participant_operations"]["id_legend"]
    assert payload["participant_operations"]["participants"]
    assert payload["participant_operations"]["summary"]["dual"] >= 1
    assert payload["hda_composition"]["by_group"]["VPT"]
    assert {
        "orienting",
        "sustained",
        "inattention",
        "termination",
    }.issubset(payload["hda_composition"]["by_group"]["VPT"][0])
    assert payload["attrition_funnel"]["stages"]
    assert payload["attrition_funnel"]["reason_codes"]
    assert payload["attrition_funnel"]["trend_by_quarter"]
    assert payload["county_profiles"]
    assert {"county", "fips", "enrolled", "sdoh_score"}.issubset(
        payload["county_profiles"][0]
    )
    assert payload["redcap_trackers"]["enrollment"]
    assert payload["redcap_trackers"]["queue_funnel"]
    assert payload["redcap_timeline"]
    assert payload["redcap_ops"]["freshness"]["status"] in {"fresh", "stale"}
    assert payload["redcap_ops"]["runtime_parity"]
    assert payload["redcap_clinical"]["epds_trajectory"]
    assert payload["redcap_integrity"]["nullity_matrix"]
    assert payload["redcap_schedule"]["upcoming_visits"]
    assert payload["redcap_respondent"]["caregiver_burden"]
    assert payload["redcap_platform"]["reports"]
    assert payload["redcap_predictive"]["nl_query_enabled"] is True
    assert payload["clinical_cutoffs"]["epds_positive"] == 10
    json.loads(json.dumps(payload, allow_nan=False))


def test_org_site_live_payload_tolerates_missing_optional_page(monkeypatch):
    def fake_fetch_page(key: str, url: str, timeout: int = 12):
        if key == "partners":
            raise RuntimeError("404")
        return build_org_site_data.PageDocument(
            key=key,
            url=url,
            title=key,
            blocks=[],
        )

    monkeypatch.setattr(build_org_site_data, "fetch_page", fake_fetch_page)

    payload = build_org_site_data.build_payload(allow_network=True)

    assert payload["meta"]["source_mode"] == "live_fetch"
    assert not any(error.startswith("partners:") for error in payload["meta"]["errors"])
    assert payload["partners"]
    assert payload["summary"]["partner_count"] == len(payload["partners"])
    assert {item["source_page"] for item in payload["partners"]} == {
        build_org_site_data.PAGE_URLS["about"]
    }
    json.loads(json.dumps(payload, allow_nan=False))


def test_org_site_fallback_summary_counts_match_payload():
    payload = build_org_site_data.build_payload(allow_network=False)

    assert payload["summary"]["current_public_studies"] == len(payload["studies"])
    assert payload["summary"]["featured_stories"] == len(payload["stories"])
    assert payload["summary"]["partner_count"] == len(payload["partners"])
    assert payload["summary"]["publication_items"] == len(payload["publications"])
    assert payload["summary"]["news_mentions"] == len(payload["news"])
    assert payload["summary"]["impact_item_count"] == len(payload["impact_feed"])
    assert all(
        item["source_page"] == build_org_site_data.PAGE_URLS["about"]
        for item in payload["partners"]
    )


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
    assert payload["participant_operations"]["participants"]
    assert payload["participant_operations"]["form_policy_options"]
    assert any(
        item["kind"] == "story" for item in payload["organization_site"]["impact_feed"]
    )
    assert payload["hda_composition"]["by_group"]
    assert payload["attrition_funnel"]["stages"]
    assert payload["county_profiles"]
    assert payload["redcap_meta"]["pid"] == 5955
    assert payload["redcap_meta"]["contract_version"] == "2.0"
    assert set(payload["redcap_completion_stats"]) == {
        "6_months_arm_1",
        "9_months_arm_1",
        "12_months_arm_1",
        "24_months_arm_1",
    }
    assert "redcap_visit_health" in payload
    assert payload["redcap_visit_health"]["data"]
    assert "twentyFourMonth" in payload["redcap_visit_health"]["data"][0]
    assert payload["redcap_trackers"]["instrument_completeness"]
    assert payload["redcap_trackers"]["thresholds"]["small_cell_min"] >= 2
    assert payload["redcap_timeline"]
    assert payload["redcap_clinical"]["epds_trajectory"]
    assert payload["redcap_clinical"]["developmental_grid"]
    assert payload["redcap_integrity"]["nullity_matrix"]
    assert payload["redcap_schedule"]["retention_survival"]
    assert payload["redcap_respondent"]["caregiver_burden"]
    assert payload["redcap_platform"]["reports"]
    assert payload["redcap_predictive"]["attrition_risk"]
    assert payload["clinical_cutoffs"]["visit_window_days"] == 30
    assert payload["redcap_ops"]["controls_snapshot"]["feature_flags"][
        "redcap.pipelineHealth"
    ]
    assert payload["redcap_ops"]["runtime_parity"]["pages"]
    json.loads(json.dumps(payload, allow_nan=False))


def test_redcap_contract_contains_verified_pid_5955_structure():
    contract = yaml.safe_load(Path("config/redcap_config.yml").read_text())

    assert contract["project"]["pid"] == 5955
    assert contract["events"]["order"] == [
        "consent_arm_1",
        "caregiver_1_arm_1",
        "caregiver_2_arm_1",
        "sibling_arm_1",
        "1_month_arm_1",
        "2_months_arm_1",
        "3_months_arm_1",
        "6_months_arm_1",
        "9_months_arm_1",
        "12_months_arm_1",
        "24_months_arm_1",
        "36_months_arm_1",
    ]
    assert (
        contract["instruments"]["carry_forward"]["complete_field"]
        == "csbs_caregiver_complete"
    )
    assert contract["instruments"]["carry_forward"]["events"][-1] == "24_months_arm_1"
    assert "R5" in contract["anomaly_codes"]


def test_generated_redcap_constants_are_current():
    subprocess.run(["node", "scripts/gen_redcap_constants.mjs"], check=True)
    result = subprocess.run(
        ["git", "diff", "--exit-code", "web/src/constants/redcapConfig.ts"],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_committed_dashboard_redcap_payload_excludes_configured_phi_fields():
    contract = yaml.safe_load(Path("config/redcap_config.yml").read_text())
    payload = json.loads(Path("dashboard/data/dashboard_data.json").read_text())
    redcap_text = json.dumps(
        {
            "redcap_meta": payload.get("redcap_meta"),
            "redcap_completion_stats": payload.get("redcap_completion_stats"),
            "redcap_visit_health": payload.get("redcap_visit_health"),
            "redcap_trackers": payload.get("redcap_trackers"),
            "redcap_timeline": payload.get("redcap_timeline"),
            "redcap_clinical": payload.get("redcap_clinical"),
            "redcap_integrity": payload.get("redcap_integrity"),
            "redcap_schedule": payload.get("redcap_schedule"),
            "redcap_respondent": payload.get("redcap_respondent"),
            "redcap_platform": payload.get("redcap_platform"),
            "redcap_predictive": payload.get("redcap_predictive"),
            "clinical_cutoffs": payload.get("clinical_cutoffs"),
            "redcap_ops": payload.get("redcap_ops"),
        }
    )

    for field in contract["phi_fields"]:
        assert field not in redcap_text


def test_dashboard_controls_are_normalized_and_clamped():
    controls = build_dashboard_data.normalize_dashboard_controls(
        {
            "anomaly_thresholds": {
                "stale_visit_days": -7,
                "completeness_warn_pct": 1.5,
                "freshness_sla_hours": 500,
                "small_cell_min": 1,
            },
            "clinical_cutoffs": {
                "epds_positive": -2,
                "epds_high": 99,
                "visit_window_days": 4,
                "dp_epsilon": 42,
            },
            "sync": {"cadence_cron": "*/15 * * * *", "chunk_size": 99999},
            "assistant": {"model_tier": "fast", "max_fragments": 2},
            "feature_flags": {
                "redcap.writeback": True,
                "redcap.pipelineHealth": False,
            },
        }
    )

    assert controls["anomaly_thresholds"] == {
        "stale_visit_days": 1,
        "completeness_warn_pct": 0.99,
        "freshness_sla_hours": 168,
        "small_cell_min": 2,
    }
    assert controls["sync"]["chunk_size"] == 5000
    assert controls["assistant"]["max_fragments"] == 5
    assert controls["clinical_cutoffs"]["epds_positive"] == 0
    assert controls["clinical_cutoffs"]["epds_high"] == 30
    assert controls["clinical_cutoffs"]["visit_window_days"] == 7
    assert controls["clinical_cutoffs"]["dp_epsilon"] == 10
    assert controls["feature_flags"]["redcap.writeback"] is True
    assert controls["feature_flags"]["redcap.pipelineHealth"] is False


def test_public_dashboard_fixture_tracks_the_runtime_payload():
    """The preview fixture and the runtime payload must not drift apart.

    `web/public/dashboard/data/dashboard_data.json` is what a static preview
    serves at the URL the SPA fetches, while the live runtime serves that URL
    from `dashboard/data/dashboard_data.json`. Nothing regenerated the fixture,
    so it sat two months behind and every preview route -- including the one CI
    measures for contrast -- rendered numbers the runtime had replaced.
    """
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root / "scripts"))
    import sync_public_dashboard_fixture as fixture

    source = root / "dashboard" / "data" / "dashboard_data.json"
    target = root / "web" / "public" / "dashboard" / "data" / "dashboard_data.json"

    assert target.exists(), "browser dashboard fixture is missing"
    expected = fixture.render(json.loads(source.read_text(encoding="utf-8")))
    assert target.read_text(encoding="utf-8") == expected, (
        "run `python scripts/sync_public_dashboard_fixture.py` to refresh "
        "the browser dashboard fixture"
    )
