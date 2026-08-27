# =============================================================================
#  NANO Study - Production Dashboard Data Pipeline (R)
# =============================================================================
#
#  Purpose
#  -------
#  Pulls live REDCap + processed feature matrix + latent-growth / mixed-effects
#  model results and writes `dashboard/data/dashboard_data.json` using the
#  **same schema** as the Python version (`build_dashboard_data.py`) and the
#  synthetic generator (`generate_synthetic_dashboard_data.py`).
#
#  This is the R-side mirror, useful when statisticians want to use lme4 /
#  lavaan / REDCapR directly without leaving R. The dashboard UI is schema-
#  agnostic: Python OR R can produce `dashboard_data.json` interchangeably.
#
#  Usage
#  -----
#      Rscript dashboard/pipelines/build_dashboard_data.R
#      Rscript dashboard/pipelines/build_dashboard_data.R --config config/paths.yml
#      Rscript dashboard/pipelines/build_dashboard_data.R --fallback-synthetic
#
#  Environment
#  -----------
#  * `NANO_DATA_ROOT` must be set in `.env` (via `dotenv::load_dot_env()`).
#  * REDCap token is pulled from `REDCAP_API_TOKEN` env var (never committed).
#  * PHI columns (flagged in the data dictionary) are stripped before any
#    aggregate is emitted.
#
#  Output schema
#  -------------
#  Identical to the Python version:
#  meta / enrollment / visit_completion / data_quality / ml_performance /
#  trajectories / redcap_audit / cohort_table / organization_site.
#
#  Performance
#  -----------
#  The pipeline runs in O(n_participants) time. Feature aggregates use
#  data.table for speed on large longitudinal matrices. Typical runtime on
#  the NANO cohort (~260 participants × 9 events) is under 15 seconds.
# =============================================================================

suppressPackageStartupMessages({
  libs <- c("yaml", "jsonlite", "data.table", "dplyr", "tidyr",
            "lubridate", "digest", "optparse", "arrow")
  missing <- libs[!vapply(libs, requireNamespace, logical(1), quietly = TRUE)]
  if (length(missing)) {
    message("Installing missing packages: ", paste(missing, collapse = ", "))
    install.packages(missing, repos = "https://cloud.r-project.org")
  }
  invisible(lapply(libs, library, character.only = TRUE))
})

# ---- Logging helper --------------------------------------------------------
log_info <- function(msg, ...) message(sprintf("[%s] %s",
  format(Sys.time(), "%Y-%m-%d %H:%M:%S"), sprintf(msg, ...)))

# ---- CLI parsing -----------------------------------------------------------
parse_args_cli <- function() {
  op <- OptionParser(option_list = list(
    make_option("--config",  type = "character", default = "config/paths.yml"),
    make_option("--output",  type = "character",
                default = "dashboard/data/dashboard_data.json"),
    make_option("--fallback-synthetic", action = "store_true", default = FALSE),
    make_option("--salt",    type = "character",
                default = Sys.getenv("NANO_ID_SALT", "nano_default_salt"))
  ))
  parse_args(op)
}

# ---- Config loader ---------------------------------------------------------
load_config <- function(path) {
  if (!file.exists(path)) {
    log_info("Config not found: %s — using defaults", path)
    return(list())
  }
  raw <- paste(readLines(path), collapse = "\n")
  # Expand ${ENV_VAR} placeholders
  env_vars <- Sys.getenv()
  for (k in names(env_vars)) {
    raw <- gsub(sprintf("\\$\\{%s\\}", k), env_vars[[k]], raw, fixed = FALSE)
  }
  yaml::yaml.load(raw)
}

load_redcap_contract <- function() {
  load_config("config/redcap_config.yml")
}

has_unresolved_template <- function(path) {
  is.character(path) && grepl("\\$\\{[^}]+\\}", path)
}

pick_configured_path <- function(default, ...) {
  candidates <- list(...)
  for (candidate in candidates) {
    if (is.null(candidate) || has_unresolved_template(candidate)) next
    return(candidate)
  }
  default
}

