/**
 * Hover intent with asymmetric delays.
 *
 * Opening is delayed 120 ms so sweeping the pointer across the glyph row does
 * not strobe five cards. Closing is delayed 320 ms — much longer — so the
 * pointer has time to travel off the glyph and into the card it just opened
 * without the card vanishing underneath it.
 *
 * Keyboard focus routes through the same delays, so a Tab user gets the same
 * card at the same moment as a mouse user.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const HOVER_IN_MS = 120;
export const HOVER_OUT_MS = 320;

export interface HoverIntent<T> {
  /** Currently open key, whether from hover or from a pin. */
  active: T | null;
  pinned: T | null;
  enter: (key: T) => void;
  leave: () => void;
  /** Click: pin if unpinned, unpin if already pinned on the same key. */
  toggle: (key: T) => void;
  dismiss: () => void;
}

export function useHoverIntent<T>(): HoverIntent<T> {
  const [hovered, setHovered] = useState<T | null>(null);
  const [pinned, setPinned] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clear = useCallback(() => {
    if (timer.current !== undefined) {
      globalThis.clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const enter = useCallback(
    (key: T) => {
      clear();
      timer.current = globalThis.setTimeout(() => setHovered(key), HOVER_IN_MS);
    },
    [clear],
  );

  const leave = useCallback(() => {
    clear();
    timer.current = globalThis.setTimeout(() => setHovered(null), HOVER_OUT_MS);
  }, [clear]);

  const toggle = useCallback((key: T) => {
    setPinned((current) => (current === key ? null : key));
    setHovered(key);
  }, []);

  const dismiss = useCallback(() => {
    clear();
    setPinned(null);
    setHovered(null);
  }, [clear]);

  // A pin outranks a hover: the buddy and the card both stay with the topic
  // until the reader explicitly lets go of it.
  return { active: pinned ?? hovered, pinned, enter, leave, toggle, dismiss };
}
