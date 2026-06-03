# ESD-Lab Dashboard — Full Infrastructure Sweep & Self-Heal Prompt

> Paste everything below the line into an autonomous coding agent running
> with this repository checked out and a shell available. It performs a
> massive end-to-end health sweep of the Docker, Kubernetes, Cloudflare
> Pages, and Cloudflare Tunnel pipeline behind the two public dashboard
> URLs, finds anything broken or leaking, and dynamically repairs what is
> safe to repair, leaving a verified report behind.

---

## ROLE

You are a senior SRE / platform engineer doing a production readiness and
reliability sweep on the **ESD Lab NANO Study dashboard** before an
expected increase in traffic and server load. The two public surfaces you
are protecting are:

- `https://esd-lab-namo.pages.dev/`
- `https://esd-lab-namo.pages.dev/overview`

Both are served by a Cloudflare Pages SPA whose `/api/*` calls are proxied
to a backend dashboard server that is reachable only through a Cloudflare
Tunnel. Your job is to confirm every link in that chain is healthy, find
what will break under load or leak data, and fix it.

## REPOSITORY MAP (ground truth — verify each path exists before acting)

```
docker-compose.yml                         # dashboard + cloudflared services
docker/dashboard/Dockerfile                # runtime image, /api/healthz healthcheck
.dockerignore                              # what is excluded from build context
.env                                       # REAL secrets (gitignored) — never print values
.env.example                               # template / contract for required keys
Makefile                                   # all ops targets (see list below)
config/paths.yml  config/study_parameters.yml  config/redcap_config.yml
config/model_config.yml  config/llm_model.json

web/                                        # React 18 + Vite + TS SPA
  package.json  vite.config.ts  tsconfig.json
  src/  public/  build/                     # build/ is the Vite output
  lab-readings.json
dashboard/
  server/live_dashboard_server.py           # backend :8080, all /api routes
  pipelines/build_dashboard_data.py (.R)     # main data build
  pipelines/build_org_site_data.py  build_readings_index.py
  pipelines/generate_synthetic_dashboard_data.py
  public/pages_wrapper/manifest.json         # current live tunnel origin
  k8s_pipeline/                              # event-driven readings pipeline
    config.py watcher.py worker.py lease.py ledger.py freshness.py
    observability.py k8s_api.py
  data/                                      # generated JSON the runtime serves

dist/pages-wrapper/                          # Pages deploy artifact (built)
  _worker.js  _redirects  index.html         # _worker.js holds API_ORIGIN
dist/pages-runtime-wrapper/index.html        # rotating-origin preview wrapper

k8s/helm/esd-lab-dashboard/                  # Helm chart
  Chart.yaml values.yaml
  templates/deployment-dashboard.yaml deployment-watcher.yaml
  templates/cronjob-reconcile.yaml pipeline-worker-job-template.yaml
  templates/networkpolicy.yaml secret.yaml configmap.yaml
  templates/service.yaml serviceaccount-rbac.yaml _helpers.tpl

scripts/
  build_pages_site.py        # builds dist/pages-wrapper from web/build + manifest
  build_pages_wrapper.py     # builds the rotating-origin runtime wrapper
  watch_pages_site.py  watch_pages_wrapper.py
  share_dashboard.sh         # brings up cloudflared, regenerates wrapper
  check_site_health.py       # public URL probe
  check_docker_health.py     # docker daemon + compose + http
  check_k8s_readings_pipeline.py
  check_dashboard_runtime.py # container smoke test
  run_full_pipeline.sh  redcap_daily_sync.py  select_best_local_llm.py

.github/workflows/
  ci.yml  deploy-pages.yml  k8s-validate.yml  uptime-monitor.yml  sync_local_llm.yml

docs/
  cloudflare_cutover_blockers.md  auto_update_pipeline.md
  kubernetes_event_pipeline.md  kubernetes_runbook.md  pages_deploy.md
```

Makefile targets you may use: `check-env`, `docker-health`, `dashboard-build`,
`dashboard-up`, `dashboard-down`, `dashboard-logs`, `dashboard-smoke`,
`dashboard-refresh`, `dashboard-share`, `pages-build`, `pages-deploy`,
`pages-watch`, `pages-runtime-deploy`, `pages-runtime-watch`, `share-live`,
`k8s-helm-lint`, `k8s-smoke`, `verify-backup`.

