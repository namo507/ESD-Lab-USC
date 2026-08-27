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

export interface StateGeoMeta {
  name: string;
  lat: number;
  lng: number;
}

export const US_STATE_CENTROIDS = {
  AL: { name: "Alabama", lat: 32.7794, lng: -86.8287 },
  AK: { name: "Alaska", lat: 64.0685, lng: -152.2782 },
  AZ: { name: "Arizona", lat: 34.2744, lng: -111.6602 },
  AR: { name: "Arkansas", lat: 34.8938, lng: -92.4426 },
  CA: { name: "California", lat: 37.1841, lng: -119.4696 },
  CO: { name: "Colorado", lat: 38.9972, lng: -105.5478 },
  CT: { name: "Connecticut", lat: 41.6219, lng: -72.7273 },
  DE: { name: "Delaware", lat: 38.9896, lng: -75.505 },
  FL: { name: "Florida", lat: 28.6305, lng: -82.4497 },
  GA: { name: "Georgia", lat: 32.6415, lng: -83.4426 },
  HI: { name: "Hawaii", lat: 20.2927, lng: -156.3737 },
  ID: { name: "Idaho", lat: 44.3509, lng: -114.613 },
  IL: { name: "Illinois", lat: 40.0417, lng: -89.1965 },
  IN: { name: "Indiana", lat: 39.8942, lng: -86.2816 },
  IA: { name: "Iowa", lat: 42.0751, lng: -93.496 },
  KS: { name: "Kansas", lat: 38.4937, lng: -98.3804 },
  KY: { name: "Kentucky", lat: 37.5347, lng: -85.3021 },
  LA: { name: "Louisiana", lat: 31.0689, lng: -91.9968 },
  ME: { name: "Maine", lat: 45.3695, lng: -69.2428 },
  MD: { name: "Maryland", lat: 39.055, lng: -76.7909 },
  MA: { name: "Massachusetts", lat: 42.2596, lng: -71.8083 },
  MI: { name: "Michigan", lat: 44.3467, lng: -85.4102 },
  MN: { name: "Minnesota", lat: 46.2807, lng: -94.3053 },
  MS: { name: "Mississippi", lat: 32.7364, lng: -89.6678 },
  MO: { name: "Missouri", lat: 38.3566, lng: -92.458 },
  MT: { name: "Montana", lat: 47.0527, lng: -109.6333 },
  NE: { name: "Nebraska", lat: 41.5378, lng: -99.7951 },
  NV: { name: "Nevada", lat: 39.3289, lng: -116.6312 },
  NH: { name: "New Hampshire", lat: 43.6805, lng: -71.5811 },
  NJ: { name: "New Jersey", lat: 40.1907, lng: -74.6728 },
  NM: { name: "New Mexico", lat: 34.4071, lng: -106.1126 },
  NY: { name: "New York", lat: 42.9538, lng: -75.5268 },
  NC: { name: "North Carolina", lat: 35.5557, lng: -79.3877 },
  ND: { name: "North Dakota", lat: 47.4501, lng: -100.4659 },
  OH: { name: "Ohio", lat: 40.2862, lng: -82.7937 },
  OK: { name: "Oklahoma", lat: 35.5889, lng: -97.4943 },
  OR: { name: "Oregon", lat: 43.9336, lng: -120.5583 },
  PA: { name: "Pennsylvania", lat: 40.8781, lng: -77.7996 },
  RI: { name: "Rhode Island", lat: 41.6762, lng: -71.5562 },
  SC: { name: "South Carolina", lat: 33.9169, lng: -80.8964 },
  SD: { name: "South Dakota", lat: 44.4443, lng: -100.2263 },
  TN: { name: "Tennessee", lat: 35.858, lng: -86.3505 },
  TX: { name: "Texas", lat: 31.4757, lng: -99.3312 },
  UT: { name: "Utah", lat: 39.3055, lng: -111.6703 },
  VT: { name: "Vermont", lat: 44.0687, lng: -72.6658 },
  VA: { name: "Virginia", lat: 37.5215, lng: -78.8537 },
  WA: { name: "Washington", lat: 47.3826, lng: -120.4472 },
  WV: { name: "West Virginia", lat: 38.6409, lng: -80.6227 },
  WI: { name: "Wisconsin", lat: 44.6243, lng: -89.9941 },
  WY: { name: "Wyoming", lat: 42.9957, lng: -107.5512 },
} as const satisfies Record<string, StateGeoMeta>;

export type StateCode = keyof typeof US_STATE_CENTROIDS;

const COUNTRY_META = {
  USA: { label: "United States", lat: 39.8283, lng: -98.5795 },
  Canada: { label: "Canada", lat: 56.1304, lng: -106.3468 },
  Mexico: { label: "Mexico", lat: 23.6345, lng: -102.5528 },
  "United Kingdom": { label: "United Kingdom", lat: 55.3781, lng: -3.436 },
  France: { label: "France", lat: 46.2276, lng: 2.2137 },
  Germany: { label: "Germany", lat: 51.1657, lng: 10.4515 },
  Italy: { label: "Italy", lat: 41.8719, lng: 12.5674 },
  Spain: { label: "Spain", lat: 40.4637, lng: -3.7492 },
  Netherlands: { label: "Netherlands", lat: 52.1326, lng: 5.2913 },
  China: { label: "China", lat: 35.8617, lng: 104.1954 },
  Japan: { label: "Japan", lat: 36.2048, lng: 138.2529 },
  Australia: { label: "Australia", lat: -25.2744, lng: 133.7751 },
} as const;

export type CountryCode = keyof typeof COUNTRY_META;

export interface ReadingGeoState extends StateGeoMeta {
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
  lat: number;
  lng: number;
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

export interface RawReadingsPayload {
  readings?: Array<{
    id?: string;
    title?: string;
    year?: number | null;
    category?: string;
    source?: string;
    keywords?: string[];
    abstract?: string;
    page_count?: number;
    pageCount?: number;
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

const STATE_CODES = Object.keys(US_STATE_CENTROIDS) as StateCode[];
const COUNTRY_CODES = Object.keys(COUNTRY_META) as CountryCode[];

const STATE_PATTERNS = new Map<StateCode, RegExp>(
  STATE_CODES.map((code) => [code, createStatePattern(code, US_STATE_CENTROIDS[code].name)]),
);

const COUNTRY_PATTERNS = new Map<CountryCode, RegExp>(
  COUNTRY_CODES.map((code) => [code, createCountryPattern(code)]),
);

const rawPayload = rawReadings as RawReadingsPayload;

export function normalizeReadingLibrary(payload: RawReadingsPayload | undefined): ReadingGeoSource[] {
  return (payload?.readings ?? []).map((reading) => ({
    id: reading.id ?? "untitled-reading",
    title: reading.title ?? "Untitled reading",
    year: typeof reading.year === "number" ? reading.year : null,
    category: reading.category ?? "Other",
    source: reading.source ?? "Unknown source",
    keywords: Array.isArray(reading.keywords) ? reading.keywords.filter(Boolean) : [],
    abstract: reading.abstract ?? "",
    pageCount: reading.page_count ?? reading.pageCount ?? 0,
    href: reading.href ?? "#",
  }));
}

export const READING_LIBRARY: ReadingGeoSource[] = normalizeReadingLibrary(rawPayload);

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
    const meta = US_STATE_CENTROIDS[code];
    return {
      code,
      name: meta.name,
      lat: meta.lat,
      lng: meta.lng,
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
      lat: meta.lat,
      lng: meta.lng,
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
