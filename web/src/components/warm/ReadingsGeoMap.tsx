import { useEffect, useMemo, useState } from "react";
import {
  READING_LIBRARY,
  READINGS_GEO,
  buildReadingsGeoFromReadings,
  type CountryCode,
  type GeoMapMode,
  type ReadingGeoCountry,
  type ReadingGeoState,
  type StateCode,
} from "@/data/readingsGeo";

interface HoverInsight {
  term: string;
  body: string;
}

const LEGEND_STOPS = [
  { label: "No signal", count: 0 },
  { label: "1 reading", count: 1 },
  { label: "2 readings", count: 2 },
  { label: "3+ readings", count: 3 },
] as const;

function formatReadingCount(count: number): string {
  return `${count} reading${count === 1 ? "" : "s"}`;
}

function formatYear(year: number | null): string {
  return year ? String(year) : "n/a";
}

function metricLabel(mode: GeoMapMode): string {
  return mode === "us" ? "State signals" : "Country signals";
}

function createInsightAttrs(insight: HoverInsight) {
  return {
    "data-insight": "dynamic",
    "data-insight-term": insight.term,
    "data-insight-body": insight.body,
  } as const;
}

function formatCategoryCount(count: number): string {
  return `${count} reading ${count === 1 ? "category" : "categories"}`;
}

function describeStateInsight(state: ReadingGeoState): HoverInsight {
  if (state.readingCount === 0) {
    return {
      term: state.name,
      body: `No indexed readings in the active filter carry a direct affiliation signal for ${state.name}.`,
    };
  }

  const keywordNote = state.keywords.length > 0
    ? ` Frequent keywords: ${state.keywords.join(", ")}.`
    : "";

  return {
    term: state.name,
    body: `${formatReadingCount(state.readingCount)} linked to ${state.name} across ${state.pageCount} indexed pages and ${formatCategoryCount(state.categories.length)}.${keywordNote}`,
  };
}

function describeCountryInsight(country: ReadingGeoCountry): HoverInsight {
  const pageCount = country.readings.reduce((sum, reading) => sum + reading.pageCount, 0);

  if (country.readingCount === 0) {
    return {
      term: country.label,
      body: `No indexed readings in the active filter carry a direct country-level signal for ${country.label}.`,
    };
  }

  return {
    term: country.label,
    body: `${formatReadingCount(country.readingCount)} linked to ${country.label} across ${pageCount} indexed pages in the current filter.`,
  };
}

function resolveStateTone(count: number, selected: boolean): { background: string; border: string; color: string; shadow: string } {
  if (selected) {
    return {
      background: count > 0 ? "var(--white)" : "var(--warm-pill)",
      border: "var(--usc-garnet)",
      color: "var(--usc-garnet)",
      shadow: "0 0 0 1px var(--usc-garnet), var(--shadow-overlay)",
    };
  }
  if (count >= 3) {
    return {
      background: "var(--ocean)",
      border: "var(--ocean)",
      color: "var(--white)",
      shadow: "none",
    };
  }
  if (count === 2) {
    return {
      background: "var(--blue-tint)",
      border: "var(--ocean-ring)",
      color: "var(--on-info)",
      shadow: "none",
    };
  }
  if (count === 1) {
    return {
      background: "var(--ocean-soft)",
      border: "var(--ocean-ring)",
      color: "var(--on-info)",
      shadow: "none",
    };
  }
  return {
    background: "var(--warm-pill)",
    border: "var(--warm-border)",
    color: "var(--warm-fg4)",
    shadow: "none",
  };
}

function resolveCountryTone(count: number, selected: boolean): { fill: string; stroke: string; text: string } {
  if (selected) {
    return { fill: "var(--white)", stroke: "var(--usc-garnet)", text: "var(--usc-garnet)" };
  }
  if (count >= 3) {
    return { fill: "var(--ocean)", stroke: "var(--ocean)", text: "var(--white)" };
  }
  if (count === 2) {
    return { fill: "var(--blue-tint)", stroke: "var(--ocean-ring)", text: "var(--on-info)" };
  }
  return { fill: "var(--ocean-soft)", stroke: "var(--ocean-ring)", text: "var(--on-info)" };
}

function MapSummaryCard({
  label,
  value,
  note,
  insight,
}: {
  label: string;
  value: string;
  note: string;
  insight: HoverInsight;
}) {
  return (
    <div
      className="rounded-2xl border border-[color:var(--warm-border)] bg-white px-4 py-3"
      {...createInsightAttrs(insight)}
    >
      <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">{label}</div>
      <div className="mt-1 font-serif text-[28px] font-semibold leading-none text-[color:var(--warm-fg1)]">{value}</div>
      <div className="mt-1 text-[11px] text-[color:var(--warm-fg3)]">{note}</div>
    </div>
  );
}

