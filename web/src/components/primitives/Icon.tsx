import type { CSSProperties } from "react";
import * as Lucide from "lucide-react";

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  stroke?: number;
  style?: CSSProperties;
  ariaLabel?: string;
}

/** Convert kebab-case lucide names → PascalCase used by lucide-react. */
function pascal(name: string): string {
  return name
    .split("-")
    .map((p) => (p ? p[0]!.toUpperCase() + p.slice(1) : ""))
    .join("");
}

export function Icon({ name, size = 16, color, stroke = 1.5, style, ariaLabel }: IconProps) {
  const Component = (Lucide as unknown as Record<string, React.FC<{
    size?: number;
    color?: string;
    strokeWidth?: number;
    style?: CSSProperties;
    "aria-hidden"?: boolean;
    "aria-label"?: string;
    role?: string;
  }>>)[pascal(name)] ?? Lucide.Circle;

  return (
    <Component
      size={size}
      color={color ?? "currentColor"}
      strokeWidth={stroke}
      style={{ flexShrink: 0, display: "inline-flex", ...style }}
      aria-hidden={ariaLabel ? false : true}
      aria-label={ariaLabel}
      role={ariaLabel ? "img" : undefined}
    />
  );
}
