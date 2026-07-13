# MASTER PROMPT: REDCap Dashboard Ideas, Tweak Controls, and Production Sync

> **Runtime update (July 2026):** Assistant-specific local-model and `sync_local_llm.yml` references later in this historical prompt are superseded. The supported contract is NVIDIA Nemotron hosted by default, as documented in `NVIDIA.md` and `docs/dashboard_ai_assistant.md`.

## NANO Study · PID 5955 · github.com/namo507/ESD-Lab-USC · the experience and operations layer

**This is the companion to `NANO-REDCap-Integration-Master-Prompt.md` (v2).** v2 built the data spine (pull, PHI scrub, the `redcap_*` JSON contract, the proxy, the auto-grounded assistant). This prompt builds the experience and operations layer on top: creative dashboards, three tiers of tweak controls, trackers and tables, and the synchronization of Docker, Kubernetes, and Cloudflare into one API production pipeline. **Safe to commit:** this file contains no token and no PHI. It may live at `docs/REDCAP_DASHBOARD_IDEAS.md`. The token still lives only in `.env`, `.dev.vars`, GitHub Secrets, Cloudflare env, and the K8s Secret. **Verified against the repo and the live API on 2026-06-24:** 12 events, 56 instruments, 3995 fields. Three runtimes already exist (Cloudflare Pages SPA, Dockerized `dashboard/server/live_dashboard_server.py`, K8s Helm chart `k8s/helm/esd-lab-dashboard`).

---

## 0\. How to use this prompt

Execute it after v2 is merged, because every visualization here reads the `redcap_*` keys v2 writes into `dashboard/data/dashboard_data.json`. Read Sections 1 and 2 before building: they define the runtime topology and the additive contract that keep all three deploy targets identical. Then build the audience surfaces (Section 3), the control tiers (Section 4), and the tables (Section 5), and finally wire the production synchronization (Sections 6 and 7).

Two principles run through everything:

1. One contract, three runtimes. The same `dashboard_data.json` and `config/*.yml` drive the Cloudflare Pages SPA, the Docker container, and the Kubernetes deployment. A reader should not be able to tell which runtime served a page. Any feature that renders differently across runtimes is a bug.  
2. Controls are typed by blast radius. A "tweak control" can tune the pipeline (config, GitOps, safe), explore data (client-side, read-only, safe), or write back to REDCap (server-side, audited, gated). These three tiers never share a code path. Section 4 keeps them strictly separated.

---

## 1\. Objective

**Build a deeply integrated REDCap experience across the live dashboards: audience-specific visual surfaces, three safe tiers of interactive control, and rich tables and trackers, all served identically by the Cloudflare Pages SPA, the Docker container, and the Kubernetes deployment, and kept fresh by one synchronized API production pipeline.**

Outcomes that define done:

- Four audience surfaces (coordinator ops, PI and exec, public showcase, engineering and pipeline health) each render REDCap signal from the shared payload, reusing the existing component library so the visual language is consistent.  
- Three control tiers exist and are isolated: pipeline-tuning knobs (config), read-only what-if and filters (client), and audited REDCap write-back (server only).  
- Docker, Kubernetes, and Cloudflare read the same config and data, deploy from the same CI, and stay in sync through the existing `PAGES_DEPLOY_HOOK_URL` bridge and the reconcile worker.  
- A single data refresh propagates to all runtimes, the assistant grounding, and every visualization with no manual step.

---

## 2\. Runtime topology and the additive contract

### 2.1 The three runtimes (all real, all must stay identical)

| Runtime | Entry point (real) | Serves | Role |
| :---- | :---- | :---- | :---- |
| Cloudflare Pages | `web/dist` SPA \+ `functions/api/redcap.js` | The public site `esd-lab-namo.pages.dev` | Canonical public production |
| Docker | `docker/dashboard/Dockerfile` runs `dashboard/server/live_dashboard_server.py` on `:8080`, healthcheck `/api/healthz`, optional `cloudflared` tunnel sidecar | Self-hosted live server with `/api/*` | Lab-hosted and share-tunnel production |
| Kubernetes | `k8s/helm/esd-lab-dashboard` (deployment-dashboard, deployment-watcher, cronjob-reconcile, hpa, pdb, networkpolicy) runs the same server | Cluster-hosted with autoscale and reconcile | Scaled production with self-healing |

