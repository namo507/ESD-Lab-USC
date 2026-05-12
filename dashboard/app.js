const REFRESH_INTERVAL_MS = 20000;
const ASSISTANT_STATUS_POLL_ENABLED = false;
const DATA_URLS = {
  dashboard: "data/dashboard_data.json",
  readings: "data/readings_data.json",
  runtime: "data/runtime_status.json",
  research: "research_questions/research_questions.json",
  chat: "../api/chat",
  chatStatus: "../api/chat/status",
};

const RQ_STATUS_META = {
  open: { label: "Open", color: "#b86d12" },
  in_progress: { label: "In progress", color: "#3a76fe" },
  blocked: { label: "Blocked", color: "#c65739" },
  resolved: { label: "Resolved", color: "#2f7f4f" },
};

const RQ_PRIORITY_META = {
  critical: { label: "Critical", rank: 0 },
  high: { label: "High", rank: 1 },
  medium: { label: "Medium", rank: 2 },
  low: { label: "Low", rank: 3 },
};

const RQ_FILTERS = {
  search: "",
  category: "all",
  type_tag: "all",
  status: "all",
  priority: "all",
};

const THEME_STORAGE_KEY = "nano-dashboard-theme-preference";
const AUTO_THEME_HOURS = {
  lightStart: 7,
  darkStart: 18,
};

const COLORS = {
  ASIB: "#d85c52",
  PT: "#3a76fe",
  TD: "#2f7f4f",
  accent: "#3a76fe",
  accentSoft: "#f29431",
  models: ["#3a76fe", "#2f7f4f", "#f29431", "#c65739", "#5d79d8", "#7ea5ff"],
  ok: "#2f7f4f",
  warn: "#b86d12",
  bad: "#c65739",
  grid: "rgba(58, 118, 254, 0.12)",
};

const THEME_CHART_TOKENS = {
  light: {
    text: "#4f5f77",
    grid: "rgba(58, 118, 254, 0.12)",
  },
  dark: {
    text: "#d9e1f2",
    grid: "rgba(217, 225, 242, 0.14)",
  },
};

const SECTION_TITLES = {
  overview: [
    "NANO Study · Research Dashboard",
    "R01 longitudinal cohort · VPT infants from NICU admission through 36 months",
  ],
  labsite: [
    "ESD Lab Organization Snapshot",
    "Mission, studies, community resources, and public-facing recruitment context from esdlabsc.com",
  ],
  impact: [
    "ESD Lab Dissemination & Stories",
    "Filter publications, news mentions, and participant stories sourced from the public organization site",
  ],
  pipeline: [
    "Data Flow Pipeline",
    "Interactive map of how study signals move from collection through sharing",
  ],
  geo: [
    "Geospatial Analysis",
    "ZIP-level recruitment geography, SDoH overlays, NICU catchment, and community partner network",
  ],
  quality: [
    "Data Quality & REDCap Audit",
    "Missingness, QC workload, and audit activity aligned in one operational surface",
  ],
  ml: [
    "Machine Learning Performance",
    "Predicting ADOS-2 positive screen at 12 months with cross-validated biomarker models",
  ],
  trajectories: [
    "Participant Trajectories",
    "Scrollable group trajectories with mixed-effects summary views and visit completion context",
  ],
  cohort: [
    "Cohort Snapshot",
    "Sortable surrogate participant summary without PHI exposure",
  ],
  research: [
    "Research Questions",
    "Living SOP of 40 methods, engineering, and reporting decisions tracked across the R01",
  ],
  readings: [
    "Reading Library",
    "Automatically indexed lab PDFs and materials from the ESD Lab readings folder",
  ],
};

const SECTION_DEFAULT_TARGETS = {
  overview: "#overview-kpis",
  labsite: "#labsite-summary",
  impact: "#impact-overview",
  pipeline: "#pipeline-map",
  geo: "#geo-kpis-section",
  quality: "#quality-missingness",
  ml: "#ml-explainer",
  trajectories: "#trajectories-chart",
  cohort: "#cohort-table-card",
  research: "#research-kpis",
  readings: "#readings-spotlight",
};

const PIPELINE_EXPLAINERS = {
  hero: '<b>HeRO NICU Monitor</b><br>Records continuous ECG during NICU admission at 1024 Hz. Output feeds <span class="code">src/data_ingestion/ecg_loader.py</span> to <span class="code">src/preprocessing/ecg_preprocessing.py</span>.<br><br>Primary data stream for Aim 1: characterizing autonomic maturation in VPT infants.',
  actiheart: '<b>Actiheart-5</b><br>Ambulatory chest-patch device capturing R-R intervals during home visits. IBI time series is cleaned with Malik-like filtering and converted into HRV features in <span class="code">src/preprocessing/hrv_features.py</span>.',
  squirrel: '<b>Squirrel Datalogger</b><br>Twin probes record skin temperature at one-minute intervals. Central-peripheral temperature difference is derived in <span class="code">src/preprocessing/temperature_preprocessing.py</span>.',
  datavyu: '<b>DataVyu behavioral coding</b><br>Frame-level coding of attention, affect, and caregiver interaction from study videos. Timestamp alignment is handled in <span class="code">src/preprocessing/behavioral_sync.py</span>.',
  secure: '<b>USC Secure Server</b><br>Encrypted mount at <span class="code">$NANO_DATA_ROOT</span>. Raw PHI stays off-repo; only de-identified or aggregate outputs flow to the dashboard.',
  redcap: '<b>REDCap</b><br>Primary longitudinal system for demographics, assessments, and event-level completion. Nightly sync lands via <span class="code">scripts/redcap_daily_sync.py</span>.',
  ecgpp: '<b>ECG preprocessing to HRV</b><br>Bandpass filtering, R-peak detection, ectopic filtering, and HRV feature generation across time-domain and nonlinear measures.',
  impute: '<b>MICE multiple imputation</b><br>Missingness diagnostics route moderate or high missingness instruments into the MICE workflow for pooled downstream estimates.',
  features: '<b>Feature matrix</b><br>Per-participant x per-visit table combining physiology, REDCap, behavioral coding, and engineered trajectory terms.',
  ml: '<b>ML and deep models</b><br>Random Forest, XGBoost, SVM, CNN-LSTM, and Transformer pipelines run with cross-validation and SHAP summaries.',
  mixed: '<b>Mixed-effects and LGCM</b><br>Group slopes and intercepts are estimated for each biomarker and surfaced in the trajectory section of the dashboard.',
  manuscripts: '<b>Manuscripts and reports</b><br>LaTeX, RMarkdown, and results templates live in <span class="code">reports/</span> for downstream reporting.',
  dashboard: '<b>This dashboard</b><br>Consumes <span class="code">dashboard/data/dashboard_data.json</span> and the readings index generated from <span class="code">ESD Lab readings/</span>.',
  deident: '<b>De-identified export</b><br>Date-shifted, PHI-stripped data products for sharing and compliance workflows.',
};

const ML_STAGE_ROTATE_MS = 3400;
const FEATURE_DOMAIN_RULES = [
  {
    key: "physiology",
    label: "Autonomic physiology",
    accent: COLORS.PT,
    description: "ECG-derived HRV and autonomic regulation biomarkers.",
    pattern: /(rsa|rmssd|sdnn|ecg|hrv|heart|ibi|r\s*-?\s*r|autonomic|vagal|entropy|poincare|lf|hf)/i,
  },
  {
    key: "behavior",
    label: "Attention and behavior",
    accent: COLORS.TD,
    description: "Behavioral coding, attention, and social engagement signals.",
    pattern: /(attention|behavior|behaviour|social|affect|engagement|gaze|datavyu|hda|sustained)/i,
  },
  {
    key: "clinical",
    label: "NICU and perinatal course",
    accent: COLORS.ASIB,
    description: "Gestational age, NICU morbidity, and early clinical course.",
    pattern: /(nicu|ga_|gestational|birth|weight|morbidity|oxygen|ventilation|apgar|sepsis|ivh|bpd)/i,
  },
  {
    key: "development",
    label: "Developmental assessments",
    accent: COLORS.models[4],
    description: "ADOS, Bayley, milestones, and neurodevelopmental assessment features.",
    pattern: /(ados|bayley|mchat|asq|nnns|csbs|development|language|motor|cognitive)/i,
  },
  {
    key: "context",
    label: "Family and context",
    accent: COLORS.models[3],
    description: "SDoH, caregiver, and maternal-context covariates.",
    pattern: /(prapare|sdoh|maternal|caregiver|epds|family|income|housing|context)/i,
  },
];

const ML_METHOD_LIBRARY = {
  payload: {
    label: "Payload builder",
    href: "pipelines/build_dashboard_data.py",
    note: "Feature assembly + dashboard schema",
  },
  baseline: {
    label: "ML pipeline",
    href: "../src/models/ml_pipeline.py",
    note: "Tabular baselines and feature selection",
  },
  deep: {
    label: "CNN-LSTM implementation",
    href: "../src/models/deep_learning_ecg.py",
    note: "Sequence model for temporal biomarker patterns",
  },
  transformer: {
    label: "Transformer implementation",
    href: "../src/models/transformer_ecg.py",
    note: "Token embeddings and self-attention",
  },
  evaluation: {
    label: "Model evaluation",
    href: "../src/models/model_evaluation.py",
    note: "AUROC, sensitivity, specificity, and diagnostics",
  },
  config: {
    label: "Model configuration",
    href: "../config/model_config.yml",
    note: "Training settings and experiment knobs",
  },
  protocol: {
    label: "ECG processing protocol",
    href: "../docs/ecg_processing_protocol.md",
    note: "Acquisition and preprocessing rationale",
  },
  flow: {
    label: "Methods flow diagram",
    href: "../docs/data_flow_diagram.md",
    note: "End-to-end repo methods map",
  },
  guide: {
    label: "Dashboard guide",
    href: "../docs/dashboard_guide.md",
    note: "Plain-language interpretation layer",
  },
};

const ERROR_BAR_PLUGIN = {
  id: "errorBars",
  afterDatasetsDraw(chart, _args, pluginOptions) {
    const ranges = pluginOptions && pluginOptions.ranges;
    if (!ranges || !ranges.length) {
      return;
    }

    const datasetMeta = chart.getDatasetMeta(0);
    const yScale = chart.scales.y;
    if (!datasetMeta || !yScale) {
      return;
    }

    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--chart-ink").trim() || Chart.defaults.color || "#6b564a";
    ctx.lineWidth = 1.4;

    datasetMeta.data.forEach((element, index) => {
      const range = ranges[index];
      if (!range || !Number.isFinite(range[0]) || !Number.isFinite(range[1])) {
        return;
      }
      const x = element.x;
      const top = yScale.getPixelForValue(range[1]);
      const bottom = yScale.getPixelForValue(range[0]);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.moveTo(x - 5, top);
      ctx.lineTo(x + 5, top);
      ctx.moveTo(x - 5, bottom);
      ctx.lineTo(x + 5, bottom);
      ctx.stroke();
    });

    ctx.restore();
  },
};

Chart.register(ERROR_BAR_PLUGIN);
Chart.defaults.font.family = 'Libre Franklin, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
Chart.defaults.font.size = 12;
Chart.defaults.color = THEME_CHART_TOKENS.light.text;
Chart.defaults.animation.duration = 700;
Chart.defaults.animation.easing = "easeOutQuart";

const STATE = {
  dashboard: null,
  readings: emptyReadingsPayload(),
  research: null,
  runtime: {},
  ui: {
    activeSection: "overview",
    viewMode: "home",
    focusedSection: "overview",
    themePreference: "auto",
    themeMode: "light",
    viewPanelOpen: false,
    navigationLockUntil: 0,
  },
  tokens: {
    dashboard: null,
    readings: null,
    research: null,
    buildCount: 0,
  },
  assistant: {
    open: false,
    pending: false,
    history: [],
    status: null,
  },
};

let CHARTS = {};
let nextRefreshAt = 0;
let controlsInitialized = false;
let COHORT_SORT = { col: "nano_id", dir: "asc" };
let REVEAL_OBSERVER = null;
let LOADER_DISMISSED = false;
let ML_EXPLAINER = {
  timer: null,
  stages: [],
  index: 0,
  architecture: "tabular",
  modelName: null,
  context: null,
};

document.addEventListener("DOMContentLoaded", bootstrap);

async function bootstrap() {
  initializeTheme();
  decorateRevealTargets();
  setupSyncHeroMotion();
  setupImmersiveChrome();
  setupNavigation();
  setupAnchorRouting();
  setupViewPanel();
  setupPipelineExplainers();
  setupControls();
  setupAssistant();
  await syncData({ force: true });
  if (ASSISTANT_STATUS_POLL_ENABLED) {
    try {
      await syncAssistantStatus();
    } catch (error) {
      console.error(error);
    } finally {
      dismissSiteLoader();
    }
  } else {
    STATE.assistant.status = {
      state: "offline",
      ready: false,
      message: "Assistant status checks are paused until the chat panel is opened.",
    };
    renderAssistantStatus();
    dismissSiteLoader();
  }
  if (window.location.hash && document.querySelector(window.location.hash)) {
    scrollToTarget(window.location.hash);
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncData();
      if (ASSISTANT_STATUS_POLL_ENABLED && STATE.assistant.open) {
        syncAssistantStatus();
      }
    }
  });
  window.setInterval(() => {
    syncData();
    if (ASSISTANT_STATUS_POLL_ENABLED && STATE.assistant.open) {
      syncAssistantStatus();
    }
  }, REFRESH_INTERVAL_MS);
  window.setInterval(updateRefreshCountdown, 1000);
}

function initializeTheme() {
  const savedPreference = window.localStorage
    ? window.localStorage.getItem(THEME_STORAGE_KEY)
    : null;
  const preference = ["auto", "light", "dark"].includes(savedPreference)
    ? savedPreference
    : "auto";

  applyThemePreference(preference, { persist: false, rerender: false });
  setupThemeToggle();

  window.setInterval(() => {
    if (STATE.ui.themePreference === "auto") {
      refreshAutomaticTheme();
    }
  }, 60000);
}

function setupThemeToggle() {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle || toggle.dataset.bound === "true") {
    return;
  }

  toggle.addEventListener("click", (event) => {
    const button = event.target.closest("[data-theme-preference]");
    if (!button) {
      return;
    }
    applyThemePreference(button.dataset.themePreference);
  });

  toggle.dataset.bound = "true";
}

function refreshAutomaticTheme() {
  const nextMode = resolveThemeMode("auto");
  if (nextMode !== STATE.ui.themeMode) {
    applyThemePreference("auto", { persist: false });
  }
}

function resolveThemeMode(preference) {
  return preference === "auto" ? getAutomaticThemeMode() : preference;
}

function getAutomaticThemeMode(date = new Date()) {
  const hour = date.getHours();
  return hour >= AUTO_THEME_HOURS.darkStart || hour < AUTO_THEME_HOURS.lightStart
    ? "dark"
    : "light";
}

function applyThemePreference(preference, { persist = true, rerender = true } = {}) {
  const safePreference = ["auto", "light", "dark"].includes(preference)
    ? preference
    : "auto";
  const mode = resolveThemeMode(safePreference);

  STATE.ui.themePreference = safePreference;
  STATE.ui.themeMode = mode;

  document.body.dataset.theme = mode;
  document.body.dataset.themePreference = safePreference;

  updateThemeToggleUI(safePreference, mode);
  applyChartTheme(mode);

  if (persist && window.localStorage) {
    window.localStorage.setItem(THEME_STORAGE_KEY, safePreference);
  }

  if (rerender && STATE.dashboard) {
    renderChrome();
    renderDashboard();
    renderReadings();
    renderFooter();
  }
}

function updateThemeToggleUI(preference, mode) {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) {
    return;
  }

  toggle.dataset.mode = mode;
  toggle.title = preference === "auto"
    ? `Automatic theme based on local time. Current mode: ${mode}.`
    : `Manual ${mode} theme active.`;

  toggle.querySelectorAll("[data-theme-preference]").forEach((button) => {
    const isActive = button.dataset.themePreference === preference;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function applyChartTheme(mode) {
  const tokens = THEME_CHART_TOKENS[mode] || THEME_CHART_TOKENS.light;
  COLORS.grid = tokens.grid;
  Chart.defaults.color = tokens.text;
  Chart.defaults.borderColor = tokens.grid;
}

function emptyReadingsPayload() {
  return {
    meta: { generated_at: null, total_readings: 0, latest_modified_at: null, pdf_metadata_enabled: false },
    summary: {
      categories: [],
      years: [],
      sources: [],
      formats: [],
      total_readings: 0,
      total_size_mb: 0,
      total_pages: 0,
    },
    featured: [],
    readings: [],
  };
}

function emptyOrganizationSitePayload() {
  return {
    meta: {
      generated_at: null,
      source_mode: "unavailable",
      source_url: "https://www.esdlabsc.com/",
      pages_crawled: 0,
      errors: [],
    },
    summary: {
      current_public_studies: 0,
      featured_stories: 0,
      partner_count: 0,
      publication_items: 0,
      news_mentions: 0,
      impact_item_count: 0,
      available_years: [],
      phone: "",
      emails: [],
      address: "",
      signup_url: "https://www.esdlabsc.com/newborn-sign-up",
      contact_url: "https://www.esdlabsc.com/contact-us",
      main_site_url: "https://www.esdlabsc.com/",
    },
    mission: {
      headline: "",
      summary: "",
      mission_text: "",
      details: [],
    },
    studies: [],
    family_pathway: [],
    team_highlights: [],
    resources: [],
    partners: [],
    contact: {
      phone: "",
      emails: [],
      address: "",
      signup_url: "https://www.esdlabsc.com/newborn-sign-up",
      contact_url: "https://www.esdlabsc.com/contact-us",
      parking_url: "",
      undergraduate_application_url: "",
      instagram_url: "",
      spanish_email: "",
    },
    publications: [],
    news: [],
    stories: [],
    impact_feed: [],
    impact_summary: {
      types: [],
      years: [],
    },
  };
}

function getOrganizationSitePayload() {
  const fallback = emptyOrganizationSitePayload();
  const payload = (STATE.dashboard && STATE.dashboard.organization_site) || {};
  return {
    ...fallback,
    ...payload,
    meta: { ...fallback.meta, ...(payload.meta || {}) },
    summary: { ...fallback.summary, ...(payload.summary || {}) },
    mission: { ...fallback.mission, ...(payload.mission || {}) },
    contact: { ...fallback.contact, ...(payload.contact || {}) },
    impact_summary: { ...fallback.impact_summary, ...(payload.impact_summary || {}) },
    studies: payload.studies || [],
    family_pathway: payload.family_pathway || [],
    team_highlights: payload.team_highlights || [],
    resources: payload.resources || [],
    partners: payload.partners || [],
    publications: payload.publications || [],
    news: payload.news || [],
    stories: payload.stories || [],
    impact_feed: payload.impact_feed || [],
  };
}

function decorateRevealTargets() {
  document.querySelectorAll(".card").forEach((element) => element.classList.add("content-card"));
  document.querySelectorAll(".ml-domain-card").forEach((element) => element.classList.add("signal-card"));
  document.querySelectorAll(".sync-arm-card").forEach((element) => element.classList.add("arm-card"));

  if (!REVEAL_OBSERVER) {
    REVEAL_OBSERVER = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }
          entry.target.classList.add("revealed");
          entry.target.classList.remove("reveal-pending");
          REVEAL_OBSERVER.unobserve(entry.target);
        });
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -40px 0px",
      }
    );
  }

  document
    .querySelectorAll(".kpi-card, .jump-card, .content-card, .signal-card, .arm-card, .sync-storyboard, .sync-story-node, .sync-ambient-card, .mini-kpi-item, tbody tr")
    .forEach((element) => {
      if (element.classList.contains("revealed")) {
        return;
      }

      element.classList.add("reveal-pending");
      const parent = element.parentElement;
      if (parent && parent.matches(".grid.kpis, .section-atlas-grid, .sync-arm-grid, .sync-story-track, .sync-ambient-grid, .reading-grid, #rq-grid")) {
        const siblings = Array.from(parent.children).filter((node) => node.nodeType === Node.ELEMENT_NODE);
        const index = Math.max(0, siblings.indexOf(element));
        element.style.transitionDelay = `${index * 60}ms`;
      } else {
        element.style.transitionDelay = "";
      }
      REVEAL_OBSERVER.observe(element);
    });

  setupMagneticInteractions();
}

function setupSyncHeroMotion() {
  const surface = document.getElementById("sync-banner");
  if (!surface) {
    return;
  }

  const resetSurface = () => {
    surface.style.setProperty("--sync-spot-x", "76%");
    surface.style.setProperty("--sync-spot-y", "24%");
    surface.style.setProperty("--sync-tilt-x", "0deg");
    surface.style.setProperty("--sync-tilt-y", "0deg");
  };

  resetSurface();

  if (prefersReducedMotion()) {
    return;
  }

  surface.addEventListener("pointermove", (event) => {
    const bounds = surface.getBoundingClientRect();
    const pointerX = (event.clientX - bounds.left) / bounds.width;
    const pointerY = (event.clientY - bounds.top) / bounds.height;

    surface.style.setProperty("--sync-spot-x", `${(pointerX * 100).toFixed(2)}%`);
    surface.style.setProperty("--sync-spot-y", `${(pointerY * 100).toFixed(2)}%`);
    surface.style.setProperty("--sync-tilt-x", `${((0.5 - pointerY) * 4.2).toFixed(2)}deg`);
    surface.style.setProperty("--sync-tilt-y", `${((pointerX - 0.5) * 6).toFixed(2)}deg`);
  });

  surface.addEventListener("pointerleave", resetSurface);
}

function setupImmersiveChrome() {
  document.body.classList.add("immersive-shell");
  splitMotionText();
  setupScrollChrome();
  setupSidebarPreview();
  setupInteractiveCursor();
  setupMagneticInteractions();
}

function dismissSiteLoader() {
  if (LOADER_DISMISSED) {
    return;
  }

  const loader = document.getElementById("site-loader");
  if (!loader) {
    LOADER_DISMISSED = true;
    document.body.classList.add("app-ready");
    return;
  }

  document.body.classList.add("app-ready");
  loader.classList.add("is-hidden");
  window.setTimeout(() => {
    loader.hidden = true;
  }, 900);
  LOADER_DISMISSED = true;
}

function splitMotionText(root = document) {
  root.querySelectorAll('[data-split="words"]').forEach((element) => {
    if (element.dataset.splitReady === "true") {
      return;
    }

    const words = String(element.textContent || "")
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .filter(Boolean);

    if (!words.length) {
      return;
    }

    element.setAttribute("aria-label", words.join(" "));
    element.innerHTML = words
      .map(
        (word, index) =>
          `<span class="split-word" style="--word-index:${index}"><span class="split-word-inner" aria-hidden="true">${escapeHtml(word)}</span></span>`
      )
      .join(" ");
    element.dataset.splitReady = "true";
  });
}

function setupSidebarPreview() {
  const preview = document.getElementById("sidebar-preview");
  if (!preview || preview.dataset.bound === "true") {
    return;
  }

  const links = Array.from(document.querySelectorAll(".nav a[data-target]"));
  links.forEach((link) => {
    const handlePreview = () => updateSidebarPreview(link.dataset.target);
    link.addEventListener("mouseenter", handlePreview);
    link.addEventListener("focus", handlePreview);
  });

  const nav = document.querySelector(".nav");
  if (nav) {
    nav.addEventListener("mouseleave", () => updateSidebarPreview(STATE.ui.activeSection));
  }

  preview.dataset.bound = "true";
  updateSidebarPreview(STATE.ui.activeSection);
}

