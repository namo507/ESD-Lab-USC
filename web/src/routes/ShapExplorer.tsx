import * as d3 from "d3";
import { useMemo, useState } from "react";
import { Card, SectionLabel } from "@/components/primitives";
import { useShapValues } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { ShapValueRow } from "@/api/schemas";
import styles from "./FeatureRoutes.module.css";

type Modality = "all" | ShapValueRow["modality"];

export function ShapExplorer() {
  const enabled = useFeatureFlag("SHAP_BEESWARM");
  const { data } = useShapValues();
  const rows = useMemo(() => data?.data ?? [], [data?.data]);
  const [modality, setModality] = useState<Modality>("all");
  const [window, setWindow] = useState("all");
  const [highlight, setHighlight] = useState("");
  const windows = useMemo(() => Array.from(new Set(rows.map((row) => row.timeWindow))), [rows]);
  const filtered = useMemo(
    () => rows.filter((row) => (modality === "all" || row.modality === modality) && (window === "all" || row.timeWindow === window)),
    [modality, rows, window],
  );
  const features = useMemo(() => Array.from(new Set(filtered.map((row) => row.label))).slice(0, 8), [filtered]);

  const points = useMemo(() => {
    const sx = d3.scaleLinear().domain([-0.32, 0.32]).range([120, 720]);
    return filtered.map((row, i) => {
      const featureIndex = Math.max(0, features.indexOf(row.label));
      return {
        ...row,
        x: sx(row.shap),
        y: 36 + featureIndex * 34 + ((i * 13) % 17) - 8,
      };
    });
  }, [features, filtered]);

  const summary = features.map((feature) => ({
    feature,
    meanAbs: d3.mean(filtered.filter((row) => row.label === feature), (row) => Math.abs(row.shap)) ?? 0,
  })).sort((a, b) => b.meanAbs - a.meanAbs);
  const barMax = Math.max(...summary.map((row) => row.meanAbs), 0.1);

  if (!enabled) return null;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Model interpretation</span>
          <h1 className={styles.h1}>SHAP Explorer</h1>
          <p className={styles.lede}>Feature-attribution beeswarm with modality filters and de-identified participant highlighting.</p>
        </div>
        <div className={styles.actions}>
          <select className={styles.select} value={modality} onChange={(e) => setModality(e.target.value as Modality)} aria-label="Filter by modality">
            {["all", "ecg", "hda", "redcap", "thermal", "demographic"].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className={styles.select} value={window} onChange={(e) => setWindow(e.target.value)} aria-label="Filter by time window">
            <option value="all">all windows</option>
            {windows.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      </header>

      <div className={styles.split}>
        <Card pad={20}>
          <SectionLabel>Beeswarm</SectionLabel>
          <svg viewBox="0 0 760 320" className={styles.plotSvg} role="img" aria-label="SHAP beeswarm by feature">
            <line x1={420} x2={420} y1={16} y2={296} stroke="var(--slate-300)" strokeDasharray="3 3" />
            {features.map((feature, i) => (
              <g key={feature}>
                <text x={8} y={40 + i * 34} className={styles.tinyLabel}>{feature}</text>
                <line x1={120} x2={720} y1={36 + i * 34} y2={36 + i * 34} stroke="var(--slate-100)" />
              </g>
            ))}
            {points.map((point) => (
              <circle
                key={`${point.participantId}-${point.feature}`}
                cx={point.x}
                cy={point.y}
                r={highlight === point.participantId ? 6 : 4}
                fill={highlight === point.participantId ? "var(--usc-gold)" : point.shap >= 0 ? "var(--usc-garnet)" : "var(--blue)"}
                opacity={highlight && highlight !== point.participantId ? 0.28 : 0.72}
                onClick={() => setHighlight((value) => value === point.participantId ? "" : point.participantId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setHighlight((value) => value === point.participantId ? "" : point.participantId);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`${point.label}: ${point.participantId}, SHAP ${point.shap.toFixed(3)}`}
                aria-pressed={highlight === point.participantId}
                style={{ cursor: "pointer" }}
              />
            ))}
            <text x={120} y={314} className={styles.tinyLabel}>protective</text>
            <text x={720} y={314} textAnchor="end" className={styles.tinyLabel}>risk-increasing</text>
          </svg>
        </Card>

        <Card pad={20}>
          <SectionLabel>Global summary</SectionLabel>
          <div className={styles.cardTitle}>{highlight || "All participants"}</div>
          <svg viewBox="0 0 520 260" className={styles.plotSvg} role="img" aria-label="Mean absolute SHAP summary bars">
            {summary.map((row, i) => (
              <g key={row.feature} transform={`translate(0 ${20 + i * 30})`}>
                <text x={0} y={14} className={styles.tinyLabel}>{row.feature}</text>
                <rect x={210} y={3} width={(row.meanAbs / barMax) * 280} height={14} rx={3} fill="var(--usc-garnet)" opacity={0.76} />
                <text x={500} y={14} textAnchor="end" className={styles.tinyLabel}>{row.meanAbs.toFixed(3)}</text>
              </g>
            ))}
          </svg>
        </Card>
      </div>
    </div>
  );
}
