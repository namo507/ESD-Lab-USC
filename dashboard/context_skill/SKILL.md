---
name: nano-dashboard-context
description: |
  Company-specific context pack for the NANO Study dashboard. Teaches Claude
  the lab's tribal knowledge: table layouts, metric definitions, group
  shorthand (ASIB/PT/TD), event codes, biomarker acronyms, and the standard
  aggregation patterns used in `dashboard/pipelines/build_dashboard_data.{py,R}`.
  Use this skill whenever someone asks about the dashboard data, a metric,
  a QC flag, or the relationship between a REDCap field and what the UI shows.
---

# NANO Dashboard Context Skill

This skill is a **local knowledge base** for the NANO Study dashboard
pipeline. It exists so that any analyst (or Claude) can answer questions
like:

- "What does `HDA_SA` mean?"
- "Which REDCap field populates the *Open Queries* KPI?"
- "Why do ASIB trajectories look flatter than TD?"

without having to re-read the 260-column data dictionary.

---

## How to use this skill

1. Read `references/entities.md` first — it defines the study vocabulary.
2. For a specific UI widget, open `references/dashboard_schema.md` to see
   the JSON key, the REDCap / feature source, and the computation.
3. For a specific biomarker, open `references/metrics.md`.
4. For a table-level question, open `references/tables/redcap.md` or
   `references/tables/feature_matrix.md`.

All references are plain Markdown so they can be updated by non-programmers.

---

## What this skill does NOT contain

- No PHI, no participant identifiers, no raw data.
- No production API tokens (those live in `.env`).
- No statistical theory — for that, see `docs/statistical_methods.md`.

---

## Keeping this skill up to date

Run the Python extractor below after any pipeline schema change:

```bash
python dashboard/context_skill/extract_context.py --check
```

It scans the data dictionary + feature matrix + pipeline code and prints
any references that are out of sync with reality.

---

## Index

| File | Purpose |
|------|---------|
| `references/entities.md`          | Groups, events, people, tooling |
| `references/metrics.md`           | Biomarker + ML metric definitions |
| `references/dashboard_schema.md`  | JSON key → data source mapping |
| `references/tables/redcap.md`     | REDCap mirror column glossary |
| `references/tables/feature_matrix.md` | Wide feature matrix columns |
| `references/qc_flags.md`          | All QC flag codes, meaning, and action |
| `extract_context.py`              | Helper that keeps the skill in sync |