The Docker and K8s runtimes serve a Python API (`live_dashboard_server.py`) that already exposes REDCap rows (`dashboard/server/data_features.py::redcap_event_rows`, `virtual_table_rows`, `query_virtual_table`, and a legacy `_legacy_redcap_events`). The Cloudflare runtime serves the static SPA plus the edge proxy. The job of this prompt is to make these surfaces show the same REDCap views from the same data.

### 2.2 The additive contract (extend v2, do not fork)

v2 defined `redcap_meta`, `redcap_completion_stats`, and `redcap_visit_health`. Add three more top-level keys to the same `dashboard_data.json`, plus a separate small controls file. Keeping data and controls in version control is what makes every runtime agree.

```
{
  // ... v2 keys stay ...
  "redcap_trackers": {
    "enrollment": [ { "event": "1_month_arm_1", "label": "1m", "expected": 0, "scheduled": 0, "completed": 0 } ],
    "instrument_completeness": [ { "instrument": "csbs_caregiver", "label": "CSBS Caregiver", "byEvent": { "6_months_arm_1": {"complete":0,"total":0} } } ],
    "queue_funnel": [ { "stage": "sent", "count": 0 }, { "stage": "started", "count": 0 }, { "stage": "complete", "count": 0 } ]
  },
  "redcap_timeline": {
    "records": [ { "recordId": "NANO-1A2B3C4D", "events": [ { "event": "6_months_arm_1", "visitDate": "", "status": "2" } ] } ]
  },
  "redcap_ops": {
    "freshness": { "generated_at": "", "age_hours": 0.0, "source": "redcap-api" },
    "runtime_parity": { "pages": "", "docker": "", "k8s": "" },   // content hashes per runtime
    "run_ledger": [ { "run_id": "", "started_at": "", "status": "ok", "records": 0, "anomalies": 0 } ]
  }
}
```

```
// config/dashboard_controls.json  (Tier-1 knobs; GitOps-edited, read by all runtimes)
{
  "anomaly_thresholds": { "stale_visit_days": 30, "completeness_warn_pct": 0.80 },
  "sync": { "cadence_cron": "0 8 * * *", "chunk_size": 500 },
  "assistant": { "model_tier": "balanced", "max_fragments": 25 },
  "feature_flags": { "redcap.visitHealth": true, "redcap.whatif": true, "redcap.writeback": false }
}
```

Symmetry rule carried from v2: the only human-edited sources are `config/redcap_config.yml` and `config/dashboard_controls.json`. The Python builder (`build_dashboard_data.py`) and the R builder produce the new keys identically; the K8s reconcile worker and the Docker server read the same files; the Cloudflare SPA reads the committed JSON. Nothing is hand-duplicated per runtime.

---

## 3\. Creative visualization and dashboard ideas (by audience)

Each idea names the real component to reuse or extend, the JSON keys it reads, and the route it lives on. Reuse beats invention: the repo already ships `components/insights`, `charts`, `warm`, `pipeline`, `timeline`, `comparison`, `dyn`, and `primitives`. Build new REDCap meaning out of those parts so the look stays unified.

### 3.A Coordinator Ops Monitor (route: extend `web/src/routes/Redcap.tsx`)

The daily driver for the study coordinator. Optimized for triage: what needs action today.

1. Carry-Forward Anomaly Board. A triage board of records flagged R1 to R5, highest risk first. Reuse `components/pipeline/PipelineKanban.tsx` with columns "Active risk (R1/R2/R5)", "Historical shift (R3/R4)", "Cleared". Each card is a hashed record with its event cells and the plain-English anomaly meaning. Reads `redcap_visit_health`. Clicking a card opens `components/pipeline/StageDrawer.tsx` with the 6/9/12/24m detail.  
2. Visit Swimlane Timeline. One lane per record, dots per event colored by `_complete` status, a vertical "today" marker, and a red link where a carry-forward risk spans two events. Reuse `components/timeline/SwimLane.tsx` \+ `TimelineAxis.tsx` \+ `EventMark.tsx`. Reads `redcap_timeline`. This is the single most legible way to see carry-forward visually.  
3. Instrument Completeness Heatwall. Rows are the key instruments (CSBS, EPDS, Medication, ASQ, Vineland), columns are the 12 events, cells are completeness percent with the status color tokens. Reuse the heatmap pattern from `routes/ThermalHeatmap.tsx` or `AttachmentHeatmap.tsx`. Reads `redcap_trackers.instrument_completeness`. Hovering a cell shows complete/total and a "jump to REDCap record" deep link.  
4. Open-Action Counter Strip. A row of `components/warm/Counter.tsx` \+ `MetricCard.tsx` tiles: anomalies now, visits missing dates, instruments unverified, records past the stale-visit threshold. Reads `redcap_meta` and `redcap_trackers`. The threshold is the Tier-1 knob from `dashboard_controls.json`, so the counters move when the coordinator tunes it.

