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
# Cloudflare Pages wrapper at `dashboard/public/pages_wrapper/` so the
# canonical wrapper URL embeds the new origin. The deploy step
# (`wrangler pages deploy`) stays the operator's call.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
STATE_DIR="${XDG_RUNTIME_DIR:-/tmp}/esd-lab-usc-share"
mkdir -p "$STATE_DIR"

DASHBOARD_HOST="${DASHBOARD_HOST:-127.0.0.1}"
DASHBOARD_PORT="${DASHBOARD_PORT:-8080}"
DASHBOARD_URL="http://${DASHBOARD_HOST}:${DASHBOARD_PORT}"
DASHBOARD_PID_FILE="$STATE_DIR/dashboard.pid"
DASHBOARD_LOG_FILE="$STATE_DIR/dashboard.log"
TUNNEL_PID_FILE="$STATE_DIR/cloudflared.pid"
TUNNEL_LOG_FILE="$STATE_DIR/cloudflared.log"
ORIGIN_RECORD="$STATE_DIR/last_origin.txt"

PAGES_WRAPPER_CANONICAL="https://esd-lab-namo.pages.dev/"

mode="auto"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) mode="$2"; shift 2 ;;
    --mode=*) mode="${1#--mode=}"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done
case "$mode" in
  auto|named|quick) : ;;
  *) echo "--mode must be one of: auto | named | quick (got '$mode')" >&2; exit 64 ;;
esac

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

named_tunnel_token="${CLOUDFLARE_TUNNEL_TOKEN:-}"
public_hostname="${DASHBOARD_PUBLIC_HOSTNAME:-}"
share_service="dashboard-share"

case "$mode" in
  named)
    if [[ -z "$named_tunnel_token" ]] || [[ -z "$public_hostname" ]]; then
      echo "ERROR: --mode named requires both CLOUDFLARE_TUNNEL_TOKEN and DASHBOARD_PUBLIC_HOSTNAME in .env." >&2
      echo "Hint: see README.md § Stable named-tunnel sharing." >&2
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
      use_named="true"
    elif [[ -n "$named_tunnel_token" && -z "$public_hostname" ]]; then
      echo "WARNING: CLOUDFLARE_TUNNEL_TOKEN is set but DASHBOARD_PUBLIC_HOSTNAME is blank." >&2
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

export CLOUDFLARE_TUNNEL_TOKEN="$named_tunnel_token"

if [[ "$use_named" == "true" ]]; then
  share_service="dashboard-share-named"
fi

