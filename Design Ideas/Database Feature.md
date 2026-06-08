# ESD Lab Dashboard — Feature Implementation Prompt
## Copilot / AI Coding Agent Instruction Set (Production-Grade)

> **Repository:** `namo507/ESD-Lab-USC`
> **Frontend stack:** React 18 + TypeScript + Vite + React Router + TanStack Query + Zod + Tailwind CSS
> **Backend:** Current live runtime is the Python `/api` server in `dashboard/server/live_dashboard_server.py`, fronted by the Cloudflare Pages SPA wrapper
> **Database target:** New infrastructure if adopted. The repo does **not** currently ship a tracked D1 binding, `workers/` runtime, or `wrangler.toml`; treat D1/Workers as explicit additions, not existing baseline infrastructure
> **Deployed at:** `esd-lab-namo.pages.dev` (Cloudflare Pages)
> **Constraint:** All participant data is HIPAA-regulated. No PHI (DOB, MRN, name) ever leaves the server unmasked. Every new API endpoint must use parameterized prepared statements only — zero raw string concatenation in SQL.

---

## CONTEXT FOR THE CODING AGENT

You are implementing three major, interconnected features for the **NANO Study Dashboard** at the ESD Lab, University of South Carolina. The study tracks 260 very preterm (VPT) infants across cohorts (VPT, ASIB, TD) from NICU through age 3, collecting ECG, temperature, behavioral coding, and REDCap assessment data.

Use these repo anchors as the authoritative implementation surfaces:

- `web/src/App.tsx`: route registration via `react-router-dom` + `React.lazy()` + `Suspense`
- `web/src/components/shell/Sidebar.tsx`: sidebar groups and feature-gated nav items
- `web/src/components/shell/AppShell.tsx`: shell layout constraints, Buddy/chat placement, footer, and main-column width
- `web/src/config/featureFlags.ts`: feature-flag registry
- `web/src/api/client.ts`: fetch wrapper; if new verbs like `PUT` or `DELETE` are needed, extend this file first
- `web/src/api/schemas.ts`: Zod contracts
- `web/src/api/hooks.ts`: TanStack Query hooks
- `web/src/api/mockServer.ts`: dev/mock API responses and assistant passthrough behavior
- `web/src/components/shell/Buddy.tsx` and `web/src/components/shell/ChatDrawer.tsx`: AI buddy hover copy, seeded prompts, and assistant discovery
- `dashboard/assistant/local_chat_assistant.py`: live assistant vocabulary and route inventory
- `web/src/store/ui.ts`, `web/src/styles/tokens.css`, and `web/src/styles/global.css`: session-storage policy, theme state, warm/garnet tokens, gradients, and dark/light mode behavior
- `dashboard/server/live_dashboard_server.py`: current live backend entry for `/api/*`

The active frontend is the React SPA under `web/`, and routing is handled by `react-router-dom`, not TanStack Router. All new frontend API surfaces must be wired in **four** places: `web/src/api/schemas.ts`, `web/src/api/hooks.ts`, `web/src/api/mockServer.ts`, and the live backend in `dashboard/server/live_dashboard_server.py`.

The current repo does **not** contain:

- a tracked `workers/` runtime
- a tracked `wrangler.toml`
- a D1 binding
- `@tanstack/react-table` in `web/package.json`
- a shipped `isAdmin` / JWT auth context in the frontend
- a shared `ErrorBoundary` / `ErrorPage` component pair

If this work truly requires those pieces, add them as explicit new infrastructure. Do not write the prompt as if they already exist.

### Repo-grounded implementation rules

1. Default backend additions to `dashboard/server/live_dashboard_server.py` and extracted helpers under `dashboard/server/`. Only introduce `workers/` if the repo is deliberately being extended to a Worker runtime.
2. Any client-side state that could become participant-adjacent must follow the existing HIPAA storage policy in `web/src/store/ui.ts`: use `sessionStorage`, not `localStorage`, unless the value is theme-only.
3. Any new audit action names must first be added to `web/src/lib/audit.ts` and the server-side `/api/audit` consumer. The current enum does **not** accept the custom action strings proposed later in this file.
4. New routes are not complete until Buddy/chat, mock server behavior, and dark/light token parity are updated alongside the route itself.
5. No new panel, sticky rail, or floating control may overlap the existing sidebar, top nav, Buddy, chat drawer, or assistant FAB.

---

## FEATURE 1 — SQL-STYLE INTERACTIVE TABLE PREVIEW WITH PAGINATION

### 1.1 Feature Flag
In `web/src/config/featureFlags.ts`, add:
```ts
SQL_TABLE_EXPLORER: false,
```

### 1.2 New Route File
**Create:** `web/src/routes/DataExplorer.tsx`

This is the primary SQL-style interactive data explorer. It must expose **four virtual "tables"** the researcher can switch between via a top-level `<Segmented>` tab selector:

| Table Label | Data Source Hook | Columns to expose |
|---|---|---|
| `participants` | `useParticipants()` | id, group, cga_wks, sex, visit, windows, qa, rmssd, hf, hda, updated, enrolled, site |
| `runs` | `useRuns(200)` | id, triggered, actor, scope, status, duration, stage, windows |
| `stages` | `useStages()` | id, label, inflight, queued, done, fail, rate, eta |
| `redcap_events` | `useRedcapEvents()` | ts, form, n, status, note |

### 1.3 Core Table Component
**Create:** `web/src/components/primitives/DataTable/DataTable.tsx`

This is a fully generic, reusable headless table component wrapping `@tanstack/react-table`. That package is **not** currently present in `web/package.json`, so install it deliberately first:

```bash
cd web && npm install @tanstack/react-table
```

Do **not** add `material-react-table`; stay inside the existing primitives + warm-token design system. Build from scratch using `useReactTable` with the following plugins:

- `getCoreRowModel`
- `getSortedRowModel`
- `getFilteredRowModel`
- `getPaginationRowModel`

**Props interface:**
```ts
interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData>[];
  pageSize?: number; // default 25
  storageKey?: string; // for sessionStorage persistence
  isLoading?: boolean;
  globalFilterPlaceholder?: string;
}
```

