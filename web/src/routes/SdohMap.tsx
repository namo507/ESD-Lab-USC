import { useEffect, useState } from "react";
import * as d3 from "d3";
import "leaflet/dist/leaflet.css";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip as LeafletTooltip } from "react-leaflet";
import type { FeatureCollection } from "geojson";
import { Card, SectionLabel } from "@/components/primitives";
import { useSdohMap } from "@/api/hooks";
import type { SdohMapRow } from "@/api/schemas";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import styles from "./FeatureRoutes.module.css";

interface CountyMapProps {
  rows: SdohMapRow[];
  selectedCounty?: string;
  onCountySelect?: (county: SdohMapRow) => void;
  ariaLabel?: string;
}

function countyKey(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function CountyMap({
  rows,
  selectedCounty,
  onCountySelect,
  ariaLabel = "South Carolina county SDOH map",
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
              return {
                color: selected ? "var(--usc-garnet)" : "var(--border-strong)",
                weight: selected ? 3 : 1.2,
                fillColor: selected ? "var(--usc-garnet)" : "var(--usc-gold)",
                fillOpacity: selected ? 0.34 : 0.18,
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
                {row.county}: n={row.participants}, completion {row.meanCompletion.toFixed(1)}%
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
  const rows = data?.data ?? [];

  const sx = d3.scaleLinear().domain([0.2, 0.6]).range([48, 700]);
  const sy = d3.scaleLinear().domain([60, 90]).range([210, 20]);

  if (!enabled) return null;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Context route</span>
          <h1 className={styles.h1}>SDOH Geographic Map</h1>
          <p className={styles.lede}>County-level social context and completion patterns for de-identified NANO recruitment areas.</p>
        </div>
      </header>

      <div className={styles.split}>
        <Card pad={0}>
          <CountyMap rows={rows} />
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
