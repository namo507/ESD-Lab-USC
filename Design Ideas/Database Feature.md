# ESD Lab Dashboard — Feature Implementation Prompt
## Copilot / AI Coding Agent Instruction Set (Production-Grade)

> **Repository:** `namo507/ESD-Lab-USC`
> **Frontend stack:** React 18 + TypeScript + Vite + TanStack Query + Zod + Tailwind CSS
> **Backend:** Cloudflare Workers + Pages (edge-native, serverless)
> **Database target:** Cloudflare D1 (SQLite semantics, edge-distributed)
> **Deployed at:** `esd-lab-namo.pages.dev` (Cloudflare Pages)
> **Constraint:** All participant data is HIPAA-regulated. No PHI (DOB, MRN, name) ever leaves the server unmasked. Every new API endpoint must use parameterized prepared statements only — zero raw string concatenation in SQL.

---

## CONTEXT FOR THE CODING AGENT

You are implementing three major, interconnected features for the **NANO Study Dashboard** at the ESD Lab, University of South Carolina. The study tracks 260 very preterm (VPT) infants across cohorts (VPT, ASIB, TD) from NICU through age 3, collecting ECG, temperature, behavioral coding, and REDCap assessment data. The frontend is a React 18 + TypeScript SPA (`web/src/`) with TanStack Router for routing, TanStack Query for server state, Zod for schema validation, and the project's own `@/components/primitives` design system (Badge, Button, Card, Gloss, Icon, Segmented, Tooltip, KPI, SectionLabel). Feature flags live in `web/src/config/featureFlags.ts`; add a new flag for each feature and gate it. All new routes are lazy-loaded via `React.lazy()` in `web/src/App.tsx`. The API client (`web/src/api/client.ts`) uses a thin fetch wrapper — all new endpoints go through it. Schemas are validated with Zod in `web/src/api/schemas.ts`. Backend Workers live in `dashboard/server/` or a new `workers/` directory.

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

This is a fully generic, reusable headless table component wrapping `@tanstack/react-table` (already in package.json — do NOT add `material-react-table`; stay within the existing Tailwind design system). Build it from scratch using `useReactTable` with the following plugins:

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
  storageKey?: string; // for localStorage persistence
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

Render: `[← Prev] [1] [2] ... [n] [Next →]` with an ellipsis collapse when pageCount > 7. Show `"Showing 26–50 of 231 rows"` on the right. Page-size selector is a native `<select>` using CSS token `--color-surface-2` background. All buttons use the existing `Button` primitive with `variant="ghost"` and `size="sm"`.

### 1.5 Sticky State (localStorage Persistence)
**Create:** `web/src/hooks/useStickyTableState.ts`

```ts
// Persists columnVisibility, columnOrder, sorting, and pageSize to localStorage.
// Uses lazy initializer pattern — reads storage only on first mount.
// Key format: `esd-table-${storageKey}` to namespace per table.
// Safe for SSR: checks typeof window !== 'undefined' before any storage access.
export function useStickyTableState(storageKey: string, defaults: StickyTableState): [StickyTableState, (next: StickyTableState) => void]
```

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
4. Calls `logAudit({ action: 'data.export', scope: '/data-explorer/' + tableName })` before download.

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

### 1.10 Cloudflare Worker Endpoint
**Create:** `workers/table-query.ts` (or add to `dashboard/server/live_dashboard_server.py` if Python FastAPI is the backend pattern — match the existing backend pattern in the repo).

The handler must:
1. Parse and validate the incoming `TableQueryParams` (mirror the Zod schema in TS, or use Pydantic if Python).
2. Build a parameterized D1 query dynamically — **only** using the `?` placeholder syntax, never string interpolation for user-supplied values.
3. Apply `LIMIT` and `OFFSET` for pagination.
4. Apply `ORDER BY` only against a **whitelist** of allowed column names (hard-coded per table — prevents injection via sort field).
5. Return `{ rows, total, page, pageSize }`.

### 1.11 Route Registration
In `web/src/App.tsx`:
```tsx
const DataExplorer = lazy(() => import('@/routes/DataExplorer').then(m => ({ default: m.DataExplorer })));
// Add inside <Routes>:
<Route path="/data-explorer" element={<DataExplorer />} />
```

