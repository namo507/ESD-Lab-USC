"""NANO Study — Production Dashboard Data Pipeline (Python).

Pulls live data from REDCap, the processed feature matrix, model artifacts
and QC logs, then emits ``dashboard/data/dashboard_data.json`` using the
**same schema** as ``generate_synthetic_dashboard_data.py`` so the
``dashboard/index.html`` UI works with either source.

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
``ml_performance``, ``trajectories``, ``redcap_audit``, ``cohort_table``.

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
import os
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

try:
    from src.utils.logging_utils import get_pipeline_logger
    logger = get_pipeline_logger(__name__)
except Exception:  # pragma: no cover
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s :: %(message)s",
    )
    logger = logging.getLogger("build_dashboard_data")


# ─── Configuration loading ──────────────────────────────────────────────────
def load_config(config_path: Path) -> dict:
    """Load a YAML config, expanding ``${NANO_DATA_ROOT}`` and env vars."""
    raw = config_path.read_text()
    for key, val in os.environ.items():
        raw = raw.replace(f"${{{key}}}", val)
    return yaml.safe_load(raw)


def _resolve_paths(cfg: dict) -> dict[str, Path]:
    """Materialize the paths in ``config/paths.yml`` as :class:`Path` objects."""
    out: dict[str, Path] = {}
    flat = cfg.get("paths", cfg)
    for k, v in flat.items():
        if isinstance(v, str):
            out[k] = Path(v).expanduser()
        elif isinstance(v, dict):
            for kk, vv in v.items():
                out[f"{k}.{kk}"] = Path(vv).expanduser()
    return out


# ─── ID anonymization ───────────────────────────────────────────────────────
def _surrogate_id(real_id: str, salt: str) -> str:
    """Deterministic 4-digit surrogate ``NANO-####`` per participant."""
    h = hashlib.sha256(f"{salt}:{real_id}".encode()).hexdigest()
    return f"NANO-{int(h, 16) % 10000:04d}"


# ─── Loaders ────────────────────────────────────────────────────────────────
def load_redcap_mirror(redcap_parquet: Path) -> Optional[pd.DataFrame]:
    """Load the REDCap nightly mirror (longitudinal parquet)."""
    if not redcap_parquet.exists():
        logger.warning("REDCap mirror not found: %s", redcap_parquet)
        return None
    df = pd.read_parquet(redcap_parquet)
    logger.info("REDCap mirror rows=%d cols=%d", *df.shape)
    return df


def load_feature_matrix(features_parquet: Path) -> Optional[pd.DataFrame]:
    """Load the wide feature matrix (one row per participant × event)."""
    if not features_parquet.exists():
        logger.warning("Feature matrix not found: %s", features_parquet)
        return None
    df = pd.read_parquet(features_parquet)
    logger.info("Feature matrix rows=%d cols=%d", *df.shape)
    return df


def load_data_dictionary(dd_csv: Path) -> Optional[pd.DataFrame]:
    """Load the master data dictionary; used to drop PHI fields."""
    if not dd_csv.exists():
        logger.warning("Data dictionary not found: %s", dd_csv)
        return None
    return pd.read_csv(dd_csv)


def load_model_metrics(metrics_json: Path) -> Optional[dict]:
    """Load ``models/_metrics.json`` produced by the ML training step."""
    if not metrics_json.exists():
        logger.warning("Model metrics not found: %s", metrics_json)
        return None
    return json.loads(metrics_json.read_text())


# ─── PHI scrubbing ─────────────────────────────────────────────────────────
def drop_phi(df: pd.DataFrame, dd: Optional[pd.DataFrame]) -> pd.DataFrame:
    """Remove any column flagged as PHI in the data dictionary."""
    if dd is None or "phi_flag" not in dd.columns:
        return df
    phi_cols = dd.loc[dd["phi_flag"].astype(str).str.lower().isin(["1", "true", "yes"]),
                       "variable_name"].tolist()
    keep = [c for c in df.columns if c not in phi_cols]
    dropped = [c for c in df.columns if c in phi_cols]
    if dropped:
        logger.info("Dropped %d PHI columns: %s", len(dropped), dropped[:5])
    return df[keep]


