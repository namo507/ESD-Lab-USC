"""Read-only REDCap structural metadata for the portfolio dashboard.

This module answers the question "how are the eight REDCap projects built and
how far along is data entry?" without ever publishing participant data.  It
adds four export calls (``instrument``, ``event``, ``formEventMapping`` and the
``*_complete`` slice of ``record``) on top of the aggregate-only client in
:mod:`redcap.api.multi_project`, and reduces every record export to counts
before the rows leave the fetch function.

Guarantees mirrored from the aggregate contract:

* Only ``export`` content types are requested; no write parameter is ever sent.
* Record exports carry the primary key plus ``<form>_complete`` status fields
  only, and the raw rows are discarded inside :func:`fetch_project_metadata`.
* Counts below the configured small-cell threshold are suppressed, and the
  suppression propagates to every aggregate computed from them.
* The serialized artifact is scanned for API token values before it is written.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from collections import Counter, OrderedDict
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Mapping, Sequence

from redcap.api.multi_project import (
    PortfolioConfig,
    PortfolioSyncError,
    ProjectSpec,
    RedcapApiClient,
    RedcapRequestError,
    _add_data_version,
    _api_url_error,
    _cadence_label,
    _discover_fields,
    _iso_utc_now,
    _public_participant_count,
    _safe_error_code,
    _verify_project,
)

LOGGER = logging.getLogger(__name__)

METADATA_SCHEMA = "redcap.portfolio.metadata.v1"
FIELDS_SCHEMA = "redcap.portfolio.fields.v1"
FIELD_INDEX_FILENAME = "redcap_portfolio_fields.json"

STATUS_KEYS = ("complete", "incomplete", "unverified", "not_started")
STATUS_BY_RAW = {"0": "incomplete", "1": "unverified", "2": "complete"}

# Field text is study design metadata, not participant data, but it is still
# trimmed so the published artifact stays small enough to fetch on every load.
MAX_LABEL_CHARS = 240
MAX_NOTE_CHARS = 160
MAX_CHOICE_CHARS = 400

FLAG_REQUIRED = 1
FLAG_IDENTIFIER = 2
FLAG_BRANCHING = 4
FLAG_LABELLED = 8
FLAG_VALIDATED = 16

CHOICE_FIELD_TYPES = frozenset({"radio", "dropdown", "checkbox"})
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")

ROLE_SUFFIXES = {"surveys": "Surveys", "assessments": "Lab"}


@dataclass(frozen=True)
class FieldRecord:
    """One REDCap field with the flags the dashboard filters on."""

    name: str
    form: str
    field_type: str
    validation: str
    label: str
    note: str
    choices: str
    choice_count: int
    required: bool
    identifier: bool
    branching: bool

    @property
    def flags(self) -> int:
        value = 0
        if self.required:
            value |= FLAG_REQUIRED
        if self.identifier:
            value |= FLAG_IDENTIFIER
        if self.branching:
            value |= FLAG_BRANCHING
        if self.label:
            value |= FLAG_LABELLED
        if self.validation:
            value |= FLAG_VALIDATED
        return value


@dataclass
class ProjectMetadata:
    """Aggregated structure and completion state for a single REDCap project."""

    spec: ProjectSpec
    status: str
    error_code: str | None = None
    title: str = ""
    longitudinal: bool = False
    repeating: bool = False
    surveys_enabled: bool = False
    fields: tuple[FieldRecord, ...] = ()
    instruments: "OrderedDict[str, str]" = field(default_factory=OrderedDict)
    events: "OrderedDict[str, str]" = field(default_factory=OrderedDict)
    event_forms: dict[str, set[str]] = field(default_factory=dict)
    completion: Counter[tuple[str, str, str]] = field(default_factory=Counter)
    event_records: Counter[str] = field(default_factory=Counter)
    event_rows: Counter[str] = field(default_factory=Counter)
    record_count: int | None = None
    row_count: int | None = None
    notes: tuple[str, ...] = ()

    @property
    def ok(self) -> bool:
        return self.status == "ok"


def project_label(spec: ProjectSpec, study_label: str) -> str:
    """Human label that keeps the study identity in front of the role."""

    suffix = ROLE_SUFFIXES.get(spec.role)
    return f"{study_label} {suffix}" if suffix else study_label


def _flag(value: Any) -> bool:
    return str(value).strip().lower() in {"y", "yes", "1", "true"}


def _truthy_setting(value: Any) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes"}


def _clean_text(value: Any, limit: int) -> str:
    text = _HTML_TAG_RE.sub(" ", str(value or ""))
    text = _WHITESPACE_RE.sub(" ", text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _choice_count(field_type: str, choices: str) -> int:
    if field_type not in CHOICE_FIELD_TYPES or not choices:
        return 0
    return len([part for part in choices.split("|") if part.strip()])


def field_inventory(metadata: Sequence[Mapping[str, Any]]) -> tuple[FieldRecord, ...]:
    """Turn a ``metadata`` export into the dashboard's field inventory."""

    records: list[FieldRecord] = []
    for row in metadata:
        name = str(row.get("field_name", "")).strip()
        if not name:
            continue
        field_type = str(row.get("field_type", "")).strip() or "unknown"
        choices = _clean_text(
            row.get("select_choices_or_calculations"), MAX_CHOICE_CHARS
        )
        records.append(
            FieldRecord(
                name=name,
                form=str(row.get("form_name", "")).strip() or "unassigned",
                field_type=field_type,
                validation=str(
                    row.get("text_validation_type_or_show_slider_number", "") or ""
                ).strip(),
                label=_clean_text(row.get("field_label"), MAX_LABEL_CHARS),
                note=_clean_text(row.get("field_note"), MAX_NOTE_CHARS),
                choices=choices,
                choice_count=_choice_count(field_type, choices),
                required=_flag(row.get("required_field")),
                identifier=_flag(row.get("identifier")),
                branching=bool(str(row.get("branching_logic", "") or "").strip()),
            )
        )
    return tuple(records)