## OPERATING RULES (read before touching anything)

1. **Two-pass discipline.** Pass 1 is read-only: inventory and diagnose
   everything, classify findings by severity, and write the report.
   Pass 2 applies fixes, and only the fixes you classified `AUTO-SAFE`.
2. **Never break the live site.** Do not run `make pages-deploy` or any
   `wrangler pages deploy` against the production `main` alias unless a
   fix explicitly requires a redeploy AND you have re-verified the build
   locally first. Prefer the preview branch (`runtime-share`) for trials.
3. **Secrets are sacred.** Never print, echo, commit, or paste the
   contents of `.env`, tokens, or any `stringData`. When you reference a
   secret, reference it by key name only. Do not rotate or invalidate any
   live token.
4. **HIPAA / data safety.** This repo touches REDCap and ECG study data.
   Never move pipeline outputs onto unencrypted storage, never deidentify
   incorrectly, and never include raw subject data in the report. Respect
   `.dockerignore` exclusions (`data/raw`, `data/processed`, `secure_data/`).
5. **Work on a branch.** Create `chore/infra-sweep-<date>` and keep every
   change reviewable. Make small commits with clear messages.
6. **Re-verify every fix.** A fix is not done until the matching verify
   command passes. If a fix cannot be verified, revert it and downgrade
   it to a `PROPOSE` finding.
7. **Write prose findings in first person, present tense, no em dashes.**
   State uncertainty explicitly when you cannot confirm something (for
   example, anything requiring the live Cloudflare account or a cluster
   you cannot reach).

## SEVERITY MODEL

- `CRITICAL` — public site is down, data leak, or guaranteed failure under load.
- `HIGH` — will break soon, silently degrades, or one fault from outage.
- `MEDIUM` — correctness, hygiene, or scale headroom risk.
- `LOW` — cleanup, cost, or polish.

## FIX TIERS

- `AUTO-SAFE` — local, reversible, no prod blast radius (lint configs,
  add missing probes/limits in chart values, gitignore leaks, prune dead
  files, fix drift between `.env.example` and code, add a `_headers`
  file). Apply in Pass 2 and verify.
- `PROPOSE` — anything that touches the live Pages alias, live tunnel,
  secret rotation, DNS, or cluster state. Write exact commands and
  expected output, but do not execute.

---

# SECTION 1 — Environment & secrets sweep

**Files:** `.env`, `.env.example`, `dashboard/k8s_pipeline/config.py`,
`scripts/share_dashboard.sh` (it `source`s `.env`), `docker-compose.yml`,
`k8s/helm/esd-lab-dashboard/templates/secret.yaml` and `configmap.yaml`,
`Makefile` target `check-env`.

**Check:**
- Run `make check-env`. Capture pass/fail without printing secret values.
- Build the set of keys actually read in code: grep `os.getenv(` and
  `os.environ` across `dashboard/`, `scripts/`, and `src/`, and grep
  `process.env` / `import.meta.env` across `web/src`. Compare that set to
  the keys present in `.env.example`. Report three buckets: (a) read in
  code but missing from `.env.example`, (b) in `.env.example` but never
  read, (c) present in `.env.example` but absent from the real `.env`.
- Confirm `.env`, `.env.*.local`, and `config/redcap_config_local.yml`
  are gitignored AND in `.dockerignore`. Confirm none are tracked by git
  (`git ls-files | grep -E '(^|/)\.env'` must be empty).
- Confirm the Cloudflare contract keys exist and are non-empty in `.env`:
  `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_TUNNEL_TOKEN`,
  `CLOUDFLARE_PAGES_PROJECT`, `CLOUDFLARE_PAGES_BRANCH`, `PAGES_DEPLOY_HOOK_URL`.
  Per `docs/cloudflare_cutover_blockers.md` the API token is known to lack
  `Tunnel:*` and `User:Read` scopes; verify whether that is still true and
  flag it as the reason named-hostname automation cannot self-heal.
