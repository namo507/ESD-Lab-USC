const REFRESH_INTERVAL_MS = 20000;
const DATA_URLS = {
  dashboard: "data/dashboard_data.json",
  readings: "data/readings_data.json",
  runtime: "data/runtime_status.json",
};

const COLORS = {
  ASIB: "#c44e52",
  PT: "#4c72b0",
  TD: "#55a868",
  accent: "#6d1f1a",
  accentSoft: "#9d5240",
  models: ["#4c72b0", "#c44e52", "#55a868", "#dd8452", "#8172b3", "#937860"],
  ok: "#23633a",
  warn: "#8b6916",
  bad: "#9f3424",
  grid: "rgba(95, 72, 53, 0.12)",
};

const SECTION_TITLES = {
  overview: [
    "NANO Study · Research Dashboard",
    "R01 longitudinal cohort · VPT infants from NICU admission through 36 months",
  ],
  pipeline: [
    "Data Flow Pipeline",
    "Interactive map of how study signals move from collection through sharing",
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
  readings: [
    "Reading Library",
    "Automatically indexed lab PDFs and materials from the ESD Lab readings folder",
  ],
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
    ctx.strokeStyle = "#6b564a";
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
Chart.defaults.font.family = 'Manrope, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
Chart.defaults.font.size = 12;
Chart.defaults.color = "#5f554e";
Chart.defaults.animation.duration = 700;
Chart.defaults.animation.easing = "easeOutQuart";

const STATE = {
  dashboard: null,
  readings: emptyReadingsPayload(),
  runtime: {},
  tokens: {
    dashboard: null,
    readings: null,
    buildCount: 0,
  },
};

let CHARTS = {};
let nextRefreshAt = 0;
let controlsInitialized = false;
let COHORT_SORT = { col: "nano_id", dir: "asc" };
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
  decorateRevealTargets();
  setupNavigation();
  setupPipelineExplainers();
  setupControls();
  await syncData({ force: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncData();
    }
  });
  window.setInterval(() => {
    syncData();
  }, REFRESH_INTERVAL_MS);
  window.setInterval(updateRefreshCountdown, 1000);
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

function decorateRevealTargets() {
  document.querySelectorAll(".card, .pipeline, .sync-card, .section-jumpbar, .atlas-card").forEach((element) => {
    element.classList.add("reveal");
  });

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    { threshold: 0.18 }
  );

  document.querySelectorAll(".reveal").forEach((element) => {
    revealObserver.observe(element);
  });
}

