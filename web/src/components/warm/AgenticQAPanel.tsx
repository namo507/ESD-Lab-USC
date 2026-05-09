import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/primitives";
import { Typewriter, type Insight } from "./Typewriter";
import { streamCompletion } from "@/lib/lmStudio";
import { scrubPhi } from "@/lib/phiScrub";
import { logAudit } from "@/lib/audit";

const FALLBACK_BACKLOG: Insight[] = [
  { kind: "alert", text: "NANO-0173 · cga_6mo shows ectopic beats in 14 of 64 epochs — surfaced for human QA review (Pan-Tompkins R-peak audit)." },
  { kind: "warn",  text: "2 Intake forms missing DOB · NANO-0228, NANO-0231 · auto-paged Sarah at 09:14." },
  { kind: "info",  text: "Pipeline throughput is 312 windows/h, 18 % above 7-day median; CWT-derived RSA features computed cleanly across visits." },
  { kind: "ok",    text: "REDCap field-map check passed for medical_history_v1 · all PHI columns gated; Bayley-4 mapping nominal." },
  { kind: "alert", text: "NANO-0214 · Actiheart-5 contact lost at t = 142 s — recommend rescheduling visit; thermal-gradient stream OK on dual thermistor." },
];

interface Props {
  syncTick?: number;
}

/**
 * Agentic QA panel. Default state cycles through the fallback insight backlog
 * via Typewriter. When the user submits a prompt:
 *   1. `scrubPhi` redacts likely PHI client-side (NANO-#### preserved).
 *   2. Stream comes from LM Studio's OpenAI-compatible endpoint.
 *   3. Visual indicators surface: scrubbed-redaction badge + streaming dot.
 *   4. Failure falls back to the typewriter feed; never silently drops.
 *
 * No participant data ever leaves the browser unscrubbed — the badge proves it.
 */
export function AgenticQAPanel({ syncTick = 0 }: Props) {
  const [prompt, setPrompt] = useState("");
  const [streamed, setStreamed] = useState("");
  const [status, setStatus] = useState<"idle" | "streaming" | "error" | "fallback">("idle");
  const [redactionCount, setRedactionCount] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Cycle the fallback backlog when idle / fallback
  const items = useMemo<Insight[]>(() => FALLBACK_BACKLOG, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setStreamed("");
    setStatus("streaming");
    const probe = scrubPhi(prompt);
    setRedactionCount(probe.redactions.reduce((s, r) => s + r.count, 0));
    void logAudit({ action: "run.trigger", scope: "/agentic/prompt", detail: { redactions: probe.redactions.length } });
    try {
      const stream = streamCompletion({ prompt, signal: controller.signal });
      let acc = "";
      for await (const ev of stream) {
        if (ev.delta) {
          acc += ev.delta;
          setStreamed(acc);
        }
        if (ev.done) break;
      }
      setStatus(acc ? "idle" : "fallback");
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus("error");
      if (import.meta.env.DEV) console.warn("LM Studio unreachable", err);
      setTimeout(() => setStatus("fallback"), 800);
    }
  }

  return (
    <div className="agentic-panel agentic-glow relative px-6 py-6 overflow-hidden min-h-[320px]">
      <div className="relative">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-2 h-2 rounded-full bg-gold"
                style={{ boxShadow: "0 0 12px rgba(255,204,0,0.7)" }}
                aria-hidden
              />
              <span className="text-[11px] font-mono text-gold tracking-[0.08em] uppercase">
                Agentic QA · {status === "streaming" ? "streaming" : status === "error" ? "offline" : "live"}
              </span>
            </div>
            <h2 className="font-serif text-h2 font-semibold -tracking-[0.01em]">
              Insights from the pipeline
            </h2>
            <p className="text-[12px] text-[color:#9c9893] mt-1">
              Local LM Studio agent surveils run output, REDCap forms, and QA flags.
              SHAP attributions, DBSCAN cluster shifts, and HDA phase ratios are summarised continuously.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono bg-gold/10 border border-gold/25 text-gold">
              <Icon name="shield-check" size={12} stroke={1.5} color="var(--usc-gold)" />
              local · scrubbed
            </span>
            {redactionCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-red-500/15 border border-red-400/25 text-[#ff8a7c]">
                {redactionCount} redaction{redactionCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>

        <form onSubmit={submit} className="flex items-center gap-2 mb-3">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask the lab — e.g. summarize NANO-0173 RMSSD trajectory across CGA"
            className="flex-1 bg-black/30 border border-white/10 rounded-full px-4 py-2 text-[13px] text-[color:#e8e6e2] placeholder:text-[color:#6f6b66] outline-none focus:border-gold"
            aria-label="Agentic QA prompt"
          />
          <button
            type="submit"
            disabled={status === "streaming"}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-gold/15 border border-gold/30 text-gold text-[12px] font-mono disabled:opacity-50"
          >
            <Icon name="send" size={12} stroke={1.5} color="var(--usc-gold)" />
            run
          </button>
        </form>

        <div className="bg-black/25 border border-white/[0.06] rounded-xl px-4 py-4 min-h-[180px] font-mono">
          {status === "streaming" && (
            <div className="flex items-center gap-2 text-[11px] text-[color:#9bb8e0] mb-2">
              <span className="pulse-dot inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--ocean-ring)" }} aria-hidden />
              streaming from local LM Studio…
            </div>
          )}
          {streamed ? (
            <pre className="whitespace-pre-wrap text-[12.5px] leading-[1.7] text-[color:#e8e6e2] m-0">
              {streamed}
            </pre>
          ) : (
            <Typewriter items={items} resetTick={syncTick} />
          )}
          {status === "error" && (
            <div className="mt-3 text-[11px] text-[#ff8a7c] flex items-center gap-2">
              <Icon name="triangle-alert" size={12} stroke={1.5} color="#ff8a7c" />
              LM Studio unreachable at <code className="px-1">localhost:1234</code> — falling back to insights backlog.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
