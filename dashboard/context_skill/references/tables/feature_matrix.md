# Feature Matrix — Column Glossary

`data/processed/feature_matrix.parquet` is the **wide** modeling matrix
produced by `src/feature_engineering/`. It is one row per
(participant × event) joined with all derived ECG, temperature, and
behavioral features.

The dashboard pipeline only reads a small set of columns; the rest are
left for downstream modeling.

| Column | Type | Used by | Source step |
|--------|------|---------|-------------|
| `record_id`     | int   | join key | from REDCap |
| `event`         | str   | join key | one of the 9 events |
| `month`         | int   | trajectories | corrected months (0…36) |
| `group`         | str   | trajectories, ML | `ASIB` / `PT` / `TD` |
| `rsa`           | float | Trajectories chart (RSA) | `compute_rsa_cwt` (log-power) |
| `rmssd`         | float | Trajectories + ML | `compute_time_domain_hrv` |
| `sdnn`          | float | Trajectories + ML | `compute_time_domain_hrv` |
| `hda_sa_pct`    | float | Trajectories (HDA_SA) | `identify_hda_phases` → percent of window in SA |
| `cptd_mean`     | float | ML (`cptd_nicu`) | `src/preprocessing/temperature_pipeline.py` |
| `sample_entropy`| float | ML | `compute_sample_entropy` |
| `sd1`, `sd2`    | float | ML | `compute_poincare_features` |
| `nnns_attention`| float | ML | NNNS-II clinical scoring |
| `mchat_total`   | float | ML | M-CHAT-R/F summed positive items |
| `bayley_cog`    | float | ML | Bayley-4 cognitive composite |

## Aggregation rules used by `build_trajectories`

* Drop NA per cell, then take the mean.
* Require `n ≥ 3` infants per cell, otherwise emit `NaN` (UI shows a
  gap in the line chart).
* CI is `mean ± 1.96 · SE` (normal approximation).
* Means and CIs are rounded to 3 decimals before serialization.

## Adding a new biomarker

1. Add the column to the feature engineering step that produces it.
2. Add the (`label`, `column`) entry to:
   * `dashboard/pipelines/build_dashboard_data.py::bm_col_map`
   * `dashboard/pipelines/build_dashboard_data.R::bm_map`
   * `dashboard/pipelines/generate_synthetic_dashboard_data.py` (extend
     `generate_trajectories`).
3. Add a short blurb here in this file.
4. If the biomarker should be visible in the current UI, add it to the relevant selector or control in `web/src/**`.
