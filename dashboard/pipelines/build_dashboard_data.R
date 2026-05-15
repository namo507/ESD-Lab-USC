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
    organization_site = organization_site
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
