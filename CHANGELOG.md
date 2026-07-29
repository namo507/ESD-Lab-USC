# Changelog

All notable changes to the NANO Study repository will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Assistant runtime moved from the hosted NVIDIA Nemotron endpoint to a local
  [Ollama](https://github.com/ollama/ollama) model (`llama3.2:3b` by default).**
  ESD Buddy, NANO Buddy, and Presentation Maker share the same runtime through
  the existing provider seam, so the dashboard API contract, grounding,
  citations, deterministic short-circuit answers, and PHI refusals are
  unchanged. No provider account or API key is required, and prompts never leave
  the deployment. Retired hosted-provider values in an existing `.env`, Compose
  file, or Helm values resolve to the local runtime instead of failing requests.
- Assistant defaults retuned for a local model: 768 max output tokens, top-p
  `0.9`, 8192 context window, 7000-character context budget, 2 retries with
  0.5s base backoff, and a 120s request timeout.
- Chat and Buddy system prompts restructured as numbered rules, which small
  local models follow far more reliably than equivalent prose.

### Added
- `scripts/ollama.sh` plus `make ollama-install|ollama-up|ollama-down|ollama-pull|ollama-status`
  to install a checksum-verified pinned Ollama release into `.tools/ollama`,
  serve it, and pull/preload the configured model. Neither the binary nor the
  weights are committed; both are gitignored and rebuildable.
- `dashboard/assistant/ollama_runtime.py`, a dependency-free client for Ollama's
  management API (health, installed tags, pull with progress, preload).
- `scripts/check_assistant_runtime.py` and `make assistant-smoke`: end-to-end
  verification that the runtime is up, the model is installed, both buddies
  answer, and NANO Buddy still refuses PHI requests.
- `ollama` service in all three Compose files with a persistent model volume, and
  an in-cluster Ollama Deployment, Service, and PVC in the Helm chart
  (`ollama.enabled`, default true) with an idempotent model-pull hook.
- `model-missing` assistant state with an actionable message, so an unpulled
  model is distinguishable from an unreachable runtime.
- Assistant status now runs a cached, 1-second liveness check against the
  runtime instead of inferring readiness from configuration, so a stopped
  server or unpulled model is reported before a user asks a question. Disable
  with `DASHBOARD_ASSISTANT_STATUS_PROBE=false`.
- `OLLAMA.md` operator runbook, replacing the NVIDIA migration prompt.

### Added
- Additive NANO Study dashboard at `/nano/dashboard` with ESD-branded motion,
  aggregate enrollment and visit operations, HDA/RSA research metrics, pipeline
  quality, assessments, equipment and compliance status, REDCap health, and
  reading-library links.
- Complete aggregate-only `nano` payload contract with a coherent synthetic
  fallback, null-safe rendering, and explicit source/as-of metadata.
- NANO ESD Lab Buddy adapter at `/api/buddy`, reusing the existing repository-
  grounded assistant with metric provenance, document citations, offline
  fallback behavior, and strict PHI or raw-signal refusal.
- Dashboard Master feature release: Multimodal Synchrony Visualizer, redesigned Guided Explorer, REDCap completeness drawer, Public Insights sharing/IRB context, Infant Passport visit detail, SDOH priority overlay, and Cascade Simulator overlays.
- AI Buddy and Ask AI fast paths for the new dashboard routes, Executive PPTX export, multimodal synchrony windows, and REDCap/public-insights guidance.
- Explicit Pages build flags for the newly released dashboard surfaces so future website builds keep the assistant, metrics, and visualizations in sync.
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
