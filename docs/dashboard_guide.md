# NANO Dashboard — Plain-Language Guide

> Audience: anyone on the NANO team (PI, coordinator, RA, analyst) who
> wants to open the dashboard, understand what they're seeing, and know
> where the numbers came from. No programming background required.

## 1. What is the dashboard?

A single web page (`dashboard/index.html`) that shows, at a glance,
**the current state of the NANO Study**. It is generated from a small
JSON file (`dashboard/data/dashboard_data.json`) that the nightly
pipeline rebuilds from REDCap and the feature matrix.

The dashboard is *static* — no server, no database. You can email it,
zip it, or host it on a lab shared drive.

## 2. Opening the dashboard

### Option A — Double-click (easiest)
Navigate to `dashboard/index.html` in Finder / File Explorer and
double-click. It opens in your default browser.

### Option B — From a URL (if you host it)
```
https://<lab-server>/nano/dashboard/
```

If the charts look blank, make sure the file
`dashboard/data/dashboard_data.json` exists next to `index.html`.

## 3. Six sections, one per tab

| Tab | What it answers | Key widgets |
|-----|------------------|-------------|
| **Overview** | Where are we vs. the R01 plan? | Enrollment line chart, progress stacked bar, 5 KPI cards |
| **Pipeline** | How does raw data become a finding? | Clickable SVG with 13 step explainers |
| **Data Quality** | Are we clean enough to analyze? | Missingness bar, QC flag cards, queries-per-event chart, audit table |
| **ML Performance** | Are our models any good? | ROC curves, AUROC with CI, SHAP, subgroup sensitivity, confusion summary |
| **Trajectories** | Are the groups diverging over time? | Biomarker trajectory with CI bands, visit completion bars, intercept/slope table |
| **Cohort Table** | Who's in the sample right now? | Sortable, filterable participant table (surrogate IDs only) |

## 4. Understanding the ‘i’ hint pop-ups

Every KPI card has a small `i` icon in the corner. Click it and you
see:

* **What:** plain definition of the metric.
* **Why it matters:** scientific or operational reason we care.
* **Pulled from:** the exact REDCap field or pipeline step.

The same plain-language information is the canonical truth in
`dashboard/context_skill/references/`.

## 5. How the numbers get there

```
 REDCap  ──┐
            ├──► build_dashboard_data.{py, R} ──► dashboard_data.json ──► index.html
 Features ─┤        (aggregates, PHI scrub)
 Models  ──┘
```

1. **Nightly cron** (`scripts/redcap_daily_sync.py`) pulls REDCap and
   runs QC.
2. **Pipeline** (`dashboard/pipelines/build_dashboard_data.py`) joins
   REDCap + features + model metrics, strips PHI, and writes the JSON.
3. **Dashboard** (`dashboard/index.html`) reads the JSON in the
   browser and draws everything with Chart.js.

## 6. Something looks wrong — who do I ask?

| Symptom | First check | Then ask |
|---------|-------------|----------|
| Enrollment number too low | `data_source` chip in top bar — is it `synthetic_demo`? | Research Programmer |
| ROC curve missing | `models/_metrics.json` present? | Co-I O'Reilly |
| A participant in the table should not be there | `cohort_table` in JSON | Data Coordinator |
| Numbers changed unexpectedly | Diff today's `dashboard_data.json` vs yesterday's | Research Programmer |

## 7. Privacy

No PHI ever appears on the dashboard:

* Names, phone numbers, MRNs, birthdays are stripped before
  aggregation (see `dashboard/pipelines/build_dashboard_data.py ::
  drop_phi`).
* Participant IDs are replaced with surrogate `NANO-####` codes.
* Everything rendered is group-level or a surrogate row — nothing that
  could identify an infant or a caregiver.

## 8. Where to go next

* Technical pipeline: `docs/auto_update_pipeline.md`
* Maintaining the context / glossary: `docs/data_context_skill.md`
* Archive & undo: `docs/archive_manifest.md`
