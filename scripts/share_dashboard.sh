#!/usr/bin/env bash
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

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

named_tunnel_token="${CLOUDFLARE_TUNNEL_TOKEN:-}"
public_hostname="${DASHBOARD_PUBLIC_HOSTNAME:-}"
share_service="dashboard-share"

export CLOUDFLARE_TUNNEL_TOKEN="$named_tunnel_token"

if [[ -n "$named_tunnel_token" && -z "$public_hostname" ]]; then
  echo "DASHBOARD_PUBLIC_HOSTNAME must be set when CLOUDFLARE_TUNNEL_TOKEN is configured." >&2
  exit 1
fi

if [[ -z "$named_tunnel_token" && -n "$public_hostname" ]]; then
  echo "CLOUDFLARE_TUNNEL_TOKEN must be set to use DASHBOARD_PUBLIC_HOSTNAME." >&2
  exit 1
fi

if [[ -n "$named_tunnel_token" ]]; then
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

print_host_tunnel_result() {
  local deadline=$((SECONDS + 120))
  if [[ -n "$named_tunnel_token" ]]; then
    echo "Waiting for named Cloudflare tunnel to register..."
  else
    echo "Waiting for public URL from Cloudflare quick tunnel..."
  fi

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

    if [[ -n "$named_tunnel_token" && -n "$registered" ]]; then
      echo
      echo "Stable dashboard URL:"
      echo "https://${public_hostname}/dashboard/"
      echo
      echo "The tunnel stays live while these processes are running:"
      echo "- dashboard: $(cat "$DASHBOARD_PID_FILE" 2>/dev/null || echo unknown)"
      echo "- cloudflared: $(cat "$TUNNEL_PID_FILE" 2>/dev/null || echo unknown)"
      return 0
    fi

    if [[ -z "$named_tunnel_token" && -n "$url" && -n "$registered" ]]; then
      echo
      echo "Temporary quick-share dashboard URL:"
      echo "${url}/dashboard/"
      echo
      echo "This quick-tunnel hostname is temporary and changes when the share service restarts."
      echo "The tunnel stays live while these processes are running:"
      echo "- dashboard: $(cat "$DASHBOARD_PID_FILE" 2>/dev/null || echo existing)"
      echo "- cloudflared: $(cat "$TUNNEL_PID_FILE" 2>/dev/null || echo unknown)"
      return 0
    fi

    sleep 2
  done

  echo "Timed out waiting for the tunnel URL." >&2
  tail -n 120 "$TUNNEL_LOG_FILE" >&2 || true
  return 1
}

share_with_docker() {
  echo "Starting dashboard and share tunnel with Docker Compose..."
  docker compose up -d dashboard >/dev/null
  docker compose --profile share rm -sf dashboard-share dashboard-share-named >/dev/null 2>&1 || true
  docker compose --profile share up -d --force-recreate "$share_service" >/dev/null

  if [[ -n "$named_tunnel_token" ]]; then
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
    if [[ -n "$named_tunnel_token" && -n "$registered" ]]; then
      echo
      echo "Stable dashboard URL:"
      echo "https://${public_hostname}/dashboard/"
      echo
      echo "The tunnel stays live while the Docker services are running."
      return 0
    fi

    if [[ -z "$named_tunnel_token" && -n "$url" && -n "$registered" ]]; then
      echo
      echo "Temporary quick-share dashboard URL:"
      echo "${url}/dashboard/"
      echo
      echo "This quick-tunnel hostname is temporary and changes when the share service restarts."
      echo "The tunnel stays live while the Docker services are running."
      return 0
    fi
    sleep 2
  done

  echo "Timed out waiting for the tunnel URL." >&2
  docker compose logs --tail=80 "$share_service" >&2 || true
  return 1
}

share_without_docker() {
  echo "Docker Compose is unavailable. Falling back to the local Python dashboard runtime and a host-side Cloudflare tunnel."
  ensure_local_dashboard

  local cloudflared_bin
  cloudflared_bin="$(ensure_cloudflared)"

  stop_pid_file "$TUNNEL_PID_FILE"
  : >"$TUNNEL_LOG_FILE"

  if [[ -n "$named_tunnel_token" ]]; then
    nohup "$cloudflared_bin" tunnel --no-autoupdate run --token "$named_tunnel_token" >"$TUNNEL_LOG_FILE" 2>&1 &
  else
    nohup "$cloudflared_bin" tunnel --no-autoupdate --url "$DASHBOARD_URL" >"$TUNNEL_LOG_FILE" 2>&1 &
  fi
  echo $! >"$TUNNEL_PID_FILE"

  print_host_tunnel_result
}

if have_command docker; then
  share_with_docker
else
  share_without_docker
fi