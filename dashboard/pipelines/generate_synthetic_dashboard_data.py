"""NANO Study - Synthetic Dashboard Data Generator.

Produces a reproducible, realistically-shaped JSON payload used by the
local runtime and SPA-backed dashboard routes. NO Protected Health Information (PHI) is
involved: every value is synthesized with ``numpy.random`` using a fixed
seed so the dashboard renders identically on each run.

Pipeline role
-------------
This script is the **demo / smoke-test** entry point. The production
pipeline is :mod:`dashboard.pipelines.build_dashboard_data`, which pulls
from REDCap + the processed feature matrix via the lab's standard
``config/paths.yml`` layout. Both scripts produce the same JSON schema
so the dashboard works either way.

Output
------
Writes ``dashboard/data/dashboard_data.json`` with the following keys:

- ``meta``             : generated_at, data_source, study_meta
- ``enrollment``       : per-group enrolled / target + monthly accrual
- ``visit_completion`` : completion rate per event x group
- ``data_quality``     : missingness by instrument, QC flag counts
- ``ml_performance``   : ROC curves, AUROC + CI by model, SHAP top features
- ``trajectories``     : RSA / RMSSD / HRV trajectories by group over 0-36m
- ``redcap_audit``     : open queries, incomplete records, double-entry errors
- ``cohort_table``     : per-participant summary rows (synthetic IDs)
- ``participant_operations``: ID legend, study-role mapping, form policy,
                              questionnaire routing, and scheduling risk
- ``organization_site``: fallback public-site metadata for organization views

Usage
-----
``python dashboard/pipelines/generate_synthetic_dashboard_data.py``

Reproducibility
---------------
Seeded at ``SEED = 42``. Parameters match the real study configuration
in ``config/study_parameters.yml`` (n_target = 260, 3 groups, 9 events).
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

try:
    from dashboard.pipelines.participant_operations import build_participant_operations
    from dashboard.pipelines.lab_operations import build_lab_operations_payload
    from dashboard.pipelines.study_blocks import build_study_blocks
except ImportError:  # pragma: no cover - script can be run directly
    from participant_operations import build_participant_operations
    from lab_operations import build_lab_operations_payload
    from study_blocks import build_study_blocks

# ─── Reproducibility ────────────────────────────────────────────────────────
SEED = 42
rng = np.random.default_rng(SEED)

# ─── Study constants (match config/study_parameters.yml) ────────────────────
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
INSTRUMENTS = [
    "demographics",
    "nicu_morbidity",
    "nnns_attention_1_3m",
    "ecg_recording_log",
    "temperature_recording_log",
    "behavioral_coding_log",
    "csbs_social_communication",
    "bayley4_scores",
    "ados2_scores",
    "mchat_r_tf",
    "asq3_milestones",
    "prapare_sdoh",
    "epds_maternal_depression",
    "hmet_recording_log",
]
MODELS = [
    ("Random Forest", "rf", 0.82, 0.03),
    ("XGBoost", "xgb", 0.86, 0.025),
    ("Logistic Regression", "logreg", 0.74, 0.04),
    ("SVM (RBF)", "svm", 0.78, 0.035),
    ("1D-CNN + LSTM", "cnn_lstm", 0.89, 0.03),
    ("Transformer", "transformer", 0.87, 0.032),
]
FEATURES = [
    ("rmssd_mean_m6", "RMSSD mean @ 6mo", 0.186),
    ("rsa_slope_0_12", "RSA slope 0→12mo", 0.154),
    ("hda_sa_latency_m3", "HDA sust. attention latency @ 3mo", 0.118),
    ("sdnn_mean_m9", "SDNN mean @ 9mo", 0.093),
    ("cptd_nicu", "Central-Peripheral Temp Δ (NICU)", 0.078),
    ("ga_weeks", "Gestational age (weeks)", 0.065),
    ("birth_weight_g", "Birth weight (g)", 0.054),
    ("nnns_attention_m1", "NNNS attention @ 1mo", 0.048),
    ("mchat_total_m9", "M-CHAT total @ 9mo", 0.041),
    ("bayley_cog_m6", "Bayley-4 cognitive @ 6mo", 0.039),
    ("hr_decel_magnitude", "HR deceleration magnitude", 0.033),
    ("sample_entropy_m6", "Sample entropy @ 6mo", 0.028),
]

DEFAULT_CONTROLS = {
    "anomaly_thresholds": {
        "stale_visit_days": 30,
        "completeness_warn_pct": 0.8,
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
        "dp_epsilon": 1,
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


def _atomic_write_json(output_path: Path, payload: dict) -> None:
    """Write JSON atomically so browser refreshes never see partial content."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    temp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    temp_path.replace(output_path)


def _noisy_logistic(x: np.ndarray, k: float = 1.0, x0: float = 0.0) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-k * (x - x0)))


