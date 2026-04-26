import { Icon } from "@/components/primitives";
import styles from "./HipaaBanner.module.css";

interface HipaaBannerProps {
  onDismiss: () => void;
}

export function HipaaBanner({ onDismiss }: HipaaBannerProps) {
  return (
    <div className={styles.bar} role="region" aria-label="HIPAA notice">
      <span aria-hidden>⚠️</span>
      <Icon name="alert-triangle" color="var(--usc-garnet)" size={13} />
      <span>
        <strong className={styles.strong}>HIPAA notice ·</strong> this dashboard exposes PHI from the NANO study. Do not share credentials or screenshots. All access is logged to{" "}
        <code className={styles.code}>audit/hipaa_access.log</code>.
      </span>
      <span className={styles.spacer} />
      <span className={styles.meta}>IRB Pro00115234 · NIH R01 MH123456</span>
      <button onClick={onDismiss} className={styles.dismiss} aria-label="Dismiss HIPAA banner" type="button">
        <Icon name="x" size={13} color="var(--slate-500)" />
      </button>
    </div>
  );
}