function updateSidebarPreview(sectionId = STATE.ui.activeSection || "overview") {
  const title = SECTION_TITLES[sectionId] || SECTION_TITLES.overview;
  setText("sidebar-preview-title", title[0]);
  setText("sidebar-preview-copy", title[1]);

  const link = document.getElementById("sidebar-preview-link");
  if (link) {
    link.href = SECTION_DEFAULT_TARGETS[sectionId] || SECTION_DEFAULT_TARGETS.overview;
    link.textContent = sectionId === "overview" ? "Open overview" : `Open ${shortText(title[0], 24)}`;
  }
}

function setupScrollChrome() {
  if (document.body.dataset.scrollChromeBound === "true") {
    return;
  }

  let lastScrollTop = window.scrollY || 0;
  const onScroll = () => {
    const current = window.scrollY || 0;
    document.body.classList.toggle("is-scrolled", current > 24);

    if (Math.abs(current - lastScrollTop) > 10) {
      const scrollingDown = current > lastScrollTop && current > 120;
      document.body.classList.toggle("is-scrolling-down", scrollingDown);
      lastScrollTop = current;
    }
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  document.body.dataset.scrollChromeBound = "true";
}

function setupInteractiveCursor() {
  const cursor = document.getElementById("site-cursor");
  if (!cursor || cursor.dataset.bound === "true") {
    return;
  }

  const supportsCursor = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!supportsCursor || prefersReducedMotion()) {
    cursor.hidden = true;
    cursor.dataset.bound = "true";
    return;
  }

  const interactiveSelector = [
    "a",
    "button",
    ".card",
    ".jump-card",
    ".view-link",
    ".geo-layer-pill",
    ".assistant-panel",
  ].join(", ");

  const state = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    targetX: window.innerWidth / 2,
    targetY: window.innerHeight / 2,
  };

  const frame = () => {
    state.x += (state.targetX - state.x) * 0.18;
    state.y += (state.targetY - state.y) * 0.18;
    cursor.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
    window.requestAnimationFrame(frame);
  };

  document.addEventListener("pointermove", (event) => {
    state.targetX = event.clientX;
    state.targetY = event.clientY;
    document.body.classList.add("has-active-cursor");
  });

  document.addEventListener("pointerdown", () => cursor.classList.add("is-clicking"));
  document.addEventListener("pointerup", () => cursor.classList.remove("is-clicking"));
  document.addEventListener("mouseover", (event) => {
    cursor.classList.toggle("is-hovering", Boolean(event.target.closest(interactiveSelector)));
  });
  document.addEventListener("mouseout", (event) => {
    if (!event.relatedTarget || !event.relatedTarget.closest(interactiveSelector)) {
      cursor.classList.remove("is-hovering");
    }
  });

  cursor.dataset.bound = "true";
  window.requestAnimationFrame(frame);
}

function setupMagneticInteractions(root = document) {
  if (prefersReducedMotion() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    return;
  }

  const selector = [
    ".nav a[data-target]",
    ".sync-link-pill",
    ".sync-story-node",
    ".sync-ambient-card",
    ".section-jump-pill",
    ".atlas-card",
    ".view-link",
    ".view-mode-card",
    ".assistant-launcher",
    ".assistant-submit",
    ".ghost-button",
    ".geo-layer-pill",
    ".theme-option",
  ].join(", ");

  root.querySelectorAll(selector).forEach((element) => {
    if (element.dataset.magneticBound === "true") {
      return;
    }

    element.classList.add("magnetic-target");
    element.addEventListener("pointermove", (event) => {
      const bounds = element.getBoundingClientRect();
      const offsetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 16;
      const offsetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 12;
      element.style.transform = `translate3d(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px, 0)`;
    });
    element.addEventListener("pointerleave", () => {
      element.style.transform = "";
    });

    element.dataset.magneticBound = "true";
  });
}

function setupNavigation() {
  const navLinks = Array.from(document.querySelectorAll(".nav a[data-target]"));
  const sections = Array.from(document.querySelectorAll("main > section[id]:not(#sync-banner)"));

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (link.dataset.target === "overview") {
        showHomeView({ target: SECTION_DEFAULT_TARGETS.overview });
        return;
      }
      showSectionView(link.dataset.target, { target: SECTION_DEFAULT_TARGETS[link.dataset.target] });
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      if (STATE.ui.viewMode !== "all" || Date.now() < STATE.ui.navigationLockUntil) {
        return;
      }
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (!visible) {
        return;
      }
      setActiveSection(visible.target.id);
    },
    { rootMargin: "-25% 0px -55% 0px", threshold: [0.2, 0.4, 0.65] }
  );

  sections.forEach((section) => observer.observe(section));
  setActiveSection("overview");
}

function setupAnchorRouting() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    if (link.dataset.anchorBound === "true") {
      return;
    }

    link.addEventListener("click", (event) => {
      const hash = link.getAttribute("href");
      if (!hash || hash === "#") {
        return;
      }
      event.preventDefault();
      scrollToTarget(hash);
    });

    link.dataset.anchorBound = "true";
  });
}

function setupViewPanel() {
  const shell = document.getElementById("view-panel-shell");
  const panel = document.getElementById("view-panel");
  const toggle = document.getElementById("view-panel-toggle");
  const close = document.getElementById("view-panel-close");
  const scrim = document.getElementById("view-panel-scrim");
  const homeToggle = document.getElementById("home-view-toggle");
  if (!shell || !panel || !toggle || shell.dataset.bound === "true") {
    return;
  }

  toggle.addEventListener("click", () => {
    if (STATE.ui.viewPanelOpen) {
      closeViewPanel();
      return;
    }
    openViewPanel();
  });

  [close, scrim].forEach((element) => {
    element.addEventListener("click", () => {
      closeViewPanel();
    });
  });

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-dashboard-view], [data-jump-target]");
    if (!button) {
      return;
    }
    handleDashboardSelection(button, { closePanelAfter: true });
  });

  if (homeToggle && homeToggle.dataset.bound !== "true") {
    homeToggle.addEventListener("click", () => {
      showHomeView({ target: SECTION_DEFAULT_TARGETS.overview });
    });
    homeToggle.dataset.bound = "true";
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && STATE.ui.viewPanelOpen) {
      closeViewPanel();
    }
  });

  shell.dataset.bound = "true";
  updateViewPanelStatus(STATE.ui.activeSection);
}

function handleDashboardSelection(button, { closePanelAfter = false } = {}) {
  const preferredMode = button.dataset.dashboardView || "section";
  const target = button.dataset.jumpTarget || SECTION_DEFAULT_TARGETS[button.dataset.section] || SECTION_DEFAULT_TARGETS.overview;
  const sectionId = button.dataset.section || deriveSectionIdFromTarget(target) || STATE.ui.activeSection || "overview";

  if (closePanelAfter) {
    closeViewPanel();
  }

  window.requestAnimationFrame(() => {
    if (preferredMode === "all") {
      showFullDashboard({ sectionId, target });
      return;
    }

    if (preferredMode === "home" || sectionId === "overview") {
      showHomeView({ target });
      return;
    }

    showSectionView(sectionId, { target });
  });
}

function deriveSectionIdFromTarget(selector) {
  const target = selector ? document.querySelector(selector) : null;
  const owner = target ? target.closest("section[id]") : null;
  return owner ? owner.id : null;
}

function showHomeView({ target = SECTION_DEFAULT_TARGETS.overview } = {}) {
  STATE.ui.viewMode = "home";
  STATE.ui.focusedSection = "overview";
  STATE.ui.navigationLockUntil = Date.now() + 1400;
  setActiveSection("overview");
  applyDashboardView();
  queueViewScroll(target);
}

function showSectionView(sectionId, { target = SECTION_DEFAULT_TARGETS[sectionId] || SECTION_DEFAULT_TARGETS.overview } = {}) {
  const safeSectionId = sectionId || "overview";
  STATE.ui.viewMode = safeSectionId === "overview" ? "home" : "section";
  STATE.ui.focusedSection = safeSectionId;
  STATE.ui.navigationLockUntil = Date.now() + 1400;
  setActiveSection(safeSectionId);
  applyDashboardView();
  queueViewScroll(target || SECTION_DEFAULT_TARGETS[safeSectionId] || SECTION_DEFAULT_TARGETS.overview);
}

function showFullDashboard({ sectionId = STATE.ui.activeSection || "overview", target = null } = {}) {
  STATE.ui.viewMode = "all";
  STATE.ui.focusedSection = null;
  STATE.ui.navigationLockUntil = Date.now() + 1400;
  setActiveSection(sectionId || "overview");
  applyDashboardView();
  if (target) {
    queueViewScroll(target);
    return;
  }
  queueVisibleChartResize();
}

function applyDashboardView() {
  const showHomepageShell = STATE.ui.viewMode === "home";
  const syncBanner = document.getElementById("sync-banner");
  const atlas = document.querySelector(".section-atlas");

  if (syncBanner) {
    syncBanner.hidden = !showHomepageShell;
  }
  if (atlas) {
    atlas.hidden = !showHomepageShell;
  }

  document.querySelectorAll("main > section[id]:not(#sync-banner)").forEach((section) => {
    let visible = STATE.ui.viewMode === "all";
    if (STATE.ui.viewMode === "home") {
      visible = section.id === "overview";
    }
    if (STATE.ui.viewMode === "section") {
      visible = section.id === STATE.ui.focusedSection;
    }
    section.hidden = !visible;
    section.dataset.activeView = String(visible);
  });

  document.body.dataset.dashboardView = STATE.ui.viewMode;
  document.body.dataset.focusSection = STATE.ui.focusedSection || "";
  updateDashboardViewControls();
}

