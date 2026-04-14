#' Mixed-Effects Models for NANO Study HDA Trajectories
#'
#' Fits linear mixed-effects models using lme4 and nlme to characterise
#' longitudinal trajectories of heart-rate-derived (HDA) features across
#' diagnostic groups (ASIB, PT, TD).
#'
#' @author NANO Study Team

library(lme4)
library(nlme)
library(tidyverse)
library(broom.mixed)

# ── Helpers ───────────────────────────────────────────────────────────────────

.check_cols <- function(df, ...) {
  needed <- c(...)
  missing <- setdiff(needed, names(df))
  if (length(missing) > 0L) {
    stop("Missing columns in data: ", paste(missing, collapse = ", "))
  }
}

# ── Model fitting ─────────────────────────────────────────────────────────────

#' Fit a Random Intercept + Slope Mixed-Effects Model
#'
#' Fits a linear mixed-effects model with random intercepts and random slopes
#' for time using \code{lme4::lmer}. The fixed-effects structure includes a
#' main effect of time, a main effect of group, and their interaction.
#'
#' @param df A data.frame in long format containing at minimum columns for the
#'   dependent variable, time, group, and participant ID.
#' @param dv Character. Name of the dependent variable column.
#' @param time_var Character. Name of the time (repeated-measures) column.
#'   Default \code{"month"}.
#' @param group_var Character. Name of the grouping factor column.
#'   Default \code{"group_code"}.
#' @param id_var Character. Name of the participant identifier column.
#'   Default \code{"participant_id"}.
#'
#' @return An object of class \code{lmerMod}.
#'
#' @examples
#' \dontrun{
#' m <- fit_random_intercept_slope(df_long, dv = "rmssd_log", time_var = "month")
#' summary(m)
#' }
#'
#' @export
fit_random_intercept_slope <- function(df,
                                       dv,
                                       time_var  = "month",
                                       group_var = "group_code",
                                       id_var    = "participant_id") {
  .check_cols(df, dv, time_var, group_var, id_var)

  df[[group_var]] <- factor(df[[group_var]])

  frm <- reformulate(
    termlabels = c(time_var, group_var, paste0(time_var, ":", group_var),
                   paste0("(1 + ", time_var, " | ", id_var, ")")),
    response   = dv
  )

  lmer(frm, data = df, REML = TRUE,
       control = lmerControl(optimizer = "bobyqa",
                             optCtrl   = list(maxfun = 2e5)))
}


#' Fit an nlme Model with AR(1) Autocorrelation
#'
#' Fits a linear mixed-effects model via \code{nlme::lme} with a first-order
#' autoregressive residual correlation structure (\code{corAR1}) within
#' participant. This accounts for serial dependence in closely-spaced
#' repeated measurements.
#'
#' @param df A data.frame in long format.
#' @param dv Character. Name of the dependent variable column.
#' @param time_var Character. Name of the time column.
#' @param group_var Character. Name of the grouping factor column.
#' @param id_var Character. Name of the participant identifier column.
#'   Default \code{"participant_id"}.
#'
#' @return An object of class \code{lme}.
#'
#' @examples
#' \dontrun{
#' m_ar1 <- fit_nlme_ar1(df_long, dv = "hf_power_log",
#'                        time_var = "month", group_var = "group_code")
#' }
#'
#' @export
fit_nlme_ar1 <- function(df,
                         dv,
                         time_var  = "month",
                         group_var = "group_code",
                         id_var    = "participant_id") {
  .check_cols(df, dv, time_var, group_var, id_var)

  df[[group_var]] <- factor(df[[group_var]])
  df <- df[order(df[[id_var]], df[[time_var]]), ]

  fixed_frm <- reformulate(
    termlabels = c(time_var, group_var, paste0(time_var, ":", group_var)),
    response   = dv
  )
  random_frm <- reformulate(time_var, intercept = TRUE)

  lme(
    fixed     = fixed_frm,
    random    = list(stats::as.formula(paste0("~1 + ", time_var, " | ", id_var))),
    data      = df,
    correlation = corAR1(form = stats::as.formula(paste0("~", time_var, " | ", id_var))),
    control   = lmeControl(opt = "optim", maxIter = 200, msMaxIter = 200),
    method    = "REML"
  )
}


