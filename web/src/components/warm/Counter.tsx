import { useEffect, useRef, useState } from "react";

interface CounterProps {
  to: number;
  decimals?: number;
  duration?: number;
  /** Increment to retrigger animation (e.g., a sync-tick from Zustand). */
  trigger?: number;
  formatter?: (v: number) => string;
}

/**
 * Cubic-eased number counter. Mounts and replay triggers animate 0 -> target.
 * Reduced-motion users see the final value immediately.
 */
export function Counter({ to, decimals = 0, duration = 1200, trigger = 0, formatter }: CounterProps) {
  const [val, setVal] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVal(to);
      return;
    }

    fromRef.current = 0;
    startRef.current = null;
    let raf = 0;
    function step(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(fromRef.current + (to - fromRef.current) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else setVal(to);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [trigger, to, duration]);

  const display = formatter
    ? formatter(val)
    : val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{display}</span>;
}