### 3.B PI and Executive Overview (route: extend `web/src/routes/ExecutiveMode.tsx` and `Overview.tsx`)

For leadership: enrollment, retention, milestones, study health at a glance.

5. Enrollment vs Target Cumulative Curve. Cumulative completed visits per event against an expected line. Reuse `components/insights/CumulativeCurve.tsx` and `charts/EnrollmentBar.tsx`. Reads `redcap_trackers.enrollment`. Annotate where actual diverges from expected by more than the warn threshold.  
6. Milestone Funnel by Event. A funnel from "scheduled" to "visit occurred" to "instruments complete" to "QC clean", per event, so attrition points are obvious. Reuse `routes/AttritionFunnel.tsx` \+ `components/pipeline/PipelineSankey.tsx`. Reads `redcap_trackers.queue_funnel`.  
7. Study Health Scorecard. A single composite tile: data freshness, completeness percent, anomaly rate, and double-entry mismatch rate, each as a sparkline trend (`components/warm/AreaSparkline.tsx` \+ `primitives/KPI.tsx`). Reads `redcap_ops` \+ `redcap_meta`. Color the card green/amber/red from the same thresholds the coordinator view uses, so the PI and the coordinator never see contradictory health.  
8. Cohort Comparator (mirrored). If cohorts are defined PHI-free (for example by enrollment quarter), compare completeness or retention side by side with `components/comparison/MirroredBarChart.tsx` \+ `CountyCard.tsx`. Reads `redcap_completion_stats` sliced by cohort.

### 3.C Public Showcase (route: extend `web/src/routes/PublicInsights.tsx`)

Polished, fully PHI-free, safe for any viewer. Aggregate only, never per-record.

9. CDC-Style Completeness Ribbon. A clean editorial line of completeness over the visit schedule, in the house style. Reuse `components/insights/CdcStyleLine.tsx` inside `InsightSection.tsx`. Reads aggregate `redcap_completion_stats` only.  
10. "Where the study is" Geo Tiles. If site or county is available PHI-free at aggregate counts, a calm map. Reuse `components/warm/ReadingsGeoMap.tsx`. Reads an aggregate-only `redcap_trackers` slice. Suppress any cell with a small count to protect privacy (Section 8 has the small-cell rule).  
11. Animated Enrollment Story. A gentle auto-playing build of the cumulative curve with `components/warm/Typewriter.tsx` captions, suitable for a lobby screen or a grant figure. Reads the same aggregate keys, so it can never leak detail the static tiles do not already show.

### 3.D Engineering and Pipeline Health (route: new `web/src/routes/PipelineHealth.tsx`, add to `App.tsx`)

For whoever runs the pipeline: is data fresh, are the three runtimes in sync, did the last reconcile pass.

12. Tri-Runtime Parity Panel. Three badges (Pages, Docker, K8s) showing the content hash and generated-at of the payload each runtime is serving, green when all three match, red when one drifts. Reuse `components/cluster/ClusterOpsPanel.tsx` \+ `warm/StatusPill.tsx`. Reads `redcap_ops.runtime_parity`. This is the visual proof of "everything is synced."  
13. Live Pipeline DAG. The sync stages (pull, scrub, build, context regen, assistant reindex, deploy) as an animated DAG that lights up as a run proceeds. Reuse `components/pipeline/PipelineDAG.tsx` or `warm/AnimatedDAG.tsx`. Reads `redcap_ops.run_ledger` and, on the Docker and K8s runtimes, the live `/api/healthz` and reconcile status.  
14. Run Ledger Table with Freshness Gauge. A sortable history of sync runs (id, start, status, records, anomalies, duration) plus a "data age" gauge that turns amber past the freshness SLA. Reuse `components/dyn/RouteDataTable.tsx` \+ `warm/MetricCard.tsx`. Reads `redcap_ops.run_ledger`; on live runtimes it can also poll the existing `k8s/pipeline/freshness.py` and `observability.py` signals.  
15. Reconcile and Autoscale Strip. On the K8s runtime, show replica count, HPA target, last reconcile lease holder, and PodDisruptionBudget state, so an operator can confirm self-healing. Reads the cluster via the existing `k8s/pipeline/k8s_api.py` exposed through a read-only `/api/ops` endpoint on `live_dashboard_server.py`.

