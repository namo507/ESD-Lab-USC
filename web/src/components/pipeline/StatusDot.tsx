import styles from "./StatusDot.module.css";

const COLOR: Record<string, string> = {
  running: "var(--blue)",
  queued:  "var(--slate-400)",
  done:    "var(--green)",
  fail:    "var(--red)",
  idle:    "var(--slate-300)",
};

const MARK: Record<string, string> = {
  running: "●",
  queued: "◌",
  done: "✓",
  fail: "✗",
  idle: "○",
};

const LABEL: Record<string, string> = {
  running: "Running",
  queued: "Queued",
  done: "Done",
  fail: "Failed",
  idle: "Idle",
};

export function StatusDot({ kind, size = 8 }: { kind: string; size?: number }) {
  const label = LABEL[kind] ?? kind;
  return (
    <span
      className={`${styles.dot} ${kind === "running" ? "pulse-dot" : ""}`}
      style={{ color: COLOR[kind] ?? "var(--slate-400)", fontSize: Math.max(size + 4, 12) }}
      aria-label={label}
      role="img"
      title={label}
    >
      {MARK[kind] ?? "•"}
    </span>
  );
}
