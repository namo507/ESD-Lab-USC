# Dashboard AI assistant

ESD Buddy uses one grounded request path with three ordered outcomes:

1. Docker Model Runner serves `ai/qwen3.5:4b-q4_K_M` locally through its
   OpenAI-compatible endpoint.
2. Hosted NVIDIA Nemotron (`nvidia/nemotron-3-super-120b-a12b`) is attempted
   when the local provider fails before any visible streamed text.
3. If neither model succeeds, the backend returns a deterministic answer from
   approved aggregate dashboard data and repository excerpts.

The browser never receives a provider key or REDCap token and never calls a
model endpoint directly. Each model endpoint has its own queue, timeout,
retry policy, and circuit breaker. A provider is never switched after visible
text has been emitted, so users cannot receive an answer spliced from two
models.

The existing API remains stable:

- `GET /api/chat/status`
- `GET /api/assistant/status`
- `GET /api/assistant/freshness`
- `GET /api/buddy`
- `POST /api/chat`
- `POST /api/assistant/chat`
- `POST /api/buddy`
- the synchronous and asynchronous presentation-planning endpoints

`/api/buddy` is the NANO adapter over the shared chain. Its allowlist contains
aggregate NANO metrics and approved non-PHI documents. Participant-level and
raw-signal requests are refused before model generation.

## Domain adaptation: RAG, not fine-tuning

The repository does not fine-tune, modify, or store model weights. ESD-specific
answers come from retrieval-augmented generation (RAG): the backend selects
current aggregate dashboard facts and approved repository excerpts, applies PHI
guardrails, and supplies that bounded context with the question. Deterministic
short answers cover common operational questions without model generation.

This distinction matters operationally:

- model updates remain reproducible OCI artifact changes;
- REDCap data stays outside model weights;
- removing or refreshing an indexed source changes future context immediately;
- `make assistant-eval` is the required regression gate for provider, grounding,
  concise-answer, and Buddy behavior changes.

Do not describe this setup as a model trained on study data. A future fine-tune
would require a separate approved dataset, de-identification review, model
artifact lifecycle, and evaluation protocol.

## Configuration

Copy `.env.example` to the ignored `.env`. The model runner settings are
non-secret; the hosted key remains blank until an operator supplies it locally:

```dotenv
DASHBOARD_ASSISTANT_PROVIDER=docker-model-runner
DASHBOARD_ASSISTANT_LOCAL_ENABLED=true
DASHBOARD_ASSISTANT_LOCAL_API_BASE=http://127.0.0.1:12434/engines/v1
DASHBOARD_ASSISTANT_LOCAL_MODEL=ai/qwen3.5:4b-q4_K_M
DASHBOARD_ASSISTANT_FALLBACK_ENABLED=true
DASHBOARD_ASSISTANT_FALLBACK_PROVIDER=nvidia
DASHBOARD_ASSISTANT_FALLBACK_API_BASE=https://integrate.api.nvidia.com/v1
DASHBOARD_ASSISTANT_FALLBACK_API_KEY=
DASHBOARD_ASSISTANT_FALLBACK_MODEL=nvidia/nemotron-3-super-120b-a12b
```

`DASHBOARD_ASSISTANT_API_BASE`, `DASHBOARD_ASSISTANT_API_KEY`,
`DASHBOARD_ASSISTANT_MODEL`, `OPENAI_BASE_URL`, and `OPENAI_API_KEY` remain
hosted-provider compatibility aliases. Canonical `*_FALLBACK_*` values take
precedence. Never commit `.env`, provider keys, REDCap tokens, or Authorization
headers.

Concise defaults are 96 output tokens for ordinary chat and 144 for an explicit
detail request, bounded by `DASHBOARD_ASSISTANT_MAX_NEW_TOKENS=256`. Thinking is
disabled. The local path has a 20-second request timeout and no retry so a dead
runner moves quickly to the hosted path; hosted retries are bounded and use
backoff with jitter. External provider quotas and rate limits still apply.

## Status and failover observability

Assistant status includes the compatibility fields `provider`, `runtime`, and
`model_id`, plus:

