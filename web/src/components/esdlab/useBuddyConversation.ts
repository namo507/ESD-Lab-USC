/**
 * The ask → answer loop, and the buddy states it drives.
 *
 * Answers come from `/api/buddy`, which is the tier that already carries the
 * deterministic grounding path and the PHI guards. That matters here: when
 * every model is down that endpoint still answers from lookups, so the buddy
 * keeps talking and the surface stays useful. A refusal comes back flagged and
 * turns the buddy `concerned` rather than being rendered as an ordinary answer.
 *
 * The answer is revealed a word at a time. That is a presentation choice, not a
 * simulated stream — the reveal cadence is what feeds the mouth driver, and
 * pacing it to reading speed is what lets the mouth move in time with text the
 * reader is actually reading.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { askNanoBuddy, type NanoBuddyCitation } from "@/api/nanoBuddyApi";
import { SpeechDriver } from "@/components/buddy3d/speech";
import { useBuddy, type BuddyState } from "@/components/buddy3d/buddyState";

/** Words per minute the reveal is paced to. Comfortable reading speed. */
const REVEAL_WPM = 320;

export interface BuddyTurn {
  question: string;
  answer: string;
  citations: NanoBuddyCitation[];
  refused: boolean;
  /** Whether the answer contains a figure worth materializing in the scene. */
  hasNumber: boolean;
}

const NUMBER_RE = /\d/;

export function useBuddyConversation() {
  const setState = useBuddy((s) => s.setState);
  const state = useBuddy((s) => s.state);

  const [turn, setTurn] = useState<BuddyTurn | null>(null);
  /** Progressive reveal of `turn.answer`; this is what the DOM shows. */
  const [revealed, setRevealed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const driver = useRef(new SpeechDriver());
  const [openness, setOpenness] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (revealTimer.current !== undefined) globalThis.clearTimeout(revealTimer.current);
    },
    [],
  );

  /* Sample the mouth every frame while speaking, and let it fall shut on its
     own when the tokens stop. */
  useEffect(() => {
    if (state !== "speaking") {
      setOpenness(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      setOpenness(driver.current.sample().openness);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  const ask = useCallback(
    async (question: string) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;

      setBusy(true);
      setError(null);
      setRevealed("");
      driver.current.reset();
      setState("thinking");

      try {
        const response = await askNanoBuddy(question, controller.signal);
        if (controller.signal.aborted) return;

        const next: BuddyTurn = {
          question,
          answer: response.answer,
          citations: response.citations,
          refused: response.refused,
          hasNumber: NUMBER_RE.test(response.answer),
        };
        setTurn(next);

        if (next.refused) {
          // A refusal is not an error and not an ordinary answer. It gets its
          // own posture so the reason is legible before the text is read.
          setRevealed(next.answer);
          setState("concerned");
          setBusy(false);
          return;
        }

        setState("speaking");
        const words = next.answer.split(/(\s+)/);
        const perWord = 60_000 / REVEAL_WPM;
        let index = 0;

        const step = () => {
          if (controller.signal.aborted) return;
          const token = words[index];
          if (token === undefined) {
            // Answers carrying a figure end in `presenting`, facing the object
            // the scene materialized; plain prose settles back to idle.
            setState(next.hasNumber || next.citations.length > 0 ? "presenting" : "idle");
            setBusy(false);
            return;
          }
          if (token.trim()) driver.current.push(token);
          setRevealed((current) => current + token);
          index += 1;
          revealTimer.current = globalThis.setTimeout(step, token.trim() ? perWord : perWord * 0.2);
        };
        step();
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "ESD Buddy is unavailable.");
        setState("concerned");
        setBusy(false);
      }
    },
    [setState],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    if (revealTimer.current !== undefined) globalThis.clearTimeout(revealTimer.current);
    driver.current.reset();
    setTurn(null);
    setRevealed("");
    setError(null);
    setBusy(false);
    setState("idle");
  }, [setState]);

  return { ask, reset, turn, revealed, error, busy, openness, state: state as BuddyState };
}