def _instrument_map(rows: Sequence[Mapping[str, Any]]) -> "OrderedDict[str, str]":
    instruments: "OrderedDict[str, str]" = OrderedDict()
    for row in rows:
        name = str(row.get("instrument_name", "")).strip()
        if not name:
            continue
        instruments[name] = (
            _clean_text(row.get("instrument_label"), MAX_LABEL_CHARS) or name
        )
    return instruments


def _event_map(rows: Sequence[Mapping[str, Any]]) -> "OrderedDict[str, str]":
    events: "OrderedDict[str, str]" = OrderedDict()
    for row in rows:
        name = str(row.get("unique_event_name", "")).strip()
        if not name:
            continue
        events[name] = _clean_text(row.get("event_name"), MAX_LABEL_CHARS) or name
    return events


def _event_form_map(rows: Sequence[Mapping[str, Any]]) -> dict[str, set[str]]:
    mapping: dict[str, set[str]] = {}
    for row in rows:
        event = str(row.get("unique_event_name", "")).strip()
        form = str(row.get("form", "")).strip()
        if not event or not form:
            continue
        mapping.setdefault(event, set()).add(form)
    return mapping


def _row_event(row: Mapping[str, Any]) -> str:
    return str(row.get("redcap_event_name", "")).strip() or "default"


@dataclass
class _CompletionBatch:
    """Counts extracted from one batch of completion rows."""

    completion: Counter[tuple[str, str, str]] = field(default_factory=Counter)
    event_rows: Counter[str] = field(default_factory=Counter)
    event_records: Counter[str] = field(default_factory=Counter)


def _summarize_completion(
    rows: Iterable[Mapping[str, Any]],
    primary_key: str,
    form_names: Sequence[str],
    event_forms: Mapping[str, set[str]],
) -> _CompletionBatch:
    """Reduce ``*_complete`` cells to per-instrument, per-event status counts.

    Cells for instruments that are not designated for the row's event are
    skipped, so a longitudinal project is not credited with phantom
    "not started" cells for instruments that event never collects.  A
    record-event counts as present once any of its designated instruments
    carries a status, which keeps the event volumes and the completion counts
    derived from the same export.
    """

    batch = _CompletionBatch()
    populated: set[tuple[str, str]] = set()
    for row in rows:
        event = _row_event(row)
        designated = event_forms.get(event)
        touched = False
        for form in form_names:
            if designated is not None and form not in designated:
                continue
            raw = row.get(f"{form}_complete")
            normalized = "" if raw is None else str(raw).strip()
            if not normalized:
                batch.completion[(form, event, "not_started")] += 1
                continue
            status = STATUS_BY_RAW.get(normalized)
            if status is not None:
                batch.completion[(form, event, status)] += 1
                touched = True
        if not touched:
            continue
        batch.event_rows[event] += 1
        record_id = str(row.get(primary_key, "")).strip()
        if record_id:
            populated.add((record_id, event))
    batch.event_records.update(event for _, event in populated)
    # Identifiers are used only to de-duplicate repeating rows.
    populated.clear()
    return batch