- `active_provider` and `active_provider_index`;
- ordered `provider_chain` entries with model, endpoint, state, and circuit;
- `last_attempts` containing sanitized success/failure outcomes;
- `fallback_available`;
- `failover_strategy: before-first-visible-token`;
- `grounding.strategy: repository-rag` and `grounding.fine_tuned: false`.

No credentials or raw provider errors appear in status. Provider states remain
`ready`, `disabled`, `credentials-missing`, `provider-unreachable`,
`rate-limited`, `timeout`, or `degraded`.

`/api/healthz` reports application health, not model generation health. Model
or network failures must not restart-loop the dashboard. The deterministic
grounded path remains available while provider status reports degradation.

## Docker Model Runner and Compose

Docker Compose 2.38 or later is required for the top-level `models` feature.
The root, development, and production Compose files all declare:

```yaml
services:
  dashboard:
    models:
      esd-buddy:
        endpoint_var: DASHBOARD_ASSISTANT_LOCAL_API_BASE
        model_var: DASHBOARD_ASSISTANT_LOCAL_MODEL

models:
  esd-buddy:
    model: ${DASHBOARD_ASSISTANT_LOCAL_MODEL_ARTIFACT:-ai/qwen3.5:4b-q4_K_M}
    context_size: 8192
```

Compose injects the container-safe endpoint and selected model identifier. It
does not bake weights into the dashboard image. Check the already-pulled model
or pull it explicitly:

```bash
make assistant-model-check
make assistant-model-pull
docker compose --env-file /dev/null -f docker-compose.yml config -q
docker compose up -d --build
curl -fsS http://127.0.0.1:8080/api/healthz
curl -fsS http://127.0.0.1:8080/api/assistant/status
```

Docker Model Runner's API is not authenticated. Keep it host-local and use the
Compose model binding; do not publish port `12434` to the LAN or internet.
Cloudflare tunnels expose only the dashboard HTTP service.

## Kubernetes

The Helm chart does **not** deploy Docker Model Runner, a privileged sidecar, a
GPU workload, or model weights. Hosted NVIDIA remains the default pod provider.
An operator may point the chart at an existing OpenAI-compatible endpoint:

```bash
helm upgrade --install esd-lab-dashboard k8s/helm/esd-lab-dashboard \
  --set assistant.local.enabled=true \
  --set assistant.local.apiBase=https://model-gateway.esd-lab.example/v1
```

`assistant.local.requireHttps=true` is the default. Disabling that guard is an
explicit operator decision for a private in-cluster endpoint. The endpoint must
be protected by network policy; an optional local gateway key is read from the
Secret key named by `assistant.local.apiKeySecretKey`.

The hosted fallback key and all eight REDCap portfolio tokens are Secret
references, never ConfigMap values. The expected Secret keys are:

- `redcapAbcSurveysToken`
- `redcapIpsaSurveysToken`
- `redcapActionToken`
- `redcapIpsaLabToken`
- `redcapAbcLabToken`
- `redcapNicoToken`
- `redcapNanoSurveysToken`
- `redcapNanoLabToken`
- `dashboardAssistantApiKey`
- optionally `dashboardAssistantLocalApiKey`

Prefer an existing Secret in production. `secret.create=true` exists for local
render validation only; never commit real values in a Helm values file.

## Cloudflare Pages

Pages serves the SPA and a same-origin `/api/*` proxy. A healthy Python backend
is the preferred path. The worker may use its project-level hosted-provider
secret for bounded aggregate-only generation when configured, and otherwise
keeps deterministic aggregate/document answers available. Neither the Docker
Model Runner endpoint nor its unauthenticated port is exposed through Pages or
the tunnel.

Use a named tunnel or another durable HTTPS backend origin in production.
Ephemeral `trycloudflare.com` origins are previews and must not become the
canonical Pages origin.

## Verification

```bash
make assistant-status
make assistant-prepare
make assistant-probe
make assistant-eval
python3 scripts/check_compose_config.py
make k8s-helm-lint
```

`assistant-status` is non-generating. `assistant-probe` calls model catalogs and
may fall through from local to hosted without generating text. Live generation
and hosted usage should be exercised only with approved aggregate/non-PHI test
prompts.
