import type { Stage } from "@/api/schemas";

interface Props {
  stages: Stage[];
  selected: string;
  onSelect: (id: string) => void;
  syncing?: boolean;
  /** Increment to retrigger animation timing (force-sync). */
  syncTick?: number;
}

/**
 * Reusable animated DAG. Six stages from the production pipeline drive the
 * geometry; traveling dots run only when an edge has `inflight > 0`. Clinical
 * stages map to the NANO Study processing chain (Actiheart-5 ingest →
 * R-peak detection → SQI-gated QA → HRV/RSA features → HDA labeling →
 * de-identified export).
 */
const NODE_ACCENT: Record<string, "sand" | "ocean" | "sage" | "mint"> = {
  intake: "sand",
  ingest: "ocean",
  preprocess: "ocean",
  qa: "sage",
  hrv: "sage",
  hda: "sage",
  deid: "mint",
  merge: "mint",
};

const ACCENT_BG: Record<"sand" | "ocean" | "sage" | "mint", string> = {
  sand:  "var(--sand-tint)",
  ocean: "var(--ocean-tint)",
  sage:  "var(--sage-tint)",
  mint:  "var(--mint-tint)",
};

const ACCENT_RING: Record<"sand" | "ocean" | "sage" | "mint", string> = {
  sand:  "var(--sand-ring)",
  ocean: "var(--ocean-ring)",
  sage:  "var(--sage-ring)",
  mint:  "var(--mint-ring)",
};

const W = 1100;
const H = 280;

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

