import { useEffect, useState } from "react";
import * as d3 from "d3";
import "leaflet/dist/leaflet.css";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip as LeafletTooltip } from "react-leaflet";
import type { FeatureCollection } from "geojson";
import { Button, Card, SectionLabel } from "@/components/primitives";
import { useSdohMap } from "@/api/hooks";
import type { SdohMapRow } from "@/api/schemas";
import { exportCsvFile } from "@/lib/exportCsv";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import sdohLookup from "@/data/sc_sdoh.json";
import styles from "./FeatureRoutes.module.css";

type SdohMetric = "deprivationIndex" | "broadbandPct" | "foodAccessPct" | "priorityIndex";

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
  metric?: SdohMetric;
}

function countyKey(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function CountyMap({
  rows,
  selectedCounty,
  onCountySelect,
  ariaLabel = "South Carolina county SDOH map",
  metric = "deprivationIndex",
}: CountyMapProps) {
  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const activeKey = countyKey(selectedCounty);

  useEffect(() => {
    fetch("/sc-counties.geojson")
      .then((res) => res.json())
      .then((payload: FeatureCollection) => setGeo(payload))
      .catch(() => setGeo(null));
  }, []);

  return (
    <div className={styles.mapShell} role="img" aria-label={ariaLabel}>
      <MapContainer center={[33.9, -81.1]} zoom={6.4} scrollWheelZoom={false}>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {geo && (
          <GeoJSON
            key={activeKey || "all"}
            data={geo}
            style={(feature) => {
              const props = feature?.properties as { name?: string; fips?: string } | undefined;
              const selected = activeKey && (countyKey(props?.name) === activeKey || countyKey(props?.fips) === activeKey);
              const county = rows.find((row) => row.fips === props?.fips || countyKey(row.county) === countyKey(props?.name));
              const priority = staticForCounty(county)?.priorityIndex ?? 0;
              return {
                color: selected ? "var(--usc-garnet)" : priority > 0.7 ? "var(--red)" : "var(--warm-border)",
                weight: selected || priority > 0.7 ? 3 : 1.2,
                fillColor: county ? metricColor(metric, county) : "var(--warm-border)",
                fillOpacity: county ? 0.26 + metricValue(metric, county) * 0.42 : 0.12,
              };
            }}
            onEachFeature={(feature, layer) => {
              const props = feature.properties as { name?: string; fips?: string };
              const county = rows.find((row) => row.fips === props.fips || countyKey(row.county) === countyKey(props.name));
              if (!county || !onCountySelect) return;
              layer.on({ click: () => onCountySelect(county) });
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

function metricValue(metric: SdohMetric, row: SdohMapRow): number {
  if (metric === "priorityIndex") return staticForCounty(row)?.priorityIndex ?? 0;
  if (metric === "broadbandPct") return Math.max(0, Math.min(1, row.broadbandPct / 100));
  if (metric === "foodAccessPct") return Math.max(0, Math.min(1, row.foodAccessPct / 100));
  return Math.max(0, Math.min(1, row.deprivationIndex));
}

function metricColor(metric: SdohMetric, row: SdohMapRow): string {
  const value = metricValue(metric, row);
  if (metric === "broadbandPct" || metric === "foodAccessPct") {
    return value > 0.82 ? "var(--green)" : value > 0.72 ? "var(--ocean)" : "var(--usc-gold)";
  }
  return value > 0.7 ? "var(--red)" : value > 0.45 ? "var(--usc-garnet)" : "var(--usc-gold)";
}