In the Sidebar navigation (find `Sidebar.tsx` in `web/src/components/shell/`), add a nav item `{ path: '/data-explorer', label: 'Data Explorer', icon: 'table' }` under the "Data" section group, gated by `useFeatureFlag('SQL_TABLE_EXPLORER')`.

### 1.12 Module CSS
**Create:** `web/src/routes/DataExplorer.module.css` with these class definitions using the project's CSS token variables from `tokens.css`:
- `.page` — standard page layout matching `Participants.module.css`
- `.toolbar` — flex row, space-between, align-center, gap var(--space-3)
- `.tableWrap` — overflow-x auto, border-radius var(--radius-2), border 1px solid var(--color-border)
- `.th` — monospace font-family, font-size 0.75rem, color var(--color-text-2), padding var(--space-2) var(--space-3), border-bottom 1px solid var(--color-border), white-space nowrap, cursor pointer, user-select none
- `.td` — font-size 0.875rem, padding var(--space-2) var(--space-3), border-bottom 1px solid var(--color-border-subtle)
- `.trHover:hover` — background var(--color-surface-hover)
- `.numericCell` — text-align right, font-variant-numeric tabular-nums
- `.nullCell` — color var(--color-text-3), font-style italic

---

## FEATURE 2 — AUTOMATED PUBMED + JOURNAL WEB-SCRAPER PIPELINE WITH CITATION EXTRACTION AND AUTO-TAGGING

### 2.1 Feature Flag
```ts
PUBLICATIONS_FEED: false,
```

### 2.2 Backend ETL Worker (Scheduled Cron)
**Create:** `workers/publications-sync/index.ts`

This is a **Cloudflare Worker with a Cron Trigger** that runs every Sunday at 02:00 UTC. It is a fully automated ETL pipeline:

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

Add a 400ms delay between esearch and efetch to respect NCBI rate limits (3 req/sec without API key; register a free NCBI API key and store it in `wrangler.toml` as `NCBI_API_KEY` secret — then rate limit is 10 req/sec).

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

Parse the PubMed XML response using a minimal hand-rolled XML extractor (no external XML parser — use regex on the known PubMed DTD structure or the DOMParser API available in the Workers runtime):

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

#### Phase E — Load (D1 Idempotent Upsert)

First, ensure the D1 database has this `publications` table (add migration to `migrations/` directory):

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
**Create** in the Worker router or Python FastAPI backend:

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
Inside `PublicationDetail.tsx`, add an "Edit Tags" mode gated by an `isAdmin` check (derive from the existing JWT/auth context). In edit mode:
- Render all TAG_RULES as a checkbox grid
- Allow free-text custom tag input (comma-separated)
- Save button calls `PATCH /api/publications/:pmid/tags` with `{ tags: string[] }`
- Tags marked with a `·` prefix in the auto-tag badge to distinguish auto vs. manually added tags

### 2.6 Sync Status Card on Overview
In `web/src/routes/Overview.tsx`, add inside the KPI row (below existing MetricCards, gated by `PUBLICATIONS_FEED` flag):
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

In Sidebar: add `{ path: '/publications', label: 'Publications', icon: 'book-open' }` under a new "Science" section group, gated by `PUBLICATIONS_FEED`.

---

## FEATURE 3 — DATASET VERSIONING AND CHANGE HISTORY UI

### 3.1 Feature Flag
```ts
DATA_CHANGELOG: false,
```

### 3.2 D1 Schema: Audit Log Table
**Add to migrations:**

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

### 3.3 Audit Middleware (Backend)
**Create:** `workers/audit-middleware.ts` (or equivalent Python decorator if FastAPI)

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

The Cron Worker (publications sync) must also call this middleware with `actor = 'cron'`, `actor_role = 'system'`, `action = 'SYNC'`.

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

In Sidebar: add `{ path: '/changelog', label: 'Change History', icon: 'clock' }` under "Admin" section group, gated by `DATA_CHANGELOG`.

---

## CROSS-CUTTING REQUIREMENTS (All Three Features)

### Audit Logging
Every user-initiated action across all three features must call the existing `logAudit` utility from `@/lib/audit`:
```ts
logAudit({ action: 'data.export', scope: '/data-explorer/participants' })
logAudit({ action: 'publications.sync.trigger', scope: '/publications' })
logAudit({ action: 'snapshot.create', scope: '/changelog', meta: { tag } })
```

