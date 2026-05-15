import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { TopNav } from "./TopNav";
import { Sidebar } from "./Sidebar";
import { HipaaBanner } from "./HipaaBanner";
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
  const density = useUi((s) => s.density);

  const { data: study } = useStudySummary();
  const { data: stages } = useStages();
  const { data: runs } = useRuns(20);

  const [query, setQuery] = useState("");
  const [syncTick, setSyncTick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const location = useLocation();
  const qc = useQueryClient();

  useEffect(() => {
    void logAudit({ action: "route.navigate", scope: location.pathname });
  }, [location.pathname]);

  const idleMinutes = useIdleTimer(() => {
    if (import.meta.env.DEV) console.warn("idle timeout reached");
  });

  function forceSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncTick((t) => t + 1);
    void qc.invalidateQueries();
    void logAudit({ action: "run.trigger", scope: "/forceSync" });
    setTimeout(() => setSyncing(false), 1800);
  }

  const qaPending = stages?.find((s) => s.id === "qa")?.inflight ?? 0;
  const enrolled = study?.enrolled ?? 0;

  const safeStudy = study ?? {
    enrolled: 0,
    target: 1,
    groups: { VPT: { count: 0, target: 0 }, ASIB: { count: 0, target: 0 }, TD: { count: 0, target: 0 } },
  };

  void runs;

  return (
    <div className="min-h-screen flex" style={{ minWidth: 1024, background: "var(--warm-bg)" }}>
      <Sidebar study={safeStudy} qaPending={qaPending} enrolled={enrolled} />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopNav
          query={query}
          onSearch={setQuery}
          syncing={syncing}
          onForceSync={forceSync}
          idleMinutes={idleMinutes}
        />
        {showHipaa && <HipaaBanner onDismiss={() => setHipaa(false)} idleMinutes={idleMinutes} />}

        <main className={`app-main ${density === "compact" ? "compact" : ""}`} id="main" style={{ maxWidth: 1480 }}>
          <Outlet context={{ query, syncTick, syncing } satisfies ShellContext} />
          <footer className="app-footer">
            <span>Early Social Development Lab · Dr. Bradshaw · UofSC</span>
            <span>NIH R01 MH123456 · IRB Pro00115234 · v0.15.0</span>
          </footer>
        </main>
      </div>
      <div className={styles.skip}>
        <a href="#main" className={styles.skipLink}>Skip to main content</a>
      </div>
    </div>
  );
}