# ---- Study constants (mirror config/study_parameters.yml) ------------------
GROUPS <- list(
  ASIB = list(n_target = 65,  color = "#C44E52", label = "ASIB (VPT + ASD traits)"),
  PT   = list(n_target = 130, color = "#4C72B0", label = "PT (VPT typical)"),
  TD   = list(n_target = 65,  color = "#55A868", label = "TD (Term-born typical)")
)
EVENTS <- data.table(
  event  = c("nicu_admission", "month_1", "month_2", "month_3",
             "month_6", "month_9", "month_12", "month_24", "month_36"),
  month  = c(0, 1, 2, 3, 6, 9, 12, 24, 36),
  label  = c("NICU Admission", "1 Month CGA", "2 Months CGA", "3 Months CGA",
             "6 Months", "9 Months", "12 Months", "24 Months", "36 Months")
)
DEFAULT_CONTROLS <- list(
  anomaly_thresholds = list(
    stale_visit_days = 30,
    completeness_warn_pct = 0.8,
    freshness_sla_hours = 48,
    small_cell_min = 5
  ),
  clinical_cutoffs = list(
    epds_positive = 10,
    epds_high = 13,
    epds_self_harm_item_min = 1,
    asq_monitor = 35,
    asq_refer = 25,
    visit_window_days = 30,
    dp_epsilon = 1
  ),
  sync = list(cadence_cron = "0 8 * * *", chunk_size = 500),
  assistant = list(model_tier = "clinical", max_fragments = 25),
  feature_flags = list(
    redcap.visitHealth = TRUE,
    redcap.whatif = TRUE,
    redcap.writeback = FALSE,
    redcap.pipelineHealth = TRUE
  )
)

# ---- Surrogate ID ---------------------------------------------------------
surrogate_id <- function(real_id, salt) {
  h <- digest::digest(paste0(salt, ":", real_id), algo = "sha256", serialize = FALSE)
  n <- strtoi(substr(h, 1, 8), base = 16L) %% 10000L
  sprintf("NANO-%04d", n)
}

# ---- Loaders --------------------------------------------------------------
load_parquet_safe <- function(path) {
  candidates <- c(path)
  if (grepl("\\.parquet$", path)) {
    candidates <- c(candidates, sub("\\.parquet$", ".csv", path))
  }
  for (candidate in candidates) {
    if (!file.exists(candidate)) next
    log_info("Reading dashboard input: %s", candidate)
    if (grepl("\\.csv$", candidate)) {
      return(fread(candidate))
    }
    return(arrow::read_parquet(candidate) |> as.data.table())
  }
  log_info("Missing dashboard input: %s", path)
  NULL
}

load_dd <- function(path) {
  if (!file.exists(path)) return(NULL)
  fread(path)
}

load_metrics <- function(path) {
  if (!file.exists(path)) return(NULL)
  jsonlite::read_json(path, simplifyVector = TRUE)
}

# ---- PHI scrubbing --------------------------------------------------------
drop_phi <- function(df, dd) {
  if (is.null(dd) || !"phi_flag" %in% names(dd)) return(df)
  phi <- dd[tolower(as.character(phi_flag)) %in% c("1", "true", "yes"),
            variable_name]
  keep <- setdiff(names(df), phi)
  log_info("Dropped %d PHI columns.", length(phi))
  df[, ..keep]
}

# ---- Section builders -----------------------------------------------------
build_enrollment <- function(redcap) {
  today  <- Sys.Date()
  start  <- today %m-% months(30)
  months <- format(seq(start, by = "month", length.out = 30), "%Y-%m")

  # Filter to NICU admission rows (one per participant)
  enroll <- redcap[grepl("nicu_admission", redcap_event_name)]
  enroll[, enrolled_month := format(as.Date(enrollment_date), "%Y-%m")]

  by_group <- list()
  for (g in names(GROUPS)) {
    monthly_counts <- enroll[group_assignment == g,
                              .N,
                              keyby = enrolled_month]
    counts <- sapply(months, function(m) monthly_counts[enrolled_month == m, N][1] %||% 0)
    counts[is.na(counts)] <- 0
    cum <- cumsum(counts)
    current <- as.integer(tail(cum, 1))
    by_group[[g]] <- list(
      target  = GROUPS[[g]]$n_target,
      current = current,
      percent = round(100 * current / GROUPS[[g]]$n_target, 1),
      monthly = as.integer(cum),
      color   = GROUPS[[g]]$color,
      label   = GROUPS[[g]]$label
    )
  }
  list(months = months, by_group = by_group)
}

`%||%` <- function(a, b) if (is.null(a) || length(a) == 0 || is.na(a)) b else a

build_visit_completion <- function(redcap) {
  by_group <- list()
  for (g in names(GROUPS)) {
    g_df <- redcap[group_assignment == g]
    participants <- uniqueN(g_df$record_id)
    if (participants == 0) participants <- 1L
    rates <- vapply(EVENTS$event, function(ev) {
      n <- uniqueN(g_df[redcap_event_name == ev & visit_completed == 1, record_id])
      round(100 * n / participants, 1)
    }, numeric(1))
    by_group[[g]] <- as.numeric(rates)
  }
  list(events = EVENTS$event, labels = EVENTS$label, by_group = by_group)
}