have_command() {
  command -v "$1" >/dev/null 2>&1
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
    if curl -fsS "${DASHBOARD_URL}/api/healthz" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

resolve_python() {
  local candidate
  for candidate in \
    "$ROOT_DIR/.devcontainer/.venv/bin/python" \
    "$ROOT_DIR/.venv/bin/python" \
    "$(command -v python3 2>/dev/null || true)" \
    "$(command -v python 2>/dev/null || true)"
  do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

ensure_local_dashboard() {
  if curl -fsS "${DASHBOARD_URL}/api/healthz" >/dev/null 2>&1; then
    echo "Using existing local dashboard on ${DASHBOARD_URL}/dashboard/"
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
  echo "Starting local dashboard runtime on ${DASHBOARD_URL}/dashboard/..."
  nohup "$python_bin" dashboard/server/live_dashboard_server.py --fallback-synthetic --host "$DASHBOARD_HOST" --port "$DASHBOARD_PORT" >"$DASHBOARD_LOG_FILE" 2>&1 &
  echo $! >"$DASHBOARD_PID_FILE"

  if ! wait_for_dashboard; then
    echo "Timed out waiting for the local dashboard runtime to become healthy." >&2
    tail -n 80 "$DASHBOARD_LOG_FILE" >&2 || true
    exit 1
  fi
}

ensure_cloudflared() {
  if have_command cloudflared; then
    command -v cloudflared
    return 0
  fi

  local cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/esd-lab-usc/bin"
  local cloudflared_bin="$cache_dir/cloudflared"
  mkdir -p "$cache_dir"

  if [[ -x "$cloudflared_bin" ]]; then
    printf '%s\n' "$cloudflared_bin"
    return 0
  fi

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

  download_url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}"
  echo "Downloading cloudflared for ${raw_arch}..." >&2
  curl -fsSL "$download_url" -o "${cloudflared_bin}.tmp"
  chmod +x "${cloudflared_bin}.tmp"
  mv "${cloudflared_bin}.tmp" "$cloudflared_bin"
  printf '%s\n' "$cloudflared_bin"
}

# Print the result block. `origin_url` is the cloudflared origin (https://...).
# When the named tunnel is in use, `origin_url` already equals
# `https://${public_hostname}/dashboard/`.
emit_result() {
  local origin_url="$1"
  local kind="$2"   # named | quick
  local rebuild_msg=""

  printf '%s\n' "$origin_url" >"$ORIGIN_RECORD"

  echo
  echo "════════════════════════════════════════════════════════════════════"
  if [[ "$kind" == "named" ]]; then
    echo "  Canonical public URL (stable, named Cloudflare tunnel)"
    echo "  → ${origin_url}"
  else
    echo "  Canonical public URL (Cloudflare Pages wrapper · stable)"
    echo "  → ${PAGES_WRAPPER_CANONICAL}"
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
      rebuild_msg="rebuilt: dashboard/public/pages_wrapper/index.html and dist/pages-wrapper/index.html"
    else
      rebuild_msg="WARNING: failed to regenerate Pages wrapper — run scripts/build_pages_wrapper.py manually."
    fi
  else
    rebuild_msg="WARNING: no Python interpreter found — skipped Pages wrapper regen."
  fi
  echo "Pages wrapper: ${rebuild_msg}"

  if [[ "$kind" == "quick" ]]; then
    cat <<EOF
Next:
  1. Verify the origin returns 200:    curl -I ${origin_url}
  2. Deploy the regenerated wrapper to the production alias:
       make pages-deploy       # = wrangler@3.112.0 pages deploy --branch main --commit-dirty=true
       (set CLOUDFLARE_API_TOKEN first; or push to the git-connected branch)
  3. Open ${PAGES_WRAPPER_CANONICAL} in a browser.

This quick-tunnel hostname is temporary; only the Pages wrapper URL is stable.
EOF
  else
    cat <<EOF
Next:
  1. Verify the origin returns 200:    curl -I ${origin_url}
  2. Open ${origin_url} in a browser.

The named-tunnel hostname stays the same as long as the tunnel keeps running.
EOF
  fi
}

print_host_tunnel_result() {
  local deadline=$((SECONDS + 120))
  local named_registered="false"
  if [[ "$use_named" == "true" ]]; then
    echo "Waiting for named Cloudflare tunnel to register..."
  else
    echo "Waiting for public URL from Cloudflare quick tunnel..."
  fi

  named_hostname_ready() {
    curl -fsSIL --max-time 10 "https://${public_hostname}/dashboard/" >/dev/null 2>&1
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
    recent_logs="$(tail -n 200 "$TUNNEL_LOG_FILE" 2>/dev/null || true)"
    url="$(printf '%s\n' "$recent_logs" | grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' | tail -n 1 || true)"
    registered="$(printf '%s\n' "$recent_logs" | grep -F 'Registered tunnel connection' | tail -n 1 || true)"

    if [[ "$use_named" == "true" && -n "$registered" ]]; then
      named_registered="true"
      if named_hostname_ready; then
        emit_result "https://${public_hostname}/dashboard/" "named"
        return 0
      fi
    fi
    if [[ "$use_named" == "false" && -n "$url" && -n "$registered" ]]; then
      emit_result "${url}/dashboard/" "quick"
      return 0
    fi
    sleep 2
  done

  if [[ "$use_named" == "true" && "$named_registered" == "true" ]]; then
    echo "Timed out waiting for https://${public_hostname}/dashboard/ to become reachable." >&2
    echo "The tunnel connected, but the named hostname is still not live yet." >&2
    echo "Check that the zone for ${public_hostname#*.} is active in Cloudflare and that public DNS for ${public_hostname} points to ${CLOUDFLARE_TUNNEL_ID:-<tunnel-id>}.cfargotunnel.com." >&2
  else
    echo "Timed out waiting for the tunnel URL." >&2
  fi
  tail -n 120 "$TUNNEL_LOG_FILE" >&2 || true
  return 1
}

share_with_docker() {
  echo "Starting dashboard and share tunnel with Docker Compose..."
  docker compose up -d dashboard >/dev/null
  docker compose --profile share rm -sf dashboard-share dashboard-share-named >/dev/null 2>&1 || true
  docker compose --profile share up -d --force-recreate "$share_service" >/dev/null

  if [[ "$use_named" == "true" ]]; then
    echo "Waiting for named Cloudflare tunnel to register..."
  else
    echo "Waiting for public URL from Cloudflare quick tunnel..."
  fi
  local deadline=$((SECONDS + 120))

  while (( SECONDS < deadline )); do
    local recent_logs url registered
    recent_logs="$({ docker compose logs --since=2m "$share_service" 2>/dev/null || true; })"
    url="$(printf '%s\n' "$recent_logs" | grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' | tail -n 1 || true)"
    registered="$(printf '%s\n' "$recent_logs" | grep -F 'Registered tunnel connection' | tail -n 1 || true)"
    if [[ "$use_named" == "true" && -n "$registered" ]]; then
      emit_result "https://${public_hostname}/dashboard/" "named"
      return 0
    fi
    if [[ "$use_named" == "false" && -n "$url" && -n "$registered" ]]; then
      emit_result "${url}/dashboard/" "quick"
      return 0
    fi
    sleep 2
  done

  echo "Timed out waiting for the tunnel URL." >&2
  docker compose logs --tail=80 "$share_service" >&2 || true
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

  if [[ "$use_named" == "true" ]]; then
    nohup "$cloudflared_bin" tunnel --no-autoupdate run --token "$named_tunnel_token" >"$TUNNEL_LOG_FILE" 2>&1 &
  else
    nohup "$cloudflared_bin" tunnel --no-autoupdate --url "$DASHBOARD_URL" >"$TUNNEL_LOG_FILE" 2>&1 &
  fi
  echo $! >"$TUNNEL_PID_FILE"

  print_host_tunnel_result
}

if [[ "$use_named" == "true" ]]; then
  share_without_docker
elif have_command docker && docker compose version >/dev/null 2>&1; then
  share_with_docker
else
  share_without_docker
fi