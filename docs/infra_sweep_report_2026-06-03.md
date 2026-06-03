# ESD Lab Infrastructure Sweep Report - 2026-06-03

## Executive Summary

I found the two public Pages URLs were broken at the start of the sweep because the deployed Pages Worker still proxied `/api/*` to a dead quick Cloudflare Tunnel origin. I rebuilt the Docker dashboard image, started a fresh quick tunnel, rebuilt and redeployed the Cloudflare Pages artifact, and verified that `https://esd-lab-namo.pages.dev/`, `https://esd-lab-namo.pages.dev/overview`, and `https://esd-lab-namo.pages.dev/api/healthz` are healthy now. The main remaining reliability risk is still the rotating quick tunnel. The named tunnel cannot be completed until USC IT creates the `esd-lab-namo.sc.edu` CNAME and the named connector is running.

## Findings

| ID | Section | Severity | File(s) | Symptom | Fix tier | Status |
| --- | --- | --- | --- | --- | --- | --- |
| INF-001 | Cloudflare Pages | CRITICAL | `dist/pages-wrapper/_worker.js`, Cloudflare Pages | Public `/api/*` returned Cloudflare 530 through a dead quick tunnel origin. | AUTO-SAFE plus live deploy | Fixed and verified |
| INF-002 | Cloudflare Tunnel | HIGH | `docs/cloudflare_cutover_blockers.md`, Cloudflare account | Named hostname `esd-lab-namo.sc.edu` is NXDOMAIN and named tunnel `ESD Lab Namo` is down. | PROPOSE | Blocked on USC DNS and connector |
| INF-003 | Pages hardening | MEDIUM | `web/vite.config.ts`, `web/public/_headers` | Production build shipped source maps and no Pages security headers. | AUTO-SAFE | Fixed and verified |
| INF-004 | Legacy routing | MEDIUM | `scripts/build_pages_site.py` | Pages Worker served `/dashboard/` as the SPA shell instead of redirecting to `/overview`. | AUTO-SAFE | Fixed and verified |
| INF-005 | Docker build | HIGH | `docker/dashboard/Dockerfile`, `dashboard/requirements-dashboard.txt` | Cold Docker build failed because `llama-cpp-python` fell back to a source build without a compiler. | AUTO-SAFE | Fixed and verified |
| INF-006 | Docker runtime hygiene | MEDIUM | `docker-compose.yml`, `docker-compose.prod.yml` | Dev compose bind-mounts the whole repo, including ignored local files, into `/app`. | AUTO-SAFE | Fixed with production compose file |
| INF-007 | Local smoke reliability | MEDIUM | `scripts/share_dashboard.sh`, `Makefile`, `docker-compose.yml` | Health probes could hang on a bad listener at `127.0.0.1:8080`, and Python 3.9 could not run dashboard modules. | AUTO-SAFE | Fixed and verified |
| INF-008 | Kubernetes scale headroom | HIGH | `k8s/helm/esd-lab-dashboard/*` | Chart had one dashboard replica and no HPA or PDB knobs. | AUTO-SAFE | Fixed and Helm rendered |
| INF-009 | Logs | MEDIUM | `scripts/prune_logs.sh`, `Makefile` | Local logs had no retention helper. Current `logs/` size is 10M. | AUTO-SAFE | Fixed |
| INF-010 | Python tests | MEDIUM | `.venv` local environment | Literal `pytest` was absent from PATH; venv lacked `scipy` and `python-dotenv`. | LOCAL ENV | Fixed locally and verified |

## Changes Made