function updateDashboardViewControls() {
  const homeToggle = document.getElementById("home-view-toggle");
  if (homeToggle) {
    homeToggle.hidden = STATE.ui.viewMode === "home";
    homeToggle.textContent = STATE.ui.viewMode === "all" ? "Homepage" : "Back to Homepage";
  }

  document.querySelectorAll(".view-mode-card[data-dashboard-view]").forEach((button) => {
    let isActive = false;
    if (button.dataset.dashboardView === "all") {
      isActive = STATE.ui.viewMode === "all";
    } else if (button.dataset.dashboardView === "home") {
      isActive = STATE.ui.viewMode === "home";
    }

    button.classList.toggle("active", isActive);
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  const currentHash = window.location.hash;
  document.querySelectorAll(".view-link[data-section], .view-header-signal[data-section], .view-signal-card[data-section]").forEach((button) => {
    let isActive = false;
    if (currentHash && button.dataset.jumpTarget) {
      isActive = button.dataset.jumpTarget === currentHash;
    } else if (STATE.ui.viewMode === "section") {
      isActive = button.dataset.section === STATE.ui.focusedSection;
    } else if (STATE.ui.viewMode === "home") {
      isActive = button.dataset.jumpTarget === SECTION_DEFAULT_TARGETS.overview;
    }

    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function queueViewScroll(selector) {
  if (!selector) {
    queueVisibleChartResize();
    return;
  }

  if (selector.startsWith("#")) {
    window.history.replaceState(null, "", selector);
  }

  window.requestAnimationFrame(() => {
    scrollToTarget(selector, { preserveView: true });
    queueVisibleChartResize();
  });
}

function queueVisibleChartResize() {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      Object.values(CHARTS).forEach((chart) => {
        if (chart && typeof chart.resize === "function") {
          chart.resize();
        }
      });
    });
  });
}

function openViewPanel() {
  const shell = document.getElementById("view-panel-shell");
  const toggle = document.getElementById("view-panel-toggle");
  if (!shell || !toggle) {
    return;
  }
  STATE.ui.viewPanelOpen = true;
  document.body.classList.add("view-panel-open");
  shell.setAttribute("aria-hidden", "false");
  toggle.setAttribute("aria-expanded", "true");
}

function closeViewPanel() {
  const shell = document.getElementById("view-panel-shell");
  const toggle = document.getElementById("view-panel-toggle");
  if (!shell || !toggle) {
    return;
  }
  STATE.ui.viewPanelOpen = false;
  document.body.classList.remove("view-panel-open");
  shell.setAttribute("aria-hidden", "true");
  toggle.setAttribute("aria-expanded", "false");
}

function scrollToTarget(selector, { preserveView = false } = {}) {
  const target = document.querySelector(selector);
  if (!target) {
    return;
  }

  const owningSection = target.closest("section[id]");
  if (owningSection) {
    STATE.ui.navigationLockUntil = Date.now() + 1400;
    if (!preserveView) {
      if (STATE.ui.viewMode === "home" && owningSection.id !== "overview") {
        showSectionView(owningSection.id, { target: selector });
        return;
      }
      if (STATE.ui.viewMode === "section" && STATE.ui.focusedSection !== owningSection.id) {
        showSectionView(owningSection.id, { target: selector });
        return;
      }
    }
    setActiveSection(owningSection.id);
  }

  target.scrollIntoView({ behavior: "smooth", block: "start" });
  if (selector.startsWith("#")) {
    window.history.replaceState(null, "", selector);
  }
}

function setActiveSection(sectionId) {
  STATE.ui.activeSection = sectionId;
  document.body.dataset.activeSection = sectionId;
  document.querySelectorAll(".nav a[data-target]").forEach((link) => {
    link.classList.toggle("active", link.dataset.target === sectionId);
  });
  const title = SECTION_TITLES[sectionId] || SECTION_TITLES.overview;
  document.getElementById("page-title").innerHTML = `<span class="title-mark" aria-hidden="true">◆</span>${escapeHtml(title[0])}`;
  document.getElementById("page-sub").textContent = title[1];
  updateSidebarPreview(sectionId);
  updateViewPanelStatus(sectionId);
}

function updateViewPanelStatus(sectionId) {
  let title = SECTION_TITLES[sectionId] || SECTION_TITLES.overview;
  if (STATE.ui.viewMode === "home") {
    title = [
      "Homepage snapshot",
      "Operational metrics, overview KPIs, and quick-entry cards.",
    ];
  } else if (STATE.ui.viewMode === "all") {
    title = [
      "Full dashboard browse",
      "Every section is visible for long-form review and cross-section scanning.",
    ];
  }

  setText("view-panel-current-title", title[0]);
  setText("view-panel-current-sub", title[1]);
  updateDashboardViewControls();
}

function setupPipelineExplainers() {
  document.querySelectorAll(".pl-node").forEach((node) => {
    node.addEventListener("click", () => {
      const key = node.dataset.key;
      document.getElementById("pipeline-explainer").innerHTML = PIPELINE_EXPLAINERS[key] || "No explanation available.";
    });
  });
}

function setupControls() {
  if (controlsInitialized) {
    return;
  }
  controlsInitialized = true;

  document.getElementById("filter-biomarker").addEventListener("change", renderTrajectoryChart);
  document.getElementById("filter-ci").addEventListener("change", renderTrajectoryChart);
  document.getElementById("filter-group").addEventListener("change", drawCohort);
  document.getElementById("filter-qc").addEventListener("change", drawCohort);
  document.getElementById("filter-reading-search").addEventListener("input", renderReadings);
  document.getElementById("filter-reading-category").addEventListener("change", renderReadings);
  document.getElementById("filter-reading-sort").addEventListener("change", renderReadings);
  document.getElementById("reading-clear-filters").addEventListener("click", resetReadingFilters);
  document.getElementById("reading-chip-bar").addEventListener("click", handleReadingChipClick);
  document.getElementById("filter-impact-search").addEventListener("input", renderImpactExplorer);
  document.getElementById("filter-impact-kind").addEventListener("change", renderImpactExplorer);
  document.getElementById("filter-impact-year").addEventListener("change", renderImpactExplorer);
  document.getElementById("filter-impact-sort").addEventListener("change", renderImpactExplorer);
  document.getElementById("impact-clear-filters").addEventListener("click", resetImpactFilters);
  document.getElementById("impact-type-chip-bar").addEventListener("click", handleImpactChipClick);

  document.querySelectorAll("#table-cohort th[data-sort]").forEach((header) => {
    header.addEventListener("click", () => {
      const column = header.dataset.sort;
      COHORT_SORT = {
        col: column,
        dir: COHORT_SORT.col === column && COHORT_SORT.dir === "asc" ? "desc" : "asc",
      };
      drawCohort();
    });
  });

  const cohortScroll = document.getElementById("cohort-table-scroll");
  if (cohortScroll && cohortScroll.dataset.bound !== "true") {
    cohortScroll.addEventListener("scroll", () => {
      const head = document.querySelector("#table-cohort thead");
      if (head) {
        head.classList.toggle("scrolled", cohortScroll.scrollTop > 0);
      }
    });
    cohortScroll.dataset.bound = "true";
  }

  setupResearchQuestionsControls();
}

function setupResearchQuestionsControls() {
  const search = document.getElementById("rq-search");
  if (!search) {
    return;
  }
  const onChange = () => {
    RQ_FILTERS.search = (document.getElementById("rq-search").value || "").trim();
    RQ_FILTERS.category = document.getElementById("rq-filter-category").value;
    RQ_FILTERS.type_tag = document.getElementById("rq-filter-type").value;
    RQ_FILTERS.status = document.getElementById("rq-filter-status").value;
    RQ_FILTERS.priority = document.getElementById("rq-filter-priority").value;
    renderResearchQuestions();
  };

  search.addEventListener("input", onChange);
  document.getElementById("rq-filter-category").addEventListener("change", onChange);
  document.getElementById("rq-filter-type").addEventListener("change", onChange);
  document.getElementById("rq-filter-status").addEventListener("change", onChange);
  document.getElementById("rq-filter-priority").addEventListener("change", onChange);

  document.getElementById("rq-clear-filters").addEventListener("click", () => {
    document.getElementById("rq-search").value = "";
    document.getElementById("rq-filter-category").value = "all";
    document.getElementById("rq-filter-type").value = "all";
    document.getElementById("rq-filter-status").value = "all";
    document.getElementById("rq-filter-priority").value = "all";
    Object.assign(RQ_FILTERS, {
      search: "",
      category: "all",
      type_tag: "all",
      status: "all",
      priority: "all",
    });
    renderResearchQuestions();
  });

  const heatmap = document.getElementById("rq-heatmap");
  if (heatmap) {
    heatmap.addEventListener("click", (event) => {
      const cell = event.target.closest("[data-category][data-type]");
      if (!cell) {
        return;
      }
      document.getElementById("rq-filter-category").value = cell.dataset.category;
      document.getElementById("rq-filter-type").value = cell.dataset.type;
      RQ_FILTERS.category = cell.dataset.category;
      RQ_FILTERS.type_tag = cell.dataset.type;
      renderResearchQuestions();
      const grid = document.getElementById("research-grid");
      if (grid && typeof grid.scrollIntoView === "function") {
        grid.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }
}

async function syncData({ force = false } = {}) {
  document.body.classList.add("is-loading");
  let dashboardChanged = force;
  let readingsChanged = force;

  try {
    const runtime = await loadJson(DATA_URLS.runtime, null);

    if (runtime) {
      STATE.runtime = runtime;
      const nextDashboardToken = runtime.dashboard && runtime.dashboard.generated_at
        ? runtime.dashboard.generated_at
        : STATE.tokens.dashboard;
      const nextReadingsToken = runtime.readings && runtime.readings.generated_at
        ? runtime.readings.generated_at
        : STATE.tokens.readings;

      dashboardChanged = force || !STATE.dashboard || nextDashboardToken !== STATE.tokens.dashboard;
      readingsChanged = force || !STATE.readings || nextReadingsToken !== STATE.tokens.readings;

      const loaders = [];
      if (dashboardChanged) {
        loaders.push(
          loadJson(DATA_URLS.dashboard).then((dashboard) => {
            STATE.dashboard = dashboard;
            STATE.tokens.dashboard = dashboard && dashboard.meta ? dashboard.meta.generated_at || nextDashboardToken : nextDashboardToken;
          })
        );
      }
      if (readingsChanged) {
        loaders.push(
          loadJson(DATA_URLS.readings, emptyReadingsPayload()).then((readings) => {
            STATE.readings = readings || emptyReadingsPayload();
            STATE.tokens.readings = readings && readings.meta ? readings.meta.generated_at || nextReadingsToken : nextReadingsToken;
          })
        );
      }
      await Promise.all(loaders);
      STATE.tokens.buildCount = runtime.build_count || 0;
    } else {
      const [dashboard, readings] = await Promise.all([
        loadJson(DATA_URLS.dashboard),
        loadJson(DATA_URLS.readings, emptyReadingsPayload()),
      ]);
      STATE.dashboard = dashboard;
      STATE.readings = readings || emptyReadingsPayload();
      STATE.runtime = {};
      STATE.tokens.dashboard = dashboard && dashboard.meta ? dashboard.meta.generated_at : null;
      STATE.tokens.readings = readings && readings.meta ? readings.meta.generated_at : null;
      dashboardChanged = true;
      readingsChanged = true;
    }

    // Research questions: always try to load; cheap and static.
    try {
      const research = await loadJson(DATA_URLS.research, null);
      if (research) {
        const nextResearchToken = (research.meta && research.meta.last_updated) || null;
        if (force || nextResearchToken !== STATE.tokens.research) {
          STATE.research = research;
          STATE.tokens.research = nextResearchToken;
        }
      }
    } catch (_err) {
      /* swallow — dashboard renders gracefully without RQ payload */
    }

    renderChrome();
    if (dashboardChanged) {
      renderDashboard();
    }
    if (readingsChanged) {
      renderReadings();
    }
    if (dashboardChanged || readingsChanged || force) {
      renderFooter();
      document.body.classList.add("is-syncing");
      window.setTimeout(() => document.body.classList.remove("is-syncing"), 700);
    }

    applyDashboardView();

    setError("");
  } catch (error) {
    console.error(error);
    setError(`Dashboard refresh failed: ${error.message || error}`);
  } finally {
    nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS;
    updateRefreshCountdown();
    document.body.classList.remove("is-loading");
  }
}

async function loadJson(url, fallback) {
  const response = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Failed to load ${url} (${response.status})`);
  }
  return response.json();
}

function renderChrome() {
  const dashboardMeta = (STATE.dashboard && STATE.dashboard.meta) || {};
  const study = dashboardMeta.study || {};
  const runtime = STATE.runtime || {};
  const readings = STATE.readings || emptyReadingsPayload();
  const topCategory = readings.summary.categories[0];

  document.getElementById("updated-at").textContent = formatDateTime(dashboardMeta.generated_at);
  document.getElementById("data-source-chip").textContent = dashboardMeta.data_source || "dashboard";
  document.getElementById("side-meta").innerHTML = [
    `<b>${escapeHtml(study.pi || "Jessica Bradshaw, PhD")}</b>`,
    escapeHtml(study.institution || "ESD Lab · University of South Carolina"),
    "",
    `Data source:<br><code>${escapeHtml(dashboardMeta.data_source || "unavailable")}</code>`,
  ].join("<br>");

  document.getElementById("sync-state").textContent = (runtime.status || "standby").toUpperCase();
  document.getElementById("runtime-build-count").textContent = String(runtime.build_count || 0);
  document.getElementById("runtime-build-status").textContent = runtime.last_build_finished_at
    ? `Last rebuild ${formatDateTime(runtime.last_build_finished_at)}`
    : "Waiting for first sync";
  document.getElementById("runtime-readings-count").textContent = String(readings.summary.total_readings || 0);
  document.getElementById("runtime-readings-latest").textContent = readings.meta.latest_modified_at
    ? `Latest file ${formatDateTime(readings.meta.latest_modified_at)}`
    : "No readings indexed yet";
  document.getElementById("runtime-refresh-interval").textContent = `${runtime.watch_interval_seconds || REFRESH_INTERVAL_MS / 1000}s`;
  document.getElementById("runtime-source").textContent = topCategory
    ? `Top category: ${topCategory.label}`
    : "Watching source folders";
  document.getElementById("sync-notes").textContent = runtime.errors && runtime.errors.length
    ? runtime.errors.join(" · ")
    : "Watching dashboard inputs and the ESD Lab readings library for changes, then updating the charts without a hard page reload.";

  renderViewPanelSignals();
}

function renderViewPanelSignals() {
  const dashboard = STATE.dashboard;
  if (!dashboard) {
    return;
  }

  const enrollment = (dashboard.enrollment && dashboard.enrollment.by_group) || {};
  const audit = (dashboard.redcap_audit && dashboard.redcap_audit.summary) || {};
  const total = Object.values(enrollment).reduce((sum, group) => sum + Number(group.current || 0), 0);
  const target = Object.values(enrollment).reduce((sum, group) => sum + Number(group.target || 0), 0);
  const enrollmentProgress = target ? (total / target) * 100 : 0;

  const missingness = Array.isArray(dashboard.data_quality && dashboard.data_quality.missingness)
    ? dashboard.data_quality.missingness
    : [];
  const meanMissing = missingness.length
    ? missingness.reduce((sum, item) => sum + Number(item.pct_missing || 0), 0) / missingness.length
    : 0;
  const completeness = missingness.length ? 100 - meanMissing : 0;
  const highestMissingness = missingness
    .slice()
    .sort((left, right) => Number(right.pct_missing || 0) - Number(left.pct_missing || 0))[0];

  const bestModel = ((dashboard.ml_performance && dashboard.ml_performance.models) || [])
    .slice()
    .sort((left, right) => Number(right.auroc || 0) - Number(left.auroc || 0))[0];

  const readings = STATE.readings || emptyReadingsPayload();
  const runtime = STATE.runtime || {};
  const readingSummary = readings.summary || {};
  const categoryCount = Array.isArray(readingSummary.categories) ? readingSummary.categories.length : 0;
  const queryCount = Number(audit.open_queries || 0);

  setText("view-signal-enrollment-value", `${formatInt(total)} / ${formatInt(target)}`);
  setText(
    "view-signal-enrollment-note",
    `${enrollmentProgress.toFixed(1)}% of target · ${formatEnrollmentSignal(enrollment)}`
  );
  setText("view-header-enrollment-value", `${formatInt(total)} / ${formatInt(target)}`);
  setText("view-header-enrollment-note", `${enrollmentProgress.toFixed(1)}% of target`);
  setSignalMeterWidth("view-header-enrollment-bar", enrollmentProgress);
  setSignalMeterWidth("view-signal-enrollment-bar", enrollmentProgress);

  setText("view-signal-quality-value", `${completeness.toFixed(1)}% ready`);
  setText(
    "view-signal-quality-note",
    highestMissingness
      ? `${formatInt(queryCount)} open quer${queryCount === 1 ? "y" : "ies"} · ${humanizeSignalLabel(highestMissingness.instrument)} missing ${Number(highestMissingness.pct_missing || 0).toFixed(1)}%`
      : `${formatInt(queryCount)} open quer${queryCount === 1 ? "y" : "ies"} · Missingness diagnostics pending`
  );
  setText("view-header-quality-value", `${completeness.toFixed(1)}%`);
  setText("view-header-quality-note", `${formatInt(queryCount)} open quer${queryCount === 1 ? "y" : "ies"}`);
  setSignalMeterWidth("view-header-quality-bar", completeness);
  setSignalMeterWidth("view-signal-quality-bar", completeness);

  if (bestModel) {
    const ciText = Array.isArray(bestModel.auroc_ci)
      ? `[${bestModel.auroc_ci[0]}-${bestModel.auroc_ci[1]}]`
      : "CI pending";
    setText("view-signal-model-value", `${Number(bestModel.auroc || 0).toFixed(3)} AUROC`);
    setText("view-signal-model-note", `${bestModel.name} · 95% CI ${ciText}`);
    setText("view-header-model-value", `${Number(bestModel.auroc || 0).toFixed(3)} AUROC`);
    setText("view-header-model-note", bestModel.name || "Best model live");
    setSignalMeterWidth("view-header-model-bar", Number(bestModel.auroc || 0) * 100);
    setSignalMeterWidth("view-signal-model-bar", Number(bestModel.auroc || 0) * 100);
  } else {
    setText("view-signal-model-value", "Pending");
    setText("view-signal-model-note", "Model metrics populate after the next successful dashboard refresh.");
    setText("view-header-model-value", "Pending");
    setText("view-header-model-note", "Awaiting metrics");
    setSignalMeterWidth("view-header-model-bar", 14);
    setSignalMeterWidth("view-signal-model-bar", 14);
  }

  const totalReadings = Number(readingSummary.total_readings || 0);
  const totalPages = Number(readingSummary.total_pages || 0);
  const watchInterval = Number(runtime.watch_interval_seconds || REFRESH_INTERVAL_MS / 1000);
  setText("view-signal-library-value", `${formatInt(totalReadings)} readings`);
  setText(
    "view-signal-library-note",
    `${formatInt(totalPages)} pages · ${formatInt(categoryCount)} categor${categoryCount === 1 ? "y" : "ies"} tracked · ${watchInterval}s cadence`
  );
  setText("view-header-library-value", `${formatInt(totalReadings)} readings`);
  setText("view-header-library-note", `${formatInt(totalPages)} pages tracked`);
  setSignalMeterWidth("view-header-library-bar", totalPages ? Math.min(100, Math.max(18, totalPages / 8)) : 18);
  setSignalMeterWidth("view-signal-library-bar", totalPages ? Math.min(100, Math.max(18, totalPages / 8)) : 18);
}

function setSignalMeterWidth(id, value) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }
  const safeValue = Math.max(0, Math.min(100, Number(value || 0)));
  const visibleValue = safeValue > 0 ? Math.max(10, safeValue) : 0;
  element.style.width = `${visibleValue}%`;
}

function formatEnrollmentSignal(enrollment) {
  return Object.entries(enrollment)
    .slice(0, 3)
    .map(([groupCode, group]) => `${groupCode} ${formatInt(Number(group.current || 0))}`)
    .join(" · ");
}

function humanizeSignalLabel(value) {
  return String(value || "Signal")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderDashboard() {
  renderOrganizationSections();
  renderOverview();
  renderEnrollmentChart();
  renderProgressChart();
  renderQualitySection();
  renderMlSection();
  renderTrajectoryChart();
  renderTrajectoriesTable();
  renderCompletionChart();
  drawCohort();
  renderResearchQuestions();
  renderGeo();
  decorateRevealTargets();
}

function renderOverview() {
  const enrollment = STATE.dashboard.enrollment.by_group;
  const audit = STATE.dashboard.redcap_audit.summary;
  const total = enrollment.ASIB.current + enrollment.PT.current + enrollment.TD.current;
  const target = enrollment.ASIB.target + enrollment.PT.target + enrollment.TD.target;
  const pctValue = target ? (total / target) * 100 : 0;
  const pct = pctValue.toFixed(1);

  setText("kpi-enroll", `${formatInt(total)} / ${formatInt(target)}`);
  setText("kpi-enroll-delta", `${pct}% of R01 target`);
  animateNumber("kpi-active", audit.active_participants, (value) => formatInt(Math.round(value)));
  setText("kpi-active-delta", `${formatInt(audit.withdrawn)} withdrawn · ${formatInt(audit.total_participants_enrolled)} enrolled`);
  animateNumber("kpi-queries", audit.open_queries, (value) => formatInt(Math.round(value)));

  const bestModel = (STATE.dashboard.ml_performance.models || []).slice().sort((left, right) => right.auroc - left.auroc)[0];
  if (bestModel) {
    animateNumber("kpi-auroc", bestModel.auroc, (value) => value.toFixed(3));
    setText(
      "kpi-auroc-sub",
      `${bestModel.name} · 95% CI [${bestModel.auroc_ci[0]}-${bestModel.auroc_ci[1]}]`
    );
  }

  const missingness = STATE.dashboard.data_quality.missingness || [];
  const meanMissing = missingness.length
    ? missingness.reduce((sum, item) => sum + item.pct_missing, 0) / missingness.length
    : 0;
  const completeness = 100 - meanMissing;
  animateNumber("kpi-completeness", completeness, (value) => `${value.toFixed(1)}%`);

  const queryCard = document.getElementById("kpi-queries") && document.getElementById("kpi-queries").closest(".kpi-card");
  const aurocCard = document.getElementById("kpi-auroc") && document.getElementById("kpi-auroc").closest(".kpi-card");
  const completenessCard = document.getElementById("kpi-completeness") && document.getElementById("kpi-completeness").closest(".kpi-card");
  const completenessDelta = document.getElementById("kpi-completeness") && document.getElementById("kpi-completeness").nextElementSibling;
  if (queryCard) {
    queryCard.dataset.kpiTone = audit.open_queries ? "warn" : "default";
  }
  if (aurocCard) {
    aurocCard.dataset.kpiTone = "accent";
  }
  if (completenessCard) {
    completenessCard.dataset.kpiTone = completeness < 80 ? "warn" : "default";
  }
  if (completenessDelta) {
    completenessDelta.classList.toggle("warn", completeness < 80);
    completenessDelta.classList.toggle("ok", completeness >= 80);
  }

  animateNumber("home-progress-total", pctValue, (value) => `${value.toFixed(1)}%`);
  setText("home-progress-note", `${formatInt(total)} enrolled of ${formatInt(target)} planned across ASIB, PT, and TD.`);
  animateNumber("home-active-total", audit.active_participants, (value) => formatInt(Math.round(value)));
  setText("home-active-note", `${formatInt(audit.total_participants_enrolled)} total enrolled · ${formatInt(audit.withdrawn)} withdrawn.`);
  animateNumber("home-completeness-total", completeness, (value) => `${value.toFixed(1)}%`);
  setText(
    "home-completeness-note",
    `${formatInt(audit.open_queries)} open REDCap quer${audit.open_queries === 1 ? "y" : "ies"} currently assigned for follow-up.`
  );

  if (bestModel) {
    setText("home-best-model", `${bestModel.auroc.toFixed(3)} AUROC`);
    setText(
      "home-best-model-note",
      `${bestModel.name} with 95% CI [${bestModel.auroc_ci[0]}-${bestModel.auroc_ci[1]}].`
    );
  } else {
    setText("home-best-model", "Pending");
    setText("home-best-model-note", "Model evaluation will populate after the next dashboard refresh.");
  }

  animateNumber("runtime-query-count", audit.open_queries, (value) => formatInt(Math.round(value)));
  setText(
    "runtime-query-status",
    audit.open_queries
      ? `${formatInt(audit.open_queries)} item${audit.open_queries === 1 ? " needs" : "s need"} REDCap review.`
      : "All current REDCap queries are resolved."
  );

  const homeArmGrid = document.getElementById("home-arm-grid");
  if (homeArmGrid) {
    homeArmGrid.innerHTML = Object.entries(enrollment).map(([groupCode, group]) => {
      const progress = Math.max(0, Math.min(100, Number(group.percent || 0)));
      const label = escapeHtml(group.label || groupCode);
      const color = escapeHtml(group.color || "#7f241c");
      const note = `${formatInt(group.current || 0)} of ${formatInt(group.target || 0)} participants enrolled`;
      return `
        <a class="sync-arm-card arm-card" data-arm-code="${escapeHtml(groupCode)}" href="#overview-enrollment">
          <div class="sync-arm-head">
            <span class="sync-arm-label">${escapeHtml(groupCode)}</span>
            <strong class="sync-arm-value">${progress.toFixed(0)}%</strong>
          </div>
          <span>${label}</span>
          <div class="sync-arm-bar" aria-hidden="true"><span class="sync-arm-fill" style="width:${progress.toFixed(1)}%; background:${color};"></span></div>
          <span class="sync-arm-note">${escapeHtml(note)}</span>
        </a>
      `;
    }).join("");
  }

  renderHomePulseSurface({ enrollment, audit, total, target, pctValue, completeness, bestModel });

  decorateRevealTargets();
}

function renderHomePulseSurface({ enrollment, audit, total, target, pctValue, completeness, bestModel }) {
  const runtime = STATE.runtime || {};
  const readings = STATE.readings || emptyReadingsPayload();
  const readingSummary = readings.summary || {};
  const categories = Array.isArray(readingSummary.categories) ? readingSummary.categories : [];
  const topCategory = categories[0] || null;
  const totalReadings = Number(readingSummary.total_readings || 0);
  const totalPages = Number(readingSummary.total_pages || 0);
  const categoryCount = categories.length;
  const watchInterval = Number(runtime.watch_interval_seconds || REFRESH_INTERVAL_MS / 1000);
  const leadingArm = Object.entries(enrollment)
    .slice()
    .sort((left, right) => Number((right[1] && right[1].percent) || 0) - Number((left[1] && left[1].percent) || 0))[0];
  const groupSummary = Object.entries(enrollment)
    .slice(0, 3)
    .map(([groupCode, group]) => `${groupCode} ${formatInt(Number((group && group.current) || 0))}`)
    .join(" · ");

  setText("home-pulse-enrollment-value", `${formatInt(total)} / ${formatInt(target)}`);
  setText("home-pulse-enrollment-note", `${pctValue.toFixed(1)}% of target · ${groupSummary}`);
  setSignalMeterWidth("home-pulse-enrollment-bar", pctValue);

  setText("home-pulse-quality-value", `${completeness.toFixed(1)}% ready`);
  setText(
    "home-pulse-quality-note",
    `${formatInt(audit.open_queries)} open quer${audit.open_queries === 1 ? "y" : "ies"} · ${formatInt(audit.active_participants)} active records`
  );
  setSignalMeterWidth("home-pulse-quality-bar", completeness);

  if (bestModel) {
    setText("home-pulse-model-value", `${Number(bestModel.auroc || 0).toFixed(3)} AUROC`);
    setText("home-pulse-model-note", `${bestModel.name} currently leads the live model board.`);
    setSignalMeterWidth("home-pulse-model-bar", Number(bestModel.auroc || 0) * 100);
  } else {
    setText("home-pulse-model-value", "Pending");
    setText("home-pulse-model-note", "Model evaluation will populate after the next dashboard refresh.");
    setSignalMeterWidth("home-pulse-model-bar", 14);
  }

  setText("home-pulse-library-value", `${formatInt(totalReadings)} readings`);
  setText(
    "home-pulse-library-note",
    topCategory
      ? `${topCategory.label} leads · ${formatInt(totalPages)} pages indexed`
      : `${formatInt(totalPages)} pages indexed across ${formatInt(categoryCount)} categories`
  );
  setSignalMeterWidth("home-pulse-library-bar", totalPages ? Math.min(100, Math.max(18, totalPages / 8)) : 18);

  setText("home-stage-focus-value", `${pctValue.toFixed(0)}% aligned`);
  setText(
    "home-stage-focus-note",
    bestModel
      ? `${bestModel.name} leads the live model board · ${watchInterval}s watch cadence.`
      : `${watchInterval}s watch cadence · ${formatInt(totalReadings)} indexed readings in the library.`
  );
  setText("home-stage-chip-enrollment", `${formatInt(total)} / ${formatInt(target)}`);
  setText("home-stage-chip-readiness", `${completeness.toFixed(0)}% ready`);
  setText("home-stage-chip-library", `${formatInt(totalReadings)} indexed`);
  setSignalMeterWidth("home-stage-bar-enrollment", pctValue);
  setSignalMeterWidth("home-stage-bar-readiness", completeness);
  setSignalMeterWidth(
    "home-stage-bar-library",
    totalReadings ? Math.min(100, Math.max(18, totalReadings * 4)) : 18
  );

  setText("home-ambient-runtime-value", `${watchInterval}s watch`);
  setText(
    "home-ambient-runtime-note",
    runtime.last_build_finished_at
      ? `Last rebuild ${formatDateTime(runtime.last_build_finished_at)}`
      : "Waiting for the first live rebuild cycle."
  );

  setText(
    "home-ambient-library-value",
    topCategory ? shortText(topCategory.label, 18) : `${formatInt(categoryCount)} tracked`
  );
  setText(
    "home-ambient-library-note",
    readings.meta.latest_modified_at
      ? `Latest file ${formatDateTime(readings.meta.latest_modified_at)}`
      : "Reading library waiting for indexed content."
  );

  setText("home-ambient-query-value", `${formatInt(audit.open_queries)} open`);
  setText(
    "home-ambient-query-note",
    audit.open_queries
      ? `${formatInt(audit.open_queries)} item${audit.open_queries === 1 ? " needs" : "s need"} REDCap follow-up.`
      : "All current REDCap queries are resolved."
  );

  setText("home-ambient-cohort-value", `${formatInt(audit.active_participants)} active`);
  setText(
    "home-ambient-cohort-note",
    leadingArm
      ? `${leadingArm[0]} leads at ${Number((leadingArm[1] && leadingArm[1].percent) || 0).toFixed(0)}% of target.`
      : "Cohort movement will appear here after refresh."
  );
}

function renderOrganizationSections() {
  const organizationSite = getOrganizationSitePayload();
  renderLabsiteSection(organizationSite);
  renderImpactExplorer();
}

function renderLabsiteSection(site) {
  const summary = site.summary || {};
  const mission = site.mission || {};
  const contact = site.contact || {};
  const years = (summary.available_years || []).filter((year) => Number.isFinite(Number(year))).map(Number).sort((left, right) => right - left);
  const yearsLabel = years.length ? `${years[years.length - 1]}-${years[0]}` : "—";
  const leadStudy = (site.studies || []).find((study) => study.compensation) || (site.studies || [])[0] || null;

  setText(
    "labsite-summary-copy",
    mission.summary
      || "Derived from the public organization site: mission, current studies, family pathway, partner links, and public-facing outreach signals that complement the internal NANO dashboard views."
  );

  animateNumber("labsite-kpi-studies", Number(summary.current_public_studies || (site.studies || []).length), (value) => formatInt(Math.round(value)));
  animateNumber("labsite-kpi-stories", Number(summary.featured_stories || (site.stories || []).length), (value) => formatInt(Math.round(value)));
  animateNumber("labsite-kpi-partners", Number(summary.partner_count || (site.partners || []).length), (value) => formatInt(Math.round(value)));
  setText("labsite-kpi-years", yearsLabel);
  setText("labsite-kpi-compensation", leadStudy && leadStudy.compensation ? leadStudy.compensation : "See study page");
  setText("labsite-kpi-studies-note", `${formatInt((site.studies || []).length)} structured study card${(site.studies || []).length === 1 ? "" : "s"} from the public site`);
  setText("labsite-kpi-stories-note", `${formatInt((site.stories || []).length)} participant stor${(site.stories || []).length === 1 ? "y" : "ies"} currently indexed`);
  setText("labsite-kpi-partners-note", `${formatInt((site.resources || []).length)} family resource link${(site.resources || []).length === 1 ? "" : "s"} plus partner organizations`);
  setText("labsite-kpi-years-note", `${formatInt(summary.publication_items || (site.publications || []).length)} publication item${(summary.publication_items || (site.publications || []).length) === 1 ? "" : "s"} and ${formatInt(summary.news_mentions || (site.news || []).length)} news mention${(summary.news_mentions || (site.news || []).length) === 1 ? "" : "s"}`);
  setText("labsite-kpi-compensation-note", leadStudy && leadStudy.title ? `${leadStudy.title} participation incentive surfaced on the site` : "Public study compensation details when available");

  setText(
    "labsite-mission-title",
    mission.headline || "Clinical infant research translated for families and community partners"
  );
  setText(
    "labsite-mission-copy",
    mission.mission_text
      || mission.summary
      || "The organization site positions the ESD Lab as a USC clinical research lab translating infant development science into earlier autism identification and practical family support."
  );
  document.getElementById("labsite-mission-list").innerHTML = (mission.details || [])
    .map((detail) => `<li>${escapeHtml(detail)}</li>`)
    .join("");
  document.getElementById("labsite-team-grid").innerHTML = (site.team_highlights || [])
    .slice(0, 4)
    .map(
      (person) => `
        <a class="lab-link-card" href="${escapeHtml(person.href || "https://www.esdlabsc.com/our-team")}" target="_blank" rel="noreferrer noopener">
          <strong>${escapeHtml(person.name)}</strong>
          <span>${escapeHtml(person.role || "Team member")}</span>
          <span>${escapeHtml(person.summary || "")}</span>
        </a>`
    )
    .join("");
  document.getElementById("labsite-mission-links").innerHTML = [
    { label: "About the lab", href: "https://www.esdlabsc.com/about" },
    { label: "Our team", href: "https://www.esdlabsc.com/our-team" },
    { label: "Main website", href: summary.main_site_url || "https://www.esdlabsc.com/" },
    { label: "Contact page", href: contact.contact_url || summary.contact_url || "https://www.esdlabsc.com/contact-us" },
  ]
    .map((item) => `<a href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.label)}</a>`)
    .join("");

  setText("labsite-studies-title", `Recruitment and participation details surfaced on the public site${site.meta && site.meta.source_mode === "fallback" ? " (fallback snapshot)" : ""}`);
  document.getElementById("labsite-study-stack").innerHTML = (site.studies || [])
    .map(
      (study) => `
        <article class="lab-study-card">
          <div class="lab-study-kicker">${escapeHtml(study.title)}</div>
          <h4>${escapeHtml(study.summary || study.audience || "Study details")}</h4>
          <p class="lab-copy">${escapeHtml((study.details || []).slice(0, 2).join(" ") || study.summary || "")}</p>
          <div class="lab-chip-row">
            ${(study.eligibility || []).slice(0, 3).map((item) => `<span class="lab-chip">${escapeHtml(item)}</span>`).join("")}
            ${study.compensation ? `<span class="lab-chip">${escapeHtml(study.compensation)}</span>` : ""}
          </div>
          <div class="reading-actions impact-actions">
            <a class="reading-link" href="${escapeHtml(study.href || summary.signup_url || "https://www.esdlabsc.com/our-studies")}" target="_blank" rel="noreferrer noopener">${escapeHtml(study.cta_label || "Open study page")}</a>
            <span>${escapeHtml(study.audience || "Public recruitment path")}</span>
          </div>
        </article>`
    )
    .join("");
  document.getElementById("labsite-study-links").innerHTML = [
    { label: "Current studies page", href: "https://www.esdlabsc.com/our-studies" },
    { label: "Newborn sign-up", href: contact.signup_url || summary.signup_url || "https://www.esdlabsc.com/newborn-sign-up" },
    { label: "Contact the lab", href: contact.contact_url || summary.contact_url || "https://www.esdlabsc.com/contact-us" },
  ]
    .map((item) => `<a href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.label)}</a>`)
    .join("");

  setText("labsite-pathway-title", "What the public site asks families to do, and what they get back");
  document.getElementById("labsite-pathway-grid").innerHTML = (site.family_pathway || [])
    .map(
      (step, index) => `
        <div class="lab-step">
          <span class="lab-step-index">${index + 1}</span>
          <div>
            <strong>${escapeHtml(step.title || `Step ${index + 1}`)}</strong>
            <p class="lab-copy">${escapeHtml(step.description || "")}</p>
          </div>
        </div>`
    )
    .join("");
  document.getElementById("labsite-pathway-links").innerHTML = (site.family_pathway || [])
    .slice(0, 3)
    .map((step) => `<a href="${escapeHtml(step.href || "https://www.esdlabsc.com/")}" target="_blank" rel="noreferrer noopener">${escapeHtml(step.link_label || step.title || "Open link")}</a>`)
    .join("");

  setText("labsite-impact-title", "How the organization presents dissemination, credibility, and family outcomes");
  document.getElementById("labsite-impact-list").innerHTML = [
    `${formatInt((site.publications || []).length)} publication or presentation item${(site.publications || []).length === 1 ? "" : "s"} indexed from the public archive.`,
    `${formatInt((site.news || []).length)} news mention${(site.news || []).length === 1 ? "" : "s"} currently captured across university and external coverage.`,
    `${formatInt((site.stories || []).length)} participant stor${(site.stories || []).length === 1 ? "y" : "ies"} surfaced as family-centered outcome narratives.`,
  ]
    .map((detail) => `<li>${escapeHtml(detail)}</li>`)
    .join("");
  document.getElementById("labsite-impact-links").innerHTML = [
    { label: "Open impact explorer", href: "#impact-overview", external: false, copy: "Filter the combined publication, news, and story feed inside the dashboard." },
    { label: "Publications & posters", href: "https://www.esdlabsc.com/publications-presentations", external: true, copy: "Browse talks, posters, and publication groupings from the public site." },
    { label: "News archive", href: "https://www.esdlabsc.com/news", external: true, copy: "Review external press and university coverage tied to the lab." },
    { label: "Participant stories", href: "https://www.esdlabsc.com/participant-stories", external: true, copy: "Read family narratives that translate study participation into concrete outcomes." },
  ]
    .map((item) => item.external
      ? `<a class="lab-link-card" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer noopener"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.copy)}</span></a>`
      : `<a class="lab-link-card" href="${escapeHtml(item.href)}"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.copy)}</span></a>`)
    .join("");

  setText("labsite-connect-title", "Important outbound links for families, providers, and collaborators");
  setText(
    "labsite-connect-copy",
    `Source mode: ${(site.meta && site.meta.source_mode) || "unavailable"}. Contact, outreach, and support links are rendered from the organization payload so the dashboard can stay aligned with the public website.`
  );
  document.getElementById("labsite-contact-grid").innerHTML = [
    { label: "Phone", value: contact.phone || summary.phone || "Not listed", note: "General participant and family questions" },
    { label: "Email", value: (contact.emails && contact.emails[0]) || (summary.emails && summary.emails[0]) || "Not listed", note: "Primary public contact" },
    { label: "Spanish outreach", value: contact.spanish_email || (contact.emails || []).find((email) => email.includes("espanol")) || "See contact page", note: "Bilingual family contact route" },
    { label: "Visit location", value: contact.address || summary.address || "See contact page", note: "Publicly listed visit location" },
    { label: "Partner network", value: `${formatInt((site.partners || []).length)} organizations`, note: "Community and support partners linked from the public site" },
    { label: "Resource library", value: `${formatInt((site.resources || []).length)} links`, note: "Autism, EI, special education, and family support resources" },
  ]
    .map(
      (item) => `
        <div class="lab-contact-card">
          <span class="lab-contact-label">${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <span>${escapeHtml(item.note)}</span>
        </div>`
    )
    .join("");
  document.getElementById("labsite-resource-grid").innerHTML = [
    ...(site.resources || []).slice(0, 4).map((resource) => ({
      label: resource.title,
      href: resource.href,
      copy: `${resource.category || "Resource"} link from the public site.`,
    })),
    ...(site.partners || []).slice(0, 2).map((partner) => ({
      label: partner.name,
      href: partner.href,
      copy: "Partner organization linked from the ESD Lab site.",
    })),
  ]
    .slice(0, 6)
    .map(
      (item) => `<a class="lab-link-card" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer noopener"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.copy)}</span></a>`
    )
    .join("");
  document.getElementById("labsite-connect-links").innerHTML = [
    { label: "Contact the lab", href: contact.contact_url || summary.contact_url || "https://www.esdlabsc.com/contact-us" },
    { label: "Sign up for a study", href: contact.signup_url || summary.signup_url || "https://www.esdlabsc.com/newborn-sign-up" },
    contact.parking_url ? { label: "Parking instructions", href: contact.parking_url } : null,
    contact.undergraduate_application_url ? { label: "Undergraduate RA application", href: contact.undergraduate_application_url } : null,
    contact.instagram_url ? { label: "Instagram", href: contact.instagram_url } : null,
  ]
    .filter(Boolean)
    .map((item) => `<a href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer noopener">${escapeHtml(item.label)}</a>`)
    .join("");
}