def generate_enrollment() -> dict:
    """Synthetic enrollment by group with 36-month accrual curve."""
    today = datetime.now()
    start = today - timedelta(days=30 * 30)  # study started ~30 months ago
    months = [(start + timedelta(days=30 * i)).strftime("%Y-%m") for i in range(30)]

    by_group = {}
    for g, meta in GROUPS.items():
        # S-curve accrual with ~80% of target enrolled so far
        target = meta["n_target"]
        curve = _noisy_logistic(np.linspace(-3, 3, 30), k=1.1, x0=-0.2)
        enrolled = (curve * 0.82 * target).round().astype(int)
        enrolled = np.maximum.accumulate(enrolled)
        enrolled = enrolled + rng.integers(-1, 2, size=30)
        enrolled = np.clip(np.maximum.accumulate(enrolled), 0, target)
        by_group[g] = {
            "target": int(target),
            "current": int(enrolled[-1]),
            "percent": round(float(enrolled[-1] / target) * 100, 1),
            "monthly": enrolled.tolist(),
            "color": meta["color"],
            "label": meta["label"],
        }
    return {"months": months, "by_group": by_group}


def generate_visit_completion() -> dict:
    """Completion rate per event × group (non-random attrition beyond 12m)."""
    out = {
        "events": [e[0] for e in EVENTS],
        "labels": [e[2] for e in EVENTS],
        "by_group": {},
    }
    for g in GROUPS:
        rates = []
        for i, (_, month, _) in enumerate(EVENTS):
            # base completion; ASIB slightly lower attrition early, drops at 24m
            base = 0.98 if g == "TD" else (0.94 if g == "PT" else 0.91)
            attrition = 0.01 * month  # ~1%/month baseline attrition
            if month == 24:
                attrition += 0.04  # extra drop at questionnaire-only visit
            completion = max(0.55, base - attrition + rng.normal(0, 0.015))
            rates.append(round(completion * 100, 1))
        out["by_group"][g] = rates
    return out


def generate_data_quality() -> dict:
    """Missingness per instrument & QC-flag counts."""
    missingness = []
    for inst in INSTRUMENTS:
        # instruments collected less often have higher missingness
        base = rng.uniform(2.0, 18.0)
        if inst in {"hmet_recording_log", "behavioral_coding_log"}:
            base += 8.0  # more burden → more missingness
        missingness.append(
            {
                "instrument": inst,
                "pct_missing": round(base, 1),
                "status": (
                    "High — MNAR risk"
                    if base > 25
                    else (
                        "Moderate — MAR candidate" if base > 10 else "Low — MCAR likely"
                    )
                ),
            }
        )
    qc_flags = {
        "total_records": 1840,
        "double_entry_discrepancies": 23,
        "out_of_range_values": 41,
        "missing_required_fields": 112,
        "ecg_transfer_late": 14,
        "temp_quality_rejected": 9,
    }
    return {"missingness": missingness, "qc_flags": qc_flags}


def generate_ml_performance() -> dict:
    """ROC curves, AUROC with CI, and SHAP top features for each model."""
    out = {"models": [], "shap": [], "confusion": {}}
    for name, slug, auroc, auroc_sd in MODELS:
        # Synthetic ROC curve: smooth S-curve with AUROC ≈ desired
        tpr = np.linspace(0, 1, 50)
        fpr = 1 - tpr ** (1 / (2.0 * auroc))  # shape so area ≈ auroc
        fpr = np.clip(fpr + rng.normal(0, 0.01, 50), 0, 1)
        fpr = np.minimum.accumulate(fpr[::-1])[::-1]
        # Bootstrap CI
        ci_low, ci_high = round(max(0.0, auroc - 1.96 * auroc_sd), 3), round(
            min(1.0, auroc + 1.96 * auroc_sd), 3
        )
        out["models"].append(
            {
                "name": name,
                "slug": slug,
                "auroc": round(auroc + rng.normal(0, 0.005), 3),
                "auroc_ci": [ci_low, ci_high],
                "auroc_sd": round(auroc_sd, 3),
                "roc": {
                    "fpr": [round(x, 3) for x in fpr.tolist()],
                    "tpr": [round(x, 3) for x in tpr.tolist()],
                },
                "sensitivity": round(0.70 + rng.uniform(0, 0.2), 3),
                "specificity": round(0.72 + rng.uniform(0, 0.2), 3),
                "f1": round(0.65 + rng.uniform(0, 0.2), 3),
            }
        )
    # SHAP top features (shared across models for simplicity)
    for feat, label, base_imp in FEATURES:
        out["shap"].append(
            {
                "feature": feat,
                "label": label,
                "importance": round(base_imp + rng.normal(0, 0.008), 3),
            }
        )
    out["shap"].sort(key=lambda x: -x["importance"])
    # Confusion matrix for best model (cnn_lstm)
    out["confusion"] = {
        "tp": 47,
        "fp": 13,
        "tn": 71,
        "fn": 9,
        "best_model": "1D-CNN + LSTM",
    }
    # Subgroup sensitivity
    out["subgroup"] = [
        {"subgroup": "24-26w GA", "n": 28, "mean_auroc": 0.81, "sd": 0.06},
        {"subgroup": "27-29w GA", "n": 52, "mean_auroc": 0.87, "sd": 0.04},
        {"subgroup": "30-32w GA", "n": 61, "mean_auroc": 0.89, "sd": 0.03},
        {"subgroup": "Male", "n": 73, "mean_auroc": 0.86, "sd": 0.04},
        {"subgroup": "Female", "n": 68, "mean_auroc": 0.88, "sd": 0.04},
    ]
    return out


