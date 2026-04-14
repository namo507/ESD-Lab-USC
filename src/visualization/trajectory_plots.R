#' Trajectory Plots for NANO Study HDA Features
#'
#' Publication-quality ggplot2 visualisations of individual and group-mean
#' trajectories of heart-rate-derived (HDA) features. Uses USC brand colours.
#'
#' @author NANO Study Team

library(ggplot2)
library(dplyr)
library(tidyr)
library(here)
library(lavaan)

# ── Theme + palette ────────────────────────────────────────────────────────────

USC_GARNET <- "#73000a"
USC_GOLD   <- "#ffcc00"
USC_GREY   <- "#7c7c7c"

USC_PALETTE <- c(ASIB = USC_GARNET, PT = USC_GOLD, TD = USC_GREY)

.nano_theme <- function() {
  ggplot2::theme_bw(base_size = 12) +
    ggplot2::theme(
      panel.grid.minor   = element_blank(),
      strip.background   = element_rect(fill = "#f5f5f5", colour = "grey70"),
      legend.position    = "bottom",
      legend.title       = element_text(face = "bold"),
      axis.title         = element_text(face = "bold"),
      plot.title         = element_text(face = "bold", hjust = 0.5),
      plot.caption       = element_text(colour = "grey50", size = 8)
    )
}

.save_figure <- function(p, output_path, width = 8, height = 5) {
  if (!is.null(output_path)) {
    dir.create(dirname(output_path), recursive = TRUE, showWarnings = FALSE)
    ggplot2::ggsave(output_path, plot = p, width = width, height = height,
                    dpi = 300, bg = "white")
    message("Figure saved to: ", output_path)
  }
  invisible(p)
}

# ── Plots ──────────────────────────────────────────────────────────────────────

#' Spaghetti Plot of Individual + Mean Trajectories
#'
#' Draws thin lines for each participant overlaid with a thicker group-mean
#' trajectory. Useful for visualising individual variability around the
#' group average.
#'
#' @param df A long-format data.frame.
#' @param dv Character. Name of the dependent variable column.
#' @param time_var Character. Name of the time column. Default \code{"month"}.
#' @param id_var Character. Participant identifier column.
#'   Default \code{"participant_id"}.
#' @param group_var Character. Grouping variable column.
#'   Default \code{"group_code"}.
#' @param output_path Character or \code{NULL}. If supplied, the plot is saved
#'   to this path (relative or absolute). Defaults to
#'   \code{here("reports/figures/<dv>_spaghetti.png")}.
#'
#' @return A \code{ggplot} object (invisibly if saved).
#'
#' @examples
#' \dontrun{
#' p <- plot_individual_trajectories(df_long, dv = "rmssd_log")
#' print(p)
#' }
#'
#' @export
plot_individual_trajectories <- function(df,
                                         dv,
                                         time_var    = "month",
                                         id_var      = "participant_id",
                                         group_var   = "group_code",
                                         output_path = NULL) {
  stopifnot(all(c(dv, time_var, id_var, group_var) %in% names(df)))

  if (is.null(output_path)) {
    output_path <- here::here("reports", "figures",
                              paste0(dv, "_spaghetti.png"))
  }

  df_mean <- df |>
    dplyr::group_by(.data[[time_var]], .data[[group_var]]) |>
    dplyr::summarise(mean_val = mean(.data[[dv]], na.rm = TRUE),
                     .groups = "drop")

  p <- ggplot2::ggplot(df,
      ggplot2::aes(x      = .data[[time_var]],
                   y      = .data[[dv]],
                   group  = .data[[id_var]],
                   colour = .data[[group_var]])) +
    ggplot2::geom_line(alpha = 0.25, linewidth = 0.4) +
    ggplot2::geom_line(
      data    = df_mean,
      mapping = ggplot2::aes(x      = .data[[time_var]],
                             y      = mean_val,
                             colour = .data[[group_var]],
                             group  = .data[[group_var]]),
      inherit.aes = FALSE,
      linewidth   = 1.4
    ) +
    ggplot2::facet_wrap(stats::as.formula(paste0("~", group_var))) +
    ggplot2::scale_colour_manual(values = USC_PALETTE, name = "Group") +
    ggplot2::labs(
      title   = paste("Individual Trajectories —", dv),
      x       = tools::toTitleCase(gsub("_", " ", time_var)),
      y       = dv,
      caption = "Thin lines: individuals; thick lines: group mean"
    ) +
    .nano_theme()

  .save_figure(p, output_path)
  p
}