def fetch_project_metadata(
    spec: ProjectSpec,
    client: RedcapApiClient,
    *,
    record_batch_size: int,
) -> ProjectMetadata:
    """Fetch one project's structure and completion state as counts only."""

    info = client.project_info()
    _verify_project(spec, info)
    metadata = client.metadata()
    primary_key, completion_fields = _discover_fields(metadata)
    fields = field_inventory(metadata)

    notes: list[str] = []
    instruments = _instrument_map(client.instruments())
    for record in fields:
        instruments.setdefault(record.form, record.form)

    longitudinal = _truthy_setting(info.get("is_longitudinal"))
    events: "OrderedDict[str, str]" = OrderedDict()
    event_forms: dict[str, set[str]] = {}
    if longitudinal:
        try:
            events = _event_map(client.events())
        except RedcapRequestError as exc:
            notes.append(f"events_unavailable:{exc.code}")
        try:
            event_forms = _event_form_map(client.form_event_mapping())
        except RedcapRequestError as exc:
            notes.append(f"form_event_mapping_unavailable:{exc.code}")

    # The primary-key export enumerates record identifiers for batching and
    # matches the enrollment figure published by the aggregate metrics
    # contract; every other volume comes from the completion export below.
    primary_rows = client.records([primary_key])
    record_ids: set[str] = set()
    for row in primary_rows:
        record_id = str(row.get(primary_key, "")).strip()
        if record_id:
            record_ids.add(record_id)
    primary_rows.clear()

    form_names = [name[: -len("_complete")] for name in completion_fields]
    completion: Counter[tuple[str, str, str]] = Counter()
    event_rows: Counter[str] = Counter()
    event_records: Counter[str] = Counter()
    sorted_record_ids = sorted(record_ids)
    for offset in range(0, len(sorted_record_ids), record_batch_size):
        batch = sorted_record_ids[offset : offset + record_batch_size]
        rows = client.records([primary_key, *completion_fields], records=batch)
        summary = _summarize_completion(rows, primary_key, form_names, event_forms)
        # Raw record rows never leave this loop.
        rows.clear()
        completion.update(summary.completion)
        event_rows.update(summary.event_rows)
        event_records.update(summary.event_records)

    if not events:
        events = OrderedDict((name, name) for name in sorted(event_rows))
    for name in event_rows:
        events.setdefault(name, name)

    result = ProjectMetadata(
        spec=spec,
        status="ok",
        title=str(info.get("project_title", "") or spec.expected_title),
        longitudinal=longitudinal,
        repeating=_truthy_setting(info.get("has_repeating_instruments_or_events")),
        surveys_enabled=_truthy_setting(info.get("surveys_enabled")),
        fields=fields,
        instruments=instruments,
        events=events,
        event_forms=event_forms,
        completion=completion,
        event_records=event_records,
        event_rows=event_rows,
        record_count=len(record_ids),
        row_count=sum(event_rows.values()),
        notes=tuple(notes),
    )
    record_ids.clear()
    sorted_record_ids.clear()
    return result


def _suppress_counts(
    counts: Mapping[str, int], threshold: int, *, force: bool = False
) -> dict[str, Any]:
    """Publish status counts unless any non-zero cell is too small."""

    suppressed = force or any(0 < int(value) < threshold for value in counts.values())
    started = sum(
        int(counts.get(key, 0)) for key in ("complete", "incomplete", "unverified")
    )
    payload: dict[str, Any] = {
        key: None if suppressed else int(counts.get(key, 0)) for key in STATUS_KEYS
    }
    payload["started"] = None if suppressed else started
    payload["counts_suppressed"] = suppressed
    payload["completion_rate"] = (
        None
        if suppressed or not started
        else round(int(counts.get("complete", 0)) / started * 100, 1)
    )
    return payload


