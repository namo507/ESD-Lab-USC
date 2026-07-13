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

.PHONY: help install test lint clean clean-python docker-clean up down logs shell rebuild redcap-sync redcap-publish run-pipeline format check-env compose-validate dashboard-build dashboard-up dashboard-down dashboard-logs dashboard-refresh dashboard-demo-inputs dashboard-smoke dashboard-share assistant-status assistant-prepare assistant-bootstrap assistant-probe pages-build pages-deploy pages-watch pages-watch-once pages-runtime-deploy pages-runtime-watch pages-runtime-watch-once share-live k8s-helm-lint k8s-smoke docker-preflight docker-health docker-share-health ops-check logs-prune

help:  ## Show this help message
	@echo "NANO Study — Available Makefile targets:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "HIPAA REMINDER: Never run pipeline targets on unencrypted drives."

# ─── Setup ───────────────────────────────────────────────────────────────────

install: $(VENV)/bin/activate  ## Install Python dependencies in virtualenv
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

redcap-publish:  ## Pull REDCap, rebuild payload/context, reindex assistant, and fan out to Pages/Docker/K8s checks
	@echo "Publishing REDCap dashboard payload across Pages, Docker, and Kubernetes surfaces..."
	@$(MAKE) redcap-sync
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

dashboard-up:  ## Start the live website runtime at http://localhost:8080/ (overview at /overview)
	$(COMPOSE) up --build dashboard

dashboard-down:  ## Stop the live dashboard container
	$(COMPOSE) down

dashboard-logs:  ## Tail live dashboard logs
	$(COMPOSE) logs -f dashboard

dashboard-smoke:  ## Verify the live dashboard container health and auto-rebuild loop
	$(PYTHON) scripts/check_dashboard_runtime.py --base-url $(DASHBOARD_LOCAL_URL)
	@echo "✓ Dashboard Docker runtime passed smoke checks."

assistant-status:  ## Show NVIDIA provider configuration and non-billable readiness state
	$(PYTHON) scripts/prepare_dashboard_assistant.py --validate-config

assistant-prepare:  ## Validate provider config and rebuild repository grounding indexes
	$(PYTHON) scripts/prepare_dashboard_assistant.py --validate-config --reindex

assistant-bootstrap: $(VENV)/bin/activate  ## Install hosted-provider dependencies and require configured credentials
	$(VENV)/bin/pip install -r dashboard/requirements.txt
	$(VENV)/bin/python scripts/prepare_dashboard_assistant.py --validate-config --require-ready

assistant-probe:  ## Probe the configured NVIDIA OpenAI-compatible endpoint without generating text
	$(PYTHON) scripts/prepare_dashboard_assistant.py --validate-config --probe-provider --require-ready

dashboard-share:  ## Start a public share tunnel and print the shareable URL
	@if command -v docker >/dev/null 2>&1; then \
		$(MAKE) docker-preflight; \
	else \
		echo "Docker unavailable; skipping Docker health preflight and using the local runtime fallback."; \
	fi
	bash scripts/share_dashboard.sh

pages-build:  ## Build the canonical Cloudflare Pages dashboard SPA artifact locally
	VITE_USE_MOCKS=true VITE_LIVE_ASSISTANT=true VITE_FEATURE_RSA_GROWTH_CURVES=true VITE_FEATURE_HDA_TIMELINE_PLAYER=true VITE_FEATURE_THERMAL_HEATMAP=true VITE_FEATURE_SWIMMER_PLOT=true VITE_FEATURE_ATTRITION_FUNNEL=true VITE_FEATURE_SDOH_MAP=true VITE_FEATURE_SHAP_BEESWARM=true VITE_FEATURE_CLUSTER_VIEWER=true VITE_FEATURE_MODEL_LEADERBOARD=true VITE_FEATURE_CASCADE_DAG=true VITE_FEATURE_REDCAP_COMPLETENESS=true VITE_FEATURE_REDCAP_VISIT_HEALTH=true VITE_FEATURE_ECG_QUALITY_MONITOR=true VITE_FEATURE_SPATIAL_ASSESSMENT_MATRIX=true VITE_FEATURE_ATTACHMENT_HEATMAP=true VITE_FEATURE_CGA_RIVER=true VITE_FEATURE_COUNTY_COMPARATOR=true VITE_FEATURE_PARTICIPANT_TIMELINE_V2=true VITE_FEATURE_MODEL_CONFIDENCE_TERRAIN=true VITE_FEATURE_ATTRITION_FUNNEL_V2=true VITE_FEATURE_GUIDED_EXPLORER=true VITE_FEATURE_PUBLIC_INSIGHTS=true VITE_FEATURE_EXECUTIVE_MODE=true VITE_FEATURE_DYN_INFANT_PASSPORT=true VITE_FEATURE_DYN_CASCADE_SIMULATOR=true VITE_FEATURE_MULTIMODAL_SYNCHRONY=true VITE_FEATURE_DYN_CO_REGULATION_BRAID=true npm --prefix web run build
	$(PYTHON) scripts/build_pages_site.py

pages-deploy: pages-build  ## Build + deploy the canonical Cloudflare Pages dashboard SPA
	npx --yes wrangler@3.112.0 pages deploy dist/pages-wrapper --project-name $${CLOUDFLARE_PAGES_PROJECT:-esd-lab-namo} --branch $${CLOUDFLARE_PAGES_BRANCH:-main} --commit-dirty=true

pages-watch:  ## Watch the canonical Pages dashboard inputs and redeploy on change
	$(PYTHON) scripts/watch_pages_site.py

pages-watch-once:  ## One-shot build + deploy of the canonical Pages dashboard site
	$(PYTHON) scripts/watch_pages_site.py --once

k8s-helm-lint:  ## Validate Kubernetes Helm templates locally
	$(HELM) lint k8s/helm/esd-lab-dashboard \
		--set existingClaims.readings=esd-readings-rwx \
		--set existingClaims.data=esd-dashboard-data-rwx
	$(HELM) template esd-lab-dashboard k8s/helm/esd-lab-dashboard \
		--namespace esd-lab \
		--set existingClaims.readings=esd-readings-rwx \
		--set existingClaims.data=esd-dashboard-data-rwx >/tmp/esd-lab-dashboard.yaml
	@echo "✓ Helm templates rendered to /tmp/esd-lab-dashboard.yaml"

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
	$(PYTHON) scripts/check_docker_health.py --compose-file docker-compose.yml --project-name esd-lab-usc --service dashboard --check-url $(DASHBOARD_LOCAL_URL)/api/healthz --repair --json

docker-share-health:  ## Check dashboard plus the currently selected share sidecar
	$(PYTHON) scripts/check_docker_health.py --compose-file docker-compose.yml --project-name esd-lab-usc --profile share --service dashboard --service $(SHARE_SERVICE) --check-url $(DASHBOARD_LOCAL_URL)/api/healthz --repair --json

ops-check: compose-validate  ## Check canonical + runtime-share public dashboard surfaces
	$(PYTHON) scripts/check_live_surfaces.py --max-stamp-age-hours 168

logs-prune:  ## Delete local log files older than LOG_RETENTION_DAYS (default: 30)
	bash scripts/prune_logs.sh

clean-all: clean-python  ## Remove virtualenv and all generated files
	rm -rf $(VENV)
	@echo "✓ Removed virtualenv. Run 'make install' to reinstall."
