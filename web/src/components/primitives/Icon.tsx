import type { CSSProperties } from "react";
import { ICONS, FALLBACK_ICON } from "./iconRegistry";

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  stroke?: number;
  style?: CSSProperties;
  ariaLabel?: string;
}

export function Icon({ name, size = 16, color, stroke = 1.5, style, ariaLabel }: IconProps) {
  // Explicit registry instead of a dynamic `import * as Lucide` lookup so the
  // bundler tree-shakes to only the icons this app uses. Unknown names fall back
  // to Circle, matching the previous behaviour.
  const Component = ICONS[name] ?? FALLBACK_ICON;

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
