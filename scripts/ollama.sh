#!/usr/bin/env bash
# Manage the local Ollama runtime that backs the dashboard assistant.
#
# The Ollama binary and model weights are large and are never committed; this
# script installs a pinned release from https://github.com/ollama/ollama into
# .tools/ollama and keeps the model store under models/ollama. Both paths are
# gitignored and rebuildable, so a clone only needs:
#
#   make ollama-install && make ollama-up && make ollama-pull
#
# Subcommands: install | serve | stop | status | pull | warm | version
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

OLLAMA_VERSION="${OLLAMA_VERSION:-v0.32.5}"
OLLAMA_INSTALL_ROOT="${OLLAMA_INSTALL_ROOT:-${REPO_ROOT}/.tools/ollama}"
OLLAMA_BIN_DIR="${OLLAMA_INSTALL_ROOT}/bin"
OLLAMA_BIN="${OLLAMA_BIN_DIR}/ollama"
OLLAMA_STATE_DIR="${REPO_ROOT}/.tools/ollama-state"
OLLAMA_PID_FILE="${OLLAMA_STATE_DIR}/ollama.pid"
OLLAMA_LOG_FILE="${OLLAMA_STATE_DIR}/ollama.log"
OLLAMA_VERSION_STAMP="${OLLAMA_INSTALL_ROOT}/.installed-version"

# Runtime tuning shared by every entry point. Keep OLLAMA_CONTEXT_LENGTH in sync
# with DASHBOARD_ASSISTANT_CONTEXT_WINDOW or packed grounding gets truncated.
export OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"
export OLLAMA_MODELS="${OLLAMA_MODELS:-${REPO_ROOT}/models/ollama}"
export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-30m}"
export OLLAMA_CONTEXT_LENGTH="${OLLAMA_CONTEXT_LENGTH:-8192}"
export OLLAMA_NUM_PARALLEL="${OLLAMA_NUM_PARALLEL:-2}"
export OLLAMA_MAX_LOADED_MODELS="${OLLAMA_MAX_LOADED_MODELS:-1}"
# A memory-constrained host (small devcontainer, swap-backed VM) can need
# several minutes for the first load; the default 5m aborts mid-load.
export OLLAMA_LOAD_TIMEOUT="${OLLAMA_LOAD_TIMEOUT:-15m}"

ASSISTANT_MODEL="${DASHBOARD_ASSISTANT_MODEL:-${OLLAMA_MODEL:-llama3.2:3b}}"
HEALTH_URL="http://${OLLAMA_HOST}"

log()  { printf '%s\n' "$*" >&2; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

resolve_binary() {
  if [ -x "${OLLAMA_BIN}" ]; then
    printf '%s' "${OLLAMA_BIN}"
    return 0
  fi
  if command -v ollama >/dev/null 2>&1; then
    command -v ollama
    return 0
  fi
  return 1
}

require_binary() {
  resolve_binary || fail "Ollama is not installed. Run: make ollama-install"
}

release_asset() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "${os}" in
    Darwin) printf 'ollama-darwin.tgz' ;;
    Linux)
      case "${arch}" in
        x86_64|amd64) printf 'ollama-linux-amd64.tar.zst' ;;
        aarch64|arm64) printf 'ollama-linux-arm64.tar.zst' ;;
        *) fail "Unsupported Linux architecture: ${arch}" ;;
      esac
      ;;
    *) fail "Unsupported operating system: ${os} (install Ollama manually from https://ollama.com/download)" ;;
  esac
}

extract_archive() {
  local archive="$1" target="$2"
  mkdir -p "${target}"
  case "${archive}" in
    *.tgz|*.tar.gz)
      tar -xzf "${archive}" -C "${target}"
      ;;
    *.tar.zst)
      if tar --zstd -xf "${archive}" -C "${target}" 2>/dev/null; then
        return 0
      fi
      if command -v zstd >/dev/null 2>&1; then
        zstd -dc "${archive}" | tar -xf - -C "${target}"
        return 0
      fi
      fail "zstd is required to unpack ${archive##*/}. Install it (apt-get install zstd | brew install zstd) and re-run."
      ;;
    *) fail "Unknown archive format: ${archive}" ;;
  esac
}

