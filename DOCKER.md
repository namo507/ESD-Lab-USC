# Docker Operations

This repository has two Docker entry points:

- `docker-compose.yml`: canonical local stack for the primary live dashboard.
- `docker/compose.dev.yml`: secondary development stack used by existing Makefile dashboard targets.

## Setup

Docker Compose 2.38+ and Docker Model Runner are required for the local AI
binding. The selected compact artifact is `ai/qwen3.5:4b-q4_K_M`.

```bash
cp .env.example .env
make assistant-model-check  # or: make assistant-model-pull
docker compose up -d --build
```

Open the primary dashboard at `http://localhost:8080/`.
Compose binds the origin only to `127.0.0.1`; public access goes through the
Cloudflare tunnel service rather than a LAN-facing dashboard port.

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

The `share` profile starts only the quick tunnel. Start the named service with
`--profile share-named`; its connector token is mounted as a Compose secret and
read through `--token-file`, so it does not appear in container command arguments.

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
| `DASHBOARD_ASSISTANT_LOCAL_MODEL_ARTIFACT` | Compose model artifact; defaults to `ai/qwen3.5:4b-q4_K_M`. |
| `DASHBOARD_ASSISTANT_LOCAL_API_BASE` | Injected by the Compose model binding; the `.env` value supports host-side CLI use. |
| `DASHBOARD_ASSISTANT_LOCAL_MODEL` | Injected local model identifier. |
| `DASHBOARD_ASSISTANT_FALLBACK_API_BASE` | Hosted NVIDIA OpenAI-compatible fallback endpoint. |
| `DASHBOARD_ASSISTANT_FALLBACK_API_KEY` | Hosted key loaded from local `.env`; never bake it into the image. |
| `DASHBOARD_ASSISTANT_FALLBACK_MODEL` | Hosted Nemotron fallback identifier. |
| `DASHBOARD_ASSISTANT_REQUEST_TIMEOUT_SECONDS` | Provider request timeout; it does not affect app health checks. |
| `CLOUDFLARE_TUNNEL_TOKEN` | Named tunnel token; Compose mounts it as a secret. |
| `CLOUDFLARED_TUNNEL_TOKEN` | Backward-compatible alias used by `scripts/share_dashboard.sh`; Compose uses the canonical key above. |
| `DASHBOARD_PUBLIC_HOSTNAME` | Public hostname for a stable dashboard tunnel. |
| `DASHBOARD_STABLE_SHARE_URL` | Canonical public dashboard URL echoed by share scripts. |
| `REDCAP_API_URL` | REDCap API endpoint. |
| `REDCAP_API_TOKEN` | Compatibility token for legacy single-project tools. |
| `REDCAP_*_TOKEN` | Eight project-scoped portfolio tokens explicitly allowlisted into the dashboard container. |
| `NANO_DATA_ROOT` | Local secure data root. |

The dashboard container receives an explicit application-only environment
allowlist. Cloudflare account and tunnel credentials are not inherited from the
whole `.env`, and implicit assistant `.env` loading is disabled in containers.
The eight portfolio names are `REDCAP_ABC_SURVEYS_TOKEN`,
`REDCAP_IPSA_SURVEYS_TOKEN`, `REDCAP_ACTION_TOKEN`, `REDCAP_IPSA_LAB_TOKEN`,
`REDCAP_ABC_LAB_TOKEN`, `REDCAP_NICO_TOKEN`, `REDCAP_NANO_SURVEYS_TOKEN`, and
`REDCAP_NANO_LAB_TOKEN`. No other REDCap secret is added implicitly.
The Pages proxy's forwarded client identity is accepted only when Cloudflare's
platform-added `CF-Worker` header matches
`DASHBOARD_TRUSTED_CLOUDFLARE_WORKER_ZONE`; other Worker traffic shares the
Cloudflare egress rate-limit bucket and cannot choose an arbitrary client key.

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

The dashboard service has a Docker healthcheck against `/api/healthz`; provider
outages appear in `/api/assistant/status` and do not restart-loop the website.
Local model failure switches to hosted Nemotron only before visible streamed
text; deterministic repository grounding is the final fallback.
Long-running dashboard and tunnel services use restart policies, healthchecks,
and scoped repair. For explicit repair:

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
| `127.0.0.1:8080` hangs but Docker is healthy | `lsof -nP -iTCP:8080 -sTCP:LISTEN` | Set an unused `DASHBOARD_HOST_PORT` (for example `18080`) or stop the IPv4 listener. Compose intentionally binds only to `127.0.0.1`; use an explicit override if IPv6 loopback is required. |
| Dashboard is `unhealthy` | `docker compose logs --tail=200 dashboard` | Run `make docker-health`; then inspect `/api/healthz`. |
| Missing `.env` warning | `test -f .env` | Copy `.env.example` to `.env` and fill local values. |
| Quick Cloudflare tunnel exits | `docker compose --profile share logs dashboard-share` | Restart the quick profile and inspect connector readiness. |
| Named Cloudflare tunnel exits | `docker compose --profile share-named logs dashboard-share-named` | Set `CLOUDFLARE_TUNNEL_TOKEN`, verify the account-owned hostname, then restart the named profile. |
| Slow or large builds | `docker images`, `docker system df` | Run `make clean`; it removes only project containers/orphans and preserves named volumes and unrelated Docker data. |
| Devcontainer dependency drift | `devcontainer build --workspace-folder .` | Rebuild the devcontainer; `post-create.sh` installs `requirements.txt`. |
