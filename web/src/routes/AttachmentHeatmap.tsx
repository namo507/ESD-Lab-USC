import * as d3 from "d3";
import { useState } from "react";
import { Card, SectionLabel } from "@/components/primitives";
import { ATTACHMENT_CORRELATIONS, ATTACHMENT_DOMAINS, type AttachmentCorrelation } from "@/data/attachmentCorrelations";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import styles from "./FeatureRoutes.module.css";

export function AttachmentHeatmap() {
  const enabled = useFeatureFlag("ATTACHMENT_HEATMAP");
  const [hover, setHover] = useState<AttachmentCorrelation | null>(null);
  const color = d3.scaleLinear<string>().domain([-0.7, 0, 0.7]).range(["var(--blue)", "var(--bg-surface)", "var(--usc-garnet)"]);
  const cell = 76;
  const offset = 170;

  if (!enabled) return null;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={`${styles.eyebrow} t-mono`}>Correlation route</span>
          <h1 className={styles.h1}>Attachment Correlation Heatmap</h1>
          <p className={styles.lede}>Attachment-script, caregiver, physiology, HDA, and outcome associations in one compact matrix.</p>
        </div>
      </header>

      <div className={styles.split}>
        <Card pad={20}>
          <SectionLabel>Correlation matrix</SectionLabel>
          <svg viewBox="0 0 700 650" className={styles.plotSvg} role="img" aria-label="Attachment correlation heatmap">
            {ATTACHMENT_DOMAINS.map((domain, i) => (
              <g key={domain}>
                <text x={offset + i * cell + cell / 2} y={132} textAnchor="middle" className={styles.tinyLabel} transform={`rotate(-35 ${offset + i * cell + cell / 2} 132)`}>{domain}</text>
                <text x={offset - 10} y={offset + i * cell + 45} textAnchor="end" className={styles.tinyLabel}>{domain}</text>
              </g>
            ))}
            {ATTACHMENT_CORRELATIONS.map((entry) => {
              const x = ATTACHMENT_DOMAINS.indexOf(entry.column as (typeof ATTACHMENT_DOMAINS)[number]);
              const y = ATTACHMENT_DOMAINS.indexOf(entry.row as (typeof ATTACHMENT_DOMAINS)[number]);
              return (
                <rect
                  key={`${entry.row}-${entry.column}`}
                  x={offset + x * cell}
                  y={offset + y * cell}
                  width={cell - 4}
                  height={cell - 4}
                  rx={4}
                  fill={color(entry.r)}
                  stroke={hover === entry ? "var(--usc-gold)" : "var(--border)"}
                  onMouseEnter={() => setHover(entry)}
                  onFocus={() => setHover(entry)}
                  tabIndex={0}
                />
              );
            })}
          </svg>
        </Card>

        <Card pad={20}>
          <SectionLabel>Cell detail</SectionLabel>
          {hover ? (
            <>
              <div className={styles.cardTitle}>{hover.row} x {hover.column}</div>
              <div className={styles.metricGrid}>
                <div className={styles.metric}><div className={styles.metricLabel}>r</div><div className={styles.metricValue}>{hover.r.toFixed(2)}</div></div>
                <div className={styles.metric}><div className={styles.metricLabel}>p</div><div className={styles.metricValue}>{hover.p.toFixed(3)}</div></div>
              </div>
            </>
          ) : (
            <p className={styles.muted}>Hover or focus a cell to inspect the association.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
