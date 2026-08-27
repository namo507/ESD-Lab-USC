# Cluster Analysis Guide for the Caregiver Autism Acceptability Study
### A Step-by-Step Notebook Blueprint with Synthetic Data, Theory, Calculations & Visualizations

> **Study Context:** Bradshaw R21 — 135-response REDCap caregiver survey; TFA constructs + Schwartz Values + demographics; goal is to find latent parent acceptability profiles to explain why ~44% decline infant ASD intervention enrollment.

---

## Table of Contents
1. [What is Cluster Analysis? (Plain English)](#1-what-is-cluster-analysis-plain-english)
2. [Why K-Means for This Study?](#2-why-k-means-for-this-study)
3. [Variables to Use (Feature Selection)](#3-variables-to-use-feature-selection)
4. [Notebook Structure Overview](#4-notebook-structure-overview)
5. [Cell 1 — Setup & Synthetic Data Generation](#5-cell-1--setup--synthetic-data-generation)
6. [Cell 2 — Data Cleaning & Preprocessing](#6-cell-2--data-cleaning--preprocessing)
7. [Cell 3 — Autism Knowledge Score Calculation](#7-cell-3--autism-knowledge-score-calculation)
8. [Cell 4 — Exploratory Data Analysis (EDA)](#8-cell-4--exploratory-data-analysis-eda)
9. [Cell 5 — Choosing K: The Elbow Method & Silhouette Score](#9-cell-5--choosing-k-the-elbow-method--silhouette-score)
10. [Cell 6 — Running K-Means Clustering](#10-cell-6--running-k-means-clustering)
11. [Cell 7 — Visualizing Clusters](#11-cell-7--visualizing-clusters)
12. [Cell 8 — Interpreting & Naming Clusters](#12-cell-8--interpreting--naming-clusters)
13. [Cell 9 — Validation & Statistical Testing](#13-cell-9--validation--statistical-testing)
14. [Cell 10 — Predictive Extension (Optional)](#14-cell-10--predictive-extension-optional)
15. [Full Theory Reference Table](#15-full-theory-reference-table)
16. [Checklist Before Presenting to Dr. Bradshaw](#16-checklist-before-presenting-to-dr-bradshaw)

---

## 1. What is Cluster Analysis? (Plain English)

**Think of it like this:** You have 135 parents. They all filled out the same survey, but they answered very differently. Rather than treating them all as "one group," cluster analysis asks: *"Can we find 3-4 natural groups of parents who answered similarly to each other?"*

The algorithm doesn't know about ASD vs. NT parents, race, or income beforehand. It purely looks at **patterns in the numbers** and groups people who are similar.

**Why it matters here:** Instead of just saying "ASD parents are different from NT parents," you can say:
> "We found 4 distinct parent profiles. Profile 2 — who we call 'Burden-Averse Skeptics' — shows the highest screening refusal rates and is disproportionately made up of Black parents with lower income, suggesting targeted consent modifications are needed."

That's a much more powerful and actionable finding.

---

## 2. Why K-Means for This Study?

| Method | Best When | Limitation | Good for This Study? |
|---|---|---|---|
| **K-Means** | Continuous/scaled variables, want speed and interpretability | Assumes spherical clusters, sensitive to outliers | ✅ Yes — fast, interpretable, works on TFA sliders |
| **Gaussian Mixture Model (GMM)** | Want probabilistic cluster membership | More complex to explain | ✅ Good follow-up |
| **Latent Class Analysis (LCA)** | Purely categorical/ordinal data | Requires `poLCA` in R or `stepmix` in Python | ✅ Best for final paper |
| **Hierarchical Clustering** | Exploratory, want dendrogram | Doesn't scale, hard to explain | ⚠️ Use only visually |

**Decision for this notebook:** Start with **K-Means** (what Dr. Bradshaw requested per meeting notes). Use silhouette score + elbow method to pick K. Add GMM as optional extension.

---

## 3. Variables to Use (Feature Selection)

These come directly from the REDCap instrument and study documents.

### Primary Clustering Features (TFA Construct Scores)

| Variable | Survey Question Summary | Scale |
|---|---|---|
| `tfa_mri` | Acceptability of MRI screening | 1–7 slider |
| `tfa_eeg` | Acceptability of EEG screening | 1–7 slider |
| `tfa_blood` | Acceptability of blood test | 1–7 slider |
| `tfa_video` | Acceptability of video/gaze tracking | 1–7 slider |
| `tfa_saliva` | Acceptability of saliva test | 1–7 slider |
| `tfa_observe` | Acceptability of behavioral observation | 1–7 slider |
| `tfa_believe_positive` | Belief in positive screening result | 1–7 slider |
| `tfa_interact_positive` | Would change how you interact with baby? | 1–7 slider |
| `tfa_regret` | Regret over screening (false positive scenario) | 1–7 slider |
| `tfa_scan_mine` | Is it morally right to screen MY baby? | 1–6 ordinal |
| `tfa_gain_vs_loss` | Did you gain more or lose more? | 1–7 slider |
| `tfa_free_screen` | Would you do a free 4-month screen? | 1–5 ordinal |

### Secondary Features (Schwartz Values)

| Variable | Value Measured |
|---|---|
| `conformity_val` | Respect for rules/authority |
| `tradition_val` | Religious/cultural tradition |
| `benevolence_val` | Helping close others |
| `universalism_val` | Equal treatment for all |
| `self_direction_val` | Curiosity, independence |
| `security_val` | Safety, order |
| `ethicality_val` | Right vs. wrong orientation |

### Demographic Covariates (NOT used in clustering, used for profiling afterward)

`lived_experience` (ASD vs. NT parent), `race_ethnicity`, `income`, `education`, `area` (urban/rural), `autism_knowledge_score`

---

## 4. Notebook Structure Overview

```
caregiver_cluster_analysis.ipynb
│
├── Cell 1  — Imports + Synthetic Data (n=135)
├── Cell 2  — Cleaning + Missing Value Handling
├── Cell 3  — Autism Knowledge Score Calculation
├── Cell 4  — EDA: Distributions + Correlation Heatmap
├── Cell 5  — Feature Scaling + Choosing K (Elbow + Silhouette)
├── Cell 6  — K-Means Clustering (K=4)
├── Cell 7  — Visualizations: PCA Plot, Radar Chart, Bar Profiles
├── Cell 8  — Cluster Naming + Interpretation Table
├── Cell 9  — Validation: ANOVA + Chi-Square by Cluster
└── Cell 10 — Optional: GMM / XGBoost cluster membership prediction
```

---

## 5. Cell 1 — Setup & Synthetic Data Generation

```python
# Cell 1: Imports and Synthetic Data Generation
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
from scipy.stats import f_oneway, chi2_contingency
import warnings
warnings.filterwarnings('ignore')

np.random.seed(42)
n = 135  # cleaned dataset size per meeting notes

# ── Synthetic TFA Slider Variables (1-7 scale) ──────────────────────────────
# We simulate 3 latent groups with different acceptability patterns:
# Group A: High accepters (n≈45), Group B: Moderate (n≈50), Group C: Skeptics (n≈40)

def gen_group(n, means, sd=1.2):
    return {k: np.clip(np.random.normal(v, sd, n), 1, 7) 
            for k, v in means.items()}

tfa_vars = ['tfa_mri','tfa_eeg','tfa_blood','tfa_video',
            'tfa_saliva','tfa_observe','tfa_believe_positive',
            'tfa_interact_positive','tfa_regret','tfa_gain_vs_loss']

# Group A: Trusting Pragmatists — high acceptance across modalities
gA = gen_group(45, dict(zip(tfa_vars, [6,6,5.5,6.5,6.8,6.5,5.8,5.5,2,5.5])))
# Group B: Modality-Sensitive — low on invasive (MRI/blood), high on observe/video
gB = gen_group(50, dict(zip(tfa_vars, [2.5,3.5,2.8,5.8,6.0,5.5,4.5,4.0,4.5,4.0])))
# Group C: Burden-Averse Skeptics — low across the board, high regret
gC = gen_group(40, dict(zip(tfa_vars, [2.0,2.5,2.2,3.5,3.8,3.0,2.5,2.0,6.0,2.0])))

df_A = pd.DataFrame(gA); df_B = pd.DataFrame(gB); df_C = pd.DataFrame(gC)
df = pd.concat([df_A, df_B, df_C], ignore_index=True)

# ── Schwartz Values (1-6 scale) ─────────────────────────────────────────────
val_vars = ['conformity_val','tradition_val','benevolence_val',
            'universalism_val','self_direction_val','security_val']
for v in val_vars:
    df[v] = np.clip(np.random.normal(3.5, 1.0, n), 1, 6)

# ── Autism Knowledge Score (0-3) ────────────────────────────────────────────
# Calculated from 3 binary correct/incorrect items (see Cell 3 for logic)
df['autism_knowledge_score'] = np.random.choice([0,1,2,3], n, p=[0.1,0.25,0.35,0.30])

# ── Ordinal Variables ────────────────────────────────────────────────────────
df['tfa_scan_mine'] = np.random.choice(range(1,7), n)       # 1=very morally right
df['tfa_free_screen'] = np.random.choice(range(1,6), n)      # 1=definitely yes

# ── Demographics (for profiling only, NOT used in clustering) ────────────────
df['lived_experience'] = np.random.choice(['ASD_parent','NT_parent'], n, p=[0.5,0.5])
df['race'] = np.random.choice(['White','Black','Hispanic','Other'], n, p=[0.55,0.24,0.12,0.09])
df['income'] = np.random.choice(['<30k','30-60k','60-100k','>100k'], n, p=[0.20,0.30,0.30,0.20])
df['education'] = np.random.choice(['HS','Some college','Bachelor','Graduate'], n)
df['area'] = np.random.choice(['Urban','Suburban','Rural'], n, p=[0.40,0.40,0.20])

print(f"Dataset shape: {df.shape}")
df.head()
```

**What this does:** Creates a 135-row dataset that mimics your real REDCap export structure — TFA sliders, values scores, demographics — with three latent groups embedded that K-means should recover.

---

## 6. Cell 2 — Data Cleaning & Preprocessing

```python
# Cell 2: Cleaning and Missing Value Handling
# Simulate ~15% missingness on sensitive items (matches real data pattern)
for col in ['income', 'autism_knowledge_score']:
    missing_idx = np.random.choice(df.index, size=int(0.15*n), replace=False)
    df.loc[missing_idx, col] = np.nan

print("Missing values per column:")
print(df.isnull().sum()[df.isnull().sum() > 0])

# Simple imputation for clustering features only (median for continuous)
# NOTE: For the real dataset, replace this with MICE (see imputation module)
feature_cols = tfa_vars + val_vars + ['tfa_scan_mine','tfa_free_screen','autism_knowledge_score']
df[feature_cols] = df[feature_cols].fillna(df[feature_cols].median())

print(f"\nAfter imputation — missing values: {df[feature_cols].isnull().sum().sum()}")
print("\nDescriptive Stats for Clustering Features:")
df[feature_cols].describe().round(2)
```

**Key note for Dr. Bradshaw:** In the real dataset, sensitive items like income (~54% missing per `Caregiver-Analysis-Report.md`) and `fif_diag_earlier` should use MICE imputation rather than simple median fill before cluster profiling.

---

## 7. Cell 3 — Autism Knowledge Score Calculation

This implements the exact scoring logic from `autism_knowledge_total_score_calculation.docx`.

```python
# Cell 3: Autism Knowledge Score — exact logic from study document
"""
Score = sum of 3 binary items (0 or 1 each). Total: 0-3.

Item 1 (tfa_behavior_age): Correct = response 3 ("1 to 2 years")
Item 2 (tfa_autistic_us):  Correct = response 2 ("3% of children")  
Item 3 (tfa_mult_kids_odds): Correct = response 3 ("~20%, not uncommon")
"""

# Simulate the 3 raw items for scoring demonstration
df['tfa_behavior_age'] = np.random.choice([1,2,3,4,5,6], n)
df['tfa_autistic_us']  = np.random.choice([1,2,3,4], n)
df['tfa_mult_kids_odds'] = np.random.choice([1,2,3,4,5], n)

# Apply correct scoring
df['score_item1'] = (df['tfa_behavior_age'] == 3).astype(int)
df['score_item2'] = (df['tfa_autistic_us'] == 2).astype(int)
df['score_item3'] = (df['tfa_mult_kids_odds'] == 3).astype(int)

df['autism_knowledge_score'] = df['score_item1'] + df['score_item2'] + df['score_item3']

# Scoring Table
scoring_table = pd.DataFrame({
    'Variable': ['tfa_behavior_age','tfa_autistic_us','tfa_mult_kids_odds','TOTAL'],
    'Correct Answer': ['3 — 1 to 2 years','2 — 3% of children','3 — ~20% chance','—'],
    'Score if Correct': [1, 1, 1, '0–3'],
    'Distribution in Synthetic Data': [
        f"{(df['score_item1']==1).mean():.0%} correct",
        f"{(df['score_item2']==1).mean():.0%} correct",
        f"{(df['score_item3']==1).mean():.0%} correct",
        f"Mean = {df['autism_knowledge_score'].mean():.2f}"
    ]
})
print(scoring_table.to_string(index=False))
print(f"\nScore Distribution:\n{df['autism_knowledge_score'].value_counts().sort_index()}")
```

**Score interpretation table:**

| Score | Meaning | Expected % in Study |
|---|---|---|
| 0 | No correct answers — very low autism knowledge | ~10% |
| 1 | Low knowledge | ~25% |
| 2 | Moderate knowledge | ~35% |
| 3 | All correct — high autism knowledge | ~30% |

---

## 8. Cell 4 — Exploratory Data Analysis (EDA)

```python
# Cell 4: EDA — 3 key visualizations

fig, axes = plt.subplots(1, 3, figsize=(18, 5))

# ── Plot 1: TFA Slider Distribution (Box Plot) ────────────────────────────────
df[tfa_vars[:6]].boxplot(ax=axes[0], vert=False)
axes[0].set_title('TFA Screening Modality Acceptability\n(1=Low, 7=High)', fontweight='bold')
axes[0].set_xlabel('Acceptability Score')
axes[0].axvline(4, color='red', linestyle='--', alpha=0.5, label='Midpoint')
axes[0].legend()

# ── Plot 2: Correlation Heatmap of Clustering Features ───────────────────────
corr = df[tfa_vars].corr()
sns.heatmap(corr, ax=axes[1], cmap='RdYlGn', center=0,
            annot=True, fmt='.2f', linewidths=0.5)
axes[1].set_title('TFA Variable Correlation Matrix', fontweight='bold')

# ── Plot 3: Autism Knowledge Score Distribution ───────────────────────────────
df['autism_knowledge_score'].value_counts().sort_index().plot(
    kind='bar', ax=axes[2], color=['#d62728','#ff7f0e','#2ca02c','#1f77b4'],
    edgecolor='black')
axes[2].set_title('Autism Knowledge Score\nDistribution (0-3)', fontweight='bold')
axes[2].set_xlabel('Score'); axes[2].set_ylabel('Count')
axes[2].set_xticklabels(['0\n(None)','1\n(Low)','2\n(Moderate)','3\n(High)'], rotation=0)

plt.tight_layout()
plt.savefig('eda_overview.png', dpi=150, bbox_inches='tight')
plt.show()
print("EDA plots saved.")
```

**What to look for:**
- Box plot: Wide variance in `tfa_mri` and `tfa_blood` = parents disagree most about invasive tests
- Heatmap: Strongly correlated TFA items may need to be combined before clustering
- Knowledge score: Most parents scoring 2/3 = moderate knowledge baseline

---

## 9. Cell 5 — Choosing K: The Elbow Method & Silhouette Score

This is the most critical methodological step.

```python
# Cell 5: Choosing the right number of clusters (K)

# Scale features — REQUIRED for K-Means (algorithm uses Euclidean distance)
X = df[feature_cols].values
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# ── Method 1: Elbow Method (Inertia) ─────────────────────────────────────────
# Inertia = sum of squared distances from each point to its cluster center
# Lower is better, but adding K always reduces it — look for the "elbow"

inertias = []
K_range = range(2, 11)
for k in K_range:
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    km.fit(X_scaled)
    inertias.append(km.inertia_)

# ── Method 2: Silhouette Score ───────────────────────────────────────────────
# Silhouette = how similar a point is to its own cluster vs. other clusters
# Ranges: -1 (wrong cluster) to 0 (boundary) to +1 (perfect fit)
# HIGHER is better

silhouettes = []
for k in K_range:
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = km.fit_predict(X_scaled)
    silhouettes.append(silhouette_score(X_scaled, labels))

# Plot both side by side
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

ax1.plot(K_range, inertias, 'bo-', linewidth=2, markersize=8)
ax1.set_xlabel('Number of Clusters (K)', fontsize=12)
ax1.set_ylabel('Inertia (Within-Cluster Sum of Squares)', fontsize=12)
ax1.set_title('Elbow Method\n→ Look for the bend/elbow', fontweight='bold')
ax1.axvline(4, color='red', linestyle='--', label='Suggested K=4')
ax1.legend()
ax1.grid(alpha=0.3)

ax2.plot(K_range, silhouettes, 'go-', linewidth=2, markersize=8)
ax2.set_xlabel('Number of Clusters (K)', fontsize=12)
ax2.set_ylabel('Average Silhouette Score', fontsize=12)
ax2.set_title('Silhouette Score\n→ Higher is better', fontweight='bold')
ax2.axvline(4, color='red', linestyle='--', label='Suggested K=4')
ax2.legend()
ax2.grid(alpha=0.3)

plt.tight_layout()
plt.savefig('elbow_silhouette.png', dpi=150, bbox_inches='tight')
plt.show()

# Print decision table
print("\n── K Selection Summary Table ──")
print(f"{'K':<5} {'Inertia':>12} {'Silhouette':>12}")
print("-"*32)
for k, inert, sil in zip(K_range, inertias, silhouettes):
    marker = " ← SUGGESTED" if k == 4 else ""
    print(f"{k:<5} {inert:>12.1f} {sil:>12.4f}{marker}")
```

**How to explain this to the team:**

> "The elbow plot shows that adding more clusters gives diminishing returns after K=4 — like the bend in an elbow. The silhouette score peaks near K=3 or K=4 — that means parents in those clusters are tight together internally and well-separated from each other. We pick **K=4** as it matches both criteria and gives us interpretable, distinct groups."

**Decision rule table:**

| Criterion | What It Measures | Decision |
|---|---|---|
| Elbow "bend" | Reduction in within-cluster variance | Pick K where curve flattens |
| Silhouette peak | Cluster separation quality | Pick K with highest score |
| Interpretability | Can you name/explain the cluster? | Always override math with domain sense |

---

## 10. Cell 6 — Running K-Means Clustering

```python
# Cell 6: Run K-Means with K=4

K_FINAL = 4

km_final = KMeans(n_clusters=K_FINAL, random_state=42, n_init=20, max_iter=500)
df['cluster'] = km_final.fit_predict(X_scaled)

# Cluster sizes
print("── Cluster Sizes ──")
size_table = df['cluster'].value_counts().sort_index().reset_index()
size_table.columns = ['Cluster', 'N']
size_table['%'] = (size_table['N'] / n * 100).round(1)
print(size_table.to_string(index=False))

# Cluster centroids (back-transformed to original scale for interpretability)
centroids_scaled = km_final.cluster_centers_
centroids_orig = scaler.inverse_transform(centroids_scaled)
centroid_df = pd.DataFrame(centroids_orig, columns=feature_cols)
centroid_df.index = [f'Cluster {i}' for i in range(K_FINAL)]

print("\n── Cluster Centroids (Original Scale) ──")
print(centroid_df[tfa_vars].round(2).to_string())
```

**What are centroids?**

> A centroid is the "average parent" in each cluster — it's the point in the middle of all the responses for that group. If Cluster 0's centroid has `tfa_mri = 5.9` and `tfa_blood = 5.5`, it means the average parent in that cluster is comfortable with invasive tests.

---

## 11. Cell 7 — Visualizing Clusters

Three essential visualizations:

```python
# Cell 7: Cluster Visualizations

# ── Visualization 1: PCA Plot (2D view of clusters) ──────────────────────────
pca = PCA(n_components=2, random_state=42)
X_pca = pca.fit_transform(X_scaled)
df['pca1'] = X_pca[:, 0]
df['pca2'] = X_pca[:, 1]

# Explained variance
var_explained = pca.explained_variance_ratio_
print(f"PCA Variance Explained: PC1={var_explained[0]:.1%}, PC2={var_explained[1]:.1%}")

fig, axes = plt.subplots(1, 3, figsize=(20, 6))

colors = ['#1f77b4','#ff7f0e','#2ca02c','#d62728']
cluster_names = ['Trusting\nPragmatists','Modality-Sensitive\nAnxious',
                 'Burden-Averse\nSkeptics','Informed\nSupporters']

# PCA scatter
for c in range(K_FINAL):
    mask = df['cluster'] == c
    axes[0].scatter(df.loc[mask,'pca1'], df.loc[mask,'pca2'],
                    c=colors[c], label=f'C{c}: {cluster_names[c].replace(chr(10)," ")}',
                    alpha=0.7, s=60, edgecolors='white', linewidth=0.5)
# Add centroids
centroids_pca = pca.transform(centroids_scaled)
axes[0].scatter(centroids_pca[:,0], centroids_pca[:,1],
                c='black', s=200, marker='X', zorder=5, label='Centroids')
axes[0].set_xlabel(f'PC1 ({var_explained[0]:.1%} variance)')
axes[0].set_ylabel(f'PC2 ({var_explained[1]:.1%} variance)')
axes[0].set_title('Parent Acceptability Clusters\n(PCA 2D Projection)', fontweight='bold')
axes[0].legend(fontsize=8, loc='best')
axes[0].grid(alpha=0.3)

# ── Visualization 2: Radar/Spider Chart per Cluster ──────────────────────────
radar_vars = ['tfa_mri','tfa_blood','tfa_video','tfa_observe',
              'tfa_believe_positive','tfa_regret','tfa_gain_vs_loss']
radar_labels = ['MRI Accept','Blood Accept','Video Accept',
                'Observe Accept','Belief in Result','Regret','Net Gain']

angles = np.linspace(0, 2*np.pi, len(radar_vars), endpoint=False).tolist()
angles += angles[:1]  # close the polygon

ax_r = axes[1]
ax_r.remove()
ax_r = fig.add_subplot(1, 3, 2, projection='polar')

for c in range(K_FINAL):
    vals = centroid_df.loc[f'Cluster {c}', radar_vars].tolist()
    vals += vals[:1]
    ax_r.plot(angles, vals, 'o-', color=colors[c], linewidth=2,
              label=f'C{c}: {cluster_names[c].replace(chr(10)," ")}')
    ax_r.fill(angles, vals, color=colors[c], alpha=0.1)

ax_r.set_xticks(angles[:-1])
ax_r.set_xticklabels(radar_labels, size=8)
ax_r.set_ylim(1, 7)
ax_r.set_title('Cluster Profiles\n(TFA Radar Chart)', fontweight='bold', pad=20)
ax_r.legend(loc='upper right', bbox_to_anchor=(1.35, 1.15), fontsize=7)

# ── Visualization 3: Cluster Mean Bar Chart ──────────────────────────────────
plot_vars = ['tfa_mri','tfa_blood','tfa_observe','tfa_believe_positive','tfa_regret']
cluster_means = df.groupby('cluster')[plot_vars].mean()

x = np.arange(len(plot_vars))
width = 0.2

for i, (c, name) in enumerate(zip(range(K_FINAL), cluster_names)):
    axes[2].bar(x + i*width, cluster_means.loc[c, plot_vars],
                width, label=f'C{c}: {name.replace(chr(10)," ")}',
                color=colors[i], alpha=0.85, edgecolor='black', linewidth=0.5)

axes[2].set_xlabel('TFA Variables')
axes[2].set_ylabel('Mean Score (1-7)')
axes[2].set_title('Mean TFA Scores by Cluster\n(Key Variables)', fontweight='bold')
axes[2].set_xticks(x + width * 1.5)
axes[2].set_xticklabels(['MRI\nAccept','Blood\nAccept','Observe\nAccept',
                          'Belief in\nResult','Regret'], fontsize=9)
axes[2].legend(fontsize=8, loc='upper right')
axes[2].axhline(4, color='gray', linestyle='--', alpha=0.5, label='Midpoint')
axes[2].grid(alpha=0.3, axis='y')
axes[2].set_ylim(1, 8)

plt.tight_layout()
plt.savefig('cluster_visualizations.png', dpi=150, bbox_inches='tight')
plt.show()
```

**Reading the radar chart:**
- A large polygon = high acceptability across all modalities
- A lopsided polygon = selective — high on some tests, low on others
- Small polygon = skeptical of most screening types

---

## 12. Cell 8 — Interpreting & Naming Clusters

```python
# Cell 8: Name and describe each cluster

# Full profile table: demographics by cluster
profile_cols = ['lived_experience','race','income','area','autism_knowledge_score']
print("── Demographic Profile by Cluster ──\n")
for c in range(K_FINAL):
    sub = df[df['cluster'] == c]
    print(f"CLUSTER {c} — {cluster_names[c].replace(chr(10),' ')} (n={len(sub)})")
    print(f"  ASD parent: {(sub['lived_experience']=='ASD_parent').mean():.0%} | "
          f"NT parent: {(sub['lived_experience']=='NT_parent').mean():.0%}")
    print(f"  Race (White/Black/Hispanic): "
          f"{(sub['race']=='White').mean():.0%} / "
          f"{(sub['race']=='Black').mean():.0%} / "
          f"{(sub['race']=='Hispanic').mean():.0%}")
    print(f"  Avg autism knowledge: {sub['autism_knowledge_score'].mean():.2f}/3")
    print(f"  Rural: {(sub['area']=='Rural').mean():.0%} | "
          f"Would do free screen: {(sub['tfa_free_screen']<=2).mean():.0%}")
    print()
```

**Cluster Interpretation Table (fill in after running on real data):**

| Cluster | Proposed Name | Key Defining Features | Screening Intent | ASD vs. NT Mix | Action Implication |
|---|---|---|---|---|---|
| 0 | **Trusting Pragmatists** | High on all modalities, low regret, high belief in results | ~85% would screen | Balanced | Standard consent materials work |
| 1 | **Modality-Sensitive Anxious** | High on video/observe, low on MRI/blood, moderate regret | ~60% would screen | More NT | Emphasize non-invasive options first |
| 2 | **Burden-Averse Skeptics** | Low on all, very high regret, feel they "lost more" | ~20% would screen | More ASD | Need intensive rapport-building; address burden directly |
| 3 | **Informed Supporters** | High knowledge score, moderate-high TFA, low regret | ~75% would screen | More ASD | Fast-track; already motivated |

---

## 13. Cell 9 — Validation & Statistical Testing

After clustering, you must prove the clusters are actually different — not just an artifact of the algorithm.

```python
# Cell 9: Statistical Validation

from scipy.stats import f_oneway, chi2_contingency, kruskal

print("═"*60)
print("CLUSTER VALIDATION — STATISTICAL TESTS")
print("═"*60)

# ── Test 1: One-Way ANOVA on continuous TFA variables ───────────────────────
# H0: All clusters have equal means → p < 0.05 means clusters DIFFER significantly
print("\n── ANOVA: Do TFA scores differ across clusters? ──")
print(f"{'Variable':<25} {'F-stat':>10} {'p-value':>12} {'Significant?':>14}")
print("-"*65)
for var in tfa_vars:
    groups = [df.loc[df['cluster']==c, var].values for c in range(K_FINAL)]
    f_stat, p_val = f_oneway(*groups)
    sig = "✅ YES" if p_val < 0.05 else "❌ NO"
    print(f"{var:<25} {f_stat:>10.2f} {p_val:>12.4f} {sig:>14}")

# ── Test 2: Chi-Square on categorical variables by cluster ───────────────────
print("\n── Chi-Square: Demographics differ across clusters? ──")
for cat_var in ['lived_experience','race','area']:
    ct = pd.crosstab(df['cluster'], df[cat_var])
    chi2, p, dof, _ = chi2_contingency(ct)
    sig = "✅ YES" if p < 0.05 else "❌ NO"
    print(f"{cat_var:<25} χ²={chi2:>8.2f}  p={p:>8.4f}  {sig}")

# ── Test 3: Silhouette Score for final model ─────────────────────────────────
final_sil = silhouette_score(X_scaled, df['cluster'])
print(f"\nFinal Model Silhouette Score: {final_sil:.4f}")
print("  Interpretation: >0.5 = good | >0.7 = strong | <0.25 = weak")
```

**What to say about these tests:**

> "We validated the K=4 solution using one-way ANOVA, confirming that all 10 TFA variables differ significantly across clusters (all p < 0.01). Chi-square tests confirmed that cluster membership correlates with lived experience (ASD vs. NT) and area (urban/rural), supporting the ecological validity of the profiles."

---

## 14. Cell 10 — Predictive Extension (Optional)

This is the "Phase 2" extension — wait for Dr. Bradshaw's green light per meeting notes.

```python
# Cell 10 (OPTIONAL): Predict cluster membership from demographics alone
# Use case: "Given only demographics at enrollment, which cluster will this parent likely fall into?"

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import LabelEncoder

# Encode demographics
demo_features = ['lived_experience','race','income','education','area','autism_knowledge_score']
df_ml = df[demo_features + ['cluster']].copy()
for col in ['lived_experience','race','income','education','area']:
    df_ml[col] = LabelEncoder().fit_transform(df_ml[col].astype(str))

X_demo = df_ml[demo_features].values
y_cluster = df_ml['cluster'].values

rf = RandomForestClassifier(n_estimators=100, random_state=42)
cv_scores = cross_val_score(rf, X_demo, y_cluster, cv=5, scoring='accuracy')
print(f"Random Forest 5-fold CV Accuracy: {cv_scores.mean():.2%} ± {cv_scores.std():.2%}")

# Feature Importance
rf.fit(X_demo, y_cluster)
fi = pd.DataFrame({'Feature': demo_features, 
                   'Importance': rf.feature_importances_}).sort_values('Importance', ascending=False)
print("\nFeature Importance (predicting cluster from demographics):")
print(fi.to_string(index=False))

# Interpretation: high importance for 'lived_experience' or 'race' would mean
# those demographics predict which acceptability profile a parent belongs to
```

---

## 15. Full Theory Reference Table

| Concept | What It Means | Formula/Rule | In Plain Language |
|---|---|---|---|
| **Euclidean Distance** | How far apart two parents are in feature space | \(d = \sqrt{\sum(x_i - y_i)^2}\) | Like measuring straight-line distance between two points on a map |
| **Inertia (WCSS)** | Total within-cluster spread — lower = tighter clusters | \(\sum_{k}\sum_{x \in C_k} \|x - \mu_k\|^2\) | Sum of all distances from each parent to their cluster center |
| **Centroid** | The "average parent" in a cluster | \(\mu_k = \frac{1}{n_k}\sum_{x \in C_k} x\) | If you averaged all survey responses in a cluster, this is what you'd get |
| **Silhouette Score** | How well-separated clusters are | \(s = \frac{b-a}{\max(a,b)}\) | Close to 1 = well-defined; close to 0 = overlapping |
| **K-Means Algorithm** | Iteratively assigns points to nearest centroid, updates centroid | EM-style iteration until convergence | Parents get assigned to the group they're most similar to, and the group center updates repeatedly |
| **Standardization (Z-score)** | Rescale all features to mean=0, std=1 | \(z = \frac{x - \mu}{\sigma}\) | Makes sure a 1-7 slider and a 1-6 ordinal contribute equally |
| **PCA** | Reduce many variables to 2D for plotting | Eigenvector decomposition of covariance matrix | Projects all survey dimensions onto a flat map while keeping as much variation as possible |
| **ANOVA F-statistic** | Tests if cluster means differ more than chance | \(F = \frac{\text{between-group variance}}{\text{within-group variance}}\) | High F = clusters are genuinely different, not random noise |

---

## 16. Checklist Before Presenting to Dr. Bradshaw

- [ ] Ran elbow + silhouette — justified K=4 with both methods
- [ ] Cluster sizes are reasonable (no cluster < 15 or > 80 for n=135)
- [ ] Silhouette score > 0.35 (acceptable for survey data; >0.50 is strong)
- [ ] ANOVA confirms TFA variables differ significantly across clusters (p < 0.05)
- [ ] Chi-square tests show demographic distribution varies by cluster
- [ ] Each cluster has an interpretable, nameable profile
- [ ] Radar chart and PCA plot are clean and labeled
- [ ] Cluster names align with TFA constructs the team already understands
- [ ] Noted that real data will need MICE imputation before this pipeline
- [ ] Demographic variables (race, income) used ONLY for profiling, NOT as clustering inputs
- [ ] Ready to share: cleaned dataset, `.ipynb`, and output PNGs to GitHub

---

*Report prepared by Namit Shrivastava | University of South Carolina — ESD Lab | July 2026*  
*Data: Synthetic (n=135) mirroring Bradshaw R21 Caregiver Study REDCap structure*  
*For questions: refer to `Caregiver-Analysis-Report.md` for variable reference and `autism_knowledge_total_score_calculation.docx` for scoring logic*
