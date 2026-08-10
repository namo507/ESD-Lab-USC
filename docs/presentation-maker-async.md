# Presentation Maker: async generation and provider tuning

Presentation Maker uses the same grounded local-first provider chain as chat, but keeps
long-running deck planning behind an asynchronous job API so Cloudflare and
browser requests do not stay open for the full generation.

## Async API flow

- `POST /api/presentation/jobs` validates the PHI-scrubbed concept and options,
  persists a queued job in `dashboard/data/presentation_jobs.sqlite3`, starts a
  background worker, and returns `202` with `job_id`, `status`, timestamps, and
  a progress message.
- `GET /api/presentation/jobs/{job_id}` returns the current job. The unchanged
  `{ plan: DeckPlan }` result appears only after success. Failed and expired jobs
  expose only sanitized errors.
- Responses may include `poll_after_ms`; the frontend follows that cadence and
  stops polling at a terminal state.
- The store is TTL- and size-bounded. Heartbeats allow stale in-progress jobs to
  be recovered after a process restart.
- `POST /api/presentation/plan` remains as a synchronous compatibility path.

The provider's bounded-concurrency queue is shared with chat. A deck job no
longer depends on a local model lock or a GGUF file, but it can still report a
temporary busy/degraded state when capacity, rate limits, or the circuit breaker
prevent immediate generation.

## Frontend behavior

`usePresentationJob` creates and polls jobs through the same backend/Pages proxy
used by chat. It preserves form state across queued, running, failed, and retry
states. The concept is PHI-scrubbed before transmission and audited once on job
creation, not on every poll. PPTX export remains client-side after the final
plan arrives.

Mock mode simulates the job lifecycle. Live-assistant mode bypasses presentation
mocks so requests reach the Python runtime or the Pages `/api` worker proxy.
Neither frontend mode receives a provider key or model endpoint.

## Provider and plan normalization

Planning uses Docker Model Runner/Qwen first and hosted NVIDIA Nemotron only if
the local call fails before output. Optional self-hosted NIM uses the same
OpenAI-compatible adapter only when explicitly enabled. JSON-plan repair may
make a second completion, but each completion follows the same ordered chain.

`DASHBOARD_PRESENTATION_JSON_MODE=true` requests a structured JSON response when
the configured endpoint supports it. The planner still extracts and repairs
ordinary text responses, then `normalize_deck_plan` deterministically enforces
the stable contract:

- title and recap boundaries
- two to four concept slides plus optional analogy/worked example
- five-bullet limit
- grounded citations at deck and slide level
- explicit disclaimer for ungrounded general explanations

Relevant controls:

```dotenv
DASHBOARD_PRESENTATION_JSON_MODE=true
DASHBOARD_PRESENTATION_MAX_TOKENS=768
DASHBOARD_PRESENTATION_CONTEXT_CAP=1200
DASHBOARD_PRESENTATION_JOB_TTL_SECONDS=900
DASHBOARD_PRESENTATION_JOB_MAX=64
DASHBOARD_PRESENTATION_JOB_LOCK_TIMEOUT=180
```

Provider timeout, retry, queue, and circuit-breaker settings are shared with
chat and documented in `docs/dashboard_ai_assistant.md`.

## Evaluation

The benchmark script is provider-oriented and never runs a live request unless
explicitly requested:

```bash
python3 scripts/benchmark_presentation_planner.py
python3 scripts/benchmark_presentation_planner.py --live
```

The default mode validates configuration and deterministic plan fixtures. Live
mode requires configured credentials, sends the documented benchmark concepts,
and reports latency, valid-plan rate, and grounding behavior. Treat it as a
metered provider operation.

## Operational limits

- Provider quotas and rate limits cannot be removed; retry/backoff and degraded
  states keep the UI stable.
- Jobs are safe across workers that share the SQLite path. A multi-host
  deployment would need an external store such as Postgres or Redis.
- Client cancellation closes streams; retries never resume after content has
  already been emitted.
- Provider reasoning output is not included in plans or browser responses.
