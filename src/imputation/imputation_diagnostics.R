#' MICE Convergence and Imputation Diagnostics
#'
#' Functions for assessing convergence of the MICE Gibbs sampler and for
#' comparing distributions of imputed vs. observed values. Also provides a
#' formal test of the Missing at Random (MAR) assumption via logistic
#' regression.
#'
#' @author NANO Study Team

library(mice)
library(ggplot2)
library(dplyr)
library(tidyr)
library(here)

# ── Internal helpers ───────────────────────────────────────────────────────────

.save_fig <- function(p, path, width = 9, height = 6) {
  if (!is.null(path)) {
    dir.create(dirname(path), recursive = TRUE, showWarnings = FALSE)
    ggplot2::ggsave(path, plot = p, width = width, height = height,
                    dpi = 300, bg = "white")
    message("Saved: ", path)
  }
  invisible(p)
}

.diag_theme <- function() {
  ggplot2::theme_bw(base_size = 11) +
    ggplot2::theme(
      strip.background  = element_rect(fill = "#f5f5f5"),
      panel.grid.minor  = element_blank(),
      legend.position   = "bottom"
    )
}

# ── Convergence ────────────────────────────────────────────────────────────────

#' Check MICE Convergence via Trace Plots
#'
#' Plots the mean and standard deviation of each imputed variable across MICE
#' iterations and imputation chains. Well-mixed, stationary traces indicate
#' convergence.
#'
#' @param mids_obj A \code{mids} object.
#' @param output_dir Character or \code{NULL}. Directory to save PNG files.
#'   If \code{NULL}, defaults to \code{here("reports/figures/mice_diagnostics")}.
#' @param vars Character vector of variable names to plot. If \code{NULL},
#'   plots all variables with at least one imputed value.
#'
#' @return A named list of \code{ggplot} objects, one per variable.
#'
#' @examples
#' \dontrun{
#' plots <- check_mice_convergence(mids_obj)
#' }
#'
#' @export
check_mice_convergence <- function(mids_obj,
                                   output_dir = NULL,
                                   vars       = NULL) {
  stopifnot(inherits(mids_obj, "mids"))

  if (is.null(output_dir)) {
    output_dir <- here::here("reports", "figures", "mice_diagnostics")
  }
  dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

  if (is.null(vars)) {
    vars <- names(mids_obj$method)[nchar(mids_obj$method) > 0L]
  }

  chain_data <- mice::complete(mids_obj, action = "long", include = FALSE)

  plot_list <- lapply(vars, function(v) {
    if (!v %in% names(chain_data)) return(NULL)

    stats_df <- chain_data |>
      dplyr::group_by(.imp) |>
      dplyr::summarise(
        mean_val = mean(.data[[v]], na.rm = TRUE),
        sd_val   = stats::sd(.data[[v]], na.rm = TRUE),
        .groups  = "drop"
      ) |>
      dplyr::mutate(iteration = .imp)

    long_df <- stats_df |>
      tidyr::pivot_longer(cols      = c(mean_val, sd_val),
                          names_to  = "statistic",
                          values_to = "value") |>
      dplyr::mutate(
        statistic = dplyr::recode(statistic,
                                  mean_val = "Mean", sd_val = "SD")
      )

    p <- ggplot2::ggplot(long_df,
        ggplot2::aes(x = iteration, y = value, colour = statistic,
                     group = statistic)) +
      ggplot2::geom_line(linewidth = 0.8) +
      ggplot2::geom_point(size = 1.5) +
      ggplot2::facet_wrap(~statistic, scales = "free_y", ncol = 2) +
      ggplot2::scale_colour_manual(values = c(Mean = "#73000a", SD = "#1f78b4"),
                                   guide  = "none") +
      ggplot2::labs(
        title = paste("Convergence Trace —", v),
        x     = "Imputation Index",
        y     = "Value"
      ) +
      .diag_theme()

    path <- file.path(output_dir, paste0("trace_", v, ".png"))
    .save_fig(p, path, width = 8, height = 4)
    p
  })

  names(plot_list) <- vars
  Filter(Negate(is.null), plot_list)
}


#' Density Plot: Imputed vs. Observed Distributions
#'
#' Overlays density curves for observed and imputed values of selected
#' variables. Marked deviations may indicate model misspecification.
#'
#' @param mids_obj A \code{mids} object.
#' @param vars Character vector. Variables to plot. If \code{NULL}, the first
#'   8 imputed variables are used.
#' @param output_dir Character or \code{NULL}. Directory to save plots.
#'
#' @return A named list of \code{ggplot} objects.
#'
#' @examples
#' \dontrun{
#' dens_plots <- plot_imputed_vs_observed(mids_obj, vars = c("rmssd", "sdnn"))
#' }
#'
#' @export
plot_imputed_vs_observed <- function(mids_obj,
                                     vars       = NULL,
                                     output_dir = NULL) {
  stopifnot(inherits(mids_obj, "mids"))

  if (is.null(output_dir)) {
    output_dir <- here::here("reports", "figures", "mice_diagnostics")
  }
  dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

  imputed_vars <- names(mids_obj$method)[nchar(mids_obj$method) > 0L]
  if (is.null(vars)) vars <- head(imputed_vars, 8L)

  orig_data <- mids_obj$data

  plot_list <- lapply(vars, function(v) {
    if (!v %in% names(orig_data) || !is.numeric(orig_data[[v]])) return(NULL)

    obs_vals <- orig_data[[v]][!is.na(orig_data[[v]])]

    imp_vals <- unlist(lapply(seq_len(mids_obj$m), function(i) {
      complete_i <- mice::complete(mids_obj, action = i)
      complete_i[[v]][is.na(orig_data[[v]])]
    }))

    dens_df <- dplyr::bind_rows(
      data.frame(value = obs_vals, source = "Observed"),
      data.frame(value = imp_vals, source = "Imputed")
    )

    p <- ggplot2::ggplot(dens_df,
        ggplot2::aes(x = value, fill = source, colour = source)) +
      ggplot2::geom_density(alpha = 0.35, linewidth = 0.7) +
      ggplot2::scale_fill_manual(
        values = c(Observed = "#7c7c7c", Imputed = "#73000a"),
        name   = "Source"
      ) +
      ggplot2::scale_colour_manual(
        values = c(Observed = "#7c7c7c", Imputed = "#73000a"),
        name   = "Source"
      ) +
      ggplot2::labs(
        title = paste("Imputed vs. Observed —", v),
        x     = v, y = "Density"
      ) +
      .diag_theme()

    path <- file.path(output_dir, paste0("density_", v, ".png"))
    .save_fig(p, path, width = 6, height = 4)
    p
  })

  names(plot_list) <- vars
  Filter(Negate(is.null), plot_list)
}


