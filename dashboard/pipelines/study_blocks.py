"""Canonical NANO/NICO study blocks for dashboard payloads.

The live SPA expects additive ``nano``, ``nico``, and ``shared`` keys in
``dashboard_data.json``.  Production data builders can later replace the
placeholder values with real REDCap/model outputs, but the structural contract
must always be present so the dual-study routes and assistant stay healthy.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any

from dashboard.pipelines.nano_study import build_nano_contract


def _iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_study_blocks(
    generated_at: str | None = None,
    *,
    data_source: str = "synthetic_demo",
    aggregates: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Return additive study blocks consumed by the React SPA.

    NANO is derived from the caller's aggregate payload.  NICO and shared
    retain their existing additive contracts until their producers are moved to
    the same aggregate-only boundary.
    """

    timestamp = generated_at or _iso_now()
    return {
        "nano": build_nano_contract(
            generated_at=timestamp,
            source=data_source,
            aggregates=aggregates,
        ),
        "nico": {
            "study_meta": {
                "award": "R01MH138028",
                "start_date": "2025-04-01",
                "end_date": "2030-03-31",
                "n_target_enrolled": 260,
                "n_target_completers": 200,
                "n_monthly_target": 12,
                "pi": "Robin Dail, PhD and Jessica Bradshaw, PhD",
            },
            "enrollment": {
                "total_enrolled": 41,
                "in_nicu": 12,
                "discharged": 29,
                "completed_12m": 8,
                "completed_24m": 3,
                "completed_36m": 0,
                "last_updated": timestamp,
            },
            "participants": [
                {
                    "participant": f"VPT-{index:03d}",
                    "ga_weeks": round(24.8 + (index % 7) * 0.8, 1),
                    "birthweight_g": 620 + index * 83,
                    "days_in_nicu": 42 + index * 9,
                    "status": "in_nicu" if index in {2, 5, 7} else "discharged",
                    "morbidities": ["PDA"] if index % 3 == 0 else ([] if index % 2 else ["NEC"]),
                }
                for index in range(1, 9)
            ],
            "thermal_data": {
                "by_participant_day": [],
                "summary_stats": {
                    "n_participant_days": 1284,
                    "pct_days_ge_80_valid": 0.91,
                    "median_cptd": 1.4,
                    "pct_days_abnormal_cold": 0.12,
                    "pct_days_abnormal_hot": 0.08,
                },
            },
            "hrc_scores": {
                "by_participant_day": [],
                "alert_threshold": 5,
                "summary": {
                    "alert_threshold": 5,
                    "n_alerts_last_7d": 6,
                    "pct_windows_below_discard": 0.94,
                },
            },
            "hri_features": {
                "by_participant_window": [],
                "feature_names": [
                    "hrv",
                    "ln_rmssd",
                    "rsa_cwt",
                    "mean_nn",
                    "sd_nn",
                    "nn_sample_entropy",
                    "rmssd",
                    "sd1",
                    "sd2",
                    "cvnn",
                    "hti",
                    "sai",
                    "pai",
                ],
            },
            "morbidities": {
                "by_participant": [],
                "cohort_rates": {
                    "sbi": 0.11,
                    "sep": 0.24,
                    "nec": 0.09,
                    "bpd": 0.38,
                    "pda": 0.31,
                    "rop": 0.19,
                },
            },
            "followup_visits": {"by_participant": []},
            "aim1_ml_results": {"r2_by_outcome": {}, "feature_importance": [], "shap_values": {}},
            "aim2_moderation": {"moderators": ["sex", "morbidity_score"], "models": []},
            "aim3_clusters": {
                "n_clusters": 3,
                "silhouette_score": 0.42,
                "epsilon": 0.8,
                "min_samples": 5,
                "tsne_coords": [
                    {
                        "participant": f"VPT-{index:03d}",
                        "x": round(-8 + index * 2.1, 2),
                        "y": round((index % 4) * 1.8 - 2.7, 2),
                        "cluster": index % 3,
                        "ados_css": 2 + index % 7,
                        "ga_weeks": round(25.0 + (index % 6) * 0.9, 1),
                        "top_shap_feature": ["median_cptd", "ln_rmssd", "morbidity_score"][index % 3],
                    }
                    for index in range(1, 16)
                ],
                "trajectory_by_cluster": {
                    "0": {"12m": 2.8, "24m": 3.2, "36m": 3.7},
                    "1": {"12m": 4.1, "24m": 5.0, "36m": 5.9},
                    "2": {"12m": 3.4, "24m": 4.0, "36m": 4.8},
                },
                "trajectory_metrics": ["ADOS CSS", "Bayley cognitive", "Bayley motor"],
                "hotelling_t2_matrix": [[0, 4.8, 3.2], [4.8, 0, 2.9], [3.2, 2.9, 0]],
                "cluster_ados_css": {"0": 3.7, "1": 5.9, "2": 4.8},
            },
            "preliminary_finding": {
                "label": "HRC Score x SORF ASD symptoms at 12m",
                "r": 0.81,
                "p": 0.01,
                "n": 20,
                "pilot": True,
                "scatter_points": [
                    {"hrc_score": 1.2, "sorf_asd_symptoms": 4.1},
                    {"hrc_score": 2.4, "sorf_asd_symptoms": 5.0},
                    {"hrc_score": 3.1, "sorf_asd_symptoms": 6.2},
                    {"hrc_score": 4.6, "sorf_asd_symptoms": 7.8},
                    {"hrc_score": 5.2, "sorf_asd_symptoms": 8.5},
                    {"hrc_score": 6.0, "sorf_asd_symptoms": 9.1},
                ],
            },
        },
        "shared": {
            "data_pipeline_run": {
                "last_success": timestamp,
                "last_error": "",
                "stages_passed": [
                    "redcap_nano",
                    "redcap_nico",
                    "ecg_nano",
                    "thermal_nico",
                    "hri_extraction",
                    "lgcm_nano",
                    "ctmc_nano",
                    "mlp_nano",
                    "svr_nico",
                    "moderation_nico",
                    "dbscan_nico",
                    "json_build",
                ],
                "stages": [
                    {"id": "redcap_nano", "label": "REDCap NANO", "status": "ok"},
                    {"id": "redcap_nico", "label": "REDCap NICO", "status": "ok"},
                    {"id": "ecg_nano", "label": "ECG NANO", "status": "ok"},
                    {"id": "thermal_nico", "label": "Thermal NICO", "status": "ok"},
                    {"id": "hri_extraction", "label": "HRI Extraction", "status": "ok"},
                    {"id": "lgcm_nano", "label": "LGCM NANO", "status": "ok"},
                    {"id": "ctmc_nano", "label": "CTMC NANO", "status": "warn"},
                    {"id": "mlp_nano", "label": "MLP NANO", "status": "ok"},
                    {"id": "svr_nico", "label": "SVR NICO", "status": "ok"},
                    {"id": "moderation_nico", "label": "Moderation NICO", "status": "ok"},
                    {"id": "dbscan_nico", "label": "DBSCAN NICO", "status": "ok"},
                    {"id": "json_build", "label": "JSON Build", "status": "ok"},
                ],
                "record_deltas": {
                    "new_participants": 3,
                    "new_ecg_windows": 1440,
                    "new_redcap_entries": 42,
                    "new_thermal_days": 21,
                },
                "git_sha": "seed0000",
            },
            "changelog": [
                {
                    "timestamp": timestamp,
                    "build": "seed0000",
                    "summary": "+3 NANO participants, +2 NICO participants, +1440 ECG windows, 0 QA flags",
                }
            ],
        },
    }
