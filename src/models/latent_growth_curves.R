#' Latent Growth Curve Models for NANO Study HDA Trajectories
#'
#' Fits linear, quadratic, and multi-group Latent Growth Curve Models (LGCMs)
#' using \pkg{lavaan}. Includes a simulation-based power analysis function.
#'
#' @author NANO Study Team

library(lavaan)
library(semTools)
library(tidyverse)

# ── Internal helpers ──────────────────────────────────────────────────────────

.build_linear_syntax <- function(dv_cols, time_loadings) {
  k <- length(dv_cols)
  if (is.null(time_loadings)) time_loadings <- seq(0, k - 1L)
  stopifnot(length(time_loadings) == k)

  intercept_items <- paste(dv_cols, collapse = " + ")
  slope_items     <- paste(
    mapply(function(lam, v) paste0(lam, "*", v), time_loadings, dv_cols),
    collapse = " + "
  )

  paste0(
    "i =~ 1*", intercept_items, "\n",
    "s =~ ", slope_items, "\n",
    "i ~~ i\n",
    "s ~~ s\n",
    "i ~~ s\n",
    "i ~ 1\n",
    "s ~ 1\n"
  )
}

.build_quadratic_syntax <- function(dv_cols) {
  k  <- length(dv_cols)
  t  <- seq(0, k - 1L)
  t2 <- t^2

  intercept_items  <- paste(dv_cols, collapse = " + ")
  slope_items      <- paste(mapply(function(l, v) paste0(l, "*", v), t,  dv_cols), collapse = " + ")
  quad_items       <- paste(mapply(function(l, v) paste0(l, "*", v), t2, dv_cols), collapse = " + ")

  paste0(
    "i  =~ 1*", intercept_items, "\n",
    "s  =~ ", slope_items, "\n",
    "q  =~ ", quad_items, "\n",
    "i ~~ i\n  s ~~ s\n  q ~~ q\n",
    "i ~~ s\n  i ~~ q\n  s ~~ q\n",
    "i ~ 1\n  s ~ 1\n  q ~ 1\n"
  )
}

# ── Model fitting ─────────────────────────────────────────────────────────────

#' Fit a Linear Latent Growth Curve Model
#'
#' Estimates a linear LGCM with latent intercept and slope factors using
#' \code{lavaan::growth}. Time loadings can be fixed (default: 0, 1, 2, …) or
#' user-supplied (e.g., actual age values).
#'
#' @param df A data.frame in wide format where each column in \code{dv_cols}
#'   corresponds to one measurement occasion.
#' @param dv_cols Character vector of column names representing the repeated
#'   measurements of the dependent variable (ordered by time).
#' @param time_loadings Numeric vector of length \code{length(dv_cols)}
#'   specifying the slope factor loadings. If \code{NULL}, defaults to
#'   \code{0, 1, 2, \ldots}
#'
#' @return A fitted \code{lavaan} object.
#'
#' @examples
#' \dontrun{
#' fit <- fit_linear_lgcm(df_wide, dv_cols = c("rmssd_t1", "rmssd_t2", "rmssd_t3"))
#' summary(fit, fit.measures = TRUE)
#' }
#'
#' @export
fit_linear_lgcm <- function(df, dv_cols, time_loadings = NULL) {
  stopifnot(is.data.frame(df), length(dv_cols) >= 3L)
  syntax <- .build_linear_syntax(dv_cols, time_loadings)
  lavaan::growth(syntax, data = df, estimator = "MLR", missing = "FIML")
}


