# Repository Clean-Sweep Audit — `namo507/ESD-Lab-USC`

**Repo:** NANO Study dashboard & analysis pipeline — ESD Lab, University of South Carolina
**Audited:** 2026-06-05 · commit on `main` (fresh clone) · 546 files (excl. `.git`)
**Stack:** Python (85 `.py`), React/TypeScript (`web/`, 87 `.tsx`/38 `.ts`), R (10), MATLAB (11 `.m`), Jupyter (7 `.ipynb`), k8s/Helm + Docker, REDCap integration

> Historical audit: the tracked build-artifact and archive bloat findings were
> resolved by the July 2026 repository sweep. See `docs/archive_manifest.md`.

## Verdict

**Approve with minor changes.** This is a mature, well-organized research repository — not the loose notebook dump the audit template assumes. There are **no CRITICAL issues**: no leaked credentials, no PHI committed, no syntax errors, no broken pipeline entry point. The real problems are one dependency-name bug, several unused heavy dependencies, and committed build artifacts/bloat. Everything below is fixable in under an hour.

**Health Score: 81 / 100** (see Section D).

---

## A) Critical & High-Severity Issues

| # | File | Line | Issue | Severity | Fix |
|---|------|------|-------|----------|-----|
| H1 | `requirements.txt` | 29 | `redcap>=1.1.0` is the **wrong package name**. The REDCap client used in code (`import redcap` → `redcap.Project`) is **PyCap**, published on PyPI as `pycap`. `pip install -r requirements.txt` will not install the intended library; REDCap pull/push will fail at runtime. | **HIGH** | Replace with `pycap>=1.1.0`. (PyCap installs as `pycap`, imports as `redcap`.) |
| H2 | `requirements.txt` | 32–34 | `langchain`, `langchain-community`, `pinecone-client` are listed but imported **nowhere** in the codebase. They pull a very large, frequently-conflicting dependency tree and slow/break installs for no benefit. (The actual assistant uses `llama-cpp-python`, declared separately.) | **HIGH** | Remove lines 32–34, or move to an optional `requirements-rag.txt` if planned for future use. |
| H3 | `Dashboard ESD-handoff.tar.gz` (root) + `web/build-merge/**` | — | An **8.85 MB tarball** and a full **built/minified web bundle** (incl. **17 `.js.map` source maps**) are committed and **not** covered by `.gitignore`. This bloats every clone and ships source maps publicly. | **HIGH** | `git rm --cached` them and add ignore rules (Section C). Distribute the tarball via Releases, not Git. |

> No CRITICAL-severity findings. Stated plainly because the audit template expects a CRITICAL row — there genuinely isn't one. Secrets, PHI, and parse-integrity all came back clean.

---

## B) Medium / Low Issues (grouped by area)

### Dependencies & reproducibility — MEDIUM

- **`requirements.txt:8,14,26,39,75`** — `mne`, `statsmodels`, `fancyimpute`, `plotly`, `shap` are declared but not imported in any `.py`/`.ipynb`. Either dead weight or a sign of planned-but-unwritten analysis. Confirm and prune, or add the code that uses them. *(MEDIUM — bloat)*
- **`src/models/transformer_ecg.py`, `src/models/deep_learning_ecg.py`** — Torch training loops with **no `torch.manual_seed(...)`** (and no CUDA determinism flags). Results are non-reproducible run-to-run even though 29 seed calls exist elsewhere. *(MEDIUM — reproducibility)*
- **`requirements.txt` (whole file)** — Only lower-bound pins (`>=`). No upper bounds and no lockfile, so a future `pip install` can silently pull breaking majors (e.g. a new `numpy`/`torch`). R side is properly locked via `renv.lock`; Python is not. *(MEDIUM)*
- **`dashboard/requirements.txt`** — `huggingface-hub>=1.0.0`. I'm not certain this lower bound resolves on PyPI today; please verify it installs, since an unsatisfiable pin would break the dashboard image build. *(LOW — verify)*
- **7 notebooks (`notebooks/*.ipynb`)** — All cells have `execution_count: null` and **zero saved outputs**: the notebooks have never been run (or were stripped). You can't tell from the repo whether they execute cleanly. This is *defensible* (avoids committing PHI in outputs, keeps diffs small), but it means the walkthroughs are unverified. Consider running them against synthetic data and committing those outputs, or add a CI smoke-run. *(MEDIUM — verifiability)*

