#' Missing-Data Visualisations for the NANO Study
#'
#' Wrapper functions for \pkg{naniar} and \pkg{UpSetR} missing-data graphics,
#' plus a custom faceted bar-chart of missingness by group and event.
#'
#' @author NANO Study Team

library(naniar)
library(UpSetR)
library(ggplot2)
library(dplyr)
library(tidyr)
library(here)

# ── Internal helpers ───────────────────────────────────────────────────────────

.save_fig <- function(p, output_path, width = 9, height = 6) {
  if (!is.null(output_path)) {
    dir.create(dirname(output_path), recursive = TRUE, showWarnings = FALSE)
    ggplot2::ggsave(output_path, plot = p, width = width, height = height,
                    dpi = 300, bg = "white")
    message("Saved: ", output_path)
  }
  invisible(p)
}

.nano_theme_miss <- function() {
  ggplot2::theme_bw(base_size = 11) +
    ggplot2::theme(
      axis.text.x       = element_text(angle = 45, hjust = 1),
      legend.position   = "bottom",
      strip.background  = element_rect(fill = "#f5f5f5"),
      panel.grid.minor  = element_blank()
    )
}

# ── Functions ──────────────────────────────────────────────────────────────────

#' Heatmap of Missing Values via naniar::vis_miss
#'
#' Renders a column-level missingness heatmap with optional row clustering.
#' Columns are sorted by proportion missing (descending) by default.
#'
#' @param df A data.frame to visualise.
#' @param title Character. Plot title. Default \code{""}.
#' @param output_path Character or \code{NULL}. File path for saving.
#'   If \code{NULL}, defaults to \code{here("reports/figures/vis_miss.png")}.
#' @param cluster Logical. Whether to cluster rows. Default \code{FALSE}.
#' @param sort_miss Logical. Sort columns by missingness. Default \code{TRUE}.
#'
#' @return A \code{ggplot} object.
#'
#' @examples
#' \dontrun{
#' p <- plot_vis_miss(df_wide, title = "NANO Baseline Missingness")
#' }
#'
#' @export
plot_vis_miss <- function(df,
                          title       = "",
                          output_path = NULL,
                          cluster     = FALSE,
                          sort_miss   = TRUE) {
  stopifnot(is.data.frame(df))

  if (is.null(output_path)) {
    output_path <- here::here("reports", "figures", "vis_miss.png")
  }

  p <- naniar::vis_miss(df, cluster = cluster, sort_miss = sort_miss) +
    ggplot2::labs(title = title) +
    ggplot2::theme_bw(base_size = 11) +
    ggplot2::theme(
      axis.text.x      = element_text(angle = 60, hjust = 1, size = 8),
      plot.title       = element_text(face = "bold", hjust = 0.5),
      legend.position  = "bottom"
    )

  .save_fig(p, output_path, width = 11, height = 6)
  p
}


#' UpSet Plot of Missing-Data Patterns
#'
#' Converts a data.frame to a binary missingness indicator matrix and produces
#' an UpSet plot showing co-occurrence of missing values across variables.
#'
#' @param df A data.frame.
#' @param vars Character vector of variable names to include. If \code{NULL},
#'   all variables with any missingness are included (up to 15 variables).
#' @param output_path Character or \code{NULL}. If supplied, the plot is saved
#'   as a PNG via \code{grDevices::png}.
#'
#' @return Invisibly returns \code{NULL} (UpSetR draws to device directly).
#'
#' @examples
#' \dontrun{
#' plot_upset_missing(df_wide, vars = c("rmssd", "sdnn", "hf_power"))
#' }
#'
#' @export
plot_upset_missing <- function(df,
                               vars        = NULL,
                               output_path = NULL) {
  stopifnot(is.data.frame(df))

  if (is.null(output_path)) {
    output_path <- here::here("reports", "figures", "upset_missing.png")
  }

  if (is.null(vars)) {
    miss_cols <- names(df)[colSums(is.na(df)) > 0]
    vars <- head(miss_cols, 15L)
  }

  if (length(vars) == 0L) {
    message("No missing values found in selected variables.")
    return(invisible(NULL))
  }

  upset_data <- as.data.frame(
    lapply(df[, vars, drop = FALSE], function(x) as.integer(is.na(x)))
  )
  names(upset_data) <- vars

  if (!is.null(output_path)) {
    dir.create(dirname(output_path), recursive = TRUE, showWarnings = FALSE)
    grDevices::png(output_path, width = 2400, height = 1600, res = 200)
    on.exit(grDevices::dev.off(), add = TRUE)
  }

  UpSetR::upset(
    upset_data,
    sets            = vars,
    order.by        = "freq",
    decreasing      = TRUE,
    mainbar.y.label = "Intersection Size",
    sets.x.label    = "Variable Missing Count",
    text.scale      = c(1.4, 1.2, 1.2, 1.0, 1.2, 1.0),
    point.size      = 2.8,
    line.size       = 0.9,
    mb.ratio        = c(0.6, 0.4)
  )

  if (!is.null(output_path)) message("Saved: ", output_path)
  invisible(NULL)
}


