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
| `hda_composition.by_group.<g>[]` | CGA Milestone River | `build_hda_stream()` TODO over accepted HDA epochs | — | yes |
| `attrition_funnel.stages[] / reason_codes[] / trend_by_quarter[]` | Attrition Funnel v2 | `build_attrition_funnel()` TODO over REDCap retention + reason fields | — | yes |
| `county_profiles[]` | County Comparator + Public Insights | `build_county_profiles()` TODO over county-level aggregate FIPS profiles | — | yes |
| `redcap_audit.summary` | Quality KPIs + audit chips | `build_redcap_audit()` | `build_redcap_audit` | yes |
| `redcap_audit.queries_by_event[]` | Quality *Queries* bar chart | same | same | yes |
| `redcap_audit.recent_activity[]` | Quality audit table | `redcap_audit.py` activity log | — (R leaves empty) | yes |
| `cohort_table[]` | Cohort section table | `build_cohort_table()` with surrogate IDs | `build_cohort_table` | yes |
| `organization_site.summary / mission / studies / impact_feed[]` | ESD Lab organization + impact sections | `build_org_site_data.build_payload()` | same schema target via R wrapper | yes |
| `research_questions.meta / questions[] / rollups / matrix[]` | Research Questions section (KPIs, heatmap, card grid, filters) | `build_research_questions_data.py` over `research_questions.json` | — (Python only) | yes (static catalog) |
| `nano.meta / enrollment / attention / autonomic` | `/nano/dashboard` hero, KPI, cohort, and research cards | `build_nano_contract()` over existing aggregate blocks | n/a (Python only) | yes |
| `nano.schedule.timepoints[]` | NANO visit schedule tracker | Aggregate visit completion and schedule builders | n/a (Python only) | yes |
| `nano.pipeline[] / assessments[]` | NANO pipeline quality and assessment matrix | Aggregate pipeline, feature, completion, and quality summaries | n/a (Python only) | yes |
| `nano.inventory[] / checklists / redcap / models / library` | NANO operations hub, model status, and Library link | Reviewed operations metadata and aggregate runtime summaries | n/a (Python only) | yes |

## REDCap Contract (v2)

| JSON Key | UI / Assistant Consumer | Source | Computation |
|----------|-------------------------|--------|-------------|
| `redcap_meta` | `/redcap` freshness, Ask AI freshness answers, Buddy status | `build_redcap_*` builders | Generated from the canonical YAML and current REDCap mirror |
| `redcap_completion_stats` | `/redcap` stacked bars, `/public-insights` REDCap section | Python/R dashboard builders | Counts `csbs_caregiver_complete` by 6m, 9m, 12m, and 24m events |
| `redcap_visit_health.data` | `/redcap` visit grid, Buddy R-code answers | Python/R dashboard builders | Groups de-identified records by event and applies R1-R5 carry-forward logic |
| `redcap_visit_health.anomaly_count` | Anomaly KPI and public aggregate tile | Same | Count of rows with any R1-R5 flag |

## Invariants the UI assumes

1. `enrollment.months` has length **30** (most recent 30 calendar months).
2. `trajectories.months` = `[0, 1, 2, 3, 6, 9, 12, 24, 36]`.
3. `hda_composition.by_group.<g>[].month` uses `[0, 1, 2, 3, 6, 9, 12, 24, 36]`.
4. Every `by_group` dict has keys `ASIB`, `PT`, `TD` (in that order), with frontend API normalizing `PT` to `VPT`.
5. `ml_performance.models[].roc.fpr/tpr` are length 50.
6. All percentages are already rounded to one decimal.
7. `county_profiles[]` is county-level only; no ZIP, census tract, address, or raw participant location data.
8. `research_questions.questions[]` uses the controlled vocabulary of 8
   categories and 8 type-tags declared in
   `dashboard/research_questions/research_questions.md`. The UI's
   Category × Type-tag heatmap iterates over `meta.categories` × `meta.type_tags`.
9. `nano.meta.aggregate_only` is always true, target enrollment is 260, and
   `nano.enrollment.by_group` uses targets ASIB 65, PT 130, and TD 65.
10. `nano.schedule.timepoints` contains exactly the nine public count-only
    timepoints from `nicu_admission` through `month_36`.
11. No object below `nano` may contain a participant identifier, participant
    row, raw signal, date of birth, medical record number, or free-text note.
    Null means unavailable; numeric zero remains a measured zero.

If you change any of these, also update:
* the current consumers in `web/src/**` or `dashboard/server/live_dashboard_server.py`
* `dashboard/pipelines/generate_synthetic_dashboard_data.py`
* This document.

## Contract test

`pytest tests/test_dashboard_contract.py` (added in Task 8) runs a
schema validator against both the synthetic output and the production
output. Keep it green before shipping a pipeline change.
