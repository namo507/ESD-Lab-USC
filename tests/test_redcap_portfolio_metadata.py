"""Fake-HTTP tests for the REDCap portfolio metadata contract."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping

import pytest

from redcap.api.multi_project import (
    REQUIRED_PROJECTS,
    PortfolioSyncError,
    load_portfolio_config,
)
from redcap.api.portfolio_metadata import (
    FLAG_BRANCHING,
    FLAG_IDENTIFIER,
    FLAG_LABELLED,
    FLAG_REQUIRED,
    FLAG_VALIDATED,
    METADATA_SCHEMA,
    assert_no_tokens,
    field_inventory,
    sync_portfolio_metadata,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PROJECT_ROOT / "config" / "redcap_projects.yml"

LONGITUDINAL_PROJECTS = {"nano_surveys", "nico"}
EVENT_FORMS = {
    "baseline_arm_1": ("demographics", "visit"),
    "followup_arm_1": ("visit",),
}


class FakeResponse:
    def __init__(self, payload: Any, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def json(self) -> Any:
        return self._payload


class MetadataSession:
    """Serve deterministic export payloads keyed by each project's token."""

    def __init__(self, token_to_project: Mapping[str, str]) -> None:
        self.token_to_project = dict(token_to_project)
        self.calls: list[dict[str, Any]] = []
        self.record_count_override: dict[str, int] = {}
        self.failing_projects: set[str] = set()

    @staticmethod
    def primary_key(project_key: str) -> str:
        return "id" if project_key == "nico" else "record_id"

    @staticmethod
    def metadata_rows(primary_key: str) -> list[dict[str, Any]]:
        return [
            {
                "field_name": primary_key,
                "form_name": "demographics",
                "field_type": "text",
                "field_label": "Record ID",
                "text_validation_type_or_show_slider_number": "",
                "required_field": "",
                "identifier": "",
                "branching_logic": "",
                "select_choices_or_calculations": "",
                "field_note": "",
            },
            {
                "field_name": "mrn",
                "form_name": "demographics",
                "field_type": "text",
                "field_label": "<b>Medical record number</b>",
                "text_validation_type_or_show_slider_number": "integer",
                "required_field": "y",
                "identifier": "y",
                "branching_logic": "[consent] = '1'",
                "select_choices_or_calculations": "",
                "field_note": "internal use",
            },
            {
                "field_name": "visit_kind",
                "form_name": "visit",
                "field_type": "radio",
                "field_label": "",
                "text_validation_type_or_show_slider_number": "",
                "required_field": "",
                "identifier": "",
                "branching_logic": "",
                "select_choices_or_calculations": "1, Clinic | 2, Home",
                "field_note": "",
            },
        ]

    def post(
        self,
        url: str,
        *,
        data: Mapping[str, Any],
        timeout: float,
        allow_redirects: bool = True,
    ) -> FakeResponse:
        self.calls.append({"url": url, "data": dict(data), "timeout": timeout})
        assert allow_redirects is False
        project_key = self.token_to_project[str(data["token"])]
        expected = REQUIRED_PROJECTS[project_key]
        content = str(data["content"])
        primary_key = self.primary_key(project_key)
        longitudinal = project_key in LONGITUDINAL_PROJECTS

        if project_key in self.failing_projects:
            return FakeResponse({"error": "forbidden"}, status_code=200)

        if content == "project":
            return FakeResponse(
                {
                    "project_id": expected["expected_project_id"],
                    "project_title": expected["expected_title"],
                    "is_longitudinal": "1" if longitudinal else "0",
                    "has_repeating_instruments_or_events": "0",
                    "surveys_enabled": "1",
                }
            )
        if content == "metadata":
            return FakeResponse(self.metadata_rows(primary_key))
        if content == "instrument":
            return FakeResponse(
                [
                    {
                        "instrument_name": "demographics",
                        "instrument_label": "Demographics",
                    },
                    {"instrument_name": "visit", "instrument_label": "Visit"},
                ]
            )
        if content == "event":
            if not longitudinal:
                return FakeResponse({"error": "not longitudinal"})
            return FakeResponse(
                [
                    {
                        "unique_event_name": "baseline_arm_1",
                        "event_name": "Baseline",
                    },
                    {
                        "unique_event_name": "followup_arm_1",
                        "event_name": "Follow-up",
                    },
                ]
            )
        if content == "formEventMapping":
            if not longitudinal:
                return FakeResponse({"error": "not longitudinal"})
            return FakeResponse(
                [
                    {"unique_event_name": event, "form": form}
                    for event, forms in EVENT_FORMS.items()
                    for form in forms
                ]
            )
        if content != "record":
            raise AssertionError(f"unexpected fake request content: {content}")

        fields = [data[key] for key in sorted(data) if key.startswith("fields[")]
        assert set(fields) <= {
            primary_key,
            "demographics_complete",
            "visit_complete",
        }
        selected = [data[key] for key in sorted(data) if key.startswith("records[")]
        events = list(EVENT_FORMS) if longitudinal else ["default"]
        record_count = self.record_count_override.get(project_key, 6)
        records = selected or [
            f"PRIVATE-{project_key}-{index}" for index in range(1, record_count + 1)
        ]

        rows: list[dict[str, Any]] = []
        for record in records:
            for event in events:
                row: dict[str, Any] = {primary_key: record}
                if longitudinal:
                    row["redcap_event_name"] = event
                if "demographics_complete" in fields:
                    row["demographics_complete"] = "2"
                    row["visit_complete"] = "1" if event == "followup_arm_1" else "2"
                rows.append(row)
        return FakeResponse(rows)