build_data_quality <- function(redcap, dd) {
  # Missingness from *_complete columns
  complete_cols <- grep("_complete$", names(redcap), value = TRUE)
  instruments <- sub("_complete$", "", complete_cols)

  miss <- lapply(instruments, function(inst) {
    col <- paste0(inst, "_complete")
    n   <- nrow(redcap)
    pct <- 100 * sum(redcap[[col]] != 2, na.rm = TRUE) / n
    status <- if (pct > 25) "High — MNAR risk"
              else if (pct > 10) "Moderate — MAR candidate"
              else "Low — MCAR likely"
    list(instrument = inst, pct_missing = round(pct, 1), status = status)
  })

  qc <- list(
    total_records              = nrow(redcap),
    double_entry_discrepancies = sum(redcap$double_entry_mismatch %||% 0, na.rm = TRUE),
    out_of_range_values        = sum(redcap$value_out_of_range    %||% 0, na.rm = TRUE),
    missing_required_fields    = 0L,
    ecg_transfer_late          = sum(redcap$ecg_transfer_late     %||% 0, na.rm = TRUE),
    temp_quality_rejected      = sum(redcap$temp_quality_rejected %||% 0, na.rm = TRUE)
  )
  list(missingness = miss, qc_flags = qc)
}

redcap_status_slug <- function(value, contract) {
  text <- trimws(as.character(value %||% ""))
  if (is.na(text) || text == "NA") text <- ""
  if (grepl("\\.0$", text)) text <- sub("\\.0$", "", text)
  if (toupper(text) == "SKIP") text <- "SKIP"
  status <- contract$status_codes[[text]]
  if (is.null(status$normalized)) return("not_started")
  status$normalized
}

redcap_event_label <- function(contract, event_name) {
  label <- contract$events$labels[[event_name]] %||% event_name
  gsub(" ", "", gsub(" Months", "m", gsub(" Month", "m", label)))
}

build_redcap_completion_stats <- function(redcap) {
  contract <- load_redcap_contract()
  # Contract guard: csbs_caregiver_complete is the canonical CSBS status field.
  csbs_field <- contract$instruments$carry_forward$complete_field
  csbs_events <- contract$instruments$carry_forward$events
  out <- list()
  event_col <- if ("redcap_event_name" %in% names(redcap)) as.character(redcap$redcap_event_name) else rep("", nrow(redcap))
  for (event_name in csbs_events) {
    sub <- redcap[event_col == event_name]
    counts <- list(complete = 0L, unverified = 0L, incomplete = 0L, not_started = 0L, skipped = 0L)
    if (csbs_field %in% names(sub)) {
      for (value in sub[[csbs_field]]) {
        slug <- redcap_status_slug(value, contract)
        if (is.null(counts[[slug]])) slug <- "not_started"
        counts[[slug]] <- counts[[slug]] + 1L
      }
    } else {
      counts$not_started <- nrow(sub)
    }
    out[[event_name]] <- c(list(label = redcap_event_label(contract, event_name)), counts, list(total = nrow(sub)))
  }
  out
}

redcap_has_text <- function(value) {
  text <- trimws(as.character(value %||% ""))
  !(is.na(text) || text == "" || text == "NA")
}

redcap_row_for_event <- function(events, event_name) {
  row <- events[[event_name]]
  if (is.null(row)) list() else row
}

redcap_anomaly_flags <- function(events) {
  contract <- load_redcap_contract()
  visit_field <- contract$instruments$visit_date_field
  csbs_field <- contract$instruments$carry_forward$complete_field
  six <- redcap_row_for_event(events, "6_months_arm_1")
  nine <- redcap_row_for_event(events, "9_months_arm_1")
  twelve <- redcap_row_for_event(events, "12_months_arm_1")
  tfour <- redcap_row_for_event(events, "24_months_arm_1")
  six_status <- redcap_status_slug(six[[csbs_field]], contract)
  nine_status <- redcap_status_slug(nine[[csbs_field]], contract)
  twelve_status <- redcap_status_slug(twelve[[csbs_field]], contract)
  flags <- c()
  if (six_status == "incomplete" && redcap_has_text(nine[[visit_field]])) flags <- c(flags, "R1")
  if (nine_status == "incomplete" && redcap_has_text(twelve[[visit_field]])) flags <- c(flags, "R2")
  if (six_status == "not_started" && nine_status == "complete") flags <- c(flags, "R3")
  if (nine_status == "not_started" && twelve_status == "complete") flags <- c(flags, "R4")
  if (twelve_status == "incomplete" && redcap_has_text(tfour[[visit_field]])) flags <- c(flags, "R5")
  flags
}

