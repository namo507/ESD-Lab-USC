/**
 * One study, as a glyph.
 *
 * A star, because the icon semantics in the design system are specific: the
 * sunburst is the lab's work, the star is programs and studies, and the IMB
 * building is the physical location. A study is a study, so it gets a star.
 *
 * At rest the glyph shows a name and nothing else — no count, no badge, no
 * sparkline. The numbers live one hover or one Tab away, in the codex card.
 */
import { forwardRef } from "react";

import styles from "./StudyGlyph.module.css";

export interface StudyGlyphProps {
  label: string;
  /** Family-facing name, shown under the label at low emphasis. */
  publicName: string;
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
  { label, publicName, active, pinned, dimmed, describedBy, onEnter, onLeave, onToggle },
  ref,
) {
  return (
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
  );
});
