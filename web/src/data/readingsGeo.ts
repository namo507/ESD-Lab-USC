import rawReadings from "../../lab-readings.json";

export type GeoMapMode = "us" | "global";

export interface ReadingGeoSource {
  id: string;
  title: string;
  year: number | null;
  category: string;
  source: string;
  keywords: string[];
  abstract: string;
  pageCount: number;
  href: string;
}

export interface ReadingGeoSummary {
  id: string;
  title: string;
  year: number | null;
  category: string;
  source: string;
  pageCount: number;
  href: string;
}

export interface StateTileMeta {
  name: string;
  col: number;
  row: number;
}

export const US_STATE_TILES = {
  WA: { name: "Washington", col: 0, row: 0 },
  OR: { name: "Oregon", col: 0, row: 1 },
  CA: { name: "California", col: 0, row: 2 },
  AK: { name: "Alaska", col: 0, row: 5 },
  HI: { name: "Hawaii", col: 1, row: 5 },
  ID: { name: "Idaho", col: 1, row: 1 },
  NV: { name: "Nevada", col: 1, row: 2 },
  UT: { name: "Utah", col: 2, row: 2 },
  AZ: { name: "Arizona", col: 2, row: 3 },
  MT: { name: "Montana", col: 2, row: 0 },
  WY: { name: "Wyoming", col: 3, row: 1 },
  CO: { name: "Colorado", col: 3, row: 2 },
  NM: { name: "New Mexico", col: 3, row: 3 },
  ND: { name: "North Dakota", col: 4, row: 0 },
  SD: { name: "South Dakota", col: 4, row: 1 },
  NE: { name: "Nebraska", col: 4, row: 2 },
  KS: { name: "Kansas", col: 4, row: 3 },
  OK: { name: "Oklahoma", col: 4, row: 4 },
  TX: { name: "Texas", col: 4, row: 5 },
  MN: { name: "Minnesota", col: 5, row: 0 },
  IA: { name: "Iowa", col: 5, row: 1 },
  MO: { name: "Missouri", col: 5, row: 2 },
  AR: { name: "Arkansas", col: 5, row: 3 },
  LA: { name: "Louisiana", col: 5, row: 4 },
  WI: { name: "Wisconsin", col: 6, row: 0 },
  IL: { name: "Illinois", col: 6, row: 1 },
  KY: { name: "Kentucky", col: 6, row: 2 },
  TN: { name: "Tennessee", col: 6, row: 3 },
  MS: { name: "Mississippi", col: 6, row: 4 },
  MI: { name: "Michigan", col: 7, row: 0 },
  IN: { name: "Indiana", col: 7, row: 1 },
  OH: { name: "Ohio", col: 8, row: 1 },
  AL: { name: "Alabama", col: 7, row: 4 },
  GA: { name: "Georgia", col: 8, row: 4 },
  FL: { name: "Florida", col: 9, row: 5 },
  WV: { name: "West Virginia", col: 8, row: 2 },
  VA: { name: "Virginia", col: 9, row: 2 },
  NC: { name: "North Carolina", col: 9, row: 3 },
  SC: { name: "South Carolina", col: 9, row: 4 },
  PA: { name: "Pennsylvania", col: 9, row: 1 },
  NY: { name: "New York", col: 10, row: 0 },
  NJ: { name: "New Jersey", col: 10, row: 1 },
  MD: { name: "Maryland", col: 10, row: 2 },
  DE: { name: "Delaware", col: 11, row: 2 },
  CT: { name: "Connecticut", col: 11, row: 1 },
  MA: { name: "Massachusetts", col: 11, row: 0 },
  RI: { name: "Rhode Island", col: 12, row: 1 },
  VT: { name: "Vermont", col: 12, row: 0 },
  NH: { name: "New Hampshire", col: 13, row: 0 },
  ME: { name: "Maine", col: 14, row: 0 },
} as const satisfies Record<string, StateTileMeta>;

export type StateCode = keyof typeof US_STATE_TILES;

const COUNTRY_META = {
  USA: { label: "United States", x: 28, y: 38 },
  Canada: { label: "Canada", x: 20, y: 20 },
  Mexico: { label: "Mexico", x: 22, y: 55 },
  "United Kingdom": { label: "United Kingdom", x: 56, y: 22 },
  France: { label: "France", x: 61, y: 30 },
  Germany: { label: "Germany", x: 65, y: 28 },
  Italy: { label: "Italy", x: 67, y: 37 },
  Spain: { label: "Spain", x: 56, y: 39 },
  Netherlands: { label: "Netherlands", x: 61, y: 24 },
  China: { label: "China", x: 84, y: 34 },
  Japan: { label: "Japan", x: 94, y: 31 },
  Australia: { label: "Australia", x: 90, y: 68 },
} as const;

