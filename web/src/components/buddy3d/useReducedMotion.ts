/**
 * Whether the buddy should hold still.
 *
 * Two independent sources, either of which wins: the OS-level
 * `prefers-reduced-motion` setting, and a `?motion=off` query parameter that
 * exists so a demo, a recording, or anyone who needs it can force the static
 * path without changing a system setting.
 *
 * Reduced motion does not mean "no eye contact". Tracking the cursor with the
 * eyes is not vestibular motion and it is what keeps the surface feeling
 * answerable, so the gaze stays live and everything else stops.
 */
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function motionForcedOff(search: string = typeof window === "undefined" ? "" : window.location.search): boolean {
  const value = new URLSearchParams(search).get("motion");
  return value === "off" || value === "0" || value === "false";
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    if (motionForcedOff()) return true;
    return window.matchMedia?.(QUERY).matches ?? false;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (motionForcedOff()) {
      setReduced(true);
      return;
    }
    const mq = window.matchMedia(QUERY);
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return reduced;
}
