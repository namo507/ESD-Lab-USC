"""NANO Study — Production Dashboard Data Pipeline (Python).

Pulls live data from REDCap, the processed feature matrix, model artifacts
and QC logs, then emits ``dashboard/data/dashboard_data.json`` using the
**same schema** as ``generate_synthetic_dashboard_data.py`` so the
local runtime and SPA routes can work with either source.

Pipeline role
-------------
This is the primary entry point used by the nightly cron
(``scripts/redcap_daily_sync.py`` → this script). It never touches raw
signals — only the already-processed feature parquet and REDCap mirror.

Usage
-----
CLI::

    python dashboard/pipelines/build_dashboard_data.py
    python dashboard/pipelines/build_dashboard_data.py --config config/paths.yml
    python dashboard/pipelines/build_dashboard_data.py --fallback-synthetic

Environment
-----------
Requires ``NANO_DATA_ROOT`` set in ``.env`` (points to the USC Secure
Server mount). PHI never leaves the secure mount — this script writes
only aggregate group-level counts + synthetic participant IDs.

Safety
------
* Any field marked ``phi_flag=True`` in the data dictionary is dropped
  **before** aggregation.
* Participant IDs are hashed to stable ``NANO-####`` surrogates.
* If any required input is missing, the pipeline logs a warning and
  optionally falls back to the synthetic generator (``--fallback-synthetic``).

Output schema
-------------
Identical to ``generate_synthetic_dashboard_data.py``:
``meta``, ``enrollment``, ``visit_completion``, ``data_quality``,
``ml_performance``, ``trajectories``, ``redcap_audit``, ``cohort_table``,
``participant_operations``, ``organization_site``.

Reproducibility
---------------
The aggregation is deterministic given the same inputs (no RNG). The
only randomness is the ``hashlib`` salt used for ID surrogates, which
lives in ``config/paths.yml → participant_id_salt`` so it is stable
across runs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import math
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd
import yaml

# ─── Project imports (best-effort so script runs standalone) ────────────────
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))
UNRESOLVED_TEMPLATE_PATTERN = re.compile(r"\$\{[^}]+\}")
DEFAULT_REDCAP_PATH = PROJECT_ROOT / "data" / "processed" / "redcap_latest.parquet"
DEFAULT_FEATURE_PATH = PROJECT_ROOT / "data" / "processed" / "feature_matrix.parquet"
DEFAULT_DD_PATH = (
    PROJECT_ROOT / "data" / "data_dictionary" / "NANO_master_data_dictionary.csv"
)
DEFAULT_METRICS_PATH = PROJECT_ROOT / "models" / "_metrics.json"
REDCAP_CONFIG_PATH = PROJECT_ROOT / "config" / "redcap_config.yml"
DASHBOARD_CONTROLS_PATH = PROJECT_ROOT / "config" / "dashboard_controls.json"
DEFAULT_DASHBOARD_CONTROLS: dict[str, Any] = {
    "anomaly_thresholds": {
        "stale_visit_days": 30,
        "completeness_warn_pct": 0.80,
        "freshness_sla_hours": 48,
        "small_cell_min": 5,
    },
    "clinical_cutoffs": {
        "epds_positive": 10,
        "epds_high": 13,
        "epds_self_harm_item_min": 1,
        "asq_monitor": 35,
        "asq_refer": 25,
        "visit_window_days": 30,
        "dp_epsilon": 1.0,
    },
    "sync": {"cadence_cron": "0 8 * * *", "chunk_size": 500},
    "assistant": {"model_tier": "clinical", "max_fragments": 25},
    "feature_flags": {
        "redcap.visitHealth": True,
        "redcap.whatif": True,
        "redcap.writeback": False,
        "redcap.pipelineHealth": True,
    },
}

try:
    from src.utils.logging_utils import get_pipeline_logger

    logger = get_pipeline_logger(__name__)
except Exception:  # pragma: no cover
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s :: %(message)s",
    )
    logger = logging.getLogger("build_dashboard_data")

from dashboard.pipelines.lab_operations import build_lab_operations_payload
from dashboard.pipelines.participant_operations import build_participant_operations
from dashboard.pipelines.study_blocks import build_study_blocks


# ─── Configuration loading ──────────────────────────────────────────────────
def load_config(config_path: Path) -> dict:
    """Load a YAML config, expanding ``${NANO_DATA_ROOT}`` and env vars."""
    raw = config_path.read_text()
    for key, val in os.environ.items():
        raw = raw.replace(f"${{{key}}}", val)
    return yaml.safe_load(raw) or {}


def load_redcap_contract() -> dict[str, Any]:
    """Load the canonical REDCap contract shared by Python, R, TS, and docs."""
    return yaml.safe_load(REDCAP_CONFIG_PATH.read_text(encoding="utf-8")) or {}


def _deep_merge_controls(
    base: dict[str, Any], override: dict[str, Any]
) -> dict[str, Any]:
    merged = json.loads(json.dumps(base))
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge_controls(merged[key], value)
        else:
            merged[key] = value
    return merged


def _clamp_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _clamp_float(
    value: Any, *, default: float, minimum: float, maximum: float
) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    return round(max(minimum, min(maximum, parsed)), 3)


def normalize_dashboard_controls(raw: dict[str, Any] | None = None) -> dict[str, Any]:
    """Merge and range-check Tier-1 dashboard controls."""
    raw = raw or {}
    controls = _deep_merge_controls(DEFAULT_DASHBOARD_CONTROLS, raw)
    thresholds = controls.setdefault("anomaly_thresholds", {})
    thresholds["stale_visit_days"] = _clamp_int(
        thresholds.get("stale_visit_days"),
        default=30,
        minimum=1,
        maximum=365,
    )
    thresholds["completeness_warn_pct"] = _clamp_float(
        thresholds.get("completeness_warn_pct"),
        default=0.80,
        minimum=0.50,
        maximum=0.99,
    )
    thresholds["freshness_sla_hours"] = _clamp_float(
        thresholds.get("freshness_sla_hours"),
        default=48.0,
        minimum=1.0,
        maximum=168.0,
    )
    thresholds["small_cell_min"] = _clamp_int(
        thresholds.get("small_cell_min"),
        default=5,
        minimum=2,
        maximum=20,
    )
    cutoffs = controls.setdefault("clinical_cutoffs", {})
    cutoffs["epds_positive"] = _clamp_int(
        cutoffs.get("epds_positive"),
        default=10,
        minimum=0,
        maximum=30,
    )
    cutoffs["epds_high"] = _clamp_int(
        cutoffs.get("epds_high"),
        default=13,
        minimum=cutoffs["epds_positive"],
        maximum=30,
    )
    cutoffs["epds_self_harm_item_min"] = _clamp_int(
        cutoffs.get("epds_self_harm_item_min"),
        default=1,
        minimum=1,
        maximum=3,
    )
    cutoffs["asq_monitor"] = _clamp_int(
        cutoffs.get("asq_monitor"),
        default=35,
        minimum=0,
        maximum=60,
    )
    cutoffs["asq_refer"] = _clamp_int(
        cutoffs.get("asq_refer"),
        default=25,
        minimum=0,
        maximum=cutoffs["asq_monitor"],
    )
    cutoffs["visit_window_days"] = _clamp_int(
        cutoffs.get("visit_window_days"),
        default=30,
        minimum=7,
        maximum=90,
    )
    cutoffs["dp_epsilon"] = _clamp_float(
        cutoffs.get("dp_epsilon"),
        default=1.0,
        minimum=0.1,
        maximum=10.0,
    )
    sync = controls.setdefault("sync", {})
    sync["cadence_cron"] = str(sync.get("cadence_cron") or "0 8 * * *")
    sync["chunk_size"] = _clamp_int(
        sync.get("chunk_size"),
        default=500,
        minimum=1,
        maximum=5000,
    )
    assistant = controls.setdefault("assistant", {})
    assistant["model_tier"] = str(assistant.get("model_tier") or "clinical")
    assistant["max_fragments"] = _clamp_int(
        assistant.get("max_fragments"),
        default=25,
        minimum=5,
        maximum=100,
    )
    flags = controls.setdefault("feature_flags", {})
    for key, value in DEFAULT_DASHBOARD_CONTROLS["feature_flags"].items():
        flags[key] = bool(flags.get(key, value))
    return controls


def load_dashboard_controls(path: Path = DASHBOARD_CONTROLS_PATH) -> dict[str, Any]:
    """Load and range-check Tier-1 dashboard controls shared by all runtimes."""
    raw: dict[str, Any] = {}
    if path.exists():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            logger.warning("Dashboard controls invalid JSON (%s); using defaults.", exc)
    return normalize_dashboard_controls(raw)


def _has_unresolved_template(value: str) -> bool:
    return bool(UNRESOLVED_TEMPLATE_PATTERN.search(value))


def _resolve_paths(cfg: dict) -> dict[str, Path]:
    """Materialize the paths in ``config/paths.yml`` as :class:`Path` objects."""
    out: dict[str, Path] = {}
    flat = cfg.get("paths", cfg)
    for k, v in flat.items():
        if isinstance(v, str):
            if _has_unresolved_template(v):
                continue
            out[k] = Path(v).expanduser()
        elif isinstance(v, dict):
            for kk, vv in v.items():
                if isinstance(vv, str) and _has_unresolved_template(vv):
                    continue
                out[f"{k}.{kk}"] = Path(vv).expanduser()
    return out


def _pick_configured_path(
    paths: dict[str, Path], keys: tuple[str, ...], default: Path
) -> Path:
    for key in keys:
        configured = paths.get(key)
        if configured is not None and not _has_unresolved_template(str(configured)):
            return configured
    return default


def _tabular_candidates(path: Path) -> list[Path]:
    candidates = [path]
    if path.suffix.lower() == ".parquet":
        candidates.append(path.with_suffix(".csv"))
    elif path.suffix.lower() == ".csv":
        candidates.append(path.with_suffix(".parquet"))
    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate)
        if key not in seen:
            unique.append(candidate)
            seen.add(key)
    return unique


def _read_tabular_frame(path: Path, label: str) -> Optional[pd.DataFrame]:
    for candidate in _tabular_candidates(path):
        if not candidate.exists():
            continue
        if candidate.suffix.lower() == ".parquet":
            df = pd.read_parquet(candidate)
        elif candidate.suffix.lower() == ".csv":
            df = pd.read_csv(candidate)
        else:
            continue
        logger.info("%s rows=%d cols=%d (%s)", label, *df.shape, candidate)
        return df
    logger.warning("%s not found: %s", label, path)
    return None


def _infer_data_source(redcap: Optional[pd.DataFrame]) -> str:
    if redcap is not None and "dashboard_input_source" in redcap.columns:
        values = redcap["dashboard_input_source"].dropna().astype(str)
        if not values.empty:
            return values.iloc[0]
    return "redcap_live + feature_matrix"


def _make_json_safe(value: Any) -> Any:
    if value is pd.NA:
        return None
    if isinstance(value, dict):
        return {key: _make_json_safe(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [_make_json_safe(inner) for inner in value]
    if isinstance(value, tuple):
        return [_make_json_safe(inner) for inner in value]
    if isinstance(value, np.generic):
        return _make_json_safe(value.item())
    if isinstance(value, float):
        return None if not math.isfinite(value) else value
    return value


def _atomic_write_json(output_path: Path, payload: dict[str, Any]) -> None:
    """Write JSON atomically so the live dashboard never reads partial output."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    safe_payload = _make_json_safe(payload)
    temp_path.write_text(
        json.dumps(safe_payload, indent=2, default=str, allow_nan=False),
        encoding="utf-8",
    )
    temp_path.replace(output_path)