export type CountryCode = keyof typeof COUNTRY_META;

export interface ReadingGeoState extends StateTileMeta {
  code: StateCode;
  readingCount: number;
  pageCount: number;
  categories: string[];
  keywords: string[];
  readings: ReadingGeoSummary[];
}

export interface ReadingGeoCountry {
  code: CountryCode;
  label: string;
  x: number;
  y: number;
  readingCount: number;
  readings: ReadingGeoSummary[];
}

export interface ReadingsGeoData {
  mode: GeoMapMode;
  totalReadings: number;
  geocodedReadings: number;
  yearOptions: Array<number | "all">;
  categoryOptions: string[];
  states: ReadingGeoState[];
  activeStates: ReadingGeoState[];
  countries: ReadingGeoCountry[];
  activeCountries: ReadingGeoCountry[];
}

interface RawReadingsPayload {
  readings?: Array<{
    id?: string;
    title?: string;
    year?: number | null;
    category?: string;
    source?: string;
    keywords?: string[];
    abstract?: string;
    page_count?: number;
    href?: string;
  }>;
}

interface MutableSignal {
  pageCount: number;
  categories: Set<string>;
  keywords: Map<string, number>;
  readings: Map<string, ReadingGeoSummary>;
}

function createMutableSignal(): MutableSignal {
  return {
    pageCount: 0,
    categories: new Set<string>(),
    keywords: new Map<string, number>(),
    readings: new Map<string, ReadingGeoSummary>(),
  };
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createStatePattern(code: StateCode, name: string): RegExp {
  return new RegExp(
    `(?:\\b${escapeRegex(name)}\\b|,\\s*${escapeRegex(code)}\\b(?:\\s*,\\s*(?:USA|United States))?)`,
    "i",
  );
}

function createCountryPattern(code: CountryCode): RegExp {
  if (code === "USA") {
    return /\b(?:USA|United States)\b/i;
  }
  return new RegExp(`\\b${escapeRegex(code)}\\b`, "i");
}

const STATE_CODES = Object.keys(US_STATE_TILES) as StateCode[];
const COUNTRY_CODES = Object.keys(COUNTRY_META) as CountryCode[];

const STATE_PATTERNS = new Map<StateCode, RegExp>(
  STATE_CODES.map((code) => [code, createStatePattern(code, US_STATE_TILES[code].name)]),
);

const COUNTRY_PATTERNS = new Map<CountryCode, RegExp>(
  COUNTRY_CODES.map((code) => [code, createCountryPattern(code)]),
);

const rawPayload = rawReadings as RawReadingsPayload;

export const READING_LIBRARY: ReadingGeoSource[] = (rawPayload.readings ?? []).map((reading) => ({
  id: reading.id ?? "untitled-reading",
  title: reading.title ?? "Untitled reading",
  year: typeof reading.year === "number" ? reading.year : null,
  category: reading.category ?? "Other",
  source: reading.source ?? "Unknown source",
  keywords: Array.isArray(reading.keywords) ? reading.keywords.filter(Boolean) : [],
  abstract: reading.abstract ?? "",
  pageCount: reading.page_count ?? 0,
  href: reading.href ?? "#",
}));

function compareReadings(left: ReadingGeoSummary, right: ReadingGeoSummary): number {
  const yearDelta = (right.year ?? 0) - (left.year ?? 0);
  if (yearDelta !== 0) return yearDelta;
  const pageDelta = right.pageCount - left.pageCount;
  if (pageDelta !== 0) return pageDelta;
  return left.title.localeCompare(right.title);
}

function sortByReadingCount<T extends { readingCount: number; label?: string; code?: string }>(
  left: T,
  right: T,
): number {
  if (right.readingCount !== left.readingCount) return right.readingCount - left.readingCount;
  const leftLabel = left.label ?? left.code ?? "";
  const rightLabel = right.label ?? right.code ?? "";
  return leftLabel.localeCompare(rightLabel);
}

function matchStates(text: string): StateCode[] {
  const matches = new Set<StateCode>();
  for (const code of STATE_CODES) {
    const pattern = STATE_PATTERNS.get(code);
    if (pattern?.test(text)) {
      matches.add(code);
    }
  }
  return Array.from(matches);
}

function matchCountries(text: string): CountryCode[] {
  const matches = new Set<CountryCode>();
  for (const code of COUNTRY_CODES) {
    const pattern = COUNTRY_PATTERNS.get(code);
    if (pattern?.test(text)) {
      matches.add(code);
    }
  }
  return Array.from(matches);
}

function addReadingToSignal(signal: MutableSignal, reading: ReadingGeoSource): void {
  if (!signal.readings.has(reading.id)) {
    signal.readings.set(reading.id, {
      id: reading.id,
      title: reading.title,
      year: reading.year,
      category: reading.category,
      source: reading.source,
      pageCount: reading.pageCount,
      href: reading.href,
    });
    signal.pageCount += reading.pageCount;
  }

  signal.categories.add(reading.category);
  for (const keyword of reading.keywords) {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) continue;
    signal.keywords.set(normalized, (signal.keywords.get(normalized) ?? 0) + 1);
  }
}