- Look for leaked secrets in tracked files: scan `web/build`,
  `dist/`, `dashboard/public`, and committed JSON for anything matching
  token/bearer/`trycloudflare`/SMTP password patterns.

**Failure signatures:** `make check-env` fails; secret key read in code
but undefined at runtime (KeyError / empty string); `.env` tracked by git;
a real token string found in any committed or built asset.

**Auto-fix (AUTO-SAFE):** add missing keys to `.env.example` with safe
placeholder values and an inline comment; add missing ignore rules to
`.gitignore` / `.dockerignore`; if a built artifact under `dist/` or
`web/build` contains a secret, delete the artifact and add the path to
ignores (do not rewrite git history automatically — flag that as PROPOSE).

**Verify:** re-run `make check-env`; re-run the git/grep leak scan and show
zero hits.

# SECTION 2 — Cloudflare Pages SPA, Worker proxy, and routing

**Files:** `web/vite.config.ts`, `web/package.json`,
`scripts/build_pages_site.py`, `dist/pages-wrapper/_worker.js`,
`dist/pages-wrapper/_redirects`, `dist/pages-wrapper/index.html`,
`dashboard/server/live_dashboard_server.py` (function `is_spa_route`),
`.github/workflows/deploy-pages.yml`, `docs/pages_deploy.md`.

**Check:**
- Probe both public URLs live with the project's own probe:
  `python scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/ --timeout 25 --min-bytes 8192`
  and again for `.../overview`. Confirm HTTP 200, body size, and the
  embedded build stamp age. Record the `esd-api-origin` meta tag value
  that `build_pages_site.py` writes into `index.html`.
- Confirm `/overview` resolves through BOTH routing layers: the
  `_redirects` rule (`/* /index.html 200`) and the `_worker.js`
  asset-fallback branch, and that `is_spa_route` in the backend treats
  `/overview` as an SPA route. A mismatch here is the classic cause of a
  blank page or 404 on deep links.
- Read the `API_ORIGIN` constant at the top of `dist/pages-wrapper/_worker.js`.
  Compare it to `dashboard/public/pages_wrapper/manifest.json`
  (`dashboard_url` / `origin_host`). If they disagree, the deployed proxy
  is pointing at a dead origin and every `/api/*` call 502s. This is the
  single most likely thing to be silently broken.
- Verify a real API round trip through the public edge:
  `curl -fsS https://esd-lab-namo.pages.dev/api/healthz` should return the
  health JSON with `status: ok`. If it fails, the Pages→tunnel→backend
  chain is broken even though the static page looks fine.
- Inspect `vite.config.ts`: `sourcemap: true` ships source maps to the
  public bundle (information leak / source disclosure). `emptyOutDir:false`
  can leave stale assets in `web/build`. Note both.
- Confirm there is a `_headers` file in the Pages artifact. There is not
  today, so the site ships with no security headers (CSP, HSTS,
  X-Content-Type-Options, Referrer-Policy, X-Frame-Options).

**Failure signatures:** `/overview` 404 or blank; `_worker.js` API_ORIGIN
!= manifest origin; `/api/healthz` via public URL non-200; source maps
present in `dist/pages-wrapper`; no `_headers`.

**Auto-fix:**
- (AUTO-SAFE) Add `web/public/_headers` (or teach `build_pages_site.py` to
  emit one) with a conservative CSP plus HSTS, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a
  frame policy consistent with the wrapper's iframe use. Rebuild locally
  with `make pages-build` and confirm the file lands in `dist/pages-wrapper`.
- (AUTO-SAFE) Set `sourcemap: false` for the production build (or
  `'hidden'`) in `vite.config.ts`; rebuild and confirm no `.map` files in
  the artifact.
- (PROPOSE) If API_ORIGIN is stale: the correct repair is to restart the
  share supervisor so it republishes with the live origin —
  `make share-live` (regenerates wrapper + redeploys preview) and, only
  if the canonical alias must change, `make pages-deploy`. Give the exact
  commands and the expected `[build_pages_site] ... api=<origin>` log line.

**Verify:** re-probe both URLs; `curl .../api/healthz` returns ok;
`grep -R "API_ORIGIN" dist/pages-wrapper/_worker.js` matches the manifest
origin; `find dist/pages-wrapper -name '*.map'` is empty; `_headers`
present.