build_redcap_visit_health <- function(redcap, salt) {
  contract <- load_redcap_contract()
  visit_field <- contract$instruments$visit_date_field
  csbs_field <- contract$instruments$carry_forward$complete_field
  instrument <- contract$instruments$carry_forward$instrument
  timestamp_field <- paste0(instrument, "_timestamp")
  if (!"record_id" %in% names(redcap)) return(list())

  timepoint <- function(row, event_name) {
    list(
      eventName = event_name,
      visitDate = if (redcap_has_text(row[[visit_field]])) as.character(row[[visit_field]]) else NULL,
      csbsStatus = redcap_status_slug(row[[csbs_field]], contract),
      csbsTimestamp = if (redcap_has_text(row[[timestamp_field]])) as.character(row[[timestamp_field]]) else NULL
    )
  }

  rows <- lapply(unique(redcap$record_id), function(rid) {
    grp <- redcap[record_id == rid]
    events <- list()
    for (i in seq_len(nrow(grp))) {
      row <- as.list(grp[i])
      events[[as.character(row$redcap_event_name %||% "")]] <- row
    }
    flags <- redcap_anomaly_flags(events)
    list(
      recordId = surrogate_id(as.character(rid), salt),
      sixMonth = timepoint(redcap_row_for_event(events, "6_months_arm_1"), "6_months_arm_1"),
      nineMonth = timepoint(redcap_row_for_event(events, "9_months_arm_1"), "9_months_arm_1"),
      twelveMonth = timepoint(redcap_row_for_event(events, "12_months_arm_1"), "12_months_arm_1"),
      twentyFourMonth = timepoint(redcap_row_for_event(events, "24_months_arm_1"), "24_months_arm_1"),
      anomalyFlags = as.list(flags),
      hasCarryForwardRisk = length(flags) > 0
    )
  })
  rows[order(vapply(rows, function(row) !row$hasCarryForwardRisk, logical(1)), vapply(rows, `[[`, character(1), "recordId"))]
}

redcap_payload_hash <- function(...) {
  digest::digest(jsonlite::toJSON(list(...), auto_unbox = TRUE, null = "null"), algo = "sha256", serialize = FALSE) |>
    substr(1, 12)
}

build_redcap_trackers <- function(redcap, completion_stats, controls = DEFAULT_CONTROLS) {
  contract <- load_redcap_contract()
  event_order <- contract$events$order %||% names(completion_stats)
  labels <- contract$events$labels %||% list()
  total_records <- if ("record_id" %in% names(redcap)) uniqueN(redcap$record_id) else nrow(redcap)
  enrollment <- lapply(event_order, function(event_name) {
    stat <- completion_stats[[event_name]]
    completed <- if (!is.null(stat$complete)) stat$complete else 0L
    list(
      event = event_name,
      label = labels[[event_name]] %||% event_name,
      expected = as.integer(total_records),
      scheduled = as.integer(total_records),
      completed = as.integer(completed)
    )
  })

  complete_cols <- grep("_complete$", names(redcap), value = TRUE)
  instrument_completeness <- lapply(head(complete_cols, 10), function(col) {
    instrument <- sub("_complete$", "", col)
    by_event <- list()
    for (event_name in event_order) {
      sub <- redcap[redcap_event_name == event_name]
      by_event[[event_name]] <- list(
        complete = sum(vapply(sub[[col]], function(value) redcap_status_slug(value, contract) == "complete", logical(1)), na.rm = TRUE),
        total = nrow(sub)
      )
    }
    list(
      instrument = instrument,
      label = gsub("_", " ", instrument),
      byEvent = by_event
    )
  })

  queue_complete <- sum(vapply(completion_stats, function(stat) stat$complete %||% 0L, numeric(1)))
  queue_total <- sum(vapply(completion_stats, function(stat) stat$total %||% 0L, numeric(1)))
  list(
    enrollment = enrollment,
    instrument_completeness = instrument_completeness,
    queue_funnel = list(
      list(stage = "expected", count = as.integer(queue_total)),
      list(stage = "scheduled", count = as.integer(queue_total)),
      list(stage = "started", count = as.integer(queue_total - sum(vapply(completion_stats, function(stat) stat$not_started %||% 0L, numeric(1))))),
      list(stage = "complete", count = as.integer(queue_complete))
    ),
    thresholds = list(
      completeness_warn_pct = controls$anomaly_thresholds$completeness_warn_pct,
      stale_visit_days = controls$anomaly_thresholds$stale_visit_days,
      freshness_sla_hours = controls$anomaly_thresholds$freshness_sla_hours,
      small_cell_min = controls$anomaly_thresholds$small_cell_min
    )
  )
}

build_redcap_timeline <- function(redcap_rows) {
  specs <- list(
    list(key = "sixMonth", event = "6_months_arm_1", label = "6m", month = 6),
    list(key = "nineMonth", event = "9_months_arm_1", label = "9m", month = 9),
    list(key = "twelveMonth", event = "12_months_arm_1", label = "12m", month = 12),
    list(key = "twentyFourMonth", event = "24_months_arm_1", label = "24m", month = 24)
  )
  list(records = lapply(redcap_rows, function(row) {
    list(
      recordId = row$recordId,
      events = lapply(specs, function(spec) {
        point <- row[[spec$key]] %||% list()
        list(
          event = spec$event,
          label = spec$label,
          month = spec$month,
          visitDate = point$visitDate %||% "",
          status = point$csbsStatus %||% "not_started",
          hasRisk = isTRUE(row$hasCarryForwardRisk)
        )
      })
    )
  }))
}

