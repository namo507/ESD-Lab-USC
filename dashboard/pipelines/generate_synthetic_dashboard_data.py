"""NANO Study - Synthetic Dashboard Data Generator.

Produces a reproducible, realistically-shaped JSON payload used by the
``dashboard/index.html`` file. NO Protected Health Information (PHI) is
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

Usage
-----
``python dashboard/pipelines/generate_synthetic_dashboard_data.py``

Reproducibility
---------------
Seeded at ``SEED = 42``. Parameters match the real study configuration
in ``config/study_parameters.yml`` (n_target = 260, 3 groups, 9 events).
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

# ─── Reproducibility ────────────────────────────────────────────────────────
SEED = 42
rng = np.random.default_rng(SEED)

# ─── Study constants (match config/study_parameters.yml) ────────────────────
GROUPS = {
    "ASIB": {"n_target": 65, "color": "#C44E52", "label": "ASIB (VPT + ASD traits)"},
    "PT":   {"n_target": 130, "color": "#4C72B0", "label": "PT (VPT typical)"},
    "TD":   {"n_target": 65, "color": "#55A868", "label": "TD (Term-born typical)"},
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
    "demographics", "nicu_morbidity", "nnns_attention_1_3m",
    "ecg_recording_log", "temperature_recording_log",
    "behavioral_coding_log", "csbs_social_communication",
    "bayley4_scores", "ados2_scores", "mchat_r_tf",
    "asq3_milestones", "prapare_sdoh", "epds_maternal_depression",
    "hmet_recording_log",
]
MODELS = [
    ("Random Forest",   "rf",      0.82, 0.03),
    ("XGBoost",         "xgb",     0.86, 0.025),
    ("Logistic Regression", "logreg", 0.74, 0.04),
    ("SVM (RBF)",       "svm",     0.78, 0.035),
    ("1D-CNN + LSTM",   "cnn_lstm", 0.89, 0.03),
    ("Transformer",     "transformer", 0.87, 0.032),
]
FEATURES = [
    ("rmssd_mean_m6", "RMSSD mean @ 6mo", 0.186),
    ("rsa_slope_0_12", "RSA slope 0→12mo", 0.154),
    ("hda_sa_latency_m3", "HDA sust. attention latency @ 3mo", 0.118),
    ("sdnn_mean_m9", "SDNN mean @ 9mo", 0.093),
    ("cptd_nicu",    "Central-Peripheral Temp Δ (NICU)", 0.078),
    ("ga_weeks",     "Gestational age (weeks)", 0.065),
    ("birth_weight_g", "Birth weight (g)", 0.054),
    ("nnns_attention_m1", "NNNS attention @ 1mo", 0.048),
    ("mchat_total_m9", "M-CHAT total @ 9mo", 0.041),
    ("bayley_cog_m6", "Bayley-4 cognitive @ 6mo", 0.039),
    ("hr_decel_magnitude", "HR deceleration magnitude", 0.033),
    ("sample_entropy_m6", "Sample entropy @ 6mo", 0.028),
]


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
    out = {"events": [e[0] for e in EVENTS], "labels": [e[2] for e in EVENTS], "by_group": {}}
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
        missingness.append({
            "instrument": inst,
            "pct_missing": round(base, 1),
            "status": (
                "High — MNAR risk" if base > 25 else
                "Moderate — MAR candidate" if base > 10 else
                "Low — MCAR likely"
            ),
        })
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
        ci_low, ci_high = round(max(0.0, auroc - 1.96 * auroc_sd), 3), round(min(1.0, auroc + 1.96 * auroc_sd), 3)
        out["models"].append({
            "name": name,
            "slug": slug,
            "auroc": round(auroc + rng.normal(0, 0.005), 3),
            "auroc_ci": [ci_low, ci_high],
            "auroc_sd": round(auroc_sd, 3),
            "roc": {"fpr": [round(x, 3) for x in fpr.tolist()],
                    "tpr": [round(x, 3) for x in tpr.tolist()]},
            "sensitivity": round(0.70 + rng.uniform(0, 0.2), 3),
            "specificity": round(0.72 + rng.uniform(0, 0.2), 3),
            "f1": round(0.65 + rng.uniform(0, 0.2), 3),
        })
    # SHAP top features (shared across models for simplicity)
    for feat, label, base_imp in FEATURES:
        out["shap"].append({
            "feature": feat,
            "label": label,
            "importance": round(base_imp + rng.normal(0, 0.008), 3),
        })
    out["shap"].sort(key=lambda x: -x["importance"])
    # Confusion matrix for best model (cnn_lstm)
    out["confusion"] = {"tp": 47, "fp": 13, "tn": 71, "fn": 9, "best_model": "1D-CNN + LSTM"}
    # Subgroup sensitivity
    out["subgroup"] = [
        {"subgroup": "24-26w GA", "n": 28,  "mean_auroc": 0.81, "sd": 0.06},
        {"subgroup": "27-29w GA", "n": 52,  "mean_auroc": 0.87, "sd": 0.04},
        {"subgroup": "30-32w GA", "n": 61,  "mean_auroc": 0.89, "sd": 0.03},
        {"subgroup": "Male",       "n": 73, "mean_auroc": 0.86, "sd": 0.04},
        {"subgroup": "Female",     "n": 68, "mean_auroc": 0.88, "sd": 0.04},
    ]
    return out


def generate_trajectories() -> dict:
    """HRV biomarker trajectories by group across 0-36m."""
    months = [e[1] for e in EVENTS if e[1] <= 36]
    out = {"months": months, "by_group": {}, "biomarkers": ["RSA", "RMSSD", "SDNN", "HDA_SA"]}
    # Real-world direction: RSA grows over infancy; ASIB group shows flatter slope
    for g in GROUPS:
        intercept = {"RSA": 3.2, "RMSSD": 28.0, "SDNN": 36.0, "HDA_SA": 450.0}
        slope = {
            "RSA":    {"ASIB": 0.04, "PT": 0.08, "TD": 0.11}[g],
            "RMSSD":  {"ASIB": 0.6,  "PT": 1.1,  "TD": 1.4}[g],
            "SDNN":   {"ASIB": 0.7,  "PT": 1.2,  "TD": 1.5}[g],
            "HDA_SA": {"ASIB": -1.5, "PT": -4.0, "TD": -5.5}[g],
        }
        noise = {"RSA": 0.15, "RMSSD": 2.0, "SDNN": 2.5, "HDA_SA": 28.0}
        traj = {}
        ci = {}
        for bm in ["RSA", "RMSSD", "SDNN", "HDA_SA"]:
            mean = [round(intercept[bm] + slope[bm] * m + rng.normal(0, noise[bm] * 0.25), 2) for m in months]
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
            {"date": (datetime.now() - timedelta(days=d)).strftime("%Y-%m-%d"),
             "action": a,
             "record_id": f"NANO-{rng.integers(1000, 9999):04d}",
             "user": u}
            for d, a, u in [
                (0, "QC pipeline run",     "pipeline_bot"),
                (0, "Double-entry check",   "ra_emma"),
                (1, "Imputation diagnostics","research_prog"),
                (1, "Field mapping update", "pi_bradshaw"),
                (2, "Bayley-4 score entered", "ra_sam"),
                (2, "ADOS-2 module coded",   "ra_julia"),
                (3, "Temperature data pushed","pipeline_bot"),
                (4, "ECG batch processed",   "research_prog"),
            ]
        ],
    }


def generate_cohort_table(n: int = 40) -> list[dict]:
    """Synthetic per-participant summary rows (IDs are fake)."""
    rows = []
    for i in range(n):
        g = rng.choice(list(GROUPS.keys()), p=[0.25, 0.5, 0.25])
        ga = int(rng.integers(24, 33) if g != "TD" else rng.integers(37, 41))
        enrolled_days = int(rng.integers(30, 900))
        last_event = EVENTS[min(len(EVENTS) - 1, int(enrolled_days / 90))][2]
        rows.append({
            "nano_id": f"NANO-{1000 + i:04d}",
            "group": g,
            "ga_weeks": ga,
            "birth_weight_g": int(rng.normal(1600 if g != "TD" else 3300, 400)),
            "sex": rng.choice(["M", "F"]),
            "last_visit": last_event,
            "completeness_pct": round(max(40, min(100, 90 + rng.normal(0, 10))), 1),
            "qc_status": rng.choice(["OK", "Review", "OK", "OK"], p=[0.7, 0.1, 0.1, 0.1]),
        })
    return rows


def build_payload() -> dict:
    """Assemble the full dashboard JSON payload."""
    return {
        "meta": {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
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
        "enrollment": generate_enrollment(),
        "visit_completion": generate_visit_completion(),
        "data_quality": generate_data_quality(),
        "ml_performance": generate_ml_performance(),
        "trajectories": generate_trajectories(),
        "redcap_audit": generate_redcap_audit(),
        "cohort_table": generate_cohort_table(),
    }


def main() -> None:
    out_path = Path(__file__).resolve().parents[1] / "data" / "dashboard_data.json"
    payload = build_payload()
    _atomic_write_json(out_path, payload)
    print(f"✓ Wrote synthetic dashboard payload → {out_path}")
    print(f"  generated_at: {payload['meta']['generated_at']}")
    print(f"  keys: {list(payload.keys())}")


if __name__ == "__main__":
    main()
