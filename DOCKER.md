# Docker Operations

This repository has two Docker entry points:

- `docker-compose.yml`: canonical local stack for the primary live dashboard.
- `docker/compose.dev.yml`: secondary development stack used by existing Makefile dashboard targets.

## Setup

```bash
cp .env.example .env
docker compose up -d --build
```

Open the primary dashboard at `http://localhost:8080/`.

To run the secondary dashboard at the same time:

```bash
DASHBOARD_HOST_PORT=18080 docker compose -f docker/compose.dev.yml --profile share up -d --build
```

## Containers

| Service | Image | Role |
| --- | --- | --- |
| `dashboard` | `esd-lab-usc-dashboard:latest` or `docker-dashboard:latest` | Serves the NANO dashboard, rebuilds dashboard JSON payloads, and exposes `/api/healthz`. |
| `dashboard-share` | `cloudflare/cloudflared:2026.5.2` | Starts a quick Cloudflare tunnel to the dashboard service. |
| `dashboard-share-named` | `cloudflare/cloudflared:2026.5.2` | Starts a named Cloudflare tunnel when tunnel credentials are configured. |

## Ports

| Host port | Container port | Stack | Purpose |
| --- | --- | --- | --- |
| `8080` | `8080` | `docker-compose.yml` | Primary dashboard. |
| `18080` | `8080` | `docker/compose.dev.yml` with `DASHBOARD_HOST_PORT=18080` | Secondary dashboard/dev runtime. |

## Environment Variables

Values belong in `.env`; commit only `.env.example`.

| Key | Purpose |
| --- | --- |
| `DASHBOARD_HOST_PORT` | Host port mapped to dashboard container port `8080`. |
| `DASHBOARD_MEM_LIMIT` | Compose memory limit for the dashboard service. |
| `DASHBOARD_ASSISTANT_TIER` | Local assistant sizing tier. |
| `DASHBOARD_ASSISTANT_AUTO_DOWNLOAD` | Allows model auto-download when enabled. |
| `DASHBOARD_ASSISTANT_CONTEXT_WINDOW` | Assistant context window override. |
| `DASHBOARD_ASSISTANT_THREADS` | Assistant CPU thread count. |
| `CLOUDFLARE_TUNNEL_TOKEN` | Named tunnel token. |
| `CLOUDFLARED_TUNNEL_TOKEN` | Backward-compatible named tunnel token alias. |
| `DASHBOARD_PUBLIC_HOSTNAME` | Public hostname for a stable dashboard tunnel. |
| `DASHBOARD_STABLE_SHARE_URL` | Canonical public dashboard URL echoed by share scripts. |
| `REDCAP_API_URL` | REDCap API endpoint. |
| `REDCAP_API_TOKEN` | REDCap API token. |
| `NANO_DATA_ROOT` | Local secure data root. |

## Development Workflow

```bash
make up
make logs
make shell
make down
```

The `make shell` target opens `/bin/bash` in `esd-lab-usc-dashboard-1`.
Override the container name if needed:

```bash
MAIN_CONTAINER=docker-dashboard-1 make shell
```

Existing dashboard-specific targets still use `docker/compose.dev.yml`:

```bash
make dashboard-build
make dashboard-up
make dashboard-smoke
make docker-health
```

## Self-Healing

The dashboard service has a Docker healthcheck against `/api/healthz` and all
long-running services use `restart: unless-stopped`. For explicit repair:

```bash
make docker-health
make docker-share-health
```

These targets call `scripts/check_docker_health.py`, inspect Compose state, and
run `docker compose up -d` for unhealthy services when repair is enabled.

## Troubleshooting

| Symptom | Check | Fix |
| --- | --- | --- |
| `port is already allocated` | `docker ps --format 'table {{.Names}}\t{{.Ports}}'` | Set `DASHBOARD_HOST_PORT=18080` or stop the conflicting stack. |
| `127.0.0.1:8080` hangs but Docker is healthy | `lsof -nP -iTCP:8080 -sTCP:LISTEN` | Use `http://localhost:8080`; a local editor port-forward may own IPv4 while Docker serves IPv6. |
| Dashboard is `unhealthy` | `docker compose logs --tail=200 dashboard` | Run `make docker-health`; then inspect `/api/healthz`. |
| Missing `.env` warning | `test -f .env` | Copy `.env.example` to `.env` and fill local values. |
| Cloudflare tunnel exits | `docker compose --profile share logs dashboard-share` | Use quick tunnel service or set named tunnel token keys. |
| Slow or large builds | `docker images`, `docker system df` | Run `make clean` after confirming unused Docker data can be pruned. |
| Devcontainer dependency drift | `devcontainer build --workspace-folder .` | Rebuild the devcontainer; `post-create.sh` installs `requirements.txt`. |