def _blank_counts(row: dict[str, Any]) -> None:
    for key in (*STATUS_KEYS, "started", "completion_rate"):
        row[key] = None
    row["counts_suppressed"] = True


def _protect_lone_suppressed_row(rows: list[dict[str, Any]]) -> None:
    """Hide a second row when a single hidden row could be back-computed.

    Published rows sum to the published project total, so exactly one hidden
    row is recoverable by subtraction.  Complementary suppression removes the
    next-smallest row instead of hiding every count in the project.
    """

    suppressed = [row for row in rows if row["counts_suppressed"]]
    if len(suppressed) != 1:
        return
    candidates = [row for row in rows if not row["counts_suppressed"]]
    if not candidates:
        return
    _blank_counts(min(candidates, key=lambda row: (row["started"] or 0, row["name"])))


def _protect_lone_suppressed_volume(rows: list[dict[str, Any]]) -> None:
    """Apply the same complementary rule to the event record and row volumes."""

    suppressed = [row for row in rows if row["records_suppressed"]]
    if len(suppressed) != 1:
        return
    candidates = [row for row in rows if not row["records_suppressed"]]
    if not candidates:
        return
    victim = min(candidates, key=lambda row: (row["records"] or 0, row["name"]))
    victim["records"] = None
    victim["rows"] = None
    victim["records_suppressed"] = True


def _instrument_rows(project: ProjectMetadata, threshold: int) -> list[dict[str, Any]]:
    field_counts = Counter(record.form for record in project.fields)
    events_by_form: dict[str, int] = {}
    for event, forms in project.event_forms.items():
        for form in forms:
            events_by_form[form] = events_by_form.get(form, 0) + 1

    per_form: dict[str, Counter[str]] = {}
    for (form, _event, status), count in project.completion.items():
        per_form.setdefault(form, Counter())[status] += count

    rows: list[dict[str, Any]] = []
    for name, label in project.instruments.items():
        counts = per_form.get(name, Counter())
        published = _suppress_counts(counts, threshold)
        if project.event_forms:
            event_total = events_by_form.get(name, 0)
        else:
            # A classic project has a single implicit event.
            event_total = 1
        rows.append(
            {
                "name": name,
                "label": label,
                "fields": int(field_counts.get(name, 0)),
                "events": event_total,
                **published,
            }
        )
    rows.sort(key=lambda row: (-(row["started"] or 0), row["name"]))
    _protect_lone_suppressed_row(rows)
    return rows


def _event_rows(project: ProjectMetadata, threshold: int) -> list[dict[str, Any]]:
    per_event: dict[str, Counter[str]] = {}
    for (_form, event, status), count in project.completion.items():
        per_event.setdefault(event, Counter())[status] += count

    rows: list[dict[str, Any]] = []
    for name in project.events:
        counts = per_event.get(name, Counter())
        records, records_suppressed = _public_participant_count(
            int(project.event_records.get(name, 0)), threshold
        )
        published = _suppress_counts(counts, threshold, force=records_suppressed)
        rows.append(
            {
                "name": name,
                "label": project.events.get(name, name),
                "records": records,
                "records_suppressed": records_suppressed,
                "rows": (
                    None if records_suppressed else int(project.event_rows.get(name, 0))
                ),
                **published,
            }
        )
    _protect_lone_suppressed_row(rows)
    _protect_lone_suppressed_volume(rows)
    return rows


