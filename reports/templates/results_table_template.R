# results_table_template.R
# APA-formatted results tables for NANO Study manuscripts
# Uses knitr + kableExtra for HTML/LaTeX output
#
# Usage: source this file inside an .Rmd document or knit standalone.
# Requires: knitr, kableExtra, dplyr, tidyr, lme4, lmerTest, emmeans, lavaan

suppressPackageStartupMessages({
  library(knitr)
  library(kableExtra)
  library(dplyr)
  library(tidyr)
})

# ── APA theme helper ──────────────────────────────────────────────────────────

#' Apply a consistent APA-style theme to a kable table.
#'
#' @param kbl_obj  A kableExtra kable object.
#' @param caption  Character. Table caption (APA: above the table).
#' @param notes    Character or NULL. APA-style "Note." footnote text.
#'
#' @return A kableExtra kable object with APA styling applied.
#' @export
apa_table <- function(kbl_obj, caption = NULL, notes = NULL) {
  tbl <- kbl_obj |>
    kable_styling(
      bootstrap_options = c("striped", "hover", "condensed"),
      latex_options     = c("striped", "hold_position", "scale_down"),
      full_width        = FALSE,
      position          = "center",
      font_size         = 11
    ) |>
    row_spec(0, bold = TRUE, background = "#f0f0f0")

  if (!is.null(notes)) {
    tbl <- tbl |>
      footnote(
        general       = notes,
        general_title = "Note.",
        footnote_as_chunk = TRUE,
        title_format  = "italic"
      )
  }

  tbl
}

# ── Table 1: Participant Characteristics ─────────────────────────────────────

#' Generate APA Table 1 — Participant demographic and clinical characteristics.
#'
#' @param df  Data frame with columns: group, n, ga_weeks_mean, ga_weeks_sd,
#'            birth_weight_g_mean, birth_weight_g_sd, sex_pct_female,
#'            gest_age_bin_24_26, gest_age_bin_27_29, gest_age_bin_30_32,
#'            morbidity_score_mean, morbidity_score_sd.
#'
#' @return A formatted kable table.
#' @export
table1_demographics <- function(df) {
  tbl_data <- df |>
    mutate(
      `GA (wk), M (SD)` = sprintf("%.1f (%.1f)", ga_weeks_mean, ga_weeks_sd),
      `BW (g), M (SD)`   = sprintf("%.0f (%.0f)",
                                   birth_weight_g_mean, birth_weight_g_sd),
      `Female, %`         = sprintf("%.1f", sex_pct_female),
      `GA 24–26w, n (%)`  = sprintf("%d (%.1f)", gest_age_bin_24_26,
                                    100 * gest_age_bin_24_26 / n),
      `GA 27–29w, n (%)`  = sprintf("%d (%.1f)", gest_age_bin_27_29,
                                    100 * gest_age_bin_27_29 / n),
      `GA 30–32w, n (%)`  = sprintf("%d (%.1f)", gest_age_bin_30_32,
                                    100 * gest_age_bin_30_32 / n),
      `Morbidity, M (SD)` = sprintf("%.2f (%.2f)",
                                    morbidity_score_mean, morbidity_score_sd)
    ) |>
    select(Group = group, N = n,
           `GA (wk), M (SD)`, `BW (g), M (SD)`, `Female, %`,
           `GA 24–26w, n (%)`, `GA 27–29w, n (%)`, `GA 30–32w, n (%)`,
           `Morbidity, M (SD)`)

  kable(tbl_data,
        caption = "Table 1. Participant Demographic and Clinical Characteristics",
        align   = c("l", rep("c", ncol(tbl_data) - 1))) |>
    apa_table(
      notes = paste(
        "ASIB = autism siblings; PT = preterm without autism sibling;",
        "TD = typically developing. GA = gestational age at birth.",
        "BW = birth weight. Morbidity = NICU morbidity composite score.",
        "Group differences tested via one-way ANOVA (continuous) or",
        "chi-square (categorical); see text for statistics."
      )
    )
}

# ── Table 2: LGCM Growth Parameters ──────────────────────────────────────────

#' Generate APA Table 2 — Latent growth curve model parameter estimates.
#'
#' @param lavaan_fit  A fitted lavaan model object (cfa or growth).
#' @param title       Character. Table title.
#'
#' @return A formatted kable table.
#' @export
table2_lgcm <- function(lavaan_fit, title = "Table 2. Latent Growth Curve Model Parameters") {
  params <- lavaan::parameterEstimates(lavaan_fit, ci = TRUE, standardized = TRUE) |>
    filter(op %in% c("~1", "~~", "~")) |>
    mutate(
      Parameter    = paste(lhs, op, rhs),
      Estimate     = round(est, 3),
      SE           = round(se, 3),
      `z`          = round(z, 2),
      `p`          = ifelse(pvalue < .001, "< .001",
                            ifelse(pvalue < .01, "< .01",
                                   sprintf("%.3f", pvalue))),
      `95% CI`     = sprintf("[%.3f, %.3f]", ci.lower, ci.upper),
      `β (std)`    = round(std.all, 3)
    ) |>
    select(Parameter, Estimate, SE, z, p, `95% CI`, `β (std)`)

  kable(params, caption = title,
        align = c("l", rep("c", ncol(params) - 1))) |>
    apa_table(
      notes = paste(
        "SE = standard error. β (std) = fully standardized estimate.",
        "CIs are 95% Wald confidence intervals. RMSEA =",
        sprintf("%.3f", lavaan::fitMeasures(lavaan_fit, "rmsea")),
        "[90% CI:",
        sprintf("%.3f–%.3f", lavaan::fitMeasures(lavaan_fit, "rmsea.ci.lower"),
                lavaan::fitMeasures(lavaan_fit, "rmsea.ci.upper")),
        "]; CFI =",
        sprintf("%.3f", lavaan::fitMeasures(lavaan_fit, "cfi")),
        "; SRMR =",
        sprintf("%.3f", lavaan::fitMeasures(lavaan_fit, "srmr"))
      )
    )
}

