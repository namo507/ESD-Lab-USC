import { NavLink } from "react-router-dom";
import { Icon, SectionLabel } from "@/components/primitives";
import type { StudySummary } from "@/api/schemas";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  study: StudySummary;
  qaPending: number;
  runningRuns: number;
}

const GROUPS = [
  {
    label: "Pipeline",
    items: [
      { to: "/", icon: "git-branch", label: "Overview" },
      { to: "/qa", icon: "shield-check", label: "Window QA", badgeKey: "qa" as const },
      { to: "/runs", icon: "play-circle", label: "Runs", badgeKey: "runs" as const },
    ],
  },
  {
    label: "Study",
    items: [
      { to: "/participants", icon: "users", label: "Participants" },
      { to: "/results", icon: "line-chart", label: "Results" },
      { to: "/redcap", icon: "database", label: "REDCap sync" },
    ],
  },
];

export function Sidebar({ study, qaPending, runningRuns }: SidebarProps) {
  const badge: Record<string, string | undefined> = {
    qa: qaPending > 0 ? String(qaPending) : undefined,
    runs: runningRuns > 0 ? String(runningRuns) : undefined,
  };
  const pct = (study.enrolled / study.target) * 100;

  return (
    <aside className={styles.bar} aria-label="Primary">
      {GROUPS.map((g) => (
        <div key={g.label} className={styles.group}>
          <div className={styles.groupLabel}>{g.label}</div>
          {g.items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === "/"}
              className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ""}`}
            >
              {({ isActive }) => (
                <>
                  <Icon name={it.icon} color={isActive ? "var(--usc-garnet)" : "var(--slate-600)"} size={15} />
                  <span>{it.label}</span>
                  {"badgeKey" in it && it.badgeKey && badge[it.badgeKey] && (
                    <span className={`${styles.badge} ${isActive ? styles.badgeActive : ""}`}>
                      {badge[it.badgeKey]}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}

      <div className={styles.spacer} />

      <div className={styles.summaryWrap}>
        <div className={styles.summary}>
          <SectionLabel>NANO · year 3 of 5</SectionLabel>
          <div className={`${styles.summaryValue} t-num`}>
            {study.enrolled}
            <span className={styles.summaryTarget}>{` / ${study.target}`}</span>
          </div>
          <div className={styles.summarySub}>
            infants enrolled · {study.target - study.enrolled} to target
          </div>
          <div className={styles.bar2}>
            <div className={styles.barFill} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className={styles.version}>v0.14.2 · main · 8a3f1c</div>
    </aside>
  );
}
