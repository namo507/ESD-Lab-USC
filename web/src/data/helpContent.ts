export const DOC_ROUTE = "/docs";
export const HOW_TO_ROUTE = "/how-to";

export type TourTrack = "public" | "operator";

export interface HelpInsight {
  term: string;
  body: string;
}

export interface HelpAssistantPrompt {
  lane: "qa" | "model" | "redcap" | "matlab" | "dyn";
  label: string;
  prompt: string;
}

export interface GlossaryTerm {
  term: string;
  definition: string;
  source: "dashboard" | "todo";
}

export interface ReferenceEntry {
  title: string;
  href: string;
  summary: string;
  interactions: string[];
  liveFields?: string[];
}

export interface OperatorReference extends ReferenceEntry {
  group: string;
}

export interface DataLayerDoc {
  title: string;
  subtitle: string;
  detail: string;
}

export type HowToFigureKind =
  | "landing-hero"
  | "nav"
  | "pipeline"
  | "aim"
  | "architecture"
  | "cohort"
  | "studio"
  | "assistant"
  | "library"
  | "operator-shell"
  | "operator-topbar";

export interface HowToSubLink {
  label: string;
  to: string;
}

export interface HowToCard {
  id: string;
  title: string;
  goal: string;
  steps: string[];
  figure: {
    label: string;
    kind: HowToFigureKind;
    pins: Array<{ n: number; label: string; x: number; y: number }>;
  };
  track: TourTrack;
  /** Primary "open the real surface" destination for this task. */
  route: string;
  /** Extra deep links to the concrete routes this task touches. */
  links: HowToSubLink[];
}

export interface TourStep {
  id: string;
  target: string;
  title: string;
  body: string;
  route: string;
}

export const HELP_INSIGHTS: Record<string, HelpInsight> = {
  "docs-hub": {
    term: "Documentation",
    body: "This reference explains the public landing, operator console, glossary, data flow, assistant, privacy model, and live refresh sources from one place.",
  },
  "howto-hub": {
    term: "How-to",
    body: "The how-to area gives short task cards, annotated figures, and Buddy-led tours so new lab members can learn by reading or walking the live interface.",
  },
  "tour-trigger": {
    term: "Guided tour",
    body: "The tour uses real dashboard targets, stores only a non-clinical completion flag, and falls back to static figures for reduced-motion users.",
  },
  "assistant-help-context": {
    term: "Assistant help context",
    body: "Docs, how-to cards, and tour steps share one content module so Buddy and Ask AI can stay current when dashboard features are added.",
  },
};

