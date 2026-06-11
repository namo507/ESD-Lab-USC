# ESD Buddy — Full-Stack AI Chatbot: Complete Implementation Prompt

> **Target repository:** `namo507/ESD-Lab-USC` · **Live site:** https://esd-lab-namo.pages.dev/  
> **Design reference:** `Design Ideas/Dashboard ESD_Buddy Feature/` in the repo  
> **Scope:** 10 sequential implementation tasks across Phase 1 (Backend/Automation) and Phase 2 (Frontend/UI), fused with the exact visual language from `v2/buddy.jsx`, `v2/scenes-chat.jsx`, and `v2/styles.css`.

***

## Role & Mandate

Act as a Principal Full-Stack AI Engineer and Systems Architect. You are implementing a persistent, full-featured local AI chatbot panel — branded **ESD Buddy** — into the live NANO clinical research dashboard at `namo507/ESD-Lab-USC`. The chatbot surfaces two interactive personas simultaneously:

1. **Buddy** — a floating, animated SVG character (jellybean body, tracking pupils, USC Gold antenna dot, garnet heart-pulse) that intercepts `data-insight` hover events anywhere on the page and pops a glass speech bubble explaining the hovered term.
2. **ChatPanel** — a 420px right-side glass drawer with full conversational AI, seeded with the NANO Study system prompt, streaming NDJSON responses from a local GGUF model, and hardened with PHI scrubbing and audit logging.

Both components are already fully designed in the repo's design prototype files. **You are porting them verbatim into the production TypeScript/React codebase — do not improvise visuals.** Every pixel decision is load-bearing.

***

## Stack, Tokens & Non-Negotiable Constraints

### Tech Stack
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS. Routing via React Router v6 (`<AppShell>`). State via Zustand (`web/src/store/ui.ts`). API client via `web/src/api/client.ts`.
- **Backend:** Python Flask/FastAPI with `llama-cpp-python` for local GGUF model inference.
- **Styling source of truth:** `web/src/styles/tokens.css`. Every Tailwind color must resolve to a token — zero hex literals in component files.

### USC Brand Tokens (from `v2/styles.css`)
```css
--usc-garnet: #73000a;
--usc-garnet-600: #8b1b25;
--usc-garnet-800: #560008;
--usc-gold: #ffcc00;
--usc-gold-tint: #fff4bf;
--ink: #1a1815;
--cream: #faf6ee;       /* page background */
--cream-2: #f6f1e6;
--warm-300: #c9c0b1;
--warm-400: #a59c8d;
--warm-500: #807969;
--warm-600: #5a5447;
--warm-700: #3d3a31;
--peach: #f3c9a8;
--peach-soft: #fbe3cf;
--sage-soft: #dde6d6;
--ocean-soft: #d4e0ec;
--glass-100: rgba(255,255,255,0.42);
--glass-200: rgba(255,255,255,0.58);
--glass-300: rgba(255,255,255,0.72);
--glass-400: rgba(255,255,255,0.85);
--glass-stroke: rgba(255,255,255,0.55);
--glass-stroke-soft: rgba(255,255,255,0.28);
--ease-sharp: cubic-bezier(0.2,0,0,1);
--ease-soft: cubic-bezier(0.32,0.72,0,1);
--ease-back: cubic-bezier(0.34,1.56,0.64,1);
--r-card: 22px;
--r-pill: 999px;
--r-input: 12px;
--r-glass: 28px;
```

### Typography Rules (from `COPILOT_INTEGRATION_PROMPT.md`)
- **Source Serif 4** — page titles, h1, KPI value numerals, lede passages.
- **Source Sans 3 / Inter** — h2/h3/h4, body, UI labels, dense tabular data.
- **JetBrains Mono** — every number, ID, timestamp, metric value. Always `font-feature-settings: 'tnum' 1`.
- Lucide icons everywhere: `strokeWidth={1.5}` **strictly**.

### Security Constraints (NON-NEGOTIABLE)
- Every user prompt **MUST** call `scrubPhi()` from `web/src/lib/phiScrub.ts` before transmission.
- Every AI request **MUST** call `logAudit({ action: 'run.trigger' })` from `web/src/lib/audit.ts`.
- Session data: **SessionStorage only** — never LocalStorage.
- No `console.log` of participant data. No PHI in URLs or query strings.
- HIPAA banner mandatory on every authenticated route, non-dismissible in production.

### Git Hygiene (NON-NEGOTIABLE)
- Never commit binary files, `.gguf` weights, or downloaded model folders.
- `.gitignore` must exclude `models/`, `*.gguf`, `*.safetensors`, local config overrides.

***

## Complete File Structure

```
ESD-Lab-USC/
├── .github/
│   └── workflows/
│       └── sync_local_llm.yml                 ← Task 1
├── scripts/
│   └── select_best_local_llm.py               ← Task 2
├── config/
│   └── llm_model.json                         ← Task 3
├── dashboard/
│   └── server/
│       └── live_dashboard_server.py           ← Task 4 (modified)
├── .env.example                               ← Task 5 (modified)
├── dashboard/requirements-dashboard.txt       ← Task 5 (modified)
├── .gitignore                                 ← Task 5 (modified)
└── web/src/
    ├── styles/
    │   └── tokens.css                         ← existing, do not modify
    ├── lib/
    │   ├── phiScrub.ts                        ← existing, do not modify
    │   ├── audit.ts                           ← existing, do not modify
    │   └── glossary.ts                        ← existing (add Buddy terms if absent)
    ├── api/
    │   ├── client.ts                          ← existing
    │   └── chatApi.ts                         ← Task 6 (new)
    ├── store/
    │   └── ui.ts                              ← Task 7 (modified)
    └── components/
        └── shell/
            ├── AppShell.tsx                   ← Task 9 (modified)
            ├── TopNav.tsx                     ← Task 10 (modified)
            ├── ChatDrawer.tsx                 ← Task 8 (new)
            ├── ChatDrawer.module.css          ← Task 8 (new)
            ├── Buddy.tsx                      ← new (Buddy character)
            └── Buddy.module.css               ← new (Buddy styles)
```

***

## Phase 1 — Automation & Backend Architecture

