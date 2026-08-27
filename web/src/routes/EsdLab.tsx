/**
 * `/esd-lab` — the front door.
 *
 * The design rule this route exists to hold: **at rest it shows no numbers.**
 * A buddy, five study glyphs, one word of status. Everything else — every
 * count, every chart, every one of the operator routes — is still here and
 * still reachable, but it arrives because someone asked for it rather than
 * because the page decided to show it.
 *
 * Read that as a game HUD rather than a dashboard. The disclosure ladder runs
 * resting → hover → pinned → asked → drilled, and each rung should feel like
 * the surface was built to stop there.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useRedcapPortfolio } from "@/api/redcapPortfolio";
import { BuddyScene } from "@/components/buddy3d/BuddyScene";
import type { Vec2 } from "@/components/buddy3d/gaze";
import { CodexCard } from "@/components/esdlab/CodexCard";
import { StudyGlyph } from "@/components/esdlab/StudyGlyph";
import { ambientStatus, buildStudyCodex } from "@/components/esdlab/studyCodex";
import { useBuddyConversation } from "@/components/esdlab/useBuddyConversation";
import { useHoverIntent } from "@/components/esdlab/useHoverIntent";
import { GLYPH_ORDER, studyProfile, type StudyKey } from "@/data/studyProfiles";
import styles from "./EsdLab.module.css";

const CODEX_ID = "esd-lab-codex";

/**
 * A clock that ticks on an interval.
 *
 * Only as precise as it needs to be: the freshness label is rendered in minutes,
 * so a 30-second tick keeps it truthful without re-rendering the scene for no
 * reason.
 */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), intervalMs);
    return () => globalThis.clearInterval(timer);
  }, [intervalMs]);
  return now;
}


