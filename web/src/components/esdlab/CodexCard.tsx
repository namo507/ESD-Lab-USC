/**
 * A codex card: the only place a number appears on this surface.
 *
 * Styled as a game inventory tooltip rather than a business tooltip, because
 * the whole point of the front door is that it reads as something you explore
 * rather than something you monitor. It springs in with overshoot so it feels
 * like it has mass, and every fact it shows carries the artifact it came from.
 *
 * It is a real DOM node with real text, reachable by keyboard and readable by a
 * screen reader. Hover is one way in, not the only way.
 */
import { useEffect, useRef } from "react";

import type { StudyCodex } from "./studyCodex";
import styles from "./CodexCard.module.css";

export interface CodexCardProps {
  codex: StudyCodex;
  pinned: boolean;
  onAsk: (question: string) => void;
  onDismiss: () => void;
  id: string;
}

export function CodexCard({ codex, pinned, onAsk, onDismiss, id }: CodexCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Esc unpins from anywhere, including from inside the card.
  useEffect(() => {
    if (!pinned) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned, onDismiss]);

  return (
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label={`${codex.title} study details`}
      className={styles.card}
      data-pinned={pinned ? "true" : "false"}
    >
      <header className={styles.header}>
        <span className={styles.eyebrow}>{codex.title}</span>
        {pinned && (
          <button type="button" className={styles.close} onClick={onDismiss} aria-label="Unpin card">
            esc
          </button>
        )}
      </header>

      <p className={styles.subtitle}>{codex.subtitle}</p>
      {codex.conflict && (
        <p className={styles.conflict} title="Two sources publish different expansions.">
          {codex.conflict}
        </p>
      )}

      <dl className={styles.facts}>
        {codex.facts.map((fact) => (
          <div className={styles.fact} key={fact.label}>
            <dt className={styles.factLabel}>{fact.label}</dt>
            {/* The source rides on the value, not in a footnote, so a number can
                never be read without the artifact it came from. */}
            <dd className={styles.factValue} title={`source: ${fact.source}`}>
              {fact.value}
              <span className={styles.factSource}>{fact.source}</span>
            </dd>
          </div>
        ))}
      </dl>

      <button type="button" className={styles.ask} onClick={() => onAsk(codex.question)}>
        <span aria-hidden="true">▸</span> ask the buddy about {codex.title}
      </button>

      <footer className={styles.footer}>
        <span className={styles.source}>source: redcap_portfolio.json</span>
        <span className={styles.fresh} data-status={codex.freshnessStatus}>
          fresh: {codex.freshness}
        </span>
      </footer>
    </div>
  );
}