cmd_install() {
  if [ "${1:-}" != "--force" ] && [ -x "${OLLAMA_BIN}" ] \
     && [ "$(cat "${OLLAMA_VERSION_STAMP}" 2>/dev/null || true)" = "${OLLAMA_VERSION}" ]; then
    log "Ollama ${OLLAMA_VERSION} is already installed at ${OLLAMA_BIN}"
    return 0
  fi

  local asset url tmp archive
  asset="$(release_asset)"
  url="https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/${asset}"
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '${tmp}'" RETURN

  log "Downloading Ollama ${OLLAMA_VERSION} (${asset}) ..."
  archive="${tmp}/${asset}"
  curl --fail --location --progress-bar --output "${archive}" "${url}" \
    || fail "Download failed: ${url}"

  # The release publishes one checksum manifest for every asset.
  if curl --fail --silent --location --output "${tmp}/sha256sum.txt" \
       "https://github.com/ollama/ollama/releases/download/${OLLAMA_VERSION}/sha256sum.txt"; then
    local expected actual
    expected="$(awk -v want="${asset}" '$2 == want || $2 == "*"want {print $1}' "${tmp}/sha256sum.txt" | head -1)"
    if [ -n "${expected}" ]; then
      actual="$(sha256sum "${archive}" | awk '{print $1}')"
      [ "${expected}" = "${actual}" ] || fail "Checksum mismatch for ${asset}"
      log "Checksum verified."
    else
      log "warning: ${asset} is not listed in sha256sum.txt; skipping checksum verification."
    fi
  else
    log "warning: could not download sha256sum.txt; skipping checksum verification."
  fi

  rm -rf "${OLLAMA_INSTALL_ROOT}"
  extract_archive "${archive}" "${OLLAMA_INSTALL_ROOT}"

  if [ ! -x "${OLLAMA_BIN}" ]; then
    # The macOS archive ships the binary at the archive root.
    local found
    found="$(find "${OLLAMA_INSTALL_ROOT}" -maxdepth 3 -type f -name ollama -perm -u+x | head -1 || true)"
    [ -n "${found}" ] || fail "The downloaded archive did not contain an ollama binary."
    mkdir -p "${OLLAMA_BIN_DIR}"
    [ "${found}" = "${OLLAMA_BIN}" ] || ln -sf "${found}" "${OLLAMA_BIN}"
  fi

  printf '%s' "${OLLAMA_VERSION}" > "${OLLAMA_VERSION_STAMP}"
  log "Installed: $("${OLLAMA_BIN}" --version 2>/dev/null | head -1)"
  log "Model store: ${OLLAMA_MODELS}"
}

server_running() {
  curl --fail --silent --max-time 2 "${HEALTH_URL}/api/version" >/dev/null 2>&1
}

cmd_serve() {
  if server_running; then
    log "Ollama is already serving on ${OLLAMA_HOST}"
    return 0
  fi
  local bin
  bin="$(require_binary)"
  mkdir -p "${OLLAMA_STATE_DIR}" "${OLLAMA_MODELS}"

  log "Starting Ollama on ${OLLAMA_HOST} (models: ${OLLAMA_MODELS}) ..."
  nohup "${bin}" serve >>"${OLLAMA_LOG_FILE}" 2>&1 &
  printf '%s' "$!" > "${OLLAMA_PID_FILE}"

  local attempt
  for attempt in $(seq 1 60); do
    if server_running; then
      log "Ollama is ready (log: ${OLLAMA_LOG_FILE})"
      return 0
    fi
    sleep 1
  done
  fail "Ollama did not become ready in 60s. Check ${OLLAMA_LOG_FILE}"
}

cmd_stop() {
  if [ -f "${OLLAMA_PID_FILE}" ]; then
    local pid
    pid="$(cat "${OLLAMA_PID_FILE}")"
    if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
      log "Stopped Ollama (pid ${pid})"
    fi
    rm -f "${OLLAMA_PID_FILE}"
    return 0
  fi
  log "No repository-managed Ollama process is running."
}

cmd_status() {
  if ! server_running; then
    log "Ollama is not reachable at ${HEALTH_URL}. Start it with: make ollama-up"
    return 1
  fi
  printf 'host: %s\n' "${HEALTH_URL}"
  printf 'version: %s\n' "$(curl --fail --silent "${HEALTH_URL}/api/version")"
  printf 'model: %s\n' "${ASSISTANT_MODEL}"
  printf 'installed:\n'
  curl --fail --silent "${HEALTH_URL}/api/tags" \
    | tr ',' '\n' | grep -o '"name":"[^"]*"' | cut -d'"' -f4 | sed 's/^/  - /' || true
}

cmd_pull() {
  local model="${1:-${ASSISTANT_MODEL}}"
  local bin
  bin="$(require_binary)"
  cmd_serve
  log "Pulling ${model} ..."
  "${bin}" pull "${model}"
  cmd_warm "${model}"
}

cmd_warm() {
  local model="${1:-${ASSISTANT_MODEL}}"
  server_running || fail "Ollama is not running. Start it with: make ollama-up"
  log "Preloading ${model} (keep-alive ${OLLAMA_KEEP_ALIVE}) ..."
  curl --fail --silent --max-time 300 "${HEALTH_URL}/api/generate" \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"${model}\",\"prompt\":\"\",\"stream\":false,\"keep_alive\":\"${OLLAMA_KEEP_ALIVE}\"}" \
    >/dev/null || fail "Could not preload ${model}. Run: make ollama-pull"
  log "Model ${model} is loaded and warm."
}

cmd_version() {
  local bin
  bin="$(require_binary)"
  "${bin}" --version
}

case "${1:-}" in
  install) shift; cmd_install "$@" ;;
  serve|up|start) shift; cmd_serve "$@" ;;
  stop|down) shift; cmd_stop "$@" ;;
  status) shift; cmd_status "$@" ;;
  pull) shift; cmd_pull "$@" ;;
  warm) shift; cmd_warm "$@" ;;
  version) shift; cmd_version "$@" ;;
  *)
    cat >&2 <<USAGE
Usage: scripts/ollama.sh <command>

  install [--force]  Install the pinned Ollama release into .tools/ollama
  serve              Start the local Ollama server and wait until it is ready
  stop               Stop the repository-managed Ollama server
  status             Print runtime version and installed models
  pull [model]       Pull (default: ${ASSISTANT_MODEL}) and preload it
  warm [model]       Preload a model so the first question is not a cold start
  version            Print the installed Ollama version
USAGE
    exit 2
    ;;
esac
