/**
 * Small presentation pieces shared by the REDCap portfolio panels.
 *
 * Every chart here is plain DOM: a labelled row, a track, a fill, and a visible
 * value. That keeps identity off colour alone (each mark is direct-labelled and
 * repeated in a table), and it keeps suppressed cells honest — a hidden count
 * renders as "Suppressed", never as a zero-width bar.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/primitives";
import type { PortfolioCompletion } from "@/api/redcapPortfolio";
import styles from "./RedcapPortfolio.module.css";

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString();
}

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;
}

export function SuppressedValue({ label = "Suppressed" }: { label?: string }) {
  return (
    <span
      className={styles.suppressed}
      title="Withheld because the underlying cell is smaller than the small-cell threshold"
    >
      {label}
    </span>
  );
}

/** Render a count, or the suppression marker when the server withheld it. */
export function CountCell({
  value,
  suppressed,
}: {
  value: number | null;
  suppressed: boolean;
}) {
  if (suppressed) return <SuppressedValue />;
  return <>{formatCount(value)}</>;
}

export function rateColor(rate: number): string {
  if (rate >= 66) return "var(--status-green)";
  if (rate >= 33) return "var(--status-blue)";
  return "var(--status-red)";
}

export function CompletionBar({ completion }: { completion: PortfolioCompletion }) {
  if (completion.countsSuppressed || completion.completionRate === null) {
    return <SuppressedValue label={completion.countsSuppressed ? "Suppressed" : "—"} />;
  }
  const rate = completion.completionRate;
  return (
    <span className={styles.rateCell}>
      <span className={styles.barTrack}>
        <span
          className={styles.barFill}
          style={{ width: `${Math.min(100, Math.max(0, rate))}%`, background: rateColor(rate) }}
        />
      </span>
      <span className="t-num">{rate.toFixed(1)}%</span>
    </span>
  );
}

export interface BarRow {
  key: string;
  label: string;
  value: number | null;
  color?: string;
  caption?: string;
  suppressed?: boolean;
}

/**
 * Horizontal bars with the value printed at the end of every row, so the chart
 * stays readable without relying on the fill colour.
 */
