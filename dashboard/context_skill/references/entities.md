# NANO Study Entities & Vocabulary

> One-page glossary of the people, groups, events, and tools that show up
> across the dashboard.

## Study at a glance

| Field | Value |
|-------|-------|
| Long name | Neurodevelopment of Autonomic and Neural Organization |
| Short name | **NANO** |
| Funder | NIH R01 (5 years) |
| Lab | Early Social Development (ESD) Lab |
| Institution | University of South Carolina |
| Target N | **260 infants** |

## Principal team

| Person | Role | Notes |
|--------|------|-------|
| Dr. Jessica Bradshaw | Principal Investigator (PI) | Authored the developmental-cascades chapter (Bradshaw et al., 2025) that anchors the analysis plan |
| Dr. Christian O'Reilly | Co-I, ECG / ML | Owns ECG preprocessing + ML pipeline |
| Dr. Robin Dail        | Co-I, NICU              | Owns NICU recruitment and CPTd temperature design |
| Dr. Caitlin Hudac     | Co-I                    | Behavioral phenotyping |

## Participant groups

| Code | Long name | Target N | Color |
|------|-----------|----------|-------|
| **ASIB** | Autism Spectrum with Infant Biomarkers (VPT + ASD traits) | 65  | `#C44E52` |
| **PT**   | Preterm typical development | 130 | `#4C72B0` |
| **TD**   | Term-born typical development | 65  | `#55A868` |

`VPT` = very preterm (<32 weeks gestational age).
`CGA` = corrected gestational age (chronological age − weeks of prematurity).

## Visit schedule

| `event` (code) | Month | Label | Primary instruments |
|----------------|-------|-------|--------------------|
| `nicu_admission` | 0  | NICU Admission | Demographics, NICU morbidity, HeRO ECG |
| `month_1`        | 1  | 1 Month CGA    | NNNS-II, ECG, Temp |
| `month_2`        | 2  | 2 Months CGA   | NNNS-II, ECG, Temp, Behavioral coding |
| `month_3`        | 3  | 3 Months CGA   | NNNS-II, ECG, Temp, CSBS |
| `month_6`        | 6  | 6 Months       | ECG, Temp, Bayley-4, ASQ-3 |
| `month_9`        | 9  | 9 Months       | ECG, Temp, M-CHAT, CSBS |
| `month_12`       | 12 | 12 Months      | ECG, Temp, Bayley-4, ADOS-2 |
| `month_24`       | 24 | 24 Months      | Questionnaires only (PRAPARE, EPDS, ASQ-3) |
| `month_36`       | 36 | 36 Months      | ADOS-2, Bayley-4, ECG, HMET |

## Tooling

| Tool | Purpose | Lab role |
|------|---------|----------|
| **REDCap** | Demographics, assessments, questionnaires | Source-of-truth for non-physiological data |
| **HeRO Monitor** | NICU continuous ECG | Owned by Dr. Dail's NICU team |
| **Actiheart-5** | Lab-based 1024 Hz R-R | Owned by ECG team |
| **Squirrel SQ2010** | Skin temp dataloggers (1-min resolution) | Used to compute CPTd |
| **DataVyu** | Behavioral coding | Manual, double-coded |
| **MatLab** | Legacy ECG cleaning scripts | Being phased to Python (neurokit2) |
| **PyCap** | Python REDCap API wrapper | Used by `redcap/api/redcap_pull.py` |
| **REDCapR** | R REDCap API wrapper | Used by R analysts |

## File-system anchors

* `${NANO_DATA_ROOT}` — secure server mount; never appears in repo
* `data/processed/feature_matrix.parquet` — wide, one row per participant × event
* `data/processed/redcap_latest.parquet`  — nightly REDCap mirror
* `models/_metrics.json` — most recent ML run (consumed by dashboard)
