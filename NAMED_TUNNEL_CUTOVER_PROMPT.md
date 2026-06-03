# ESD-Lab Dashboard — Named-Tunnel DNS, Token, and Credential Cutover Prompt

> Paste everything below the line into an autonomous agent (or follow it as
> a runbook). It drives the move off the rotating quick trycloudflare origin
> onto a stable **named** Cloudflare Tunnel hostname, by (1) getting the DNS
> record created at the hostname's authority and pointed at
> `<TUNNEL_ID>.cfargotunnel.com`, (2) provisioning a Cloudflare API token
> with Tunnel read/edit scope so repo automation can inspect/manage the
> tunnel, and (3) configuring and securely storing every credential in the
> `.env` contract the scripts already expect. It ends only when the named
> hostname serves `/api/healthz` and the Pages wrapper proxies to it.

---

## ROLE

You are the platform engineer executing the named-hostname cutover
documented in `docs/cloudflare_cutover_blockers.md`. Some steps are human
handoffs (a DNS admin, an operator clicking in the Cloudflare dashboard).
For those you prepare the exact ticket text, the exact record, and the
exact verification command, then wait and verify. Everything mechanical in
the repo you do yourself and verify.

## KNOWN GROUND TRUTH (from this repo — confirm before using)

| Thing | Value | Source |
|-------|-------|--------|
| Target public hostname | `esd-lab-namo.sc.edu` | `docs/cloudflare_cutover_blockers.md` |
| Named tunnel ID | `8b0fa216-b69f-4289-98cf-492c55a710b6` | same doc |
| Tunnel CNAME target | `8b0fa216-b69f-4289-98cf-492c55a710b6.cfargotunnel.com` | same doc |
| Cloudflare account ID | `21cea66295ccf4ab467a7cb86e2d8312` | same doc |
| Origin the tunnel maps to | `http://127.0.0.1:8080` (404 fallback) | dashboard runtime |
| `sc.edu` DNS authority | DNSMadeEasy, operated by USC IT | same doc |
| Pages project / branch | `esd-lab-namo` / `main` | `.env.example` |

> Note: the wrapper builder's docstring uses `dashboard.esdlabsc.com` as an
> example hostname. The canonical target in the blockers doc is
> `esd-lab-namo.sc.edu`. Confirm with the operator which hostname is final
> before creating DNS, and use that one value everywhere below
> (`DASHBOARD_PUBLIC_HOSTNAME`).

## FILES THIS PROMPT TOUCHES

```
.env                                   # real secrets (gitignored) — write keys here
.env.example                           # contract / placeholders (keys already present)
scripts/share_dashboard.sh             # --mode named requires TOKEN + HOSTNAME (lines 70-110)
scripts/build_pages_wrapper.py         # --origin <url> --kind named  (lines 132-139)
scripts/build_pages_site.py            # canonical Pages artifact build
dashboard/public/pages_wrapper/manifest.json   # origin the wrapper embeds
dist/pages-wrapper/_worker.js          # deployed /api proxy target (API_ORIGIN)
k8s/helm/esd-lab-dashboard/templates/secret.yaml  # esd-lab-dashboard-secrets
k8s/helm/esd-lab-dashboard/values.yaml # secret.create / pagesDeployHookUrl
docs/cloudflare_cutover_blockers.md    # the authoritative checklist
Makefile                               # pages-deploy, share-live, share named flow
```

## SECURITY RULES (do not skip)

1. **Least privilege.** The Tunnel token gets only Tunnel scope plus what
   automation needs. Do not mint an all-permissions or Global API Key.
2. **Never print or commit secrets.** Reference keys by name. Confirm `.env`
   stays gitignored and dockerignored. Never paste a token into the report,
   a commit, a log, or a chat reply. `share_dashboard.sh` already redacts
   `CLOUDFLARE_TUNNEL_TOKEN` in its echoed env (line 119); keep that habit.
3. **Fail closed.** `--mode named` must error if either the token or the
   hostname is missing or the hostname does not resolve. Do not let it
   silently fall back to a quick tunnel during cutover.
4. **DNS is shared infrastructure.** You are requesting a record on
   `sc.edu`, which USC IT owns. Do not attempt registrar-side changes
   yourself. Produce a precise ticket and verify the result.
