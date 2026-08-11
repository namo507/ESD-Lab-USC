#!/usr/bin/env bash
# Share the live NANO dashboard with a clearly-labelled public URL.
#
# Modes:
#   --mode auto      (default) prefer named tunnel; fall back to quick tunnel
#                    only with an explicit warning.
#   --mode named     require a named Cloudflare tunnel; fail loudly otherwise.
#   --mode quick     always run a quick (random hostname) tunnel.
#
# Output is unambiguous:
#   * Canonical public URL — the URL operators should publish.
#   * Ephemeral origin URL — the rotating cloudflared origin (only printed
#                            when the canonical URL is the Pages wrapper or
#                            a quick tunnel).
#
# After a quick tunnel comes up, this script automatically regenerates the
# Cloudflare Pages runtime wrapper at `dashboard/public/pages_wrapper/` so a
# stable preview URL can embed the new origin. When CLOUDFLARE_API_TOKEN is
# available, it also deploys the refreshed runtime wrapper preview to Pages
# automatically without touching the canonical static site alias.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
STATE_DIR="${XDG_RUNTIME_DIR:-/tmp}/esd-lab-usc-share"
mkdir -p "$STATE_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DASHBOARD_HOST="${DASHBOARD_HOST:-127.0.0.1}"
DASHBOARD_PORT="${DASHBOARD_PORT:-8080}"
DASHBOARD_URL="http://${DASHBOARD_HOST}:${DASHBOARD_PORT}"
DASHBOARD_HEALTH_TIMEOUT="${DASHBOARD_HEALTH_TIMEOUT:-5}"
DASHBOARD_PID_FILE="$STATE_DIR/dashboard.pid"
DASHBOARD_LOG_FILE="$STATE_DIR/dashboard.log"
TUNNEL_PID_FILE="$STATE_DIR/cloudflared.pid"
TUNNEL_LOG_FILE="$STATE_DIR/cloudflared.log"
ORIGIN_RECORD="$STATE_DIR/last_origin.txt"
CLOUDFLARED_VERSION="${CLOUDFLARED_VERSION:-2026.5.2}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker/compose.dev.yml}"

PAGES_RUNTIME_PROJECT="${CLOUDFLARE_RUNTIME_PAGES_PROJECT:-${CLOUDFLARE_PAGES_PROJECT:-esd-lab-namo}}"
PAGES_RUNTIME_BRANCH="${CLOUDFLARE_RUNTIME_PAGES_BRANCH:-runtime-share}"
PAGES_RUNTIME_PREVIEW="https://${PAGES_RUNTIME_BRANCH}.${PAGES_RUNTIME_PROJECT}.pages.dev/"
PAGES_CANONICAL_PROJECT="${CLOUDFLARE_PAGES_PROJECT:-esd-lab-namo}"
PAGES_CANONICAL_URL="https://${PAGES_CANONICAL_PROJECT}.pages.dev/"

mode="auto"
continuous="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) mode="$2"; shift 2 ;;
    --mode=*) mode="${1#--mode=}"; shift ;;
    --continuous) continuous="true"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done
case "$mode" in
  auto|named|quick) : ;;
  *) echo "--mode must be one of: auto | named | quick (got '$mode')" >&2; exit 64 ;;
esac

publish_canonical_pages="${AUTO_DEPLOY_CANONICAL_PAGES:-$continuous}"

named_tunnel_token="${CLOUDFLARE_TUNNEL_TOKEN:-${CLOUDFLARED_TUNNEL_TOKEN:-}}"
public_hostname="${DASHBOARD_PUBLIC_HOSTNAME:-}"
share_service="dashboard-share"

is_invalid_named_hostname() {
  [[ "$1" == *.pages.dev ]]
}

