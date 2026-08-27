import styles from "./DonutChart.module.css";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  className?: string;
  ariaLabel?: string;
}

export function DonutChart({
  segments,
  size = 152,
  strokeWidth = 22,
  className = "",
  ariaLabel,
}: DonutChartProps) {
  const total = Math.max(segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0), 1);
  const normalized = segments.map((segment) => ({
    ...segment,
    share: (Math.max(segment.value, 0) / total) * 100,
  }));
  const label =
    ariaLabel ??
    normalized.map((segment) => `${segment.label} ${segment.share.toFixed(1)} percent`).join(", ");

  let cursor = 0;

  return (
    <svg
      className={`${styles.chart} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <circle className={styles.track} cx="60" cy="60" r="44" pathLength="100" strokeWidth={strokeWidth} />
      <g transform="rotate(-90 60 60)">
        {normalized.map((segment, index) => {
          const start = cursor;
          cursor += segment.share;
          const visibleShare = Math.max(segment.share - 1.35, 0);
          return (
            <circle
              key={segment.label}
              className={styles.segment}
              cx="60"
              cy="60"
              r="44"
              pathLength="100"
              strokeWidth={strokeWidth}
              style={{
                stroke: segment.color,
                strokeDasharray: `${visibleShare} ${100 - visibleShare}`,
                strokeDashoffset: -start,
                animationDelay: `${index * 80}ms`,
              }}
            />
          );
        })}
      </g>
    </svg>
  );
}