def quality_flags(project: ProjectMetadata) -> list[dict[str, Any]]:
    """Rule-based structural findings over the field inventory."""

    fields = project.fields
    forms_with_fields = {record.form for record in fields}
    orphan_instruments = 0
    if project.event_forms:
        designated = {form for forms in project.event_forms.values() for form in forms}
        orphan_instruments = len(
            [name for name in project.instruments if name not in designated]
        )

    checks = [
        (
            "Fields with no label",
            sum(1 for record in fields if not record.label),
            "A blank field_label renders as an unlabelled question.",
        ),
        (
            "Text fields without validation",
            sum(
                1
                for record in fields
                if record.field_type == "text" and not record.validation
            ),
            "Free-text entry without a validation type accepts any value.",
        ),
        (
            "Choice fields with no options",
            sum(
                1
                for record in fields
                if record.field_type in CHOICE_FIELD_TYPES and record.choice_count == 0
            ),
            "A radio, dropdown, or checkbox field with no choices cannot be answered.",
        ),
        (
            "Identifier-flagged fields",
            sum(1 for record in fields if record.identifier),
            "REDCap marks these as identifiers; they are excluded from exports.",
        ),
        (
            "Fields with branching logic",
            sum(1 for record in fields if record.branching),
            "Conditional display; verify the logic after any instrument change.",
        ),
        (
            "Required fields",
            sum(1 for record in fields if record.required),
            "Required fields block form completion until they are answered.",
        ),
        (
            "Calculated fields",
            sum(1 for record in fields if record.field_type == "calc"),
            "Calculated values need a data-quality rule run after edits.",
        ),
        (
            "Instruments with no fields",
            len(
                [name for name in project.instruments if name not in forms_with_fields]
            ),
            "An instrument with no fields collects nothing.",
        ),
        (
            "Instruments on no event",
            orphan_instruments,
            "A longitudinal instrument that is not designated for any event.",
        ),
    ]
    return [
        {"check": check, "count": count, "detail": detail}
        for check, count, detail in checks
    ]


