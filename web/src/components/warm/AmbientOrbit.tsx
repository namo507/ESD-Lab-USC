import type { CSSProperties } from "react";

/**
 * AmbientOrbit — non-interactive decorative SVG.
 *
 * Soft concentric dotted rings with a slow rotation. Layered behind content
 * to soak up dead whitespace on metric / status cards. Honours
 * `prefers-reduced-motion`: the orbit halts but the rings still render.
 *
 * Two preset styles:
 *  - `gold` for the dark terminal-style agentic panel
 *  - `garnet` for the cream glass surfaces (Buddy drawer, REDCap field map)
 */
type Tone = "gold" | "garnet" | "sage" | "ocean";

const TONE_HEX: Record<Tone, string> = {
  gold:   "rgba(255, 204, 0, 0.85)",
  garnet: "rgba(115, 0, 10, 0.55)",
  sage:   "rgba(91, 149, 119, 0.75)",
  ocean:  "rgba(107, 139, 184, 0.75)",
};

interface Props {
  size?: number;
  tone?: Tone;
  /** Container opacity. Keep low so it stays decorative. */
  opacity?: number;
  /** Rotation seconds per full turn. */
  spin?: number;
  className?: string;
  style?: CSSProperties;
  /** Render a soft ECG-style waveform beneath the rings. */
  waveform?: boolean;
}

export function AmbientOrbit({
  size = 180,
  tone = "gold",
  opacity = 0.22,
  spin = 28,
  className = "",
  style,
  waveform = false,
}: Props) {
  const colour = TONE_HEX[tone];
  return (
    <div
      aria-hidden
      className={`pointer-events-none select-none ${className}`}
      style={{ width: size, height: size, opacity, ...style }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        style={{ display: "block" }}
      >
        <defs>
          <radialGradient id={`ao-${tone}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor={colour} stopOpacity="0.18" />
            <stop offset="60%" stopColor={colour} stopOpacity="0.04" />
            <stop offset="100%" stopColor={colour} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`ao-${tone}-wave`} x1="0" x2="100%" y1="0" y2="0">
            <stop offset="0%"   stopColor={colour} stopOpacity="0" />
            <stop offset="50%"  stopColor={colour} stopOpacity="0.6" />
            <stop offset="100%" stopColor={colour} stopOpacity="0" />
          </linearGradient>
        </defs>

        <circle cx="50" cy="50" r="48" fill={`url(#ao-${tone}-glow)`} />

        <g
          style={{
            transformOrigin: "50px 50px",
            animation: `ambient-orbit-spin ${spin}s linear infinite`,
          }}
        >
          <circle cx="50" cy="50" r="44" fill="none" stroke={colour} strokeOpacity="0.45" strokeWidth="0.35" strokeDasharray="0.6 2.4" />
          <circle cx="50" cy="50" r="34" fill="none" stroke={colour} strokeOpacity="0.55" strokeWidth="0.35" strokeDasharray="0.4 1.8" />
          <circle cx="50" cy="50" r="24" fill="none" stroke={colour} strokeOpacity="0.65" strokeWidth="0.35" strokeDasharray="0.3 1.4" />
          <circle cx="94" cy="50" r="1.2" fill={colour} fillOpacity="0.85" />
          <circle cx="84" cy="50" r="0.9" fill={colour} fillOpacity="0.65" />
          <circle cx="74" cy="50" r="0.7" fill={colour} fillOpacity="0.45" />
        </g>

        <g
          style={{
            transformOrigin: "50px 50px",
            animation: `ambient-orbit-spin-reverse ${spin * 1.6}s linear infinite`,
          }}
        >
          <circle cx="50" cy="50" r="14" fill="none" stroke={colour} strokeOpacity="0.85" strokeWidth="0.25" strokeDasharray="0.2 1.2" />
          <circle cx="64" cy="50" r="0.85" fill={colour} fillOpacity="0.9" />
        </g>

        {waveform && (
          <path
            d="M 0 60 Q 12 56, 20 60 T 36 60 L 40 50 L 44 70 L 48 44 L 52 72 L 56 50 L 60 60 T 78 60 T 100 60"
            fill="none"
            stroke={`url(#ao-${tone}-wave)`}
            strokeWidth="0.5"
            style={{ animation: `ambient-orbit-drift 6s ease-in-out infinite` }}
          />
        )}
      </svg>
    </div>
  );
}
