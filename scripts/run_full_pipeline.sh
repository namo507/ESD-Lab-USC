#!/usr/bin/env bash
# NANO Study – Full pipeline runner
# Usage: bash scripts/run_full_pipeline.sh [--dry-run]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${REPO_ROOT}/logs/pipeline.log"
mkdir -p "${REPO_ROOT}/logs"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log() { echo -e "$(date '+%Y-%m-%d %H:%M:%S') | $*" | tee -a "${LOG_FILE}"; }
success() { log "${GREEN}[SUCCESS]${NC} $*"; }
failure() { log "${RED}[FAILURE]${NC} $*"; }

DRY_RUN=""
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN="--dry-run"

# Activate virtual environment
if [[ -f "${REPO_ROOT}/.venv/bin/activate" ]]; then
    # shellcheck disable=SC1091
    source "${REPO_ROOT}/.venv/bin/activate"
    log "Activated .venv"
else
    log "WARNING: .venv not found; using system Python."
fi

run_stage() {
    local name="$1"; shift
    log "--- Stage: ${name} START ---"
    local start; start=$(date +%s)
    if python "$@" ${DRY_RUN}; then
        local end; end=$(date +%s)
        success "${name} completed in $((end - start))s"
    else
        local exit_code=$?
        failure "${name} failed (exit ${exit_code})"
        exit "${exit_code}"
    fi
}

log "=== NANO Full Pipeline START (dry_run=${DRY_RUN:-false}) ==="

run_stage "REDCap Sync"       "${REPO_ROOT}/scripts/redcap_daily_sync.py"
run_stage "ECG Batch Process" "${REPO_ROOT}/scripts/ecg_batch_processor.py"
run_stage "Data Quality Report" "${REPO_ROOT}/scripts/generate_data_quality_report.py"
run_stage "Deidentified Export" "${REPO_ROOT}/scripts/export_deidentified_dataset.py"

log "=== NANO Full Pipeline COMPLETE ==="
