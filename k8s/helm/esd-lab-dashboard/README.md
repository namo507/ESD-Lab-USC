# ESD Lab Dashboard Helm Chart

This chart deploys the live dashboard, readings watcher, event-driven readings
pipeline worker, and scheduled reconcile fallback.

It expects existing RWX PVCs:

```bash
helm upgrade --install esd-lab-dashboard k8s/helm/esd-lab-dashboard \
  --namespace esd-lab --create-namespace \
  --set existingClaims.readings=esd-readings-rwx \
  --set existingClaims.data=esd-dashboard-data-rwx \
  --set image.repository=ghcr.io/<org>/esd-lab-dashboard \
  --set image.tag=<tag>
```

The readings PVC mounts at `/app/esd-lab-readings`. The data PVC mounts at
`/app/dashboard/data` and stores generated JSON, the event ledger, lock file,
and optional Pages packaging trigger metadata.

Secrets are never hardcoded. To enable the optional Pages redeploy hook, create
or render a Secret named by `secret.name` with key `pagesDeployHookUrl`.

Validation:

```bash
helm lint k8s/helm/esd-lab-dashboard
helm template esd-lab-dashboard k8s/helm/esd-lab-dashboard \
  --namespace esd-lab \
  --set existingClaims.readings=esd-readings-rwx \
  --set existingClaims.data=esd-dashboard-data-rwx \
  > /tmp/esd-lab-dashboard.yaml
kubectl apply --dry-run=server -f /tmp/esd-lab-dashboard.yaml
```
