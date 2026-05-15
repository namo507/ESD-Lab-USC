# Process Document: NANO Research Questions SOP

**Owner:** Research Programmer (Data & Stats Analyst) &nbsp;•&nbsp; **Accountable:** PI (R01 NANO Study) &nbsp;•&nbsp; **Last Updated:** 2026-04-21 &nbsp;•&nbsp; **Review Cadence:** Quarterly (grant year Q1–Q4)

## Purpose

Hold a single, versioned, plain-language answer to every substantive
question a Data & Statistical Analyst needs to resolve on the NANO
Study. Each question is one item. Each item has: a category, a
type-tag, a priority, a status, an implementation plan, and pointers
back to code, docs, and dashboard widgets. Changes flow through this
document and are surfaced on the dashboard's **Research Questions**
section so the team can track progress week over week.

## Scope

**In scope.** Methodological and infrastructure questions that touch
the REDCap longitudinal project, the feature matrix, the statistical
analysis plan, the machine-learning pipeline, NDA submission, and the
reproducibility stack.

**Out of scope.** Grant-level budget, IRB protocol amendments, and
clinical-decision content that is owned by the PI / study coordinator.
Those live in `docs/` and the IRB system.

## RACI Matrix

| Area | Responsible | Accountable | Consulted | Informed |
|------|-------------|-------------|-----------|----------|
| Dataset Structure | Research Programmer | PI | Data Coordinator, REDCap Admin | Study Team |
| Clinical Assessments | Data Coordinator | PI | Assessors, Co-I (Clinical) | Research Programmer |
| Missing Data | Research Programmer | Co-I (Stats) | Biostatistician | PI |
| ML Targets | Research Programmer | Co-I (Stats) | Co-I (ML), PI | Study Team |
| Statistical Modeling | Co-I (Stats) | PI | Biostatistician | Research Programmer |
| Data Harmonization | Research Programmer | Co-I (Physiology) | Clinical Engineer | Study Team |
| NDA Compliance | Research Programmer | PI | IRB, Data Sharing Lead | NIH PO |
| Reproducibility | Research Programmer | PI | Co-I (ML), Biostatistician | Reviewers |

## Process Flow

```
   ┌─────────────────────┐
   │ New question raised │◄──────────────────────┐
   └──────────┬──────────┘                       │
              │                                  │
              ▼                                  │
   ┌─────────────────────┐    needs more info   │
   │  Draft entry in     │────────────────────► │
   │  research_questions │                       │
   │  .md                │                       │
   └──────────┬──────────┘                       │
              │                                  │
              ▼                                  │
   ┌─────────────────────┐                       │
   │ Sync rollups via    │                       │
   │ build_research_...  │                       │
   │ _data.py            │                       │
   └──────────┬──────────┘                       │
              │                                  │
              ▼                                  │
   ┌─────────────────────┐                       │
   │ Review on dashboard │                       │
   │ Research Questions  │                       │
   │ section (heatmap +  │                       │
   │ card grid)          │                       │
   └──────────┬──────────┘                       │
              │                                  │
   ┌──────────┼──────────┐                       │
   ▼          ▼          ▼                       │
  open   in_progress  resolved ─────► archive ──►┘
```

## Detailed Steps

### Step 1: Raise a question

- **Who**: Any member of the study team (PI, Coordinator, RA, Analyst, Co-I).
- **When**: Whenever an ambiguity or decision point surfaces — during
  a meeting, during code review, or when writing a manuscript figure.
- **How**: Add a stub entry to `research_questions.md` with a working
  title, category, and tag. Leave status as `open`.
- **Output**: Draft entry with a unique `RQ-##` id.

### Step 2: Categorize and tag

- **Who**: Research Programmer.
- **When**: Within one business day of stub creation.
- **How**: Assign one **category** (Dataset Structure, Clinical
  Assessments, Missing Data, ML Targets, Statistical Modeling, Data
  Harmonization, NDA Compliance, Reproducibility) and one
  **type-tag** (Data Infrastructure, Data Cleaning, Data Harmonization,
  ML Pipeline, Statistical Modeling, Feature Engineering, NDA
  Compliance, Manuscript Writing). Assign a priority (critical / high /
  medium / low) with the Accountable lead.
- **Output**: Fully tagged item.

### Step 3: Draft plain-language summary and implementation plan

- **Who**: Responsible party per the RACI matrix.
- **When**: Within one week of intake.
- **How**: Plain-language summary (≤ 3 sentences) states the answer
  the way a non-technical team member needs to hear it. Implementation
  plan names the file(s), helper function(s), and the unit test that
  will enforce it. Capture linked assets and the dashboard widget(s)
  that will visualize progress.
- **Output**: `summary`, `implementation`, `assets[]`, `widgets[]`.

### Step 4: Rebuild rollups