**Rendering requirements:**
- Column headers must show a sort icon (↑ ↓ ↕) that toggles on click. Use `Icon` from `@/components/primitives`.
- Each column header must have an inline filter `<input>` that appears on hover, styled as a subtle underline input (no border box, matches dark/light tokens from `tokens.css`).
- Numeric columns (`rmssd`, `hf`, `cga_wks`, `windows`) must render with 2 decimal places and right-alignment.
- Status/enum columns (`qa`, `status`, `group`, `hda`) must render using `<Badge>` from primitives with the appropriate color variant: `pass`→green, `pending`→amber, `reject`→red, `running`→blue, `queued`→slate, `done`→green, `fail`→red, `VPT`→garnet, `ASIB`→purple, `TD`→slate.
- The `id` column for participants must render as a `<button>` that calls `navigate('/participants/' + row.id)` — wiring into the existing `ParticipantDetail` route.
- Null values display as an em-dash `—` in italic gray.

### 1.4 Pagination Controls Component
**Create:** `web/src/components/primitives/DataTable/PaginationBar.tsx`

```tsx
// Props
interface PaginationBarProps {
  pageIndex: number;       // 0-based
  pageCount: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (idx: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[]; // default [10, 25, 50, 100]
}
```

Render: `[← Prev] [1] [2] ... [n] [Next →]` with an ellipsis collapse when pageCount > 7. Show `"Showing 26–50 of 231 rows"` on the right. Page-size selector is a native `<select>` styled with the repo's actual token names from `web/src/styles/tokens.css` and `web/src/styles/global.css` such as `var(--bg-surface)`, `var(--border)`, and `var(--fg1)`. All buttons use the existing `Button` primitive with `variant="ghost"` and `size="sm"`.

### 1.5 Sticky State (sessionStorage Persistence)
**Create:** `web/src/hooks/useStickyTableState.ts`

```ts
// Persists columnVisibility, columnOrder, sorting, and pageSize to sessionStorage.
// Uses lazy initializer pattern — reads storage only on first mount.
// Key format: `esd-table-${storageKey}` to namespace per table.
// Safe for SSR: checks typeof window !== 'undefined' before any storage access.
export function useStickyTableState(storageKey: string, defaults: StickyTableState): [StickyTableState, (next: StickyTableState) => void]
```

This must follow the same HIPAA-aware storage rule used in `web/src/store/ui.ts`: do **not** use `localStorage` for participant-adjacent UI state.

The `StickyTableState` interface:
```ts
interface StickyTableState {
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
  sorting: SortingState;
  pageSize: number;
}
```

### 1.6 Column Visibility Toggle Panel
Inside `DataExplorer.tsx`, add a collapsible `<details>` disclosure element labelled **"Columns ▾"** using the existing `Card` and `SectionLabel` primitives. Render a checkbox grid (3 columns, CSS grid) of all available columns. Checking/unchecking persists via `useStickyTableState`. This panel appears above the table, right-aligned next to the global search input.

### 1.7 Export Button
Add an **"Export · CSV"** `<Button variant="secondary" icon="download">` that:
1. Takes the *currently filtered* rows (not full dataset).
2. Serializes them to CSV using a pure utility `web/src/lib/exportCsv.ts` — no external library.
3. Triggers a browser download with filename pattern `nano-{tableName}-{ISO_date}.csv`.
4. Calls `logAudit({ action: 'export.csv', scope: '/data-explorer/' + tableName })` before download, or extends `web/src/lib/audit.ts` first if a different action name is required.

### 1.8 Zod Schema Addition
In `web/src/api/schemas.ts`, add a new schema for the query builder payload used by the server-side filtered endpoint:
```ts
export const TableQueryParams = z.object({
  table: z.enum(['participants', 'runs', 'stages', 'redcap_events']),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(10).max(100).default(25),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  filters: z.record(z.string()).optional(),
});
export type TableQueryParams = z.infer<typeof TableQueryParams>;
```

### 1.9 API Hook
In `web/src/api/hooks.ts`, add:
```ts
export function useTableQuery<T>(params: TableQueryParams, schema: ZodType<T[]>): UseQueryResult<PaginatedResponse<T>>
// PaginatedResponse<T> = { rows: T[]; total: number; page: number; pageSize: number; }
```
This calls `POST /api/table/query` with the `TableQueryParams` body.

### 1.10 Backend Query Endpoint
**Default implementation target:** `dashboard/server/live_dashboard_server.py`

If the repo is explicitly extended to a Worker/D1 runtime later, the same logic may be mirrored into `workers/table-query.ts`. Do **not** assume a Worker runtime already exists.

The handler must:
1. Parse and validate the incoming `TableQueryParams` (mirror the Zod schema in TS, or use Pydantic if Python).
2. Build a parameterized query dynamically — **only** using placeholders / bound parameters, never string interpolation for user-supplied values.
3. Apply `LIMIT` and `OFFSET` for pagination.
4. Apply `ORDER BY` only against a **whitelist** of allowed column names (hard-coded per table — prevents injection via sort field).
5. Return `{ rows, total, page, pageSize }`.

Because the current repo does not yet ship a dedicated SQL/D1 layer for these tables, the prompt should explicitly say whether `/api/table/query` is backed by a new database abstraction or by the existing in-memory / aggregate data sources exposed from `live_dashboard_server.py`.

### 1.11 Route Registration
In `web/src/App.tsx`:
```tsx
const DataExplorer = lazy(() => import('@/routes/DataExplorer').then(m => ({ default: m.DataExplorer })));
// Add inside <Routes>:
<Route path="/data-explorer" element={<DataExplorer />} />
```

In the Sidebar navigation (`web/src/components/shell/Sidebar.tsx`), add a nav item `{ to: '/data-explorer', label: 'Data Explorer', icon: 'table', flag: 'SQL_TABLE_EXPLORER' }` under the existing `Data Infrastructure` group (`id: "data"`). Match the current `NavItem` shape in that file, which uses `to`, not `path`.