case "$mode" in
  named)
    if [[ -z "$named_tunnel_token" ]] || [[ -z "$public_hostname" ]]; then
      echo "ERROR: --mode named requires CLOUDFLARE_TUNNEL_TOKEN and DASHBOARD_PUBLIC_HOSTNAME in .env." >&2
      echo "       The legacy CLOUDFLARED_TUNNEL_TOKEN alias is also accepted for the token." >&2
      echo "Hint: see README.md § Stable named-tunnel sharing." >&2
      exit 78
    fi
    if is_invalid_named_hostname "$public_hostname"; then
      echo "ERROR: DASHBOARD_PUBLIC_HOSTNAME cannot use a Cloudflare Pages domain (${public_hostname})." >&2
      echo "       Named tunnels require a hostname on a DNS zone you control, not *.pages.dev." >&2
      echo "Hint: use --mode quick for an ephemeral tunnel, or attach a custom domain and set DASHBOARD_PUBLIC_HOSTNAME to that hostname." >&2
      exit 78
    fi
    use_named="true"
    ;;
  quick)
    if [[ -n "$named_tunnel_token" ]] || [[ -n "$public_hostname" ]]; then
      echo "Note: --mode quick — ignoring CLOUDFLARE_TUNNEL_TOKEN/DASHBOARD_PUBLIC_HOSTNAME for this run." >&2
    fi
    named_tunnel_token=""
    public_hostname=""
    use_named="false"
    ;;
  auto)
    if [[ -n "$named_tunnel_token" && -n "$public_hostname" ]]; then
      if is_invalid_named_hostname "$public_hostname"; then
        echo "WARNING: DASHBOARD_PUBLIC_HOSTNAME=${public_hostname} uses *.pages.dev, which cannot host a named tunnel." >&2
        echo "         Falling back to a quick tunnel. Attach a custom domain for stable named-tunnel mode." >&2
        named_tunnel_token=""
        public_hostname=""
        use_named="false"
      else
        use_named="true"
      fi
    elif [[ -n "$named_tunnel_token" && -z "$public_hostname" ]]; then
      echo "WARNING: a Cloudflare tunnel token is set but DASHBOARD_PUBLIC_HOSTNAME is blank." >&2
      echo "         Falling back to a quick (random) tunnel because no stable hostname is wired up." >&2
      echo "         Pass --mode named to fail instead, or set DASHBOARD_PUBLIC_HOSTNAME." >&2
      named_tunnel_token=""
      use_named="false"
    elif [[ -z "$named_tunnel_token" && -n "$public_hostname" ]]; then
      echo "ERROR: DASHBOARD_PUBLIC_HOSTNAME is set but CLOUDFLARE_TUNNEL_TOKEN is missing." >&2
      exit 78
    else
      use_named="false"
    fi
    ;;
esac

if [[ -z "${AUTO_DEPLOY_CANONICAL_PAGES:-}" && "$use_named" == "true" ]]; then
  publish_canonical_pages="true"
fi

if [[ "$use_named" != "true" && "$publish_canonical_pages" == "true" ]]; then
  echo "WARNING: canonical Pages publication is disabled for ephemeral quick tunnels." >&2
  echo "         The stable runtime-share preview will be refreshed instead." >&2
  publish_canonical_pages="false"
fi

if [[ "$use_named" == "true" ]]; then
  share_service="dashboard-share-named"
  # Compose secrets read the canonical variable name. Normalize the supported
  # legacy alias before invoking Compose so named mode cannot pass validation
  # and then start without its token.
  export CLOUDFLARE_TUNNEL_TOKEN="$named_tunnel_token"
fi

have_command() {
  command -v "$1" >/dev/null 2>&1
}

redact_sensitive_output() {
  sed -E \
    -e 's/(CLOUDFLARE_TUNNEL_TOKEN:)[^] ]+/\1<redacted>/g' \
    -e 's/(CLOUDFLARE_API_TOKEN[:=])[A-Za-z0-9._~+\/=-]+/\1<redacted>/g' \
    -e 's/(--token )[A-Za-z0-9._~+\/=-]+/\1<redacted>/g'
}

safe_tail_tunnel_log() {
  local lines="${1:-120}"
  tail -n "$lines" "$TUNNEL_LOG_FILE" 2>/dev/null | tr -d '\000' | redact_sensitive_output || true
}

stop_pid_file() {
  local pid_file="$1"
  if [[ ! -f "$pid_file" ]]; then
    return
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" >/dev/null 2>&1 || true
  fi
  rm -f "$pid_file"
}