- **Who**: Research Programmer.
- **When**: Every time `research_questions.md` changes, and nightly as
  part of the dashboard build.
- **How**: `python dashboard/research_questions/build_research_questions_data.py`
  regenerates `research_questions.json` from the Markdown source
  (or directly from a curated JSON payload) and refreshes rollup
  counts by category, type, status, and priority.
- **Output**: `research_questions.json` consumed by the dashboard's
  Research Questions section.

### Step 5: Review on the dashboard

- **Who**: PI + Research Programmer.
- **When**: Weekly operational review.
- **How**: Open the dashboard's **Research Questions** section.
  Inspect the KPI strip, the Category × Type-tag heatmap, and the
  filterable card grid. Change priorities, reassign responsibility,
  and mark items as `in_progress` / `resolved` / `blocked`.
- **Output**: Updated statuses + action items.

### Step 6: Close out and archive

- **Who**: Research Programmer + Accountable lead.
- **When**: When the implementation is merged and a regression test
  exists.
- **How**: Flip status to `resolved`, record the merge SHA in the
  `implementation` block, link the dashboard widget (and its snapshot)
  that now surfaces the answer.
- **Output**: Resolved item; archival entry in `docs/archive_manifest.md`.

## Exceptions and Edge Cases

| Scenario | What to Do |
|----------|-----------|
| Question cannot be answered without PHI access | Mark `blocked`; route to PI for access decision. |
| Answer requires grant amendment | Escalate to PI + IRB before continuing. |
| Two questions overlap substantially | Merge into the earlier `RQ-##`; keep the newer id as a pointer for audit. |
| Category not in the controlled list | Raise a new category proposal in `entities.md`; do **not** silently add. |
| Dashboard view not yet built | Leave `widgets: []`; open a follow-up ticket to build it. |
| Sensitive answer (security, consent details) | Keep in `docs/internal/`, not in the dashboard JSON. |

## Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Open questions | ≤ 20 at any time | Count where `status == "open"` |
| In-progress questions | ≤ 15 at any time | Count where `status == "in_progress"` |
| Critical questions resolved within 30 days | ≥ 80% | Diff `last_updated` vs. resolution merge SHA date |
| Coverage (questions with full summary + implementation + assets) | 100% | Validator in `build_research_questions_data.py` |
| Dashboard rendering parity | JSON rollups = live counts | Contract test in `tests/test_research_questions_contract.py` |

## Question Catalog (40 items)

> The canonical payload is `research_questions.json`. The text below
> mirrors it for readability. Any edit here must be followed by a
> build-script run so the JSON stays in sync.

### 1 · Dataset Structure

- **RQ-01** · *Data Infrastructure* · **in_progress** · What is the
  canonical participant × event × instrument long-format schema, and
  how should it normalize against REDCap exports?
- **RQ-02** · *Data Infrastructure* · **resolved** · How are the three
  cohort groups (ASIB, PT, TD) encoded, and what controlled
  vocabulary covers all longitudinal events (NICU, 1/2/3/6/9/12/24/36
  months CGA)?
- **RQ-03** · *Data Infrastructure* · **open** · Should the feature
  matrix live in wide or long format, and which is optimal for
  mixed-effects vs. ML downstream?
- **RQ-04** · *Feature Engineering* · **in_progress** · Which derived
  variables (HRV indices, PRS, HDA phases) belong in the raw features
  table vs. a higher-level feature-matrix layer?
- **RQ-05** · *Data Infrastructure* · **resolved** · What is the PHI
  surface area in the raw dataset, and which columns require
  hashing / surrogate encoding before any analysis?

### 2 · Clinical Assessments

- **RQ-06** · *Data Harmonization* · **in_progress** · How do we
  harmonize the 3-month Bayley-4 with legacy Bayley-3 scores collected
  at earlier timepoints?
- **RQ-07** · *Data Cleaning* · **open** · What is the handling rule
  for assessors scoring an item at modified vs. corrected age?
- **RQ-08** · *Data Harmonization* · **in_progress** · How are ADOS,
  M-CHAT-R, and SCQ scores reconciled across age-appropriate
  instruments over the 36-month window?
- **RQ-09** · *Statistical Modeling* · **open** · What algorithm
  operationalizes "clinically significant developmental concern" from
  composite scores?
- **RQ-10** · *Data Cleaning* · **open** · How should we document
  inter-rater reliability for each instrument and integrate ICC into
  the dashboard?

### 3 · Missing Data

- **RQ-11** · *Statistical Modeling* · **in_progress** · What is the
  MCAR/MAR/MNAR assumption per instrument, and how do we test it
  empirically?
- **RQ-12** · *Statistical Modeling* · **resolved** · How many MICE
  iterations (m) are sufficient for longitudinal HRV + Bayley?
- **RQ-13** · *Feature Engineering* · **in_progress** · What auxiliary
  variables should enter the imputation model to improve MAR
  plausibility?