export const HELP_ASSISTANT_FAST_PATHS: HelpAssistantPrompt[] = [
  {
    lane: "model",
    label: "Dashboard orientation",
    prompt: "Walk me through the NANO dashboard surfaces, including when to use the public landing, documentation, how-to tour, and operator console.",
  },
  {
    lane: "qa",
    label: "How to read pipeline",
    prompt: "Explain how to read the six NANO pipeline stages, including in-flight, done, fail, and when an operator should open run history.",
  },
  {
    lane: "model",
    label: "Feature tour",
    prompt: "Give me a beginner-friendly tour of the landing page features, then tell me which section to inspect first.",
  },
  {
    lane: "redcap",
    label: "Privacy checklist",
    prompt: "Summarize the dashboard privacy safeguards: de-identification, REDCap proxy stripping, PHI leak indicators, audit logging, and assistant prompt scrubbing.",
  },
];

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  { term: "NANO Study", source: "dashboard", definition: "A longitudinal infant study that follows physiology, attention, visit context, and later outcomes through one de-identified clinical pipeline." },
  { term: "HDA", source: "dashboard", definition: "Heart-Defined Attention. The dashboard uses ECG-derived heart-rate changes to label orienting, sustained attention, inattention, and termination windows." },
  { term: "Orienting", source: "dashboard", definition: "An HDA phase that marks the initial attention shift toward a stimulus or interaction." },
  { term: "Sustained attention", source: "dashboard", definition: "An HDA phase where the infant remains engaged after orienting, shown as the primary attention-pulse share on the landing page." },
  { term: "Inattention", source: "dashboard", definition: "An HDA phase for windows where the attention pattern is no longer engaged with the target stream." },
  { term: "Termination", source: "dashboard", definition: "An HDA phase that marks the end of a sustained attention episode." },
  { term: "VPT", source: "dashboard", definition: "Very preterm cohort. The dashboard uses this label as one of the main comparison groups." },
  { term: "ASIB", source: "dashboard", definition: "Autism sibling cohort. The dashboard uses this group to compare infants with elevated familial likelihood." },
  { term: "TD", source: "dashboard", definition: "Typically developing, term-born comparison cohort." },
  { term: "CGA", source: "dashboard", definition: "Corrected gestational age, used in visit labels such as cga_12mo so timing is comparable across infants." },
  { term: "RMSSD", source: "dashboard", definition: "Root mean square of successive differences between heartbeats. It is a vagal-tone HRV summary derived from accepted ECG windows." },
  { term: "RSA", source: "dashboard", definition: "Respiratory sinus arrhythmia, a parasympathetic regulation signal used in trajectory and model features." },
  { term: "HRV", source: "dashboard", definition: "Heart rate variability. The dashboard computes time-domain and frequency-domain summaries after ECG preprocessing and QA." },
  { term: "Epoch", source: "dashboard", definition: "A 5-second ECG segment. Epochs are the working unit for QA, HRV features, and HDA labels." },
  { term: "Actiheart-5", source: "dashboard", definition: "The chest ECG device used for continuous 1024 Hz infant physiology capture." },
  { term: "Pan-Tompkins R-peak detection", source: "dashboard", definition: "The R-peak detection method named in the preprocessing pipeline before inter-beat intervals and HRV features are computed." },
  { term: "CWT", source: "dashboard", definition: "Continuous wavelet transform, used in the operator copy for RSA and frequency-domain signal processing." },
  { term: "SHAP attribution", source: "dashboard", definition: "Feature-attribution output used to explain which model inputs moved a prediction or model summary." },
  { term: "DBSCAN cluster shifts", source: "dashboard", definition: "Cluster movement summaries used in model and operations prompts to compare current patterns with a baseline." },
  { term: "HeRO HRC scores", source: "todo", definition: "TODO: confirm with lab." },
  { term: "DataVyu video coding", source: "todo", definition: "TODO: confirm with lab." },
  { term: "Dual-thermistor thermal gradients", source: "dashboard", definition: "Thermal signals named in the operator console as part of the de-identified multimodal export." },
  { term: "SQI", source: "dashboard", definition: "Signal quality index. The QA surface scores ECG epochs so marginal windows can be accepted, rejected, or reviewed." },
  { term: "REDCap", source: "dashboard", definition: "The study form and metadata system. The dashboard reads de-identified payloads through a proxy and never exposes PHI fields." },
  { term: "Assistant providers", source: "dashboard", definition: "ESD Buddy answers through a backend-routed provider chain: Gemini first, then NVIDIA Nemotron, then a local model. Browser prompts are PHI-scrubbed, and provider credentials never reach the page." },
  { term: "ADOS-2 CSS", source: "todo", definition: "TODO: confirm with lab." },
  { term: "XGBoost", source: "dashboard", definition: "The gradient-boosted model family shown in the Model Studio and model-card surfaces." },
  { term: "Trajectory", source: "dashboard", definition: "A longitudinal trend across visits, cohorts, or features, usually shown as a cohort-level line or river." },
  { term: "Parquet", source: "dashboard", definition: "The columnar file format used for de-identified processed exports and MATLAB handoffs." },
  { term: "Long-form export", source: "dashboard", definition: "A de-identified table where each row represents a comparable unit such as an epoch, feature, visit, or merged observation." },
  { term: "PHI", source: "dashboard", definition: "Protected health information. The dashboard surfaces de-identified NANO IDs and keeps PHI out of browser-visible data." },
  { term: "HIPAA", source: "dashboard", definition: "The privacy and audit framework named by the dashboard for PHI handling, logging, session behavior, and exports." },
  { term: "De-identification", source: "dashboard", definition: "The stripping of direct identifiers before processed data reaches dashboard routes, exports, and assistant context." },
  { term: "IRB", source: "dashboard", definition: "Institutional Review Board protocol context. The operator console displays protocol Pro00115234." },
];

export const DATA_LAYERS: DataLayerDoc[] = [
  {
    title: "Edge capture",
    subtitle: "Devices and sensors",
    detail: "Actiheart-5 ECG, head-mounted eye tracking, visit logs, and caregiver context begin the data path.",
  },
  {
    title: "REDCap and forms",
    subtitle: "Metadata and capture",
    detail: "Visit intake, consent, demographics, questionnaires, device manifests, and site scheduling metadata are linked through de-identified study IDs.",
  },
  {
    title: "SQI and HDA labels",
    subtitle: "Preprocess and QA",
    detail: "Filtering, R-peak detection, epoch-level signal quality, and attention phase labels turn raw capture into reviewable windows.",
  },
  {
    title: "Parquet outputs",
    subtitle: "Features and long-form tables",
    detail: "Accepted windows become HRV features, HDA tables, and merged de-identified exports that routes and analyses can reuse.",
  },
  {
    title: "XGBoost and trajectories",
    subtitle: "Models and inference",
    detail: "Trajectory models, attribution surfaces, and calibrated prediction summaries sit downstream of accepted and merged features.",
  },
];

