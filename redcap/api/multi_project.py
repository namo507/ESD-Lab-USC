"""Aggregate-only REDCap portfolio synchronization.

The client deliberately has a narrow export surface: it discovers each
project's primary key from metadata, exports that key plus generated
``*_complete`` fields, aggregates in memory, and returns no record-level data.
API tokens are accepted only as runtime values and are never logged or added to
exceptions or output payloads.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import tempfile
import time
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping, MutableMapping, Sequence

import requests
import yaml  # type: ignore[import-untyped]

LOGGER = logging.getLogger(__name__)

OUTPUT_SCHEMA = "dashboard.metrics.v1"
CONFIG_SCHEMA = "redcap.portfolio.v1"

REQUIRED_STUDIES = ("abc", "ipsa", "action", "nico", "nano")
REQUIRED_PROJECTS: Mapping[str, Mapping[str, Any]] = {
    "abc_surveys": {
        "study": "abc",
        "role": "surveys",
        "enrollment_authority": True,
        "token_env": "REDCAP_ABC_SURVEYS_TOKEN",
        "expected_project_id": 1140,
        "expected_title": "ABC Study Surveys",
    },
    "ipsa_surveys": {
        "study": "ipsa",
        "role": "surveys",
        "enrollment_authority": True,
        "token_env": "REDCAP_IPSA_SURVEYS_TOKEN",
        "expected_project_id": 1289,
        "expected_title": "IPSA Study Surveys and Data Entry",
    },
    "action": {
        "study": "action",
        "role": "combined",
        "enrollment_authority": True,
        "token_env": "REDCAP_ACTION_TOKEN",
        "expected_project_id": 1556,
        "expected_title": "ACTION Study",
    },
    "ipsa_lab": {
        "study": "ipsa",
        "role": "assessments",
        "enrollment_authority": False,
        "token_env": "REDCAP_IPSA_LAB_TOKEN",
        "expected_project_id": 2084,
        "expected_title": "IPSA Lab Assessments and Double Data Entry",
    },
    "abc_lab": {
        "study": "abc",
        "role": "assessments",
        "enrollment_authority": False,
        "token_env": "REDCAP_ABC_LAB_TOKEN",
        "expected_project_id": 2263,
        "expected_title": "ABC Study (Lab Assessments and Double Data Entry)",
    },
    "nico": {
        "study": "nico",
        "role": "combined",
        "enrollment_authority": True,
        "token_env": "REDCAP_NICO_TOKEN",
        "expected_project_id": 3836,
        "expected_title": "NICO Study",
    },
    "nano_surveys": {
        "study": "nano",
        "role": "surveys",
        "enrollment_authority": True,
        "token_env": "REDCAP_NANO_SURVEYS_TOKEN",
        "expected_project_id": 4218,
        "expected_title": "NANO Study Surveys",
    },
    "nano_lab": {
        "study": "nano",
        "role": "assessments",
        "enrollment_authority": False,
        "token_env": "REDCAP_NANO_LAB_TOKEN",
        "expected_project_id": 5484,
        "expected_title": "NANO Lab Assessments & Double Data Entry",
    },
}


class PortfolioConfigError(ValueError):
    """Raised for a non-secret portfolio configuration error."""


class RedcapRequestError(RuntimeError):
    """A REDCap failure whose public string contains only a stable error code."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class PortfolioSyncError(RuntimeError):
    """Raised when a required all-project synchronization is incomplete."""

    def __init__(self, code: str = "required_project_failed") -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class StudySpec:
    key: str
    label: str
    target: int | None


@dataclass(frozen=True)
class ProjectSpec:
    key: str
    study: str
    role: str
    enrollment_authority: bool
    token_env: str
    expected_project_id: int
    expected_title: str


@dataclass(frozen=True)
class PortfolioConfig:
    api_url_env: str
    refresh_cadence_seconds: int
    sla_seconds: int
    small_cell_threshold: int
    timeout_seconds: float
    retries: int
    backoff_seconds: float
    record_batch_size: int
    studies: tuple[StudySpec, ...]
    projects: tuple[ProjectSpec, ...]


@dataclass
class ProjectResult:
    spec: ProjectSpec
    status: str
    error_code: str | None = None
    primary_key_field: str | None = None
    record_count: int | None = None
    event_counts: Counter[str] | None = None
    instruments_total: int | None = None
    form_counts: Counter[str] | None = None