- Rebuilt and redeployed Cloudflare Pages production branch `main` with API origin `https://equivalent-industrial-smoke-xbox.trycloudflare.com`.
- Added production Pages headers and disabled production sourcemaps.
- Added Worker and `_redirects` handling for `/dashboard`, `/dashboard/`, and `/dashboard/index.html` to `/overview`.
- Added Docker build prerequisites and used the documented prebuilt `llama-cpp-python` CPU wheel index.
- Added `docker-compose.prod.yml` without the whole-repo bind mount.
- Added configurable `DASHBOARD_HOST_PORT` and `DASHBOARD_LOCAL_URL`.
- Added timed local health checks and Python 3.10+ interpreter selection in `share_dashboard.sh`.
- Added Helm HPA and PDB templates with conservative defaults.
- Added log pruning via `make logs-prune`.
- Tightened Zod client generics to remove lint errors.
- Set local `.env` permissions to `600`.

## Load Readiness

The public dashboard can serve traffic now, but I would not call the tunnel layer production-ready until the named tunnel cutover is complete. The current bottlenecks are the rotating quick tunnel, one local Docker dashboard process, no durable supervisor that republishes the Pages Worker after quick-tunnel rotation, and production scaling that still requires operators to enable the new HPA settings. The chart now has HPA and PDB support, but a live cluster upgrade remains an operator action.

## PROPOSE Items

1. Create the DNSMadeEasy CNAME through USC IT:

```bash
dig +short esd-lab-namo.sc.edu CNAME
```

Expected after DNS is complete:

```text
8b0fa216-b69f-4289-98cf-492c55a710b6.cfargotunnel.com.
```

2. Start the named tunnel connector after DNS is live:

```bash
bash scripts/share_dashboard.sh --mode named
```

Expected: the script prints `https://esd-lab-namo.sc.edu/` and `/api/healthz` returns `status: ok`.

3. Redeploy Pages to the stable named origin:

```bash
set -a
source .env
set +a
PAGES_API_ORIGIN=https://esd-lab-namo.sc.edu/ make PYTHON=/Users/namomac/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 pages-deploy
```

Expected build log includes `api=https://esd-lab-namo.sc.edu` and the final Pages URL returns 200.

4. Apply the Helm chart to the cluster when ready:

```bash
helm upgrade --install esd-lab-dashboard k8s/helm/esd-lab-dashboard \
  --namespace esd-lab \
  --set existingClaims.readings=esd-readings-rwx \
  --set existingClaims.data=esd-dashboard-data-rwx \
  --set autoscaling.enabled=true
```

Expected: rollout succeeds and the HPA shows dashboard pods scaling from 2 to 6 as needed.

## Verification

| Check | Result |
| --- | --- |
| `python3 scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/ --timeout 25 --min-bytes 8192` | PASS, 200, assistant ready |
| `python3 scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/overview --timeout 25 --min-bytes 8192` | PASS, 200, assistant ready |
| `curl -fsS https://esd-lab-namo.pages.dev/api/healthz` | PASS, JSON `status: ok` |
| `curl https://esd-lab-namo.pages.dev/dashboard/` | PASS, 308 to `/overview` |
| `make check-env` | PASS |
| `DASHBOARD_LOCAL_URL=https://esd-lab-namo.pages.dev make docker-health` | PASS |
| `DASHBOARD_LOCAL_URL='http://[::1]:8080' make dashboard-smoke` | PASS |
| `make k8s-helm-lint` | PASS using Dockerized Helm fallback |
| `npm --prefix web run lint` | PASS with warnings only |
| `npm --prefix web run typecheck` | PASS |
| `npm --prefix web test` | PASS, 15 files and 68 tests |
| `PYTHONPATH=. .venv/bin/pytest tests/ -q --ignore=tests/test_imputation.py` | PASS, 72 passed and 10 skipped |
| `find dist/pages-wrapper -name '*.map' -print` | PASS, no source maps |
| `.env` permissions and ignore checks | PASS, mode `600`, ignored and untracked |

## Notes

Cloudflare Pages latest production deployment after the fix is `0ae8c0b4-617a-4b05-ba65-877b5d0e6cef`, created on `2026-06-03T22:54:19Z`, with Worker functions enabled. The local quick-tunnel containers must remain running for the current Pages API proxy to keep working.
