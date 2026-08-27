import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { TopNav } from "./TopNav";
import { Sidebar } from "./Sidebar";
import { HipaaBanner } from "./HipaaBanner";
import { Buddy } from "./Buddy";
import { ChatDrawer } from "./ChatDrawer";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { useIdleTimer } from "./useIdleTimer";
import { useStages } from "@/api/hooks";
import {
  DASHBOARD_METRICS_QUERY_KEY,
  getDashboardSourceState,
  selectNanoMetrics,
  useDashboardMetrics,
} from "@/api/dashboardMetrics";
import { useUi } from "@/store/ui";
import { logAudit } from "@/lib/audit";
import styles from "./AppShell.module.css";

export interface ShellContext {
  query: string;
  syncTick: number;
  syncing: boolean;
}

interface AppShellProps {
  brand?: "esd-2026";
}

export function AppShell({ brand }: AppShellProps = {}) {
  const showHipaa = useUi((s) => s.showHipaa);
  const setHipaa = useUi((s) => s.setHipaa);
  const toggleChat = useUi((s) => s.toggleChat);
  const setChatOpen = useUi((s) => s.setChatOpen);
  const density = useUi((s) => s.density);
  const setLastSyncAt = useUi((s) => s.setLastSyncAt);

  const dashboardMetrics = useDashboardMetrics();
  const { data: stages } = useStages();
  const nano = selectNanoMetrics(dashboardMetrics.data);
  const sourceState = getDashboardSourceState(dashboardMetrics.data);

  const [query, setQuery] = useState("");
  const [syncTick, setSyncTick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const inNanoDashboard = location.pathname.replace(/\/+$/, "") === "/nano/dashboard";
  const qc = useQueryClient();

  useEffect(() => {
    void logAudit({ action: "route.navigate", scope: location.pathname });
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (dashboardMetrics.data?.generatedAt) {
      setLastSyncAt(dashboardMetrics.data.generatedAt);
    }
  }, [dashboardMetrics.data?.generatedAt, setLastSyncAt]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggleChat();
        return;
      }

      if (event.key === "Escape") {
        setChatOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleChat, setChatOpen]);

  const idleMinutes = useIdleTimer(() => {
    if (import.meta.env.DEV) console.warn("idle timeout reached");
  });

  async function forceSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncTick((t) => t + 1);
    void logAudit({ action: "run.trigger", scope: "/forceSync" });
    try {
      await qc.invalidateQueries({
        predicate: (query) =>
          query.queryKey.length !== DASHBOARD_METRICS_QUERY_KEY.length
          || query.queryKey.some((part, index) => part !== DASHBOARD_METRICS_QUERY_KEY[index]),
        refetchType: "active",
      });
      const refreshed = await dashboardMetrics.refetch();
      if (refreshed.data?.generatedAt) setLastSyncAt(refreshed.data.generatedAt);
    } finally {
      setSyncing(false);
    }
  }

  const qaPending = stages?.find((s) => s.id === "qa")?.inflight ?? 0;
  const showHipaaBanner = import.meta.env.PROD ? true : showHipaa;
  const searchParams = new URLSearchParams(location.search);
  const executiveMode = searchParams.get("mode") === "executive";
  const exitExecutiveSearch = new URLSearchParams(location.search);
  exitExecutiveSearch.delete("mode");
  const exitExecutiveHref = `${location.pathname}${exitExecutiveSearch.toString() ? `?${exitExecutiveSearch.toString()}` : ""}`;

  return (
    <div className={styles.shell} data-brand={brand ?? "esd-2026"}>
      <a href="#main-content" className={styles.skipNav}>Skip to main content</a>
      <button type="button" className={styles.mobileMenuButton} onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
        Menu
      </button>
      {sidebarOpen && <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} aria-hidden />}
      <div className={`${styles.sidebarLayer} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <Sidebar study={nano} sourceState={sourceState} qaPending={qaPending} executiveMode={executiveMode} metrics={dashboardMetrics.data} />
      </div>

      <div className={styles.content}>
        <TopNav
          query={query}
          onSearch={setQuery}
          syncing={syncing}
          onForceSync={forceSync}
          idleMinutes={idleMinutes}
          lastSyncAt={sourceState.generatedAt}
        />
        {showHipaaBanner && <HipaaBanner onDismiss={import.meta.env.PROD ? undefined : () => setHipaa(false)} idleMinutes={idleMinutes} />}
        {executiveMode && (
          <div className={styles.executiveBanner}>
            <span><strong>Executive Summary View</strong> - Showing key study metrics only</span>
            <a href={exitExecutiveHref}>Exit</a>
          </div>
        )}

        <main className={`${styles.main} app-main ${density === "compact" ? "compact" : ""}`} id="main-content">
          <RouteErrorBoundary key={location.pathname}>
            <Outlet context={{ query, syncTick, syncing } satisfies ShellContext} />
          </RouteErrorBoundary>
          <footer className={`${styles.footer} app-footer`}>
            <span>Early Social Development Lab · Dr. Bradshaw · UofSC</span>
            <span>{inNanoDashboard
              ? "NIH R01 MH132925 · Aggregate-only public dashboard · v0.15.0"
              : "NIH R01 MH123456 · IRB Pro00115234 · v0.15.0"}</span>
          </footer>
        </main>

        <Buddy />
        <ChatDrawer />
      </div>
    </div>
  );
}