#' Fit a Quadratic Latent Growth Curve Model
#'
#' Extends the linear LGCM with a quadratic growth factor, allowing for
#' nonlinear (curvilinear) change trajectories. Time loadings for the slope
#' are fixed to \code{0, 1, 2, \ldots} and for the quadratic factor to
#' \code{0, 1, 4, \ldots}
#'
#' @param df A wide-format data.frame.
#' @param dv_cols Character vector of repeated-measures column names (ordered).
#'
#' @return A fitted \code{lavaan} object.
#'
#' @examples
#' \dontrun{
#' fit_q <- fit_quadratic_lgcm(df_wide, dv_cols = paste0("sdnn_t", 1:5))
#' }
#'
#' @export
fit_quadratic_lgcm <- function(df, dv_cols) {
  stopifnot(is.data.frame(df), length(dv_cols) >= 4L)
  syntax <- .build_quadratic_syntax(dv_cols)
  lavaan::growth(syntax, data = df, estimator = "MLR", missing = "FIML")
}


#' Fit a Multigroup Latent Growth Curve Model
#'
#' Estimates a multigroup LGCM across diagnostic groups (e.g., ASIB, PT, TD),
#' enabling tests of configural, metric, and scalar invariance of growth
#' parameters.
#'
#' @param df A wide-format data.frame that includes a grouping column.
#' @param dv_cols Character vector of repeated-measures column names.
#' @param group_var Character. Name of the grouping column.
#'   Default \code{"group_code"}.
#'
#' @return A named list with elements \code{configural}, \code{metric}, and
#'   \code{scalar}, each a fitted \code{lavaan} object, plus
#'   \code{invariance_test} (output of \code{semTools::compareFit}).
#'
#' @examples
#' \dontrun{
#' mg <- fit_multigroup_lgcm(df_wide, dv_cols = c("hf_t1","hf_t2","hf_t3"),
#'                            group_var = "group_code")
#' mg$invariance_test
#' }
#'
#' @export
fit_multigroup_lgcm <- function(df, dv_cols, group_var = "group_code") {
  stopifnot(is.data.frame(df), group_var %in% names(df), length(dv_cols) >= 3L)

  syntax <- .build_linear_syntax(dv_cols, NULL)

  fit_configural <- lavaan::growth(syntax, data = df, group = group_var,
                                   estimator = "MLR", missing = "FIML")
  fit_metric     <- lavaan::growth(syntax, data = df, group = group_var,
                                   group.equal = c("loadings"),
                                   estimator = "MLR", missing = "FIML")
  fit_scalar     <- lavaan::growth(syntax, data = df, group = group_var,
                                   group.equal = c("loadings", "intercepts"),
                                   estimator = "MLR", missing = "FIML")

  inv_test <- semTools::compareFit(fit_configural, fit_metric, fit_scalar)

  list(
    configural       = fit_configural,
    metric           = fit_metric,
    scalar           = fit_scalar,
    invariance_test  = inv_test
  )
}


#' Extract Fit Indices from a Lavaan LGCM
#'
#' Returns a one-row data.frame with commonly reported SEM fit statistics:
#' chi-square, degrees of freedom, p-value, RMSEA (and 90 \% CI), CFI, TLI,
#' and SRMR.
#'
#' @param fit A fitted \code{lavaan} object.
#'
#' @return A \code{data.frame} with columns \code{chi_sq}, \code{df},
#'   \code{p_value}, \code{rmsea}, \code{rmsea_ci_lower},
#'   \code{rmsea_ci_upper}, \code{cfi}, \code{tli}, \code{srmr}.
#'
#' @examples
#' \dontrun{
#' idx <- extract_lgcm_fit_indices(fit_q)
#' idx
#' }
#'
#' @export
extract_lgcm_fit_indices <- function(fit) {
  fm <- lavaan::fitMeasures(fit, c(
    "chisq", "df", "pvalue",
    "rmsea", "rmsea.ci.lower", "rmsea.ci.upper",
    "cfi", "tli", "srmr"
  ))

  data.frame(
    chi_sq          = unname(fm["chisq"]),
    df              = unname(fm["df"]),
    p_value         = unname(fm["pvalue"]),
    rmsea           = unname(fm["rmsea"]),
    rmsea_ci_lower  = unname(fm["rmsea.ci.lower"]),
    rmsea_ci_upper  = unname(fm["rmsea.ci.upper"]),
    cfi             = unname(fm["cfi"]),
    tli             = unname(fm["tli"]),
    srmr            = unname(fm["srmr"]),
    stringsAsFactors = FALSE
  )
}