Discoverability: register the new `/pipeline-health` route and add all REDCap surfaces to the sidebar (`components/shell/Sidebar.tsx`) behind the `redcap.*` feature flags, so they can ship dark and flip on per audience.

---

## 4\. Tweak controls, three isolated tiers

You asked for all three. They are powerful in different ways and dangerous in different ways, so they must never share a code path. The rule: blast radius determines where the control runs.

### 4.1 Tier 1, Pipeline tuning knobs (GitOps, safe, affects future runs)

What it tunes: anomaly thresholds, sync cadence, chunk size, assistant model tier and fragment cap, feature flags. Source of truth: `config/dashboard_controls.json` (Section 2.2).

Two ways to edit, same destination:

- GitOps (default): edit the JSON, open a PR, merge. CI validates and redeploys. This is auditable and reversible by design.  
- In-app Control Panel (optional, gated): a `/pipeline-health` panel of sliders and selects (reuse `components/primitives/Segmented.tsx` and `Button.tsx`) that does not write to REDCap and does not mutate data. On the Docker and K8s runtimes it can `POST /api/controls` to write `dashboard_controls.json` on the server volume, guarded by an operator token, then trigger a rebuild. On Cloudflare Pages (read-only static) the panel renders the current values and a "Propose change" button that opens a prefilled GitHub PR via deep link, never a live write.

Effect path: a knob change rebuilds `dashboard_data.json` with new thresholds, which moves every counter, color, and the assistant's answers at once. The knob is the lever; the payload is the propagation.

### 4.2 Tier 2, Read-only what-if and filters (client-side, safe, never leaves the browser)

What it does: recompute the current view in memory. No server call, no REDCap call, no persisted state beyond the URL.

- Threshold what-if slider: drag the stale-visit days or completeness warn percent and watch the anomaly board and scorecard recolor instantly, computed client-side from the already-loaded payload. This previews a Tier-1 change before anyone commits it. Reuse a controlled slider feeding a `useMemo` recompute.  
- Cohort and event filters: filter the visit table and charts by event, status, anomaly code, or cohort. Reuse `web/src/hooks/useStickyTableState.ts` (already in the repo) so filter state survives navigation and is shareable by URL.  
- Projection simulator: "if completion continues at the trailing 4-week rate, when does each event reach 80 percent?" A pure client extrapolation drawn over the cumulative curve, clearly labeled as a projection, never written anywhere.

Guard: Tier 2 controls are visually distinct (a "what-if" badge) so no one mistakes a simulated view for committed data. They never call `/api/redcap`.

### 4.3 Tier 3, Audited REDCap write-back (server-side only, gated, narrow)

What it does: write a small, allowlisted set of values back to REDCap, specifically visit dates and `SKIP` missing-data codes, as part of fixing the carry-forward problem. This is the only tier that mutates the source system.

Hard rules:

- Server-side only. Writes run through `redcap/api/redcap_push.py` under the audited token on the Docker or K8s runtime. The browser never holds the token. The Cloudflare edge proxy (`functions/api/redcap.js`) already refuses `action=import` per v2, so writes cannot originate at the edge.  
- Allowlist of fields: `visit_date` and the specific `*_complete` SKIP set only. Reject anything else server-side.  
- Two-key gate: a write requires an authenticated coordinator session plus an explicit confirm step. Reuse a confirm dialog; never one-click write.  
- Full audit: every write appends to `redcap_ops.run_ledger` and a server audit log (`redcap/api/redcap_audit.py` exists) with who, what, old value, new value, timestamp. Surface the audit trail in the UI.  
- Optimistic UI, authoritative refetch: after a write, refetch from REDCap and reconcile, so the dashboard shows REDCap truth, not a hopeful local guess.

Endpoint shape (Docker and K8s server, not Cloudflare):

```
POST /api/redcap/writeback        # body: { recordId, event, field, value, reason }
  -> validate field in allowlist
  -> require coordinator auth + confirm token
  -> redcap_push.import_value(...)        # audited
  -> append redcap_ops.run_ledger entry
  -> trigger payload rebuild + Pages deploy hook
  -> return { ok, newValue, auditId }
```

If you keep Tier 3 disabled at first (`feature_flags["redcap.writeback"] = false`), the coordinator board can still surface "this needs a visit date" as a task that deep-links into REDCap's own data entry screen, getting most of the value with none of the write risk. Turn Tier 3 on once the audit and auth are proven.

