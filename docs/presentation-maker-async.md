# Presentation Maker: async generation + planner tuning

This note describes the async transport that makes public deck generation work
through the Cloudflare Pages proxy without a single long blocking request, and
the model/runtime tuning that speeds up planning without hurting plan quality.

## Why this changed

The original flow sent one synchronous `POST /api/presentation/plan` that blocked
while the local GGUF model produced the whole deck. That request held the shared
assistant lock for the full generation and could exceed the public edge timeout,
so a slow plan would fail and also stall chat. The fix splits transport from
plan quality: a fast create call plus short polls, with the model lock acquired
only inside a background worker.

## Async API flow

- `POST /api/presentation/jobs` validates `concept` + `options`, creates an
  persisted job (`status: queued`) in `dashboard/data/presentation_jobs.sqlite3`,
  starts a daemon worker, and returns `202`
  with `{ job_id, status, created_at, progress_message }`. It never touches the
  model, so creation is immediate and never fails just because a generation is
  already running.
- `GET /api/presentation/jobs/{job_id}` returns the current job. `result` (the
  unchanged `{ plan: DeckPlan }` envelope) appears only on `succeeded`; a clean,
  user-safe `error` appears only on `failed`/`expired`. Unknown or expired ids
  return `404` with `{ status: "expired" }`.
- Each job response can include `poll_after_ms`, so the frontend follows a
  server-driven poll cadence instead of a hardcoded 1.2s loop.
- The worker sets `running`, acquires `ASSISTANT_CHAT_LOCK` with a timeout
  (`PRESENTATION_JOB_LOCK_TIMEOUT`, default 180s) right before generation, calls
  `DashboardChatAssistant.plan_presentation`, then records `succeeded` with the
  result or `failed` with a clean message. Raw model text is never surfaced.
- `PresentationJobStore` is SQLite-backed, TTL-bounded (`PRESENTATION_JOB_TTL_SECONDS`,
  default 15 min) and size-bounded (`PRESENTATION_JOB_MAX`, default 64), pruning
  expired then oldest jobs so the registry cannot grow without limit. Worker
  heartbeats let the store re-queue stale jobs after a restart and resume them
  on the next startup or poll.
- `POST /api/presentation/plan` is kept as a synchronous compatibility path. The
  public UI no longer depends on it.

Chat behavior and `/api/assistant/*` are unchanged. Chat still uses a
non-blocking lock acquire, so while a job is generating, chat reports the
existing "model busy" state rather than blocking.

### Frontend

`usePresentationJob` (React Query) creates the job, then polls
`GET .../jobs/{id}` on the server-provided cadence (`poll_after_ms`) and stops
automatically on `succeeded`/`failed`/`expired`. The concept is PHI-scrubbed
before it leaves the browser and the
action is audited exactly once on creation, never on polls. Form inputs are held
in component state, so queued/generating/failed states and retry never lose the
concept or options. PPTX export stays fully client-side once the final plan
arrives. In `VITE_USE_MOCKS` dev/preview the mock server simulates the job
lifecycle (queued, then running, then succeeded); live-assistant mode bypasses
the mock for `/api/presentation/jobs*` so it reaches the real Python server (or
the Pages `/api` worker proxy).

## Model / runtime choice

Planning runs on the same env-driven `AssistantConfig` stack as chat. The active
local model is **SmolLM2-360M-Instruct-Q2_K** (see `.env.example`), which is the
smallest, fastest checkpoint that fits constrained CPU containers and is the one
present in `models/`. `config/llm_model.json` keeps Qwen2.5-0.5B variants as the
accuracy-leaning fallbacks for roomier hosts.

The key accuracy+speed lever is **JSON mode**: when supported, planning passes
`response_format={"type": "json_object"}` to `create_chat_completion`, which
constrains decoding to valid JSON via grammar. That raises the valid-plan rate
and trims wasted prose tokens. If the installed `llama-cpp-python` predates the
kwarg, `_complete_text` transparently falls back to the existing extract-and-
repair path, so nothing breaks. Tunable knobs (all env-driven, defaults shown):

- `DASHBOARD_PRESENTATION_JSON_MODE=true`
- `DASHBOARD_PRESENTATION_MAX_TOKENS=768`
- `DASHBOARD_PRESENTATION_CONTEXT_CAP=1200`

Server-side `normalize_deck_plan` still owns structure, so a smaller/looser model
output is deterministically repaired into the stable `DeckPlan` contract: title,
why, two to four concept slides, optional analogy and worked example, recap, the
five-bullet cap, ungrounded disclaimers, and grounded citations at deck and
slide level.

## Benchmarking

`scripts/benchmark_presentation_planner.py` sweeps the models in
`config/llm_model.json` (plus any `--model` paths) over six representative
concepts (grounded NANO topics and deliberately general ones), reporting
per-model latency, valid-plan rate, and grounding correctness, and printing a
recommendation. Add `--compare-json-mode` to measure JSON mode on vs off. It
only runs models whose GGUF is present locally and requires `llama-cpp-python`,
so run it on the target host:

```
python scripts/benchmark_presentation_planner.py --compare-json-mode
```

## Limitations / follow-ups

- Jobs now survive process restarts and can be polled across multiple workers on
  the same shared filesystem because transport state lives in SQLite. The next
  step, only if the dashboard ever spans multiple hosts, would be an external
  store such as Postgres or Redis.
- Real latency numbers depend on host CPU and the chosen GGUF; capture them with
  the benchmark script on the deployment host.
- Poll cadence is server-driven and can be tuned with the `DASHBOARD_PRESENTATION_POLL_*`
  env vars without changing the UI contract.