### Task 1 — `.github/workflows/sync_local_llm.yml`

Create the GitHub Actions workflow that keeps `config/llm_model.json` fresh automatically.

**Requirements:**
- Triggers: `workflow_dispatch` (manual), weekly `cron: '0 2 * * 1'` (Mondays 02:00 UTC), and `push` events that modify `scripts/select_best_local_llm.py`.
- Steps: checkout repo → set up Python 3.11 → install `requests` and `huggingface-hub` → run `python scripts/select_best_local_llm.py` → commit and push changes to `config/llm_model.json` only if the file changed (use `git diff --exit-code` to guard).
- Commit message: `chore: update llm_model.json [skip ci]`
- Use `GITHUB_TOKEN` for the push step — no additional secrets required.

```yaml
name: Sync Local LLM Config

on:
  workflow_dispatch:
  schedule:
    - cron: '0 2 * * 1'
  push:
    paths:
      - 'scripts/select_best_local_llm.py'

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install deps
        run: pip install requests huggingface-hub>=0.23.0

      - name: Run model selector
        run: python scripts/select_best_local_llm.py
        env:
          HF_TOKEN: ${{ secrets.HF_TOKEN }}

      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git diff --exit-code config/llm_model.json || (
            git add config/llm_model.json &&
            git commit -m "chore: update llm_model.json [skip ci]" &&
            git push
          )
```

***

### Task 2 — `scripts/select_best_local_llm.py`

**Full implementation:**

```python
#!/usr/bin/env python3
"""
select_best_local_llm.py
Queries the Hugging Face Hub for GGUF instruct/chat models ≤ 8B parameters.
Scores candidates and writes config/llm_model.json.
"""
from __future__ import annotations
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

FALLBACK_MODELS = [
    {
        "repo_id": "bartowski/Qwen2.5-1.5B-Instruct-GGUF",
        "filename": "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
        "params_b": 1.5,
        "context_length": 32768,
        "reason": "fallback-primary: ultra-fast, fits 2 GB VRAM",
    },
    {
        "repo_id": "bartowski/Llama-3.2-3B-Instruct-GGUF",
        "filename": "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
        "params_b": 3.0,
        "context_length": 8192,
        "reason": "fallback-secondary: stronger reasoning",
    },
    {
        "repo_id": "bartowski/Qwen2.5-7B-Instruct-GGUF",
        "filename": "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
        "params_b": 7.0,
        "context_length": 32768,
        "reason": "fallback-tertiary: largest allowable size",
    },
]

HF_API = "https://huggingface.co/api/models"
OUTPUT = Path(__file__).parent.parent / "config" / "llm_model.json"


def score(model: dict[str, Any]) -> float:
    """
    Weighted score favouring downloads, recency, and size efficiency.
    Score = 0.50 * norm_downloads + 0.30 * norm_recency + 0.20 * norm_size_eff
    """
    downloads = model.get("downloads", 0) or 0
    # Recency: days since last modified (lower = better); cap at 365 days
    last_mod = model.get("lastModified", "")
    try:
        dt = datetime.fromisoformat(last_mod.replace("Z", "+00:00"))
        days_old = max(0.0, (datetime.now(timezone.utc) - dt).days)
    except Exception:
        days_old = 365.0
    recency = max(0.0, 1.0 - days_old / 365.0)
    # Size efficiency: prefer smaller models (1B scores 1.0, 8B scores ~0.125)
    size_b = _extract_params(model) or 4.0
    size_eff = 1.0 / max(0.5, size_b)
    return 0.50 * min(1.0, downloads / 1_000_000) + 0.30 * recency + 0.20 * size_eff


def _extract_params(model: dict[str, Any]) -> float | None:
    tags = model.get("tags", [])
    for tag in tags:
        for suffix in ["b", "B"]:
            t = tag.rstrip(suffix)
            try:
                v = float(t)
                if 0.1 < v <= 8.0:
                    return v
            except ValueError:
                continue
    return None


def fetch_candidates() -> list[dict[str, Any]]:
    headers = {}
    if tok := os.getenv("HF_TOKEN"):
        headers["Authorization"] = f"Bearer {tok}"
    params = {
        "filter": "gguf",
        "search": "instruct",
        "sort": "downloads",
        "direction": -1,
        "limit": 100,
    }
    try:
        resp = requests.get(HF_API, params=params, headers=headers, timeout=20)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        print(f"[warn] HF API request failed: {exc}")
        return []


def main() -> None:
    candidates = fetch_candidates()
    eligible = [m for m in candidates if (_extract_params(m) or 9.0) <= 8.0]
    eligible.sort(key=score, reverse=True)

    if eligible:
        best = eligible
        repo_id = best.get("id", "")
        # Pick Q4_K_M quantisation as default; fall back to first sibling
        filename = f"{repo_id.split('/')[-1]}-Q4_K_M.gguf"
        result = {
            "repo_id": repo_id,
            "filename": filename,
            "params_b": _extract_params(best),
            "context_length": 4096,
            "score": round(score(best), 4),
            "selected_at": datetime.now(timezone.utc).isoformat(),
            "source": "hf-api",
            "fallbacks": FALLBACK_MODELS,
        }
    else:
        print("[warn] No eligible models found via API — using primary fallback.")
        result = {
            **FALLBACK_MODELS,
            "selected_at": datetime.now(timezone.utc).isoformat(),
            "source": "fallback",
            "fallbacks": FALLBACK_MODELS[1:],
        }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(f"[ok] Wrote {OUTPUT}: {result['repo_id']}")


if __name__ == "__main__":
    main()
```

***

### Task 3 — `config/llm_model.json`

Initial configuration seeded with the Qwen2.5-1.5B model. This file is managed by the GitHub Action and should never be edited manually.

