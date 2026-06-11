/**
 * @route ModelConfidenceTerrain
 * @data-sensitivity: AGGREGATED - no PII
 * @auth-required: false (internal demo mode only)
 * @hipaa-note: All data rendered here is de-identified SHAP aggregate/model-explanation data. No PHI present.
 */
import { useMemo, useState } from "react";
import { Card, SectionLabel, Segmented } from "@/components/primitives";
import { ContourFallback } from "@/components/explainability/ContourFallback";
import { ShapExplainerCard } from "@/components/explainability/ShapExplainerCard";
import { useShapValues } from "@/api/hooks";
import type { ShapValueRow } from "@/api/schemas";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import shared from "./FeatureRoutes.module.css";
import styles from "./ModelConfidenceTerrain.module.css";

type Mode = "contour" | "heatmap" | "terrain";
type Modality = "all" | ShapValueRow["modality"];
type Scale = "sequential" | "diverging";

export function ModelConfidenceTerrain() {
  const enabled = useFeatureFlag("MODEL_CONFIDENCE_TERRAIN");
  const query = useShapValues();
  const rowsSource = query.data?.data;
  const rows = useMemo(() => rowsSource ?? [], [rowsSource]);
  const [mode, setMode] = useState<Mode>("contour");
  const [modality, setModality] = useState<Modality>("all");
  const [timeWindow, setTimeWindow] = useState("all");
  const [scale, setScale] = useState<Scale>("sequential");
  const features = useMemo(() => Array.from(new Set(rows.map((row) => row.label))).sort(), [rows]);
  const [feature, setFeature] = useState("");
  const activeFeature = feature || features[0] || "";
  const windows = useMemo(() => Array.from(new Set(rows.map((row) => row.timeWindow))).sort(), [rows]);
  const filtered = rows.filter((row) =>
    row.label === activeFeature
    && (modality === "all" || row.modality === modality)
    && (timeWindow === "all" || row.timeWindow === timeWindow)
  );

  if (!enabled) return null;

  return (
    <div className={`${shared.page} ${styles.page}`}>
      <header className={shared.hero}>
        <div>
          <span className={`${shared.eyebrow} t-mono`}>Model interpretation</span>
          <h1 className={shared.h1}>Model Confidence Terrain</h1>
          <p className={shared.lede}>A 2D terrain-style fallback showing where feature values and developmental windows carry the strongest SHAP influence.</p>
        </div>
      </header>

      <Card pad={0}>
        <div className={styles.controls}>
          <Segmented<Mode>
            ariaLabel="Render mode"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "contour", label: "Contour" },
              { value: "heatmap", label: "Heatmap" },
              { value: "terrain", label: "Terrain unavailable" },
            ]}
          />
          <select className={styles.select} value={activeFeature} onChange={(event) => setFeature(event.target.value)} aria-label="Feature">
            {features.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className={styles.select} value={modality} onChange={(event) => setModality(event.target.value as Modality)} aria-label="Modality">
            {["all", "ecg", "hda", "thermal", "redcap", "demographic"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className={styles.select} value={timeWindow} onChange={(event) => setTimeWindow(event.target.value)} aria-label="Time window">
            <option value="all">all windows</option>
            {windows.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <Segmented<Scale>
            ariaLabel="Color scale"
            size="sm"
            value={scale}
            onChange={setScale}
            options={[
              { value: "sequential", label: "Sequential" },
              { value: "diverging", label: "Diverging" },
            ]}
          />
        </div>
      </Card>

      {query.isError && <div className={shared.alert}>Unable to load data - check pipeline status</div>}

      <div className={styles.grid}>
        <Card pad={0}>
          <div className={styles.chartPad}>
            <SectionLabel>{mode === "heatmap" ? "Heatmap" : "Contour fallback"}</SectionLabel>
            <h2 className={shared.cardTitle}>{activeFeature || "Feature influence"}</h2>
            {mode === "terrain" ? (
              <div className={styles.note}>
                Terrain mode is disabled because `three`, `@react-three/fiber`, and `@react-three/drei` are not installed in this app. Contour and Heatmap are the shipped fallbacks.
              </div>
            ) : (
              <ContourFallback
                rows={filtered}
                mode={mode}
                diverging={scale === "diverging"}
                summary={`SHAP ${mode} for ${activeFeature}`}
              />
            )}
          </div>
        </Card>

        <div style={{ display: "grid", gap: 12 }}>
          <ShapExplainerCard />
          <div className={styles.note}>
            No participant IDs are shown here. The source is the existing de-identified `useShapValues()` contract with time-window aggregation.
          </div>
        </div>
      </div>
    </div>
  );
}
