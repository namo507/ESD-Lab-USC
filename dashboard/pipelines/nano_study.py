"""Aggregate-only data contract for the public NANO study dashboard.

The builder in this module is deliberately a one-way privacy boundary.  It
accepts the aggregate blocks already produced by the dashboard pipeline and
emits only cohort-, visit-, instrument-, or pipeline-level summaries.  It does
not accept or expose participant identifiers, row-level visit lists, free text,
or raw physiological signals.

``source`` controls missing-data behavior:

* synthetic/demo/fallback sources receive a deterministic, fully populated
  profile so local development works without the secure mount;
* secure/live sources keep unavailable values empty (zero or ``None`` as
  required by the JSON contract) so the UI can show ``Awaiting data`` rather
  than presenting invented live metrics.
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

NANO_TARGETS: dict[str, int] = {"ASIB": 65, "PT": 130, "TD": 65}
NANO_TARGET = sum(NANO_TARGETS.values())
NANO_TIMEPOINTS = (
    "nicu_admission",
    "month_1",
    "month_2",
    "month_3",
    "month_6",
    "month_9",
    "month_12",
    "month_24",
    "month_36",
)
NANO_WINDOWS: dict[str, tuple[int, ...]] = {
    "1-3m": (1, 2, 3),
    "6m": (6,),
    "9m": (9,),
    "12m": (12,),
}
PHASE_KEYS = ("sustained", "orienting", "termination", "inattention")

ASSESSMENT_APPLICABILITY: dict[str, set[str]] = {
    "NNNS-II": {"nicu_admission", "month_1", "month_2", "month_3"},
    "CSBS": {"month_6", "month_9", "month_12", "month_24"},
    "Bayley-4": {"month_6", "month_12", "month_24", "month_36"},
    "ADOS-2": {"month_36"},
    "M-CHAT": {"month_24", "month_36"},
    "ASQ-3": {"month_6", "month_9", "month_12", "month_24", "month_36"},
}
ASSESSMENT_ALIASES: dict[str, tuple[str, ...]] = {
    "NNNS-II": ("nnns",),
    "CSBS": ("csbs",),
    "Bayley-4": ("bayley",),
    "ADOS-2": ("ados",),
    "M-CHAT": ("mchat", "m-chat"),
    "ASQ-3": ("asq3", "asq-3", "asq_3"),
}

SYNTHETIC_ENROLLMENT = {"ASIB": 52, "PT": 105, "TD": 52}
SYNTHETIC_PIPELINE_COUNTS = (1840, 1776, 1745, 1689, 1604, 1580, 198)
SYNTHETIC_PIPELINE_DELTAS = (42, 38, 35, 31, 29, 26, 8)
SYNTHETIC_SCHEDULE = {
    "nicu_admission": (0, 0, 0, 209, 97.6),
    "month_1": (8, 5, 3, 196, 94.8),
    "month_2": (10, 6, 4, 189, 93.7),
    "month_3": (12, 7, 5, 181, 92.9),
    "month_6": (15, 9, 6, 162, 91.2),
    "month_9": (13, 8, 5, 149, 90.4),
    "month_12": (11, 7, 4, 136, 89.7),
    "month_24": (9, 6, 3, 94, 87.8),
    "month_36": (7, 4, 3, 61, 86.1),
}


def _iso_now() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _rows(value: Any) -> list[Mapping[str, Any]]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes, bytearray)):
        return []
    return [item for item in value if isinstance(item, Mapping)]


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _count(value: Any, default: int = 0) -> int:
    parsed = _number(value)
    if parsed is None:
        return max(0, int(default))
    return max(0, int(round(parsed)))


def _rounded(value: Any, digits: int = 1) -> float | None:
    parsed = _number(value)
    return None if parsed is None else round(parsed, digits)


def _percentage(value: Any) -> float | None:
    parsed = _number(value)
    if parsed is None:
        return None
    if 0 <= parsed <= 1:
        parsed *= 100
    return round(max(0.0, min(100.0, parsed)), 1)


def _mean(values: Sequence[Any], digits: int = 2) -> float | None:
    clean = [parsed for value in values if (parsed := _number(value)) is not None]
    return round(sum(clean) / len(clean), digits) if clean else None


def _weighted_mean(values: Sequence[tuple[Any, int]], digits: int = 1) -> float | None:
    clean = [
        (parsed, max(0, int(weight)))
        for value, weight in values
        if (parsed := _number(value)) is not None and int(weight) > 0
    ]
    denominator = sum(weight for _value, weight in clean)
    if not denominator:
        return None
    return round(
        sum(value * weight for value, weight in clean) / denominator,
        digits,
    )


def _is_synthetic_source(source: str) -> bool:
    lowered = source.lower()
    return any(
        marker in lowered for marker in ("synthetic", "demo", "fallback", "mock")
    )


def _canonical_source(source: str) -> str:
    return "synthetic" if _is_synthetic_source(source) else "secure"


def _as_of(timestamp: str) -> str:
    match = re.match(r"\d{4}-\d{2}-\d{2}", str(timestamp))
    return match.group(0) if match else datetime.now(timezone.utc).date().isoformat()


def _group_payload(enrollment: Mapping[str, Any], group: str) -> Mapping[str, Any]:
    by_group = enrollment.get("by_group")
    if isinstance(by_group, Mapping):
        value = by_group.get(group) or by_group.get(group.lower())
        return _mapping(value)
    for row in _rows(by_group):
        if str(row.get("group", "")).upper() == group:
            return row
    return {}


def _funnel_count(rows: list[Mapping[str, Any]], *needles: str) -> int | None:
    for row in rows:
        label = (
            f"{row.get('id', '')} {row.get('stage', '')} {row.get('label', '')}".lower()
        )
        if any(needle in label for needle in needles):
            value = row.get("n", row.get("count"))
            return _count(value) if _number(value) is not None else None
    return None


def _derive_enrollment(
    aggregates: Mapping[str, Any], *, synthetic: bool, timestamp: str
) -> dict[str, Any]:
    source = _mapping(aggregates.get("enrollment"))
    by_group: list[dict[str, Any]] = []
    current_by_group: dict[str, int] = {}
    for group, target in NANO_TARGETS.items():
        group_source = _group_payload(source, group)
        current_value = group_source.get(
            "current",
            group_source.get("enrolled", source.get(group.lower())),
        )
        if _number(current_value) is None and synthetic:
            current_value = SYNTHETIC_ENROLLMENT[group]
        # Enrollment can legitimately exceed a recruitment target; preserve the
        # aggregate source count instead of silently clipping it to the goal.
        enrolled = _count(current_value)
        current_by_group[group] = enrolled
        by_group.append({"group": group, "target": target, "enrolled": enrolled})

    enrolled_total = sum(current_by_group.values())
    audit_summary = _mapping(_mapping(aggregates.get("redcap_audit")).get("summary"))
    active_value = audit_summary.get("active_participants")
    if _number(active_value) is None:
        active_value = round(enrolled_total * 0.94) if synthetic else enrolled_total
    active = min(enrolled_total, _count(active_value))

    attrition_rows = _rows(_mapping(aggregates.get("attrition_funnel")).get("stages"))
    attrition_enrolled = _funnel_count(attrition_rows, "enrolled")
    screened_source = _funnel_count(attrition_rows, "screened")
    consented_source = _funnel_count(attrition_rows, "consented")
    referred_source = _funnel_count(attrition_rows, "referred")

    def scaled(value: int | None, default_ratio: float) -> int:
        if value is not None and attrition_enrolled:
            return int(math.ceil(enrolled_total * value / attrition_enrolled))
        if synthetic:
            return int(math.ceil(enrolled_total * default_ratio))
        return enrolled_total

    screened = max(enrolled_total, scaled(screened_source, 1.46))
    consented = max(enrolled_total, scaled(consented_source, 1.16))
    screened = max(screened, consented)
    referred = max(screened, scaled(referred_source, 1.68))
    funnel = [
        {"stage": "Referred", "n": referred},
        {"stage": "Screened", "n": screened},
        {"stage": "Consented", "n": consented},
        {"stage": "Enrolled", "n": enrolled_total},
        {"stage": "Active", "n": active},
    ]

    ga_source = source.get("by_ga_stratum")
    by_ga_stratum: dict[str, int] = {}
    if isinstance(ga_source, Mapping):
        for stratum in ("24_26w", "27_29w", "30_32w", "full_term"):
            value = ga_source.get(stratum)
            if _number(value) is not None:
                by_ga_stratum[stratum] = _count(value)
    elif synthetic:
        preterm = current_by_group["ASIB"] + current_by_group["PT"]
        first = round(preterm * 0.28)
        second = round(preterm * 0.36)
        by_ga_stratum = {
            "24_26w": first,
            "27_29w": second,
            "30_32w": max(0, preterm - first - second),
            "full_term": current_by_group["TD"],
        }

    age_at_intake = [
        {"stratum": stratum, "enrolled": count}
        for stratum, count in by_ga_stratum.items()
    ]
    site_rows = _rows(aggregates.get("site_breakdown"))
    site_counts: dict[str, int] = {}
    for row in site_rows:
        raw_label = str(row.get("site") or row.get("label") or "").lower()
        if "musc" in raw_label:
            label = "MUSC"
        elif "prisma" in raw_label:
            label = "Prisma Health"
        elif "esd" in raw_label:
            label = "ESD Lab"
        else:
            label = "Other study site"
        site_counts[label] = site_counts.get(label, 0) + _count(
            row.get("enrolled", row.get("count"))
        )
    by_site = [
        {"site": label, "enrolled": count} for label, count in site_counts.items()
    ]
    if synthetic and not by_site:
        musc = round(enrolled_total * 0.55)
        by_site = [
            {"site": "MUSC", "enrolled": musc},
            {"site": "Prisma Health", "enrolled": max(0, enrolled_total - musc)},
        ]

    return {
        "target": NANO_TARGET,
        "enrolled": enrolled_total,
        "active": active,
        "retention_pct": (
            round(active * 100 / enrolled_total, 1) if enrolled_total else None
        ),
        "by_group": by_group,
        "funnel": funnel,
        "by_ga_stratum": by_ga_stratum,
        "age_at_intake": age_at_intake,
        "by_site": by_site,
        # Backward-compatible aggregate aliases used by existing study cards.
        "asib": current_by_group["ASIB"],
        "pt": current_by_group["PT"],
        "td": current_by_group["TD"],
        "total": enrolled_total,
        "last_updated": timestamp,
    }


def _synthetic_phases(group: str, window_index: int) -> dict[str, float]:
    sustained_start = {"ASIB": 34.0, "PT": 32.0, "TD": 39.0}[group]
    sustained_slope = {"ASIB": 2.1, "PT": 3.8, "TD": 4.3}[group]
    sustained = sustained_start + sustained_slope * window_index
    orienting = 26.0 - 1.4 * window_index
    termination = 13.0 - 0.4 * window_index
    inattention = 100.0 - sustained - orienting - termination
    return {
        "sustained": round(sustained, 1),
        "orienting": round(orienting, 1),
        "termination": round(termination, 1),
        "inattention": round(inattention, 1),
    }


def _phase_rows_for_group(
    hda: Mapping[str, Any], group: str
) -> list[Mapping[str, Any]]:
    by_group = _mapping(hda.get("by_group"))
    aliases = (group, "VPT") if group == "PT" else (group,)
    for alias in aliases:
        rows = _rows(by_group.get(alias) or by_group.get(alias.lower()))
        if rows:
            return rows
    return []


def _normalize_phase_vector(values: Mapping[str, Any]) -> dict[str, float | None]:
    parsed = {phase: _percentage(values.get(phase)) for phase in PHASE_KEYS}
    clean = [value for value in parsed.values() if value is not None]
    if len(clean) != len(PHASE_KEYS) or sum(clean) <= 0:
        return parsed
    total = sum(clean)
    normalized = {
        phase: round(float(parsed[phase]) * 100 / total, 1) for phase in PHASE_KEYS
    }
    normalized["inattention"] = round(
        normalized["inattention"] + 100 - sum(normalized.values()), 1
    )
    return normalized


def _source_phase_vector(
    hda: Mapping[str, Any], group: str, months: tuple[int, ...]
) -> dict[str, float | None] | None:
    selected = [
        row
        for row in _phase_rows_for_group(hda, group)
        if _count(row.get("month"), default=-1) in months
    ]
    if not selected:
        return None
    values = {
        phase: _mean([row.get(phase) for row in selected], digits=4)
        for phase in PHASE_KEYS
    }
    return _normalize_phase_vector(values)


def _trajectory_value(
    trajectories: Mapping[str, Any],
    group: str,
    biomarker: str,
    months: tuple[int, ...],
) -> float | None:
    all_months: list[int] = []
    raw_months = trajectories.get("months")
    if isinstance(raw_months, Sequence) and not isinstance(raw_months, (str, bytes)):
        all_months = [_count(month, default=-1) for month in raw_months]
    group_source = _mapping(_mapping(trajectories.get("by_group")).get(group))
    means = _mapping(group_source.get("mean")).get(biomarker)
    if not isinstance(means, Sequence) or isinstance(means, (str, bytes)):
        return None
    selected = [
        means[index]
        for index, month in enumerate(all_months)
        if month in months and index < len(means)
    ]
    return _mean(selected, digits=3)


def _derive_attention_and_autonomic(
    aggregates: Mapping[str, Any], *, synthetic: bool
) -> tuple[dict[str, Any], dict[str, Any]]:
    hda = _mapping(aggregates.get("hda_composition"))
    trajectories = _mapping(aggregates.get("trajectories"))
    attention_override = _mapping(aggregates.get("attention"))
    autonomic_override = _mapping(aggregates.get("autonomic"))
    override_attention_rows = _rows(attention_override.get("by_group_window"))
    override_autonomic_rows = _rows(autonomic_override.get("by_group_window"))

    phase_vectors: dict[tuple[str, str], dict[str, float | None]] = {}
    attention_group_rows: list[dict[str, Any]] = []
    autonomic_group_rows: list[dict[str, Any]] = []
    for group in NANO_TARGETS:
        for window_index, (window, months) in enumerate(NANO_WINDOWS.items()):
            vector = _source_phase_vector(hda, group, months)
            if vector is None and synthetic:
                vector = _synthetic_phases(group, window_index)
            if vector is None:
                vector = {phase: None for phase in PHASE_KEYS}
            phase_vectors[(group, window)] = vector

            override_attention = next(
                (
                    row
                    for row in override_attention_rows
                    if str(row.get("group", "")).upper() == group
                    and str(row.get("window", "")) == window
                ),
                {},
            )
            sustained = _percentage(
                override_attention.get("sustained_pct", vector.get("sustained"))
            )
            quality = _rounded(override_attention.get("hda_quality_bpm"), 2)
            if quality is None and synthetic:
                quality = round(
                    {"ASIB": 3.4, "PT": 3.1, "TD": 4.2}[group]
                    + {"ASIB": 0.25, "PT": 0.35, "TD": 0.4}[group] * window_index,
                    2,
                )
            attention_group_rows.append(
                {
                    "group": group,
                    "window": window,
                    "sustained_pct": sustained,
                    "orienting_pct": _percentage(
                        override_attention.get(
                            "orienting_pct", vector.get("orienting")
                        )
                    ),
                    "termination_pct": _percentage(
                        override_attention.get(
                            "termination_pct", vector.get("termination")
                        )
                    ),
                    "inattention_pct": _percentage(
                        override_attention.get(
                            "inattention_pct", vector.get("inattention")
                        )
                    ),
                    "hda_quality_bpm": quality,
                }
            )

            override_autonomic = next(
                (
                    row
                    for row in override_autonomic_rows
                    if str(row.get("group", "")).upper() == group
                    and str(row.get("window", "")) == window
                ),
                {},
            )
            rsa = _rounded(override_autonomic.get("rsa_baseline_ms2"), 3)
            if rsa is None:
                rsa = _trajectory_value(trajectories, group, "RSA", months)
            if rsa is None and synthetic:
                rsa = round(
                    {"ASIB": 2.1, "PT": 1.8, "TD": 2.4}[group]
                    + {"ASIB": 0.09, "PT": 0.14, "TD": 0.18}[group] * window_index,
                    3,
                )
            cptd = _rounded(override_autonomic.get("cptd_mean_c"), 2)
            if cptd is None and synthetic:
                cptd = round(
                    {"ASIB": 1.82, "PT": 1.67, "TD": 1.38}[group] - 0.05 * window_index,
                    2,
                )
            autonomic_group_rows.append(
                {
                    "group": group,
                    "window": window,
                    "rsa_baseline_ms2": rsa,
                    "cptd_mean_c": cptd,
                }
            )

    attention_by_window: list[dict[str, Any]] = []
    autonomic_by_window: list[dict[str, Any]] = []
    for window in NANO_WINDOWS:
        attention_by_window.append(
            {
                "window": window,
                "sustained_pct": _weighted_mean(
                    [
                        (
                            next(
                                row["sustained_pct"]
                                for row in attention_group_rows
                                if row["group"] == group and row["window"] == window
                            ),
                            target,
                        )
                        for group, target in NANO_TARGETS.items()
                    ],
                    digits=1,
                ),
            }
        )
        autonomic_by_window.append(
            {
                "window": window,
                "rsa_baseline_ms2": _weighted_mean(
                    [
                        (
                            next(
                                row["rsa_baseline_ms2"]
                                for row in autonomic_group_rows
                                if row["group"] == group and row["window"] == window
                            ),
                            target,
                        )
                        for group, target in NANO_TARGETS.items()
                    ],
                    digits=3,
                ),
                "cptd_mean_c": _weighted_mean(
                    [
                        (
                            next(
                                row["cptd_mean_c"]
                                for row in autonomic_group_rows
                                if row["group"] == group and row["window"] == window
                            ),
                            target,
                        )
                        for group, target in NANO_TARGETS.items()
                    ],
                    digits=2,
                ),
            }
        )

    overall_phases: dict[str, float | None] = {}
    for phase in PHASE_KEYS:
        overall_phases[phase] = _weighted_mean(
            [
                (phase_vectors[(group, window)].get(phase), target)
                for group, target in NANO_TARGETS.items()
                for window in NANO_WINDOWS
            ],
            digits=1,
        )
    phases = [
        {"phase": phase.title(), "pct": overall_phases[phase]} for phase in PHASE_KEYS
    ]
    quality_overall = _weighted_mean(
        [
            (row["hda_quality_bpm"], NANO_TARGETS[row["group"]])
            for row in attention_group_rows
        ],
        digits=2,
    )

    cptd_overall = _rounded(autonomic_override.get("cptd_mean_c"), 2)
    if cptd_overall is None:
        county_rows = _rows(aggregates.get("county_profiles"))
        cptd_overall = _weighted_mean(
            [
                (row.get("cptd_gap_mean"), max(1, _count(row.get("enrolled"))))
                for row in county_rows
            ],
            digits=2,
        )
    if cptd_overall is None:
        cptd_overall = _mean(
            [row["cptd_mean_c"] for row in autonomic_group_rows], digits=2
        )

    attention = {
        "hda_sustained_pct": _rounded(
            attention_override.get(
                "hda_sustained_pct", overall_phases.get("sustained")
            ),
            1,
        ),
        "phases": phases,
        "hda_quality_bpm": _rounded(
            attention_override.get("hda_quality_bpm", quality_overall), 2
        ),
        "by_window": attention_by_window,
        "by_group_window": attention_group_rows,
    }
    autonomic = {
        "rsa_baseline_ms2": _rounded(
            autonomic_override.get(
                "rsa_baseline_ms2", autonomic_by_window[0]["rsa_baseline_ms2"]
            ),
            3,
        ),
        "cptd_mean_c": cptd_overall,
        "by_window": autonomic_by_window,
        "by_group_window": autonomic_group_rows,
    }
    return attention, autonomic


def _canonical_timepoint(value: Any) -> str | None:
    text = str(value or "").lower()
    if "nicu" in text or "admission" in text:
        return "nicu_admission"
    matches = re.findall(r"(?<!\d)(1|2|3|6|9|12|24|36)(?!\d)", text)
    if not matches:
        return None
    candidate = f"month_{matches[0]}"
    return candidate if candidate in NANO_TIMEPOINTS else None


def _derive_schedule(
    aggregates: Mapping[str, Any], *, synthetic: bool, enrolled: int
) -> dict[str, Any]:
    trackers = _mapping(aggregates.get("redcap_trackers"))
    schedule_source = _mapping(aggregates.get("redcap_schedule"))
    tracker_by_timepoint: dict[str, Mapping[str, Any]] = {}
    for row in _rows(trackers.get("enrollment")):
        timepoint = _canonical_timepoint(row.get("event") or row.get("label"))
        if timepoint:
            tracker_by_timepoint[timepoint] = row

    adherence_by_timepoint: dict[str, Mapping[str, Any]] = {}
    for row in _rows(schedule_source.get("window_adherence")):
        timepoint = _canonical_timepoint(row.get("event") or row.get("label"))
        if timepoint:
            adherence_by_timepoint[timepoint] = row

    retention_by_timepoint: dict[str, Mapping[str, Any]] = {}
    for row in _rows(schedule_source.get("retention_survival")):
        timepoint = _canonical_timepoint(row.get("event") or row.get("label"))
        if timepoint:
            retention_by_timepoint[timepoint] = row

    upcoming_by_timepoint: dict[str, list[int]] = {key: [] for key in NANO_TIMEPOINTS}
    for row in _rows(schedule_source.get("upcoming_visits")):
        timepoint = _canonical_timepoint(row.get("event") or row.get("label"))
        due_in_days = _number(row.get("due_in_days"))
        if timepoint and due_in_days is not None:
            upcoming_by_timepoint[timepoint].append(int(round(due_in_days)))

    rows: list[dict[str, Any]] = []
    for timepoint in NANO_TIMEPOINTS:
        tracker = tracker_by_timepoint.get(timepoint, {})
        retention = retention_by_timepoint.get(timepoint, {})
        adherence = adherence_by_timepoint.get(timepoint, {})
        expected_source = tracker.get("expected", retention.get("at_risk"))
        completed_source = tracker.get("completed", retention.get("completed"))
        expected = _count(expected_source)
        completed = _count(completed_source)
        due_values = upcoming_by_timepoint[timepoint]
        upcoming_14d = sum(1 for value in due_values if 0 <= value <= 14)
        overdue = sum(1 for value in due_values if value < 0)
        due = upcoming_14d + overdue

        n_adherence = _count(adherence.get("n"))
        if n_adherence:
            outside = _count(adherence.get("late")) + _count(adherence.get("early"))
            adherence_pct = round(max(0, n_adherence - outside) * 100 / n_adherence, 1)
        else:
            adherence_pct = _percentage(retention.get("retained_pct"))

        if synthetic and timepoint in SYNTHETIC_SCHEDULE:
            (
                fallback_due,
                fallback_upcoming,
                fallback_overdue,
                fallback_completed,
                fallback_adherence,
            ) = SYNTHETIC_SCHEDULE[timepoint]
            if not tracker and not retention:
                expected = enrolled
                completed = (
                    enrolled
                    if timepoint == "nicu_admission"
                    else min(enrolled, fallback_completed)
                )
            if not due_values:
                due = min(enrolled, fallback_due)
                upcoming_14d = min(due, fallback_upcoming)
                overdue = min(max(0, due - upcoming_14d), fallback_overdue)
            if adherence_pct is None:
                adherence_pct = fallback_adherence

        completed = min(max(enrolled, expected) if expected else enrolled, completed)
        rows.append(
            {
                "id": timepoint,
                "due": due,
                "upcoming_14d": upcoming_14d,
                "overdue": overdue,
                "completed": completed,
                "expected": expected,
                "window_adherence_pct": adherence_pct,
            }
        )
    return {"timepoints": rows}


def _pipeline_stage_override(
    aggregates: Mapping[str, Any], stage: str
) -> Mapping[str, Any]:
    for row in _rows(aggregates.get("pipeline")):
        if str(row.get("stage", "")).lower() == stage.lower():
            return row
    return {}


def _derive_pipeline(
    aggregates: Mapping[str, Any], *, synthetic: bool
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    quality = _mapping(aggregates.get("data_quality"))
    flags = _mapping(quality.get("qc_flags"))
    total_records = _count(
        flags.get(
            "total_records",
            _mapping(aggregates.get("redcap_meta")).get("record_count"),
        )
    )
    issues = sum(
        _count(flags.get(key))
        for key in (
            "double_entry_discrepancies",
            "out_of_range_values",
            "missing_required_fields",
            "ecg_transfer_late",
            "temp_quality_rejected",
        )
    )
    feature_rows = _count(aggregates.get("feature_row_count"))
    if synthetic and not total_records:
        total_records = SYNTHETIC_PIPELINE_COUNTS[0]

    computed_counts = [
        total_records,
        max(0, total_records - _count(flags.get("ecg_transfer_late"))),
        max(0, total_records - _count(flags.get("temp_quality_rejected"))),
        max(0, total_records - _count(flags.get("missing_required_fields"))),
        feature_rows or max(0, total_records - issues),
        feature_rows or max(0, total_records - issues),
        0,
    ]
    confusion = _mapping(_mapping(aggregates.get("ml_performance")).get("confusion"))
    model_n = sum(_count(confusion.get(key)) for key in ("tp", "fp", "tn", "fn"))
    computed_counts[-1] = model_n or min(computed_counts[-2], total_records)
    if synthetic:
        computed_counts = [
            value or SYNTHETIC_PIPELINE_COUNTS[index]
            for index, value in enumerate(computed_counts)
        ]
    for index in range(1, len(computed_counts)):
        computed_counts[index] = min(computed_counts[index - 1], computed_counts[index])

    stages = (
        "Ingested",
        "ECG preproc",
        "Temp preproc",
        "Behavioral coding",
        "Feature matrix",
        "Imputation (MICE m=20)",
        "Model-ready",
    )
    qa_passed_sessions = max(0, total_records - min(total_records, issues))
    pipeline: list[dict[str, Any]] = []
    for index, stage in enumerate(stages):
        override = _pipeline_stage_override(aggregates, stage)
        count = _count(override.get("count"), default=computed_counts[index])
        default_pct = (
            round(qa_passed_sessions * 100 / total_records, 1)
            if total_records
            else None
        )
        qc_pass_pct = _percentage(override.get("qc_pass_pct", default_pct))
        qa_passed = _count(
            override.get(
                "qa_passed",
                round(count * qc_pass_pct / 100) if qc_pass_pct is not None else 0,
            )
        )
        delta = _count(
            override.get(
                "delta_7d", SYNTHETIC_PIPELINE_DELTAS[index] if synthetic else 0
            )
        )
        pipeline.append(
            {
                "stage": stage,
                "count": count,
                "delta_7d": delta,
                "qc_pass_pct": qc_pass_pct,
                "qa_passed": min(count, qa_passed),
            }
        )

    summary = {
        "qa_passed_sessions": qa_passed_sessions,
        "qa_pass_pct": (
            round(qa_passed_sessions * 100 / total_records, 1)
            if total_records
            else None
        ),
        "open_qc_actions": issues,
        "unit": "aggregate sessions",
    }
    return pipeline, summary


def _instrument_tracker(
    trackers: Mapping[str, Any], instrument: str
) -> Mapping[str, Any]:
    aliases = ASSESSMENT_ALIASES[instrument]
    for row in _rows(trackers.get("instrument_completeness")):
        label = f"{row.get('instrument', '')} {row.get('label', '')}".lower()
        if any(alias in label for alias in aliases):
            return row
    return {}


def _assessment_event_value(
    by_event: Mapping[str, Any], timepoint: str
) -> Mapping[str, Any]:
    for event, value in by_event.items():
        if _canonical_timepoint(event) == timepoint:
            return _mapping(value)
    return {}


def _derive_assessments(
    aggregates: Mapping[str, Any], *, synthetic: bool, schedule: Mapping[str, Any]
) -> list[dict[str, Any]]:
    trackers = _mapping(aggregates.get("redcap_trackers"))
    schedule_rows = {
        str(row.get("id")): row for row in _rows(schedule.get("timepoints"))
    }
    fallback_rates = {
        "NNNS-II": 0.91,
        "CSBS": 0.88,
        "Bayley-4": 0.86,
        "ADOS-2": 0.82,
        "M-CHAT": 0.89,
        "ASQ-3": 0.9,
    }
    matrix: list[dict[str, Any]] = []
    for instrument, applicable_timepoints in ASSESSMENT_APPLICABILITY.items():
        tracker = _instrument_tracker(trackers, instrument)
        by_event = _mapping(tracker.get("byEvent"))
        for timepoint in NANO_TIMEPOINTS:
            applicable = timepoint in applicable_timepoints
            event_value = _assessment_event_value(by_event, timepoint)
            expected = _count(event_value.get("total")) if applicable else 0
            complete = _count(event_value.get("complete")) if applicable else 0
            if applicable and synthetic and not event_value:
                schedule_row = _mapping(schedule_rows.get(timepoint))
                expected = _count(
                    schedule_row.get("expected", schedule_row.get("completed"))
                )
                complete = round(expected * fallback_rates[instrument])
            complete = min(expected, complete)
            matrix.append(
                {
                    "instrument": instrument,
                    "timepoint": timepoint,
                    "complete": complete,
                    "expected": expected,
                    "pct_complete": (
                        round(complete * 100 / expected, 1) if expected else None
                    ),
                    "applicable": applicable,
                }
            )
    return matrix


INVENTORY_TEMPLATES: tuple[tuple[str, str, int], ...] = (
    ("Actiheart-5 ECG", "physiology", 4),
    ("Squirrel temp datalogger", "physiology", 4),
    ("HeRO monitor access", "physiology", 1),
    ("Eye tracker", "behavior", 1),
    ("NNNS-II kit", "assessment", 1),
    ("Bayley-4 kit", "assessment", 1),
    ("ADOS-2 kit", "assessment", 1),
    ("AOSI kit", "assessment", 1),
    ("ECG electrodes", "consumable", 50),
    ("Temperature sensor consumables", "consumable", 24),
)
SYNTHETIC_INVENTORY: dict[str, tuple[int, int, int]] = {
    "Actiheart-5 ECG": (7, 5, 1),
    "Squirrel temp datalogger": (6, 8, 1),
    "HeRO monitor access": (1, 1, 0),
    "Eye tracker": (1, 1, 0),
    "NNNS-II kit": (1, 2, 0),
    "Bayley-4 kit": (1, 2, 0),
    "ADOS-2 kit": (1, 2, 0),
    "AOSI kit": (1, 1, 0),
    "ECG electrodes": (0, 180, 0),
    "Temperature sensor consumables": (0, 72, 0),
}


def _derive_inventory(
    aggregates: Mapping[str, Any], *, synthetic: bool
) -> list[dict[str, Any]]:
    source_rows = _rows(aggregates.get("inventory"))
    inventory: list[dict[str, Any]] = []
    for item, category, threshold in INVENTORY_TEMPLATES:
        source = next(
            (
                row
                for row in source_rows
                if str(row.get("item", "")).strip().lower() == item.lower()
            ),
            {},
        )
        has_source = bool(source)
        if has_source:
            in_use = _count(source.get("in_use"))
            available = _count(source.get("available"))
            calibration_due = _count(source.get("calibration_due"))
            reorder_threshold = _count(
                source.get("reorder_threshold"), default=threshold
            )
        elif synthetic:
            in_use, available, calibration_due = SYNTHETIC_INVENTORY[item]
            reorder_threshold = threshold
        else:
            in_use = available = calibration_due = 0
            reorder_threshold = threshold
        low_stock = (
            bool(source.get("low_stock"))
            if has_source and "low_stock" in source
            else bool((has_source or synthetic) and available < reorder_threshold)
        )
        status = str(source.get("status") or "").lower()
        if status not in {"ready", "calibration_due", "low_stock", "awaiting_data"}:
            status = ""
        if not status:
            if not has_source and not synthetic:
                status = "awaiting_data"
            elif calibration_due:
                status = "calibration_due"
            elif low_stock:
                status = "low_stock"
            else:
                status = "ready"
        inventory.append(
            {
                "item": item,
                "category": category,
                "in_use": in_use,
                "available": available,
                "calibration_due": calibration_due,
                "reorder_threshold": reorder_threshold,
                "low_stock": low_stock,
                "status": status,
            }
        )
    return inventory


def _checklist_rows(
    specs: Sequence[tuple[str, str]], done_total: tuple[int, int]
) -> list[dict[str, Any]]:
    done, total = done_total
    return [
        {
            "key": key,
            "label": label,
            "done": min(total, max(0, done - index)),
            "total": total,
            "status": "ready" if total else "awaiting_data",
        }
        for index, (key, label) in enumerate(specs)
    ]


def _derive_checklists(
    aggregates: Mapping[str, Any],
    *,
    synthetic: bool,
    enrolled: int,
    pipeline_summary: Mapping[str, Any],
) -> dict[str, Any]:
    onboarding_specs = (
        ("consent", "Consent complete"),
        ("citi_on_file", "CITI training on file"),
        ("irb_dua", "IRB and DUA verified"),
    )
    visit_specs = (
        ("visit_window", "Visit window confirmed"),
        ("equipment", "Equipment reserved"),
        ("forms", "REDCap forms staged"),
        ("room", "Testing room prepared"),
        ("protocol", "Protocol version confirmed"),
    )
    qc_specs = (
        ("ecg_signal", "ECG signal QA"),
        ("temperature", "Temperature validity QA"),
        ("behavior_sync", "Behavior and physiology sync QA"),
    )
    source = _mapping(aggregates.get("checklists"))
    if source:

        def normalized_rows(
            value: Any, specs: Sequence[tuple[str, str]]
        ) -> list[dict[str, Any]]:
            normalized: list[dict[str, Any]] = []
            by_key = {str(row.get("key") or "").strip(): row for row in _rows(value)}
            for key, label in specs:
                row = _mapping(by_key.get(key))
                total = _count(row.get("total"))
                status = str(row.get("status") or "").lower()
                if status not in {
                    "ready",
                    "awaiting_data",
                    "blocked",
                    "overdue",
                    "review",
                }:
                    status = "ready" if total else "awaiting_data"
                normalized.append(
                    {
                        "key": key,
                        "label": label,
                        "done": min(total, _count(row.get("done"))),
                        "total": total,
                        "status": status,
                    }
                )
            return normalized

        return {
            "onboarding": normalized_rows(source.get("onboarding"), onboarding_specs),
            "visit_prep": normalized_rows(source.get("visit_prep"), visit_specs),
            "qc": normalized_rows(source.get("qc"), qc_specs),
            "open_qc_actions": _count(source.get("open_qc_actions")),
            "sop_ack_pct": _percentage(source.get("sop_ack_pct")),
        }

    total = enrolled if synthetic else 0
    onboarding = _checklist_rows(
        onboarding_specs,
        (round(total * 0.96), total),
    )
    visit_total = min(total, 24) if synthetic else 0
    visit_prep = _checklist_rows(
        visit_specs,
        (max(0, visit_total - 2), visit_total),
    )
    qa_total = _count(pipeline_summary.get("qa_passed_sessions"))
    qc = _checklist_rows(
        qc_specs,
        (qa_total, qa_total if synthetic else 0),
    )
    return {
        "onboarding": onboarding,
        "visit_prep": visit_prep,
        "qc": qc,
        "open_qc_actions": _count(pipeline_summary.get("open_qc_actions")),
        "sop_ack_pct": 94.7 if synthetic else None,
    }


def _derive_redcap(
    aggregates: Mapping[str, Any], *, synthetic: bool, timestamp: str
) -> dict[str, Any]:
    override = _mapping(aggregates.get("redcap"))
    meta = _mapping(aggregates.get("redcap_meta"))
    ops = _mapping(aggregates.get("redcap_ops"))
    freshness = _mapping(ops.get("freshness"))
    quality = _mapping(_mapping(aggregates.get("data_quality")).get("qc_flags"))
    status = str(override.get("sync_health") or freshness.get("status") or "").lower()
    if status in {"fresh", "healthy", "success"}:
        status = "ok"
    elif status not in {"ok", "stale", "error"}:
        status = "ok" if synthetic else "error"
    record_count = _count(meta.get("record_count", quality.get("total_records")))
    instruments = {
        str(row.get("instrument"))
        for row in _rows(
            _mapping(aggregates.get("redcap_trackers")).get("instrument_completeness")
        )
        if row.get("instrument")
    }
    instruments.update(
        str(row.get("instrument"))
        for row in _rows(_mapping(aggregates.get("data_quality")).get("missingness"))
        if row.get("instrument")
    )
    last_sync = override.get("last_sync") or freshness.get("generated_at")
    if not last_sync and (synthetic or record_count):
        last_sync = timestamp
    return {
        "api_token_valid": bool(
            override.get(
                "api_token_valid",
                not synthetic and record_count > 0 and status != "error",
            )
        ),
        "last_sync": str(last_sync) if last_sync else None,
        "records_locked": _count(override.get("records_locked")),
        "double_entry_discrepancies": _count(
            override.get(
                "double_entry_discrepancies",
                quality.get("double_entry_discrepancies"),
            )
        ),
        "instruments_defined": _count(
            override.get("instruments_defined"), default=len(instruments)
        ),
        "dags": _count(override.get("dags")),
        "sync_health": status,
        "record_count": record_count,
        "source": "synthetic" if synthetic else "secure aggregate",
    }


def _derive_models(aggregates: Mapping[str, Any], *, synthetic: bool) -> dict[str, Any]:
    metrics = _mapping(aggregates.get("ml_performance"))
    candidates: list[dict[str, Any]] = []
    for row in _rows(metrics.get("models")):
        value = _number(row.get("auroc", row.get("accuracy")))
        if value is None:
            continue
        candidates.append(
            {
                "model": str(row.get("name") or row.get("slug") or "Model"),
                "metric_name": "AUROC" if row.get("auroc") is not None else "accuracy",
                "value": round(max(0.0, min(1.0, value)), 3),
            }
        )
    if synthetic and not candidates:
        candidates = [
            {"model": "Random Forest", "metric_name": "AUROC", "value": 0.82},
            {"model": "XGBoost", "metric_name": "AUROC", "value": 0.86},
            {"model": "1D-CNN + LSTM", "metric_name": "AUROC", "value": 0.89},
        ]
    best = max(candidates, key=lambda row: row["value"]) if candidates else None
    shap_ready = bool(_rows(metrics.get("shap")))
    if synthetic and candidates:
        shap_ready = True
    return {
        "aim3_status": "evaluated" if candidates else "not_started",
        "best_metric": best["value"] if best else None,
        "best_model": best["model"] if best else None,
        "metric_name": best["metric_name"] if best else None,
        "shap_ready": shap_ready,
        "candidates": candidates,
    }


def _local_library_summary() -> dict[str, Any]:
    path = Path(__file__).resolve().parents[1] / "data" / "readings_data.json"
    try:
        import json

        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return {}
    meta = _mapping(payload.get("meta"))
    summary = _mapping(payload.get("summary"))
    return {
        "indexed_documents": _count(
            summary.get("total_readings", meta.get("total_readings"))
        ),
        "last_indexed": meta.get("generated_at"),
    }


def _derive_library(aggregates: Mapping[str, Any]) -> dict[str, Any]:
    source = dict(_local_library_summary())
    source.update(_mapping(aggregates.get("library")))
    href = str(source.get("href") or "/#library")
    if not href.startswith("/") or href.startswith("//"):
        href = "/#library"
    api_href = str(source.get("api_href") or "/api/readings/library")
    if not api_href.startswith("/api/") or api_href.startswith("//"):
        api_href = "/api/readings/library"
    return {
        "href": href,
        "api_href": api_href,
        "label": "ESD Lab Reading Library",
        "index_source": "non-PHI documents and SOPs",
        "indexed_documents": _count(source.get("indexed_documents")),
        "last_indexed": (
            str(source.get("last_indexed")) if source.get("last_indexed") else None
        ),
    }


def _legacy_lgcm_outcome(
    values: Mapping[str, float | None], *, slopes: Mapping[str, float] | None = None
) -> dict[str, Any]:
    slopes = slopes or {}
    output: dict[str, Any] = {
        "asib_intercept_mean": values.get("ASIB"),
        "asib_slope_mean": (
            slopes.get("ASIB", 0.0) if values.get("ASIB") is not None else None
        ),
        "pt_intercept_mean": values.get("PT"),
        "pt_slope_mean": (
            slopes.get("PT", 0.0) if values.get("PT") is not None else None
        ),
        "td_intercept_mean": values.get("TD"),
        "td_slope_mean": (
            slopes.get("TD", 0.0) if values.get("TD") is not None else None
        ),
        "asib_vs_td_intercept_p": None,
        "asib_vs_td_slope_p": None,
        "pt_vs_td_intercept_p": None,
        "pt_vs_td_slope_p": None,
        "growth_curves": [],
    }
    for group in ("ASIB", "PT", "TD"):
        start = values.get(group)
        if start is None:
            continue
        slope = slopes.get(group, 0.0)
        for month in (1, 2, 3):
            mean = round(start + slope * (month - 1), 2)
            output["growth_curves"].append(
                {
                    "group": group.lower(),
                    "timepoint_m": month,
                    "mean": mean,
                    "ci_low": round(mean * 0.86, 2),
                    "ci_high": round(mean * 1.14, 2),
                }
            )
    return output


def _legacy_blocks(contract: Mapping[str, Any], *, synthetic: bool) -> dict[str, Any]:
    enrollment = _mapping(contract.get("enrollment"))
    attention = _mapping(contract.get("attention"))
    autonomic = _mapping(contract.get("autonomic"))
    schedule = {
        str(row.get("id")): row
        for row in _rows(_mapping(contract.get("schedule")).get("timepoints"))
    }
    attention_groups = _rows(attention.get("by_group_window"))
    autonomic_groups = _rows(autonomic.get("by_group_window"))

    def group_values(
        rows: list[Mapping[str, Any]], key: str
    ) -> dict[str, float | None]:
        return {
            group: _rounded(
                next(
                    (
                        row.get(key)
                        for row in rows
                        if str(row.get("group", "")).upper() == group
                        and row.get("window") == "1-3m"
                    ),
                    None,
                ),
                2,
            )
            for group in NANO_TARGETS
        }

    pipeline_summary = _mapping(contract.get("pipeline_summary"))
    qc_fraction = _number(pipeline_summary.get("qa_pass_pct"))
    qc_fraction = round(qc_fraction / 100, 3) if qc_fraction is not None else 0.0
    visit_labels = ("1m", "2m", "3m", "6m", "9m", "12m")
    if synthetic:
        ecg_values = dict(zip(visit_labels, (0.94, 0.92, 0.90, 0.88, 0.85, 0.86)))
        sync_values = dict(zip(visit_labels, (0.97, 0.95, 0.93, 0.90, 0.89, 0.90)))
    else:
        ecg_values = {label: qc_fraction for label in visit_labels}
        sync_values = {
            label: (
                qc_fraction if attention.get("hda_sustained_pct") is not None else 0.0
            )
            for label in visit_labels
        }

    models = _mapping(contract.get("models"))
    shap = _rows(_mapping(contract.get("_source_ml_performance")).get("shap"))
    feature_importance = [
        {
            "feature": str(row.get("feature") or row.get("label") or "feature"),
            "mean_abs_shap": round(_number(row.get("importance")) or 0.0, 3),
        }
        for row in shap[:8]
    ]
    return {
        "study_meta": {
            "award": "R01MH132925",
            "start_date": "2023-07-01",
            "end_date": "2028-06-30",
            "n_target": NANO_TARGET,
            "n_target_asib": NANO_TARGETS["ASIB"],
            "n_target_pt": NANO_TARGETS["PT"],
            "n_target_td": NANO_TARGETS["TD"],
            "pi": "Jessica Bradshaw, PhD",
        },
        "active_followup": {
            "1_3m": _count(_mapping(schedule.get("month_3")).get("completed")),
            "6_12m": _count(_mapping(schedule.get("month_12")).get("completed")),
            "24_36m": _count(_mapping(schedule.get("month_36")).get("completed")),
        },
        "ecg_quality": {
            "pct_valid_ecg_by_visit": ecg_values,
            "pct_hda_synced_by_visit": sync_values,
        },
        "lgcm_results": {
            "pct_sa": _legacy_lgcm_outcome(
                group_values(attention_groups, "sustained_pct"),
                slopes={"ASIB": 1.0, "PT": 1.3, "TD": 1.5} if synthetic else None,
            ),
            "hr_decel": _legacy_lgcm_outcome(
                group_values(attention_groups, "hda_quality_bpm"),
                slopes={"ASIB": 0.09, "PT": 0.12, "TD": 0.14} if synthetic else None,
            ),
            "rsa": _legacy_lgcm_outcome(
                group_values(autonomic_groups, "rsa_baseline_ms2"),
                slopes={"ASIB": 0.04, "PT": 0.06, "TD": 0.08} if synthetic else None,
            ),
        },
        "ml_results": {
            "r2_by_outcome": {},
            "outcomes": [],
            "windows": ["1_3m", "6_12m"],
            "feature_importance": feature_importance,
        },
        "preliminary_finding": {
            "label": (
                f"{models.get('best_model')} validation {models.get('metric_name')}"
                if models.get("best_model")
                else "Aim 3 model awaiting evaluation"
            ),
            "value": _number(models.get("best_metric")) or 0.0,
            "type": str(models.get("metric_name") or "AUROC").lower(),
            "n": _count(_mapping(schedule.get("month_36")).get("completed")),
            "pilot": synthetic,
        },
        # The enrollment object itself already contains the legacy scalar aliases.
        "enrollment": enrollment,
    }


def build_nano_contract(
    generated_at: str | None = None,
    *,
    source: str = "synthetic_demo",
    aggregates: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the complete public ``nano`` namespace from aggregate inputs only."""

    timestamp = generated_at or _iso_now()
    aggregate_source = _mapping(aggregates)
    synthetic = _is_synthetic_source(source)
    enrollment = _derive_enrollment(
        aggregate_source, synthetic=synthetic, timestamp=timestamp
    )
    attention, autonomic = _derive_attention_and_autonomic(
        aggregate_source, synthetic=synthetic
    )
    schedule = _derive_schedule(
        aggregate_source,
        synthetic=synthetic,
        enrolled=_count(enrollment.get("enrolled")),
    )
    pipeline, pipeline_summary = _derive_pipeline(aggregate_source, synthetic=synthetic)
    assessments = _derive_assessments(
        aggregate_source,
        synthetic=synthetic,
        schedule=schedule,
    )
    inventory = _derive_inventory(aggregate_source, synthetic=synthetic)
    checklists = _derive_checklists(
        aggregate_source,
        synthetic=synthetic,
        enrolled=_count(enrollment.get("enrolled")),
        pipeline_summary=pipeline_summary,
    )
    redcap = _derive_redcap(aggregate_source, synthetic=synthetic, timestamp=timestamp)
    models = _derive_models(aggregate_source, synthetic=synthetic)
    library = _derive_library(aggregate_source)

    contract: dict[str, Any] = {
        "meta": {
            "study": "NANO",
            "long_name": "Neurodevelopment of Autonomic and Neural Organization",
            "state": "Actively Enrolling",
            "as_of": _as_of(timestamp),
            "n_target": NANO_TARGET,
            "source": _canonical_source(source),
            "aggregate_only": True,
        },
        "enrollment": enrollment,
        "attention": attention,
        "autonomic": autonomic,
        "schedule": schedule,
        "pipeline": pipeline,
        "pipeline_summary": pipeline_summary,
        "assessments": assessments,
        "inventory": inventory,
        "checklists": checklists,
        "redcap": redcap,
        "models": models,
        "library": library,
        # Used only while deriving backward-compatible aggregate aliases, then removed.
        "_source_ml_performance": _mapping(aggregate_source.get("ml_performance")),
    }
    contract.update(_legacy_blocks(contract, synthetic=synthetic))
    contract.pop("_source_ml_performance", None)
    return contract


__all__ = [
    "ASSESSMENT_APPLICABILITY",
    "NANO_TARGET",
    "NANO_TARGETS",
    "NANO_TIMEPOINTS",
    "NANO_WINDOWS",
    "build_nano_contract",
]
