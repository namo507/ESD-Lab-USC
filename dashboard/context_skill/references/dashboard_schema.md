# Dashboard JSON Schema → Data Source

The dashboard UI reads `dashboard/data/dashboard_data.json`. Below is
each top-level key, the widget that consumes it, and the source that
populates it in the production pipeline.

| JSON key | Widget on UI | Source (production) | Source (R pipeline) | Synthetic? |
|----------|--------------|---------------------|---------------------|------------|
| `meta` | Top-bar chip + generated-at footer | `build_payload()` | same | yes |
| `enrollment.by_group.<g>.monthly` | Overview line chart | `build_enrollment()` over `redcap[nicu_admission]` | `build_enrollment` (R) | yes |
| `enrollment.by_group.<g>.current/percent` | Overview KPI cards | same as above | same | yes |
| `visit_completion.by_group.<g>` | Trajectories stacked bar | `build_visit_completion()` using `visit_completed == 1` | `build_visit_completion` | yes |
| `data_quality.missingness[]` | Quality horizontal bar | `build_data_quality()` from `<instrument>_complete != 2` | `build_data_quality` | yes |
| `data_quality.qc_flags` | Quality KPI cards & bar | `build_data_quality()` from REDCap flag columns | `build_data_quality` | yes |
| `ml_performance.models[]` | ML ROC curves + AUROC bars | `models/_metrics.json` | `metrics.json` | yes |
| `ml_performance.shap[]` | ML SHAP horizontal bar | `_metrics.json → shap[]` | same | yes |
| `ml_performance.subgroup[]` | ML subgroup table | `_metrics.json → subgroup[]` | same | yes |
| `ml_performance.confusion` | ML confusion summary | `_metrics.json → confusion` | same | yes |
| `trajectories.by_group.<g>.mean[bm]` | Trajectories line chart (mean) | `build_trajectories()` → `mean(feature)` by `month × group` | `build_trajectories` | yes |
| `trajectories.by_group.<g>.ci[bm]` | Trajectories shaded band | `mean ± 1.96 · SE` | same | yes |
| `redcap_audit.summary` | Quality KPIs + audit chips | `build_redcap_audit()` | `build_redcap_audit` | yes |
| `redcap_audit.queries_by_event[]` | Quality *Queries* bar chart | same | same | yes |
| `redcap_audit.recent_activity[]` | Quality audit table | `redcap_audit.py` activity log | — (R leaves empty) | yes |
| `cohort_table[]` | Cohort section table | `build_cohort_table()` with surrogate IDs | `build_cohort_table` | yes |
| `organization_site.summary / mission / studies / impact_feed[]` | ESD Lab organization + impact sections | `build_org_site_data.build_payload()` | same schema target via R wrapper | yes |
| `research_questions.meta / questions[] / rollups / matrix[]` | Research Questions section (KPIs, heatmap, card grid, filters) | `build_research_questions_data.py` over `research_questions.json` | — (Python only) | yes (static catalog) |

## Invariants the UI assumes

1. `enrollment.months` has length **30** (most recent 30 calendar months).
2. `trajectories.months` = `[0, 1, 2, 3, 6, 9, 12, 24, 36]`.
3. Every `by_group` dict has keys `ASIB`, `PT`, `TD` (in that order).
4. `ml_performance.models[].roc.fpr/tpr` are length 50.
5. All percentages are already rounded to one decimal.
6. `research_questions.questions[]` uses the controlled vocabulary of 8
   categories and 8 type-tags declared in
   `dashboard/research_questions/research_questions.md`. The UI's
   Category × Type-tag heatmap iterates over `meta.categories` × `meta.type_tags`.

If you change any of these, also update:
* `dashboard/index.html` (where Chart.js assumes the shape)
* `dashboard/pipelines/generate_synthetic_dashboard_data.py`
* This document.

## Contract test

`pytest tests/test_dashboard_contract.py` (added in Task 8) runs a
schema validator against both the synthetic output and the production
output. Keep it green before shipping a pipeline change.
