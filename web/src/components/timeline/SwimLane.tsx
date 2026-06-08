import type { TimelineEvent } from "./EventMark";
import { EventMark } from "./EventMark";

interface SwimLaneProps {
  id: string;
  group: string;
  qa: string;
  y: number;
  width: number;
  events: TimelineEvent[];
  x: (month: number) => number;
  selectedEventId?: string;
  onSelectEvent: (event: TimelineEvent) => void;
  onSelectRow: () => void;
}

export function SwimLane({
  id,
  group,
  qa,
  y,
  width,
  events,
  x,
  selectedEventId,
  onSelectEvent,
  onSelectRow,
}: SwimLaneProps) {
  return (
    <g
      tabIndex={0}
      role="button"
      aria-label={`${id}, ${group}, QA ${qa}, ${events.length} timeline events`}
      onClick={onSelectRow}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectRow();
        }
      }}
      style={{ cursor: "pointer" }}
    >
      <rect x={0} y={y - 17} width={width} height={34} rx={6} fill="var(--bg-surface)" opacity={0.001} />
      <text x={0} y={y + 4} className="t-mono" style={{ fontSize: 11, fill: "var(--ink)", fontWeight: 700 }}>{id}</text>
      <text x={96} y={y + 4} className="t-mono" style={{ fontSize: 10, fill: "var(--slate-500)" }}>{group} · {qa}</text>
      <line x1={170} x2={width} y1={y} y2={y} stroke="var(--slate-100)" />
      {events.map((event, index) => (
        <EventMark
          key={event.id}
          event={event}
          x={x(event.month)}
          y={y}
          selected={selectedEventId === event.id}
          onSelect={() => onSelectEvent(event)}
          onNavigate={(direction) => {
            const nextIndex = direction === "next" ? index + 1 : index - 1;
            const next = events[nextIndex];
            if (next) onSelectEvent(next);
          }}
        />
      ))}
    </g>
  );
}
