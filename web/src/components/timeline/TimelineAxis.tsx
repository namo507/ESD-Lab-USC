export const CGA_MONTHS = [0, 1, 2, 3, 6, 9, 12, 24, 36] as const;

interface TimelineAxisProps {
  x: (month: number) => number;
  y: number;
  width: number;
}

export function TimelineAxis({ x, y, width }: TimelineAxisProps) {
  return (
    <g aria-hidden>
      <line x1={0} x2={width} y1={y} y2={y} stroke="var(--border-strong)" />
      {CGA_MONTHS.map((month) => (
        <g key={month}>
          <line x1={x(month)} x2={x(month)} y1={y - 4} y2={y + 4} stroke="var(--slate-400)" />
          <text x={x(month)} y={y + 20} textAnchor="middle" className="t-mono" style={{ fontSize: 10, fill: "var(--slate-500)" }}>
            {month}
          </text>
        </g>
      ))}
      <text x={width} y={y + 36} textAnchor="end" className="t-mono" style={{ fontSize: 10, fill: "var(--slate-500)" }}>
        CGA months
      </text>
    </g>
  );
}
