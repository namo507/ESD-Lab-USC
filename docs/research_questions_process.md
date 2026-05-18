# Research Questions — Plain-Language Guide

> Audience: anyone on the NANO team (PI, coordinator, RA, analyst) who
> needs to read, add, or update a research question. No programming
> background required.

## 1. What this is

A single tracked list of every substantive methods / engineering /
reporting question that sits between a raw REDCap event and a
publishable figure. Each item has a category, a type-tag, a priority,
a status, and pointers back to code and documentation.

Three files work together:

- `dashboard/research_questions/research_questions.md` — the human-
  editable SOP. This is the one non-programmers edit.
- `dashboard/research_questions/research_questions.json` — the machine
  payload the dashboard reads. Refreshed by the build script; do **not**
  edit by hand.
- `dashboard/research_questions/build_research_questions_data.py` —
  validates the catalog and rewrites the JSON with recomputed rollups.

## 2. Opening the list

### In the current repository state
The old static dashboard surface that exposed **Research Questions** has
been archived with the retired legacy UI. Until a new SPA surface is added,
use the source markdown and JSON files directly.

### As a document
Open `dashboard/research_questions/research_questions.md` in your
editor or on GitHub.

## 3. Categories and type-tags

Eight **categories** (what the question is about):

1. Dataset Structure
2. Clinical Assessments
3. Missing Data
4. ML Targets
5. Statistical Modeling
6. Data Harmonization
7. NDA Compliance
8. Reproducibility

Eight **type-tags** (what kind of work it unblocks):

- Data Infrastructure
- Data Cleaning
- Data Harmonization
- ML Pipeline
- Statistical Modeling
- Feature Engineering
- NDA Compliance
- Manuscript Writing

A question has exactly one category and exactly one type-tag. The
heatmap on the dashboard shows how many questions land in every
(category, type-tag) pair at a glance.

## 4. Status lifecycle

```
open ───► in_progress ───► resolved
                │
                └────► blocked (rare)
```

* **open** — raised but not yet assigned or scoped.
* **in_progress** — actively being worked on.
* **blocked** — cannot move forward without an external decision
  (e.g., PI sign-off, IRB amendment, access to PHI).
* **resolved** — implementation merged, with a regression test or
  dashboard widget surfacing the answer.

## 5. Adding a new question

1. Open `research_questions.md` and add a stub entry at the end of
   the relevant category section:
   ```
   - **RQ-41** · *Data Cleaning* · **open** · One-sentence question.
   ```
2. Open `research_questions.json` and add the full item with summary,
   implementation plan, assets, and widgets. Keep the schema used by
   the existing 40 entries.
3. From the repo root:
   ```bash
   python dashboard/research_questions/build_research_questions_data.py --check
   python dashboard/research_questions/build_research_questions_data.py
   ```
   The first call validates; the second rewrites rollups and the
   heatmap matrix.
4. Refresh the dashboard (`Cmd+Shift+R`) or let the live Docker
   runtime pick up the change.

## 6. Filtering on the dashboard

* **Search** matches across id, question, summary, implementation
  plan, assets, and widgets.
* **Category**, **Type tag**, **Status**, **Priority** filter the
  card grid.
* Clicking a cell in the heatmap sets the category and type-tag
  filters for you.
* **Clear filters** resets everything.

## 7. Who owns what

See the RACI table in `research_questions.md`. Short version:

| Category | Responsible |
|----------|-------------|
| Dataset Structure, Data Harmonization, Reproducibility, NDA Compliance | Research Programmer |
| Clinical Assessments | Data Coordinator |
| Missing Data | Research Programmer with Co-I (Stats) |
| ML Targets | Research Programmer with Co-I (Stats / ML) |
| Statistical Modeling | Co-I (Stats) |

Accountability always rolls up to the PI.

## 8. Something looks wrong — who do I ask?

| Symptom | First check | Then ask |
|---------|-------------|----------|
| Dashboard shows "catalog not loaded" | Did the build script run? | Research Programmer |
| Question count doesn't match | Did rollups get recomputed? Re-run the build script | Research Programmer |
| Heatmap cell goes blank on click | Confirm category + type-tag strings match exactly | Research Programmer |
| A resolved question reopens | Check git history; the `status` field may have been reverted | PI / Research Programmer |

## 9. Privacy

No PHI ever lives in this catalog. Questions are about methods,
infrastructure, and reporting; any linked asset that could carry PHI
(e.g., a REDCap column) is referred to by name only, never by value.

## 10. Where to go next

* Machine payload schema: `dashboard/context_skill/references/dashboard_schema.md`
* Dashboard user guide: `docs/dashboard_guide.md`
* Auto-update pipeline: `docs/auto_update_pipeline.md`
* Data context skill: `docs/data_context_skill.md`
