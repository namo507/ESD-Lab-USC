import type { CSSProperties, ElementType, ReactNode } from "react";
import styles from "./SectionLabel.module.css";

/**
 * Tags this label is ever rendered as.
 *
 * Deliberately a closed list rather than `keyof JSX.IntrinsicElements`: the 3D
 * scene augments that type with the three.js element set, some of which carry
 * required props, so the open bound stopped describing anything renderable.
 */
export type SectionLabelTag = "div" | "span" | "h2" | "h3" | "h4" | "p" | "legend";

interface SectionLabelProps {
  children: ReactNode;
  style?: CSSProperties;
  as?: SectionLabelTag;
}

export function SectionLabel({ children, style, as = "div" }: SectionLabelProps) {
  const Tag = as as ElementType;
  return <Tag className={styles.label} style={style}>{children}</Tag>;
}
