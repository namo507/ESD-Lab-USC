# Ollama assistant runbook

The ESD Lab dashboard assistants — **ESD Buddy** (chat drawer, `/api/chat`) and
**NANO Buddy** (`/api/buddy`) — run on a local model served by
[Ollama](https://github.com/ollama/ollama). This file is the operator runbook.
Architecture and configuration reference lives in
[`docs/dashboard_ai_assistant.md`](docs/dashboard_ai_assistant.md).

## What is in the repository

Ollama's binary is ~1.5 GB and model weights are 1–5 GB each, so neither is
committed. The repository carries the tooling that fetches and runs them:

| Path | Purpose |
| --- | --- |
| `scripts/ollama.sh` | Install a pinned release, serve, stop, status, pull, warm |
| `dashboard/assistant/provider.py` | Retry/queue/circuit-breaker seam over Ollama's OpenAI-compatible API |
| `dashboard/assistant/ollama_runtime.py` | Dependency-free client for health, tags, pull, preload |
| `scripts/check_assistant_runtime.py` | End-to-end smoke check of both buddies |
| `docker-compose.yml`, `docker/compose.*.yml` | `ollama` service with a persistent model volume |
| `k8s/helm/esd-lab-dashboard/templates/deployment-ollama.yaml` | In-cluster runtime, PVC, Service |

Downloaded artifacts land in `.tools/ollama/` (binary) and `models/ollama/`
(weights). Both are gitignored. `make clean-space` removes the binary and keeps
the weights.

## First run

```bash
make ollama-install   # pinned release from github.com/ollama/ollama, checksum-verified
make ollama-up        # serve on 127.0.0.1:11434
make ollama-pull      # pull llama3.2:3b and preload it
make assistant-smoke  # runtime + ESD Buddy + NANO Buddy + PHI refusal
```

The pinned version is `OLLAMA_VERSION` in `scripts/ollama.sh`. Override it per
invocation (`OLLAMA_VERSION=v0.33.0 make ollama-install`) to move the pin.

Unpacking a Linux release needs `zstd` (`apt-get install zstd` /
`brew install zstd`); macOS archives need nothing extra.

## Day-to-day

```bash
make ollama-status      # runtime version + installed models
make assistant-status   # dashboard-side configuration and readiness
make assistant-probe    # non-generation reachability probe
make ollama-down        # stop the repository-managed server
```

## Host requirements

| Model | RAM to load | Disk | Notes |
| --- | --- | --- | --- |
| `llama3.2:1b` | ~1.5 GB | 1.3 GB | Fastest; weaker grounded synthesis |
| `llama3.2:3b` (default) | ~3 GB | 2.0 GB | Balanced for short grounded answers |
| `qwen2.5:7b-instruct` | ~6 GB | 4.7 GB | Stronger; slow without a GPU |

Free RAM is what matters, not total RAM. A host with less headroom than the
table shows will have `llama-server` killed mid-load, which surfaces as
`provider-unreachable` while the dashboard itself keeps working. On a small host:

```dotenv
DASHBOARD_ASSISTANT_MODEL=llama3.2:1b
DASHBOARD_ASSISTANT_CONTEXT_WINDOW=2048
DASHBOARD_ASSISTANT_CONTEXT_BUDGET=1800
OLLAMA_CONTEXT_LENGTH=2048
```

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Status `provider-unreachable` | Server not running (detected by the cached status probe, before you ask anything) | `make ollama-up` |
| Status `model-missing` | Tag never pulled | `make ollama-pull` |
| First question slow, later ones fast | Cold model load | Expected; `OLLAMA_KEEP_ALIVE=30m` keeps it resident |
| `llama-server process has terminated: signal: killed` in the log | Out of memory | Smaller model or shorter context (table above) |
| `timed out waiting for llama-server to start` | Slow cold load | Raise `OLLAMA_LOAD_TIMEOUT` (default `15m` here) |
| Answers ignore dashboard facts | Context truncated by the server | Keep `OLLAMA_CONTEXT_LENGTH` >= `DASHBOARD_ASSISTANT_CONTEXT_WINDOW` |

Runtime log: `.tools/ollama-state/ollama.log`.

## Guarantees this migration keeps

- **The dashboard never depends on the assistant.** `/api/healthz` ignores
  generation health; a stopped runtime degrades assistant status only.
- **No credentials.** Ollama needs no API key. `DASHBOARD_ASSISTANT_API_KEY`
  exists only for an authenticating proxy in front of a shared runtime.
- **Nothing leaves the deployment.** Prompts, dashboard context, and answers stay
  on the host that runs Ollama.
- **Grounding is unchanged.** Repository indexing, citations, deterministic
  short-circuit answers, and PHI refusals remain dashboard-side; only text
  generation moved.
- **Stale configuration degrades, not breaks.** Retired hosted-provider values in
  an old `.env` resolve to the local runtime instead of failing every request.
