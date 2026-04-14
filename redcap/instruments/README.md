# REDCap Instruments — NANO Study

## Overview
This directory contains field mapping files and documentation for all REDCap instruments used in the NANO Study.

## Instruments by Event

### NICU Admission (`nicu_admission_arm_1`)
| Instrument | Description |
|-----------|-------------|
| `demographics` | Participant demographics, GA, birth weight, group assignment |
| `nicu_morbidity` | IVH grade, BPD, NEC, ROP, sepsis, NICU LOS |
| `ecg_recording_log` | HeRO monitor recording metadata |

### 1, 2, 3 Months CGA (`month_1_arm_1` through `month_3_arm_1`)
| Instrument | Description |
|-----------|-------------|
| `nnns_attention_1_3m` | NNNS-II subscales: habituation, attention, arousal, regulation |
| `ecg_recording_log` | Actiheart-5 ECG recording metadata |
| `temperature_recording_log` | Squirrel datalogger recording metadata |
| `behavioral_coding_log` | DataVyu coding session metadata (month 2+) |

### 3 Months (`month_3_arm_1`)
| Instrument | Description |
|-----------|-------------|
| `csbs_social_communication` | CSBS Social, Speech, Symbolic composite scores |

### 6 Months (`month_6_arm_1`)
| Instrument | Description |
|-----------|-------------|
| `bayley4_scores` | Bayley-4 Cognitive, Language, Motor composites |
| `asq3_milestones` | ASQ-3 domain scores (Communication through Personal-Social) |

### 9 Months (`month_9_arm_1`)
| Instrument | Description |
|-----------|-------------|
| `mchat_r_tf` | M-CHAT-R/F total score and risk category |
| `csbs_social_communication` | CSBS repeat assessment |

### 12 Months (`month_12_arm_1`)
| Instrument | Description |
|-----------|-------------|
| `ados2_scores` | ADOS-2 Module T/1, SA/RRB raw, CSS scores |
| `bayley4_scores` | Bayley-4 repeat |

### 24 Months (`month_24_arm_1`) — Questionnaire Only
| Instrument | Description |
|-----------|-------------|
| `prapare_sdoh` | PRAPARE Social Determinants of Health indicators |
| `epds_maternal_depression` | Edinburgh Postnatal Depression Scale |
| `asq3_milestones` | ASQ-3 repeat |

### 36 Months (`month_36_arm_1`)
| Instrument | Description |
|-----------|-------------|
| `ados2_scores` | ADOS-2 Module 2/3 |
| `bayley4_scores` | Bayley-4 final assessment |
| `ecg_recording_log` | ECG recording |
| `hmet_recording_log` | Head-mounted eye-tracking metadata |

## Field Mapping Files
- `field_mapping_ADOS2.csv` — ADOS-2 item codes → REDCap field names
- `field_mapping_Bayley4.csv` — Bayley-4 subtest codes → REDCap field names

## Adding New Instruments
1. Create REDCap instrument following naming conventions in `data/data_dictionary/README.md`
2. Export REDCap data dictionary for the new instrument
3. Add field mappings CSV to this directory
4. Update `data/data_dictionary/NANO_master_data_dictionary.csv`
5. Update `config/redcap_config.yml` event definitions
