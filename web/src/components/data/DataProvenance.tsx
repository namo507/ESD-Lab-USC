import type { DashboardSourceState } from "@/api/dashboardMetrics";
import styles from "./DataProvenance.module.css";

type StaticProvenanceKind = "snapshot" | "pilot" | "reference";

interface DataProvenanceProps {
  source?: DashboardSourceState;
  kind?: StaticProvenanceKind;
  label?: string;
  detail?: string;
  compact?: boolean;
  className?: string;
}

const STATIC_LABELS: Record<StaticProvenanceKind, string> = {
  snapshot: "Snapshot",
  pilot: "Pilot model",
  reference: "Reference",
};

export function DataProvenance({
  source,
  kind,
  label,
  detail,
  compact = false,
  className = "",
}: DataProvenanceProps) {
  const state = source?.status ?? kind ?? "unavailable";
  const resolvedLabel = label ?? source?.label ?? (kind ? STATIC_LABELS[kind] : "Data unavailable");
  const resolvedDetail = detail ?? source?.detail;

  return (
    <div
      className={`${styles.provenance} ${styles[state]} ${compact ? styles.compact : ""} ${className}`.trim()}
      data-source-state={state}
      role="status"
    >
      <strong>{resolvedLabel}</strong>
      {resolvedDetail ? <span className={styles.detail}>{resolvedDetail}</span> : null}
    </div>
  );
}
