#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

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

echo "Starting dashboard and share tunnel..."
docker compose up -d dashboard >/dev/null
docker compose --profile share rm -sf dashboard-share dashboard-share-named >/dev/null 2>&1 || true
docker compose --profile share up -d --force-recreate "$share_service" >/dev/null

if [[ -n "$named_tunnel_token" ]]; then
  echo "Waiting for named Cloudflare tunnel to register..."
else
  echo "Waiting for public URL from Cloudflare quick tunnel..."
fi
deadline=$((SECONDS + 120))

while (( SECONDS < deadline )); do
  recent_logs="$({ docker compose logs --since=2m "$share_service" 2>/dev/null || true; })"
  url="$(printf '%s\n' "$recent_logs" | grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' | tail -n 1 || true)"
  registered="$(printf '%s\n' "$recent_logs" | grep -F 'Registered tunnel connection' | tail -n 1 || true)"
  if [[ -n "$named_tunnel_token" && -n "$registered" ]]; then
    echo
    echo "Stable dashboard URL:"
    echo "https://${public_hostname}/dashboard/"
    echo
    echo "The tunnel stays live while the Docker services are running."
    exit 0
  fi

  if [[ -z "$named_tunnel_token" && -n "$url" && -n "$registered" ]]; then
    echo
    echo "Temporary quick-share dashboard URL:"
    echo "${url}/dashboard/"
    echo
    echo "This quick-tunnel hostname is temporary and changes when the share service restarts."
    echo "The tunnel stays live while the Docker services are running."
    exit 0
  fi
  sleep 2
done

echo "Timed out waiting for the tunnel URL." >&2
docker compose logs --tail=80 "$share_service" >&2 || true
exit 1