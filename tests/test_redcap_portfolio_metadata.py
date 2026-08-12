"""Tests for the REDCap metadata watcher artifact.

The read-only, no-item-text, no-record-data, and small-cell guarantees are
enforced in code, so they are asserted here rather than left to review.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping

import pytest

from redcap.api.multi_project import (
    RedcapApiClient,
    RedcapRequestError,
    load_portfolio_config,
)
from redcap.api.portfolio_metadata import (
    OUTPUT_SCHEMA,
    ProjectSnapshot,
    ReadOnlyRedcapClient,
    ReadOnlyViolation,
    RequestPacer,
    assert_no_tokens,
    build_field_inventory,
    build_instrument_matrix,
    build_metadata_payload,
    build_overlap,
    build_project_entry,
    fetch_project_snapshot,
    quality_signals,
    summarize_completion,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PROJECT_ROOT / "config" / "redcap_projects.yml"

# Verbatim wording of a licensed instrument item, and a participant identifier.
# Neither may survive into the published artifact.
LICENSED_ITEM_TEXT = "Does your child point to show you something interesting?"
PARTICIPANT_ID = "PRIVATE-RECORD-0001"


@pytest.fixture()
def portfolio_config():
    return load_portfolio_config(CONFIG_PATH)


@pytest.fixture()
def spec(portfolio_config):
    return next(
        item for item in portfolio_config.projects if item.key == "nano_surveys"
    )


class FakeResponse:
    def __init__(self, payload: Any, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def json(self) -> Any:
        return self._payload


class MetadataSession:
    """Serve one project's export responses and record every request made."""

    def __init__(self, *, longitudinal: bool = True, records: int = 6) -> None:
        self.longitudinal = longitudinal
        self.records = records
        self.calls: list[dict[str, Any]] = []

    def post(
        self, url: str, *, data: Mapping[str, Any], timeout: float
    ) -> FakeResponse:
        self.calls.append(dict(data))
        content = data["content"]

        if content == "project":
            return FakeResponse(
                {
                    "project_id": 4218,
                    "project_title": "NANO Study Surveys",
                    "is_longitudinal": "1" if self.longitudinal else "0",
                    "has_repeating_instruments_or_events": "1",
                    "surveys_enabled": "1",
                }
            )
        if content == "metadata":
            return FakeResponse(
                [
                    {
                        "field_name": "record_id",
                        "form_name": "demographics",
                        "field_type": "text",
                        "field_label": LICENSED_ITEM_TEXT,
                    },
                    {
                        "field_name": "demo_mrn",
                        "form_name": "demographics",
                        "field_type": "text",
                        "field_label": LICENSED_ITEM_TEXT,
                        "identifier": "y",
                    },
                    {
                        "field_name": "csbs_q1",
                        "form_name": "csbs",
                        "field_type": "radio",
                        "field_label": LICENSED_ITEM_TEXT,
                        "select_choices_or_calculations": "1, Yes | 2, No",
                        "required_field": "y",
                        "branching_logic": "[age] > 6",
                        "field_note": "internal note",
                    },
                    {
                        "field_name": "csbs_score",
                        "form_name": "csbs",
                        "field_type": "calc",
                        "field_label": LICENSED_ITEM_TEXT,
                        "text_validation_type_or_show_slider_number": "number",
                    },
                ]
            )
        if content == "instrument":
            return FakeResponse(
                [
                    {
                        "instrument_name": "demographics",
                        "instrument_label": "Demographics",
                    },
                    {"instrument_name": "csbs", "instrument_label": "CSBS"},
                ]
            )
        if content == "event":
            if not self.longitudinal:
                return FakeResponse({"error": "not longitudinal"})
            return FakeResponse(
                [
                    {"unique_event_name": "baseline_arm_1", "event_name": "Baseline"},
                    {"unique_event_name": "followup_arm_1", "event_name": "Follow-up"},
                ]
            )
        if content == "formEventMapping":
            if not self.longitudinal:
                return FakeResponse({"error": "not longitudinal"})
            return FakeResponse(
                [
                    {"unique_event_name": "baseline_arm_1", "form": "demographics"},
                    {"unique_event_name": "baseline_arm_1", "form": "csbs"},
                    {"unique_event_name": "followup_arm_1", "form": "csbs"},
                ]
            )
        if content == "record":
            fields = {value for key, value in data.items() if key.startswith("fields[")}
            assert fields == {"record_id", "demographics_complete", "csbs_complete"}
            return FakeResponse(
                [
                    {
                        "record_id": f"{PARTICIPANT_ID}-{index}",
                        "redcap_event_name": "baseline_arm_1",
                        "demographics_complete": "2",
                        "csbs_complete": "2" if index % 2 else "1",
                    }
                    for index in range(1, self.records + 1)
                ]
            )
        raise AssertionError(f"unexpected export content: {content}")


