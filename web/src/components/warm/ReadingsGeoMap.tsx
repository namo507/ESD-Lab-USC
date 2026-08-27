import { useEffect, useMemo, useState } from "react";
import L, { type LatLngExpression } from "leaflet";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip as LeafletTooltip, useMap } from "react-leaflet";
import {
  READING_LIBRARY,
  READINGS_GEO,
  buildReadingsGeoFromReadings,
  type CountryCode,
  type GeoMapMode,
  type ReadingGeoCountry,
  type ReadingGeoSource,
  type ReadingGeoState,
  type StateCode,
} from "@/data/readingsGeo";
import { SATELLITE_ATTRIBUTION, SATELLITE_TILE_URL } from "@/lib/mapTiles";

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

function resolveMarkerTone(count: number, selected: boolean): { fill: string; stroke: string; text: string; opacity: number } {
  if (selected) {
    return {
      fill: "var(--white)",
      stroke: "var(--usc-garnet)",
      text: "var(--usc-garnet)",
      opacity: 0.96,
    };
  }
  if (count >= 3) {
    return {
      fill: "var(--ocean)",
      stroke: "var(--white)",
      text: "var(--white)",
      opacity: 0.86,
    };
  }
  if (count === 2) {
    return {
      fill: "var(--blue-tint)",
      stroke: "var(--ocean-ring)",
      text: "var(--on-info)",
      opacity: 0.78,
    };
  }
  if (count === 1) {
    return {
      fill: "var(--ocean-soft)",
      stroke: "var(--ocean-ring)",
      text: "var(--on-info)",
      opacity: 0.72,
    };
  }
  return {
    fill: "var(--warm-pill)",
    stroke: "rgba(255, 255, 255, 0.72)",
    text: "var(--warm-fg4)",
    opacity: 0.52,
  };
}

function markerLabel(code: StateCode | CountryCode): string {
  return code === "United Kingdom" ? "UK" : code;
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
      className="rounded-2xl surface-card px-4 py-3"
      {...createInsightAttrs(insight)}
    >
      <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-[color:var(--warm-fg4)]">{label}</div>
      <div className="mt-1 font-serif text-[28px] font-semibold leading-none text-[color:var(--warm-fg1)]">{value}</div>
      <div className="mt-1 text-[11px] text-[color:var(--warm-fg3)]">{note}</div>
    </div>
  );
}

interface ReadingMarkerPoint {
  code: StateCode | CountryCode;
  label: string;
  lat: number;
  lng: number;
  readingCount: number;
  selected: boolean;
}

function ReadingsMapFitter({
  points,
  mode,
}: {
  points: LatLngExpression[];
  mode: GeoMapMode;
}) {
  const map = useMap();
  const pointKey = points.map((point) => Array.isArray(point) ? point.join(",") : String(point)).join("|");

  useEffect(() => {
    const invalidateTimer = window.setTimeout(() => map.invalidateSize(), 80);
    if (points.length === 0) {
      map.setView(mode === "us" ? [39.5, -98.35] : [28, 0], mode === "us" ? 4 : 2);
      return () => window.clearTimeout(invalidateTimer);
    }

    if (points.length === 1) {
      const [point] = points;
      if (point) map.setView(point, mode === "us" ? 5 : 4);
      return () => window.clearTimeout(invalidateTimer);
    }

    const bounds = L.latLngBounds(points);
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [36, 36],
        maxZoom: mode === "us" ? 5 : 4,
      });
    }
    return () => window.clearTimeout(invalidateTimer);
  }, [map, mode, pointKey, points]);

  return null;
}