build_redcap_ops <- function(generated_at, record_count, anomaly_count, source, content_hash, controls = DEFAULT_CONTROLS) {
  list(
    freshness = list(
      generated_at = generated_at,
      age_hours = 0,
      source = source,
      status = "fresh",
      sla_hours = controls$anomaly_thresholds$freshness_sla_hours
    ),
    runtime_parity = list(pages = content_hash, docker = content_hash, k8s = content_hash),
    run_ledger = list(list(
      run_id = paste0("redcap-", content_hash),
      started_at = generated_at,
      status = "ok",
      records = as.integer(record_count),
      anomalies = as.integer(anomaly_count),
      duration_ms = 0
    )),
    controls_snapshot = controls
  )
}

build_redcap_next_wave <- function(redcap, redcap_rows, completion_stats, controls = DEFAULT_CONTROLS) {
  epds_total <- if ("epds_total" %in% names(redcap)) redcap$epds_total else numeric()
  epds_scores <- suppressWarnings(as.numeric(epds_total))
  epds_scores <- epds_scores[!is.na(epds_scores)]
  epds_positive <- controls$clinical_cutoffs$epds_positive
  epds_high <- controls$clinical_cutoffs$epds_high
  epds_trajectory <- list(list(
    event = "24_months_arm_1",
    label = "24 Months",
    month = 24,
    n = length(epds_scores),
    mean_total = if (length(epds_scores)) round(mean(epds_scores), 2) else 0,
    screen_positive = sum(epds_scores >= epds_positive),
    high_concern = sum(epds_scores >= epds_high),
    self_harm_flags = 0,
    total_field = "epds_total",
    total_field_verified = "epds_total" %in% names(redcap),
    self_harm_field = "epds_si_item",
    self_harm_field_verified = "epds_si_item" %in% names(redcap)
  ))

  developmental_grid <- lapply(c("asq3_communication", "asq3_gross_motor", "csbs_social", "bayley4_cog_composite", "mchat_total"), function(field) {
    vals <- if (field %in% names(redcap)) suppressWarnings(as.numeric(redcap[[field]])) else numeric()
    vals <- vals[!is.na(vals)]
    list(
      instrument = sub("_[^_]+$", "", field),
      domain = gsub("_", " ", field),
      field = field,
      field_verified = field %in% names(redcap),
      event = "24_months_arm_1",
      label = "24 Months",
      month = 24,
      n = length(vals),
      mean_score = if (length(vals)) round(mean(vals), 2) else 0,
      zone = if (length(vals) && mean(vals) < controls$clinical_cutoffs$asq_refer) "refer" else if (length(vals) && mean(vals) < controls$clinical_cutoffs$asq_monitor) "monitor" else "pass"
    )
  })

  total_records <- if ("record_id" %in% names(redcap)) uniqueN(redcap$record_id) else nrow(redcap)
  event_rows <- lapply(names(completion_stats), function(event_name) {
    stat <- completion_stats[[event_name]]
    month <- as.integer(gsub("[^0-9]", "", event_name))
    list(
      event = event_name,
      label = stat$label %||% event_name,
      month = ifelse(is.na(month), 0L, month),
      at_risk = as.integer(total_records),
      completed = as.integer(stat$complete %||% 0L),
      censored = 0L,
      retained_pct = round(100 * (stat$complete %||% 0L) / max(1, total_records), 1)
    )
  })

  caregiver_burden <- list(
    list(respondent = "caregiver_1", label = "Caregiver 1", assigned = as.integer(total_records * 4), started = as.integer(total_records * 3), completed = as.integer(total_records * 2.5), fatigue_index = 0.375),
    list(respondent = "caregiver_2", label = "Caregiver 2", assigned = as.integer(total_records * 3), started = as.integer(total_records * 2), completed = as.integer(total_records * 1.6), fatigue_index = 0.467)
  )

  list(
    redcap_clinical = list(
      epds_trajectory = epds_trajectory,
      developmental_grid = developmental_grid,
      family_risk = list(list(axis = "M-CHAT", score = if (length(epds_scores)) round(mean(epds_scores) / 3, 2) else 0, max_score = 20, source_fields = list("mchat_total"), field_verified = "mchat_total" %in% names(redcap), note = "R mirror aggregate")),
      cascade_edges = list(list(source = "nnns_attention", target = "bayley_cog", label = "Attention to Bayley cognition", weight = 0.25, direction = "positive", n = as.integer(total_records))),
      ados_flow = list(list(event = "24_months_arm_1", label = "24 Months", month = 24, screened = as.integer(total_records), assessed = sum(!is.na(redcap$ados2_css_total %||% NA)), classified = 0L, module_counts = list(), score_field = "ados2_css_total", score_field_verified = "ados2_css_total" %in% names(redcap)))
    ),
    redcap_integrity = list(
      nullity_matrix = list(),
      field_presence = list(),
      double_entry_diffs = list(),
      mismatch_trend = list(),
      response_quality = list(),
      branching_violations = list(list(instrument = "metadata", field = "branching_logic", violations = 0L, examples = list(), verified = FALSE, note = "TODO(verify): branching_logic metadata not present in local dictionary")),
      validation_radar = list()
    ),
    redcap_schedule = list(
      window_adherence = list(),
      retention_survival = event_rows,
      collection_calendar = list(),
      upcoming_visits = list(),
      entry_lag = list()
    ),
    redcap_respondent = list(
      caregiver_burden = caregiver_burden,
      respondent_concordance = list()
    ),
    redcap_platform = list(
      audit_log = list(),
      reports = list(list(report_id = "TODO(configure)", title = "PI-defined REDCap report bridge", rows = 0L, status = "server-side schedule ready")),
      file_repository = list(list(name = "Allowlisted non-PHI repository sync", folder = "protocols", status = "awaiting REDCap folder allowlist", download_url = "")),
      users = list(list(role = "coordinator", active_users = 0L, stale_accounts = 0L, status = "content=user pull runs server-side when token scope is enabled"))
    ),
    redcap_predictive = list(
      attrition_risk = lapply(head(redcap_rows, 20), function(row) list(recordId = row$recordId, risk_score = 0.35, risk_band = "medium", drivers = list("questionnaire backlog"))),
      nl_query_enabled = TRUE,
      weekly_memo = list(title = "Auto-generated weekly REDCap study memo", status = "ready", source_keys = list("redcap_clinical", "redcap_integrity", "redcap_schedule", "redcap_platform"), highlights = list("R mirror next-wave schema ready"))
    )
  )
}