def read_only_client(session: MetadataSession) -> ReadOnlyRedcapClient:
    return ReadOnlyRedcapClient(
        RedcapApiClient(
            "https://redcap.invalid/api/",
            "test-secret-token-value",
            session=session,
        )
    )


# --- read-only enforcement -------------------------------------------------


def test_client_refuses_a_content_type_outside_the_export_allowlist():
    session = MetadataSession()
    client = read_only_client(session)
    with pytest.raises(ReadOnlyViolation):
        client.export("userRole")
    assert session.calls == []


def test_client_refuses_any_request_carrying_a_write_parameter():
    session = MetadataSession()
    client = read_only_client(session)
    for parameter in ("action", "data", "returnContent", "overwriteBehavior"):
        with pytest.raises(ReadOnlyViolation):
            client.export("record", **{parameter: "import"})
    assert session.calls == []


def test_longitudinal_only_exports_degrade_to_empty_on_a_classic_project():
    session = MetadataSession(longitudinal=False)
    client = read_only_client(session)
    assert client.export_list("event") == []
    assert client.export_list("formEventMapping") == []


def test_a_genuine_api_failure_still_propagates():
    class FailingSession:
        def post(self, url: str, *, data: Mapping[str, Any], timeout: float):
            return FakeResponse({"error": "bad token"})

    client = ReadOnlyRedcapClient(
        RedcapApiClient(
            "https://redcap.invalid/api/", "token", session=FailingSession()
        )
    )
    with pytest.raises(RedcapRequestError):
        client.export_list("metadata")


def test_pacer_waits_only_between_calls():
    slept: list[float] = []
    # Call one lands at t=0, call two arrives at t=0.1 and must wait out the
    # remaining 1.15s, and the post-sleep read confirms the new floor.
    clock = iter([0.0, 0.1, 1.25])
    pacer = RequestPacer(1.25, sleep=slept.append, monotonic=lambda: next(clock))
    pacer.wait()
    assert slept == []
    pacer.wait()
    assert slept == [pytest.approx(1.15)]


# --- fetch and aggregation -------------------------------------------------


def test_fetch_requests_only_export_content_and_completion_fields(spec):
    session = MetadataSession()
    fetch_project_snapshot(spec, read_only_client(session))

    contents = [call["content"] for call in session.calls]
    assert contents == [
        "project",
        "metadata",
        "instrument",
        "event",
        "formEventMapping",
        "record",
    ]
    for call in session.calls:
        assert not {"action", "data", "returnContent"} & set(call)


def test_snapshot_withholds_identifier_fields_but_still_counts_them(spec):
    snapshot = fetch_project_snapshot(spec, read_only_client(MetadataSession()))

    assert snapshot.identifier_fields_withheld == 1
    assert "demo_mrn" not in {item["field_name"] for item in snapshot.fields}
    # Published plus withheld reconciles against REDCap's own field count.
    assert len(snapshot.fields) + snapshot.identifier_fields_withheld == 4


def test_snapshot_carries_no_item_text_or_record_identifier(spec):
    snapshot = fetch_project_snapshot(spec, read_only_client(MetadataSession()))
    serialized = json.dumps(
        {
            "fields": snapshot.fields,
            "instruments": snapshot.instruments,
            "events": snapshot.events,
        }
    )
    assert LICENSED_ITEM_TEXT not in serialized
    assert PARTICIPANT_ID not in serialized
    assert "internal note" not in serialized


def test_completion_is_summarized_per_form_and_per_event():
    rows = [
        {
            "record_id": f"{PARTICIPANT_ID}-{index}",
            "redcap_event_name": "baseline_arm_1",
            "demographics_complete": "2",
            "csbs_complete": "",
        }
        for index in range(1, 4)
    ]
    rows.append(
        {
            "record_id": f"{PARTICIPANT_ID}-1",
            "redcap_event_name": "followup_arm_1",
            "demographics_complete": "0",
            "csbs_complete": "1",
        }
    )

    summary = summarize_completion(
        rows, primary_key="record_id", forms=["demographics", "csbs"]
    )

    assert summary["record_count"] == 3
    assert summary["row_count"] == 4
    assert summary["form_completion"]["demographics"]["complete"] == 3
    assert summary["form_completion"]["demographics"]["incomplete"] == 1
    assert summary["form_completion"]["csbs"]["not_started"] == 3
    assert summary["form_completion"]["csbs"]["unverified"] == 1
    assert summary["event_records"]["baseline_arm_1"] == 3
    assert summary["event_rows"]["followup_arm_1"] == 1