export const LANDING_REFERENCES: ReferenceEntry[] = [
  {
    title: "Overview and hero",
    href: "/#overview",
    summary: "Frames the NANO Study, attention pulse, live ECG ribbon, study card, enrollment banner, assistant entry, and operator toggle.",
    interactions: ["Open assistant", "Explore aims", "Open operator detail", "Take the tour"],
    liveFields: ["Enrollment", "RMSSD", "Epochs", "Queued runs", "HDA phase mix"],
  },
  {
    title: "Metrics",
    href: "/#metrics",
    summary: "Shows the lab pulse cards for enrollment, 24-hour epochs, median RMSSD, assistant-ready context, and optional Dynamics and Dyads previews.",
    interactions: ["Open feature-flagged dyad routes", "Hover Buddy insights"],
    liveFields: ["Enrollment", "Epoch counts", "RMSSD", "HDA-labeled context"],
  },
  {
    title: "Aims",
    href: "/#aims",
    summary: "Explains the three study questions, each with hypothesis, method, outcome, cohort context, and an Ask about Aim prompt.",
    interactions: ["Expand or collapse aims", "Ask about Aim 01, 02, or 03"],
  },
  {
    title: "Architecture",
    href: "/#architecture",
    summary: "Shows the five-layer data path from chest ECG capture to models and trajectories.",
    interactions: ["Select a layer", "Open pipeline detail", "Open REDCap sync"],
  },
  {
    title: "Pipeline",
    href: "/#pipeline",
    summary: "Lists the six live pipeline stages with in-flight work, done counts, fail counts, and short stage descriptions.",
    interactions: ["Open run history", "Open a stage in the operator route"],
    liveFields: ["Stage inflight", "Stage done", "Stage fail"],
  },
  {
    title: "QA",
    href: "/#qa",
    summary: "Summarizes the pipeline watchlist and recent participant flow so quality and movement are visible before opening the console.",
    interactions: ["Ask the assistant", "Open participant rows"],
    liveFields: ["Failures", "Latest run", "Recent participants"],
  },
  {
    title: "Cohort",
    href: "/#cohort",
    summary: "Shows de-identified participant rows with participant ID, group, visit, site, and QA status.",
    interactions: ["Filter by group", "Open participant table", "Open participant detail"],
    liveFields: ["Participants", "Group", "Visit", "Site", "Status"],
  },
  {
    title: "Model performance",
    href: "/#ml",
    summary: "Displays cohort trajectory, HDA phase composition, and model-card metrics before users enter dense analytics routes.",
    interactions: ["Open results", "Hover Buddy insights"],
  },
  {
    title: "Model Studio",
    href: "/#studio",
    summary: "Lets users adjust illustrative infant-profile sliders and see the risk gauge move without changing study data.",
    interactions: ["Move sliders", "Reset inputs", "Explain features"],
  },
  {
    title: "Assistant",
    href: "/#assistant",
    summary: "Provides starter chips for asking about the NANO Study, HDA, classifier validation, and what a clinician should inspect first.",
    interactions: ["Open starter chips", "Ask follow-up questions"],
  },
  {
    title: "Library",
    href: "/#library",
    summary: "Searches the reading library and shows source composition, publication cadence, reading depth, frequent terms, and summary actions.",
    interactions: ["Search title, author, or abstract", "Select source bars", "Summarize a reading"],
    liveFields: ["Indexed readings", "Pages", "Sources", "Index date"],
  },
];

