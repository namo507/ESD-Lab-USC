# Dashboard AI assistant

The dashboard assistant runs a local model through
[Ollama](https://github.com/ollama/ollama) over its OpenAI-compatible `/v1`
surface. The default model is `llama3.2:3b`. There is no provider account, no
API key, and no outbound model call: prompts and dashboard context stay on the
host that runs the dashboard, and the browser never connects to the runtime
directly.

The dashboard API is unchanged:

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
delegated to Ollama.

## Install and run the runtime

```bash
make ollama-install   # pinned Ollama release into .tools/ollama (gitignored)
make ollama-up        # start the server on 127.0.0.1:11434
make ollama-pull      # download llama3.2:3b and preload it
make assistant-smoke  # end-to-end check of both buddies
```

`scripts/ollama.sh` owns those steps and also exposes `stop`, `status`, `warm`,
and `version`. Neither the runtime binary nor the model weights are committed:
they live in `.tools/ollama/` and `models/ollama/`, both gitignored. `make
clean-space` removes the binary but keeps the downloaded weights.

Host requirements for the default model: roughly 3 GB of free RAM and 2 GB of
disk. On a smaller host, switch to the 1B model and a shorter context:

```dotenv
DASHBOARD_ASSISTANT_MODEL=llama3.2:1b
DASHBOARD_ASSISTANT_CONTEXT_WINDOW=2048
DASHBOARD_ASSISTANT_CONTEXT_BUDGET=1800
OLLAMA_CONTEXT_LENGTH=2048
```

Any Ollama tag works — `qwen2.5:7b-instruct` is stronger and slower, `llama3.2:1b`
is weaker and faster. Pull a model before pointing the dashboard at it.

## Configuration

Copy `.env.example` to `.env`. The defaults already target a local runtime:

```dotenv
DASHBOARD_ASSISTANT_ENABLED=true
DASHBOARD_ASSISTANT_PROVIDER=ollama
DASHBOARD_ASSISTANT_RUNTIME=ollama
DASHBOARD_ASSISTANT_API_BASE=http://127.0.0.1:11434/v1
DASHBOARD_ASSISTANT_API_KEY=
DASHBOARD_ASSISTANT_MODEL=llama3.2:3b
```

`OPENAI_BASE_URL` and a bare `OLLAMA_HOST` (for example
`gpu-box.lab.internal:11434`) are accepted when the canonical base URL is absent;
a host without a scheme or `/v1` suffix is normalized. Retired hosted-provider
values (an `integrate.api.nvidia.com` base URL, an `nvidia/...` model id, a
`nemotron-nim` endpoint) are ignored and fall back to the local runtime, so a
stale `.env` degrades instead of failing every request.

Two settings must stay aligned or packed grounding is silently truncated by the
server: `OLLAMA_CONTEXT_LENGTH` (runtime) must be greater than or equal to
`DASHBOARD_ASSISTANT_CONTEXT_WINDOW` (dashboard), and
`DASHBOARD_ASSISTANT_CONTEXT_BUDGET` is the character budget packed into it.

Default generation and reliability settings are documented in `.env.example`:

- thinking disabled with a zero reasoning budget so planning text cannot consume the short chat response budget
- 768 maximum output tokens, temperature `0.2`, top-p `0.9`; chat responses are capped separately for concise answers
- streaming enabled
- bounded concurrency and queue wait
- request timeout
- exponential retry with jitter for retryable failures
- circuit-breaker degradation after repeated failures
- `OLLAMA_KEEP_ALIVE=30m` keeps the model resident so follow-up questions skip the load cost

### Remote or shared runtime

Point the dashboard at an Ollama server on another machine (a GPU box, a lab
server, or the Compose `ollama` service) with a single variable:

```dotenv
DASHBOARD_ASSISTANT_REMOTE_BASE_URL=http://ollama.lab.internal:11434/v1
```

Runtime status then reports `ollama-remote`. Ollama has no authentication of its
own; put it behind a private network or an authenticating proxy, and set
`DASHBOARD_ASSISTANT_API_KEY` only if that proxy requires a bearer token.

### Operator commands

```bash
make assistant-status   # sanitized configuration + runtime readiness
make assistant-prepare  # rebuild repository grounding indexes
make assistant-probe    # non-generation provider probe
make ollama-status      # runtime version and installed models
```

`scripts/prepare_dashboard_assistant.py` also accepts `--ensure-model` (pull when
missing) and `--warm-model` (preload), which `make assistant-bootstrap` uses.

## Status model

Assistant status is runtime-oriented:

| State | Meaning |
| --- | --- |
| `ready` | Configuration is usable and the circuit is closed. |
| `disabled` | The assistant was explicitly disabled. |
| `model-missing` | The configured model is not installed; run `make ollama-pull`. |
| `provider-unreachable` | Ollama could not be reached after bounded retry; run `make ollama-up`. |
| `rate-limited` | The runtime rejected the request because it was saturated. |
| `timeout` | Queue or request timeout elapsed. |
| `degraded` | The circuit is open or another sanitized failure occurred. |

Status is not inferred from configuration alone: it runs a cached, 1-second
liveness check against the runtime (`DASHBOARD_ASSISTANT_STATUS_PROBE`, TTL
`DASHBOARD_ASSISTANT_STATUS_PROBE_TTL_SECONDS`), so a stopped server or an
unpulled model is reported before the user asks a question. The check never runs
on a generation request, and a probe failure only affects the reported state.
The response also carries `runtime_reachable` and `model_installed` for
operators.

Older clients may still receive nullable `model_dir`, `model_file`, and
`model_path` fields. They are compatibility fields only and no longer represent
a runtime dependency.

`/api/healthz` reports application health, not generation health. A stopped
runtime or missing model must not fail container or pod readiness. The dashboard
remains usable while assistant status explains the degraded state.

## Docker

Compose ships an `ollama` service alongside the dashboard. Weights persist in the
`ollama-models` volume, never in the image or the repository.

```bash
docker compose config
docker compose up -d --build
docker compose exec ollama ollama pull llama3.2:3b
curl -fsS http://127.0.0.1:8080/api/healthz
curl -fsS http://127.0.0.1:8080/api/assistant/status
```

`depends_on` is start-order only: the dashboard container comes up even when the
runtime is unhealthy or absent, and the first endpoint stays healthy while the
second reports `model-missing` or `provider-unreachable`.

## Kubernetes

`ollama.enabled=true` (default) deploys the runtime as a single-replica
Deployment with a ReadWriteOnce PVC for the model store, a ClusterIP Service, and
a `postStart` hook that pulls the configured model idempotently. The dashboard
resolves the endpoint through the chart helper, so no endpoint value is required.
Set `ollama.enabled=false` and `assistant.apiBase` to use an external runtime.

Dashboard startup, liveness, and readiness use `/api/healthz`; they never make a
generation call, so runtime outages cannot cause rollout or restart loops.

```bash
helm lint k8s/helm/esd-lab-dashboard
helm template esd-lab-dashboard k8s/helm/esd-lab-dashboard
helm template esd-lab-dashboard k8s/helm/esd-lab-dashboard \
  --set ollama.enabled=false \
  --set assistant.apiBase=http://ollama.lab.internal:11434/v1
```

Size `ollama.resources` and `ollama.persistence.size` for the chosen model.
`ollama.loadTimeout` covers slow cold loads on small nodes.

## Cloudflare Pages

Pages contains the SPA, a same-origin `/api/*` proxy, and bounded aggregate-only
assistant fallbacks. A healthy Python backend remains the preferred path. The
edge worker has no local runtime, so it only attempts live generation when
`DASHBOARD_ASSISTANT_API_BASE` is bound to an HTTPS Ollama endpoint the edge can
actually reach (for example through a named tunnel); `DASHBOARD_ASSISTANT_API_KEY`
is sent only when that endpoint sits behind an authenticating proxy. Without a
reachable endpoint, deterministic aggregate metric and approved document answers
remain available while status reports the degraded state.

Use a named tunnel or another durable HTTPS backend origin for production.
Ephemeral `trycloudflare.com` origins are runtime previews and must not become a
long-lived canonical Pages origin.

## Failure behavior and privacy

- Prompts, dashboard context, and generated answers never leave the deployment.
- Retryable requests use bounded exponential backoff with jitter.
- Streaming retries stop after the first emitted content token to prevent
  duplicate output.
- Closing the chat drawer or disconnecting a client cancels/closes the stream.
- Reasoning fields, tags, and recognizable planning preambles are removed before
  answer content reaches the UI.
- Raw runtime errors are never returned to the browser or logged.
- The dashboard does not cache model responses by default because prompts may
  contain sensitive research context.
- Deterministic repository answers can still be returned when the runtime is
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
make assistant-smoke
```

Also boot once with the runtime stopped and prove that core pages and
`/api/healthz` work while `/api/assistant/status` reports
`provider-unreachable`.