def _required_mapping(value: Any, name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise PortfolioConfigError(f"invalid_{name}")
    return value


def _positive_int(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise PortfolioConfigError(f"invalid_{name}")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise PortfolioConfigError(f"invalid_{name}") from exc
    if parsed <= 0:
        raise PortfolioConfigError(f"invalid_{name}")
    return parsed


def _nonnegative_float(value: Any, name: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise PortfolioConfigError(f"invalid_{name}") from exc
    if parsed < 0:
        raise PortfolioConfigError(f"invalid_{name}")
    return parsed


def load_portfolio_config(path: str | Path) -> PortfolioConfig:
    """Load and strictly validate the fixed eight-project portfolio map."""

    config_path = Path(path)
    try:
        raw = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise PortfolioConfigError("config_unreadable") from exc

    root = _required_mapping(raw, "config")
    if root.get("schema") != CONFIG_SCHEMA:
        raise PortfolioConfigError("unsupported_config_schema")

    raw_studies = root.get("studies")
    raw_projects = root.get("projects")
    if not isinstance(raw_studies, list) or not isinstance(raw_projects, list):
        raise PortfolioConfigError("invalid_portfolio_members")

    studies: list[StudySpec] = []
    for item in raw_studies:
        row = _required_mapping(item, "study")
        key = str(row.get("key", "")).strip()
        label = str(row.get("label", "")).strip()
        target_value = row.get("target")
        target = None if target_value is None else _positive_int(target_value, "target")
        if not key or not label:
            raise PortfolioConfigError("invalid_study")
        studies.append(StudySpec(key=key, label=label, target=target))

    if tuple(study.key for study in studies) != REQUIRED_STUDIES:
        raise PortfolioConfigError("unexpected_study_map")
    if len({study.key for study in studies}) != len(studies):
        raise PortfolioConfigError("duplicate_study")

    projects: list[ProjectSpec] = []
    for item in raw_projects:
        row = _required_mapping(item, "project")
        if not isinstance(row.get("enrollment_authority"), bool):
            raise PortfolioConfigError("invalid_enrollment_authority")
        try:
            spec = ProjectSpec(
                key=str(row["key"]),
                study=str(row["study"]),
                role=str(row["role"]),
                enrollment_authority=row["enrollment_authority"],
                token_env=str(row["token_env"]),
                expected_project_id=int(row["expected_project_id"]),
                expected_title=str(row["expected_title"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise PortfolioConfigError("invalid_project") from exc
        projects.append(spec)

    if set(project.key for project in projects) != set(REQUIRED_PROJECTS):
        raise PortfolioConfigError("unexpected_project_map")
    if len(projects) != len(REQUIRED_PROJECTS):
        raise PortfolioConfigError("duplicate_project")

    for spec in projects:
        expected = REQUIRED_PROJECTS[spec.key]
        for field_name, expected_value in expected.items():
            if getattr(spec, field_name) != expected_value:
                raise PortfolioConfigError(f"unexpected_project_{field_name}")

    authority_counts = Counter(
        project.study for project in projects if project.enrollment_authority
    )
    if authority_counts != Counter({key: 1 for key in REQUIRED_STUDIES}):
        raise PortfolioConfigError("invalid_enrollment_authorities")

    http = _required_mapping(root.get("http"), "http")
    api_url_env = str(root.get("api_url_env", "")).strip()
    if not api_url_env:
        raise PortfolioConfigError("missing_api_url_env")

    retries = _positive_int(http.get("retries"), "retries")
    return PortfolioConfig(
        api_url_env=api_url_env,
        refresh_cadence_seconds=_positive_int(
            root.get("refresh_cadence_seconds"), "refresh_cadence_seconds"
        ),
        sla_seconds=_positive_int(root.get("sla_seconds"), "sla_seconds"),
        small_cell_threshold=_positive_int(
            root.get("small_cell_threshold"), "small_cell_threshold"
        ),
        timeout_seconds=float(_positive_int(http.get("timeout_seconds"), "timeout")),
        retries=retries,
        backoff_seconds=_nonnegative_float(
            http.get("backoff_seconds"), "backoff_seconds"
        ),
        record_batch_size=_positive_int(
            http.get("record_batch_size"), "record_batch_size"
        ),
        studies=tuple(studies),
        projects=tuple(projects),
    )


class RedcapApiClient:
    """Minimal REDCap JSON API client with bounded retries and timeouts."""

    def __init__(
        self,
        api_url: str,
        token: str,
        *,
        session: Any | None = None,
        timeout_seconds: float = 30.0,
        retries: int = 3,
        backoff_seconds: float = 0.5,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._api_url = api_url
        self._token = token
        self._session = session or requests.Session()
        self._timeout_seconds = timeout_seconds
        self._retries = max(1, retries)
        self._backoff_seconds = max(0.0, backoff_seconds)
        self._sleep = sleep

    def _post(self, request_data: Mapping[str, Any]) -> Any:
        data: MutableMapping[str, Any] = {
            "token": self._token,
            "format": "json",
            "returnFormat": "json",
        }
        data.update(request_data)

        last_code = "network_error"
        for attempt in range(self._retries):
            try:
                response = self._session.post(
                    self._api_url,
                    data=data,
                    timeout=self._timeout_seconds,
                )
            except requests.RequestException:
                last_code = "network_error"
                if attempt + 1 < self._retries:
                    self._sleep(self._backoff_seconds * (2**attempt))
                    continue
                raise RedcapRequestError(last_code) from None

            status_code = int(getattr(response, "status_code", 0))
            if status_code == 429 or status_code >= 500:
                last_code = "rate_limited" if status_code == 429 else "server_error"
                if attempt + 1 < self._retries:
                    self._sleep(self._backoff_seconds * (2**attempt))
                    continue
                raise RedcapRequestError(last_code)
            if status_code < 200 or status_code >= 300:
                raise RedcapRequestError(f"http_{status_code}")

            try:
                payload = response.json()
            except (TypeError, ValueError):
                raise RedcapRequestError("invalid_json") from None
            if isinstance(payload, Mapping) and "error" in payload:
                raise RedcapRequestError("api_error")
            return payload

        raise RedcapRequestError(last_code)

    def project_info(self) -> Mapping[str, Any]:
        payload = self._post({"content": "project"})
        if not isinstance(payload, Mapping):
            raise RedcapRequestError("invalid_project_info")
        return payload

    def metadata(self) -> list[Mapping[str, Any]]:
        payload = self._post({"content": "metadata"})
        if not isinstance(payload, list) or not all(
            isinstance(row, Mapping) for row in payload
        ):
            raise RedcapRequestError("invalid_metadata")
        return payload

    def records(
        self, fields: Sequence[str], records: Sequence[str] | None = None
    ) -> list[Mapping[str, Any]]:
        request_data: dict[str, Any] = {
            "content": "record",
            "type": "flat",
            "rawOrLabel": "raw",
            "rawOrLabelHeaders": "raw",
            "exportCheckboxLabel": "false",
            "exportSurveyFields": "false",
            "exportDataAccessGroups": "false",
        }
        for index, field in enumerate(fields):
            request_data[f"fields[{index}]"] = field
        if records is not None:
            for index, record in enumerate(records):
                request_data[f"records[{index}]"] = record

        payload = self._post(request_data)
        if not isinstance(payload, list) or not all(
            isinstance(row, Mapping) for row in payload
        ):
            raise RedcapRequestError("invalid_records")
        return payload


def _verify_project(spec: ProjectSpec, info: Mapping[str, Any]) -> None:
    try:
        project_id = int(info.get("project_id"))
    except (TypeError, ValueError) as exc:
        raise RedcapRequestError("missing_project_id") from exc
    if project_id != spec.expected_project_id:
        raise RedcapRequestError("project_id_mismatch")
    if str(info.get("project_title", "")) != spec.expected_title:
        raise RedcapRequestError("project_title_mismatch")


def _discover_fields(
    metadata: Sequence[Mapping[str, Any]],
) -> tuple[str, tuple[str, ...]]:
    if not metadata:
        raise RedcapRequestError("empty_metadata")
    primary_key = str(metadata[0].get("field_name", "")).strip()
    if not primary_key:
        raise RedcapRequestError("missing_primary_key")

    form_names: list[str] = []
    seen: set[str] = set()
    for row in metadata:
        form_name = str(row.get("form_name", "")).strip()
        if form_name and form_name not in seen:
            seen.add(form_name)
            form_names.append(form_name)
    completion_fields = tuple(f"{name}_complete" for name in form_names)
    return primary_key, completion_fields


def _event_name(row: Mapping[str, Any]) -> str:
    value = str(row.get("redcap_event_name", "")).strip()
    return value or "default"


def _status_bucket(value: Any) -> str | None:
    normalized = str(value).strip() if value is not None else ""
    if normalized == "":
        return None
    return {"0": "incomplete", "1": "unverified", "2": "complete"}.get(
        normalized, "unknown"
    )


def sync_project(
    spec: ProjectSpec,
    client: RedcapApiClient,
    *,
    record_batch_size: int,
) -> ProjectResult:
    """Fetch and aggregate one project without returning record identifiers."""

    _verify_project(spec, client.project_info())
    primary_key, completion_fields = _discover_fields(client.metadata())

    primary_rows = client.records([primary_key])
    record_ids: set[str] = set()
    event_pairs: set[tuple[str, str]] = set()
    for row in primary_rows:
        record_id = str(row.get(primary_key, "")).strip()
        if not record_id:
            continue
        record_ids.add(record_id)
        event_pairs.add((record_id, _event_name(row)))

    event_counts: Counter[str] = Counter(event for _, event in event_pairs)
    form_counts: Counter[str] = Counter()

    sorted_record_ids = sorted(record_ids)
    completion_field_set = set(completion_fields)
    for offset in range(0, len(sorted_record_ids), record_batch_size):
        batch = sorted_record_ids[offset : offset + record_batch_size]
        rows = client.records([primary_key, *completion_fields], records=batch)
        for row in rows:
            for field_name in completion_field_set:
                bucket = _status_bucket(row.get(field_name))
                if bucket is not None:
                    form_counts[bucket] += 1

    result = ProjectResult(
        spec=spec,
        status="ok",
        primary_key_field=primary_key,
        record_count=len(record_ids),
        event_counts=event_counts,
        instruments_total=len(completion_fields),
        form_counts=form_counts,
    )

    # Identifiers are used only for request pagination and aggregation.
    record_ids.clear()
    sorted_record_ids.clear()
    event_pairs.clear()
    primary_rows.clear()
    return result


def _safe_error_code(exc: BaseException) -> str:
    if isinstance(exc, (RedcapRequestError, PortfolioSyncError)):
        return exc.code
    return "internal_error"


def _suppressed_count(value: int, threshold: int) -> int | None:
    return value if value >= threshold else None


def _public_event_total(
    event_counts: Counter[str] | None, threshold: int
) -> tuple[int | None, bool]:
    """Return an exact total only when it cannot reveal a suppressed event."""

    if event_counts is None:
        return None, False
    has_suppressed_event = any(count < threshold for count in event_counts.values())
    if has_suppressed_event:
        return None, True
    return sum(event_counts.values()), False


def _public_events(
    event_counts: Counter[str] | None, threshold: int
) -> list[dict[str, Any]]:
    if event_counts is None:
        return []
    return [
        {
            "event": event,
            "records": _suppressed_count(count, threshold),
            "suppressed": count < threshold,
        }
        for event, count in sorted(event_counts.items())
    ]


def _forms_payload(
    counts: Counter[str] | None,
    *,
    threshold: int,
    instruments_total: int | None = None,
    include_instruments: bool = False,
    force_suppression: bool = False,
) -> dict[str, Any]:
    if counts is None:
        payload: dict[str, Any] = {
            "incomplete": None,
            "unverified": None,
            "complete": None,
            "unknown": None,
            "total": None,
            "completion_rate": None,
            "counts_suppressed": False,
        }
    else:
        incomplete = int(counts.get("incomplete", 0))
        unverified = int(counts.get("unverified", 0))
        complete = int(counts.get("complete", 0))
        unknown = int(counts.get("unknown", 0))
        total = incomplete + unverified + complete + unknown
        counts_suppressed = force_suppression or any(
            0 < value < threshold
            for value in (incomplete, unverified, complete, unknown)
        )
        payload = {
            "incomplete": None if counts_suppressed else incomplete,
            "unverified": None if counts_suppressed else unverified,
            "complete": None if counts_suppressed else complete,
            "unknown": None if counts_suppressed else unknown,
            "total": None if counts_suppressed else total,
            # A rate plus a known or inferable denominator can reveal a hidden
            # small numerator. Suppress it with the exact buckets and total.
            "completion_rate": (
                None
                if counts_suppressed
                else round(complete / total, 3) if total else None
            ),
            "counts_suppressed": counts_suppressed,
        }
    if include_instruments:
        payload = {"instruments_total": instruments_total, **payload}
    return payload


def _public_project(result: ProjectResult, threshold: int) -> dict[str, Any]:
    event_total, event_total_suppressed = _public_event_total(
        result.event_counts, threshold
    )
    return {
        "key": result.spec.key,
        "study": result.spec.study,
        "role": result.spec.role,
        "project_id": result.spec.expected_project_id,
        "title": result.spec.expected_title,
        "status": result.status,
        "enrollment_authority": result.spec.enrollment_authority,
        "records": result.record_count,
        "event_records": event_total,
        "event_records_suppressed": event_total_suppressed,
        "events": _public_events(result.event_counts, threshold),
        "forms": _forms_payload(
            result.form_counts,
            threshold=threshold,
            instruments_total=result.instruments_total,
            include_instruments=True,
        ),
        "error": {"code": result.error_code} if result.error_code else None,
    }


def _aggregate_studies(
    config: PortfolioConfig, results: Sequence[ProjectResult]
) -> list[dict[str, Any]]:
    studies: list[dict[str, Any]] = []
    for study_spec in config.studies:
        members = [result for result in results if result.spec.study == study_spec.key]
        successful = [result for result in members if result.status == "ok"]
        authority = next(
            result for result in members if result.spec.enrollment_authority
        )

        form_counts: Counter[str] | None
        if successful:
            form_counts = Counter()
            for result in successful:
                form_counts.update(result.form_counts or Counter())
        else:
            form_counts = None
        child_form_counts_suppressed = any(
            result.form_counts is not None
            and any(
                0 < int(result.form_counts.get(bucket, 0)) < config.small_cell_threshold
                for bucket in ("incomplete", "unverified", "complete", "unknown")
            )
            for result in successful
        )

        authority_ok = authority.status == "ok"
        authority_events = authority.event_counts if authority_ok else None
        event_total, event_total_suppressed = _public_event_total(
            authority_events, config.small_cell_threshold
        )
        studies.append(
            {
                "key": study_spec.key,
                "label": study_spec.label,
                "status": "ok" if len(successful) == len(members) else "degraded",
                "projects_total": len(members),
                "projects_ok": len(successful),
                "target": study_spec.target,
                "enrollment": authority.record_count if authority_ok else None,
                "event_records": event_total,
                "event_records_suppressed": event_total_suppressed,
                "events": _public_events(authority_events, config.small_cell_threshold),
                "forms": _forms_payload(
                    form_counts,
                    threshold=config.small_cell_threshold,
                    force_suppression=child_form_counts_suppressed,
                ),
            }
        )
    return studies


def cadence_label(seconds: int) -> str:
    """Render the published cadence string for ``dashboard_metrics.json``.

    Public because the build and the live-surface probe both validate the
    artifact against this exact string. They used to hardcode
    ``"every_5_minutes"`` and a 15-minute SLA of their own, which is how the
    published contract drifted away from the sync it was describing: the number
    lived in five places and only one of them was the config. Deriving it here
    means the producer and every validator move together.
    """
    if seconds % 60 == 0:
        return f"every_{seconds // 60}_minutes"
    return f"every_{seconds}_seconds"


def sla_payload(seconds: int) -> dict[str, int]:
    """Render the published freshness SLA block. See :func:`cadence_label`."""
    return {"max_age_minutes": seconds // 60}


def _iso_utc_now() -> str:
    return (
        datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    )


def _add_data_version(payload: dict[str, Any]) -> dict[str, Any]:
    hash_input = {
        key: value
        for key, value in payload.items()
        if key not in {"data_version", "generated_at"}
    }
    canonical = json.dumps(
        hash_input, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    payload["data_version"] = f"sha256:{hashlib.sha256(canonical).hexdigest()}"
    return payload


def build_portfolio_payload(
    config: PortfolioConfig,
    results: Sequence[ProjectResult],
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Build the deterministic, aggregate-only public metrics contract."""

    if len(results) != len(config.projects):
        raise PortfolioSyncError("incomplete_result_set")

    projects_ok = sum(result.status == "ok" for result in results)
    studies = _aggregate_studies(config, results)
    studies_reporting = sum(study["enrollment"] is not None for study in studies)
    all_authorities_ok = studies_reporting == len(config.studies)
    study_enrollments = (
        sum(int(study["enrollment"]) for study in studies)
        if all_authorities_ok
        else None
    )
    authority_event_counts: list[Counter[str]] | None = None
    if all_authorities_ok:
        authority_event_counts = []
        for result in results:
            if result.spec.enrollment_authority:
                authority_event_counts.append(result.event_counts or Counter())
    if authority_event_counts is None:
        portfolio_event_records = None
        portfolio_event_records_suppressed = False
    else:
        portfolio_event_records_suppressed = any(
            count < config.small_cell_threshold
            for event_counts in authority_event_counts
            for count in event_counts.values()
        )
        portfolio_event_records = (
            None
            if portfolio_event_records_suppressed
            else sum(
                sum(event_counts.values()) for event_counts in authority_event_counts
            )
        )

    portfolio_form_counts: Counter[str] | None
    successful = [result for result in results if result.status == "ok"]
    if successful:
        portfolio_form_counts = Counter()
        for result in successful:
            portfolio_form_counts.update(result.form_counts or Counter())
    else:
        portfolio_form_counts = None

    payload: dict[str, Any] = {
        "schema": OUTPUT_SCHEMA,
        "data_version": "",
        "generated_at": generated_at or _iso_utc_now(),
        "aggregate_only": True,
        "source": {
            "kind": "live" if projects_ok == len(config.projects) else "partial",
            "transport": "api",
            "system": "REDCap",
            "cadence": cadence_label(config.refresh_cadence_seconds),
            "sla": sla_payload(config.sla_seconds),
            "projects_total": len(config.projects),
            "projects_ok": projects_ok,
        },
        "portfolio": {
            "status": "ok" if projects_ok == len(config.projects) else "degraded",
            "studies_total": len(config.studies),
            "studies_reporting": studies_reporting,
            "study_enrollments": study_enrollments,
            "event_records": portfolio_event_records,
            "event_records_suppressed": portfolio_event_records_suppressed,
            "forms": _forms_payload(
                portfolio_form_counts,
                threshold=config.small_cell_threshold,
                force_suppression=any(
                    result.form_counts is not None
                    and any(
                        0
                        < int(result.form_counts.get(bucket, 0))
                        < config.small_cell_threshold
                        for bucket in (
                            "incomplete",
                            "unverified",
                            "complete",
                            "unknown",
                        )
                    )
                    for result in successful
                ),
            ),
        },
        "studies": studies,
        "projects": [
            _public_project(result, config.small_cell_threshold) for result in results
        ],
    }
    return _add_data_version(payload)


def sync_portfolio(
    config: PortfolioConfig,
    *,
    environ: Mapping[str, str] | None = None,
    session: Any | None = None,
    require_all: bool = False,
    generated_at: str | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    """Synchronize all configured projects and return only public aggregates."""

    environment = os.environ if environ is None else environ
    api_url = str(environment.get(config.api_url_env, "")).strip()
    if not api_url:
        raise PortfolioSyncError("missing_api_url")
    if not api_url.startswith(("https://", "http://")):
        raise PortfolioSyncError("invalid_api_url")

    results: list[ProjectResult] = []
    for spec in config.projects:
        token = str(environment.get(spec.token_env, "")).strip()
        if not token:
            LOGGER.error("REDCap project %s failed: missing_token", spec.key)
            results.append(
                ProjectResult(spec=spec, status="error", error_code="missing_token")
            )
            continue

        LOGGER.info("Synchronizing REDCap project %s", spec.key)
        client = RedcapApiClient(
            api_url,
            token,
            session=session,
            timeout_seconds=config.timeout_seconds,
            retries=config.retries,
            backoff_seconds=config.backoff_seconds,
            sleep=sleep,
        )
        try:
            result = sync_project(
                spec, client, record_batch_size=config.record_batch_size
            )
            LOGGER.info(
                "REDCap project %s aggregated successfully (%d records)",
                spec.key,
                result.record_count or 0,
            )
        except Exception as exc:  # each project fails closed and independently
            error_code = _safe_error_code(exc)
            LOGGER.error("REDCap project %s failed: %s", spec.key, error_code)
            result = ProjectResult(spec=spec, status="error", error_code=error_code)
        results.append(result)

    if require_all and any(result.status != "ok" for result in results):
        raise PortfolioSyncError()
    return build_portfolio_payload(config, results, generated_at=generated_at)


def write_json_atomic(payload: Mapping[str, Any], output_path: str | Path) -> Path:
    """Atomically write a JSON artifact without leaving partial output behind."""

    destination = Path(output_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, destination)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise
    return destination


__all__ = [
    "CONFIG_SCHEMA",
    "OUTPUT_SCHEMA",
    "PortfolioConfig",
    "PortfolioConfigError",
    "PortfolioSyncError",
    "ProjectResult",
    "RedcapApiClient",
    "RedcapRequestError",
    "build_portfolio_payload",
    "load_portfolio_config",
    "sync_portfolio",
    "sync_project",
    "write_json_atomic",
]
