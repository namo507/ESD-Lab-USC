"""REDCap metadata watcher: portfolio-wide instrument structure and completion.

This module answers a different question than :mod:`redcap.api.multi_project`.
That module publishes *how enrollment is going*. This one publishes *how the
projects are built* -- which instruments exist, how they are wired to events,
how consistently they are defined across studies, and how far along each one is
-- so the lab can see design drift between five studies without opening eight
REDCap projects side by side.

Three guarantees are enforced here in code rather than left to review:

Read-only.
    :class:`ReadOnlyRedcapClient` refuses any request whose ``content`` is not
    on :data:`READ_ONLY_CONTENTS`, and any request carrying a parameter REDCap
    uses to mutate a project. An import or delete cannot be issued through this
    client even by a caller that asks for one.

No participant data leaves the fetch.
    The single record export requests only the record ID field and the
    ``<form>_complete`` status fields (values ``0``, ``1``, ``2``, or empty).
    :func:`summarize_completion` reduces those rows to counts and the caller
    drops the rows immediately. No identifier or response value is retained.

No item text, no identifier field names.
    Field labels are the verbatim wording of licensed assessments and are never
    exported; fields REDCap flags as direct identifiers are withheld with only
    a count kept, so totals still reconcile. Both rules are inherited from
    :mod:`redcap.api.dictionary`, which explains the reasoning in full.

Small-cell suppression from the portfolio contract applies to every count that
is derived from records, so a cell that would describe fewer than
``small_cell_threshold`` participants is published as ``null``.
"""

from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from dataclasses import field as dataclass_field
from datetime import datetime, timezone
from typing import Any, Callable, Iterable, Mapping, Sequence

from redcap.api.dictionary import choice_count, is_identifier_field
from redcap.api.multi_project import (
    PortfolioConfig,
    ProjectSpec,
    RedcapApiClient,
    RedcapRequestError,
)

LOGGER = logging.getLogger(__name__)

OUTPUT_SCHEMA = "redcap.metadata.v1"

# Export content types this client is allowed to request. Anything absent is
# refused before a request is built, so a future caller cannot widen the
# surface by passing a new content string.
READ_ONLY_CONTENTS = frozenset(
    {
        "project",
        "metadata",
        "instrument",
        "event",
        "formEventMapping",
        "record",
        "version",
    }
)

# Parameters REDCap uses to write. Their presence is a hard error rather than
# something to strip, because a caller that supplied one meant to mutate.
WRITE_PARAMETERS = frozenset(
    {
        "action",
        "data",
        "returnContent",
        "overwriteBehavior",
        "forceAutoNumber",
    }
)

# REDCap's <form>_complete vocabulary. An empty cell means the form was never
# opened, which is a different fact from "opened and left incomplete".
COMPLETION_STATES = {"0": "incomplete", "1": "unverified", "2": "complete"}
STATUS_KEYS = ("complete", "unverified", "incomplete", "not_started")

# Bit positions in the field inventory's per-row flag byte. There is no
# identifier bit: identifier-flagged fields never reach the inventory.
FIELD_FLAG_REQUIRED = 1
FIELD_FLAG_BRANCHING = 2
FIELD_FLAG_VALIDATED = 4

# Structural checks published on the Study Detail tab. Each is a design signal
# a coordinator can act on, not a value judgement about the instrument.
QUALITY_CHECKS: tuple[tuple[str, str], ...] = (
    (
        "Unvalidated free text",
        "Text fields with no validation rule accept any input, so typos reach "
        "analysis uncorrected.",
    ),
    (
        "Choice fields with no options",
        "A radio, dropdown, or checkbox field with an empty option list cannot "
        "be answered.",
    ),
    (
        "Calculated fields",
        "Calculated fields derive from other fields, so they change silently "
        "when an upstream field is edited.",
    ),
    (
        "Fields with branching logic",
        "Branching hides fields conditionally, so a blank value may mean "
        "'not asked' rather than 'not answered'.",
    ),
    (
        "Required fields",
        "Required fields block survey submission until answered.",
    ),
    (
        "Instruments not mapped to an event",
        "A longitudinal instrument with no event assignment cannot collect data.",
    ),
    (
        "Identifier fields withheld",
        "Fields REDCap flags as direct identifiers are counted here and "
        "excluded from every published field list.",
    ),
)


