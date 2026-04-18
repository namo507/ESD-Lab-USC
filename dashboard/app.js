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
  document.querySelectorAll(".card, .pipeline, .sync-card").forEach((element) => {
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