```json
{
  "repo_id": "bartowski/Qwen2.5-1.5B-Instruct-GGUF",
  "filename": "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
  "params_b": 1.5,
  "context_length": 32768,
  "score": null,
  "selected_at": "2026-01-01T00:00:00+00:00",
  "source": "manual-seed",
  "fallbacks": [
    {
      "repo_id": "bartowski/Llama-3.2-3B-Instruct-GGUF",
      "filename": "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
      "params_b": 3.0,
      "context_length": 8192,
      "reason": "fallback-secondary"
    },
    {
      "repo_id": "bartowski/Qwen2.5-7B-Instruct-GGUF",
      "filename": "Qwen2.5-7B-Instruct-Q4_K_M.gguf",
      "params_b": 7.0,
      "context_length": 32768,
      "reason": "fallback-tertiary"
    }
  ]
}
```

***

### Task 4 — `dashboard/server/live_dashboard_server.py` (additions)

Add the following two routes to the existing Flask/FastAPI server. Integrate `DashboardChatAssistant` as a module-level singleton, protected by a `threading.Semaphore(1)` concurrency guard.

**Complete additions (paste after existing route definitions):**

```python
# ── AI Assistant ─────────────────────────────────────────────────────────────
import json
import pathlib
import threading

from llama_cpp import Llama

_CONFIG_PATH = pathlib.Path(__file__).parents / "config" / "llm_model.json"
_MODEL_DIR   = pathlib.Path(__file__).parents / "models"
_LLM_LOCK    = threading.Semaphore(1)
_llm: "Llama | None" = None
_llm_error: "str | None" = None


def _load_llm() -> "Llama":
    global _llm, _llm_error
    if _llm is not None:
        return _llm
    try:
        cfg = json.loads(_CONFIG_PATH.read_text())
        model_path = _MODEL_DIR / cfg["filename"]
        if not model_path.exists():
            from huggingface_hub import hf_hub_download
            hf_hub_download(
                repo_id=cfg["repo_id"],
                filename=cfg["filename"],
                local_dir=str(_MODEL_DIR),
            )
        _llm = Llama(
            model_path=str(model_path),
            n_ctx=cfg.get("context_length", 4096),
            n_threads=os.cpu_count() or 4,
            verbose=False,
        )
        _llm_error = None
    except Exception as exc:
        _llm_error = str(exc)
        raise
    return _llm


class DashboardChatAssistant:
    """Thin wrapper around llama-cpp-python with NANO study system prompt."""

    SYSTEM = (
        "You are the ESD Lab Assistant — an embedded helper inside the NANO Study "
        "research dashboard at the University of South Carolina's Early Social "
        "Development Lab (Dr. Jessica Bradshaw, PI). "
        "Answer questions about the study, measurements, results, model, and pipeline. "
        "Be concise (2-4 short paragraphs). Define acronyms once. "
        "Never invent statistics. If asked about something unknowable from study "
        "materials, say so plainly. HIPAA: never repeat participant identifiers."
    )

    def stream(self, message: str, history: list[dict]) -> "Generator[str, None, None]":
        llm = _load_llm()
        msgs = [{"role": "system", "content": self.SYSTEM}]
        for h in history[-6:]:  # keep last 6 turns to stay within context
            msgs.append({"role": h["role"], "content": h["content"]})
        msgs.append({"role": "user", "content": message})

        for chunk in llm.create_chat_completion(
            messages=msgs,
            stream=True,
            max_tokens=512,
            temperature=0.7,
            top_p=0.9,
        ):
            delta = chunk["choices"]["delta"].get("content", "")
            if delta:
                yield delta


_assistant = DashboardChatAssistant()


# Flask routes ────────────────────────────────────────────────────────────────
@app.post("/api/assistant/chat")          # adjust decorator to your framework
def assistant_chat():
    import flask
    body = flask.request.get_json(force=True, silent=True) or {}
    message = (body.get("message") or "").strip()
    history  = body.get("history", [])

    if not message:
        return flask.Response('{"error":"empty message"}', status=400,
                              mimetype="application/json")

    def generate():
        acquired = _LLM_LOCK.acquire(blocking=False)
        if not acquired:
            yield json.dumps({"error": "model busy — another request in flight"}) + "\n"
            return
        try:
            for delta in _assistant.stream(message, history):
                yield json.dumps({"delta": delta}) + "\n"
            yield json.dumps({"done": True}) + "\n"
        except Exception as exc:
            yield json.dumps({"error": str(exc)}) + "\n"
        finally:
            _LLM_LOCK.release()

    return flask.Response(generate(), mimetype="application/x-ndjson")


@app.get("/api/assistant/status")
def assistant_status():
    import flask
    status = "error" if _llm_error else ("ready" if _llm else "unloaded")
    return flask.jsonify({
        "status": status,
        "error": _llm_error,
        "model": json.loads(_CONFIG_PATH.read_text()).get("repo_id") if _CONFIG_PATH.exists() else None,
    })
```

***

### Task 5 — Environment & Dependencies

**`.env.example` additions:**
```bash
# ── Local LLM (ESD Buddy) ────────────────────────────────────────────────
LLM_MODEL_DIR=./models
LLM_N_THREADS=4
LLM_N_CTX=32768
LLM_MAX_TOKENS=512
LLM_TEMPERATURE=0.7
HF_TOKEN=                    # Optional: raises HF rate limits
```

**`dashboard/requirements-dashboard.txt` additions:**
```
llama-cpp-python>=0.2.90
huggingface-hub>=0.23.0
requests>=2.31.0
```

**`.gitignore` additions:**
```gitignore
# ── Local LLM weights (never commit) ────────────────────────────────────
models/
*.gguf
*.safetensors
*.bin
config/llm_model.local.json
.env.local
```

***

## Phase 2 — Frontend Integration & UI

### Task 6 — `web/src/api/chatApi.ts`

