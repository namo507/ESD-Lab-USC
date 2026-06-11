# Full Sweep Patch Log - 2026-06-06

Scope: follow-up fixes from `reports/audits/AUDIT_REPORT.md` and the requested comprehensive
health sweep for the NANO Study dashboard, backend, Cloudflare Pages wrapper,
and repository hygiene.

## Summary

| Area | Status | Notes |
| --- | --- | --- |
| Python dependencies | PASS | PyCap package name fixed, unused heavy deps pruned, upper bounds added, lockfile generated. |
| Frontend | PASS | TypeScript, ESLint, npm audit, production build, and Vitest pass. |
| Backend/tests | PASS | Pytest passes with only optional ECG detector skips. |
| Static Python quality | PASS | black, isort, flake8, core mypy, syntax compile, and interrogate pass. |
| Repo hygiene | PASS | Tracked build bundles, source maps, tarball, PPTX, and duplicate generated HTML removed from Git tracking. |
| Cloudflare/env config | PASS | `.env.example`, compose files, and `scripts/share_dashboard.sh` support both tunnel token env names. |
| Live Pages URLs | PASS | Requested Pages routes return 200 and load the SPA shell with assistant fallback ready. |
| Docker/Helm/Hadolint | BLOCKED | Tooling is not installed in this container, so local compose/build/lint checks could not run. |
| R `renv` restore | BLOCKED | `Rscript` is installed, but `renv` is not available in this container. |
| Cloudflare deploy | BLOCKED | Deploy requires real Cloudflare secrets/API token; local Pages package and live health checks passed. |

## Verification Log

- PASS: `requirements.txt` uses `pycap>=1.1.0,<3`; smoke import confirms
  `redcap.Project.__module__ == "redcap.project"`.
- PASS: unused heavy Python dependencies called out by the audit were removed
  from the main requirements file; `requirements.lock` was generated with
  `pip-compile`.
- PASS: `pip install "huggingface-hub>=1.0.0" --dry-run` resolved.
- BLOCKED: full `pip-sync requirements.lock` was not run here because the lock
  includes the full Torch/Jupyter/R bridge stack and would materially change the
  shared dev environment.
- BLOCKED: `Rscript -e "cat(requireNamespace('renv', quietly=TRUE))"` returned
  `FALSE`, so `renv::restore()` cannot run until `renv` is installed.

- PASS: `npm ci` completed from `web/package-lock.json`; npm reported
  `found 0 vulnerabilities`.
- PASS: `npm run typecheck`.
- PASS: `npm run lint -- --max-warnings 0`.
- PASS: `npm audit --audit-level=high`.
- PASS: `npm run build`; Vite emitted only chunk-size warnings.
- PASS: `npm test`; 16 test files and 71 tests passed.
- PASS: `git ls-files` has no tracked `.js.map`, `web/build-merge`, tarball,
  or PPTX artifacts.
- PASS: tracked HTML totals 3.1 MB and no tracked HTML files share an md5 hash.

- PASS: `python -m pytest tests/ -v --tb=short --timeout=30` resulted in
  89 passed, 2 skipped. The skips are optional ECG detector-path tests that need
  `neurokit2` or `biosppy`.
- PASS: scoped syntax compile across `src`, `redcap`, `scripts`, `dashboard`,
  and `tests` returned no output.
- PASS: `python -m black --check src/ tests/ scripts/ redcap/`.
- PASS: `python -m isort --check-only src/ tests/ scripts/ redcap/`.
- PASS: `python -m flake8 src tests scripts redcap`.
- PASS: `python -m mypy src redcap tests`.
- PASS: `python -m interrogate src/ redcap/ -v --fail-under 95` reports
  100.0% docstring coverage.
- PASS: reproducible Torch seeding is present in both ECG deep-learning
  trainers.
- PASS: the REDCap namespace shim has a guard test and exposes PyCap's
  `Project`.
- PASS: `radon cc -s -a` was run for the two dashboard monoliths and the
  hotspots are logged in `TECH_DEBT.md`.

- PASS: `.dockerignore` includes PHI/data, credentials, archive, design-ideas,
  build output, node_modules, source map, and Python cache patterns.
- PASS: `docker/dashboard/Dockerfile` has a `HEALTHCHECK` and env coverage is
  documented in `.env.example`.
- BLOCKED: `docker`, `helm`, and `hadolint` are not installed here, so local
  compose config/build, Helm lint, and Dockerfile lint were not executable.
- PASS: GitHub workflow YAML lint passed.
- PASS: CI workflows were updated for Python 3.10/3.11, timeouts, black,
  isort, flake8, Pages deploy permissions, kubeconform validation, and local
  LLM caching.

- PASS: `python scripts/build_pages_site.py` wrote `dist/pages-wrapper` with
  the current API origin.
- PASS: `https://esd-lab-namo.pages.dev/?v=20260604-032545` returned 200,
  `spa_shell=yes`, `assistant=ready`.
- PASS: `https://esd-lab-namo.pages.dev/overview` returned 200,
  `spa_shell=yes`, `assistant=ready`.
- PASS: `https://esd-lab-namo.pages.dev/` returned 200 and passed the deploy
  stamp freshness check.
- NOTE: the public Pages deployment is healthy through the built-in Pages
  fallback assistant because the optional live Python assistant origin is
  currently unavailable.

## Main Code Changes

- Repaired REDCap/PyCap dependency and shim coverage.
- Pruned unused dependency bloat and added Python dependency reproducibility via
  `requirements.lock`.
- Removed committed generated artifacts and added ignore rules for future
  bundles, source maps, tarballs, and presentation binaries.
- Moved loose root files into the appropriate `docs/` and `scripts/` locations.
- Added deterministic seeding to the Torch training entry points.
- Fixed NumPy compatibility in HRV features by using `np.trapz`.
- Fixed frontend hook-order and dependency-array issues, and tightened ESLint
  enforcement.
- Stabilized Vitest worker usage for this container/CI profile.
- Improved Cloudflare tunnel env handling and documented both token env names.
- Added Docker build/env coverage for `PIP_VERSION`.
- Added docstrings required for the 95% documentation gate.