wait_for_dashboard() {
  local deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    if curl -fsS --max-time "$DASHBOARD_HEALTH_TIMEOUT" "${DASHBOARD_URL}/api/healthz" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

resolve_python() {
  local candidate
  for candidate in \
    "${DASHBOARD_PYTHON:-}" \
    "${PYTHON:-}" \
    "$ROOT_DIR/.devcontainer/.venv/bin/python" \
    "$ROOT_DIR/.venv/bin/python" \
    "$(command -v python3 2>/dev/null || true)" \
    "$(command -v python 2>/dev/null || true)"
  do
    if [[ -n "$candidate" && -x "$candidate" ]] && "$candidate" - <<'PY' >/dev/null 2>&1; then
import sys
raise SystemExit(0 if sys.version_info >= (3, 9) else 1)
PY
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "No Python 3.9+ interpreter was found. Set DASHBOARD_PYTHON to a compatible runtime." >&2
  return 1
}

ensure_local_dashboard() {
  if curl -fsS --max-time "$DASHBOARD_HEALTH_TIMEOUT" "${DASHBOARD_URL}/api/healthz" >/dev/null 2>&1; then
    echo "Using existing local website runtime on ${DASHBOARD_URL}/"
    return 0
  fi

  if have_command lsof && lsof -tiTCP:"${DASHBOARD_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port ${DASHBOARD_PORT} is already in use, but ${DASHBOARD_URL}/api/healthz is not responding." >&2
    echo "Stop the conflicting process or set DASHBOARD_PORT before rerunning this command." >&2
    exit 1
  fi

  local python_bin
  python_bin="$(resolve_python)" || {
    echo "No Python interpreter was found for the local dashboard runtime." >&2
    exit 1
  }

  stop_pid_file "$DASHBOARD_PID_FILE"
  echo "Starting local website runtime on ${DASHBOARD_URL}/..."
  nohup "$python_bin" dashboard/server/live_dashboard_server.py --fallback-synthetic --host "$DASHBOARD_HOST" --port "$DASHBOARD_PORT" >"$DASHBOARD_LOG_FILE" 2>&1 &
  echo $! >"$DASHBOARD_PID_FILE"

  if ! wait_for_dashboard; then
    echo "Timed out waiting for the local dashboard runtime to become healthy." >&2
    tail -n 80 "$DASHBOARD_LOG_FILE" >&2 || true
    exit 1
  fi
}

ensure_cloudflared() {
  if [[ -n "${CLOUDFLARED_BIN:-}" ]]; then
    if [[ -x "$CLOUDFLARED_BIN" ]]; then
      printf '%s\n' "$CLOUDFLARED_BIN"
      return 0
    fi
    echo "CLOUDFLARED_BIN is set but not executable: ${CLOUDFLARED_BIN}" >&2
    exit 1
  fi

  local cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/esd-lab-usc/bin"
  mkdir -p "$cache_dir"

  local arch raw_arch download_url
  raw_arch="$(uname -m)"
  case "$raw_arch" in
    x86_64|amd64)
      arch="amd64"
      ;;
    aarch64|arm64)
      arch="arm64"
      ;;
    *)
      echo "Unsupported architecture for automatic cloudflared download: ${raw_arch}" >&2
      exit 1
      ;;
  esac

  local cloudflared_bin="$cache_dir/cloudflared-${CLOUDFLARED_VERSION}-linux-${arch}"
  if [[ -x "$cloudflared_bin" ]]; then
    printf '%s\n' "$cloudflared_bin"
    return 0
  fi

  download_url="https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-${arch}"
  echo "Downloading cloudflared ${CLOUDFLARED_VERSION} for ${raw_arch}..." >&2
  curl -fsSL "$download_url" -o "${cloudflared_bin}.tmp"
  chmod +x "${cloudflared_bin}.tmp"
  mv "${cloudflared_bin}.tmp" "$cloudflared_bin"
  printf '%s\n' "$cloudflared_bin"
}

