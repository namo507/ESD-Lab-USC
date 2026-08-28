# NANO Study — Makefile
# Usage: make <target>
# Run `make help` to list all targets

.DEFAULT_GOAL := help
PYTHON := python3
VENV ?= .venv
PIP := $(VENV)/bin/pip
PYTEST := $(VENV)/bin/pytest
BLACK := $(VENV)/bin/black
FLAKE8 := $(VENV)/bin/flake8
ISORT := $(VENV)/bin/isort
DASHBOARD_LOCAL_URL ?= http://localhost:8080
HELM ?= $(shell if command -v helm >/dev/null 2>&1; then printf 'helm'; else printf 'docker run --rm -v "$(CURDIR):/repo" -w /repo alpine/helm:3.15.4'; fi)
COMPOSE := docker compose -f docker/compose.dev.yml
ROOT_COMPOSE := docker compose -f docker-compose.yml
MAIN_CONTAINER ?= esd-lab-usc-dashboard-1
SHARE_SERVICE ?= dashboard-share
SHARE_PROFILE ?= share
K8S_HELM_NAMESPACE ?= esd-lab
K8S_HELM_RELEASE ?= esd-lab-dashboard
K8S_HELM_CHART ?= k8s/helm/esd-lab-dashboard
K8S_SECRET_NAME ?= esd-lab-dashboard-secrets
K8S_READINGS_CLAIM ?= esd-readings-rwx
K8S_DATA_CLAIM ?= esd-dashboard-data-rwx
K8S_IMAGE_REPOSITORY ?= esd-lab-dashboard
K8S_IMAGE_TAG ?= local

.PHONY: help venv-ready install test lint clean clean-python clean-space docker-clean up down logs shell rebuild redcap-sync redcap-portfolio redcap-publish run-pipeline format check-env compose-validate dashboard-build dashboard-up dashboard-down dashboard-logs dashboard-refresh dashboard-demo-inputs dashboard-smoke dashboard-share share-named share-quick assistant-status assistant-prepare assistant-bootstrap assistant-probe pages-build pages-deploy pages-watch pages-watch-once pages-runtime-deploy pages-runtime-watch pages-runtime-watch-once share-live k8s-secrets-apply k8s-helm-lint k8s-helm-up k8s-helm-down k8s-smoke docker-preflight docker-health docker-share-health ops-check logs-prune models-resolve models-pull models-verify assistant-reindex assistant-reindex-sparse assistant-eval index-freshness similar-studies stack-up stack-stats self-heal self-heal-watch self-heal-test buddy-preview buddy-capture gpu-check gpu-env models-benchmark model-sync model-warm model-residency check-automations check-automations-quick

help:  ## Show this help message
	@echo "NANO Study — Available Makefile targets:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "HIPAA REMINDER: Never run pipeline targets on unencrypted drives."

# ─── Setup ───────────────────────────────────────────────────────────────────

venv-ready:  ## Create or repair the project virtualenv
	@if ! [ -x "$(VENV)/bin/python" ] || ! "$(VENV)/bin/python" -V >/dev/null 2>&1; then \
		echo "Rebuilding project virtualenv at $(VENV)..."; \
		$(PYTHON) -m venv --clear $(VENV); \
	fi

install: venv-ready  ## Install Python dependencies in virtualenv
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt
	$(VENV)/bin/pre-commit install
	@echo "✓ Python environment ready. Next: copy .env.example → .env and configure."

$(VENV)/bin/activate:
	$(PYTHON) -m venv $(VENV)

install-r:  ## Install R dependencies via renv
	Rscript -e "if (!requireNamespace('renv', quietly=TRUE)) install.packages('renv'); renv::restore()"

# ─── Testing ─────────────────────────────────────────────────────────────────

test:  ## Run pytest test suite
	$(PYTEST) tests/ -v --tb=short --cov=src --cov-report=term-missing

test-fast:  ## Run pytest excluding slow integration tests
	$(PYTEST) tests/ -v --tb=short -m "not slow"

# ─── Code Quality ────────────────────────────────────────────────────────────

