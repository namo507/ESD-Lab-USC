# Statistical Methods Template — NANO Study Manuscripts

## Multiple Imputation

Missing data were handled using multiple imputation by chained equations (MICE;
van Buuren & Groothuis-Oudshoorn, 2011) as implemented in the R package **mice**
(v3.16). We first examined the missing data mechanism via logistic regression of
missingness indicators on all observed predictors; patterns were consistent with
Missing At Random (MAR) in all primary outcomes (all *p* > .10). Twenty imputed
datasets were generated using predictive mean matching for continuous variables
and logistic regression for binary variables. For the clustered longitudinal
structure, two-level imputation was performed using `miceadds::mice.impute.2l.pan`
with participant ID as the cluster variable. Results were pooled using Rubin's
(1987) rules. Convergence was assessed via trace-plot inspection over 20 MICE
iterations; all chains appeared stationary by iteration 5.

## Latent Growth Curve Models

Developmental trajectories of [OUTCOME] from [START_AGE] to [END_AGE] were
modeled using latent growth curve models (LGCMs; McArdle & Epstein, 1987;
Meredith & Tisak, 1990) in the R package **lavaan** (v0.6-17; Rosseel, 2012).
An unconditional linear growth model was first estimated, specifying a random
intercept (initial status) and random slope (rate of change), with time coded
as months from NICU discharge. Quadratic growth was tested by adding a latent
quadratic slope factor; model comparison used chi-square difference tests and
comparison of fit indices. Time-varying covariates (e.g., concurrent morbidity
score) and time-invariant covariates (e.g., gestational age bin, sex, SES) were
added as predictors of growth factors. Model fit was evaluated using the root
mean square error of approximation (RMSEA; acceptable < .08, good < .05), the
comparative fit index (CFI; acceptable > .95), standardized root mean residual
(SRMR; acceptable < .08), and the chi-square goodness-of-fit statistic (reported
but not used as the primary fit criterion given sensitivity to sample size).
Parameter estimates are reported with 95% confidence intervals; effect sizes are
reported as standardized path coefficients.

### Multi-Group Latent Growth Curve Models

To test whether developmental trajectories differed across groups (ASIB, PT, TD),
multi-group LGCMs were estimated. A sequence of increasingly constrained models
was tested: (1) configural model (all parameters free across groups), (2) weak
invariance model (growth factor loadings constrained equal), (3) strong invariance
model (loadings and intercepts constrained equal), and (4) fully constrained model
(loadings, intercepts, and growth factor means constrained equal). Models were
compared using chi-square difference tests and changes in CFI (ΔCFI > .010
indicates non-negligible misfit; Cheung & Rensvold, 2002). Group differences in
growth factor means (intercept and slope) were tested using Wald tests with
Bonferroni correction for multiple comparisons.

**Statistical power** for detecting a medium effect size (f² = 0.15) difference
in LGCM slope across three groups was estimated via parametric bootstrap simulation
(1,000 replications) using the `semTools` package, targeting 80% power at α = .05.

## Linear Mixed-Effects Models

Linear mixed-effects models were estimated using the R package **lme4** (v1.1-35;
Bates et al., 2015) to account for the nested structure of longitudinal observations
within participants. The model included fixed effects of [PREDICTORS] and random
intercepts and slopes for time within participant. Restricted maximum likelihood
(REML) estimation was used for variance component estimation; full maximum
likelihood (ML) was used for likelihood ratio tests of fixed effects. Degrees of
freedom were approximated using the Kenward-Roger method (kenward.roger = TRUE)
as implemented in the **lmerTest** package. Residual diagnostics confirmed
approximate normality and homoscedasticity of residuals. Cohen's *d* for pairwise
group comparisons was computed from model-estimated marginal means using the
**emmeans** package.

## Machine Learning Classification / Regression

Predictive models were developed using a nested cross-validation framework.
The outer loop used stratified 10-fold cross-validation (stratified on group:
ASIB/PT/TD and gestational age bin) to estimate generalization performance;
the inner loop used 5-fold cross-validation for hyperparameter selection via
grid search. Features were standardized (zero mean, unit variance) using
parameters estimated from the training fold only, then applied to the test fold
to prevent data leakage. Feature selection was performed via recursive feature
elimination with cross-validation (RFECV; Guyon et al., 2002). Three model
families were evaluated: Random Forest (Breiman, 2001), gradient-boosted trees
(XGBoost; Chen & Guestrin, 2016), and support vector machines (Vapnik, 1995).
Classification performance was quantified using area under the receiver operating
characteristic curve (AUROC) and area under the precision-recall curve (AUPRC),
with 95% bootstrap confidence intervals (2,000 resamples; percentile method).
Regression performance was quantified using R², root mean squared error (RMSE),
and mean absolute error (MAE). Feature importance was assessed using permutation
importance (Breiman, 2001) averaged across outer folds. Subgroup sensitivity
analyses re-estimated model performance separately within gestational age strata
(24–26w, 27–29w, 30–32w) and biological sex to evaluate equity of predictive
accuracy.

