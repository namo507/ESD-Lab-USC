#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "Starting dashboard and share tunnel..."
docker compose --profile share up -d dashboard dashboard-share >/dev/null

echo "Waiting for public URL from Cloudflare quick tunnel..."
deadline=$((SECONDS + 120))

while (( SECONDS < deadline )); do
  url="$({ docker compose logs dashboard-share 2>/dev/null || true; } | grep -Eo 'https://[-a-zA-Z0-9]+\.trycloudflare\.com' | tail -n 1 || true)"
  if [[ -n "$url" ]]; then
    echo
    echo "Shareable dashboard URL:"
    echo "$url"
    echo
    echo "The tunnel stays live while the Docker services are running."
    exit 0
  fi
  sleep 2
done

echo "Timed out waiting for the tunnel URL." >&2
docker compose logs --tail=80 dashboard-share >&2 || true
exit 1