export const OPERATOR_REFERENCES: OperatorReference[] = [
  { group: "Top bar", title: "Ask the lab search", href: "/overview", summary: "Seeds ESD Buddy with the typed operational question and opens the assistant on focus or Enter.", interactions: ["Focus search", "Press Enter", "Use Cmd or Ctrl plus K"] },
  { group: "Top bar", title: "Session timer", href: "/overview", summary: "Shows the HIPAA idle timer so operators can track session age.", interactions: ["Open run context from the timer"] },
  { group: "Top bar", title: "Landing", href: "/", summary: "Returns from the operator console to the public narrative landing surface.", interactions: ["Open Landing"] },
  { group: "Top bar", title: "System", href: "/overview", summary: "Theme and system controls live in the top chrome so display mode stays consistent across routes.", interactions: ["Cycle the theme"] },
  { group: "Top bar", title: "Force Sync", href: "/overview", summary: "Invalidates dashboard queries, updates the last-sync timestamp, and accelerates visible sync feedback.", interactions: ["Run Force Sync", "Read sync status"] },
  { group: "Compliance", title: "PHI processing banner", href: "/overview", summary: "Confirms HIPAA-compliant audit logging, REDCap proxy identifier stripping, assistant prompt scrubbing, IRB protocol, and session age.", interactions: ["Dismiss in development", "Read IRB protocol"] },
  { group: "Lab Operations", title: "Overview", href: "/overview", summary: "The working lab cockpit with KPIs, live pipeline DAG, readings context, agent QA, and participant flow.", interactions: ["Open stage detail", "Inspect KPI Buddy tips"] },
  { group: "Lab Operations", title: "Intakes and Stories", href: "/participants", summary: "Participant table and intake narrative surface for de-identified NANO IDs.", interactions: ["Filter participants", "Open participant detail"] },
  { group: "Lab Operations", title: "Window QA", href: "/qa", summary: "Epoch-level signal quality review for accepting, rejecting, or reviewing ECG windows.", interactions: ["Inspect epoch tiles", "Apply QA decisions"] },
  { group: "Active Studies", title: "NANO Study VPT", href: "/overview", summary: "Sidebar shortcut for the active VPT-focused NANO study count.", interactions: ["Open overview"] },
  { group: "Active Studies", title: "Home Study", href: "/participants?study=home", summary: "Study-specific intake filter for home-study operations.", interactions: ["Open filtered participants"] },
  { group: "Active Studies", title: "FiSCAL-ASD", href: "/participants?study=fiscal", summary: "Study-specific intake filter for FiSCAL-ASD operations.", interactions: ["Open filtered participants"] },
  { group: "Data Infrastructure", title: "Clinical Pipeline", href: "/runs", summary: "Run history and pipeline logs for current and prior processing work.", interactions: ["Open run history"] },
  { group: "Data Infrastructure", title: "REDCap Sync", href: "/redcap", summary: "Secure REDCap payload, completeness, carry-forward, and freshness route.", interactions: ["Review sync health", "Inspect completeness"] },
  { group: "Data Infrastructure", title: "Pipeline Health", href: "/pipeline-health", summary: "Runtime parity, ops freshness, dashboard controls, and assistant context readiness.", interactions: ["Check Pages, Docker, K8s, and assistant parity"] },
  { group: "Data Infrastructure", title: "MATLAB Bridge", href: "/matlab", summary: "Tracks Parquet handoff from secure MATLAB processing into the Python dashboard stack.", interactions: ["Review file inventory", "Ask Buddy"] },
  { group: "Data Infrastructure", title: "Results and Trajectories", href: "/results", summary: "Trajectory and model results route for cohort-level physiology and outcomes.", interactions: ["Inspect trajectories"] },
  { group: "Data Infrastructure", title: "HDA Timeline", href: "/hda-player", summary: "Player for reviewing HDA phase timelines and compare mode.", interactions: ["Scrub timeline", "Compare sessions"] },
  { group: "Data Infrastructure", title: "Thermal Heatmap", href: "/thermal-heatmap", summary: "Thermal gradient visualization for de-identified multimodal review.", interactions: ["Inspect heatmap"] },
  { group: "Data Infrastructure", title: "Swimmer Plot", href: "/swimmer-plot", summary: "Longitudinal visit-completion swimmer plot.", interactions: ["Scan visit completion"] },
  { group: "Data Infrastructure", title: "Attrition", href: "/attrition", summary: "Retention and attrition route for stage-level follow-through.", interactions: ["Open funnel detail"] },
  { group: "Data Infrastructure", title: "ECG Quality", href: "/ecg-quality", summary: "ECG quality monitor with SQI, artifacts, and review queues.", interactions: ["Review SQI and artifact markers"] },
  { group: "Data Infrastructure", title: "SDOH Map", href: "/sdoh-map", summary: "Aggregate social determinants map, kept away from row-level location identifiers.", interactions: ["Review county context"] },
  { group: "Data Infrastructure", title: "Data Explorer", href: "/data-explorer", summary: "De-identified virtual tables for participants, runs, stages, and REDCap events.", interactions: ["Sort", "Filter", "Export visible rows"] },
  { group: "Data Infrastructure", title: "SHAP Explorer", href: "/shap-explorer", summary: "Model attribution route for reading feature influence without treating attribution as causality.", interactions: ["Inspect feature influence"] },
  { group: "Data Infrastructure", title: "Outcome Clusters", href: "/cluster-viewer", summary: "Cluster route for reviewing de-identified outcome patterns and shifts.", interactions: ["Inspect clusters"] },
  { group: "Data Infrastructure", title: "Model Leaderboard", href: "/model-leaderboard", summary: "Compares candidate models across validation metrics and model-card context.", interactions: ["Compare metrics"] },
  { group: "Data Infrastructure", title: "Cascade DAG", href: "/cascade-dag", summary: "Directed cascade visualization for developmental pathway context.", interactions: ["Inspect paths"] },
  { group: "Science", title: "Publications", href: "/publications", summary: "Indexed publication feed with tags, citations, and detail pages kept separate from participant identifiers.", interactions: ["Search publications", "Open details", "Copy citations"] },
  { group: "Insights and Demos", title: "Guided Explorer", href: "/guided-explorer", summary: "Hypothesis-card explorer that routes users into selected insight surfaces.", interactions: ["Choose a guided question"] },
  { group: "Insights and Demos", title: "Public Insights", href: "/public-insights", summary: "Aggregate-only public charts and privacy context for external or grant-facing views.", interactions: ["Read aggregate charts"] },
  { group: "Insights and Demos", title: "CGA River", href: "/cga-river", summary: "Corrected-age river view of HDA phase composition across milestones.", interactions: ["Filter cohort", "Read ribbons"] },
  { group: "Insights and Demos", title: "County Compare", href: "/county-comparator", summary: "County-level aggregate comparison for outreach and SDOH context.", interactions: ["Compare counties"] },
  { group: "Insights and Demos", title: "Participant Timeline", href: "/participant-timeline", summary: "De-identified timeline of visits, QA flags, pipeline runs, failures, and REDCap milestones.", interactions: ["Inspect timeline marks"] },
  { group: "Insights and Demos", title: "Model Terrain", href: "/model-terrain", summary: "Model confidence contours and heatmap fallback for feature-time influence.", interactions: ["Switch mode", "Read contours"] },
  { group: "Insights and Demos", title: "Attrition Funnel", href: "/attrition-funnel", summary: "Retention funnel with stage counts, drop-off, reason context, and report-ready copy.", interactions: ["Open stage detail"] },
  { group: "Insights and Demos", title: "Executive Mode", href: "/executive", summary: "Simplified executive route for key metrics and export-ready summaries.", interactions: ["Review summary", "Export when available"] },
  { group: "Dynamics and Dyads", title: "Co-Regulation", href: "/dyad-coregulation", summary: "Caregiver-infant autonomic synchrony, lead-lag, and lag-surface route.", interactions: ["Inspect synchrony"] },
  { group: "Dynamics and Dyads", title: "Multimodal Sync", href: "/multimodal", summary: "Synchrony windows across physiology, HDA, gaze, and related modalities.", interactions: ["Review gold windows"] },
  { group: "Dynamics and Dyads", title: "Phase Portrait", href: "/phase-portrait", summary: "Arousal-attention state-space route with adaptive occupancy and recovery metrics.", interactions: ["Inspect trajectory"] },
  { group: "Dynamics and Dyads", title: "CVA Theater", href: "/cva-theater", summary: "Coordinated visual attention route for gaze ribbons and caregiver scaffolding context.", interactions: ["Scrub gaze context"] },
  { group: "Dynamics and Dyads", title: "HR Deceleration", href: "/hr-deceleration", summary: "Event-locked heart-rate deceleration profiles around sustained attention.", interactions: ["Compare curves"] },
  { group: "Dynamics and Dyads", title: "Still-Face", href: "/stillface", summary: "Still-face suppression and recovery route for structured stress modulation.", interactions: ["Review suppression metrics"] },
  { group: "Dynamics and Dyads", title: "HDA Bypass", href: "/hda-bypass", summary: "Transition route comparing orienting-to-termination and orienting-to-sustained pathways.", interactions: ["Inspect transition probabilities"] },
  { group: "Dynamics and Dyads", title: "Passport", href: "/passport", summary: "Single-infant de-identified longitudinal synthesis across modalities.", interactions: ["Review one participant"] },
  { group: "Dynamics and Dyads", title: "Archetypes", href: "/archetypes", summary: "Trajectory archetype atlas for whole-longitudinal shape groups.", interactions: ["Inspect archetype cards"] },
  { group: "Dynamics and Dyads", title: "Cascade Sim", href: "/cascade-sim", summary: "Guardrailed what-if simulator with uncertainty and interpretation limits.", interactions: ["Move sliders", "Read uncertainty"] },
  { group: "Dynamics and Dyads", title: "Eco-Validity", href: "/eco-validity", summary: "Lab-versus-home ecological validity and equity panel.", interactions: ["Compare collection arms"] },
  { group: "Dynamics and Dyads", title: "Stream Coverage", href: "/stream-coverage", summary: "Synchronized stream coverage, dropout, and timing-offset route.", interactions: ["Review coverage"] },
  { group: "Lab Tools", title: "Presentation Maker", href: "/presentation-maker", summary: "Browser-generated slide deck planner and export surface powered through the shared assistant backend.", interactions: ["Generate plan", "Download deck", "Ask Buddy"] },
  { group: "Lab Tools", title: "Spatial Matrix", href: "/spatial-assessments", summary: "Spatial assessment matrix for developmentally relevant score context.", interactions: ["Inspect matrix"] },
  { group: "Lab Tools", title: "Attachment Heatmap", href: "/attachment-heatmap", summary: "Attachment heatmap route for aggregate and de-identified relationship context.", interactions: ["Inspect heatmap"] },
  { group: "Admin", title: "Change History", href: "/changelog", summary: "De-identified changelog, snapshots, and diffs for reproducible data handoffs.", interactions: ["Filter changes", "Open snapshots"] },
  { group: "Documentation", title: "Documentation", href: DOC_ROUTE, summary: "Reference-grade explanation of routes, vocabulary, data flow, compliance, and refresh sources.", interactions: ["Open docs"] },
  { group: "Documentation", title: "Help / Tour", href: HOW_TO_ROUTE, summary: "Task cards, annotated figures, and public plus operator guided tours.", interactions: ["Launch tour"] },
];

