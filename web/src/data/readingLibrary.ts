/**
 * Reading-library corpus metrics.
 *
 * `lab-readings.json` is the indexed manifest of `esd-lab-readings/` — built by
 * `dashboard/pipelines/build_readings_index.py` from the lab's PDF library. We
 * import it at build time so the public landing can showcase the *real* corpus
 * (counts, pages, sources, years, indexed terms) as metric graphs without
 * depending on the readings API being reachable from the static deployment.
 *
 * The Overview route still streams the same library live via `useReadingsLibrary`
 * for its geography map; this module is the static, always-available view used
 * for the landing showcase.
 */
import manifest from "../../lab-readings.json";

export interface CorpusReading {
  id: string;
  title: string;
  year: number | null;
  category: string;
  source: string;
  keywords: string[];
  pageCount: number;
  sizeMb: number;
  href: string;
}

export interface CorpusBar {
  key: string;
  label: string;
  count: number;
  pages: number;
}

export interface CorpusMetrics {
  generatedAt: string | null;
  totalReadings: number;
  totalPages: number;
  totalMb: number;
  sourceCount: number;
  yearSpan: [number, number] | null;
  bySource: CorpusBar[];
  byYear: CorpusBar[];
  depthBuckets: CorpusBar[];
  topKeywords: Array<{ term: string; count: number }>;
  readings: CorpusReading[];
}

interface RawReading {
  id?: unknown;
  title?: unknown;
  year?: unknown;
  category?: unknown;
  source?: unknown;
  keywords?: unknown;
  page_count?: unknown;
  size_mb?: unknown;
  href?: unknown;
}

interface RawManifest {
  generated_at?: unknown;
  readings?: RawReading[];
}

const raw = manifest as unknown as RawManifest;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Titlecased page title — manifest titles are sometimes ALL CAPS shouting. */
function tidyTitle(title: string): string {
  if (!title) return "Untitled reading";
  const letters = title.replace(/[^A-Za-z]/g, "");
  const upperRatio = letters ? letters.replace(/[^A-Z]/g, "").length / letters.length : 0;
  if (upperRatio < 0.7) return title.trim();
  return title
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase())
    .trim();
}

const READINGS: CorpusReading[] = (raw.readings ?? []).map((entry, index) => ({
  id: asString(entry.id, `reading-${index}`),
  title: tidyTitle(asString(entry.title)),
  year: typeof entry.year === "number" ? entry.year : null,
  category: asString(entry.category, "Uncategorized"),
  source: asString(entry.source, "ESD Lab Reading Library"),
  keywords: Array.isArray(entry.keywords) ? entry.keywords.filter((k): k is string => typeof k === "string") : [],
  pageCount: Math.round(asNumber(entry.page_count)),
  sizeMb: asNumber(entry.size_mb),
  href: asString(entry.href, "#"),
}));

/** Stopwords + noise tokens to keep the indexed-term cloud meaningful. */
const TERM_STOP = new Set([
  "the", "and", "for", "with", "from", "this", "that", "are", "was", "were",
  "page", "pages", "volume", "edited", "human", "nine", "sixty", "none", "n/a",
  "advances", "child", "development", "behavior", "contents", "series", "title",
  "including", "approach", "perspective", "chapter",
  // Editor / author surnames picked up from front-matter pages.
  "jeffrey", "austin", "lockman", "benson", "bradshaw",
]);

function buildKeywordRanking(readings: CorpusReading[]): Array<{ term: string; count: number }> {
  const counts = new Map<string, number>();
  for (const reading of readings) {
    const seen = new Set<string>();
    for (const keyword of reading.keywords) {
      const term = keyword.trim().toLowerCase();
      if (term.length < 4 || TERM_STOP.has(term) || /^\d+$/.test(term)) continue;
      if (seen.has(term)) continue;
      seen.add(term);
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, 12);
}

function groupBars(
  readings: CorpusReading[],
  keyOf: (reading: CorpusReading) => string,
  labelOf: (key: string) => string,
  sort: (a: CorpusBar, b: CorpusBar) => number,
): CorpusBar[] {
  const groups = new Map<string, CorpusBar>();
  for (const reading of readings) {
    const key = keyOf(reading);
    const bar = groups.get(key) ?? { key, label: labelOf(key), count: 0, pages: 0 };
    bar.count += 1;
    bar.pages += reading.pageCount;
    groups.set(key, bar);
  }
  return [...groups.values()].sort(sort);
}

const DEPTH_BUCKETS: Array<{ key: string; label: string; min: number; max: number }> = [
  { key: "brief", label: "1–5 pg", min: 0, max: 5 },
  { key: "short", label: "6–20 pg", min: 6, max: 20 },
  { key: "chapter", label: "21–40 pg", min: 21, max: 40 },
  { key: "deep", label: "41+ pg", min: 41, max: Infinity },
];

function computeMetrics(): CorpusMetrics {
  const years = READINGS.map((r) => r.year).filter((y): y is number => y != null);
  const sources = new Set(READINGS.map((r) => r.source));

  const bySource = groupBars(
    READINGS,
    (r) => r.source,
    (key) => key,
    (a, b) => b.count - a.count || b.pages - a.pages,
  );

  const byYear = groupBars(
    READINGS,
    (r) => (r.year == null ? "undated" : String(r.year)),
    (key) => (key === "undated" ? "Undated" : key),
    (a, b) => {
      if (a.key === "undated") return 1;
      if (b.key === "undated") return -1;
      return Number(a.key) - Number(b.key);
    },
  );

  const depthBuckets: CorpusBar[] = DEPTH_BUCKETS.map((bucket) => {
    const items = READINGS.filter((r) => r.pageCount >= bucket.min && r.pageCount <= bucket.max);
    return {
      key: bucket.key,
      label: bucket.label,
      count: items.length,
      pages: items.reduce((sum, r) => sum + r.pageCount, 0),
    };
  });

  return {
    generatedAt: typeof raw.generated_at === "string" ? raw.generated_at : null,
    totalReadings: READINGS.length,
    totalPages: READINGS.reduce((sum, r) => sum + r.pageCount, 0),
    totalMb: READINGS.reduce((sum, r) => sum + r.sizeMb, 0),
    sourceCount: sources.size,
    yearSpan: years.length ? [Math.min(...years), Math.max(...years)] : null,
    bySource,
    byYear,
    depthBuckets,
    topKeywords: buildKeywordRanking(READINGS),
    readings: READINGS,
  };
}

export const READING_CORPUS: CorpusMetrics = computeMetrics();
