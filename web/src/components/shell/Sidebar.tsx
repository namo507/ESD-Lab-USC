import { NavLink } from "react-router-dom";
import { Icon } from "@/components/primitives";
import type { StudySummary } from "@/api/schemas";
import { isFeatureFlagEnabled } from "@/hooks/useFeatureFlag";
import type { FeatureFlag } from "@/config/featureFlags";

interface SidebarProps {
  study: StudySummary;
  qaPending: number;
  enrolled: number;
}

interface NavItem {
  to: string;
  label: string;
  icon: string;
  badge?: number;
  external?: boolean;
  flag?: FeatureFlag;
}

const NAV_GROUPS: Array<{ id: string; title: string; items: NavItem[] }> = [
  {
    id: "ops",
    title: "Lab Operations",
    items: [
      { to: "/overview", label: "Overview", icon: "layout-dashboard" },
      { to: "/participants", label: "Intakes & Stories", icon: "heart-handshake" },
      { to: "/qa", label: "Window QA", icon: "shield-check" },
    ],
  },
  {
    id: "studies",
    title: "Active Studies",
    items: [
      { to: "/overview", label: "NANO Study", icon: "activity" },
      { to: "/participants", label: "Home Study", icon: "home" },
      { to: "/participants", label: "FiSCAL-ASD", icon: "baby" },
    ],
  },
  {
    id: "data",
    title: "Data Infrastructure",
    items: [
      { to: "/runs", label: "Clinical Pipeline", icon: "git-branch" },
      { to: "/redcap", label: "REDCap Sync", icon: "refresh-cw" },
      { to: "/matlab", label: "MATLAB Bridge", icon: "function-square" },
      { to: "/results", label: "Results & Trajectories", icon: "line-chart" },
      { to: "/hda-player", label: "HDA Timeline", icon: "audio-lines", flag: "HDA_TIMELINE_PLAYER" },
      { to: "/thermal-heatmap", label: "Thermal Heatmap", icon: "thermometer-sun", flag: "THERMAL_HEATMAP" },
      { to: "/swimmer-plot", label: "Swimmer Plot", icon: "waves", flag: "SWIMMER_PLOT" },
      { to: "/attrition", label: "Attrition", icon: "git-merge", flag: "ATTRITION_FUNNEL" },
      { to: "/ecg-quality", label: "ECG Quality", icon: "heart-pulse", flag: "ECG_QUALITY_MONITOR" },
      { to: "/sdoh-map", label: "SDOH Map", icon: "map", flag: "SDOH_MAP" },
      { to: "/shap-explorer", label: "SHAP Explorer", icon: "scatter-chart", flag: "SHAP_BEESWARM" },
      { to: "/cluster-viewer", label: "Outcome Clusters", icon: "git-fork", flag: "CLUSTER_VIEWER" },
      { to: "/model-leaderboard", label: "Model Leaderboard", icon: "list-checks", flag: "MODEL_LEADERBOARD" },
      { to: "/cascade-dag", label: "Cascade DAG", icon: "network", flag: "CASCADE_DAG" },
    ],
  },
  {
    id: "dyn",
    title: "Dynamics & Dyads",
    items: [
      { to: "/dyad-coregulation", label: "Co-Regulation", icon: "git-merge", flag: "DYN_CO_REGULATION_BRAID" },
      { to: "/phase-portrait", label: "Phase Portrait", icon: "git-commit", flag: "DYN_AROUSAL_ATTENTION_PORTRAIT" },
      { to: "/cva-theater", label: "CVA Theater", icon: "eye", flag: "DYN_CVA_GAZE_THEATER" },
      { to: "/hr-deceleration", label: "HR Deceleration", icon: "activity", flag: "DYN_HR_DECELERATION_PROFILES" },
      { to: "/stillface", label: "Still-Face", icon: "pause-circle", flag: "DYN_STILLFACE_SUPPRESSION" },
      { to: "/hda-bypass", label: "HDA Bypass", icon: "shuffle", flag: "DYN_HDA_BYPASS_INDEX" },
      { to: "/passport", label: "Passport", icon: "id-card", flag: "DYN_INFANT_PASSPORT" },
      { to: "/archetypes", label: "Archetypes", icon: "git-branch", flag: "DYN_TRAJECTORY_ARCHETYPES" },
      { to: "/cascade-sim", label: "Cascade Sim", icon: "sliders", flag: "DYN_CASCADE_SIMULATOR" },
      { to: "/eco-validity", label: "Eco-Validity", icon: "scale", flag: "DYN_ECOVALIDITY_EQUITY" },
      { to: "/stream-coverage", label: "Stream Coverage", icon: "layers", flag: "DYN_STREAM_COVERAGE" },
    ],
  },
  {
    id: "tools",
    title: "Lab Tools",
    items: [
      { to: "/presentation-maker", label: "Presentation Maker", icon: "presentation" },
      { to: "/spatial-assessments", label: "Spatial Matrix", icon: "grid-3x3", flag: "SPATIAL_ASSESSMENT_MATRIX" },
      { to: "/attachment-heatmap", label: "Attachment Heatmap", icon: "table-2", flag: "ATTACHMENT_HEATMAP" },
    ],
  },
];