## ECG Signal Processing and HRV Feature Extraction

Raw inter-beat intervals (IBIs) were exported from Actiheart-5 monitors
(CamNtech, Cambridge, UK) and HeRO monitors (Medical Predictive Science, VA)
at 1024 Hz. Processing was performed using **NeuroKit2** (v0.2.7; Makowski et al.,
2021) and **biosppy** (v0.6.1). Raw ECG signals were bandpass filtered (0.5–40 Hz,
4th-order Butterworth filter) to remove baseline wander and high-frequency noise.
R-peaks were detected using the Pan-Tompkins algorithm (Pan & Tompkins, 1985).
Artifact removal proceeded in three stages: (1) physiologically implausible IBIs
(< 300 ms or > 1500 ms) were marked as artifacts; (2) IBIs deviating more than
3.5 standard deviations from the local median (±30 beats) were flagged; (3)
epochs containing more than 5 consecutive missing beats or more than 10% missing
data within any analysis window were excluded entirely from analysis.

Heart rate variability (HRV) features were extracted from artifact-corrected IBI
series using 5-minute stationary windows: mean IBI (ms), SDNN (ms), RMSSD (ms),
CVNN (%), triangular index (HTI), SD1 and SD2 from Poincaré plot analysis, and
sample entropy (SampEn; Richman & Moorman, 2000; m = 2, r = 0.2 × SD). Respiratory
sinus arrhythmia (RSA) was estimated as the log-transformed power in the
respiratory frequency band (0.12–0.4 Hz for term infants; 0.2–1.5 Hz adjusted
for preterm infants) using a continuous Morlet wavelet transform (Porges, 1985;
Grossman et al., 1990). Heart rate deceleration (HDA) phases — sustained attention
(SA), orienting, termination, and inattention — were identified using the
classification algorithm of [CITE HDA REFERENCE] applied to HR difference
waveforms time-locked to behavioral event onsets.

## References

- Bates, D., Mächler, M., Bolker, B., & Walker, S. (2015). Fitting linear
  mixed-effects models using lme4. *Journal of Statistical Software*, 67(1), 1–48.
- Breiman, L. (2001). Random forests. *Machine Learning*, 45(1), 5–32.
- Chen, T., & Guestrin, C. (2016). XGBoost: A scalable tree boosting system.
  *KDD*, 785–794.
- Cheung, G. W., & Rensvold, R. B. (2002). Evaluating goodness-of-fit indexes
  for testing measurement invariance. *Structural Equation Modeling*, 9(2), 233–255.
- Grossman, P., et al. (1990). Cardiac vagal control and daily activity... 
  *Psychosomatic Medicine*, 52(6), 642–651.
- Makowski, D., et al. (2021). NeuroKit2: A Python toolbox for neurophysiological
  signal processing. *Behavior Research Methods*, 53(4), 1689–1696.
- McArdle, J. J., & Epstein, D. (1987). Latent growth curves within developmental
  structural equation models. *Child Development*, 58(1), 110–133.
- Pan, J., & Tompkins, W. J. (1985). A real-time QRS detection algorithm.
  *IEEE Transactions on Biomedical Engineering*, 32(3), 230–236.
- Porges, S. W. (1985). Method and apparatus for evaluating rhythmic oscillations
  in aperiodic physiological response systems. *US Patent* 4,510,944.
- Richman, J. S., & Moorman, J. R. (2000). Physiological time-series analysis
  using approximate entropy and sample entropy. *American Journal of Physiology*,
  278(6), H2039–H2049.
- Rosseel, Y. (2012). lavaan: An R package for structural equation modeling.
  *Journal of Statistical Software*, 48(2), 1–36.
- Rubin, D. B. (1987). *Multiple Imputation for Nonresponse in Surveys*. Wiley.
- van Buuren, S., & Groothuis-Oudshoorn, K. (2011). mice: Multivariate imputation
  by chained equations in R. *Journal of Statistical Software*, 45(3), 1–67.
- Vapnik, V. N. (1995). *The Nature of Statistical Learning Theory*. Springer.
