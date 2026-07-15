import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrandScope } from "@/components/brand/BrandScope";
import { AppShell } from "@/components/shell/AppShell";
import { ChatDrawer } from "@/components/shell/ChatDrawer";
import { RouteErrorBoundary } from "@/components/shell/RouteErrorBoundary";
import { GuidedTourHost } from "@/components/help/GuidedTour";
import { isFeatureFlagEnabled } from "@/hooks/useFeatureFlag";
import { isDiscoveryPath } from "@/lib/discoveryRoutes";
import { applyTheme, loadInitialTheme, persistTheme, useUi } from "@/store/ui";

const Landing = lazy(() => import("@/routes/Landing").then((m) => ({ default: m.Landing })));
const Docs = lazy(() => import("@/routes/Docs").then((m) => ({ default: m.Docs })));
const HowTo = lazy(() => import("@/routes/HowTo").then((m) => ({ default: m.HowTo })));
const Overview = lazy(() => import("@/routes/Overview").then((m) => ({ default: m.Overview })));
const Participants = lazy(() => import("@/routes/Participants").then((m) => ({ default: m.Participants })));
const ParticipantDetail = lazy(() => import("@/routes/ParticipantDetail").then((m) => ({ default: m.ParticipantDetail })));
const QA = lazy(() => import("@/routes/QA").then((m) => ({ default: m.QA })));
const Results = lazy(() => import("@/routes/Results").then((m) => ({ default: m.Results })));
const Runs = lazy(() => import("@/routes/Runs").then((m) => ({ default: m.Runs })));
const Redcap = lazy(() => import("@/routes/Redcap").then((m) => ({ default: m.Redcap })));
const PipelineHealth = lazy(() => import("@/routes/PipelineHealth").then((m) => ({ default: m.PipelineHealth })));
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
const MultimodalSynchrony = lazy(() =>
  import("@/routes/MultimodalSynchrony").then((m) => ({ default: m.MultimodalSynchrony })),
);
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
const CgaMilestoneRiver = lazy(() => import("@/routes/CgaMilestoneRiver").then((m) => ({ default: m.CgaMilestoneRiver })));
const CountyComparator = lazy(() => import("@/routes/CountyComparator").then((m) => ({ default: m.CountyComparator })));
const ParticipantTimeline = lazy(() => import("@/routes/ParticipantTimeline").then((m) => ({ default: m.ParticipantTimeline })));
const ModelConfidenceTerrain = lazy(() => import("@/routes/ModelConfidenceTerrain").then((m) => ({ default: m.ModelConfidenceTerrain })));
const AttritionFunnel = lazy(() => import("@/routes/AttritionFunnel").then((m) => ({ default: m.AttritionFunnel })));
const GuidedExplorer = lazy(() => import("@/routes/GuidedExplorer").then((m) => ({ default: m.GuidedExplorer })));
const PublicInsights = lazy(() => import("@/routes/PublicInsights").then((m) => ({ default: m.PublicInsights })));
const ExecutiveMode = lazy(() => import("@/routes/ExecutiveMode").then((m) => ({ default: m.ExecutiveMode })));
const NanoStudyDashboard = lazy(() =>
  import("@/routes/NanoStudyDashboard").then((m) => ({ default: m.NanoStudyDashboard })),
);
const LgcmTrajectories = lazy(() => import("@/routes/LgcmTrajectories").then((m) => ({ default: m.LgcmTrajectories })));
const Aim3Clusters = lazy(() => import("@/routes/Aim3Clusters").then((m) => ({ default: m.Aim3Clusters })));

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
 * Remounts the error boundary on navigation so a crash on one route clears when
 * the user moves to another. Operator routes are additionally guarded inside the
 * AppShell (which keeps the shell visible); this is the catch-all for the
 * standalone routes and any shell-level failure.
 */
function KeyedBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <RouteErrorBoundary key={pathname}>{children}</RouteErrorBoundary>;
}

