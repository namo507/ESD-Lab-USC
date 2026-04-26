import styles from "./StatusDot.module.css";

const COLOR: Record<string, string> = {
  running: "var(--blue)",
  queued:  "var(--slate-400)",
  done:    "var(--green)",
  fail:    "var(--red)",
  idle:    "var(--slate-300)",
};

export function StatusDot({ kind, size = 8 }: { kind: string; size?: number }) {
  return (
    <span
      className={`${styles.dot} ${kind === "running" ? "pulse-dot" : ""}`}
      style={{ width: size, height: size, background: COLOR[kind] ?? "var(--slate-400)" }}
      aria-hidden
    />
  );
}