def _field_type_counts(project: ProjectMetadata) -> list[list[Any]]:
    counts = Counter(record.field_type for record in project.fields)
    return [
        [field_type, count]
        for field_type, count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


def project_completion_totals(project: ProjectMetadata) -> Counter[str]:
    """Sum every instrument-by-event status cell for one project."""

    totals: Counter[str] = Counter()
    for (_form, _event, status), count in project.completion.items():
        totals[status] += count
    return totals


def _project_payload(
    project: ProjectMetadata,
    *,
    study_label: str,
    threshold: int,
) -> dict[str, Any]:
    instrument_rows = _instrument_rows(project, threshold)
    event_rows = _event_rows(project, threshold)
    records, records_suppressed = _public_participant_count(
        project.record_count, threshold
    )
    # Project totals come from the raw counters rather than from the published
    # rows: a total is only withheld when the total itself is a small cell.
    # Complementary suppression on the rows keeps a hidden row from being
    # recovered by subtracting the published rows from these totals.
    completion = _suppress_counts(
        project_completion_totals(project), threshold, force=records_suppressed
    )
    return {
        "key": project.spec.key,
        "study": project.spec.study,
        "study_label": study_label,
        "label": project_label(project.spec, study_label),
        "role": project.spec.role,
        "project_id": project.spec.expected_project_id,
        "title": project.title or project.spec.expected_title,
        "status": project.status,
        "enrollment_authority": project.spec.enrollment_authority,
        "longitudinal": project.longitudinal,
        "repeating": project.repeating,
        "surveys": project.surveys_enabled,
        "records": records,
        "records_suppressed": records_suppressed,
        "rows": None if records_suppressed else project.row_count,
        "instruments": len(project.instruments),
        "fields": len(project.fields),
        "events": len(project.events),
        "identifier_fields": sum(1 for row in project.fields if row.identifier),
        "required_fields": sum(1 for row in project.fields if row.required),
        "branching_fields": sum(1 for row in project.fields if row.branching),
        "completion": completion,
        "field_types": _field_type_counts(project),
        "instrument_rows": instrument_rows,
        "event_rows": event_rows,
        "quality": quality_flags(project),
        "warnings": list(project.notes),
    }


def _instrument_matrix(projects: Sequence[ProjectMetadata]) -> list[dict[str, Any]]:
    labels: dict[str, str] = {}
    membership: dict[str, list[str]] = {}
    for project in projects:
        for name, label in project.instruments.items():
            labels.setdefault(name, label)
            membership.setdefault(name, []).append(project.spec.key)
    rows = [
        {
            "name": name,
            "label": labels[name],
            "projects": len(keys),
            "in": keys,
        }
        for name, keys in membership.items()
    ]
    rows.sort(key=lambda row: (-row["projects"], row["name"]))
    return rows


def _field_index(projects: Sequence[ProjectMetadata]) -> dict[str, Any]:
    """Dictionary-encode the field inventory so the payload stays compact."""

    project_keys = [project.spec.key for project in projects]
    forms: list[str] = []
    types: list[str] = []
    validations: list[str] = []
    form_index: dict[str, int] = {}
    type_index: dict[str, int] = {}
    validation_index: dict[str, int] = {}

    def intern(value: str, table: list[str], index: dict[str, int]) -> int:
        if value not in index:
            index[value] = len(table)
            table.append(value)
        return index[value]

    rows: list[list[Any]] = []
    for project_idx, project in enumerate(projects):
        for record in project.fields:
            rows.append(
                [
                    project_idx,
                    intern(record.form, forms, form_index),
                    intern(record.field_type, types, type_index),
                    intern(record.validation, validations, validation_index),
                    record.name,
                    record.label,
                    record.note,
                    record.choices,
                    record.choice_count,
                    record.flags,
                ]
            )
    return {
        "projects": project_keys,
        "forms": forms,
        "types": types,
        "validations": validations,
        "rows": rows,
    }


def build_metadata_payload(
    config: PortfolioConfig,
    projects: Sequence[ProjectMetadata],
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Build the deterministic, aggregate-only portfolio metadata contract."""

    if len(projects) != len(config.projects):
        raise PortfolioSyncError("incomplete_result_set")

    threshold = config.small_cell_threshold
    study_labels = {study.key: study.label for study in config.studies}
    healthy = [project for project in projects if project.ok]
    project_rows = [
        _project_payload(
            project,
            study_label=study_labels.get(
                project.spec.study, project.spec.study.upper()
            ),
            threshold=threshold,
        )
        for project in healthy
    ]
    failed = [
        {
            "key": project.spec.key,
            "study": project.spec.study,
            "label": project_label(
                project.spec,
                study_labels.get(project.spec.study, project.spec.study.upper()),
            ),
            "project_id": project.spec.expected_project_id,
            "status": project.status,
            "detail": project.error_code or "unavailable",
        }
        for project in projects
        if not project.ok
    ]

    # Portfolio totals are summed from the raw project counters. A project whose
    # own total is hidden would be recoverable by subtraction if it were the only
    # hidden one, so that case withholds the portfolio total as well.
    totals_completion: Counter[str] = Counter()
    for project in healthy:
        totals_completion.update(project_completion_totals(project))
    hidden_projects = sum(
        1 for row in project_rows if row["completion"]["counts_suppressed"]
    )
    records_values = [row["records"] for row in project_rows]
    records_suppressed = any(row["records_suppressed"] for row in project_rows)
    studies_reporting = len({row["study"] for row in project_rows})

    payload: dict[str, Any] = {
        "schema": METADATA_SCHEMA,
        "data_version": "",
        "generated_at": generated_at or _iso_utc_now(),
        "aggregate_only": True,
        "small_cell_threshold": threshold,
        "source": {
            "kind": "live" if len(healthy) == len(config.projects) else "partial",
            "transport": "api",
            "system": "REDCap",
            "cadence": _cadence_label(config.refresh_cadence_seconds),
            "sla": {"max_age_minutes": config.sla_seconds // 60},
            "refresh_cadence_seconds": config.refresh_cadence_seconds,
            "sla_seconds": config.sla_seconds,
            "projects_total": len(config.projects),
            "projects_ok": len(healthy),
        },
        "totals": {
            "projects": len(config.projects),
            "projects_ok": len(healthy),
            "studies": len(config.studies),
            "studies_reporting": studies_reporting,
            "instruments": sum(int(row["instruments"]) for row in project_rows),
            "fields": sum(int(row["fields"]) for row in project_rows),
            "events": sum(int(row["events"]) for row in project_rows),
            "records": (
                None
                if records_suppressed
                else sum(int(value or 0) for value in records_values)
            ),
            "records_suppressed": records_suppressed,
            "identifier_fields": sum(
                int(row["identifier_fields"]) for row in project_rows
            ),
            "required_fields": sum(int(row["required_fields"]) for row in project_rows),
            "branching_fields": sum(
                int(row["branching_fields"]) for row in project_rows
            ),
            "completion": _suppress_counts(
                totals_completion, threshold, force=hidden_projects == 1
            ),
        },
        "projects": project_rows,
        "failed": failed,
        "matrix": _instrument_matrix(healthy),
        "fields": _field_index(healthy),
    }
    return _add_data_version(payload)


def split_field_index(
    payload: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Split the payload into a small summary and the large field index.

    The dashboard's Portfolio, Study Detail, and Comparison panels only need the
    summary (tens of kilobytes).  The dictionary-encoded field inventory is an
    order of magnitude larger, so it ships as its own artifact that the Field
    Explorer fetches on demand.  Both artifacts carry the same ``data_version``
    so the client can detect a half-updated pair.
    """

    index = payload.get("fields")
    index = index if isinstance(index, Mapping) else {}
    summary = {key: value for key, value in payload.items() if key != "fields"}
    summary["field_index"] = {
        "artifact": FIELD_INDEX_FILENAME,
        "schema": FIELDS_SCHEMA,
        "rows": len(index.get("rows", [])),
        "forms": len(index.get("forms", [])),
        "types": len(index.get("types", [])),
    }
    field_payload = {
        "schema": FIELDS_SCHEMA,
        "data_version": payload.get("data_version", ""),
        "generated_at": payload.get("generated_at", ""),
        "aggregate_only": True,
        "fields": dict(index),
    }
    return summary, field_payload


def assert_no_tokens(payload: Mapping[str, Any], tokens: Iterable[str]) -> None:
    """Refuse to publish an artifact that contains any API token value."""

    serialized = json.dumps(payload, ensure_ascii=False)
    for token in tokens:
        candidate = str(token).strip()
        if len(candidate) >= 8 and candidate in serialized:
            raise PortfolioSyncError("token_leak_detected")


def sync_portfolio_metadata(
    config: PortfolioConfig,
    *,
    environ: Mapping[str, str] | None = None,
    session: Any | None = None,
    require_all: bool = False,
    generated_at: str | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    """Fetch every configured project and return the public metadata payload."""

    environment = os.environ if environ is None else environ
    api_url = str(environment.get(config.api_url_env, "")).strip()
    if not api_url:
        raise PortfolioSyncError("missing_api_url")
    url_error = _api_url_error(api_url)
    if url_error:
        raise PortfolioSyncError(url_error)

    projects: list[ProjectMetadata] = []
    tokens: list[str] = []
    for spec in config.projects:
        token = str(environment.get(spec.token_env, "")).strip()
        if not token:
            LOGGER.error("REDCap project %s failed: missing_token", spec.key)
            projects.append(
                ProjectMetadata(spec=spec, status="error", error_code="missing_token")
            )
            continue
        tokens.append(token)

        LOGGER.info("Reading REDCap structure for project %s", spec.key)
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
            project = fetch_project_metadata(
                spec, client, record_batch_size=config.record_batch_size
            )
            LOGGER.info(
                "REDCap project %s: %d instruments, %d fields",
                spec.key,
                len(project.instruments),
                len(project.fields),
            )
        except Exception as exc:  # each project fails closed and independently
            error_code = _safe_error_code(exc)
            LOGGER.error("REDCap project %s failed: %s", spec.key, error_code)
            project = ProjectMetadata(spec=spec, status="error", error_code=error_code)
        projects.append(project)

    if require_all and any(not project.ok for project in projects):
        raise PortfolioSyncError()

    payload = build_metadata_payload(config, projects, generated_at=generated_at)
    assert_no_tokens(payload, tokens)
    return payload


__all__ = [
    "FIELDS_SCHEMA",
    "FIELD_INDEX_FILENAME",
    "METADATA_SCHEMA",
    "FieldRecord",
    "ProjectMetadata",
    "assert_no_tokens",
    "build_metadata_payload",
    "fetch_project_metadata",
    "field_inventory",
    "project_completion_totals",
    "project_label",
    "quality_flags",
    "split_field_index",
    "sync_portfolio_metadata",
]