function ReadingSatelliteMap({
  mode,
  points,
  fitPoints,
  origin,
  onSelect,
}: {
  mode: GeoMapMode;
  points: ReadingMarkerPoint[];
  fitPoints: LatLngExpression[];
  origin?: ReadingGeoCountry | null;
  onSelect: (code: StateCode | CountryCode) => void;
}) {
  const [tileStatus, setTileStatus] = useState<"loading" | "ready" | "error">("loading");
  const activeLinks = mode === "global" && origin
    ? points.filter((point) => point.readingCount > 0 && point.code !== "USA")
    : [];

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-[color:var(--warm-border)] bg-[color:var(--warm-pill)] shadow-[var(--shadow-overlay)]">
      <div className="relative h-[360px] min-h-[360px]">
        <MapContainer
          className="satellite-map-soft h-full w-full"
          center={mode === "us" ? [39.5, -98.35] : [28, 0]}
          zoom={mode === "us" ? 4 : 2}
          minZoom={2}
          maxZoom={9}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution={SATELLITE_ATTRIBUTION}
            url={SATELLITE_TILE_URL}
            eventHandlers={{
              tileload: () => setTileStatus("ready"),
              tileerror: () => setTileStatus("error"),
            }}
          />
          <ReadingsMapFitter points={fitPoints} mode={mode} />
          {origin
            ? activeLinks.map((point) => (
                <Polyline
                  key={`reading-link-${point.code}`}
                  positions={[[origin.lat, origin.lng], [point.lat, point.lng]]}
                  pathOptions={{
                    color: "rgba(255, 255, 255, 0.62)",
                    dashArray: "4 6",
                    weight: 1.4,
                    opacity: 0.7,
                  }}
                />
              ))
            : null}
          {points.map((point) => {
            const tone = resolveMarkerTone(point.readingCount, point.selected);
            const radius = point.selected
              ? 13
              : point.readingCount >= 3
                ? 11
                : point.readingCount === 2
                  ? 9
                  : point.readingCount === 1
                    ? 8
                    : 5;
            return (
              <CircleMarker
                key={point.code}
                center={[point.lat, point.lng]}
                radius={radius}
                pathOptions={{
                  color: tone.stroke,
                  fillColor: tone.fill,
                  fillOpacity: tone.opacity,
                  opacity: point.readingCount > 0 || point.selected ? 1 : 0.62,
                  weight: point.selected ? 3 : point.readingCount > 0 ? 1.8 : 1,
                }}
                eventHandlers={{ click: () => onSelect(point.code) }}
              >
                <LeafletTooltip direction="top" opacity={0.96}>
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em]">
                    {markerLabel(point.code)}
                  </span>
                  <span> · {point.label}</span>
                  <span> · {point.readingCount > 0 ? formatReadingCount(point.readingCount) : "no signal"}</span>
                </LeafletTooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
        <div className="pointer-events-none absolute inset-0 bg-[rgba(250,246,238,0.12)] mix-blend-soft-light" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[rgba(28,26,24,0.22)] to-transparent" aria-hidden />
        {tileStatus === "error" ? (
          <div className="absolute left-4 right-4 top-4 rounded-xl border border-[color:var(--usc-gold)] bg-[color:var(--warm-card)] px-4 py-3 text-[12px] leading-snug text-[color:var(--warm-fg2)] shadow-[var(--shadow-overlay)]">
            Satellite imagery could not load. The aggregate markers remain available; check CSP or tile-provider reachability.
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--warm-border)] bg-[color:var(--warm-card)] px-4 py-3 text-[11px] text-[color:var(--warm-fg3)]">
        <span>{mode === "us" ? "Markers use U.S. state centroids; muted markers have no current affiliation signal." : "Markers use country centroids derived from affiliation and publication-location mentions."}</span>
        {LEGEND_STOPS.map((item) => {
          const tone = resolveMarkerTone(item.count, false);
          return (
            <span key={item.label} className="inline-flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full border"
                style={{ background: tone.fill, borderColor: tone.stroke }}
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

interface ReadingsGeoMapProps {
  readings?: ReadingGeoSource[];
  loading?: boolean;
}

export function ReadingsGeoMap({ readings, loading = false }: ReadingsGeoMapProps) {
  const library = readings && readings.length > 0 ? readings : READING_LIBRARY;
  const baseGeo = useMemo(() => buildReadingsGeoFromReadings(library), [library]);
  const [yearFilter, setYearFilter] = useState<number | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [activeStateCode, setActiveStateCode] = useState<StateCode | null>(READINGS_GEO.activeStates[0]?.code ?? null);
  const [activeCountryCode, setActiveCountryCode] = useState<CountryCode | null>(READINGS_GEO.activeCountries[0]?.code ?? null);

  const filteredReadings = useMemo(
    () =>
      library.filter((reading) => {
        const yearMatches = yearFilter === "all" || reading.year === yearFilter;
        const categoryMatches = categoryFilter === "all" || reading.category === categoryFilter;
        return yearMatches && categoryMatches;
      }),
    [library, yearFilter, categoryFilter],
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
  const readingPoints = useMemo<ReadingMarkerPoint[]>(() => {
    if (geo.mode === "us") {
      return geo.states.map((state) => ({
        code: state.code,
        label: state.name,
        lat: state.lat,
        lng: state.lng,
        readingCount: state.readingCount,
        selected: state.code === activeStateCode,
      }));
    }

    return geo.countries.map((country) => ({
      code: country.code,
      label: country.label,
      lat: country.lat,
      lng: country.lng,
      readingCount: country.readingCount,
      selected: country.code === activeCountryCode,
    }));
  }, [activeCountryCode, activeStateCode, geo]);
  const readingFitPoints = useMemo<LatLngExpression[]>(() => {
    if (geo.mode === "us") {
      const activeStates = geo.activeStates.length > 0
        ? geo.activeStates
        : geo.states.filter((state) => state.code !== "AK" && state.code !== "HI");
      return activeStates.map((state) => [state.lat, state.lng]);
    }

    const activeCountries = geo.activeCountries.length > 0 ? geo.activeCountries : geo.countries;
    return activeCountries.map((country) => [country.lat, country.lng]);
  }, [geo]);
  const globalOrigin = geo.mode === "global"
    ? geo.countries.find((country) => country.code === "USA") ?? null
    : null;

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
                Reading geography · esd-lab-readings/{loading ? " · refreshing" : ""}
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
                  className="rounded-xl border border-[color:var(--warm-border)] bg-[color:var(--warm-card)] px-3 py-2 text-[12px] text-[color:var(--warm-fg2)] outline-none transition focus:border-[color:var(--usc-garnet)]"
                >
                  {baseGeo.yearOptions.map((option) => (
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
                  className="rounded-xl border border-[color:var(--warm-border)] bg-[color:var(--warm-card)] px-3 py-2 text-[12px] text-[color:var(--warm-fg2)] outline-none transition focus:border-[color:var(--usc-garnet)]"
                >
                  {baseGeo.categoryOptions.map((option) => (
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
          <ReadingSatelliteMap
            mode={geo.mode}
            points={readingPoints}
            fitPoints={readingFitPoints}
            origin={globalOrigin}
            onSelect={(code) => {
              if (geo.mode === "us") {
                setActiveStateCode(code as StateCode);
                return;
              }
              setActiveCountryCode(code as CountryCode);
            }}
          />
        </div>
      </section>

      <aside
        className="overflow-hidden rounded-2xl surface-card shadow-card"
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
