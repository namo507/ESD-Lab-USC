"""Tests for the structural REDCap data dictionary export.

The privacy and copyright guarantees of this artifact are entirely enforced in
code, so they are asserted here rather than left to review.
"""

from __future__ import annotations

import json

from redcap.api.dictionary import (
    OUTPUT_SCHEMA,
    build_dictionary_payload,
    build_project_dictionary,
    choice_count,
    is_identifier_field,
    summarize_field,
    summarize_instrument,
)

# Verbatim wording of a licensed instrument item. It must never survive export.
LICENSED_ITEM_TEXT = "Does your child point to show you something interesting?"


def field(
    name: str,
    form: str,
    *,
    field_type: str = "text",
    identifier: str = "",
    required: str = "",
    branching: str = "",
    choices: str = "",
    label: str = LICENSED_ITEM_TEXT,
) -> dict:
    return {
        "field_name": name,
        "form_name": form,
        "field_type": field_type,
        "field_label": label,
        "section_header": "Sensitive section heading",
        "select_choices_or_calculations": choices,
        "field_note": "internal note",
        "text_validation_type_or_show_slider_number": "",
        "identifier": identifier,
        "branching_logic": branching,
        "required_field": required,
    }


def test_identifier_flag_is_recognized_case_insensitively():
    assert is_identifier_field({"identifier": "y"}) is True
    assert is_identifier_field({"identifier": "Y"}) is True
    assert is_identifier_field({"identifier": ""}) is False
    assert is_identifier_field({}) is False


def test_summarized_field_drops_label_note_and_header():
    summary = summarize_field(field("demo_dob", "demographics"))

    assert summary["field_name"] == "demo_dob"
    assert summary["field_type"] == "text"
    assert LICENSED_ITEM_TEXT not in json.dumps(summary)
    for banned in ("field_label", "field_note", "section_header", "identifier"):
        assert banned not in summary


def test_choice_count_reports_shape_without_option_text():
    counted = summarize_field(
        field("q1", "f", field_type="radio", choices="1, Yes | 2, No | 3, Unsure")
    )
    assert counted["choices"] == 3
    assert "Unsure" not in json.dumps(counted)


def test_choice_count_ignores_free_text_and_calculated_fields():
    assert (
        choice_count({"field_type": "text", "select_choices_or_calculations": "x"}) == 0
    )
    assert (
        choice_count({"field_type": "calc", "select_choices_or_calculations": "1+1"})
        == 0
    )
    assert (
        choice_count({"field_type": "radio", "select_choices_or_calculations": ""}) == 0
    )


def test_instrument_withholds_identifier_fields_but_keeps_the_count():
    summary = summarize_instrument(
        "demographics",
        "Demographics",
        [
            field("demo_id", "demographics"),
            field("demo_name", "demographics", identifier="y"),
            field("demo_mrn", "demographics", identifier="y"),
            field("demo_group", "demographics", field_type="radio", required="y"),
        ],
    )

    published = {entry["field_name"] for entry in summary["fields"]}
    assert published == {"demo_id", "demo_group"}
    assert summary["identifier_fields_withheld"] == 2
    assert summary["required_fields"] == 1
    # Counts must reconcile against REDCap or someone will chase the gap.
    assert summary["fields_published"] + summary["identifier_fields_withheld"] == (
        summary["fields_total"]
    )
    assert "demo_name" not in json.dumps(summary)


def test_fields_on_an_unlisted_form_are_still_grouped_rather_than_dropped():
    entry = build_project_dictionary(
        key="nano_surveys",
        study="nano",
        project_id=4218,
        title="NANO Study Surveys",
        instruments=[{"instrument_name": "known", "instrument_label": "Known Form"}],
        metadata=[field("a", "known"), field("b", "orphan_form")],
    )

    names = {item["name"] for item in entry["instruments"]}
    assert names == {"known", "orphan_form"}
    assert entry["fields_total"] == 2


def test_project_dictionary_totals_roll_up_from_instruments():
    entry = build_project_dictionary(
        key="nano_lab",
        study="nano",
        project_id=5484,
        title="NANO Lab",
        instruments=[
            {"instrument_name": "one", "instrument_label": "One"},
            {"instrument_name": "two", "instrument_label": "Two"},
        ],
        metadata=[
            field("a", "one"),
            field("b", "one", identifier="y"),
            field("c", "two"),
        ],
    )

    assert entry["instruments_total"] == 2
    assert entry["fields_total"] == 3
    assert entry["fields_published"] == 2
    assert entry["identifier_fields_withheld"] == 1
    assert entry["project_id"] == 5484


def test_payload_envelope_declares_what_it_excludes():
    payload = build_dictionary_payload(
        [
            build_project_dictionary(
                key="nano_surveys",
                study="nano",
                project_id=4218,
                title="NANO Study Surveys",
                instruments=[{"instrument_name": "f", "instrument_label": "F"}],
                metadata=[field("a", "f"), field("b", "f", identifier="y")],
            ),
            {"key": "abc_lab", "study": "abc", "error": "missing_token"},
        ]
    )

    assert payload["schema"] == OUTPUT_SCHEMA
    assert payload["aggregate_only"] is True
    assert payload["contains_item_text"] is False
    assert payload["contains_record_data"] is False
    assert payload["identifier_fields_withheld"] is True
    # A failed project counts toward the total but not toward the healthy count.
    assert payload["projects_total"] == 2
    assert payload["projects_ok"] == 1
    assert payload["generated_at"].endswith("Z")


def test_no_licensed_item_text_survives_a_full_export():
    payload = build_dictionary_payload(
        [
            build_project_dictionary(
                key="nano_surveys",
                study="nano",
                project_id=4218,
                title="NANO Study Surveys",
                instruments=[
                    {"instrument_name": "mchat", "instrument_label": "M-CHAT-R"}
                ],
                metadata=[
                    field(
                        "mchat_1", "mchat", field_type="radio", choices="1, Yes | 0, No"
                    ),
                    field("mchat_name", "mchat", identifier="y"),
                ],
            )
        ]
    )

    serialized = json.dumps(payload)
    assert LICENSED_ITEM_TEXT not in serialized
    assert "Sensitive section heading" not in serialized
    assert "internal note" not in serialized
    assert "mchat_name" not in serialized
    # The instrument's own title is the lab's label and is intentionally kept.
    assert "M-CHAT-R" in serialized
