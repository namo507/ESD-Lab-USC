import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";

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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Overview />} />
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