function topKeywords(signal: MutableSignal): string[] {
  return Array.from(signal.keywords.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
    .slice(0, 4)
    .map(([keyword]) => keyword);
}

export function buildReadingsGeoFromReadings(readings: ReadingGeoSource[]): ReadingsGeoData {
  const stateSignals = new Map<StateCode, MutableSignal>();
  const countrySignals = new Map<CountryCode, MutableSignal>();
  const geocodedReadingIds = new Set<string>();

  for (const reading of readings) {
    const searchText = [reading.title, reading.source, reading.abstract].filter(Boolean).join(" · ");
    const matchedStates = matchStates(searchText);
    const matchedCountries = matchCountries(searchText);

    if (matchedStates.length > 0 || matchedCountries.length > 0) {
      geocodedReadingIds.add(reading.id);
    }

    for (const code of matchedStates) {
      const signal = stateSignals.get(code) ?? createMutableSignal();
      addReadingToSignal(signal, reading);
      stateSignals.set(code, signal);
    }

    for (const code of matchedCountries) {
      const signal = countrySignals.get(code) ?? createMutableSignal();
      addReadingToSignal(signal, reading);
      countrySignals.set(code, signal);
    }
  }

  const states = STATE_CODES.map((code) => {
    const signal = stateSignals.get(code);
    const meta = US_STATE_TILES[code];
    return {
      code,
      name: meta.name,
      col: meta.col,
      row: meta.row,
      readingCount: signal?.readings.size ?? 0,
      pageCount: signal?.pageCount ?? 0,
      categories: signal ? Array.from(signal.categories).sort((left, right) => left.localeCompare(right)) : [],
      keywords: signal ? topKeywords(signal) : [],
      readings: signal ? Array.from(signal.readings.values()).sort(compareReadings) : [],
    };
  });

  const countries = COUNTRY_CODES.map((code) => {
    const signal = countrySignals.get(code);
    const meta = COUNTRY_META[code];
    return {
      code,
      label: meta.label,
      x: meta.x,
      y: meta.y,
      readingCount: signal?.readings.size ?? 0,
      readings: signal ? Array.from(signal.readings.values()).sort(compareReadings) : [],
    };
  });

  const activeStates = states.filter((state) => state.readingCount > 0).sort(sortByReadingCount);
  const activeCountries = countries.filter((country) => country.readingCount > 0).sort(sortByReadingCount);
  const nonUsCountrySignals = activeCountries.filter((country) => country.code !== "USA");
  const usCoverage = activeStates.length;
  const globalCoverage = nonUsCountrySignals.length;
  const mode: GeoMapMode = usCoverage >= 6 || (usCoverage >= 4 && usCoverage >= globalCoverage)
    ? "us"
    : "global";

  const years = new Set<number>();
  const categories = new Set<string>();
  for (const reading of readings) {
    if (typeof reading.year === "number") {
      years.add(reading.year);
    }
    categories.add(reading.category);
  }

  return {
    mode,
    totalReadings: readings.length,
    geocodedReadings: geocodedReadingIds.size,
    yearOptions: ["all", ...Array.from(years).sort((left, right) => right - left)],
    categoryOptions: ["all", ...Array.from(categories).sort((left, right) => left.localeCompare(right))],
    states,
    activeStates,
    countries,
    activeCountries,
  };
}

export const READINGS_GEO = buildReadingsGeoFromReadings(READING_LIBRARY);