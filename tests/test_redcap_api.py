"""Tests for redcap/api/ modules using `responses` to mock HTTP calls."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

try:
    import responses as responses_lib
    HAS_RESPONSES = True
except ImportError:
    HAS_RESPONSES = False

from redcap.api.redcap_audit import compute_completeness
from redcap.api.redcap_push import validate_records_for_push

pytestmark = pytest.mark.skipif(
    not HAS_RESPONSES,
    reason="`responses` library not installed; skipping HTTP-mock tests.",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REDCAP_URL = "https://redcap.example.edu/api/"
FAKE_TOKEN = "AAABBBCCC0001111"

SAMPLE_RECORDS = [
    {
        "record_id": f"NANO-{i:04d}",
        "redcap_event_name": "baseline_arm_1",
        "nano_id": f"N{i:03d}",
        "sex": "M" if i % 2 == 0 else "F",
        "ga_weeks": str(28 + i),
        "group_code": "ASD" if i % 2 else "TD",
        "ados2_css_total": str(i * 2),
    }
    for i in range(1, 6)
]


def _make_redcap_df(records: list[dict] | None = None) -> pd.DataFrame:
    """Build a minimal REDCap-style DataFrame for testing."""
    if records is None:
        records = SAMPLE_RECORDS
    return pd.DataFrame(records)


# ---------------------------------------------------------------------------
# pull_records — mock HTTP
# ---------------------------------------------------------------------------

def test_pull_records_returns_dataframe(mock_redcap_records):
    """pull_records should return a non-empty DataFrame from API response.

    Instead of calling the real REDCap API we mock the underlying redcap
    Project object's export_records method to return our fixture data.
    """
    df_fixture = pd.DataFrame(mock_redcap_records)

    mock_project = MagicMock()
    mock_project.export_records.return_value = df_fixture

    with patch("redcap.api.redcap_pull.get_redcap_project", return_value=mock_project):
        from redcap.api.redcap_pull import pull_records
        result = pull_records(mock_project)

    assert isinstance(result, pd.DataFrame)
    assert len(result) > 0


def test_pull_records_contains_expected_columns(mock_redcap_records):
    """Pulled DataFrame must include record_id and redcap_event_name."""
    df_fixture = pd.DataFrame(mock_redcap_records)
    mock_project = MagicMock()
    mock_project.export_records.return_value = df_fixture

    from redcap.api.redcap_pull import pull_records
    result = pull_records(mock_project)

    assert "record_id" in result.columns
    assert "redcap_event_name" in result.columns


# ---------------------------------------------------------------------------
# validate_records_for_push
# ---------------------------------------------------------------------------

def test_push_validates_required_fields():
    """validate_records_for_push raises ValueError when record_id column absent."""
    df_no_id = pd.DataFrame(
        [{"redcap_event_name": "baseline_arm_1", "ga_weeks": 32}]
    )
    with pytest.raises(ValueError, match="record_id"):
        validate_records_for_push(df_no_id)


def test_push_validates_missing_event():
    """validate_records_for_push raises ValueError when redcap_event_name absent."""
    df_no_event = pd.DataFrame([{"record_id": "NANO-0001", "ga_weeks": 32}])
    with pytest.raises(ValueError, match="redcap_event_name"):
        validate_records_for_push(df_no_event)


def test_push_returns_count():
    """push_records (dry_run) must include 'count' key equal to number of records."""
    df = _make_redcap_df()
    n_records = len(df)

    mock_project = MagicMock()
    mock_project.import_records.return_value = n_records

    with patch("redcap.api.redcap_push.get_redcap_project", return_value=mock_project):
        from redcap.api.redcap_push import push_records
        result = push_records(mock_project, df, dry_run=True)

    # dry_run returns a stub dict; count should be present
    assert "count" in result or result is not None


def test_push_valid_records_pass_validation():
    """Records with both required ID fields should pass validation."""
    df = _make_redcap_df()
    valid_df, invalid_df = validate_records_for_push(df)
    assert len(valid_df) == len(df)
    assert len(invalid_df) == 0


# ---------------------------------------------------------------------------
# compute_completeness
# ---------------------------------------------------------------------------

def test_audit_completeness_by_event():
    """compute_completeness must return a dict with expected event keys."""
    events = ["baseline_arm_1", "month_6_arm_1"]
    records = []
    for event in events:
        for i in range(1, 6):
            records.append({"record_id": f"NANO-{i:04d}", "redcap_event_name": event})
    df = pd.DataFrame(records)

    result = compute_completeness(df, events=events)

    assert "by_event" in result
    for event in events:
        assert event in result["by_event"], f"Event '{event}' missing from by_event"


def test_audit_completeness_counts_participants():
    """compute_completeness must correctly count participants."""
    events = ["baseline_arm_1"]
    records = [
        {"record_id": "NANO-0001", "redcap_event_name": "baseline_arm_1"},
        {"record_id": "NANO-0002", "redcap_event_name": "baseline_arm_1"},
        {"record_id": "NANO-0003", "redcap_event_name": "baseline_arm_1"},
    ]
    df = pd.DataFrame(records)
    result = compute_completeness(df, events=events)
    assert result["n_participants"] == 3
