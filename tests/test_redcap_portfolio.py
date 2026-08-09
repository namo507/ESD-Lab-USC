"""Fake-HTTP tests for the aggregate-only REDCap portfolio contract."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Mapping

import pytest

from redcap.api.multi_project import (
    OUTPUT_SCHEMA,
    REQUIRED_PROJECTS,
    PortfolioSyncError,
    RedcapApiClient,
    RedcapRequestError,
    load_portfolio_config,
    sync_portfolio,
    write_json_atomic,
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = PROJECT_ROOT / "config" / "redcap_projects.yml"


class FakeResponse:
    def __init__(self, payload: Any, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def json(self) -> Any:
        return self._payload


class PortfolioSession:
    """Route fake HTTP responses by the opaque token supplied by each test."""

    def __init__(self, token_to_project: Mapping[str, str]) -> None:
        self.token_to_project = dict(token_to_project)
        self.calls: list[dict[str, Any]] = []
        self.title_override: dict[str, str] = {}

    @staticmethod
    def primary_key(project_key: str) -> str:
        if project_key == "nico":
            return "id"
        if project_key == "nano_lab":
            return "record_id"
        return "demo_id"

    def post(
        self, url: str, *, data: Mapping[str, Any], timeout: float
    ) -> FakeResponse:
        call = {"url": url, "data": dict(data), "timeout": timeout}
        self.calls.append(call)
        project_key = self.token_to_project[str(data["token"])]
        expected = REQUIRED_PROJECTS[project_key]
        content = data["content"]
        primary_key = self.primary_key(project_key)

        if content == "project":
            return FakeResponse(
                {
                    "project_id": expected["expected_project_id"],
                    "project_title": self.title_override.get(
                        project_key, expected["expected_title"]
                    ),
                }
            )
        if content == "metadata":
            return FakeResponse(
                [
                    {
                        "field_name": primary_key,
                        "form_name": "demographics",
                    },
                    {"field_name": "non_public_value", "form_name": "visit"},
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

        selected_records = [
            data[key] for key in sorted(data) if key.startswith("records[")
        ]
        if not selected_records:
            rows = [
                {
                    primary_key: f"PRIVATE-{project_key}-{index}",
                    "redcap_event_name": "baseline_arm_1",
                }
                for index in range(1, 7)
            ]
            rows.extend(
                {
                    primary_key: f"PRIVATE-{project_key}-{index}",
                    "redcap_event_name": "followup_arm_1",
                }
                for index in range(1, 5)
            )
            return FakeResponse(rows)

        return FakeResponse(
            [
                {
                    primary_key: record,
                    "redcap_event_name": "baseline_arm_1",
                    "demographics_complete": "2",
                    "visit_complete": "1" if index % 2 else "0",
                }
                for index, record in enumerate(selected_records, start=1)
            ]
        )


@pytest.fixture()
def portfolio_config():
    return load_portfolio_config(CONFIG_PATH)


@pytest.fixture()
def fake_environment(portfolio_config):
    environment = {portfolio_config.api_url_env: "https://redcap.invalid/api/"}
    for spec in portfolio_config.projects:
        environment[spec.token_env] = f"test-secret-for-{spec.key}"
    return environment


@pytest.fixture()
def fake_session(portfolio_config, fake_environment):
    token_to_project = {
        fake_environment[spec.token_env]: spec.key for spec in portfolio_config.projects
    }
    return PortfolioSession(token_to_project)


def test_config_has_fixed_five_studies_and_eight_projects(portfolio_config):
    assert [study.key for study in portfolio_config.studies] == [
        "abc",
        "ipsa",
        "action",
        "nico",
        "nano",
    ]
    assert len(portfolio_config.projects) == 8
    assert {project.token_env for project in portfolio_config.projects} == {
        expected["token_env"] for expected in REQUIRED_PROJECTS.values()
    }
    assert (
        sum(project.enrollment_authority for project in portfolio_config.projects) == 5
    )
    assert (
        next(study for study in portfolio_config.studies if study.key == "nano").target
        == 260
    )
    assert portfolio_config.refresh_cadence_seconds == 300
    assert portfolio_config.sla_seconds == 900


def test_sync_emits_aggregate_only_portfolio_contract(
    portfolio_config, fake_environment, fake_session
):
    payload = sync_portfolio(
        portfolio_config,
        environ=fake_environment,
        session=fake_session,
        require_all=True,
        generated_at="2026-08-07T12:00:00Z",
        sleep=lambda _: None,
    )

    assert payload["schema"] == OUTPUT_SCHEMA
    assert payload["aggregate_only"] is True
    assert payload["source"] == {
        "kind": "live",
        "transport": "api",
        "system": "REDCap",
        "cadence": "every_5_minutes",
        "sla": {"max_age_minutes": 15},
        "projects_total": 8,
        "projects_ok": 8,
    }
    assert payload["portfolio"]["status"] == "ok"
    assert payload["portfolio"]["study_enrollments"] == 30
    assert payload["portfolio"]["study_enrollments"] != sum(
        project["records"] for project in payload["projects"]
    )

    nano = next(study for study in payload["studies"] if study["key"] == "nano")
    assert nano["target"] == 260
    assert nano["enrollment"] == 6
    assert nano["event_records"] is None
    assert nano["event_records_suppressed"] is True
    assert nano["events"] == [
        {"event": "baseline_arm_1", "records": 6, "suppressed": False},
        {"event": "followup_arm_1", "records": None, "suppressed": True},
    ]
    assert nano["forms"]["counts_suppressed"] is True
    assert all(
        nano["forms"][bucket] is None
        for bucket in (
            "incomplete",
            "unverified",
            "complete",
            "unknown",
            "total",
            "completion_rate",
        )
    )

    # Totals must not make a suppressed small cell recoverable by subtraction.
    assert payload["portfolio"]["event_records"] is None
    assert payload["portfolio"]["event_records_suppressed"] is True
    assert payload["portfolio"]["forms"]["counts_suppressed"] is True
    assert payload["portfolio"]["forms"]["total"] is None

    nano_project = next(
        project for project in payload["projects"] if project["key"] == "nano_surveys"
    )
    assert nano_project["event_records"] is None
    assert nano_project["event_records_suppressed"] is True
    assert nano_project["forms"]["counts_suppressed"] is True
    assert nano_project["forms"]["total"] is None

    serialized = json.dumps(payload, sort_keys=True)
    assert "PRIVATE-" not in serialized
    for value in fake_environment.values():
        if value != fake_environment[portfolio_config.api_url_env]:
            assert value not in serialized


def test_record_exports_use_only_primary_key_and_completion_fields(
    portfolio_config, fake_environment, fake_session
):
    sync_portfolio(
        portfolio_config,
        environ=fake_environment,
        session=fake_session,
        require_all=True,
        sleep=lambda _: None,
    )

    for call in fake_session.calls:
        data = call["data"]
        if data["content"] != "record":
            continue
        project_key = fake_session.token_to_project[data["token"]]
        exported_fields = {
            value for key, value in data.items() if key.startswith("fields[")
        }
        assert exported_fields <= {
            fake_session.primary_key(project_key),
            "demographics_complete",
            "visit_complete",
        }
        assert "non_public_value" not in exported_fields
        assert call["timeout"] == 30.0


def test_data_version_is_deterministic_except_generated_at(
    portfolio_config, fake_environment
):
    first = sync_portfolio(
        portfolio_config,
        environ=fake_environment,
        session=PortfolioSession(
            {
                fake_environment[spec.token_env]: spec.key
                for spec in portfolio_config.projects
            }
        ),
        require_all=True,
        generated_at="2026-08-07T12:00:00Z",
        sleep=lambda _: None,
    )
    second = sync_portfolio(
        portfolio_config,
        environ=fake_environment,
        session=PortfolioSession(
            {
                fake_environment[spec.token_env]: spec.key
                for spec in portfolio_config.projects
            }
        ),
        require_all=True,
        generated_at="2026-08-07T12:05:00Z",
        sleep=lambda _: None,
    )

    assert first["generated_at"] != second["generated_at"]
    assert first["data_version"] == second["data_version"]
    assert first["data_version"].startswith("sha256:")
    assert len(first["data_version"]) == len("sha256:") + 64


def test_require_all_fails_closed_when_a_token_is_missing(
    portfolio_config, fake_environment, fake_session
):
    incomplete_environment = dict(fake_environment)
    incomplete_environment.pop(portfolio_config.projects[0].token_env)

    with pytest.raises(PortfolioSyncError, match="required_project_failed"):
        sync_portfolio(
            portfolio_config,
            environ=incomplete_environment,
            session=fake_session,
            require_all=True,
            sleep=lambda _: None,
        )


def test_partial_sync_reports_only_a_secret_safe_error_code(
    portfolio_config, fake_environment, fake_session
):
    fake_session.title_override["abc_surveys"] = "unexpected private title"
    payload = sync_portfolio(
        portfolio_config,
        environ=fake_environment,
        session=fake_session,
        require_all=False,
        sleep=lambda _: None,
    )

    failed = next(
        project for project in payload["projects"] if project["key"] == "abc_surveys"
    )
    assert failed["status"] == "error"
    assert failed["error"] == {"code": "project_title_mismatch"}
    assert failed["records"] is None
    assert payload["source"]["projects_ok"] == 7
    assert payload["portfolio"]["study_enrollments"] is None
    assert "unexpected private title" not in json.dumps(payload)


def test_client_retries_transient_http_without_exposing_token():
    class RetrySession:
        def __init__(self) -> None:
            self.calls = 0

        def post(self, url: str, *, data: Mapping[str, Any], timeout: float):
            self.calls += 1
            if self.calls < 3:
                return FakeResponse({}, status_code=503)
            return FakeResponse({"project_id": 1, "project_title": "Example"})

    session = RetrySession()
    client = RedcapApiClient(
        "https://redcap.invalid/api/",
        "do-not-leak-this-token",
        session=session,
        retries=3,
        backoff_seconds=0,
        sleep=lambda _: None,
    )
    assert client.project_info()["project_id"] == 1
    assert session.calls == 3

    failing = RedcapApiClient(
        "https://redcap.invalid/api/",
        "another-secret-token",
        session=RetrySession(),
        retries=2,
        backoff_seconds=0,
        sleep=lambda _: None,
    )
    with pytest.raises(RedcapRequestError) as exc_info:
        failing.project_info()
    assert str(exc_info.value) == "server_error"
    assert "token" not in str(exc_info.value)


def test_atomic_writer_replaces_artifact_without_temp_files(tmp_path):
    destination = tmp_path / "nested" / "dashboard_metrics.json"
    destination.parent.mkdir()
    destination.write_text('{"old": true}\n', encoding="utf-8")

    write_json_atomic({"schema": OUTPUT_SCHEMA}, destination)

    assert json.loads(destination.read_text(encoding="utf-8")) == {
        "schema": OUTPUT_SCHEMA
    }
    assert not list(destination.parent.glob(".dashboard_metrics.json.*.tmp"))