@pytest.fixture()
def portfolio_config():
    return load_portfolio_config(CONFIG_PATH)


@pytest.fixture()
def fake_environment(portfolio_config):
    environment = {portfolio_config.api_url_env: "https://redcap.invalid/api/"}
    for spec in portfolio_config.projects:
        environment[spec.token_env] = f"metadata-secret-for-{spec.key}"
    return environment


@pytest.fixture()
def fake_session(portfolio_config, fake_environment):
    return MetadataSession(
        {
            fake_environment[spec.token_env]: spec.key
            for spec in portfolio_config.projects
        }
    )


def _sync(config, environment, session, **kwargs):
    return sync_portfolio_metadata(
        config,
        environ=environment,
        session=session,
        generated_at="2026-08-12T12:00:00Z",
        sleep=lambda _: None,
        **kwargs,
    )


def test_payload_describes_every_project_structure(
    portfolio_config, fake_environment, fake_session
):
    payload = _sync(portfolio_config, fake_environment, fake_session, require_all=True)

    assert payload["schema"] == METADATA_SCHEMA
    assert payload["aggregate_only"] is True
    assert payload["small_cell_threshold"] == 5
    assert payload["data_version"].startswith("sha256:")
    assert payload["source"]["kind"] == "live"
    assert payload["source"]["projects_ok"] == 8
    assert payload["source"]["cadence"] == "every_5_minutes"
    assert payload["failed"] == []
    assert len(payload["projects"]) == 8

    nano = next(row for row in payload["projects"] if row["key"] == "nano_surveys")
    assert nano["label"] == "NANO Surveys"
    assert nano["study_label"] == "NANO"
    assert nano["title"] == "NANO Study Surveys"
    assert nano["longitudinal"] is True
    assert nano["surveys"] is True
    assert nano["records"] == 6
    assert nano["rows"] == 12
    assert nano["instruments"] == 2
    assert nano["fields"] == 3
    assert nano["events"] == 2
    assert nano["identifier_fields"] == 1
    assert nano["required_fields"] == 1
    assert nano["branching_fields"] == 1
    assert nano["field_types"] == [["text", 2], ["radio", 1]]

    action = next(row for row in payload["projects"] if row["key"] == "action")
    assert action["label"] == "ACTION"
    assert action["longitudinal"] is False
    assert action["events"] == 1
    assert action["event_rows"][0]["name"] == "default"


def test_completion_counts_follow_the_event_designation(
    portfolio_config, fake_environment, fake_session
):
    payload = _sync(portfolio_config, fake_environment, fake_session, require_all=True)
    nano = next(row for row in payload["projects"] if row["key"] == "nano_surveys")

    demographics = next(
        row for row in nano["instrument_rows"] if row["name"] == "demographics"
    )
    visit = next(row for row in nano["instrument_rows"] if row["name"] == "visit")

    # Demographics is designated for baseline only: 6 records, not 12.
    assert demographics["complete"] == 6
    assert demographics["not_started"] == 0
    assert demographics["started"] == 6
    assert demographics["completion_rate"] == 100.0
    assert demographics["events"] == 1

    # Visit is on both events; the follow-up rows are unverified.
    assert visit["complete"] == 6
    assert visit["unverified"] == 6
    assert visit["started"] == 12
    assert visit["completion_rate"] == 50.0
    assert visit["events"] == 2

    assert nano["completion"]["complete"] == 12
    assert nano["completion"]["unverified"] == 6
    assert nano["completion"]["started"] == 18
    assert nano["completion"]["counts_suppressed"] is False

    followup = next(
        row for row in nano["event_rows"] if row["name"] == "followup_arm_1"
    )
    assert followup["label"] == "Follow-up"
    assert followup["records"] == 6
    assert followup["rows"] == 6
    assert followup["started"] == 6
    assert followup["completion_rate"] == 0.0


def test_small_cells_are_suppressed_and_propagate_to_totals(
    portfolio_config, fake_environment, fake_session
):
    fake_session.record_count_override["nico"] = 3
    payload = _sync(portfolio_config, fake_environment, fake_session, require_all=True)

    nico = next(row for row in payload["projects"] if row["key"] == "nico")
    assert nico["records"] is None
    assert nico["records_suppressed"] is True
    assert nico["rows"] is None
    assert nico["completion"]["counts_suppressed"] is True
    assert all(nico["completion"][key] is None for key in ("complete", "started"))
    assert nico["completion"]["completion_rate"] is None
    assert all(row["counts_suppressed"] for row in nico["instrument_rows"])
    assert all(row["records"] is None for row in nico["event_rows"])

    totals = payload["totals"]
    assert totals["records"] is None
    assert totals["records_suppressed"] is True
    assert totals["completion"]["counts_suppressed"] is True
    assert totals["completion"]["complete"] is None
    # Structural metadata is not participant data and stays visible.
    assert totals["instruments"] == 16
    assert totals["fields"] == 24


