#' MICE Multiple Imputation for the NANO Study
#'
#' End-to-end multiple imputation pipeline using \pkg{mice} and \pkg{miceadds}.
#' Handles continuous, binary, and clustered data structures consistent with
#' NANO Study data architecture.
#'
#' @author NANO Study Team

library(mice)
library(miceadds)
library(tidyverse)
library(caret)

# ── Data preparation ───────────────────────────────────────────────────────────

#' Prepare Data for MICE Imputation
#'
#' Standardises numeric predictors (zero mean, unit SD), removes near-zero
#' variance (NZV) predictors, drops user-specified exclusion columns, and
#' coerces binary character/logical columns to factors so that \code{mice}
#' can select appropriate imputation methods automatically.
#'
#' @param df A data.frame to prepare.
#' @param exclude_cols Character vector of column names to remove before
#'   imputation (e.g., free-text fields, identifiers). Default \code{NULL}.
#' @param scale_numeric Logical. If \code{TRUE} (default), numeric columns
#'   are centred and scaled.
#' @param nzv_freqCut Numeric. Ratio of most-common to second-most-common
#'   value threshold passed to \code{caret::nearZeroVar}. Default \code{95/5}.
#'
#' @return A data.frame ready for \code{mice()}, with attributes
#'   \code{"removed_nzv"} and \code{"removed_user"} attached.
#'
#' @examples
#' \dontrun{
#' df_prep <- prepare_data_for_imputation(df_raw,
#'              exclude_cols = c("participant_id", "redcap_event_name"))
#' }
#'
#' @export
prepare_data_for_imputation <- function(df,
                                        exclude_cols   = NULL,
                                        scale_numeric  = TRUE,
                                        nzv_freqCut    = 95 / 5) {
  stopifnot(is.data.frame(df))

  removed_user <- character(0)
  if (!is.null(exclude_cols)) {
    removed_user <- intersect(exclude_cols, names(df))
    df <- df[, setdiff(names(df), removed_user), drop = FALSE]
  }

  binary_lgl <- vapply(df, function(x) {
    u <- unique(x[!is.na(x)])
    length(u) == 2L && all(u %in% c(0, 1, TRUE, FALSE))
  }, FUN.VALUE = logical(1))
  df[binary_lgl] <- lapply(df[binary_lgl], factor)

  num_cols <- names(df)[vapply(df, is.numeric, FUN.VALUE = logical(1))]
  if (scale_numeric && length(num_cols) > 0L) {
    df[num_cols] <- lapply(df[num_cols], function(x) {
      if (stats::sd(x, na.rm = TRUE) > 0) scale(x)[, 1] else x
    })
  }

  nzv_idx <- caret::nearZeroVar(
    df[num_cols],
    freqCut       = nzv_freqCut,
    saveMetrics   = FALSE,
    allowParallel = FALSE
  )
  removed_nzv <- character(0)
  if (length(nzv_idx) > 0L) {
    removed_nzv <- num_cols[nzv_idx]
    df <- df[, setdiff(names(df), removed_nzv), drop = FALSE]
    message("Removed ", length(removed_nzv), " near-zero-variance predictor(s): ",
            paste(removed_nzv, collapse = ", "))
  }

  attr(df, "removed_nzv")  <- removed_nzv
  attr(df, "removed_user") <- removed_user
  df
}


