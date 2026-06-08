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
const Matlab = lazy(() => import("@/routes/Matlab").then((m) => ({ default: m.Matlab })));
const DataExplorer = lazy(() => import("@/routes/DataExplorer").then((m) => ({ default: m.DataExplorer })));
const Publications = lazy(() => import("@/routes/Publications").then((m) => ({ default: m.Publications })));
const PublicationDetail = lazy(() => import("@/routes/PublicationDetail").then((m) => ({ default: m.PublicationDetail })));
const Changelog = lazy(() => import("@/routes/Changelog").then((m) => ({ default: m.Changelog })));
const PresentationMaker = lazy(() =>
  import("@/routes/PresentationMaker").then((m) => ({ default: m.PresentationMaker })),
);
const HdaPlayer = lazy(() => import("@/routes/HdaPlayer").then((m) => ({ default: m.HdaPlayer })));
const ThermalHeatmap = lazy(() => import("@/routes/ThermalHeatmap").then((m) => ({ default: m.ThermalHeatmap })));
const SwimmerPlot = lazy(() => import("@/routes/SwimmerPlot").then((m) => ({ default: m.SwimmerPlot })));
const Attrition = lazy(() => import("@/routes/Attrition").then((m) => ({ default: m.Attrition })));
const SdohMap = lazy(() => import("@/routes/SdohMap").then((m) => ({ default: m.SdohMap })));
const ShapExplorer = lazy(() => import("@/routes/ShapExplorer").then((m) => ({ default: m.ShapExplorer })));
const ClusterViewer = lazy(() => import("@/routes/ClusterViewer").then((m) => ({ default: m.ClusterViewer })));
const ModelLeaderboard = lazy(() => import("@/routes/ModelLeaderboard").then((m) => ({ default: m.ModelLeaderboard })));
const CascadeDag = lazy(() => import("@/routes/CascadeDag").then((m) => ({ default: m.CascadeDag })));
const EcgQuality = lazy(() => import("@/routes/EcgQuality").then((m) => ({ default: m.EcgQuality })));
const SpatialAssessmentMatrix = lazy(() =>
  import("@/routes/SpatialAssessmentMatrix").then((m) => ({ default: m.SpatialAssessmentMatrix })),
);
const AttachmentHeatmap = lazy(() => import("@/routes/AttachmentHeatmap").then((m) => ({ default: m.AttachmentHeatmap })));
const CoRegulation = lazy(() => import("@/routes/CoRegulation").then((m) => ({ default: m.CoRegulation })));
const PhasePortrait = lazy(() => import("@/routes/PhasePortrait").then((m) => ({ default: m.PhasePortrait })));
const CvaTheater = lazy(() => import("@/routes/CvaTheater").then((m) => ({ default: m.CvaTheater })));
const HrDeceleration = lazy(() => import("@/routes/HrDeceleration").then((m) => ({ default: m.HrDeceleration })));
const StillFace = lazy(() => import("@/routes/StillFace").then((m) => ({ default: m.StillFace })));
const HdaBypass = lazy(() => import("@/routes/HdaBypass").then((m) => ({ default: m.HdaBypass })));
const Passport = lazy(() => import("@/routes/Passport").then((m) => ({ default: m.Passport })));
const Archetypes = lazy(() => import("@/routes/Archetypes").then((m) => ({ default: m.Archetypes })));
const CascadeSimulator = lazy(() => import("@/routes/CascadeSimulator").then((m) => ({ default: m.CascadeSimulator })));
const EcoValidity = lazy(() => import("@/routes/EcoValidity").then((m) => ({ default: m.EcoValidity })));
const StreamCoverage = lazy(() => import("@/routes/StreamCoverage").then((m) => ({ default: m.StreamCoverage })));

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
            <Route path="/matlab" element={<Matlab />} />
            <Route path="/data-explorer" element={<DataExplorer />} />
            <Route path="/publications" element={<Publications />} />
            <Route path="/publications/:pmid" element={<PublicationDetail />} />
            <Route path="/changelog" element={<Changelog />} />
            <Route path="/presentation-maker" element={<PresentationMaker />} />
            <Route path="/hda-player" element={<HdaPlayer />} />
            <Route path="/thermal-heatmap" element={<ThermalHeatmap />} />
            <Route path="/swimmer-plot" element={<SwimmerPlot />} />
            <Route path="/attrition" element={<Attrition />} />
            <Route path="/sdoh-map" element={<SdohMap />} />
            <Route path="/shap-explorer" element={<ShapExplorer />} />
            <Route path="/cluster-viewer" element={<ClusterViewer />} />
            <Route path="/model-leaderboard" element={<ModelLeaderboard />} />
            <Route path="/cascade-dag" element={<CascadeDag />} />
            <Route path="/ecg-quality" element={<EcgQuality />} />
            <Route path="/spatial-assessments" element={<SpatialAssessmentMatrix />} />
            <Route path="/attachment-heatmap" element={<AttachmentHeatmap />} />
            <Route path="/dyad-coregulation" element={<CoRegulation />} />
            <Route path="/phase-portrait" element={<PhasePortrait />} />
            <Route path="/cva-theater" element={<CvaTheater />} />
            <Route path="/hr-deceleration" element={<HrDeceleration />} />
            <Route path="/stillface" element={<StillFace />} />
            <Route path="/hda-bypass" element={<HdaBypass />} />
            <Route path="/passport" element={<Passport />} />
            <Route path="/archetypes" element={<Archetypes />} />
            <Route path="/cascade-sim" element={<CascadeSimulator />} />
            <Route path="/eco-validity" element={<EcoValidity />} />
            <Route path="/stream-coverage" element={<StreamCoverage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </QueryClientProvider>
  );
}
