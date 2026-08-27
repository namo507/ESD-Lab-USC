# REDCap PID 5955 — NANO Study Surveys Contract

This glossary describes the REDCap structure used by the live dashboard,
the grounded ESD Buddy assistant, and the public insight tiles. It is PHI-free and
should be regenerated from `config/redcap_config.yml` when the contract
changes.

<!-- AUTO:start -->
## Project

| Field | Value |
|---|---|
| PID | `5955` |
| Title | Namit - NANO Study Surveys |
| Longitudinal | yes |
| Missing data codes | `SKIP` |

## Events

| Event | Label | Visit-date available |
|---|---|---|
| `consent_arm_1` | Consent | no |
| `caregiver_1_arm_1` | Caregiver 1 | no |
| `caregiver_2_arm_1` | Caregiver 2 | no |
| `sibling_arm_1` | Sibling | no |
| `1_month_arm_1` | 1 Month | yes |
| `2_months_arm_1` | 2 Months | yes |
| `3_months_arm_1` | 3 Months | yes |
| `6_months_arm_1` | 6 Months | yes |
| `9_months_arm_1` | 9 Months | yes |
| `12_months_arm_1` | 12 Months | yes |
| `24_months_arm_1` | 24 Months | yes |
| `36_months_arm_1` | 36 Months | yes |

## Carry-Forward Monitor

| Concept | REDCap source |
|---|---|
| Visit anchor instrument | `visit_occurred` |
| Visit date field | `visit_date` |
| CSBS instrument | `csbs_caregiver` |
| CSBS complete field | `csbs_caregiver_complete` |
| Monitored events | `6_months_arm_1`, `9_months_arm_1`, `12_months_arm_1`, `24_months_arm_1` |
| Browser write policy | Read-only; writes run through audited server-side scripts |

## Status Codes

| REDCap value | Meaning | Dashboard token | Normalized value |
|---|---|---|---|
| `0` | Incomplete | `status-red` | `incomplete` |
| `1` | Unverified | `status-amber` | `unverified` |
| `2` | Complete | `status-green` | `complete` |
| `` | Not started | `status-grey` | `not_started` |
| `SKIP` | Skipped | `status-blue` | `skipped` |

## Carry-Forward Anomaly Codes

| Code | Meaning |
|---|---|
| `R1` | 6m CSBS incomplete and 9m visit_date set |
| `R2` | 9m CSBS incomplete and 12m visit_date set |
| `R3` | 6m CSBS blank but 9m CSBS complete |
| `R4` | 9m CSBS blank but 12m CSBS complete |
| `R5` | 12m CSBS incomplete and 24m visit_date set |

## Dashboard JSON Keys

| JSON key | Feeds |
|---|---|
| `redcap_meta.generated_at` | Buddy freshness line, Ask AI freshness answers, `/redcap` sync status |
| `redcap_meta.record_count` | Buddy freshness answers, anomaly banner context |
| `redcap_meta.anomaly_count` | `/redcap` anomaly banner, Ask AI carry-forward answers |
| `redcap_completion_stats` | `/redcap` stacked completeness chart, `/public-insights` REDCap tiles |
| `redcap_visit_health.data` | `/redcap` visit-health grid, Buddy R-code record answers |
| `redcap_visit_health.anomaly_count` | Public and internal anomaly KPI |
<!-- AUTO:end -->

## Field Notes

`visit_occurred.visit_date` exists only on visit events. Consent,
caregiver, and sibling events must be treated as not having visit dates.

## Live Mirror Fields Consumed

These fields come from the nightly REDCap mirror or its audited
post-processing layer. They are allowed in aggregate builders, but raw
identifiers must still be replaced before JSON is committed.

| Field | Purpose |
|---|---|
| `record_id` | Internal join key before surrogate ID generation |
| `redcap_event_name` | Longitudinal event selector |
| `enrollment_date` | Enrollment trend month derivation |
| `group_assignment` | Cohort group aggregation |
| `visit_completed` | Visit-completion percentages |
| `withdrawn` | Active-participant and attrition counts |
| `last_completed_event` | De-identified cohort table summary |
| `record_completeness_pct` | De-identified cohort table summary |
| `qc_status` | De-identified cohort table summary |

All record identifiers written to `dashboard/data/dashboard_data.json`
must be de-identified surrogate IDs. Raw REDCap IDs, names, phone
numbers, email addresses, DOBs, street addresses, MRNs, and any
`phi_fields` listed in `config/redcap_config.yml` must not appear in
committed dashboard JSON or assistant context.

The dashboard should use the committed JSON as the default source of
truth. The Cloudflare `/api/redcap` proxy is read-only and exists only
for live freshness checks or metadata reads; it must not import, delete,
or mutate records from the browser.