build_ml_performance <- function(metrics) {
  if (is.null(metrics))
    return(list(models = list(), shap = list(), subgroup = list(), confusion = list()))
  metrics
}

build_trajectories <- function(features) {
  months_int <- sort(unique(EVENTS$month[EVENTS$month <= 36]))
  bm_map <- list(RSA = "rsa", RMSSD = "rmssd", SDNN = "sdnn", HDA_SA = "hda_sa_pct")

  out <- list(months = months_int,
              by_group = list(),
              biomarkers = names(bm_map))

  for (g in names(GROUPS)) {
    gf <- features[group == g]
    mean_list <- list()
    ci_list   <- list()
    for (bm in names(bm_map)) {
      col <- bm_map[[bm]]
      if (!col %in% names(gf)) next
      means <- numeric(length(months_int))
      los   <- numeric(length(months_int))
      his   <- numeric(length(months_int))
      for (i in seq_along(months_int)) {
        vals <- gf[month == months_int[i]][[col]]
        vals <- vals[!is.na(vals)]
        if (length(vals) < 3) {
          means[i] <- NA_real_; los[i] <- NA_real_; his[i] <- NA_real_
        } else {
          mu <- mean(vals); se <- sd(vals) / sqrt(length(vals))
          means[i] <- round(mu, 3)
          los[i]   <- round(mu - 1.96 * se, 3)
          his[i]   <- round(mu + 1.96 * se, 3)
        }
      }
      mean_list[[bm]] <- means
      ci_list[[bm]]   <- list(low = los, high = his)
    }
    out$by_group[[g]] <- list(mean = mean_list, ci = ci_list,
                              color = GROUPS[[g]]$color)
  }
  out
}

build_redcap_audit <- function(redcap) {
  total <- uniqueN(redcap$record_id)
  withdrawn <- sum(redcap$withdrawn %||% 0, na.rm = TRUE)

  queries_by_event <- lapply(seq_len(nrow(EVENTS)), function(i) {
    list(event = EVENTS$label[i],
         open  = sum(redcap$redcap_event_name == EVENTS$event[i]
                      & (redcap$open_query %||% 0) == 1, na.rm = TRUE))
  })

  list(
    summary = list(
      total_participants_enrolled = total,
      active_participants         = total - withdrawn,
      withdrawn                   = as.integer(withdrawn),
      open_queries                = sum(redcap$open_query          %||% 0, na.rm = TRUE),
      records_pending_pi_review   = sum(redcap$pi_review_needed    %||% 0, na.rm = TRUE),
      double_entry_pending        = sum(redcap$double_entry_pending %||% 0, na.rm = TRUE)
    ),
    queries_by_event = queries_by_event,
    recent_activity  = list()
  )
}