def generate_trajectories() -> dict:
    """HRV biomarker trajectories by group across 0-36m."""
    months = [e[1] for e in EVENTS if e[1] <= 36]
    out = {
        "months": months,
        "by_group": {},
        "biomarkers": ["RSA", "RMSSD", "SDNN", "HDA_SA"],
    }
    # Real-world direction: RSA grows over infancy; ASIB group shows flatter slope
    for g in GROUPS:
        intercept = {"RSA": 3.2, "RMSSD": 28.0, "SDNN": 36.0, "HDA_SA": 450.0}
        slope = {
            "RSA": {"ASIB": 0.04, "PT": 0.08, "TD": 0.11}[g],
            "RMSSD": {"ASIB": 0.6, "PT": 1.1, "TD": 1.4}[g],
            "SDNN": {"ASIB": 0.7, "PT": 1.2, "TD": 1.5}[g],
            "HDA_SA": {"ASIB": -1.5, "PT": -4.0, "TD": -5.5}[g],
        }
        noise = {"RSA": 0.15, "RMSSD": 2.0, "SDNN": 2.5, "HDA_SA": 28.0}
        traj = {}
        ci = {}
        for bm in ["RSA", "RMSSD", "SDNN", "HDA_SA"]:
            mean = [
                round(
                    intercept[bm] + slope[bm] * m + rng.normal(0, noise[bm] * 0.25), 2
                )
                for m in months
            ]
            ci_low = [round(v - noise[bm] * 0.7, 2) for v in mean]
            ci_high = [round(v + noise[bm] * 0.7, 2) for v in mean]
            traj[bm] = mean
            ci[bm] = {"low": ci_low, "high": ci_high}
        out["by_group"][g] = {"mean": traj, "ci": ci, "color": GROUPS[g]["color"]}
    return out


def generate_redcap_audit() -> dict:
    """REDCap audit snapshot: open queries, double-entry errors, pending review."""
    return {
        "summary": {
            "total_participants_enrolled": 213,
            "active_participants": 198,
            "withdrawn": 15,
            "open_queries": 37,
            "records_pending_pi_review": 12,
            "double_entry_pending": 6,
        },
        "queries_by_event": [
            {"event": e[2], "open": int(rng.integers(2, 9))} for e in EVENTS
        ],
        "recent_activity": [
            {
                "date": (datetime.now() - timedelta(days=d)).strftime("%Y-%m-%d"),
                "action": a,
                "record_id": f"NANO-{rng.integers(1000, 9999):04d}",
                "user": u,
            }
            for d, a, u in [
                (0, "QC pipeline run", "pipeline_bot"),
                (0, "Double-entry check", "ra_emma"),
                (1, "Imputation diagnostics", "research_prog"),
                (1, "Field mapping update", "pi_bradshaw"),
                (2, "Bayley-4 score entered", "ra_sam"),
                (2, "ADOS-2 module coded", "ra_julia"),
                (3, "Temperature data pushed", "pipeline_bot"),
                (4, "ECG batch processed", "research_prog"),
            ]
        ],
    }