### HIPAA Guards
- The `DataExplorer` table for `participants` must **never** expose columns: `dob`, `mrn`, `caregiver_id`, `address`, `name`. These are PHI. The API whitelist must hard-code the allowed columns.
- The `Changelog` diff viewer must redact any PHI field values with `[REDACTED]` before sending to the frontend. The backend must maintain a `PHI_FIELDS` constant and strip these from `changed_fields_json` before API response.
- All three routes must log to `logAudit` on mount with action `'page.view'` for the IRB activity log.

### Loading & Error States
All three routes must handle loading states using the existing `<PageFallback>` pattern and error boundaries. Wrap with:
```tsx
<Suspense fallback={<PageFallback />}>
  <ErrorBoundary fallback={<ErrorPage />}>
    {/* route content */}
  </ErrorBoundary>
</Suspense>
```

### Mobile Responsiveness
- `DataExplorer`: on viewport < 768px, collapse the column visibility panel, show only first 5 columns by default, pagination bar collapses to `[← Prev] Page X of Y [Next →]` format.
- `Publications`: stack left filter panel above cards on mobile.
- `Changelog`: collapse to single-column timeline on mobile; hide filter sidebar behind a "Filters ▾" drawer button.

### TypeScript Strictness
- `"strict": true` is already set in `tsconfig.json`. No `any` types. Use `unknown` + type guards where necessary.
- All new hooks must include proper generic type parameters.
- All new component props must use explicit interfaces (not inline type literals).

### Testing
Add test files:
- `tests/test_data_explorer.py` — tests for the Worker `/api/table/query` endpoint: pagination math, sort whitelist rejection, PHI column exclusion
- `tests/test_publications_sync.py` — tests for ETL pipeline: XML parsing, tag assignment, idempotent upsert, ORCID merge
- `tests/test_changelog.py` — tests for audit middleware: diff computation, PHI field redaction, snapshot checksum

---

## FILE CREATION CHECKLIST

### New Files to Create
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
workers/publications-sync/index.ts
workers/publications-sync/wrangler.toml
workers/table-query.ts
migrations/0003_publications.sql
migrations/0004_audit_changelog.sql
tests/test_data_explorer.py
tests/test_publications_sync.py
tests/test_changelog.py
```

### Files to Modify
```
web/src/App.tsx                        — add 4 new lazy routes
web/src/api/schemas.ts                 — add Publication, ChangelogEntry, DatasetSnapshot, TableQueryParams
web/src/api/hooks.ts                   — add usePublications, useChangelog, useTableQuery, useSnapshots, etc.
web/src/config/featureFlags.ts         — add SQL_TABLE_EXPLORER, PUBLICATIONS_FEED, DATA_CHANGELOG
web/src/components/shell/Sidebar.tsx   — add 3 new nav items in appropriate groups
web/src/routes/Overview.tsx            — add Publications sync MetricCard
web/src/routes/ParticipantDetail.tsx   — add Change History panel
workers/wrangler.toml                  — add D1 bindings, NCBI_API_KEY secret, Cron trigger
```

---

## IMPLEMENTATION ORDER (Suggested Sprint Sequence)

1. **Sprint 1** — Migrations + D1 schema (`0003`, `0004`) → enables both Feature 2 and 3 backend work in parallel
2. **Sprint 2** — Feature 1 (DataExplorer): `DataTable` component + `PaginationBar` + `useStickyTableState` + `DataExplorer.tsx` route + Worker endpoint
3. **Sprint 3** — Feature 2 (Publications): ETL Worker + D1 upsert + API endpoints + `Publications.tsx` + `PublicationDetail.tsx`
4. **Sprint 4** — Feature 3 (Changelog): Audit middleware + `Changelog.tsx` + `DiffViewer` component + entity history panels on `ParticipantDetail` + `PublicationDetail`
5. **Sprint 5** — Cross-cutting: HIPAA guards review, tests, mobile responsiveness, feature flag activation in staging, audit log review

---

*This prompt was generated from analysis of the `namo507/ESD-Lab-USC` repository (React 18 + TypeScript + Vite + Cloudflare Pages architecture) and the ESD Lab Feature Enhancement research document. All implementation details are specific to the existing codebase patterns, component library, and HIPAA constraints of the NANO Study.*
