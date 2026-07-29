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

The assistant runtime is Ollama, deployed in-cluster by default
(`ollama.enabled=true`) as a single-replica Deployment with a ReadWriteOnce PVC
for the model store; a `postStart` hook pulls `assistant.model` idempotently. The
dashboard resolves the endpoint from the chart, so no API key and no endpoint
value are required. To use an external runtime instead:

```bash
helm upgrade --install esd-lab-dashboard k8s/helm/esd-lab-dashboard \
  --set ollama.enabled=false \
  --set assistant.apiBase=http://ollama.lab.internal:11434/v1
```

`dashboardAssistantApiKey` remains supported and optional, for the case where an
authenticating proxy fronts a shared runtime.

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
