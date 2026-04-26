# NANO Dashboard — `web/`

React 18 + Vite + TypeScript port of the **ESD Lab Design System** prototype
(`Dashboard ESD.html`) into a production-grade frontend for the NANO Study.

This folder is a sibling to the existing static `dashboard/` (Chart.js + JSON).
The static dashboard remains the team's day-to-day operational view; this
SPA is the integration target for the design-system tab and the live FastAPI
backend.

## Stack

- React 18.3 + TypeScript (strict + `noUncheckedIndexedAccess`)
- Vite 5
- React Router v6
- TanStack Query v5 (server state)
- Zustand v4 (UI state, sessionStorage persistence — never localStorage)
- Zod v3 (response validation on every API call)
- `lucide-react` for icons (no CDN script tag)
- CSS Modules + design tokens (verbatim copy of `colors_and_type.css`) — no Tailwind, no CSS-in-JS lib
- Vitest + Testing Library

## Running

```bash
cd web
npm install
npm run dev          # http://127.0.0.1:5173 — uses in-browser mock backend
npm run build        # tsc --noEmit && vite build → web/build/
npm run preview      # http://127.0.0.1:4173
npm run lint
npm run typecheck
npm run test
```

The mock backend lives in `src/api/mockServer.ts` and is patched in only when
`import.meta.env.DEV === true` or `VITE_USE_MOCKS=true`. Production builds
NEVER bundle it. Point `vite.config.ts` `server.proxy["/api"]` at the real
FastAPI host (default `http://127.0.0.1:8000`).

## File layout

```
web/
├── package.json
├── vite.config.ts        # alias @/ → src/, /api proxy, manual chunks
├── vitest.config.ts
├── tsconfig.json
├── .eslintrc.cjs
├── index.html
├── public/{mark,logo,bg-grid}.svg
└── src/
    ├── main.tsx              # entry — mounts mock server in dev
    ├── App.tsx               # routes + QueryClient + lazy splits per route
    ├── styles/
    │   ├── tokens.css        # verbatim from colors_and_type.css
    │   └── global.css        # focus rings, pulse-dot, flow-line
    ├── lib/
    │   ├── glossary.ts       # GLOSS dict — single source of truth
    │   ├── ecgPath.ts        # deterministic SVG path
    │   └── audit.ts          # HIPAA audit logger (server reconciles)
    ├── api/
    │   ├── client.ts         # fetch wrapper + Zod validation
    │   ├── schemas.ts        # all endpoint Zod schemas
    │   ├── hooks.ts          # TanStack Query hooks per endpoint
    │   └── mockServer.ts     # dev-only fetch interceptor
    ├── store/ui.ts           # Zustand UI state (sessionStorage)
    ├── components/
    │   ├── primitives/       # Badge, Button, Card, Gloss, Icon, KPI,
    │   │                     #  SectionLabel, Segmented, Sparkline, Tooltip
    │   ├── shell/            # AppShell, TopNav, Sidebar, HipaaBanner,
    │   │                     #  useIdleTimer (30 m HIPAA gate)
    │   ├── pipeline/         # PipelineDAG / Sankey / Kanban + StageDrawer
    │   ├── qa/               # EpochTile, EpochInspector, epochReducer
    │   └── charts/           # TrajectoryChart, HDABarStack, EnrollmentBar
    ├── routes/
    │   ├── Overview.tsx
    │   ├── Participants.tsx
    │   ├── ParticipantDetail.tsx
    │   ├── QA.tsx
    │   ├── Results.tsx
    │   ├── Runs.tsx
    │   └── Redcap.tsx
    └── test/                 # Vitest setup + reducer + glossary + ecgPath
```

## Design-system rules (do not break)

- **Colors:** every component reads `var(--…)` from `src/styles/tokens.css`.
  No HEX literals in component files. ESLint will reject anything containing
  `#` followed by 3/6 hex digits in the next pass.
