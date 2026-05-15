# QC Flag Codex

Every REDCap flag that surfaces on the dashboard, what it means, and
the team member who owns the resolution.

| Flag column | Meaning | Raised by | Owner | Resolution path |
|-------------|---------|-----------|-------|-----------------|
| `double_entry_mismatch` | The two independent data entries disagree | REDCap double-entry module | Data Coordinator | Pull chart of record, pick correct value, note in REDCap log |
| `double_entry_pending`  | Second entry not yet performed for a locked record | Daily cron | Data Coordinator | Assign a second RA before next weekly audit |
| `open_query`            | An analyst opened a data-entry query and it is not resolved | Analysts | Data Coordinator → RA who collected the field | Respond in-query; auto-closes when `query_status == closed` |
| `pi_review_needed`      | QC pipeline flagged a record for PI eyes | `redcap_audit.py` | Dr. Bradshaw | PI either approves or sends back with a comment |
| `value_out_of_range`    | Any validated REDCap field violated its range rule | REDCap validation rule | Entry RA | Re-check source document, correct or add comment |
| `ecg_transfer_late`     | HeRO / Actiheart file arrived >48h after visit | ECG pipeline | Research Programmer | Follow up with NICU team or ECG RA |
| `temp_quality_rejected` | Skin-temp logger dropped a required sensor during the window | Temp pipeline | Research Programmer | Mark record unusable for CPTd; re-run CPTd without that subject |

## Severity taxonomy (used in Missingness cards)

| `pct_missing` | Label | Statistical assumption it suggests |
|---------------|-------|------------------------------------|
| `< 10%` | Low — MCAR likely | Multiple imputation is defensible with m = 10 |
| `10–25%` | Moderate — MAR candidate | Use m = 20 MICE with 2-level structure |
| `> 25%` | High — MNAR risk | Sensitivity analyses mandatory (Tipton bounds, pattern-mixture) |

## How flags reach the UI

1. `redcap_audit.py` scans the REDCap mirror nightly and stamps
   boolean columns on each record.
2. `build_dashboard_data.py::build_data_quality()` and
   `build_redcap_audit()` aggregate those booleans.
3. The resulting counts populate the KPI cards and the *Queries /
   Events* bar chart on the **Data Quality** tab.
