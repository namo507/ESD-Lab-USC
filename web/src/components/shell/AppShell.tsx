import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { TopNav } from "./TopNav";
import { Sidebar } from "./Sidebar";
import { HipaaBanner } from "./HipaaBanner";
import { useIdleTimer } from "./useIdleTimer";
import { useStudySummary, useStages, useRuns } from "@/api/hooks";
import { useUi } from "@/store/ui";
import { logAudit } from "@/lib/audit";
import styles from "./AppShell.module.css";

export function AppShell() {
  const showHipaa = useUi((s) => s.showHipaa);
  const setHipaa = useUi((s) => s.setHipaa);
  const density = useUi((s) => s.density);

  const { data: study } = useStudySummary();
  const { data: stages } = useStages();
  const { data: runs } = useRuns(20);

  const [query, setQuery] = useState("");
  const location = useLocation();

  // HIPAA audit: every navigation
  useEffect(() => {
    void logAudit({ action: "route.navigate", scope: location.pathname });
  }, [location.pathname]);

  const idleMinutes = useIdleTimer(() => {
    // Real apps would redirect to /login after server lock; here we no-op.
    if (import.meta.env.DEV) console.warn("idle timeout reached");
  });

  const qaPending = stages?.find((s) => s.id === "qa")?.inflight ?? 0;
  const runningRuns = runs?.filter((r) => r.status === "running").length ?? 0;
  const runStatus = runningRuns > 0 ? "running" : "idle";

  const safeStudy = study ?? {
    enrolled: 0,
    target: 1,
    groups: { VPT: { count: 0, target: 0 }, ASIB: { count: 0, target: 0 }, TD: { count: 0, target: 0 } },
  };

  return (
    <div className="app-shell">
      <TopNav
        query={query}
        onSearch={setQuery}
        runStatus={runStatus}
        idleMinutes={idleMinutes}
      />
      {showHipaa && <HipaaBanner onDismiss={() => setHipaa(false)} />}
      <div className="app-body">
        <Sidebar study={safeStudy} qaPending={qaPending} runningRuns={runningRuns} />
        <main className={`app-main ${density === "compact" ? "compact" : ""}`} id="main">
          <Outlet context={{ query }} />
          <footer className="app-footer">
            <span>Early Social Development Lab · University of South Carolina</span>
            <span>NIH R01 MH123456 · IRB Pro00115234 · v0.14.2</span>
          </footer>
        </main>
      </div>
      <div className={styles.skip}>
        <a href="#main" className={styles.skipLink}>Skip to main content</a>
      </div>
    </div>
  );
}