start_cloudflared() {
  local cloudflared_bin="$1"
  local tunnel_protocol="${CLOUDFLARE_TUNNEL_PROTOCOL:-${TUNNEL_TRANSPORT_PROTOCOL:-http2}}"
  local cloudflared_env=(
    env
    -u CLOUDFLARE_TUNNEL_TOKEN
    -u CLOUDFLARED_TUNNEL_TOKEN
    -u CLOUDFLARE_TUNNEL_ID
    -u CLOUDFLARE_TUNNEL_NAME
    -u TUNNEL_TOKEN
    -u TUNNEL_ORIGIN_CERT
    "TUNNEL_TRANSPORT_PROTOCOL=${tunnel_protocol}"
  )

  if [[ "$use_named" == "true" ]]; then
    nohup "${cloudflared_env[@]}" "$cloudflared_bin" tunnel --metrics 127.0.0.1:20242 --no-autoupdate run --token "$named_tunnel_token" --url "$DASHBOARD_URL" >"$TUNNEL_LOG_FILE" 2>&1 &
  else
    nohup "${cloudflared_env[@]}" "$cloudflared_bin" tunnel --metrics 127.0.0.1:20242 --no-autoupdate --url "$DASHBOARD_URL" >"$TUNNEL_LOG_FILE" 2>&1 &
  fi

  echo $! >"$TUNNEL_PID_FILE"
}

auto_deploy_pages_wrapper() {
  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    echo "rebuilt, but auto-deploy skipped because CLOUDFLARE_API_TOKEN is unset"
    return 0
  fi

  local deploy_log
  deploy_log="$STATE_DIR/pages_deploy.log"
  if make pages-runtime-deploy >"$deploy_log" 2>&1; then
    echo "rebuilt and auto-deployed to ${PAGES_RUNTIME_PREVIEW}"
    return 0
  fi

  echo "WARNING: rebuilt, but auto-deploy failed; see ${deploy_log} or run 'make pages-runtime-deploy' manually"
  return 1
}