export function EsdLab() {
  const portfolio = useRedcapPortfolio();
  const intent = useHoverIntent<StudyKey>();
  const conversation = useBuddyConversation();

  const stage = useRef<HTMLDivElement>(null);
  const glyphRefs = useRef(new Map<StudyKey, HTMLButtonElement>());
  const [anchor, setAnchor] = useState<Vec2 | null>(null);
  const [question, setQuestion] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Freshness is relative to *now*, so it has to be recomputed as time passes.
  // Memoising on the query alone froze "just now" on screen until the next
  // refetch, which is a stale reading of a live artifact -- exactly the thing
  // the ambient line exists to report honestly.
  const now = useNow(30_000);

  const status = useMemo(() => ambientStatus(portfolio.data, now), [portfolio.data, now]);

  const codex = useMemo(
    () => (intent.active ? buildStudyCodex(intent.active, portfolio.data, now) : null),
    [intent.active, portfolio.data, now],
  );

  /* Translate the active glyph's screen position into scene space so the buddy
     turns toward whatever the pointer is actually over. It reacts before the
     card opens, which is what makes the card feel like a consequence of the
     look rather than of the pointer. */
  useEffect(() => {
    if (!intent.active) {
      setAnchor(null);
      return;
    }
    const el = glyphRefs.current.get(intent.active);
    const host = stage.current;
    if (!el || !host) return;
    const a = el.getBoundingClientRect();
    const b = host.getBoundingClientRect();
    if (!b.width || !b.height) return;
    setAnchor({
      x: ((a.left + a.width / 2 - b.left) / b.width) * 2 - 1,
      y: -(((a.top + a.height / 2 - b.top) / b.height) * 2 - 1),
    });
  }, [intent.active]);

  /* `/` focuses the question field, Esc lets go of whatever is held. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      } else if (event.key === "Escape") {
        if (conversation.turn) conversation.reset();
        else intent.dismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [conversation, intent]);

  const onAsk = useCallback(
    (seed: string) => {
      setQuestion(seed);
      void conversation.ask(seed);
    },
    [conversation],
  );

  const busyActivity = conversation.busy ? 1 : status.word === "live" ? 0.15 : 0;

  return (
    <main className={styles.page}>
      <header className={styles.lockup}>
        {/* Lab mark left of the university mark, at equal height. The order is
            fixed by the design system and is not a layout preference. */}
        <span className={styles.labMark}>
          <span className={styles.labMarkName}>ESD Lab</span>
          <span className={styles.labMarkSub}>Early Social Development</span>
        </span>
        <span className={styles.markRule} aria-hidden="true" />
        <span className={styles.uscMark}>University of South Carolina</span>
      </header>

      <div className={styles.stage} ref={stage}>
        <div className={styles.buddy}>
          <BuddyScene
            state={conversation.state}
            openness={conversation.openness}
            pinnedAnchor={intent.pinned ? anchor : null}
            hoveredAnchor={intent.pinned ? null : anchor}
            activity={busyActivity}
            describedBy={`Buddy is ${conversation.state}.${
              intent.active ? ` Showing ${studyProfile(intent.active).label}.` : ""
            }`}
          />
        </div>

        {/* Five glyphs, names only. The counts live in the codex card. */}
        <nav className={styles.glyphs} aria-label="Studies">
          {GLYPH_ORDER.map((key) => {
            const profile = studyProfile(key);
            return (
              <StudyGlyph
                key={key}
                ref={(node) => {
                  if (node) glyphRefs.current.set(key, node);
                  else glyphRefs.current.delete(key);
                }}
                label={profile.label}
                publicName={profile.publicName}
                active={intent.active === key}
                pinned={intent.pinned === key}
                dimmed={profile.status === "closed"}
                describedBy={CODEX_ID}
                onEnter={() => intent.enter(key)}
                onLeave={intent.leave}
                onToggle={() => intent.toggle(key)}
              />
            );
          })}
        </nav>

        {codex && (
          <div
            className={styles.codexSlot}
            onPointerEnter={() => intent.active && intent.enter(intent.active)}
            onPointerLeave={intent.leave}
          >
            <CodexCard
              id={CODEX_ID}
              codex={codex}
              pinned={intent.pinned === codex.key}
              onAsk={onAsk}
              onDismiss={intent.dismiss}
            />
          </div>
        )}
      </div>

      {/* One ambient line. The timestamp exists but waits to be asked for. */}
      <p className={styles.ambient} title={status.detail}>
        <span className={styles.dot} data-status={status.word} aria-hidden="true" />
        <span className={styles.ambientWord}>{status.word}</span>
        <span className={styles.ambientDetail}>{status.detail}</span>
      </p>

      <form
        className={styles.askBar}
        onSubmit={(event) => {
          event.preventDefault();
          if (question.trim()) void conversation.ask(question.trim());
        }}
      >
        <input
          ref={inputRef}
          className={styles.askInput}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about the studies…  ( / )"
          aria-label="Ask the buddy about the studies"
          onFocus={() => conversation.state === "idle" && undefined}
        />
        <button className={styles.askSubmit} type="submit" disabled={conversation.busy}>
          {conversation.busy ? "thinking" : "ask"}
        </button>
      </form>

      {/* Every word the buddy says is selectable text. The canvas is decorative;
          this is the content. */}
      {(conversation.revealed || conversation.error) && (
        <section className={styles.answer} aria-live="polite">
          {conversation.error ? (
            <p className={styles.answerError}>{conversation.error}</p>
          ) : (
            <>
              <p className={styles.answerText} data-refused={conversation.turn?.refused ? "true" : "false"}>
                {conversation.revealed}
              </p>
              {conversation.turn && conversation.turn.citations.length > 0 && (
                <ul className={styles.citations}>
                  {conversation.turn.citations.map((citation) => (
                    <li key={`${citation.path}-${citation.loc}`}>
                      <span className={styles.citationTitle}>{citation.title}</span>
                      <span className={styles.citationPath}>
                        {citation.path}
                        {citation.loc ? ` · ${citation.loc}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <button type="button" className={styles.answerClose} onClick={conversation.reset}>
            dismiss
          </button>
        </section>
      )}

      {/* Level 4. The operator console did not go anywhere; it stopped being the
          first thing anyone sees. */}
      <footer className={styles.drilldown}>
        <Link to="/participants">Operator console</Link>
        <Link to="/redcap-portfolio">REDCap portfolio</Link>
        <Link to="/pipeline-health">Pipeline health</Link>
        <Link to="/docs">Documentation</Link>
      </footer>
    </main>
  );
}
