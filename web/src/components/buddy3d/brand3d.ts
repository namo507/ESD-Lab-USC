/**
 * Brand vocabulary, expressed for the 3D scene.
 *
 * The canonical values live in `web/src/styles/esd-2026.css`. WebGL cannot read
 * a CSS custom property, so the hexes are mirrored here and pinned by the test
 * in `web/src/test/buddyBrand.test.ts`, which reads the stylesheet and fails if
 * the two ever drift. Do not edit a value here without editing the stylesheet.
 */

export const BRAND = {
  /** Signature. The sunburst core and every primary fill. */
  discoveryBlue: "#3366ff",
  /** Rim light and secondary structure. */
  scienceBlue: "#91baf4",
  /** Body. */
  coolBlue: "#e6eefc",
  coolWhite: "#f4f4f6",
  jetBlack: "#000000",
} as const;

/**
 * Accents are exactly one at a time. The character never wears two, which is
 * what keeps the secondary palette from dominating the way the design system
 * forbids.
 */
export const ACCENT = {
  /** attentive / presenting */
  attention: "#f57f00",
  /** celebrating, discovery */
  discovery: "#f4da26",
  /** concerned, blocked, refused */
  blocked: "#d74e2d",
  /** warmth, listening */
  warm: "#f8b2b1",
} as const;

export type AccentName = keyof typeof ACCENT;

/** Co-brand only. Present so nothing reaches for an off-palette garnet. */
export const CO_BRAND_GARNET = "#73000a";

/**
 * Gaze cone limits, in radians.
 *
 * Past these the illusion breaks and the character reads as uncanny rather than
 * attentive, so the eyes hand off to the head and the head hands off to the
 * body instead of any one of them over-rotating.
 */
export const GAZE_LIMITS = {
  eyeYaw: (35 * Math.PI) / 180,
  eyePitch: (25 * Math.PI) / 180,
  headYaw: (45 * Math.PI) / 180,
  headPitch: (30 * Math.PI) / 180,
} as const;

/**
 * Damping half-lives, in seconds.
 *
 * The eyes are roughly three times faster than the head on purpose: the lag
 * between them is the single cue that reads as "alive". Equalise these and the
 * character goes dead even though every other behaviour still runs.
 */
export const DAMPING = {
  eye: 0.12,
  head: 0.35,
  body: 0.55,
  accent: 0.25,
} as const;