# SECTION 3 — Cloudflare Tunnel (the load-bearing fragility)

**Files:** `docker-compose.yml` (services `dashboard-share`,
`dashboard-share-named`), `scripts/share_dashboard.sh`,
`scripts/build_pages_wrapper.py`, `scripts/watch_pages_wrapper.py`,
`dashboard/public/pages_wrapper/manifest.json`,
`docs/cloudflare_cutover_blockers.md`, `.env` key `CLOUDFLARE_TUNNEL_TOKEN`.

**Context you must internalize:** the canonical site proxies `/api/*` to a
**quick** trycloudflare tunnel whose hostname **rotates every time
cloudflared restarts** (`manifest.json` currently shows
`tunnel_kind: quick`). Under load or after any crash/restart, the origin
changes and the deployed `_worker.js` keeps pointing at the dead one. The
named-tunnel cutover to `esd-lab-namo.sc.edu` is blocked at the registrar
(DNSMadeEasy CNAME to `8b0fa216-...cfargotunnel.com`) and by missing API
token scopes. This is the top reliability risk for "additional load."

**Check:**
- Determine whether a tunnel is currently up and which kind. Compare
  `manifest.json.origin_host` to what `_worker.js` proxies to (Section 2).
- Confirm `share_dashboard.sh --mode named` fails closed when the hostname
  does not resolve (it should; the cutover doc references the readiness
  guard). Confirm `--mode quick` regenerates and redeploys the runtime
  wrapper preview.
- Check whether `make share-live` (the continuous supervisor) is actually
  running on the host. If it is not, origin rotation will not self-heal.
  Look for its process / log under `${XDG_RUNTIME_DIR:-/tmp}/esd-lab-usc-share`.
- Validate `CLOUDFLARE_TUNNEL_TOKEN` is present so the named service
  (`dashboard-share-named`) can run; if absent, only the rotating quick
  tunnel works.

**Failure signatures:** quick tunnel in use with no live supervisor;
stale origin in deployed worker; named service has empty token; readiness
guard bypassed.

**Auto-fix:**
- (PROPOSE) Stand up the supervisor as a long-lived service so origin
  rotation auto-republishes: `make share-live`. Provide a systemd unit or
  `launchd` plist template so it survives reboots, since a one-shot run
  dies with the shell.
- (PROPOSE, highest leverage) Migrate off the rotating quick tunnel to the
  **named** tunnel for a stable origin. Steps from
  `docs/cloudflare_cutover_blockers.md`: get USC IT to create the
  DNSMadeEasy CNAME, confirm the public-hostname route to
  `http://127.0.0.1:8080` with 404 fallback, then
  `python scripts/build_pages_wrapper.py --origin https://esd-lab-namo.sc.edu --kind named`
  and `make pages-deploy`. Note the API token must gain
  `Account > Cloudflare Tunnel:Edit` to manage this via API.

**Verify:** after any wrapper regen, `manifest.json` origin == `_worker.js`
API_ORIGIN == a host that returns 200 on `/api/healthz`.

# SECTION 4 — Docker runtime & image

**Files:** `docker/dashboard/Dockerfile`, `docker-compose.yml`,
`.dockerignore`, `dashboard/requirements-dashboard.txt`,
`scripts/check_docker_health.py`, `scripts/check_dashboard_runtime.py`,
`Makefile` targets `docker-health`, `dashboard-build`, `dashboard-smoke`.

**Check:**
- `make docker-health` (wraps `check_docker_health.py` against services
  `dashboard`, `dashboard-share`, `dashboard-share-named` and
  `http://127.0.0.1:8080/`). Capture JSON.
- `make dashboard-build` then `make dashboard-smoke`
  (`check_dashboard_runtime.py --base-url http://127.0.0.1:8080`). Confirm
  `/api/healthz` returns `status: ok` with non-empty `dashboard` and
  `readings` payloads, matching both healthchecks (compose + Dockerfile).
