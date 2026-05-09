import { useEffect, useState } from "react";

export type InsightKind = "alert" | "warn" | "info" | "ok";

export interface Insight {
  kind: InsightKind;
  text: string;
}

interface Props {
  items: Insight[];
  /** Characters per tick. */
  speed?: number;
  /** Replay from item 0 when this changes. */
  resetTick?: number;
}

const KIND_META: Record<InsightKind, { color: string }> = {
  alert: { color: "#ff8a7c" },
  warn:  { color: "var(--usc-gold)" },
  info:  { color: "var(--ocean-ring)" },
  ok:    { color: "var(--mint-ring)" },
};

/**
 * Typewriter for the dark `AgenticQAPanel`. Reads a queue of insights and
 * renders them line-by-line with a blinking cursor. Caller passes either
 * the LM Studio stream output (one big chunk) or the static fallback queue.
 */
export function Typewriter({ items, speed = 18, resetTick = 0 }: Props) {
  const [shown, setShown] = useState(0);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    setShown(0);
    setChars(0);
  }, [resetTick]);

  useEffect(() => {
    if (!items.length) return;
    if (shown >= items.length) {
      const t = setTimeout(() => { setShown(0); setChars(0); }, 4500);
      return () => clearTimeout(t);
    }
    const item = items[shown]!;
    if (chars < item.text.length) {
      const t = setTimeout(() => setChars((c) => c + 1), speed);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => { setShown((s) => s + 1); setChars(0); }, 1400);
    return () => clearTimeout(t);
  }, [shown, chars, items, speed]);

  if (!items.length) return null;

  const cursor = (
    <span
      className="inline-block align-text-bottom ml-[1px] animate-blink"
      style={{ width: 8, height: 14, background: "var(--usc-gold)" }}
      aria-hidden
    />
  );

  return (
    <div className="font-mono text-[12.5px] leading-[1.7] text-[color:#cfcdc9]" role="log" aria-live="polite">
      {items.slice(0, shown).map((it, i) => {
        const k = KIND_META[it.kind];
        return (
          <div key={i} className="flex gap-2.5 mb-2 opacity-70">
            <span className="flex-shrink-0" style={{ color: k.color }}>&gt;</span>
            <span>
              <span className="mr-1.5" style={{ color: k.color }}>[{it.kind}]</span>
              {it.text}
            </span>
          </div>
        );
      })}
      {shown < items.length && (
        <div className="flex gap-2.5 mb-2">
          <span className="flex-shrink-0" style={{ color: KIND_META[items[shown]!.kind].color }}>&gt;</span>
          <span>
            <span className="mr-1.5" style={{ color: KIND_META[items[shown]!.kind].color }}>[{items[shown]!.kind}]</span>
            {items[shown]!.text.slice(0, chars)}
            {cursor}
          </span>
        </div>
      )}
    </div>
  );
}