lint:  ## Run black, flake8, and isort checks
	$(BLACK) --check src/ tests/ scripts/ redcap/
	$(FLAKE8) src/ tests/ scripts/ redcap/
	$(ISORT) --check-only src/ tests/ scripts/ redcap/

format:  ## Auto-format code with black and isort
	$(BLACK) src/ tests/ scripts/ redcap/
	$(ISORT) src/ tests/ scripts/ redcap/

# ─── Pipeline ────────────────────────────────────────────────────────────────

check-env:  ## Verify .env is configured and secure drive is mounted
	@test -f .env || (echo "ERROR: .env not found. Copy .env.example → .env" && exit 1)
	@$(PYTHON) -c "from src.utils.config_loader import load_config; load_config()" || \
		(echo "ERROR: Config validation failed. Check .env and config/paths.yml" && exit 1)
	@echo "✓ Environment configured correctly."

env-doctor:  ## Masked report on the single .env: what is set, blank, stray, or undocumented
	@$(PYTHON) scripts/env_doctor.py

env-verify:  ## Fail unless all eight REDCap tokens and one assistant tier are configured
	@$(PYTHON) scripts/env_doctor.py --require-redcap --require-assistant

compose-validate:  ## Validate Compose files without requiring Docker
	$(PYTHON) scripts/check_compose_config.py

redcap-sync:  ## Pull latest REDCap records, run QC, send summary email
	@echo "Running REDCap daily sync..."
	$(VENV)/bin/python scripts/redcap_daily_sync.py
	@echo "✓ REDCap sync complete."

ecg-batch:  ## Batch process all ECG files in raw_ecg_dir
	@echo "Starting ECG batch processing..."
	$(VENV)/bin/python scripts/ecg_batch_processor.py
	@echo "✓ ECG batch processing complete."

quality-report:  ## Generate HTML data quality dashboard
	$(VENV)/bin/python scripts/generate_data_quality_report.py
	@echo "✓ Data quality report saved to reports/data_quality/"

deidentify:  ## Export de-identified analysis dataset
	@echo "⚠️  Creating de-identified export. Audit log will be written."
	$(VENV)/bin/python scripts/export_deidentified_dataset.py
	@echo "✓ De-identified dataset exported."

run-pipeline:  ## Run full analysis pipeline end-to-end
	@$(MAKE) check-env
	@echo "Starting full NANO Study pipeline..."
	bash scripts/run_full_pipeline.sh
	@echo "✓ Full pipeline complete. Check logs/ for details."

dashboard-refresh:  ## Rebuild dashboard JSON and readings metadata locally
	$(PYTHON) dashboard/pipelines/build_readings_index.py
	$(PYTHON) scripts/build_lab_readings_index.py
	$(PYTHON) dashboard/pipelines/build_dashboard_data.py --bootstrap-demo-inputs --fallback-synthetic
	node scripts/gen_redcap_constants.mjs
	$(PYTHON) dashboard/context_skill/extract_context.py --emit
	$(PYTHON) scripts/prepare_dashboard_assistant.py --reindex || true
	@echo "✓ Dashboard JSON refreshed."

redcap-dictionary:  ## Export the structural REDCap instrument dictionary (no item text, no identifier fields)
	$(PYTHON) scripts/sync_redcap_dictionary.py
	@echo "✓ REDCap instrument dictionary refreshed."

redcap-portfolio:  ## Build the REDCap metadata watcher artifact (structure and completion, aggregate-only)
	$(PYTHON) scripts/build_redcap_portfolio_data.py
	@echo "✓ REDCap portfolio metadata refreshed."

redcap-publish:  ## Pull REDCap, rebuild payload/context, reindex assistant, and fan out to Pages/Docker/K8s checks
	@echo "Publishing REDCap dashboard payload across Pages, Docker, and Kubernetes surfaces..."
	@$(MAKE) redcap-sync
	@$(MAKE) redcap-dictionary
	@$(MAKE) redcap-portfolio
	$(PYTHON) dashboard/pipelines/build_dashboard_data.py --bootstrap-demo-inputs --fallback-synthetic
	node scripts/gen_redcap_constants.mjs
	$(PYTHON) dashboard/context_skill/extract_context.py --emit
	$(PYTHON) scripts/prepare_dashboard_assistant.py --reindex || true
	@$(MAKE) pages-build
	@$(MAKE) docker-health || true
	@$(MAKE) k8s-helm-lint
	@echo "✓ REDCap publish fan-out complete."