```typescript
import { scrubPhi } from '../lib/phiScrub';
import { logAudit } from '../lib/audit';
import { apiClient } from './client';

// ── Types ────────────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantStatus {
  status: 'ready' | 'unloaded' | 'error';
  error: string | null;
  model: string | null;
}

export interface ChatStreamChunk {
  delta?: string;
  done?: boolean;
  error?: string;
}

// ── streamChat ───────────────────────────────────────────────────────────────
/**
 * Scrubs PHI, logs the audit event, then streams NDJSON chunks from the
 * /api/assistant/chat endpoint. Yields each delta string as it arrives.
 * Throws on HTTP errors or model-busy responses.
 */
export async function* streamChat(
  message: string,
  history: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const cleanMessage = scrubPhi(message);

  // Audit before network — audit must always fire even if request fails
  logAudit({ action: 'run.trigger', detail: 'assistant.chat', timestamp: Date.now() });

  const response = await apiClient.post('/api/assistant/chat', {
    body: JSON.stringify({ message: cleanMessage, history }),
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const chunk: ChatStreamChunk = JSON.parse(trimmed);
        if (chunk.error) throw new Error(chunk.error);
        if (chunk.delta) yield chunk.delta;
        if (chunk.done) return;
      } catch (err) {
        if (err instanceof SyntaxError) continue; // partial line — skip
        throw err;
      }
    }
  }
}

// ── fetchAssistantStatus ─────────────────────────────────────────────────────
export async function fetchAssistantStatus(): Promise<AssistantStatus> {
  const response = await apiClient.get('/api/assistant/status');
  if (!response.ok) throw new Error(`Status check failed: ${response.status}`);
  return (await response.json()) as AssistantStatus;
}
```

***

### Task 7 — `web/src/store/ui.ts` (modification)

Add `chatOpen` boolean and its toggle to the existing Zustand store. Only the **diff** is shown — integrate into the existing store file without removing existing state slices.

```typescript
// Add to the existing Zustand store interface:
interface UiState {
  // ... existing fields ...
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  toggleChat: () => void;
}

// Add to the zustand create() call:
chatOpen: false,
setChatOpen: (open) => set({ chatOpen: open }),
toggleChat: () => set((state) => ({ chatOpen: !state.chatOpen })),
```

***

### Task 8 — `web/src/components/shell/ChatDrawer.tsx` + `ChatDrawer.module.css`

This is the primary AI panel component. It is a direct TypeScript port of `v2/scenes-chat.jsx` + `v2/buddy.jsx`, styled with `ChatDrawer.module.css` (a TypeScript CSS Module translation of the chat/buddy CSS from `v2/styles.css`).

#### `ChatDrawer.module.css`

```css
/* ── ChatDrawer.module.css ────────────────────────────────────────────── */
/* All values trace back to tokens.css via var(--…). No hex literals.    */

/* ── Chat panel (right-side glass drawer) ──────────────────────────────── */
.panel {
  position: fixed;
  right: 20px;
  bottom: 84px;
  top: 84px;
  width: 420px;
  max-width: calc(100vw - 40px);
  background: var(--glass-400);
  backdrop-filter: blur(28px) saturate(200%);
  -webkit-backdrop-filter: blur(28px) saturate(200%);
  border: 1px solid var(--glass-stroke);
  border-radius: 22px;
  box-shadow: 0 20px 60px -20px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  z-index: 95;
  isolation: isolate;
  transform: translate3d(440px, 0, 0);
  opacity: 0;
  transition: transform 400ms var(--ease-soft), opacity 300ms var(--ease-soft);
  pointer-events: none;
}

.panel.open {
  transform: translate3d(0, 0, 0);
  opacity: 1;
  pointer-events: auto;
}

@media (max-width: 480px) {
  .panel {
    right: 0;
    left: 0;
    bottom: 0;
    top: 0;
    width: 100%;
    max-width: 100%;
    border-radius: 0;
  }
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.head {
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.headTitle {
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 500;
  letter-spacing: -0.01em;
  color: var(--ink);
}

.headSub {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--warm-500);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-top: 2px;
}

.statusPill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  border-radius: var(--r-pill);
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid var(--glass-stroke-soft);
  color: var(--warm-600);
  margin-top: 5px;
}

.statusDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.statusDot.ready   { background: var(--green); box-shadow: 0 0 6px var(--green); }
.statusDot.loading { background: var(--usc-gold); animation: nano-pulse 1.6s ease-in-out infinite; }
.statusDot.error   { background: var(--red); }

.closeBtn {
  width: 28px;
  height: 28px;
  border-radius: var(--r-pill);
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid var(--glass-stroke-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 120ms var(--ease-sharp);
  flex-shrink: 0;
}

.closeBtn:hover { background: rgba(255, 255, 255, 0.85); }
.closeBtn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--cream), 0 0 0 4px var(--usc-gold);
}

/* ── Message thread ──────────────────────────────────────────────────────── */
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scroll-behavior: smooth;
}

.msg {
  display: flex;
  gap: 10px;
  max-width: 95%;
}

.msg.you {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.avatar {
  flex: 0 0 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--cream);
  flex-shrink: 0;
}

.msg.bot .avatar  { background: var(--usc-garnet); }
.msg.you .avatar  { background: var(--ink); }

.bubble {
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid var(--glass-stroke-soft);
  word-wrap: break-word;
  min-width: 0;
}

.msg.you .bubble {
  background: var(--ink);
  color: var(--cream);
  border-color: var(--ink);
}

.thinking {
  font-style: italic;
  color: var(--warm-500);
}

.dots span {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--warm-500);
  margin: 0 1px;
  animation: bounce 1.2s ease-in-out infinite;
}

.dots span:nth-child(2) { animation-delay: 0.15s; }
.dots span:nth-child(3) { animation-delay: 0.30s; }

/* ── Suggestion chips ────────────────────────────────────────────────────── */
.suggestions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 20px 12px;
}

.suggestion {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid var(--glass-stroke-soft);
  border-radius: 12px;
  font-size: 12px;
  color: var(--warm-700);
  text-align: left;
  cursor: pointer;
  line-height: 1.4;
  transition: background 120ms var(--ease-sharp), transform 120ms var(--ease-sharp), color 120ms var(--ease-sharp);
}

.suggestion:hover {
  background: rgba(255, 255, 255, 0.85);
  transform: translateX(3px);
  color: var(--ink);
}

.suggestion:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--cream), 0 0 0 4px var(--usc-gold);
}

.arrow { color: var(--usc-garnet); margin-right: 6px; }

/* ── Input form ──────────────────────────────────────────────────────────── */
.form {
  padding: 12px 20px 18px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.textarea {
  flex: 1;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--glass-stroke);
  border-radius: 18px;
  padding: 10px 14px;
  font: inherit;
  font-size: 13px;
  resize: none;
  max-height: 100px;
  color: var(--ink);
  min-height: 38px;
  line-height: 1.4;
  transition: border-color 120ms var(--ease-sharp);
}

.textarea:focus { outline: none; border-color: var(--usc-garnet); }
.textarea::placeholder { color: var(--warm-400); }

.sendBtn {
  width: 38px;
  height: 38px;
  border-radius: var(--r-pill);
  background: var(--usc-garnet);
  color: var(--cream);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform 120ms var(--ease-sharp), background 120ms var(--ease-sharp);
}

.sendBtn:hover:not(:disabled) { background: var(--usc-garnet-600); transform: scale(1.06); }
.sendBtn:disabled { background: var(--warm-400); cursor: not-allowed; }
.sendBtn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--cream), 0 0 0 4px var(--usc-gold);
}

/* ── Floating Action Button ─────────────────────────────────────────────── */
.fab {
  position: fixed;
  bottom: 28px;
  right: 28px;
  width: 52px;
  height: 52px;
  border-radius: var(--r-pill);
  background: var(--usc-garnet);
  color: var(--cream);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 94;
  box-shadow: 0 6px 24px -6px rgba(115, 0, 10, 0.55);
  transition: transform 180ms var(--ease-back), box-shadow 180ms var(--ease-soft);
}

.fab:hover {
  transform: scale(1.08) translateY(-2px);
  box-shadow: 0 12px 32px -8px rgba(115, 0, 10, 0.65);
}

.fab:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--cream), 0 0 0 4px var(--usc-gold);
}

/* ── Animations ─────────────────────────────────────────────────────────── */
@keyframes nano-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.85); }
}

@keyframes bounce {
  50% { transform: translateY(-4px); opacity: 0.5; }
}
```

