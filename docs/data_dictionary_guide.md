# Data Dictionary Guide — NANO Study

## Field Naming Conventions

All REDCap field names must follow `instrument_prefix_fieldname` in lowercase snake_case:

| Instrument Prefix | Example Fields |
|------------------|----------------|
| `ados2_` | `ados2_css_total`, `ados2_sa_raw` |
| `bayley4_` | `bayley4_cog_composite`, `bayley4_lang_composite` |
| `nnns_` | `nnns_attention`, `nnns_arousal` |
| `ecg_` | `ecg_duration_min`, `ecg_quality_flag` |
| `temp_` | `temp_abdominal_start`, `temp_peripheral_start` |
| `nicu_` | `nicu_ivh_grade`, `nicu_bpd` |
| `prapare_` | `prapare_food_insecurity` |
| `epds_` | `epds_total`, `epds_si_item` |

## PHI Flag Criteria — HIPAA Safe Harbor 18 Identifiers

Mark `phi_flag=TRUE` for any field containing:
1. Names
2. Geographic data smaller than state
3. **All dates** (except year) — includes DOB, visit dates, recording dates
4. Phone numbers
5. Fax numbers
6. Email addresses
7. Social security numbers
8. Medical record numbers
9. Health plan beneficiary numbers
10. Account numbers
11. Certificate/license numbers
12. Vehicle identifiers / serial numbers
13. Device identifiers / serial numbers
14. URLs
15. IP addresses
16. Biometric identifiers (finger/voice prints)
17. Full-face photos
18. Any unique identifying number or code

## Adding New REDCap Fields — 6-Step Process

1. **Draft field specs**: Define variable_name, label, field_type, validation range, phi_flag in a PR
2. **Add to data dictionary**: Update `data/data_dictionary/NANO_master_data_dictionary.csv`
3. **Create in REDCap sandbox**: Build and test the field in the REDCap development project first
4. **Update config**: Add field to `config/redcap_config.yml` field mappings if it's a key field
5. **Export REDCap data dictionary**: Verify field names match exactly between REDCap and CSV
6. **Deploy to production**: Move instrument to production REDCap; PR merged after PI approval

## Validation Rule Syntax

| Rule Type | Syntax | Example |
|-----------|--------|---------|
| Integer range | `[min, max]` | `[1, 10]` |
| Float range | `[min.0, max.0]` | `[0.0, 1.0]` |
| Date | `date_mdy` or `date_ymd` | `date_mdy` |
| Regex | `regex: pattern` | `regex: NANO-[0-9]{4}` |
| Required | `required` | `required` |

## Factor Coding Standards for R

Ordered factors (use `ordered=TRUE`): severity scales, education, morbidity grades
Unordered factors: sex, group_code, insurance_type, race/ethnicity

Example:
```r
df$nicu_bpd <- factor(df$nicu_bpd,
  levels = c("None", "Mild", "Moderate", "Severe"), ordered = TRUE)
df$group_code <- factor(df$group_code,
  levels = c("ASIB", "PT", "TD"), ordered = FALSE)
```
