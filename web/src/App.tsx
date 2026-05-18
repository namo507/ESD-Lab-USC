import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { applyTheme, loadInitialTheme, persistTheme, useUi } from "@/store/ui";

const Landing = lazy(() => import("@/routes/Landing").then((m) => ({ default: m.Landing })));
const Overview = lazy(() => import("@/routes/Overview").then((m) => ({ default: m.Overview })));
const Participants = lazy(() => import("@/routes/Participants").then((m) => ({ default: m.Participants })));
const ParticipantDetail = lazy(() => import("@/routes/ParticipantDetail").then((m) => ({ default: m.ParticipantDetail })));
const QA = lazy(() => import("@/routes/QA").then((m) => ({ default: m.QA })));
const Results = lazy(() => import("@/routes/Results").then((m) => ({ default: m.Results })));
const Runs = lazy(() => import("@/routes/Runs").then((m) => ({ default: m.Runs })));
const Redcap = lazy(() => import("@/routes/Redcap").then((m) => ({ default: m.Redcap })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function PageFallback() {
  return <div style={{ padding: 32 }}>Loading…</div>;
}

/**
 * Hydrate theme into the zustand store + keep <html data-theme> synced.
 * Listens to system colour-scheme changes while user pref is "system".
 */
function ThemeBoot() {
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);

  // 1. On mount, copy persisted theme (localStorage) into the store.
  useEffect(() => {
    const initial = loadInitialTheme();
    setTheme(initial);
    applyTheme(initial);
  }, [setTheme]);

  // 2. Whenever the store value changes, apply + persist.
  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  // 3. Track the OS colour-scheme while user is on "system".
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (useUi.getState().theme === "system") applyTheme("system");
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeBoot />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route element={<AppShell />}>
            <Route path="/overview" element={<Overview />} />
            <Route path="/participants" element={<Participants />} />
            <Route path="/participants/:id" element={<ParticipantDetail />} />
            <Route path="/qa" element={<QA />} />
            <Route path="/qa/:id" element={<QA />} />
            <Route path="/results" element={<Results />} />
            <Route path="/runs" element={<Runs />} />
            <Route path="/redcap" element={<Redcap />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </QueryClientProvider>
  );
}