#### `ChatDrawer.tsx`

```typescript
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { streamChat, fetchAssistantStatus, AssistantStatus, ChatMessage } from '../../api/chatApi';
import { useUiStore } from '../../store/ui';
import styles from './ChatDrawer.module.css';

// ── NANO Study suggestion chips (from v2/scenes-chat.jsx) ────────────────────
const SUGGESTIONS = [
  'What does the HDA gauge tell me?',
  'Why include preterm infants in an autism study?',
  'How is the risk classifier validated?',
  'What is RMSSD and why does it matter?',
  'Walk me through the data pipeline.',
] as const;

// ── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'you' | 'bot';
  text: string;
  streaming?: boolean;
}

// ── ChatDrawer ───────────────────────────────────────────────────────────────
export function ChatDrawer() {
  const chatOpen = useUiStore((s) => s.chatOpen);
  const setChatOpen = useUiStore((s) => s.setChatOpen);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'bot',
      text: "Hi — I'm the ESD Lab assistant. Ask me about the NANO Study, what's on screen, or any term you're unsure of.",
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AssistantStatus | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch model status on mount ──────────────────────────────────────────
  useEffect(() => {
    fetchAssistantStatus()
      .then(setStatus)
      .catch(() => setStatus({ status: 'error', error: 'Could not reach server', model: null }));
  }, []);

  // ── Auto-scroll to bottom on new message ────────────────────────────────
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, busy]);

  // ── Focus textarea when drawer opens ────────────────────────────────────
  useEffect(() => {
    if (chatOpen) setTimeout(() => textareaRef.current?.focus(), 80);
  }, [chatOpen]);

  // ── Build history for API ────────────────────────────────────────────────
  const buildHistory = useCallback((): ChatMessage[] =>
    messages.slice(-6).map((m) => ({
      role: m.role === 'you' ? 'user' : 'assistant',
      content: m.text,
    })), [messages]);

  // ── Send message ─────────────────────────────────────────────────────────
  const send = useCallback(async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;

    setInput('');
    setBusy(true);

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'you', text: q };
    setMessages((prev) => [...prev, userMsg]);

    const botId = `b-${Date.now()}`;
    setMessages((prev) => [...prev, { id: botId, role: 'bot', text: '', streaming: true }]);

    abortRef.current = new AbortController();

    try {
      const history = buildHistory();
      let accumulated = '';

      for await (const delta of streamChat(q, history, abortRef.current.signal)) {
        accumulated += delta;
        setMessages((prev) =>
          prev.map((m) => m.id === botId ? { ...m, text: accumulated } : m)
        );
      }
      setMessages((prev) =>
        prev.map((m) => m.id === botId ? { ...m, streaming: false } : m)
      );
    } catch (err: unknown) {
      const errorText =
        err instanceof Error && err.name === 'AbortError'
          ? '(cancelled)'
          : `Sorry — that request failed: ${err instanceof Error ? err.message : String(err)}`;
      setMessages((prev) =>
        prev.map((m) => m.id === botId ? { ...m, text: errorText, streaming: false } : m)
      );
    } finally {
      setBusy(false);
    }
  }, [input, busy, buildHistory]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  }, [send]);

  // ── Auto-resize textarea ─────────────────────────────────────────────────
  const onTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
  };

  // ── Status pill ──────────────────────────────────────────────────────────
  const statusLabel = status?.status === 'ready'
    ? `ready · ${status.model?.split('/').pop() ?? 'model'}`
    : status?.status === 'error'
    ? 'offline'
    : 'loading…';

  return (
    <>
      {/* Floating action button */}
      <button
        className={styles.fab}
        onClick={() => setChatOpen(true)}
        aria-label="Open ESD Buddy assistant"
        aria-expanded={chatOpen}
        style={{ display: chatOpen ? 'none' : undefined }}
      >
        <Sparkles size={20} color="var(--usc-gold)" strokeWidth={2} />
      </button>

      {/* Chat panel */}
      <div
        className={`${styles.panel} ${chatOpen ? styles.open : ''}`}
        role="dialog"
        aria-label="ESD Lab Assistant"
        aria-modal="true"
      >
        {/* Header */}
        <div className={styles.head}>
          <div>
            <div className={styles.headTitle}>ESD Lab Assistant</div>
            <div className={styles.headSub}>Grounded in NANO study context</div>
            <div className={styles.statusPill}>
              <span className={`${styles.statusDot} ${styles[status?.status ?? 'loading']}`} />
              {statusLabel}
            </div>
          </div>
          <button
            className={styles.closeBtn}
            onClick={() => setChatOpen(false)}
            aria-label="Close assistant panel"
          >
            <X size={14} strokeWidth={1.5} color="var(--warm-600)" />
          </button>
        </div>

        {/* Message thread */}
        <div className={styles.body} ref={bodyRef} aria-live="polite" aria-atomic="false">
          {messages.map((m) => (
            <div key={m.id} className={`${styles.msg} ${styles[m.role]}`}>
              <div className={styles.avatar} aria-hidden="true">
                {m.role === 'you' ? 'You' : 'AI'}
              </div>
              <div className={styles.bubble}>
                {m.streaming && m.text === ''
                  ? <span className={styles.thinking}>thinking<span className={styles.dots}><span /><span /><span /></span></span>
                  : m.text}
              </div>
            </div>
          ))}
          {busy && messages[messages.length - 1]?.streaming === false && (
            <div className={`${styles.msg} ${styles.bot}`}>
              <div className={styles.avatar} aria-hidden="true">AI</div>
              <div className={`${styles.bubble} ${styles.thinking}`}>
                thinking<span className={styles.dots}><span /><span /><span /></span>
              </div>
            </div>
          )}
        </div>

        {/* Suggestion chips — show only on first visit */}
        {messages.length <= 1 && (
          <div className={styles.suggestions}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className={styles.suggestion}
                onClick={() => send(s)}
                disabled={busy}
              >
                <span className={styles.arrow}>→</span>{s}
              </button>
            ))}
          </div>
        )}

        {/* Input form */}
        <div className={styles.form}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            rows={1}
            placeholder="Ask about the study… (⌘↵ to send)"
            value={input}
            onChange={onTextareaChange}
            onKeyDown={onKeyDown}
            aria-label="Message input"
            disabled={busy}
          />
          <button
            className={styles.sendBtn}
            onClick={() => send()}
            disabled={busy || !input.trim()}
            aria-label="Send message"
          >
            <Send size={15} strokeWidth={1.5} color="currentColor" />
          </button>
        </div>
      </div>
    </>
  );
}
```

