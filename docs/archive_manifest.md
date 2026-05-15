# Archive Manifest — Dashboard Refactor (2026-04-17)

> Audience: anyone wondering why a file they remember is no longer
> where it used to be, or why a file has a "DEPRECATED" banner at the
> top.

## 1. Philosophy

**Conservative archiving.** Nothing is deleted. Every archived file is
preserved in full inside `archive/<date>_<reason>/` and the live copy
is replaced with a short *deprecation stub* that:

1. Explains what happened.
2. Points to the replacement.
3. Forwards any runtime call to the canonical script, so existing
   cron jobs and README instructions keep working.

That keeps git history clean, keeps automations working, and makes
roll-back a one-line `cp`.

## 2. Who decides?

A file is eligible for archival only if **all** of these are true:

* Its functionality is fully covered by another module.
* That other module is clearly canonical (more recently updated, more
  widely imported, or explicitly documented as the source of truth).
* A human reviewer signed off on the decision.
* A restoration procedure is documented in the archive manifest for
  that batch.

## 3. Batches

### `archive/2026-04-17_dashboard_refactor/`

| Original | Moved because | Replacement |
|----------|---------------|-------------|
| `redcap/api/redcap_audit.py` | Duplicated ~90% of `scripts/generate_data_quality_report.py`; the two had silently drifted out of sync, producing different completeness numbers on two different weeks. | `scripts/generate_data_quality_report.py` + `dashboard/pipelines/build_dashboard_data.py::build_redcap_audit()` |

Full restoration procedure is in
`archive/2026-04-17_dashboard_refactor/MANIFEST.md`.

## 4. How to find the old version

```bash
find archive/ -name "<filename>"
```

or, if you want a diff against the current stub:

```bash
diff archive/2026-04-17_dashboard_refactor/redcap_audit.py \
     redcap/api/redcap_audit.py
```

## 5. Adding a new archival batch

1. Create a dated directory: `archive/YYYY-MM-DD_<short-reason>/`
2. Copy the original files into it **unchanged**.
3. Replace the live copy with a deprecation stub that points to the
   replacement (use the pattern in
   `redcap/api/redcap_audit.py` as a template).
4. Add a `MANIFEST.md` inside the batch directory listing each file
   with `Original path / Replacement path / Reason / Date / Reviewer`.
5. Append a row to section 3 of this document.
6. Open a PR with the title `archive: <short-reason>` and a reviewer
   from the affected team.

## 6. Deleting a batch (permanent)

We don't. An archive stays for the lifetime of the project unless
storage becomes an actual problem, in which case the PI signs off.
