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

The default pod runtime is NVIDIA's hosted OpenAI-compatible endpoint and does
not download model weights. The chart never deploys a privileged model runner,
GPU sidecar, or model artifact. Inject the API key and project-scoped REDCap
tokens through the existing Secret:

```bash
kubectl -n esd-lab create secret generic esd-lab-dashboard-secrets \
  --from-literal=dashboardAssistantApiKey="$DASHBOARD_ASSISTANT_API_KEY" \
  --from-literal=redcapAbcSurveysToken="$REDCAP_ABC_SURVEYS_TOKEN" \
  --from-literal=redcapIpsaSurveysToken="$REDCAP_IPSA_SURVEYS_TOKEN" \
  --from-literal=redcapActionToken="$REDCAP_ACTION_TOKEN" \
  --from-literal=redcapIpsaLabToken="$REDCAP_IPSA_LAB_TOKEN" \
  --from-literal=redcapAbcLabToken="$REDCAP_ABC_LAB_TOKEN" \
  --from-literal=redcapNicoToken="$REDCAP_NICO_TOKEN" \
  --from-literal=redcapNanoSurveysToken="$REDCAP_NANO_SURVEYS_TOKEN" \
  --from-literal=redcapNanoLabToken="$REDCAP_NANO_LAB_TOKEN"
```

The dashboard starts and passes readiness checks when a provider is unavailable;
only the assistant reports degradation. To use an operator-managed local or
in-cluster OpenAI-compatible endpoint as primary, set
`assistant.local.enabled=true` and `assistant.local.apiBase`. HTTPS is required
by default. Set `assistant.local.requireHttps=false` only for a private endpoint
that is constrained by network policy. An optional gateway credential is read
from `dashboardAssistantLocalApiKey`; hosted Nemotron remains the fallback.

ESD-specific behavior is repository RAG over aggregate/non-PHI context, not
model fine-tuning. Run `make assistant-eval` before changing provider or
grounding policy.

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
