import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@/components/primitives";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import { fromDiscoveryPath, isDiscoveryPath, toDiscoveryPath } from "@/lib/discoveryRoutes";
import { useUi } from "@/store/ui";

type Variant = "pill" | "ghost";

interface Props {
  variant?: Variant;
  className?: string;
}

export function SkinToggle({ variant = "pill", className = "" }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const setBrand = useUi((s) => s.setBrand);

  if (!FEATURE_FLAGS.BRAND_ESD_2026) return null;

  const discoveryActive = isDiscoveryPath(location.pathname);
  const nextPath = discoveryActive ? fromDiscoveryPath(location.pathname) : toDiscoveryPath(location.pathname);
  const nextBrand = discoveryActive ? "default" : "esd-2026";
  const label = discoveryActive
    ? "Switch to default dashboard skin"
    : "Switch to Discovery 2026 dashboard skin";

  const baseClass =
    variant === "pill"
      ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono text-[color:var(--warm-fg2)] bg-[color:var(--warm-pill)] border border-[color:var(--warm-border)] hover:text-[color:var(--usc-garnet)] hover:border-[color:var(--usc-garnet)] transition"
      : "inline-flex items-center justify-center w-8 h-8 rounded-full border border-transparent text-[color:var(--warm-fg2)] hover:bg-[color:var(--warm-pill)] hover:text-[color:var(--usc-garnet)] transition";

  return (
    <button
      type="button"
      onClick={() => {
        setBrand(nextBrand);
        navigate(`${nextPath}${location.search}${location.hash}`);
      }}
      aria-label={label}
      title={label}
      className={`${baseClass} ${className}`}
      data-brand-switch={discoveryActive ? "discovery" : "default"}
    >
      <Icon name="wand-sparkles" size={variant === "pill" ? 12 : 14} stroke={1.6} color="var(--usc-garnet)" />
      {variant === "pill" && (
        <span aria-hidden>
          {discoveryActive ? "Default" : "Discovery"}
        </span>
      )}
    </button>
  );
}
