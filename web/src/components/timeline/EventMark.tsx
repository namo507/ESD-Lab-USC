export type TimelineEventType = "visit" | "qa" | "run" | "failed" | "redcap";

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  month: number;
  label: string;
  date: string;
  cga: number;
  status: string;
}

const EVENT_STYLE: Record<TimelineEventType, { color: string; glyph: string }> = {
  visit: { color: "var(--green)", glyph: "completed visit" },
  qa: { color: "var(--usc-gold)", glyph: "QA flag" },
  run: { color: "var(--blue)", glyph: "pipeline run" },
  failed: { color: "var(--red)", glyph: "failed or withdrawn" },
  redcap: { color: "var(--slate-500)", glyph: "REDCap milestone" },
};

interface EventMarkProps {
  event: TimelineEvent;
  x: number;
  y: number;
  selected?: boolean;
  onSelect: () => void;
  onNavigate?: (direction: "prev" | "next") => void;
}

export function EventMark({ event, x, y, selected, onSelect, onNavigate }: EventMarkProps) {
  const style = EVENT_STYLE[event.type];
  const common = {
    fill: event.type === "qa" ? "var(--bg-surface)" : style.color,
    stroke: style.color,
    strokeWidth: selected ? 2.5 : 1.6,
  };

  return (
    <g
      transform={`translate(${x} ${y})`}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={`${event.label}: ${style.glyph}, ${event.date}, ${event.cga} months CGA, ${event.status}`}
      onClick={onSelect}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault();
          onSelect();
        }
        if (keyboardEvent.key === "ArrowLeft") {
          keyboardEvent.preventDefault();
          onNavigate?.("prev");
        }
        if (keyboardEvent.key === "ArrowRight") {
          keyboardEvent.preventDefault();
          onNavigate?.("next");
        }
      }}
      style={{ cursor: "pointer", outlineColor: "var(--usc-garnet)" }}
    >
      <title>{`${event.label} · ${event.date} · ${event.status}`}</title>
      {event.type === "visit" && <polygon points="0,-7 7,0 0,7 -7,0" {...common} />}
      {event.type === "qa" && <polygon points="0,-8 8,7 -8,7" {...common} />}
      {event.type === "run" && <rect x={-6} y={-6} width={12} height={12} rx={1.5} {...common} />}
      {event.type === "failed" && (
        <g stroke={style.color} strokeWidth={selected ? 2.6 : 2} strokeLinecap="round">
          <line x1={-6} x2={6} y1={-6} y2={6} />
          <line x1={6} x2={-6} y1={-6} y2={6} />
        </g>
      )}
      {event.type === "redcap" && <circle r={6} {...common} />}
    </g>
  );
}
