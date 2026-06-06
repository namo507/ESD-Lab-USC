import { useState } from "react";
import { Badge, Card, SectionLabel } from "@/components/primitives";
import { useModelLeaderboard, useModelLeaderboardDetail } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import styles from "./FeatureRoutes.module.css";

export function ModelLeaderboard() {
  const enabled = useFeatureFlag("MODEL_LEADERBOARD");
  const { data } = useModelLeaderboard();
  const rows = data?.data ?? [];
  const [modelId, setModelId] = useState("");
  const selected = modelId || rows[0]?.modelId;
  const { data: detail } = useModelLeaderboardDetail(selected);

  if (!enabled) return null;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Model registry</span>
          <h1 className={styles.h1}>Model Leaderboard</h1>
          <p className={styles.lede}>Validated NANO risk models with calibration, ablation, and learning-curve context.</p>
        </div>
      </header>

      <div className={styles.split}>
        <Card pad={0}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Model leaderboard.</caption>
              <thead><tr>{["Model", "AUROC", "Sensitivity", "Specificity", "F1", "Calibration", "Features"].map((h) => <th key={h} className={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.modelId} className={styles.tr} onClick={() => setModelId(row.modelId)}>
                    <td className={styles.td}>
                      <strong>{row.name}</strong>
                      {row.modelId === selected && <span style={{ marginLeft: 8 }}><Badge kind="ok" size="sm">selected</Badge></span>}
                    </td>
                    <td className={`${styles.td} t-mono`}>{row.auroc.toFixed(3)}</td>
                    <td className={`${styles.td} t-mono`}>{row.sensitivity.toFixed(3)}</td>
                    <td className={`${styles.td} t-mono`}>{row.specificity.toFixed(3)}</td>
                    <td className={`${styles.td} t-mono`}>{row.f1.toFixed(3)}</td>
                    <td className={`${styles.td} t-mono`}>{row.calibration.toFixed(3)}</td>
                    <td className={`${styles.td} t-mono`}>{row.features}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card pad={20}>
          <SectionLabel>Expanded detail</SectionLabel>
          <div className={styles.cardTitle}>{rows.find((row) => row.modelId === selected)?.name ?? "Model"}</div>
          <svg viewBox="0 0 520 190" className={styles.plotSvg} role="img" aria-label="Model learning curve">
            {(detail?.data ?? []).map((row, i, arr) => {
              if (i === 0) return null;
              const prev = arr[i - 1]!;
              const x1 = 36 + prev.epoch * 50;
              const x2 = 36 + row.epoch * 50;
              const y1 = 170 - prev.validationAuroc * 150;
              const y2 = 170 - row.validationAuroc * 150;
              return <line key={row.epoch} x1={x1} x2={x2} y1={y1} y2={y2} stroke="var(--usc-garnet)" strokeWidth={2} />;
            })}
            {(detail?.data ?? []).map((row) => (
              <circle key={row.epoch} cx={36 + row.epoch * 50} cy={170 - row.validationAuroc * 150} r={3} fill="var(--usc-garnet)" />
            ))}
          </svg>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>{["Ablation", "Delta"].map((h) => <th key={h} className={styles.th}>{h}</th>)}</tr></thead>
              <tbody>
                {(detail?.data ?? []).slice(0, 4).map((row) => (
                  <tr key={`${row.epoch}-${row.ablation}`}>
                    <td className={styles.td}>{row.ablation}</td>
                    <td className={`${styles.td} t-mono`}>{row.ablationDelta.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