function renderImpactExplorer() {
  const site = getOrganizationSitePayload();
  const impactSummary = site.impact_summary || {};
  const searchTerm = document.getElementById("filter-impact-search").value.trim().toLowerCase();
  const selectedKind = document.getElementById("filter-impact-kind").value;
  const selectedYear = document.getElementById("filter-impact-year").value;
  const sortMode = document.getElementById("filter-impact-sort").value;
  const allItems = (site.impact_feed || []).map((item) => ({
    ...item,
    _score: scoreImpactMatch(item, searchTerm),
  }));
  const years = (impactSummary.years || site.summary.available_years || []).filter(Boolean).map(Number).sort((left, right) => right - left);

  syncImpactYearOptions(years);

  let items = allItems.slice();
  if (selectedKind !== "all") {
    items = items.filter((item) => item.kind === selectedKind);
  }
  if (selectedYear !== "all") {
    items = items.filter((item) => String(item.year || "") === selectedYear);
  }
  if (searchTerm) {
    items = items.filter((item) => item._score > 0);
  }
  items.sort((left, right) => sortImpactItems(left, right, sortMode, searchTerm));

  setText(
    "impact-summary-copy",
    site.meta && site.meta.source_mode === "fallback"
      ? "The impact explorer is currently using the bundled fallback snapshot because the public-site fetch was unavailable during the last build."
      : "Filter publications, news mentions, and participant stories sourced from esdlabsc.com."
  );

  animateNumber("impact-kpi-total", allItems.length, (value) => formatInt(Math.round(value)));
  animateNumber("impact-kpi-publications", (site.publications || []).length, (value) => formatInt(Math.round(value)));
  setText("impact-kpi-years", years.length ? `${years[years.length - 1]}-${years[0]}` : "—");
  setText("impact-kpi-total-note", `${formatInt(items.length)} item${items.length === 1 ? "" : "s"} in the current filtered view`);
  setText("impact-kpi-publications-note", `${formatInt((site.news || []).length)} news mention${(site.news || []).length === 1 ? "" : "s"} · ${formatInt((site.stories || []).length)} stor${(site.stories || []).length === 1 ? "y" : "ies"}`);
  setText("impact-kpi-years-note", `${formatInt(years.length)} year bucket${years.length === 1 ? "" : "s"} represented in the current site payload`);
  animateNumber("impact-signal-filtered", items.length, (value) => formatInt(Math.round(value)));
  setText("impact-signal-year", years[0] ? String(years[0]) : "—");
  setText("impact-signal-mode", formatImpactSourceMode(site.meta && site.meta.source_mode));
  setText("impact-signal-types", `${formatInt((impactSummary.types || []).length || 3)} kinds`);

  document.getElementById("impact-type-stack").innerHTML = (impactSummary.types || [
    { label: "Publications", value: "publication", count: (site.publications || []).length },
    { label: "News", value: "news", count: (site.news || []).length },
    { label: "Stories", value: "story", count: (site.stories || []).length },
  ])
    .map(
      (item) => `
        <div class="reading-source-row">
          <span>${escapeHtml(item.label)}</span>
          <strong>${formatInt(item.count || 0)}</strong>
        </div>`
    )
    .join("");
  document.getElementById("impact-year-chip-bar").innerHTML = years
    .slice(0, 6)
    .map((year) => `<span class="chip">${escapeHtml(String(year))}</span>`)
    .join("");
  document.getElementById("impact-type-chip-bar").innerHTML = (impactSummary.types || [
    { label: "Publications", value: "publication", count: (site.publications || []).length },
    { label: "News", value: "news", count: (site.news || []).length },
    { label: "Stories", value: "story", count: (site.stories || []).length },
  ])
    .map(
      (item) => `
        <button class="chip ${selectedKind === item.value ? "is-active" : ""}" type="button" data-kind="${escapeHtml(item.value)}">
          ${escapeHtml(item.label)} <strong>${formatInt(item.count || 0)}</strong>
        </button>`
    )
    .join("");

  renderImpactSpotlight({ allItems, filteredItems: items, searchTerm });

  const grid = document.getElementById("impact-grid");
  if (!items.length) {
    grid.innerHTML = '<div class="empty-state impact-empty">No public-site impact items match the current filters. Clear the search or broaden the type/year filters to restore the full feed.</div>';
    return;
  }

  grid.innerHTML = items
    .map(
      (item) => `
        <article class="reading-card impact-card reveal is-visible impact-card-${escapeHtml(item.kind || "item")}">
          <div>
            <div class="impact-meta">
              <span class="impact-badge impact-badge-${escapeHtml(item.kind || "item")}">${escapeHtml(formatImpactKind(item.kind))}</span>
              <span>${escapeHtml(item.source || formatImpactKind(item.kind))}</span>
              <span>${item.year || "Undated"}</span>
            </div>
            <h3>${escapeHtml(item.title || "Untitled item")}</h3>
            <p class="reading-excerpt impact-summary">${escapeHtml(item.summary || "No public summary captured for this item yet.")}</p>
          </div>
          <div class="reading-tags impact-tags">
            ${(item.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
          </div>
          <div class="reading-actions impact-actions">
            <a class="reading-link" href="${escapeHtml(item.href || "https://www.esdlabsc.com/")}" target="_blank" rel="noreferrer noopener">Open source</a>
            <span>${escapeHtml(item.href || "esdlabsc.com")}</span>
          </div>
        </article>`
    )
    .join("");
}

function renderImpactSpotlight({ allItems, filteredItems, searchTerm }) {
  const spotlight = chooseImpactSpotlight({ allItems, filteredItems, searchTerm });
  setText("impact-featured-title", spotlight ? spotlight.title : "Impact spotlight");
  setText(
    "impact-featured-summary",
    spotlight
      ? (spotlight.summary || "No summary captured for this item yet.")
      : "Use the search, type, and year filters below to browse the public dissemination feed."
  );
  document.getElementById("impact-featured-meta").innerHTML = spotlight
    ? [
        `<span class="impact-badge impact-badge-${escapeHtml(spotlight.kind || "item")}">${escapeHtml(formatImpactKind(spotlight.kind))}</span>`,
        `<span>${escapeHtml(spotlight.source || formatImpactKind(spotlight.kind))}</span>`,
        `<span>${spotlight.year || "Undated"}</span>`,
      ].join("")
    : "";
  document.getElementById("impact-featured-tags").innerHTML = spotlight
    ? (spotlight.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")
    : "";
  const link = document.getElementById("impact-featured-link");
  link.href = spotlight ? spotlight.href || "https://www.esdlabsc.com/" : "https://www.esdlabsc.com/";
  link.textContent = searchTerm ? "Open top match" : "Open spotlight item";
  setText("impact-featured-source", spotlight ? (spotlight.href || spotlight.source || "esdlabsc.com") : "esdlabsc.com");
}

function chooseImpactSpotlight({ allItems, filteredItems, searchTerm }) {
  if (searchTerm && filteredItems.length) {
    return filteredItems.slice().sort((left, right) => (right._score || 0) - (left._score || 0))[0];
  }
  const preferredStory = (allItems || []).find((item) => item.kind === "story");
  return filteredItems[0] || preferredStory || allItems[0] || null;
}

function syncImpactYearOptions(years) {
  const select = document.getElementById("filter-impact-year");
  const currentValue = select.value || "all";
  const nextOptions = [
    '<option value="all">All years</option>',
    ...years.map((year) => `<option value="${escapeHtml(String(year))}">${escapeHtml(String(year))}</option>`),
  ].join("");
  if (select.innerHTML !== nextOptions) {
    select.innerHTML = nextOptions;
  }
  if (["all", ...years.map((year) => String(year))].includes(currentValue)) {
    select.value = currentValue;
  }
}

function scoreImpactMatch(item, searchTerm) {
  if (!searchTerm) {
    return 1;
  }
  const terms = searchTerm.split(/\s+/).filter(Boolean);
  const title = String(item.title || "").toLowerCase();
  const summary = String(item.summary || "").toLowerCase();
  const source = String(item.source || "").toLowerCase();
  const kind = String(item.kind || "").toLowerCase();
  const tags = String((item.tags || []).join(" ")).toLowerCase();
  const href = String(item.href || "").toLowerCase();

  return terms.reduce((score, term) => {
    let next = score;
    if (title.includes(term)) {
      next += 90;
    }
    if (summary.includes(term)) {
      next += 45;
    }
    if (source.includes(term)) {
      next += 30;
    }
    if (tags.includes(term)) {
      next += 25;
    }
    if (kind.includes(term)) {
      next += 18;
    }
    if (href.includes(term)) {
      next += 8;
    }
    return next;
  }, 0);
}

function sortImpactItems(left, right, mode, searchTerm) {
  const kindOrder = { publication: 0, news: 1, story: 2 };
  if (mode === "relevance") {
    return (right._score || 0) - (left._score || 0)
      || (right.year || 0) - (left.year || 0)
      || String(left.title || "").localeCompare(String(right.title || ""));
  }
  if (mode === "title") {
    return String(left.title || "").localeCompare(String(right.title || "")) || (right.year || 0) - (left.year || 0);
  }
  if (mode === "type") {
    return (kindOrder[left.kind] ?? 99) - (kindOrder[right.kind] ?? 99)
      || (right.year || 0) - (left.year || 0)
      || String(left.title || "").localeCompare(String(right.title || ""));
  }
  if (searchTerm) {
    return (right._score || 0) - (left._score || 0)
      || (right.year || 0) - (left.year || 0)
      || String(left.title || "").localeCompare(String(right.title || ""));
  }
  return (right.year || 0) - (left.year || 0)
    || (kindOrder[left.kind] ?? 99) - (kindOrder[right.kind] ?? 99)
    || String(left.title || "").localeCompare(String(right.title || ""));
}

function formatImpactKind(kind) {
  if (kind === "publication") {
    return "Publication";
  }
  if (kind === "news") {
    return "News";
  }
  if (kind === "story") {
    return "Story";
  }
  return "Impact item";
}

function formatImpactSourceMode(mode) {
  if (mode === "live_fetch") {
    return "Live fetch";
  }
  if (mode === "fallback") {
    return "Fallback";
  }
  return "Unavailable";
}

function resetImpactFilters() {
  document.getElementById("filter-impact-search").value = "";
  document.getElementById("filter-impact-kind").value = "all";
  document.getElementById("filter-impact-year").value = "all";
  document.getElementById("filter-impact-sort").value = "recent";
  renderImpactExplorer();
}

function handleImpactChipClick(event) {
  const chip = event.target.closest("button[data-kind]");
  if (!chip) {
    return;
  }
  document.getElementById("filter-impact-kind").value = chip.dataset.kind || "all";
  renderImpactExplorer();
}

function renderEnrollmentChart() {
  const enrollment = STATE.dashboard.enrollment;
  const datasets = ["ASIB", "PT", "TD"].map((groupKey) => ({
    label: enrollment.by_group[groupKey].label,
    data: enrollment.by_group[groupKey].monthly,
    borderColor: enrollment.by_group[groupKey].color,
    backgroundColor: `${enrollment.by_group[groupKey].color}22`,
    borderWidth: 2.3,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0.28,
    fill: false,
  }));

  upsertChart("enrollment", "chart-enrollment", {
    type: "line",
    data: { labels: enrollment.months, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { usePointStyle: true, boxWidth: 8 } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
        y: { beginAtZero: true, grid: { color: COLORS.grid } },
      },
    },
  });
}

function renderProgressChart() {
  const byGroup = STATE.dashboard.enrollment.by_group;
  const labels = ["ASIB", "PT", "TD"];

  upsertChart("progress", "chart-progress", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Enrolled",
          data: labels.map((label) => byGroup[label].current),
          backgroundColor: labels.map((label) => byGroup[label].color),
        },
        {
          label: "Remaining",
          data: labels.map((label) => Math.max(0, byGroup[label].target - byGroup[label].current)),
          backgroundColor: "#ddd1c4",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { position: "top", labels: { usePointStyle: true, boxWidth: 8 } },
      },
      scales: {
        x: { stacked: true, beginAtZero: true, grid: { color: COLORS.grid } },
        y: { stacked: true, grid: { display: false } },
      },
    },
  });
}

function renderQualitySection() {
  const quality = STATE.dashboard.data_quality;
  const audit = STATE.dashboard.redcap_audit;
  const flags = quality.qc_flags || {};

  animateNumber("dq-records", flags.total_records || 0, (value) => formatInt(Math.round(value)));
  animateNumber("dq-double", flags.double_entry_discrepancies || 0, (value) => formatInt(Math.round(value)));
  animateNumber("dq-oor", flags.out_of_range_values || 0, (value) => formatInt(Math.round(value)));
  animateNumber("dq-missing", flags.missing_required_fields || 0, (value) => formatInt(Math.round(value)));
  animateNumber("dq-ecg-late", flags.ecg_transfer_late || 0, (value) => formatInt(Math.round(value)));
  animateNumber("dq-pi", audit.summary.records_pending_pi_review || 0, (value) => formatInt(Math.round(value)));

  const missingness = (quality.missingness || []).slice().sort((left, right) => right.pct_missing - left.pct_missing);
  upsertChart("missingness", "chart-missing", {
    type: "bar",
    data: {
      labels: missingness.map((row) => row.instrument),
      datasets: [
        {
          label: "% missing",
          data: missingness.map((row) => row.pct_missing),
          backgroundColor: missingness.map((row) => {
            if (row.pct_missing > 25) {
              return COLORS.bad;
            }
            if (row.pct_missing > 10) {
              return COLORS.warn;
            }
            return COLORS.ok;
          }),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(context) {
              const record = missingness[context.dataIndex];
              return `${context.parsed.x.toFixed(1)}% · ${record.status}`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 40,
          grid: { color: COLORS.grid },
          ticks: { callback: (value) => `${value}%` },
        },
        y: { grid: { display: false } },
      },
    },
  });

  upsertChart("queries", "chart-queries", {
    type: "bar",
    data: {
      labels: (audit.queries_by_event || []).map((row) => row.event),
      datasets: [
        {
          label: "Open queries",
          data: (audit.queries_by_event || []).map((row) => row.open),
          backgroundColor: `${COLORS.accent}cc`,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 45 } },
        y: { beginAtZero: true, grid: { color: COLORS.grid } },
      },
    },
  });

  document.querySelector("#table-audit tbody").innerHTML = (audit.recent_activity || [])
    .map(
      (row) =>
        `<tr><td class="t-mono">${escapeHtml(row.date)}</td><td>${escapeHtml(row.action)}</td><td class="t-mono">${escapeHtml(row.record_id)}</td><td>${escapeHtml(row.user)}</td></tr>`
    )
    .join("");

  decorateRevealTargets();
}