function UnitedStatesReadingMap({
  states,
  activeCode,
  onSelect,
}: {
  states: ReadingGeoState[];
  activeCode: StateCode | null;
  onSelect: (code: StateCode) => void;
}) {
  const columnCount = useMemo(
    () => states.reduce((maxCol, state) => Math.max(maxCol, state.col), 0) + 1,
    [states],
  );
  const rowCount = useMemo(
    () => states.reduce((maxRow, state) => Math.max(maxRow, state.row), 0) + 1,
    [states],
  );

  return (
    <div className="rounded-[24px] border border-[color:var(--warm-border)] bg-[color:var(--warm-bg)] p-4">
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rowCount}, 52px)`,
        }}
      >
        {states.map((state) => {
          const tone = resolveStateTone(state.readingCount, state.code === activeCode);
          return (
            <button
              key={state.code}
              type="button"
              aria-pressed={state.code === activeCode}
              title={`${state.name} · ${state.readingCount > 0 ? formatReadingCount(state.readingCount) : "no signal"}`}
              onClick={() => onSelect(state.code)}
              className="min-w-0 rounded-[14px] border px-2 py-1.5 text-left transition hover:-translate-y-[1px]"
              {...createInsightAttrs(describeStateInsight(state))}
              style={{
                gridColumn: state.col + 1,
                gridRow: state.row + 1,
                background: tone.background,
                borderColor: tone.border,
                color: tone.color,
                boxShadow: tone.shadow,
              }}
            >
              <div className="text-[11px] font-mono font-semibold leading-none">{state.code}</div>
              <div className="mt-2 text-[10px] leading-none opacity-80">
                {state.readingCount > 0 ? state.readingCount : "--"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-[color:var(--warm-fg3)]">
        <span>Grey tiles indicate no affiliation signal in the current reading filter.</span>
        {LEGEND_STOPS.map((item) => {
          const tone = resolveStateTone(item.count, false);
          return (
            <span key={item.label} className="inline-flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full border"
                style={{ background: tone.background, borderColor: tone.border }}
                aria-hidden
              />
              {item.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function GlobalReadingMap({
  countries,
  activeCode,
  onSelect,
}: {
  countries: ReadingGeoCountry[];
  activeCode: CountryCode | null;
  onSelect: (code: CountryCode) => void;
}) {
  const activeCountries = countries.filter((country) => country.readingCount > 0);
  const unitedStates = countries.find((country) => country.code === "USA") ?? null;

  return (
    <div className="rounded-[24px] border border-[color:var(--warm-border)] bg-[color:var(--warm-bg)] p-4">
      <svg viewBox="0 0 100 80" className="h-[340px] w-full" role="img" aria-label="Global reading geography map">
        <rect x="2" y="6" width="96" height="68" rx="10" fill="var(--white)" stroke="var(--warm-border)" />
        <ellipse cx="20" cy="34" rx="16" ry="11" fill="var(--warm-pill)" opacity="0.9" />
        <ellipse cx="58" cy="28" rx="12" ry="9" fill="var(--ocean-soft)" opacity="0.75" />
        <ellipse cx="84" cy="34" rx="12" ry="10" fill="var(--warm-pill)" opacity="0.9" />
        <ellipse cx="88" cy="62" rx="10" ry="7" fill="var(--ocean-soft)" opacity="0.75" />

        {unitedStates
          ? activeCountries
              .filter((country) => country.code !== "USA")
              .map((country) => (
                <line
                  key={`link-${country.code}`}
                  x1={unitedStates.x}
                  y1={unitedStates.y}
                  x2={country.x}
                  y2={country.y}
                  stroke="var(--warm-border)"
                  strokeDasharray="2 3"
                />
              ))
          : null}

        {activeCountries.map((country) => {
          const tone = resolveCountryTone(country.readingCount, country.code === activeCode);
          const radius = country.readingCount >= 3 ? 5.6 : country.readingCount === 2 ? 4.8 : 4.2;
          return (
            <g
              key={country.code}
              onClick={() => onSelect(country.code)}
              style={{ cursor: "pointer" }}
              {...createInsightAttrs(describeCountryInsight(country))}
            >
              <circle cx={country.x} cy={country.y} r={radius} fill={tone.fill} stroke={tone.stroke} strokeWidth={country.code === activeCode ? 1.8 : 1.2} />
              <text
                x={country.x}
                y={country.y + 0.8}
                fill={tone.text}
                fontSize="3"
                textAnchor="middle"
                style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}
              >
                {country.code === "United Kingdom" ? "UK" : country.code}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-[color:var(--warm-fg3)]">
        <span>Country nodes are derived from author affiliation and publication-location mentions in the indexed readings.</span>
      </div>
    </div>
  );
}

export function ReadingsGeoMap() {
  const [yearFilter, setYearFilter] = useState<number | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [activeStateCode, setActiveStateCode] = useState<StateCode | null>(READINGS_GEO.activeStates[0]?.code ?? null);
  const [activeCountryCode, setActiveCountryCode] = useState<CountryCode | null>(READINGS_GEO.activeCountries[0]?.code ?? null);

  const filteredReadings = useMemo(
    () =>
      READING_LIBRARY.filter((reading) => {
        const yearMatches = yearFilter === "all" || reading.year === yearFilter;
        const categoryMatches = categoryFilter === "all" || reading.category === categoryFilter;
        return yearMatches && categoryMatches;
      }),
    [yearFilter, categoryFilter],
  );

  const geo = useMemo(() => buildReadingsGeoFromReadings(filteredReadings), [filteredReadings]);

  useEffect(() => {
    if (geo.mode === "us") {
      setActiveCountryCode(null);
      setActiveStateCode((current) => {
        if (current && geo.activeStates.some((state) => state.code === current)) {
          return current;
        }
        return geo.activeStates[0]?.code ?? geo.states[0]?.code ?? null;
      });
      return;
    }

    setActiveStateCode(null);
    setActiveCountryCode((current) => {
      if (current && geo.activeCountries.some((country) => country.code === current)) {
        return current;
      }
      return geo.activeCountries[0]?.code ?? geo.countries[0]?.code ?? null;
    });
  }, [geo]);

  const selectedState = useMemo(
    () => geo.states.find((state) => state.code === activeStateCode) ?? geo.activeStates[0] ?? geo.states[0],
    [geo, activeStateCode],
  );

  const selectedCountry = useMemo(
    () => geo.countries.find((country) => country.code === activeCountryCode) ?? geo.activeCountries[0] ?? geo.countries[0],
    [geo, activeCountryCode],
  );

  const totalPages = useMemo(
    () => filteredReadings.reduce((pageCount, reading) => pageCount + reading.pageCount, 0),
    [filteredReadings],
  );

  const coveragePercent = filteredReadings.length > 0
    ? Math.round((geo.geocodedReadings / filteredReadings.length) * 100)
    : 0;

  const leadingSignals = geo.mode === "us"
    ? geo.activeStates.slice(0, 5)
    : geo.activeCountries.filter((country) => country.code !== "USA").slice(0, 5);

  const activeTitle = geo.mode === "us" ? selectedState?.name ?? "Reading geography" : selectedCountry?.label ?? "Reading geography";
  const activeCount = geo.mode === "us" ? selectedState?.readingCount ?? 0 : selectedCountry?.readingCount ?? 0;
  const activeCategories = geo.mode === "us" ? selectedState?.categories ?? [] : [];
  const activeKeywords = geo.mode === "us" ? selectedState?.keywords ?? [] : [];
  const activePageCount = geo.mode === "us" ? selectedState?.pageCount ?? 0 : selectedCountry?.readings.reduce((sum, reading) => sum + reading.pageCount, 0) ?? 0;
  const activeReadings = geo.mode === "us" ? selectedState?.readings ?? [] : selectedCountry?.readings ?? [];
  const activeInsight = geo.mode === "us"
    ? (selectedState ? describeStateInsight(selectedState) : { term: activeTitle, body: "No geography signal is selected yet." })
    : (selectedCountry ? describeCountryInsight(selectedCountry) : { term: activeTitle, body: "No geography signal is selected yet." });

  return (
    <div className="grid grid-cols-[1.18fr_0.82fr] gap-4">
      <section
        className="glass-panel overflow-hidden"
        aria-labelledby="readings-geo-title"
        {...createInsightAttrs({
          term: "Reading geography",
          body: `The indexed reading library currently spans ${filteredReadings.length} readings and ${totalPages} pages, switching between U.S. and global geography views as affiliation signals change.`,
        })}
      >
        <div className="border-b border-[color:var(--warm-rule)] px-6 py-5">
          <div className="flex items-start justify-between gap-6">
            <div className="max-w-[720px]">
              <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">
                Reading geography · ESD Lab readings/
              </div>
              <h3 id="readings-geo-title" className="mt-1 font-serif text-[30px] font-semibold leading-[1.08] -tracking-[0.02em] text-[color:var(--warm-fg1)]">
                Interactive affiliation map from the indexed reading library
              </h3>
              <p className="mt-2 max-w-[680px] text-[13px] leading-relaxed text-[color:var(--warm-fg3)]">
                The map auto-selects a U.S. view when the reading set carries enough state-level affiliation signals and falls back to a global node map otherwise. Counts come from author affiliations, contributor pages, and publication metadata already indexed into the public site.
              </p>
            </div>

            <div className="flex gap-2">
              <label className="flex min-w-[128px] flex-col gap-1 text-[10px] font-mono uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">
                Year
                <select
                  value={String(yearFilter)}
                  onChange={(event) => setYearFilter(event.target.value === "all" ? "all" : Number(event.target.value))}
                  className="rounded-xl border border-[color:var(--warm-border)] bg-white px-3 py-2 text-[12px] text-[color:var(--warm-fg2)] outline-none transition focus:border-[color:var(--usc-garnet)]"
                >
                  {READINGS_GEO.yearOptions.map((option) => (
                    <option key={String(option)} value={String(option)}>
                      {option === "all" ? "All years" : option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex min-w-[148px] flex-col gap-1 text-[10px] font-mono uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">
                Category
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="rounded-xl border border-[color:var(--warm-border)] bg-white px-3 py-2 text-[12px] text-[color:var(--warm-fg2)] outline-none transition focus:border-[color:var(--usc-garnet)]"
                >
                  {READINGS_GEO.categoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option === "all" ? "All categories" : option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-3">
            <MapSummaryCard
              label="Filtered"
              value={String(filteredReadings.length)}
              note="indexed readings in scope"
              insight={{
                term: "Filtered readings",
                body: `${filteredReadings.length} indexed readings remain after applying the active year and category filters.`,
              }}
            />
            <MapSummaryCard
              label="Geocoded"
              value={String(geo.geocodedReadings)}
              note={`${coveragePercent}% of active filter`}
              insight={{
                term: "Geocoded coverage",
                body: `${geo.geocodedReadings} readings carry state or country affiliation signals, covering ${coveragePercent}% of the filtered library.`,
              }}
            />
            <MapSummaryCard
              label={metricLabel(geo.mode)}
              value={String(geo.mode === "us" ? geo.activeStates.length : geo.activeCountries.filter((country) => country.code !== "USA").length)}
              note={geo.mode === "us" ? "unique U.S. affiliation signals" : "non-U.S. geography signals"}
              insight={{
                term: metricLabel(geo.mode),
                body: geo.mode === "us"
                  ? `${geo.activeStates.length} U.S. states have direct affiliation signals in the current reading filter.`
                  : `${geo.activeCountries.filter((country) => country.code !== "USA").length} non-U.S. country nodes are active in the current reading filter.`,
              }}
            />
            <MapSummaryCard
              label="Pages"
              value={String(totalPages)}
              note="indexed material represented"
              insight={{
                term: "Indexed pages",
                body: `${totalPages} indexed pages of reading material are represented in this filtered geography view.`,
              }}
            />
          </div>
        </div>

        <div className="px-6 py-6">
          {geo.mode === "us" ? (
            <UnitedStatesReadingMap
              states={geo.states}
              activeCode={activeStateCode}
              onSelect={setActiveStateCode}
            />
          ) : (
            <GlobalReadingMap
              countries={geo.countries}
              activeCode={activeCountryCode}
              onSelect={setActiveCountryCode}
            />
          )}
        </div>
      </section>

      <aside
        className="overflow-hidden rounded-2xl border border-[color:var(--warm-border)] bg-white shadow-card"
        {...createInsightAttrs(activeInsight)}
      >
        <div className="border-b border-[color:var(--warm-rule)] px-6 py-5">
          <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">Selected signal</div>
          <div className="mt-1 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-serif text-[28px] font-semibold leading-none -tracking-[0.02em] text-[color:var(--warm-fg1)]">
                {activeTitle}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--warm-fg3)]">
                {filteredReadings.length === 0
                  ? "No indexed readings match this filter combination yet."
                  : activeCount > 0
                    ? `${formatReadingCount(activeCount)} linked to this geography across ${activePageCount} indexed pages.`
                    : "No direct location signal for this geography in the current filter. Use the strongest-signal list below to jump to populated places."}
              </p>
            </div>
            <div className="rounded-full border border-[color:var(--warm-border)] bg-[color:var(--warm-pill)] px-3 py-1 font-mono text-[11px] text-[color:var(--warm-fg2)]">
              {geo.mode === "us" ? selectedState?.code ?? "--" : selectedCountry?.code ?? "--"}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <MapSummaryCard
              label="Signals"
              value={String(activeCount)}
              note={geo.mode === "us" ? "linked readings" : "country-linked readings"}
              insight={{
                term: `${activeTitle} signals`,
                body: `${activeTitle} currently links to ${formatReadingCount(activeCount)} in the active geography filter.`,
              }}
            />
            <MapSummaryCard
              label="Pages"
              value={String(activePageCount)}
              note="represented in scope"
              insight={{
                term: `${activeTitle} pages`,
                body: `${activeTitle} contributes ${activePageCount} indexed pages in the active geography filter.`,
              }}
            />
            <MapSummaryCard
              label="Groups"
              value={String(activeCategories.length || (geo.mode === "global" ? 1 : 0))}
              note={geo.mode === "us" ? "reading categories" : "country node in focus"}
              insight={{
                term: `${activeTitle} groups`,
                body: geo.mode === "us"
                  ? `${activeTitle} spans ${formatCategoryCount(activeCategories.length)} in the current reading filter.`
                  : `${activeTitle} is the country node currently in focus for this global view.`,
              }}
            />
          </div>

          {activeKeywords.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {activeKeywords.map((keyword) => (
                <span
                  key={keyword}
                  className="rounded-full border border-[color:var(--warm-border)] bg-[color:var(--warm-bg)] px-2.5 py-1 text-[11px] text-[color:var(--warm-fg2)]"
                >
                  {keyword}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="px-6 py-5">
          <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">Strongest signals in this filter</div>
          <div className="mt-3 space-y-2">
            {leadingSignals.length > 0 ? (
              leadingSignals.map((signal) => {
                const isActive = geo.mode === "us"
                  ? signal.code === selectedState?.code
                  : signal.code === selectedCountry?.code;
                return (
                  <button
                    key={signal.code}
                    type="button"
                    onClick={() => {
                      if (geo.mode === "us") {
                        setActiveStateCode(signal.code as StateCode);
                        return;
                      }
                      setActiveCountryCode(signal.code as CountryCode);
                    }}
                    className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition hover:bg-[color:var(--warm-bg)]"
                    {...createInsightAttrs(geo.mode === "us"
                      ? describeStateInsight(signal as ReadingGeoState)
                      : describeCountryInsight(signal as ReadingGeoCountry))}
                    style={{
                      borderColor: isActive ? "var(--usc-garnet)" : "var(--warm-border)",
                      background: isActive ? "var(--warm-pill)" : "transparent",
                    }}
                  >
                    <span>
                      <span className="block text-[12px] font-medium text-[color:var(--warm-fg2)]">
                        {"name" in signal ? signal.name : signal.label}
                      </span>
                      <span className="block text-[10px] font-mono uppercase tracking-[0.06em] text-[color:var(--warm-fg4)]">
                        {signal.code}
                      </span>
                    </span>
                    <span className="rounded-full bg-[color:var(--warm-bg)] px-2 py-1 font-mono text-[10px] text-[color:var(--warm-fg2)]">
                      {signal.readingCount}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-[color:var(--warm-border)] bg-[color:var(--warm-bg)] px-4 py-3 text-[12px] text-[color:var(--warm-fg3)]">
                No geography signals are available for the current filter combination.
              </div>
            )}
          </div>

          <div className="mt-6 text-[11px] font-mono uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">Linked readings</div>
          <div className="mt-3 space-y-3">
            {activeReadings.length > 0 ? (
              activeReadings.slice(0, 4).map((reading) => (
                <article
                  key={reading.id}
                  className="rounded-2xl border border-[color:var(--warm-border)] bg-[color:var(--warm-bg)] px-4 py-3"
                  {...createInsightAttrs({
                    term: reading.title,
                    body: `${reading.source} · ${formatYear(reading.year)} · ${reading.pageCount} pages. This ${reading.category.toLowerCase()} reading is one of the indexed sources linked to ${activeTitle}.`,
                  })}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">
                      {reading.category}
                    </span>
                    <span className="text-[10px] font-mono text-[color:var(--warm-fg4)]">
                      {formatYear(reading.year)} · {reading.pageCount} pp
                    </span>
                  </div>
                  <div className="mt-1 text-[13px] font-medium leading-snug text-[color:var(--warm-fg1)]">
                    {reading.title}
                  </div>
                  <div className="mt-1 text-[12px] text-[color:var(--warm-fg3)]">{reading.source}</div>
                </article>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-[color:var(--warm-border)] bg-[color:var(--warm-bg)] px-4 py-3 text-[12px] text-[color:var(--warm-fg3)]">
                Change the map selection or widen the filters to surface linked readings here.
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}