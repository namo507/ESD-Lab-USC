# Dashboard AI assistant

The dashboard assistant uses NVIDIA Nemotron 3 Super 120B A12B through an
OpenAI-compatible server-side provider. The supported default is NVIDIA's
hosted endpoint; the browser never receives provider credentials and never
connects to NVIDIA directly.

The migration preserves the existing dashboard API:

- `GET /api/chat/status`
- `GET /api/assistant/status`
- `GET /api/assistant/freshness`
- `GET /api/buddy`
- `POST /api/chat`
- `POST /api/assistant/chat`
- `POST /api/buddy`
- the synchronous and asynchronous presentation-planning endpoints

`/api/buddy` is the NANO dashboard adapter over the same assistant instance.
It returns a compact JSON contract with `answer`, `citations`, `used_metrics`,
and `refused`. Its grounding allowlist contains aggregate NANO metrics and
non-PHI repository documents only. It refuses participant-level and raw-signal
requests even when another assistant route could answer a general question.

Repository grounding, citation extraction, REDCap/readings freshness,
deterministic short-circuit answers, PHI guardrails, and presentation-plan
normalization remain part of the dashboard runtime. Only text generation is
delegated to the provider.

## Hosted configuration

Copy `.env.example` to `.env`, then set the real key locally:

```dotenv
DASHBOARD_ASSISTANT_ENABLED=true
DASHBOARD_ASSISTANT_PROVIDER=nvidia
DASHBOARD_ASSISTANT_RUNTIME=nvidia-build-api
DASHBOARD_ASSISTANT_API_BASE=https://integrate.api.nvidia.com/v1
DASHBOARD_ASSISTANT_API_KEY=replace-locally
DASHBOARD_ASSISTANT_MODEL=nvidia/nemotron-3-super-120b-a12b
```

Do not commit `.env`, a real key, or an Authorization header. The canonical
variables take precedence. `OPENAI_BASE_URL` and `OPENAI_API_KEY` are accepted
as compatibility aliases when the canonical values are absent.

Default generation and reliability settings are documented in `.env.example`:

- thinking disabled with a zero reasoning budget so planning text cannot consume the short chat response budget
- 16,384 maximum provider output tokens, temperature `0.2`, and top-p `0.95`; chat responses are capped separately for concise answers
- streaming enabled
- bounded concurrency and queue wait
- request timeout
- exponential retry with jitter for retryable failures
- circuit-breaker degradation after repeated failures

External rate limits still apply. The retry and circuit-breaker controls make
limits survivable; they do not remove provider quotas.

Validate configuration without generating text:

```bash
make assistant-status
```

Rebuild repository grounding indexes:

```bash
make assistant-prepare
```

Probe the configured provider's non-generation endpoint:

```bash
make assistant-probe
```

## Optional self-hosted NIM

Nemotron 3 Super 120B is not supported as a laptop, default Compose, or ordinary
dashboard-pod workload. A self-hosted NVIDIA NIM requires dedicated high-end GPU
infrastructure and remains disabled by default.

Only operators who already run a compatible NIM should opt in:

```dotenv
DASHBOARD_ASSISTANT_SELF_HOSTED_ENABLED=true
DASHBOARD_ASSISTANT_SELF_HOSTED_BASE_URL=https://nemotron-nim.example.org/v1
```

When opt-in is false, the self-hosted URL is ignored and the hosted API base is
used. The same provider abstraction and status behavior apply to both modes.

## Status model

Assistant status is provider-oriented:

| State | Meaning |
| --- | --- |
| `ready` | Configuration is usable and the circuit is closed. |
| `disabled` | The assistant was explicitly disabled. |
| `credentials-missing` | No canonical key or compatibility alias is configured. |
| `provider-unreachable` | The provider could not be reached after bounded retry. |
| `rate-limited` | The provider rejected the request for quota/rate reasons. |
| `timeout` | Queue or provider request timeout elapsed. |
| `degraded` | The circuit is open or another sanitized provider failure occurred. |

Older clients may still receive nullable `model_dir`, `model_file`, and
`model_path` fields. They are compatibility fields only and no longer represent
a runtime dependency.

`/api/healthz` reports application health, not provider generation health. A
missing key or provider outage must not fail container or pod readiness. The
dashboard remains usable while assistant status explains the degraded state.

## Docker

Compose passes non-secret provider settings to the dashboard container and
reads `DASHBOARD_ASSISTANT_API_KEY` from the local environment. No GGUF volume,
Hugging Face cache, or model download is required.

```bash
docker compose config
docker compose up -d --build
curl -fsS http://127.0.0.1:8080/api/healthz
curl -fsS http://127.0.0.1:8080/api/assistant/status
curl -fsS http://127.0.0.1:8080/api/buddy
```

The first endpoint should remain healthy even when the second reports
`credentials-missing` or another degraded provider state.

## Kubernetes

Helm stores non-secret provider configuration in the ConfigMap and injects the
API key through a Secret reference. Prefer an existing Secret in production.
Dashboard startup, liveness, and readiness use `/api/healthz`; they never make
a model-generation call. Provider outages therefore cannot cause rollout or
restart loops.

Render both supported secret modes before deployment:

```bash
helm lint k8s/helm/esd-lab-dashboard
helm template esd-lab-dashboard k8s/helm/esd-lab-dashboard \
  --set secret.create=true \
  --set-string secret.nvidiaApiKey=example-only
helm template esd-lab-dashboard k8s/helm/esd-lab-dashboard \
  --set secret.create=false \
  --set secret.existingSecret=esd-lab-dashboard-secrets
```

Never place a real key in a values file or committed render.

## Cloudflare Pages

Pages contains the SPA, a same-origin `/api/*` proxy, and bounded aggregate-only
assistant fallbacks. A healthy Python backend remains the preferred provider
path. When no healthy origin exists, the worker can use the Pages project-level
`DASHBOARD_ASSISTANT_API_KEY` runtime secret for NVIDIA generation without
serializing the credential into the bundle or exposing it to the browser.
Without either provider path, deterministic aggregate metric and approved
document answers remain available while status reports the degraded state.

Use a named tunnel or another durable HTTPS backend origin for production.
Ephemeral `trycloudflare.com` origins are runtime previews and must not become a
long-lived canonical Pages origin.

## Failure behavior and privacy

- Retryable requests use bounded exponential backoff with jitter.
- Streaming retries stop after the first emitted content token to prevent
  duplicate output.
- Closing the chat drawer or disconnecting a client cancels/closes the stream.
- Provider reasoning fields, tags, and recognizable planning preambles are removed before answer content reaches the UI.
- Raw provider errors and keys are never returned to the browser or logged.
- The dashboard does not cache model responses by default because prompts may
  contain sensitive research context.
- Deterministic repository answers can still be returned when the provider is
  degraded.

## Verification

Minimum migration checks:

```bash
python3 -m pytest tests/test_dashboard_assistant.py tests/test_assistant_provider.py -q
npm --prefix web test
npm --prefix web run build
python3 scripts/check_compose_config.py
make k8s-helm-lint
make pages-build
```

Also boot once without a key and prove that core pages and `/api/healthz` work
while `/api/assistant/status` reports `credentials-missing`.