def test_failed_projects_degrade_without_blocking_the_payload(
    portfolio_config, fake_environment, fake_session
):
    fake_session.failing_projects.add("abc_lab")
    payload = _sync(portfolio_config, fake_environment, fake_session)

    assert payload["source"]["kind"] == "partial"
    assert payload["source"]["projects_ok"] == 7
    assert [row["key"] for row in payload["failed"]] == ["abc_lab"]
    assert payload["failed"][0]["detail"] == "api_error"
    assert payload["failed"][0]["label"] == "ABC Lab"
    assert all(row["key"] != "abc_lab" for row in payload["projects"])
    assert "abc_lab" not in payload["fields"]["projects"]

    with pytest.raises(PortfolioSyncError):
        _sync(portfolio_config, fake_environment, fake_session, require_all=True)


def test_missing_token_is_reported_without_network_calls(
    portfolio_config, fake_environment, fake_session
):
    fake_environment["REDCAP_NICO_TOKEN"] = ""
    payload = _sync(portfolio_config, fake_environment, fake_session)

    assert [row["key"] for row in payload["failed"]] == ["nico"]
    assert payload["failed"][0]["detail"] == "missing_token"
    assert payload["source"]["projects_ok"] == 7


def test_field_index_is_dictionary_encoded_with_flags(
    portfolio_config, fake_environment, fake_session
):
    payload = _sync(portfolio_config, fake_environment, fake_session, require_all=True)
    index = payload["fields"]

    assert len(index["projects"]) == 8
    assert index["forms"] == ["demographics", "visit"]
    assert set(index["types"]) == {"text", "radio"}
    assert len(index["rows"]) == 24

    mrn = next(row for row in index["rows"] if row[4] == "mrn")
    assert index["projects"][mrn[0]] == "abc_surveys"
    assert index["forms"][mrn[1]] == "demographics"
    assert index["types"][mrn[2]] == "text"
    assert index["validations"][mrn[3]] == "integer"
    # HTML markup is stripped from published labels.
    assert mrn[5] == "Medical record number"
    assert mrn[6] == "internal use"
    assert mrn[9] == (
        FLAG_REQUIRED | FLAG_IDENTIFIER | FLAG_BRANCHING | FLAG_LABELLED | FLAG_VALIDATED
    )

    visit_kind = next(row for row in index["rows"] if row[4] == "visit_kind")
    assert visit_kind[7] == "1, Clinic | 2, Home"
    assert visit_kind[8] == 2
    assert visit_kind[9] == 0


def test_instrument_matrix_and_quality_signals(
    portfolio_config, fake_environment, fake_session
):
    payload = _sync(portfolio_config, fake_environment, fake_session, require_all=True)

    assert [row["name"] for row in payload["matrix"]] == ["demographics", "visit"]
    assert payload["matrix"][0]["projects"] == 8
    assert len(payload["matrix"][0]["in"]) == 8

    nano = next(row for row in payload["projects"] if row["key"] == "nano_surveys")
    quality = {row["check"]: row["count"] for row in nano["quality"]}
    assert quality["Fields with no label"] == 1
    assert quality["Identifier-flagged fields"] == 1
    assert quality["Fields with branching logic"] == 1
    assert quality["Required fields"] == 1
    assert quality["Text fields without validation"] == 1
    assert quality["Instruments on no event"] == 0
    assert all(isinstance(row["detail"], str) and row["detail"] for row in nano["quality"])


def test_payload_never_carries_identifiers_or_tokens(
    portfolio_config, fake_environment, fake_session
):
    payload = _sync(portfolio_config, fake_environment, fake_session, require_all=True)
    serialized = json.dumps(payload, sort_keys=True)

    assert "PRIVATE-" not in serialized
    for name, value in fake_environment.items():
        if name != portfolio_config.api_url_env:
            assert value not in serialized

    contents = {str(call["data"]["content"]) for call in fake_session.calls}
    assert contents <= {
        "project",
        "metadata",
        "instrument",
        "event",
        "formEventMapping",
        "record",
    }
    write_parameters = {
        "action",
        "data",
        "returnContent",
        "overwriteBehavior",
        "forceAutoNumber",
    }
    for call in fake_session.calls:
        assert not write_parameters & set(call["data"])


def test_assert_no_tokens_rejects_a_leaked_credential():
    payload = {"note": "token abcdef0123456789 leaked"}
    assert_no_tokens(payload, ["not-present"])
    with pytest.raises(PortfolioSyncError):
        assert_no_tokens(payload, ["abcdef0123456789"])


def test_field_inventory_defaults_unknown_shapes():
    fields = field_inventory(
        [
            {"field_name": "  ", "form_name": "x"},
            {"field_name": "loose", "field_type": ""},
        ]
    )
    assert len(fields) == 1
    assert fields[0].form == "unassigned"
    assert fields[0].field_type == "unknown"
    assert fields[0].flags == 0