export function AnimatedDAG({ stages, selected, onSelect, syncing = false, syncTick = 0 }: Props) {
  if (!stages.length) {
    return <div className="rounded-2xl border border-[color:var(--warm-border)] bg-white p-8 text-[color:var(--warm-fg3)]">No pipeline stages.</div>;
  }
  const padX = 70;
  const colW = stages.length > 1 ? (W - padX * 2) / (stages.length - 1) : 0;
  const cy = 150;
  const nodes = stages.map((s, i) => {
    const accent = NODE_ACCENT[s.id] ?? "ocean";
    return { ...s, x: padX + i * colW, y: cy, accent };
  });
  const totalInflight = stages.reduce((acc, s) => acc + s.inflight, 0);
  const dur = syncing ? 0.7 : 1.6;
  // syncTick used to vary keys so animateMotion restarts on force-sync
  const keySalt = syncTick;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[color:var(--warm-border)] shadow-card px-6 pt-6 pb-3" style={{ background: "linear-gradient(180deg, #ffffff 0%, var(--warm-bg) 100%)" }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(28,26,24,0.04) 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
        aria-hidden
      />
      <div className="relative flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-garnet animate-breathe" aria-hidden />
            <span className="text-[11px] font-mono text-[color:var(--warm-fg2)] tracking-[0.02em]">
              {syncing ? "force-sync · pulses accelerated" : `${totalInflight} epochs in flight`}
            </span>
          </div>
          <span className="w-px h-3 bg-[color:var(--warm-fg5)]" />
          <span className="text-[11px] font-mono text-[color:var(--warm-fg3)]">
            {stages.length} stages · live
          </span>
        </div>
        <div className="text-[11px] font-mono text-[color:var(--warm-fg4)]">
          tip · click any stage for detail
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="relative w-full block" role="img" aria-label="NANO pipeline DAG">
        <defs>
          <filter id="esd-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="dot-glow">
            <stop offset="0%"   stopColor="var(--usc-garnet)" stopOpacity="1" />
            <stop offset="60%"  stopColor="var(--usc-garnet)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--usc-garnet)" stopOpacity="0" />
          </radialGradient>
          {nodes.slice(0, -1).map((n, i) => {
            const next = nodes[i + 1]!;
            return (
              <path
                key={`pdef-${i}-${keySalt}`}
                id={`esd-edge-${i}-${keySalt}`}
                d={curve(n.x + 38, n.y, next.x - 38, next.y)}
              />
            );
          })}
        </defs>

        {nodes.slice(0, -1).map((n, i) => {
          const next = nodes[i + 1]!;
          const flowing = n.inflight > 0 || next.inflight > 0;
          return (
            <g key={`edge-${i}`}>
              <path d={curve(n.x + 38, n.y, next.x - 38, next.y)} fill="none" stroke="#e6e4e0" strokeWidth={5} strokeLinecap="round" />
              {flowing && (
                <path
                  d={curve(n.x + 38, n.y, next.x - 38, next.y)}
                  fill="none"
                  stroke="rgba(115,0,10,0.25)"
                  strokeWidth={1.5}
                  strokeDasharray="3 5"
                  strokeLinecap="round"
                />
              )}
              <text
                x={(n.x + next.x) / 2}
                y={n.y - 18}
                textAnchor="middle"
                style={{
                  fontSize: 10,
                  fontFamily: "JetBrains Mono, monospace",
                  fill: flowing ? "var(--usc-garnet)" : "var(--warm-fg4)",
                  fontWeight: 600,
                }}
              >
                {n.inflight} ↦
              </text>
            </g>
          );
        })}

        {nodes.slice(0, -1).map((n, i) => {
          const next = nodes[i + 1]!;
          const flowing = n.inflight > 0 || next.inflight > 0;
          if (!flowing) return null;
          return (
            <g key={`dots-${i}-${keySalt}`}>
              {[0, 0.33, 0.66].map((delay, j) => (
                <g key={j}>
                  <circle r={6} fill="url(#dot-glow)" opacity={0.55}>
                    <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${delay * dur}s`}>
                      <mpath href={`#esd-edge-${i}-${keySalt}`} />
                    </animateMotion>
                  </circle>
                  <circle r={2.5} fill="var(--usc-garnet)" filter="url(#esd-glow)">
                    <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${delay * dur}s`}>
                      <mpath href={`#esd-edge-${i}-${keySalt}`} />
                    </animateMotion>
                  </circle>
                </g>
              ))}
            </g>
          );
        })}

        {nodes.map((n) => {
          const isActive = n.inflight > 0;
          const isSel = selected === n.id;
          return (
            <g
              key={n.id}
              onClick={() => onSelect(n.id)}
              tabIndex={0}
              role="button"
              aria-label={`${n.label} stage, ${n.inflight} in flight, ${n.done.toLocaleString()} done`}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(n.id); }}
              style={{ cursor: "pointer" }}
            >
              {isActive && (
                <circle cx={n.x} cy={n.y} r={42} fill="none" stroke={ACCENT_RING[n.accent]} strokeWidth={1.5} opacity={0.5}>
                  <animate attributeName="r" values="36;48;36" dur={syncing ? "1s" : "2.4s"} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0;0.5" dur={syncing ? "1s" : "2.4s"} repeatCount="indefinite" />
                </circle>
              )}
              <circle
                cx={n.x}
                cy={n.y}
                r={36}
                fill={ACCENT_BG[n.accent]}
                stroke={isSel ? "var(--usc-garnet)" : ACCENT_RING[n.accent]}
                strokeWidth={isSel ? 2 : 1.2}
              />
              <text
                x={n.x}
                y={n.y + 2}
                textAnchor="middle"
                style={{
                  fontFamily: "Source Serif 4, serif",
                  fontSize: 24,
                  fontWeight: 600,
                  fill: "var(--warm-fg1)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {n.inflight}
              </text>
              <text
                x={n.x}
                y={n.y + 16}
                textAnchor="middle"
                style={{
                  fontSize: 9,
                  fontFamily: "JetBrains Mono, monospace",
                  fill: "var(--warm-fg3)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                in flight
              </text>
              <text
                x={n.x}
                y={n.y + 60}
                textAnchor="middle"
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  fill: "var(--warm-fg1)",
                  fontFamily: "Inter, sans-serif",
                }}
              >
                {n.label}
              </text>
              <text
                x={n.x}
                y={n.y + 76}
                textAnchor="middle"
                style={{
                  fontSize: 10,
                  fontFamily: "JetBrains Mono, monospace",
                  fill: "var(--warm-fg4)",
                }}
              >
                {n.short}
              </text>
              <text
                x={n.x}
                y={n.y - 50}
                textAnchor="middle"
                style={{
                  fontSize: 10,
                  fontFamily: "JetBrains Mono, monospace",
                  fill: "var(--warm-fg4)",
                }}
              >
                {n.done.toLocaleString()} done
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