#' Faceted Missingness Bar Charts by Group and Event
#'
#' Computes per-variable missingness proportions within each combination of
#' a grouping variable and an event/visit variable, then plots faceted bar
#' charts.
#'
#' @param df A data.frame in long or wide format containing grouping, event,
#'   and key variable columns.
#' @param group_var Character. Name of the group column (e.g.,
#'   \code{"group_code"}).
#' @param event_var Character. Name of the event/visit column (e.g.,
#'   \code{"redcap_event_name"}).
#' @param key_vars Character vector. Variable names to assess for missingness.
#' @param output_path Character or \code{NULL}. Save path. Defaults to
#'   \code{here("reports/figures/missing_by_group_event.png")}.
#'
#' @return A \code{ggplot} object.
#'
#' @examples
#' \dontrun{
#' p <- plot_missing_by_group_event(
#'   df, group_var = "group_code", event_var = "redcap_event_name",
#'   key_vars = c("rmssd", "sdnn", "hf_power", "ados_css")
#' )
#' }
#'
#' @export
plot_missing_by_group_event <- function(df,
                                        group_var,
                                        event_var,
                                        key_vars,
                                        output_path = NULL) {
  stopifnot(
    is.data.frame(df),
    all(c(group_var, event_var) %in% names(df)),
    length(key_vars) >= 1L
  )

  if (is.null(output_path)) {
    output_path <- here::here("reports", "figures", "missing_by_group_event.png")
  }

  miss_df <- df |>
    dplyr::select(dplyr::all_of(c(group_var, event_var, key_vars))) |>
    dplyr::group_by(.data[[group_var]], .data[[event_var]]) |>
    dplyr::summarise(
      dplyr::across(
        dplyr::all_of(key_vars),
        ~ mean(is.na(.x)) * 100,
        .names = "{.col}"
      ),
      n_obs = dplyr::n(),
      .groups = "drop"
    ) |>
    tidyr::pivot_longer(
      cols      = dplyr::all_of(key_vars),
      names_to  = "variable",
      values_to = "pct_missing"
    )

  p <- ggplot2::ggplot(miss_df,
      ggplot2::aes(x    = .data[["variable"]],
                   y    = pct_missing,
                   fill = .data[[group_var]])) +
    ggplot2::geom_col(position = "dodge", width = 0.7) +
    ggplot2::facet_wrap(
      stats::as.formula(paste0("~", event_var)),
      ncol = 3
    ) +
    ggplot2::scale_fill_manual(
      values = c(ASIB = "#73000a", PT = "#ffcc00", TD = "#7c7c7c"),
      name   = "Group"
    ) +
    ggplot2::scale_y_continuous(
      limits = c(0, 100),
      labels = function(x) paste0(x, "%")
    ) +
    ggplot2::labs(
      title = "Missingness by Group and Event",
      x     = "Variable",
      y     = "% Missing"
    ) +
    .nano_theme_miss()

  h <- ceiling(length(unique(miss_df[[event_var]])) / 3) * 2.8 + 2
  .save_fig(p, output_path, width = 12, height = max(h, 6))
  p
}
