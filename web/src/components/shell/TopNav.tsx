import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@/components/primitives";
import { SkinToggle } from "@/components/shell/SkinToggle";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { isDiscoveryPath, toDiscoveryRoute } from "@/lib/discoveryRoutes";
import { useUi } from "@/store/ui";
import styles from "./TopNav.module.css";

interface TopNavProps {
  query: string;
  onSearch: (q: string) => void;
  syncing: boolean;
  onForceSync: () => void;
  idleMinutes: number;
  lastSyncAt: string | null;
}

/**
 * Glass header — translucent white, blur(12px), Source Serif title.
 * Force-sync button is the operator's manual trigger for the data layer
 * (TanStack Query invalidations + visible DAG pulse acceleration).
 */
export function TopNav({ query, onSearch, syncing, onForceSync, idleMinutes, lastSyncAt }: TopNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [now, setNow] = useState(new Date());
  const setChatOpen = useUi((state) => state.setChatOpen);
  const setChatSeed = useUi((state) => state.setChatSeed);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const syncLabel = lastSyncAt ? formatRelativeTime(lastSyncAt, now) : "not synced";
  const inDiscovery = isDiscoveryPath(location.pathname);
  const inNanoDashboard = location.pathname === "/nano/dashboard";
  const route = (to: string) => (inDiscovery ? toDiscoveryRoute(to) : to);

  function openChatWithQuery(nextQuery: string) {
    const trimmed = nextQuery.trim();
    setChatSeed(trimmed ? trimmed : null);
    setChatOpen(true);
  }

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    openChatWithQuery(searchRef.current?.value ?? event.currentTarget.value);
  }

  return (
    <header className={styles.bar} role="banner">
      <div className={styles.context}>
        <span className={styles.eyebrow}>NANO operating console</span>
        <h1 className={styles.title}>Early Social Development Lab</h1>
        <span className={styles.meta}>Institute for Mind &amp; Brain · Dr. Jessica Bradshaw</span>
      </div>

      <label className={`${styles.search} surface-card`}>
        <span data-tour="operator-search" className={styles.searchTour} aria-hidden />
        <Icon name="sparkles" size={15} stroke={1.7} color="var(--esd-discovery-blue, #3366ff)" />
        <input
          ref={searchRef}
          aria-label="Ask the lab"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          onFocus={() => openChatWithQuery(searchRef.current?.value ?? query)}
          onKeyDown={onSearchKeyDown}
          placeholder={inNanoDashboard ? "Ask the lab · NANO aggregate metrics" : "Ask the lab · NANO-0173 RMSSD trend?"}
          className={styles.searchInput}
        />
        <kbd className={styles.kbd}>⌘K</kbd>
      </label>

      <div className={styles.controlCluster}>
        <button
          type="button"
          onClick={() => navigate(route("/runs"))}
          data-tour="operator-session"
          className={`${styles.iconControl} ${styles.idleControl}`}
          title="Idle countdown · 30 m HIPAA gate"
          aria-label={`Session idle countdown: ${idleMinutes} minutes`}
        >
          <Icon name="shield-check" size={14} stroke={1.7} color="var(--esd-discovery-blue, #3366ff)" />
          <span>{idleMinutes}m</span>
        </button>

        <button
          type="button"
          onClick={() => navigate(route("/"))}
          data-tour="operator-landing"
          className={styles.iconControl}
          title="Back to public landing site"
          aria-label="Back to landing"
        >
          <Icon name="arrow-left" size={13} stroke={1.7} color="var(--esd-discovery-blue, #3366ff)" />
          <span>Landing</span>
        </button>

        <SkinToggle variant="pill" className={styles.toggle} />
        <ThemeToggle variant="pill" className={styles.toggle} />

        <div className={styles.clock} aria-label={`${date}, ${time}`}>
          <strong>{time}</strong>
          <span>{date}</span>
        </div>

        <div className={styles.syncGroup}>
          <button
            type="button"
            onClick={onForceSync}
            disabled={syncing}
            data-tour="operator-force-sync"
            className={styles.syncButton}
          >
            <Icon
              name="refresh-cw"
              size={14}
              stroke={1.7}
              color="white"
              style={{ animation: syncing ? "esd-spin 0.7s linear infinite" : "none" }}
            />
            {syncing ? "Syncing…" : "Force sync"}
          </button>
          <span className={styles.syncLabel}>{syncLabel}</span>
        </div>
      </div>
    </header>
  );
}

function formatRelativeTime(value: string, now: Date): string {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "sync time n/a";
  const seconds = Math.max(0, Math.round((now.getTime() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}
