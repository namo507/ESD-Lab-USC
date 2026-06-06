import * as d3 from "d3";
import { useState } from "react";
import { Badge, Button, Card, SectionLabel } from "@/components/primitives";
import { useEcgQuality, useEcgQualitySummary, useParticipants } from "@/api/hooks";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import styles from "./FeatureRoutes.module.css";

export function EcgQuality() {
  const enabled = useFeatureFlag("ECG_QUALITY_MONITOR");
  const { data: participants = [] } = useParticipants();
  const [nanoId, setNanoId] = useState("");
  const selected = nanoId || participants[0]?.id;
  const { data } = useEcgQuality(selected);
  const { data: summary } = useEcgQualitySummary();
  const rows = data?.data ?? [];
  const color = d3.scaleLinear<string>().domain([0.2, 0.7, 0.95]).range(["var(--red)", "var(--usc-gold)", "var(--green)"]);

  function exportMarkdown() {
    const failures = rows.filter((row) => !row.pass);
    const markdown = [
      `# ECG QC Report: ${selected}`,
      "",
      `Generated: ${new Date().toISOString()}`,
      "",
      `Pass windows: ${rows.length - failures.length}/${rows.length}`,
      `Artifacts needing review: ${failures.length}`,
      "",
      "## Artifact Summary",
      ...["ectopic", "motion", "noise", "flatline"].map((kind) => `- ${kind}: ${failures.filter((row) => row.artifactType === kind).length}`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected ?? "ecg"}-qc.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!enabled) return null;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Quality route</span>
          <h1 className={styles.h1}>ECG Quality Monitor</h1>
          <p className={styles.lede}>Per-window SQI, artifact flags, and exportable QC report for de-identified Actiheart recordings.</p>
        </div>
        <div className={styles.actions}>
          <select className={styles.select} value={selected ?? ""} onChange={(e) => setNanoId(e.target.value)} aria-label="Participant">
            {participants.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
          </select>
          <Button variant="secondary" icon="download" onClick={exportMarkdown}>QC report</Button>
        </div>
      </header>

      <section className={styles.kpis}>
        {(summary?.data ?? []).map((item) => (
          <div key={item.label} className={styles.metric}>
            <div className={styles.metricLabel}>{item.label}</div>
            <div className={styles.metricValue}>{item.value.toFixed(item.value > 20 ? 1 : 0)}</div>
            <Badge kind={item.status === "ok" ? "ok" : item.status === "watch" ? "warn" : "fail"} size="sm">target {item.target}</Badge>
          </div>
        ))}
      </section>

      <Card pad={20}>
        <SectionLabel>Window quality grid</SectionLabel>
        <svg viewBox="0 0 760 360" className={styles.plotSvg} role="img" aria-label="ECG quality grid by hour and five-minute window">
          {Array.from({ length: 12 }, (_, hour) => (
            <text key={hour} x={42} y={34 + hour * 25} textAnchor="end" className={styles.tinyLabel}>{hour}h</text>
          ))}
          {rows.map((row) => (
            <g key={`${row.hour}-${row.minute}`}>
              <rect x={52 + (row.minute / 5) * 54} y={16 + row.hour * 25} width={46} height={18} rx={3} fill={color(row.sqi)} opacity={0.82} />
              {row.artifactType !== "none" && (
                <path d={`M${75 + (row.minute / 5) * 54} ${20 + row.hour * 25} l5 9 h-10 Z`} fill="var(--bg-surface)" stroke="var(--ink)" strokeWidth={0.8} />
              )}
            </g>
          ))}
        </svg>
      </Card>
    </div>
  );
}
