import { useMemo, useState } from "react";
import styles from "./DiffViewer.module.css";

export interface DiffViewerProps {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  highlightFields?: string[];
}

function printable(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function numericDelta(before: unknown, after: unknown): string | null {
  if (typeof before !== "number" || typeof after !== "number") return null;
  const delta = after - before;
  const sign = delta >= 0 ? "+" : "";
  return `Delta ${sign}${delta.toFixed(2)}`;
}

export function DiffViewer({ before, after, highlightFields = [] }: DiffViewerProps) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const highlight = useMemo(() => new Set(highlightFields), [highlightFields]);
  const rows = useMemo(() => {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
    return keys
      .map((field) => {
        const beforeValue = before[field];
        const afterValue = after[field];
        const changed = JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
        return {
          field,
          beforeValue,
          afterValue,
          changed,
          delta: numericDelta(beforeValue, afterValue),
        };
      })
      .filter((row) => showUnchanged || row.changed);
  }, [after, before, showUnchanged]);

  return (
    <div className={styles.wrap}>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={showUnchanged}
          onChange={(event) => setShowUnchanged(event.target.checked)}
        />
        Show unchanged fields
      </label>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Field</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field} className={highlight.has(row.field) ? styles.highlight : ""}>
              <td className={styles.field}>
                {row.field}
                {row.delta && <div className={styles.delta}>{row.delta}</div>}
              </td>
              <td className={styles.before}>{printable(row.beforeValue)}</td>
              <td className={styles.after}>{printable(row.afterValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
