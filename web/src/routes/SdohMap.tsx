import { useEffect, useState } from "react";
import * as d3 from "d3";
import "leaflet/dist/leaflet.css";
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip as LeafletTooltip } from "react-leaflet";
import type { FeatureCollection } from "geojson";
import { Card, SectionLabel } from "@/components/primitives";
import { useSdohMap } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import styles from "./FeatureRoutes.module.css";

export function SdohMap() {
  const enabled = useFeatureFlag("SDOH_MAP");
  if (!enabled) return null;

  const { data } = useSdohMap();
  const rows = data?.data ?? [];
  const [geo, setGeo] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch("/sc-counties.geojson")
      .then((res) => res.json())
      .then((payload: FeatureCollection) => setGeo(payload))
      .catch(() => setGeo(null));
  }, []);

  const sx = d3.scaleLinear().domain([0.2, 0.6]).range([48, 700]);
  const sy = d3.scaleLinear().domain([60, 90]).range([210, 20]);

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
          <div className={styles.mapShell} role="img" aria-label="South Carolina county SDOH map">
            <MapContainer center={[33.9, -81.1]} zoom={6.4} scrollWheelZoom={false}>
              <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {geo && (
                <GeoJSON
                  data={geo}
                  style={() => ({ color: "var(--usc-garnet)", weight: 2, fillColor: "var(--usc-gold)", fillOpacity: 0.24 })}
                />
              )}
              {rows.map((row) => (
                <CircleMarker
                  key={row.fips}
                  center={[row.lat, row.lng]}
                  radius={Math.max(7, Math.sqrt(row.participants) * 1.6)}
                  pathOptions={{ color: "var(--usc-garnet)", fillColor: "var(--usc-garnet)", fillOpacity: 0.62, weight: 1 }}
                >
                  <LeafletTooltip>
                    {row.county}: n={row.participants}, completion {row.meanCompletion.toFixed(1)}%
                  </LeafletTooltip>
                </CircleMarker>
              ))}
            </MapContainer>
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