- **Bind-mount leak / load risk:** `docker-compose.yml` mounts `.:/app`,
  which remounts the ENTIRE repo into the running container at runtime,
  including `.env`, `logs/`, `data/`, and `models/`, even though
  `.dockerignore` excludes them from the build. That is a secret-exposure
  and performance footgun in any non-dev deployment. Flag it.
- Pin and pip-audit: `python:3.11-slim` base, `pip install` from
  `requirements-dashboard.txt`. Check whether versions are pinned; run a
  vulnerability scan if a scanner is available. Note image runs as root
  (no `USER` directive) while the Helm chart runs as non-root 1000 — an
  inconsistency.
- Confirm `restart: unless-stopped` and the healthcheck `start_period`
  give enough time under load; the synthetic fallback flag
  (`--fallback-synthetic`) means the container can report healthy while
  serving stale/synthetic data. Note this masks real pipeline failure.

**Failure signatures:** compose service unhealthy; smoke test times out;
`.env` visible inside container (`docker compose exec dashboard ls -la /app/.env`);
unpinned or vulnerable deps; container UID 0.

**Auto-fix:**
- (AUTO-SAFE) Add a non-root `USER 1000` (and matching `chown`) to the
  Dockerfile to align with the chart's security context; rebuild and
  smoke test.
- (AUTO-SAFE) Add a hardened production compose override
  (`docker-compose.prod.yml`) that drops the `.:/app` bind mount and
  mounts only `dashboard/data` and the readings volume read-only, leaving
  the dev compose untouched.
- (AUTO-SAFE) Pin dependency versions in `requirements-dashboard.txt` if
  unpinned.

**Verify:** `make dashboard-smoke` passes on the rebuilt image; exec into
the prod-override container and confirm `.env` is absent; image inspect
shows non-root user.

# SECTION 5 — Kubernetes / Helm chart

**Files:** `k8s/helm/esd-lab-dashboard/values.yaml` and all `templates/*`,
`dashboard/k8s_pipeline/*` (`config.py`, `watcher.py`, `worker.py`,
`lease.py`, `ledger.py`, `freshness.py`, `observability.py`, `k8s_api.py`),
`scripts/check_k8s_readings_pipeline.py`, `.github/workflows/k8s-validate.yml`,
`docs/kubernetes_event_pipeline.md`, `docs/kubernetes_runbook.md`.

**Check (static, always possible):**
- `make k8s-helm-lint` (helm lint + `helm template` with the two
  `existingClaims`). Then `kubectl apply --dry-run=client` the rendered
  manifest, mirroring `k8s-validate.yml`.
- Read `deployment-dashboard.yaml` and `deployment-watcher.yaml` and
  confirm each has BOTH a `readinessProbe` and `livenessProbe` wired to
  `/api/healthz`. If either is missing, rollouts and load-balancing will
  send traffic to a not-ready pod.
- **Scale headroom (the core "additional load" question):**
  `values.yaml` sets `replicaCount: 1` with no HorizontalPodAutoscaler and
  no PodDisruptionBudget. One pod, hard CPU limit `1`, memory `1536Mi`.
  Under load this is a single point of failure with no elastic capacity.
- Confirm `cronjob-reconcile.yaml` (`*/15 * * * *`, `concurrencyPolicy:
  Forbid`, `backoffLimit: 0`) cannot stampede, and that a failed reconcile
  surfaces somewhere (it has `failedJobsHistoryLimit: 3` but no alert).
- `networkpolicy.yaml`: ingress only on 8080, egress 53 + 443 + intra-pod.
  Confirm the watcher/worker actually only need those (they call the k8s
  API on 443 and DNS on 53). Confirm the `to: podSelector: {}` egress rule
  is intentional and not broader than needed.
- `secret.yaml` is gated by `secret.create: false`, so the chart expects
  an externally-managed secret named `esd-lab-dashboard-secrets`
  (`pagesDeployHookUrl`). Confirm that external secret is documented and
  present in the target namespace, or the reconcile→redeploy hook is dead.
- Worker Job template: `ttlSecondsAfterFinished: 86400`, `maxRetries: 3`,
  exponential backoff `1→30s`. Confirm lease TTL (`leaseTtlSeconds: 900`)
  in `values.yaml` matches `PIPELINE_LEASE_TTL_SECONDS` defaults in
  `config.py` so a crashed worker's lease expires and reconcile recovers.