def _payload_hash(*parts: object) -> str:
    text = json.dumps(parts, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def generate_redcap_completion_stats() -> dict:
    events = [
        ("6_months_arm_1", "6m", 47, 4, 8, 12, 3),
        ("9_months_arm_1", "9m", 42, 5, 10, 16, 2),
        ("12_months_arm_1", "12m", 36, 7, 12, 19, 1),
        ("24_months_arm_1", "24m", 22, 6, 14, 28, 4),
    ]
    return {
        event: {
            "label": label,
            "complete": complete,
            "unverified": unverified,
            "incomplete": incomplete,
            "not_started": not_started,
            "skipped": skipped,
            "total": complete + unverified + incomplete + not_started + skipped,
        }
        for event, label, complete, unverified, incomplete, not_started, skipped in events
    }


def generate_redcap_visit_health(n: int = 24) -> list[dict]:
    status_cycle = ["complete", "unverified", "incomplete", "not_started", "skipped"]
    rows: list[dict] = []
    for idx in range(n):
        flags: list[str] = []
        six = status_cycle[idx % len(status_cycle)]
        nine = status_cycle[(idx + 1) % len(status_cycle)]
        twelve = status_cycle[(idx + 2) % len(status_cycle)]
        tfour = status_cycle[(idx + 3) % len(status_cycle)]
        if idx % 7 == 0:
            six, nine, flags = "incomplete", "complete", ["R1"]
        if idx % 11 == 0:
            twelve, tfour, flags = "incomplete", "complete", sorted(set(flags + ["R5"]))

        def point(event_name: str, month: int, status: str) -> dict:
            visit_date = (
                ""
                if status == "not_started"
                else f"2026-{min(month, 12):02d}-{(idx % 24) + 1:02d}"
            )
            return {
                "eventName": event_name,
                "visitDate": visit_date or None,
                "csbsStatus": status,
                "csbsTimestamp": (
                    f"2026-{min(month, 12):02d}-{(idx % 24) + 1:02d}T09:00:00Z"
                    if visit_date
                    else None
                ),
            }

        rows.append(
            {
                "recordId": f"NANO-{4100 + idx:04d}",
                "sixMonth": point("6_months_arm_1", 6, six),
                "nineMonth": point("9_months_arm_1", 9, nine),
                "twelveMonth": point("12_months_arm_1", 12, twelve),
                "twentyFourMonth": point("24_months_arm_1", 12, tfour),
                "anomalyFlags": flags,
                "hasCarryForwardRisk": bool(flags),
            }
        )
    return sorted(
        rows, key=lambda row: (not row["hasCarryForwardRisk"], row["recordId"])
    )


def generate_redcap_trackers(completion_stats: dict) -> dict:
    event_order = [
        ("consent_arm_1", "Consent", 80, 80, 78),
        ("1_month_arm_1", "1m", 76, 74, 70),
        ("2_months_arm_1", "2m", 74, 71, 68),
        ("3_months_arm_1", "3m", 72, 69, 65),
        (
            "6_months_arm_1",
            "6m",
            74,
            68,
            completion_stats["6_months_arm_1"]["complete"],
        ),
        (
            "9_months_arm_1",
            "9m",
            75,
            64,
            completion_stats["9_months_arm_1"]["complete"],
        ),
        (
            "12_months_arm_1",
            "12m",
            75,
            56,
            completion_stats["12_months_arm_1"]["complete"],
        ),
        (
            "24_months_arm_1",
            "24m",
            74,
            42,
            completion_stats["24_months_arm_1"]["complete"],
        ),
        ("36_months_arm_1", "36m", 70, 22, 16),
    ]
    instruments = [
        "csbs_caregiver",
        "epds_maternal_depression",
        "medication",
        "asq3_milestones",
        "vineland",
    ]
    return {
        "enrollment": [
            {
                "event": event,
                "label": label,
                "expected": expected,
                "scheduled": scheduled,
                "completed": completed,
            }
            for event, label, expected, scheduled, completed in event_order
        ],
        "instrument_completeness": [
            {
                "instrument": instrument,
                "label": instrument.replace("_", " ")
                .title()
                .replace("Csbs", "CSBS")
                .replace("Epds", "EPDS"),
                "byEvent": {
                    event: {
                        "complete": max(0, completed - offset * 2),
                        "total": max(scheduled, completed),
                    }
                    for event, _label, _expected, scheduled, completed in event_order
                    if event.endswith("_arm_1")
                },
            }
            for offset, instrument in enumerate(instruments)
        ],
        "queue_funnel": [
            {"stage": "expected", "count": 298},
            {"stage": "scheduled", "count": 230},
            {"stage": "started", "count": 174},
            {"stage": "complete", "count": 147},
        ],
        "thresholds": {
            "completeness_warn_pct": DEFAULT_CONTROLS["anomaly_thresholds"][
                "completeness_warn_pct"
            ],
            "stale_visit_days": DEFAULT_CONTROLS["anomaly_thresholds"][
                "stale_visit_days"
            ],
            "freshness_sla_hours": DEFAULT_CONTROLS["anomaly_thresholds"][
                "freshness_sla_hours"
            ],
            "small_cell_min": DEFAULT_CONTROLS["anomaly_thresholds"]["small_cell_min"],
        },
    }


def generate_redcap_timeline(visit_rows: list[dict]) -> dict:
    specs = [
        ("sixMonth", "6_months_arm_1", "6m", 6),
        ("nineMonth", "9_months_arm_1", "9m", 9),
        ("twelveMonth", "12_months_arm_1", "12m", 12),
        ("twentyFourMonth", "24_months_arm_1", "24m", 24),
    ]
    return {
        "records": [
            {
                "recordId": row["recordId"],
                "events": [
                    {
                        "event": event,
                        "label": label,
                        "month": month,
                        "visitDate": (row[key] or {}).get("visitDate") or "",
                        "status": (row[key] or {}).get("csbsStatus") or "not_started",
                        "hasRisk": bool(row.get("hasCarryForwardRisk")),
                    }
                    for key, event, label, month in specs
                ],
            }
            for row in visit_rows
        ]
    }


def generate_redcap_ops(
    *,
    generated_at: str,
    completion_stats: dict,
    visit_rows: list[dict],
    trackers: dict,
    timeline: dict,
    next_wave: dict | None = None,
) -> dict:
    content_hash = _payload_hash(completion_stats, visit_rows, trackers, timeline, next_wave or {})
    anomaly_count = sum(1 for row in visit_rows if row.get("hasCarryForwardRisk"))
    return {
        "freshness": {
            "generated_at": generated_at,
            "age_hours": 0.0,
            "source": "synthetic-fallback",
            "status": "fresh",
            "sla_hours": 48,
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
                "records": len(visit_rows),
                "anomalies": anomaly_count,
                "duration_ms": 0,
            }
        ],
        "controls_snapshot": DEFAULT_CONTROLS,
    }