function setupNavigation() {
  const navLinks = Array.from(document.querySelectorAll(".nav a[data-target]"));
  const sections = Array.from(document.querySelectorAll("main section[id]"));

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const target = document.getElementById(link.dataset.target);
      if (!target) {
        return;
      }
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
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

function setActiveSection(sectionId) {
  document.querySelectorAll(".nav a[data-target]").forEach((link) => {
    link.classList.toggle("active", link.dataset.target === sectionId);
  });
  const title = SECTION_TITLES[sectionId] || SECTION_TITLES.overview;
  document.getElementById("page-title").textContent = title[0];
  document.getElementById("page-sub").textContent = title[1];
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
}

function renderDashboard() {
  renderOverview();
  renderEnrollmentChart();
  renderProgressChart();
  renderQualitySection();
  renderMlSection();
  renderTrajectoryChart();
  renderTrajectoriesTable();
  renderCompletionChart();
  drawCohort();
}

function renderOverview() {
  const enrollment = STATE.dashboard.enrollment.by_group;
  const audit = STATE.dashboard.redcap_audit.summary;
  const total = enrollment.ASIB.current + enrollment.PT.current + enrollment.TD.current;
  const target = enrollment.ASIB.target + enrollment.PT.target + enrollment.TD.target;
  const pct = target ? ((total / target) * 100).toFixed(1) : "0.0";

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
  animateNumber("kpi-completeness", 100 - meanMissing, (value) => `${value.toFixed(1)}%`);
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
        `<tr><td>${escapeHtml(row.date)}</td><td>${escapeHtml(row.action)}</td><td><code>${escapeHtml(row.record_id)}</code></td><td>${escapeHtml(row.user)}</td></tr>`
    )
    .join("");
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

  upsertChart("shap", "chart-shap", {
    type: "bar",
    data: {
      labels: (ml.shap || []).map((feature) => feature.label),
      datasets: [
        {
          label: "SHAP importance",
          data: (ml.shap || []).map((feature) => feature.importance),
          backgroundColor: `${COLORS.accent}cc`,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, grid: { color: COLORS.grid } },
        y: { grid: { display: false } },
      },
    },
  });

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
        `<tr><td>${escapeHtml(row.subgroup)}</td><td>${escapeHtml(String(row.n))}</td><td>${Number(row.mean_auroc).toFixed(3)}</td><td>+/-${Number(row.sd).toFixed(3)}</td></tr>`
    )
    .join("");

  document.querySelector("#table-metrics tbody").innerHTML = models
    .slice()
    .sort((left, right) => right.auroc - left.auroc)
    .map(
      (row) => `
        <tr>
          <td><b>${escapeHtml(row.name)}</b></td>
          <td>${Number(row.auroc).toFixed(3)}</td>
          <td>[${row.auroc_ci[0]}-${row.auroc_ci[1]}]</td>
          <td>${Number(row.sensitivity).toFixed(3)}</td>
          <td>${Number(row.specificity).toFixed(3)}</td>
          <td>${Number(row.f1).toFixed(3)}</td>
        </tr>`
    )
    .join("");
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

  renderMlOutputMetrics(bestModel, ml.confusion || {});
  document.getElementById("ml-score-fill").style.width = `${Math.max(16, Number(bestModel.auroc) * 100)}%`;

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
        ? `${bestModel.auroc_ci[0]}-${bestModel.auroc_ci[1]}`
        : "—",
    },
  ];

  const confusionParts = ["tp", "fp", "tn", "fn"]
    .filter((key) => Number.isFinite(Number(confusion[key])))
    .map((key) => `${key.toUpperCase()} ${confusion[key]}`);
  if (confusionParts.length) {
    metrics.push({ label: "Confusion", value: confusionParts.join(" · ") });
  }

  document.getElementById("ml-output-metrics").innerHTML = metrics
    .map(
      (metric) => `
        <div class="ml-output-metric">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
        </div>`
    )
    .join("");
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

  root.style.setProperty(
    "--ml-progress",
    `${Math.max(10, ((safeIndex + 1) / ML_EXPLAINER.stages.length) * 100)}%`
  );

  document.querySelectorAll("#ml-stage-track .ml-stage-node").forEach((node, nodeIndex) => {
    node.classList.toggle("is-active", nodeIndex === safeIndex);
    node.classList.toggle("is-complete", nodeIndex < safeIndex);
  });

  setText("ml-stage-kicker", `Stage ${safeIndex + 1} of ${ML_EXPLAINER.stages.length}`);
  setText("ml-stage-title", stage.title);
  setText("ml-stage-body", stage.body);
  document.getElementById("ml-stage-evidence").innerHTML = (stage.evidence || [])
    .map((item) => `<span class="chip">${escapeHtml(item)}</span>`)
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
        return `<tr><td><span class="badge ${row.group.toLowerCase()}">${row.group}</span></td><td>${row.biomarker}</td><td>${Number(row.intercept).toFixed(2)}</td><td>${slopeLabel}</td></tr>`;
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

  document.querySelector("#table-cohort tbody").innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td><code>${escapeHtml(row.nano_id)}</code></td>
          <td><span class="badge ${String(row.group || "").toLowerCase()}">${escapeHtml(row.group)}</span></td>
          <td>${escapeHtml(String(row.ga_weeks ?? "-"))}</td>
          <td>${formatInt(row.birth_weight_g)}</td>
          <td>${escapeHtml(row.sex)}</td>
          <td>${escapeHtml(row.last_visit)}</td>
          <td>${Number(row.completeness_pct).toFixed(1)}%</td>
          <td><span class="badge ${row.qc_status === "OK" ? "ok" : "warn"}">${escapeHtml(row.qc_status)}</span></td>
        </tr>`
    )
    .join("");
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
        <article class="reading-card reveal is-visible ${item.is_recent ? "recent" : ""}">
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
            ${(item.keywords || []).map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("")}
          </div>
          <div class="reading-actions">
            <a class="reading-link" href="${item.relative_href}" target="_blank" rel="noreferrer">Open material</a>
            <span>${escapeHtml(item.relative_path)}</span>
          </div>
        </article>`
    )
    .join("");
}

function renderFooter() {
  const dashboardMeta = (STATE.dashboard && STATE.dashboard.meta) || {};
  const readings = STATE.readings.summary || {};
  const metadataMode = STATE.readings.meta && STATE.readings.meta.pdf_metadata_enabled
    ? "PDF-aware indexing"
    : "filename-only indexing";
  document.getElementById("footer-left").textContent = `${dashboardMeta.data_source || "dashboard"} · ${formatInt(readings.total_readings || 0)} indexed readings · ${formatInt(readings.total_pages || 0)} pages scanned · ${metadataMode} · no PHI rendered in the web surface`;
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