---

## 5\. Tables, trackers, and the query layer

The repo already has a virtual-table engine: `dashboard/server/data_features.py` exposes `redcap_event_rows`, `virtual_table_rows`, and `query_virtual_table`, and the SPA has `routes/DataExplorer.tsx` and `components/dyn/RouteDataTable.tsx`. Build the tables on those, do not add a grid library.

1. REDCap Records Grid. A sortable, filterable, paginated grid: record, event, visit date, per-instrument status chips, anomaly flags, QC status. Server-backed via `query_virtual_table` on Docker and K8s; on Cloudflare it reads the committed `redcap_visit_health` slice. Reuse `RouteDataTable.tsx` and the sticky-state hook. Column visibility and sort persist by URL.  
2. Completeness Tracker. A live tracker per instrument and event with complete/total and a trend arrow versus last sync. Reuse `components/warm/MetricCard.tsx` \+ `AreaSparkline.tsx`. Reads `redcap_trackers.instrument_completeness`.  
3. Queue Tracker. The survey queue funnel (sent, started, complete) per event from the `questionnaires_to_send` form's `send_*` fields, so coordinators see who was invited but has not started. Reuse `PipelineSankey.tsx`. Reads `redcap_trackers.queue_funnel`.  
4. Export buttons. Every table offers CSV and a deep link to the REDCap record. The CSV is generated from the already-loaded PHI-free slice, so a public viewer can only ever export aggregate, never identifiers.

Consistency check: the grid, the trackers, and the charts must all derive from the same `useRedcapData()` hook introduced in v2 Section 8\. One fetch, one set of numbers, every surface agrees. If a table shows 14 complete and a chart shows 13, the fetch was duplicated; collapse it.

---

## 6\. Production pipeline: one flow, three deploy targets

This is the "seamlessly integrated into the API production pipeline" requirement. The goal is a single logical pipeline whose output lands identically on Cloudflare, Docker, and Kubernetes. Below is how each runtime consumes the same artifacts and how they are kept in lockstep.

### 6.1 The single pipeline (already partly built, complete it)

```
REDCap API (PID 5955)
   │  redcap/api/redcap_pull.py            (chunked, HMAC hash, PHI drop)
   ▼
dashboard/pipelines/build_dashboard_data.py (+ .R)   writes redcap_* + trackers + timeline + ops
   │
   ├─► commit dashboard/data/dashboard_data.json        (GitOps artifact)
   ├─► dashboard/context_skill/extract_context.py --emit (assistant knowledge)
   └─► scripts/prepare_dashboard_assistant.py --reindex  (assistant grounding)
   │
   ▼  the SAME artifact is consumed three ways
   ├─ Cloudflare Pages:  committed JSON shipped in web/dist, edge proxy for live reads
   ├─ Docker:            live_dashboard_server.py reads dashboard/data, serves /api/*
   └─ Kubernetes:        same server in a Deployment; CronJob reconcile refreshes; watcher hits the Pages deploy hook
```

The Makefile already orchestrates the pieces: `make redcap-sync`, `make run-pipeline`, `make dashboard-refresh`, `make pages-deploy`, `make dashboard-up`, `make k8s-helm-lint`, `make k8s-smoke`. Add one target `make redcap-publish` that runs pull, build, context emit, reindex, then fans out to all three deploy targets, so a human or CI has a single command.

### 6.2 Cloudflare sync

- Static \+ edge: the committed `dashboard_data.json` ships inside `web/dist`; live reads use `functions/api/redcap.js` (read-only, from v2). The deploy workflow `.github/workflows/deploy-pages.yml` runs `scripts/gen_redcap_constants.mjs`, builds, and publishes.  
- Env parity: Cloudflare Pages env holds `REDCAP_API_TOKEN` and `REDCAP_API_URL`. The Docker and K8s runtimes read the same names from `.env` / the K8s Secret, so no runtime has a credential the others lack.  
- Deploy hook bridge: the Helm deployment already wires `PAGES_DEPLOY_HOOK_URL` (a Cloudflare Pages deploy hook) as an optional secret. Use it: when the K8s reconcile worker produces a fresh payload, it POSTs the hook to trigger a Pages rebuild, so the cluster and the public site never drift. Document the hook in `k8s/helm/esd-lab-dashboard/values.yaml` and the Pages dashboard.

### 6.3 Docker sync

