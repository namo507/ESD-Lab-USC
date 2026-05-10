# NANO Study — Makefile
# Usage: make <target>
# Run `make help` to list all targets

.DEFAULT_GOAL := help
PYTHON := python3
VENV ?= .venv
WRANGLER_PAGES_CMD ?= npx --yes wrangler@3.112.0
PIP := $(VENV)/bin/pip
PYTEST := $(VENV)/bin/pytest
BLACK := $(VENV)/bin/black
FLAKE8 := $(VENV)/bin/flake8
ISORT := $(VENV)/bin/isort

.PHONY: help install test lint clean redcap-sync run-pipeline format check-env dashboard-build dashboard-up dashboard-down dashboard-logs dashboard-refresh dashboard-demo-inputs dashboard-smoke dashboard-share share-named share-quick pages-build pages-deploy assistant-status assistant-prepare

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
	$(PYTHON) dashboard/pipelines/build_dashboard_data.py --bootstrap-demo-inputs --fallback-synthetic
	@echo "✓ Dashboard JSON refreshed."

dashboard-demo-inputs:  ## Materialize repo-local dashboard demo inputs
	$(PYTHON) dashboard/pipelines/bootstrap_dashboard_demo_inputs.py
	@echo "✓ Repo-local dashboard demo inputs refreshed."

dashboard-build:  ## Build the live dashboard Docker image
	docker compose build dashboard

dashboard-up:  ## Start the live dashboard at http://localhost:8080/dashboard/
	docker compose up --build dashboard

dashboard-down:  ## Stop the live dashboard container
	docker compose down

dashboard-logs:  ## Tail live dashboard logs
	docker compose logs -f dashboard

dashboard-smoke:  ## Verify the live dashboard container health and auto-rebuild loop
	$(PYTHON) scripts/check_dashboard_runtime.py --base-url http://127.0.0.1:8080
	@echo "✓ Dashboard Docker runtime passed smoke checks."

dashboard-share:  ## Start a public share tunnel (auto: prefer named, fall back to quick)
	bash scripts/share_dashboard.sh --mode auto

share-named:  ## Require a named Cloudflare tunnel; fail if .env is incomplete
	bash scripts/share_dashboard.sh --mode named

share-quick:  ## Force a quick (random) Cloudflare tunnel for one-off shares
	bash scripts/share_dashboard.sh --mode quick

pages-build:  ## Render the Pages wrapper from ORIGIN=<https://...> [KIND=quick|named]
	@if [ -z "$(ORIGIN)" ]; then \
		echo "Usage: make pages-build ORIGIN=https://<host>/dashboard/ [KIND=quick|named]"; \
		exit 64; \
	fi
	$(PYTHON) scripts/build_pages_wrapper.py --origin "$(ORIGIN)" $(if $(KIND),--kind $(KIND))

pages-deploy:  ## Deploy dist/pages-wrapper to esd-lab-namo (production alias). Requires CLOUDFLARE_API_TOKEN.
	@if [ -z "$$CLOUDFLARE_API_TOKEN" ]; then \
		echo "ERROR: CLOUDFLARE_API_TOKEN is unset. Either export an API token with Pages:Edit + Account:Read scopes,"; \
		echo "       or use the git-connected branch path documented in dashboard/public/pages_wrapper/README.md."; \
		exit 78; \
	fi
	@if [ ! -s dist/pages-wrapper/index.html ]; then \
		echo "ERROR: dist/pages-wrapper/index.html missing. Run 'make pages-build ORIGIN=https://...' or 'make dashboard-share' first."; \
		exit 66; \
	fi
	$(WRANGLER_PAGES_CMD) pages deploy dist/pages-wrapper \
		--project-name $${CLOUDFLARE_PAGES_PROJECT:-esd-lab-namo} \
		--branch $${CLOUDFLARE_PAGES_BRANCH:-main} \
		--commit-dirty=true

assistant-status:  ## Check local dashboard assistant readiness
	$(PYTHON) scripts/prepare_dashboard_assistant.py

assistant-prepare:  ## Download local GGUF assets for the dashboard assistant
	$(PYTHON) scripts/prepare_dashboard_assistant.py --download

# ─── Backup ──────────────────────────────────────────────────────────────────

verify-backup:  ## Verify secure server backup integrity
	bash scripts/backup_verification.sh

# ─── Cleanup ─────────────────────────────────────────────────────────────────

clean:  ## Remove Python cache files and test artifacts
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; true
	find . -type f -name "*.pyc" -delete 2>/dev/null; true
	find . -type f -name "*.pyo" -delete 2>/dev/null; true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null; true
	find . -type f -name ".coverage" -delete 2>/dev/null; true
	@echo "✓ Cleaned Python cache and test artifacts."

clean-all: clean  ## Remove virtualenv and all generated files
	rm -rf $(VENV)
	@echo "✓ Removed virtualenv. Run 'make install' to reinstall."