# ── Table 3: Mixed-Effects Model Fixed Effects ────────────────────────────────

#' Generate APA Table 3 — Fixed-effects summary from a lme4/lmerTest model.
#'
#' @param lmer_fit  A fitted lmerMod or lmerModLmerTest object.
#' @param dv_label  Character. Label for the dependent variable.
#'
#' @return A formatted kable table.
#' @export
table3_mixed_effects <- function(lmer_fit, dv_label = "Outcome") {
  coef_tbl <- as.data.frame(lmerTest::summary(lmer_fit)$coefficients) |>
    tibble::rownames_to_column("Term") |>
    rename(
      Estimate  = Estimate,
      SE        = `Std. Error`,
      df        = df,
      t         = `t value`,
      p         = `Pr(>|t|)`
    ) |>
    mutate(
      Estimate = round(Estimate, 3),
      SE       = round(SE, 3),
      df       = round(df, 1),
      t        = round(t, 2),
      p        = ifelse(p < .001, "< .001",
                        ifelse(p < .01, "< .01", sprintf("%.3f", p))),
      `95% CI` = sprintf("[%.3f, %.3f]",
                         Estimate - 1.96 * SE,
                         Estimate + 1.96 * SE)
    ) |>
    select(Term, Estimate, SE, df, t, p, `95% CI`)

  kable(coef_tbl,
        caption = sprintf("Table 3. Fixed Effects for %s (Linear Mixed-Effects Model)",
                          dv_label),
        align = c("l", rep("c", ncol(coef_tbl) - 1))) |>
    apa_table(
      notes = paste(
        "SE = standard error. df computed via Kenward-Roger approximation.",
        "95% CI = Wald confidence intervals.",
        "Random effects: random intercept and slope for time within participant.",
        "Model estimated via REML."
      )
    )
}

# ── Table 4: ML Model Performance ─────────────────────────────────────────────

#' Generate APA Table 4 — Machine learning model performance comparison.
#'
#' @param perf_df  Data frame with columns: model, auroc, auroc_ci_lo,
#'                 auroc_ci_hi, auprc, auprc_ci_lo, auprc_ci_hi,
#'                 sensitivity, specificity, f1.
#'
#' @return A formatted kable table.
#' @export
table4_ml_performance <- function(perf_df) {
  tbl_data <- perf_df |>
    mutate(
      AUROC       = sprintf("%.3f [%.3f–%.3f]", auroc, auroc_ci_lo, auroc_ci_hi),
      AUPRC       = sprintf("%.3f [%.3f–%.3f]", auprc, auprc_ci_lo, auprc_ci_hi),
      Sensitivity = sprintf("%.3f", sensitivity),
      Specificity = sprintf("%.3f", specificity),
      `F1 Score`  = sprintf("%.3f", f1)
    ) |>
    rename(Model = model) |>
    select(Model, AUROC, AUPRC, Sensitivity, Specificity, `F1 Score`)

  kable(tbl_data,
        caption = "Table 4. Predictive Model Performance (Stratified 10-Fold CV)",
        align = c("l", rep("c", ncol(tbl_data) - 1))) |>
    apa_table(
      notes = paste(
        "CV = cross-validation. AUROC = area under receiver operating characteristic curve.",
        "AUPRC = area under precision-recall curve.",
        "Values in brackets are 95% bootstrap confidence intervals (2,000 resamples).",
        "Performance estimated in outer folds of nested CV.",
        "RF = Random Forest; XGB = XGBoost; SVM = Support Vector Machine."
      )
    ) |>
    kable_styling() |>
    row_spec(which(perf_df$auroc == max(perf_df$auroc)), bold = TRUE,
             background = "#fffacd")
}

# ── Supplementary: HRV Feature Descriptives ───────────────────────────────────

#' Generate supplementary table of HRV feature descriptives by group × timepoint.
#'
#' @param hrv_df  Data frame with columns: feature, group, timepoint,
#'                mean, sd, median, q25, q75, n.
#'
#' @return A formatted kable table.
#' @export
table_hrv_descriptives <- function(hrv_df) {
  tbl_data <- hrv_df |>
    mutate(
      `M (SD)`    = sprintf("%.2f (%.2f)", mean, sd),
      `Mdn [IQR]` = sprintf("%.2f [%.2f–%.2f]", median, q25, q75)
    ) |>
    select(Feature = feature, Group = group, Timepoint = timepoint,
           N = n, `M (SD)`, `Mdn [IQR]`)

  kable(tbl_data,
        caption = "Supplementary Table S1. HRV Feature Descriptives by Group and Timepoint",
        align = c("l", "c", "c", "c", "c", "c")) |>
    apa_table(
      notes = paste(
        "SDNN = standard deviation of normal-to-normal IBI.",
        "RMSSD = root mean square of successive differences.",
        "RSA = respiratory sinus arrhythmia (log-transformed power).",
        "SampEn = sample entropy (m=2, r=0.2×SD).",
        "IBI = inter-beat interval (ms). IQR = interquartile range."
      )
    ) |>
    collapse_rows(columns = 1:2, valign = "top")
}