#' Likelihood Ratio Test for Group × Time Interaction
#'
#' Fits two models — one with and one without the group × time interaction —
#' using maximum likelihood, then performs a likelihood ratio test via
#' \code{anova()}. This tests whether diagnostic group significantly moderates
#' the trajectory of the dependent variable over time.
#'
#' @param df A data.frame in long format.
#' @param dv Character. Name of the dependent variable.
#' @param time_var Character. Time variable name. Default \code{"month"}.
#' @param group_var Character. Group variable name. Default \code{"group_code"}.
#' @param id_var Character. Participant ID variable. Default
#'   \code{"participant_id"}.
#'
#' @return A list with elements \code{lrt_table} (anova output as data.frame),
#'   \code{model_null} (no interaction), and \code{model_full} (with
#'   interaction).
#'
#' @examples
#' \dontrun{
#' result <- compare_group_trajectories(df_long, dv = "sdnn_log")
#' result$lrt_table
#' }
#'
#' @export
compare_group_trajectories <- function(df,
                                       dv,
                                       time_var  = "month",
                                       group_var = "group_code",
                                       id_var    = "participant_id") {
  .check_cols(df, dv, time_var, group_var, id_var)

  df[[group_var]] <- factor(df[[group_var]])
  re_term <- paste0("(1 + ", time_var, " | ", id_var, ")")

  frm_null <- reformulate(
    termlabels = c(time_var, group_var, re_term),
    response   = dv
  )
  frm_full <- reformulate(
    termlabels = c(time_var, group_var, paste0(time_var, ":", group_var), re_term),
    response   = dv
  )

  ctrl <- lmerControl(optimizer = "bobyqa", optCtrl = list(maxfun = 2e5))
  m0   <- lmer(frm_null, data = df, REML = FALSE, control = ctrl)
  m1   <- lmer(frm_full, data = df, REML = FALSE, control = ctrl)

  lrt  <- anova(m0, m1)

  list(
    lrt_table   = as.data.frame(lrt),
    model_null  = m0,
    model_full  = m1
  )
}


#' Extract Fixed-Effects Results from a Mixed-Effects Model
#'
#' Returns a tidy \code{data.frame} with coefficient estimates, standard errors,
#' 95 \% confidence intervals (Wald), and p-values for all fixed effects.
#' Works with both \code{lmerMod} (lme4) and \code{lme} (nlme) objects.
#'
#' @param model A fitted model object of class \code{lmerMod} or \code{lme}.
#'
#' @return A \code{data.frame} with columns \code{term}, \code{estimate},
#'   \code{std.error}, \code{conf.low}, \code{conf.high}, \code{statistic},
#'   and \code{p.value}.
#'
#' @examples
#' \dontrun{
#' m   <- fit_random_intercept_slope(df_long, dv = "rmssd_log")
#' res <- extract_model_results(m)
#' print(res)
#' }
#'
#' @export
extract_model_results <- function(model) {
  if (inherits(model, "lmerMod")) {
    tidy_res <- broom.mixed::tidy(model, effects = "fixed", conf.int = TRUE,
                                  conf.method = "Wald")
    tidy_res <- tidy_res |>
      dplyr::select(term, estimate, std.error,
                    conf.low, conf.high, statistic, p.value)
  } else if (inherits(model, "lme")) {
    coef_tbl <- as.data.frame(summary(model)$tTable)
    ci        <- stats::confint(model, level = 0.95)

    tidy_res <- data.frame(
      term      = rownames(coef_tbl),
      estimate  = coef_tbl[["Value"]],
      std.error = coef_tbl[["Std.Error"]],
      conf.low  = ci[rownames(coef_tbl), 1],
      conf.high = ci[rownames(coef_tbl), 2],
      statistic = coef_tbl[["t-value"]],
      p.value   = coef_tbl[["p-value"]],
      stringsAsFactors = FALSE
    )
  } else {
    stop("model must be of class 'lmerMod' or 'lme'.")
  }

  tidy_res
}
