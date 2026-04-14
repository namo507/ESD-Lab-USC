#!/usr/bin/env bash
# NANO Study – Backup verification script
# Usage: bash scripts/backup_verification.sh [--update]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${REPO_ROOT}/logs/backup_verification.log"
MANIFEST="${REPO_ROOT}/logs/checksum_manifest.sha256"
mkdir -p "${REPO_ROOT}/logs"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "$(date '+%Y-%m-%d %H:%M:%S') | $*" | tee -a "${LOG_FILE}"; }
ok()   { log "${GREEN}[OK]${NC}    $*"; }
fail() { log "${RED}[FAIL]${NC}  $*"; }

UPDATE=false
[[ "${1:-}" == "--update" ]] && UPDATE=true

DATA_ROOT="${NANO_DATA_ROOT:-}"
if [[ -z "${DATA_ROOT}" ]]; then
    log "WARNING: NANO_DATA_ROOT not set; skipping checksum generation."
    exit 0
fi

if [[ ! -d "${DATA_ROOT}" ]]; then
    fail "DATA_ROOT does not exist: ${DATA_ROOT}"
    exit 1
fi

log "=== Backup verification START (update=${UPDATE}) ==="
log "DATA_ROOT: ${DATA_ROOT}"

ERRORS=0

if [[ "${UPDATE}" == "true" ]]; then
    log "Generating new checksum manifest: ${MANIFEST}"
    find "${DATA_ROOT}" -type f \( -name "*.parquet" -o -name "*.csv" -o -name "*.edf" \) \
        -exec sha256sum {} \; > "${MANIFEST}"
    log "Manifest updated: $(wc -l < "${MANIFEST}") files checksummed."
    ok "Manifest update complete."
    exit 0
fi

if [[ ! -f "${MANIFEST}" ]]; then
    fail "No manifest found at ${MANIFEST}. Run with --update first."
    exit 1
fi

log "Verifying checksums against manifest..."
while IFS= read -r line; do
    expected_hash="${line%% *}"
    filepath="${line#* }"
    filepath="${filepath# }"   # strip leading space
    if [[ ! -f "${filepath}" ]]; then
        fail "MISSING: ${filepath}"
        ERRORS=$((ERRORS + 1))
        continue
    fi
    actual_hash=$(sha256sum "${filepath}" | awk '{print $1}')
    if [[ "${actual_hash}" != "${expected_hash}" ]]; then
        fail "MISMATCH: ${filepath}"
        ERRORS=$((ERRORS + 1))
    else
        ok "OK: $(basename "${filepath}")"
    fi
done < "${MANIFEST}"

if [[ "${ERRORS}" -gt 0 ]]; then
    fail "Backup verification FAILED: ${ERRORS} error(s)."
    # Send alert email if configured
    PI_EMAIL="${PI_EMAIL:-}"
    SMTP_HOST="${SMTP_HOST:-localhost}"
    if [[ -n "${PI_EMAIL}" ]] && command -v sendmail &>/dev/null; then
        printf "Subject: [NANO] Backup checksum FAILURE\n\n%d checksum error(s) detected.\nSee %s\n" \
            "${ERRORS}" "${LOG_FILE}" | sendmail "${PI_EMAIL}" || true
        log "Alert email sent to ${PI_EMAIL}."
    fi
    exit 1
fi

ok "All checksums verified successfully."
log "=== Backup verification COMPLETE ==="
