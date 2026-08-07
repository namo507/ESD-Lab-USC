import { Icon, Gloss } from "@/components/primitives";
import styles from "./HipaaBanner.module.css";

interface HipaaBannerProps {
  onDismiss?: () => void;
  idleMinutes: number;
}

/**
 * Gradient HIPAA banner per the warm design package. Inline `Gloss`
 * tooltips on PHI / HIPAA / REDCap pull definitions from `glossary.ts`.
 */
export function HipaaBanner({ onDismiss, idleMinutes }: HipaaBannerProps) {
  return (
    <div
      className={styles.bar}
      role="region"
      aria-label="HIPAA notice"
    >
      <span className={styles.warning} aria-hidden>⚠️</span>
      <Icon name="shield-check" size={14} stroke={1.5} color="var(--hipaa-icon)" />
      <span className={styles.message}>
        <Gloss term="PHI">PHI</Gloss> processing zone ·{" "}
        <Gloss term="HIPAA">HIPAA</Gloss>-compliant audit logging is active. All exports are stripped of
        identifiers via <Gloss term="RedCap">REDCap</Gloss> proxy; assistant prompts are PHI-scrubbed
        before the secure backend proxy request.
      </span>
      <span className={styles.meta}>
        IRB Pro00115234 · session · {idleMinutes} m
      </span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className={styles.dismiss}
          aria-label="Dismiss HIPAA banner"
        >
          <Icon name="x" size={13} stroke={1.5} color="var(--warm-fg4)" />
        </button>
      )}
    </div>
  );
}
