# NANO Dashboard Context Skill — How to Keep It Honest

> Audience: the Research Programmer and any analyst who changes the
> pipeline schema or adds a new field.

## 1. What is the context skill?

A folder of Markdown files under
`dashboard/context_skill/` that acts as the **single source of
tribal knowledge** for the dashboard: group codes, metric definitions,
REDCap column meanings, QC flag severity. Anyone (human or AI
assistant) can read those files and produce a correct answer about
the study without having to re-read the 260-column data dictionary.

It is deliberately low-tech:

* Plain Markdown tables (no CMS, no server).
* One topic per file.
* `SKILL.md` is the index.
* `extract_context.py` checks that the files still match the code.

## 2. Layout

```
dashboard/context_skill/
├── SKILL.md                 ← index; what's in each reference
├── extract_context.py       ← drift checker
└── references/
    ├── entities.md          ← people, groups, events, tools
    ├── metrics.md           ← biomarker + ML metric definitions
    ├── dashboard_schema.md  ← JSON key → data source
    ├── qc_flags.md          ← every QC flag, meaning, owner
    └── tables/
        ├── redcap.md        ← REDCap mirror columns
        └── feature_matrix.md ← feature matrix columns
```

## 3. When to update it

* **Added a REDCap field** → add a row to
  `references/tables/redcap.md`.
* **Added a biomarker** → add an entry to `references/metrics.md` AND
  `references/tables/feature_matrix.md`.
* **Added a QC flag** → add a row to `references/qc_flags.md`.
* **Changed the dashboard JSON shape** → update
  `references/dashboard_schema.md`.

## 4. The drift check

```bash
python dashboard/context_skill/extract_context.py --check
```

This script:

1. Reads the master data dictionary.
2. Parses the Python pipeline for every `df.get("col")` / `df["col"]`.
3. Compares against the columns listed in the Markdown tables.
4. Exits non-zero if it finds drift (so CI can enforce it).

Sample output:

```
⚠  Columns in pipeline but NOT documented in Markdown (1):
   - visit_completed
⚠  Columns in Markdown but NOT used by the pipeline (possibly stale) (2):
   - legacy_event_id
   - deprecated_score
✗ 2 drift category(ies) detected. Update references/*.md.
```

## 5. Why not just regenerate it from the dictionary?

Because the data dictionary only knows **mechanics** (types, labels).
The context skill captures **meaning**:

* Why CPTd matters for ASIB vs TD
* Why RSA is log-transformed
* Why `month_24` has so much missingness (it's a questionnaire-only
  event by design)
* Which QC flag belongs to which person

That kind of knowledge can only live in Markdown that analysts
hand-edit.

## 6. Using the skill from Claude

If you're working in Cowork mode, Claude can invoke this as a skill
(`/data:data-context-extractor`) and the instructions in `SKILL.md`
will point Claude at the right reference file. Any answer Claude
produces about the dashboard will then cite the reference doc it
read, which keeps the team aligned.

## 7. Ownership

* **Maintained by:** Research Programmer
* **Reviewed by:** PI (Dr. Bradshaw) quarterly
* **Breaking changes:** require a pull request that updates both
  `SKILL.md` and the affected references, plus a passing
  `extract_context.py --check`.
