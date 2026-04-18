# REDCap Mirror — Column Glossary

The nightly mirror `data/processed/redcap_latest.parquet` is one row per
(participant × event). Here are the columns the dashboard pipeline
touches. Anything not listed here is either PHI (stripped via
`drop_phi`) or untouched by the aggregator.

| Column | Type | Used by | Notes |
|--------|------|---------|-------|
| `record_id` | int | all builders | Hashed to `NANO-####` before leaving the secure mount |
| `redcap_event_name` | str | all builders | One of the 9 NANO events |
| `group_assignment`  | str | enrollment, trajectories | `ASIB`, `PT`, or `TD` |
| `enrollment_date`   | date | enrollment | Parsed with `pd.to_datetime`; drives the enrollment curve |
| `visit_completed`   | 0/1  | visit_completion | `1` = the event is done, not just scheduled |
| `withdrawn`         | 0/1  | redcap_audit | Counted once per participant |
| `open_query`        | 0/1  | redcap_audit | Any REDCap data-entry query open at the time of export |
| `pi_review_needed`  | 0/1  | redcap_audit | Flagged by QC for Dr. Bradshaw to review |
| `double_entry_pending` | 0/1 | redcap_audit | Second entry not yet performed |
| `double_entry_mismatch` | 0/1 | data_quality | Second-entry value differs from first |
| `value_out_of_range` | 0/1 | data_quality | Any validated field flagged by REDCap's validation rules |
| `ecg_transfer_late` | 0/1 | data_quality | Raw ECG file arrived more than 48h after the visit |
| `temp_quality_rejected` | 0/1 | data_quality | Temp logger dropped a required sensor |
| `ga_weeks`          | int  | cohort_table | Gestational age in weeks at birth |
| `birth_weight_g`    | int  | cohort_table | Grams |
| `sex`               | M/F  | cohort_table | Reporter-assigned birth sex |
| `last_completed_event` | str | cohort_table | Most recent event with `visit_completed == 1` |
| `record_completeness_pct` | float | cohort_table | Summary completeness across all events |
| `qc_status`         | str  | cohort_table | `OK` / `Review` / `Hold` |
| `<instrument>_complete` | 0/1/2 | data_quality | REDCap standard; `2 == complete` |

## Fields considered PHI (stripped before aggregation)

Any column with `phi_flag in {1, true, yes}` in
`data/data_dictionary/NANO_master_data_dictionary.csv` is dropped
before the payload is written. Typical PHI columns include
`caregiver_name`, `caregiver_phone`, `child_dob`, `street_address`,
`mrn` — none of these ever reach the dashboard JSON.
