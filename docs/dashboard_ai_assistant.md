# Dashboard AI Assistant

The live dashboard includes a local GGUF-backed assistant exposed under
`/api/chat` and `/api/assistant/*`. It runs through `llama-cpp-python`, uses only
dashboard/readings context from the repo, and does not require a paid API key.

## Runtime Pieces

- `dashboard/assistant/local_chat_assistant.py` loads the model lazily and builds
  grounded context from dashboard JSON.
- `dashboard/assistant/model_catalog.py` owns the vetted local model ladder.
- `config/llm_model.json` is the checked-in runtime selection.
- `scripts/prepare_dashboard_assistant.py` installs dependencies, downloads the
  selected public GGUF, and validates readiness.
- `scripts/select_best_local_llm.py` refreshes the checked-in config from the
  catalog without calling external model-ranking APIs.

## Model Ladder

The default checked-in tier is `balanced`:

- Repository: `bartowski/SmolLM2-1.7B-Instruct-GGUF`
- File: `SmolLM2-1.7B-Instruct-Q4_K_M.gguf`
- License: Apache-2.0
- Intended use: stronger local QA and presentation planning on CPU laptops or
  small dashboard hosts.

Fallbacks are kept in the same config:

- `tiny`: `bartowski/SmolLM2-360M-Instruct-GGUF` for constrained Docker/local
  hosts.
- `accuracy`: `bartowski/Qwen2.5-1.5B-Instruct-GGUF` when that GGUF already
  exists locally.
- `quality`: `bartowski/Qwen2.5-3B-Instruct-GGUF` for workstation hosts with
  more memory headroom.

The runtime checks already-present GGUF files first, so the dashboard can keep
using the tiny local fallback while the balanced model is being downloaded.

## Local Setup

Inspect current readiness:

```bash
make assistant-status
```

Install assistant dependencies into `.venv`, download the selected public model,
write `config/llm_model.json`, and validate readiness:

```bash
make assistant-bootstrap
```

Download only the selected model without installing dependencies:

```bash
make assistant-prepare
```

Opt into a different tier for one run:

```bash
DASHBOARD_ASSISTANT_TIER=quality make assistant-bootstrap
```

No `HF_TOKEN` is needed for the default public GGUF files. `HF_TOKEN` is only
read if someone intentionally points the config at a private Hugging Face repo.

## API Contract

### `GET /api/chat/status` and `GET /api/assistant/status`

Returns readiness, dependency state, model path, model tier, model label, model
license, memory estimate, and assistant freshness. When
`ASSISTANT_CLUSTER_CONTEXT_ENABLED=true`, the payload includes readings pipeline
freshness so the assistant can answer whether new readings were indexed.

### `POST /api/chat`

Request:

```json
{
  "message": "What is the current enrollment?",
  "history": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello" }
  ]
}
```

Response:

```json
{
  "reply": "...",
  "citations": ["enrollment", "ml_performance.models[0]"],
  "status": {
    "state": "ready",
    "model_tier": "balanced"
  }
}
```

If the model or dependencies are not ready, the endpoint returns a setup-oriented
error payload so the UI can fail gracefully.

## Maintenance

Refresh the checked-in model config after editing the catalog:

```bash
make assistant-select-model
```

Benchmark local presentation planning across installed GGUF files:

```bash
python scripts/benchmark_presentation_planner.py --compare-json-mode
```