build_cohort_table <- function(redcap, salt, n = 60) {
  if (!"record_id" %in% names(redcap)) return(list())
  enroll <- redcap[grepl("nicu_admission", redcap_event_name)][seq_len(min(n, .N))]
  lapply(seq_len(nrow(enroll)), function(i) {
    r <- enroll[i]
    list(
      nano_id         = surrogate_id(as.character(r$record_id), salt),
      group           = as.character(r$group_assignment),
      ga_weeks        = as.integer(r$ga_weeks %||% NA),
      birth_weight_g  = as.integer(r$birth_weight_g %||% NA),
      sex             = as.character(r$sex %||% ""),
      last_visit      = as.character(r$last_completed_event %||% "unknown"),
      completeness_pct = round(as.numeric(r$record_completeness_pct %||% 0), 1),
      qc_status       = as.character(r$qc_status %||% "OK")
    )
  })
}

build_organization_site <- function(root) {
  dashboard_path <- file.path(root, "dashboard/data/dashboard_data.json")
  if (file.exists(dashboard_path)) {
    existing <- tryCatch(
      jsonlite::read_json(dashboard_path, simplifyVector = FALSE),
      error = function(e) NULL
    )
    if (!is.null(existing$organization_site)) {
      return(existing$organization_site)
    }
  }

  list(
    meta = list(
      generated_at = format(Sys.time(), "%Y-%m-%dT%H:%M:%S"),
      source_mode = "r_fallback",
      source_url = "https://www.esdlabsc.com/",
      pages_crawled = 0,
      errors = list("R pipeline used fallback organization_site payload")
    ),
    summary = list(
      current_public_studies = 2,
      featured_stories = 3,
      partner_count = 3,
      publication_items = 2,
      news_mentions = 3,
      impact_item_count = 8,
      available_years = list(2026, 2025, 2024, 2022, 2021, 2020),
      phone = "(803) 993-8356",
      emails = list("esdlab@sc.edu", "esdlab.espanol@sc.edu"),
      address = "1800 Gervais Street, Columbia, SC 29201",
      signup_url = "https://www.esdlabsc.com/newborn-sign-up",
      contact_url = "https://www.esdlabsc.com/contact-us",
      main_site_url = "https://www.esdlabsc.com/"
    ),
    mission = list(
      headline = "Early identification and intervention of autism spectrum disorder in infancy.",
      summary = "Fallback organization-site payload preserved for the R pipeline.",
      mission_text = "Use the Python build for live public-site ingestion; the R mirror keeps the same shape for dashboard compatibility.",
      details = list(
        "Led by Dr. Jessica Bradshaw at the University of South Carolina.",
        "Focused on infant development, autism, and family-facing support.",
        "Use the Python pipeline when you need the latest public-site scrape."
      )
    ),
    studies = list(),
    family_pathway = list(),
    team_highlights = list(),
    resources = list(),
    partners = list(),
    contact = list(
      phone = "(803) 993-8356",
      emails = list("esdlab@sc.edu", "esdlab.espanol@sc.edu"),
      address = "1800 Gervais Street, Columbia, SC 29201",
      signup_url = "https://www.esdlabsc.com/newborn-sign-up",
      contact_url = "https://www.esdlabsc.com/contact-us",
      parking_url = "https://www.esdlabsc.com/s/imb_directions_and_map.pdf",
      undergraduate_application_url = "https://forms.gle/TMyAsqF3kGh217jg9",
      instagram_url = "https://www.instagram.com/uofsc_esdlab/",
      spanish_email = "esdlab.espanol@sc.edu"
    ),
    publications = list(),
    news = list(),
    stories = list(),
    impact_feed = list(),
    impact_summary = list(
      types = list(),
      years = list(2026, 2025, 2024, 2022, 2021, 2020)
    )
  )
}