#' Group Mean Trajectory Plot with Confidence Bands
#'
#' Plots group-mean trajectories with shaded 95 \% confidence intervals derived
#' from the standard error of the mean. Designed for publication use.
#'
#' @param df A long-format data.frame.
#' @param dv Character. Name of the dependent variable.
#' @param time_var Character. Time variable name. Default \code{"month"}.
#' @param group_var Character. Group variable name. Default \code{"group_code"}.
#' @param output_path Character or \code{NULL}. Save path. Defaults to
#'   \code{here("reports/figures/<dv>_group_means.png")}.
#'
#' @return A \code{ggplot} object.
#'
#' @examples
#' \dontrun{
#' p <- plot_group_mean_trajectories(df_long, dv = "sdnn_log")
#' }
#'
#' @export
plot_group_mean_trajectories <- function(df,
                                         dv,
                                         time_var    = "month",
                                         group_var   = "group_code",
                                         output_path = NULL) {
  stopifnot(all(c(dv, time_var, group_var) %in% names(df)))

  if (is.null(output_path)) {
    output_path <- here::here("reports", "figures",
                              paste0(dv, "_group_means.png"))
  }

  df_sum <- df |>
    dplyr::group_by(.data[[time_var]], .data[[group_var]]) |>
    dplyr::summarise(
      mean_val = mean(.data[[dv]], na.rm = TRUE),
      se       = stats::sd(.data[[dv]], na.rm = TRUE) /
                   sqrt(sum(!is.na(.data[[dv]]))),
      .groups  = "drop"
    ) |>
    dplyr::mutate(
      ci_lo = mean_val - 1.96 * se,
      ci_hi = mean_val + 1.96 * se
    )

  p <- ggplot2::ggplot(df_sum,
      ggplot2::aes(x      = .data[[time_var]],
                   y      = mean_val,
                   colour = .data[[group_var]],
                   fill   = .data[[group_var]],
                   group  = .data[[group_var]])) +
    ggplot2::geom_ribbon(ggplot2::aes(ymin = ci_lo, ymax = ci_hi),
                         alpha = 0.15, colour = NA) +
    ggplot2::geom_line(linewidth = 1.1) +
    ggplot2::geom_point(size = 2.5) +
    ggplot2::scale_colour_manual(values = USC_PALETTE, name = "Group") +
    ggplot2::scale_fill_manual(values   = USC_PALETTE, name = "Group") +
    ggplot2::labs(
      title   = paste("Group Mean Trajectories —", dv),
      x       = tools::toTitleCase(gsub("_", " ", time_var)),
      y       = paste0("Mean ", dv),
      caption = "Shaded bands: 95 % CI (±1.96 SE)"
    ) +
    .nano_theme()

  .save_figure(p, output_path)
  p
}


#' Plot Model-Implied Trajectories from a Lavaan LGCM Fit
#'
#' Extracts the latent intercept and slope means from a fitted \code{lavaan}
#' LGCM and draws the implied trajectory for each group (multigroup model)
#' or overall (single-group model).
#'
#' @param lgcm_fit A fitted \code{lavaan} object (from \code{lavaan::growth}).
#' @param time_points Numeric vector of time-point values used as x-axis
#'   coordinates (must match the slope loadings used during model fitting).
#' @param group_var Character or \code{NULL}. If the model was fitted as a
#'   multigroup model, supply the group variable name for faceting.
#'   Default \code{NULL}.
#' @param output_path Character or \code{NULL}. Save path.
#'
#' @return A \code{ggplot} object.
#'
#' @examples
#' \dontrun{
#' fit <- fit_linear_lgcm(df_wide, dv_cols = paste0("rmssd_t", 1:5))
#' p   <- plot_lgcm_implied_trajectories(fit, time_points = 0:4)
#' }
#'
#' @export
plot_lgcm_implied_trajectories <- function(lgcm_fit,
                                           time_points,
                                           group_var   = NULL,
                                           output_path = NULL) {
  stopifnot(inherits(lgcm_fit, "lavaan"), length(time_points) >= 2L)

  if (is.null(output_path)) {
    output_path <- here::here("reports", "figures", "lgcm_implied_trajectories.png")
  }

  pe <- lavaan::parameterEstimates(lgcm_fit)

  if (!is.null(group_var) && "group" %in% names(pe)) {
    means_df <- pe |>
      dplyr::filter(op == "~1", lhs %in% c("i", "s")) |>
      dplyr::select(group, lhs, est) |>
      tidyr::pivot_wider(names_from = lhs, values_from = est) |>
      dplyr::rename(intercept = i, slope = s)
  } else {
    means_df <- pe |>
      dplyr::filter(op == "~1", lhs %in% c("i", "s")) |>
      dplyr::select(lhs, est) |>
      tidyr::pivot_wider(names_from = lhs, values_from = est) |>
      dplyr::rename(intercept = i, slope = s) |>
      dplyr::mutate(group = "Overall")
  }

  traj_df <- means_df |>
    dplyr::rowwise() |>
    dplyr::reframe(
      time     = time_points,
      y_hat    = intercept + slope * time_points,
      group    = group
    )

  p <- ggplot2::ggplot(traj_df,
      ggplot2::aes(x      = time,
                   y      = y_hat,
                   colour = group,
                   group  = group)) +
    ggplot2::geom_line(linewidth = 1.2) +
    ggplot2::geom_point(size = 2.8) +
    ggplot2::scale_colour_manual(values = USC_PALETTE,
                                 name   = ifelse(is.null(group_var), "Group", group_var)) +
    ggplot2::labs(
      title = "LGCM Model-Implied Trajectories",
      x     = "Time",
      y     = "Predicted Value"
    ) +
    .nano_theme()

  .save_figure(p, output_path)
  p
}
