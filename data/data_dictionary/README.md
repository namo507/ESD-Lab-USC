# NANO Study Data Dictionary

## Overview
The master data dictionary (`NANO_master_data_dictionary.csv`) documents all variables collected across the NANO Study longitudinal database in REDCap.

## Column Definitions

| Column | Description |
|--------|-------------|
| `variable_name` | REDCap field name (snake_case, lowercase) |
| `label` | Human-readable variable label |
| `form_name` | REDCap instrument/form name |
| `event` | REDCap event(s) where field appears (`all_events`, or specific event name) |
| `field_type` | REDCap field type: text, text_integer, text_number, text_date, radio, yesno, calc, dropdown, notes |
| `choices_if_radio` | Pipe-separated choices for radio/dropdown fields (value=label format) |
| `validation` | Validation rule or range `[min, max]` |
| `phi_flag` | `TRUE` if field contains Protected Health Information |
| `notes` | Additional context, derivation formula, or flags |

## Field Naming Conventions

- **All lowercase, snake_case**: `ados2_css_total`
- **Instrument prefix**: `ados2_`, `bayley4_`, `nnns_`, `mchat_`, `csbs_`, `epds_`, `prapare_`
- **Physiological prefix**: `ecg_`, `temp_`, `hrv_`
- **Demographics**: `ga_`, `nicu_`, `maternal_`, `household_`
- **PHI fields**: Never use `_phi` suffix in field names — PHI flag is tracked here in `phi_flag` column

## PHI Fields
The following field types contain PHI and must NEVER be exported, logged, or committed:
- `dob` — Date of birth
- `visit_date` — Actual visit date (use `age_in_days` in analyses)
- `nano_id` — Participant ID (use hashed version in deidentified datasets)
- `ecg_recording_date`, `temp_recording_date` — Recording dates

## Updating the Data Dictionary

1. When adding new REDCap fields, update this CSV before or simultaneously with the REDCap instrument
2. Use the REDCap Data Dictionary export feature to verify field names match exactly
3. Set `phi_flag=TRUE` for any field containing: names, DOB, dates, geographic subdivisions smaller than state, phone/fax, email, SSN, medical record numbers, or device identifiers
4. Submit PR with data dictionary update and tag the PI for review
5. Bump `CHANGELOG.md` with `data:` type commit

## Field Count by Instrument

Run this query to get current counts:
```python
import pandas as pd
dd = pd.read_csv("data/data_dictionary/NANO_master_data_dictionary.csv")
print(dd.groupby("form_name")["variable_name"].count().sort_values(ascending=False))
```
