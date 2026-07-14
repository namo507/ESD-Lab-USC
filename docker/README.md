# Docker Compose Files

Compose files live here so Docker assets are grouped under one directory.
The canonical root stack is defined in `../docker-compose.yml`; see
`../DOCKER.md` for the full operations runbook.

| File | Purpose |
|------|---------|
| `../docker-compose.yml` | Primary local runtime for the live dashboard and share sidecars |
| `compose.dev.yml` | Local development runtime with the repository bind-mounted into `/app` |
| `compose.prod.yml` | Production-like runtime with only generated data and readings mounted |
| `dashboard/Dockerfile` | Dashboard runtime image |

The dashboard image uses the hosted NVIDIA OpenAI-compatible client. It does
not build llama.cpp, download GGUF weights, or mount a Hugging Face cache. The
API key is supplied only at runtime through `.env` or an orchestrator Secret.

Use the dev compose file explicitly from the repository root:

```bash
docker compose -f docker/compose.dev.yml up --build dashboard
```

The Makefile wraps this path through the `COMPOSE` variable. The short
`make up`, `make down`, `make logs`, `make shell`, and `make rebuild` targets
use the root `docker-compose.yml` stack.

When Docker is not installed, use the repository preflight:

```bash
make compose-validate
```

That command parses the Compose files, validates required services, checks
relative paths, and catches stale spaced readings mounts. It is a local
fallback only; CI still runs the real Docker Compose build and smoke test.