#' Test the MAR Assumption via Logistic Regression
#'
#' For each \code{target_col}, creates a binary missingness indicator
#' (\code{1} = missing) and regresses it on all observed predictors using
#' logistic regression. Significant predictors suggest the data may be MAR
#' (missing depends on observed values) rather than MCAR.
#'
#' @param df A data.frame.
#' @param target_col Character. Name of the target variable to test.
#' @param predictor_cols Character vector. Predictor columns to include.
#'   If \code{NULL}, all complete numeric columns (excluding \code{target_col})
#'   are used.
#'
#' @return A \code{data.frame} with columns \code{term}, \code{estimate},
#'   \code{std.error}, \code{statistic}, and \code{p.value} from the logistic
#'   regression.
#'
#' @examples
#' \dontrun{
#' mar_test <- test_mar_assumption(df_raw, target_col = "rmssd")
#' dplyr::filter(mar_test, p.value < 0.05)
#' }
#'
#' @export
test_mar_assumption <- function(df,
                                target_col,
                                predictor_cols = NULL) {
  stopifnot(is.data.frame(df), target_col %in% names(df))

  miss_indicator <- as.integer(is.na(df[[target_col]]))

  if (sum(miss_indicator) == 0L) {
    message("No missing values in '", target_col, "'; MAR test not applicable.")
    return(data.frame())
  }

  if (is.null(predictor_cols)) {
    predictor_cols <- names(df)[
      vapply(df, is.numeric, FUN.VALUE = logical(1)) &
        names(df) != target_col &
        colSums(is.na(df)) == 0L
    ]
  }

  if (length(predictor_cols) == 0L) {
    stop("No complete numeric predictors available for MAR test.")
  }

  mar_df         <- df[, predictor_cols, drop = FALSE]
  mar_df$missing <- miss_indicator

  frm <- stats::as.formula(
    paste("missing ~", paste(predictor_cols, collapse = " + "))
  )

  fit   <- glm(frm, data = mar_df, family = binomial())
  coef_tbl <- as.data.frame(summary(fit)$coefficients)

  data.frame(
    term      = rownames(coef_tbl),
    estimate  = coef_tbl[, 1],
    std.error = coef_tbl[, 2],
    statistic = coef_tbl[, 3],
    p.value   = coef_tbl[, 4],
    stringsAsFactors = FALSE
  )
}


#' Run All MICE Diagnostics in Sequence
#'
#' Convenience wrapper that calls \code{check_mice_convergence},
#' \code{plot_imputed_vs_observed}, and \code{test_mar_assumption} for all
#' imputed variables, writing outputs to \code{output_dir}.
#'
#' @param mids_obj A \code{mids} object.
#' @param df The original (pre-imputation) data.frame, used for MAR testing.
#' @param output_dir Character. Directory for saving all output files.
#'   Default \code{"reports/figures"}.
#'
#' @return A named list with elements \code{convergence_plots},
#'   \code{density_plots}, and \code{mar_results}.
#'
#' @examples
#' \dontrun{
#' diag <- run_all_diagnostics(mids_obj, df_prep)
#' }
#'
#' @export
run_all_diagnostics <- function(mids_obj,
                                df,
                                output_dir = "reports/figures") {
  stopifnot(inherits(mids_obj, "mids"), is.data.frame(df))

  diag_dir <- here::here(output_dir, "mice_diagnostics")

  message("=== MICE Diagnostics: Convergence Traces ===")
  conv_plots <- check_mice_convergence(mids_obj, output_dir = diag_dir)

  message("=== MICE Diagnostics: Imputed vs. Observed Densities ===")
  dens_plots <- plot_imputed_vs_observed(mids_obj, output_dir = diag_dir)

  imputed_vars <- names(mids_obj$method)[nchar(mids_obj$method) > 0L]
  message("=== MICE Diagnostics: MAR Tests ===")
  mar_results <- lapply(imputed_vars, function(v) {
    tryCatch(
      test_mar_assumption(df, target_col = v),
      error = function(e) {
        message("MAR test failed for '", v, "': ", conditionMessage(e))
        data.frame()
      }
    )
  })
  names(mar_results) <- imputed_vars

  list(
    convergence_plots = conv_plots,
    density_plots     = dens_plots,
    mar_results       = mar_results
  )
}
