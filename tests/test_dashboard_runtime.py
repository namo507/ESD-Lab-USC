"""Tests for the live dashboard readings/runtime helpers."""

from __future__ import annotations

import json

import pandas as pd

from dashboard.pipelines import build_dashboard_data
from dashboard.pipelines import build_readings_index
from dashboard.pipelines import bootstrap_dashboard_demo_inputs
from dashboard.server.live_dashboard_server import snapshot_path


def test_build_payload_indexes_readings(tmp_path):
    """Reading index should count files and expose repo-relative links."""
    readings_dir = tmp_path / "ESD Lab readings"
    readings_dir.mkdir()
    (readings_dir / "Emotion-understanding-in-infants_2025_Advances-in-Child-Development.pdf").write_text("pdf")
    (readings_dir / "ResearchStrategy_Final.pdf").write_text("pdf")

    payload = build_readings_index.build_payload(readings_dir)

    assert payload["summary"]["total_readings"] == 2
    assert any(item["relative_href"].startswith("../ESD%20Lab%20readings/") for item in payload["readings"])
    assert {item["category"] for item in payload["readings"]}


def test_build_payload_extracts_grant_material_category(tmp_path):
    """Grant-like filenames should be categorized separately from articles."""
    readings_dir = tmp_path / "ESD Lab readings"
    readings_dir.mkdir()
    (readings_dir / "SpecificAims_BradshawR01_A1.pdf").write_text("pdf")

    payload = build_readings_index.build_payload(readings_dir)

    assert payload["readings"][0]["category"] == "Grant Materials"
    assert payload["readings"][0]["source"] == "Grant Materials"


def test_derive_title_from_excerpt_uses_article_title_not_chapter_label():
    """Excerpt parsing should keep the actual article title and drop chapter prefixes."""
    excerpt = (
        "CHAPTER FOUR Autonomic and attentional pathways in the emergence of autism: "
        "bridging mechanisms and real-world contexts in infancy Jessica Bradshaw a , b , *, Emma Platt a , b"
    )

    derived = build_readings_index.derive_title_from_excerpt(excerpt)

    assert derived == (
        "Autonomic and attentional pathways in the emergence of autism: "
        "bridging mechanisms and real-world contexts in infancy"
    )


def test_extract_authors_from_excerpt_skips_affiliations():
    """Author extraction should capture names without retaining affiliation fragments."""
    excerpt = (
        "CHAPTER THREE Emotion understanding in infants and young children: How input shapes emotional development "
        "Vanessa LoBue a , *, Marianella Casasola b , Lisa M. Oakes c a University of Rutgers b University of California"
    )

    authors = build_readings_index.extract_authors_from_excerpt(excerpt)

    assert authors == ["Vanessa LoBue", "Marianella Casasola", "Lisa M. Oakes"]


def test_main_writes_json_output(tmp_path):
    """CLI entry point should emit a JSON payload to the requested path."""
    readings_dir = tmp_path / "ESD Lab readings"
    readings_dir.mkdir()
    (readings_dir / "Childhood-essentialism_2025_Advances-in-Child-Development.pdf").write_text("pdf")
    output_path = tmp_path / "readings.json"
    cache_path = tmp_path / ".readings_cache.json"

    exit_code = build_readings_index.main([
        "--readings-dir", str(readings_dir),
        "--output", str(output_path),
        "--cache", str(cache_path),
    ])

    payload = json.loads(output_path.read_text())
    assert exit_code == 0
    assert payload["meta"]["total_readings"] == 1


def test_snapshot_path_changes_when_directory_changes(tmp_path):
    """Watch snapshots should change when a file is modified."""
    watch_dir = tmp_path / "watched"
    watch_dir.mkdir()
    tracked_file = watch_dir / "paper.pdf"
    tracked_file.write_text("first")

    before = snapshot_path(watch_dir)
    tracked_file.write_text("second")
    after = snapshot_path(watch_dir)

    assert before != after


def test_materialize_demo_inputs_writes_expected_dashboard_sources(tmp_path):
    """Repo-local demo input bootstrap should emit reusable dashboard source files."""
    redcap_path = tmp_path / "redcap_latest.csv"
    feature_path = tmp_path / "feature_matrix.csv"
    metrics_path = tmp_path / "_metrics.json"

    paths = bootstrap_dashboard_demo_inputs.materialize_demo_inputs(
        redcap_output=redcap_path,
        feature_output=feature_path,
        metrics_output=metrics_path,
    )

    redcap = pd.read_csv(paths["redcap"])
    feature_matrix = pd.read_csv(paths["feature_matrix"])
    metrics = json.loads(paths["metrics"].read_text())

    assert {"record_id", "redcap_event_name", "group_assignment", "dashboard_input_source"}.issubset(redcap.columns)
    assert redcap["dashboard_input_source"].eq("repo_demo_inputs").all()
    assert {"record_id", "event", "group", "month", "rsa", "rmssd", "sdnn", "hda_sa_pct"}.issubset(feature_matrix.columns)
    assert feature_matrix["dashboard_input_source"].eq("repo_demo_inputs").all()
    assert "models" in metrics and metrics["models"]


def test_build_payload_serializes_sparse_trajectory_values_as_null(tmp_path):
    """Dashboard payloads should stay strict-JSON-safe when trajectory cells are sparse."""
    redcap_path = tmp_path / "redcap_latest.csv"
    feature_path = tmp_path / "feature_matrix.csv"
    metrics_path = tmp_path / "_metrics.json"

    paths = bootstrap_dashboard_demo_inputs.materialize_demo_inputs(
        redcap_output=redcap_path,
        feature_output=feature_path,
        metrics_output=metrics_path,
    )

    redcap = pd.read_csv(paths["redcap"])
    feature_matrix = pd.read_csv(paths["feature_matrix"])
    metrics = json.loads(paths["metrics"].read_text())
    sparse_features = feature_matrix.loc[
        ~((feature_matrix["group"] == "ASIB") & (feature_matrix["month"] == 36))
    ].copy()

    payload = build_dashboard_data.build_payload(
        redcap=redcap,
        features=sparse_features,
        dd=None,
        metrics=metrics,
        salt="test_salt",
        data_source="repo_demo_inputs",
    )

    assert payload["trajectories"]["by_group"]["ASIB"]["mean"]["RSA"][-1] is None
    json.loads(json.dumps(payload, allow_nan=False))