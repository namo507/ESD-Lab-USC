import { useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import L, { type Layer, type PathOptions } from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip as LeafletTooltip, useMap } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { Button, Card, SectionLabel } from "@/components/primitives";
import { useSdohMap } from "@/api/hooks";
import type { SdohMapRow } from "@/api/schemas";
import { exportCsvFile } from "@/lib/exportCsv";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { SATELLITE_ATTRIBUTION, SATELLITE_TILE_URL } from "@/lib/mapTiles";
import sdohLookup from "@/data/sc_sdoh.json";
import styles from "./FeatureRoutes.module.css";

type SdohMetric = "deprivationIndex" | "broadbandPct" | "foodAccessPct" | "priorityIndex";
type CountyMapMetric = SdohMetric | "participants" | "completion";

interface StaticSdohRow {
  county: string;
  fips: string;
  priorityIndex: number;
  ruralityPct: number;
  transportBurdenPct: number;
}

interface CountyMapProps {
  rows: SdohMapRow[];
  selectedCounty?: string;
  onCountySelect?: (county: SdohMapRow) => void;
  ariaLabel?: string;
  metric?: CountyMapMetric;
}

type CountyFeature = Feature<Geometry, { name?: string; fips?: string }>;

function countyKey(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function CountyBoundsFitter({ geo }: { geo: FeatureCollection | null }) {
  const map = useMap();

  useEffect(() => {
    const invalidateTimer = window.setTimeout(() => map.invalidateSize(), 80);
    if (!geo) return () => window.clearTimeout(invalidateTimer);

    const bounds = L.geoJSON(geo).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 8 });
    }

    return () => window.clearTimeout(invalidateTimer);
  }, [geo, map]);

  return null;
}