def test_form_event_mapping_drives_the_event_count_per_instrument(spec):
    snapshot = fetch_project_snapshot(spec, read_only_client(MetadataSession()))
    assert snapshot.form_events["demographics"] == {"baseline_arm_1"}
    assert snapshot.form_events["csbs"] == {"baseline_arm_1", "followup_arm_1"}


# --- published payload -----------------------------------------------------


def snapshots_for(portfolio_config, *, records: int = 6) -> list[ProjectSnapshot]:
    """One healthy snapshot per configured project, plus one failure."""
    built: list[ProjectSnapshot] = []
    for index, item in enumerate(portfolio_config.projects):
        if index == 0:
            built.append(
                ProjectSnapshot(spec=item, status="error", error_code="missing_token")
            )
            continue
        built.append(
            fetch_project_snapshot(
                item, read_only_client(MetadataSession(records=records))
            )
        )
    return built


def test_payload_declares_its_own_safety_properties(portfolio_config):
    payload = build_metadata_payload(portfolio_config, snapshots_for(portfolio_config))

    assert payload["schema"] == OUTPUT_SCHEMA
    assert payload["aggregate_only"] is True
    assert payload["contains_item_text"] is False
    assert payload["contains_record_data"] is False
    assert payload["identifier_fields_withheld"] is True
    assert payload["read_only"] is True
    assert payload["small_cell_threshold"] == portfolio_config.small_cell_threshold


def test_payload_never_carries_item_text_or_record_identifiers(portfolio_config):
    payload = build_metadata_payload(portfolio_config, snapshots_for(portfolio_config))
    serialized = json.dumps(payload)

    assert LICENSED_ITEM_TEXT not in serialized
    assert PARTICIPANT_ID not in serialized
    assert "demo_mrn" not in serialized


def test_failed_projects_are_listed_with_a_stable_code_only(portfolio_config):
    payload = build_metadata_payload(portfolio_config, snapshots_for(portfolio_config))

    assert payload["projects_ok"] == payload["projects_total"] - 1
    assert payload["failed"] == [
        {
            "key": portfolio_config.projects[0].key,
            "study": portfolio_config.projects[0].study,
            "title": portfolio_config.projects[0].expected_title,
            "error": "missing_token",
        }
    ]


def test_counts_below_the_small_cell_threshold_are_suppressed(portfolio_config, spec):
    threshold = portfolio_config.small_cell_threshold
    snapshot = fetch_project_snapshot(
        spec, read_only_client(MetadataSession(records=threshold - 1))
    )
    entry = build_project_entry(snapshot, threshold=threshold)

    assert entry["records"] is None
    assert entry["record_events"] is None
    assert entry["completion"]["suppressed"] is True
    assert entry["completion"]["complete"] is None
    assert entry["completion"]["rate"] is None
    # Structure is design metadata, not participant data, so it stays exact.
    assert entry["instruments"] == 2
    assert entry["fields"] == 4


def test_counts_at_or_above_the_threshold_are_published(portfolio_config, spec):
    snapshot = fetch_project_snapshot(
        spec, read_only_client(MetadataSession(records=12))
    )
    entry = build_project_entry(
        snapshot, threshold=portfolio_config.small_cell_threshold
    )

    assert entry["records"] == 12
    assert entry["completion"]["suppressed"] is False
    # 12 demographics complete + 6 csbs complete, against 6 csbs unverified.
    assert entry["completion"]["complete"] == 18
    assert entry["completion"]["unverified"] == 6
    assert entry["completion"]["started"] == 24
    assert entry["completion"]["rate"] == 75.0


def test_one_small_bucket_suppresses_the_whole_completion_block(portfolio_config, spec):
    # Six records leave csbs with three unverified forms. Publishing the other
    # buckets and the total would make that three recoverable by subtraction.
    snapshot = fetch_project_snapshot(
        spec, read_only_client(MetadataSession(records=6))
    )
    entry = build_project_entry(
        snapshot, threshold=portfolio_config.small_cell_threshold
    )

    assert entry["records"] == 6
    assert entry["completion"]["suppressed"] is True
    assert entry["completion"]["complete"] is None
    assert entry["completion"]["started"] is None


