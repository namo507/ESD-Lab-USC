# Cloudflare Pages auto-deploy + uptime

This document covers how `https://esd-lab-namo.pages.dev/` is built, deployed,
and monitored. The goal is "the canonical URL is never down, and any change
under `web/` reaches production within a couple of minutes of pushing to
`main`".

## Files involved

| Path | Role |
|------|------|
| `web/dashboard-source.html` | Standalone Dashboard ESD v2 bundle. Source of truth for the dashboard payload. |
| `web/pages-overlay.css` | Layout audit fix bundle. Applies the warm-glass design system corrections on top of the bundle. |
| `web/pages-overlay.js` | Runtime patches — scroll progress, IntersectionObserver re-tune, glass-card sheen, nav active state, empty-state handling. |
| `scripts/build_pages_site.py` | Stitches source + overlays into `dist/pages-wrapper/index.html`. |
| `scripts/check_site_health.py` | Health probe used by the uptime workflow and runnable locally. |
| `.github/workflows/deploy-pages.yml` | On push to `main` (or manual / repository_dispatch), builds the artifact and runs `wrangler pages deploy`. |
| `.github/workflows/uptime-monitor.yml` | Cron every 15 min — probes the live URL, opens an issue on failure, fires `repository_dispatch: redeploy-pages` to auto-recover. |

`dist/pages-wrapper/` is git-ignored; the workflow regenerates it on every run.

## How a change reaches production

1. Edit the source — typically `web/pages-overlay.css` or `web/pages-overlay.js`,
   occasionally `web/dashboard-source.html` when a new bundle export is
   produced from the design tool.
2. Commit and push to `main`.
3. `deploy-pages.yml` runs: builds the artifact, deploys via `wrangler pages
   deploy`, then smoke-tests the live URL.
4. The deploy stamp (`<meta name="esd-deploy-stamp">`) embedded by the build
   script appears in the bottom-left of the page so you can verify the new
   artifact is live.

## How uptime is enforced

`uptime-monitor.yml` runs every 15 minutes. It calls
`scripts/check_site_health.py`, which:

- requires HTTP 200 within 25 s
- requires body ≥ 8 KB (catches empty / stub responses)
- requires the `esd-deploy-stamp` meta and the `NANO` wordmark in the body
- fails if the deploy stamp is older than 168 h (7 days)

On failure, the workflow:

1. Posts (or comments on) a single open GitHub issue labeled `uptime`.
2. Calls the GitHub dispatch API with `event_type: redeploy-pages`, which
   re-triggers `deploy-pages.yml` and re-pushes the artifact. Most transient
   Pages edge issues clear themselves on a fresh push.

On recovery, the issue is auto-closed.

## One-time setup

The workflows require two repo secrets:

- `CLOUDFLARE_API_TOKEN` — an API token with **Account · Cloudflare Pages ·
  Edit** permission for the `esd-lab-namo` project. Create it at
  <https://dash.cloudflare.com/profile/api-tokens>.
- `CLOUDFLARE_ACCOUNT_ID` — the account ID shown on the Cloudflare dashboard
  sidebar.

Add both at *Settings → Secrets and variables → Actions → New repository
secret*.

The Cloudflare Pages project itself must already exist
(`wrangler pages project create esd-lab-namo` if not). The project's build
output directory in the Cloudflare dashboard can stay blank — the deploy
workflow ships a pre-built directory, so Pages does no build of its own.

## Running locally

Rebuild the artifact:

```bash
python scripts/build_pages_site.py
open dist/pages-wrapper/index.html
```

Probe production:

```bash
python scripts/check_site_health.py
python scripts/check_site_health.py --max-stamp-age-hours 24
```

Force a redeploy without pushing code:

```bash
gh workflow run deploy-pages.yml
```

## Why this design

- **No build step on Cloudflare's side.** The artifact is built in CI from
  pinned Python + Node, then uploaded as static files. No surprise
  failures from Pages picking up a new framework version.
- **Layout fixes live as an overlay**, not as a fork of the bundle. When a
  new dashboard export drops, only `web/dashboard-source.html` changes — the
  overlay CSS and JS continue to apply.
- **Self-healing via the uptime monitor.** A transient edge failure or a
  missing recent deploy stamp triggers a fresh `wrangler pages deploy`
  automatically.
