# Pages decoupling from `esd-lab-namo.sc.edu` — report (2026-06-03)

## Summary

I removed the dependency on `esd-lab-namo.sc.edu` from the live Cloudflare Pages
frontend and restored full health on the public dashboard. When I started, the
production deployment was pinned to a dead quick-tunnel origin and `/api/healthz`
was returning HTTP 530, and the deployed security headers still listed the USC
`sc.edu` hostname. After re-pinning the API proxy to the backend tunnel that is
actually alive and shipping a clean bundle, all three public endpoints return
200 and the `sc.edu` reference is gone from the live site.

The frontend hostname stays `esd-lab-namo.pages.dev`, exactly as required, and I
did not touch DNS for `pages.dev` (it is Cloudflare-owned and the account has no
zones to edit anyway).

## 1. Cloudflare resources inspected (via the API)

- Account `21cea66295ccf4ab467a7cb86e2d8312` confirmed. The API reports it as
  "Namit507@gmail.com's Account".
- Pages project `esd-lab-namo` confirmed: subdomain `esd-lab-namo.pages.dev`,
  production branch `main`, project domains `["esd-lab-namo.pages.dev"]`.
- Production deployments for branch `main` confirmed. The pre-existing live
  deployment carried deploy-stamp `2026-06-03T23:24:18Z` and was pinned to the
  API origin `straight-interracial-propecia-took.trycloudflare.com`, which I
  found to be down. That is why `/api/*` was failing.
- Zones in the account: **0**. `pages.dev` does not appear as a user-managed
  zone, which matches the critical constraint. I made no DNS mutation against
  `pages.dev`.
- Named tunnel `8b0fa216-b69f-4289-98cf-492c55a710b6`: I could not read it. Every
  `cfd_tunnel` call returned code 10000 "Authentication error", which means the
  current API token does not carry the Cloudflare Tunnel scope. I therefore could
  not confirm its connector state or its ingress over the API.

## 2. Token abilities (verified empirically)

The `/user/tokens/verify` endpoint returns "Invalid API Token" for this token,
but that is expected for an account-scoped token hitting a user endpoint. I
verified the real abilities by exercising them:

| Ability | Result |
|---|---|
| Read account | works |
| Read Pages project and deployments | works |
| Edit Pages (deploy) | works — the production deploy succeeded |
| Read zone / DNS | works (returned the empty zone list) |
| Read/edit Cloudflare Tunnel | **missing** (code 10000 on every `cfd_tunnel` call) |

So three of the four required ability groups are present. The missing one is
`Account > Cloudflare Tunnel:Read`/`:Edit`. That gap did not block this task
because the temporary path does not need tunnel API access, but it does block a
future API-driven named-tunnel cutover.

## 3. Tokens generated or refreshed

I did not generate any new token, and I never printed a token value to logs,
output, or commits.

I could not retrieve the connector token from the Tunnel API because the token
lacks Tunnel scope. Instead I confirmed that the connector token already present
in `.env` as `CLOUDFLARE_TUNNEL_TOKEN` decodes to the correct tunnel
(`t = 8b0fa216-b69f-4289-98cf-492c55a710b6`) and the correct account
(`a = 21cea66295ccf4ab467a7cb86e2d8312`), with its secret intact. I then stored
that same verified credential under the requested key `CLOUDFLARED_TUNNEL_TOKEN`
in `.env`. The value lives only in the local, gitignored `.env` (mode 600).

## 4. Settings changed

Local env (`.env`, gitignored, mode 600; a timestamped `.env.bak.*` backup was
written, also mode 600 and gitignored):

- `DASHBOARD_PUBLIC_HOSTNAME` corrected from `esd-lab-namo.sc.edu` to
  `esd-lab-namo.pages.dev`, and its stale "zone still delegating" comment
  replaced with an accurate note.
- `CLOUDFLARED_TUNNEL_TOKEN` added (value copied from the verified
  `CLOUDFLARE_TUNNEL_TOKEN`).
- Confirmed already-correct: `CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_PAGES_PROJECT=esd-lab-namo`, `CLOUDFLARE_PAGES_BRANCH=main`,
  `DASHBOARD_STABLE_SHARE_URL=https://esd-lab-namo.pages.dev/`.
- Loop guard respected: `PAGES_API_ORIGIN` is not set to
  `https://esd-lab-namo.pages.dev/` anywhere.

Repo source and build (tracked files):

- `web/vite.config.ts`: `build.sourcemap` set from `true` to `false`.
- `scripts/build_pages_site.py`: the `_redirects` writer now emits the
  `/dashboard`, `/dashboard/`, and `/dashboard/index.html` to `/overview` 308
  rules in addition to the SPA fallback, so rebuilds keep those redirects.