dashboard-demo-inputs:  ## Materialize repo-local dashboard demo inputs
	$(PYTHON) dashboard/pipelines/bootstrap_dashboard_demo_inputs.py
	@echo "✓ Repo-local dashboard demo inputs refreshed."

up:  ## Start the canonical Docker stack in the background
	$(ROOT_COMPOSE) up -d --build

down:  ## Stop the canonical Docker stack
	$(ROOT_COMPOSE) down

logs:  ## Tail canonical Docker stack logs
	$(ROOT_COMPOSE) logs -f

shell:  ## Open a shell in the main dashboard container
	docker exec -it $(MAIN_CONTAINER) /bin/bash

rebuild:  ## Recreate the canonical Docker stack from a fresh build
	$(ROOT_COMPOSE) down && $(ROOT_COMPOSE) up -d --build

dashboard-build:  ## Build the live dashboard Docker image
	$(COMPOSE) build dashboard

dashboard-up:  ## Start the live website runtime at http://localhost:8080/ (front door at /esd-lab)
	$(COMPOSE) up --build dashboard

dashboard-down:  ## Stop the live dashboard container
	$(COMPOSE) down

dashboard-logs:  ## Tail live dashboard logs
	$(COMPOSE) logs -f dashboard

dashboard-smoke:  ## Verify the live dashboard container health and auto-rebuild loop
	$(PYTHON) scripts/check_dashboard_runtime.py --base-url $(DASHBOARD_LOCAL_URL)
	@echo "✓ Dashboard Docker runtime passed smoke checks."

assistant-status: venv-ready  ## Show assistant provider configuration and non-billable readiness state
	$(VENV)/bin/python scripts/prepare_dashboard_assistant.py --validate-config

assistant-chain:  ## Show the resolved ESD Buddy provider failover order
	$(PYTHON) scripts/assistant_chain.py

model-pull:  ## Pull the local Docker model tier and write its ESD grounding profile
	$(PYTHON) scripts/setup_local_model.py --write-config

model-verify:  ## Verify the local Docker model tier without pulling
	$(PYTHON) scripts/setup_local_model.py --skip-pull

assistant-prepare: venv-ready  ## Validate provider config and rebuild repository grounding indexes
	$(VENV)/bin/python scripts/prepare_dashboard_assistant.py --validate-config --reindex

assistant-bootstrap: venv-ready  ## Install hosted-provider dependencies and require configured credentials
	$(VENV)/bin/pip install -r dashboard/requirements.txt
	$(VENV)/bin/python scripts/prepare_dashboard_assistant.py --validate-config --require-ready

assistant-probe: venv-ready  ## Probe the configured NVIDIA OpenAI-compatible endpoint without generating text
	$(VENV)/bin/python scripts/prepare_dashboard_assistant.py --validate-config --probe-provider --require-ready

dashboard-share:  ## Start a public share tunnel and print the shareable URL
	@if command -v docker >/dev/null 2>&1; then \
		$(MAKE) docker-preflight; \
	else \
		echo "Docker unavailable; skipping Docker health preflight and using the local runtime fallback."; \
	fi
	bash scripts/share_dashboard.sh

share-named:  ## Start the configured stable named Cloudflare tunnel
	bash scripts/share_dashboard.sh --mode named

share-quick:  ## Start a temporary random-hostname Cloudflare tunnel
	bash scripts/share_dashboard.sh --mode quick