export const HOW_TO_CARDS: HowToCard[] = [
  {
    id: "oriented",
    title: "Get oriented in 5 minutes",
    goal: "Read the landing page without opening the operator console.",
    steps: ["Start at the enrollment banner.", "Read Attention Pulse for the HDA mix.", "Read About the Study for the study frame.", "Open the tour if the page feels dense."],
    figure: { label: "Hero, attention pulse, study card", kind: "landing-hero", pins: [{ n: 1, label: "Banner", x: 24, y: 24 }, { n: 2, label: "Pulse", x: 41, y: 55 }, { n: 3, label: "Study", x: 82, y: 55 }] },
    track: "public",
    route: "/",
    links: [{ label: "Operator overview", to: "/overview" }, { label: "Documentation", to: DOC_ROUTE }],
  },
  {
    id: "navigate",
    title: "Navigate the site",
    goal: "Move through sections and use Buddy tips.",
    steps: ["Use the top nav to jump to a section.", "Hover a card to let Buddy explain it.", "Use Docs when you need reference detail.", "Use Take the tour for guided context."],
    figure: { label: "Top nav and Buddy", kind: "nav", pins: [{ n: 1, label: "Nav", x: 55, y: 24 }, { n: 2, label: "Buddy", x: 17, y: 82 }] },
    track: "public",
    route: "/",
    links: [{ label: "Operator overview", to: "/overview" }, { label: "Documentation", to: DOC_ROUTE }],
  },
  {
    id: "pipeline",
    title: "Read the live Pipeline",
    goal: "Understand what done and fail mean.",
    steps: ["Open Pipeline.", "Read each stage left to right.", "Treat done as completed windows or jobs.", "Treat fail as surfaced exceptions for review.", "Open run history for detail."],
    figure: { label: "Six stage cards", kind: "pipeline", pins: [{ n: 1, label: "Stage", x: 14, y: 56 }, { n: 2, label: "Done", x: 48, y: 40 }, { n: 3, label: "Fail", x: 85, y: 70 }] },
    track: "public",
    route: "/#pipeline",
    links: [{ label: "Live pipeline DAG", to: "/overview" }, { label: "Run history", to: "/runs" }, { label: "Pipeline health", to: "/pipeline-health" }],
  },
  {
    id: "aims",
    title: "Explore the Specific Aims",
    goal: "Open an aim and ask a plain-language follow-up.",
    steps: ["Open Aims.", "Expand one card.", "Read Hypothesis, Method, and Outcome.", "Press Ask about Aim N."],
    figure: { label: "Expandable aim card", kind: "aim", pins: [{ n: 1, label: "Aim", x: 26, y: 33 }, { n: 2, label: "Expand", x: 78, y: 33 }, { n: 3, label: "Ask", x: 64, y: 78 }] },
    track: "public",
    route: "/#aims",
    links: [{ label: "Results and trajectories", to: "/results" }],
  },
  {
    id: "architecture",
    title: "Inspect the Data Architecture",
    goal: "Follow how raw capture becomes a model-ready export.",
    steps: ["Select a layer on the left.", "Read the detail panel.", "Open pipeline detail for processing status.", "Open REDCap sync for form health."],
    figure: { label: "Layer rail and detail panel", kind: "architecture", pins: [{ n: 1, label: "Layer", x: 15, y: 37 }, { n: 2, label: "Detail", x: 62, y: 42 }, { n: 3, label: "Links", x: 68, y: 78 }] },
    track: "public",
    route: "/#architecture",
    links: [{ label: "Clinical pipeline", to: "/runs" }, { label: "REDCap sync", to: "/redcap" }],
  },
  {
    id: "cohort",
    title: "Use the Cohort table",
    goal: "Filter de-identified participants by group.",
    steps: ["Open Cohort.", "Choose a group in Filter.", "Read Participant, Group, Visit, Site, and Status.", "Open the full participant table when you need more rows."],
    figure: { label: "Filter and participant rows", kind: "cohort", pins: [{ n: 1, label: "Filter", x: 22, y: 22 }, { n: 2, label: "Rows", x: 52, y: 64 }, { n: 3, label: "Open", x: 84, y: 22 }] },
    track: "public",
    route: "/participants",
    links: [{ label: "Window QA", to: "/qa" }, { label: "Data explorer", to: "/data-explorer" }],
  },
  {
    id: "studio",
    title: "Try the Model Studio",
    goal: "See how illustrative inputs move the gauge.",
    steps: ["Move one input slider.", "Watch the likelihood gauge update.", "Press Explain features.", "Press Reset inputs.", "Remember that sliders do not change study data."],
    figure: { label: "Sliders and gauge", kind: "studio", pins: [{ n: 1, label: "Slider", x: 27, y: 50 }, { n: 2, label: "Gauge", x: 74, y: 45 }, { n: 3, label: "Reset", x: 30, y: 78 }] },
    track: "public",
    route: "/#studio",
    links: [{ label: "Model leaderboard", to: "/model-leaderboard" }, { label: "SHAP explorer", to: "/shap-explorer" }],
  },
  {
    id: "assistant",
    title: "Ask the lab",
    goal: "Use ESD Buddy for grounded study questions.",
    steps: ["Open the assistant.", "Pick a starter chip.", "Ask a follow-up.", "Keep questions de-identified."],
    figure: { label: "Assistant chips and input", kind: "assistant", pins: [{ n: 1, label: "Open", x: 89, y: 81 }, { n: 2, label: "Chip", x: 30, y: 57 }, { n: 3, label: "Input", x: 34, y: 76 }] },
    track: "public",
    route: "/#assistant",
    links: [{ label: "Guided explorer", to: "/guided-explorer" }],
  },
  {
    id: "library",
    title: "Search the Library",
    goal: "Find reading context without leaving the dashboard.",
    steps: ["Open Library.", "Search by title, author, or abstract.", "Read composition, cadence, and depth charts.", "Ask Buddy to summarize a reading."],
    figure: { label: "Search and corpus charts", kind: "library", pins: [{ n: 1, label: "Search", x: 72, y: 26 }, { n: 2, label: "Charts", x: 34, y: 62 }, { n: 3, label: "Readings", x: 72, y: 72 }] },
    track: "public",
    route: "/#library",
    links: [{ label: "Publications", to: "/publications" }],
  },
  {
    id: "operator-switch",
    title: "Switch to Operator view",
    goal: "Understand what changes when the console opens.",
    steps: ["Use Operator view in the bottom session pill.", "Notice the sidebar and compliance banner.", "Use Landing to return to the public surface.", "Use Help / Tour if the console feels dense."],
    figure: { label: "Dock, sidebar, banner", kind: "operator-shell", pins: [{ n: 1, label: "Operator", x: 80, y: 85 }, { n: 2, label: "Sidebar", x: 13, y: 52 }, { n: 3, label: "Banner", x: 58, y: 26 }] },
    track: "operator",
    route: "/overview",
    links: [{ label: "Pipeline health", to: "/pipeline-health" }, { label: "Help and tour", to: HOW_TO_ROUTE }],
  },
  {
    id: "operator-basics",
    title: "Operator basics",
    goal: "Run a refresh and read the top chrome.",
    steps: ["Use Force Sync when you need a fresh pull.", "Read the session timer.", "Open System to check display mode.", "Use Ask the lab for an operational question."],
    figure: { label: "Operator top bar", kind: "operator-topbar", pins: [{ n: 1, label: "Ask", x: 38, y: 44 }, { n: 2, label: "Timer", x: 62, y: 62 }, { n: 3, label: "Sync", x: 89, y: 44 }] },
    track: "operator",
    route: "/overview",
    links: [{ label: "Data explorer", to: "/data-explorer" }, { label: "REDCap sync", to: "/redcap" }],
  },
];

