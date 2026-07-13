from __future__ import annotations

import pytest

from dashboard.server import data_features


def test_table_query_paginates_and_counts_rows():
    payload = {
        "cohort_table": [
            {
                "nano_id": f"NANO-{idx:04d}",
                "group": "PT",
                "ga_weeks": 28,
                "sex": "F",
                "qc_status": "OK",
            }
            for idx in range(30)
        ]
    }

    result = data_features.query_virtual_table(
        {
            "table": "participants",
            "page": 1,
            "pageSize": 10,
            "sortBy": "id",
            "sortDir": "asc",
        },
        payload,
    )

    assert result["total"] == 30
    assert result["page"] == 1
    assert result["pageSize"] == 10
    assert len(result["rows"]) == 10
    assert result["rows"][0]["id"] == "NANO-0010"


def test_table_query_rejects_non_whitelisted_sort_column():
    with pytest.raises(ValueError, match="sortBy"):
        data_features.query_virtual_table(
            {"table": "participants", "sortBy": "dob", "page": 0, "pageSize": 10},
            {},
        )


def test_participant_table_excludes_phi_columns():
    result = data_features.query_virtual_table(
        {"table": "participants", "page": 0, "pageSize": 10},
        {
            "cohort_table": [
                {
                    "nano_id": "NANO-0001",
                    "name": "Example",
                    "mrn": "123",
                    "dob": "2024-01-01",
                }
            ]
        },
    )

    row = result["rows"][0]
    assert "dob" not in row
    assert "mrn" not in row
    assert "name" not in row