- **RQ-14** · *Statistical Modeling* · **open** · How do we pool
  estimates across imputations for mixed-effects and latent growth
  models?
- **RQ-15** · *Statistical Modeling* · **open** · When should we
  prefer FIML (lavaan) over multiple imputation for structural models?

### 4 · ML Targets

- **RQ-16** · *ML Pipeline* · **in_progress** · What is the primary
  prediction target — binary autism-risk at 24m, continuous ADOS
  calibrated severity, or trajectory cluster membership?
- **RQ-17** · *ML Pipeline* · **in_progress** · How do we handle label
  leakage when a visit used to compute features overlaps the outcome
  assessment?
- **RQ-18** · *ML Pipeline* · **open** · What is the minimum effective
  sample size per class for RF/XGB vs. deep models?
- **RQ-19** · *ML Pipeline* · **in_progress** · How should class
  imbalance be addressed — reweighting, focal loss, time-series SMOTE?
- **RQ-20** · *ML Pipeline* · **open** · Which secondary targets give
  enough power for multi-task learning?

### 5 · Statistical Modeling

- **RQ-21** · *Statistical Modeling* · **in_progress** · What is the
  preferred mixed-effects specification for HRV trajectories by group?
- **RQ-22** · *Statistical Modeling* · **open** · For LGCM, do we fit
  linear, quadratic, or piecewise slopes given 9 unevenly spaced
  timepoints?
- **RQ-23** · *Statistical Modeling* · **in_progress** · How are
  family-wise error rates controlled across the HRV biomarker panel?
- **RQ-24** · *Statistical Modeling* · **open** · Which covariates are
  pre-registered, and which are time-varying vs. baseline?
- **RQ-25** · *Statistical Modeling* · **resolved** · What is the
  power analysis basis for detecting group × time interaction at
  α=0.05 with 260 infants?

### 6 · Data Harmonization

- **RQ-26** · *Feature Engineering* · **in_progress** · How do we
  harmonize ECG sampling rates (1024 Hz vs. 500 Hz) before HRV feature
  extraction?
- **RQ-27** · *Data Cleaning* · **resolved** · What is the policy for
  segment rejection (artifact %, ectopic beats, minimum clean length)?
- **RQ-28** · *Feature Engineering* · **in_progress** · How are
  age-corrected z-scores computed, and from which normative reference?
- **RQ-29** · *NDA Compliance* · **open** · How do we align REDCap
  event names with NDA experiment IDs and assessment definitions?
- **RQ-30** · *Data Harmonization* · **open** · What crosswalk
  resolves caregiver-report instruments (PSI, CES-D, EPDS) between
  English and Spanish versions?

### 7 · NDA Compliance

- **RQ-31** · *NDA Compliance* · **in_progress** · Which NDA GUIDs are
  required per participant, and when in the protocol are they
  generated?
- **RQ-32** · *NDA Compliance* · **in_progress** · What is the mapping
  between our local variables and the NDA `ndar_subject01` /
  `bayley_scales01` / `asd_screening01` data structures?
- **RQ-33** · *NDA Compliance* · **open** · How do we stage raw ECG
  waveforms for NDA upload while keeping PHI stripped?
- **RQ-34** · *NDA Compliance* · **open** · What are the NDA
  submission deadlines relative to R01 grant year, and what is our QA
  gate?
- **RQ-35** · *NDA Compliance* · **open** · How do we version NDA
  submissions so corrections are traceable to REDCap audit entries?

### 8 · Reproducibility

- **RQ-36** · *Data Infrastructure* · **in_progress** · What is the
  CI pipeline that re-runs the full dashboard build on every commit?
- **RQ-37** · *Data Infrastructure* · **resolved** · How are random
  seeds controlled across Python and R for full replay?
- **RQ-38** · *Data Infrastructure* · **in_progress** · What is the
  containerization story (docker compose) such that a collaborator
  can reproduce a figure in < 30 minutes?
- **RQ-39** · *Data Infrastructure* · **open** · How are intermediate
  artifacts versioned — DVC, git-lfs, or MLflow?
- **RQ-40** · *Manuscript Writing* · **open** · How do we issue a
  manuscript-ready reproducibility appendix mapping every figure to a
  commit SHA and data hash?

## Related Documents

- Machine-readable catalog: `dashboard/research_questions/research_questions.json`
- Build pipeline: `dashboard/research_questions/build_research_questions_data.py`
- Dashboard overview: `docs/dashboard_overview.md`
- Data context skill: `docs/data_context_skill.md`
- Statistical analysis plan: `docs/statistical_analysis_plan.md`
- Auto-update pipeline: `docs/auto_update_pipeline.md`
- HIPAA checklist: `docs/hipaa_compliance_checklist.md`
- Archive manifest: `docs/archive_manifest.md`