function renderMlSection() {
  const ml = STATE.dashboard.ml_performance || {};
  const models = ml.models || [];

  renderMlExplainer(ml);

  upsertChart("roc", "chart-roc", {
    type: "line",
    data: {
      datasets: models
        .map((model, index) => ({
          label: `${model.name} (AUROC ${model.auroc})`,
          data: (model.roc.fpr || []).map((fpr, pointIndex) => ({ x: fpr, y: model.roc.tpr[pointIndex] })),
          borderColor: COLORS.models[index % COLORS.models.length],
          backgroundColor: `${COLORS.models[index % COLORS.models.length]}22`,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.12,
          fill: false,
        }))
        .concat([
          {
            label: "Chance (AUROC 0.5)",
            data: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
            borderColor: "#b6aca4",
            borderDash: [4, 4],
            borderWidth: 1,
            pointRadius: 0,
            fill: false,
          },
        ]),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { usePointStyle: true, boxWidth: 8, font: { size: 10 } } },
      },
      scales: {
        x: { type: "linear", min: 0, max: 1, title: { display: true, text: "False Positive Rate" }, grid: { color: COLORS.grid } },
        y: { type: "linear", min: 0, max: 1, title: { display: true, text: "True Positive Rate" }, grid: { color: COLORS.grid } },
      },
    },
  });

  const shapRows = (ml.shap || [])
    .slice()
    .sort((left, right) => Number(right.importance || 0) - Number(left.importance || 0))
    .slice(0, 8);
  const topImportance = shapRows.length ? Number(shapRows[0].importance || 0) : 0;
  const shapList = document.getElementById("ml-shap-ranks");
  if (shapList) {
    shapList.innerHTML = shapRows
      .map((feature, index) => {
        const label = escapeHtml(feature.label || humanizeFeatureKey(feature.feature || `Feature ${index + 1}`));
        const width = topImportance > 0 ? Math.max(14, (Number(feature.importance || 0) / topImportance) * 100) : 14;
        return `
          <div class="ml-shap-rank-item">
            <span class="ml-shap-rank-index">${index + 1}</span>
            <div class="ml-shap-rank-copy">
              <span class="ml-shap-rank-label t-mono">${label}</span>
              <span class="ml-shap-rank-bar"><span style="width:${width.toFixed(1)}%"></span></span>
            </div>
          </div>`;
      })
      .join("");
  }

  upsertChart("auroc", "chart-auroc", {
    type: "bar",
    data: {
      labels: models.map((model) => model.name),
      datasets: [
        {
          label: "AUROC",
          data: models.map((model) => model.auroc),
          backgroundColor: models.map((_, index) => COLORS.models[index % COLORS.models.length]),
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        errorBars: { ranges: models.map((model) => model.auroc_ci) },
        tooltip: {
          callbacks: {
            label(context) {
              const model = models[context.dataIndex];
              return `AUROC ${model.auroc} [${model.auroc_ci[0]} - ${model.auroc_ci[1]}]`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 18, minRotation: 18 } },
        y: { min: 0.5, max: 1.0, grid: { color: COLORS.grid } },
      },
    },
  });

  document.querySelector("#table-subgroup tbody").innerHTML = (ml.subgroup || [])
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.subgroup)}</td><td class="t-mono">${escapeHtml(String(row.n))}</td><td class="t-mono">${Number(row.mean_auroc).toFixed(3)}</td><td class="t-mono">+/-${Number(row.sd).toFixed(3)}</td></tr>`
    )
    .join("");

  document.querySelector("#table-metrics tbody").innerHTML = models
    .slice()
    .sort((left, right) => right.auroc - left.auroc)
    .map(
      (row, index) => `
        <tr class="${index === 0 ? "best-row" : ""}">
          <td><strong>${escapeHtml(row.name)}</strong></td>
          <td class="t-mono">${Number(row.auroc).toFixed(3)}</td>
          <td class="t-mono">[${row.auroc_ci[0]}-${row.auroc_ci[1]}]</td>
          <td class="t-mono">${Number(row.sensitivity).toFixed(3)}</td>
          <td class="t-mono">${Number(row.specificity).toFixed(3)}</td>
          <td class="t-mono">${Number(row.f1).toFixed(3)}</td>
        </tr>`
    )
    .join("");

  decorateRevealTargets();
}

function renderMlExplainer(ml) {
  const root = document.getElementById("ml-explainer");
  if (!root) {
    return;
  }

  const bestModel = getBestModel(ml);
  if (!bestModel) {
    root.classList.add("hide");
    stopMlExplainerTimer();
    return;
  }

  const architecture = inferModelArchitecture(bestModel);
  const modelChanged = ML_EXPLAINER.modelName !== bestModel.name || ML_EXPLAINER.architecture !== architecture;

  root.classList.remove("hide");
  setupMlExplainerInteractions(root);

  const topFeatures = getTopShapFeatures(ml.shap || []);
  const featureDomains = summarizeFeatureDomains(topFeatures);
  const stages = buildMlExplainerStages({
    bestModel,
    featureDomains,
    topFeatures,
    confusion: ml.confusion || {},
  });
  if (modelChanged) {
    ML_EXPLAINER.index = 0;
  }
  ML_EXPLAINER.stages = stages;
  ML_EXPLAINER.index = Math.min(ML_EXPLAINER.index, Math.max(0, stages.length - 1));
  ML_EXPLAINER.architecture = architecture;
  ML_EXPLAINER.modelName = bestModel.name;
  ML_EXPLAINER.context = {
    bestModel,
    topFeatures,
    featureDomains,
    confusion: ml.confusion || {},
  };

  setText("ml-explainer-model", bestModel.name);
  setText("ml-explainer-auroc", `AUROC ${Number(bestModel.auroc).toFixed(3)}`);

  const architectureLabel = getArchitectureDisplayName(architecture).toLowerCase();
  const domainSummary = featureDomains.length
    ? humanJoin(featureDomains.slice(0, 3).map((domain) => domain.label.toLowerCase()))
    : "multimodal developmental predictors";
  setText(
    "ml-explainer-summary",
    `${bestModel.name} currently leads the model comparison. This ${architectureLabel} view shows how ${domainSummary} are aligned, transformed into model-ready features, and converted into the 12-month prediction target.`
  );

  document.getElementById("ml-domain-grid").innerHTML = featureDomains.length
    ? featureDomains
        .map(
          (domain) => `
            <article class="ml-domain-card" style="--domain-color: ${domain.accent};">
              <div class="ml-domain-count">${domain.features.length} signals represented</div>
              <strong>${escapeHtml(domain.label)}</strong>
              <div class="ml-domain-copy">${escapeHtml(domain.description)}</div>
            </article>`
        )
        .join("")
    : '<div class="ml-empty-note">Feature group summaries appear when SHAP importance values are available.</div>';

  document.getElementById("ml-feature-cloud").innerHTML = topFeatures.length
    ? topFeatures
        .map(
          (feature, index) => `
            <span class="ml-feature-pill" style="--feature-delay: ${index * 0.08}s;">
              ${escapeHtml(feature.label)}
            </span>`
        )
        .join("")
    : '<div class="ml-empty-note">No feature-attribution values were provided for this model run.</div>';

  document.getElementById("ml-stage-track").innerHTML = stages
    .map(
      (stage, index) => `
        <button class="ml-stage-node" type="button" data-ml-stage-index="${index}">
          <span class="ml-stage-index">${String(index + 1).padStart(2, "0")}</span>
          <span class="ml-stage-copy">
            <strong>${escapeHtml(stage.title)}</strong>
            <small>${escapeHtml(stage.subtitle)}</small>
          </span>
        </button>`
    )
    .join("");

  document.querySelectorAll("#ml-stage-track .ml-stage-node").forEach((node) => {
    node.addEventListener("mouseenter", stopMlExplainerTimer);
    node.addEventListener("mouseleave", startMlExplainerTimer);
  });

  renderMlOutputMetrics(bestModel, ml.confusion || {});
  document.getElementById("ml-score-fill").style.width = `${Math.max(16, Number(bestModel.auroc) * 100)}%`;
  const scoreTrack = document.querySelector(".ml-score-track");
  if (scoreTrack) {
    scoreTrack.style.setProperty("--ml-score-pct", `${Math.max(16, Number(bestModel.auroc) * 100)}%`);
  }

  setMlExplainerStage(ML_EXPLAINER.index);
  startMlExplainerTimer();
}

function renderMlOutputMetrics(bestModel, confusion) {
  const metrics = [
    { label: "Sensitivity", value: formatMetric(bestModel.sensitivity) },
    { label: "Specificity", value: formatMetric(bestModel.specificity) },
    {
      label: "95% CI",
      value: Array.isArray(bestModel.auroc_ci)
        ? `[${bestModel.auroc_ci[0]}-${bestModel.auroc_ci[1]}]`
        : "—",
    },
  ];
  const confusionLabels = {
    tp: "True Positive",
    fp: "False Positive",
    tn: "True Negative",
    fn: "False Negative",
  };

  const confusionGrid = ["tp", "fp", "tn", "fn"]
    .filter((key) => Number.isFinite(Number(confusion[key])))
    .map((key) => {
      const tone = key === "tp" || key === "tn" ? "ok" : "danger";
      return `
        <div class="confusion-cell ${tone}">
          <strong class="t-mono">${escapeHtml(String(confusion[key]))}</strong>
          <span class="t-label">${escapeHtml(confusionLabels[key])}</span>
        </div>`;
    })
    .join("");

  document.getElementById("ml-output-metrics").innerHTML = `
    <div class="metrics-grid">
      ${metrics
        .map(
          (metric) => `
            <div class="ml-output-metric">
              <span class="t-label">${escapeHtml(metric.label)}</span>
              <strong class="t-mono">${escapeHtml(metric.value)}</strong>
            </div>`
        )
        .join("")}
    </div>
    ${confusionGrid ? `<div class="confusion-grid">${confusionGrid}</div>` : ""}
    <div class="f1-chip"><span class="t-label">F1</span><strong class="t-mono">${escapeHtml(formatMetric(bestModel.f1))}</strong></div>`;
}

function setupMlExplainerInteractions(root) {
  if (root.dataset.bound === "true") {
    return;
  }

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ml-stage-index]");
    if (!button) {
      return;
    }
    const index = Number(button.dataset.mlStageIndex);
    if (!Number.isFinite(index)) {
      return;
    }
    setMlExplainerStage(index);
    startMlExplainerTimer();
  });

  root.addEventListener("mouseenter", () => {
    stopMlExplainerTimer();
  });

  root.addEventListener("mouseleave", () => {
    startMlExplainerTimer();
  });

  root.dataset.bound = "true";
}

function startMlExplainerTimer() {
  stopMlExplainerTimer();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || ML_EXPLAINER.stages.length < 2) {
    return;
  }

  ML_EXPLAINER.timer = window.setInterval(() => {
    setMlExplainerStage((ML_EXPLAINER.index + 1) % ML_EXPLAINER.stages.length);
  }, ML_STAGE_ROTATE_MS);
}

function stopMlExplainerTimer() {
  if (ML_EXPLAINER.timer) {
    window.clearInterval(ML_EXPLAINER.timer);
    ML_EXPLAINER.timer = null;
  }
}

function setMlExplainerStage(index) {
  const root = document.getElementById("ml-explainer");
  if (!root || !ML_EXPLAINER.stages.length) {
    return;
  }

  const safeIndex = Math.max(0, Math.min(index, ML_EXPLAINER.stages.length - 1));
  const stage = ML_EXPLAINER.stages[safeIndex];
  ML_EXPLAINER.index = safeIndex;
  const detail = document.getElementById("ml-stage-detail");
  const nextNode = document.querySelector(`#ml-stage-track .ml-stage-node[data-ml-stage-index="${safeIndex}"]`);

  root.style.setProperty(
    "--ml-progress",
    `${Math.max(10, ((safeIndex + 1) / ML_EXPLAINER.stages.length) * 100)}%`
  );

  if (detail) {
    detail.classList.add("is-transitioning");
  }
  if (nextNode) {
    nextNode.classList.add("is-entering");
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      document.querySelectorAll("#ml-stage-track .ml-stage-node").forEach((node, nodeIndex) => {
        node.classList.toggle("is-active", nodeIndex === safeIndex);
        node.classList.toggle("is-complete", nodeIndex < safeIndex);
      });

      setText("ml-stage-kicker", `Stage ${safeIndex + 1} of ${ML_EXPLAINER.stages.length}`);
      setText("ml-stage-title", stage.title);
      setText("ml-stage-body", stage.body);
      document.getElementById("ml-stage-evidence").innerHTML = (stage.evidence || [])
        .map((item) => `<span class="chip feature-chip">${escapeHtml(item)}</span>`)
        .join("");

      renderMlSignalRail(ML_EXPLAINER.architecture, safeIndex, ML_EXPLAINER.stages.length);
      renderMlArchitectureDiagram({
        architecture: ML_EXPLAINER.architecture,
        stageIndex: safeIndex,
        bestModel: ML_EXPLAINER.context && ML_EXPLAINER.context.bestModel,
        topFeatures: ML_EXPLAINER.context && ML_EXPLAINER.context.topFeatures,
        featureDomains: ML_EXPLAINER.context && ML_EXPLAINER.context.featureDomains,
      });
      renderMlMethods(stage, ML_EXPLAINER.architecture, ML_EXPLAINER.context && ML_EXPLAINER.context.bestModel);

      if (detail) {
        detail.classList.remove("is-transitioning");
      }
      if (nextNode) {
        nextNode.classList.remove("is-entering");
      }
      decorateRevealTargets();
    });
  });
}

function getBestModel(ml) {
  const models = (ml && ml.models) || [];
  if (!models.length) {
    return null;
  }

  const preferred = String(ml && ml.confusion && ml.confusion.best_model ? ml.confusion.best_model : "").toLowerCase();
  if (preferred) {
    const named = models.find((model) => String(model.name || "").toLowerCase() === preferred);
    if (named) {
      return named;
    }
  }

  return models
    .slice()
    .sort((left, right) => Number(right.auroc || 0) - Number(left.auroc || 0))[0];
}

function getTopShapFeatures(shapRows) {
  return (shapRows || [])
    .slice()
    .sort((left, right) => Number(right.importance || 0) - Number(left.importance || 0))
    .slice(0, 6)
    .map((feature) => ({
      feature: feature.feature || feature.label || "Feature",
      label: feature.label || humanizeFeatureKey(feature.feature || "Feature"),
      importance: Number(feature.importance || 0),
    }));
}

function summarizeFeatureDomains(features) {
  const groups = new Map();

  features.forEach((feature) => {
    const haystack = `${feature.feature} ${feature.label}`;
    const match = FEATURE_DOMAIN_RULES.find((rule) => rule.pattern.test(haystack)) || {
      key: "combined",
      label: "Combined predictors",
      accent: COLORS.accentSoft,
      description: "Mixed predictors spanning multiple developmental domains.",
    };

    if (!groups.has(match.key)) {
      groups.set(match.key, { ...match, features: [], importance: 0 });
    }

    const entry = groups.get(match.key);
    entry.features.push(feature);
    entry.importance += feature.importance;
  });

  return Array.from(groups.values())
    .sort((left, right) => right.importance - left.importance || right.features.length - left.features.length)
    .slice(0, 4);
}

function buildMlExplainerStages({ bestModel, featureDomains, topFeatures, confusion }) {
  const modelKind = inferModelArchitecture(bestModel);
  const topFeatureText = topFeatures.length
    ? humanJoin(topFeatures.slice(0, 3).map((feature) => feature.label))
    : "quality-controlled biomarkers and developmental covariates";
  const domainText = featureDomains.length
    ? humanJoin(featureDomains.slice(0, 3).map((domain) => domain.label))
    : "multimodal study predictors";
  const ciText = Array.isArray(bestModel.auroc_ci)
    ? `${bestModel.auroc_ci[0]}-${bestModel.auroc_ci[1]}`
    : "not reported";
  const confusionEvidence = ["tp", "fp", "tn", "fn"]
    .filter((key) => Number.isFinite(Number(confusion[key])))
    .map((key) => `${key.toUpperCase()} ${confusion[key]}`);

  const sharedStart = [
    {
      title: "Inputs aligned by developmental visit",
      subtitle: "Physiology, clinical context, and assessments share a common timeline.",
      body: `Signals from ${domainText.toLowerCase()} are aligned to the same study visits before the model sees them. This keeps developmental timing consistent across participants and prevents the learner from comparing mismatched windows.`,
      evidence: [
        "Visits: NICU, 1, 2, 3, 6, 9, 12, 24, 36 months",
        `Best model: ${bestModel.name}`,
        featureDomains.length ? `${featureDomains[0].label} is the strongest evidence stream` : "Multimodal fusion",
      ],
      methods: ["payload", "protocol", "flow"],
      methodNote: "This alignment step maps to the payload assembly and protocol documentation that determine how visit-level signals are prepared before training.",
    },
    {
      title: "Feature extraction and normalization",
      subtitle: "Raw study signals are converted into stable predictors.",
      body: `The pipeline transforms raw recordings and forms into model-ready variables such as ${topFeatureText}. Standardization and quality control keep large-magnitude variables from overwhelming subtler developmental signals.`,
      evidence: topFeatures.length
        ? topFeatures.slice(0, 4).map((feature) => feature.label)
        : ["Feature engineering pending SHAP output"],
      methods: ["payload", "config", "guide"],
      methodNote: "These transformed features correspond to the variables assembled in the dashboard payload and the configuration choices that govern model training.",
    },
  ];

  const sharedEnd = [
    {
      title: "Prediction head and calibration",
      subtitle: "The fused representation becomes an estimated 12-month risk score.",
      body: `The final layer converts the learned representation into an estimated probability of a positive ADOS-2 screen at 12 months. Model performance is summarized with AUROC ${Number(bestModel.auroc).toFixed(3)} and bootstrap CI ${ciText} so the explanation stays anchored to measured generalization.`,
      evidence: confusionEvidence.length
        ? confusionEvidence.concat([`95% CI ${ciText}`])
        : [`AUROC ${Number(bestModel.auroc).toFixed(3)}`, `95% CI ${ciText}`, "Cross-validated evaluation"],
      methods: ["evaluation", "guide", "flow"],
      methodNote: "This final stage ties the explainer back to the evaluation code and the plain-language dashboard interpretation used in lab presentations.",
    },
  ];

  if (modelKind === "cnn_lstm") {
    return sharedStart.concat([
      {
        title: "1D convolutions learn local motifs",
        subtitle: "Short kernels scan for compact patterns in the feature sequence.",
        body: "Convolutional filters move across the ordered feature sequence and capture short-range motifs, such as abrupt autonomic shifts or neighboring-visit changes that are too local for a hand-built summary to express well.",
        evidence: [
          "Local receptive fields",
          featureDomains.length ? `${featureDomains[0].label} dominates early filters` : "Multichannel features",
          "Shared weights across the sequence",
        ],
        methods: ["deep", "config", "protocol"],
        methodNote: "This stage corresponds to the convolutional front end in the deep-learning implementation and the physiology protocol that motivates short-range pattern extraction.",
      },
      {
        title: "LSTM integrates longitudinal context",
        subtitle: "Memory cells retain what earlier visits mean for later ones.",
        body: "The LSTM updates an internal state as visits unfold, allowing early NICU physiology to influence how later developmental signals are interpreted. This is the stage that turns isolated measurements into a developmental trajectory.",
        evidence: [
          "Temporal ordering preserved",
          "Longitudinal dependencies retained",
          "Sequence-to-risk mapping",
        ],
        methods: ["deep", "evaluation", "flow"],
        methodNote: "The recurrent memory stage lives in the same deep-learning codepath, and its output is what the evaluation scripts summarize as longitudinal predictive performance.",
      },
    ]).concat(sharedEnd);
  }

  if (modelKind === "transformer") {
    return sharedStart.concat([
      {
        title: "Feature tokens are embedded",
        subtitle: "Each predictor becomes a comparable token in latent space.",
        body: "The model maps each visit-level feature bundle into an embedding so physiology, assessment, and clinical context can be compared on a common latent scale before attention is applied.",
        evidence: ["Shared embedding space", "Visit-aware encoding", "Multimodal tokens"],
        methods: ["transformer", "config", "payload"],
        methodNote: "This embedding stage maps directly to the Transformer implementation, where visit-level inputs become tokens before self-attention is applied.",
      },
      {
        title: "Self-attention weights informative interactions",
        subtitle: "The model learns which features should attend to one another.",
        body: "Attention scores tell the network which measurements matter together. This lets the model connect, for example, autonomic regulation with later social-attention measures without forcing a fixed neighborhood structure.",
        evidence: [
          "Adaptive weighting",
          featureDomains.length ? `${featureDomains[0].label} often anchors high-attention paths` : "Cross-feature interaction",
          "Global context across visits",
        ],
        methods: ["transformer", "evaluation", "flow"],
        methodNote: "This attention block corresponds to the encoder logic in the Transformer script and the downstream evaluation code that checks whether those learned interactions generalize.",
      },
    ]).concat(sharedEnd);
  }

  if (modelKind === "tree") {
    return sharedStart.concat([
      {
        title: "Recursive decision splits partition the cohort",
        subtitle: "The model asks a sequence of feature-threshold questions.",
        body: "Tree-based learners repeatedly split the sample on informative predictors, isolating regions of the feature space with different outcome prevalence. This is where nonlinear combinations of developmental variables become useful.",
        evidence: [
          topFeatures.length ? `First split candidates: ${topFeatures.slice(0, 2).map((feature) => feature.label).join(" / ")}` : "Threshold-based branching",
          "Nonlinear partitioning",
          "Interaction effects captured",
        ],
        methods: ["baseline", "config", "payload"],
        methodNote: "These split rules correspond to the tabular ML pipeline, where the feature matrix is queried repeatedly to isolate informative developmental subgroups.",
      },
      {
        title: "Ensemble aggregation stabilizes the decision surface",
        subtitle: "Many trees vote so one unstable split does not dominate.",
        body: "Random forest and boosting variants average across many trees or staged learners. The ensemble reduces sensitivity to any one noisy split and improves generalization relative to a single hand-built rule set.",
        evidence: ["Ensemble voting", "Variance reduction", "Fold-stable feature ranking"],
        methods: ["baseline", "evaluation", "flow"],
        methodNote: "This stage maps to the ensemble training and evaluation code used to compare forest- and boosting-based models against the rest of the candidate set.",
      },
    ]).concat(sharedEnd);
  }

  return sharedStart.concat([
    {
      title: "The decision function learns weighted feature combinations",
      subtitle: "Scaled predictors are combined into a discriminative boundary.",
      body: "For linear, kernel, or regularized models, the feature vector is transformed into a decision function that separates likely positive and negative screens. Regularization prevents unstable coefficients from overfitting small developmental samples.",
      evidence: ["Feature scaling", "Regularization", "Decision boundary learned"],
      methods: ["baseline", "config", "payload"],
      methodNote: "This stage corresponds to the tabular baseline pipeline and the configuration that keeps the decision function stable for small longitudinal cohorts.",
    },
    {
      title: "Interpretation checks which predictors move the score",
      subtitle: "Post-hoc importance keeps the model academically interpretable.",
      body: "Once the model is fit, attribution summaries identify which predictors consistently push risk upward or downward. That link between architecture and interpretability is what makes the dashboard suitable for lab meetings and teaching.",
      evidence: topFeatures.length
        ? topFeatures.slice(0, 3).map((feature) => feature.label)
        : ["Attribution summaries", "Coefficient or SHAP review", "Model audit"],
      methods: ["evaluation", "guide", "flow"],
      methodNote: "This interpretation step ties the trained model back to the evaluation and teaching materials that explain why specific predictors matter.",
    },
  ]).concat(sharedEnd);
}

function getArchitectureDisplayName(kind) {
  if (kind === "cnn_lstm") {
    return "CNN-LSTM sequence model";
  }
  if (kind === "transformer") {
    return "Transformer attention model";
  }
  if (kind === "tree") {
    return "tree ensemble";
  }
  return "tabular decision model";
}

function renderMlSignalRail(architecture, activeIndex, stageCount) {
  const svg = document.getElementById("ml-signal-svg");
  if (!svg) {
    return;
  }
  svg.innerHTML = buildMlSignalRailSvg({
    architecture,
    activeIndex,
    stageCount,
    reducedMotion: prefersReducedMotion(),
  });
}

function buildMlSignalRailSvg({ architecture, activeIndex, stageCount, reducedMotion }) {
  const positions = [52, 180, 310, 440, 568];
  const labels = architecture === "transformer"
    ? ["Inputs", "Tokens", "Attention", "Encoder", "Risk"]
    : architecture === "tree"
      ? ["Inputs", "Features", "Split", "Forest", "Vote"]
      : architecture === "cnn_lstm"
        ? ["Inputs", "Features", "Conv", "LSTM", "Risk"]
        : ["Inputs", "Scale", "Model", "Audit", "Risk"];

  const basePath = architecture === "transformer"
    ? "M52 24 C108 6 138 6 180 24 S264 42 310 24 S394 6 440 24 S520 40 568 24"
    : "M52 24 C104 24 132 24 180 24 S264 24 310 24 S394 24 440 24 S520 24 568 24";
  const transformerBranchA = "M180 24 C228 48 264 48 310 24 C354 0 396 0 440 24";
  const transformerBranchB = "M180 24 C228 0 264 0 310 24 C354 48 396 48 440 24";
  const treeBranchTop = "M310 24 C360 24 392 10 440 10 C492 10 520 24 568 24";
  const treeBranchBottom = "M310 24 C360 24 392 38 440 38 C492 38 520 24 568 24";

  const packets = reducedMotion
    ? `
        <circle class="ml-signal-packet-primary" cx="${positions[Math.min(activeIndex, positions.length - 1)]}" cy="24" r="6"></circle>
        <circle class="ml-signal-packet-secondary" cx="${positions[Math.max(1, Math.min(activeIndex + 1, positions.length - 1))]}" cy="24" r="4"></circle>
        <circle class="ml-signal-packet-accent" cx="${positions[Math.max(0, activeIndex - 1)]}" cy="24" r="3"></circle>`
    : architecture === "tree"
      ? `
          <circle class="ml-signal-packet-primary" r="6"><animateMotion dur="4.8s" repeatCount="indefinite" path="M52 24 C104 24 132 24 180 24 S264 24 310 24"></animateMotion></circle>
          <circle class="ml-signal-packet-secondary" r="5"><animateMotion dur="4.2s" begin="0.35s" repeatCount="indefinite" path="${treeBranchTop}"></animateMotion></circle>
          <circle class="ml-signal-packet-accent" r="4"><animateMotion dur="4.4s" begin="0.7s" repeatCount="indefinite" path="${treeBranchBottom}"></animateMotion></circle>`
      : architecture === "transformer"
        ? `
            <circle class="ml-signal-packet-primary" r="6"><animateMotion dur="4.8s" repeatCount="indefinite" path="${basePath}"></animateMotion></circle>
            <circle class="ml-signal-packet-secondary" r="5"><animateMotion dur="4.1s" begin="0.3s" repeatCount="indefinite" path="${transformerBranchA}"></animateMotion></circle>
            <circle class="ml-signal-packet-accent" r="4"><animateMotion dur="4.4s" begin="0.7s" repeatCount="indefinite" path="${transformerBranchB}"></animateMotion></circle>`
        : `
            <circle class="ml-signal-packet-primary" r="6"><animateMotion dur="4.6s" repeatCount="indefinite" path="${basePath}"></animateMotion></circle>
            <circle class="ml-signal-packet-secondary" r="5"><animateMotion dur="4.0s" begin="0.35s" repeatCount="indefinite" path="${basePath}"></animateMotion></circle>
            <circle class="ml-signal-packet-accent" r="4"><animateMotion dur="4.3s" begin="0.8s" repeatCount="indefinite" path="${basePath}"></animateMotion></circle>`;

  return `
    ${architecture === "transformer" ? `<path class="ml-signal-branch" d="${transformerBranchA}"></path><path class="ml-signal-branch" d="${transformerBranchB}"></path>` : ""}
    ${architecture === "tree" ? `<path class="ml-signal-branch" d="${treeBranchTop}"></path><path class="ml-signal-branch" d="${treeBranchBottom}"></path>` : ""}
    <path class="ml-signal-track" d="${basePath}"></path>
    ${positions.slice(0, stageCount).map((position, index) => `
      <g>
        <circle class="ml-signal-stop ${index < activeIndex ? "is-complete" : ""} ${index === activeIndex ? "is-active" : ""}" cx="${position}" cy="24" r="${index === activeIndex ? 12 : 10}"></circle>
        <text class="ml-signal-caption" x="${position}" y="68" text-anchor="middle">${escapeHtml(labels[index] || `Stage ${index + 1}`)}</text>
      </g>`).join("")}
    ${packets}`;
}