- Confirm `image.tag: latest` is NOT used for production (mutable tag
  defeats rollbacks); the chart should pin a digest or version.
- Confirm the RBAC in `serviceaccount-rbac.yaml` is least-privilege for
  what `k8s_api.py` and `worker.py` actually call (creating Jobs, reading
  pods/leases). Flag any wildcard verbs/resources.

**Check (live, only if a cluster is reachable):**
- `kubectl -n esd-lab get deploy,po,cronjob,job,netpol,sa` and confirm
  rollout status, restart counts, and that the watcher pod is Running.
- `make k8s-smoke` (`check_k8s_readings_pipeline.py --base-url ... --mode local`)
  against a port-forwarded dashboard, and `--mode k8s` if in-cluster.

**Failure signatures:** helm lint/template/dry-run errors; missing probes;
`replicaCount:1` + no HPA/PDB under a load mandate; `image.tag: latest`;
missing external secret; lease TTL vs worker timeout mismatch; wildcard RBAC.

**Auto-fix:**
- (AUTO-SAFE, chart edits validated by `helm template`) Add
  `readinessProbe`/`livenessProbe` to both deployments if absent; add an
  optional `HorizontalPodAutoscaler` template (gated by
  `autoscaling.enabled`, default off) and a `PodDisruptionBudget`
  (`minAvailable: 1`); add `values.yaml` knobs for all of them; replace
  `image.tag: latest` default with a pinned placeholder and a comment.
- (PROPOSE) Anything applied to a live cluster (`helm upgrade`, scaling,
  creating the external secret). Provide exact `helm upgrade --install`
  command with `--set` flags and expected rollout output.

**Verify:** `make k8s-helm-lint` succeeds after edits; `helm template`
shows the new probes/HPA/PDB; `kubectl apply --dry-run=client` passes.

# SECTION 6 — Automation, CI/CD, and the data pipeline

**Files:** `.github/workflows/ci.yml`, `deploy-pages.yml`,
`k8s-validate.yml`, `uptime-monitor.yml`, `sync_local_llm.yml`;
`scripts/run_full_pipeline.sh`, `redcap_daily_sync.py`,
`dashboard/pipelines/*`, `docs/auto_update_pipeline.md`,
`config/paths.yml`.

**Check:**
- For each workflow, confirm triggers, that referenced scripts/paths still
  exist, and that required secrets (`CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`, `HF_TOKEN`, `GITHUB_TOKEN`) are declared. The
  `deploy-pages.yml` path filters must include any file whose change
  should trigger a redeploy; list any build input NOT covered by the
  filter (a silent "deploys nothing" trap).
- `uptime-monitor.yml` runs every 15 min, probes the public URL with
  `--max-stamp-age-hours 168`, and on failure fires `repository_dispatch
  redeploy-pages` and opens an issue. Confirm the dispatch event type
  matches the `repository_dispatch` trigger in `deploy-pages.yml`
  (`redeploy-pages`) so the auto-heal loop is actually wired. Confirm the
  168h stamp window is intended (a week-old build still passes freshness).
- Trace the data path in `docs/auto_update_pipeline.md`: nightly
  `redcap_daily_sync.py` → `build_dashboard_data.py` →
  `dashboard/data/dashboard_data.json`; readings watcher →
  `build_readings_index.py` + `build_lab_readings_index.py` →
  `readings_data.json` / `web/lab-readings.json`. Confirm those output
  paths in `config.py` match what the server and SPA read, and that the
  cron entries (referenced as `scripts/crontab.nano`) exist if claimed.
- Run the local test gate the way CI does: `pytest tests/ -q
  --ignore=tests/test_imputation.py`, `black --check`, `flake8`, and on
  the web side `npm --prefix web run lint && npm --prefix web run typecheck
  && npm --prefix web test`.

**Failure signatures:** workflow references a moved script; deploy path
filter misses a real input; dispatch event name mismatch breaks auto-heal;
pipeline output path drift; failing tests/lint/typecheck.