***

### Task 8b — `Buddy.tsx` + `Buddy.module.css`

Port the animated SVG Buddy character from `v2/buddy.jsx` into a TypeScript component. The Buddy listens globally for `data-insight` hover events and pops a glass speech bubble.

#### `Buddy.module.css`

```css
/* All values use var(--…) tokens. No hex literals. */

.stage {
  position: fixed;
  left: 24px;
  bottom: 88px;
  z-index: 92;
  width: 260px;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.buddy {
  position: relative;
  width: 88px;
  height: 88px;
  pointer-events: auto;
  cursor: pointer;
  animation: buddy-float 4s var(--ease-soft, cubic-bezier(0.32,0.72,0,1)) infinite;
}

@media (prefers-reduced-motion: reduce) { .buddy { animation: none; } }

.buddy svg { width: 100%; height: 100%; display: block; overflow: visible; }

.body { fill: var(--cream); stroke: var(--ink); stroke-width: 1.5; filter: drop-shadow(0 8px 20px rgba(58,50,38,0.22)); }
.blush { fill: var(--peach); opacity: 0.7; }
.eye { fill: var(--ink); transition: transform 220ms var(--ease-soft, cubic-bezier(0.32,0.72,0,1)); transform-origin: center; }
.buddy.talking .eye { animation: buddy-blink 2.6s var(--ease-soft) infinite; }
.mouth { fill: none; stroke: var(--ink); stroke-width: 1.5; stroke-linecap: round; }
.antenna { fill: none; stroke: var(--usc-garnet); stroke-width: 1.5; stroke-linecap: round; animation: antenna-wig 3s var(--ease-soft) infinite; transform-origin: 50% 100%; }
.buddy.talking .antenna { animation-duration: 1.4s; }
.antennaDot { fill: var(--usc-gold); }
.heartPulse { fill: var(--usc-garnet); opacity: 0; transform-origin: center; }
.buddy.talking .heartPulse { animation: heart-pulse 1.4s var(--ease-soft) infinite; }

.bubble {
  position: relative;
  pointer-events: auto;
  background: var(--glass-400);
  backdrop-filter: blur(22px) saturate(180%);
  -webkit-backdrop-filter: blur(22px) saturate(180%);
  border: 1px solid var(--glass-stroke);
  border-radius: 18px;
  box-shadow: 0 10px 30px -10px rgba(58, 50, 38, 0.18);
  padding: 12px 16px 14px;
  max-width: 240px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--warm-700);
  opacity: 0;
  transform: translateY(8px) scale(0.96);
  transition: opacity 220ms var(--ease-soft), transform 260ms var(--ease-soft);
  margin-left: 18px;
  isolation: isolate;
}

.bubble.show { opacity: 1; transform: translateY(0) scale(1); }

.termTag {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--usc-garnet);
  background: rgba(115, 0, 10, 0.1);
  padding: 2px 8px;
  border-radius: var(--r-pill);
  margin-bottom: 6px;
}

.bodyText { color: var(--ink); }

@keyframes buddy-float {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50%       { transform: translateY(-6px) rotate(2deg); }
}
@keyframes buddy-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  94%, 96%      { transform: scaleY(0.1); }
}
@keyframes antenna-wig {
  0%, 100% { transform: rotate(-4deg); }
  50%      { transform: rotate(6deg); }
}
@keyframes heart-pulse {
  0%, 100% { opacity: 0; transform: scale(0.6); }
  50%       { opacity: 0.85; transform: scale(1.0); }
}
```

#### `Buddy.tsx`

