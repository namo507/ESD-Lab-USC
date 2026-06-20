"""Participant operations policy and de-identified role mapping helpers.

The dashboard uses this module to keep participant-role, dual-enrollment,
form-routing, questionnaire, and scheduling-risk language consistent across
the synthetic payload, the production payload, and the live API adapter.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any, Iterable

STUDY_CODES = ("NANO", "NICO", "ANONICO")
VISIT_SEQUENCE = (
    ("nicu_dc", 0, "NICU discharge"),
    ("cga_3mo", 3, "3 Month CGA"),
    ("cga_6mo", 6, "6 Month CGA"),
    ("cga_9mo", 9, "9 Month CGA"),
    ("cga_12mo", 12, "12 Month CGA"),
    ("cga_18mo", 18, "18 Month CGA"),
    ("cga_24mo", 24, "24 Month CGA"),
    ("cga_36mo", 36, "36 Month outcome"),
)
WORKFLOW_DOC_PATH = "docs/participant_operations_workflow.md"


def _normalize_group(value: Any) -> str:
    text = str(value or "VPT").upper()
    return "VPT" if text == "PT" else text if text in {"VPT", "ASIB", "TD"} else "VPT"


def normalize_visit(value: Any) -> str:
    text = str(value or "cga_12mo").lower()
    text = text.replace(" months", "mo").replace(" month", "mo").replace(" ", "_")
    mapping = {
        "nicu": "nicu_dc",
        "nicu_admission": "nicu_dc",
        "nicu_discharge": "nicu_dc",
        "0": "nicu_dc",
        "1_month_cga": "cga_3mo",
        "2_months_cga": "cga_3mo",
        "3_month_cga": "cga_3mo",
        "3_months_cga": "cga_3mo",
        "6_month": "cga_6mo",
        "6_months": "cga_6mo",
        "9_month": "cga_9mo",
        "9_months": "cga_9mo",
        "12_month": "cga_12mo",
        "12_months": "cga_12mo",
        "18_month": "cga_18mo",
        "18_months": "cga_18mo",
        "24_month": "cga_24mo",
        "24_months": "cga_24mo",
        "36_month": "cga_36mo",
        "36_months": "cga_36mo",
    }
    if text in mapping:
        return mapping[text]
    if text in {visit_id for visit_id, _, _ in VISIT_SEQUENCE}:
        return text
    if "36" in text:
        return "cga_36mo"
    if "24" in text:
        return "cga_24mo"
    if "18" in text:
        return "cga_18mo"
    if "12" in text:
        return "cga_12mo"
    if "9" in text:
        return "cga_9mo"
    if "6" in text:
        return "cga_6mo"
    if "3" in text or "1" in text or "2" in text:
        return "cga_3mo"
    return "cga_12mo"


def _visit_index(visit_id: str) -> int:
    return next((idx for idx, item in enumerate(VISIT_SEQUENCE) if item[0] == visit_id), 4)


def _visit_label(visit_id: str) -> str:
    return next((label for item_id, _, label in VISIT_SEQUENCE if item_id == visit_id), visit_id)


def _visit_marker(visit_id: str) -> str:
    month = next((month for item_id, month, _ in VISIT_SEQUENCE if item_id == visit_id), 12)
    return "NICU" if month == 0 else f"CGA-{month:02d}"


def _next_visit(visit_id: str) -> dict[str, Any]:
    idx = min(_visit_index(visit_id) + 1, len(VISIT_SEQUENCE) - 1)
    item_id, month, label = VISIT_SEQUENCE[idx]
    return {"id": item_id, "month": month, "label": label, "marker": _visit_marker(item_id)}


def _parse_studies(value: Any) -> list[str]:
    if isinstance(value, list):
        raw = value
    else:
        raw = str(value or "").replace("/", ",").replace("+", ",").split(",")
    studies: list[str] = []
    for item in raw:
        code = str(item).strip().upper().replace("-", "")
        if code in STUDY_CODES and code not in studies:
            studies.append(code)
    return studies


def _derive_studies(row: dict[str, Any], index: int) -> list[str]:
    explicit = _parse_studies(
        row.get("studies")
        or row.get("study_membership")
        or row.get("study_roles")
        or row.get("study")
    )
    if explicit:
        return explicit

    group = _normalize_group(row.get("group") or row.get("group_assignment"))
    if index % 11 == 0:
        return ["NANO", "ANONICO"]
    if index % 9 == 0:
        return ["NANO", "NICO"]
    if group == "ASIB":
        return ["ANONICO"]
    return ["NANO"]


def _series_for(studies: list[str]) -> str:
    return "5" if studies and studies[0] == "NANO" else "9"


def _digits_from_id(nano_id: str, fallback: int) -> str:
    digits = "".join(ch for ch in nano_id if ch.isdigit())
    if len(digits) >= 3:
        return digits[-3:]
    return f"{fallback + 1:03d}"[-3:]


def _participant_code(nano_id: str, studies: list[str], index: int) -> str:
    prefix = "DUAL" if len(studies) > 1 else studies[0]
    return f"{prefix}-{_series_for(studies)}{_digits_from_id(nano_id, index)}"


def _form_policy(studies: list[str], index: int) -> dict[str, str]:
    if len(studies) == 1:
        return {
            "mode": "single_study",
            "label": "Single-study form set",
            "rule": "Use the study-specific AIH, EH, questionnaire, and visit packet for the participant's sole study.",
        }
    if index % 11 == 0:
        return {
            "mode": "dual_form",
            "label": "Dual form exception",
            "rule": "Duplicate AIH and EH into study-specific records only when a backend data-pull rule requires separate source forms; keep both forms connected by the linking ID.",
        }
    return {
        "mode": "single_master",
        "label": "Single master AIH/EH",
        "rule": "One master AIH and EH follows the participant across studies; visit and intervention history remain linked in one place.",
    }


def _status(index: int, offset: int) -> str:
    return ("complete", "due", "missing", "did_not_qualify", "other")[(index + offset) % 5]


def _questionnaires(studies: list[str], visit_id: str, index: int) -> list[dict[str, str]]:
    marker = _visit_marker(visit_id)
    base = [
        ("Enrollment-type check", "operations"),
        ("Visit packet assignment", "scheduling"),
        ("Caregiver questionnaire", "questionnaire"),
        ("AIH/EH routing", "forms"),
    ]
    if len(studies) > 1:
        base.append(("Dual-enrollment cross-verification", "operations"))
    if "ANONICO" in studies:
        base.append(("ANONICO role packet", "questionnaire"))
    if "NICO" in studies:
        base.append(("NICO scheduling supplement", "scheduling"))
    return [
        {
            "name": name,
            "domain": domain,
            "status": _status(index, offset),
            "due": marker,
        }
        for offset, (name, domain) in enumerate(base)
    ]


def _linked_forms(
    studies: list[str],
    policy: dict[str, str],
    linking_id: str,
    index: int,
) -> list[dict[str, str]]:
    form_names = ["AIH", "EH", "Intervention history"]
    if len(studies) > 1 and policy["mode"] == "dual_form":
        return [
            {
                "form": form,
                "owner": study,
                "policy": policy["mode"],
                "status": _status(index, form_idx + study_idx),
                "linking_id": linking_id,
            }
            for form_idx, form in enumerate(form_names)
            for study_idx, study in enumerate(studies)
        ]
    owner = "+".join(studies)
    return [
        {
            "form": form,
            "owner": owner,
            "policy": policy["mode"],
            "status": _status(index, form_idx),
            "linking_id": linking_id,
        }
        for form_idx, form in enumerate(form_names)
    ]


def _risk(
    studies: list[str],
    questionnaire_rows: list[dict[str, str]],
    qc_status: Any,
) -> tuple[str, list[str]]:
    reasons: list[str] = []
    statuses = {row["status"] for row in questionnaire_rows}
    if len(studies) > 1:
        reasons.append("Dual enrollment requires cross-study packet verification.")
    if "missing" in statuses:
        reasons.append("One or more required questionnaire or form items are missing.")
    if "due" in statuses:
        reasons.append("A next-visit packet item is due before scheduling.")
    if str(qc_status or "").lower() in {"review", "pending", "reject", "failed", "fail"}:
        reasons.append("Recent QA or QC status needs staff review.")
    if len(studies) > 1 and ("missing" in statuses or "due" in statuses):
        return "high", reasons
    if reasons:
        return "watch", reasons
    return "low", ["No current packet, questionnaire, or role-routing risk flagged."]


def build_participant_operation(row: dict[str, Any], index: int) -> dict[str, Any]:
    nano_id = str(row.get("id") or row.get("nano_id") or f"NANO-{index + 1:04d}")
    group = _normalize_group(row.get("group") or row.get("group_assignment"))
    studies = _derive_studies(row, index)
    visit_id = normalize_visit(row.get("visit") or row.get("last_visit"))
    next_visit = _next_visit(visit_id)
    policy = _form_policy(studies, index)
    participant_code = _participant_code(nano_id, studies, index)
    linking_id = f"LINK-{_digits_from_id(nano_id, index)}-{'+'.join(studies)}"
    questionnaires = _questionnaires(studies, visit_id, index)
    risk_level, risk_reasons = _risk(studies, questionnaires, row.get("qc_status") or row.get("qa"))
    packet_requirements = [
        f"{_visit_label(next_visit['id'])} visit packet",
        "Enrollment-type check before scheduling",
        policy["label"],
    ]
    if len(studies) > 1:
        packet_requirements.append("Cross-study questionnaire verification")

    return {
        "participant_id": nano_id,
        "participant_code": participant_code,
        "role_label": " + ".join(studies),
        "study_roles": studies,
        "enrollment_type": "dual" if len(studies) > 1 else "single",
        "primary_study": studies[0],
        "group": group,
        "visit_type": "NICU discharge" if visit_id == "nicu_dc" else "CGA longitudinal",
        "visit_marker": _visit_marker(visit_id),
        "current_visit": {"id": visit_id, "label": _visit_label(visit_id), "marker": _visit_marker(visit_id)},
        "next_visit": next_visit,
        "numbering_convention": (
            "5-series NANO-primary participant code"
            if _series_for(studies) == "5"
            else "9-series NICO/ANONICO-primary participant code"
        ),
        "form_policy": policy,
        "linking_id": linking_id,
        "linked_forms": _linked_forms(studies, policy, linking_id, index),
        "questionnaire_checklist": questionnaires,
        "packet_requirements": packet_requirements,
        "scheduling_risk": risk_level,
        "scheduling_risk_reasons": risk_reasons,
        "pre_visit_checks": [
            "Confirm enrollment type and study roles before offering dates.",
            "Confirm AIH/EH policy and linking ID before REDCap packet assignment.",
            "Cross-check questionnaire checklist against visit type.",
            "Review intervention history order before 36-month or outcome forms.",
        ],
        "intervention_history": {
            "order": "Baseline AIH -> EH update -> intervention exposure -> visit history -> 36-month review",
            "summary": (
                "Shared intervention history follows the participant across studies."
                if policy["mode"] == "single_master"
                else "Study-specific duplicates stay connected through the linking ID."
            ),
            "last_review": "pre-visit" if index % 3 else "36-month prep",
        },
        "scheduling_note": (
            "Dual-enrolled participant: verify packet, questionnaire, and form-routing before scheduling."
            if len(studies) > 1
            else "Single-study participant: standard visit-type routing applies."
        ),
    }


def build_participant_operations(cohort_rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    participants = [
        build_participant_operation(row, index)
        for index, row in enumerate(cohort_rows)
        if isinstance(row, dict)
    ]
    enrollment_counts = Counter(item["enrollment_type"] for item in participants)
    risk_counts = Counter(item["scheduling_risk"] for item in participants)
    policy_counts = Counter(item["form_policy"]["mode"] for item in participants)

    return {
        "meta": {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "source_doc": WORKFLOW_DOC_PATH,
            "participant_count": len(participants),
        },
        "id_legend": [
            {
                "code": "NANO-5###",
                "meaning": "NANO-primary single-study participant; 5-series is the standard NANO operational numbering convention.",
            },
            {
                "code": "NICO-9###",
                "meaning": "NICO-primary single-study participant; 9-series preserves the existing NICO/ANONICO numbering path.",
            },
            {
                "code": "ANONICO-9###",
                "meaning": "ANONICO-primary single-study participant; 9-series is used unless a backend pull requires the original source identifier.",
            },
            {
                "code": "DUAL-5### or DUAL-9###",
                "meaning": "Dual-enrolled participant; the series digit follows the primary study and the linking ID connects forms across studies.",
            },
        ],
        "numbering_policy": {
            "standard": "Use 5-series for NANO-primary participants and 9-series for NICO/ANONICO-primary participants.",
            "exception": "Keep the source-system identifier only when a REDCap or backend data-pull rule explicitly requires it; record the exception in the scheduling note.",
            "visit_marker_rule": "Attach the visit marker (NICU, CGA-03, CGA-06, CGA-09, CGA-12, CGA-18, CGA-24, CGA-36) to packet and questionnaire routing.",
        },
        "form_policy_options": [
            {
                "mode": "single_master",
                "label": "Single master AIH/EH",
                "rule": "Default for dual enrollment: one AIH and one EH follow the participant across studies.",
            },
            {
                "mode": "dual_form",
                "label": "Dual form exception",
                "rule": "Use separate study-specific AIH/EH forms only when a backend pull requires duplicates; connect duplicates with linking_id.",
            },
            {
                "mode": "single_study",
                "label": "Single-study form set",
                "rule": "Use the participant's sole study packet and no cross-study duplication.",
            },
        ],
        "workflow_steps": [
            "Identify participant code, study roles, enrollment type, and visit marker.",
            "Run the enrollment-type check before a visit is scheduled.",
            "Apply the form policy and confirm the linking ID for dual-enrolled participants.",
            "Cross-check packet, questionnaires, and REDCap completeness against study role and visit type.",
            "Review intervention history in chronological order before outcome milestones such as 36 months.",
            "Record Did Not Qualify or Other outcomes instead of leaving enrollment or form states blank.",
        ],
        "summary": {
            "single": int(enrollment_counts.get("single", 0)),
            "dual": int(enrollment_counts.get("dual", 0)),
            "risk_low": int(risk_counts.get("low", 0)),
            "risk_watch": int(risk_counts.get("watch", 0)),
            "risk_high": int(risk_counts.get("high", 0)),
            "single_master_forms": int(policy_counts.get("single_master", 0)),
            "dual_form_exceptions": int(policy_counts.get("dual_form", 0)),
        },
        "participants": participants,
    }


def operation_lookup(operations_block: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    participants = (operations_block or {}).get("participants") or []
    return {
        str(item.get("participant_id")): item
        for item in participants
        if isinstance(item, dict) and item.get("participant_id")
    }
