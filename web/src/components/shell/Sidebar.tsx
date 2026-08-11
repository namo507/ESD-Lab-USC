import { NavLink, useLocation } from "react-router-dom";
import { Badge, Icon } from "@/components/primitives";
import type {
  DashboardMetrics,
  DashboardSourceState,
  DashboardStudyMetrics,
} from "@/api/dashboardMetrics";
import { DataProvenance } from "@/components/data/DataProvenance";
import { StudySelector } from "./StudySelector";
import { DOC_ROUTE, HOW_TO_ROUTE } from "@/data/helpContent";
import { isFeatureFlagEnabled } from "@/hooks/useFeatureFlag";
import { FEATURE_FLAG_RELEASE_DATES, type FeatureFlag } from "@/config/featureFlags";
import { isDiscoveryPath, toDiscoveryRoute } from "@/lib/discoveryRoutes";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  study: DashboardStudyMetrics | null;
  sourceState: DashboardSourceState;
  qaPending: number;
  executiveMode?: boolean;
  /** Full payload, forwarded to the study selector for enrollment counts. */
  metrics?: DashboardMetrics | null;
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
      { to: DOC_ROUTE, label: "Documentation", icon: "book-open" },
      { to: HOW_TO_ROUTE, label: "Help / Tour", icon: "compass" },
    ],
  },
  {
    id: "studies",
    title: "Active Studies",
    items: [
      { to: "/overview", label: "NANO Study (VPT)", icon: "activity" },
      { to: "/participants?study=home", label: "Home Study", icon: "home" },
      { to: "/participants?study=fiscal", label: "FiSCAL-ASD", icon: "baby" },
    ],
  },
  {
    id: "dual-study",
    title: "NANO · NICO Studies",
    items: [
      { to: "/nano/dashboard", label: "NANO Study", icon: "layout-dashboard" },
      { to: "/nano/lgcm-trajectories", label: "LGCM Trajectories", icon: "line-chart", flag: "NANO_LGCM_TRAJECTORIES" },
      { to: "/nico/aim3-clusters", label: "Aim 3 Clusters", icon: "git-fork", flag: "NICO_AIM3_CLUSTERS" },
    ],
  },
  {
    id: "data",
    title: "Data Infrastructure",
    items: [
      { to: "/runs", label: "Clinical Pipeline", icon: "git-branch" },
      { to: "/redcap", label: "REDCap Sync", icon: "refresh-cw" },
      { to: "/pipeline-health", label: "Pipeline Health", icon: "server-cog", flag: "REDCAP_PIPELINE_HEALTH" },
      { to: "/matlab", label: "MATLAB Bridge", icon: "function-square" },
      { to: "/data-explorer", label: "Data Explorer", icon: "table", flag: "SQL_TABLE_EXPLORER" },
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
    id: "science",
    title: "Science",
    items: [
      { to: "/publications", label: "Publications", icon: "book-open", flag: "PUBLICATIONS_FEED" },
    ],
  },
  {
    id: "insights",
    title: "Insights & Demos",
    items: [
      { to: "/guided-explorer", label: "Guided Explorer", icon: "compass", flag: "GUIDED_EXPLORER" },
      { to: "/public-insights", label: "Public Insights", icon: "bar-chart-3", flag: "PUBLIC_INSIGHTS" },
      { to: "/cga-river", label: "CGA River", icon: "waves", flag: "CGA_RIVER" },
      { to: "/county-comparator", label: "County Compare", icon: "map", flag: "COUNTY_COMPARATOR" },
      { to: "/participant-timeline", label: "Participant Timeline", icon: "calendar-range", flag: "PARTICIPANT_TIMELINE_V2" },
      { to: "/model-terrain", label: "Model Terrain", icon: "mountain", flag: "MODEL_CONFIDENCE_TERRAIN" },
      { to: "/attrition-funnel", label: "Attrition Funnel", icon: "filter", flag: "ATTRITION_FUNNEL_V2" },
      { to: "/executive", label: "Executive Mode", icon: "presentation", flag: "EXECUTIVE_MODE" },
    ],
  },
  {
    id: "dyn",
    title: "Dynamics & Dyads",
    items: [
      { to: "/dyad-coregulation", label: "Co-Regulation", icon: "git-merge", flag: "DYN_CO_REGULATION_BRAID" },
      { to: "/multimodal", label: "Multimodal Sync", icon: "audio-lines", flag: "MULTIMODAL_SYNCHRONY" },
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
  {
    id: "admin",
    title: "Admin",
    items: [
      { to: "/changelog", label: "Change History", icon: "clock", flag: "DATA_CHANGELOG" },
    ],
  },
  {
    id: "brand-preview",
    title: "Brand Preview · 2026",
    items: [
      { to: "/discovery", label: "Discovery Landing", icon: "wand-sparkles", flag: "BRAND_ESD_2026" },
      { to: "/discovery/overview", label: "Discovery Overview", icon: "layout-dashboard", flag: "BRAND_ESD_2026" },
      { to: "/discovery/public-insights", label: "Discovery Insights", icon: "bar-chart-3", flag: "BRAND_ESD_2026" },
    ],
  },
];

const EXECUTIVE_NAV_GROUPS: Array<{ id: string; title: string; items: NavItem[] }> = [
  {
    id: "executive",
    title: "Executive View",
    items: [
      { to: "/executive", label: "Executive", icon: "presentation", flag: "EXECUTIVE_MODE" },
      { to: "/overview", label: "Overview", icon: "layout-dashboard" },
      { to: "/pipeline-health", label: "Pipeline Health", icon: "server-cog", flag: "REDCAP_PIPELINE_HEALTH" },
      { to: "/public-insights", label: "Public Insights", icon: "bar-chart-3", flag: "PUBLIC_INSIGHTS" },
      { to: "/results", label: "Results", icon: "line-chart" },
      { to: "/attrition-funnel", label: "Retention", icon: "git-merge", flag: "ATTRITION_FUNNEL_V2" },
      { to: "/model-leaderboard", label: "Model Leaderboard", icon: "list-checks", flag: "MODEL_LEADERBOARD" },
    ],
  },
];

const CORE_NAV_ITEMS: NavItem[] = [
  { to: "/overview", label: "Overview", icon: "layout-dashboard" },
  { to: "/nano/attention", label: "Attention & Autonomic", icon: "activity" },
  { to: "/nano/lgcm-trajectories", label: "LGCM Trajectories", icon: "line-chart", flag: "NANO_LGCM_TRAJECTORIES" },
  { to: DOC_ROUTE, label: "Documentation", icon: "book-open" },
];

const CORE_ROUTE_KEYS = new Set(CORE_NAV_ITEMS.map((item) => `${item.to}|${item.label}`));

export function Sidebar({ study, sourceState, qaPending, executiveMode = false, metrics }: SidebarProps) {
  const location = useLocation();
  const groups = executiveMode
    ? EXECUTIVE_NAV_GROUPS
    : NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => !CORE_ROUTE_KEYS.has(`${item.to}|${item.label}`)),
      })).filter((group) => group.items.length > 0);
  const coreItems = executiveMode ? [] : CORE_NAV_ITEMS;
  const inDiscovery = isDiscoveryPath(location.pathname);
  const isNew = (flag?: FeatureFlag) => {
    if (!flag) return false;
    const releaseDate = FEATURE_FLAG_RELEASE_DATES[flag];
    if (!releaseDate) return false;
    return Date.now() < new Date(releaseDate).getTime() + 14 * 24 * 60 * 60 * 1000;
  };

  const renderItem = (it: NavItem, key: string, core = false) => {
    const to = inDiscovery && it.to !== "/nano/dashboard" ? toDiscoveryRoute(it.to) : it.to;
    const badge =
      it.label === "Window QA" && qaPending > 0
        ? qaPending
        : it.label === "NANO Study (VPT)"
          ? study?.enrollment ?? undefined
          : undefined;

    return (
      <NavLink
        key={key}
        to={to}
        end={it.to === "/overview" || to === "/discovery/overview"}
        data-tour={
          it.label === "Documentation"
            ? "operator-docs"
            : it.label === "Help / Tour"
              ? "operator-help"
              : undefined
        }
        className={({ isActive }) => `${styles.navItem} ${core ? styles.coreItem : ""} ${isActive ? styles.active : ""}`}
      >
        {({ isActive }) => (
          <>
            <span className={styles.navIcon} aria-hidden>
              <Icon name={it.icon} size={core ? 15 : 14} stroke={1.7} color={isActive ? "var(--esd-discovery-blue, #3366ff)" : "currentColor"} />
            </span>
            <span className={styles.navLabel}>{it.label}</span>
            {isNew(it.flag) && <Badge kind="neutral" size="sm">NEW</Badge>}
            {badge !== undefined && (
              <span className={`${styles.badge} ${isActive ? styles.badgeActive : ""} ${it.label === "Window QA" && qaPending > 0 ? "badge-pending" : ""}`}>
                {badge}
              </span>
            )}
          </>
        )}
      </NavLink>
    );
  };

  return (
    <aside className={styles.sidebar} aria-label="Primary navigation">
      <NavLink to={inDiscovery ? "/discovery" : "/"} className={styles.brand} aria-label="ESD Lab home">
        <span className={styles.brandMark} data-brand-mark="esd" aria-hidden />
        <span>
          <span className={styles.brandName}>ESD Lab</span>
          <span className={styles.brandMeta}>UofSC · IMB</span>
        </span>
      </NavLink>

      {!executiveMode && (
        <div className={styles.studyBlock}>
          <div className={`${styles.studyCard} surface-card`}>
            <span className={styles.eyebrow}>Active study</span>
            <div className={styles.studyName}>NANO</div>
            <div className={styles.studyMeta}>
              Survey enrollment · {study?.enrollment?.toLocaleString() ?? "—"} / {study?.target?.toLocaleString() ?? "—"}
            </div>
            <DataProvenance source={sourceState} detail="" compact />
            {study?.enrollment !== null && study?.enrollment !== undefined && study.target ? (
              <div
                className={styles.progress}
                role="progressbar"
                aria-label={`${study.enrollment} of ${study.target} enrolled`}
                aria-valuemin={0}
                aria-valuemax={study.target}
                aria-valuenow={study.enrollment}
              >
                <span style={{ width: `${Math.min(100, (study.enrollment / study.target) * 100)}%` }} />
              </div>
            ) : null}
          </div>
          <div className={styles.studyScope}><StudySelector metrics={metrics} /></div>
        </div>
      )}

      {coreItems.length > 0 && (
        <nav className={styles.coreNav} aria-label="Study areas">
          <div className={styles.groupLabel}>Areas</div>
          {coreItems.filter((it) => !it.flag || isFeatureFlagEnabled(it.flag)).map((it, index) => renderItem(it, `core-${index}`, true))}
        </nav>
      )}

      <details className={styles.surfaceDirectory}>
        <summary className={styles.directoryIntro}>
          <span>All lab surfaces</span>
          <span className={styles.directoryCount}>Browse</span>
        </summary>
        <div className={styles.directoryGroups}>
          {groups.map((group) => (
            <section className={styles.group} key={group.id} aria-labelledby={`sidebar-${group.id}`}>
              <h2 className={styles.groupLabel} id={`sidebar-${group.id}`}>{group.title}</h2>
              <div className={styles.groupItems}>
                {group.items
                  .filter((item) => !item.flag || isFeatureFlagEnabled(item.flag))
                  .map((item, index) => renderItem(item, `${group.id}-${index}`))}
              </div>
            </section>
          ))}
        </div>
      </details>

      <div className={styles.sidebarFooter}>
        <div className={styles.searchNote}>
          <strong>42 more surfaces live behind search.</strong>
          <span><kbd>⌘K</kbd> Ask ESD Buddy</span>
        </div>
        <details className={styles.shortcuts}>
          <summary>Keyboard shortcuts</summary>
          <div>
            <span>Cmd/Ctrl + K · ESD Buddy</span>
            <span>Arrow keys · scrub timelines</span>
            <span>Space · play/pause players</span>
          </div>
        </details>
        <p className={styles.privacyNote}>Aggregate only. No PHI.<br />Dr. Bradshaw · Institute for Mind &amp; Brain</p>
      </div>
    </aside>
  );
}