pages-build:  ## Build the canonical Cloudflare Pages dashboard SPA artifact locally
	VITE_USE_MOCKS=true VITE_LIVE_ASSISTANT=true VITE_FEATURE_RSA_GROWTH_CURVES=true VITE_FEATURE_HDA_TIMELINE_PLAYER=true VITE_FEATURE_THERMAL_HEATMAP=true VITE_FEATURE_SWIMMER_PLOT=true VITE_FEATURE_ATTRITION_FUNNEL=true VITE_FEATURE_SDOH_MAP=true VITE_FEATURE_SHAP_BEESWARM=true VITE_FEATURE_CLUSTER_VIEWER=true VITE_FEATURE_MODEL_LEADERBOARD=true VITE_FEATURE_CASCADE_DAG=true VITE_FEATURE_REDCAP_COMPLETENESS=true VITE_FEATURE_REDCAP_VISIT_HEALTH=true VITE_FEATURE_ECG_QUALITY_MONITOR=true VITE_FEATURE_SPATIAL_ASSESSMENT_MATRIX=true VITE_FEATURE_ATTACHMENT_HEATMAP=true VITE_FEATURE_CGA_RIVER=true VITE_FEATURE_COUNTY_COMPARATOR=true VITE_FEATURE_PARTICIPANT_TIMELINE_V2=true VITE_FEATURE_MODEL_CONFIDENCE_TERRAIN=true VITE_FEATURE_ATTRITION_FUNNEL_V2=true VITE_FEATURE_GUIDED_EXPLORER=true VITE_FEATURE_PUBLIC_INSIGHTS=true VITE_FEATURE_EXECUTIVE_MODE=true VITE_FEATURE_DYN_INFANT_PASSPORT=true VITE_FEATURE_DYN_CASCADE_SIMULATOR=true VITE_FEATURE_MULTIMODAL_SYNCHRONY=true VITE_FEATURE_DYN_CO_REGULATION_BRAID=true npm --prefix web run build
	$(PYTHON) scripts/build_pages_site.py

pages-deploy: pages-build  ## Build + deploy the canonical Cloudflare Pages dashboard SPA
	@# No --branch: passing it on a direct upload produces a *preview* deployment
	@# even when the value matches the project's production branch, so the apex
	@# domain kept serving the previous build while main.<project>.pages.dev had
	@# the new one. Omitting it targets production, which is what deploying means.
	npx --yes wrangler@3.112.0 pages deploy dist/pages-wrapper --project-name $${CLOUDFLARE_PAGES_PROJECT:-esd-lab-namo} --commit-dirty=true

pages-watch:  ## Watch the canonical Pages dashboard inputs and redeploy on change
	$(PYTHON) scripts/watch_pages_site.py

pages-watch-once:  ## One-shot build + deploy of the canonical Pages dashboard site
	$(PYTHON) scripts/watch_pages_site.py --once

k8s-secrets-apply:  ## Sync Kubernetes Secret from .env/current environment values
	K8S_HELM_NAMESPACE=$(K8S_HELM_NAMESPACE) K8S_SECRET_NAME=$(K8S_SECRET_NAME) bash scripts/k8s_sync_secret_from_env.sh

k8s-helm-lint:  ## Validate Kubernetes Helm templates locally
	$(HELM) lint $(K8S_HELM_CHART) \
		--set existingClaims.readings=$(K8S_READINGS_CLAIM) \
		--set existingClaims.data=$(K8S_DATA_CLAIM)
	@mkdir -p k8s/.rendered
	$(HELM) template $(K8S_HELM_RELEASE) $(K8S_HELM_CHART) \
		--namespace $(K8S_HELM_NAMESPACE) \
		--set existingClaims.readings=$(K8S_READINGS_CLAIM) \
		--set existingClaims.data=$(K8S_DATA_CLAIM) >k8s/.rendered/$(K8S_HELM_RELEASE).yaml
	@echo "✓ Helm templates rendered to k8s/.rendered/$(K8S_HELM_RELEASE).yaml"

k8s-helm-up: k8s-secrets-apply  ## Install or upgrade Kubernetes dashboard stack via Helm
	$(HELM) upgrade --install $(K8S_HELM_RELEASE) $(K8S_HELM_CHART) \
		--namespace $(K8S_HELM_NAMESPACE) \
		--create-namespace \
		--set image.repository=$(K8S_IMAGE_REPOSITORY) \
		--set image.tag=$(K8S_IMAGE_TAG) \
		--set existingClaims.readings=$(K8S_READINGS_CLAIM) \
		--set existingClaims.data=$(K8S_DATA_CLAIM) \
		--set secret.name=$(K8S_SECRET_NAME)

