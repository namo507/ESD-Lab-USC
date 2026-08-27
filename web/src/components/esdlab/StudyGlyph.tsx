/**
 * One study, as a glyph on the ring around the character.
 *
 * A star, because the icon semantics in the design system are specific: the
 * sunburst is the lab's work, the star is programs and studies, and the IMB
 * building is the physical location. A study is a study, so it gets a star.
 *
 * Each glyph carries its own accent from the secondary palette, so the ring
 * reads as five distinct things rather than five copies. At rest it shows a
 * name and nothing else — the numbers live one hover or one Tab away.
 */
import { forwardRef } from "react";

import styles from "./StudyGlyph.module.css";

export interface StudyGlyphProps {
  label: string;
  /** Family-facing name, shown under the label at low emphasis. */
  publicName: string;
  /** Secondary-palette accent for this study. */
  accent: string;
  /** Position on the ring, in degrees clockwise from the top. */
  angle: number;
  /** Staggers the float so the ring breathes rather than pulsing as one. */
  index: number;
  active: boolean;
  pinned: boolean;
  /** Set on closed studies so the eye can sort them without reading. */
  dimmed: boolean;
  describedBy?: string;
  onEnter: () => void;
  onLeave: () => void;
  onToggle: () => void;
}

export const StudyGlyph = forwardRef<HTMLButtonElement, StudyGlyphProps>(function StudyGlyph(
  { label, publicName, accent, angle, index, active, pinned, dimmed, describedBy, onEnter, onLeave, onToggle },
  ref,
) {
  return (
    <span
      className={styles.slot}
      style={{
        // Ring placement lives on this wrapper, never on the button.
        //
        // The brand stylesheet has a global `button:active { transform:
        // translateY(1px) }` press effect. `transform` is one property, so that
        // rule *replaced* the placement transform on mousedown and the glyph
        // snapped to the centre of the ring — mouseup then landed somewhere
        // else and the click never fired. Splitting placement onto a wrapper
        // lets both effects coexist.
        ["--glyph-angle" as string]: `${angle}deg`,
        ["--glyph-accent" as string]: accent,
        ["--glyph-delay" as string]: `${index * 0.42}s`,
      }}
    >
    <button
      ref={ref}
      type="button"
      className={styles.glyph}
      data-active={active ? "true" : "false"}
      data-pinned={pinned ? "true" : "false"}
      data-dimmed={dimmed ? "true" : "false"}
      aria-expanded={active}
      aria-describedby={active ? describedBy : undefined}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      // Keyboard focus opens the same card on the same delay. Information that
      // is only reachable by hover is information a keyboard user cannot have.
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onToggle}
    >
      <span className={styles.star} aria-hidden="true">
        <svg viewBox="0 0 48 48" focusable="false">
          <path
            d="M24 3.5 29.1 17.4 43.6 18.1 32.3 27.2 36 41.2 24 33.2 12 41.2 15.7 27.2 4.4 18.1 18.9 17.4Z"
            fill="currentColor"
            strokeLinejoin="round"
            strokeWidth="3"
            stroke="currentColor"
          />
        </svg>
      </span>
      <span className={styles.label}>{label}</span>
      <span className={styles.publicName}>{publicName}</span>
    </button>
    </span>
  );
});