export function CountyMap({
  rows,
  selectedCounty,
  onCountySelect,
  ariaLabel = "South Carolina county SDOH map",
  metric = "deprivationIndex",
}: CountyMapProps) {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [geoStatus, setGeoStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tileStatus, setTileStatus] = useState<"loading" | "ready" | "error">("loading");
  const activeKey = countyKey(selectedCounty);
  const rowLookup = useMemo(() => {
    const map = new Map<string, SdohMapRow>();
    rows.forEach((row) => {
      map.set(row.fips, row);
      map.set(countyKey(row.county), row);
    });
    return map;
  }, [rows]);
  const maxParticipants = useMemo(
    () => Math.max(1, ...rows.map((row) => row.participants)),
    [rows],
  );
  const styleKey = useMemo(
    () => rows.map((row) => `${row.fips}:${metricValue(metric, row, maxParticipants).toFixed(3)}`).join("|"),
    [maxParticipants, metric, rows],
  );

  useEffect(() => {
    const controller = new AbortController();
    setGeoStatus("loading");
    fetch("/sc-counties.geojson", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Unable to load county geometry (${res.status})`);
        return res.json();
      })
      .then((payload: FeatureCollection) => {
        if (controller.signal.aborted) return;
        setGeo(payload);
        setGeoStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setGeo(null);
        setGeoStatus("error");
      });
    return () => controller.abort();
  }, []);

  function rowForFeature(feature: CountyFeature | undefined): SdohMapRow | undefined {
    const props = feature?.properties;
    return rowLookup.get(props?.fips ?? "") ?? rowLookup.get(countyKey(props?.name));
  }

  function styleCounty(feature: Feature | undefined): PathOptions {
    const countyFeature = feature as CountyFeature | undefined;
    const props = countyFeature?.properties;
    const selected = Boolean(activeKey && (countyKey(props?.name) === activeKey || countyKey(props?.fips) === activeKey));
    const county = rowForFeature(countyFeature);
    const priority = staticForFeature(props)?.priorityIndex ?? 0;

    if (!county) {
      return {
        color: selected ? "var(--usc-garnet)" : "rgba(255, 255, 255, 0.72)",
        weight: selected ? 3 : 1,
        fillColor: "var(--warm-pill)",
        fillOpacity: selected ? 0.28 : 0.16,
        opacity: 0.9,
      };
    }

    return {
      color: selected ? "var(--usc-garnet)" : priority > 0.7 ? "var(--red)" : "rgba(255, 255, 255, 0.78)",
      weight: selected ? 3.4 : priority > 0.7 ? 2.4 : 1.2,
      dashArray: selected ? "" : priority > 0.7 ? "4 3" : "",
      fillColor: metricColor(metric, county, maxParticipants),
      fillOpacity: selected ? 0.72 : 0.32 + metricValue(metric, county, maxParticipants) * 0.34,
      opacity: 1,
    };
  }

  return (
    <div className={styles.mapShell} role="img" aria-label={ariaLabel}>
      <MapContainer className="satellite-map-soft" center={[33.9, -81.1]} zoom={7} minZoom={6} maxZoom={11} scrollWheelZoom={false}>
        <TileLayer
          attribution={SATELLITE_ATTRIBUTION}
          url={SATELLITE_TILE_URL}
          eventHandlers={{
            tileload: () => setTileStatus("ready"),
            tileerror: () => setTileStatus("error"),
          }}
        />
        <CountyBoundsFitter geo={geo} />
        {geo && (
          <GeoJSON
            key={`${activeKey || "all"}-${metric}-${styleKey}`}
            data={geo}
            style={styleCounty}
            onEachFeature={(feature, layer) => {
              const countyFeature = feature as CountyFeature;
              const props = countyFeature.properties;
              const county = rowForFeature(countyFeature);
              bindCountyTooltip(layer, props, county, metric, maxParticipants);
              if (county && onCountySelect) {
                layer.on({ click: () => onCountySelect(county) });
              }
            }}
          />
        )}
        {rows.map((row) => {
          const selected = countyKey(row.county) === activeKey || countyKey(row.fips) === activeKey;
          return (
            <CircleMarker
              key={row.fips}
              center={[row.lat, row.lng]}
              radius={Math.max(7, Math.sqrt(row.participants) * 1.6)}
              pathOptions={{
                color: selected ? "var(--usc-garnet)" : "var(--blue)",
                fillColor: selected ? "var(--usc-garnet)" : "var(--blue)",
                fillOpacity: selected ? 0.78 : 0.56,
                weight: selected ? 2 : 1,
              }}
              eventHandlers={onCountySelect ? { click: () => onCountySelect(row) } : undefined}
            >
              <LeafletTooltip>
                {row.county}: n={row.participants}, completion {row.meanCompletion.toFixed(1)}%, priority {(staticForCounty(row)?.priorityIndex ?? 0).toFixed(2)}
              </LeafletTooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <div className={styles.mapWarmOverlay} aria-hidden />
      {tileStatus === "error" && (
        <div className={styles.mapNotice}>
          Satellite imagery could not load. County overlays remain available; check CSP or the imagery provider.
        </div>
      )}
      {geoStatus === "loading" && (
        <div className={styles.mapNotice}>Loading South Carolina county boundaries...</div>
      )}
      {geoStatus === "error" && (
        <div className={styles.mapNotice}>County boundaries could not load. Aggregate markers remain available.</div>
      )}
    </div>
  );
}

export function SdohMap() {
  const enabled = useFeatureFlag("SDOH_MAP");
  const { data } = useSdohMap();
  const [metric, setMetric] = useState<SdohMetric>("deprivationIndex");
  const [selectedCounty, setSelectedCounty] = useState<string | undefined>();
  const rows = data?.data ?? [];

  const sx = d3.scaleLinear().domain([0.2, 0.6]).range([48, 700]);
  const sy = d3.scaleLinear().domain([60, 90]).range([210, 20]);

  if (!enabled) return null;

  const exportRows = rows.map((row) => ({ ...row, ...(staticForCounty(row) ?? {}) }));

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Context route</span>
          <h1 className={styles.h1}>SDOH Geographic Map</h1>
          <p className={styles.lede}>County-level social context and completion patterns for de-identified NANO recruitment areas.</p>
        </div>
        <div className={styles.actions}>
          <select className={styles.select} value={metric} onChange={(event) => setMetric(event.target.value as SdohMetric)} aria-label="SDOH overlay metric">
            <option value="deprivationIndex">Deprivation</option>
            <option value="broadbandPct">Broadband</option>
            <option value="foodAccessPct">Food access</option>
            <option value="priorityIndex">Recruitment priority</option>
          </select>
          <Button variant="secondary" icon="download" onClick={() => exportCsvFile(exportRows, "sdoh-recruitment-priority.csv")}>CSV</Button>
        </div>
      </header>

      <div className={styles.split}>
        <Card pad={0}>
          <CountyMap rows={rows} metric={metric} selectedCounty={selectedCounty} onCountySelect={(row) => setSelectedCounty(row.county)} />
          <div className={styles.legend} style={{ padding: 14, background: "var(--warm-card)", borderTop: "1px solid var(--warm-border)" }}>
            <span className={styles.legendItem}><span className={styles.swatch} style={{ background: "var(--usc-garnet)" }} /> Higher selected metric</span>
            <span className={styles.legendItem}><span className={styles.swatch} style={{ background: "var(--red)" }} /> High priority border</span>
            <span className={styles.legendItem}>County fills are aggregate only.</span>
          </div>
        </Card>

        <Card pad={20}>
          <SectionLabel>County signals</SectionLabel>
          <div className={styles.cardTitle}>Completion vs deprivation</div>
          <svg viewBox="0 0 740 240" className={styles.plotSvg} role="img" aria-label="Completion versus deprivation scatter plot">
            {[60, 70, 80, 90].map((tick) => (
              <g key={tick}>
                <line x1={48} x2={700} y1={sy(tick)} y2={sy(tick)} stroke="var(--slate-100)" />
                <text x={40} y={sy(tick) + 3} textAnchor="end" className={styles.tinyLabel}>{tick}%</text>
              </g>
            ))}
            {rows.map((row) => (
              <g key={row.fips}>
                <circle cx={sx(row.deprivationIndex)} cy={sy(row.meanCompletion)} r={Math.max(5, Math.sqrt(row.participants))} fill="var(--blue)" opacity={0.68} />
                <text x={sx(row.deprivationIndex) + 8} y={sy(row.meanCompletion) + 3} className={styles.tinyLabel}>{row.county}</text>
              </g>
            ))}
            <text x={48} y={232} className={styles.tinyLabel}>Area deprivation index</text>
          </svg>
        </Card>
      </div>
    </div>
  );
}

function staticForCounty(row: SdohMapRow | undefined): StaticSdohRow | undefined {
  if (!row) return undefined;
  return (sdohLookup as StaticSdohRow[]).find((item) => item.fips === row.fips || countyKey(item.county) === countyKey(row.county));
}

function staticForFeature(props: { name?: string; fips?: string } | undefined): StaticSdohRow | undefined {
  if (!props) return undefined;
  return (sdohLookup as StaticSdohRow[]).find((item) => item.fips === props.fips || countyKey(item.county) === countyKey(props.name));
}

function bindCountyTooltip(
  layer: Layer,
  props: { name?: string; fips?: string } | undefined,
  row: SdohMapRow | undefined,
  metric: CountyMapMetric,
  maxParticipants: number,
): void {
  const countyName = props?.name ? `${props.name} County` : "South Carolina county";
  const metricText = row
    ? `${metricLabel(metric)} ${metricDisplay(metric, row, maxParticipants)}`
    : "No aggregate study rows in the current mock payload";
  layer.bindTooltip(`${countyName} · ${metricText}`, { sticky: true });
}

function metricLabel(metric: CountyMapMetric): string {
  if (metric === "priorityIndex") return "priority";
  if (metric === "broadbandPct") return "broadband";
  if (metric === "foodAccessPct") return "food access";
  if (metric === "participants") return "participants";
  if (metric === "completion") return "completion";
  return "deprivation";
}

function metricDisplay(metric: CountyMapMetric, row: SdohMapRow, maxParticipants: number): string {
  if (metric === "participants") return String(row.participants);
  if (metric === "completion") return `${row.meanCompletion.toFixed(1)}%`;
  if (metric === "broadbandPct") return `${row.broadbandPct.toFixed(1)}%`;
  if (metric === "foodAccessPct") return `${row.foodAccessPct.toFixed(1)}%`;
  if (metric === "priorityIndex") return (staticForCounty(row)?.priorityIndex ?? 0).toFixed(2);
  return row.deprivationIndex.toFixed(2);
}

function metricValue(metric: CountyMapMetric, row: SdohMapRow, maxParticipants = 100): number {
  if (metric === "priorityIndex") return staticForCounty(row)?.priorityIndex ?? 0;
  if (metric === "participants") return Math.max(0, Math.min(1, row.participants / Math.max(maxParticipants, 1)));
  if (metric === "completion") return Math.max(0, Math.min(1, row.meanCompletion / 100));
  if (metric === "broadbandPct") return Math.max(0, Math.min(1, row.broadbandPct / 100));
  if (metric === "foodAccessPct") return Math.max(0, Math.min(1, row.foodAccessPct / 100));
  return Math.max(0, Math.min(1, row.deprivationIndex));
}

function metricColor(metric: CountyMapMetric, row: SdohMapRow, maxParticipants = 100): string {
  const value = metricValue(metric, row, maxParticipants);
  if (metric === "broadbandPct" || metric === "foodAccessPct") {
    return value > 0.82 ? "var(--green)" : value > 0.72 ? "var(--ocean)" : "var(--usc-gold)";
  }
  if (metric === "participants" || metric === "completion") {
    return value > 0.72 ? "var(--ocean)" : value > 0.46 ? "var(--sage)" : "var(--usc-gold)";
  }
  return value > 0.7 ? "var(--red)" : value > 0.45 ? "var(--usc-garnet)" : "var(--usc-gold)";
}
