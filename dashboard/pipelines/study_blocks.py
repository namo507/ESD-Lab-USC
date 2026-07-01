"""Canonical NANO/NICO study blocks for dashboard payloads.

The live SPA expects additive ``nano``, ``nico``, and ``shared`` keys in
``dashboard_data.json``.  Production data builders can later replace the
placeholder values with real REDCap/model outputs, but the structural contract
must always be present so the dual-study routes and assistant stay healthy.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _growth_points(
    *,
    asib_start: float,
    asib_slope: float,
    pt_start: float,
    pt_slope: float,
    td_start: float,
    td_slope: float,
) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    for group, start, slope in (
        ("asib", asib_start, asib_slope),
        ("pt", pt_start, pt_slope),
        ("td", td_start, td_slope),
    ):
        for month in (1, 2, 3):
            mean = round(start + slope * (month - 1), 2)
            points.append(
                {
                    "group": group,
                    "timepoint_m": month,
                    "mean": mean,
                    "ci_low": round(mean * 0.86, 2),
                    "ci_high": round(mean * 1.14, 2),
                }
            )
    return points


def _individual_traces(group: str, start: float, slope: float) -> list[dict[str, Any]]:
    traces: list[dict[str, Any]] = []
    for index in range(1, 4):
        traces.append(
            {
                "group": group,
                "participant": f"{group.upper()}-{index:02d}",
                "values": [
                    {
                        "timepoint_m": month,
                        "value": round(start + slope * (month - 1) + (index - 2) * 0.7, 2),
                    }
                    for month in (1, 2, 3)
                ],
            }
        )
    return traces


def _lgcm_outcome(
    *,
    asib_start: float,
    asib_slope: float,
    pt_start: float,
    pt_slope: float,
    td_start: float,
    td_slope: float,
) -> dict[str, Any]:
    return {
        "asib_intercept_mean": asib_start,
        "asib_slope_mean": asib_slope,
        "pt_intercept_mean": pt_start,
        "pt_slope_mean": pt_slope,
        "td_intercept_mean": td_start,
        "td_slope_mean": td_slope,
        "asib_vs_td_intercept_p": 0.018,
        "asib_vs_td_slope_p": 0.006,
        "pt_vs_td_intercept_p": 0.004,
        "pt_vs_td_slope_p": 0.021,
        "growth_curves": _growth_points(
            asib_start=asib_start,
            asib_slope=asib_slope,
            pt_start=pt_start,
            pt_slope=pt_slope,
            td_start=td_start,
            td_slope=td_slope,
        ),
        "individual_traces": [
            *_individual_traces("asib", asib_start, asib_slope),
            *_individual_traces("pt", pt_start, pt_slope),
            *_individual_traces("td", td_start, td_slope),
        ],
    }


def build_study_blocks(generated_at: str | None = None) -> dict[str, Any]:
    """Return additive dual-study blocks consumed by the React SPA."""

    timestamp = generated_at or _iso_now()
    return {
        "nano": {
            "study_meta": {
                "award": "R01MH132925",
                "start_date": "2023-07-01",
                "end_date": "2028-06-30",
                "n_target": 200,
                "n_target_asib": 75,
                "n_target_pt": 75,
                "n_target_td": 50,
                "pi": "Jessica Bradshaw, PhD",
            },
            "enrollment": {
                "asib": 26,
                "pt": 31,
                "td": 19,
                "total": 76,
                "last_updated": timestamp,
                "by_ga_stratum": {"24_26w": 9, "27_29w": 11, "30_32w": 11},
            },
            "active_followup": {"1_3m": 22, "6_12m": 34, "24_36m": 20},
            "ecg_quality": {
                "pct_valid_ecg_by_visit": {
                    "1m": 0.94,
                    "2m": 0.92,
                    "3m": 0.90,
                    "6m": 0.88,
                    "9m": 0.85,
                    "12m": 0.86,
                },
                "pct_hda_synced_by_visit": {
                    "1m": 0.97,
                    "2m": 0.95,
                    "3m": 0.93,
                    "6m": 0.90,
                    "9m": 0.89,
                    "12m": 0.90,
                },
                "flagged_participants": ["ASIB-07", "PT-14"],
            },
            "hda_features": {"by_participant_visit": []},
            "lgcm_results": {
                "pct_sa": _lgcm_outcome(
                    asib_start=34.0,
                    asib_slope=3.1,
                    pt_start=30.0,
                    pt_slope=3.6,
                    td_start=38.0,
                    td_slope=4.4,
                ),
                "hr_decel": _lgcm_outcome(
                    asib_start=3.4,
                    asib_slope=0.18,
                    pt_start=3.0,
                    pt_slope=0.25,
                    td_start=4.2,
                    td_slope=0.34,
                ),
                "rsa": _lgcm_outcome(
                    asib_start=2.1,
                    asib_slope=0.09,
                    pt_start=1.8,
                    pt_slope=0.14,
                    td_start=2.4,
                    td_slope=0.18,
                ),
            },
            "ml_results": {
                "r2_by_outcome": {
                    "ados_total_css": {"1_3m": 0.19, "6_12m": 0.25},
                    "ados_social_affect": {"1_3m": 0.17, "6_12m": 0.23},
                },
                "outcomes": ["ados_total_css", "ados_social_affect"],
                "windows": ["1_3m", "6_12m"],
                "feature_importance": [
                    {"feature": "pct_sa_slope", "mean_abs_shap": 0.19},
                    {"feature": "rsa_3m", "mean_abs_shap": 0.16},
                    {"feature": "hr_decel_6m", "mean_abs_shap": 0.13},
                ],
            },
            "preliminary_finding": {
                "label": "MLP ASD-likelihood classification",
                "value": 0.86,
                "type": "accuracy",
                "n": 23,
                "pilot": True,
            },
        },
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