function renderMlArchitectureDiagram({ architecture, stageIndex, bestModel, topFeatures, featureDomains }) {
  const container = document.getElementById("ml-model-diagram");
  if (!container || !bestModel) {
    return;
  }

  const caption = architecture === "transformer"
    ? `${bestModel.name} converts visit-level predictors into tokens, reweights them with self-attention, and then reads out a risk estimate.`
    : architecture === "tree"
      ? `${bestModel.name} repeatedly splits the feature space across many trees, then aggregates those votes into a more stable prediction.`
      : architecture === "cnn_lstm"
        ? `${bestModel.name} combines short-range convolutional motif detectors with recurrent memory across visits.`
        : `${bestModel.name} learns a stable decision function over scaled feature vectors and then audits which predictors drive the score.`;
  setText("ml-architecture-caption", caption);

  container.innerHTML = buildMlArchitectureDiagram({
    architecture,
    stageIndex,
    topFeatures,
    featureDomains,
  });
}

function buildMlArchitectureDiagram({ architecture, stageIndex, topFeatures, featureDomains }) {
  if (architecture === "transformer") {
    return buildTransformerDiagram({ stageIndex, topFeatures, featureDomains });
  }
  if (architecture === "tree") {
    return buildTreeDiagram({ stageIndex, topFeatures, featureDomains });
  }
  if (architecture === "cnn_lstm") {
    return buildCnnLstmDiagram({ stageIndex, topFeatures, featureDomains });
  }
  return buildTabularDiagram({ stageIndex, topFeatures, featureDomains });
}

function buildCnnLstmDiagram({ stageIndex, topFeatures, featureDomains }) {
  const inputs = [
    shortText(topFeatures[0] && topFeatures[0].label, 20) || "ECG + HRV",
    shortText(topFeatures[1] && topFeatures[1].label, 20) || "Behavioral coding",
    shortText(topFeatures[2] && topFeatures[2].label, 20) || "NICU context",
  ];
  const domainLabel = shortText(featureDomains[0] && featureDomains[0].label, 20) || "Feature bundle";
  return `
    <svg viewBox="0 0 640 220" role="img" aria-label="CNN-LSTM model schematic">
      <path class="ml-svg-line" d="M154 56 C178 56 190 80 208 98"></path>
      <path class="ml-svg-line" d="M154 102 L208 110"></path>
      <path class="ml-svg-line" d="M154 148 C178 148 190 126 208 118"></path>
      <path class="ml-svg-line" d="M304 110 L336 110"></path>
      <path class="ml-svg-line" d="M452 110 L492 110"></path>

      <rect x="22" y="38" width="132" height="36" rx="16" class="ml-svg-block blue${stageIndex === 0 ? " is-active" : ""}"></rect>
      <rect x="22" y="84" width="132" height="36" rx="16" class="ml-svg-block green${stageIndex === 0 ? " is-active" : ""}"></rect>
      <rect x="22" y="130" width="132" height="36" rx="16" class="ml-svg-block red${stageIndex === 0 ? " is-active" : ""}"></rect>
      <text x="88" y="60" text-anchor="middle" class="ml-svg-label">${escapeHtml(inputs[0])}</text>
      <text x="88" y="106" text-anchor="middle" class="ml-svg-label">${escapeHtml(inputs[1])}</text>
      <text x="88" y="152" text-anchor="middle" class="ml-svg-label">${escapeHtml(inputs[2])}</text>

      <rect x="208" y="72" width="96" height="76" rx="22" class="ml-svg-block gold${stageIndex === 1 ? " is-active" : ""}"></rect>
      <text x="256" y="102" text-anchor="middle" class="ml-svg-label">Feature</text>
      <text x="256" y="120" text-anchor="middle" class="ml-svg-meta">${escapeHtml(domainLabel)}</text>

      <rect x="336" y="54" width="116" height="112" rx="24" class="ml-svg-block blue${stageIndex === 2 ? " is-active" : ""}"></rect>
      <text x="394" y="92" text-anchor="middle" class="ml-svg-label">1D convolutions</text>
      <text x="394" y="112" text-anchor="middle" class="ml-svg-meta">kernel scan</text>
      <rect x="352" y="126" width="22" height="14" rx="7" class="ml-svg-chip"></rect>
      <rect x="382" y="126" width="28" height="14" rx="7" class="ml-svg-chip"></rect>
      <rect x="418" y="126" width="18" height="14" rx="7" class="ml-svg-chip"></rect>

      <rect x="492" y="54" width="96" height="112" rx="24" class="ml-svg-block purple${stageIndex === 3 ? " is-active" : ""}"></rect>
      <path class="ml-svg-loop" d="M516 142 C502 96 520 70 560 70 C594 70 604 122 572 144"></path>
      <text x="540" y="96" text-anchor="middle" class="ml-svg-label">LSTM memory</text>
      <text x="540" y="116" text-anchor="middle" class="ml-svg-meta">visit sequence state</text>

      <rect x="556" y="176" width="64" height="28" rx="14" class="ml-svg-block red${stageIndex === 4 ? " is-active" : ""}"></rect>
      <text x="588" y="194" text-anchor="middle" class="ml-svg-label">Risk</text>
      <path class="ml-svg-line soft" d="M572 166 L588 176"></path>
    </svg>`;
}

function buildTransformerDiagram({ stageIndex, topFeatures, featureDomains }) {
  const tokenA = shortText(topFeatures[0] && topFeatures[0].label, 18) || "RSA token";
  const tokenB = shortText(topFeatures[1] && topFeatures[1].label, 18) || "Behavior token";
  const tokenC = shortText(featureDomains[0] && featureDomains[0].label, 18) || "Clinical token";
  return `
    <svg viewBox="0 0 640 220" role="img" aria-label="Transformer model schematic">
      <path class="ml-svg-line" d="M132 60 L184 96"></path>
      <path class="ml-svg-line" d="M132 102 L184 110"></path>
      <path class="ml-svg-line" d="M132 144 L184 124"></path>
      <path class="ml-svg-line" d="M272 110 L320 110"></path>
      <path class="ml-svg-line" d="M460 82 L500 82"></path>
      <path class="ml-svg-line" d="M460 136 L500 136"></path>

      <rect x="24" y="42" width="108" height="32" rx="14" class="ml-svg-block blue${stageIndex === 0 ? " is-active" : ""}"></rect>
      <rect x="24" y="86" width="108" height="32" rx="14" class="ml-svg-block green${stageIndex === 0 ? " is-active" : ""}"></rect>
      <rect x="24" y="130" width="108" height="32" rx="14" class="ml-svg-block red${stageIndex === 0 ? " is-active" : ""}"></rect>
      <text x="78" y="62" text-anchor="middle" class="ml-svg-label">${escapeHtml(tokenA)}</text>
      <text x="78" y="106" text-anchor="middle" class="ml-svg-label">${escapeHtml(tokenB)}</text>
      <text x="78" y="150" text-anchor="middle" class="ml-svg-label">${escapeHtml(tokenC)}</text>

      <rect x="184" y="60" width="88" height="100" rx="22" class="ml-svg-block gold${stageIndex === 1 ? " is-active" : ""}"></rect>
      <text x="228" y="96" text-anchor="middle" class="ml-svg-label">Embedding</text>
      <text x="228" y="116" text-anchor="middle" class="ml-svg-meta">visit-aware tokens</text>

      <rect x="320" y="38" width="140" height="144" rx="26" class="ml-svg-block purple${stageIndex === 2 ? " is-active" : ""}"></rect>
      <text x="390" y="70" text-anchor="middle" class="ml-svg-label">Self-attention</text>
      <text x="390" y="90" text-anchor="middle" class="ml-svg-meta">multi-head weighting</text>
      <path class="ml-svg-line soft" d="M346 120 L434 72"></path>
      <path class="ml-svg-line soft" d="M346 82 L434 146"></path>
      <path class="ml-svg-line soft" d="M350 148 L430 112"></path>
      <circle cx="354" cy="120" r="5" class="ml-svg-chip"></circle>
      <circle cx="390" cy="98" r="5" class="ml-svg-chip"></circle>
      <circle cx="426" cy="136" r="5" class="ml-svg-chip"></circle>

      <rect x="500" y="54" width="108" height="48" rx="18" class="ml-svg-block blue${stageIndex === 3 ? " is-active" : ""}"></rect>
      <rect x="500" y="118" width="108" height="48" rx="18" class="ml-svg-block blue${stageIndex === 3 ? " is-active" : ""}"></rect>
      <text x="554" y="82" text-anchor="middle" class="ml-svg-label">Encoder stack</text>
      <text x="554" y="146" text-anchor="middle" class="ml-svg-label">Context head</text>

      <rect x="528" y="178" width="72" height="26" rx="13" class="ml-svg-block red${stageIndex === 4 ? " is-active" : ""}"></rect>
      <text x="564" y="195" text-anchor="middle" class="ml-svg-label">Risk</text>
    </svg>`;
}

function buildTreeDiagram({ stageIndex, topFeatures, featureDomains }) {
  const splitLabel = shortText(topFeatures[0] && topFeatures[0].label, 18) || "Primary split";
  const featureLabel = shortText(featureDomains[0] && featureDomains[0].label, 18) || "Feature bag";
  return `
    <svg viewBox="0 0 640 220" role="img" aria-label="Tree ensemble schematic">
      <path class="ml-svg-line" d="M140 110 L186 110"></path>
      <path class="ml-svg-line" d="M286 110 L322 110"></path>
      <path class="ml-svg-line" d="M358 64 L428 90"></path>
      <path class="ml-svg-line" d="M358 110 L428 110"></path>
      <path class="ml-svg-line" d="M358 156 L428 130"></path>
      <path class="ml-svg-line" d="M504 110 L548 110"></path>

      <rect x="22" y="82" width="118" height="56" rx="20" class="ml-svg-block blue${stageIndex === 0 ? " is-active" : ""}"></rect>
      <text x="81" y="104" text-anchor="middle" class="ml-svg-label">Input matrix</text>
      <text x="81" y="124" text-anchor="middle" class="ml-svg-meta">visit-level predictors</text>

      <rect x="186" y="82" width="100" height="56" rx="20" class="ml-svg-block gold${stageIndex === 1 ? " is-active" : ""}"></rect>
      <text x="236" y="104" text-anchor="middle" class="ml-svg-label">${escapeHtml(featureLabel)}</text>
      <text x="236" y="124" text-anchor="middle" class="ml-svg-meta">candidate splits</text>

      <rect x="322" y="84" width="82" height="52" rx="18" class="ml-svg-block red${stageIndex === 2 ? " is-active" : ""}"></rect>
      <text x="363" y="104" text-anchor="middle" class="ml-svg-label">Split rule</text>
      <text x="363" y="122" text-anchor="middle" class="ml-svg-meta">${escapeHtml(splitLabel)}</text>

      <g>
        <circle cx="444" cy="74" r="14" class="ml-svg-block green${stageIndex === 3 ? " is-active" : ""}"></circle>
        <circle cx="444" cy="110" r="14" class="ml-svg-block green${stageIndex === 3 ? " is-active" : ""}"></circle>
        <circle cx="444" cy="146" r="14" class="ml-svg-block green${stageIndex === 3 ? " is-active" : ""}"></circle>
        <path class="ml-svg-line soft" d="M444 74 L470 56 L494 70"></path>
        <path class="ml-svg-line soft" d="M444 74 L470 88 L494 102"></path>
        <path class="ml-svg-line soft" d="M444 110 L470 98 L494 86"></path>
        <path class="ml-svg-line soft" d="M444 110 L470 122 L494 136"></path>
        <path class="ml-svg-line soft" d="M444 146 L470 134 L494 118"></path>
        <path class="ml-svg-line soft" d="M444 146 L470 158 L494 172"></path>
      </g>

      <rect x="496" y="82" width="92" height="56" rx="20" class="ml-svg-block purple${stageIndex === 4 ? " is-active" : ""}"></rect>
      <text x="542" y="104" text-anchor="middle" class="ml-svg-label">Vote / risk</text>
      <text x="542" y="124" text-anchor="middle" class="ml-svg-meta">ensemble average</text>
    </svg>`;
}

function buildTabularDiagram({ stageIndex, topFeatures, featureDomains }) {
  const keyFeature = shortText(topFeatures[0] && topFeatures[0].label, 18) || "Top predictor";
  const domainLabel = shortText(featureDomains[0] && featureDomains[0].label, 18) || "Feature set";
  return `
    <svg viewBox="0 0 640 220" role="img" aria-label="Tabular model schematic">
      <path class="ml-svg-line" d="M138 110 L186 110"></path>
      <path class="ml-svg-line" d="M286 110 L332 110"></path>
      <path class="ml-svg-line" d="M456 110 L506 110"></path>

      <rect x="24" y="82" width="114" height="56" rx="20" class="ml-svg-block blue${stageIndex === 0 ? " is-active" : ""}"></rect>
      <text x="81" y="104" text-anchor="middle" class="ml-svg-label">Input matrix</text>
      <text x="81" y="124" text-anchor="middle" class="ml-svg-meta">${escapeHtml(domainLabel)}</text>

      <rect x="186" y="82" width="100" height="56" rx="20" class="ml-svg-block gold${stageIndex === 1 ? " is-active" : ""}"></rect>
      <text x="236" y="104" text-anchor="middle" class="ml-svg-label">Scaler</text>
      <text x="236" y="124" text-anchor="middle" class="ml-svg-meta">standardized features</text>

      <rect x="332" y="62" width="124" height="96" rx="24" class="ml-svg-block purple${stageIndex === 2 ? " is-active" : ""}"></rect>
      <text x="394" y="96" text-anchor="middle" class="ml-svg-label">Decision function</text>
      <text x="394" y="116" text-anchor="middle" class="ml-svg-meta">weighted boundary</text>

      <rect x="506" y="68" width="92" height="42" rx="18" class="ml-svg-block green${stageIndex === 3 ? " is-active" : ""}"></rect>
      <rect x="506" y="120" width="92" height="42" rx="18" class="ml-svg-block green${stageIndex === 3 ? " is-active" : ""}"></rect>
      <text x="552" y="92" text-anchor="middle" class="ml-svg-label">Audit</text>
      <text x="552" y="144" text-anchor="middle" class="ml-svg-meta">${escapeHtml(keyFeature)}</text>

      <rect x="532" y="178" width="56" height="24" rx="12" class="ml-svg-block red${stageIndex === 4 ? " is-active" : ""}"></rect>
      <text x="560" y="194" text-anchor="middle" class="ml-svg-label">Risk</text>
    </svg>`;
}

function renderMlMethods(stage, architecture, bestModel) {
  const refs = getMethodDefinitions((stage && stage.methods) || getDefaultMethodKeys(architecture));
  setText(
    "ml-methods-summary",
    stage && stage.methodNote
      ? stage.methodNote
      : `${bestModel ? bestModel.name : "This model"} maps to the scripts and methods references below.`
  );
  document.getElementById("ml-methods-links").innerHTML = refs
    .map(
      (ref) => `
        <a class="ml-method-link" href="${ref.href}" target="_blank" rel="noreferrer">
          <span>${escapeHtml(ref.label)}</span>
          <em>${escapeHtml(ref.note)}</em>
        </a>`
    )
    .join("");
}

function getMethodDefinitions(keys) {
  return Array.from(new Set(keys || []))
    .map((key) => ML_METHOD_LIBRARY[key])
    .filter(Boolean);
}

function getDefaultMethodKeys(architecture) {
  if (architecture === "cnn_lstm") {
    return ["deep", "payload", "evaluation", "protocol", "flow"];
  }
  if (architecture === "transformer") {
    return ["transformer", "payload", "evaluation", "config", "flow"];
  }
  if (architecture === "tree") {
    return ["baseline", "payload", "evaluation", "config", "flow"];
  }
  return ["baseline", "payload", "evaluation", "guide", "flow"];
}

function shortText(value, maxLength = 22) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function inferModelArchitecture(model) {
  const descriptor = `${model && model.slug ? model.slug : ""} ${model && model.name ? model.name : ""}`.toLowerCase();
  if (/(cnn|lstm|gru|rnn)/.test(descriptor)) {
    return "cnn_lstm";
  }
  if (/(transformer|attention)/.test(descriptor)) {
    return "transformer";
  }
  if (/(forest|boost|xgb|tree)/.test(descriptor)) {
    return "tree";
  }
  return "tabular";
}

function humanizeFeatureKey(value) {
  return String(value || "Feature")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function humanJoin(items) {
  const values = Array.from(new Set((items || []).filter(Boolean)));
  if (!values.length) {
    return "";
  }
  if (values.length === 1) {
    return values[0];
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function formatMetric(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(3) : "—";
}

function renderTrajectoryChart() {
  const trajectories = STATE.dashboard.trajectories;
  if (!trajectories) {
    return;
  }

  const biomarker = document.getElementById("filter-biomarker").value;
  const showConfidenceBands = document.getElementById("filter-ci").value === "1";
  const datasets = [];

  Object.entries(trajectories.by_group || {}).forEach(([groupKey, groupData]) => {
    if (showConfidenceBands && groupData.ci && groupData.ci[biomarker]) {
      datasets.push({
        label: `${groupKey} CI low`,
        data: groupData.ci[biomarker].low,
        borderColor: `${groupData.color}33`,
        backgroundColor: `${groupData.color}16`,
        pointRadius: 0,
        borderWidth: 0,
        fill: false,
        tension: 0.25,
      });
      datasets.push({
        label: `${groupKey} CI high`,
        data: groupData.ci[biomarker].high,
        borderColor: `${groupData.color}33`,
        backgroundColor: `${groupData.color}18`,
        pointRadius: 0,
        borderWidth: 0,
        fill: "-1",
        tension: 0.25,
      });
    }

    datasets.push({
      label: `${groupKey} mean`,
      data: groupData.mean[biomarker],
      borderColor: groupData.color,
      backgroundColor: `${groupData.color}33`,
      pointRadius: 2,
      pointHoverRadius: 5,
      borderWidth: 2.4,
      tension: 0.26,
      fill: false,
    });
  });

  const units = { RSA: "ln(ms^2)", RMSSD: "ms", SDNN: "ms", HDA_SA: "ms latency" };
  document.getElementById("traj-title").textContent = `Biomarker trajectory · ${biomarker}`;

  upsertChart("trajectory", "chart-traj", {
    type: "line",
    data: { labels: trajectories.months, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            filter(legendItem) {
              return !legendItem.text.includes("CI ");
            },
          },
        },
      },
      scales: {
        x: { title: { display: true, text: "Age (months CGA)" }, grid: { color: COLORS.grid } },
        y: { title: { display: true, text: `${biomarker} (${units[biomarker] || ""})` }, grid: { color: COLORS.grid } },
      },
    },
  });
}

function renderTrajectoriesTable() {
  const trajectories = STATE.dashboard.trajectories;
  const rows = [];

  Object.entries(trajectories.by_group || {}).forEach(([groupKey, groupData]) => {
    (trajectories.biomarkers || []).forEach((biomarker) => {
      const points = (groupData.mean[biomarker] || [])
        .map((value, index) => ({
          value: Number(value),
          month: Number(trajectories.months[index]),
        }))
        .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.month));
      if (!points.length) {
        return;
      }
      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];
      const monthSpan = Math.max(1, lastPoint.month - firstPoint.month);
      rows.push({
        group: groupKey,
        biomarker,
        intercept: firstPoint.value,
        slope: points.length > 1 ? (lastPoint.value - firstPoint.value) / monthSpan : null,
      });
    });
  });

  document.querySelector("#table-trajectories tbody").innerHTML = rows
    .map(
      (row) => {
        const slopeLabel = row.slope == null ? "—" : Number(row.slope).toFixed(3);
        return `<tr><td><span class="badge ${row.group.toLowerCase()}">${row.group}</span></td><td class="t-mono">${row.biomarker}</td><td class="t-mono">${Number(row.intercept).toFixed(2)}</td><td class="t-mono">${slopeLabel}</td></tr>`;
      }
    )
    .join("");
}

function renderCompletionChart() {
  const visitCompletion = STATE.dashboard.visit_completion;
  upsertChart("completion", "chart-completion", {
    type: "bar",
    data: {
      labels: visitCompletion.labels,
      datasets: ["ASIB", "PT", "TD"].map((groupKey) => ({
        label: groupKey,
        data: visitCompletion.by_group[groupKey],
        backgroundColor: `${COLORS[groupKey]}cc`,
        borderRadius: 8,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { usePointStyle: true, boxWidth: 8 } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 45 } },
        y: {
          min: 50,
          max: 100,
          grid: { color: COLORS.grid },
          ticks: { callback: (value) => `${value}%` },
        },
      },
    },
  });
}

