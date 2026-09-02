#!/usr/bin/env bash
# Prune old local runtime and pipeline logs without touching active files.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${LOG_DIR:-${ROOT_DIR}/logs}"
RETENTION_DAYS="${LOG_RETENTION_DAYS:-30}"

if [[ ! -d "$LOG_DIR" ]]; then
  echo "No log directory found at ${LOG_DIR}"
  exit 0
fi

find "$LOG_DIR" -type f \
  \( -name '*.log' -o -name '*.out' \) \
  -mtime +"$RETENTION_DAYS" \
  -print \
  -delete
