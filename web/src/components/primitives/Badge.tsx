import type { CSSProperties, ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeKind =
  | "info" | "ok" | "fail" | "pending" | "neutral"
  | "phi" | "asib" | "pt" | "td" | "vpt" | "warn" | "gold" | "inverse";

interface BadgeProps {
  kind?: BadgeKind;
  size?: "sm" | "md";
  mono?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}

export function Badge({ kind = "neutral", size = "md", mono = false, children, style }: BadgeProps) {
  return (
    <span
      className={`${styles.badge} ${styles[`kind-${kind}`]} ${styles[`size-${size}`]} ${mono ? styles.mono : ""}`}
      style={style}
    >
      {(kind === "info" || kind === "ok" || kind === "fail" || kind === "pending") && (
        <span className={`${styles.dot} ${styles[`dot-${kind}`]}`} aria-hidden />
      )}
      {children}
    </span>
  );
}
