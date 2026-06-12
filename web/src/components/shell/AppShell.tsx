import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { TopNav } from "./TopNav";
import { Sidebar } from "./Sidebar";
import { HipaaBanner } from "./HipaaBanner";
import { Buddy } from "./Buddy";
import { ChatDrawer } from "./ChatDrawer";
import { useIdleTimer } from "./useIdleTimer";
import { useStudySummary, useStages, useRuns } from "@/api/hooks";
import { useUi } from "@/store/ui";
import { logAudit } from "@/lib/audit";
import styles from "./AppShell.module.css";

export interface ShellContext {
  query: string;
  syncTick: number;
  syncing: boolean;
}

export function AppShell() {
  const showHipaa = useUi((s) => s.showHipaa);
  const setHipaa = useUi((s) => s.setHipaa);
  const toggleChat = useUi((s) => s.toggleChat);
  const setChatOpen = useUi((s) => s.setChatOpen);
  const density = useUi((s) => s.density);
  const lastSyncAt = useUi((s) => s.lastSyncAt);
  const setLastSyncAt = useUi((s) => s.setLastSyncAt);

  const { data: study } = useStudySummary();
  const { data: stages } = useStages();
  const { data: runs } = useRuns(20);

  const [query, setQuery] = useState("");
  const [syncTick, setSyncTick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const qc = useQueryClient();

  useEffect(() => {
    void logAudit({ action: "route.navigate", scope: location.pathname });
    setSidebarOpen(false);
  }, [location.pathname]);

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

  function forceSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncTick((t) => t + 1);
    void qc.invalidateQueries();
    void logAudit({ action: "run.trigger", scope: "/forceSync" });
    setTimeout(() => {
      setLastSyncAt(new Date().toISOString());
      setSyncing(false);
    }, 1800);
  }

  const qaPending = stages?.find((s) => s.id === "qa")?.inflight ?? 0;
  const enrolled = study?.enrolled ?? 0;
  const showHipaaBanner = import.meta.env.PROD ? true : showHipaa;
  const searchParams = new URLSearchParams(location.search);
  const executiveMode = searchParams.get("mode") === "executive";
  const exitExecutiveSearch = new URLSearchParams(location.search);
  exitExecutiveSearch.delete("mode");
  const exitExecutiveHref = `${location.pathname}${exitExecutiveSearch.toString() ? `?${exitExecutiveSearch.toString()}` : ""}`;

  const safeStudy = study ?? {
    enrolled: 0,
    target: 1,
    groups: { VPT: { count: 0, target: 0 }, ASIB: { count: 0, target: 0 }, TD: { count: 0, target: 0 } },
  };

  void runs;

  return (
    <div className={styles.shell}>
      <a href="#main-content" className={styles.skipNav}>Skip to main content</a>
      <button type="button" className={styles.mobileMenuButton} onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
        Menu
      </button>
      {sidebarOpen && <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} aria-hidden />}
      <div className={`${styles.sidebarLayer} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <Sidebar study={safeStudy} qaPending={qaPending} enrolled={enrolled} executiveMode={executiveMode} />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <TopNav
          query={query}
          onSearch={setQuery}
          syncing={syncing}
          onForceSync={forceSync}
          idleMinutes={idleMinutes}
          lastSyncAt={lastSyncAt}
        />
        {showHipaaBanner && <HipaaBanner onDismiss={import.meta.env.PROD ? undefined : () => setHipaa(false)} idleMinutes={idleMinutes} />}
        {executiveMode && (
          <div className={styles.executiveBanner}>
            <span><strong>Executive Summary View</strong> - Showing key study metrics only</span>
            <a href={exitExecutiveHref}>Exit</a>
          </div>
        )}

        <main className={`app-main ${density === "compact" ? "compact" : ""}`} id="main-content">
          <Outlet context={{ query, syncTick, syncing } satisfies ShellContext} />
          <footer className="app-footer">
            <span>Early Social Development Lab · Dr. Bradshaw · UofSC</span>
            <span>NIH R01 MH123456 · IRB Pro00115234 · v0.15.0</span>
          </footer>
        </main>

        <Buddy />
        <ChatDrawer />
      </div>
    </div>
  );
}