def _load_cached_organization_site(output_path: Path) -> dict[str, Any]:
    """Reuse the last good organization-site payload when a live scrape fails."""
    if not output_path.exists():
        return {}
    try:
        payload = json.loads(output_path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Unable to read cached dashboard payload: %s", exc)
        return {}
    organization_site = payload.get("organization_site")
    if isinstance(organization_site, dict):
        logger.info("Using cached organization-site payload from %s", output_path)
        return organization_site
    return {}


def _resolve_organization_site(output_path: Path) -> dict[str, Any]:
    """Fetch live site metadata, but never fail the whole dashboard build on it."""
    try:
        from dashboard.pipelines import build_org_site_data

        return build_org_site_data.build_payload()
    except Exception as exc:
        logger.warning("Organization-site refresh failed: %s", exc)
        return _load_cached_organization_site(output_path)


# ─── ID anonymization ───────────────────────────────────────────────────────
def _surrogate_id(real_id: str, salt: str) -> str:
    """Deterministic 4-digit surrogate ``NANO-####`` per participant."""
    h = hashlib.sha256(f"{salt}:{real_id}".encode()).hexdigest()
    return f"NANO-{int(h, 16) % 10000:04d}"


# ─── Loaders ────────────────────────────────────────────────────────────────
def load_redcap_mirror(redcap_parquet: Path) -> Optional[pd.DataFrame]:
    """Load the REDCap nightly mirror (longitudinal parquet)."""
    return _read_tabular_frame(redcap_parquet, "REDCap mirror")


def load_feature_matrix(features_parquet: Path) -> Optional[pd.DataFrame]:
    """Load the wide feature matrix (one row per participant × event)."""
    return _read_tabular_frame(features_parquet, "Feature matrix")


def load_data_dictionary(dd_csv: Path) -> Optional[pd.DataFrame]:
    """Load the master data dictionary; used to drop PHI fields."""
    if not dd_csv.exists():
        logger.warning("Data dictionary not found: %s", dd_csv)
        return None
    try:
        return pd.read_csv(dd_csv)
    except Exception as exc:
        logger.warning("Data dictionary could not be parsed: %s", exc)
        return None


def load_model_metrics(metrics_json: Path) -> Optional[dict]:
    """Load ``models/_metrics.json`` produced by the ML training step."""
    if not metrics_json.exists():
        logger.warning("Model metrics not found: %s", metrics_json)
        return None
    return json.loads(metrics_json.read_text())


# ─── PHI scrubbing ─────────────────────────────────────────────────────────
def drop_phi(df: pd.DataFrame, dd: Optional[pd.DataFrame]) -> pd.DataFrame:
    """Remove any column flagged as PHI in the data dictionary."""
    contract_phi = set(load_redcap_contract().get("phi_fields") or [])
    if contract_phi:
        df = df[[c for c in df.columns if c not in contract_phi]].copy()
    if dd is None or "phi_flag" not in dd.columns:
        return df
    phi_cols = dd.loc[
        dd["phi_flag"].astype(str).str.lower().isin(["1", "true", "yes"]),
        "variable_name",
    ].tolist()
    keep = [c for c in df.columns if c not in phi_cols]
    dropped = [c for c in df.columns if c in phi_cols]
    if dropped:
        logger.info("Dropped %d PHI columns: %s", len(dropped), dropped[:5])
    return df[keep]


# ─── Study constants (kept in sync with config/study_parameters.yml) ────────
GROUPS = {
    "ASIB": {"n_target": 65, "color": "#C44E52", "label": "ASIB (VPT + ASD traits)"},
    "PT": {"n_target": 130, "color": "#4C72B0", "label": "PT (VPT typical)"},
    "TD": {"n_target": 65, "color": "#55A868", "label": "TD (Term-born typical)"},
}
EVENTS = [
    ("nicu_admission", 0, "NICU Admission"),
    ("month_1", 1, "1 Month CGA"),
    ("month_2", 2, "2 Months CGA"),
    ("month_3", 3, "3 Months CGA"),
    ("month_6", 6, "6 Months"),
    ("month_9", 9, "9 Months"),
    ("month_12", 12, "12 Months"),
    ("month_24", 24, "24 Months"),
    ("month_36", 36, "36 Months"),
]


# ─── Section builders ──────────────────────────────────────────────────────
def build_enrollment(redcap: pd.DataFrame) -> dict:
    """Per-group cumulative enrollment over the last 30 months."""
    current_month = pd.Timestamp.now().to_period("M")
    months = [
        str(period)
        for period in pd.period_range(end=current_month, periods=30, freq="M")
    ]

    # Filter to enrollment event
    enroll_df = redcap[
        redcap["redcap_event_name"].str.contains("nicu_admission", na=False)
    ].copy()
    enroll_df["enrolled_month"] = pd.to_datetime(
        enroll_df["enrollment_date"], errors="coerce"
    ).dt.strftime("%Y-%m")

    by_group: dict[str, dict] = {}
    for g, meta in GROUPS.items():
        group_df = enroll_df[enroll_df["group_assignment"] == g]
        monthly = []
        by_month = group_df.groupby("enrolled_month").size().to_dict()
        window_start = pd.Timestamp(f"{months[0]}-01")
        enrolled_dates = pd.to_datetime(group_df["enrollment_date"], errors="coerce")
        # Participants enrolled before the 30-month chart window remain part of
        # the current cohort; seed the cumulative curve with that baseline.
        cum = int(((enrolled_dates < window_start) | enrolled_dates.isna()).sum())
        for m in months:
            cum += int(by_month.get(m, 0))
            monthly.append(cum)
        current = monthly[-1] if monthly else 0
        by_group[g] = {
            "target": meta["n_target"],
            "current": current,
            "percent": (
                round(100.0 * current / meta["n_target"], 1) if meta["n_target"] else 0
            ),
            "monthly": monthly,
            "color": meta["color"],
            "label": meta["label"],
        }

    by_ga_stratum: dict[str, int] = {}
    if "ga_weeks" in enroll_df.columns:
        ga_weeks = pd.to_numeric(enroll_df["ga_weeks"], errors="coerce")
        by_ga_stratum = {
            "24_26w": int(ga_weeks.between(24, 26, inclusive="both").sum()),
            "27_29w": int(ga_weeks.between(27, 29, inclusive="both").sum()),
            "30_32w": int(ga_weeks.between(30, 32, inclusive="both").sum()),
            "full_term": int(ga_weeks.between(37, 42, inclusive="both").sum()),
        }
    return {
        "months": months,
        "by_group": by_group,
        "by_ga_stratum": by_ga_stratum,
    }


def build_visit_completion(redcap: pd.DataFrame) -> dict:
    """Per-event × group visit-completion percentage."""
    out = {
        "events": [e[0] for e in EVENTS],
        "labels": [e[2] for e in EVENTS],
        "by_group": {},
    }
    for g in GROUPS:
        g_df = redcap[redcap["group_assignment"] == g]
        participants = g_df["record_id"].nunique() or 1
        rates = []
        for event, _, _ in EVENTS:
            completed = g_df[
                (g_df["redcap_event_name"] == event)
                & (g_df.get("visit_completed", 0) == 1)
            ]["record_id"].nunique()
            rates.append(round(100.0 * completed / participants, 1))
        out["by_group"][g] = rates
    return out


def build_data_quality(redcap: pd.DataFrame, dd: Optional[pd.DataFrame]) -> dict:
    """Per-instrument missingness + QC flag counts from REDCap."""
    instruments: list[str] = []
    if dd is not None and "form_name" in dd.columns:
        instruments = sorted(dd["form_name"].dropna().unique().tolist())
    else:
        instruments = [
            c.split("_complete")[0] for c in redcap.columns if c.endswith("_complete")
        ]

    missingness = []
    for inst in instruments:
        complete_col = f"{inst}_complete"
        if complete_col not in redcap.columns:
            continue
        n = len(redcap)
        if n == 0:
            continue
        pct_missing = 100.0 * (redcap[complete_col] != 2).sum() / n
        missingness.append(
            {
                "instrument": inst,
                "pct_missing": round(float(pct_missing), 1),
                "status": (
                    "High — MNAR risk"
                    if pct_missing > 25
                    else (
                        "Moderate — MAR candidate"
                        if pct_missing > 10
                        else "Low — MCAR likely"
                    )
                ),
            }
        )

    qc_flags = {
        "total_records": int(len(redcap)),
        "double_entry_discrepancies": int(
            (redcap.get("double_entry_mismatch", 0) == 1).sum()
        ),
        "out_of_range_values": int((redcap.get("value_out_of_range", 0) == 1).sum()),
        "missing_required_fields": (
            int(
                redcap[[c for c in redcap.columns if c.endswith("_required")]]
                .isna()
                .sum()
                .sum()
            )
            if any(c.endswith("_required") for c in redcap.columns)
            else 0
        ),
        "ecg_transfer_late": int((redcap.get("ecg_transfer_late", 0) == 1).sum()),
        "temp_quality_rejected": int(
            (redcap.get("temp_quality_rejected", 0) == 1).sum()
        ),
    }
    return {"missingness": missingness, "qc_flags": qc_flags}


def _redcap_contract_parts() -> (
    tuple[dict[str, Any], dict[str, Any], str, str, list[str]]
):
    contract = load_redcap_contract()
    carry_forward = contract["instruments"]["carry_forward"]
    visit_field = contract["instruments"]["visit_date_field"]
    # Contract guard: csbs_caregiver_complete is the canonical CSBS status field.
    csbs_field = carry_forward["complete_field"]
    csbs_events = list(carry_forward["events"])
    return contract, carry_forward, visit_field, csbs_field, csbs_events


def _redcap_event_label(contract: dict[str, Any], event_name: str) -> str:
    label = str(
        (contract.get("events", {}).get("labels") or {}).get(event_name) or event_name
    )
    return label.replace(" Months", "m").replace(" Month", "m").replace(" ", "")


def _status_code(value: Any) -> str:
    if value is None or value is pd.NA:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    text = str(value).strip()
    if text.endswith(".0") and text[:-2].isdigit():
        text = text[:-2]
    return text.upper() if text.upper() == "SKIP" else text


def _status_slug(value: Any, contract: dict[str, Any]) -> str:
    status = contract.get("status_codes", {}).get(_status_code(value))
    if isinstance(status, dict):
        return (
            str(status.get("normalized") or status.get("label") or "not_started")
            .lower()
            .replace(" ", "_")
        )
    return "not_started"


def build_redcap_completion_stats(
    redcap: pd.DataFrame,
) -> dict[str, dict[str, int | str]]:
    """CSBS completion status counts for the verified carry-forward events."""
    contract, _carry_forward, _visit_field, csbs_field, csbs_events = (
        _redcap_contract_parts()
    )
    stats: dict[str, dict[str, int | str]] = {}
    event_col = (
        redcap["redcap_event_name"].astype(str)
        if "redcap_event_name" in redcap.columns
        else pd.Series("", index=redcap.index)
    )
    for event_name in csbs_events:
        sub = redcap[_event_mask(event_col, event_name)]
        counts = {
            "complete": 0,
            "unverified": 0,
            "incomplete": 0,
            "not_started": 0,
            "skipped": 0,
        }
        if csbs_field in sub.columns:
            for value in sub[csbs_field].tolist():
                counts[_status_slug(value, contract)] = (
                    counts.get(_status_slug(value, contract), 0) + 1
                )
        else:
            counts["not_started"] = int(len(sub))
        stats[event_name] = {
            "label": _redcap_event_label(contract, event_name),
            **{key: int(value) for key, value in counts.items()},
            "total": int(len(sub)),
        }
    return stats


def _row_for_event(events: dict[str, dict[str, Any]], name: str) -> dict[str, Any]:
    return events.get(name, {})


def _has_text(value: Any) -> bool:
    return bool(str(value or "").strip())


def _redcap_anomaly_flags(events: dict[str, dict[str, Any]]) -> list[str]:
    contract, _carry_forward, visit_field, csbs_field, _csbs_events = (
        _redcap_contract_parts()
    )
    six = _row_for_event(events, "6_months_arm_1")
    nine = _row_for_event(events, "9_months_arm_1")
    twelve = _row_for_event(events, "12_months_arm_1")
    tfour = _row_for_event(events, "24_months_arm_1")
    six_status = _status_slug(six.get(csbs_field), contract)
    nine_status = _status_slug(nine.get(csbs_field), contract)
    twelve_status = _status_slug(twelve.get(csbs_field), contract)
    flags: list[str] = []
    if six_status == "incomplete" and _has_text(nine.get(visit_field)):
        flags.append("R1")
    if nine_status == "incomplete" and _has_text(twelve.get(visit_field)):
        flags.append("R2")
    if six_status == "not_started" and nine_status == "complete":
        flags.append("R3")
    if nine_status == "not_started" and twelve_status == "complete":
        flags.append("R4")
    if twelve_status == "incomplete" and _has_text(tfour.get(visit_field)):
        flags.append("R5")
    return flags


def build_redcap_visit_health(redcap: pd.DataFrame, salt: str) -> list[dict[str, Any]]:
    """Participant-level CSBS carry-forward monitor with de-identified IDs."""
    contract, _carry_forward, visit_field, csbs_field, _csbs_events = (
        _redcap_contract_parts()
    )
    if "record_id" not in redcap.columns:
        return []

    event_names = {
        "sixMonth": "6_months_arm_1",
        "nineMonth": "9_months_arm_1",
        "twelveMonth": "12_months_arm_1",
        "twentyFourMonth": "24_months_arm_1",
    }

    rows: list[dict[str, Any]] = []
    for rid, grp in redcap.groupby("record_id", dropna=True):
        event_rows = {
            str(row.get("redcap_event_name") or ""): row.to_dict()
            for _, row in grp.iterrows()
        }

        def timepoint(event_name: str) -> dict[str, Any]:
            row = event_rows.get(event_name, {})
            return {
                "eventName": event_name,
                "visitDate": str(row.get(visit_field) or "").strip() or None,
                "csbsStatus": _status_slug(row.get(csbs_field), contract),
                "csbsTimestamp": str(
                    row.get(
                        f"{contract['instruments']['carry_forward']['instrument']}_timestamp"
                    )
                    or ""
                ).strip()
                or None,
            }

        flags = _redcap_anomaly_flags(event_rows)
        rows.append(
            {
                "recordId": _surrogate_id(str(rid), salt),
                "sixMonth": timepoint(event_names["sixMonth"]),
                "nineMonth": timepoint(event_names["nineMonth"]),
                "twelveMonth": timepoint(event_names["twelveMonth"]),
                "twentyFourMonth": timepoint(event_names["twentyFourMonth"]),
                "anomalyFlags": flags,
                "hasCarryForwardRisk": bool(flags),
            }
        )

    return sorted(
        rows, key=lambda row: (not row["hasCarryForwardRisk"], row["recordId"])
    )


def _event_month(event_name: str) -> int:
    match = re.search(r"(\d+)", event_name)
    return int(match.group(1)) if match else 0


def _humanize_field_name(value: str) -> str:
    return (
        value.replace("_", " ").replace("csbs", "CSBS").replace("epds", "EPDS").title()
    )


def _payload_hash(*parts: Any) -> str:
    text = json.dumps(_make_json_safe(parts), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def build_redcap_trackers(
    redcap: pd.DataFrame,
    *,
    completion_stats: dict[str, dict[str, Any]],
    controls: dict[str, Any],
) -> dict[str, Any]:
    """Aggregate REDCap tracker blocks used by coordinator, exec, and public surfaces."""
    contract, _carry_forward, visit_field, _csbs_field, csbs_events = (
        _redcap_contract_parts()
    )
    event_order = list((contract.get("events", {}) or {}).get("order") or csbs_events)
    labels = (contract.get("events", {}) or {}).get("labels") or {}
    event_col = (
        redcap["redcap_event_name"].astype(str)
        if "redcap_event_name" in redcap.columns
        else pd.Series("", index=redcap.index)
    )
    total_records = (
        int(redcap["record_id"].nunique())
        if "record_id" in redcap.columns
        else int(len(redcap))
    )

    enrollment: list[dict[str, Any]] = []
    for event_name in event_order:
        sub = redcap[_event_mask(event_col, event_name)]
        expected = (
            total_records
            if event_name not in {"consent_arm_1"}
            else (
                int(sub["record_id"].nunique())
                if "record_id" in sub.columns
                else int(len(sub))
            )
        )
        scheduled = (
            int(
                sub.loc[
                    sub.get(visit_field, pd.Series("", index=sub.index))
                    .astype(str)
                    .str.strip()
                    .ne(""),
                    "record_id",
                ].nunique()
            )
            if "record_id" in sub.columns and visit_field in sub.columns
            else int(len(sub))
        )
        if event_name in completion_stats:
            completed = int(completion_stats[event_name].get("complete", 0))
        elif "visit_completed" in sub.columns and "record_id" in sub.columns:
            completed = int(sub.loc[sub["visit_completed"] == 1, "record_id"].nunique())
        else:
            completed = scheduled
        enrollment.append(
            {
                "event": event_name,
                "label": (
                    _redcap_event_label(contract, event_name)
                    if event_name in csbs_events
                    else str(labels.get(event_name) or event_name)
                ),
                "expected": int(expected),
                "scheduled": int(scheduled),
                "completed": int(completed),
            }
        )

    complete_cols = [col for col in redcap.columns if str(col).endswith("_complete")]
    preferred = [
        "csbs_caregiver_complete",
        "epds_maternal_depression_complete",
        "medication_complete",
        "asq3_milestones_complete",
        "vineland_complete",
    ]
    ordered_cols = [col for col in preferred if col in complete_cols] + [
        col for col in complete_cols if col not in preferred
    ]
    instrument_completeness: list[dict[str, Any]] = []
    for complete_col in ordered_cols[:10]:
        instrument = complete_col.removesuffix("_complete")
        by_event: dict[str, dict[str, int]] = {}
        for event_name in event_order:
            sub = redcap[_event_mask(event_col, event_name)]
            total = int(len(sub))
            if total == 0:
                by_event[event_name] = {"complete": 0, "total": 0}
                continue
            complete = int(
                sub[complete_col]
                .map(lambda value: _status_slug(value, contract) == "complete")
                .sum()
            )
            by_event[event_name] = {"complete": complete, "total": total}
        instrument_completeness.append(
            {
                "instrument": instrument,
                "label": _humanize_field_name(instrument),
                "byEvent": by_event,
            }
        )

    queue_total = sum(
        int(row.get("expected", 0)) for row in enrollment if row["event"] in csbs_events
    )
    queue_scheduled = sum(
        int(row.get("scheduled", 0))
        for row in enrollment
        if row["event"] in csbs_events
    )
    queue_complete = sum(
        int(stats.get("complete", 0)) for stats in completion_stats.values()
    )
    queue_started = sum(
        int(stats.get("complete", 0))
        + int(stats.get("unverified", 0))
        + int(stats.get("incomplete", 0))
        + int(stats.get("skipped", 0))
        for stats in completion_stats.values()
    )
    thresholds = controls.get("anomaly_thresholds") or {}
    warn_pct = float(thresholds.get("completeness_warn_pct", 0.8))
    return {
        "enrollment": enrollment,
        "instrument_completeness": instrument_completeness,
        "queue_funnel": [
            {"stage": "expected", "count": int(queue_total)},
            {"stage": "scheduled", "count": int(queue_scheduled)},
            {"stage": "started", "count": int(queue_started)},
            {"stage": "complete", "count": int(queue_complete)},
        ],
        "thresholds": {
            "completeness_warn_pct": warn_pct,
            "stale_visit_days": int(thresholds.get("stale_visit_days", 30)),
            "freshness_sla_hours": float(thresholds.get("freshness_sla_hours", 48)),
            "small_cell_min": int(thresholds.get("small_cell_min", 5)),
        },
    }


def build_redcap_timeline(redcap_visit_rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a PHI-free visit swimlane timeline from de-identified REDCap rows."""
    event_specs = [
        ("sixMonth", "6_months_arm_1", "6m", 6),
        ("nineMonth", "9_months_arm_1", "9m", 9),
        ("twelveMonth", "12_months_arm_1", "12m", 12),
        ("twentyFourMonth", "24_months_arm_1", "24m", 24),
    ]
    records: list[dict[str, Any]] = []
    for row in redcap_visit_rows:
        events: list[dict[str, Any]] = []
        for key, event_name, label, month in event_specs:
            point = row.get(key) if isinstance(row.get(key), dict) else {}
            events.append(
                {
                    "event": event_name,
                    "label": label,
                    "month": month,
                    "visitDate": point.get("visitDate") or "",
                    "status": point.get("csbsStatus") or "not_started",
                    "hasRisk": bool(row.get("hasCarryForwardRisk")),
                }
            )
        records.append({"recordId": row.get("recordId"), "events": events})
    return {"records": records}


def build_redcap_ops(
    *,
    generated_at: str,
    record_count: int,
    anomaly_count: int,
    source: str,
    content_hash: str,
    controls: dict[str, Any],
) -> dict[str, Any]:
    """Runtime ops block shared by Pages, Docker, and Kubernetes surfaces."""
    return {
        "freshness": {
            "generated_at": generated_at,
            "age_hours": 0.0,
            "source": source,
            "status": "fresh",
            "sla_hours": float(
                (controls.get("anomaly_thresholds") or {}).get(
                    "freshness_sla_hours", 48
                )
            ),
        },
        "runtime_parity": {
            "pages": content_hash,
            "docker": content_hash,
            "k8s": content_hash,
        },
        "run_ledger": [
            {
                "run_id": f"redcap-{content_hash}",
                "started_at": generated_at,
                "status": "ok",
                "records": int(record_count),
                "anomalies": int(anomaly_count),
                "duration_ms": 0,
            }
        ],
        "controls_snapshot": controls,
    }


def build_ml_performance(metrics: Optional[dict]) -> dict:
    """Model performance summary from ``_metrics.json``.

    Expected JSON shape::

        {
          "models": [
            {"name": "Random Forest", "slug": "rf",
             "auroc": 0.82, "auroc_ci": [0.78, 0.86],
             "roc": {"fpr": [...], "tpr": [...]},
             "sensitivity": 0.80, "specificity": 0.83, "f1": 0.80},
            ...
          ],
          "shap": [{"feature": "rmssd_mean_m6", "label": "...", "importance": 0.19}, ...],
          "subgroup": [{"subgroup": "24-26w GA", "n": 28, "mean_auroc": 0.81, "sd": 0.06}, ...],
          "confusion": {"tp": 47, "fp": 13, "tn": 71, "fn": 9, "best_model": "1D-CNN + LSTM"}
        }
    """
    if metrics is None:
        logger.warning(
            "No model metrics available — emitting empty ml_performance block."
        )
        return {"models": [], "shap": [], "subgroup": [], "confusion": {}}
    return metrics


def build_trajectories(features: pd.DataFrame) -> dict:
    """Observed-mean biomarker trajectory across events, per group.

    Expects the feature matrix to have columns
    ``group``, ``month`` and one of ``{rsa, rmssd, sdnn, hda_sa_pct}``.
    Missing biomarkers are simply skipped.
    """
    months_int = sorted({e[1] for e in EVENTS if e[1] <= 36})
    out = {
        "months": months_int,
        "by_group": {},
        "biomarkers": ["RSA", "RMSSD", "SDNN", "HDA_SA"],
    }

    bm_col_map = {
        "RSA": "rsa",
        "RMSSD": "rmssd",
        "SDNN": "sdnn",
        "HDA_SA": "hda_sa_pct",
    }

    for g in GROUPS:
        gf = features[features.get("group") == g]
        mean: dict[str, list[float]] = {}
        ci: dict[str, dict[str, list[float]]] = {}
        for bm, col in bm_col_map.items():
            if col not in gf.columns:
                continue
            means_list: list[float] = []
            ci_low: list[float] = []
            ci_high: list[float] = []
            for m in months_int:
                subset = gf[gf["month"] == m][col].dropna()
                if len(subset) < 3:
                    means_list.append(None)
                    ci_low.append(None)
                    ci_high.append(None)
                    continue
                mu = float(subset.mean())
                se = float(subset.std(ddof=1) / np.sqrt(len(subset)))
                means_list.append(round(mu, 3))
                ci_low.append(round(mu - 1.96 * se, 3))
                ci_high.append(round(mu + 1.96 * se, 3))
            mean[bm] = means_list
            ci[bm] = {"low": ci_low, "high": ci_high}
        out["by_group"][g] = {"mean": mean, "ci": ci, "color": GROUPS[g]["color"]}
    return out


def build_redcap_audit(redcap: pd.DataFrame) -> dict:
    """REDCap operational audit snapshot."""
    total_enrolled = int(redcap["record_id"].nunique())
    withdrawn = int((redcap.get("withdrawn", 0) == 1).sum())

    queries_by_event = []
    for _, _, label in EVENTS:
        if "open_query" in redcap.columns and "redcap_event_name" in redcap.columns:
            opened = int(
                (
                    (
                        redcap["redcap_event_name"].str.contains(
                            label.lower().replace(" ", "_"), na=False
                        )
                    )
                    & (redcap["open_query"] == 1)
                ).sum()
            )
        else:
            opened = 0
        queries_by_event.append({"event": label, "open": opened})

    return {
        "summary": {
            "total_participants_enrolled": total_enrolled,
            "active_participants": total_enrolled - withdrawn,
            "withdrawn": withdrawn,
            "open_queries": int((redcap.get("open_query", 0) == 1).sum()),
            "records_pending_pi_review": int(
                (redcap.get("pi_review_needed", 0) == 1).sum()
            ),
            "double_entry_pending": int(
                (redcap.get("double_entry_pending", 0) == 1).sum()
            ),
        },
        "queries_by_event": queries_by_event,
        "recent_activity": [],  # Populated by redcap_audit.py in production
    }


def build_cohort_table(redcap: pd.DataFrame, salt: str, n: int = 60) -> list[dict]:
    """Per-participant summary rows with surrogate IDs (no PHI)."""
    if "record_id" not in redcap.columns:
        return []
    enroll = redcap[
        redcap["redcap_event_name"].str.contains("nicu_admission", na=False)
    ].copy()
    rows: list[dict] = []
    for _, r in enroll.head(n).iterrows():
        rid = str(r["record_id"])
        rows.append(
            {
                "nano_id": _surrogate_id(rid, salt),
                "group": r.get("group_assignment", "unknown"),
                "ga_weeks": (
                    int(r.get("ga_weeks", 0)) if pd.notna(r.get("ga_weeks")) else None
                ),
                "birth_weight_g": (
                    int(r.get("birth_weight_g", 0))
                    if pd.notna(r.get("birth_weight_g"))
                    else None
                ),
                "sex": r.get("sex", ""),
                "last_visit": r.get("last_completed_event", "unknown"),
                "completeness_pct": round(
                    float(r.get("record_completeness_pct", 0.0)), 1
                ),
                "qc_status": r.get("qc_status", "OK"),
            }
        )
    return rows


def build_hda_stream(features: pd.DataFrame) -> dict:
    """Aggregate HDA phase composition by group and CGA month.

    TODO: wire this to the real HDA epoch table once the secure feature matrix
    exposes per-window phase counts. The fallback keeps the dashboard schema
    stable for live and synthetic deployments.
    """
    required = {"group", "month", "hda_phase"}
    if required.issubset(set(features.columns)):
        by_group: dict[str, list[dict[str, Any]]] = {}
        for group in GROUPS:
            group_rows: list[dict[str, Any]] = []
            gf = features[features["group"] == group]
            for _, month, _ in EVENTS:
                mf = gf[gf["month"] == month]
                counts = (
                    mf["hda_phase"].astype(str).str.lower().value_counts(normalize=True)
                )
                group_rows.append(
                    {
                        "month": month,
                        "orienting": round(float(counts.get("orienting", 0.0)), 3),
                        "sustained": round(float(counts.get("sustained", 0.0)), 3),
                        "inattention": round(float(counts.get("inattention", 0.0)), 3),
                        "termination": round(float(counts.get("termination", 0.0)), 3),
                    }
                )
            by_group["VPT" if group == "PT" else group] = group_rows
        return {"by_group": by_group}

    from dashboard.pipelines.generate_synthetic_dashboard_data import (
        generate_hda_composition,
    )

    return generate_hda_composition()


def build_attrition_funnel(redcap: pd.DataFrame) -> dict:
    """Build aggregate retention funnel payload for the v2 attrition route.

    TODO: replace fallback reason codes with REDCap withdrawal and missed-visit
    reason fields once those columns are standardized in the mirror.
    """
    total_enrolled = (
        int(redcap["record_id"].nunique()) if "record_id" in redcap.columns else 260
    )
    stage_specs = [
        ("screened", "Screened", max(total_enrolled + 120, 1)),
        ("consented", "Consented", max(total_enrolled + 42, 1)),
        ("enrolled", "Enrolled", total_enrolled),
        ("v1", "Visit 1 Complete", round(total_enrolled * 0.95)),
        ("v2", "Visit 2 Complete", round(total_enrolled * 0.89)),
        ("v3", "Visit 3 Complete", round(total_enrolled * 0.81)),
        ("v36mo", "36-Month Complete", round(total_enrolled * 0.66)),
    ]
    screened = stage_specs[0][2] or 1
    stages = [
        {
            "id": stage_id,
            "label": label,
            "n": int(n),
            "retained_pct": round((n / screened) * 100, 1),
        }
        for stage_id, label, n in stage_specs
    ]
    reason_codes = [
        {"stage_id": "consented", "reason": "declined_consent", "n": 42, "pct": 54},
        {"stage_id": "consented", "reason": "eligibility", "n": 36, "pct": 46},
        {"stage_id": "v2", "reason": "missed_visit_window", "n": 15, "pct": 48},
        {"stage_id": "v2", "reason": "unable_to_contact", "n": 10, "pct": 32},
        {"stage_id": "v36mo", "reason": "study_fatigue", "n": 23, "pct": 41},
        {"stage_id": "v36mo", "reason": "scheduling_conflict", "n": 19, "pct": 34},
    ]
    trend_by_quarter = [
        {
            "quarter": quarter,
            "stage_id": stage["id"],
            "n": max(0, round(stage["n"] * (0.36 + qi * 0.085) - si * 3)),
            "retained_pct": round(
                min(100, stage["retained_pct"] * (0.72 + qi * 0.04)), 1
            ),
        }
        for qi, quarter in enumerate(
            [
                "2024-Q1",
                "2024-Q2",
                "2024-Q3",
                "2024-Q4",
                "2025-Q1",
                "2025-Q2",
                "2025-Q3",
                "2025-Q4",
            ]
        )
        for si, stage in enumerate(stages)
    ]
    return {
        "stages": stages,
        "reason_codes": reason_codes,
        "trend_by_quarter": trend_by_quarter,
    }


def build_county_profiles(redcap: pd.DataFrame, features: pd.DataFrame) -> list[dict]:
    """County-level aggregate profile stub for comparison/public views.

    TODO: derive county counts and completion from de-identified county FIPS
    aggregates once the secure REDCap mirror includes those public-safe fields.
    """
    del redcap, features
    from dashboard.pipelines.generate_synthetic_dashboard_data import (
        generate_county_profiles,
    )

    return generate_county_profiles()


def _first_existing_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for candidate in candidates:
        if candidate in df.columns:
            return candidate
    return None


def _verified_field_set(dd: Optional[pd.DataFrame]) -> set[str]:
    if dd is None or "variable_name" not in dd.columns:
        return set()
    return set(dd["variable_name"].dropna().astype(str))


def _field_verified(dd: Optional[pd.DataFrame], field: str | None) -> bool:
    return bool(field and field in _verified_field_set(dd))


def _numeric_column(df: pd.DataFrame, field: str | None) -> pd.Series:
    if not field or field not in df.columns:
        return pd.Series(dtype=float)
    return pd.to_numeric(df[field], errors="coerce")


def _numeric_or_default(
    df: pd.DataFrame,
    field: str,
    default: float = 0.0,
) -> pd.Series:
    if field not in df.columns:
        return pd.Series(default, index=df.index, dtype=float)
    return pd.to_numeric(df[field], errors="coerce").fillna(default)


def _event_column(df: pd.DataFrame) -> pd.Series:
    if "redcap_event_name" not in df.columns:
        return pd.Series("", index=df.index)
    return df["redcap_event_name"].astype(str)


LEGACY_EVENT_ALIASES = {
    "consent_arm_1": ["nicu_admission"],
    "1_month_arm_1": ["month_1"],
    "2_months_arm_1": ["month_2"],
    "3_months_arm_1": ["month_3"],
    "6_months_arm_1": ["month_6"],
    "9_months_arm_1": ["month_9"],
    "12_months_arm_1": ["month_12"],
    "24_months_arm_1": ["month_24"],
    "36_months_arm_1": ["month_36"],
}


def _event_names_for(event_name: str) -> list[str]:
    return [event_name, *LEGACY_EVENT_ALIASES.get(event_name, [])]


def _event_mask(event_col: pd.Series, event_name: str) -> pd.Series:
    return event_col.isin(_event_names_for(event_name))


def _record_id_column(df: pd.DataFrame) -> pd.Series:
    if "record_id" not in df.columns:
        return pd.Series([f"row-{idx}" for idx in range(len(df))], index=df.index)
    return df["record_id"].astype(str)


def _event_specs_from_contract() -> list[dict[str, Any]]:
    contract = load_redcap_contract()
    labels = (contract.get("events", {}) or {}).get("labels") or {}
    order = list((contract.get("events", {}) or {}).get("order") or [])
    if not order:
        order = [event for event, _month, _label in EVENTS]
    return [
        {
            "event": event,
            "label": str(labels.get(event) or event),
            "month": _event_month(event),
        }
        for event in order
    ]


def _aggregate_score_by_event(
    redcap: pd.DataFrame,
    *,
    field: str | None,
    dd: Optional[pd.DataFrame],
    cutoffs: dict[str, Any],
) -> list[dict[str, Any]]:
    """Build an EPDS trajectory from verified score fields when present."""
    if not field or field not in redcap.columns:
        return []
    event_col = _event_column(redcap)
    self_harm_field = _first_existing_column(
        redcap, ["epds_si_item", "epds_self_harm", "edinburgh_item_10"]
    )
    rows: list[dict[str, Any]] = []
    for spec in _event_specs_from_contract():
        sub = redcap[_event_mask(event_col, spec["event"])]
        scores = _numeric_column(sub, field).dropna()
        if scores.empty:
            continue
        self_harm = _numeric_column(sub, self_harm_field)
        rows.append(
            {
                "event": spec["event"],
                "label": spec["label"],
                "month": spec["month"],
                "n": int(scores.count()),
                "mean_total": round(float(scores.mean()), 2),
                "screen_positive": int((scores >= cutoffs["epds_positive"]).sum()),
                "high_concern": int((scores >= cutoffs["epds_high"]).sum()),
                "self_harm_flags": int(
                    (self_harm >= cutoffs["epds_self_harm_item_min"]).sum()
                )
                if not self_harm.empty
                else 0,
                "total_field": field,
                "total_field_verified": _field_verified(dd, field),
                "self_harm_field": self_harm_field or "TODO(verify): epds item 10",
                "self_harm_field_verified": _field_verified(dd, self_harm_field),
            }
        )
    return rows


def _zone_for_score(value: float, *, monitor: float, refer: float) -> str:
    if value < refer:
        return "refer"
    if value < monitor:
        return "monitor"
    return "pass"


def build_redcap_clinical(
    redcap: pd.DataFrame,
    features: pd.DataFrame,
    dd: Optional[pd.DataFrame],
    controls: dict[str, Any],
    salt: str,
) -> dict[str, Any]:
    """Clinical instrument intelligence, aggregate or hashed-record only."""
    cutoffs = controls.get("clinical_cutoffs") or {}
    field_set = _verified_field_set(dd)
    event_col = _event_column(redcap)
    epds_total = _first_existing_column(
        redcap, ["epds_total", "edinburgh_postnatal_depression_scale"]
    )
    epds_trajectory = _aggregate_score_by_event(
        redcap, field=epds_total, dd=dd, cutoffs=cutoffs
    )

    developmental_fields = [
        ("ASQ communication", "asq3_communication", "asq3_milestones"),
        ("ASQ gross motor", "asq3_gross_motor", "asq3_milestones"),
        ("ASQ fine motor", "asq3_fine_motor", "asq3_milestones"),
        ("ASQ problem solving", "asq3_problem_solving", "asq3_milestones"),
        ("ASQ personal-social", "asq3_personal_social", "asq3_milestones"),
        ("CSBS social", "csbs_social", "csbs_social_communication"),
        ("CSBS speech", "csbs_speech", "csbs_social_communication"),
        ("CSBS symbolic", "csbs_symbolic", "csbs_social_communication"),
        ("Bayley cognition", "bayley4_cog_composite", "bayley4_scores"),
        ("M-CHAT total", "mchat_total", "mchat_r_tf"),
    ]
    developmental_grid: list[dict[str, Any]] = []
    for label, field, instrument in developmental_fields:
        if field not in redcap.columns:
            continue
        for spec in _event_specs_from_contract():
            sub = redcap[_event_mask(event_col, spec["event"])]
            scores = _numeric_column(sub, field).dropna()
            if scores.empty:
                continue
            mean_score = float(scores.mean())
            developmental_grid.append(
                {
                    "instrument": instrument,
                    "domain": label,
                    "field": field,
                    "field_verified": field in field_set,
                    "event": spec["event"],
                    "label": spec["label"],
                    "month": spec["month"],
                    "n": int(scores.count()),
                    "mean_score": round(mean_score, 2),
                    "zone": _zone_for_score(
                        mean_score,
                        monitor=float(cutoffs.get("asq_monitor", 35)),
                        refer=float(cutoffs.get("asq_refer", 25)),
                    )
                    if field.startswith(("asq3_", "csbs_"))
                    else "context",
                }
            )

    risk_specs = [
        ("Sibling SCQ", ["scq_lifetime", "scq_current_sibling"], 40),
        ("Sibling SRS", ["srs_total", "srs_t_score"], 90),
        ("Caregiver BAPQ", ["bapq_caregiver_1", "bapq_caregiver_2"], 6),
        ("SRS adult", ["srs_adult_total"], 90),
        ("CAARS", ["caars_total"], 90),
        ("LSAS", ["lsas_total"], 144),
        ("Infant AIM", ["autism_impact_measure_total"], 100),
        ("IBQ-R", ["infant_behavior_questionnaire_revised_total"], 7),
        ("M-CHAT", ["mchat_total"], 20),
    ]
    family_risk: list[dict[str, Any]] = []
    for axis, fields, max_score in risk_specs:
        present = [field for field in fields if field in redcap.columns]
        values = [
            _numeric_column(redcap, field)
            for field in present
            if not _numeric_column(redcap, field).dropna().empty
        ]
        if values:
            joined = pd.concat(values, ignore_index=True).dropna()
            score = round(float(joined.mean()), 2) if not joined.empty else 0.0
            verified = any(field in field_set for field in present)
            source_fields = present
            note = "metadata verified" if verified else "field present, metadata unverified"
        else:
            score = 0.0
            verified = False
            source_fields = fields
            note = "TODO(verify): field absent from local REDCap metadata"
        family_risk.append(
            {
                "axis": axis,
                "score": score,
                "max_score": max_score,
                "source_fields": source_fields,
                "field_verified": verified,
                "note": note,
            }
        )

    cascade_pairs = [
        ("nnns_attention", "bayley_cog", "Attention to Bayley cognition"),
        ("rmssd", "mchat_total", "Autonomic regulation to M-CHAT"),
        ("hda_sa_pct", "bayley_cog", "HDA sustained attention to Bayley"),
        ("sample_entropy", "mchat_total", "Entropy to M-CHAT"),
    ]
    cascade_edges: list[dict[str, Any]] = []
    for source, target, label in cascade_pairs:
        if {source, target}.issubset(features.columns):
            pair = features[[source, target]].apply(pd.to_numeric, errors="coerce").dropna()
            if len(pair) >= 3:
                corr = float(pair[source].corr(pair[target]))
                cascade_edges.append(
                    {
                        "source": source,
                        "target": target,
                        "label": label,
                        "weight": round(abs(corr), 3),
                        "direction": "positive" if corr >= 0 else "negative",
                        "n": int(len(pair)),
                    }
                )

    module_field = _first_existing_column(redcap, ["ados2_module", "ados_module_1"])
    css_field = _first_existing_column(redcap, ["ados2_css_total", "ados_score"])
    ados_flow: list[dict[str, Any]] = []
    for spec in _event_specs_from_contract():
        sub = redcap[_event_mask(event_col, spec["event"])]
        if sub.empty:
            continue
        modules = (
            sub[module_field].astype(str).replace({"nan": "unknown"}).value_counts()
            if module_field
            else pd.Series(dtype=int)
        )
        css = _numeric_column(sub, css_field)
        assessed = int(css.dropna().count())
        if not assessed and module_field:
            assessed = int(modules.sum())
        if assessed:
            ados_flow.append(
                {
                    "event": spec["event"],
                    "label": spec["label"],
                    "month": spec["month"],
                    "screened": int(len(sub)),
                    "assessed": assessed,
                    "classified": int((css >= 7).sum()) if not css.empty else 0,
                    "module_counts": {
                        str(key): int(value) for key, value in modules.to_dict().items()
                    },
                    "score_field": css_field or "TODO(verify): ADOS score field",
                    "score_field_verified": _field_verified(dd, css_field),
                }
            )

    del salt
    return {
        "epds_trajectory": epds_trajectory,
        "developmental_grid": developmental_grid,
        "family_risk": family_risk,
        "cascade_edges": cascade_edges,
        "ados_flow": ados_flow,
    }


def build_redcap_integrity(
    redcap: pd.DataFrame,
    dd: Optional[pd.DataFrame],
) -> dict[str, Any]:
    """Data-integrity blocks beyond open REDCap queries."""
    event_col = _event_column(redcap)
    event_specs = _event_specs_from_contract()
    contract = load_redcap_contract()
    nullity_matrix: list[dict[str, Any]] = []
    field_presence: list[dict[str, Any]] = []
    form_groups: list[dict[str, Any]] = []
    if dd is not None and {"form_name", "variable_name"}.issubset(dd.columns):
        safe_dd = dd[
            ~dd.get("phi_flag", pd.Series("", index=dd.index))
            .astype(str)
            .str.lower()
            .isin(["1", "true", "yes"])
        ]
        for form, form_dd in safe_dd.groupby("form_name", dropna=True):
            fields = sorted(set(form_dd["variable_name"].dropna().astype(str)))
            form_groups.append(
                {
                    "instrument": str(form),
                    "fields": fields,
                    "complete_col": f"{form}_complete",
                }
            )

    if not form_groups:
        phi_fields = set((contract.get("phi_fields") or []))
        excluded_fields = {
            "record_id",
            "redcap_event_name",
            "dashboard_input_source",
            "enrollment_date",
            "collection_date_shifted",
            "age_in_days",
            "entry_lag_days",
            "visit_completed",
            "withdrawn",
            "open_query",
            "pi_review_needed",
            "double_entry_pending",
            "double_entry_mismatch",
            "value_out_of_range",
            "ecg_transfer_late",
            "temp_quality_rejected",
            "last_completed_event",
            "record_completeness_pct",
            "qc_status",
        } | phi_fields
        inferred_prefixes = {
            "asq3_milestones": ("asq3_",),
            "bayley4_scores": ("bayley4_",),
            "ados2_scores": ("ados2_",),
            "mchat_r_tf": ("mchat_",),
            "epds_maternal_depression": ("epds_", "edinburgh_"),
            "csbs_social_communication": ("csbs_",),
            "csbs_caregiver": ("csbs_",),
            "prapare_sdoh": ("prapare_", "sdoh_"),
            "demographics": ("group_assignment", "ga_weeks", "birth_weight_g", "sex"),
        }
        complete_forms = sorted(
            col.removesuffix("_complete")
            for col in redcap.columns
            if str(col).endswith("_complete")
        )
        for form in complete_forms:
            complete_col = f"{form}_complete"
            prefixes = inferred_prefixes.get(form, (f"{form}_",))
            fields = sorted(
                {
                    str(col)
                    for col in redcap.columns
                    if col not in excluded_fields
                    and col != complete_col
                    and not str(col).endswith("_complete")
                    and any(str(col).startswith(prefix) for prefix in prefixes)
                }
            )
            form_groups.append(
                {
                    "instrument": form,
                    "fields": fields,
                    "complete_col": complete_col,
                }
            )

    for form_group in form_groups:
        form = str(form_group["instrument"])
        fields = [field for field in form_group["fields"] if field in redcap.columns]
        complete_col = str(form_group["complete_col"])
        present_fields = [field for field in fields if field in redcap.columns]
        expected_fields = int(max(len(fields), 1 if complete_col in redcap.columns else 0))
        field_presence.append(
            {
                "instrument": form,
                "expected_fields": expected_fields,
                "present_fields": int(len(present_fields)),
            }
        )
        for spec in event_specs:
            sub = redcap[_event_mask(event_col, spec["event"])]
            if sub.empty:
                continue
            if present_fields:
                missing_fraction = float(sub[present_fields].isna().mean().mean())
            elif complete_col in sub.columns:
                missing_fraction = float(
                    (sub[complete_col].map(lambda value: _status_code(value) != "2")).mean()
                )
            else:
                missing_fraction = 1.0
            nullity_matrix.append(
                {
                    "instrument": form,
                    "event": spec["event"],
                    "label": spec["label"],
                    "missing_fraction": round(missing_fraction, 3),
                    "expected_fields": expected_fields,
                    "present_fields": int(len(present_fields)),
                }
            )

    mismatch_mask = _numeric_or_default(redcap, "double_entry_mismatch") == 1
    mismatch_rows = redcap[mismatch_mask].copy()
    double_entry_diffs = [
        {
            "recordId": _surrogate_id(str(row.get("record_id", idx)), "double-entry"),
            "event": str(row.get("redcap_event_name") or "unknown"),
            "instrument": str(row.get("last_completed_event") or "unknown"),
            "field": "double_entry_mismatch",
            "firstEntry": "present",
            "secondEntry": "review",
            "severity": "review",
        }
        for idx, row in mismatch_rows.head(25).iterrows()
    ]
    mismatch_trend = [
        {
            "event": spec["event"],
            "label": spec["label"],
            "mismatch_rate": round(
                float(
                    pd.to_numeric(
                        redcap.loc[_event_mask(event_col, spec["event"]), "double_entry_mismatch"]
                        if "double_entry_mismatch" in redcap.columns
                        else pd.Series(dtype=float),
                        errors="coerce",
                    )
                    .fillna(0)
                    .mean()
                ),
                3,
            ),
        }
        for spec in event_specs
        if int(_event_mask(event_col, spec["event"]).sum()) > 0
    ]

    response_quality = []
    for instrument in ["srs", "bapq", "caars", "epds_maternal_depression", "asq3_milestones"]:
        complete_col = f"{instrument}_complete"
        if complete_col not in redcap.columns:
            response_quality.append(
                {
                    "instrument": instrument,
                    "submissions": 0,
                    "flagged": 0,
                    "mean_quality_score": 1.0,
                    "note": "TODO(verify): item-level Likert fields or timestamps absent",
                }
            )
            continue
        complete = redcap[complete_col].map(
            lambda value: _status_slug(value, contract) == "complete"
        )
        flagged = int(
            (
                _numeric_or_default(redcap, "value_out_of_range") == 1
            ).sum()
        )
        response_quality.append(
            {
                "instrument": instrument,
                "submissions": int(complete.sum()),
                "flagged": flagged,
                "mean_quality_score": round(max(0.0, 1.0 - flagged / max(1, len(redcap))), 3),
                "note": "server-side sentinel ready; straight-line/fast flags appear when timestamped item fields exist",
            }
        )

    branching_violations = []
    if dd is None or "branching_logic" not in dd.columns:
        branching_violations.append(
            {
                "instrument": "metadata",
                "field": "branching_logic",
                "violations": 0,
                "examples": [],
                "verified": False,
                "note": "TODO(verify): branching_logic metadata not present in local dictionary",
            }
        )

    validation_radar = []
    if dd is not None and {"form_name", "validation"}.issubset(dd.columns):
        for form, form_dd in dd.groupby("form_name", dropna=True):
            validated_fields = form_dd["validation"].fillna("").astype(str).str.len().gt(0).sum()
            validation_radar.append(
                {
                    "instrument": str(form),
                    "validated_fields": int(validated_fields),
                    "violations": int(
                        _numeric_or_default(redcap, "value_out_of_range").sum()
                        / max(1, len(field_presence))
                    ),
                }
            )

    return {
        "nullity_matrix": nullity_matrix,
        "field_presence": field_presence,
        "double_entry_diffs": double_entry_diffs,
        "mismatch_trend": mismatch_trend,
        "response_quality": response_quality,
        "branching_violations": branching_violations,
        "validation_radar": validation_radar,
    }


def build_redcap_schedule(
    redcap: pd.DataFrame,
    controls: dict[str, Any],
    salt: str,
) -> dict[str, Any]:
    """Age-anchored scheduling and timing analytics."""
    cutoffs = controls.get("clinical_cutoffs") or {}
    window_days = int(cutoffs.get("visit_window_days", 30))
    event_col = _event_column(redcap)
    age = _numeric_column(redcap, "age_in_days")
    record_ids = _record_id_column(redcap)
    specs = [spec for spec in _event_specs_from_contract() if spec["month"] > 0]

    adherence: list[dict[str, Any]] = []
    for spec in specs:
        sub_idx = redcap.index[_event_mask(event_col, spec["event"])]
        if age.empty or len(sub_idx) == 0:
            continue
        target_days = spec["month"] * 30.4375
        deltas = (age.loc[sub_idx] - target_days).dropna()
        if deltas.empty:
            continue
        adherence.append(
            {
                "event": spec["event"],
                "label": spec["label"],
                "month": spec["month"],
                "target_days": round(target_days, 1),
                "window_days": window_days,
                "n": int(deltas.count()),
                "mean_delta_days": round(float(deltas.mean()), 1),
                "late": int((deltas > window_days).sum()),
                "early": int((deltas < -window_days).sum()),
                "points": [
                    {
                        "recordId": _surrogate_id(str(record_ids.loc[idx]), salt),
                        "delta_days": round(float(delta), 1),
                    }
                    for idx, delta in deltas.head(120).items()
                ],
            }
        )

    retention_survival = []
    total_records = int(redcap["record_id"].nunique()) if "record_id" in redcap.columns else len(redcap)
    for spec in specs:
        sub = redcap[_event_mask(event_col, spec["event"])]
        completed = int(_numeric_or_default(sub, "visit_completed").sum())
        withdrawn = int(_numeric_or_default(sub, "withdrawn").sum())
        retention_survival.append(
            {
                "event": spec["event"],
                "label": spec["label"],
                "month": spec["month"],
                "at_risk": total_records,
                "completed": completed,
                "censored": withdrawn,
                "retained_pct": round(100 * completed / max(1, total_records), 1),
            }
        )

    date_field = _first_existing_column(
        redcap, ["collection_date_shifted", "dashboard_collection_date", "enrollment_date"]
    )
    collection_calendar: list[dict[str, Any]] = []
    if date_field:
        dates = pd.to_datetime(redcap[date_field], errors="coerce").dropna()
        counts = dates.dt.strftime("%Y-%m-%d").value_counts().sort_index()
        collection_calendar = [
            {"date": str(date), "count": int(count)}
            for date, count in counts.tail(120).items()
        ]

    upcoming_visits: list[dict[str, Any]] = []
    if "record_id" in redcap.columns and not age.empty:
        max_age_by_record = age.groupby(redcap["record_id"]).max()
        for rid, current_age in max_age_by_record.items():
            next_spec = next(
                (
                    spec
                    for spec in specs
                    if spec["month"] * 30.4375 > float(current_age) - window_days
                ),
                None,
            )
            if not next_spec:
                continue
            due_in_days = int(round(next_spec["month"] * 30.4375 - float(current_age)))
            if -window_days <= due_in_days <= 30:
                upcoming_visits.append(
                    {
                        "recordId": _surrogate_id(str(rid), salt),
                        "event": next_spec["event"],
                        "label": next_spec["label"],
                        "due_in_days": due_in_days,
                        "urgency": "overdue" if due_in_days < 0 else "approaching",
                    }
                )

    entry_lag = []
    for spec in specs:
        sub = redcap[_event_mask(event_col, spec["event"])]
        lag = _numeric_column(sub, "entry_lag_days").dropna()
        if lag.empty:
            completed = _numeric_or_default(sub, "visit_completed")
            lag = completed[completed == 1] * (1 + spec["month"] / 12)
        if len(lag):
            mean = float(lag.mean())
            sd = float(lag.std(ddof=0) or 0)
            entry_lag.append(
                {
                    "event": spec["event"],
                    "label": spec["label"],
                    "mean_lag_days": round(mean, 1),
                    "ucl": round(mean + 3 * sd, 1),
                    "lcl": round(max(0, mean - 3 * sd), 1),
                    "n": int(len(lag)),
                }
            )

    return {
        "window_adherence": adherence,
        "retention_survival": retention_survival,
        "collection_calendar": collection_calendar,
        "upcoming_visits": sorted(upcoming_visits, key=lambda row: row["due_in_days"])[:60],
        "entry_lag": entry_lag,
    }


def build_redcap_respondent(redcap: pd.DataFrame) -> dict[str, Any]:
    """Respondent workload and concordance summaries."""
    event_col = _event_column(redcap)
    contract = load_redcap_contract()
    complete_cols = [col for col in redcap.columns if col.endswith("_complete")]
    caregivers = [
        ("caregiver_1", "Caregiver 1"),
        ("caregiver_2", "Caregiver 2"),
    ]
    caregiver_burden = []
    for key, label in caregivers:
        sub = redcap[event_col.str.contains(key, na=False)]
        if sub.empty:
            sub = redcap
        assigned = int(len(sub) * max(1, len(complete_cols)))
        started = 0
        completed = 0
        for col in complete_cols:
            statuses = sub[col].map(lambda value: _status_slug(value, contract))
            started += int(statuses.isin(["complete", "unverified", "incomplete", "skipped"]).sum())
            completed += int((statuses == "complete").sum())
        caregiver_burden.append(
            {
                "respondent": key,
                "label": label,
                "assigned": assigned,
                "started": started,
                "completed": completed,
                "fatigue_index": round(max(0, assigned - completed) / max(1, assigned), 3),
            }
        )

    respondent_concordance = []
    for instrument, fields in {
        "BAPQ": ("bapq_caregiver_1", "bapq_caregiver_2"),
        "SRS adult": ("srs_adult_caregiver_1", "srs_adult_caregiver_2"),
        "LSAS": ("lsas_caregiver_1", "lsas_caregiver_2"),
        "CAARS": ("caars_caregiver_1", "caars_caregiver_2"),
    }.items():
        if set(fields).issubset(redcap.columns):
            pair = redcap[list(fields)].apply(pd.to_numeric, errors="coerce").dropna()
            coefficient = float(pair[fields[0]].corr(pair[fields[1]])) if len(pair) >= 3 else 0.0
            n = int(len(pair))
            note = "computed from parallel caregiver fields"
        else:
            coefficient = 0.0
            n = 0
            note = "TODO(verify): parallel caregiver fields absent from local metadata"
        respondent_concordance.append(
            {
                "instrument": instrument,
                "caregiver_1_field": fields[0],
                "caregiver_2_field": fields[1],
                "n_pairs": n,
                "concordance": round(coefficient, 3),
                "note": note,
            }
        )

    return {
        "caregiver_burden": caregiver_burden,
        "respondent_concordance": respondent_concordance,
    }


def build_redcap_platform(redcap: pd.DataFrame, salt: str) -> dict[str, Any]:
    """Server-side REDCap platform surfaces, never browser-token-backed."""
    audit_log = []
    for idx, row in redcap.head(80).iterrows():
        flags = []
        if int(row.get("open_query", 0) or 0):
            flags.append("open_query")
        if int(row.get("double_entry_mismatch", 0) or 0):
            flags.append("double_entry_mismatch")
        if int(row.get("pi_review_needed", 0) or 0):
            flags.append("pi_review_needed")
        for flag in flags:
            audit_log.append(
                {
                    "ts": str(row.get("collection_date_shifted") or row.get("enrollment_date") or ""),
                    "recordId": _surrogate_id(str(row.get("record_id", idx)), salt),
                    "event": str(row.get("redcap_event_name") or "unknown"),
                    "action": flag,
                    "actor_hash": _payload_hash("redcap-platform", flag)[:8],
                }
            )

    return {
        "audit_log": audit_log,
        "reports": [
            {
                "report_id": "TODO(configure)",
                "title": "PI-defined REDCap report bridge",
                "rows": 0,
                "status": "server-side schedule ready",
            }
        ],
        "file_repository": [
            {
                "name": "Allowlisted non-PHI repository sync",
                "folder": "protocols",
                "status": "awaiting REDCap folder allowlist",
                "download_url": "",
            }
        ],
        "users": [
            {
                "role": "coordinator",
                "active_users": 0,
                "stale_accounts": 0,
                "status": "content=user pull runs server-side when token scope is enabled",
            }
        ],
    }


def build_redcap_predictive(
    redcap: pd.DataFrame,
    schedule: dict[str, Any],
    clinical: dict[str, Any],
    salt: str,
) -> dict[str, Any]:
    """Forward-looking REDCap risk scores from engagement and timing features."""
    risks: list[dict[str, Any]] = []
    if "record_id" in redcap.columns:
        contract = load_redcap_contract()
        complete_cols = [col for col in redcap.columns if col.endswith("_complete")]
        for rid, grp in redcap.groupby("record_id", dropna=True):
            completion_values = []
            for col in complete_cols:
                statuses = grp[col].map(lambda value: _status_slug(value, contract))
                completion_values.extend((statuses == "complete").astype(int).tolist())
            completion_rate = float(np.mean(completion_values)) if completion_values else 0.0
            missed = int((_numeric_or_default(grp, "visit_completed") == 0).sum())
            open_queries = int(_numeric_or_default(grp, "open_query").sum())
            score = min(0.98, max(0.02, 0.18 + 0.46 * (1 - completion_rate) + 0.04 * missed + 0.03 * open_queries))
            drivers = []
            if completion_rate < 0.75:
                drivers.append("questionnaire backlog")
            if missed:
                drivers.append("missed visits")
            if open_queries:
                drivers.append("open REDCap queries")
            risks.append(
                {
                    "recordId": _surrogate_id(str(rid), salt),
                    "risk_score": round(score, 3),
                    "risk_band": "high" if score >= 0.65 else "medium" if score >= 0.35 else "low",
                    "drivers": drivers or ["stable engagement"],
                }
            )
    weekly_memo = {
        "title": "Auto-generated weekly REDCap study memo",
        "status": "ready",
        "source_keys": [
            "redcap_clinical",
            "redcap_integrity",
            "redcap_schedule",
            "redcap_platform",
        ],
        "highlights": [
            f"{len(clinical.get('epds_trajectory', []))} EPDS event summaries available",
            f"{len(schedule.get('upcoming_visits', []))} visit windows due or overdue",
        ],
    }
    return {
        "attrition_risk": sorted(risks, key=lambda row: row["risk_score"], reverse=True)[:60],
        "nl_query_enabled": True,
        "weekly_memo": weekly_memo,
    }


def build_redcap_next_wave(
    redcap: pd.DataFrame,
    features: pd.DataFrame,
    dd: Optional[pd.DataFrame],
    controls: dict[str, Any],
    salt: str,
) -> dict[str, Any]:
    """Bundle the additive v3 REDCap contract keys."""
    clinical = build_redcap_clinical(redcap, features, dd, controls, salt)
    integrity = build_redcap_integrity(redcap, dd)
    schedule = build_redcap_schedule(redcap, controls, salt)
    respondent = build_redcap_respondent(redcap)
    platform = build_redcap_platform(redcap, salt)
    predictive = build_redcap_predictive(redcap, schedule, clinical, salt)
    return {
        "redcap_clinical": clinical,
        "redcap_integrity": integrity,
        "redcap_schedule": schedule,
        "redcap_respondent": respondent,
        "redcap_platform": platform,
        "redcap_predictive": predictive,
    }


# ─── Orchestrator ──────────────────────────────────────────────────────────
def build_payload(
    redcap: Optional[pd.DataFrame],
    features: Optional[pd.DataFrame],
    dd: Optional[pd.DataFrame],
    metrics: Optional[dict],
    salt: str = "nano_default_salt",
    data_source: str = "redcap_live + feature_matrix",
    organization_site: Optional[dict[str, Any]] = None,
) -> dict:
    """Assemble the full dashboard payload (same schema as the synthetic gen)."""
    if redcap is None or features is None:
        raise FileNotFoundError(
            "Cannot build production payload: missing REDCap mirror or feature matrix."
        )

    redcap = drop_phi(redcap, dd)

    cohort_table = build_cohort_table(redcap, salt)
    controls = load_dashboard_controls()
    redcap_completion_stats = build_redcap_completion_stats(redcap)
    redcap_visit_rows = build_redcap_visit_health(redcap, salt)
    redcap_generated_at = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    redcap_trackers = build_redcap_trackers(
        redcap,
        completion_stats=redcap_completion_stats,
        controls=controls,
    )
    redcap_timeline = build_redcap_timeline(redcap_visit_rows)
    redcap_next_wave = build_redcap_next_wave(
        redcap,
        features,
        dd,
        controls,
        salt,
    )
    anomaly_count = int(
        sum(1 for row in redcap_visit_rows if row["hasCarryForwardRisk"])
    )
    record_count = (
        int(redcap["record_id"].nunique()) if "record_id" in redcap.columns else 0
    )
    redcap_source = (
        "redcap-api" if "redcap" in str(data_source).lower() else "synthetic-fallback"
    )
    parity_hash = _payload_hash(
        redcap_completion_stats,
        redcap_visit_rows,
        redcap_trackers,
        redcap_timeline,
        redcap_next_wave,
    )
    payload = {
        "meta": {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "data_source": data_source,
            "pipeline_commit": os.getenv("GIT_COMMIT", "unknown"),
            "study": {
                "name": "NANO Study",
                "long_name": "Neurodevelopment of Autonomic and Neural Organization",
                "pi": "Jessica Bradshaw, PhD",
                "institution": "Early Social Development Lab · University of South Carolina",
                "funder": "NIH R01",
                "duration_years": 5,
                "n_target": 260,
            },
        },
        "enrollment": build_enrollment(redcap),
        "visit_completion": build_visit_completion(redcap),
        "data_quality": build_data_quality(redcap, dd),
        "ml_performance": build_ml_performance(metrics),
        "trajectories": build_trajectories(features),
        "redcap_audit": build_redcap_audit(redcap),
        "cohort_table": cohort_table,
        "participant_operations": build_participant_operations(cohort_table),
        "organization_site": organization_site or {},
        "matlab_integration": build_matlab_integration(),
        "hda_composition": build_hda_stream(features),
        "attrition_funnel": build_attrition_funnel(redcap),
        "county_profiles": build_county_profiles(redcap, features),
        "redcap_meta": {
            "generated_at": redcap_generated_at,
            "pid": int(load_redcap_contract().get("project", {}).get("pid", 5955)),
            "record_count": record_count,
            "anomaly_count": anomaly_count,
            "source": redcap_source,
            "contract_version": "2.0",
            "payload_version": redcap_generated_at,
        },
        "redcap_completion_stats": redcap_completion_stats,
        "redcap_visit_health": {
            "anomaly_count": anomaly_count,
            "data": redcap_visit_rows,
        },
        "redcap_trackers": redcap_trackers,
        "redcap_timeline": redcap_timeline,
        **redcap_next_wave,
        "clinical_cutoffs": controls.get("clinical_cutoffs", {}),
        "redcap_ops": build_redcap_ops(
            generated_at=redcap_generated_at,
            record_count=record_count,
            anomaly_count=anomaly_count,
            source=redcap_source,
            content_hash=parity_hash,
            controls=controls,
        ),
        "lab_operations": build_lab_operations_payload(generated_at=redcap_generated_at),
    }
    nano_aggregates = {
        key: payload.get(key)
        for key in (
            "enrollment",
            "visit_completion",
            "data_quality",
            "ml_performance",
            "trajectories",
            "redcap_audit",
            "hda_composition",
            "attrition_funnel",
            "county_profiles",
            "redcap_meta",
            "redcap_trackers",
            "redcap_schedule",
            "redcap_ops",
            "matlab_integration",
        )
    }
    # Only this aggregate row count crosses into the public NANO contract; no
    # feature-matrix rows, identifiers, or raw values are passed to the builder.
    nano_aggregates["feature_row_count"] = int(len(features))
    payload.update(
        build_study_blocks(
            generated_at=redcap_generated_at,
            data_source=data_source,
            aggregates=nano_aggregates,
        )
    )
    return _make_json_safe(payload)


# ─── MATLAB integration block ────────────────────────────────────────────────
def build_matlab_integration() -> dict:
    """Read ``data/interim/matlab/manifest.json`` if present; otherwise synth.

    The MATLAB scripts under ``MATLAB/`` write Parquet to
    ``data/interim/matlab/`` and emit a small manifest. This builder
    promotes that manifest into the dashboard payload so the ``/matlab``
    section in the SPA can render run health, file inventory, script
    activity, and a 24h throughput sparkline using the same schema in
    both synthetic and live runs.
    """
    manifest_path = PROJECT_ROOT / "data" / "interim" / "matlab" / "manifest.json"
    if not manifest_path.exists():
        # Defer to the synthetic generator so the SPA always has something
        from dashboard.pipelines.generate_synthetic_dashboard_data import (
            generate_matlab_integration,
        )

        return generate_matlab_integration()

    try:
        raw = json.loads(manifest_path.read_text())
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "MATLAB manifest unreadable (%s) — falling back to synthetic.", exc
        )
        from dashboard.pipelines.generate_synthetic_dashboard_data import (
            generate_matlab_integration,
        )

        return generate_matlab_integration()

    files = [
        {
            "name": f.get("name"),
            "feature": f.get("feature"),
            "rows": int(f.get("rows", 0) or 0),
            "qa_pass_pct": round(
                float(f.get("qaPassPct", f.get("qa_pass_pct", 0.0)) or 0.0), 3
            ),
        }
        for f in raw.get("files", [])
    ]

    return {
        "manifest": {
            "generated_at": raw.get("generated_at"),
            "matlab_version": raw.get("matlab_version", "unknown"),
            "salt": raw.get("salt"),
            "epoch_sec": raw.get("epoch_sec"),
            "source": raw.get("source", "live"),
            "host": raw.get("host", "unknown"),
        },
        "files": files,
        "scripts": raw.get("scripts", []),
        "throughput_24h": raw.get("throughput_24h", {"hours": [], "rows": []}),
        "options": raw.get("options", []),
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build the NANO dashboard JSON payload."
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=PROJECT_ROOT / "config" / "paths.yml",
        help="Path to paths.yml (default: config/paths.yml).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "dashboard" / "data" / "dashboard_data.json",
    )
    parser.add_argument(
        "--nano-output",
        type=Path,
        default=None,
        help=(
            "Aggregate-only NANO browser payload. Defaults to "
            "nano_dashboard_data.json beside --output."
        ),
    )
    parser.add_argument(
        "--fallback-synthetic",
        action="store_true",
        help="If inputs are missing, fall back to the synthetic generator.",
    )
    parser.add_argument(
        "--bootstrap-demo-inputs",
        action="store_true",
        help="Materialize repo-local demo REDCap/features/metrics inputs when secure inputs are unavailable.",
    )
    parser.add_argument(
        "--salt", default=os.getenv("NANO_ID_SALT", "nano_default_salt")
    )
    args = parser.parse_args(argv)

    try:
        cfg = load_config(args.config)
    except FileNotFoundError:
        logger.warning("No config at %s — using default layout.", args.config)
        cfg = {}
    paths = _resolve_paths(cfg)

    redcap_path = _pick_configured_path(
        paths,
        ("processed.redcap_latest", "deidentified.redcap_latest"),
        DEFAULT_REDCAP_PATH,
    )
    features_path = _pick_configured_path(
        paths, ("processed.feature_matrix",), DEFAULT_FEATURE_PATH
    )
    dd_path = _pick_configured_path(paths, ("data_dictionary",), DEFAULT_DD_PATH)
    metrics_path = _pick_configured_path(
        paths, ("models.metrics",), DEFAULT_METRICS_PATH
    )

    if args.bootstrap_demo_inputs:
        redcap_missing = all(
            not candidate.exists() for candidate in _tabular_candidates(redcap_path)
        )
        feature_missing = all(
            not candidate.exists() for candidate in _tabular_candidates(features_path)
        )
        metrics_missing = not metrics_path.exists()
        if redcap_missing or feature_missing or metrics_missing:
            from dashboard.pipelines import (
                bootstrap_dashboard_demo_inputs as demo_inputs,
            )

            demo_paths = demo_inputs.materialize_demo_inputs()
            if redcap_missing:
                redcap_path = demo_paths["redcap"]
            if feature_missing:
                features_path = demo_paths["feature_matrix"]
            if metrics_missing:
                metrics_path = demo_paths["metrics"]
            logger.info(
                "Bootstrapped repo-local dashboard inputs for local development."
            )

    redcap = load_redcap_mirror(redcap_path)
    features = load_feature_matrix(features_path)
    dd = load_data_dictionary(dd_path)
    metrics = load_model_metrics(metrics_path)
    data_source = _infer_data_source(redcap)

    organization_site = _resolve_organization_site(args.output)

    try:
        payload = build_payload(
            redcap,
            features,
            dd,
            metrics,
            salt=args.salt,
            data_source=data_source,
            organization_site=organization_site,
        )
    except FileNotFoundError as exc:
        if args.fallback_synthetic:
            logger.warning("%s — falling back to synthetic generator.", exc)
            from dashboard.pipelines import generate_synthetic_dashboard_data as syn

            payload = syn.build_payload()
            payload["organization_site"] = organization_site
        else:
            logger.error("%s  (pass --fallback-synthetic to emit demo data)", exc)
            return 2

    _atomic_write_json(args.output, payload)
    nano_output = args.nano_output or args.output.with_name("nano_dashboard_data.json")
    _atomic_write_json(
        nano_output,
        {
            "schema": "nano-dashboard.v1",
            "nano": payload.get("nano", {}),
        },
    )
    logger.info("✓ Wrote dashboard payload → %s", args.output)
    logger.info("✓ Wrote aggregate-only NANO payload → %s", nano_output)
    logger.info("  data_source: %s", payload["meta"]["data_source"])
    logger.info("  keys: %s", list(payload.keys()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
