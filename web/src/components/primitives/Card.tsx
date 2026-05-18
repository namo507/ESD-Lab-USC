import type { CSSProperties, ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps {
  children: ReactNode;
  pad?: number;
  hoverable?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  className?: string;
  asButton?: boolean;
  ariaLabel?: string;
  dataInsight?: string;
}

export function Card({
  children,
  pad = 24,
  hoverable = false,
  onClick,
  style,
  className,
  asButton = false,
  ariaLabel,
  dataInsight,
}: CardProps) {
  const baseStyle: CSSProperties = { padding: pad, ...style };
  const cls = `${styles.card} ${hoverable || onClick ? styles.hoverable : ""} ${className ?? ""}`;

  if (onClick && asButton) {
    return (
      <button
        type="button"
        className={cls}
        style={baseStyle}
        onClick={onClick}
        aria-label={ariaLabel}
        data-insight={dataInsight}
      >
        {children}
      </button>
    );
  }
  return (
    <div
      className={cls}
      style={baseStyle}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
      data-insight={dataInsight}
    >
      {children}
    </div>
  );
}
