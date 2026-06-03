# Kubernetes Event Pipeline and Cluster Observability

## Architecture

Kubernetes mode is additive. The canonical runtime remains
`dashboard/server/live_dashboard_server.py`; local Docker and host-mode polling
continue to work with `K8S_MODE_ENABLED=false`.

In cluster mode:

1. The dashboard Deployment serves the React SPA and read-only API endpoints.
2. The readings watcher Deployment observes the mounted `ESD Lab readings/`
   RWX volume and debounces add/update/delete events.
3. The watcher records a safe event in
   `dashboard/data/readings_pipeline_events.jsonl` and creates one Kubernetes
   Job for the collapsed event batch.
4. The worker Job obtains a shared file lease, runs
   `dashboard/pipelines/build_readings_index.py`, then
   `scripts/build_lab_readings_index.py`, and updates
   `readings_pipeline_status.json`.
5. The dashboard reads the same ledger/status files for `/api/cluster/*`,
   `/api/readings/*`, and assistant freshness.
6. A CronJob runs scheduled reconcile as a fallback for missed filesystem
   events.

The chart expects existing RWX PVCs for readings and dashboard data. It never
ships readings inside the image and never hardcodes secrets.

## API Surfaces

- `GET /api/cluster/topology` returns mode, health, components, and topology
  edges. Local mode returns a clearly labeled simulated topology.
- `GET /api/cluster/pipeline` returns state, queue depth, last success/failure,
  latest event records, and readings freshness.
- `GET /api/readings/freshness` returns last indexed timestamp, counts, payload
  versions, and pending failed/poisoned warnings.
- `GET /api/readings/library` returns the browser-facing readings index.
- `GET /api/assistant/freshness` mirrors assistant grounding freshness.

`/api/healthz` keeps its existing status rules. Kubernetes context appears only
as a nested optional block.

## HIPAA Safety

The event ledger stores readings-relative paths only, never absolute host paths.
Path tokens that look like MRNs, DOBs, SSNs, or study IDs are redacted before
they enter public API payloads. The readings index remains metadata-only and
does not expose full PDF text.

## Deploy

```bash
helm lint k8s/helm/esd-lab-dashboard
helm template esd-lab-dashboard k8s/helm/esd-lab-dashboard \
  --namespace esd-lab \
  --set existingClaims.readings=esd-readings-rwx \
  --set existingClaims.data=esd-dashboard-data-rwx \
  > /tmp/esd-lab-dashboard.yaml
kubectl apply --dry-run=server -f /tmp/esd-lab-dashboard.yaml
helm upgrade --install esd-lab-dashboard k8s/helm/esd-lab-dashboard \
  --namespace esd-lab --create-namespace \
  --set existingClaims.readings=esd-readings-rwx \
  --set existingClaims.data=esd-dashboard-data-rwx
```

Optional Pages publication uses the `PAGES_DEPLOY_HOOK_URL` Secret key. Without
that Secret, the worker still writes `web_package_trigger.json`; the existing
Pages pipeline remains unchanged.

## Rollback

```bash
helm rollback esd-lab-dashboard <revision>
kubectl -n esd-lab scale deploy/esd-lab-dashboard-watcher --replicas=0
kubectl -n esd-lab patch cronjob esd-lab-dashboard-readings-reconcile \
  -p '{"spec":{"suspend":true}}'
```

To fully return to local behavior, set `K8S_MODE_ENABLED=false` and keep using
the current Docker/host runtime commands.
