"""NANO Buddy contract over the repository's existing grounded assistant.

The Buddy is an adapter, not another model runtime.  It selects a strict set of
aggregate NANO metrics and public document metadata, answers common operational
questions deterministically, and uses :class:`DashboardChatAssistant` only for
grounded synthesis.  Provider failures therefore degrade to local metric and
document lookup without affecting the dashboard.
"""

from __future__ import annotations

import json
import re
import threading
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterable

from dashboard.assistant.local_chat_assistant import (
    AssistantUnavailable,
    DashboardChatAssistant,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = PROJECT_ROOT / "dashboard" / "data"
BUDDY_ENDPOINT = "/api/buddy"
BUDDY_MAX_CONTEXT_CHARS = 64
BUDDY_CITATION_ROOTS = (
    "docs/",
    "esd-lab-readings/",
    "ESD Lab readings/",
    "dashboard/context_skill/references/",
)
BUDDY_DOCUMENT_SUFFIXES = {".md", ".txt", ".rst", ".pdf"}

_TOKEN_RE = re.compile(r"[a-z0-9_]{2,}")
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
_EXPLICIT_IDENTIFIER_RE = re.compile(
    r"\b(?:nano|asib|pt|td|vpt)[-_ ]?\d{1,8}\b|"
    r"\b(?:participant|subject|infant|baby)\s*(?:id|number|no\.?|#)?\s*"
    r"[-_:]?\s*\d{2,}\b",
    re.IGNORECASE,
)
_DIRECT_PHI_RE = re.compile(
    r"\b(?:mrn|medical record number|date of birth|dob|home address|"
    r"phone number|email address|caregiver name|participant name|"
    r"subject name|identifiable|identified data|phi)\b",
    re.IGNORECASE,
)
_PARTICIPANT_LEVEL_RE = re.compile(
    r"\b(?:participant|subject|infant|baby)[ -]level\b|"
    r"\b(?:list|show|give|identify|name|find|lookup|open|download|export)\b"
    r".{0,80}\b(?:participants?|subjects?|infants?|babies|records?|rows?|ids?|names?)\b|"
    r"\b(?:participants?|subjects?|infants?|babies|records?|rows?|ids?|names?)\b"
    r".{0,80}\b(?:list|show|give|identify|find|lookup|open|download|export)\b",
    re.IGNORECASE,
)
_RAW_SIGNAL_RE = re.compile(
    r"\b(?:raw|sample[- ]level|waveform|trace)\b.{0,35}"
    r"\b(?:ecg|ekg|temperature|signal|rr|r-r|sensor)\b|"
    r"\b(?:ecg|ekg|temperature|signal|rr|r-r|sensor)\b.{0,35}"
    r"\b(?:raw|sample[- ]level|waveform|trace)\b",
    re.IGNORECASE,
)
_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
_PHONE_RE = re.compile(r"(?<!\d)(?:\+?1[-. (]*)?\d{3}[-. )]*\d{3}[-. ]*\d{4}(?!\d)")
_DATE_RE = re.compile(
    r"\b(?:\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?"
    r"|\d{1,2}/\d{1,2}/\d{2,4})\b"
)
_SSN_RE = re.compile(r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)")
_CONTEXTUAL_NAME_RE = re.compile(
    r"\b(?P<label>(?i:patient|participant|subject|infant|baby|caregiver|mother|father))"
    r"(?:'s|\s+(?:name\s*(?:is|:)?|named))?\s+"
    r"(?P<name>[A-Z][A-Za-z'’-]{1,40}(?:\s+[A-Z][A-Za-z'’-]{1,40}){1,3})\b"
)
_STREET_ADDRESS_RE = re.compile(
    r"\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,5}"
    r"(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|court|ct|way)\b",
    re.IGNORECASE,
)
_REDACTED_PHI_RE = re.compile(
    r"\{\{REDACTED:(?:PHI|DATE|MRN|PHONE|SSN|EMAIL|NAME)\}\}|"
    r"\[redacted (?:phi|date|mrn|phone|ssn|email|name|address|study id)\]",
    re.IGNORECASE,
)
_PROMPT_ID_RE = re.compile(
    r"\b(?:nano|asib|pt|td|vpt)[-_ ]?\d{1,8}\b", re.IGNORECASE
)
_REASONING_BLOCK_RE = re.compile(
    r"<(?:think|analysis|reasoning)\s*>.*?</(?:think|analysis|reasoning)\s*>",
    re.IGNORECASE | re.DOTALL,
)
_REASONING_OPEN_RE = re.compile(
    r"<(?:think|analysis|reasoning)\s*>.*$", re.IGNORECASE | re.DOTALL
)
_REASONING_TAG_RE = re.compile(
    r"</?(?:think|analysis|reasoning)\s*>", re.IGNORECASE
)
_FINAL_PREFIX_RE = re.compile(
    r"^\s*(?:final\s+answer|answer)\s*:\s*", re.IGNORECASE
)
_COMMON_QUERY_TOKENS = {
    "about",
    "current",
    "does",
    "from",
    "have",
    "how",
    "many",
    "nano",
    "please",
    "show",
    "study",
    "that",
    "the",
    "this",
    "what",
    "which",
    "with",
}


class BuddyRequestError(ValueError):
    """A stable, client-visible Buddy request validation failure."""

    def __init__(self, message: str, *, http_status: int = 400) -> None:
        super().__init__(message)
        self.http_status = http_status


@dataclass(frozen=True)
class _DocumentMatch:
    title: str
    path: str
    loc: str
    snippet: str
    score: float

    def citation(self) -> dict[str, str]:
        return {"title": self.title, "path": self.path, "loc": self.loc}


def _tokens(value: Any) -> set[str]:
    return set(_TOKEN_RE.findall(str(value or "").casefold()))


def _scalar(value: Any) -> bool:
    return value is None or isinstance(value, (str, int, float, bool))


def _pick_scalars(source: Any, keys: Iterable[str]) -> dict[str, Any]:
    if not isinstance(source, dict):
        return {}
    return {key: source.get(key) for key in keys if key in source and _scalar(source[key])}


def _pick_rows(value: Any, keys: Iterable[str], *, limit: int = 100) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [
        _pick_scalars(row, keys)
        for row in value[:limit]
        if isinstance(row, dict) and _pick_scalars(row, keys)
    ]


def _pick_scalar_map(value: Any, *, limit: int = 100) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    result: dict[str, Any] = {}
    for key, item in list(value.items())[:limit]:
        if _scalar(item) and len(str(key)) <= 80:
            result[str(key)] = item
    return result


def _safe_group_rows(value: Any) -> list[dict[str, Any]] | dict[str, Any]:
    keys = (
        "group",
        "target",
        "enrolled",
        "hda_sustained_pct",
        "sustained_pct",
        "hda_quality_bpm",
        "rsa_baseline_ms2",
        "window",
        "timepoint",
        "timepoint_m",
        "mean",
        "ci_low",
        "ci_high",
    )
    if isinstance(value, list):
        return _pick_rows(value, keys)
    if isinstance(value, dict):
        return {
            str(group): _pick_scalars(row, keys)
            for group, row in value.items()
            if isinstance(row, dict) and _pick_scalars(row, keys)
        }
    return []


def sanitize_nano_metrics(payload: Any) -> dict[str, Any]:
    """Return only allowlisted aggregate fields from ``dashboard_data.json``.

    This intentionally ignores cohort rows, record lists, IDs, flagged
    participants, individual traces, free text, and raw-signal structures even
    if they appear below ``nano`` in an older payload.
    """

    nano = payload.get("nano") if isinstance(payload, dict) else None
    if not isinstance(nano, dict):
        return {}
    result: dict[str, Any] = {}

    meta = _pick_scalars(
        nano.get("meta"), ("study", "state", "as_of", "n_target", "source")
    )
    if meta:
        result["meta"] = meta

    enrollment = nano.get("enrollment")
    safe_enrollment = _pick_scalars(
        enrollment,
        (
            "target",
            "enrolled",
            "active",
            "retention_pct",
            "total",
            "asib",
            "pt",
            "td",
            "last_updated",
        ),
    )
    if isinstance(enrollment, dict):
        by_group = _safe_group_rows(enrollment.get("by_group"))
        funnel = _pick_rows(enrollment.get("funnel"), ("stage", "n"))
        ga = _pick_scalar_map(enrollment.get("by_ga_stratum"))
        if by_group:
            safe_enrollment["by_group"] = by_group
        if funnel:
            safe_enrollment["funnel"] = funnel
        if ga:
            safe_enrollment["by_ga_stratum"] = ga
    if safe_enrollment:
        result["enrollment"] = safe_enrollment

    attention = _pick_scalars(
        nano.get("attention"), ("hda_sustained_pct", "hda_quality_bpm")
    )
    if isinstance(nano.get("attention"), dict):
        source = nano["attention"]
        phases = _pick_rows(source.get("phases"), ("phase", "pct"))
        windows = _pick_rows(
            source.get("by_window"),
            (
                "window",
                "group",
                "sustained_pct",
                "hda_sustained_pct",
                "hda_quality_bpm",
                "rsa_baseline_ms2",
            ),
        )
        group_windows = _pick_rows(
            source.get("by_group_window"),
            (
                "group",
                "window",
                "sustained_pct",
                "hda_sustained_pct",
                "hda_quality_bpm",
                "orienting_pct",
                "termination_pct",
                "inattention_pct",
            ),
        )
        groups = _safe_group_rows(source.get("by_group"))
        if phases:
            attention["phases"] = phases
        if windows:
            attention["by_window"] = windows
        if group_windows:
            attention["by_group_window"] = group_windows
        if groups:
            attention["by_group"] = groups
    if attention:
        result["attention"] = attention

    autonomic = _pick_scalars(
        nano.get("autonomic"), ("rsa_baseline_ms2", "cptd_mean_c")
    )
    if isinstance(nano.get("autonomic"), dict):
        group_windows = _pick_rows(
            nano["autonomic"].get("by_group_window"),
            ("group", "window", "rsa_baseline_ms2", "cptd_mean_c"),
        )
        if group_windows:
            autonomic["by_group_window"] = group_windows
    if autonomic:
        result["autonomic"] = autonomic

    schedule = nano.get("schedule")
    if isinstance(schedule, dict):
        rows = _pick_rows(
            schedule.get("timepoints"),
            (
                "id",
                "due",
                "upcoming_14d",
                "overdue",
                "completed",
                "window_adherence_pct",
            ),
        )
        if rows:
            result["schedule"] = {"timepoints": rows}

    pipeline = _pick_rows(
        nano.get("pipeline"),
        ("stage", "count", "delta_7d", "qc_pass_pct", "qa_passed"),
    )
    if pipeline:
        result["pipeline"] = pipeline
    pipeline_summary = _pick_scalars(
        nano.get("pipeline_summary"),
        ("qa_passed_sessions", "qa_pass_pct", "open_qc_actions"),
    )
    if pipeline_summary:
        result["pipeline_summary"] = pipeline_summary

    assessments = _pick_rows(
        nano.get("assessments"),
        ("instrument", "timepoint", "complete", "expected"),
    )
    if assessments:
        result["assessments"] = assessments

    inventory = _pick_rows(
        nano.get("inventory"),
        (
            "item",
            "in_use",
            "available",
            "calibration_due",
            "reorder_threshold",
            "low_stock",
            "status",
        ),
    )
    if inventory:
        result["inventory"] = inventory

    checklists = _pick_scalars(
        nano.get("checklists"), ("open_qc_actions", "sop_ack_pct")
    )
    if isinstance(nano.get("checklists"), dict):
        onboarding = _pick_rows(
            nano["checklists"].get("onboarding"), ("key", "done", "total")
        )
        if onboarding:
            checklists["onboarding"] = onboarding
    if checklists:
        result["checklists"] = checklists

    redcap = _pick_scalars(
        nano.get("redcap"),
        (
            "api_token_valid",
            "last_sync",
            "records_locked",
            "double_entry_discrepancies",
            "instruments_defined",
            "dags",
            "sync_health",
        ),
    )
    if redcap:
        result["redcap"] = redcap

    models = _pick_scalars(
        nano.get("models"), ("aim3_status", "best_metric", "shap_ready")
    )
    if models:
        result["models"] = models
    library = _pick_scalars(
        nano.get("library"),
        (
            "indexed_documents",
            "total_documents",
            "total_readings",
            "last_indexed",
            "last_indexed_at",
            "label",
            "index_source",
            "href",
            "api_href",
        ),
    )
    if library:
        result["library"] = library

    # Compatibility with the earlier NANO aggregate schema.  The individual
    # ``hda_features`` rows, ``flagged_participants``, and ``individual_traces``
    # are deliberately never copied.
    study_meta = _pick_scalars(
        nano.get("study_meta"),
        (
            "award",
            "start_date",
            "end_date",
            "n_target",
            "n_target_asib",
            "n_target_pt",
            "n_target_td",
        ),
    )
    if study_meta:
        result["study_meta"] = study_meta
    active_followup = _pick_scalar_map(nano.get("active_followup"))
    if active_followup:
        result["active_followup"] = active_followup
    if isinstance(nano.get("ecg_quality"), dict):
        ecg_quality = {
            key: _pick_scalar_map(nano["ecg_quality"].get(key))
            for key in ("pct_valid_ecg_by_visit", "pct_hda_synced_by_visit")
            if _pick_scalar_map(nano["ecg_quality"].get(key))
        }
        if ecg_quality:
            result["ecg_quality"] = ecg_quality

    lgcm = nano.get("lgcm_results")
    safe_lgcm: dict[str, Any] = {}
    if isinstance(lgcm, dict):
        for metric in ("pct_sa", "hr_decel", "rsa"):
            section = lgcm.get(metric)
            if not isinstance(section, dict):
                continue
            allowed = {
                str(key): value
                for key, value in section.items()
                if _scalar(value)
                and re.fullmatch(
                    r"(?:asib|pt|td)_(?:intercept|slope)_mean|"
                    r"(?:asib|pt)_vs_td_(?:intercept|slope)_p",
                    str(key),
                )
            }
            curves = _pick_rows(
                section.get("growth_curves"),
                ("group", "timepoint_m", "mean", "ci_low", "ci_high"),
            )
            if curves:
                allowed["growth_curves"] = curves
            if allowed:
                safe_lgcm[metric] = allowed
    if safe_lgcm:
        result["lgcm_results"] = safe_lgcm

    ml = nano.get("ml_results")
    safe_ml: dict[str, Any] = {}
    if isinstance(ml, dict):
        nested = ml.get("r2_by_outcome")
        if isinstance(nested, dict):
            safe_ml["r2_by_outcome"] = {
                str(outcome): _pick_scalar_map(values)
                for outcome, values in nested.items()
                if isinstance(values, dict) and _pick_scalar_map(values)
            }
        importance = _pick_rows(
            ml.get("feature_importance"), ("feature", "mean_abs_shap")
        )
        if importance:
            safe_ml["feature_importance"] = importance
    if safe_ml:
        result["ml_results"] = safe_ml
    finding = _pick_scalars(
        nano.get("preliminary_finding"), ("label", "value", "type", "n", "pilot")
    )
    if finding:
        result["preliminary_finding"] = finding
    return result


def is_phi_or_raw_request(message: str) -> bool:
    """Return true when answering would require identifiable or raw data."""

    return bool(
        _DIRECT_PHI_RE.search(message)
        or _EXPLICIT_IDENTIFIER_RE.search(message)
        or _PARTICIPANT_LEVEL_RE.search(message)
        or _RAW_SIGNAL_RE.search(message)
        or _EMAIL_RE.search(message)
        or _PHONE_RE.search(message)
        or _DATE_RE.search(message)
        or _SSN_RE.search(message)
        or _CONTEXTUAL_NAME_RE.search(message)
        or _STREET_ADDRESS_RE.search(message)
        or _REDACTED_PHI_RE.search(message)
    )


def _safe_citation_path(value: Any) -> str | None:
    raw = str(value or "").strip().replace("\\", "/").lstrip("/")
    if not raw or _CONTROL_RE.search(raw):
        return None
    pure = PurePosixPath(raw)
    if pure.is_absolute() or ".." in pure.parts:
        return None
    normalized = pure.as_posix()
    if pure.suffix.casefold() not in BUDDY_DOCUMENT_SUFFIXES:
        return None
    if not any(normalized.startswith(prefix) for prefix in BUDDY_CITATION_ROOTS):
        return None
    return normalized


def _clean_snippet(value: Any, *, limit: int = 700) -> str:
    text = _CONTROL_RE.sub(" ", str(value or ""))
    text = _EMAIL_RE.sub("[redacted email]", text)
    text = _PHONE_RE.sub("[redacted phone]", text)
    text = _DATE_RE.sub("[redacted date]", text)
    text = _SSN_RE.sub("[redacted SSN]", text)
    text = _CONTEXTUAL_NAME_RE.sub(
        lambda match: f"{match.group('label')} [redacted name]", text
    )
    text = _STREET_ADDRESS_RE.sub("[redacted address]", text)
    text = _PROMPT_ID_RE.sub("[redacted study ID]", text)
    text = re.sub(r"\s+", " ", text).strip(" #*-\t")
    return text[:limit].rstrip()


def _scrub_prompt(value: str) -> str:
    return _clean_snippet(value, limit=6000)


def _clean_provider_answer(value: Any) -> str:
    text = _REASONING_BLOCK_RE.sub(" ", str(value or ""))
    text = _REASONING_OPEN_RE.sub(" ", text)
    text = _REASONING_TAG_RE.sub(" ", text)
    text = _FINAL_PREFIX_RE.sub("", text)
    return _clean_snippet(text, limit=2400)


def _format_value(value: Any, path: str = "") -> str:
    if value is None:
        return "Awaiting data"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, float):
        if "pct" in path and abs(value) <= 1:
            return f"{value * 100:.1f}%"
        if "pct" in path:
            return f"{value:.1f}%"
        return f"{value:.2f}".rstrip("0").rstrip(".")
    return str(value)