```typescript
import React, { useEffect, useRef, useState } from 'react';
import styles from './Buddy.module.css';

// Insight library — mirrors INSIGHTS map in v2/buddy.jsx
const INSIGHTS: Record<string, { term: string; body: string }> = {
  'kpi-enroll':   { term: 'Enrollment',  body: "231 of 260 infants enrolled across ASIB, VPT, and TD cohorts — 4 new joined this week." },
  'kpi-epochs':   { term: 'Epochs',      body: "Each epoch is a 5-second ECG window. Yesterday the pipeline processed 1,824, +312 over prior 24 h." },
  'kpi-rmssd':    { term: 'RMSSD',       body: "Root-mean-square of successive IBI differences — the vagal-tone marker. Cohort median: 38.4 ms ±0.6." },
  'kpi-redcap':   { term: 'REDCap',      body: "99.8% sync rate over 24 h with zero PHI leaks. PHI columns stripped at the proxy before export." },
  'kpi-auroc':    { term: 'Model',       body: "Held-out AUROC 0.899 on participant-stratified 20% split. SHAP confirms HDA features dominate." },
  'stage-ingest':     { term: 'Ingest',     body: "Raw .ecg files from Actiheart-5 land in encrypted S3. 1024 Hz, single-lead, continuous." },
  'stage-preprocess': { term: 'Preprocess', body: "0.5–40 Hz bandpass + Pan-Tompkins R-peak detection. >20% ectopic windows dropped before HRV." },
  'stage-qa':         { term: 'Window QA',  body: "SQI 0–1 per epoch. <0.4 auto-rejects; 0.4–0.6 surfaces for human review." },
  'stage-hrv':        { term: 'HRV',        body: "Time and frequency domain features per window: RMSSD, SDNN, pNN50, LF, HF, LF/HF." },
  'stage-hda':        { term: 'HDA',        body: "Heart-rate Defined Attention phases: orienting · sustained · inattention · termination." },
  'stage-export':     { term: 'Export',     body: "Drops DOB, MRN, name, address. Writes hash-keyed parquet to data/processed/deidentified/." },
  'gauge':        { term: 'Risk gauge', body: "Live recompute against the trained classifier. Drag any slider — the gauge animates in real time." },
  'pipeline-svg': { term: 'Pipeline',   body: "Six stages from heartbeat to manuscript. Active edges carry animated dashed flow lines." },
};

interface InsightData { term: string; body: string; }

interface BuddySvgProps { talking: boolean; lookX: number; lookY: number; }

function BuddySvg({ talking, lookX, lookY }: BuddySvgProps) {
  const eyeL = { cx: 36, cy: 50 }, eyeR = { cx: 60, cy: 50 };
  const off = (dx: number, dy: number) => {
    const len = Math.sqrt(dx * dx + dy * dy);
    const max = 2.4;
    if (len < 1) return { x: 0, y: 0 };
    return { x: (dx / len) * Math.min(max, len * 0.04), y: (dy / len) * Math.min(max, len * 0.04) };
  };
  const oL = off(lookX - eyeL.cx, lookY - eyeL.cy);
  const oR = off(lookX - eyeR.cx, lookY - eyeR.cy);

  return (
    <svg viewBox="0 0 96 96" aria-hidden="true">
      <g style={{ transformOrigin: '48px 18px' }}>
        <path className={styles.antenna} d="M48 22 Q 50 14 55 8" />
        ircle className={styles.antennaDot} cx="55" cy="8" r="3" />
      </g>
      <ellipse className={styles.body} cx="48" cy="56" rx="32" ry="28" />
      ircle className={styles.blush} cx="22" cy="62" r="5" />
      ircle className={styles.blush} cx="74" cy="62" r="5" />
      <g className={styles.eye} style={{ transform: `translate(${oL.x.toFixed(2)}px, ${oL.y.toFixed(2)}px)` }}>
        ircle cx={eyeL.cx} cy={eyeL.cy} r="3" />
      </g>
      <g className={styles.eye} style={{ transform: `translate(${oR.x.toFixed(2)}px, ${oR.y.toFixed(2)}px)` }}>
        ircle cx={eyeR.cx} cy={eyeR.cy} r="3" />
      </g>
      {talking
        ? <ellipse cx="48" cy="66" rx="5" ry="3.5" fill="var(--ink)" />
        : <path className={styles.mouth} d="M 42 64 Q 48 68 54 64" />}
      <g style={{ transformOrigin: '78px 38px' }}>
        <path className={styles.heartPulse} transform="translate(72 32) scale(0.42)"
          d="M12 21s-7-4.5-9.5-9.2C.7 8.5 2.3 5 5.5 5c1.9 0 3.6 1 4.5 2.5C10.9 6 12.6 5 14.5 5c3.2 0 4.8 3.5 3 6.8C19 16.5 12 21 12 21z" />
      </g>
    </svg>
  );
}

export function Buddy() {
  const [insight, setInsight] = useState<InsightData | null>(null);
  const [hidden, setHidden] = useState(false);
  const [look, setLook] = useState({ x: 48, y: 48 });
  const buddyRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onOver(e: MouseEvent) {
      const target = (e.target as Element).closest('[data-insight]') as HTMLElement | null;
      if (!target) return;
      const id = target.getAttribute('data-insight') ?? '';
      const next = INSIGHTS[id] ?? { term: 'Insight', body: id };
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setInsight(next);
    }
    function onOut(e: MouseEvent) {
      const target = (e.target as Element).closest('[data-insight]');
      if (!target) return;
      hideTimer.current = setTimeout(() => setInsight(null), 600);
    }
    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mouseout', onOut, { passive: true });
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
    };
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const el = buddyRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      setLook({ x: 48 + (e.clientX - cx), y: 48 + (e.clientY - cy) });
    }
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  if (hidden) return null;

  return (
    <div className={styles.stage} aria-live="polite">
      <div
        ref={buddyRef}
        className={`${styles.buddy} ${insight ? styles.talking : ''}`}
        onClick={() => setHidden(true)}
        title="Click to hide Buddy"
        role="presentation"
      >
        <BuddySvg talking={!!insight} lookX={look.x} lookY={look.y} />
      </div>
      <div className={`${styles.bubble} ${insight ? styles.show : ''}`}>
        {insight ? (
          <>
            <span className={styles.termTag}>{insight.term}</span>
            <div className={styles.bodyText}>{insight.body}</div>
          </>
        ) : (
          <div className={styles.bodyText} style={{ color: 'var(--warm-500)' }}>
            Hover any tile and I'll explain it.
          </div>
        )}
      </div>
    </div>
  );
}
```