k8s-helm-down:  ## Uninstall Kubernetes dashboard Helm release
	-$(HELM) uninstall $(K8S_HELM_RELEASE) --namespace $(K8S_HELM_NAMESPACE)

k8s-smoke:  ## Smoke-check readings pipeline endpoints against a running dashboard
	$(PYTHON) scripts/check_k8s_readings_pipeline.py --base-url $(DASHBOARD_LOCAL_URL) --mode local

pages-runtime-deploy:  ## Deploy the tunnel runtime wrapper to a non-production Pages preview branch
	npx --yes wrangler@3.112.0 pages deploy dist/pages-runtime-wrapper --project-name $${CLOUDFLARE_RUNTIME_PAGES_PROJECT:-esd-lab-namo} --branch $${CLOUDFLARE_RUNTIME_PAGES_BRANCH:-runtime-share} --commit-dirty=true

pages-runtime-watch:  ## Continuously regen + redeploy the tunnel runtime wrapper preview on origin rotation
	$(PYTHON) scripts/watch_pages_wrapper.py

pages-runtime-watch-once:  ## One-shot runtime wrapper sync to the preview branch
	$(PYTHON) scripts/watch_pages_wrapper.py --once

share-live:  ## Supervise the dashboard and tunnel; canonical Pages only adopts a healthy named origin
	bash scripts/share_dashboard.sh --continuous --mode auto

# ─── Backup ──────────────────────────────────────────────────────────────────

verify-backup:  ## Verify secure server backup integrity
	bash scripts/backup_verification.sh

# ─── Cleanup ─────────────────────────────────────────────────────────────────

clean-python:  ## Remove Python cache files and test artifacts
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; true
	find . -type f -name "*.pyc" -delete 2>/dev/null; true
	find . -type f -name "*.pyo" -delete 2>/dev/null; true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null; true
	find . -type f -name ".coverage" -delete 2>/dev/null; true
	@echo "✓ Cleaned Python cache and test artifacts."

clean-space: clean-python  ## Remove rebuildable legacy model and stale tool caches
	rm -rf models/local_llms .devcontainer/.venv .venv-1 .venv-2 .tools
	find models -maxdepth 1 -type f -name "*.gguf" -delete 2>/dev/null; true
	rm -rf dist temp tmp web/build-merge web/dist
	@echo "✓ Removed rebuildable space-heavy artifacts; live data, metrics, .env, web/build, and node_modules were preserved."

clean: clean-python  ## Remove project containers/orphans without global Docker or volume pruning
	@if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then \
		$(ROOT_COMPOSE) down --remove-orphans; \
	else \
		echo "Docker unavailable; project container cleanup skipped."; \
	fi
	@echo "✓ Project cleanup complete; named volumes and unrelated Docker data were preserved."

docker-clean: clean  ## Alias for Docker cleanup


docker-preflight:  ## Check Docker daemon and Compose availability before starting services
	$(PYTHON) scripts/check_docker_health.py --daemon-only --json

docker-health:  ## Check and repair the dashboard Docker runtime health
	$(PYTHON) scripts/check_docker_health.py --compose-file docker-compose.yml --project-name esd-lab-usc --service dashboard --check-url $(DASHBOARD_LOCAL_URL)/api/healthz --check-url $(DASHBOARD_LOCAL_URL)/nano/dashboard --check-url $(DASHBOARD_LOCAL_URL)/api/buddy --repair --json

docker-share-health:  ## Check dashboard plus the currently selected share sidecar
	$(PYTHON) scripts/check_docker_health.py --compose-file docker-compose.yml --project-name esd-lab-usc --profile $(SHARE_PROFILE) --service dashboard --service $(SHARE_SERVICE) --check-url $(DASHBOARD_LOCAL_URL)/api/healthz --check-url $(DASHBOARD_LOCAL_URL)/nano/dashboard --check-url $(DASHBOARD_LOCAL_URL)/api/buddy --repair --json

ops-check: compose-validate  ## Check canonical + runtime-share public dashboard surfaces
	$(PYTHON) scripts/check_live_surfaces.py --max-stamp-age-hours 168