### 1.12 Module CSS
**Create:** `web/src/routes/DataExplorer.module.css` with class definitions aligned to the repo's actual token names and layout rhythm from `Participants.module.css`, `FeatureRoutes.module.css`, `tokens.css`, and `global.css`:
- `.page` — standard page layout matching `Participants.module.css`
- `.toolbar` — flex row, space-between, align-center, gap `var(--s-12)` or `var(--s-16)`
- `.tableWrap` — overflow-x auto, border-radius `var(--r-2)`, border `1px solid var(--border)`
- `.th` — monospace font-family, font-size `var(--text-micro)`, color `var(--slate-500)`, padding `var(--s-8) var(--s-12)`, border-bottom `1px solid var(--border-strong)`, white-space nowrap, cursor pointer, user-select none
- `.td` — font-size `var(--text-small)`, padding `var(--s-8) var(--s-12)`, border-bottom `1px solid var(--slate-100)`
- `.trHover:hover` — background `var(--bg-hover)`
- `.numericCell` — text-align right, font-variant-numeric tabular-nums
- `.nullCell` — color `var(--slate-500)`, font-style italic

---

## FEATURE 2 — AUTOMATED PUBMED + JOURNAL WEB-SCRAPER PIPELINE WITH CITATION EXTRACTION AND AUTO-TAGGING

### 2.1 Feature Flag
```ts
PUBLICATIONS_FEED: false,
```

### 2.2 Backend ETL Job (default Python runtime; optional Worker extraction)

**Default implementation target:** `dashboard/server/live_dashboard_server.py` plus extracted helpers under `dashboard/server/` or `scripts/`.

If the repo is later extended to a real Cloudflare Worker + D1 runtime, mirror the same ETL logic into `workers/publications-sync/index.ts` and a single root-level `wrangler.toml`. Do **not** assume that Worker runtime or config already exists in this branch.

This sync should run on a schedule equivalent to every Sunday at 02:00 UTC. In the current repo, that can be a cron-driven Python job, CI task, or wrapper-triggered backend task; if a Worker runtime is added later, it can become a Cron Trigger there.

#### Phase A — Extract (NCBI E-utilities)

```ts
const SEARCH_QUERY = encodeURIComponent(
  '("Jessica Bradshaw"[Author]) AND ("University of South Carolina"[Affiliation]) AND ' +
  '("autism" OR "infant" OR "neurobehavior" OR "preterm" OR "respiratory sinus arrhythmia" OR ' +
  '"fragile X" OR "heart rate" OR "eye tracking" OR "developmental")'
);

// Step 1: esearch — returns list of PMIDs
const esearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${SEARCH_QUERY}&retmax=200&retmode=json&tool=esd-lab-dashboard&email=research@esdlabsc.com`;

// Step 2: efetch — fetch full records in XML for all PMIDs
const efetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&rettype=abstract&retmode=xml`;
```

Add a 400ms delay between esearch and efetch to respect NCBI rate limits (3 req/sec without API key; if the repo later adopts Worker secrets or CI-managed secrets, store an `NCBI_API_KEY` there and document the source of truth explicitly).

#### Phase B — Extract (ORCID Public API — secondary source)