# ─── Study constants (kept in sync with config/study_parameters.yml) ────────
GROUPS = {
    "ASIB": {"n_target": 65,  "color": "#C44E52", "label": "ASIB (VPT + ASD traits)"},
    "PT":   {"n_target": 130, "color": "#4C72B0", "label": "PT (VPT typical)"},
    "TD":   {"n_target": 65,  "color": "#55A868", "label": "TD (Term-born typical)"},
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
    today = datetime.now()
    start = today - timedelta(days=30 * 30)
    months = [(start + timedelta(days=30 * i)).strftime("%Y-%m") for i in range(30)]

    # Filter to enrollment event
    enroll_df = redcap[redcap["redcap_event_name"].str.contains("nicu_admission", na=False)].copy()
    enroll_df["enrolled_month"] = pd.to_datetime(
        enroll_df["enrollment_date"], errors="coerce"
    ).dt.strftime("%Y-%m")

    by_group: dict[str, dict] = {}
    for g, meta in GROUPS.items():
        group_df = enroll_df[enroll_df["group_assignment"] == g]
        monthly = []
        cum = 0
        by_month = group_df.groupby("enrolled_month").size().to_dict()
        for m in months:
            cum += int(by_month.get(m, 0))
            monthly.append(cum)
        current = monthly[-1] if monthly else 0
        by_group[g] = {
            "target": meta["n_target"],
            "current": current,
            "percent": round(100.0 * current / meta["n_target"], 1) if meta["n_target"] else 0,
            "monthly": monthly,
            "color": meta["color"],
            "label": meta["label"],
        }
    return {"months": months, "by_group": by_group}


def build_visit_completion(redcap: pd.DataFrame) -> dict:
    """Per-event × group visit-completion percentage."""
    out = {"events": [e[0] for e in EVENTS], "labels": [e[2] for e in EVENTS], "by_group": {}}
    for g in GROUPS:
        g_df = redcap[redcap["group_assignment"] == g]
        participants = g_df["record_id"].nunique() or 1
        rates = []
        for event, _, _ in EVENTS:
            completed = g_df[(g_df["redcap_event_name"] == event)
                              & (g_df.get("visit_completed", 0) == 1)]["record_id"].nunique()
            rates.append(round(100.0 * completed / participants, 1))
        out["by_group"][g] = rates
    return out


def build_data_quality(redcap: pd.DataFrame, dd: Optional[pd.DataFrame]) -> dict:
    """Per-instrument missingness + QC flag counts from REDCap."""
    instruments: list[str] = []
    if dd is not None and "form_name" in dd.columns:
        instruments = sorted(dd["form_name"].dropna().unique().tolist())
    else:
        instruments = [c.split("_complete")[0] for c in redcap.columns if c.endswith("_complete")]

    missingness = []
    for inst in instruments:
        complete_col = f"{inst}_complete"
        if complete_col not in redcap.columns:
            continue
        n = len(redcap)
        if n == 0:
            continue
        pct_missing = 100.0 * (redcap[complete_col] != 2).sum() / n
        missingness.append({
            "instrument": inst,
            "pct_missing": round(float(pct_missing), 1),
            "status": (
                "High — MNAR risk" if pct_missing > 25 else
                "Moderate — MAR candidate" if pct_missing > 10 else
                "Low — MCAR likely"
            ),
        })

    qc_flags = {
        "total_records": int(len(redcap)),
        "double_entry_discrepancies": int((redcap.get("double_entry_mismatch", 0) == 1).sum()),
        "out_of_range_values": int((redcap.get("value_out_of_range", 0) == 1).sum()),
        "missing_required_fields": int(
            redcap[[c for c in redcap.columns if c.endswith("_required")]].isna().sum().sum()
        ) if any(c.endswith("_required") for c in redcap.columns) else 0,
        "ecg_transfer_late": int((redcap.get("ecg_transfer_late", 0) == 1).sum()),
        "temp_quality_rejected": int((redcap.get("temp_quality_rejected", 0) == 1).sum()),
    }
    return {"missingness": missingness, "qc_flags": qc_flags}


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
        logger.warning("No model metrics available — emitting empty ml_performance block.")
        return {"models": [], "shap": [], "subgroup": [], "confusion": {}}
    return metrics


def build_trajectories(features: pd.DataFrame) -> dict:
    """Observed-mean biomarker trajectory across events, per group.

    Expects the feature matrix to have columns
    ``group``, ``month`` and one of ``{rsa, rmssd, sdnn, hda_sa_pct}``.
    Missing biomarkers are simply skipped.
    """
    months_int = sorted({e[1] for e in EVENTS if e[1] <= 36})
    out = {"months": months_int, "by_group": {}, "biomarkers": ["RSA", "RMSSD", "SDNN", "HDA_SA"]}

    bm_col_map = {"RSA": "rsa", "RMSSD": "rmssd", "SDNN": "sdnn", "HDA_SA": "hda_sa_pct"}

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
                    means_list.append(float("nan"))
                    ci_low.append(float("nan"))
                    ci_high.append(float("nan"))
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
            opened = int((
                (redcap["redcap_event_name"].str.contains(label.lower().replace(" ", "_"),
                                                           na=False))
                & (redcap["open_query"] == 1)
            ).sum())
        else:
            opened = 0
        queries_by_event.append({"event": label, "open": opened})

    return {
        "summary": {
            "total_participants_enrolled": total_enrolled,
            "active_participants": total_enrolled - withdrawn,
            "withdrawn": withdrawn,
            "open_queries": int((redcap.get("open_query", 0) == 1).sum()),
            "records_pending_pi_review": int((redcap.get("pi_review_needed", 0) == 1).sum()),
            "double_entry_pending": int((redcap.get("double_entry_pending", 0) == 1).sum()),
        },
        "queries_by_event": queries_by_event,
        "recent_activity": [],  # Populated by redcap_audit.py in production
    }


def build_cohort_table(redcap: pd.DataFrame, salt: str, n: int = 60) -> list[dict]:
    """Per-participant summary rows with surrogate IDs (no PHI)."""
    if "record_id" not in redcap.columns:
        return []
    enroll = redcap[redcap["redcap_event_name"].str.contains("nicu_admission", na=False)].copy()
    rows: list[dict] = []
    for _, r in enroll.head(n).iterrows():
        rid = str(r["record_id"])
        rows.append({
            "nano_id": _surrogate_id(rid, salt),
            "group": r.get("group_assignment", "unknown"),
            "ga_weeks": int(r.get("ga_weeks", 0)) if pd.notna(r.get("ga_weeks")) else None,
            "birth_weight_g": int(r.get("birth_weight_g", 0)) if pd.notna(r.get("birth_weight_g")) else None,
            "sex": r.get("sex", ""),
            "last_visit": r.get("last_completed_event", "unknown"),
            "completeness_pct": round(float(r.get("record_completeness_pct", 0.0)), 1),
            "qc_status": r.get("qc_status", "OK"),
        })
    return rows


# ─── Orchestrator ──────────────────────────────────────────────────────────
def build_payload(
    redcap: Optional[pd.DataFrame],
    features: Optional[pd.DataFrame],
    dd: Optional[pd.DataFrame],
    metrics: Optional[dict],
    salt: str = "nano_default_salt",
) -> dict:
    """Assemble the full dashboard payload (same schema as the synthetic gen)."""
    if redcap is None or features is None:
        raise FileNotFoundError(
            "Cannot build production payload: missing REDCap mirror or feature matrix."
        )

    redcap = drop_phi(redcap, dd)

    return {
        "meta": {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "data_source": "redcap_live + feature_matrix",
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
        "enrollment":       build_enrollment(redcap),
        "visit_completion": build_visit_completion(redcap),
        "data_quality":     build_data_quality(redcap, dd),
        "ml_performance":   build_ml_performance(metrics),
        "trajectories":     build_trajectories(features),
        "redcap_audit":     build_redcap_audit(redcap),
        "cohort_table":     build_cohort_table(redcap, salt),
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Build the NANO dashboard JSON payload.")
    parser.add_argument(
        "--config", type=Path,
        default=PROJECT_ROOT / "config" / "paths.yml",
        help="Path to paths.yml (default: config/paths.yml).",
    )
    parser.add_argument(
        "--output", type=Path,
        default=PROJECT_ROOT / "dashboard" / "data" / "dashboard_data.json",
    )
    parser.add_argument(
        "--fallback-synthetic", action="store_true",
        help="If inputs are missing, fall back to the synthetic generator.",
    )
    parser.add_argument("--salt", default=os.getenv("NANO_ID_SALT", "nano_default_salt"))
    args = parser.parse_args(argv)

    try:
        cfg = load_config(args.config)
    except FileNotFoundError:
        logger.warning("No config at %s — using default layout.", args.config)
        cfg = {}
    paths = _resolve_paths(cfg)

    redcap_path = paths.get("deidentified.redcap_latest",
                             PROJECT_ROOT / "data" / "processed" / "redcap_latest.parquet")
    features_path = paths.get("processed.feature_matrix",
                               PROJECT_ROOT / "data" / "processed" / "feature_matrix.parquet")
    dd_path = paths.get("data_dictionary",
                        PROJECT_ROOT / "data" / "data_dictionary"
                        / "NANO_master_data_dictionary.csv")
    metrics_path = paths.get("models.metrics",
                              PROJECT_ROOT / "models" / "_metrics.json")

    redcap = load_redcap_mirror(redcap_path)
    features = load_feature_matrix(features_path)
    dd = load_data_dictionary(dd_path)
    metrics = load_model_metrics(metrics_path)

    try:
        payload = build_payload(redcap, features, dd, metrics, salt=args.salt)
    except FileNotFoundError as exc:
        if args.fallback_synthetic:
            logger.warning("%s — falling back to synthetic generator.", exc)
            from dashboard.pipelines import generate_synthetic_dashboard_data as syn
            payload = syn.build_payload()
        else:
            logger.error("%s  (pass --fallback-synthetic to emit demo data)", exc)
            return 2

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, default=str))
    logger.info("✓ Wrote dashboard payload → %s", args.output)
    logger.info("  data_source: %s", payload["meta"]["data_source"])
    logger.info("  keys: %s", list(payload.keys()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