5. **One hostname value, everywhere.** Whatever final hostname is chosen
   goes into `DASHBOARD_PUBLIC_HOSTNAME` and is the single source of truth
   for the wrapper origin, the tunnel route, and the verification probes.

---

# PART A — DNS: create or delegate the hostname and point it at the tunnel

There are exactly two ways to make `esd-lab-namo.sc.edu` resolve to the
named tunnel. Pick based on what USC IT will agree to.

### Route A1 (preferred, least change) — direct CNAME at DNSMadeEasy

Have the DNS admin create one record at the `sc.edu` authority:

```
Name (host):   esd-lab-namo
Type:          CNAME
Value (target):8b0fa216-b69f-4289-98cf-492c55a710b6.cfargotunnel.com.
TTL:           300
Proxy:         tunnel-only (Cloudflare completes the TLS edge automatically)
```

Cloudflare issues and serves the edge certificate for the tunnel ingress
hostname, so no Cloudflare-side DNS record is required for this route.

**Ticket text to send USC IT / DNSMadeEasy admin (fill the bracket):**

> Please create a CNAME in the `sc.edu` zone:
> `esd-lab-namo.sc.edu  CNAME  8b0fa216-b69f-4289-98cf-492c55a710b6.cfargotunnel.com.`
> TTL 300. This points a single research-dashboard hostname at a Cloudflare
> Tunnel. No other `sc.edu` records change. Requested by [name / NetID],
> contact [email].

### Route A2 (delegation) — delegate a subdomain to Cloudflare DNS

If USC IT prefers to hand off a label rather than manage tunnel records,
delegate a subdomain (for example `esd-lab.sc.edu`) by setting NS records at
DNSMadeEasy to the Cloudflare nameservers shown for the zone after you add
it in Cloudflare. Then create the proxied CNAME/record inside Cloudflare and
let Cloudflare manage the tunnel hostname under that delegated subdomain.
Use this only if delegation is acceptable; it is a bigger ask than A1.

### Verify DNS (do not proceed past this until it passes)

```
dig +short esd-lab-namo.sc.edu CNAME
host esd-lab-namo.sc.edu
# Expect the answer chain to include
#   8b0fa216-b69f-4289-98cf-492c55a710b6.cfargotunnel.com
# and, once the edge is live, an HTTPS 200/404 (not NXDOMAIN):
curl -sS -o /dev/null -w '%{http_code}\n' https://esd-lab-namo.sc.edu/api/healthz
```

Until `dig` returns the `cfargotunnel.com` target, DNS is not done. Record
the result honestly. If it still shows NXDOMAIN, the ticket has not been
applied and the cutover is blocked at this step.

# PART B — Cloudflare token with Tunnel read/edit scope

Today's `CLOUDFLARE_API_TOKEN` has Pages:Edit and Zone:Read but lacks Tunnel
scope (HTTP 403 on tunnel endpoints) per the blockers doc. Provision a token
that can inspect and manage the named tunnel.

### Create the token (Cloudflare dashboard, operator step)

1. Cloudflare dashboard → **Manage Account → Account API Tokens →
   Create Token → Create Custom Token**.
2. Permissions (account-scoped):
   - `Account › Cloudflare Tunnel › Edit`  (read + manage tunnels)
   - `Account › Cloudflare Pages › Edit`   (keep deploy automation working)
   - `Account › Account Settings › Read`   (lets wrangler resolve the account)
   - Optional if managing DNS via Cloudflare (Route A2 only):
     `Zone › DNS › Edit` on the delegated zone.
3. **Account Resources:** Include → the account
   `21cea66295ccf4ab467a7cb86e2d8312` only.
4. **Zone Resources:** only if using Route A2; otherwise none.
5. TTL: set a sane expiry and a calendar reminder to rotate.
6. Create, copy the token value once. It is shown a single time.

> You can keep this as one combined token (Tunnel + Pages) so a single
> `CLOUDFLARE_API_TOKEN` drives both, or mint a separate Tunnel-only token
> and leave the existing Pages token in place. If you split them, the repo
> currently reads one `CLOUDFLARE_API_TOKEN`; document which token is stored
> where and do not lose the Pages capability.

### Verify the token scope before storing it

