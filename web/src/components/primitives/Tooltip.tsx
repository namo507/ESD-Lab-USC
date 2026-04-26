import { useId, useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { lookupGloss } from "@/lib/glossary";
import styles from "./Tooltip.module.css";

interface TooltipProps {
  text?: string;
  gloss?: string;
  side?: "top" | "bottom";
  maxWidth?: number;
  children: ReactNode;
}

export function Tooltip({ text, gloss, side = "top", maxWidth = 280, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement | null>(null);
  const body = gloss ? lookupGloss(gloss) ?? text : text;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!body) return <>{children}</>;
  return (
    <span
      ref={ref}
      className={styles.wrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`${styles.body} ${side === "bottom" ? styles.bottom : styles.top}`}
          style={{ maxWidth }}
        >
          {body}
        </span>
      )}
    </span>
  );
}