def generate_redcap_next_wave(visit_rows: list[dict], completion_stats: dict) -> dict:
    """Synthetic v3 REDCap next-wave payload, aggregate and PHI-free."""
    months = [6, 9, 12, 24, 36]
    epds = [
        {
            "event": f"{month}_months_arm_1" if month != 6 else "6_months_arm_1",
            "label": f"{month} Months",
            "month": month,
            "n": int(42 + rng.integers(-6, 8)),
            "mean_total": round(float(rng.normal(8.2, 1.1)), 2),
            "screen_positive": int(rng.integers(5, 13)),
            "high_concern": int(rng.integers(2, 7)),
            "self_harm_flags": int(rng.integers(0, 3)),
            "total_field": "epds_total",
            "total_field_verified": True,
            "self_harm_field": "epds_si_item",
            "self_harm_field_verified": True,
        }
        for month in months[:-1]
    ]
    developmental_grid = [
        {
            "instrument": instrument,
            "domain": domain,
            "field": field,
            "field_verified": True,
            "event": f"{month}_months_arm_1" if month != 6 else "6_months_arm_1",
            "label": f"{month} Months",
            "month": month,
            "n": int(36 + rng.integers(-5, 8)),
            "mean_score": round(float(rng.normal(mean, 5.2)), 2),
            "zone": zone,
        }
        for month in [6, 12, 24, 36]
        for instrument, domain, field, mean, zone in [
            ("asq3_milestones", "ASQ communication", "asq3_communication", 42, "pass"),
            ("asq3_milestones", "ASQ gross motor", "asq3_gross_motor", 36, "monitor"),
            ("csbs_social_communication", "CSBS social", "csbs_social", 70, "pass"),
            ("bayley4_scores", "Bayley cognition", "bayley4_cog_composite", 96, "context"),
            ("mchat_r_tf", "M-CHAT total", "mchat_total", 2.4, "context"),
        ]
    ]
    family_risk = [
        {"axis": axis, "score": score, "max_score": max_score, "source_fields": fields, "field_verified": verified, "note": note}
        for axis, score, max_score, fields, verified, note in [
            ("Sibling SCQ", 0, 40, ["scq_lifetime", "scq_current_sibling"], False, "TODO(verify): field absent from local REDCap metadata"),
            ("Sibling SRS", 0, 90, ["srs_total", "srs_t_score"], False, "TODO(verify): field absent from local REDCap metadata"),
            ("Caregiver BAPQ", 0, 6, ["bapq_caregiver_1", "bapq_caregiver_2"], False, "TODO(verify): field absent from local REDCap metadata"),
            ("M-CHAT", 2.3, 20, ["mchat_total"], True, "metadata verified"),
        ]
    ]
    cascade_edges = [
        {"source": "nnns_attention", "target": "bayley_cog", "label": "Attention to Bayley cognition", "weight": 0.32, "direction": "positive", "n": 180},
        {"source": "rmssd", "target": "mchat_total", "label": "Autonomic regulation to M-CHAT", "weight": 0.22, "direction": "negative", "n": 168},
        {"source": "hda_sa_pct", "target": "bayley_cog", "label": "HDA sustained attention to Bayley", "weight": 0.28, "direction": "negative", "n": 172},
    ]
    ados_flow = [
        {
            "event": "24_months_arm_1",
            "label": "24 Months",
            "month": 24,
            "screened": 74,
            "assessed": 38,
            "classified": 9,
            "module_counts": {"T": 18, "1": 16, "2": 4},
            "score_field": "ados2_css_total",
            "score_field_verified": True,
        },
        {
            "event": "36_months_arm_1",
            "label": "36 Months",
            "month": 36,
            "screened": 70,
            "assessed": 30,
            "classified": 8,
            "module_counts": {"T": 10, "1": 16, "2": 4},
            "score_field": "ados2_css_total",
            "score_field_verified": True,
        },
    ]

    event_rows = [
        ("6_months_arm_1", "6m", 6),
        ("9_months_arm_1", "9m", 9),
        ("12_months_arm_1", "12m", 12),
        ("24_months_arm_1", "24m", 24),
    ]
    integrity_matrix = [
        {
            "instrument": instrument,
            "event": event,
            "label": label,
            "missing_fraction": round(float(rng.uniform(0.05, 0.28)), 3),
            "expected_fields": expected,
            "present_fields": int(expected - rng.integers(0, 3)),
        }
        for instrument, expected in [
            ("epds_maternal_depression", 2),
            ("asq3_milestones", 5),
            ("csbs_social_communication", 3),
            ("ados2_scores", 7),
        ]
        for event, label, _month in event_rows
    ]
    window_adherence = [
        {
            "event": event,
            "label": label,
            "month": month,
            "target_days": round(month * 30.4375, 1),
            "window_days": DEFAULT_CONTROLS["clinical_cutoffs"]["visit_window_days"],
            "n": 48,
            "mean_delta_days": round(float(rng.normal(3, 7)), 1),
            "late": int(rng.integers(3, 9)),
            "early": int(rng.integers(1, 6)),
            "points": [
                {"recordId": row["recordId"], "delta_days": round(float(rng.normal(0, 18)), 1)}
                for row in visit_rows[:18]
            ],
        }
        for event, label, month in event_rows
    ]
    retention_survival = [
        {
            "event": event,
            "label": label,
            "month": month,
            "at_risk": 210,
            "completed": max(0, 190 - month * 4),
            "censored": int(month / 3),
            "retained_pct": round(100 * max(0, 190 - month * 4) / 210, 1),
        }
        for event, label, month in event_rows
    ]
    upcoming_visits = [
        {
            "recordId": row["recordId"],
            "event": event_rows[idx % len(event_rows)][0],
            "label": event_rows[idx % len(event_rows)][1],
            "due_in_days": int(rng.integers(-12, 31)),
            "urgency": "overdue" if idx % 4 == 0 else "approaching",
        }
        for idx, row in enumerate(visit_rows[:18])
    ]
    risks = [
        {
            "recordId": row["recordId"],
            "risk_score": round(float(0.22 + (idx % 8) * 0.08), 3),
            "risk_band": "high" if idx % 8 >= 6 else "medium" if idx % 8 >= 3 else "low",
            "drivers": ["questionnaire backlog", "visit-window drift"] if idx % 3 == 0 else ["stable engagement"],
        }
        for idx, row in enumerate(visit_rows[:24])
    ]

    return {
        "redcap_clinical": {
            "epds_trajectory": epds,
            "developmental_grid": developmental_grid,
            "family_risk": family_risk,
            "cascade_edges": cascade_edges,
            "ados_flow": ados_flow,
        },
        "redcap_integrity": {
            "nullity_matrix": integrity_matrix,
            "field_presence": [
                {"instrument": row["instrument"], "expected_fields": row["expected_fields"], "present_fields": row["present_fields"]}
                for row in integrity_matrix[:4]
            ],
            "double_entry_diffs": [
                {"recordId": row["recordId"], "event": "12_months_arm_1", "instrument": "asq3_milestones", "field": "double_entry_mismatch", "firstEntry": "present", "secondEntry": "review", "severity": "review"}
                for row in visit_rows[:4]
            ],
            "mismatch_trend": [
                {"event": event, "label": label, "mismatch_rate": round(float(rng.uniform(0.01, 0.06)), 3)}
                for event, label, _month in event_rows
            ],
            "response_quality": [
                {"instrument": instrument, "submissions": int(rng.integers(24, 52)), "flagged": int(rng.integers(0, 5)), "mean_quality_score": round(float(rng.uniform(0.88, 0.99)), 3), "note": "server-side sentinel ready"}
                for instrument in ["srs", "bapq", "caars", "epds_maternal_depression"]
            ],
            "branching_violations": [
                {"instrument": "metadata", "field": "branching_logic", "violations": 0, "examples": [], "verified": False, "note": "TODO(verify): branching_logic metadata not present in local dictionary"}
            ],
            "validation_radar": [
                {"instrument": instrument, "validated_fields": int(rng.integers(2, 8)), "violations": int(rng.integers(0, 6))}
                for instrument in ["epds_maternal_depression", "asq3_milestones", "csbs_social_communication", "ados2_scores"]
            ],
        },
        "redcap_schedule": {
            "window_adherence": window_adherence,
            "retention_survival": retention_survival,
            "collection_calendar": [
                {"date": (datetime.now() - timedelta(days=day)).strftime("%Y-%m-%d"), "count": int(rng.integers(0, 9))}
                for day in range(70, -1, -1)
            ],
            "upcoming_visits": sorted(upcoming_visits, key=lambda row: row["due_in_days"]),
            "entry_lag": [
                {"event": event, "label": label, "mean_lag_days": round(float(rng.uniform(1.5, 5.8)), 1), "ucl": 8.5, "lcl": 0, "n": 42}
                for event, label, _month in event_rows
            ],
        },
        "redcap_respondent": {
            "caregiver_burden": [
                {"respondent": "caregiver_1", "label": "Caregiver 1", "assigned": 156, "started": 132, "completed": 118, "fatigue_index": 0.244},
                {"respondent": "caregiver_2", "label": "Caregiver 2", "assigned": 122, "started": 88, "completed": 74, "fatigue_index": 0.393},
            ],
            "respondent_concordance": [
                {"instrument": "BAPQ", "caregiver_1_field": "bapq_caregiver_1", "caregiver_2_field": "bapq_caregiver_2", "n_pairs": 0, "concordance": 0, "note": "TODO(verify): parallel caregiver fields absent from local metadata"},
                {"instrument": "SRS adult", "caregiver_1_field": "srs_adult_caregiver_1", "caregiver_2_field": "srs_adult_caregiver_2", "n_pairs": 0, "concordance": 0, "note": "TODO(verify): parallel caregiver fields absent from local metadata"},
            ],
        },
        "redcap_platform": {
            "audit_log": [
                {"ts": (datetime.now() - timedelta(hours=idx)).isoformat(timespec="seconds"), "recordId": row["recordId"], "event": "12_months_arm_1", "action": "field_update", "actor_hash": f"u{idx:03d}"}
                for idx, row in enumerate(visit_rows[:10])
            ],
            "reports": [{"report_id": "TODO(configure)", "title": "PI-defined REDCap report bridge", "rows": 0, "status": "server-side schedule ready"}],
            "file_repository": [{"name": "Allowlisted non-PHI repository sync", "folder": "protocols", "status": "awaiting REDCap folder allowlist", "download_url": ""}],
            "users": [{"role": "coordinator", "active_users": 0, "stale_accounts": 0, "status": "content=user pull runs server-side when token scope is enabled"}],
        },
        "redcap_predictive": {
            "attrition_risk": risks,
            "nl_query_enabled": True,
            "weekly_memo": {
                "title": "Auto-generated weekly REDCap study memo",
                "status": "ready",
                "source_keys": ["redcap_clinical", "redcap_integrity", "redcap_schedule", "redcap_platform"],
                "highlights": [
                    f"{sum(row['screen_positive'] for row in epds)} EPDS screen-positive summaries",
                    f"{len(upcoming_visits)} visit windows due or overdue",
                ],
            },
        },
        "clinical_cutoffs": DEFAULT_CONTROLS["clinical_cutoffs"],
    }