#' Simulation-Based Power Analysis for Linear LGCM
#'
#' Simulates data from a linear LGCM with a given effect size (Cohen's d on
#' the slope difference between groups) and estimates power as the proportion
#' of replications where the slope difference is significant at \eqn{\alpha =
#' 0.05}.
#'
#' @param n_per_group Integer. Sample size per group.
#' @param effect_size Numeric. Standardised mean difference (Cohen's d) for the
#'   slope between the two groups. Default \code{0.3}.
#' @param n_sims Integer. Number of simulation replications. Default
#'   \code{1000}.
#' @param n_timepoints Integer. Number of repeated measurements. Default
#'   \code{5}.
#' @param residual_var Numeric. Residual variance per occasion. Default
#'   \code{0.5}.
#' @param seed Integer. Random seed for reproducibility. Default \code{42}.
#'
#' @return A list with elements \code{power} (proportion of significant
#'   replications), \code{n_per_group}, \code{effect_size}, and
#'   \code{n_sims}.
#'
#' @examples
#' \dontrun{
#' pwr <- power_simulation_lgcm(n_per_group = 40, effect_size = 0.4, n_sims = 500)
#' pwr$power
#' }
#'
#' @export
power_simulation_lgcm <- function(n_per_group = 50,
                                  effect_size  = 0.3,
                                  n_sims       = 1000L,
                                  n_timepoints = 5L,
                                  residual_var = 0.5,
                                  seed         = 42L) {
  set.seed(seed)

  n_total    <- 2L * n_per_group
  time_pts   <- seq(0, n_timepoints - 1L)
  dv_cols    <- paste0("y_t", seq_len(n_timepoints))
  syntax     <- .build_linear_syntax(dv_cols, time_loadings = time_pts)

  pop_model <- paste0(
    "i =~ 1*", paste(dv_cols, collapse = " + "), "\n",
    "s =~ ", paste(mapply(function(l, v) paste0(l, "*", v), time_pts, dv_cols), collapse = " + "), "\n",
    "i ~ 0*1\n",
    "s ~ 0*1\n",
    "i ~~ 1*i\n",
    "s ~~ 0.2*s\n",
    "i ~~ 0.1*s\n"
  )
  for (v in dv_cols) pop_model <- paste0(pop_model, v, " ~~ ", residual_var, "*", v, "\n")

  significant <- vapply(seq_len(n_sims), function(i) {
    tryCatch({
      dat <- lavaan::simulateData(pop_model, sample.nobs = n_per_group)
      dat$group <- "G1"

      pop_model_g2 <- gsub("s ~ 0\\*1", paste0("s ~ ", effect_size, "*1"), pop_model)
      dat2 <- lavaan::simulateData(pop_model_g2, sample.nobs = n_per_group)
      dat2$group <- "G2"

      sim_data <- dplyr::bind_rows(dat, dat2)

      mg_syntax <- paste0(
        .build_linear_syntax(dv_cols, time_pts),
        "s ~ c(s1, s2)*1\n"
      )
      fit_mg <- suppressWarnings(
        lavaan::growth(mg_syntax, data = sim_data, group = "group",
                       group.equal = character(0), estimator = "ML",
                       missing = "listwise")
      )
      pe <- lavaan::parameterEstimates(fit_mg)
      p  <- pe[pe$label %in% c("s1", "s2") | (pe$op == "~1" & pe$lhs == "s"), "pvalue"]
      any(!is.na(p) & p < 0.05)
    }, error = function(e) FALSE)
  }, FUN.VALUE = logical(1))

  list(
    power        = mean(significant),
    n_per_group  = n_per_group,
    effect_size  = effect_size,
    n_sims       = n_sims
  )
}