def test_instrument_rows_carry_field_and_event_counts(portfolio_config, spec):
    snapshot = fetch_project_snapshot(spec, read_only_client(MetadataSession()))
    entry = build_project_entry(
        snapshot, threshold=portfolio_config.small_cell_threshold
    )
    rows = {row["name"]: row for row in entry["instrument_rows"]}

    assert rows["csbs"]["fields"] == 2
    assert rows["csbs"]["events"] == 2
    # demographics has two fields in REDCap, one of them a withheld identifier.
    assert rows["demographics"]["fields"] == 1
    assert rows["demographics"]["events"] == 1


def test_quality_signals_describe_structure_not_participants(portfolio_config, spec):
    snapshot = fetch_project_snapshot(spec, read_only_client(MetadataSession()))
    signals = {item["check"]: item["count"] for item in quality_signals(snapshot)}

    assert signals["Required fields"] == 1
    assert signals["Fields with branching logic"] == 1
    assert signals["Calculated fields"] == 1
    assert signals["Unvalidated free text"] == 1
    assert signals["Identifier fields withheld"] == 1
    assert signals["Instruments not mapped to an event"] == 0


def test_instrument_matrix_reports_shared_forms_across_projects(portfolio_config):
    payload = build_metadata_payload(portfolio_config, snapshots_for(portfolio_config))
    matrix = {row["name"]: row for row in payload["matrix"]}

    # Seven healthy projects all define the same two instruments in this stub.
    assert matrix["csbs"]["project_count"] == 7
    assert matrix["csbs"]["study_count"] == 5
    assert payload["overlap"]["keys"] == [
        item.key for item in portfolio_config.projects[1:]
    ]
    assert payload["overlap"]["cells"][0][1] == 2


def test_field_inventory_is_dictionary_encoded_without_labels(portfolio_config):
    payload = build_metadata_payload(portfolio_config, snapshots_for(portfolio_config))
    inventory = payload["fields"]

    assert inventory["types"] == ["text", "radio", "calc"]
    assert set(inventory["forms"]) == {"demographics", "csbs"}
    # project, form, type, validation, name, choices, flags -- and nothing else.
    assert all(len(row) == 7 for row in inventory["rows"])
    names = {row[4] for row in inventory["rows"]}
    assert names == {"record_id", "csbs_q1", "csbs_score"}
    assert "demo_mrn" not in names


def test_field_flags_encode_required_branching_and_validation(portfolio_config):
    payload = build_metadata_payload(portfolio_config, snapshots_for(portfolio_config))
    rows = {row[4]: row for row in payload["fields"]["rows"]}

    assert rows["csbs_q1"][6] == 1 | 2  # required + branching, no validation
    assert rows["csbs_score"][6] == 4  # validated only
    assert rows["record_id"][6] == 0
    assert rows["csbs_q1"][5] == 2  # two answer options, no option text


def test_study_enrollment_uses_the_authority_project_only(portfolio_config):
    payload = build_metadata_payload(portfolio_config, snapshots_for(portfolio_config))
    nano = next(item for item in payload["studies"] if item["key"] == "nano")

    # Two NANO projects report six records each; enrollment is not their sum.
    assert nano["projects_total"] == 2
    assert nano["records"] == 6
    assert nano["instruments"] == 4


def test_data_version_is_stable_except_for_the_timestamp(portfolio_config):
    snapshots = snapshots_for(portfolio_config)
    first = build_metadata_payload(
        portfolio_config, snapshots, generated_at="2026-01-01T00:00:00Z"
    )
    second = build_metadata_payload(
        portfolio_config, snapshots, generated_at="2026-06-01T12:00:00Z"
    )

    assert first["data_version"] == second["data_version"]
    assert first["generated_at"] != second["generated_at"]


def test_matrix_and_overlap_ignore_failed_projects(portfolio_config):
    snapshots = [
        ProjectSnapshot(spec=item, status="error", error_code="network_error")
        for item in portfolio_config.projects
    ]
    payload = build_metadata_payload(portfolio_config, snapshots)

    assert payload["projects_ok"] == 0
    assert payload["matrix"] == []
    assert payload["overlap"] == {"keys": [], "cells": []}
    assert payload["fields"]["rows"] == []


# --- publication guard -----------------------------------------------------


def test_token_scan_rejects_a_payload_containing_a_token():
    with pytest.raises(ReadOnlyViolation):
        assert_no_tokens({"note": "leaked ABCDEF0123456789"}, ["ABCDEF0123456789"])


def test_token_scan_ignores_short_or_empty_values():
    assert_no_tokens({"status": "ok"}, ["", "   ", "abc"])


def test_helpers_tolerate_an_empty_portfolio():
    assert build_instrument_matrix([]) == []
    assert build_overlap([]) == {"keys": [], "cells": []}
    assert build_field_inventory([])["rows"] == []
