# NVIDIA Nemotron Integration Prompt

This file contains a single copyable implementation prompt for migrating the ESD-Lab-USC assistant stack to NVIDIA Nemotron 3 Super 120B A12B.

Notes:
- The real NVIDIA API key should live only in local `.env` or a secret manager.
- Do not copy the real key into tracked files, docs, tests, Dockerfiles, Helm values, or Cloudflare artifacts.
- The repository-local `.env` has already been updated with the live key and provider settings.

## Copyable Prompt

```text
You are working inside the ESD-Lab-USC repository.

Replace the current local GGUF, llama.cpp, Hugging Face, BioMistral, SmolLM, Qwen fallback, and AI Buddy assistant backend with NVIDIA Nemotron 3 Super 120B A12B using NVIDIA's OpenAI-compatible hosted API as the default runtime.

Use the real repository as the source of truth. Keep the current dashboard assistant user experience and API contract stable while replacing the model runtime and deployment wiring.

Important technical constraints:
1. Do not pretend Nemotron 3 Super 120B can be self-hosted on the default local laptop, devcontainer, default Docker Compose stack, or standard dashboard pod. True self-hosting of this model requires dedicated high-end GPU infrastructure. Therefore:
   - The default supported runtime in this repo must be the hosted NVIDIA endpoint.
   - A future self-hosted NIM path may be supported behind configuration, but it must be clearly optional and disabled by default.
2. Do not claim or implement “no API rate limits.” External provider limits cannot be removed. Instead, implement rate-limit resilience:
   - retries with exponential backoff and jitter
   - request timeout controls
   - bounded concurrency
   - circuit-breaker style degradation
   - streaming cancellation handling
   - stable user-facing fallback states
   - optional response caching where safe
3. Do not retrain or fine-tune the 120B model in this repository. “Training” for this migration means:
   - better repository-specific grounding
   - assistant prompt/system prompt design
   - context packing
   - evaluation fixtures
   - regression tests
   - optional future stubs for offline evaluation or fine-tune prep only
4. Never commit the real NVIDIA key. Use environment variables and Kubernetes or deployment secrets only.
5. Keep the dashboard operational even if the model endpoint is unavailable or slow. The website must not crash because the assistant is degraded.

Target provider settings:
- Hosted API base URL: https://integrate.api.nvidia.com/v1
- Hosted model id: nvidia/nemotron-3-super-120b-a12b
- Default provider runtime label: nvidia-build-api
- Default thinking enabled: true
- Default reasoning budget: 16384
- Default max output tokens: 16384
- Default temperature: 1
- Default top_p: 0.95
- Default streaming: true

Optional future self-hosted NIM settings:
- Example internal base URL: http://nemotron-nim:8000/v1
- Example cluster ingress URL: https://nemotron-nim.<your-domain>/v1
- Self-hosted mode must be disabled by default unless explicitly configured

Use these environment variable names as the canonical assistant provider contract:
- DASHBOARD_ASSISTANT_PROVIDER=nvidia
- DASHBOARD_ASSISTANT_RUNTIME=nvidia-build-api
- DASHBOARD_ASSISTANT_API_BASE=https://integrate.api.nvidia.com/v1
- DASHBOARD_ASSISTANT_API_KEY from secret storage
- DASHBOARD_ASSISTANT_MODEL=nvidia/nemotron-3-super-120b-a12b
- DASHBOARD_ASSISTANT_MODEL_ID=nvidia/nemotron-3-super-120b-a12b
- DASHBOARD_ASSISTANT_ENABLE_THINKING=true
- DASHBOARD_ASSISTANT_REASONING_BUDGET=16384
- DASHBOARD_ASSISTANT_MAX_NEW_TOKENS=16384
- DASHBOARD_ASSISTANT_TEMPERATURE=1
- DASHBOARD_ASSISTANT_TOP_P=0.95
- DASHBOARD_ASSISTANT_STREAM=true
- DASHBOARD_ASSISTANT_REQUEST_TIMEOUT_SECONDS=180
- DASHBOARD_ASSISTANT_MAX_RETRIES=6
- DASHBOARD_ASSISTANT_RETRY_BASE_SECONDS=2
- DASHBOARD_ASSISTANT_QUEUE_TIMEOUT_SECONDS=180
- DASHBOARD_ASSISTANT_CONTEXT_BUDGET=12000
- DASHBOARD_ASSISTANT_SELF_HOSTED_ENABLED=false
- DASHBOARD_ASSISTANT_SELF_HOSTED_BASE_URL=http://nemotron-nim:8000/v1
- OPENAI_BASE_URL as alias to DASHBOARD_ASSISTANT_API_BASE
- OPENAI_API_KEY as alias to DASHBOARD_ASSISTANT_API_KEY

Use the official OpenAI-compatible Python client pattern, but source all values from environment variables rather than hardcoding:

from openai import OpenAI

client = OpenAI(
    base_url=os.environ["DASHBOARD_ASSISTANT_API_BASE"],
    api_key=os.environ["DASHBOARD_ASSISTANT_API_KEY"],
)

completion = client.chat.completions.create(
    model=os.environ.get("DASHBOARD_ASSISTANT_MODEL", "nvidia/nemotron-3-super-120b-a12b"),
    messages=[{"role": "user", "content": "..."}],
    temperature=float(os.environ.get("DASHBOARD_ASSISTANT_TEMPERATURE", "1")),
    top_p=float(os.environ.get("DASHBOARD_ASSISTANT_TOP_P", "0.95")),
    max_tokens=int(os.environ.get("DASHBOARD_ASSISTANT_MAX_NEW_TOKENS", "16384")),
    extra_body={
        "chat_template_kwargs": {"enable_thinking": True},
        "reasoning_budget": int(os.environ.get("DASHBOARD_ASSISTANT_REASONING_BUDGET", "16384")),
    },
    stream=True,
)

Repository surfaces that must be updated:
- Backend assistant runtime and API contract:
  - dashboard/assistant/local_chat_assistant.py
  - dashboard/server/live_dashboard_server.py
- Local model selection and bootstrap logic to replace or remove:
  - dashboard/assistant/model_catalog.py
  - config/llm_model.json
  - scripts/prepare_dashboard_assistant.py
  - docs/dashboard_ai_assistant.md
- Python dependencies and packaging:
  - dashboard/requirements.txt
  - pyproject.toml
  - docker/dashboard/Dockerfile
- Local and production container runtime:
  - docker-compose.yml
  - docker/compose.dev.yml
  - docker/compose.prod.yml
  - Makefile
- Kubernetes deployment:
  - k8s/helm/esd-lab-dashboard/values.yaml
  - k8s/helm/esd-lab-dashboard/templates/configmap.yaml
  - k8s/helm/esd-lab-dashboard/templates/secret.yaml
  - k8s/helm/esd-lab-dashboard/templates/deployment-dashboard.yaml
  - k8s/helm/esd-lab-dashboard/templates/deployment-watcher.yaml
- Cloudflare Pages and sharing pipeline:
  - scripts/build_pages_site.py
  - scripts/share_dashboard.sh
- Frontend assistant surfaces and copy:
  - web/src/api/chatApi.ts
  - web/src/components/shell/Buddy.tsx
  - web/src/components/shell/ChatDrawer.tsx
  - web/src/routes/PresentationMaker.tsx
  - web/src/data/helpContent.ts
- Tests:
  - tests/test_dashboard_assistant.py
  - tests/test_assistant_model_catalog.py
  - web/src/test/chatApi.test.ts
  - web/src/test/chatDrawer.test.tsx
  - web/src/test/buddy.test.tsx

Primary implementation goals:
1. Preserve the current API contract.
   - Keep GET /api/chat/status working.
   - Keep GET /api/assistant/status working.
   - Keep GET /api/assistant/freshness working.
   - Keep POST /api/chat working.
   - Keep POST /api/assistant/chat working.
   - Keep presentation planning flows working if they share the assistant runtime.
2. Preserve repository-specific grounding.
   - Keep the existing context-building, citation extraction, REDCap status awareness, readings grounding, and short-circuit answer logic.
   - Replace only the underlying text-generation backend.
3. Remove stale local-model assumptions.
   - Remove dependence on llama.cpp runtime loading.
   - Remove GGUF download assumptions.
   - Remove Hugging Face token logic from the main assistant path.
   - Remove or heavily simplify model ladder logic.
   - Remove stale “no API needed” documentation.
4. Keep the public dashboard alive during failures.
   - Assistant failures must degrade gracefully.
   - Core dashboard pages must load even if the AI provider is failing.
   - Pages and Cloudflare wrapper behavior must still function.

Detailed work items:

A. Backend provider refactor
- Introduce a small provider abstraction for the assistant.
- Implement a hosted NVIDIA OpenAI-compatible provider as the default.
- Optionally support a self-hosted NIM provider via the same abstraction.
- Do not scatter direct raw HTTP calls across the assistant code.
- Preserve streaming support.
- Preserve short-circuit non-model answers where already implemented.
- Keep citations and grounded context behavior.

B. Status and health model redesign
- Replace local-only readiness states such as model-missing with provider-based states.
- Add explicit states such as:
  - ready
  - disabled
  - credentials-missing
  - provider-unreachable
  - rate-limited
  - degraded
  - timeout
- Preserve freshness reporting for cluster context.
- If older frontend code expects model_dir, model_file, or model_path, either:
  - keep them nullable, or
  - migrate all consumers safely without breaking the UI.

C. Remove obsolete local-model clutter
- Remove or deprecate the GGUF catalog in dashboard/assistant/model_catalog.py.
- Remove or repurpose config/llm_model.json.
- Remove or rewrite scripts/prepare_dashboard_assistant.py so it validates provider readiness instead of downloading local weights.
- Remove Hugging Face download logic from the default assistant path.
- Remove obsolete docs and comments that claim the assistant is local-only or no-API.

D. Dependency updates
- Remove unneeded dependencies tied to the old local model path, including llama-cpp and huggingface download logic if no longer required.
- Add the minimal supported OpenAI-compatible client dependency for NVIDIA integration.
- Add retry-safe HTTP support only if needed.
- Keep the dependency surface small and production-friendly.

E. Environment and config integration
- Wire the assistant to use the new NVIDIA env vars as canonical configuration.
- Preserve OPENAI_BASE_URL and OPENAI_API_KEY aliases for compatibility.
- Keep secrets out of tracked files.
- Update .env.example comments to explain hosted default versus optional self-hosted NIM.

F. Docker integration
- Update docker/dashboard/Dockerfile and any compose files so the assistant can run with the hosted provider.
- Remove build assumptions for local GGUF downloads if they are no longer needed.
- Ensure container startup does not fail when the provider is temporarily unavailable; the app should boot and report degraded assistant state instead.
- Add health checks that distinguish app health from assistant provider health.

G. Kubernetes integration
- Update Helm values, ConfigMap, Secret, and deployment templates to pass the new env vars cleanly.
- Store the NVIDIA key only in Secret-based injection.
- Ensure rollout does not fail if the provider is slow during startup.
- Do not make pod readiness depend on a successful live model generation call.
- If you add a separate NIM deployment option, make it clearly optional and disabled by default.

H. Cloudflare and public dashboard integration
- Preserve the current Cloudflare Pages wrapper and backend-origin packaging flow.
- Ensure /api chat calls continue to route to the live backend origin.
- Update any stale assistant copy that still advertises local GGUF behavior.
- Ensure fallback-assistant semantics remain consistent or are updated everywhere together.
- Verify scripts/share_dashboard.sh and scripts/build_pages_site.py continue to work with the new hosted provider model.

I. Frontend integration
- Update assistant status labels and help text to describe the NVIDIA-hosted assistant rather than a local GGUF model.
- Preserve streaming UX.
- Preserve graceful error states in the chat drawer and Buddy assistant surfaces.
- Avoid exposing raw provider internals or reasoning traces in the UI unless explicitly intended.

J. Automation and scripts
- Update Makefile assistant-related targets to reflect provider validation rather than local model downloads.
- Ensure automation scripts fail clearly on missing secrets and degrade cleanly on provider outages.
- Keep continuous workflows working without hardcoded secrets.

K. Tests and validation
- Update or replace tests that are hardwired to local GGUF assumptions.
- Add backend tests for:
  - env parsing
  - provider selection
  - assistant degraded states
  - retries and timeout behavior
  - streaming response handling
  - preserved short-circuit answers
- Add frontend tests for assistant status and degraded UI states.
- Validate at minimum:
  - targeted Python tests
  - targeted frontend tests
  - docker compose config rendering
  - helm template rendering
  - assistant status smoke path

Acceptance criteria:
1. The dashboard boots locally without requiring GGUF weights.
2. The assistant uses the NVIDIA hosted endpoint by default.
3. The assistant still returns grounded answers with existing repo context and citations.
4. The app remains usable when the AI provider is down.
5. Docker configuration renders successfully with the new env contract.
6. Kubernetes templates render successfully with secret-based NVIDIA config.
7. Cloudflare Pages packaging and share scripts still function.
8. Old Hugging Face and llama.cpp assumptions are removed or clearly deprecated.
9. The repo docs explain the hosted default and optional future self-hosted NIM path.
10. No tracked file contains the live NVIDIA API key.

Operational guardrails:
- Never hardcode the real key.
- Never log the key.
- Never expose the key to the browser.
- Never claim unlimited provider capacity.
- Implement sane retry and timeout behavior.
- Keep the assistant optional from the dashboard’s perspective.
- Make the migration minimal, coherent, and production-safe rather than sprawling.

Deliverables:
- backend provider refactor completed
- env-based NVIDIA configuration completed
- docker and compose configs updated
- helm deployment and secret wiring updated
- cloudflare and share scripts updated if needed
- frontend assistant copy and status updated
- tests updated and passing for the touched surfaces
- documentation updated with runbook and deployment notes

When done, provide:
- a concise summary of changed files
- validation commands that were run and their results
- any remaining risks or follow-up items
```