***

### Task 9 — `web/src/components/shell/AppShell.tsx` (modification)

Add `<ChatDrawer />` and `<Buddy />` at the root level so they persist across all routes. Add the `⌘K` / `Ctrl+K` global shortcut.

```typescript
// In AppShell.tsx, after existing imports:
import { ChatDrawer } from './ChatDrawer';
import { Buddy } from './Buddy';
import { useUiStore } from '../../store/ui';

// Inside the AppShell component, after existing useEffect hooks:
const toggleChat = useUiStore((s) => s.toggleChat);
const setChatOpen = useUiStore((s) => s.setChatOpen);

useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      toggleChat();
    }
    if (e.key === 'Escape') {
      setChatOpen(false);
    }
  }
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}, [toggleChat, setChatOpen]);

// In the AppShell JSX return, at the end (sibling of <Outlet /> or route container):
return (
  <>
    {/* ... existing shell structure: TopNav, Sidebar, <Outlet />, HipaaBanner ... */}
    <Buddy />
    <ChatDrawer />
  </>
);
```

***

### Task 10 — `web/src/components/shell/TopNav.tsx` (modification)

When the global search box receives focus or when `Enter` is pressed, open the ChatDrawer and seed the current input value as the opening message.

```typescript
// In TopNav.tsx, add to existing imports:
import { useUiStore } from '../../store/ui';

// Inside the TopNav component:
const setChatOpen = useUiStore((s) => s.setChatOpen);

// Ref to the search input (add to existing or create new):
const searchRef = useRef<HTMLInputElement>(null);

// Handler that seeds ChatDrawer with the search query:
function openChatWithQuery(query: string) {
  if (query.trim()) {
    // Write query into ChatDrawer's seeded input via sessionStorage bridge
    sessionStorage.setItem('buddy.seed', query.trim());
  }
  setChatOpen(true);
}

// On the search <input> element, add or modify:
<input
  ref={searchRef}
  type="search"
  placeholder="NANO-XXXX, group, visit…"
  aria-label="Global search — opens AI assistant"
  onFocus={(e) => openChatWithQuery(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      openChatWithQuery(e.currentTarget.value);
    }
  }}
  /* ... existing className, etc. */
/>
```

**In `ChatDrawer.tsx`, read the seed on open:**

```typescript
// Add to the useEffect that fires on chatOpen:
useEffect(() => {
  if (chatOpen) {
    const seed = sessionStorage.getItem('buddy.seed');
    if (seed) {
      setInput(seed);
      sessionStorage.removeItem('buddy.seed');
    }
    setTimeout(() => textareaRef.current?.focus(), 80);
  }
}, [chatOpen]);
```

***

## Acceptance Checklist

Before opening a PR, verify **all** of the following:

| # | Check |
|---|-------|
| 1 | `npm run lint` clean (no ESLint errors, no hex literals in component files) |
| 2 | `npm run typecheck` passes with zero errors |
| 3 | `npm run test` covers: `chatApi.streamChat` PHI scrub, audit fire, NDJSON parsing; Zustand `toggleChat` reducer; `Buddy` INSIGHTS lookup |
| 4 | `ChatDrawer` renders on all 7 routes; persists across navigation without remounting |
| 5 | `⌘K` / `Ctrl+K` toggles panel; `Esc` closes it |
| 6 | TopNav search focus → opens drawer and seeds input |
| 7 | Every `scrubPhi()` call fires before any network transmission |
| 8 | Every AI request fires `logAudit({ action: 'run.trigger' })` |
| 9 | Session data written to `sessionStorage` only — no `localStorage` calls |
| 10 | No `.gguf`, `models/`, `.safetensors` files anywhere in the git tree |
| 11 | HIPAA banner present and non-dismissible on all authenticated routes |
| 12 | Lighthouse a11y ≥ 95 on Overview and Participants routes |
| 13 | Focus rings: `2px var(--usc-gold)` at 2px offset on all interactive elements |
| 14 | Buddy `data-insight` events work on at least 5 KPI tiles and all pipeline stage nodes |
| 15 | Backend `/api/assistant/status` returns `{ status: "ready" }` with model loaded |
| 16 | Concurrency guard: second simultaneous POST to `/api/assistant/chat` returns `model busy` error |

***

## Visual Spec Summary (from `v2/styles.css` + `v2/buddy.jsx` + `v2/scenes-chat.jsx`)

| Element | Token / Value |
|---------|--------------|
| Panel background | `var(--glass-400)` · `blur(28px) saturate(200%)` |
| Panel border | `1px solid var(--glass-stroke)` · `border-radius: 22px` |
| Panel slide-in | `translate3d(440px→0, 0, 0)` · `400ms var(--ease-soft)` |
| FAB color | `var(--usc-garnet)` · `border-radius: 999px` · `52×52px` |
| FAB icon | `<Sparkles>` · `color: var(--usc-gold)` · `strokeWidth={2}` |
| Send button | `var(--usc-garnet)` → hover `var(--usc-garnet-600)` · `scale(1.06)` |
| AI avatar | `var(--usc-garnet)` bg · `26px` circle |
| User avatar | `var(--ink)` bg · `26px` circle |
| User bubble | `var(--ink)` bg · `var(--cream)` text |
| Bot bubble | `rgba(255,255,255,0.78)` bg · `1px glass-stroke-soft` border |
| Input focus ring | `border-color: var(--usc-garnet)` |
| Buddy body | `fill: var(--cream)` · `stroke: var(--ink)` · `drop-shadow` |
| Buddy antenna | `stroke: var(--usc-garnet)` · antenna dot `fill: var(--usc-gold)` |
| Buddy heart | `fill: var(--usc-garnet)` · pulses when `talking` |
| Speech bubble | `var(--glass-400)` · `blur(22px)` · `border-radius: 18px` |
| Term tag | `color: var(--usc-garnet)` · `bg: rgba(115,0,10,0.1)` · mono 10px |
| Animation budget | ≤180ms for hover transitions; 400ms for panel entrance |
| Buddy float | `4s ease-in-out infinite` · ±6px Y + ±2° rotate |