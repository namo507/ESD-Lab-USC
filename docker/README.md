# Docker Compose Files

Compose files live here so Docker assets are grouped under one directory.

| File | Purpose |
|------|---------|
| `compose.dev.yml` | Local development runtime with the repository bind-mounted into `/app` |
| `compose.prod.yml` | Production-like runtime with only generated data and readings mounted |
| `dashboard/Dockerfile` | Dashboard runtime image |

Use the dev compose file explicitly from the repository root:

```bash
docker compose -f docker/compose.dev.yml up --build dashboard
```

The Makefile wraps this path through the `COMPOSE` variable.
