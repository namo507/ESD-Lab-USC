#' NANO Study REDCap Missing Data Report
#'
#' Generates naniar-based missingness heatmaps and UpSet plots
#' showing missing data patterns by participant, group, and visit event.
#'
#' Requires: naniar, ggplot2, tidyverse
#' Output: PNG figures saved to reports/figures/
#'
#' Usage:
#'   Rscript redcap/quality_control/missing_data_report.R [--input <rds_path>]
#'
#' @examples
#' \dontrun{
#'   source("redcap/quality_control/missing_data_report.R")
#'   generate_missing_data_report()
#' }

library(naniar)
library(ggplot2)
library(tidyverse)
library(yaml)
library(here)

#' Load REDCap export from RDS file
#'
#' @param rds_path Character path to RDS file. If NULL, uses latest export.
#' @return data.frame with REDCap records
load_redcap_export <- function(rds_path = NULL) {
  if (is.null(rds_path)) {
    # Try to find latest export
    env_file <- here(".env")
    if (file.exists(env_file)) readRenviron(env_file)
    paths_cfg <- yaml::read_yaml(here("config", "paths.yml"))
    export_dir <- gsub(
      "\\$\\{NANO_DATA_ROOT\\}",
      Sys.getenv("NANO_DATA_ROOT"),
      paths_cfg$redcap$export_dir
    )
    rds_files <- list.files(export_dir, pattern = "*.rds", full.names = TRUE)
    if (length(rds_files) == 0) {
      stop("No REDCap export RDS files found in: ", export_dir)
    }
    rds_path <- rds_files[which.max(file.mtime(rds_files))]
    message("Using latest export: ", rds_path)
  }
  readRDS(rds_path)
}

#' Generate overall missingness heatmap using naniar::vis_miss
#'
#' @param df data.frame of REDCap records
#' @param output_dir Character path to save figures
#' @param max_cols Integer max number of columns to display (default 40)
#' @return Invisible path to saved figure
generate_vis_miss_plot <- function(df, output_dir, max_cols = 40L) {
  dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

  # Select non-admin, non-PHI columns for display
  phi_fields <- c("dob", "visit_date", "ecg_recording_date",
                  "temp_recording_date", "ados2_admin_date", "bayley4_admin_date")
  display_cols <- setdiff(names(df), c(phi_fields, "record_id", "redcap_event_name"))

  # Limit to max_cols for readability
  if (length(display_cols) > max_cols) {
    display_cols <- display_cols[seq_len(max_cols)]
  }

  df_plot <- df[, display_cols, drop = FALSE]

  p <- naniar::vis_miss(df_plot, cluster = TRUE) +
    ggplot2::labs(
      title = "NANO Study REDCap Missingness Heatmap",
      subtitle = paste0("n = ", nrow(df), " records"),
      caption = "PHI fields excluded. Clustered by missing pattern."
    ) +
    ggplot2::theme(
      axis.text.x = ggplot2::element_text(angle = 45, hjust = 1, size = 7),
      plot.title = ggplot2::element_text(color = "#73000a", face = "bold")
    )

  out_path <- file.path(output_dir, "missingness_heatmap.png")
  ggplot2::ggsave(out_path, plot = p, width = 14, height = 8, dpi = 150)
  message("Missingness heatmap saved to: ", out_path)
  invisible(out_path)
}

#' Generate UpSet plot of missing data patterns
#'
#' @param df data.frame of REDCap records
#' @param output_dir Character path to save figures
#' @param key_vars Character vector of variables to include in UpSet plot
#' @return Invisible path to saved figure
generate_upset_plot <- function(df, output_dir, key_vars = NULL) {
  if (is.null(key_vars)) {
    key_vars <- intersect(names(df), c(
      "ecg_duration_min", "temp_abdominal_start",
      "ados2_css_total", "bayley4_cog_composite",
      "nnns_attention", "mchat_total",
      "csbs_social", "epds_total", "prapare_food_insecurity"
    ))
  }
  key_vars <- key_vars[key_vars %in% names(df)]
  if (length(key_vars) < 2) {
    message("Not enough key variables for UpSet plot.")
    return(invisible(NULL))
  }

  p <- naniar::gg_miss_upset(df[, key_vars, drop = FALSE], nsets = length(key_vars)) +
    ggplot2::labs(
      title = "NANO Study: Missing Data Patterns (UpSet Plot)",
      caption = "Each bar = count of records with that combination of missing variables."
    )

  out_path <- file.path(output_dir, "missing_data_upset.png")
  ggplot2::ggsave(out_path, plot = p, width = 12, height = 7, dpi = 150)
  message("UpSet plot saved to: ", out_path)
  invisible(out_path)
}

#' Generate missingness summary by group and event
#'
#' @param df data.frame of REDCap records
#' @param output_dir Character path for figures
#' @return Invisible path to saved figure
generate_missingness_by_group <- function(df, output_dir) {
  if (!("group_code" %in% names(df) && "redcap_event_name" %in% names(df))) {
    message("group_code or redcap_event_name not found — skipping group plot.")
    return(invisible(NULL))
  }

  key_fields <- intersect(names(df), c(
    "ecg_duration_min", "bayley4_cog_composite", "ados2_css_total"
  ))
  if (length(key_fields) == 0) return(invisible(NULL))

  # Compute % missing per group per event
  miss_summary <- df %>%
    dplyr::group_by(group_code, redcap_event_name) %>%
    dplyr::summarise(
      pct_missing = mean(is.na(.data[[key_fields[1]]])) * 100,
      .groups = "drop"
    )

  p <- ggplot2::ggplot(
    miss_summary,
    ggplot2::aes(x = redcap_event_name, y = pct_missing, fill = group_code)
  ) +
    ggplot2::geom_col(position = "dodge") +
    ggplot2::scale_fill_manual(values = c("ASIB" = "#73000a", "PT" = "#007bbd", "TD" = "#28a745")) +
    ggplot2::labs(
      title = paste("% Missing:", key_fields[1], "by Group and Event"),
      x = "REDCap Event",
      y = "% Missing",
      fill = "Group"
    ) +
    ggplot2::theme_minimal() +
    ggplot2::theme(
      axis.text.x = ggplot2::element_text(angle = 45, hjust = 1),
      plot.title = ggplot2::element_text(color = "#73000a", face = "bold")
    )

  out_path <- file.path(output_dir, "missingness_by_group_event.png")
  ggplot2::ggsave(out_path, plot = p, width = 12, height = 6, dpi = 150)
  message("Group missingness plot saved to: ", out_path)
  invisible(out_path)
}

#' Main function: generate all missing data report figures
#'
#' @param rds_path Optional path to REDCap export RDS file
#' @param output_dir Directory for output figures
#' @export
generate_missing_data_report <- function(
    rds_path   = NULL,
    output_dir = here("reports", "figures")
) {
  df <- load_redcap_export(rds_path)
  message("Loaded ", nrow(df), " records, ", ncol(df), " variables.")

  generate_vis_miss_plot(df, output_dir)
  generate_upset_plot(df, output_dir)
  generate_missingness_by_group(df, output_dir)

  message("Missing data report complete. Figures in: ", output_dir)
}

# ─── Main execution ───────────────────────────────────────────────────────────

if (!interactive()) {
  args <- commandArgs(trailingOnly = TRUE)
  rds_path <- NULL
  for (i in seq_along(args)) {
    if (args[i] == "--input" && i < length(args)) rds_path <- args[i + 1]
  }
  generate_missing_data_report(rds_path = rds_path)
}