function drawCohort() {
  if (!STATE.dashboard || !STATE.dashboard.cohort_table) {
    return;
  }

  const selectedGroup = document.getElementById("filter-group").value;
  const selectedQc = document.getElementById("filter-qc").value;
  let rows = STATE.dashboard.cohort_table.slice();

  if (selectedGroup !== "all") {
    rows = rows.filter((row) => row.group === selectedGroup);
  }
  if (selectedQc !== "all") {
    rows = rows.filter((row) => row.qc_status === selectedQc);
  }

  rows.sort((left, right) => compareValues(left[COHORT_SORT.col], right[COHORT_SORT.col], COHORT_SORT.dir));

  setText("cohort-count", `${formatInt(rows.length)} participants`);
  setText("cohort-toolbar-group", selectedGroup === "all" ? "All groups" : selectedGroup);
  setText("cohort-toolbar-qc", selectedQc === "all" ? "All QC" : selectedQc);

  document.querySelector("#table-cohort tbody").innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td class="t-mono">${escapeHtml(row.nano_id)}</td>
          <td><span class="badge ${String(row.group || "").toLowerCase()}">${escapeHtml(row.group)}</span></td>
          <td class="t-mono">${escapeHtml(String(row.ga_weeks ?? "-"))}</td>
          <td class="t-mono">${formatInt(row.birth_weight_g)}</td>
          <td>${escapeHtml(row.sex)}</td>
          <td class="t-mono">${escapeHtml(row.last_visit)}</td>
          <td class="t-mono">${Number(row.completeness_pct).toFixed(1)}%</td>
          <td><span class="badge ${row.qc_status === "OK" ? "ok" : "warn"}">${escapeHtml(row.qc_status)}</span></td>
        </tr>`
    )
    .join("");

  decorateRevealTargets();
}

function renderReadings() {
  const readings = STATE.readings || emptyReadingsPayload();
  const searchTerm = document.getElementById("filter-reading-search").value.trim().toLowerCase();
  const selectedCategory = document.getElementById("filter-reading-category").value;
  const sortMode = document.getElementById("filter-reading-sort").value;

  syncCategoryOptions(readings.summary.categories || []);
  renderReadingInsightPanel(readings);

  let items = readings.readings.map((item) => ({
    ...item,
    _score: scoreReadingMatch(item, searchTerm),
  }));
  if (selectedCategory !== "all") {
    items = items.filter((item) => item.category === selectedCategory);
  }
  if (searchTerm) {
    items = items.filter((item) => item._score > 0);
  }

  items.sort((left, right) => sortReadings(left, right, sortMode, searchTerm));

  renderReadingSpotlight({
    allReadings: readings.readings,
    featured: readings.featured || [],
    filteredItems: items,
    searchTerm,
  });

  const topCategory = chooseTopReadingCategory(readings.summary.categories || []);
  animateNumber("readings-total", readings.summary.total_readings || 0, (value) => formatInt(Math.round(value)));
  setText(
    "readings-total-note",
    `${formatInt(items.length)} item${items.length === 1 ? "" : "s"} in the current filtered view`
  );
  setText("readings-latest", readings.meta.latest_modified_at ? formatDateTime(readings.meta.latest_modified_at) : "No files yet");
  setText(
    "readings-latest-note",
    readings.summary.total_size_mb
      ? `${readings.summary.total_size_mb.toFixed(2)} MB · ${formatInt(readings.summary.total_pages || 0)} indexed pages`
      : "Waiting for files"
  );
  setText("readings-category", topCategory ? topCategory.label : "Uncategorized");
  setText(
    "readings-category-note",
    topCategory
      ? `${topCategory.count} item${topCategory.count === 1 ? "" : "s"} · ${readings.meta.pdf_metadata_enabled ? "PDF-aware indexing" : "Filename fallback"}`
      : "Auto-grouped from titles and excerpts"
  );

  document.getElementById("reading-chip-bar").innerHTML = (readings.summary.categories || [])
    .map(
      (category) => `
        <button class="chip ${selectedCategory === category.label ? "is-active" : ""}" type="button" data-category="${escapeHtml(category.label)}">
          ${escapeHtml(category.label)} <strong>${category.count}</strong>
        </button>`
    )
    .join("");

  const grid = document.getElementById("readings-grid");
  if (!items.length) {
    grid.innerHTML = '<div class="empty-state">No readings match the current filters. Clear search or switch category to see the full library.</div>';
    return;
  }

  grid.innerHTML = items
    .map(
      (item) => `
        <article class="reading-card content-card ${item.is_recent ? "recent" : ""}">
          <div>
            <div class="reading-meta">
              <span class="badge ok">${escapeHtml(item.category)}</span>
              <span>${escapeHtml(item.source)}</span>
              <span>${item.year || "Undated"}</span>
              <span>${item.page_count ? `${formatInt(item.page_count)} pages` : "Metadata only"}</span>
            </div>
            <h3>${escapeHtml(item.title)}</h3>
            <p class="reading-excerpt">${escapeHtml(getReadingExcerpt(item))}</p>
          </div>
          <div class="reading-meta">
            <span>${escapeHtml(getReadingByline(item))}</span>
            <span>${formatDateTime(item.modified_at)}</span>
            <span>${Number(item.size_mb).toFixed(2)} MB</span>
            <span>.${escapeHtml(item.extension)}</span>
          </div>
          <div class="reading-tags">
            ${(item.keywords || []).map((keyword) => `<span class="feature-chip t-mono">${escapeHtml(keyword)}</span>`).join("")}
          </div>
          <div class="reading-actions">
            <a class="reading-link" href="${item.relative_href}" target="_blank" rel="noreferrer">Open material</a>
            <span>${escapeHtml(item.relative_path)}</span>
          </div>
        </article>`
    )
    .join("");

  decorateRevealTargets();
}

function renderResearchQuestions() {
  const grid = document.getElementById("rq-grid");
  if (!grid) {
    return;
  }
  const payload = STATE.research;
  if (!payload || !Array.isArray(payload.questions) || !payload.questions.length) {
    setText("rq-kpi-total", "—");
    setText("rq-kpi-inprogress", "—");
    setText("rq-kpi-resolved", "—");
    setText("rq-kpi-critical", "—");
    grid.innerHTML = '<div class="empty-state">Research-questions catalog not loaded. Run <code>python dashboard/research_questions/build_research_questions_data.py</code> to generate it.</div>';
    return;
  }

  const questions = payload.questions.slice();
  const categories = payload.meta && payload.meta.categories
    ? payload.meta.categories.slice()
    : Array.from(new Set(questions.map((q) => q.category))).sort();
  const tags = payload.meta && payload.meta.type_tags
    ? payload.meta.type_tags.slice()
    : Array.from(new Set(questions.map((q) => q.type_tag))).sort();

  populateRqSelect("rq-filter-category", categories, RQ_FILTERS.category);
  populateRqSelect("rq-filter-type", tags, RQ_FILTERS.type_tag);

  // KPI strip
  const rollups = payload.rollups || {};
  const byStatus = rollups.by_status || {};
  const byPriority = rollups.by_priority || {};
  const criticalOpen = questions.filter((q) =>
    (q.priority === "critical" || q.priority === "high") &&
    q.status !== "resolved"
  ).length;

  animateNumber("rq-kpi-total", questions.length, (v) => formatInt(Math.round(v)));
  animateNumber("rq-kpi-inprogress", byStatus.in_progress || 0, (v) => formatInt(Math.round(v)));
  animateNumber("rq-kpi-resolved", byStatus.resolved || 0, (v) => formatInt(Math.round(v)));
  animateNumber("rq-kpi-critical", criticalOpen, (v) => formatInt(Math.round(v)));
  setText(
    "rq-kpi-inprogress-note",
    `${byStatus.open || 0} open · ${byStatus.blocked || 0} blocked`
  );
  setText(
    "rq-kpi-resolved-note",
    `${byPriority.critical || 0} critical · ${byPriority.high || 0} high overall`
  );
  setText(
    "rq-kpi-critical-note",
    `Unresolved critical + high of ${questions.length}`
  );

  // Heatmap: Category × Type-tag
  renderResearchHeatmap(questions, categories, tags);

  // Chip bar: quick category chips
  const chipBar = document.getElementById("rq-chip-bar");
  const categoryCounts = categories.map((cat) => ({
    category: cat,
    count: questions.filter((q) => q.category === cat).length,
  }));
  chipBar.innerHTML = categoryCounts
    .map(
      (entry) => `
      <button type="button" class="chip ${
        RQ_FILTERS.category === entry.category ? "is-active" : ""
      }" data-rq-category="${escapeHtml(entry.category)}">
        ${escapeHtml(entry.category)} <strong>${entry.count}</strong>
      </button>`
    )
    .join("");
  chipBar.querySelectorAll("[data-rq-category]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.getAttribute("data-rq-category");
      RQ_FILTERS.category = RQ_FILTERS.category === cat ? "all" : cat;
      const sel = document.getElementById("rq-filter-category");
      if (sel) sel.value = RQ_FILTERS.category;
      renderResearchQuestions();
    });
  });

  // Filter + sort cards
  const filtered = questions.filter((q) => {
    if (RQ_FILTERS.category !== "all" && q.category !== RQ_FILTERS.category) return false;
    if (RQ_FILTERS.type_tag !== "all" && q.type_tag !== RQ_FILTERS.type_tag) return false;
    if (RQ_FILTERS.status !== "all" && q.status !== RQ_FILTERS.status) return false;
    if (RQ_FILTERS.priority !== "all" && q.priority !== RQ_FILTERS.priority) return false;
    if (RQ_FILTERS.search) {
      const hay = [
        q.id,
        q.question,
        q.summary,
        q.implementation,
        (q.assets || []).join(" "),
        (q.widgets || []).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(RQ_FILTERS.search.toLowerCase())) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const pa = RQ_PRIORITY_META[a.priority] ? RQ_PRIORITY_META[a.priority].rank : 9;
    const pb = RQ_PRIORITY_META[b.priority] ? RQ_PRIORITY_META[b.priority].rank : 9;
    if (pa !== pb) return pa - pb;
    return a.id.localeCompare(b.id);
  });

  const empty = document.getElementById("rq-empty");
  if (!filtered.length) {
    grid.innerHTML = "";
    if (empty) empty.classList.remove("hide");
    return;
  }
  if (empty) empty.classList.add("hide");

  grid.innerHTML = filtered.map(renderResearchCard).join("");
  decorateRevealTargets();
}

function populateRqSelect(id, values, current) {
  const el = document.getElementById(id);
  if (!el) return;
  const existing = Array.from(el.options).map((o) => o.value);
  if (existing.length > 1 + values.length) {
    // already populated
    return;
  }
  const head = el.options[0] ? el.options[0].outerHTML : "";
  el.innerHTML =
    head +
    values
      .map(
        (v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`
      )
      .join("");
  if (current && values.includes(current)) {
    el.value = current;
  }
}

function renderResearchHeatmap(questions, categories, tags) {
  const table = document.getElementById("rq-heatmap");
  if (!table) return;

  const counts = {};
  questions.forEach((q) => {
    const key = `${q.category}||${q.type_tag}`;
    counts[key] = (counts[key] || 0) + 1;
  });

  const head = table.querySelector("thead");
  head.innerHTML =
    '<tr><th scope="col">Category</th>' +
    tags
      .map(
        (t) =>
          `<th scope="col" class="rq-head-tag" title="${escapeHtml(t)}">${escapeHtml(t)}</th>`
      )
      .join("") +
    "</tr>";

  const body = table.querySelector("tbody");
  body.innerHTML = categories
    .map((cat) => {
      const cells = tags
        .map((t) => {
          const n = counts[`${cat}||${t}`] || 0;
          const cls =
            n === 0 ? "rq-cell-zero" : n === 1 ? "rq-cell-lo" : n === 2 ? "rq-cell-mid" : "rq-cell-hi";
          return `<td class="rq-cell ${cls}" data-category="${escapeHtml(cat)}" data-type="${escapeHtml(t)}" title="${escapeHtml(cat)} × ${escapeHtml(t)}: ${n}">${n || ""}</td>`;
        })
        .join("");
      return `<tr><th scope="row" class="rq-row-cat">${escapeHtml(cat)}</th>${cells}</tr>`;
    })
    .join("");
}

function renderResearchCard(q) {
  const statusMeta = RQ_STATUS_META[q.status] || { label: q.status, color: "#6c757d" };
  const priorityMeta = RQ_PRIORITY_META[q.priority] || { label: q.priority };
  const assets = (q.assets || [])
    .map(
      (a) =>
        `<li><code>${escapeHtml(a)}</code></li>`
    )
    .join("");
  const widgets = (q.widgets || [])
    .map((w) => `<span class="rq-widget-chip">${escapeHtml(w)}</span>`)
    .join("");
  const metrics = (q.metrics || [])
    .map((m) => `<span class="rq-metric-chip">${escapeHtml(m)}</span>`)
    .join("");

  return `
    <article class="research-card content-card" data-status="${escapeHtml(q.status)}" data-priority="${escapeHtml(q.priority)}">
      <header class="research-card-head">
        <div class="research-card-ids">
          <span class="research-id">${escapeHtml(q.id)}</span>
          <span class="research-category">${escapeHtml(q.category)}</span>
          <span class="research-type">${escapeHtml(q.type_tag)}</span>
        </div>
        <div class="research-card-flags">
          <span class="research-status" style="background:${statusMeta.color}">${escapeHtml(statusMeta.label)}</span>
          <span class="research-priority research-priority-${escapeHtml(q.priority)}">${escapeHtml(priorityMeta.label)}</span>
        </div>
      </header>
      <h3 class="research-question">${escapeHtml(q.question)}</h3>
      <p class="research-summary">${escapeHtml(q.summary)}</p>
      <details class="research-details">
        <summary>Implementation plan &amp; linked assets</summary>
        <p class="research-implementation">${escapeHtml(q.implementation)}</p>
        ${assets ? `<div class="research-subhead">Linked assets</div><ul class="research-assets">${assets}</ul>` : ""}
        ${widgets ? `<div class="research-subhead">Dashboard widgets</div><div class="research-widgets">${widgets}</div>` : ""}
        ${metrics ? `<div class="research-subhead">Success metrics</div><div class="research-widgets">${metrics}</div>` : ""}
      </details>
    </article>`;
}

function renderFooter() {
  const dashboardMeta = (STATE.dashboard && STATE.dashboard.meta) || {};
  const readings = STATE.readings.summary || {};
  const metadataMode = STATE.readings.meta && STATE.readings.meta.pdf_metadata_enabled
    ? "PDF-aware indexing"
    : "filename-only indexing";
  document.getElementById("footer-left").innerHTML = [
    escapeHtml(dashboardMeta.data_source || "dashboard"),
    `${formatInt(readings.total_readings || 0)} indexed readings`,
    `${formatInt(readings.total_pages || 0)} pages scanned`,
    metadataMode,
    "no PHI rendered",
  ].map((item) => `<span class="footer-chip">${item}</span>`).join('<span class="footer-dot">·</span>');
}

function upsertChart(key, canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    return null;
  }
  if (CHARTS[key]) {
    CHARTS[key].config.type = config.type;
    CHARTS[key].data = config.data;
    CHARTS[key].options = config.options;
    CHARTS[key].update();
    return CHARTS[key];
  }
  CHARTS[key] = new Chart(canvas, config);
  return CHARTS[key];
}

function animateNumber(id, value, formatter) {
  const element = document.getElementById(id);
  if (!element || !Number.isFinite(value)) {
    setText(id, formatter ? formatter(value) : String(value));
    return;
  }

  const start = Number(element.dataset.rawValue || value);
  const duration = 650;
  if (!Number.isFinite(start) || start === value) {
    element.dataset.rawValue = String(value);
    element.textContent = formatter ? formatter(value) : String(value);
    return;
  }

  const startedAt = performance.now();
  const frame = (timestamp) => {
    const progress = Math.min((timestamp - startedAt) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (value - start) * eased;
    element.textContent = formatter ? formatter(current) : String(current);
    if (progress < 1) {
      window.requestAnimationFrame(frame);
      return;
    }
    element.dataset.rawValue = String(value);
    element.textContent = formatter ? formatter(value) : String(value);
  };
  window.requestAnimationFrame(frame);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function setError(message) {
  const banner = document.getElementById("error-banner");
  if (!message) {
    banner.textContent = "";
    banner.classList.add("hide");
    return;
  }
  banner.textContent = message;
  banner.classList.remove("hide");
}

function setupAssistant() {
  const launcher = document.getElementById("assistant-launcher");
  if (!launcher || launcher.dataset.bound === "true") {
    return;
  }

  launcher.addEventListener("click", () => {
    toggleAssistantPanel();
  });

  const close = document.getElementById("assistant-close");
  if (close) {
    close.addEventListener("click", () => {
      toggleAssistantPanel(false);
    });
  }

  const form = document.getElementById("assistant-form");
  if (form) {
    form.addEventListener("submit", submitAssistantMessage);
  }

  const input = document.getElementById("assistant-input");
  if (input) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitAssistantMessage(event);
      }
    });
  }

  launcher.dataset.bound = "true";
  renderAssistantStatus();
}

async function syncAssistantStatus() {
  try {
    const status = await loadJson(DATA_URLS.chatStatus, null);
    STATE.assistant.status = status || {
      state: "offline",
      ready: false,
      message: "Assistant status is unavailable right now.",
    };
  } catch (error) {
    STATE.assistant.status = {
      state: "offline",
      ready: false,
      message: `Assistant status is unavailable: ${error.message || error}`,
    };
  }
  renderAssistantStatus();
}

function renderAssistantStatus() {
  const status = STATE.assistant.status || {
    state: "booting",
    ready: false,
    message: "Checking assistant status…",
  };
  const tone = getAssistantTone(status.state);
  const launcher = document.getElementById("assistant-launcher");
  const launcherLabel = document.getElementById("assistant-launcher-label");
  const statusChip = document.getElementById("assistant-status-chip");
  const statusCopy = document.getElementById("assistant-status-copy");
  const submit = document.getElementById("assistant-submit");
  const input = document.getElementById("assistant-input");

  if (launcher) {
    launcher.dataset.tone = tone;
    launcher.setAttribute("aria-expanded", String(STATE.assistant.open));
  }
  if (launcherLabel) {
    launcherLabel.textContent = status.ready ? "Ask NANO AI" : "Assistant setup";
  }
  if (statusChip) {
    statusChip.textContent = getAssistantToneLabel(status);
    statusChip.dataset.tone = tone;
  }
  if (statusCopy) {
    statusCopy.textContent = status.message || "Assistant status is unavailable.";
  }
  if (submit) {
    submit.disabled = !status.ready || STATE.assistant.pending;
    submit.textContent = STATE.assistant.pending ? "Thinking…" : "Send";
  }
  if (input) {
    input.disabled = !status.ready || STATE.assistant.pending;
    input.placeholder = status.ready
      ? "Ask about enrollment, data quality, AUROC, or readings"
      : "Install the local Qwen model bundle to enable chat";
  }
}

function getAssistantTone(state) {
  switch ((state || "").toLowerCase()) {
    case "ready":
      return "ok";
    case "degraded":
      return "warn";
    case "booting":
      return "soft";
    case "offline":
    case "dependencies-missing":
    case "memory-insufficient":
    case "model-missing":
      return "warn";
    default:
      return "soft";
  }
}

function getAssistantToneLabel(status) {
  if (!status) {
    return "Checking status";
  }
  if (status.ready) {
    return "Ready";
  }

  switch ((status.state || "").toLowerCase()) {
    case "dependencies-missing":
      return "Install dependencies";
    case "memory-insufficient":
      return "Needs more memory";
    case "model-missing":
      return "Download required";
    case "degraded":
      return "Temporarily unavailable";
    case "offline":
      return "Offline";
    default:
      return "Checking status";
  }
}

function toggleAssistantPanel(forceOpen) {
  const panel = document.getElementById("assistant-panel");
  if (!panel) {
    return;
  }
  STATE.assistant.open = typeof forceOpen === "boolean" ? forceOpen : !STATE.assistant.open;
  panel.hidden = !STATE.assistant.open;
  document.body.classList.toggle("assistant-open", STATE.assistant.open);
  if (STATE.assistant.open) {
    syncAssistantStatus();
  }
  renderAssistantStatus();
  if (STATE.assistant.open) {
    scrollAssistantLog();
  }
}

async function submitAssistantMessage(event) {
  if (event && typeof event.preventDefault === "function") {
    event.preventDefault();
  }

  if (STATE.assistant.pending) {
    return;
  }

  const input = document.getElementById("assistant-input");
  const message = input ? input.value.trim() : "";
  if (!message) {
    return;
  }

  appendAssistantMessage("user", message);
  STATE.assistant.history.push({ role: "user", content: message });
  if (input) {
    input.value = "";
  }

  STATE.assistant.pending = true;
  renderAssistantStatus();

  try {
    const response = await fetch(DATA_URLS.chat, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        history: STATE.assistant.history.slice(-8),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw {
        message: payload.error || `Assistant request failed (${response.status})`,
        status: payload.status || null,
      };
    }

    appendAssistantMessage("assistant", payload.reply || "No answer was returned.", payload.citations || []);
    STATE.assistant.history.push({ role: "assistant", content: payload.reply || "" });
    if (payload.status) {
      STATE.assistant.status = payload.status;
    }
  } catch (error) {
    const status = error && error.status ? error.status : null;
    const messageText = status && status.message
      ? status.message
      : (error && error.message) || "Assistant request failed.";
    appendAssistantMessage("assistant", messageText, [], true);
    if (status) {
      STATE.assistant.status = status;
    }
  } finally {
    STATE.assistant.pending = false;
    renderAssistantStatus();
    scrollAssistantLog();
  }
}

function appendAssistantMessage(role, text, citations = [], isSystem = false) {
  const log = document.getElementById("assistant-log");
  if (!log) {
    return;
  }
  const roleClass = role === "user" ? "assistant-message-user" : "assistant-message-assistant";
  const citationMarkup = citations.length
    ? `<div class="assistant-citations">Context: ${citations.slice(0, 4).map((item) => `<code>${escapeHtml(item)}</code>`).join(" ")}</div>`
    : "";
  const systemClass = isSystem ? " assistant-message-system" : "";
  log.insertAdjacentHTML(
    "beforeend",
    `
      <article class="assistant-message ${roleClass}${systemClass}">
        <span class="assistant-role">${role === "user" ? "You" : "NANO AI"}</span>
        <p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>
        ${citationMarkup}
      </article>
    `,
  );
  scrollAssistantLog();
}

function scrollAssistantLog() {
  const log = document.getElementById("assistant-log");
  if (!log) {
    return;
  }
  log.scrollTop = log.scrollHeight;
}

function updateRefreshCountdown() {
  const element = document.getElementById("next-refresh");
  if (!element || !nextRefreshAt) {
    return;
  }
  const remainingMs = Math.max(0, nextRefreshAt - Date.now());
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  element.textContent = `${remainingSeconds}s`;
}

function syncCategoryOptions(categories) {
  const select = document.getElementById("filter-reading-category");
  const currentValue = select.value || "all";
  const nextOptions = [
    '<option value="all">All categories</option>',
    ...categories.map((category) => `<option value="${escapeHtml(category.label)}">${escapeHtml(category.label)}</option>`),
  ].join("");
  if (select.innerHTML !== nextOptions) {
    select.innerHTML = nextOptions;
  }
  if (["all", ...categories.map((category) => category.label)].includes(currentValue)) {
    select.value = currentValue;
  }
}

function renderReadingInsightPanel(readings) {
  const summary = readings.summary || {};
  const topYear = (summary.years || []).slice().sort((left, right) => right.count - left.count || String(right.year).localeCompare(String(left.year)))[0];

  animateNumber("readings-pages", summary.total_pages || 0, (value) => formatInt(Math.round(value)));
  animateNumber("readings-sources", (summary.sources || []).length, (value) => formatInt(Math.round(value)));
  setText("readings-year", topYear ? topYear.year : "—");
  animateNumber("readings-featured-count", (readings.featured || []).length, (value) => formatInt(Math.round(value)));

  document.getElementById("reading-source-stack").innerHTML = (summary.sources || [])
    .slice(0, 4)
    .map(
      (source) => `
        <div class="reading-source-row">
          <span>${escapeHtml(source.label)}</span>
          <strong>${formatInt(source.count)}</strong>
        </div>`
    )
    .join("");

  document.getElementById("reading-year-chip-bar").innerHTML = (summary.years || [])
    .slice(0, 6)
    .map((year) => `<span class="chip">${escapeHtml(year.year)} <strong>${year.count}</strong></span>`)
    .join("");
}

function renderReadingSpotlight({ allReadings, featured, filteredItems, searchTerm }) {
  const spotlight = chooseSpotlightReading({ allReadings, featured, filteredItems, searchTerm });
  const fallbackTitle = searchTerm
    ? `No reading matches "${searchTerm}" yet`
    : "Reading spotlight";

  setText("reading-featured-title", spotlight ? spotlight.title : fallbackTitle);
  setText(
    "reading-featured-excerpt",
    spotlight
      ? getReadingExcerpt(spotlight)
      : "Use the search and category controls below to browse the indexed library."
  );

  document.getElementById("reading-featured-meta").innerHTML = spotlight
    ? [
        `<span class="badge ${spotlight.is_recent ? "ok" : "warn"}">${escapeHtml(spotlight.category)}</span>`,
        `<span>${escapeHtml(spotlight.source)}</span>`,
        `<span>${spotlight.year || "Undated"}</span>`,
        `<span>${escapeHtml(getReadingByline(spotlight))}</span>`,
        `<span>${spotlight.page_count ? `${formatInt(spotlight.page_count)} pages` : "Metadata only"}</span>`,
      ].join("")
    : "";

  document.getElementById("reading-featured-tags").innerHTML = spotlight
    ? (spotlight.keywords || []).map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("")
    : "";

  const link = document.getElementById("reading-featured-link");
  link.href = spotlight ? spotlight.relative_href : "../ESD%20Lab%20readings/";
  link.textContent = spotlight ? (searchTerm ? "Open top match" : "Open featured reading") : "Browse reading folder";
  setText("reading-featured-path", spotlight ? spotlight.relative_path : "ESD Lab readings/");
}