def generate_cohort_table(n: int = 40) -> list[dict]:
    """Synthetic per-participant summary rows (IDs are fake)."""
    rows = []
    for i in range(n):
        g = rng.choice(list(GROUPS.keys()), p=[0.25, 0.5, 0.25])
        ga = int(rng.integers(24, 33) if g != "TD" else rng.integers(37, 41))
        enrolled_days = int(rng.integers(30, 900))
        last_event = EVENTS[min(len(EVENTS) - 1, int(enrolled_days / 90))][2]
        rows.append(
            {
                "nano_id": f"NANO-{1000 + i:04d}",
                "group": g,
                "ga_weeks": ga,
                "birth_weight_g": int(rng.normal(1600 if g != "TD" else 3300, 400)),
                "sex": rng.choice(["M", "F"]),
                "last_visit": last_event,
                "completeness_pct": round(max(40, min(100, 90 + rng.normal(0, 10))), 1),
                "qc_status": rng.choice(
                    ["OK", "Review", "OK", "OK"], p=[0.7, 0.1, 0.1, 0.1]
                ),
            }
        )
    return rows


def generate_matlab_integration() -> dict:
    """Synthetic block describing the MATLAB handoff to the dashboard.

    Mirrors the shape that the production builder produces from
    ``data/interim/matlab/manifest.json`` so the new ``/matlab`` SPA
    section can render identically against either source.
    """
    rng = np.random.default_rng(SEED + 1)
    now = datetime.now()
    files = [
        {
            "name": "hrv_dense.parquet",
            "feature": "hrv",
            "rows": int(rng.integers(11_000, 14_000)),
            "qa_pass_pct": round(float(rng.uniform(0.88, 0.96)), 3),
        },
        {
            "name": "temp_gradients.parquet",
            "feature": "temp",
            "rows": int(rng.integers(28_000, 32_000)),
            "qa_pass_pct": round(float(rng.uniform(0.90, 0.97)), 3),
        },
        {
            "name": "hda_phases.parquet",
            "feature": "hda",
            "rows": int(rng.integers(3_500, 4_500)),
            "qa_pass_pct": round(float(rng.uniform(0.93, 0.99)), 3),
        },
    ]
    hours = [(now - timedelta(hours=23 - i)).strftime("%H:00") for i in range(24)]
    throughput = [int(max(0, rng.normal(loc=420, scale=110))) for _ in range(24)]

    def _script(name, feature, lines, dur_lo, dur_hi):
        return {
            "name": name,
            "feature": feature,
            "last_run": (now - timedelta(minutes=int(rng.integers(2, 30)))).isoformat(
                timespec="seconds"
            ),
            "status": "ok",
            "duration_s": round(float(rng.uniform(dur_lo, dur_hi)), 1),
            "lines": lines,
        }

    scripts = [
        _script("export_hrv_features.m", "hrv", 96, 8, 22),
        _script("export_temperature_features.m", "temp", 64, 4, 11),
        _script("export_hda_phases.m", "hda", 48, 2, 6),
        _script("run_all.m", "orchestrator", 22, 18, 42),
    ]

    return {
        "manifest": {
            "generated_at": now.isoformat(timespec="seconds"),
            "matlab_version": "R2024a",
            "salt": "nano_demo",
            "epoch_sec": 60,
            "source": "synthetic_demo",
            "host": "matlab-lab-01",
        },
        "files": files,
        "scripts": scripts,
        "throughput_24h": {"hours": hours, "rows": throughput},
        "options": [
            {
                "id": "file",
                "title": "File handoff",
                "tag": "Recommended",
                "coupling": "loose",
                "cost": "low",
                "summary": "MATLAB writes Parquet to data/interim/matlab/. Python merge picks it up on the next dashboard refresh.",
            },
            {
                "id": "engine",
                "title": "MATLAB Engine for Python",
                "tag": "Real-time",
                "coupling": "tight",
                "cost": "medium",
                "summary": "build_dashboard_data.py invokes .m functions via matlab.engine in a single process.",
            },
            {
                "id": "rest",
                "title": "REST endpoint",
                "tag": "On-demand",
                "coupling": "loose",
                "cost": "medium",
                "summary": "MATLAB Production Server or a Flask wrapper exposes /predict for click-time inference.",
            },
        ],
    }


