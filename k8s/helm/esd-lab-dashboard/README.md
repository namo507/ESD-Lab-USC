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

The default assistant runtime is NVIDIA's hosted OpenAI-compatible endpoint and
does not download model weights into the pod. Inject the API key through the
existing Secret (key `dashboardAssistantApiKey` by default):

```bash
kubectl -n esd-lab create secret generic esd-lab-dashboard-secrets \
  --from-literal=dashboardAssistantApiKey="$DASHBOARD_ASSISTANT_API_KEY"
```

The dashboard starts and passes readiness checks when that key is missing or the
provider is unavailable; only the assistant reports a degraded state. A future
self-hosted NIM endpoint can be selected with `assistant.selfHostedEnabled` and
`assistant.selfHostedBaseUrl`, but it is disabled by default and requires
dedicated GPU infrastructure outside this chart.

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