function chooseSpotlightReading({ allReadings, featured, filteredItems, searchTerm }) {
  if (searchTerm && filteredItems.length) {
    return filteredItems.slice().sort((left, right) => (right._score || 0) - (left._score || 0))[0];
  }
  const featuredPool = (featured || []).filter((item) => item.category !== "Front Matter");
  if (featuredPool.length) {
    return featuredPool[0];
  }
  const fallbackPool = (allReadings || []).filter((item) => item.category !== "Front Matter");
  return fallbackPool[0] || (allReadings || [])[0] || null;
}

function chooseTopReadingCategory(categories) {
  return categories.find((category) => category.label !== "Front Matter") || categories[0] || null;
}

function getReadingExcerpt(item) {
  const raw = String(item.excerpt || `Indexed ${item.extension.toUpperCase()} material from the ESD Lab readings folder.`);
  const cleaned = raw
    .replace(/^CHAPTER\s+(?:[IVXLC]+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|[0-9]+)\s+/i, "")
    .trim();

  const looksNoisy = /(corresponding|department of|school of|university|contents\s+[0-9]|series editor|edited by)/i.test(cleaned);
  const hasBodyCopy = /(abstract|introduction)/i.test(cleaned) || /[.!?].{50,}/.test(cleaned);
  if (looksNoisy && !hasBodyCopy) {
    if (item.category === "Front Matter") {
      return `Front matter from ${item.source}.`;
    }
    return `Indexed reading from ${item.source} focused on ${String(item.category || "research").toLowerCase()}.`;
  }
  return cleaned;
}

function getReadingByline(item) {
  const authors = String(item.authors_display || "").trim();
  if (authors && authors !== "Unknown authors") {
    return authors;
  }
  if (item.category === "Front Matter") {
    return "Editorial material";
  }
  return "Metadata pending";
}

function readingDisplayPriority(item) {
  return [
    item.category !== "Front Matter" ? 1 : 0,
    item.is_packet ? 0 : 1,
    item.year || 0,
    item.page_count || 0,
    item.is_recent ? 1 : 0,
  ];
}

function compareReadingPriority(left, right) {
  const leftPriority = readingDisplayPriority(left);
  const rightPriority = readingDisplayPriority(right);
  for (let index = 0; index < leftPriority.length; index += 1) {
    if (leftPriority[index] !== rightPriority[index]) {
      return rightPriority[index] - leftPriority[index];
    }
  }
  return 0;
}

function scoreReadingMatch(item, searchTerm) {
  if (!searchTerm) {
    return 1;
  }
  const terms = searchTerm.split(/\s+/).filter(Boolean);
  const title = String(item.title || "").toLowerCase();
  const authors = String(item.authors_display || "").toLowerCase();
  const source = String(item.source || "").toLowerCase();
  const category = String(item.category || "").toLowerCase();
  const excerpt = String(item.excerpt || "").toLowerCase();
  const keywords = String((item.keywords || []).join(" ")).toLowerCase();
  const searchText = String(item.search_text || "").toLowerCase();

  return terms.reduce((score, term) => {
    let next = score;
    if (title.includes(term)) {
      next += 90;
    }
    if (authors.includes(term)) {
      next += 55;
    }
    if (keywords.includes(term)) {
      next += 45;
    }
    if (source.includes(term)) {
      next += 35;
    }
    if (category.includes(term)) {
      next += 24;
    }
    if (excerpt.includes(term)) {
      next += 18;
    }
    if (searchText.includes(term)) {
      next += 8;
    }
    return next;
  }, 0);
}

function sortReadings(left, right, mode, searchTerm) {
  if (mode === "relevance") {
    return (right._score || 0) - (left._score || 0)
      || compareReadingPriority(left, right)
      || String(right.modified_at).localeCompare(String(left.modified_at))
      || String(left.title).localeCompare(String(right.title));
  }
  if (mode === "title") {
    return String(left.title).localeCompare(String(right.title)) || compareReadingPriority(left, right);
  }
  if (mode === "year") {
    return (right.year || 0) - (left.year || 0) || compareReadingPriority(left, right) || String(left.title).localeCompare(String(right.title));
  }
  if (mode === "pages") {
    return (right.page_count || 0) - (left.page_count || 0) || compareReadingPriority(left, right) || String(left.title).localeCompare(String(right.title));
  }
  if (mode === "size") {
    return (right.size_mb || 0) - (left.size_mb || 0) || compareReadingPriority(left, right) || String(left.title).localeCompare(String(right.title));
  }
  if (searchTerm) {
    return String(right.modified_at).localeCompare(String(left.modified_at))
      || compareReadingPriority(left, right)
      || (right._score || 0) - (left._score || 0);
  }
  return String(right.modified_at).localeCompare(String(left.modified_at))
    || compareReadingPriority(left, right)
    || String(left.title).localeCompare(String(right.title));
}

function resetReadingFilters() {
  document.getElementById("filter-reading-search").value = "";
  document.getElementById("filter-reading-category").value = "all";
  document.getElementById("filter-reading-sort").value = "recent";
  renderReadings();
}

function handleReadingChipClick(event) {
  const chip = event.target.closest("button[data-category]");
  if (!chip) {
    return;
  }
  document.getElementById("filter-reading-category").value = chip.dataset.category || "all";
  renderReadings();
}

function compareValues(left, right, direction) {
  let result = 0;
  if (typeof left === "string" || typeof right === "string") {
    result = String(left ?? "").localeCompare(String(right ?? ""));
  } else {
    result = Number(left ?? 0) - Number(right ?? 0);
  }
  return direction === "asc" ? result : -result;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatInt(value) {
  if (value == null || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ═══════════════════════════════════════════════════════════════
   GEOSPATIAL ANALYSIS SECTION
   ═══════════════════════════════════════════════════════════════ */

const GEO_LAYERS = [
  { id: "recruitment", label: "Recruitment", default: true },
  { id: "sdoh", label: "SDoH Risk", default: false },
  { id: "catchment", label: "Catchment", default: false },
  { id: "partners", label: "Partners", default: false },
];

const GEO_STATE = {
  map: null,
  layers: {},
  activeLayer: "recruitment",
  timeline: { playing: false, timer: null, index: 0 },
  timelineMarkers: [],
};

function renderGeo() {
  const geo = STATE.dashboard && STATE.dashboard.geo;
  if (!geo) return;
  renderGeoKPIs(geo);
  initGeoMap(geo);
  renderGeoLayerControls();
  renderSDoHRadar(geo.sdoh_heat);
  renderSDoHTable(geo.sdoh_heat);
  renderDistanceChart(geo.catchment);
  renderRetentionChart(geo.catchment);
  initGeoTimeline(geo);
}

function renderGeoKPIs(geo) {
  const el = document.getElementById("geo-kpis");
  if (!el) return;
  const zones = geo.recruitment_zones || [];
  const nonSuppressed = zones.filter(function(z) { return !z.suppressed && z.n_total; });
  const totalParticipants = geo.catchment ? geo.catchment.total_participants : 0;
  const rings = geo.catchment ? geo.catchment.participants_by_ring : [];
  const medianRing = rings.length > 1 ? rings[1] : rings[0];
  const sdoh = geo.sdoh_heat || [];
  const meanRisk = sdoh.length
    ? sdoh.reduce(function(s, d) { return s + d.composite_risk; }, 0) / sdoh.length
    : 0;
  const partners = geo.partner_network || [];
  const farRing = rings.find(function(r) { return r.ring_km >= 50; });

  el.innerHTML =
    '<div class="card kpi-card">' +
      '<span class="t-label label">ZIP Codes Reached</span>' +
      '<span class="t-kpi">' + nonSuppressed.length + '</span>' +
      '<span class="t-caption">' + zones.length + ' total zones, ' + (zones.length - nonSuppressed.length) + ' suppressed</span>' +
    '</div>' +
    '<div class="card kpi-card">' +
      '<span class="t-label label">Total Participants (Geo)</span>' +
      '<span class="t-kpi">' + formatInt(totalParticipants) + '</span>' +
      '<span class="t-caption">Mapped to ZIP centroids</span>' +
    '</div>' +
    '<div class="card kpi-card">' +
      '<span class="t-label label">SDoH Composite Risk</span>' +
      '<span class="t-kpi">' + meanRisk.toFixed(2) + '</span>' +
      '<span class="t-caption">Mean PRAPARE across ' + sdoh.length + ' ZIPs</span>' +
    '</div>' +
    '<div class="card kpi-card">' +
      '<span class="t-label label">Community Partners</span>' +
      '<span class="t-kpi">' + partners.length + '</span>' +
      '<span class="t-caption">Mapped in the Midlands region</span>' +
    '</div>' +
    '<div class="card kpi-card">' +
      '<span class="t-label label">Retention &gt;50 km</span>' +
      '<span class="t-kpi">' + (farRing ? farRing.mean_completeness + '%' : '—') + '</span>' +
      '<span class="t-caption">' + (farRing ? farRing.n + ' participants in band' : 'No data') + '</span>' +
    '</div>';
}

function initGeoMap(geo) {
  if (typeof L === "undefined") return;
  var container = document.getElementById("geo-map");
  if (!container) return;

  if (GEO_STATE.map) {
    GEO_STATE.map.remove();
    GEO_STATE.map = null;
    GEO_STATE.layers = {};
  }

  var center = geo.meta.center ? [geo.meta.center[1], geo.meta.center[0]] : [34.0, -81.03];
  var map = L.map(container, { scrollWheelZoom: false, zoomControl: true }).setView(center, geo.meta.zoom_default || 10);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/copyright">OSM</a>',
    subdomains: "abcd",
    maxZoom: 16,
  }).addTo(map);

  GEO_STATE.map = map;

  // Layer 1: Recruitment choropleth (circle markers)
  var recruitLayer = L.layerGroup();
  var zones = geo.recruitment_zones || [];
  var maxN = Math.max.apply(null, zones.map(function(z) { return z.n_total || 0; }).concat([1]));
  zones.forEach(function(zone) {
    if (zone.suppressed || !zone.n_total) return;
    var lat = zone.centroid[1], lng = zone.centroid[0];
    var ratio = zone.n_total / maxN;
    var radius = 8 + ratio * 22;
    var groups = zone.n_by_group || {};
    var dominant = Object.keys(groups).sort(function(a, b) { return (groups[b] || 0) - (groups[a] || 0); })[0];
    var color = dominant === "ASIB" ? COLORS.ASIB : dominant === "TD" ? COLORS.TD : COLORS.PT;

    var circle = L.circleMarker([lat, lng], {
      radius: radius, fillColor: color, fillOpacity: 0.15 + ratio * 0.5,
      color: color, weight: 1.5, opacity: 0.7,
    });
    circle.bindTooltip(
      '<div class="geo-tooltip-title">' + escapeHtml(zone.label) + ' (' + zone.zip + ')</div>' +
      '<div class="geo-tooltip-row"><span class="label">Total</span><span class="value">' + zone.n_total + '</span></div>' +
      '<div class="geo-tooltip-row"><span class="label">ASIB</span><span class="value">' + (groups.ASIB || 0) + '</span></div>' +
      '<div class="geo-tooltip-row"><span class="label">PT</span><span class="value">' + (groups.PT || 0) + '</span></div>' +
      '<div class="geo-tooltip-row"><span class="label">TD</span><span class="value">' + (groups.TD || 0) + '</span></div>' +
      '<div class="geo-tooltip-row"><span class="label">Distance</span><span class="value">' + zone.distance_km + ' km</span></div>',
      { className: "geo-tooltip is-visible", direction: "top", offset: [0, -radius] }
    );
    recruitLayer.addLayer(circle);
  });
  GEO_STATE.layers.recruitment = recruitLayer;
  recruitLayer.addTo(map);

  // Lab marker
  var labIcon = L.divIcon({ className: "", html: '<div style="font-size:18px;color:' + COLORS.accent + ';text-shadow:0 1px 3px rgba(0,0,0,0.3);">◆</div>', iconSize: [20, 20], iconAnchor: [10, 10] });
  L.marker(center, { icon: labIcon }).addTo(map).bindTooltip("ESD Lab · 1800 Gervais St", { direction: "top", offset: [0, -12] });

  // Layer 2: SDoH heat (colored circles by risk)
  var sdohLayer = L.layerGroup();
  (geo.sdoh_heat || []).forEach(function(entry) {
    if (entry.suppressed) return;
    var lat = entry.centroid[1], lng = entry.centroid[0];
    var risk = entry.composite_risk;
    var hue = risk < 0.35 ? 140 : risk < 0.55 ? 35 : 8;
    var color = "hsl(" + hue + ", 70%, 50%)";
    var circle = L.circleMarker([lat, lng], {
      radius: 14, fillColor: color, fillOpacity: 0.4, color: color, weight: 1.5, opacity: 0.6,
    });
    var domainHTML = Object.keys(entry.domains).map(function(d) {
      return '<div class="geo-tooltip-row"><span class="label">' + d.charAt(0).toUpperCase() + d.slice(1).replace("_", " ") +
        '</span><span class="value">' + entry.domains[d].toFixed(2) + '</span></div>';
    }).join("");
    circle.bindTooltip(
      '<div class="geo-tooltip-title">SDoH · ZIP ' + entry.zip + '</div>' +
      '<div class="geo-tooltip-row"><span class="label">Composite</span><span class="value" style="color:' + color + '">' + risk.toFixed(2) + '</span></div>' +
      domainHTML +
      '<div class="geo-tooltip-row"><span class="label">Respondents</span><span class="value">' + entry.n_respondents + '</span></div>',
      { className: "geo-tooltip is-visible", direction: "top", offset: [0, -14] }
    );
    sdohLayer.addLayer(circle);
  });
  GEO_STATE.layers.sdoh = sdohLayer;

  // Layer 3: Catchment rings
  var catchLayer = L.layerGroup();
  var rings = geo.catchment ? geo.catchment.distance_rings_km : [];
  rings.forEach(function(km) {
    L.circle(center, { radius: km * 1000, color: COLORS.accent, weight: 1, opacity: 0.3, fillColor: COLORS.accent, fillOpacity: 0.04, dashArray: "6 4" }).addTo(catchLayer);
  });
  (geo.catchment && geo.catchment.nicu_sites || []).forEach(function(nicu) {
    var lat = nicu.coords[1], lng = nicu.coords[0];
    var nicuIcon = L.divIcon({ className: "geo-nicu-label", html: "🏥", iconSize: [20, 20], iconAnchor: [10, 10] });
    L.marker([lat, lng], { icon: nicuIcon }).addTo(catchLayer).bindTooltip(
      '<div class="geo-tooltip-title">' + escapeHtml(nicu.name) + '</div>' +
      '<div class="geo-tooltip-row"><span class="label">Referred</span><span class="value">' + nicu.n_referred + '</span></div>' +
      '<div class="geo-tooltip-row"><span class="label">Mean GA</span><span class="value">' + nicu.mean_ga_weeks + 'w</span></div>',
      { className: "geo-tooltip is-visible", direction: "top", offset: [0, -12] }
    );
  });
  GEO_STATE.layers.catchment = catchLayer;

  // Layer 4: Partners
  var partnerLayer = L.layerGroup();
  (geo.partner_network || []).forEach(function(p) {
    var lat = p.coords[1], lng = p.coords[0];
    L.polyline([center, [lat, lng]], { color: COLORS.accentSoft, weight: 1, opacity: 0.3, dashArray: "4 4" }).addTo(partnerLayer);
    var pIcon = L.circleMarker([lat, lng], { radius: 5, fillColor: COLORS.accentSoft, fillOpacity: 0.8, color: "#fff", weight: 2 });
    pIcon.bindTooltip(
      '<div class="geo-tooltip-title">' + escapeHtml(p.name) + '</div>' +
      '<div class="geo-tooltip-row"><span class="label">Type</span><span class="value">' + (p.type || "partner") + '</span></div>',
      { className: "geo-tooltip is-visible", direction: "top", offset: [0, -6] }
    );
    partnerLayer.addLayer(pIcon);
  });
  GEO_STATE.layers.partners = partnerLayer;

  setTimeout(function() { map.invalidateSize(); }, 300);
}

function renderGeoLayerControls() {
  var el = document.getElementById("geo-layer-controls");
  if (!el) return;
  el.innerHTML = '<div class="geo-layer-pills">' + GEO_LAYERS.map(function(layer) {
    return '<button class="geo-layer-pill' + (layer.default ? ' is-active' : '') + '" data-layer="' + layer.id + '">' + layer.label + '</button>';
  }).join("") + '</div>';

  el.addEventListener("click", function(e) {
    var btn = e.target.closest("[data-layer]");
    if (!btn || !GEO_STATE.map) return;
    var id = btn.dataset.layer;
    el.querySelectorAll(".geo-layer-pill").forEach(function(pill) {
      var active = pill.dataset.layer === id;
      pill.classList.toggle("is-active", active);
    });
    GEO_LAYERS.forEach(function(layer) {
      var lg = GEO_STATE.layers[layer.id];
      if (!lg) return;
      if (layer.id === id) { GEO_STATE.map.addLayer(lg); }
      else { GEO_STATE.map.removeLayer(lg); }
    });
    GEO_STATE.activeLayer = id;
  });
}

function renderSDoHRadar(sdohHeat) {
  var el = document.getElementById("geo-sdoh-radar-chart");
  if (!el || !sdohHeat || !sdohHeat.length) return;
  var domains = ["housing", "food", "transportation", "social_isolation", "stress"];
  var labels = ["Housing", "Food", "Transportation", "Social Isolation", "Stress"];
  var means = domains.map(function(d) {
    var vals = sdohHeat.map(function(z) { return z.domains[d] || 0; });
    return vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
  });

  var canvas = el.querySelector("canvas");
  if (!canvas) { canvas = document.createElement("canvas"); el.appendChild(canvas); }
  if (CHARTS.geoRadar) { CHARTS.geoRadar.destroy(); }

  CHARTS.geoRadar = new Chart(canvas, {
    type: "radar",
    data: {
      labels: labels,
      datasets: [{
        label: "Mean Risk Score",
        data: means.map(function(v) { return Math.round(v * 100) / 100; }),
        backgroundColor: "rgba(58, 118, 254, 0.15)",
        borderColor: COLORS.accent,
        borderWidth: 2,
        pointBackgroundColor: COLORS.accent,
        pointRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { r: { beginAtZero: true, max: 1, ticks: { stepSize: 0.2, font: { size: 10 } }, pointLabels: { font: { size: 11 } }, grid: { color: COLORS.grid } } },
      plugins: { legend: { display: false } },
    },
  });
}

function renderSDoHTable(sdohHeat) {
  var thead = document.getElementById("geo-sdoh-thead");
  var tbody = document.getElementById("geo-sdoh-tbody");
  if (!thead || !tbody || !sdohHeat || !sdohHeat.length) return;
  thead.innerHTML = '<th>ZIP</th><th>N</th><th>Composite</th><th>Housing</th><th>Food</th><th>Transport</th><th>Isolation</th><th>Stress</th>';

  function riskColor(v) { return v < 0.35 ? COLORS.ok : v < 0.55 ? COLORS.warn : COLORS.bad; }
  function riskCell(v) { return '<td><span class="sdoh-bar" style="width:' + Math.round(v * 60) + 'px;background:' + riskColor(v) + '"></span> ' + v.toFixed(2) + '</td>'; }

  tbody.innerHTML = sdohHeat.map(function(z) {
    var d = z.domains;
    return '<tr><td class="t-mono">' + z.zip + '</td><td>' + z.n_respondents + '</td>' +
      riskCell(z.composite_risk) + riskCell(d.housing) + riskCell(d.food) +
      riskCell(d.transportation) + riskCell(d.social_isolation) + riskCell(d.stress) + '</tr>';
  }).join("");
}

function renderDistanceChart(catchment) {
  var el = document.getElementById("geo-distance-chart");
  if (!el || !catchment) return;
  var rings = catchment.participants_by_ring || [];
  var canvas = el.querySelector("canvas");
  if (!canvas) { canvas = document.createElement("canvas"); el.appendChild(canvas); }
  if (CHARTS.geoDistance) { CHARTS.geoDistance.destroy(); }

  CHARTS.geoDistance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: rings.map(function(r) { return r.lower_km + "–" + r.ring_km + " km"; }),
      datasets: [{
        label: "Participants",
        data: rings.map(function(r) { return r.n; }),
        backgroundColor: rings.map(function(r, i) { return i === 0 ? COLORS.accent : "rgba(58,118,254," + (0.7 - i * 0.15) + ")"; }),
        borderRadius: 6,
        barPercentage: 0.7,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, grid: { color: COLORS.grid } }, x: { grid: { display: false } } },
      plugins: { legend: { display: false } },
    },
  });
}

function renderRetentionChart(catchment) {
  var el = document.getElementById("geo-retention-chart");
  if (!el || !catchment) return;
  var rings = catchment.participants_by_ring || [];
  var canvas = el.querySelector("canvas");
  if (!canvas) { canvas = document.createElement("canvas"); el.appendChild(canvas); }
  if (CHARTS.geoRetention) { CHARTS.geoRetention.destroy(); }

  CHARTS.geoRetention = new Chart(canvas, {
    type: "line",
    data: {
      labels: rings.map(function(r) { return r.lower_km + "–" + r.ring_km + " km"; }),
      datasets: [{
        label: "Mean Completeness %",
        data: rings.map(function(r) { return r.mean_completeness; }),
        borderColor: COLORS.TD,
        backgroundColor: "rgba(47,127,79,0.1)",
        fill: true, tension: 0.3, pointRadius: 5, pointBackgroundColor: COLORS.TD,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { min: 50, max: 100, grid: { color: COLORS.grid }, ticks: { callback: function(v) { return v + "%"; } } }, x: { grid: { display: false } } },
      plugins: { legend: { display: false } },
    },
  });
}

function initGeoTimeline(geo) {
  var timeline = geo.enrollment_geo_timeline;
  if (!timeline || !timeline.length) return;
  var playBtn = document.getElementById("geo-play-btn");
  var label = document.getElementById("geo-timeline-label");
  var fill = document.getElementById("geo-timeline-fill");
  var thumb = document.getElementById("geo-timeline-thumb");
  var track = document.getElementById("geo-timeline-track");
  if (!playBtn || !label || !fill || !thumb) return;

  function updateTimeline(idx) {
    var frame = timeline[idx];
    if (!frame) return;
    var pct = ((idx + 1) / timeline.length * 100).toFixed(1) + "%";
    label.textContent = frame.month_label;
    fill.style.width = pct;
    thumb.style.left = pct;
  }

  updateTimeline(0);
  GEO_STATE.timeline.index = 0;

  playBtn.addEventListener("click", function() {
    if (GEO_STATE.timeline.playing) {
      clearInterval(GEO_STATE.timeline.timer);
      GEO_STATE.timeline.playing = false;
      playBtn.textContent = "▶";
      playBtn.classList.remove("is-playing");
    } else {
      GEO_STATE.timeline.playing = true;
      playBtn.textContent = "⏸";
      playBtn.classList.add("is-playing");
      GEO_STATE.timeline.timer = setInterval(function() {
        GEO_STATE.timeline.index++;
        if (GEO_STATE.timeline.index >= timeline.length) {
          GEO_STATE.timeline.index = 0;
        }
        updateTimeline(GEO_STATE.timeline.index);
      }, 600);
    }
  });

  if (track) {
    track.addEventListener("click", function(e) {
      var rect = track.getBoundingClientRect();
      var ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      var idx = Math.round(ratio * (timeline.length - 1));
      GEO_STATE.timeline.index = idx;
      updateTimeline(idx);
    });
  }
}