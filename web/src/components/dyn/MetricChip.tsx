import { Icon } from "@/components/primitives";
import styles from "./DynamicRoutes.module.css";

interface MetricChipProps {
  label: string;
  value: string | number;
  unit?: string;
  verify?: boolean;
  insight?: string;
}

export function MetricChip({ label, value, unit, verify = false, insight }: MetricChipProps) {
  return (
    <div className={styles.chip} data-insight={insight ?? "dyn-metric-chip"}>
      <div>
        <div className={styles.chipLabel}>{label}</div>
        <div className={styles.chipValue}>
          {value}
          {unit ? <span className={styles.muted}> {unit}</span> : null}
        </div>
      </div>
      {verify && <Icon name="badge-help" size={14} color="var(--usc-garnet)" ariaLabel="Verify against source" />}
    </div>
  );
}
