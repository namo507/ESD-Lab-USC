# Kubernetes Readings Pipeline Runbook

## Watcher Down

Symptoms:

- `/api/cluster/topology` shows the watcher Deployment unavailable.
- New readings do not create new pipeline events.

Checks:

```bash
kubectl -n esd-lab get deploy,pod -l app.kubernetes.io/component=readings-watcher
kubectl -n esd-lab logs deploy/esd-lab-dashboard-watcher --tail=200
kubectl -n esd-lab get cronjob esd-lab-dashboard-readings-reconcile
```

Recovery:

1. Restart the watcher Deployment.
2. Run a one-time reconcile Job or wait for the CronJob.
3. Confirm `/api/cluster/pipeline` shows a recent successful event.

## Stuck Or Duplicate Jobs

Symptoms:

- Pipeline state is `locked`.
- Jobs remain active after the expected index duration.

Checks:

```bash
kubectl -n esd-lab get jobs -l app.kubernetes.io/component=readings-pipeline-worker
kubectl -n esd-lab logs job/<job-name>
kubectl -n esd-lab exec deploy/esd-lab-dashboard -- cat /app/dashboard/data/readings_pipeline.lock
```

Recovery:

1. Delete only clearly stale worker Jobs.
2. Remove the lock file only after confirming the owning pod/job is gone.
3. Trigger scheduled reconcile.

## Stale Index

Symptoms:

- `/api/readings/freshness` shows an old `last_indexed_at`.
- Readings count differs from the mounted folder.

Recovery:

```bash
kubectl -n esd-lab create job --from=cronjob/esd-lab-dashboard-readings-reconcile readings-reconcile-manual
kubectl -n esd-lab logs job/readings-reconcile-manual -f
```

Then confirm:

```bash
curl -fsS https://<dashboard-host>/api/readings/freshness
curl -fsS https://<dashboard-host>/api/assistant/status
```

## Assistant Freshness Mismatch

Symptoms:

- `/api/readings/freshness` is current.
- `/api/assistant/status` shows older readings metadata.

Recovery:

1. Check that the dashboard pod mounts the same data PVC as the worker.
2. Restart the dashboard Deployment to clear any in-process JSON cache.
3. Ask the assistant, "how many readings are indexed?" and compare to
   `/api/readings/freshness.total_indexed`.

## Poisoned Events

Symptoms:

- `/api/cluster/pipeline` includes event status `poisoned`.
- Freshness warnings are visible in the overview panel.

Recovery:

1. Inspect the worker Job logs for the underlying build failure.
2. Fix unsupported/corrupt reading files or permissions.
3. Remove the poisoned signature from
   `/app/dashboard/data/readings_event_state.json` only after the cause is
   fixed.
4. Trigger reconcile.
