/**
 * The buddy without WebGL.
 *
 * Same silhouette, same palette, same accent-per-state rule — drawn in SVG so a
 * machine with no WebGL context still gets a character rather than an empty
 * rectangle. Every function of the page stays reachable through the DOM path,
 * so this is a downgrade in presence and not in capability.
 */
import { BRAND } from "./brand3d";
import { accentHex, type BuddyState } from "./buddyState";

const RAYS = Array.from({ length: 12 }, (_, i) => (i / 12) * 360);

export function BuddyStatic({ state }: { state: BuddyState }) {
  const accent = accentHex(state) ?? BRAND.discoveryBlue;
  const concerned = state === "concerned";

  return (
    <svg
      className="buddy-static"
      viewBox="0 0 240 240"
      role="img"
      aria-label={`ESD Lab buddy, ${state}`}
      focusable="false"
    >
      <g transform="translate(120 96)">
        {RAYS.map((deg) => (
          <rect
            key={deg}
            x="-3"
            y="-46"
            width="6"
            height="22"
            rx="3"
            fill={BRAND.discoveryBlue}
            opacity="0.55"
            transform={`rotate(${deg})`}
          />
        ))}
        <circle r="17" fill={BRAND.discoveryBlue} />
        <circle r="47" fill="none" stroke={accent} strokeWidth="2" opacity="0.7" />
      </g>

      {/* Body: rounded everywhere. Sharp corners are off-brand in 2D too. */}
      <rect x="62" y="150" width="116" height="78" rx="39" fill={BRAND.coolBlue} stroke={BRAND.scienceBlue} strokeWidth="2" />
      <circle cx="120" cy="128" r="58" fill={BRAND.coolBlue} stroke={BRAND.scienceBlue} strokeWidth="2" />

      <circle cx="99" cy="122" r="17" fill="#ffffff" />
      <circle cx="141" cy="122" r="17" fill="#ffffff" />
      <circle cx="101" cy="124" r="8" fill="#141a2e" />
      <circle cx="143" cy="124" r="8" fill="#141a2e" />
      <circle cx="104" cy="120" r="3" fill="#ffffff" />
      <circle cx="146" cy="120" r="3" fill="#ffffff" />

      <path
        d={concerned ? "M106 160 q14 -9 28 0" : "M106 156 q14 12 28 0"}
        fill="none"
        stroke="#2a3350"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
