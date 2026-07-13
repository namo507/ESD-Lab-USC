# Cloudflare Pages deploy + uptime

This document covers how `https://esd-lab-namo.pages.dev/` is built, deployed,
and smoke-tested now that the public site is the React/Vite dashboard in
`web/`.

## Files involved

| Path | Role |
|------|------|
| `web/src/**` | Source of truth for the public React dashboard UI. |
| `web/public/**` | Static public assets copied into the Vite build. |
| `scripts/build_pages_site.py` | Packages `web/build/` into `dist/pages-wrapper/`, injects deploy metadata, and generates a Pages `_worker.js` proxy for `/api/*`. |
| `dashboard/public/pages_wrapper/manifest.json` | Records runtime-share metadata. Packaging accepts its origin only when it is durable and passes `/api/healthz`; stale and quick-tunnel origins are ignored. |
| `scripts/share_dashboard.sh` | Starts the local dashboard runtime plus Cloudflare tunnel and refreshes the runtime-share preview wrapper. |
| `scripts/check_site_health.py` | Health probe used by the uptime workflow and local spot checks. Accepts either the older large HTML shell or the current lightweight SPA shell. |
| `scripts/check_live_surfaces.py` | Composite probe for the canonical Pages site plus the runtime-share preview branch. |
| `.github/workflows/deploy-pages.yml` | Builds the SPA, packages the worker-backed Pages artifact, deploys it with Wrangler, then runs a smoke test. |
| `.github/workflows/uptime-monitor.yml` | Probes the live URL on a schedule and can trigger a redeploy when the public site is unhealthy. |

`dist/pages-wrapper/` is git-ignored and rebuilt on every deploy.

## Current production shape

- The public Pages site serves the React SPA from `web/build/`.
- Dashboard data is intentionally mocked in production by building with `VITE_USE_MOCKS=true`.
- Live NVIDIA assistant chat works when `_worker.js` proxies `/api/*` to a healthy durable backend origin. If no such origin exists, packaging emits a fallback-only worker so every dashboard page remains usable without embedding a dead hostname.
- The browser never receives the NVIDIA key and never calls the provider directly.
- External `200` rewrites in `_redirects` are not enough for this on Cloudflare Pages because Pages only supports proxy-style rewrites to relative paths on the same site.

## How a change reaches production

1. Edit the React app in `web/src/` or one of the deployment helpers.
2. Commit and push to `main`, or run the workflow manually.
3. `deploy-pages.yml` installs frontend dependencies, builds the Vite app, packages `dist/pages-wrapper/`, then deploys that directory with `wrangler pages deploy`.
4. The build step injects three debug metas into `index.html`:
   - `esd-deploy-stamp`
   - `esd-build-sha`
   - `esd-api-origin`

## Local deployment flow

Build the SPA and package the Pages artifact:

```bash
make pages-build
```

Start a live assistant backend and quick tunnel for a temporary direct preview:

```bash
bash scripts/share_dashboard.sh --continuous --mode quick
```

The share scripts default Cloudflare Tunnel to HTTP/2 transport because the
current quick-tunnel path can stall on QUIC when outbound UDP 7844 is blocked or
unstable. Override only when the network is known-good:

```bash
CLOUDFLARE_TUNNEL_PROTOCOL=auto bash scripts/share_dashboard.sh --mode quick
```

Quick-tunnel origins are deliberately rejected for the canonical Pages worker
because they expire and previously caused a redeploy/incident loop. Package the
Pages artifact against a healthy named tunnel or other durable backend origin:

```bash
PAGES_API_ORIGIN=https://dashboard-api.example.org \
python3 scripts/build_pages_site.py
```

Deploy the artifact manually:

```bash
npx --yes wrangler@3.112.0 pages deploy dist/pages-wrapper \
  --project-name esd-lab-namo \
  --branch main \
  --commit-dirty=true
```

## Health checks

Probe production:

```bash
python scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/
python scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/ --max-stamp-age-hours 24
python scripts/check_live_surfaces.py --max-stamp-age-hours 168
```

Check the live assistant proxy:

```bash
curl https://esd-lab-namo.pages.dev/api/assistant/status
curl -X POST https://esd-lab-namo.pages.dev/api/chat \
  -H 'Content-Type: application/json' \
  --data '{"message":"How many indexed readings are available?","history":[]}'
```

If the status returns `pages://fallback-assistant`, inspect the live
`esd-api-origin` meta tag and verify that origin directly:

```bash
curl https://esd-lab-namo.pages.dev/ | tr '<' '\n' | grep esd-api-origin
curl https://<origin-host>/api/assistant/status
```

Then republish with a healthy durable origin. If none is available, leave
`PAGES_API_ORIGIN` unset and deploy fallback-only mode:

```bash
PAGES_API_ORIGIN=https://dashboard-api.example.org make pages-deploy
```

## One-time setup

The workflows require two repo secrets:

- `CLOUDFLARE_API_TOKEN` — an API token with **Account · Cloudflare Pages · Edit** permission for the `esd-lab-namo` project.
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID for that Pages project.

If you want unattended assistant proxying from GitHub Actions, set the
`PAGES_API_ORIGIN` repository variable to a stable backend origin. Without it,
deployments intentionally use fallback-only mode; an ephemeral manifest origin
is never promoted to production.

Do not set `DASHBOARD_PUBLIC_HOSTNAME` to a `*.pages.dev` domain. Named tunnels require a hostname on a DNS zone you control in Cloudflare.

## Why this design

- **Pages stays deterministic.** CI ships a prebuilt directory instead of letting Cloudflare infer a framework build.
- **The assistant proxy lives at the edge.** `_worker.js` handles `/api/*` so the public site can keep same-origin API calls while the backend runs behind a separate tunnel.
- **Production remains smooth without a full backend port.** Mocked dashboard data avoids exposing half-implemented API routes while live chat still works.
- **The runtime-share preview stays separate from production.** Quick-tunnel refreshes can update a stable preview wrapper without overwriting the canonical Pages alias.