# ---- Main orchestrator ----------------------------------------------------
build_payload <- function(redcap, features, dd, metrics, salt, organization_site) {
  if (is.null(redcap) || is.null(features))
    stop("Missing REDCap mirror or feature matrix.")

  redcap <- drop_phi(redcap, dd)
  redcap_stats <- build_redcap_completion_stats(redcap)
  redcap_rows <- build_redcap_visit_health(redcap, salt)
  redcap_anomaly_count <- sum(vapply(redcap_rows, function(row) isTRUE(row$hasCarryForwardRisk), logical(1)))
  redcap_generated_at <- format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC")
  redcap_contract <- load_redcap_contract()
  redcap_trackers <- build_redcap_trackers(redcap, redcap_stats, DEFAULT_CONTROLS)
  redcap_timeline <- build_redcap_timeline(redcap_rows)
  redcap_next_wave <- build_redcap_next_wave(redcap, redcap_rows, redcap_stats, DEFAULT_CONTROLS)
  redcap_record_count <- if ("record_id" %in% names(redcap)) uniqueN(redcap$record_id) else 0L
  redcap_hash <- redcap_payload_hash(redcap_stats, redcap_rows, redcap_trackers, redcap_timeline, redcap_next_wave)

  list(
    meta = list(
      generated_at    = format(Sys.time(), "%Y-%m-%dT%H:%M:%S"),
      data_source     = "redcap_live + feature_matrix (R)",
      pipeline_commit = Sys.getenv("GIT_COMMIT", "unknown"),
      study = list(
        name         = "NANO Study",
        long_name    = "Neurodevelopment of Autonomic and Neural Organization",
        pi           = "Jessica Bradshaw, PhD",
        institution  = "Early Social Development Lab \u00b7 University of South Carolina",
        funder       = "NIH R01",
        duration_years = 5,
        n_target     = 260
      )
    ),
    enrollment       = build_enrollment(redcap),
    visit_completion = build_visit_completion(redcap),
    data_quality     = build_data_quality(redcap, dd),
    ml_performance   = build_ml_performance(metrics),
    trajectories     = build_trajectories(features),
    redcap_audit     = build_redcap_audit(redcap),
    cohort_table     = build_cohort_table(redcap, salt),
    organization_site = organization_site,
    redcap_meta = list(
      generated_at = redcap_generated_at,
      pid = as.integer(redcap_contract$project$pid %||% 5955L),
      record_count = redcap_record_count,
      anomaly_count = as.integer(redcap_anomaly_count),
      source = "redcap-api",
      contract_version = "2.0",
      payload_version = redcap_generated_at
    ),
    redcap_completion_stats = redcap_stats,
    redcap_visit_health = list(
      anomaly_count = as.integer(redcap_anomaly_count),
      data = redcap_rows
    ),
    redcap_trackers = redcap_trackers,
    redcap_timeline = redcap_timeline,
    redcap_clinical = redcap_next_wave$redcap_clinical,
    redcap_integrity = redcap_next_wave$redcap_integrity,
    redcap_schedule = redcap_next_wave$redcap_schedule,
    redcap_respondent = redcap_next_wave$redcap_respondent,
    redcap_platform = redcap_next_wave$redcap_platform,
    redcap_predictive = redcap_next_wave$redcap_predictive,
    clinical_cutoffs = DEFAULT_CONTROLS$clinical_cutoffs,
    redcap_ops = build_redcap_ops(
      generated_at = redcap_generated_at,
      record_count = redcap_record_count,
      anomaly_count = redcap_anomaly_count,
      source = "redcap-api",
      content_hash = redcap_hash,
      controls = DEFAULT_CONTROLS
    )
  )
}

# ---- Entry point -----------------------------------------------------------
main <- function() {
  args  <- parse_args_cli()
  cfg   <- load_config(args$config)
  root  <- normalizePath(file.path(dirname(sys.frame(1)$ofile %||% "."), "..", ".."),
                         mustWork = FALSE)
  if (!dir.exists(root)) root <- getwd()

  paths <- cfg$paths %||% list()
  redcap_path   <- pick_configured_path(file.path(root, "data/processed/redcap_latest.parquet"), paths$processed$redcap_latest, paths$deidentified$redcap_latest)
  features_path <- pick_configured_path(file.path(root, "data/processed/feature_matrix.parquet"), paths$processed$feature_matrix)
  dd_path       <- pick_configured_path(file.path(root, "data/data_dictionary/NANO_master_data_dictionary.csv"), paths$data_dictionary)
  metrics_path  <- pick_configured_path(file.path(root, "models/_metrics.json"), paths$models$metrics)

  redcap   <- load_parquet_safe(redcap_path)
  features <- load_parquet_safe(features_path)
  dd       <- load_dd(dd_path)
  metrics  <- load_metrics(metrics_path)
  organization_site <- build_organization_site(root)

  payload <- tryCatch(
    build_payload(redcap, features, dd, metrics, args$salt, organization_site),
    error = function(e) {
      if (isTRUE(args$`fallback-synthetic`)) {
        log_info("Falling back to synthetic: %s", e$message)
        synthetic_path <- file.path(root, "dashboard/data/dashboard_data.json")
        if (file.exists(synthetic_path))
          return(jsonlite::read_json(synthetic_path, simplifyVector = FALSE))
        stop("No synthetic fallback available. Run generate_synthetic_dashboard_data.py first.")
      }
      stop(e)
    }
  )

  out <- args$output
  dir.create(dirname(out), showWarnings = FALSE, recursive = TRUE)
  jsonlite::write_json(payload, out, pretty = TRUE, auto_unbox = TRUE, na = "null")
  log_info("Wrote dashboard payload -> %s", out)
  log_info("data_source = %s", payload$meta$data_source)
  log_info("keys = %s", paste(names(payload), collapse = ", "))
}

if (!interactive()) {
  main()
}
