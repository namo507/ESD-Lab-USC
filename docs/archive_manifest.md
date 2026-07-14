# Repository Archive and Retention Manifest

The active Git tree contains only sources, tests, runtime data, documentation,
and assets that contribute to building, operating, or validating the dashboard.
Historical design packages and retired implementations are preserved by Git,
not duplicated inside the working tree.

## Recovery point

The annotated tag `pre-dashboard-space-sweep-2026-07-14` points to the exact
repository state before the space sweep. It contains the retired brand source
package, design prototypes, QA screenshots, legacy dashboard shell, and generated
report bundle.

The tag covers Git-tracked content only. Files that were never tracked were moved
to a machine-local archive during the sweep and are not a durable recovery path;
lab-owned source artwork or templates that still matter should be copied to
approved shared storage.

To inspect a retired path without restoring it:

```bash
git ls-tree -r --name-only pre-dashboard-space-sweep-2026-07-14 -- <path>
git show pre-dashboard-space-sweep-2026-07-14:<path>
```

Restore a file only when it has a current owner and a documented runtime or
build consumer. Large source-design packages belong in approved external asset
storage or a GitHub Release, not in the application tree.

## July 2026 sweep

| Retired path | Approximate size | Why it left the active tree | Active replacement |
|---|---:|---|---|
| `ESD Lab Brand Files/` (tracked portion) | 221 MiB | Source artwork, print exports, and repeated color variants were not read by any build or deployment. | Optimized fonts and images in `web/src/assets/brand-esd/` |
| `design-ideas/`, `design-qa/`, `design-qa.md` | 6 MiB | Superseded prompts, duplicate PDFs, prototypes, and screenshots were historical evidence only. | Implemented React sources and tests in `web/src/` |
| `archive/` | 0.7 MiB | Git already preserves the retired implementations; keeping a second source tree caused drift. | Current runtime under `dashboard/` and `web/` |
| Generated `reports/NANO_statistical_analysis*` bundle | 1 MiB | Rebuildable Quarto HTML and vendored browser libraries were not deployed. | `reports/NANO_statistical_analysis.qmd` |
| Legacy dashboard stubs and `scripts/parse_css.py` | 0.1 MiB | Routes are redirected by the server and Pages worker; the files had no runtime consumer. | `dashboard/server/live_dashboard_server.py` and `scripts/build_pages_site.py` |

`scripts/check_repository_hygiene.py` enforces this boundary in CI and rejects
new tracked files larger than 20 MiB. The reading library remains intentionally
tracked because it is indexed into ESD Buddy and the public dashboard.
