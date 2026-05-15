import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip";
import styles from "./Gloss.module.css";

interface GlossProps {
  term: string;
  children?: ReactNode;
  dotted?: boolean;
}

export function Gloss({ term, children, dotted = true }: GlossProps) {
  return (
    <Tooltip gloss={term} maxWidth={320}>
      <span className={`${styles.term} ${dotted ? styles.dotted : ""}`} tabIndex={0}>
        {children ?? term}
      </span>
    </Tooltip>
  );
}
