# Named-Hostname Cutover Blockers

> Goal: move the canonical public dashboard URL off
> `https://esd-lab-namo.pages.dev/` (Pages wrapper · iframes a rotating
> trycloudflare origin) to `https://esd-lab-namo.sc.edu/`
> (Cloudflare named tunnel · stable hostname).
>
> This document records what is required, what is in place, and what is
> blocked.

## Status (verified 2026-05-11)

| Item | State | Notes |
|------|-------|-------|
| Cloudflare account | active | id `21cea66295ccf4ab467a7cb86e2d8312` (Namit507@gmail.com) |
| Zones in account | **0** | `sc.edu` is not on Cloudflare. |
| `sc.edu` nameservers | `ns0–4.dnsmadeeasy.com` | USC IT operates `sc.edu` via DNSMadeEasy. |
| `esd-lab-namo.sc.edu` public DNS | **NXDOMAIN** | no CNAME has been created at the registrar yet. |
| Pages project | healthy | `esd-lab-namo` · production branch `main` · `esd-lab-namo.pages.dev` 200 OK. |
| API token (`CLOUDFLARE_API_TOKEN` in `.env`) | partial | scopes: Zone:Read ✓ · Pages:Edit ✓ · Tunnel:* ✗ (HTTP 403) · User:Read ✗ (HTTP 401). |
| Tunnel id `8b0fa216-b69f-4289-98cf-492c55a710b6` | **inaccessible via API** | token lacks `Account > Cloudflare Tunnel:Read` and `…:Edit`. |
| Origin binding | `127.0.0.1:8080` | localhost-only · no public exposure. |
| Pages wrapper deployed iframe target | matches alive cloudflared origin | regenerated + redeployed by the share workflow. |

## Why the named cutover cannot proceed in this Cloudflare account

`esd-lab-namo.sc.edu` requires a public DNS record. There are exactly two
ways to make that record resolve to a Cloudflare Tunnel:

1. **Add `sc.edu` to Cloudflare as a zone.** Requires the registrar
   nameservers for `sc.edu` to be changed to Cloudflare's nameservers.
   `sc.edu` is owned by the University of South Carolina and is operated
   on DNSMadeEasy. USC IT will not move the entire `sc.edu` zone to a
   personal Cloudflare account.
2. **Add the record `esd-lab-namo.sc.edu` directly in DNSMadeEasy.**
   USC IT creates a CNAME:
   ```
   esd-lab-namo.sc.edu  CNAME  8b0fa216-b69f-4289-98cf-492c55a710b6.cfargotunnel.com.
   ```
   Cloudflare automatically completes the TLS edge for the tunnel
   ingress hostname; no Cloudflare-side DNS change is needed.

**Path 2 is the only realistic free-tier route.** It requires an explicit
ticket to USC IT (or whoever administers DNSMadeEasy for `sc.edu`) to
create the CNAME. There is no Cloudflare-side API or connector action
that bypasses this — the record is at the parent zone's registrar.

## What is unblocked today

- `https://esd-lab-namo.pages.dev/` remains the canonical public URL.
- Every `make dashboard-share` run regenerates the wrapper and embeds the
  current cloudflared origin; every `make pages-deploy` pushes the
  refreshed wrapper to the production alias.
- The share script's `--mode named` already waits for hostname readiness
  (`scripts/share_dashboard.sh` line 323) and fails closed when the
  hostname does not resolve, so it cannot silently degrade.
- The named-tunnel ingress is intended to map to `http://127.0.0.1:8080`
  with a `http_status:404` fallback, and the dashboard runtime already
  binds to that address.

## Concrete steps remaining

1. **USC IT (registrar-only):** create the CNAME record:
   ```
   esd-lab-namo.sc.edu  CNAME  8b0fa216-b69f-4289-98cf-492c55a710b6.cfargotunnel.com.  proxied=cloudflare-tunnel-only
   ```
2. **Operator (Cloudflare Zero Trust dashboard):** confirm the tunnel's
   Public Hostname route points to `esd-lab-namo.sc.edu` with service
   `http://127.0.0.1:8080` and HTTP/404 fallback. (Cannot inspect via
   API today because `CLOUDFLARE_API_TOKEN` lacks Tunnel scope —
   either rotate the token to add `Account > Cloudflare Tunnel:Edit`,
   or do this step in the Cloudflare dashboard UI.)
3. **Operator:** once `host esd-lab-namo.sc.edu` resolves, run
   `make share-named`. The script will validate readiness and print
   `Canonical public URL → https://esd-lab-namo.sc.edu/`.
4. **Operator:** rebuild and redeploy the wrapper so the iframe target
   becomes the stable named hostname:
   ```bash
   python scripts/build_pages_wrapper.py --origin https://esd-lab-namo.sc.edu --kind named
   make pages-deploy
   ```
   At that point the Pages wrapper no longer depends on any
   `trycloudflare.com` hostname; both `esd-lab-namo.sc.edu` and
   `esd-lab-namo.pages.dev` resolve to the same stable origin.

## Free-tier compliance

Both candidate paths (named tunnel + Pages wrapper) are free-tier
Cloudflare features:
- Cloudflare Tunnel (cloudflared) — free.
- Cloudflare DNS for a delegated zone — free.
- Cloudflare Pages with custom domain — free.
- No paid products are required at any point.

## Origin exposure

`dashboard/server/live_dashboard_server.py` is launched with
`--host 127.0.0.1 --port 8080`. `ss -tlnp` confirms the listener is
bound to `127.0.0.1:8080` and is **not** reachable from any external
network interface. Once the named cutover completes, only the
cloudflared agent will reach the origin, so no host-firewall rule
restricting inbound traffic to Cloudflare IP ranges is necessary.