def _as_of(nano: dict[str, Any], requested: str | None) -> str:
    return str(
        requested
        or (nano.get("meta") or {}).get("as_of")
        or (nano.get("enrollment") or {}).get("last_updated")
        or "the latest aggregate snapshot"
    )


def _timepoint_match(question: str, rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    compact = question.casefold().replace("-", "_").replace(" ", "_")
    for row in rows:
        timepoint = str(row.get("id") or "").casefold()
        if not timepoint:
            continue
        aliases = {timepoint, timepoint.replace("month_", "") + "m"}
        if timepoint.startswith("month_"):
            month = timepoint.split("_", 1)[1]
            aliases.update({f"month_{month}", f"{month}_month", f"{month}m"})
        if timepoint == "nicu_admission":
            aliases.update({"nicu", "admission"})
        if any(alias in compact for alias in aliases):
            return row
    return None


def _schedule_answer(question: str, nano: dict[str, Any], when: str) -> tuple[str, list[str]] | None:
    rows = (nano.get("schedule") or {}).get("timepoints") or []
    if not rows or not (_tokens(question) & {"visit", "visits", "schedule", "due", "overdue", "upcoming", "completed", "adherence", "window"}):
        return None
    row = _timepoint_match(question, rows)
    if row is None:
        due = sum(int(item.get("due") or 0) for item in rows)
        overdue = sum(int(item.get("overdue") or 0) for item in rows)
        upcoming = sum(int(item.get("upcoming_14d") or 0) for item in rows)
        return (
            f"Across NANO visit windows, {due} are due, {upcoming} are upcoming in the next 14 days, and {overdue} are overdue as of {when}. These are de-identified aggregate counts.",
            [
                "nano.schedule.timepoints[].due",
                "nano.schedule.timepoints[].upcoming_14d",
                "nano.schedule.timepoints[].overdue",
            ],
        )
    timepoint = str(row.get("id"))
    requested = _tokens(question)
    field = "due"
    if "overdue" in requested:
        field = "overdue"
    elif requested & {"upcoming", "week", "weeks"}:
        field = "upcoming_14d"
    elif requested & {"completed", "complete"}:
        field = "completed"
    elif requested & {"adherence", "window"}:
        field = "window_adherence_pct"
    value = row.get(field)
    label = {
        "upcoming_14d": "upcoming in the next 14 days",
        "window_adherence_pct": "window adherence",
    }.get(field, field.replace("_", " "))
    return (
        f"The NANO {timepoint} aggregate has {_format_value(value, field)} visits {label} as of {when}. No participant list or identifier is exposed.",
        [f"nano.schedule.timepoints[{timepoint}].{field}"],
    )


def _redcap_answer(question: str, nano: dict[str, Any], when: str) -> tuple[str, list[str]] | None:
    redcap = nano.get("redcap") or {}
    tokens = _tokens(question)
    if not redcap or "redcap" not in tokens:
        return None
    fields = (
        ("double_entry_discrepancies", {"discrepancy", "discrepancies", "double", "entry"}, "open double-entry discrepancies"),
        ("sync_health", {"sync", "health", "healthy", "status"}, "sync health"),
        ("last_sync", {"last", "sync", "fresh", "freshness"}, "last successful sync"),
        ("api_token_valid", {"api", "token", "valid", "validity"}, "API token validity"),
        ("records_locked", {"locked", "records"}, "locked records"),
        ("instruments_defined", {"instrument", "instruments", "defined"}, "defined instruments"),
        ("dags", {"dag", "dags", "coverage"}, "DAG count"),
    )
    for field, terms, label in fields:
        if field in redcap and tokens & terms:
            return (
                f"NANO REDCap {label} is {_format_value(redcap[field], field)} as of {when}.",
                [f"nano.redcap.{field}"],
            )
    selected = [key for key in ("sync_health", "last_sync", "double_entry_discrepancies") if key in redcap]
    if selected:
        text = "; ".join(f"{key.replace('_', ' ')}: {_format_value(redcap[key], key)}" for key in selected)
        return f"NANO REDCap status as of {when}: {text}.", [f"nano.redcap.{key}" for key in selected]
    return None


def _inventory_answer(question: str, nano: dict[str, Any], when: str) -> tuple[str, list[str]] | None:
    rows = nano.get("inventory") or []
    tokens = _tokens(question)
    if not rows or not tokens & {"inventory", "equipment", "actiheart", "squirrel", "electrode", "electrodes", "kit", "kits", "calibration", "stock", "available"}:
        return None
    ranked = sorted(
        rows,
        key=lambda row: len(tokens & _tokens(row.get("item"))) + (2 if tokens & _tokens(row.get("item")) else 0),
        reverse=True,
    )
    row = ranked[0]
    item = str(row.get("item") or "selected equipment")
    fields = [key for key in ("available", "in_use", "calibration_due", "low_stock", "reorder_threshold", "status") if key in row]
    details = "; ".join(f"{key.replace('_', ' ')}: {_format_value(row[key], key)}" for key in fields)
    return (
        f"{item} aggregate inventory as of {when}: {details or 'Awaiting data'}.",
        [f"nano.inventory[{item}].{key}" for key in fields],
    )


def _enrollment_answer(question: str, nano: dict[str, Any], when: str) -> tuple[str, list[str]] | None:
    enrollment = nano.get("enrollment") or {}
    tokens = _tokens(question)
    if not enrollment or not tokens & {
        "enrollment",
        "enrolled",
        "cohort",
        "recruitment",
        "retention",
        "active",
        "target",
    }:
        return None
    if "retention" in tokens and "retention_pct" in enrollment:
        return (
            f"NANO aggregate retention is {_format_value(enrollment['retention_pct'], 'retention_pct')} as of {when}.",
            ["nano.enrollment.retention_pct"],
        )
    group_tokens = tokens & {"asib", "pt", "td"}
    by_group = enrollment.get("by_group")
    details: list[str] = []
    paths: list[str] = []
    if isinstance(by_group, list):
        for row in by_group:
            group = str(row.get("group") or "").casefold()
            if group_tokens and group not in group_tokens:
                continue
            if group:
                details.append(f"{group.upper()} {row.get('enrolled', 'Awaiting data')} of {row.get('target', 'Awaiting data')}")
                paths.extend([f"nano.enrollment.by_group[{group.upper()}].enrolled", f"nano.enrollment.by_group[{group.upper()}].target"])
    if not details:
        for group in ("asib", "pt", "td"):
            if group in enrollment and (not group_tokens or group in group_tokens):
                details.append(f"{group.upper()} {enrollment[group]}")
                paths.append(f"nano.enrollment.{group}")
    if details and (group_tokens or "group" in tokens or "cohort" in tokens):
        return f"NANO enrollment by group as of {when}: " + "; ".join(details) + ".", paths
    enrolled_key = "enrolled" if "enrolled" in enrollment else "total"
    enrolled = enrollment.get(enrolled_key)
    target = enrollment.get("target")
    target_path = "nano.enrollment.target"
    if target is None:
        target = (nano.get("meta") or {}).get("n_target")
        target_path = "nano.meta.n_target"
    if target is None:
        target = (nano.get("study_meta") or {}).get("n_target")
        target_path = "nano.study_meta.n_target"
    if enrolled is not None:
        suffix = f" of {target}" if target is not None else ""
        paths = [f"nano.enrollment.{enrolled_key}"] + ([target_path] if target is not None else [])
        return f"Current NANO aggregate enrollment is {enrolled}{suffix} as of {when}.", paths
    return None


def _attention_answer(question: str, nano: dict[str, Any], when: str) -> tuple[str, list[str]] | None:
    tokens = _tokens(question)
    if not tokens & {"hda", "attention", "sustained", "orienting", "termination", "inattention", "deceleration", "quality", "rsa", "autonomic", "cptd", "temperature"}:
        return None
    attention = nano.get("attention") or {}
    autonomic = nano.get("autonomic") or {}
    requested_groups = tokens & {"asib", "pt", "td"}
    compact_question = re.sub(r"[^a-z0-9]+", "", question.casefold())
    attention_group_windows = attention.get("by_group_window") or []
    if attention_group_windows and (
        requested_groups or tokens & {"group", "groups", "window", "windows"}
    ):
        selected = [
            row
            for row in attention_group_windows
            if (
                not requested_groups
                or str(row.get("group") or "").casefold() in requested_groups
            )
            and (
                not str(row.get("window") or "")
                or re.sub(r"[^a-z0-9]+", "", str(row.get("window")).casefold())
                in compact_question
                or not any(char.isdigit() for char in question)
            )
        ]
        if not selected:
            selected = [
                row
                for row in attention_group_windows
                if not requested_groups
                or str(row.get("group") or "").casefold() in requested_groups
            ]
        field = (
            "hda_quality_bpm"
            if tokens & {"quality", "deceleration"}
            else "hda_sustained_pct"
            if any("hda_sustained_pct" in row for row in selected)
            else "sustained_pct"
        )
        selected = [row for row in selected if field in row][:12]
        if selected:
            details = "; ".join(
                f"{str(row.get('group')).upper()} {row.get('window')} {_format_value(row.get(field), 'pct' if 'pct' in field else field)}"
                for row in selected
            )
            paths = [
                f"nano.attention.by_group_window[{str(row.get('group')).upper()}-{row.get('window')}].{field}"
                for row in selected
            ]
            label = "HDA quality" if field == "hda_quality_bpm" else "sustained-attention HDA share"
            return f"NANO aggregate {label} by group and window as of {when}: {details}.", paths

    autonomic_group_windows = autonomic.get("by_group_window") or []
    if autonomic_group_windows and tokens & {"rsa", "autonomic", "cptd", "temperature"}:
        field = "cptd_mean_c" if tokens & {"cptd", "temperature"} else "rsa_baseline_ms2"
        selected = [
            row
            for row in autonomic_group_windows
            if field in row
            and (
                not requested_groups
                or str(row.get("group") or "").casefold() in requested_groups
            )
        ][:12]
        if selected:
            details = "; ".join(
                f"{str(row.get('group')).upper()} {row.get('window')} {_format_value(row.get(field))}"
                for row in selected
            )
            paths = [
                f"nano.autonomic.by_group_window[{str(row.get('group')).upper()}-{row.get('window')}].{field}"
                for row in selected
            ]
            label = "mean CPTd (°C)" if field == "cptd_mean_c" else "baseline RSA (ms²)"
            return f"NANO aggregate {label} by group and window as of {when}: {details}.", paths

    if tokens & {"rsa", "autonomic"} and "rsa_baseline_ms2" in autonomic:
        return (
            f"NANO baseline RSA is {_format_value(autonomic['rsa_baseline_ms2'])} ms² in the aggregate snapshot as of {when}.",
            ["nano.autonomic.rsa_baseline_ms2"],
        )
    if tokens & {"cptd", "temperature"} and "cptd_mean_c" in autonomic:
        return (
            f"NANO mean CPTd is {_format_value(autonomic['cptd_mean_c'])} °C in the aggregate snapshot as of {when}.",
            ["nano.autonomic.cptd_mean_c"],
        )
    if tokens & {"quality", "deceleration"} and "hda_quality_bpm" in attention:
        return (
            f"NANO HDA quality, measured as heart-rate deceleration magnitude, is {_format_value(attention['hda_quality_bpm'])} bpm as of {when}.",
            ["nano.attention.hda_quality_bpm"],
        )
    if "hda_sustained_pct" in attention:
        return (
            f"NANO sustained-attention HDA share is {_format_value(attention['hda_sustained_pct'], 'pct')} as of {when}.",
            ["nano.attention.hda_sustained_pct"],
        )
    phases = attention.get("phases") or []
    for row in phases:
        phase = str(row.get("phase") or "").casefold()
        if phase and phase in tokens:
            return (
                f"The NANO aggregate {phase} HDA phase share is {_format_value(row.get('pct'), 'pct')} as of {when}.",
                [f"nano.attention.phases[{phase}].pct"],
            )

    legacy_metric = "rsa" if "rsa" in tokens else "hr_decel" if tokens & {"quality", "deceleration"} else "pct_sa"
    curves = ((nano.get("lgcm_results") or {}).get(legacy_metric) or {}).get("growth_curves") or []
    if curves:
        selected = [row for row in curves if not requested_groups or str(row.get("group")).casefold() in requested_groups]
        selected = selected[:9]
        label = {"pct_sa": "sustained-attention share", "hr_decel": "heart-rate deceleration", "rsa": "RSA"}[legacy_metric]
        details = "; ".join(f"{str(row.get('group')).upper()} {row.get('timepoint_m')}m {_format_value(row.get('mean'), 'pct' if legacy_metric == 'pct_sa' else '')}" for row in selected)
        paths = [f"nano.lgcm_results.{legacy_metric}.growth_curves[{str(row.get('group')).upper()}-{row.get('timepoint_m')}m].mean" for row in selected]
        return f"NANO aggregate {label} by group and age as of {when}: {details}.", paths
    return None


def _pipeline_answer(question: str, nano: dict[str, Any], when: str) -> tuple[str, list[str]] | None:
    rows = nano.get("pipeline") or []
    summary = nano.get("pipeline_summary") or {}
    tokens = _tokens(question)
    if not (rows or summary) or not tokens & {"pipeline", "qc", "qa", "quality", "ingested", "preproc", "preprocessing", "imputation", "model", "ready", "sessions", "week", "actions"}:
        return None
    if summary and tokens & {"qc", "qa", "quality", "sessions", "week", "actions"}:
        if tokens & {"action", "actions", "open"} and "open_qc_actions" in summary:
            fields = ["open_qc_actions"]
        elif tokens & {"percent", "percentage", "rate"} and "qa_pass_pct" in summary:
            fields = ["qa_pass_pct"]
        else:
            fields = [
                key
                for key in ("qa_passed_sessions", "qa_pass_pct", "open_qc_actions")
                if key in summary
            ]
        if fields:
            details = "; ".join(
                f"{key.replace('_', ' ')}: {_format_value(summary[key], key)}"
                for key in fields
            )
            return (
                f"NANO aggregate pipeline QA as of {when}: {details}.",
                [f"nano.pipeline_summary.{key}" for key in fields],
            )
    if not rows:
        return None
    ranked = sorted(rows, key=lambda row: len(tokens & _tokens(row.get("stage"))), reverse=True)
    row = ranked[0]
    stage = str(row.get("stage") or "pipeline")
    fields = [
        key
        for key in ("count", "delta_7d", "qc_pass_pct", "qa_passed")
        if key in row
    ]
    details = "; ".join(f"{key.replace('_', ' ')}: {_format_value(row[key], key)}" for key in fields)
    return (
        f"NANO {stage} as of {when}: {details}.",
        [f"nano.pipeline[{stage}].{key}" for key in fields],
    )


def _model_answer(question: str, nano: dict[str, Any], when: str) -> tuple[str, list[str]] | None:
    tokens = _tokens(question)
    models = nano.get("models") or {}
    if models and tokens & {"aim3", "aim", "model", "models", "shap", "training", "evaluated"}:
        fields = [key for key in ("aim3_status", "best_metric", "shap_ready") if key in models]
        details = "; ".join(f"{key.replace('_', ' ')}: {_format_value(models[key], key)}" for key in fields)
        return f"NANO Aim 3 model status as of {when}: {details}.", [f"nano.models.{key}" for key in fields]
    finding = nano.get("preliminary_finding") or {}
    if finding and tokens & {"model", "accuracy", "finding", "pilot", "classification"}:
        return (
            f"The packaged NANO pilot finding is {finding.get('label')}: {_format_value(finding.get('value'))} {finding.get('type') or 'metric'} (aggregate n={finding.get('n')}, pilot={_format_value(finding.get('pilot'))}).",
            ["nano.preliminary_finding.value", "nano.preliminary_finding.n"],
        )
    return None


def _assessment_or_checklist_answer(question: str, nano: dict[str, Any], when: str) -> tuple[str, list[str]] | None:
    tokens = _tokens(question)
    rows = nano.get("assessments") or []
    if rows and tokens & {"assessment", "assessments", "nnns", "csbs", "bayley", "ados", "mchat", "asq", "complete", "completion"}:
        ranked = sorted(rows, key=lambda row: len(tokens & (_tokens(row.get("instrument")) | _tokens(row.get("timepoint")))), reverse=True)
        row = ranked[0]
        name = str(row.get("instrument") or "assessment")
        timepoint = str(row.get("timepoint") or "configured timepoint")
        return (
            f"{name} at {timepoint} is {row.get('complete', 'Awaiting data')} complete of {row.get('expected', 'Awaiting data')} expected as of {when}.",
            [f"nano.assessments[{name}-{timepoint}].complete", f"nano.assessments[{name}-{timepoint}].expected"],
        )
    checklists = nano.get("checklists") or {}
    if checklists and tokens & {"checklist", "checklists", "consent", "citi", "irb", "dua", "sop", "acknowledgement", "acknowledgements", "action", "actions"}:
        if tokens & {"action", "actions", "qc"} and "open_qc_actions" in checklists:
            return (
                f"There are {checklists['open_qc_actions']} open aggregate QC actions as of {when}.",
                ["nano.checklists.open_qc_actions"],
            )
        if tokens & {"sop", "acknowledgement", "acknowledgements"} and "sop_ack_pct" in checklists:
            return (
                f"NANO SOP acknowledgement is {_format_value(checklists['sop_ack_pct'], 'pct')} as of {when}.",
                ["nano.checklists.sop_ack_pct"],
            )
        onboarding = checklists.get("onboarding") or []
        for row in onboarding:
            key = str(row.get("key") or "").casefold()
            if key and _tokens(key) & tokens:
                return (
                    f"NANO onboarding {key.replace('_', ' ')} is complete for {row.get('done', 'Awaiting data')} of {row.get('total', 'Awaiting data')} aggregate records as of {when}.",
                    [f"nano.checklists.onboarding[{key}].done", f"nano.checklists.onboarding[{key}].total"],
                )
    return None


def answer_live_metric(question: str, nano: dict[str, Any], *, requested_as_of: str | None = None) -> tuple[str, list[str]] | None:
    """Resolve common Buddy metric questions without model availability."""

    when = _as_of(nano, requested_as_of)
    for resolver in (
        _schedule_answer,
        _redcap_answer,
        _inventory_answer,
        _enrollment_answer,
        _attention_answer,
        _pipeline_answer,
        _model_answer,
        _assessment_or_checklist_answer,
    ):
        result = resolver(question, nano, when)
        if result is not None:
            return result
    return None


class NanoBuddyAssistant:
    """Serve the ``/api/buddy`` contract through one shared assistant runtime."""

    def __init__(
        self,
        assistant: DashboardChatAssistant,
        *,
        data_dir: Path | None = None,
        project_root: Path = PROJECT_ROOT,
    ) -> None:
        self.assistant = assistant
        self.data_dir = data_dir or assistant.data_dir or DEFAULT_DATA_DIR
        self.project_root = project_root
        self._document_lock = threading.Lock()
        self._document_signature: tuple[tuple[str, int, int], ...] | None = None
        self._document_cache: list[_DocumentMatch] = []

    def get_status(self) -> dict[str, Any]:
        provider = self.assistant.get_status()
        nano = self._load_nano_metrics()
        local_docs = bool(self._load_document_catalog())
        provider_ready = bool(provider.get("ready") or provider.get("can_attempt"))
        local_ready = bool(nano or local_docs)
        return {
            "endpoint": BUDDY_ENDPOINT,
            "state": "ready" if provider_ready and local_ready else "degraded",
            "ready": local_ready,
            "provider_ready": provider_ready,
            "local_fallback": True,
            "metrics_available": bool(nano),
            "documents_available": local_docs,
            "model_id": provider.get("model_id"),
            "message": (
                "Buddy is ready with live aggregate metrics and local document lookup."
                if provider_ready and local_ready
                else "Buddy generation is offline or partially grounded; aggregate metric and local document lookup remain available."
            ),
            "contract": "nano-buddy.v1",
        }

    def answer(self, message: Any, context: Any = None) -> dict[str, Any]:
        prompt, safe_context = self._validate_request(message, context)
        if is_phi_or_raw_request(prompt):
            return {
                "answer": (
                    "I cannot provide participant-level, identifiable, or raw-signal data. "
                    "That information stays in REDCap or the USC secure server under the lab's HIPAA workflow. "
                    "I can help with de-identified aggregate counts, metric definitions, or an approved SOP instead."
                ),
                "citations": [],
                "used_metrics": [],
                "refused": True,
            }

        nano = self._load_nano_metrics()
        documents: list[_DocumentMatch] = []
        if self._is_document_help_request(prompt):
            documents = self._find_documents(prompt, limit=2)
            if documents:
                return self._answer_from_documents(prompt, nano, documents)

        metric_answer = answer_live_metric(
            prompt, nano, requested_as_of=safe_context.get("as_of")
        )
        if metric_answer is not None:
            answer, used_metrics = metric_answer
            return {
                "answer": answer,
                "citations": [],
                "used_metrics": used_metrics,
                "refused": False,
            }

        documents = self._find_documents(prompt, limit=2)
        if documents:
            return self._answer_from_documents(prompt, nano, documents)

        if nano:
            context_block = json.dumps(
                {"nano": nano}, ensure_ascii=True, separators=(",", ":")
            )
            generated = self._try_provider(prompt, context_block)
            if generated:
                return {
                    "answer": generated,
                    "citations": [],
                    "used_metrics": [],
                    "refused": False,
                }

        return {
            "answer": (
                "Buddy is offline for open-ended generation, but the dashboard metrics are still available. "
                "Ask about NANO enrollment, visit counts, HDA, RSA, pipeline QC, inventory, REDCap health, or an indexed SOP."
            ),
            "citations": [],
            "used_metrics": [],
            "refused": False,
        }

    @staticmethod
    def _is_document_help_request(prompt: str) -> bool:
        tokens = _tokens(prompt)
        return bool(
            tokens
            & {
                "sop",
                "protocol",
                "procedure",
                "procedures",
                "instruction",
                "instructions",
                "guide",
                "manual",
                "steps",
            }
            or re.search(
                r"\b(?:how\s+(?:do|can|should)\s+i|how\s+to|where\s+do\s+i)\b",
                prompt,
                re.IGNORECASE,
            )
        )

    def _answer_from_documents(
        self,
        prompt: str,
        nano: dict[str, Any],
        documents: list[_DocumentMatch],
    ) -> dict[str, Any]:
        citations = [match.citation() for match in documents]
        context_block = json.dumps(
            {
                "documents": [
                    {
                        "title": match.title,
                        "path": match.path,
                        "loc": match.loc,
                        "snippet": match.snippet,
                    }
                    for match in documents
                ],
                "nano": {
                    "meta": nano.get("meta", {}),
                    "library": nano.get("library", {}),
                },
            },
            ensure_ascii=True,
            separators=(",", ":"),
        )
        generated = self._try_provider(prompt, context_block)
        if generated:
            answer = generated
        else:
            first = documents[0]
            answer = (
                f"According to {first.title}, {first.snippet} "
                "The linked citation is the approved source for the full procedure."
            )
        return {
            "answer": answer,
            "citations": citations,
            "used_metrics": [],
            "refused": False,
        }

    def _validate_request(self, message: Any, context: Any) -> tuple[str, dict[str, str]]:
        if not isinstance(message, str):
            raise BuddyRequestError("Buddy message must be text.")
        prompt = message.strip()
        if not prompt:
            raise BuddyRequestError("Please ask Buddy a question before submitting.")
        max_chars = max(1, int(self.assistant.config.max_message_chars))
        if len(prompt) > max_chars:
            raise BuddyRequestError(
                f"Buddy message is too long; limit it to {max_chars} characters.",
                http_status=413,
            )
        if context is None:
            return prompt, {"section": "nano"}
        if not isinstance(context, dict):
            raise BuddyRequestError("Buddy context must be a JSON object.")
        section = context.get("section", "nano")
        if not isinstance(section, str) or section.strip().casefold() != "nano":
            raise BuddyRequestError("Buddy context section must be nano.")
        safe = {"section": "nano"}
        as_of = context.get("as_of")
        if as_of is not None:
            if not isinstance(as_of, str):
                raise BuddyRequestError("Buddy context as_of must be text.")
            as_of = as_of.strip()
            if (
                not as_of
                or len(as_of) > BUDDY_MAX_CONTEXT_CHARS
                or not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:T[0-9:.+-]+Z?)?", as_of)
            ):
                raise BuddyRequestError("Buddy context as_of must be an ISO-8601 date or timestamp.")
            safe["as_of"] = as_of
        return prompt, safe

    def _load_nano_metrics(self) -> dict[str, Any]:
        public_path = self.data_dir / "nano_dashboard_data.json"
        path = public_path if public_path.is_file() else self.data_dir / "dashboard_data.json"
        if not path.is_file():
            return {}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return sanitize_nano_metrics(payload)

    def _try_provider(self, prompt: str, context_block: str) -> str | None:
        try:
            answer = self.assistant.complete_grounded_answer(
                message=_scrub_prompt(prompt),
                system_prompt=(
                    "You are ESD Lab Buddy for the NANO dashboard. Answer only from the "
                    "allowlisted aggregate metrics and document snippets supplied below. "
                    "Never infer, request, or reveal participant-level data, identifiers, "
                    "raw signals, names, dates of birth, MRNs, contact details, or free-text "
                    "notes. If evidence is missing, say so. Be concise and distinguish live "
                    "metrics from document guidance. Do not invent citations or paths; the "
                    "API attaches its own allowlisted citations."
                ),
                context_block=context_block[:12000],
                max_tokens=180,
            )
        except (AssistantUnavailable, ValueError):
            return None
        return _clean_provider_answer(answer) or None

    def _load_document_catalog(self) -> list[_DocumentMatch]:
        files: list[Path] = []
        docs_root = self.project_root / "docs"
        if docs_root.is_dir():
            files.extend(
                path
                for path in docs_root.rglob("*")
                if path.is_file()
                and path.suffix.casefold() in {".md", ".txt", ".rst"}
                and path.stat().st_size <= 512_000
            )
        readings_path = self.data_dir / "readings_data.json"
        if readings_path.is_file():
            files.append(readings_path)
        signature = tuple(
            sorted(
                (str(path), path.stat().st_mtime_ns, path.stat().st_size)
                for path in files
            )
        )
        if signature == self._document_signature:
            return self._document_cache
        with self._document_lock:
            if signature == self._document_signature:
                return self._document_cache
            records: list[_DocumentMatch] = []
            for path in files:
                if path == readings_path:
                    records.extend(self._reading_records(path))
                    continue
                try:
                    text = path.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                relative = path.relative_to(self.project_root).as_posix()
                safe_path = _safe_citation_path(relative)
                if not safe_path:
                    continue
                lines = text.splitlines()
                title = next(
                    (
                        _clean_snippet(line.lstrip("# "), limit=160)
                        for line in lines[:80]
                        if line.strip().startswith("#")
                    ),
                    path.stem.replace("_", " ").replace("-", " ").title(),
                )
                searchable = _clean_snippet(" ".join(lines), limit=20_000)
                records.append(
                    _DocumentMatch(
                        title=title or path.name,
                        path=safe_path,
                        loc="document",
                        snippet=searchable,
                        score=0,
                    )
                )
            self._document_cache = records
            self._document_signature = signature
            return records

    def _reading_records(self, path: Path) -> list[_DocumentMatch]:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        records: list[_DocumentMatch] = []
        seen: set[str] = set()
        for bucket in ("featured", "readings"):
            for item in payload.get(bucket, []) or []:
                if not isinstance(item, dict):
                    continue
                safe_path = _safe_citation_path(item.get("relative_path"))
                if not safe_path or safe_path in seen:
                    continue
                seen.add(safe_path)
                title = _clean_snippet(
                    item.get("title") or item.get("display_name") or Path(safe_path).name,
                    limit=160,
                )
                snippet = _clean_snippet(
                    " ".join(
                        str(item.get(key) or "")
                        for key in ("excerpt", "search_text", "keywords", "source", "category")
                    ),
                    limit=2000,
                )
                records.append(
                    _DocumentMatch(
                        title=title,
                        path=safe_path,
                        loc="Library index",
                        snippet=snippet or "Indexed in the ESD Lab reading library.",
                        score=0,
                    )
                )
        return records

    def _find_documents(self, question: str, *, limit: int) -> list[_DocumentMatch]:
        query_tokens = _tokens(question) - _COMMON_QUERY_TOKENS
        if not query_tokens:
            return []
        matches: list[_DocumentMatch] = []
        for record in self._load_document_catalog():
            title_tokens = _tokens(record.title) | _tokens(record.path)
            snippet_tokens = _tokens(record.snippet)
            overlap = query_tokens & (title_tokens | snippet_tokens)
            if not overlap:
                continue
            score = 4 * len(query_tokens & title_tokens) + len(overlap)
            if score < 3:
                continue
            snippet = self._best_snippet(record.snippet, query_tokens)
            matches.append(
                _DocumentMatch(
                    title=record.title,
                    path=record.path,
                    loc=record.loc,
                    snippet=snippet,
                    score=score,
                )
            )
        return sorted(matches, key=lambda item: (-item.score, item.path))[:limit]

    @staticmethod
    def _best_snippet(text: str, query_tokens: set[str]) -> str:
        sentences = [
            sentence.strip()
            for sentence in re.split(r"(?<=[.!?])\s+|\s{2,}", text)
            if sentence.strip()
        ]
        if not sentences:
            return "The document is indexed, but no safe excerpt is available."
        ranked = sorted(
            sentences,
            key=lambda sentence: len(query_tokens & _tokens(sentence)),
            reverse=True,
        )
        selected = " ".join(ranked[:3])
        return _clean_snippet(selected, limit=700) or "A safe excerpt is not available."


__all__ = [
    "BUDDY_ENDPOINT",
    "BuddyRequestError",
    "NanoBuddyAssistant",
    "answer_live_metric",
    "is_phi_or_raw_request",
    "sanitize_nano_metrics",
]