auto_deploy_canonical_pages_site() {
  local origin_url="$1"

  if [[ "$origin_url" == *.trycloudflare.com/* || "$origin_url" == *.trycloudflare.com ]]; then
    echo "skipped: ephemeral trycloudflare origins are never published to canonical Pages"
    return 0
  fi

  if ! origin_healthy "$origin_url"; then
    echo "skipped: origin failed /api/healthz and canonical Pages will retain fallback mode"
    return 0
  fi

  if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    echo "auto-deploy skipped because CLOUDFLARE_API_TOKEN is unset"
    return 0
  fi

  local deploy_log
  deploy_log="$STATE_DIR/pages_site_deploy.log"
  if PAGES_API_ORIGIN="$origin_url" make pages-deploy >"$deploy_log" 2>&1; then
    echo "rebuilt and auto-deployed to ${PAGES_CANONICAL_URL}"
    return 0
  fi

  echo "WARNING: canonical Pages deploy failed; see ${deploy_log} or rerun 'PAGES_API_ORIGIN=${origin_url} make pages-deploy' manually"
  return 1
}

canonical_pages_healthy() {
  curl -fsS --max-time 20 "$PAGES_CANONICAL_URL" >/dev/null 2>&1 \
    && curl -fsS --max-time 20 "${PAGES_CANONICAL_URL%/}/api/assistant/status" >/dev/null 2>&1
}

cloudflared_ready() {
  curl -fsS --max-time 5 http://127.0.0.1:20242/ready >/dev/null 2>&1
}

origin_healthy() {
  local origin="$1"
  local base="${origin%/}"
  curl -fsS --max-time 15 "${base}/api/healthz" >/dev/null 2>&1
}

assistant_status_healthy() {
  local origin="$1"
  local base="${origin%/}"
  local status_url="${base}/api/assistant/status"
  local python_bin
  python_bin="$(resolve_python 2>/dev/null || true)"

  if [[ -n "$python_bin" ]]; then
    ASSISTANT_STATUS_URL="$status_url" "$python_bin" - <<'PY' >/dev/null 2>&1
import json
import os
import sys
import urllib.request


def is_fallback(payload: dict[str, object]) -> bool:
    model = payload.get("model") or payload.get("model_id") or ""
    message = payload.get("message") or payload.get("error") or payload.get("last_error") or ""
    reason = payload.get("reason") or ""
    return (
        payload.get("fallback") is True
        or model == "pages://fallback-assistant"
        or (isinstance(reason, str) and reason.startswith("upstream-"))
        or (isinstance(message, str) and "fallback assistant" in message.lower())
    )


url = os.environ["ASSISTANT_STATUS_URL"]
with urllib.request.urlopen(url, timeout=20) as response:
    payload = json.load(response)

status = payload.get("status")
state = payload.get("state")
ready = payload.get("ready") is True or status == "ready"

if is_fallback(payload):
    raise SystemExit(2)
if ready or state == "ready":
    raise SystemExit(0)
raise SystemExit(1)
PY
    return $?
  fi

  local payload
  payload="$(curl -fsS --max-time 20 "$status_url" 2>/dev/null || true)"
  local compact
  compact="$(printf '%s' "$payload" | tr -d '[:space:]')"
  [[ -n "$compact" ]] \
    && [[ "$compact" != *'pages://fallback-assistant'* ]] \
    && [[ "$compact" == *'"status":"ready"'* || "$compact" == *'"ready":true'* ]]
}

runtime_preview_healthy() {
  curl -fsS --max-time 20 "$PAGES_RUNTIME_PREVIEW" >/dev/null 2>&1
}

run_share_health_checks() {
  local origin_url="$1"
  local kind="$2"
  local failed=0

  echo
  echo "Health checks:"

  if origin_healthy "$origin_url"; then
    echo "  PASS origin dashboard → ${origin_url}"
  else
    echo "  FAIL origin dashboard → ${origin_url}"
    failed=1
  fi

  if assistant_status_healthy "$origin_url"; then
    echo "  PASS assistant provider → ${origin_url}"
  else
    echo "  WARN assistant is degraded; dashboard remains healthy"
  fi

  if [[ "$kind" == "quick" ]]; then
    if runtime_preview_healthy; then
      echo "  PASS runtime preview shell → ${PAGES_RUNTIME_PREVIEW}"
    else
      echo "  FAIL runtime preview shell → ${PAGES_RUNTIME_PREVIEW}"
      failed=1
    fi
  fi

  if canonical_pages_healthy; then
    echo "  PASS canonical Pages shell/fallback API → ${PAGES_CANONICAL_URL}"
  else
    echo "  FAIL canonical Pages shell/fallback API → ${PAGES_CANONICAL_URL}"
    if [[ "$publish_canonical_pages" != "true" ]]; then
      echo "       Hint: rerun with AUTO_DEPLOY_CANONICAL_PAGES=true or use 'make share-live'."
    fi
    failed=1
  fi

  if [[ "$failed" -eq 0 ]]; then
    echo "Share health: PASS"
    return 0
  fi

  echo "Share health: FAIL"
  return 1
}

# Print the result block. `origin_url` is the cloudflared origin (https://...).
# When the named tunnel is in use, `origin_url` already equals
# `https://${public_hostname}/`.
emit_result() {
  local origin_url="$1"
  local kind="$2"   # named | quick
  local rebuild_msg=""
  local wrapper_auto_deployed="false"
  local pages_site_msg=""

  printf '%s\n' "$origin_url" >"$ORIGIN_RECORD"

  echo
  echo "════════════════════════════════════════════════════════════════════"
  if [[ "$kind" == "named" ]]; then
    echo "  Canonical public URL (stable, named Cloudflare tunnel)"
    echo "  → ${origin_url}"
  else
    echo "  Stable runtime preview URL (Cloudflare Pages branch preview)"
    echo "  → ${PAGES_RUNTIME_PREVIEW}"
    echo
    echo "  Ephemeral cloudflared origin (rotating quick tunnel — do NOT publish)"
    echo "  → ${origin_url}"
  fi
  echo "════════════════════════════════════════════════════════════════════"

  # Rebuild the wrapper artifact deterministically so the iframe target is fresh.
  local python_bin
  python_bin="$(resolve_python)" || python_bin=""
  if [[ -n "$python_bin" ]]; then
    if "$python_bin" scripts/build_pages_wrapper.py --origin "$origin_url" --kind "$kind" >/dev/null; then
      rebuild_msg="rebuilt: dashboard/public/pages_wrapper/index.html and dist/pages-runtime-wrapper/index.html"
      if [[ "$kind" == "quick" ]]; then
        if rebuild_msg="$(auto_deploy_pages_wrapper)"; then
          if [[ "$rebuild_msg" == rebuilt\ and\ auto-deployed* ]]; then
            wrapper_auto_deployed="true"
          fi
        elif [[ -z "$rebuild_msg" ]]; then
          rebuild_msg="WARNING: rebuilt, but auto-deploy failed; run 'make pages-deploy' manually."
        fi
        if [[ "$rebuild_msg" == rebuilt\ and\ auto-deployed* ]]; then
          wrapper_auto_deployed="true"
        fi
      fi
    else
      rebuild_msg="WARNING: failed to regenerate Pages wrapper — run scripts/build_pages_wrapper.py manually."
    fi
  else
    rebuild_msg="WARNING: no Python interpreter found — skipped Pages wrapper regen."
  fi
  echo "Pages wrapper: ${rebuild_msg}"

  if [[ "$publish_canonical_pages" == "true" ]]; then
    if pages_site_msg="$(auto_deploy_canonical_pages_site "$origin_url")"; then
      :
    elif [[ -z "$pages_site_msg" ]]; then
      pages_site_msg="WARNING: canonical Pages deploy failed; run 'PAGES_API_ORIGIN=${origin_url} make pages-deploy' manually."
    fi
    echo "Pages site: ${pages_site_msg}"
  fi

  if [[ "$kind" == "quick" ]]; then
    if [[ "$wrapper_auto_deployed" == "true" ]]; then
      cat <<EOF
Next:
  1. Verify the origin returns 200:    curl -I ${origin_url}
  2. Open ${PAGES_RUNTIME_PREVIEW} in a browser.
EOF
      if [[ "$publish_canonical_pages" == "true" ]]; then
        cat <<EOF
  3. Confirm the canonical site worker now points at the fresh origin:  curl -I ${PAGES_CANONICAL_URL}api/assistant/status
EOF
      fi
      cat <<EOF

This quick-tunnel hostname is temporary; only the Pages runtime preview URL is stable.
EOF
    else
      cat <<EOF
Next:
  1. Verify the origin returns 200:    curl -I ${origin_url}
  2. Deploy the regenerated runtime wrapper preview:
       make pages-runtime-deploy       # = wrangler@3.112.0 pages deploy --branch ${PAGES_RUNTIME_BRANCH} --commit-dirty=true
       (set CLOUDFLARE_API_TOKEN first; or push to the git-connected branch)
  3. Open ${PAGES_RUNTIME_PREVIEW} in a browser.
EOF
      if [[ "$publish_canonical_pages" == "true" ]]; then
        cat <<EOF
  4. Confirm the canonical site worker now points at the fresh origin:  curl -I ${PAGES_CANONICAL_URL}api/assistant/status
EOF
      fi
      cat <<EOF

This quick-tunnel hostname is temporary; only the Pages runtime preview URL is stable.
EOF
    fi
  else
    cat <<EOF
Next:
  1. Verify the origin returns 200:    curl -I ${origin_url}
  2. Open ${origin_url} in a browser.
EOF
    if [[ "$publish_canonical_pages" == "true" ]]; then
      cat <<EOF
  3. Confirm the canonical site worker now points at the fresh origin:  curl -I ${PAGES_CANONICAL_URL}api/assistant/status
EOF
    fi
    cat <<EOF

The named-tunnel hostname stays the same as long as the tunnel keeps running.
EOF
  fi

  run_share_health_checks "$origin_url" "$kind"
}

print_host_tunnel_result() {
  local deadline=$((SECONDS + 120))
  local named_registered="false"
  local quick_url=""
  local quick_registered="false"
  if [[ "$use_named" == "true" ]]; then
    echo "Waiting for named Cloudflare tunnel to register..."
  else
    echo "Waiting for public URL from Cloudflare quick tunnel..."
  fi

  named_hostname_ready() {
    origin_healthy "https://${public_hostname}/"
  }

  while (( SECONDS < deadline )); do
    if [[ -f "$TUNNEL_PID_FILE" ]]; then
      local tunnel_pid
      tunnel_pid="$(cat "$TUNNEL_PID_FILE" 2>/dev/null || true)"
      if [[ -n "$tunnel_pid" ]] && ! kill -0 "$tunnel_pid" 2>/dev/null; then
        break
      fi
    fi

    local recent_logs url registered
    recent_logs="$(safe_tail_tunnel_log 200)"
    url="$(printf '%s\n' "$recent_logs" | grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' | tail -n 1 || true)"
    registered="$(printf '%s\n' "$recent_logs" | grep -F 'Registered tunnel connection' | tail -n 1 || true)"

    if [[ "$use_named" == "true" && -n "$registered" ]]; then
      named_registered="true"
      if named_hostname_ready; then
        emit_result "https://${public_hostname}/" "named" || return 1
        return 0
      fi
    fi
    if [[ "$use_named" == "false" && -n "$url" && -n "$registered" ]]; then
      quick_url="$url"
      quick_registered="true"
      if origin_healthy "${url}/"; then
        emit_result "${url}/" "quick" || return 1
        return 0
      fi
    fi
    sleep 2
  done

  if [[ "$use_named" == "true" && "$named_registered" == "true" ]]; then
    echo "Timed out waiting for https://${public_hostname}/ to become reachable." >&2
    echo "The tunnel connected, but the named hostname is still not live yet." >&2
    echo "Check that the zone for ${public_hostname#*.} is active in Cloudflare and that public DNS for ${public_hostname} points to ${CLOUDFLARE_TUNNEL_ID:-<tunnel-id>}.cfargotunnel.com." >&2
  elif [[ "$use_named" == "false" && "$quick_registered" == "true" && -n "$quick_url" ]]; then
    echo "Quick tunnel registered, but local validation could not reach ${quick_url} before timeout." >&2
    echo "Refusing to deploy Pages against an origin that failed local health checks. Rerun to rotate the quick tunnel." >&2
    safe_tail_tunnel_log 120 >&2
    return 1
  else
    echo "Timed out waiting for the tunnel URL." >&2
  fi
  safe_tail_tunnel_log 120 >&2
  return 1
}

share_with_docker() {
  echo "Starting dashboard and share tunnel with Docker Compose..."
  docker compose -f "$COMPOSE_FILE" up -d dashboard >/dev/null
  docker compose -f "$COMPOSE_FILE" --profile share rm -sf dashboard-share dashboard-share-named >/dev/null 2>&1 || true
  rm -f "$ORIGIN_RECORD"
  docker compose -f "$COMPOSE_FILE" --profile share up -d --force-recreate "$share_service" >/dev/null

  if [[ "$use_named" == "true" ]]; then
    echo "Waiting for named Cloudflare tunnel to register..."
  else
    echo "Waiting for public URL from Cloudflare quick tunnel..."
  fi
  local deadline=$((SECONDS + 120))
  local quick_url=""
  local quick_registered="false"

  while (( SECONDS < deadline )); do
    local recent_logs url registered
    recent_logs="$({ docker compose -f "$COMPOSE_FILE" logs --since=2m "$share_service" 2>/dev/null || true; })"
    url="$(printf '%s\n' "$recent_logs" | grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' | tail -n 1 || true)"
    registered="$(printf '%s\n' "$recent_logs" | grep -F 'Registered tunnel connection' | tail -n 1 || true)"
    if [[ "$use_named" == "true" && -n "$registered" ]]; then
      if origin_healthy "https://${public_hostname}/"; then
        emit_result "https://${public_hostname}/" "named" || return 1
        return 0
      fi
    fi
    if [[ "$use_named" == "false" && -n "$url" && -n "$registered" ]]; then
      quick_url="$url"
      quick_registered="true"
      if origin_healthy "${url}/"; then
        emit_result "${url}/" "quick" || return 1
        return 0
      fi
    fi
    sleep 2
  done

  if [[ "$use_named" == "false" && "$quick_registered" == "true" && -n "$quick_url" ]]; then
    echo "Quick tunnel registered, but local validation could not reach ${quick_url} before timeout." >&2
    echo "Refusing to deploy Pages against an origin that failed local health checks. Rerun to rotate the quick tunnel." >&2
    docker compose -f "$COMPOSE_FILE" logs --tail=80 "$share_service" 2>&1 | redact_sensitive_output >&2 || true
    return 1
  fi

  echo "Timed out waiting for the tunnel URL." >&2
  docker compose -f "$COMPOSE_FILE" logs --tail=80 "$share_service" 2>&1 | redact_sensitive_output >&2 || true
  return 1
}

share_without_docker() {
  if [[ "$use_named" == "true" ]]; then
    echo "Using the local Python dashboard runtime and a host-side Cloudflare tunnel for the named hostname."
  else
    echo "Docker Compose is unavailable. Falling back to the local Python dashboard runtime and a host-side Cloudflare tunnel."
  fi
  ensure_local_dashboard

  local cloudflared_bin
  cloudflared_bin="$(ensure_cloudflared)"

  stop_pid_file "$TUNNEL_PID_FILE"
  : >"$TUNNEL_LOG_FILE"
  rm -f "$ORIGIN_RECORD"

  start_cloudflared "$cloudflared_bin"

  print_host_tunnel_result

  if [[ "$continuous" != "true" ]]; then
    return 0
  fi

  echo
  echo "Continuous mode enabled: supervising local website runtime + tunnel (Ctrl-C to stop)."
  if [[ "$publish_canonical_pages" == "true" ]]; then
    echo "Canonical Pages publication is enabled once for the healthy named origin: ${PAGES_CANONICAL_URL}."
  fi

  trap 'stop_pid_file "$TUNNEL_PID_FILE"; stop_pid_file "$DASHBOARD_PID_FILE"; exit 0' INT TERM

  local failed_tunnel_probes=0
  local max_failed_tunnel_probes="${CLOUDFLARED_MAX_FAILED_PROBES:-3}"

  while true; do
    sleep 5

    if ! curl -fsS --max-time "$DASHBOARD_HEALTH_TIMEOUT" "${DASHBOARD_URL}/api/healthz" >/dev/null 2>&1; then
      echo "Dashboard health check failed; attempting local runtime restart..."
      ensure_local_dashboard
    fi

    local tunnel_pid
    tunnel_pid="$(cat "$TUNNEL_PID_FILE" 2>/dev/null || true)"
    local current_origin
    current_origin="$(cat "$ORIGIN_RECORD" 2>/dev/null || true)"
    if [[ -n "$tunnel_pid" ]] \
      && kill -0 "$tunnel_pid" 2>/dev/null \
      && cloudflared_ready \
      && [[ -n "$current_origin" ]] \
      && origin_healthy "$current_origin"; then
      failed_tunnel_probes=0
    else
      failed_tunnel_probes=$((failed_tunnel_probes + 1))
    fi

    if (( failed_tunnel_probes >= max_failed_tunnel_probes )); then
      echo "Cloudflare tunnel failed ${failed_tunnel_probes} consecutive readiness/origin probes; restarting..."
      stop_pid_file "$TUNNEL_PID_FILE"
      : >"$TUNNEL_LOG_FILE"
      start_cloudflared "$cloudflared_bin"
      print_host_tunnel_result || true
      failed_tunnel_probes=0
    fi
  done
}

if [[ "$continuous" == "true" ]]; then
  if [[ "$use_named" == "false" ]]; then
    echo "Continuous supervisor is using host-side cloudflared management so quick-tunnel rotations can be detected and republished."
  fi
  share_without_docker
elif [[ "$use_named" == "true" ]]; then
  share_without_docker
elif have_command docker && docker compose version >/dev/null 2>&1; then
  share_with_docker
else
  share_without_docker
fi