export const PUBLIC_TOUR_STEPS: TourStep[] = [
  { id: "public-nav", target: "public-nav", route: "/", title: "Start with the map", body: "The top nav jumps to each public section. Docs and How-to are first-class routes now, so reference and learning stay close to the dashboard." },
  { id: "attention-pulse", target: "attention-pulse", route: "/", title: "Read the attention pulse", body: "This card turns the HDA stream into a quick signal: how much labeled time sits in sustained attention versus other phases." },
  { id: "aim-card", target: "aim-card", route: "/", title: "Open an aim", body: "Each aim expands into hypothesis, method, and outcome. Use the Ask button when you want Buddy to translate it." },
  { id: "architecture-layer", target: "architecture-layer", route: "/", title: "Follow the data path", body: "Choose a layer to see how edge capture, forms, QA, features, and models connect." },
  { id: "pipeline-stage", target: "pipeline-stage", route: "/", title: "Scan the live pipeline", body: "Stage cards show in-flight work plus done and fail counts. Open run history when a stage needs detail." },
  { id: "cohort-filter", target: "cohort-filter", route: "/", title: "Filter the cohort", body: "The cohort table stays de-identified. Filter by group, then open the participant table when you need full operations detail." },
  { id: "studio-slider", target: "studio-slider", route: "/", title: "Try a safe model sandbox", body: "Move one slider and watch the gauge change. These controls explain model sensitivity, they do not change study data." },
  { id: "assistant-surface", target: "assistant-surface", route: "/", title: "Ask the lab", body: "Starter chips open grounded explanations about NANO, HDA, validation, and what clinicians should inspect first." },
  { id: "library-search", target: "library-search", route: "/", title: "Search the reading library", body: "Search across title, author, and abstract, then use the corpus charts to understand the indexed library." },
  { id: "operator-toggle", target: "operator-toggle", route: "/", title: "Enter the console", body: "Operator view opens the working lab cockpit with sidebar navigation, compliance banner, sync tools, and deeper routes." },
];

