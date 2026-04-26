import type { CSSProperties, ReactNode } from "react";
import styles from "./SectionLabel.module.css";

interface SectionLabelProps {
  children: ReactNode;
  style?: CSSProperties;
  as?: keyof JSX.IntrinsicElements;
}

export function SectionLabel({ children, style, as = "div" }: SectionLabelProps) {
  const Tag = as as keyof JSX.IntrinsicElements;
  return <Tag className={styles.label} style={style}>{children}</Tag>;
}