### Repo hygiene & structure — MEDIUM/LOW

- **Duplicate large HTML** — `design-ideas/dashboard-esd-buddy-feature/Dashboard ESD v2 (standalone).html`, `design-ideas/Dashboard ESD v2 _standalone_.html`, and `web/dashboard-source.html` are **byte-identical** (md5 `0b9eaeec35`, 2.9 MB each); two more near-duplicate standalone HTMLs sit alongside. ~10 MB of duplicated generated markup. *(MEDIUM — bloat)*
- **`parse_css.py` (repo root)** — Orphaned: referenced by no script, Makefile, or doc. Loose utility dumped at root. *(LOW — move to `scripts/` or delete)*
- **Root clutter** — `frontendUI.md` (belongs in `docs/`), `NANO_Dashboard_Team_QA.pptx` (binary at root), and the H3 tarball break the otherwise-clean layout. *(LOW)*
- **`archive/` in-tree** — `archive/2026-04-17_dashboard_refactor/` and `archive/2026-05-18_legacy_dashboard_ui/` (680 KB) keep superseded code in the working tree. Prefer a git tag/branch. *(LOW)*

### Code quality & docs — LOW

- **Docstring coverage 88%** across `src/` + `redcap/` (125/142 functions+classes). 17 public callables undocumented. *(LOW)*
- **Two monolith modules** — `dashboard/server/live_dashboard_server.py` (**2,314 lines**) and `dashboard/assistant/local_chat_assistant.py` (**2,415 lines**). Hard to test and review; candidates for splitting by responsibility. *(LOW–MEDIUM — maintainability)*
- **`redcap/__init__.py`** — The PyCap/local-package namespace-merge shim is clever but fragile: it `break`s after the first `redcap/` dir on `sys.path` and depends on PyCap installing under that exact name. Add a guard/test so a future path change doesn't silently shadow `redcap.Project`. *(LOW)*
- **`.env.example` / `data/raw/.gitkeep`** — Contain real PI email addresses (`bradshaw@…`, `oreilly@…`, `bradshawj@…`). Not subject PII, but generic placeholders (`pi@institution.edu`) are cleaner for a public repo. *(LOW)*

---

## C) Clean-Sweep Action Plan (prioritized)

1. **Fix the REDCap dependency (H1).** In `requirements.txt` line 29, change `redcap>=1.1.0` → `pycap>=1.1.0`. Re-run `pip install -r requirements.txt` and `pytest tests/test_redcap_api.py` to confirm.
2. **Drop unused heavy deps (H2 + MEDIUM).** Remove `langchain`, `langchain-community`, `pinecone-client` (lines 32–34). Verify and likely remove `mne`, `statsmodels`, `fancyimpute`, `plotly`, `shap` (lines 8, 14, 26, 39, 75) — keep only what's imported.
3. **Untrack build artifacts (H3).** Run:
   ```bash
   git rm --cached "Dashboard ESD-handoff.tar.gz"
   git rm -r --cached web/build-merge
   ```
4. **Extend `.gitignore`** with the rules it's missing:
   ```gitignore
   *.tar.gz
   *.map
   web/build-merge/
   web/dist/
   *.pptx
   ```
