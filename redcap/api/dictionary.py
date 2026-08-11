"""Structural REDCap data dictionary export.

Publishes the *shape* of each project -- its survey instruments, field names,
field types, and form grouping -- without publishing what the fields ask or
what participants answered.

Two exclusions are deliberate and load-bearing:

``field_label`` is never exported.
    For these projects the label is the verbatim item wording of licensed
    assessments (Bayley-4, M-CHAT, ADOS-2, EPDS, CSBS). Republishing that on a
    public dashboard is a copyright problem, independent of any privacy
    question. Instrument labels *are* exported: those are the lab's own form
    titles, not item text.

Fields flagged ``identifier = y`` are dropped entirely.
    Their names are not PHI, but listing them maps exactly where identifiers
    live in each project. Each instrument instead reports how many were
    withheld, so field counts still reconcile against REDCap.

The export contains no record data of any kind: only metadata describing the
instrument design.
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping, Sequence

LOGGER = logging.getLogger(__name__)

OUTPUT_SCHEMA = "redcap.dictionary.v1"

# REDCap marks direct identifiers with this flag on the field definition.
IDENTIFIER_FLAG = "y"

# Field-level keys that are safe to publish. Anything not listed is dropped,
# so a future REDCap release adding a chatty column cannot leak it by default.
_SAFE_FIELD_KEYS = ("field_name", "form_name", "field_type")


def _text(value: Any) -> str:
    return str(value or "").strip()


def is_identifier_field(field: Mapping[str, Any]) -> bool:
    """Return True when REDCap flags this field as holding a direct identifier."""
    return _text(field.get("identifier")).lower() == IDENTIFIER_FLAG


def choice_count(field: Mapping[str, Any]) -> int:
    """Count the options on a choice field without exporting their text.

    The option list is pipe-delimited (``1, Yes | 2, No``). Only the number of
    options is published; the wording belongs to the instrument.
    """
    raw = _text(field.get("select_choices_or_calculations"))
    if not raw or _text(field.get("field_type")) in {"calc", "text", "notes"}:
        return 0
    return len([part for part in raw.split("|") if part.strip()])


def summarize_field(field: Mapping[str, Any]) -> dict[str, Any]:
    """Reduce a REDCap field definition to its publishable structure."""
    summary = {key: _text(field.get(key)) for key in _SAFE_FIELD_KEYS}
    summary["required"] = _text(field.get("required_field")).lower() == "y"
    summary["branching"] = bool(_text(field.get("branching_logic")))
    summary["validation"] = _text(
        field.get("text_validation_type_or_show_slider_number")
    )
    summary["choices"] = choice_count(field)
    return summary


def summarize_instrument(
    name: str,
    label: str,
    fields: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Build one instrument's structural summary from its field definitions."""
    published: list[dict[str, Any]] = []
    withheld = 0

    for field in fields:
        if is_identifier_field(field):
            withheld += 1
            continue
        published.append(summarize_field(field))

    type_counts = Counter(
        entry["field_type"] for entry in published if entry["field_type"]
    )

    return {
        "name": name,
        "label": label,
        # Total reflects REDCap reality; published + withheld always reconcile.
        "fields_total": len(published) + withheld,
        "fields_published": len(published),
        "identifier_fields_withheld": withheld,
        "required_fields": sum(1 for entry in published if entry["required"]),
        "branching_fields": sum(1 for entry in published if entry["branching"]),
        "field_types": dict(sorted(type_counts.items())),
        "fields": published,
    }


def build_project_dictionary(
    *,
    key: str,
    study: str,
    project_id: int | None,
    title: str,
    instruments: Iterable[Mapping[str, Any]],
    metadata: Iterable[Mapping[str, Any]],
) -> dict[str, Any]:
    """Assemble one project's structural dictionary.

    Fields are grouped by ``form_name``. A field whose form is missing from the
    instrument list still appears under its own form key rather than being
    dropped, so an out-of-sync instrument list cannot silently lose fields.
    """
    labels: dict[str, str] = {}
    order: list[str] = []
    for entry in instruments:
        name = _text(entry.get("instrument_name"))
        if not name:
            continue
        labels[name] = _text(entry.get("instrument_label")) or name
        order.append(name)

    grouped: dict[str, list[Mapping[str, Any]]] = {name: [] for name in order}
    for field in metadata:
        form = _text(field.get("form_name"))
        if not form:
            continue
        if form not in grouped:
            grouped[form] = []
            order.append(form)
        grouped[form].append(field)

    summaries = [
        summarize_instrument(name, labels.get(name, name), grouped.get(name, []))
        for name in order
    ]

    return {
        "key": key,
        "study": study,
        "project_id": project_id,
        "title": title,
        "instruments_total": len(summaries),
        "fields_total": sum(item["fields_total"] for item in summaries),
        "fields_published": sum(item["fields_published"] for item in summaries),
        "identifier_fields_withheld": sum(
            item["identifier_fields_withheld"] for item in summaries
        ),
        "instruments": summaries,
    }


def build_dictionary_payload(projects: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """Wrap per-project dictionaries in the published artifact envelope."""
    healthy = [item for item in projects if not item.get("error")]
    return {
        "schema": OUTPUT_SCHEMA,
        "generated_at": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "aggregate_only": True,
        # Explicit, machine-checkable statements about what this artifact is
        # not, so a reviewer does not have to infer it from the field list.
        "contains_item_text": False,
        "contains_record_data": False,
        "identifier_fields_withheld": True,
        "projects_total": len(projects),
        "projects_ok": len(healthy),
        "instruments_total": sum(item.get("instruments_total", 0) for item in healthy),
        "fields_total": sum(item.get("fields_total", 0) for item in healthy),
        "projects": list(projects),
    }


__all__ = [
    "OUTPUT_SCHEMA",
    "build_dictionary_payload",
    "build_project_dictionary",
    "choice_count",
    "is_identifier_field",
    "summarize_field",
    "summarize_instrument",
]