```
# Token is valid/active:
curl -sS -H "Authorization: Bearer <TOKEN>" \
  https://api.cloudflare.com/client/v4/user/tokens/verify | jq '.success'

# Tunnel scope works (should be 200 + JSON, not 403):
curl -sS -H "Authorization: Bearer <TOKEN>" \
  "https://api.cloudflare.com/client/v4/accounts/21cea66295ccf4ab467a7cb86e2d8312/cfd_tunnel/8b0fa216-b69f-4289-98cf-492c55a710b6" \
  | jq '.success, .result.name, .result.status'
```

If the second call returns `success: true` and the tunnel name/status, the
scope is correct. A 403 means the permission or account-resource scoping is
wrong; fix and re-verify. Do not store a token you have not verified.

### Get the tunnel run token (for cloudflared, separate from the API token)

`CLOUDFLARE_TUNNEL_TOKEN` is the connector run token, not the API token.
Retrieve it for tunnel `8b0fa216-...`:

```
curl -sS -H "Authorization: Bearer <API_TOKEN_WITH_TUNNEL_SCOPE>" \
  "https://api.cloudflare.com/client/v4/accounts/21cea66295ccf4ab467a7cb86e2d8312/cfd_tunnel/8b0fa216-b69f-4289-98cf-492c55a710b6/token" \
  | jq -r '.result'
```

That value is what `dashboard-share-named` / `share_dashboard.sh --mode
named` pass to `cloudflared ... run --token`. Treat it as a secret.

# PART C — `.env` configuration and secure credential storage

The keys already exist as placeholders in `.env.example` (lines ~87-114,
181). Fill the real `.env` (gitignored). Do not add new key names; use these.

### Keys to set in `.env`

```
# --- Named tunnel (required for --mode named) ---
CLOUDFLARE_TUNNEL_TOKEN=<connector run token from Part B>
DASHBOARD_PUBLIC_HOSTNAME=esd-lab-namo.sc.edu        # the FINAL chosen hostname, no scheme
CLOUDFLARE_TUNNEL_ID=8b0fa216-b69f-4289-98cf-492c55a710b6
CLOUDFLARE_TUNNEL_NAME=<friendly name from Zero Trust dashboard>

# --- API / Pages automation ---
CLOUDFLARE_API_TOKEN=<token with Tunnel:Edit + Pages:Edit from Part B>
CLOUDFLARE_ACCOUNT_ID=21cea66295ccf4ab467a7cb86e2d8312
CLOUDFLARE_PAGES_PROJECT=esd-lab-namo
CLOUDFLARE_PAGES_BRANCH=main
CLOUDFLARE_ZONE_ID=<only if Route A2 delegation; else leave blank>

# --- Canonical URL the share script echoes ---
DASHBOARD_STABLE_SHARE_URL=https://esd-lab-namo.sc.edu/

# --- Pages redeploy hook used by the k8s reconcile path (optional) ---
PAGES_DEPLOY_HOOK_URL=<Pages deploy hook URL, if used>
```

`DASHBOARD_PUBLIC_HOSTNAME` is a bare hostname (no `https://`).
`DASHBOARD_STABLE_SHARE_URL` is the full URL. `share_dashboard.sh` requires
both `CLOUDFLARE_TUNNEL_TOKEN` and `DASHBOARD_PUBLIC_HOSTNAME` for
`--mode named` and errors loudly if either is blank (lines 76-78).

### Generate / store rules

- **Write `.env` with restrictive perms:** after editing, `chmod 600 .env`.
  Confirm `stat -c '%a' .env` is `600` (or `-rw-------`).
- **Confirm it is ignored, never tracked:**
  `git check-ignore .env` returns `.env`; `git ls-files | grep -E '(^|/)\.env$'`
  is empty; `.env` is also in `.dockerignore`. If `.env` is somehow tracked,
  stop and untrack it (`git rm --cached .env`) before continuing.
- **Do not echo secrets in shells that log history.** Prefer writing values
  with an editor or `printf '%s\n' 'KEY=value' >> .env` in a non-logged
  shell, then `chmod 600`. Avoid `export KEY=secret` in interactive history.
