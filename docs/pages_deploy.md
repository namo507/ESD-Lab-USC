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
| `dashboard/public/pages_wrapper/manifest.json` | Records the latest runtime-share origin when a quick tunnel is refreshed. Useful when packaging a manual deploy without an explicit `PAGES_API_ORIGIN`. |
| `scripts/share_dashboard.sh` | Starts the local dashboard runtime plus Cloudflare tunnel and refreshes the runtime-share preview wrapper. |
| `scripts/check_site_health.py` | Health probe used by the uptime workflow and local spot checks. Accepts either the older large HTML shell or the current lightweight SPA shell. |
| `.github/workflows/deploy-pages.yml` | Builds the SPA, packages the worker-backed Pages artifact, deploys it with Wrangler, then runs a smoke test. |
| `.github/workflows/uptime-monitor.yml` | Probes the live URL on a schedule and can trigger a redeploy when the public site is unhealthy. |

`dist/pages-wrapper/` is git-ignored and rebuilt on every deploy.

## Current production shape

- The public Pages site serves the React SPA from `web/build/`.
- Dashboard data is intentionally mocked in production by building with `VITE_USE_MOCKS=true`.
- Live assistant chat still works because the build emits a Cloudflare Pages `_worker.js` file that proxies `/api/*` to the currently shared assistant backend.
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

Start a live assistant backend and quick tunnel:

```bash
bash scripts/share_dashboard.sh --continuous --mode quick
```

Package the Pages artifact against a known backend origin explicitly:

```bash
PAGES_API_ORIGIN=https://your-live-origin.trycloudflare.com \
python scripts/build_pages_site.py
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
```

Check the live assistant proxy:

```bash
curl https://esd-lab-namo.pages.dev/api/assistant/status
curl -X POST https://esd-lab-namo.pages.dev/api/chat \
  -H 'Content-Type: application/json' \
  --data '{"message":"How many indexed readings are available?","history":[]}'
```

## One-time setup

The workflows require two repo secrets:

- `CLOUDFLARE_API_TOKEN` — an API token with **Account · Cloudflare Pages · Edit** permission for the `esd-lab-namo` project.
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID for that Pages project.

If you want unattended assistant proxying from GitHub Actions, also set a repo variable such as `PAGES_API_ORIGIN` to a stable backend origin. Without that, manual deploys can still package against the latest tunnel origin or manifest.

## Why this design

- **Pages stays deterministic.** CI ships a prebuilt directory instead of letting Cloudflare infer a framework build.
- **The assistant proxy lives at the edge.** `_worker.js` handles `/api/*` so the public site can keep same-origin API calls while the backend runs behind a separate tunnel.
- **Production remains smooth without a full backend port.** Mocked dashboard data avoids exposing half-implemented API routes while live chat still works.
- **The runtime-share preview stays separate from production.** Quick-tunnel refreshes can update a stable preview wrapper without overwriting the canonical Pages alias.