- Same image, same server: `docker/dashboard/Dockerfile` builds the SPA and runs `live_dashboard_server.py` on `:8080` with `/api/healthz`. Keep the REDCap routes (`/api/redcap/*`, `/api/controls`, `/api/redcap/writeback`) inside this one server so Docker and K8s expose an identical API.  
- Compose profiles: `docker/compose.prod.yml` and `compose.dev.yml` already define the dashboard plus `cloudflared` tunnel sidecars (`profiles: ["share"]`). The named tunnel uses `CLOUDFLARE_TUNNEL_TOKEN`. Add a documented note that the tunnel exposes the same `/api` surface the Pages proxy fronts, so a shared Docker instance and the public site behave the same.  
- Volumes: prod mounts `../dashboard/data:/app/dashboard/data`. The sync pipeline writes there, so a `make redcap-publish` on the host refreshes the container without a rebuild. Keep the healthcheck asserting `dashboard` and `readings` are present so a bad payload fails the container rather than serving blanks.

### 6.4 Kubernetes sync

- Same command, scaled: `k8s/helm/esd-lab-dashboard/templates/deployment-dashboard.yaml` runs the same server. The chart also ships `deployment-watcher.yaml`, `cronjob-reconcile.yaml`, `hpa.yaml`, `pdb.yaml`, and `networkpolicy.yaml`. The reconcile CronJob is where the nightly REDCap refresh runs inside the cluster, using the leader-elected worker in `k8s/pipeline/` (`worker.py`, `lease.py`, `ledger.py`, `freshness.py`, `observability.py`).  
- Secrets and config: put `REDCAP_API_URL`, `REDCAP_API_TOKEN`, `PARTICIPANT_ID_SALT`, and `PAGES_DEPLOY_HOOK_URL` in the chart `secret.yaml`; put thresholds and cadence in `configmap.yaml` sourced from `config/dashboard_controls.json`. The deployment already `envFrom` the configmap and reads `PAGES_DEPLOY_HOOK_URL` from the secret, so this is wiring, not new architecture.  
- Observability into the dashboard: expose the existing `k8s/pipeline/observability.py` and `freshness.py` signals through a read-only `/api/ops` endpoint so the Pipeline Health surface (Section 3.D) can show reconcile status, lease holder, and data age live.  
- Parity hash: the reconcile worker writes `redcap_ops.runtime_parity.k8s` with the payload content hash; the Docker server and the Pages build write their own. The Tri-Runtime Parity Panel turns red if any two differ, giving you a visible guarantee that the three runtimes are synced.

### 6.5 CI workflow alignment (real files)

`.github/workflows/` already contains `ci.yml`, `redcap_sync.yml`, `deploy-pages.yml`, `daily-health-sweep.yml`, `uptime-monitor.yml`, `sync_local_llm.yml`, and `k8s-validate.yml`. Align them, do not add parallel ones:

| Workflow | Add or confirm |
| :---- | :---- |
| `redcap_sync.yml` | Runs pull, build (with new keys), context emit, reindex; commits the artifact; POSTs the Pages deploy hook |
| `deploy-pages.yml` | Generates TS constants, fails on drift, builds, deploys to `esd-lab-namo` |
| `k8s-validate.yml` | `helm lint` \+ template render so chart changes (new secret keys, configmap) are caught before merge |
| `ci.yml` | Runs the web test suite \+ the new parity, PHI, and writeback-allowlist tests |
| `daily-health-sweep.yml` / `uptime-monitor.yml` | Probe `/redcap`, `/pipeline-health`, and `/api/healthz` across the public site so a runtime drift pages someone |

---

## 7\. Automation and self-propagation (update once, everything follows)

The whole point is that you change one thing and the system carries it everywhere. Two triggers, one fan-out:

| You change | What propagates automatically |
| :---- | :---- |
| REDCap data (nightly cron, manual dispatch, or a Data Entry Trigger) | `dashboard_data.json` rebuilt with `redcap_*` \+ trackers \+ timeline \+ ops; context skill re-emitted; assistant reindexed; committed; Pages redeploys; Docker volume refreshed; K8s reconcile updates and POSTs the deploy hook |
| A Tier-1 knob in `config/dashboard_controls.json` | Thresholds and flags reread by the next build; counters, colors, the scorecard, and the assistant's answers all shift; CI redeploys all runtimes |
| A `config/redcap_config.yml` edit (events, instruments) | TS constants regenerate, parity test guards drift, builders and assistant pick it up, every runtime rebuilds |