- **Garnet** (`--usc-garnet`, `#73000a`) only on primary button, active nav
  underline, brand mark, critical callouts.
- **Gold** (`--usc-gold`, `#ffcc00`) only on focus rings, accept-pip on QA
  tiles, study-progress accent.
- **Page background** is `--paper` (`#fafaf9`); cards are `--bg-surface`
  (`#ffffff`). Cards never use shadow + border together.
- **Radii:** `--r-2` default, `--r-4` for badges, `--r-full` only on avatars.
- **Type:** Source Serif 4 for display / h1 / KPI numerals / lede; Source
  Sans 3 for h2-h4 + UI; JetBrains Mono for IDs, paths, all numeric cells,
  timestamps. `font-variant-numeric: tabular-nums` on every numeric column.
- **Animation budget:** ≤ 180 ms. Entrances `--ease-sharp`, hover
  `--ease-standard`. No spring, no scale-up.

## HIPAA / safety rails

- `<HipaaBanner/>` mounts inside `AppShell` and renders on every authenticated
  route. Dismiss state lives in `useUi`.
- 30-minute idle timeout (`useIdleTimer`) shows minutes remaining in the top
  nav. Real lock is server-enforced at `/api/auth/refresh`; the client only
  surfaces the countdown.
- Every navigation, epoch decision, run trigger, and export fires
  `logAudit(...)` to `/api/audit`. Audit payloads are validated by Zod and
  contain only de-identified scopes — never PHI.
- Subject IDs are surrogate `NANO-####` only. Mock server never emits DOB,
  MRN, name, or address.
- No PHI in URL/query params (visit IDs are derived from surrogate id +
  visit code, never DOB).
- No PHI to `localStorage`; UI prefs persist in `sessionStorage`.
- Real ECG signals are rendered server-side as PNG/SVG behind a signed URL.
  `ecgPath()` is for skeleton tiles only.

## Acceptance checklist (PR-ready)

- [x] All 7 routes (`/`, `/participants`, `/participants/:id`, `/qa`,
      `/qa/:id`, `/results`, `/runs`, `/redcap`).
- [x] Pipeline overview supports `?view=dag|sankey|kanban` and persists to
      session prefs.
- [x] QA page accepts/rejects an epoch with `A`/`R`, optimistic UI, server
      reconciles.
- [x] Vitest covers `epochReducer`, `tallyEpochs`, glossary lookups, and
      `ecgPath` determinism.
- [x] No HEX colors in component files (only in `tokens.css`).
- [x] Only 3 imported font families: Source Serif 4, Source Sans 3,
      JetBrains Mono.
- [x] `<HipaaBanner/>` on every route except `/login` (no `/login` yet —
      auth is the next ticket).
- [x] `npm run lint` clean.
- [x] `npm run typecheck` clean.
- [x] `npm run build` produces no chunk > 250 kB gzipped (manual chunks split
      `react`, `router`, `query`).
- [ ] Lighthouse a11y ≥ 95 on every route — verify after the auth flow lands.

## Out of scope (intentionally)

- Marketing pages, public landing, dark mode, mobile breakpoints below
  1024 px (this is a desktop-only research tool).
- Stock photography, hero gradients, emoji (sole exception: `⚠️` on the
  HIPAA banner).
- Any chart library beyond inline SVG.
- New brand colors. New font families. New border radii.

## Working order shipped here

1. Tokens + primitives (Tooltip / Gloss first).
2. Shell + routing skeleton.
3. Pipeline overview (DAG, Sankey, Kanban) + StageDrawer wired to
   `/api/pipeline/stages`.
4. Participants table + detail.
5. QA review (centerpiece).
6. Results, Runs (with replay-style log stream stub), REDCap.
7. Tests + acceptance doc.

The next ticket adds: USC SSO + CITI gate at `/login`, real
`new EventSource("/api/runs/:id/logs")`, and Lighthouse a11y CI.
