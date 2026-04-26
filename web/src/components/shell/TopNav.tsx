import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Icon, Tooltip } from "@/components/primitives";
import styles from "./TopNav.module.css";

const NAV_ITEMS: Array<{ to: string; label: string }> = [
  { to: "/", label: "Pipeline" },
  { to: "/participants", label: "Participants" },
  { to: "/qa", label: "QA review" },
  { to: "/results", label: "Results" },
  { to: "/runs", label: "Runs" },
  { to: "/redcap", label: "REDCap" },
];

interface TopNavProps {
  user?: string;
  query: string;
  onSearch: (q: string) => void;
  runStatus: "idle" | "running";
  /** Idle countdown in minutes. */
  idleMinutes: number;
}

export function TopNav({
  user = "JB",
  query,
  onSearch,
  runStatus,
  idleMinutes,
}: TopNavProps) {
  const navigate = useNavigate();
  const [showK, setShowK] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowK(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className={styles.bar} role="banner">
      <div className={styles.brand} aria-label="ESD Lab · NANO Study">
        <div className={styles.mark} aria-hidden>
          <span className={styles.markStripeGold} />
          <span className={styles.markStripeWhite} />
          <span className={styles.markStripeShort} />
        </div>
        <div className={styles.brandText}>
          <div className={styles.brandTitle}>ESD Lab</div>
          <div className={styles.brandSub}>NANO STUDY · USC</div>
        </div>
      </div>

      <nav aria-label="Main">
        <ul className={styles.nav}>
          {NAV_ITEMS.map((i) => (
            <li key={i.to}>
              <NavLink
                end={i.to === "/"}
                to={i.to}
                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navActive : ""}`}
              >
                {i.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.spacer} />

      <label className={styles.search}>
        <Icon name="search" size={13} color="var(--slate-500)" />
        <input
          aria-label="Search NANO IDs, group, visit, or run id"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="NANO-XXXX, group, visit, run id"
          className={styles.searchInput}
        />
        <kbd className={styles.kbd}>{showK ? "⌘K" : "⌘K"}</kbd>
      </label>

      <Tooltip text="Live pipeline status. Click Runs to see detail.">
        <button
          type="button"
          className={styles.runChip}
          onClick={() => navigate("/runs")}
        >
          <span
            className={`${styles.runDot} ${runStatus === "running" ? "pulse-dot" : ""}`}
            style={{ background: runStatus === "running" ? "var(--blue)" : "var(--green)" }}
            aria-hidden
          />
          <span>{runStatus === "running" ? "run_2026_115_a · hrv" : "idle"}</span>
        </button>
      </Tooltip>

      <Tooltip text="HIPAA-protected session. Auto-locks after 30 min of inactivity.">
        <span className={styles.idleChip} aria-label={`Session idle timeout in ${idleMinutes} minutes`}>
          <Icon name="shield-check" color="var(--green)" size={13} />
          <span>{idleMinutes} m</span>
        </span>
      </Tooltip>

      <div className={styles.avatar} aria-label={`User ${user}`}>{user}</div>
    </header>
  );
}