- **Mirror secrets into the other planes that need them, by reference:**
  - GitHub Actions: set repo secrets `CLOUDFLARE_API_TOKEN`,
    `CLOUDFLARE_ACCOUNT_ID` (used by `.github/workflows/deploy-pages.yml`).
    Update them to the new token if you rotated it.
  - Kubernetes: the chart expects an externally-managed secret
    `esd-lab-dashboard-secrets` (`secret.create: false` in `values.yaml`).
    Create it in-cluster, do not bake it into the chart:
    ```
    kubectl -n esd-lab create secret generic esd-lab-dashboard-secrets \
      --from-literal=pagesDeployHookUrl="$PAGES_DEPLOY_HOOK_URL"
    ```
  - Optional hardening: store the master copies in a real secret manager
    (1Password, macOS Keychain, Vault) and have `.env` populated from there
    rather than being the only copy.
- **Rotation:** record the token expiry; when rotating, update `.env`,
  GitHub secrets, and any cluster secret together, then re-run the Part B
  verify calls.

### Verify `.env` wiring (no secret values printed)

```
make check-env
# Confirm keys are present and non-empty WITHOUT printing values:
for k in CLOUDFLARE_TUNNEL_TOKEN DASHBOARD_PUBLIC_HOSTNAME CLOUDFLARE_API_TOKEN \
         CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_TUNNEL_ID; do
  grep -q "^${k}=." .env && echo "$k: set" || echo "$k: MISSING/empty"
done
stat -c '%a %n' .env
git check-ignore .env
```

# PART D — Wire the named origin through the app and cut over

Only after Parts A, B, C verify green.

1. **Bring up the named tunnel (fail-closed):**
   ```
   make share-named   # or: bash scripts/share_dashboard.sh --mode named
   ```
   Expect it to validate hostname readiness and print
   `Canonical public URL → https://esd-lab-namo.sc.edu/`. If it errors on a
   missing token/hostname or unresolved DNS, go back to A or C.
2. **Rebuild the wrapper to embed the stable named origin:**
   ```
   python scripts/build_pages_wrapper.py --origin https://esd-lab-namo.sc.edu --kind named
   ```
   Confirm `dashboard/public/pages_wrapper/manifest.json` now shows
   `"tunnel_kind": "named"` and `origin_host` = the hostname.
3. **Rebuild the canonical Pages artifact and redeploy (operator-gated):**
   ```
   make pages-build         # writes dist/pages-wrapper with new API_ORIGIN
   grep API_ORIGIN dist/pages-wrapper/_worker.js   # must equal the named origin
   make pages-deploy        # pushes to production alias — only after the grep matches
   ```
4. **Confirm the Zero Trust public-hostname route** maps
   `esd-lab-namo.sc.edu → http://127.0.0.1:8080` with HTTP 404 fallback
   (dashboard UI step; the API token with Tunnel scope can now read it via
   the cfd_tunnel/configurations endpoint to confirm).

# FINAL VERIFICATION GATE (all must pass)

```
dig +short esd-lab-namo.sc.edu CNAME                       # -> ...cfargotunnel.com
curl -sS -o /dev/null -w '%{http_code}\n' https://esd-lab-namo.sc.edu/api/healthz   # 200
curl -sS https://esd-lab-namo.sc.edu/api/healthz | jq '.status'                     # "ok"
grep API_ORIGIN dist/pages-wrapper/_worker.js              # https://esd-lab-namo.sc.edu
curl -sS https://esd-lab-namo.pages.dev/api/healthz | jq '.status'                  # "ok" via edge
python scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/ --timeout 25 --min-bytes 8192
python scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/overview --timeout 25 --min-bytes 8192
# Token scope still good:
curl -sS -H "Authorization: Bearer <API_TOKEN>" \
  "https://api.cloudflare.com/client/v4/accounts/21cea66295ccf4ab467a7cb86e2d8312/cfd_tunnel/8b0fa216-b69f-4289-98cf-492c55a710b6" | jq '.success'
```

## DELIVERABLE

Write `docs/named_tunnel_cutover_report_<date>.md` containing, in
first-person prose with no em dashes: which hostname was finalized, which
DNS route was used and its current `dig` state, confirmation the Tunnel-
scoped token verifies (success true, never the token value), what `.env`
keys were set and that `.env` is `600` and gitignored, and the result of
each final-gate command. State plainly which steps are still blocked on a
human (DNS ticket, dashboard route confirmation) and which are done. Do not
claim the cutover is complete while `dig` shows NXDOMAIN or the named
`/api/healthz` is not 200.
