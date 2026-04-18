# Biomarker & ML Metric Definitions

This is the canonical dictionary for every metric that appears on the
dashboard. Each entry has a **plain-language** definition, the **formula**
or model step, and which dashboard widget uses it.

---

## Physiological biomarkers

### RSA — Respiratory Sinus Arrhythmia
* **Plain language:** how much heart rate naturally speeds up when
  breathing in and slows when breathing out. A healthy parasympathetic
  "brake" shows strong RSA.
* **Computation:** continuous-wavelet-transform (CWT) power in the
  respiratory band (0.12 – 0.40 Hz) of the resampled IBI series
  (`src/preprocessing/hrv_features.py::compute_rsa_cwt`).
* **Unit:** ln(ms²) after log-transform.
* **Dashboard uses:** Trajectories chart (per group, over 0–36 months).

### RMSSD — Root-Mean-Square of Successive Differences
* **Plain language:** how "jittery" the heartbeat is from one beat to
  the next. A dominant parasympathetic (vagal) index.
* **Computation:** `sqrt(mean(diff(IBI)²))` in ms.
* **Dashboard uses:** Trajectories chart, ML feature importance
  (`rmssd_mean_m6`).

### SDNN — Standard Deviation of Normal-to-Normal Intervals
* **Plain language:** total heart-rate variability over the recording
  window; influenced by both sympathetic and parasympathetic systems.
* **Computation:** `sd(IBI, ddof=1)` in ms.
* **Dashboard uses:** Trajectories chart, ML feature (`sdnn_mean_m9`).

### Sample Entropy
* **Plain language:** how regular vs. chaotic the heartbeat pattern is.
  Low entropy = mechanical / pathological; too-high entropy = noisy.
* **Computation:** see `compute_sample_entropy`.
* **Dashboard uses:** ML feature importance only.

### Poincaré SD1 / SD2
* **SD1 ≈ short-term** variability (parasympathetic).
* **SD2 ≈ long-term** variability (mixed).
* SD1 / SD2 ratio is a compact autonomic-balance index.

### HDA phases (Heart-rate Defined Attention)
Categorical phases derived from the IBI trajectory relative to the
series median, per Richards (2008):

| Phase | Criterion |
|-------|-----------|
| **Orienting**          | IBI spikes >+5% in the first 15% of the window |
| **Sustained attention (HDA_SA)** | IBI within ±10% of median |
| **Termination**        | IBI falls below 90% of median |
| **Inattention**        | everything else |

`HDA_SA` latency at 3 months is one of the top ML features and appears
on the Trajectories chart.

### CPTd — Central-Peripheral Temperature Difference
* Core (axillary) minus peripheral (foot) skin temperature in °C.
* A negative autonomic reactivity index: healthy infants narrow the gap
  when challenged; ASIB infants often keep a wider gap.
* Dashboard uses CPTd as an ML feature (`cptd_nicu`).

---

## ML metrics

### AUROC (Area Under the Receiver Operating Characteristic Curve)
* **Plain language:** how well the model separates cases from controls
  at every possible threshold. 0.5 = chance, 1.0 = perfect.
* **CI:** 95% bootstrap CI from 2000 resamples.

### Sensitivity, Specificity, F1
Standard binary-classification definitions. F1 = harmonic mean of
precision and recall.

### SHAP importance
Mean absolute SHAP value across all test-fold predictions per feature.
SHAP > 0.10 is considered a "top feature" in the dashboard.

### Subgroup AUROC (sensitivity analysis)
AUROC re-computed within GA-band and sex strata to detect
differential performance. Any stratum with |ΔAUROC| ≥ 0.05 vs. overall
is flagged for review.

---

## Mixed-effects model conventions

* Participant is the random-intercept grouping level.
* Time is coded as `month_cga` (corrected months, integer).
* Group × time interaction is always included to capture differential
  slopes (that's the number that populates the Intercepts/Slopes table).

## LGCM (Latent Growth Curve Model) conventions

* Fit with `lavaan`, freely estimated intercept + linear slope.
* Robust MLM estimator to tolerate skewed residuals.
* Group comparisons use the Wald χ² test on slope equality.
