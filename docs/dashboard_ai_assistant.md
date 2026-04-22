# Dashboard AI Assistant

This repository includes a local dashboard assistant that adds a chat widget to
the live dashboard and a backend API under `/api/chat`.

The default runtime is a small-but-stronger GGUF model,
`bartowski/Qwen2.5-1.5B-Instruct-GGUF`, loaded through `llama-cpp-python`. That
combination fits this CPU-only arm64 dev container with a tighter runtime
configuration, a 4-thread local default, and a shorter response cap that keeps
grounded dashboard QA usable on CPU over the earlier 0.5B default.

## What Was Added

- A lazy GGUF backend in `dashboard/assistant/local_chat_assistant.py`
- New runtime endpoints:
  - `GET /api/chat/status`
  - `POST /api/chat`
- A collapsed chat widget inside the dashboard UI
- A model preparation script: `scripts/prepare_dashboard_assistant.py`
- Optional assistant dependencies in `dashboard/requirements-assistant.txt`

## Default Local Model

- Repository: `bartowski/Qwen2.5-1.5B-Instruct-GGUF`
- Default file: `Qwen2.5-1.5B-Instruct-Q3_K_S.gguf`
- Runtime: `llama-cpp-python==0.3.19`
- Intended host: CPU-only local dashboard runtime in this container

This default is intentionally tuned for grounded answers rather than maximum
throughput. It still runs locally, and you can swap the target later by
changing the assistant environment variables.

## Local Setup

1. Install the standard repository dependencies.
2. Install the assistant extras:

```bash
pip install -r dashboard/requirements-assistant.txt
```

3. Copy `.env.example` to `.env` if needed, then confirm the assistant values:

```bash
DASHBOARD_ASSISTANT_MODEL_ID=bartowski/Qwen2.5-1.5B-Instruct-GGUF
DASHBOARD_ASSISTANT_MODEL_DIR=models/local_llms/Qwen2.5-1.5B-Instruct-GGUF
DASHBOARD_ASSISTANT_MODEL_FILE=Qwen2.5-1.5B-Instruct-Q3_K_S.gguf
DASHBOARD_ASSISTANT_ENABLED=true
```

4. Check readiness:

```bash
make assistant-status
```

5. Download the model locally on the target machine:

```bash
make assistant-prepare
```

That command downloads only the configured GGUF file into the local model
directory instead of pulling an entire transformer snapshot.

6. Start the live dashboard:

```bash
/workspaces/ESD-Lab-USC/.devcontainer/.venv/bin/python dashboard/server/live_dashboard_server.py --fallback-synthetic
```

7. Open the dashboard and use the floating assistant launcher.

## Why This Runtime

The earlier BioMistral plan was too heavy for this container. The working local
path here is:

- small Qwen GGUF model
- CPU inference through `llama-cpp-python`
- grounded prompts built from the existing dashboard JSON payloads
- section-aware retrieval that prefers dashboard metrics over generic site copy

This keeps the dashboard stable while making the assistant actually runnable in
the current environment.

## AI Toolkit Notes

This repo uses a custom Python dashboard backend because the request targets a
local GGUF checkpoint inside the existing dashboard runtime.

AI Toolkit is still useful for the surrounding workflow:

- Use the **Model Catalog** command to compare candidate models
- Use the **Model Playground** command to test prompts and interaction style
- Keep the dashboard runtime separate from those experiments so the live site
  stays stable

Relevant AI Toolkit commands:

- `ai-mlstudio.models`
- `ai-mlstudio.modelPlayground`

## API Contract

### `GET /api/chat/status`

Returns the current assistant readiness, including dependency state, model
directory, resolved GGUF file path, memory estimate, and whether the generator
is loaded.

### `POST /api/chat`

Request body:

```json
{
  "message": "What is the current enrollment?",
  "history": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello" }
  ]
}
```

Response body:

```json
{
  "reply": "...",
  "citations": ["enrollment", "ml_performance.models[0]"],
  "status": {
    "state": "ready"
  }
}
```

If the model is not ready, the endpoint returns a non-200 response with a
setup-oriented error payload so the UI can fail gracefully.