# ─── Local model stack ──────────────────────────────────────────────────────

models-resolve:  ## Resolve real model tags + digests from the live Ollama registry
	$(PYTHON) scripts/resolve_local_models.py

models-pull:  ## Pin the resolved tags, then download the weights
	$(PYTHON) scripts/resolve_local_models.py --write
	ollama pull $$($(PYTHON) -c "import json;print(json.load(open('config/llm_model.json'))['local']['primary']['model'])")
	ollama pull $$($(PYTHON) -c "import json;print(json.load(open('config/llm_model.json'))['local']['embedding']['model'])")

models-verify:  ## Re-check every pinned digest against the registry; fails CI on drift
	$(PYTHON) scripts/verify_model_manifest.py

# ─── Retrieval index ────────────────────────────────────────────────────────

assistant-reindex:  ## Rebuild the hybrid retrieval index from the approved corpus
	$(PYTHON) scripts/build_assistant_index.py

assistant-reindex-sparse:  ## Rebuild FTS5 only (no embedding service required)
	$(PYTHON) scripts/build_assistant_index.py --sparse-only

assistant-eval:  ## Run the assistant eval fixtures; blocks deploy on a regression
	$(PYTHON) scripts/run_assistant_eval.py

index-freshness:  ## Report the age of the retrieval index manifest
	$(PYTHON) scripts/check_index_freshness.py

# ─── Study landscape ────────────────────────────────────────────────────────

similar-studies:  ## Refresh the comparable-study landscape from the official APIs
	$(PYTHON) dashboard/pipelines/build_similar_studies.py

# ─── Stack ──────────────────────────────────────────────────────────────────

stack-up:  ## Start the full local stack (dashboard + ollama + indexer)
	docker compose up -d --build dashboard ollama indexer

stack-stats:  ## Snapshot container resource use against the budget in DOCKER.md
	$(PYTHON) scripts/check_stack_budget.py

# ─── Self-healing ───────────────────────────────────────────────────────────

self-heal:  ## Run one detect-and-repair cycle
	$(PYTHON) scripts/self_heal.py --once

self-heal-watch:  ## Supervise continuously
	$(PYTHON) scripts/self_heal.py --watch --interval 60

self-heal-test:  ## Chaos suite: prove the system heals rather than just survives
	$(PYTHON) scripts/chaos_suite.py

# ─── Front door ─────────────────────────────────────────────────────────────

buddy-preview:  ## Vite dev server with the 3D buddy scene
	cd web && npm run dev

buddy-capture:  ## Build, serve, and screenshot /esd-lab with design assertions
	cd web && npx vite build && (npx vite preview --port 4173 & sleep 6; node scripts/capture-esd-lab.mjs; kill %1)

gpu-check:  ## Detect the GPU, pick the model tier, and report honestly
	$(PYTHON) scripts/check_gpu_runtime.py

gpu-env:  ## Emit sourceable runtime config for the detected tier
	$(PYTHON) scripts/check_gpu_runtime.py --env

models-benchmark:  ## Rank installed models on this lab's grounded-answer task
	$(PYTHON) scripts/benchmark_local_models.py --write config/model_benchmark.json

model-warm:  ## Load the serving model into memory and hold it there
	$(PYTHON) scripts/warm_local_model.py

model-residency:  ## Report which models are actually resident
	$(PYTHON) scripts/warm_local_model.py --check

model-sync:  ## Build the tuned esd-buddy model from the benchmark winner
	$(PYTHON) scripts/sync_local_model.py --apply

check-automations:  ## Run every automation and report what is healthy
	$(PYTHON) scripts/check_automations.py

check-automations-quick:  ## Same, minus the slow rebuild and scrape checks
	$(PYTHON) scripts/check_automations.py --quick

logs-prune:  ## Delete local log files older than LOG_RETENTION_DAYS (default: 30)
	bash scripts/prune_logs.sh

clean-all: clean-python  ## Remove virtualenv and all generated files
	rm -rf $(VENV)
	@echo "✓ Removed virtualenv. Run 'make install' to reinstall."