export function Sidebar({ study, qaPending, enrolled }: SidebarProps) {
  return (
    <aside
      className="w-60 flex-shrink-0 bg-white border-r border-[color:var(--warm-border)] py-5 px-3.5 flex flex-col gap-6 sticky top-0 self-start h-screen overflow-y-auto"
      aria-label="Primary navigation"
    >
      <div className="px-2">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-serif font-bold text-lg"
            style={{
              background: "linear-gradient(135deg, var(--usc-garnet) 0%, #a51124 100%)",
              boxShadow: "0 4px 12px rgba(115,0,10,0.25)",
            }}
            aria-hidden
          >
            e
          </div>
          <div>
            <div className="font-serif text-[15px] font-semibold text-[color:var(--warm-fg1)] -tracking-[0.01em]">
              ESD Lab
            </div>
            <div className="text-[10px] font-mono text-[color:var(--warm-fg4)] tracking-[0.04em]">
              UofSC · IMB
            </div>
          </div>
        </div>
      </div>

      {NAV_GROUPS.map((g) => (
        <div key={g.id}>
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--warm-fg4)]">
            {g.title}
          </div>
          <div className="flex flex-col gap-px">
            {g.items.filter((it) => !it.flag || isFeatureFlagEnabled(it.flag)).map((it, i) => {
              const badge =
                it.label === "Window QA" && qaPending > 0
                  ? qaPending
                  : it.label === "NANO Study"
                    ? enrolled
                    : undefined;
              return (
                <NavLink
                  key={`${g.id}-${i}`}
                  to={it.to}
                  end={it.to === "/overview"}
                  className={({ isActive }) =>
                    `relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-sans text-left transition ${
                      isActive
                        ? "bg-[color:var(--vpt-bg)] text-garnet font-semibold"
                        : "text-[color:var(--warm-fg2)] hover:bg-[color:var(--warm-pill)]"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span
                          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-sm bg-garnet"
                          aria-hidden
                        />
                      )}
                      <Icon name={it.icon} size={16} stroke={1.5} color={isActive ? "var(--usc-garnet)" : "var(--warm-fg2)"} />
                      <span className="flex-1">{it.label}</span>
                      {badge !== undefined && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-px rounded-full ${
                            isActive ? "bg-garnet text-white" : "bg-[color:var(--slate-100)] text-[color:var(--warm-fg3)]"
                          }`}
                        >
                          {badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}

      <div className="mt-auto p-3 bg-[color:var(--warm-pill)] rounded-xl text-[11px] text-[color:var(--warm-fg3)] leading-relaxed">
        <div className="font-serif text-[13px] text-[color:var(--warm-fg2)] font-semibold mb-1">
          Dr. Bradshaw&apos;s lab
        </div>
        Institute for Mind &amp; Brain
        <br />
        1800 Gervais St · Columbia, SC
        <br />
        <span className="text-[color:var(--warm-fg4)] font-mono text-[10px]">
          {study.enrolled} / {study.target} enrolled · year 3
        </span>
      </div>
    </aside>
  );
}
