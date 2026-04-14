# Changelog

All notable changes to the NANO Study repository will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial repository scaffold for NANO Study (NIH R01 longitudinal infant study)
- Complete directory structure: config, data, redcap, src, notebooks, scripts, tests, docs, reports
- HIPAA-compliant `.gitignore` excluding all raw data and PHI file types
- `config/paths.yml` with env-var substitution for all data paths
- `config/redcap_config.yml` with project IDs, event names, field mappings
- `config/study_parameters.yml` with participant groups, GA bins, primary DVs
- `config/model_config.yml` with ML hyperparameters and CV settings
- REDCap API scripts: pull, push, audit (Python), and R pull via REDCapR
- REDCap JavaScript hooks: auto-complete DOB, participant ID validator, visit completion checker, ECG flag
- ECG loader, temperature loader, behavioral coding loader, REDCap merge module
- Full ECG preprocessing pipeline via neurokit2/biosppy
- HRV feature extraction: mean IBI, SDNN, RMSSD, CVNN, HTI, SD1/SD2, sample entropy, RSA, HDA phases
- Temperature preprocessing with CPTd computation
- Behavioral synchronization: time-locks HDA phases to behavioral events
- Deidentification module with audit logging
- Feature engineering: ECG feature matrix, trajectory features (LGCM intercepts/slopes), demographic features
- Multiple imputation via MICE (R) and IterativeImputer (Python)
- ML pipeline: Random Forest, XGBoost, SVM with GridSearchCV + permutation importance
- Deep learning: 1D-CNN with LSTM and self-supervised pre-training
- Transformer model for continuous ADOS CSS regression
- Mixed-effects models (lme4/nlme) and latent growth curve models (lavaan)
- Markov chain models for HDA phase transitions
- Visualization: trajectory plots, ECG heatmaps, missingness heatmap, ROC curves
- Utility modules: config loader, structured logging, HIPAA utilities
- 7 Jupyter notebooks for exploration, walkthrough, and demo
- Batch processing scripts and daily cron sync
- pytest test suite with synthetic ECG, mock REDCap, imputation, and deidentification tests
- Documentation: data flow, REDCap setup, ECG protocol, HIPAA checklist, onboarding guide
- GitHub Actions CI: pytest + black + flake8 on develop/main
- PR template and issue templates

---

## [0.1.0] - 2024-01-15

### Added
- Repository initialized with NANO Study README
