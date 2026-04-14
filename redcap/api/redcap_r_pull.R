#' Pull NANO Study REDCap Data using REDCapR
#'
#' Exports labeled longitudinal data from REDCap API.
#' Handles factor coding for all instruments.
#' API token must be set in environment variable REDCAP_API_TOKEN.
#'
#' @examples
#' \dontrun{
#'   source("redcap/api/redcap_r_pull.R")
#'   df <- pull_nano_redcap_data()
#' }

library(REDCapR)
library(tidyverse)
library(yaml)
library(here)

#' Load REDCap configuration from YAML
#'
#' @return List with api base_url and project settings
load_redcap_config <- function() {
  config_path <- here("config", "redcap_config.yml")
  if (!file.exists(config_path)) {
    stop("config/redcap_config.yml not found. Run from project root.")
  }
  yaml::read_yaml(config_path)
}

#' Get REDCap API credentials from environment
#'
#' @return Named list with url and token
get_redcap_credentials <- function() {
  api_url   <- Sys.getenv("REDCAP_API_URL")
  api_token <- Sys.getenv("REDCAP_API_TOKEN")

  if (nchar(api_url) == 0 || nchar(api_token) == 0) {
    stop(
      "REDCAP_API_TOKEN and REDCAP_API_URL must be set. ",
      "Copy .env.example -> .env and configure, then load with:\n",
      "  readRenviron('.env')"
    )
  }
  list(url = api_url, token = api_token)
}

#' Pull all NANO Study REDCap records
#'
#' Uses REDCapR::redcap_read() with chunked batches for large exports.
#' Returns labeled factor-coded data.
#'
#' @param events Character vector of event names to pull. NULL = all events.
#' @param fields Character vector of field names to pull. NULL = all fields.
#' @param batch_size Integer number of records per batch (default 500).
#' @return data.frame with all records, factor-coded categorical variables.
#' @export
pull_nano_redcap_data <- function(
    events    = NULL,
    fields    = NULL,
    batch_size = 500L
) {
  creds  <- get_redcap_credentials()
  config <- load_redcap_config()

  message("Pulling REDCap records from: ", creds$url)

  result <- REDCapR::redcap_read(
    redcap_uri   = creds$url,
    token        = creds$token,
    events       = events,
    fields       = fields,
    batch_size   = batch_size,
    raw_or_label = "label",  # return labeled values for factors
    export_survey_fields = TRUE,
    export_data_access_groups = TRUE
  )

  if (!result$success) {
    stop("REDCap pull failed: ", result$status_message)
  }

  df <- result$data
  message(sprintf("Pulled %d records, %d columns.", nrow(df), ncol(df)))

  # Apply factor coding for known categorical variables
  df <- apply_factor_coding(df)

  df
}

#' Apply factor coding to REDCap categorical variables
#'
#' Converts character columns for known ordinal/nominal variables to
#' ordered or unordered R factors with correct levels.
#'
#' @param df data.frame from REDCap pull
#' @return data.frame with factor-coded columns
#' @export
apply_factor_coding <- function(df) {

  # Group assignment
  if ("group_code" %in% names(df)) {
    df$group_code <- factor(
      df$group_code,
      levels = c("ASIB", "PT", "TD"),
      ordered = FALSE
    )
  }

  # Sex
  if ("sex" %in% names(df)) {
    df$sex <- factor(df$sex, levels = c("Male", "Female", "Intersex/Other"))
  }

  # NICU morbidities (severity-ordered)
  if ("nicu_bpd" %in% names(df)) {
    df$nicu_bpd <- factor(
      df$nicu_bpd,
      levels = c("None", "Mild", "Moderate", "Severe"),
      ordered = TRUE
    )
  }

  if ("nicu_ivh_grade" %in% names(df)) {
    df$nicu_ivh_grade <- factor(
      df$nicu_ivh_grade,
      levels = c("None", "Grade I", "Grade II", "Grade III", "Grade IV"),
      ordered = TRUE
    )
  }

  if ("nicu_rop" %in% names(df)) {
    df$nicu_rop <- factor(
      df$nicu_rop,
      levels = c("None", "Stage 1", "Stage 2", "Stage 3+", "Treated"),
      ordered = TRUE
    )
  }

  # M-CHAT risk category
  if ("mchat_risk_category" %in% names(df)) {
    df$mchat_risk_category <- factor(
      df$mchat_risk_category,
      levels = c("Low Risk", "Medium Risk", "High Risk"),
      ordered = TRUE
    )
  }

  # Maternal education
  if ("maternal_education" %in% names(df)) {
    df$maternal_education <- factor(
      df$maternal_education,
      levels = c(
        "Less than HS", "HS/GED", "Some college",
        "Bachelor degree", "Graduate degree"
      ),
      ordered = TRUE
    )
  }

  # Insurance type
  if ("insurance_type" %in% names(df)) {
    df$insurance_type <- factor(
      df$insurance_type,
      levels = c("Private", "Medicaid", "CHIP", "Self-pay", "Other")
    )
  }

  # ECG quality flag
  if ("ecg_quality_flag" %in% names(df)) {
    df$ecg_quality_flag <- factor(
      df$ecg_quality_flag,
      levels = c(
        "Excellent (>90% valid)", "Good (80-90%)",
        "Marginal (70-80%)", "Rejected (<70%)"
      ),
      ordered = TRUE
    )
  }

  df
}

#' Export pulled data to secure storage path
#'
#' @param df data.frame to export
#' @param export_dir Character path to output directory (from config/paths.yml)
#' @param format Character one of "rds", "csv" (default "rds")
#' @return Invisible path to saved file
#' @export
export_redcap_data <- function(df, export_dir, format = "rds") {
  if (!dir.exists(export_dir)) {
    dir.create(export_dir, recursive = TRUE)
  }
  timestamp <- format(Sys.time(), "%Y%m%d_%H%M%S")
  filename  <- sprintf("redcap_export_%s.%s", timestamp, format)
  out_path  <- file.path(export_dir, filename)

  if (format == "rds") {
    saveRDS(df, out_path)
  } else if (format == "csv") {
    # NOTE: CSV excluded by .gitignore - only save to secure server path
    write.csv(df, out_path, row.names = FALSE)
  } else {
    stop("Unsupported format: ", format)
  }

  message("Exported ", nrow(df), " records to: ", out_path)
  invisible(out_path)
}

# ─── Main execution (if run directly) ────────────────────────────────────────

if (!interactive()) {
  # Load .env if present
  env_file <- here(".env")
  if (file.exists(env_file)) readRenviron(env_file)

  cfg       <- load_redcap_config()
  paths_cfg <- yaml::read_yaml(here("config", "paths.yml"))

  df <- pull_nano_redcap_data()

  # Substitute env var for export path
  export_dir <- gsub(
    "\\$\\{NANO_DATA_ROOT\\}",
    Sys.getenv("NANO_DATA_ROOT"),
    paths_cfg$redcap$export_dir
  )

  export_redcap_data(df, export_dir, format = "rds")
}