#' Run MICE Multiple Imputation
#'
#' Runs \code{mice::mice()} with predictive mean matching (PMM) for continuous
#' variables and logistic regression for binary factors. When a cluster
#' variable is present, uses \code{miceadds::mice.impute.2l.pan} for
#' two-level imputation of continuous outcomes.
#'
#' @param df A prepared data.frame (output of
#'   \code{prepare_data_for_imputation}).
#' @param m Integer. Number of imputed datasets. Default \code{20}.
#' @param method_overrides Named character vector. Variable-specific method
#'   overrides (e.g., \code{c(ados_css = "norm")}). Default \code{NULL}.
#' @param seed Integer. Random seed. Default \code{42}.
#' @param cluster_var Character or \code{NULL}. Name of the level-2 clustering
#'   variable (e.g., site ID). If supplied, the two-level PAN method is used
#'   for numeric variables. Default \code{NULL}.
#' @param maxit Integer. Number of iterations. Default \code{10}.
#'
#' @return A \code{mids} object.
#'
#' @examples
#' \dontrun{
#' mids_obj <- run_mice_imputation(df_prep, m = 20, cluster_var = "site_id")
#' }
#'
#' @export
run_mice_imputation <- function(df,
                                m                = 20L,
                                method_overrides = NULL,
                                seed             = 42L,
                                cluster_var      = NULL,
                                maxit            = 10L) {
  stopifnot(is.data.frame(df))

  methods_vec <- mice::make.method(df)

  num_cols  <- names(df)[vapply(df, is.numeric,  FUN.VALUE = logical(1))]
  bin_cols  <- names(df)[vapply(df, function(x) is.factor(x) && nlevels(x) == 2L,
                                FUN.VALUE = logical(1))]
  poly_cols <- names(df)[vapply(df, function(x) is.factor(x) && nlevels(x) > 2L,
                                FUN.VALUE = logical(1))]

  methods_vec[num_cols]  <- "pmm"
  methods_vec[bin_cols]  <- "logreg"
  methods_vec[poly_cols] <- "polyreg"

  if (!is.null(cluster_var) && cluster_var %in% names(df)) {
    clust_targets <- setdiff(num_cols, cluster_var)
    methods_vec[clust_targets] <- "2l.pan"
  }

  if (!is.null(method_overrides)) {
    valid_ov <- intersect(names(method_overrides), names(methods_vec))
    methods_vec[valid_ov] <- method_overrides[valid_ov]
  }

  pred_matrix <- mice::make.predictorMatrix(df)
  if (!is.null(cluster_var) && cluster_var %in% names(df)) {
    pred_matrix[, cluster_var] <- -2L
  }

  mice::mice(
    data             = df,
    m                = m,
    method           = methods_vec,
    predictorMatrix  = pred_matrix,
    maxit            = maxit,
    seed             = seed,
    printFlag        = FALSE
  )
}


#' Pool Results from a MICE Object using Rubin's Rules
#'
#' Fits a model of the given type to each imputed dataset using \code{with()}
#' and pools the estimates via \code{mice::pool}.
#'
#' @param mids_obj A \code{mids} object from \code{run_mice_imputation}.
#' @param model_formula A \code{formula} specifying the model to fit.
#' @param model_type Character. One of \code{"lm"}, \code{"glm_binomial"},
#'   \code{"lmer"} (requires \pkg{lme4}). Default \code{"lm"}.
#'
#' @return A \code{mipo} pooled-fit object.
#'
#' @examples
#' \dontrun{
#' pooled <- pool_results(mids_obj, ados_css ~ rmssd + sdnn + group_code,
#'                         model_type = "lm")
#' }
#'
#' @export
pool_results <- function(mids_obj, model_formula, model_type = "lm") {
  stopifnot(inherits(mids_obj, "mids"), inherits(model_formula, "formula"))

  fit_expr <- switch(
    model_type,
    lm           = quote(lm(model_formula, data = .data)),
    glm_binomial = quote(glm(model_formula, data = .data, family = binomial())),
    lmer         = quote(lme4::lmer(model_formula, data = .data, REML = FALSE)),
    stop("model_type must be one of 'lm', 'glm_binomial', 'lmer'.")
  )

  model_fn <- switch(
    model_type,
    lm           = function(.data) lm(model_formula, data = .data),
    glm_binomial = function(.data) glm(model_formula, data = .data,
                                       family = binomial()),
    lmer         = function(.data) lme4::lmer(model_formula, data = .data,
                                              REML = FALSE)
  )

  fits <- with(mids_obj, eval(bquote(.(model_fn)(data = .SD))))
  mice::pool(fits)
}


#' Extract Pooled Estimates as a Tidy Data Frame
#'
#' Converts a pooled \code{mipo} object into a tidy \code{data.frame} with
#' columns for term names, pooled estimates, standard errors, 95 \% confidence
#' intervals, and p-values.
#'
#' @param pooled_fit A \code{mipo} object from \code{pool_results} or
#'   \code{mice::pool}.
#'
#' @return A \code{data.frame} with columns \code{term}, \code{estimate},
#'   \code{std.error}, \code{conf.low}, \code{conf.high}, and \code{p.value}.
#'
#' @examples
#' \dontrun{
#' tidy_res <- extract_pooled_estimates(pooled)
#' print(tidy_res)
#' }
#'
#' @export
extract_pooled_estimates <- function(pooled_fit) {
  stopifnot(inherits(pooled_fit, "mipo"))

  summ <- summary(pooled_fit, conf.int = TRUE, conf.level = 0.95)

  data.frame(
    term      = as.character(summ[["term"]]),
    estimate  = summ[["estimate"]],
    std.error = summ[["std.error"]],
    conf.low  = summ[["2.5 %"]],
    conf.high = summ[["97.5 %"]],
    p.value   = summ[["p.value"]],
    stringsAsFactors = FALSE
  )
}