export function HBar({
  rows,
  ariaLabel,
  unit = "",
  emptyLabel = "No data to chart.",
}: {
  rows: BarRow[];
  ariaLabel: string;
  unit?: string;
  emptyLabel?: string;
}) {
  const max = rows.reduce((peak, row) => Math.max(peak, row.value ?? 0), 0);
  if (!rows.length) return <p className={styles.empty}>{emptyLabel}</p>;
  return (
    <ul className={styles.bars} aria-label={ariaLabel}>
      {rows.map((row) => {
        const width = max > 0 && row.value !== null ? (row.value / max) * 100 : 0;
        return (
          <li key={row.key} className={styles.barRow}>
            <span className={styles.barLabel} title={row.label}>
              {row.label}
            </span>
            <span className={styles.barTrack}>
              <span
                className={styles.barFill}
                style={{ width: `${width}%`, background: row.color ?? "var(--status-blue)" }}
              />
            </span>
            <span className={`${styles.barValue} t-num`}>
              {row.suppressed ? <SuppressedValue /> : `${formatCount(row.value)}${unit}`}
            </span>
            {row.caption ? <span className={styles.barCaption}>{row.caption}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

export interface StackPart {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface StackRow {
  key: string;
  label: string;
  parts: StackPart[];
  suppressed?: boolean;
  total?: number;
}

/** Stacked bars with a 2px surface gap between segments and a shared legend. */
export function HStack({
  rows,
  ariaLabel,
  legend,
  emptyLabel = "No completion data to chart.",
}: {
  rows: StackRow[];
  ariaLabel: string;
  legend: StackPart[];
  emptyLabel?: string;
}) {
  const max = rows.reduce(
    (peak, row) => Math.max(peak, row.parts.reduce((sum, part) => sum + part.value, 0)),
    0,
  );
  if (!rows.length) return <p className={styles.empty}>{emptyLabel}</p>;
  return (
    <div>
      <ul className={styles.legend}>
        {legend.map((part) => (
          <li key={part.key}>
            <span className={styles.legendSwatch} style={{ background: part.color }} aria-hidden />
            {part.label}
          </li>
        ))}
      </ul>
      <ul className={styles.bars} aria-label={ariaLabel}>
        {rows.map((row) => {
          const total = row.parts.reduce((sum, part) => sum + part.value, 0);
          return (
            <li key={row.key} className={styles.barRow}>
              <span className={styles.barLabel} title={row.label}>
                {row.label}
              </span>
              <span className={styles.barTrack}>
                {row.suppressed
                  ? null
                  : row.parts.map((part) => (
                      <span
                        key={part.key}
                        className={styles.stackFill}
                        style={{
                          width: max > 0 ? `${(part.value / max) * 100}%` : "0%",
                          background: part.color,
                        }}
                        title={`${row.label} · ${part.label}: ${formatCount(part.value)}`}
                      />
                    ))}
              </span>
              <span className={`${styles.barValue} t-num`}>
                {row.suppressed ? <SuppressedValue /> : formatCount(row.total ?? total)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface HeatCell {
  value: number;
  title: string;
}

/** Pairwise grid used for shared-instrument overlap between projects. */
export function HeatGrid({
  keys,
  labels,
  cells,
  ariaLabel,
}: {
  keys: string[];
  labels: Record<string, string>;
  cells: number[][];
  ariaLabel: string;
}) {
  const max = cells.reduce(
    (peak, row) => Math.max(peak, row.reduce((best, value) => Math.max(best, value), 0)),
    0,
  );
  return (
    <div className={styles.heatWrap}>
      <table className={styles.heatTable} aria-label={ariaLabel}>
        <thead>
          <tr>
            <th scope="col" className={styles.heatCorner}>
              <span className="sr-only">Project</span>
            </th>
            {keys.map((key) => (
              <th key={key} scope="col" className={styles.heatHead}>
                {labels[key] ?? key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((rowKey, rowIndex) => (
            <tr key={rowKey}>
              <th scope="row" className={styles.heatRowHead}>
                {labels[rowKey] ?? rowKey}
              </th>
              {keys.map((columnKey, columnIndex) => {
                const value = cells[rowIndex]?.[columnIndex] ?? 0;
                const intensity = max > 0 ? value / max : 0;
                return (
                  <td
                    key={columnKey}
                    className={styles.heatCell}
                    style={{
                      background:
                        rowIndex === columnIndex
                          ? "var(--bg-hover)"
                          : `color-mix(in srgb, var(--status-blue) ${Math.round(intensity * 72)}%, var(--bg-surface))`,
                    }}
                    title={`${labels[rowKey] ?? rowKey} ∩ ${labels[columnKey] ?? columnKey}: ${value} shared instruments`}
                  >
                    <span className="t-num">{rowIndex === columnIndex ? "—" : value}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PanelHead({
  title,
  hint,
  aside,
}: {
  title: ReactNode;
  hint?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className={styles.panelHead}>
      <div>
        <h3 className={styles.panelTitle}>{title}</h3>
        {hint ? <p className={styles.panelHint}>{hint}</p> : null}
      </div>
      {aside ? <div className={styles.panelAside}>{aside}</div> : null}
    </div>
  );
}

export function StudyChip({ label, color }: { label: string; color: string }) {
  return (
    <span className={styles.chip} style={{ background: color }}>
      {label}
    </span>
  );
}

export function BoolMark({ value, label }: { value: boolean; label: string }) {
  return value ? (
    <Badge kind="ok" size="sm">
      {label}
    </Badge>
  ) : (
    <span className={styles.muted}>—</span>
  );
}

export type SortDirection = "asc" | "desc";

export interface SortState<T extends string> {
  key: T;
  direction: SortDirection;
}

/**
 * Click-to-sort state for the portfolio tables. Numeric columns start
 * descending because the interesting rows are the biggest ones.
 */
export function useSortedRows<Row, K extends string>(
  rows: Row[],
  accessors: Record<K, (row: Row) => number | string | null>,
  initial: SortState<K>,
): {
  rows: Row[];
  sort: SortState<K>;
  toggle: (key: K) => void;
  ariaSort: (key: K) => "ascending" | "descending" | "none";
} {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const sorted = useMemo(() => {
    const accessor = accessors[sort.key];
    if (!accessor) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const a = accessor(left);
      const b = accessor(right);
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
      return String(a).localeCompare(String(b)) * factor;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort.key, sort.direction]);

  function toggle(key: K) {
    setSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === "asc" ? "desc" : "asc" };
      }
      const sample = rows.length ? accessors[key](rows[0]) : null;
      return { key, direction: typeof sample === "string" ? "asc" : "desc" };
    });
  }

  function ariaSort(key: K): "ascending" | "descending" | "none" {
    if (sort.key !== key) return "none";
    return sort.direction === "asc" ? "ascending" : "descending";
  }

  return { rows: sorted, sort, toggle, ariaSort };
}

export function SortableHeader<K extends string>({
  columnKey,
  label,
  sort,
  toggle,
  ariaSort,
  numeric = false,
}: {
  columnKey: K;
  label: string;
  sort: SortState<K>;
  toggle: (key: K) => void;
  ariaSort: (key: K) => "ascending" | "descending" | "none";
  numeric?: boolean;
}) {
  const active = sort.key === columnKey;
  return (
    <th
      scope="col"
      aria-sort={ariaSort(columnKey)}
      className={`${styles.th} ${numeric ? styles.thNum : ""}`}
    >
      <button type="button" className={styles.sortButton} onClick={() => toggle(columnKey)}>
        {label}
        <span aria-hidden className={styles.sortMark}>
          {active ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