```ts
const ORCID_ID = '0000-0002-3367-9617'; // Dr. Jessica Bradshaw
const orcidUrl = `https://pub.orcid.org/v3.0/${ORCID_ID}/works`;
// Headers: Accept: application/json
// Parse: works[].work-summary[].{title, journal-title, publication-date, external-ids}
```

Merge ORCID results with PubMed results using DOI as the deduplication key. If a work is found in ORCID but not PubMed (e.g., book chapters), insert it with `source = 'orcid'` and `pmid = null`.

#### Phase C — Extract (Crossref REST API — citation enrichment)

For each publication that has a DOI, call:
```ts
const crossrefUrl = `https://api.crossref.org/works/${doi}`;
// Extract: is-referenced-by-count (citation count), subject (keywords), type (journal-article, book-chapter, etc.)
// Headers: User-Agent: ESD-Lab-Dashboard/1.0 (mailto:research@esdlabsc.com)  ← "polite pool" access
```

Store `citation_count` and `pub_type` from this response.

#### Phase D — Transform (XML Parsing + Metadata Normalization)

Parse the PubMed XML response using a minimal, deterministic parser. If this runs in Python, use the standard library XML tools already available there; if this is later mirrored in a Worker, use `DOMParser` or an equally minimal parser available in that runtime. Do not write the prompt as if the Worker runtime is already in place.

Extract these fields per article:
```ts
interface PubMedRecord {
  pmid: string;
  title: string;
  authors: Array<{ last: string; first: string; initials: string; affiliation: string }>;
  journal: string;
  volume: string | null;
  issue: string | null;
  year: number;
  month: number | null;
  pages: string | null;
  doi: string | null;
  abstract: string | null;
  pub_type: string; // 'Journal Article' | 'Review' | 'Book Chapter' etc.
  mesh_terms: string[]; // MeSH headings for auto-tagging
  keywords: string[]; // Author-supplied keywords
  epub_date: string | null; // ISO date of epub ahead of print
  citation_count: number | null; // from Crossref, null if not yet fetched
}
```

**Auto-Tagging Logic** — after extraction, compute an array of `tags: string[]` per publication using this deterministic rule set:

```ts
const TAG_RULES: Array<{ tag: string; matchAny: string[] }> = [
  { tag: 'autism-asd',     matchAny: ['autism', 'asd', 'autism spectrum'] },
  { tag: 'fragile-x',      matchAny: ['fragile x', 'fmr1'] },
  { tag: 'preterm',        matchAny: ['preterm', 'premature', 'vpt', 'nicu', 'gestational'] },
  { tag: 'hrv-rsa',        matchAny: ['respiratory sinus arrhythmia', 'rsa', 'heart rate variability', 'hrv', 'rmssd'] },
  { tag: 'eye-tracking',   matchAny: ['eye tracking', 'gaze', 'visual attention', 'head-mounted'] },
  { tag: 'motor',          matchAny: ['motor', 'pull-to-sit', 'postural', 'locomotion'] },
  { tag: 'intervention',   matchAny: ['intervention', 'treatment', 'therapy'] },
  { tag: 'social',         matchAny: ['social', 'dyadic', 'caregiver', 'mother-infant'] },
  { tag: 'ecg-cardiac',    matchAny: ['ecg', 'cardiac', 'interbeat', 'ibi', 'heart-defined attention'] },
  { tag: 'longitudinal',   matchAny: ['longitudinal', 'prospective', 'cohort', 'developmental cascade'] },
  { tag: 'review',         matchAny: [] }, // set if pub_type === 'Review'
  { tag: 'grant-related',  matchAny: ['r01', 'nih', 'national institute'] },
];
```

Apply tag rules against: `title + abstract + keywords + mesh_terms` (all lowercased, concatenated with space). Assign `review` tag if `pub_type === 'Review'`.

**Citation Format Generator** — produce an APA 7th edition formatted citation string:
```ts
function formatAPA(record: PubMedRecord): string {
  // "Last, F. I., Last, F. I., & Last, F. I. (year). Title. *Journal*, volume(issue), pages. https://doi.org/DOI"
  // If > 20 authors: list first 19, then '... Last Author'
  // If no DOI: omit DOI portion
  // If epub ahead of print: "(year). Title. Journal. Advance online publication. https://doi.org/DOI"
}
```

#### Phase E — Load (database layer; D1 optional)

First, make the data store choice explicit. The current repo does not yet expose a tracked D1 binding or migration system, so the prompt must say one of the following:

1. implement this against the current Python runtime using SQLite / equivalent server-side storage and a new top-level `migrations/` directory, or
2. introduce D1 as new Cloudflare infrastructure, with its bindings and config added explicitly before application work starts.

If the database layer is added, this `publications` table belongs in a new top-level `migrations/` directory:

```sql
-- migrations/0003_publications.sql
CREATE TABLE IF NOT EXISTS publications (
  pmid          TEXT UNIQUE,
  title         TEXT NOT NULL,
  authors_json  TEXT NOT NULL,     -- JSON array of {last, first, initials, affiliation}
  journal       TEXT NOT NULL,
  volume        TEXT,
  issue         TEXT,
  year          INTEGER NOT NULL,
  month         INTEGER,
  pages         TEXT,
  doi           TEXT UNIQUE,
  abstract      TEXT,
  pub_type      TEXT NOT NULL DEFAULT 'Journal Article',
  mesh_json     TEXT NOT NULL DEFAULT '[]',  -- JSON array of MeSH terms
  keywords_json TEXT NOT NULL DEFAULT '[]',  -- JSON array of author keywords
  tags_json     TEXT NOT NULL DEFAULT '[]',  -- JSON array of auto-computed tags
  apa_citation  TEXT,                         -- pre-formatted APA 7 string
  citation_count INTEGER,
  source        TEXT NOT NULL DEFAULT 'pubmed', -- 'pubmed' | 'orcid' | 'manual'
  epub_date     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pub_year  ON publications(year DESC);
CREATE INDEX IF NOT EXISTS idx_pub_tags  ON publications(tags_json);
CREATE INDEX IF NOT EXISTS idx_pub_doi   ON publications(doi);
```

Use the idempotent upsert:
```sql
INSERT INTO publications (pmid, title, authors_json, journal, volume, issue, year, month, pages, doi, abstract, pub_type, mesh_json, keywords_json, tags_json, apa_citation, citation_count, source, epub_date, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
ON CONFLICT(pmid) DO UPDATE SET
  title          = excluded.title,
  authors_json   = excluded.authors_json,
  journal        = excluded.journal,
  volume         = excluded.volume,
  issue          = excluded.issue,
  year           = excluded.year,
  month          = excluded.month,
  pages          = excluded.pages,
  doi            = excluded.doi,
  abstract       = excluded.abstract,
  pub_type       = excluded.pub_type,
  mesh_json      = excluded.mesh_json,
  keywords_json  = excluded.keywords_json,
  tags_json      = excluded.tags_json,
  apa_citation   = excluded.apa_citation,
  citation_count = excluded.citation_count,
  epub_date      = excluded.epub_date,
  updated_at     = datetime('now');
```

### 2.3 New API Endpoints
**Create** in `dashboard/server/live_dashboard_server.py` by default, or mirror into a Worker router only if the repo is explicitly moved to that runtime. Do not assume FastAPI-specific decorators; match the current backend handler style used in `live_dashboard_server.py`.

```
GET  /api/publications              → list, supports ?year=&tag=&search=&page=&pageSize=
GET  /api/publications/:pmid        → single record with full abstract + mesh + tags
GET  /api/publications/tags         → returns {tag: string, count: number}[] sorted by count desc
POST /api/publications/sync/trigger → manually trigger a sync (admin only, JWT-gated)
GET  /api/publications/sync/status  → last sync timestamp, count inserted, count updated, errors[]
```

Add Zod schemas for all responses in `web/src/api/schemas.ts`:
```ts
export const Publication = z.object({
  pmid: z.string().nullable(),
  title: z.string(),
  authors: z.array(z.object({ last: z.string(), first: z.string(), initials: z.string(), affiliation: z.string() })),
  journal: z.string(),
  volume: z.string().nullable(),
  issue: z.string().nullable(),
  year: z.number().int(),
  month: z.number().int().nullable(),
  pages: z.string().nullable(),
  doi: z.string().nullable(),
  abstract: z.string().nullable(),
  pub_type: z.string(),
  mesh_terms: z.array(z.string()),
  keywords: z.array(z.string()),
  tags: z.array(z.string()),
  apa_citation: z.string().nullable(),
  citation_count: z.number().int().nullable(),
  source: z.enum(['pubmed', 'orcid', 'manual']),
  epub_date: z.string().nullable(),
  updated_at: z.string(),
});
export type Publication = z.infer<typeof Publication>;

export const PublicationListResponse = z.object({
  publications: z.array(Publication),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  tag_counts: z.array(z.object({ tag: z.string(), count: z.number().int() })),
});
```

Add hooks in `web/src/api/hooks.ts`:
```ts
export function usePublications(params?: PublicationQueryParams): UseQueryResult<PublicationListResponse>
export function usePublication(pmid: string): UseQueryResult<Publication>
export function usePublicationTags(): UseQueryResult<{ tag: string; count: number }[]>
export function useSyncPublications(): UseMutationResult<SyncStatus, ApiError, void>
```

### 2.4 Frontend Route: Publications
**Create:** `web/src/routes/Publications.tsx`

Layout specification:

**Hero section:**
- Eyebrow: `Publications · ESD Lab`
- H1: `{total} publications` with sub-line `Last synced: {updated_at}`
- Action buttons: `<Button icon="refresh-cw" onClick={triggerSync}>Sync now</Button>` and `<Button variant="secondary" icon="download">Export · BibTeX</Button>`

**Left sidebar filter panel (240px fixed width):**
- Year range: two `<input type="number">` for min/max year, defaults to `[2018, currentYear]`
- Tag cloud: render `usePublicationTags()` as clickable `<Badge>` pills, active state toggles the tag filter. Multiple tags combine with OR logic.
- Publication type selector: `<Segmented>` with `['All', 'Journal Article', 'Review', 'Book Chapter']`
- Search input: global full-text search against title + abstract + authors (debounced 300ms)

**Main content — Publication Card List:**

Each publication renders as a `<Card>` with:
```
[pub_type badge] [year] [tags — up to 4 badges, with +N more tooltip]
TITLE (clickable, navigates to /publications/:pmid)
Authors: First Author, Second Author, ... (bolded if affiliation contains "South Carolina")
Journal in italic, Volume(Issue):Pages · DOI link (external, opens new tab)
Abstract: first 200 chars with "Read more ▾" expand toggle
Citation count: "Cited by N" in small gray text (if citation_count > 0)
APA citation in a collapsible <details> styled as a code block with a "Copy citation" clipboard button
```

**Single Publication Detail Route:**
**Create:** `web/src/routes/PublicationDetail.tsx`

Full page for a single publication. Sections:
1. Full metadata (journal, year, volume, issue, pages, DOI button, PMID link to PubMed, source badge)
2. Authors list — full first names, affiliations as tooltips
3. Full abstract
4. MeSH Terms — rendered as small gray badges
5. Auto-Tags — rendered as colored badges using the tag color map below
6. Keywords (author-supplied)
7. Full formatted APA citation with copy button
8. Citation count with a link to `https://scholar.google.com/scholar?q={doi}`

**Tag color map** (use CSS token variables):
```ts
const TAG_COLORS: Record<string, string> = {
  'autism-asd':    'var(--purple)',
  'fragile-x':     'var(--usc-garnet)',
  'preterm':       'var(--amber-500)',
  'hrv-rsa':       'var(--blue-500)',
  'eye-tracking':  'var(--teal-500)',
  'motor':         'var(--green-600)',
  'social':        'var(--pink-500)',
  'ecg-cardiac':   'var(--red-500)',
  'longitudinal':  'var(--slate-500)',
  'intervention':  'var(--indigo-500)',
  'review':        'var(--gray-500)',
  'grant-related': 'var(--emerald-600)',
};
```

**BibTeX Export Utility:**
Add `web/src/lib/exportBibtex.ts`:
```ts
export function toBibtex(pub: Publication): string {
  // Produces @article{bradshaw_YEAR_FIRSTWORD, ...} format
  // Key: first author last name + year + first significant word of title (lowercase, no stopwords)
  // Fields: author, title, journal, year, volume, number, pages, doi, abstract, keywords
  // Wraps all string values in double braces {{...}} to preserve case in BibTeX
}
export function exportBibtexFile(publications: Publication[], filename: string): void
```

### 2.5 Manual Tagging Override UI
Inside `PublicationDetail.tsx`, add an `Edit Tags` mode gated by an explicit backend-verified admin capability. The current repo does **not** ship an existing `isAdmin` hook or JWT auth context in the frontend, so this prompt must not pretend one already exists. In edit mode:
- Render all TAG_RULES as a checkbox grid
- Allow free-text custom tag input (comma-separated)
- Save button calls `PATCH /api/publications/:pmid/tags` with `{ tags: string[] }`
- Tags marked with a `·` prefix in the auto-tag badge to distinguish auto vs. manually added tags

### 2.6 Sync Status Card on Overview
In `web/src/routes/Overview.tsx`, append a new entry to the existing `kpis` array so it renders through the current `MetricCard` flow from `@/components/warm`, gated by `PUBLICATIONS_FEED`:
```tsx
<MetricCard
  label="Publications"
  value={pubSyncStatus?.total ?? 0}
  unit="indexed"
  sub={`Last sync: ${pubSyncStatus?.last_sync ?? 'never'}`}
  delta={pubSyncStatus?.new_this_week ? `+${pubSyncStatus.new_this_week} this week` : 'up to date'}
  deltaKind="up"
  accent="sage"
  insightId="kpi-publications"
/>
```

### 2.7 Route Registration
```tsx
// In App.tsx
const Publications = lazy(() => import('@/routes/Publications').then(m => ({ default: m.Publications })));
const PublicationDetail = lazy(() => import('@/routes/PublicationDetail').then(m => ({ default: m.PublicationDetail })));

<Route path="/publications" element={<Publications />} />
<Route path="/publications/:pmid" element={<PublicationDetail />} />
```

In `web/src/components/shell/Sidebar.tsx`, use the current `NavItem` shape: `{ to: '/publications', label: 'Publications', icon: 'book-open', flag: 'PUBLICATIONS_FEED' }`. Add a new `science` group to `NAV_GROUPS`; do not use `path`.

---

## FEATURE 3 — DATASET VERSIONING AND CHANGE HISTORY UI

### 3.1 Feature Flag
```ts
DATA_CHANGELOG: false,
```

### 3.2 Database Schema: Audit Log Table
**Add to a new top-level `migrations/` directory if the repo adopts a real database-backed changelog.** If the implementation stays inside the current Python runtime, the same schema can be applied against SQLite-compatible storage there; if D1 is introduced later, reuse the same SQL with D1-compatible initialization.

```sql
-- migrations/0004_audit_changelog.sql
CREATE TABLE IF NOT EXISTS data_changelog (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  entity_type   TEXT NOT NULL,           -- 'participant' | 'run' | 'epoch' | 'publication' | 'redcap_event'
  entity_id     TEXT NOT NULL,           -- the surrogate ID of the affected row
  action        TEXT NOT NULL,           -- 'INSERT' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'SYNC' | 'QA_OVERRIDE'
  actor         TEXT NOT NULL,           -- anonymized user identifier (no PHI — use session UUID or role label)
  actor_role    TEXT,                    -- 'pi' | 'coordinator' | 'analyst' | 'system' | 'cron'
  changed_fields_json TEXT,             -- JSON: { field: [old_value, new_value], ... }
  snapshot_json TEXT,                   -- full row snapshot AFTER the change (de-identified only)
  session_id    TEXT,                   -- groups all changes from a single user session
  ip_hash       TEXT,                   -- SHA-256 of IP, for audit trail (not for display)
  note          TEXT,                   -- optional human-written reason (e.g., "QA correction for visit NANO-0042")
  ts            TEXT NOT NULL DEFAULT (datetime('now')),
  version_tag   TEXT                    -- optional semantic label e.g., "v1.3.0" or "pre-manuscript-freeze"
);

CREATE INDEX IF NOT EXISTS idx_changelog_entity  ON data_changelog(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_changelog_ts      ON data_changelog(ts DESC);
CREATE INDEX IF NOT EXISTS idx_changelog_actor   ON data_changelog(actor);
CREATE INDEX IF NOT EXISTS idx_changelog_action  ON data_changelog(action);
CREATE INDEX IF NOT EXISTS idx_changelog_version ON data_changelog(version_tag);

-- Dataset Snapshots (named checkpoints)
CREATE TABLE IF NOT EXISTS dataset_snapshots (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tag         TEXT NOT NULL UNIQUE,  -- e.g., "pre-manuscript-freeze-2026-06"
  description TEXT,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  row_counts  TEXT NOT NULL,         -- JSON: { participants: N, runs: N, epochs: N }
  checksum    TEXT NOT NULL          -- SHA-256 of canonical JSON export for integrity verification
);
```

### 3.3 Audit Middleware / Audit Helper (Backend)
**Default implementation target:** helper logic in `dashboard/server/live_dashboard_server.py` or an extracted `dashboard/server/` helper module.

The current backend is not organized as FastAPI, so do not write this as a framework-specific decorator requirement. Match the existing request-handler style in `live_dashboard_server.py`. If a Worker runtime is added later, the same logic can be mirrored into `workers/audit-middleware.ts`.

Every `POST`, `PATCH`, `DELETE`, and `PUT` request to the API must pass through this middleware before and after the DB mutation:

```ts
async function withAudit<T>(
  env: Env,
  ctx: { entityType: string; entityId: string; action: string; actor: string; role: string; sessionId: string },
  mutation: () => Promise<T>
): Promise<T> {
  // 1. Fetch current row snapshot BEFORE mutation (SELECT * WHERE id = entityId)
  // 2. Execute the mutation
  // 3. Fetch new row snapshot AFTER mutation
  // 4. Compute diff: changed_fields = fields where before[key] !== after[key]
  // 5. Insert into data_changelog with before→after diffs
  // 6. Return mutation result
}
```

The scheduled publications sync must also pass through this logic with `actor = 'cron'`, `actor_role = 'system'`, `action = 'SYNC'`.

### 3.4 New API Endpoints for Changelog
```
GET  /api/changelog                    → paginated full log, supports ?entity_type=&entity_id=&actor=&action=&from=&to=&page=&pageSize=
GET  /api/changelog/:entity_type/:id   → full history for a specific record
GET  /api/changelog/diff/:id           → single change entry with computed diff
GET  /api/snapshots                    → list all named dataset snapshots
POST /api/snapshots                    → create a new snapshot checkpoint (admin only)
GET  /api/snapshots/:tag/export        → download full de-identified JSON export of that snapshot
```

Add Zod schemas:
```ts
export const ChangelogEntry = z.object({
  id: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  action: z.enum(['INSERT', 'UPDATE', 'DELETE', 'IMPORT', 'SYNC', 'QA_OVERRIDE']),
  actor: z.string(),
  actor_role: z.string().nullable(),
  changed_fields: z.record(z.tuple([z.unknown(), z.unknown()])).nullable(),
  note: z.string().nullable(),
  ts: z.string(),
  version_tag: z.string().nullable(),
});

export const DatasetSnapshot = z.object({
  id: z.string(),
  tag: z.string(),
  description: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  row_counts: z.record(z.number().int()),
  checksum: z.string(),
});
```

Add hooks in `web/src/api/hooks.ts`:
```ts
export function useChangelog(params?: ChangelogQueryParams): UseQueryResult<PaginatedResponse<ChangelogEntry>>
export function useEntityHistory(entityType: string, entityId: string): UseQueryResult<ChangelogEntry[]>
export function useSnapshots(): UseQueryResult<DatasetSnapshot[]>
export function useCreateSnapshot(): UseMutationResult<DatasetSnapshot, ApiError, { tag: string; description: string }>
```

### 3.5 Frontend Route: Changelog
**Create:** `web/src/routes/Changelog.tsx`

**Layout — three panels:**

#### Panel A: Timeline Feed (left column, 55% width)
Chronological feed of `ChangelogEntry` items rendered as a vertical timeline using CSS border-left `2px solid var(--color-border)` with dot markers.

Each entry renders as:
```
[action badge] [entity_type/entity_id clickable → navigates to entity detail] [ts — relative time e.g. "3h ago"]
Actor: [actor_role badge] [actor]  |  Session: [session_id last 8 chars]
[note if present — italic]
[changed_fields diff inline — only if action === 'UPDATE':
  field_name:  "old_value" → "new_value"   (old in red, new in green, monospace font)
]
```

Action badge colors:
- `INSERT` → green
- `UPDATE` → amber
- `DELETE` → red
- `IMPORT` → blue
- `SYNC` → slate
- `QA_OVERRIDE` → purple

#### Panel B: Filter Sidebar (right column, 45% width, top section)
```tsx
// Entity type selector
<Segmented options={['All', 'participant', 'run', 'epoch', 'publication', 'redcap_event']} />

// Action selector
<Segmented options={['All', 'INSERT', 'UPDATE', 'DELETE', 'QA_OVERRIDE', 'SYNC']} />

// Date range
<input type="date" /> to <input type="date" />

// Actor/role filter — text input with debounce

// Search in notes — text input with debounce

// Version tag filter — select populated from distinct version_tags in log
```

#### Panel C: Dataset Snapshots Panel (right column, 45% width, bottom section)
Render `useSnapshots()` as a card list:
```
[tag as <code>] [created_at] by [created_by]
[description]
Row counts: participants: N · runs: N · epochs: N
Checksum: [first 12 chars]... [Copy full] [Download JSON export]
```

At the top: `<Button icon="camera">Create snapshot checkpoint</Button>` opens a modal:
- Input: `tag` (slug format, e.g., `pre-submission-2026-06`)  
- Textarea: `description`  
- Submit calls `useCreateSnapshot().mutate({ tag, description })`

### 3.6 Entity History Panel (Inline on ParticipantDetail)
In `web/src/routes/ParticipantDetail.tsx`, add a new collapsible section at the bottom of the page (gated by `DATA_CHANGELOG` flag):

```tsx
// Section label: "Change History"
// Renders useEntityHistory('participant', participant.id) as a compact table:
// Columns: timestamp | action | actor | changed fields (comma-joined field names) | note

<table>
  <thead>
    <tr><th>When</th><th>Action</th><th>By</th><th>Fields Changed</th><th>Note</th></tr>
  </thead>
  <tbody>
    {history.map(entry => (
      <tr key={entry.id}>
        <td>{relativeTime(entry.ts)}</td>
        <td><Badge variant={ACTION_VARIANT[entry.action]}>{entry.action}</Badge></td>
        <td>{entry.actor_role ? `${entry.actor_role}:` : ''}{entry.actor}</td>
        <td>{Object.keys(entry.changed_fields ?? {}).join(', ') || '—'}</td>
        <td>{entry.note ?? '—'}</td>
      </tr>
    ))}
  </tbody>
</table>
```

Similarly add to `PublicationDetail.tsx` for the `publication` entity type.

### 3.7 Diff Viewer Component
**Create:** `web/src/components/primitives/DiffViewer/DiffViewer.tsx`

```tsx
// Props
interface DiffViewerProps {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  highlightFields?: string[]; // fields to highlight in yellow as especially significant
}

// Renders a two-column diff table:
// Field | Before (red background, strikethrough) | After (green background)
// Only rows with actual changes are shown by default.
// "Show unchanged fields" toggle reveals all rows.
// Numeric fields show the delta: e.g., "rmssd: 42.1 → 45.3 (Δ +3.2)"
```

Use this component inside the changelog entry expand panel (click entry → full diff modal overlay using `<dialog>` element).

### 3.8 Version Tag System
**Create:** `web/src/components/primitives/VersionTag.tsx`

A small inline component rendered next to entity IDs when that entity was modified in a named snapshot:
```tsx
// Renders: <code className={styles.tag}>v1.3.0</code>
// Tooltip: "Part of snapshot: pre-manuscript-freeze-2026-06 · created 2026-06-01"
// Clicking navigates to /changelog?version_tag=pre-manuscript-freeze-2026-06
```

Use inside `DataExplorer.tsx` — if `DATA_CHANGELOG` flag is enabled, add a `version_tag` column to all tables that displays the most recent snapshot this row was tagged in.

### 3.9 Route Registration
```tsx
const Changelog = lazy(() => import('@/routes/Changelog').then(m => ({ default: m.Changelog })));
<Route path="/changelog" element={<Changelog />} />
```

In `web/src/components/shell/Sidebar.tsx`, use the current nav shape `{ to: '/changelog', label: 'Change History', icon: 'clock', flag: 'DATA_CHANGELOG' }` and append a new `admin` group to `NAV_GROUPS` rather than referencing a group that does not yet exist.

---

## CROSS-CUTTING REQUIREMENTS (All Three Features)

### Audit Logging
Every user-initiated action across all three features must call the existing `logAudit` utility from `@/lib/audit`:
```ts
logAudit({ action: 'export.csv', scope: '/data-explorer/participants' })
logAudit({ action: 'run.trigger', scope: '/publications/sync' })
logAudit({ action: 'route.navigate', scope: '/changelog', detail: { tag } })
```

If you want richer audit verbs such as `data.export`, `publications.sync.trigger`, `snapshot.create`, or `page.view`, extend `web/src/lib/audit.ts` and the backend audit schema first. The current client enum does not accept those strings.

### HIPAA Guards
- The `DataExplorer` table for `participants` must **never** expose columns: `dob`, `mrn`, `caregiver_id`, `address`, `name`. These are PHI. The API whitelist must hard-code the allowed columns.
- The `Changelog` diff viewer must redact any PHI field values with `[REDACTED]` before sending to the frontend. The backend must maintain a `PHI_FIELDS` constant and strip these from `changed_fields_json` before API response.
- Any persistent table or filter state that could become participant-adjacent must use `sessionStorage`, not `localStorage`, matching `web/src/store/ui.ts`.
- Route navigation is already logged centrally via `route.navigate` from `web/src/components/shell/AppShell.tsx`. Reuse that pattern or extend the audit enum explicitly before introducing a separate `page.view` action.

### Loading & Error States
All three routes must handle loading, empty, and error states using the patterns that actually exist in this repo:

- `web/src/App.tsx` already provides route-level `Suspense` with `PageFallback`
- individual routes typically render inline loading / empty states rather than a shared `ErrorBoundary` component

Do **not** reference nonexistent shared components like `ErrorBoundary` or `ErrorPage` unless the prompt also creates them explicitly.

### Mobile Responsiveness
- `DataExplorer`: on viewport < 768px, collapse the column visibility panel, show only first 5 columns by default, pagination bar collapses to `[← Prev] Page X of Y [Next →]` format.
- `Publications`: stack left filter panel above cards on mobile.
- `Changelog`: collapse to single-column timeline on mobile; hide filter sidebar behind a "Filters ▾" drawer button.

### AI Buddy, Layout, and Theme Sync
- Update `web/src/components/shell/Buddy.tsx` with new `data-insight` copy for Data Explorer, Publications, Publication Detail, and Change History surfaces.
- Update `web/src/components/shell/ChatDrawer.tsx` with seeded prompts and fast paths for table exploration, publication sync, citation export, and dataset snapshots.
- Update `dashboard/assistant/local_chat_assistant.py` and `web/src/api/mockServer.ts` so the live and mock assistants know these route names, metrics, and export capabilities.
- Validate every new route against `web/src/components/shell/AppShell.tsx` so nothing overlaps the sidebar, top nav, footer, Buddy, chat drawer, or assistant FAB.
- Keep typography, gradients, muted text, pills, table chrome, and focus states token-driven via `web/src/styles/tokens.css` and `web/src/styles/global.css`, and verify readability under `light`, `dark`, and `system` theme modes from `web/src/store/ui.ts`.
- Follow the repo's existing responsive breakpoints and CSS-module patterns (`Participants.module.css`, `FeatureRoutes.module.css`, route-local modules). Collapse layouts before legends, filters, or inline controls start overlapping.

### TypeScript Strictness
- `"strict": true` is already set in `tsconfig.json`. No `any` types. Use `unknown` + type guards where necessary.
- All new hooks must include proper generic type parameters.
- All new component props must use explicit interfaces (not inline type literals).

### Testing
The repo already uses **two** test surfaces:

- root `tests/` for Python/backend behavior
- `web/src/test/` for Vitest + Testing Library frontend coverage

Add both backend and frontend coverage:

- `tests/test_data_explorer.py` — backend `/api/table/query` behavior: pagination math, sort whitelist rejection, PHI column exclusion
- `tests/test_publications_sync.py` — backend sync / ETL behavior: XML parsing, tag assignment, idempotent upsert, ORCID merge
- `tests/test_changelog.py` — backend audit behavior: diff computation, PHI field redaction, snapshot checksum
- `web/src/test/dataExplorer.test.tsx` — route + table interactions, empty/error states, mobile pagination collapse
- `web/src/test/publications.test.tsx` and `web/src/test/publicationDetail.test.tsx` — filters, expand/collapse, copy/export actions, tag UI gating
- `web/src/test/changelog.test.tsx` — filters, timeline rendering, diff expansion, snapshot modal flow
- extend `web/src/test/mockServer.test.ts`, `web/src/test/sidebarNav.test.tsx`, and Buddy/chat tests as needed for the new routes

---

## FILE CREATION CHECKLIST

### New Files to Create

Required frontend files:
```
web/src/routes/DataExplorer.tsx
web/src/routes/DataExplorer.module.css
web/src/routes/Publications.tsx
web/src/routes/Publications.module.css
web/src/routes/PublicationDetail.tsx
web/src/routes/PublicationDetail.module.css
web/src/routes/Changelog.tsx
web/src/routes/Changelog.module.css
web/src/components/primitives/DataTable/DataTable.tsx
web/src/components/primitives/DataTable/PaginationBar.tsx
web/src/components/primitives/DataTable/index.ts
web/src/components/primitives/DiffViewer/DiffViewer.tsx
web/src/components/primitives/DiffViewer/DiffViewer.module.css
web/src/components/primitives/DiffViewer/index.ts
web/src/components/primitives/VersionTag.tsx
web/src/hooks/useStickyTableState.ts
web/src/lib/exportCsv.ts
web/src/lib/exportBibtex.ts
tests/test_data_explorer.py
tests/test_publications_sync.py
tests/test_changelog.py
web/src/test/dataExplorer.test.tsx
web/src/test/publications.test.tsx
web/src/test/publicationDetail.test.tsx
web/src/test/changelog.test.tsx
```

Backend / infra files depending on the chosen runtime:

```text
Default current-runtime path:
  modify `dashboard/server/live_dashboard_server.py`
  optionally add extracted helpers under `dashboard/server/`
  add top-level `migrations/0003_publications.sql`
  add top-level `migrations/0004_audit_changelog.sql`

Optional future Cloudflare/D1 extraction:
  workers/publications-sync/index.ts
  workers/table-query.ts
  wrangler.toml
```

### Files to Modify
```
web/src/App.tsx                        — add 4 new lazy routes
web/src/api/schemas.ts                 — add Publication, ChangelogEntry, DatasetSnapshot, TableQueryParams
web/src/api/hooks.ts                   — add usePublications, useChangelog, useTableQuery, useSnapshots, etc.
web/src/api/mockServer.ts              — add mock responses for new `/api/*` routes and buddy-aware copy
web/src/config/featureFlags.ts         — add SQL_TABLE_EXPLORER, PUBLICATIONS_FEED, DATA_CHANGELOG
web/src/components/shell/Sidebar.tsx   — add 3 new nav items in appropriate groups
web/src/components/shell/Buddy.tsx     — add insight copy for new surfaces
web/src/components/shell/ChatDrawer.tsx — add prompts / fast paths for new features
web/src/lib/audit.ts                   — extend audit enum if new action names are required
web/src/routes/Overview.tsx            — add Publications sync MetricCard
web/src/routes/ParticipantDetail.tsx   — add Change History panel
dashboard/assistant/local_chat_assistant.py — teach the assistant the new routes and exports
dashboard/server/live_dashboard_server.py   — add the live backend endpoints unless a new runtime is introduced
```

---

## IMPLEMENTATION ORDER (Suggested Sprint Sequence)

1. **Sprint 1** — Decide the backend path first: current Python runtime only, or explicit new Worker/D1 infrastructure. If D1 is adopted, add that infra before application work.
2. **Sprint 2** — Feature 1 (DataExplorer): install `@tanstack/react-table`, build `DataTable` + `PaginationBar` + `useStickyTableState`, add route, schemas/hooks/mock server, then backend query endpoint.
3. **Sprint 3** — Feature 2 (Publications): build sync job + storage schema + API endpoints + `Publications.tsx` + `PublicationDetail.tsx`.
4. **Sprint 4** — Feature 3 (Changelog): audit helper + storage schema + `Changelog.tsx` + `DiffViewer` + entity history panels.
5. **Sprint 5** — Cross-cutting: Buddy/assistant sync, HIPAA review, audit enum review, mobile responsiveness, dark/light parity, and frontend/backend tests.

---

*This prompt was refined against the current `namo507/ESD-Lab-USC` repository state: the live React SPA under `web/`, routing in `web/src/App.tsx` via `react-router-dom`, nav in `web/src/components/shell/Sidebar.tsx`, mock API support in `web/src/api/mockServer.ts`, live backend entry in `dashboard/server/live_dashboard_server.py`, AI buddy surfaces in `Buddy.tsx` / `ChatDrawer.tsx`, and the warm-token light/dark theme system in `tokens.css` and `global.css`. Any D1/Worker infrastructure described above should be treated as new work, not as a pre-existing repo capability.*
