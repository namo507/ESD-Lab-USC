# NANO Dashboard — Plain-Language Guide

> Audience: anyone on the NANO team (PI, coordinator, RA, analyst) who
> wants to open the dashboard, understand what they're seeing, and know
> where the numbers came from. No programming background required.

## 1. What is the dashboard?

A single web page (`dashboard/index.html`) that shows, at a glance,
**the current state of the NANO Study**. It is generated from a small
JSON file (`dashboard/data/dashboard_data.json`) that the nightly
pipeline rebuilds from REDCap and the feature matrix.

The dashboard can still be hosted as static files, but the repository now
also includes a lightweight live runtime that serves the site, watches the
source folders, and refreshes the generated JSON outputs automatically.

The page also now includes a compact jump atlas near the top and smaller
local jump chips inside each section so team members can hop directly to
specific panels instead of scrolling through the full dashboard in one pass.
There is also a topbar view panel for deeper jumps across the page plus a
small theme control that can stay on automatic day/night mode or be forced
into light or dark mode for presentations.
The landing page now defaults to a homepage snapshot so the most important
operational metrics appear first, while the view panel can open dedicated
section views or restore the full long-form dashboard when needed.

## 2. Opening the dashboard

### Option A — Double-click (easiest)
Navigate to `dashboard/index.html` in Finder / File Explorer and
double-click. It opens in your default browser.

### Option B — Live Docker runtime (recommended)

```bash
docker compose up --build dashboard
```

Then open `http://localhost:8080/dashboard/`.

If you need to share the dashboard with someone outside your machine, run:

```bash
bash scripts/share_dashboard.sh
```

That prints a temporary public URL backed by the live Docker runtime.

### Option C — From a URL (if you host it)
```
https://<lab-server>/nano/dashboard/
```

If the charts look blank, make sure the file
`dashboard/data/dashboard_data.json` exists next to `index.html`.
If the reading library is empty, make sure
`dashboard/data/readings_data.json` has been generated.

## 3. Seven sections on one continuous page

| Tab | What it answers | Key widgets |
|-----|------------------|-------------|
| **Overview** | Where are we vs. the R01 plan? | Enrollment line chart, progress stacked bar, 5 KPI cards |
| **Pipeline** | How does raw data become a finding? | Clickable SVG with 13 step explainers |
| **Data Quality** | Are we clean enough to analyze? | Missingness bar, QC flag cards, queries-per-event chart, audit table |
| **ML Performance** | Are our models any good, and how do they work? | Architecture explainer animation, model-specific schematics, methods citation links, ROC curves, AUROC with CI, SHAP, subgroup sensitivity, confusion summary |
| **Trajectories** | Are the groups diverging over time? | Biomarker trajectory with CI bands, visit completion bars, intercept/slope table |
| **Cohort Table** | Who's in the sample right now? | Sortable, filterable participant table (surrogate IDs only) |
| **Reading Library** | What new papers and materials have landed in the repo? | Searchable PDF cards, category chips, latest-update stats |

## 4. Understanding the ‘i’ hint pop-ups

Every KPI card has a small `i` icon in the corner. Click it and you
see:

* **What:** plain definition of the metric.
* **Why it matters:** scientific or operational reason we care.
* **Pulled from:** the exact REDCap field or pipeline step.

The same plain-language information is the canonical truth in
`dashboard/context_skill/references/`.

For navigation, the quickest options are:

* **Jump atlas:** the card strip near the top of the page for fast entry
   into major dashboard areas.
* **View panel:** the topbar drawer for jumping into specific embedded
   views such as the ML explainer, quality panels, trajectory chart, or
   reading library. It also switches between the homepage snapshot,
   focused section views, and the full dashboard browse mode.
* **Local jump chips:** the small embedded links inside each section for
   moving directly to a chart, table, or explainer within that section.
* **Sidebar:** the persistent left navigation for the main sections only.

For visual comfort, use the topbar theme selector:

* **Auto:** switches between light and dark based on local time.
* **Light / Dark:** locks the dashboard into one theme until you change it.

## 5. How the numbers get there

```
 REDCap / Features / Models ──► build_dashboard_data.{py, R} ──► dashboard_data.json ──► index.html
 ESD Lab readings/           ──► build_readings_index.py       ──► readings_data.json  ──► index.html
```

1. **Nightly cron** (`scripts/redcap_daily_sync.py`) pulls REDCap and
   runs QC.
2. **Pipeline** (`dashboard/pipelines/build_dashboard_data.py`) joins
   REDCap + features + model metrics, strips PHI, and writes the JSON.
3. **Readings index** (`dashboard/pipelines/build_readings_index.py`)
   scans `ESD Lab readings/` and writes the searchable reading library.
4. **Dashboard** (`dashboard/index.html`) reads both JSON files in the
   browser, animates updates, redraws the charts with Chart.js, and
   derives the ML architecture explainer from the best model and SHAP
   fields already present in `dashboard_data.json`.

## 6. Something looks wrong — who do I ask?

| Symptom | First check | Then ask |
|---------|-------------|----------|
| Enrollment number too low | `data_source` chip in top bar — is it `synthetic_demo`? | Research Programmer |
| ROC curve missing | `models/_metrics.json` present? | Co-I O'Reilly |
| A participant in the table should not be there | `cohort_table` in JSON | Data Coordinator |
| Reading library missing a PDF | `dashboard/data/readings_data.json` regenerated after the file was added? | Research Programmer |
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