class ReadOnlyViolation(RuntimeError):
    """Raised when a caller attempts a request this client will not make."""


class RequestPacer:
    """Process-wide floor on the interval between outbound REDCap calls.

    The portfolio sync is already running on its own schedule. Pacing this
    export keeps the metadata pass from arriving as a burst on top of it.
    """

    def __init__(
        self,
        min_interval_seconds: float,
        *,
        sleep: Callable[[float], None] = time.sleep,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._min_interval = max(0.0, float(min_interval_seconds))
        self._sleep = sleep
        self._monotonic = monotonic
        self._lock = threading.Lock()
        self._last_call: float | None = None

    def wait(self) -> None:
        if self._min_interval <= 0:
            return
        with self._lock:
            now = self._monotonic()
            if self._last_call is not None:
                remaining = self._min_interval - (now - self._last_call)
                if remaining > 0:
                    self._sleep(remaining)
                    now = self._monotonic()
            self._last_call = now


class ReadOnlyRedcapClient:
    """Export-only wrapper around the portfolio's hardened API client."""

    def __init__(
        self,
        client: RedcapApiClient,
        *,
        pacer: RequestPacer | None = None,
    ) -> None:
        self._client = client
        self._pacer = pacer

    def export(self, content: str, **params: Any) -> Any:
        if content not in READ_ONLY_CONTENTS:
            raise ReadOnlyViolation(f"content_not_allowed:{content}")
        forbidden = sorted(WRITE_PARAMETERS.intersection(params))
        if forbidden:
            raise ReadOnlyViolation(f"write_parameter:{forbidden[0]}")
        if self._pacer is not None:
            self._pacer.wait()
        return self._client._post({"content": content, **params})

    def export_list(self, content: str, **params: Any) -> list[Mapping[str, Any]]:
        """Export a content type REDCap returns as a list of rows.

        Content types that only exist on longitudinal projects return an error
        payload on a classic project. That is a shape fact about the project,
        not a failure, so the caller receives an empty list.
        """
        try:
            payload = self.export(content, **params)
        except RedcapRequestError as exc:
            if content in {"event", "formEventMapping"} and exc.code == "api_error":
                return []
            raise
        if not isinstance(payload, list):
            raise RedcapRequestError(f"invalid_{content}")
        return [row for row in payload if isinstance(row, Mapping)]


@dataclass
class ProjectSnapshot:
    """One project's structure and completion, already reduced to counts."""

    spec: ProjectSpec
    status: str = "ok"
    error_code: str | None = None
    title: str = ""
    project_id: int | None = None
    longitudinal: bool = False
    repeating: bool = False
    surveys: bool = False
    record_count: int = 0
    row_count: int = 0
    instruments: list[dict[str, Any]] = dataclass_field(default_factory=list)
    events: list[dict[str, Any]] = dataclass_field(default_factory=list)
    fields: list[dict[str, Any]] = dataclass_field(default_factory=list)
    identifier_fields_withheld: int = 0
    # instrument -> status bucket -> count
    form_completion: dict[str, Counter] = dataclass_field(default_factory=dict)
    # event -> status bucket -> count
    event_completion: dict[str, Counter] = dataclass_field(default_factory=dict)
    event_records: Counter = dataclass_field(default_factory=Counter)
    event_rows: Counter = dataclass_field(default_factory=Counter)
    form_events: dict[str, set[str]] = dataclass_field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.status == "ok"


def _text(value: Any) -> str:
    return str(value or "").strip()


def _flag(info: Mapping[str, Any], key: str) -> bool:
    return _text(info.get(key)) == "1"


def _event_name(row: Mapping[str, Any]) -> str:
    return _text(row.get("redcap_event_name")) or "default"


def summarize_completion(
    rows: Iterable[Mapping[str, Any]],
    *,
    primary_key: str,
    forms: Sequence[str],
) -> dict[str, Any]:
    """Reduce a flat completion export to counts, keeping no record data.

    Every ``<form>_complete`` cell in every exported row is bucketed by form
    and by event. Records and record-events are counted by identity only; the
    identifiers themselves are discarded when this function returns.
    """
    completion_fields = {f"{form}_complete": form for form in forms}
    form_completion: dict[str, Counter] = {form: Counter() for form in forms}
    event_completion: dict[str, Counter] = defaultdict(Counter)
    event_rows: Counter = Counter()
    event_record_ids: dict[str, set[str]] = defaultdict(set)
    record_ids: set[str] = set()
    row_count = 0

    for row in rows:
        row_count += 1
        record_id = _text(row.get(primary_key))
        event = _event_name(row)
        event_rows[event] += 1
        if record_id:
            record_ids.add(record_id)
            event_record_ids[event].add(record_id)
        for field_name, form in completion_fields.items():
            if field_name not in row:
                continue
            bucket = COMPLETION_STATES.get(_text(row.get(field_name)), "not_started")
            form_completion[form][bucket] += 1
            event_completion[event][bucket] += 1

    summary = {
        "record_count": len(record_ids),
        "row_count": row_count,
        "form_completion": form_completion,
        "event_completion": dict(event_completion),
        "event_records": Counter(
            {event: len(ids) for event, ids in event_record_ids.items()}
        ),
        "event_rows": event_rows,
    }

    # Identifiers existed only to count distinct records and record-events.
    record_ids.clear()
    event_record_ids.clear()
    return summary


def fetch_project_snapshot(
    spec: ProjectSpec,
    client: ReadOnlyRedcapClient,
) -> ProjectSnapshot:
    """Fetch one project's structure and completion through export calls only."""

    info = client.export("project")
    if not isinstance(info, Mapping):
        raise RedcapRequestError("invalid_project_info")

    metadata = client.export_list("metadata")
    if not metadata:
        raise RedcapRequestError("empty_metadata")
    instruments = client.export_list("instrument")
    events = client.export_list("event")
    mapping = client.export_list("formEventMapping")

    primary_key = _text(metadata[0].get("field_name"))
    if not primary_key:
        raise RedcapRequestError("missing_primary_key")

    form_order: list[str] = []
    labels: dict[str, str] = {}
    for row in instruments:
        name = _text(row.get("instrument_name"))
        if name and name not in labels:
            labels[name] = _text(row.get("instrument_label")) or name
            form_order.append(name)

    published_fields: list[dict[str, Any]] = []
    withheld = 0
    for row in metadata:
        form = _text(row.get("form_name"))
        if not form:
            continue
        if form not in labels:
            labels[form] = form
            form_order.append(form)
        if is_identifier_field(row):
            withheld += 1
            continue
        published_fields.append(
            {
                "field_name": _text(row.get("field_name")),
                "form_name": form,
                "field_type": _text(row.get("field_type")),
                "validation": _text(
                    row.get("text_validation_type_or_show_slider_number")
                ),
                "required": _text(row.get("required_field")).lower() == "y",
                "branching": bool(_text(row.get("branching_logic"))),
                "choices": choice_count(row),
            }
        )

    form_events: dict[str, set[str]] = {name: set() for name in form_order}
    for row in mapping:
        form = _text(row.get("form"))
        event = _text(row.get("unique_event_name"))
        if form and event:
            form_events.setdefault(form, set()).add(event)

    completion_rows = client.export(
        "record",
        type="flat",
        rawOrLabel="raw",
        rawOrLabelHeaders="raw",
        exportCheckboxLabel="false",
        exportSurveyFields="false",
        exportDataAccessGroups="false",
        **_field_params([primary_key, *(f"{name}_complete" for name in form_order)]),
    )
    if not isinstance(completion_rows, list):
        raise RedcapRequestError("invalid_records")

    summary = summarize_completion(
        completion_rows, primary_key=primary_key, forms=form_order
    )
    # The only copy of the exported rows is released before this frame returns.
    completion_rows.clear()

    event_labels = {
        _text(row.get("unique_event_name")): _text(row.get("event_name"))
        for row in events
        if _text(row.get("unique_event_name"))
    }

    return ProjectSnapshot(
        spec=spec,
        status="ok",
        title=_text(info.get("project_title")) or spec.expected_title,
        project_id=_coerce_int(info.get("project_id")),
        longitudinal=_flag(info, "is_longitudinal"),
        repeating=_flag(info, "has_repeating_instruments_or_events"),
        surveys=_flag(info, "surveys_enabled"),
        record_count=int(summary["record_count"]),
        row_count=int(summary["row_count"]),
        instruments=[{"name": name, "label": labels[name]} for name in form_order],
        events=[
            {"name": name, "label": label or name}
            for name, label in sorted(event_labels.items())
        ],
        fields=published_fields,
        identifier_fields_withheld=withheld,
        form_completion=summary["form_completion"],
        event_completion=summary["event_completion"],
        event_records=summary["event_records"],
        event_rows=summary["event_rows"],
        form_events=form_events,
    )


def _field_params(names: Sequence[str]) -> dict[str, str]:
    return {f"fields[{index}]": name for index, name in enumerate(names)}


def _coerce_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _suppressed(value: int, threshold: int) -> bool:
    """A non-zero count below the threshold could describe a single person."""
    return 0 < value < threshold


def _completion_block(counts: Counter, threshold: int) -> dict[str, Any]:
    values = {key: int(counts.get(key, 0)) for key in STATUS_KEYS}
    started = values["complete"] + values["unverified"] + values["incomplete"]
    suppressed = any(_suppressed(value, threshold) for value in values.values())
    block: dict[str, Any] = {
        key: (None if suppressed else values[key]) for key in STATUS_KEYS
    }
    block["started"] = None if suppressed else started
    block["total"] = None if suppressed else started + values["not_started"]
    block["rate"] = (
        None
        if suppressed or not started
        else round(values["complete"] / started * 100, 1)
    )
    block["suppressed"] = suppressed
    return block


def quality_signals(snapshot: ProjectSnapshot) -> list[dict[str, Any]]:
    """Rule-based structural findings over published field definitions."""
    fields = snapshot.fields
    choice_types = {"radio", "dropdown", "checkbox"}
    mapped_forms = {form for form, events in snapshot.form_events.items() if events}
    unmapped = (
        sum(1 for item in snapshot.instruments if item["name"] not in mapped_forms)
        if snapshot.longitudinal
        else 0
    )
    counts = {
        "Unvalidated free text": sum(
            1
            for item in fields
            if item["field_type"] in {"text", "notes"} and not item["validation"]
        ),
        "Choice fields with no options": sum(
            1
            for item in fields
            if item["field_type"] in choice_types and not item["choices"]
        ),
        "Calculated fields": sum(1 for item in fields if item["field_type"] == "calc"),
        "Fields with branching logic": sum(1 for item in fields if item["branching"]),
        "Required fields": sum(1 for item in fields if item["required"]),
        "Instruments not mapped to an event": unmapped,
        "Identifier fields withheld": snapshot.identifier_fields_withheld,
    }
    return [
        {"check": check, "count": counts[check], "detail": detail}
        for check, detail in QUALITY_CHECKS
    ]


def build_project_entry(
    snapshot: ProjectSnapshot,
    *,
    threshold: int,
) -> dict[str, Any]:
    """Assemble one project's published entry from its snapshot."""

    if not snapshot.ok:
        return {
            "key": snapshot.spec.key,
            "study": snapshot.spec.study,
            "role": snapshot.spec.role,
            "project_id": snapshot.spec.expected_project_id,
            "title": snapshot.spec.expected_title,
            "status": snapshot.status,
            "error": snapshot.error_code,
        }

    fields_by_form: Counter = Counter(item["form_name"] for item in snapshot.fields)
    type_counts: Counter = Counter(
        item["field_type"] for item in snapshot.fields if item["field_type"]
    )

    instrument_rows = []
    for item in snapshot.instruments:
        name = item["name"]
        block = _completion_block(
            snapshot.form_completion.get(name, Counter()), threshold
        )
        instrument_rows.append(
            {
                "name": name,
                "label": item["label"],
                "fields": int(fields_by_form.get(name, 0)),
                "events": len(snapshot.form_events.get(name, set())),
                **block,
            }
        )

    event_labels = {item["name"]: item["label"] for item in snapshot.events}
    event_rows = []
    for name in sorted(set(snapshot.event_rows) | set(event_labels)):
        records = int(snapshot.event_records.get(name, 0))
        rows = int(snapshot.event_rows.get(name, 0))
        block = _completion_block(
            snapshot.event_completion.get(name, Counter()), threshold
        )
        record_suppressed = _suppressed(records, threshold)
        event_rows.append(
            {
                "name": name,
                "label": event_labels.get(name, name),
                "records": None if record_suppressed else records,
                "rows": None if record_suppressed else rows,
                "started": block["started"],
                "rate": block["rate"],
                "suppressed": block["suppressed"] or record_suppressed,
            }
        )

    totals: Counter = Counter()
    for counts in snapshot.form_completion.values():
        totals.update(counts)
    record_suppressed = _suppressed(snapshot.record_count, threshold)

    return {
        "key": snapshot.spec.key,
        "study": snapshot.spec.study,
        "role": snapshot.spec.role,
        "project_id": snapshot.project_id or snapshot.spec.expected_project_id,
        "title": snapshot.title,
        "status": "ok",
        "longitudinal": snapshot.longitudinal,
        "repeating": snapshot.repeating,
        "surveys": snapshot.surveys,
        "records": None if record_suppressed else snapshot.record_count,
        "record_events": None if record_suppressed else snapshot.row_count,
        "instruments": len(snapshot.instruments),
        "fields": len(snapshot.fields) + snapshot.identifier_fields_withheld,
        "fields_published": len(snapshot.fields),
        "identifier_fields_withheld": snapshot.identifier_fields_withheld,
        "required_fields": sum(1 for item in snapshot.fields if item["required"]),
        "branching_fields": sum(1 for item in snapshot.fields if item["branching"]),
        "events": len(snapshot.events),
        "completion": _completion_block(totals, threshold),
        "field_types": [
            [name, count]
            for name, count in sorted(
                type_counts.items(), key=lambda pair: (-pair[1], pair[0])
            )
        ],
        "instrument_rows": instrument_rows,
        "event_rows": event_rows,
        "quality": quality_signals(snapshot),
    }


def build_instrument_matrix(
    snapshots: Sequence[ProjectSnapshot],
) -> list[dict[str, Any]]:
    """Instrument-by-project presence, so shared forms are visible at a glance."""
    labels: dict[str, str] = {}
    members: dict[str, list[str]] = defaultdict(list)
    studies: dict[str, set[str]] = defaultdict(set)
    for snapshot in snapshots:
        if not snapshot.ok:
            continue
        for item in snapshot.instruments:
            name = item["name"]
            labels.setdefault(name, item["label"])
            members[name].append(snapshot.spec.key)
            studies[name].add(snapshot.spec.study)
    return [
        {
            "name": name,
            "label": labels[name],
            "projects": sorted(members[name]),
            "studies": sorted(studies[name]),
            "project_count": len(members[name]),
            "study_count": len(studies[name]),
        }
        for name in sorted(labels, key=lambda key: (-len(members[key]), key))
    ]


def build_overlap(snapshots: Sequence[ProjectSnapshot]) -> dict[str, Any]:
    """Pairwise count of instruments two projects both define."""
    healthy = [snapshot for snapshot in snapshots if snapshot.ok]
    keys = [snapshot.spec.key for snapshot in healthy]
    sets = {
        snapshot.spec.key: {item["name"] for item in snapshot.instruments}
        for snapshot in healthy
    }
    cells = [[len(sets[row] & sets[column]) for column in keys] for row in keys]
    return {"keys": keys, "cells": cells}


def build_field_inventory(snapshots: Sequence[ProjectSnapshot]) -> dict[str, Any]:
    """Dictionary-encode every published field so the payload stays small.

    Repeated strings (project key, form, type, validation) become indexes into
    shared vocabularies. Field *names* are kept verbatim because they are the
    lab's own variable names; labels, notes, and choice text are never present
    to encode.
    """
    projects: list[str] = []
    forms: list[str] = []
    types: list[str] = []
    validations: list[str] = []
    indexes: dict[str, dict[str, int]] = {
        "projects": {},
        "forms": {},
        "types": {},
        "validations": {},
    }

    def intern(bucket: str, target: list[str], value: str) -> int:
        table = indexes[bucket]
        if value not in table:
            table[value] = len(target)
            target.append(value)
        return table[value]

    rows: list[list[Any]] = []
    for snapshot in snapshots:
        if not snapshot.ok:
            continue
        project_index = intern("projects", projects, snapshot.spec.key)
        for item in snapshot.fields:
            flags = 0
            if item["required"]:
                flags |= FIELD_FLAG_REQUIRED
            if item["branching"]:
                flags |= FIELD_FLAG_BRANCHING
            if item["validation"]:
                flags |= FIELD_FLAG_VALIDATED
            rows.append(
                [
                    project_index,
                    intern("forms", forms, item["form_name"]),
                    intern("types", types, item["field_type"]),
                    intern("validations", validations, item["validation"]),
                    item["field_name"],
                    item["choices"],
                    flags,
                ]
            )

    return {
        "projects": projects,
        "forms": forms,
        "types": types,
        "validations": validations,
        "rows": rows,
    }


def _iso_utc_now() -> str:
    return (
        datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    )


def _study_entries(
    config: PortfolioConfig,
    snapshots: Sequence[ProjectSnapshot],
    entries: Sequence[Mapping[str, Any]],
    *,
    threshold: int,
) -> list[dict[str, Any]]:
    by_key = {entry["key"]: entry for entry in entries}
    studies: list[dict[str, Any]] = []
    for study in config.studies:
        members = [
            snapshot for snapshot in snapshots if snapshot.spec.study == study.key
        ]
        healthy = [snapshot for snapshot in members if snapshot.ok]
        totals: Counter = Counter()
        for snapshot in healthy:
            for counts in snapshot.form_completion.values():
                totals.update(counts)
        # A study's enrollment is the count from its enrollment authority; the
        # lab assessment project mirrors a subset of the same participants, so
        # summing the two would double-count people.
        authority = next(
            (snapshot for snapshot in healthy if snapshot.spec.enrollment_authority),
            None,
        )
        records = None
        if authority is not None and not _suppressed(authority.record_count, threshold):
            records = authority.record_count
        studies.append(
            {
                "key": study.key,
                "label": study.label,
                "target": study.target,
                "status": "ok" if len(healthy) == len(members) else "degraded",
                "projects_total": len(members),
                "projects_ok": len(healthy),
                "project_keys": [snapshot.spec.key for snapshot in members],
                "records": records,
                "instruments": sum(
                    int(by_key[snapshot.spec.key].get("instruments", 0))
                    for snapshot in healthy
                ),
                "fields": sum(
                    int(by_key[snapshot.spec.key].get("fields", 0))
                    for snapshot in healthy
                ),
                "events": sum(
                    int(by_key[snapshot.spec.key].get("events", 0))
                    for snapshot in healthy
                ),
                "completion": _completion_block(totals, threshold),
            }
        )
    return studies


def build_metadata_payload(
    config: PortfolioConfig,
    snapshots: Sequence[ProjectSnapshot],
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Build the published metadata watcher contract."""

    threshold = config.small_cell_threshold
    entries = [
        build_project_entry(snapshot, threshold=threshold) for snapshot in snapshots
    ]
    healthy = [snapshot for snapshot in snapshots if snapshot.ok]

    payload: dict[str, Any] = {
        "schema": OUTPUT_SCHEMA,
        "data_version": "",
        "generated_at": generated_at or _iso_utc_now(),
        "aggregate_only": True,
        # Machine-checkable statements about what this artifact is not, so the
        # Pages publisher can refuse a regression instead of shipping it.
        "contains_item_text": False,
        "contains_record_data": False,
        "identifier_fields_withheld": True,
        "read_only": True,
        "small_cell_threshold": threshold,
        "refresh_cadence_seconds": config.refresh_cadence_seconds,
        # The freshness budget, published so the page does not have to invent a
        # staleness threshold of its own. It is the same SLA every other
        # dashboard surface is judged against.
        "sla_seconds": config.sla_seconds,
        "projects_total": len(snapshots),
        "projects_ok": len(healthy),
        "instruments_total": sum(len(snapshot.instruments) for snapshot in healthy),
        "fields_total": sum(
            len(snapshot.fields) + snapshot.identifier_fields_withheld
            for snapshot in healthy
        ),
        "studies": _study_entries(config, snapshots, entries, threshold=threshold),
        "projects": entries,
        "failed": [
            {
                "key": snapshot.spec.key,
                "study": snapshot.spec.study,
                "title": snapshot.spec.expected_title,
                "error": snapshot.error_code or "unknown_error",
            }
            for snapshot in snapshots
            if not snapshot.ok
        ],
        "matrix": build_instrument_matrix(snapshots),
        "overlap": build_overlap(snapshots),
        "fields": build_field_inventory(snapshots),
    }

    hashable = {
        key: value
        for key, value in payload.items()
        if key not in {"data_version", "generated_at"}
    }
    canonical = json.dumps(
        hashable, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    payload["data_version"] = f"sha256:{hashlib.sha256(canonical).hexdigest()}"
    return payload


def assert_no_tokens(payload: Mapping[str, Any], tokens: Iterable[str]) -> None:
    """Refuse to publish a payload in which any API token appears.

    The builder has no reason to write a token, so a hit here means a bug
    upstream. Failing before the write keeps the artifact from reaching Pages.
    """
    serialized = json.dumps(payload, ensure_ascii=False)
    for token in tokens:
        candidate = str(token or "").strip()
        # A short or empty value would match everywhere and prove nothing.
        if len(candidate) >= 8 and candidate in serialized:
            raise ReadOnlyViolation("token_in_payload")


__all__ = [
    "COMPLETION_STATES",
    "FIELD_FLAG_BRANCHING",
    "FIELD_FLAG_REQUIRED",
    "FIELD_FLAG_VALIDATED",
    "OUTPUT_SCHEMA",
    "READ_ONLY_CONTENTS",
    "WRITE_PARAMETERS",
    "ProjectSnapshot",
    "ReadOnlyRedcapClient",
    "ReadOnlyViolation",
    "RequestPacer",
    "assert_no_tokens",
    "build_field_inventory",
    "build_instrument_matrix",
    "build_metadata_payload",
    "build_overlap",
    "build_project_entry",
    "fetch_project_snapshot",
    "quality_signals",
    "summarize_completion",
]
