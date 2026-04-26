import { useEffect, useState } from "react";
import { logAudit } from "@/lib/audit";

const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 min HIPAA gate

/**
 * Tracks user idle time. Returns whole minutes remaining until auto-lock.
 * Calls `onLock` when the limit hits 0.
 *
 * Real auth lock is server-enforced; this is the visible countdown only.
 */
export function useIdleTimer(onLock: () => void): number {
  const [last, setLast] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const events = ["mousemove", "keydown", "wheel", "click", "scroll"] as const;
    function bump() {
      setLast(Date.now());
    }
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, bump));
      window.clearInterval(interval);
    };
  }, []);

  const elapsed = now - last;
  const remaining = Math.max(0, IDLE_LIMIT_MS - elapsed);

  useEffect(() => {
    if (remaining === 0) {
      void logAudit({ action: "auth.timeout" });
      onLock();
    }
  }, [remaining, onLock]);

  return Math.ceil(remaining / 60_000);
}
