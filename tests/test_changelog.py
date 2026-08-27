from __future__ import annotations

from dashboard.server import data_features


def test_diff_computation_redacts_phi_fields():
    diff = data_features.compute_diff(
        {"qa": "pending", "dob": "2024-01-01"},
        {"qa": "pass", "dob": "2024-02-01"},
    )

    assert diff["qa"] == ["pending", "pass"]
    assert diff["dob"] == ["[REDACTED]", "[REDACTED]"]


def test_snapshot_checksum_and_row_counts(tmp_path):
    db_path = tmp_path / "features.sqlite3"
    snapshot = data_features.create_snapshot(
        "pre-submission-2026-06",
        "Ready for manuscript freeze.",
        payload={"cohort_table": [{"nano_id": "NANO-0001", "group": "PT"}]},
        db_path=db_path,
    )

    assert snapshot["tag"] == "pre-submission-2026-06"
    assert snapshot["row_counts"]["participants"] == 1
    assert len(snapshot["checksum"]) == 64


def test_entity_history_returns_redacted_entries(tmp_path):
    db_path = tmp_path / "features.sqlite3"
    data_features.ensure_feature_db(db_path)

    rows = data_features.entity_history("participant", "NANO-0102", db_path)

    assert rows
    assert rows[0]["changed_fields"]["dob"] == ["[REDACTED]", "[REDACTED]"]