export const OPERATOR_TOUR_STEPS: TourStep[] = [
  { id: "operator-search", target: "operator-search", route: "/overview", title: "Ask the lab from the top bar", body: "The search box opens ESD Buddy with your operational question. Keep prompts de-identified." },
  { id: "operator-session", target: "operator-session", route: "/overview", title: "Watch the HIPAA session", body: "The timer and compliance banner keep session age and audit posture visible while you work." },
  { id: "operator-docs", target: "operator-docs", route: "/overview", title: "Open Documentation", body: "The sidebar now has a Documentation entry for reference-grade explanations of every major dashboard surface." },
  { id: "operator-help", target: "operator-help", route: "/overview", title: "Open Help and Tour", body: "Help / Tour contains task cards, annotated figures, and launch buttons for the public and operator tours." },
  { id: "operator-kpis", target: "operator-kpis", route: "/overview", title: "Read the KPI ribbon", body: "These cards summarize enrollment, pending evaluations, processed epochs, REDCap health, and indexed publications when enabled." },
  { id: "operator-pipeline", target: "operator-pipeline", route: "/overview", title: "Use the live DAG", body: "Click any stage node to inspect pipeline detail. The graph reflects the same stage data documented in the docs route." },
  { id: "operator-force-sync", target: "operator-force-sync", route: "/overview", title: "Force a refresh", body: "Force Sync invalidates dashboard queries and updates the visible sync status without storing clinical data in the tour." },
  { id: "operator-landing", target: "operator-landing", route: "/overview", title: "Return to the public surface", body: "Landing takes you back to the narrative view when you no longer need operator controls." },
];

export const TOUR_STEPS: Record<TourTrack, TourStep[]> = {
  public: PUBLIC_TOUR_STEPS,
  operator: OPERATOR_TOUR_STEPS,
};

export const TODO_GLOSSARY_TERMS = GLOSSARY_TERMS.filter((term) => term.source === "todo");
