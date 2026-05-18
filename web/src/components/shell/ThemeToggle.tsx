import { Icon } from "@/components/primitives";
import { useUi, type ThemeMode } from "@/store/ui";

/**
 * Tri-state theme toggle: light → dark → system → light.
 *
 * The active mode is reflected in the visible icon (sun/moon/laptop) and
 * announced via aria-label so screen-reader users hear the next-state
 * preview ("switch to dark theme") and the press confirms the new mode.
 *
 * Variants:
 *   - "pill"  — used inside the operator TopNav and Landing nav. Garnet-
 *               accented icon on a warm-pill background.
 *   - "ghost" — used inside the Landing dock. Pure icon, no chip frame.
 */
type Variant = "pill" | "ghost";

interface Props {
  variant?: Variant;
  className?: string;
}

const NEXT_LABEL: Record<ThemeMode, string> = {
  light: "Switch to dark theme",
  dark:  "Switch to system theme",
  system:"Switch to light theme",
};

const ICON_NAME: Record<ThemeMode, string> = {
  light: "sun",
  dark:  "moon",
  system:"laptop-minimal",
};

export function ThemeToggle({ variant = "pill", className = "" }: Props) {
  const theme = useUi((s) => s.theme);
  const cycleTheme = useUi((s) => s.cycleTheme);

  const baseClass =
    variant === "pill"
      ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono text-[color:var(--warm-fg2)] bg-[color:var(--warm-pill)] border border-[color:var(--warm-border)] hover:text-[color:var(--usc-garnet)] hover:border-[color:var(--usc-garnet)] transition"
      : "inline-flex items-center justify-center w-8 h-8 rounded-full border border-transparent text-[color:var(--warm-fg2)] hover:bg-[color:var(--warm-pill)] hover:text-[color:var(--usc-garnet)] transition";

  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={NEXT_LABEL[theme]}
      title={NEXT_LABEL[theme]}
      className={`${baseClass} ${className}`}
      data-theme-mode={theme}
    >
      <Icon name={ICON_NAME[theme]} size={variant === "pill" ? 12 : 14} stroke={1.6} color="var(--usc-garnet)" />
      {variant === "pill" && (
        <span aria-hidden style={{ textTransform: "capitalize" }}>
          {theme}
        </span>
      )}
    </button>
  );
}