def _normalize_hda(values: list[float]) -> dict:
    total = sum(values) or 1.0
    normalized = [round(v / total, 3) for v in values]
    normalized[1] = round(normalized[1] + (1.0 - sum(normalized)), 3)
    return {
        "orienting": normalized[0],
        "sustained": normalized[1],
        "inattention": normalized[2],
        "termination": normalized[3],
    }


def generate_hda_composition() -> dict:
    """Synthetic HDA phase composition by group across canonical CGA months."""
    months = [e[1] for e in EVENTS]
    specs = {
        "VPT": ([0.25, 0.34, 0.29, 0.12], [-0.006, 0.025, -0.012, -0.006]),
        "ASIB": ([0.27, 0.31, 0.28, 0.14], [-0.005, 0.015, -0.006, -0.004]),
        "TD": ([0.24, 0.39, 0.23, 0.14], [-0.007, 0.03, -0.015, -0.008]),
    }
    return {
        "by_group": {
            group: [
                {
                    "month": month,
                    **_normalize_hda([base[i] + slope[i] * idx for i in range(4)]),
                }
                for idx, month in enumerate(months)
            ]
            for group, (base, slope) in specs.items()
        }
    }


def generate_attrition_funnel() -> dict:
    """Synthetic retention funnel with reason codes and quarter trend detail."""
    stages = [
        {"id": "screened", "label": "Screened", "n": 380, "retained_pct": 100},
        {"id": "consented", "label": "Consented", "n": 302, "retained_pct": 79.5},
        {"id": "enrolled", "label": "Enrolled", "n": 260, "retained_pct": 68.4},
        {"id": "v1", "label": "Visit 1 Complete", "n": 248, "retained_pct": 65.3},
        {"id": "v2", "label": "Visit 2 Complete", "n": 231, "retained_pct": 60.8},
        {"id": "v3", "label": "Visit 3 Complete", "n": 210, "retained_pct": 55.3},
        {"id": "v36mo", "label": "36-Month Complete", "n": 172, "retained_pct": 45.3},
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


def generate_county_profiles() -> list[dict]:
    """County-level aggregate profiles; no address, ZIP, or tract detail."""
    rows = [
        ("Richland", "45079", 42, 0.81, 0.44, "medium", 2.1),
        ("Lexington", "45063", 24, 0.78, 0.31, "high", 1.8),
        ("Greenville", "45045", 18, 0.75, 0.37, "medium", 1.9),
        ("Charleston", "45019", 16, 0.82, 0.28, "high", 1.7),
        ("Florence", "45041", 12, 0.69, 0.52, "low", 2.4),
    ]
    return [
        {
            "county": county,
            "fips": fips,
            "enrolled": enrolled,
            "completion_rate": completion,
            "sdoh_score": sdoh,
            "median_income_bracket": income,
            "cptd_gap_mean": cptd,
        }
        for county, fips, enrolled, completion, sdoh, income, cptd in rows
    ]


def build_payload() -> dict:
    """Assemble the full dashboard JSON payload."""
    from dashboard.pipelines import build_org_site_data
    from dashboard.pipelines.build_geo_data import generate_geo_data

    generated_at = datetime.now().isoformat(timespec="seconds")
    enrollment = generate_enrollment()
    cohort_table = generate_cohort_table()
    redcap_generated_at = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    redcap_completion_stats = generate_redcap_completion_stats()
    redcap_visit_health = generate_redcap_visit_health()
    redcap_trackers = generate_redcap_trackers(redcap_completion_stats)
    redcap_timeline = generate_redcap_timeline(redcap_visit_health)
    redcap_next_wave = generate_redcap_next_wave(
        redcap_visit_health,
        redcap_completion_stats,
    )
    redcap_anomaly_count = sum(
        1 for row in redcap_visit_health if row["hasCarryForwardRisk"]
    )
    payload = {
        "meta": {
            "generated_at": generated_at,
            "data_source": "synthetic_demo",
            "seed": SEED,
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
        "enrollment": enrollment,
        "visit_completion": generate_visit_completion(),
        "data_quality": generate_data_quality(),
        "ml_performance": generate_ml_performance(),
        "trajectories": generate_trajectories(),
        "redcap_audit": generate_redcap_audit(),
        "cohort_table": cohort_table,
        "participant_operations": build_participant_operations(cohort_table),
        "organization_site": build_org_site_data.build_payload(allow_network=False),
        "geo": generate_geo_data(enrollment_data=enrollment),
        "matlab_integration": generate_matlab_integration(),
        "hda_composition": generate_hda_composition(),
        "attrition_funnel": generate_attrition_funnel(),
        "county_profiles": generate_county_profiles(),
        "redcap_meta": {
            "generated_at": redcap_generated_at,
            "pid": 5955,
            "record_count": len(redcap_visit_health),
            "anomaly_count": redcap_anomaly_count,
            "source": "synthetic-fallback",
            "contract_version": "2.0",
            "payload_version": redcap_generated_at,
        },
        "redcap_completion_stats": redcap_completion_stats,
        "redcap_visit_health": {
            "anomaly_count": redcap_anomaly_count,
            "data": redcap_visit_health,
        },
        "redcap_trackers": redcap_trackers,
        "redcap_timeline": redcap_timeline,
        **redcap_next_wave,
        "redcap_ops": generate_redcap_ops(
            generated_at=redcap_generated_at,
            completion_stats=redcap_completion_stats,
            visit_rows=redcap_visit_health,
            trackers=redcap_trackers,
            timeline=redcap_timeline,
            next_wave=redcap_next_wave,
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
    payload.update(
        build_study_blocks(
            generated_at=redcap_generated_at,
            data_source="synthetic_demo",
            aggregates=nano_aggregates,
        )
    )
    return payload


def main() -> None:
    out_path = Path(__file__).resolve().parents[1] / "data" / "dashboard_data.json"
    payload = build_payload()
    _atomic_write_json(out_path, payload)
    print(f"✓ Wrote synthetic dashboard payload → {out_path}")
    print(f"  generated_at: {payload['meta']['generated_at']}")
    print(f"  keys: {list(payload.keys())}")


if __name__ == "__main__":
    main()