Assistant stays in step for free: because the Buddy and Ask AI ground on `dashboard_data.json` and the context skill (v2 Section 7), the new trackers, timeline, and ops keys become answerable the moment they are written. Add the new keys to the assistant's REDCap retrieval section so questions like "which event is furthest behind target?" or "are all three runtimes in sync?" resolve from `redcap_trackers` and `redcap_ops`. Extend the freshness block to carry `redcap_ops.freshness` so the Buddy can say how old the data is on the runtime the user is viewing.

Visualizations stay in step for free: every tile reads the committed payload through `useRedcapData()`, so a redeploy is the only step, and CI does that. No per-chart data wiring ever.

---

## 8\. Constraints, non-goals, and security

Hard constraints:

- Runtime parity is a feature, not a nice-to-have. The same payload and config drive all three runtimes. A test compares the content hash served by Pages, Docker, and K8s and fails on mismatch.  
- PHI never reaches any browser surface. Record IDs are HMAC-hashed; `phi_fields` are dropped before the JSON is written; the public showcase is aggregate only.  
- Small-cell suppression on public surfaces: any public aggregate with a count below a threshold (suggest 5\) renders as "fewer than 5" rather than the number, so geography or cohort tiles cannot re-identify.  
- The token lives only server-side and in encrypted stores. The edge proxy is read-only. Writes (Tier 3\) run only on the Docker and K8s servers under audit.  
- The three control tiers never share a code path. Tier 2 cannot call `/api/redcap`. Tier 3 cannot run at the edge.  
- Reuse the design system. No new charting or grid library; build from `insights`, `charts`, `warm`, `pipeline`, `timeline`, `dyn`, `primitives`. Colors come from `web/src/styles/tokens.css`.

Non-goals:

- No per-record detail on the public showcase.  
- No browser-held token, ever.  
- No new database; the existing SQLite feature DB and the JSON payload are sufficient.  
- No fork of the data contract per runtime.

---

## 9\. Success criteria and acceptance tests

The build is done when all pass:

1. Audience surfaces render: coordinator board, PI scorecard, public ribbon, and pipeline-health parity panel all show REDCap signal from the shared payload, in the house style, in light and dark mode.  
2. Tier isolation: a static analysis or test confirms Tier 2 components import no network client, and the writeback endpoint rejects any field outside the allowlist and any unauthenticated caller (HTTP 403).  
3. Runtime parity: `redcap_ops.runtime_parity` hashes match across Pages, Docker, and K8s after a sync; the parity panel is green; flipping one payload turns it red.  
4. One-command publish: `make redcap-publish` pulls, builds, emits context, reindexes, and updates all three targets; `helm lint` and `k8s-smoke` pass; `docker-health` passes; the public smoke test on `/redcap` and `/pipeline-health` passes.  
5. Controls work and stay safe: a Tier-1 knob change moves the counters after rebuild; a Tier-2 what-if slider recolors instantly with no network call; a Tier-3 writeback (in a test project) appends an audit entry and refetches REDCap truth.  
6. Assistant awareness: the Buddy answers "which event is furthest behind target?" from `redcap_trackers` and "is the data fresh?" from `redcap_ops.freshness`, with a `redcap.*` citation.  
7. PHI and privacy: the PHI scrub test covers the new keys; a public-surface test asserts small-cell suppression.

High-stakes verification: run the full `web/src/test` suite plus the new parity, tier-isolation, writeback-allowlist, and small-cell tests. Consider a dedicated review pass that greps every committed artifact for the token and for any `phi_fields` value before merge.

---

## 10\. Edge cases and fallbacks

- A runtime is mid-deploy and serves a stale hash: the parity panel shows amber "syncing", not red, for a grace window equal to the deploy SLA.  
- REDCap unreachable during a K8s reconcile: keep the last good payload, mark `redcap_ops.freshness.source = "synthetic-fallback"`, do not POST the deploy hook, and alert.  
- Tier-3 write succeeds at REDCap but the refetch fails: show the optimistic value with a "pending confirmation" badge and retry the refetch; never silently assume success.  
- Deploy hook missing or rotated: the cluster keeps serving correctly and logs that Pages was not refreshed, so K8s never blocks on Cloudflare.  
- Knob set to an unsafe value (for example chunk\_size too large causing USC timeouts): validate ranges in `config/dashboard_controls.json` on load and clamp with a logged warning.  
- Public viewer on a slow link: charts render the committed JSON immediately; live `/api` enhancements are best-effort and never block first paint.

