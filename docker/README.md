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

The dashboard image talks to the sibling `ollama` service over its
OpenAI-compatible API. The image itself contains no model weights: Ollama pulls
them once into the `ollama-models` volume, so rebuilds stay small and nothing
large enters the repository. No credential is required.

```bash
docker compose exec ollama ollama pull llama3.2:3b
```

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