function dashboardRoutes(prefix = "") {
  const path = (route: string) => `${prefix}${route}`;

  return (
    <>
      <Route path={path("/overview")} element={<Overview />} />
      <Route path={path("/participants")} element={<Participants />} />
      <Route path={path("/participants/:id")} element={<ParticipantDetail />} />
      <Route path={path("/qa")} element={<QA />} />
      <Route path={path("/qa/:id")} element={<QA />} />
      <Route path={path("/results")} element={<Results />} />
      <Route path={path("/runs")} element={<Runs />} />
      <Route path={path("/redcap")} element={<Redcap />} />
      <Route path={path("/pipeline-health")} element={<PipelineHealth />} />
      <Route path={path("/matlab")} element={<Matlab />} />
      <Route path={path("/data-explorer")} element={<DataExplorer />} />
      <Route path={path("/publications")} element={<Publications />} />
      <Route path={path("/publications/:pmid")} element={<PublicationDetail />} />
      <Route path={path("/changelog")} element={<Changelog />} />
      <Route path={path("/presentation-maker")} element={<PresentationMaker />} />
      <Route path={path("/hda-player")} element={<HdaPlayer />} />
      <Route path={path("/thermal-heatmap")} element={<ThermalHeatmap />} />
      <Route path={path("/swimmer-plot")} element={<SwimmerPlot />} />
      <Route path={path("/attrition")} element={<Attrition />} />
      <Route path={path("/sdoh-map")} element={<SdohMap />} />
      <Route path={path("/shap-explorer")} element={<ShapExplorer />} />
      <Route path={path("/cluster-viewer")} element={<ClusterViewer />} />
      <Route path={path("/model-leaderboard")} element={<ModelLeaderboard />} />
      <Route path={path("/cascade-dag")} element={<CascadeDag />} />
      <Route path={path("/ecg-quality")} element={<EcgQuality />} />
      <Route path={path("/spatial-assessments")} element={<SpatialAssessmentMatrix />} />
      <Route path={path("/attachment-heatmap")} element={<AttachmentHeatmap />} />
      <Route path={path("/dyad-coregulation")} element={<CoRegulation />} />
      <Route path={path("/multimodal")} element={<MultimodalSynchrony />} />
      <Route path={path("/phase-portrait")} element={<PhasePortrait />} />
      <Route path={path("/cva-theater")} element={<CvaTheater />} />
      <Route path={path("/hr-deceleration")} element={<HrDeceleration />} />
      <Route path={path("/stillface")} element={<StillFace />} />
      <Route path={path("/hda-bypass")} element={<HdaBypass />} />
      <Route path={path("/passport")} element={<Passport />} />
      <Route path={path("/archetypes")} element={<Archetypes />} />
      <Route path={path("/cascade-sim")} element={<CascadeSimulator />} />
      <Route path={path("/eco-validity")} element={<EcoValidity />} />
      <Route path={path("/stream-coverage")} element={<StreamCoverage />} />
      <Route path={path("/cga-river")} element={<CgaMilestoneRiver />} />
      <Route path={path("/county-comparator")} element={<CountyComparator />} />
      <Route path={path("/participant-timeline")} element={<ParticipantTimeline />} />
      <Route path={path("/model-terrain")} element={<ModelConfidenceTerrain />} />
      <Route path={path("/attrition-funnel")} element={<AttritionFunnel />} />
      <Route path={path("/guided-explorer")} element={<GuidedExplorer />} />
      <Route path={path("/public-insights")} element={<PublicInsights />} />
      <Route path={path("/executive")} element={<ExecutiveMode />} />
      <Route path={path("/nano/lgcm-trajectories")} element={<LgcmTrajectories />} />
      <Route path={path("/nico/aim3-clusters")} element={<Aim3Clusters />} />
      <Route path={path("/nano")} element={<Navigate to={path("/nano/lgcm-trajectories")} replace />} />
      <Route path={path("/nico")} element={<Navigate to={path("/nico/aim3-clusters")} replace />} />
    </>
  );
}

function DiscoveryGate({ children }: { children: ReactNode }) {
  if (!isFeatureFlagEnabled("BRAND_ESD_2026")) return <Navigate to="/" replace />;
  return <>{children}</>;
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

function BrandRouteBoot() {
  const { pathname } = useLocation();
  const setBrand = useUi((s) => s.setBrand);

  useEffect(() => {
    setBrand(isDiscoveryPath(pathname) ? "esd-2026" : "default");
  }, [pathname, setBrand]);

  return null;
}

function NanoDashboardExperience() {
  const setChatOpen = useUi((state) => state.setChatOpen);
  const toggleChat = useUi((state) => state.toggleChat);

  useEffect(() => {
    const openBuddy = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggleChat();
      } else if (event.key === "Escape") {
        setChatOpen(false);
      }
    };
    window.addEventListener("keydown", openBuddy);
    return () => window.removeEventListener("keydown", openBuddy);
  }, [setChatOpen, toggleChat]);

  return (
    <>
      <NanoStudyDashboard />
      <ChatDrawer showLauncher={false} />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeBoot />
      <BrandRouteBoot />
      <Suspense fallback={<PageFallback />}>
        <KeyedBoundary>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/how-to" element={<HowTo />} />
            <Route
              path="/discovery"
              element={
                <DiscoveryGate>
                  <BrandScope>
                    <Landing />
                  </BrandScope>
                </DiscoveryGate>
              }
            />
            <Route
              path="/discovery/docs"
              element={
                <DiscoveryGate>
                  <BrandScope>
                    <Docs />
                  </BrandScope>
                </DiscoveryGate>
              }
            />
            <Route
              path="/discovery/how-to"
              element={
                <DiscoveryGate>
                  <BrandScope>
                    <HowTo />
                  </BrandScope>
                </DiscoveryGate>
              }
            />
            <Route element={<AppShell />}>
              {dashboardRoutes()}
            </Route>
            <Route path="/nano/dashboard" element={<NanoDashboardExperience />} />
            <Route
              element={
                <DiscoveryGate>
                  <AppShell brand="esd-2026" />
                </DiscoveryGate>
              }
            >
              {dashboardRoutes("/discovery")}
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </KeyedBoundary>
        <GuidedTourHost />
      </Suspense>
    </QueryClientProvider>
  );
}