- `web/public/_headers`: new canonical headers file with a CSP that no longer
  allowlists `esd-lab-namo.sc.edu`, so future `vite build` runs stay clean.
- `dashboard/public/pages_wrapper/manifest.json`: refreshed to the live backend
  origin so a manifest-driven rebuild also pins the working origin.
- `README.md` and `docs/cloudflare_cutover_blockers.md`: caveat wording replaced
  (see section 7).

Generated artifacts (gitignored): `web/build/_headers` and
`dist/pages-wrapper/_headers` had the `sc.edu` allowlist entry stripped, and a
clean deploy bundle was built at `dist/pages-wrapper-fix`.

Cloudflare Pages production deployment: I deployed a new production build to
branch `main`. New deploy-stamp `2026-06-03T23:37:59Z`, build-sha `4f2e047f`,
API origin pinned to `https://equivalent-industrial-smoke-xbox.trycloudflare.com`.

## 5. Live URLs verified

All checks were run against the public site after deploy:

- `https://esd-lab-namo.pages.dev/` returns 200.
- `https://esd-lab-namo.pages.dev/overview` returns 200.
- `https://esd-lab-namo.pages.dev/api/healthz` returns 200 with `"status": "ok"`.
- `scripts/check_site_health.py` for both `/` and `/overview` exits 0 and reports
  `assistant=ready`.
- `/dashboard`, `/dashboard/`, and `/dashboard/index.html` each return 308 to
  `/overview`.
- No source maps are emitted. The bundle contains zero `.map` files and the
  config now sets `sourcemap: false`. A request to a `.map` URL returns the SPA
  shell as `text/html` via the `/* /index.html 200` catch-all, not a real source
  map.
- The live Content-Security-Policy header no longer contains `sc.edu`.

## 6. Backend origin: temporary, not stable

The backend origin is **temporary**. The account has no DNS zones, so no real
owned domain is available, and `pages.dev` cannot be used as a tunnel DNS zone.
I took the temporary path: the frontend stays at `https://esd-lab-namo.pages.dev/`
and the wrapper's `/api/*` proxy points at the currently healthy cloudflared
quick tunnel `equivalent-industrial-smoke-xbox.trycloudflare.com`, used only as
the `PAGES_API_ORIGIN`.

I want to be clear about the durability limit. That quick tunnel runs on the
local machine and will rotate or stop at some point. When it does, `/api/*` will
return 530 again until the origin is re-pinned, either by the `make share-live`
watcher or by another deploy. The static frontend (`/` and `/overview`) stays up
regardless because it does not depend on the tunnel. I am not claiming the named
tunnel cutover is complete, because it is not.

## 7. Documentation caveat replaced

The old "blocked on `esd-lab-namo.sc.edu` NXDOMAIN, depends on quick-tunnel until
USC IT creates the CNAME" framing was replaced. The new wording, now in
`docs/cloudflare_cutover_blockers.md` and `README.md`, reads:

> The Pages frontend is live at `https://esd-lab-namo.pages.dev/` and no longer
> depends on `esd-lab-namo.sc.edu`. A stable named backend tunnel still needs a
> hostname under a DNS zone controlled in this Cloudflare account. `pages.dev` is
> Cloudflare-owned and cannot be used as the tunnel DNS zone.

## 8. Remaining requirement for a durable backend

To make the backend stable rather than temporary, two things are still needed:

1. A real owned domain added as a DNS zone in this Cloudflare account, then a
   `dashboard.<owned-domain>` CNAME pointing at
   `8b0fa216-b69f-4289-98cf-492c55a710b6.cfargotunnel.com`, with the named tunnel
   ingress routing that hostname to the local dashboard origin
   (`http://127.0.0.1:8080`). Set `PAGES_API_ORIGIN=https://dashboard.<owned-domain>`
   and redeploy so the wrapper proxies to the stable hostname.
2. An API token that adds `Account > Cloudflare Tunnel:Edit`, if the tunnel
   ingress and connector are to be managed over the API rather than in the
   Cloudflare dashboard.

Until both are in place, the frontend is durable on `pages.dev` but the backend
remains a rotating quick tunnel.

## Notes

- A stale `.git/index.lock` exists in the repo and could not be removed from this
  environment. If a Git command complains about a lock, delete
  `.git/index.lock` and retry.
- The new `dist/pages-wrapper-fix` deploy directory and the `.env.bak.*` backup
  are both gitignored. The backup contains secrets at mode 600; delete it once
  you are satisfied with the new `.env`.
