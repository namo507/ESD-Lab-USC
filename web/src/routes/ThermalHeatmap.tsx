import * as d3 from "d3";
import { useMemo, useState } from "react";
import { Button, Card, SectionLabel } from "@/components/primitives";
import { useParticipants, useThermalHeatmap } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import styles from "./FeatureRoutes.module.css";

export function ThermalHeatmap() {
  const enabled = useFeatureFlag("THERMAL_HEATMAP");
  if (!enabled) return null;

  const { data: participants = [] } = useParticipants();
  const vpt = participants.filter((p) => p.group === "VPT");
  const [nanoId, setNanoId] = useState("");
  const selected = nanoId || vpt[0]?.id;
  const { data } = useThermalHeatmap(selected);
  const rows = data?.data ?? [];
  const gradients = rows.map((row) => row.gradient);
  const color = d3.scaleSequential(d3.interpolateRdBu).domain([Math.max(...gradients, 1.6), Math.min(...gradients, -0.2)]);
  const hrcPath = useMemo(() => {
    if (!rows.length) return "";
    const w = 720, h = 92, pad = 12;
    const byHour = rows.filter((row) => row.hour % 2 === 0);
    const sx = d3.scaleLinear().domain([0, byHour.length - 1]).range([pad, w - pad]);
    const sy = d3.scaleLinear().domain(d3.extent(byHour, (row) => row.hrc) as [number, number]).nice().range([h - pad, pad]);
    return d3.line<(typeof byHour)[number]>().x((_, i) => sx(i)).y((row) => sy(row.hrc))(byHour) ?? "";
  }, [rows]);

  function exportCsv() {
    const csv = ["nanoId,day,hour,centralTemp,peripheralTemp,gradient,hrc,medicalEvent", ...rows.map((r) =>
      [r.nanoId, r.day, r.hour, r.centralTemp, r.peripheralTemp, r.gradient, r.hrc, r.medicalEvent ?? ""].join(","),
    )].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected ?? "thermal"}-heatmap.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Analysis route · NICU</span>
          <h1 className={styles.h1}>NICU Thermal Heatmap</h1>
          <p className={styles.lede}>
            Day-by-hour central/peripheral temperature gradients for normalized VPT cohort sessions with HRC trend context.
          </p>
        </div>
        <div className={styles.actions}>
          <select className={styles.select} value={selected ?? ""} onChange={(e) => setNanoId(e.target.value)} aria-label="VPT participant">
            {vpt.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.visit}</option>)}
          </select>
          <Button variant="secondary" icon="download" onClick={exportCsv}>CSV</Button>
        </div>
      </header>

      <div className={styles.split}>
        <Card pad={20}>
          <div className={styles.cardHead}>
            <div>
              <SectionLabel>Central-peripheral gradient</SectionLabel>
              <div className={styles.cardTitle}>{selected} · seven-day grid</div>
            </div>
          </div>
          <svg viewBox="0 0 760 280" className={styles.plotSvg} role="img" aria-label="Day by hour thermal gradient heatmap">
            {Array.from({ length: 7 }, (_, d) => (
              <text key={`d-${d}`} x={42} y={34 + d * 32} textAnchor="end" className={styles.tinyLabel}>D{d + 1}</text>
            ))}
            {Array.from({ length: 24 }, (_, h) => h).filter((h) => h % 3 === 0).map((h) => (
              <text key={`h-${h}`} x={58 + h * 28} y={268} textAnchor="middle" className={styles.tinyLabel}>{h}</text>
            ))}
            {rows.map((row) => (
              <g key={`${row.day}-${row.hour}`}>
                <rect x={48 + row.hour * 28} y={16 + (row.day - 1) * 32} width={24} height={24} rx={3} fill={color(row.gradient)} opacity={0.86} />
                {row.medicalEvent && (
                  <path d={`M${60 + row.hour * 28} ${22 + (row.day - 1) * 32} l5 10 h-10 Z`} fill="var(--usc-gold)" stroke="var(--ink)" strokeWidth={0.8} />
                )}
              </g>
            ))}
          </svg>
        </Card>

        <Card pad={20}>
          <SectionLabel>HRC trend</SectionLabel>
          <div className={styles.cardTitle}>Risk context</div>
          <svg viewBox="0 0 720 110" className={styles.plotSvg} role="img" aria-label="HRC trend across thermal recording">
            <path d={hrcPath} fill="none" stroke="var(--usc-garnet)" strokeWidth={2} />
            <line x1={12} x2={708} y1={82} y2={82} stroke="var(--slate-100)" />
          </svg>
          <div className={styles.metricGrid}>
            <div className={styles.metric}><div className={styles.metricLabel}>Mean gradient</div><div className={styles.metricValue}>{d3.mean(rows, (r) => r.gradient)?.toFixed(2) ?? "—"} C</div></div>
            <div className={styles.metric}><div className={styles.metricLabel}>Medical events</div><div className={styles.metricValue}>{rows.filter((r) => r.medicalEvent).length}</div></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