5. **De-duplicate the standalone HTMLs.** Keep one canonical copy (e.g. under `web/`), delete the byte-identical copies under `design-ideas/`, and reference the survivor.
6. **Seed the deep-learning trainers.** Add `torch.manual_seed(SEED)` (+ `np.random.seed`, and `torch.backends.cudnn.deterministic=True` if GPU) at the top of training in `transformer_ecg.py` and `deep_learning_ecg.py`.
7. **Relocate / remove loose files.** Move `parse_css.py` → `scripts/` (or delete if dead), `frontendUI.md` → `docs/`. Move the QA `.pptx` to Releases or `reports/`.
8. **Pin Python deps for reproducibility.** Generate a lockfile (`pip freeze > requirements.lock`, or adopt `pip-tools`/`uv`) so installs are deterministic like the R `renv.lock` already is.
9. **Verify `huggingface-hub>=1.0.0`** resolves; correct the pin if not.
10. **Backfill the 17 missing docstrings** and consider splitting the two 2,300+-line modules.
11. **(Optional) Add a notebook CI smoke-run** against `dashboard/pipelines/generate_synthetic_dashboard_data.py` output so the walkthroughs are continuously verified.

---

## D) Health Score — 81 / 100

| Dimension | Score | Notes |
|---|---|---|
| **Code Quality** | **17 / 20** | No bare `except`, no deprecated `DataFrame.append`/`cross_validation`/`.ix`, no `setwd()`, no hardcoded user paths. Dinged for two monoliths + 17 missing docstrings. |
| **Documentation** | **18 / 20** | Excellent 14 KB README (overview, setup, install, env, dashboard, Docker, contributing), plus CHANGELOG/CONTRIBUTING/CODE_OF_CONDUCT/LICENSE and 88% docstrings. Minor: no explicit "expected outputs" section. |
| **Reproducibility** | **14 / 20** | `renv.lock`, env-driven paths, 90 tests, 29 seeds — strong. Held back by H1 dep bug, unseeded DL training, `>=`-only Python pins, and never-executed notebooks. |
| **Security** | **19 / 20** | No secrets, no PHI; `.env` correctly gitignored, clean `.env.example` template; dedicated de-identification + HIPAA utils + tests. −1 for publicly committed source maps. |
| **Repo Hygiene** | **13 / 20** | Thorough `.gitignore`; zero `__pycache__`/checkpoints/`.DS_Store`/`node_modules` tracked. But the 8.85 MB tarball, `build-merge/` bundle, ~10 MB duplicate HTML, orphan + root clutter cost real points. |

---

## E) What's Working Well

- **Security & compliance are handled seriously.** No leaked credentials anywhere (no AWS/GitHub/OpenAI/Slack/REDCap tokens, no private keys); `.env` is gitignored with a clean placeholder `.env.example`; `data/{raw,interim,processed,deidentified}/` are empty `.gitkeep` placeholders — **no PHI in the repo** — backed by `src/preprocessing/deidentification.py`, `src/utils/hipaa_utils.py`, and `tests/test_deidentification.py`.
- **Textbook directory structure:** `data/` (raw→interim→processed→deidentified), `src/` (ingestion/preprocessing/feature_engineering/imputation/models/visualization/utils), plus `notebooks/`, `tests/`, `reports/`, `docs/`, `redcap/`, `MATLAB/`, `web/`, `k8s/`, `docker/`, `config/`.
- **Real test suite:** 90 test functions across 10 files, with `conftest.py` and contract/observability tests — rare and excellent for a research repo.
- **Clean code signals:** zero bare excepts, zero deprecated pandas/sklearn/R calls, no hardcoded absolute paths, config via env + YAML, and 29 explicit random-seed calls.
- **Engineering maturity:** CI under `.github/`, pre-commit + black/flake8/isort/mypy in `requirements.txt`, dev-container, Docker Compose, Helm chart, `Makefile`, and `renv.lock` for the R side.
- **Notebooks are narrative:** every notebook has more markdown cells than code cells and correct (monotonic) intended execution order.

---

### Sources
- PyCap (the REDCap Python client) — install `pip install pycap`, import `from redcap import Project`: [pycap · PyPI](https://pypi.org/project/pycap/) · [redcap-tools/PyCap](https://github.com/redcap-tools/PyCap)
- All other findings are from static inspection of the cloned `namo507/ESD-Lab-USC` working tree (file paths and line numbers cited inline).
