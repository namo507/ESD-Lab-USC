# Named Tunnel Cutover Report - 2026-06-03

## Current Verdict

I did not complete the named hostname cutover because the final public hostname, `esd-lab-namo.sc.edu`, does not resolve yet. I did confirm the Cloudflare named tunnel exists, the Cloudflare API can read its configuration, and the tunnel ingress is already configured for `esd-lab-namo.sc.edu -> http://127.0.0.1:8080` with a 404 fallback. I restored the live Pages site by using a fresh quick tunnel while the named DNS step remains blocked.

## Final Hostname

The canonical hostname from the runbook remains:

```text
esd-lab-namo.sc.edu
```

The DNS target requested from USC IT is:

```text
8b0fa216-b69f-4289-98cf-492c55a710b6.cfargotunnel.com.
```

## DNS State

I checked the CNAME:

```bash
dig +short esd-lab-namo.sc.edu CNAME
```

Current result:

```text
<empty>
```

I also checked the named health endpoint:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://esd-lab-namo.sc.edu/api/healthz
```

Current result:

```text
000, host does not resolve
```

This means the cutover is still blocked on the DNSMadeEasy CNAME in the `sc.edu` zone.

## Cloudflare Tunnel State

Cloudflare API inspection succeeded for account `21cea66295ccf4ab467a7cb86e2d8312`.

| Item | Value |
| --- | --- |
| Tunnel ID | `8b0fa216-b69f-4289-98cf-492c55a710b6` |
| Tunnel name | `ESD Lab Namo` |
| Tunnel status | `down` |
| Active connections | none |
| Last inactive timestamp | `2026-05-31T14:59:22.091188Z` |
| Remote config | enabled |
| Ingress 1 | `esd-lab-namo.sc.edu -> http://127.0.0.1:8080` |
| Ingress fallback | `http_status:404` |

The API token available to this Cloudflare plugin has Tunnel read access. I did not print, rotate, or create any token values.

## Local Secret State

I verified local secret hygiene without printing values.

| Check | Result |
| --- | --- |
| `.env` exists | yes |
| `.env` mode | `600` |
| `.env` gitignored | yes |
| `.env` tracked by git | no |
| `.dev.vars` gitignored | yes |
| `.cloudflared/` and `cloudflared/` ignored | yes |

The local `.env` contains the expected Cloudflare key names, including `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_TUNNEL_TOKEN`, `CLOUDFLARE_TUNNEL_ID`, `CLOUDFLARE_TUNNEL_NAME`, `CLOUDFLARE_PAGES_PROJECT`, `CLOUDFLARE_PAGES_BRANCH`, `DASHBOARD_PUBLIC_HOSTNAME`, and `DASHBOARD_STABLE_SHARE_URL`. I did not print their values.

## Work Completed While Blocked

- I kept the production Pages site working by deploying the Worker to a fresh quick tunnel origin.
- I added safeguards so production builds do not ship sourcemaps.
- I added Cloudflare Pages `_headers`.
- I added Pages Worker redirects from legacy `/dashboard` paths to `/overview`.
- I fixed the Docker image cold build so the dashboard runtime can be rebuilt.
- I added a production Compose file that avoids the whole-repo bind mount.
- I added health-check timeouts and Python 3.10+ selection to the share script.
- I added HPA and PDB support to the Helm chart.

## Remaining Human Step

Send this ticket to USC IT or the DNSMadeEasy administrator:

```text
Please create a CNAME in the sc.edu zone:
esd-lab-namo.sc.edu  CNAME  8b0fa216-b69f-4289-98cf-492c55a710b6.cfargotunnel.com.
TTL 300. This points a single research-dashboard hostname at a Cloudflare Tunnel. No other sc.edu records change.
```

## Final Gate Status

| Command | Result |
| --- | --- |
| `dig +short esd-lab-namo.sc.edu CNAME` | BLOCKED, empty result |
| `curl https://esd-lab-namo.sc.edu/api/healthz` | BLOCKED, host does not resolve |
| `grep API_ORIGIN dist/pages-wrapper/_worker.js` | PASS, currently points at the live quick tunnel |
| `curl https://esd-lab-namo.pages.dev/api/healthz` | PASS, `status: ok` |
| `python3 scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/ --timeout 25 --min-bytes 8192` | PASS |
| `python3 scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/overview --timeout 25 --min-bytes 8192` | PASS |

I will not call the named tunnel cutover complete until DNS returns the `cfargotunnel.com` CNAME and the named hostname returns 200 on `/api/healthz`.