**Auto-fix:** (AUTO-SAFE) correct path filters, fix event-name mismatches,
repair drifted output paths in config, fix lint/format/type errors that
are mechanical. (PROPOSE) anything that changes deploy cadence or secrets.

**Verify:** re-run the full local gate green; show the corrected workflow
YAML; confirm dispatch names match on both ends.

# SECTION 7 — Leak, hygiene, and cost sweep (load-relevant)

**Files / dirs:** `logs/` (many daily logs), `web/` (stray
`vite.config.ts.timestamp-*.mjs` and `vitest.config.ts.timestamp-*.mjs`),
`Dashboard ESD-handoff.tar.gz` (~8.8 MB), `web/dashboard-source.html`
(~3 MB), `dist/`, `web/build/`, `.wrangler/`, `temp/`, `archive/`.

**Check:**
- Disk-growth / log rotation: `logs/` accumulates `__main___*.log` and
  `dashboard_pipelines_build_dashboard_data_*.log` daily with no rotation
  policy visible. Under sustained load this fills the disk and can take
  the server down. Confirm whether anything rotates or prunes them.
- Repo bloat shipped or built: confirm the large tarball and the 3 MB
  `dashboard-source.html` are not being copied into any image or Pages
  artifact (cross-check `.dockerignore` and `build_pages_site.py` copy
  list). Confirm `web/build` stale-asset risk from `emptyOutDir:false`.
- Stray generated config timestamps in `web/` are dead weight; confirm
  they are gitignored and prune them.
- Look for unbounded in-memory growth or missing timeouts in
  `live_dashboard_server.py` request handlers and the presentation-job
  store (`DASHBOARD_PRESENTATION_JOB_*` envs) that would degrade under
  concurrency.

**Auto-fix:** (AUTO-SAFE) add a log-rotation/retention helper or
`logrotate`/cron snippet and a `.gitignore` rule for `web/*.timestamp-*.mjs`;
remove stray timestamp files; confirm large binaries are ignored by image
and Pages builds. (PROPOSE) deleting the committed tarball from history.

**Verify:** show `du -sh logs/` before/after policy; confirm artifacts
exclude large files; `git status` clean of stray timestamp files.

---

# DELIVERABLE — what to produce

1. **`docs/infra_sweep_report_<date>.md`** with:
   - An executive summary in first-person prose (no em dashes) stating, in
     a natural narrative paragraph, what I found about overall health, what
     is most likely to break under added load, and what I changed versus
     what I am proposing. Lead with the verdict on whether the two public
     URLs and the Pages→tunnel→backend chain are currently healthy.
   - A findings table: `ID | Section | Severity | File(s) | Symptom |
     Fix tier | Status (fixed/proposed/verified)`.
   - A "load readiness" subsection answering directly: can this survive a
     traffic increase, and what are the exact bottlenecks (single replica,
     rotating tunnel origin, no HPA, log disk growth).
   - For every `PROPOSE` item, the exact commands and expected output.
2. **A branch** `chore/infra-sweep-<date>` containing only `AUTO-SAFE`
   fixes, each its own commit, each with its verify command output quoted
   in the commit body.
3. **A re-run of the verification gate** at the end: public probes on both
   URLs, `/api/healthz` through the edge, `make docker-health`,
   `make dashboard-smoke`, `make k8s-helm-lint`, and the local test/lint
   gate, with results pasted into the report.

# FINAL VERIFICATION GATE (must pass before you call this done)

```
python scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/ --timeout 25 --min-bytes 8192
python scripts/check_site_health.py --url https://esd-lab-namo.pages.dev/overview --timeout 25 --min-bytes 8192
curl -fsS https://esd-lab-namo.pages.dev/api/healthz
make docker-health
make dashboard-smoke
make k8s-helm-lint
pytest tests/ -q --ignore=tests/test_imputation.py
npm --prefix web run lint && npm --prefix web run typecheck && npm --prefix web test
```

State clearly, in plain first-person prose, which of these passed, which
failed, and for any you could not run (for example, live-cluster or live
Cloudflare-account checks blocked by token scope), say so honestly rather
than implying success. Do not mark the sweep complete while any
`CRITICAL` or `HIGH` finding is unresolved and unproposed.