---

## 11\. Variables for reusability

```
{audience}        ∈ {coordinator_ops, pi_exec, public_showcase, pipeline_health}
{control_tier}    ∈ {tier1_knobs, tier2_whatif, tier3_writeback}
{runtime}         ∈ {cloudflare_pages, docker, kubernetes}
{freshness_sla_h} = 48           # data-age amber threshold
{small_cell_min}  = 5            # public suppression floor
{writeback}       ∈ {enabled, disabled}   # default disabled until audit proven
```

---

## 12\. Ordered execution checklist

```
□ Confirm v2 is merged (redcap_* keys exist in dashboard_data.json)
□ Add redcap_trackers, redcap_timeline, redcap_ops to build_dashboard_data.py (+ .R)
□ Create config/dashboard_controls.json + range validation; read it in the builders
□ Build audience surfaces: extend Redcap.tsx, ExecutiveMode.tsx/Overview.tsx, PublicInsights.tsx; add PipelineHealth.tsx + route + sidebar
□ Implement Tier 1 knobs (GitOps + optional /api/controls on Docker/K8s)
□ Implement Tier 2 what-if/filters (client-only, useMemo, sticky URL state)
□ Implement Tier 3 writeback (/api/redcap/writeback, allowlist, auth, confirm, audit) behind a flag
□ Build tables on query_virtual_table + RouteDataTable; wire CSV + REDCap deep links
□ Add /api/ops to live_dashboard_server.py exposing freshness + reconcile + parity hash
□ Wire the PAGES_DEPLOY_HOOK_URL bridge in the K8s reconcile worker
□ Align CI: redcap_sync, deploy-pages, k8s-validate, ci, daily-health-sweep, uptime-monitor
□ Add make redcap-publish (pull -> build -> emit -> reindex -> fan out to 3 targets)
□ Add tests: runtime parity, tier isolation, writeback allowlist, small-cell suppression, PHI scrub
□ make redcap-publish; helm lint; k8s-smoke; docker-health; public smoke on /redcap and /pipeline-health
□ Ask the Buddy a trackers question and an ops question; confirm grounded answers
```

---

## 13\. Appendix: real file and surface map

```
config/dashboard_controls.json                 CREATE  Tier-1 knobs (GitOps)
config/redcap_config.yml                        REUSE   canonical contract (v2)
dashboard/pipelines/build_dashboard_data.py/.R  EXTEND  + trackers, timeline, ops keys
dashboard/server/live_dashboard_server.py       EXTEND  /api/controls, /api/redcap/writeback, /api/ops
dashboard/server/data_features.py               REUSE   redcap_event_rows, query_virtual_table
redcap/api/redcap_push.py + redcap_audit.py     REUSE   audited Tier-3 writes
web/src/routes/Redcap.tsx                        EXTEND  coordinator board, swimlane, heatwall
web/src/routes/ExecutiveMode.tsx, Overview.tsx   EXTEND  PI scorecard, funnel, cumulative curve
web/src/routes/PublicInsights.tsx                EXTEND  public ribbon, geo tiles (small-cell safe)
web/src/routes/PipelineHealth.tsx                CREATE  parity panel, live DAG, run ledger
web/src/components/{insights,charts,warm,pipeline,timeline,dyn,comparison}  REUSE  building blocks
docker/dashboard/Dockerfile, compose.*.yml       REUSE   same server, tunnel sidecars
k8s/helm/esd-lab-dashboard/*                      EXTEND  secret keys, configmap from controls, deploy-hook
k8s/pipeline/{worker,watcher,freshness,observability}.py  REUSE  reconcile + ops signals
.github/workflows/{redcap_sync,deploy-pages,k8s-validate,ci,uptime-monitor}.yml  ALIGN
Makefile                                          ADD     redcap-publish fan-out target
```

| Surface | Route | Audience |
| :---- | :---- | :---- |
| Coordinator ops monitor | `/redcap` | Coordinators |
| PI and exec overview | `/executive`, `/overview` | Leadership |
| Public showcase | `/public-insights` | Public |
| Pipeline health | `/pipeline-health` | Engineering and ops |

---

*Companion to the v2 integration prompt. Verified against the live PID 5955 structure and the actual repository (Docker, Helm, server, workflows) on 2026-06-24. Token-free and PHI-free: safe to commit at `docs/`. ESD Lab USC, Namit Shrivastava ([namit507@sc.edu](mailto:namit507@sc.edu)).*  
