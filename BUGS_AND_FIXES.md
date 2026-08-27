# ESD-Lab-USC Repository — Bug Report & Fix Guide

> **Generated**: 2026-07-08  
> **Scope**: All automation scripts, CI/CD workflows, Docker configs, backend/frontend integration, and live dashboard pipeline health.
> **Status note (2026-07-13):** This is a historical audit snapshot, not the current workflow contract. The obsolete `sync_local_llm.yml` workflow has been removed; current policy is enforced by `scripts/check_github_workflows.py` and the NVIDIA assistant runbook.

This document catalogues every bug, broken pipeline path, and integration inconsistency found across the repository that could affect the live dashboard websites at `https://esd-lab-namo.pages.dev/` and the local Docker-based runtime.

---

## Table of Contents

1. [Critical — REDCap Sync Workflow Secret Mismatch](#1-critical--redcap-sync-workflow-secret-mismatch)
2. [Critical — Feature Flag Drift Between CI Deploy and Makefile `pages-build`](#2-critical--feature-flag-drift-between-ci-deploy-and-makefile-pages-build)
3. [High — `run_full_pipeline.sh` Swallows Non-Zero Exit Codes](#3-high--run_full_pipelinesh-swallows-non-zero-exit-codes)
4. [High — `k8s-validate.yml` References a Non-Existent Path Trigger](#4-high--k8s-validateyml-references-a-non-existent-path-trigger)
5. [High — `check_github_workflows.py` Does Not Validate All Critical Workflows](#5-high--check_github_workflowspy-does-not-validate-all-critical-workflows)
6. [Medium — `daily-health-sweep.yml` ESLint Runs Inside `web/` Without `--prefix`-Relative `src` Path](#6-medium--daily-health-sweepyml-eslint-runs-inside-web-without---prefix-relative-src-path)
7. [Medium — `redcap_sync.yml` Sets Both `REDCAP_API_TOKEN` and `REDCAP_API_KEY` From the Same Secret](#7-medium--redcap_syncyml-sets-both-redcap_api_token-and-redcap_api_key-from-the-same-secret)
8. [Medium — `check_live_surfaces.py` Imports `check_site_health` As a Bare Module](#8-medium--check_live_surfacespy-imports-check_site_health-as-a-bare-module)
9. [Medium — `redcap_daily_sync.py` Uses Naive `datetime.now()` (No Timezone)](#9-medium--redcap_daily_syncpy-uses-naive-datetimenow-no-timezone)
10. [Medium — `deploy-pages.yml` Missing Feature Flags Present in Makefile](#10-medium--deploy-pagesyml-missing-feature-flags-present-in-makefile)
11. [Low — `check_dashboard_runtime.py` Uses `/tmp` Unconditionally on Non-Linux](#11-low--check_dashboard_runtimepy-uses-tmp-unconditionally-on-non-linux)
12. [Low — `daily-health-sweep.yml` Uses a Hardcoded Versioned URL Query String](#12-low--daily-health-sweepyml-uses-a-hardcoded-versioned-url-query-string)
13. [Low — `.env` File Contains Live Secrets](#13-low--env-file-contains-live-secrets)
14. [Low — `uptime-monitor.yml` Missing `pip install` for `check_live_surfaces.py`](#14-low--uptime-monitoryml-missing-pip-install-for-check_live_surfacespy)
15. [Info — `devcontainer-ci.yml` Never Runs Lint or Tests](#15-info--devcontainer-ciyml-never-runs-lint-or-tests)

---

## 1. Critical — REDCap Sync Workflow Secret Mismatch

**File**: [`.github/workflows/redcap_sync.yml`](file:///Users/namomac/ESD-Lab-USC/.github/workflows/redcap_sync.yml#L34-L46)

**Bug**: The workflow sets `REDCAP_API_TOKEN` from `secrets.REDCAP_API_KEY`, but all Python scripts (`redcap/api/redcap_pull.py`, `redcap/api/redcap_push.py`) read `os.environ.get("REDCAP_API_TOKEN")`. If the GitHub repository secret is named `REDCAP_API_TOKEN` (matching `.env.example`), but the workflow reads `secrets.REDCAP_API_KEY`, the pull will get an empty token and fail silently or error out.

**Impact**: The entire nightly REDCap sync pipeline fails in CI, meaning `dashboard_data.json` never gets updated from live data, and the Pages deploy triggered afterward ships stale or synthetic data.

**Fix**:

```diff
--- a/.github/workflows/redcap_sync.yml
+++ b/.github/workflows/redcap_sync.yml
@@ -35,8 +35,8 @@
         env:
           NANO_DATA_ROOT: ${{ runner.temp }}/nano-data
           REDCAP_API_URL: ${{ secrets.REDCAP_API_URL }}
-          REDCAP_API_TOKEN: ${{ secrets.REDCAP_API_KEY }}
-          REDCAP_API_KEY: ${{ secrets.REDCAP_API_KEY }}
+          REDCAP_API_TOKEN: ${{ secrets.REDCAP_API_TOKEN }}
+          REDCAP_API_KEY: ${{ secrets.REDCAP_API_TOKEN }}
           PARTICIPANT_ID_SALT: ${{ secrets.PARTICIPANT_ID_SALT }}
           NANO_ID_SALT: ${{ secrets.PARTICIPANT_ID_SALT }}
@@ -49,7 +49,7 @@
         env:
           NANO_DATA_ROOT: ${{ runner.temp }}/nano-data
           REDCAP_API_URL: ${{ secrets.REDCAP_API_URL }}
-          REDCAP_API_KEY: ${{ secrets.REDCAP_API_KEY }}
+          REDCAP_API_KEY: ${{ secrets.REDCAP_API_TOKEN }}
```

> **Action**: Also verify in the GitHub repo **Settings → Secrets** that the secret is named `REDCAP_API_TOKEN` (matching the env variable name used everywhere else). If it is truly named `REDCAP_API_KEY` in GitHub, either rename the secret or keep the mapping — but be consistent. The `.env.example` and all Python code use `REDCAP_API_TOKEN`.

---

## 2. Critical — Feature Flag Drift Between CI Deploy and Makefile `pages-build`

**Files**:
- [`.github/workflows/deploy-pages.yml`](file:///Users/namomac/ESD-Lab-USC/.github/workflows/deploy-pages.yml#L82-L108)
- [`Makefile`](file:///Users/namomac/ESD-Lab-USC/Makefile#L176)

**Bug**: The Makefile `pages-build` target sets 16 `VITE_FEATURE_*` flags, while `deploy-pages.yml` sets 23 flags. The Makefile **is missing** these 7 feature flags that the CI deploy enables:

| Missing from Makefile `pages-build` | Present in `deploy-pages.yml` |
|---|---|
| `VITE_FEATURE_RSA_GROWTH_CURVES` | ✅ |
| `VITE_FEATURE_HDA_TIMELINE_PLAYER` | ✅ |
| `VITE_FEATURE_THERMAL_HEATMAP` | ✅ |
| `VITE_FEATURE_SWIMMER_PLOT` | ✅ |
| `VITE_FEATURE_ATTRITION_FUNNEL` | ✅ |
| `VITE_FEATURE_SHAP_BEESWARM` | ✅ |
| `VITE_FEATURE_CLUSTER_VIEWER` | ✅ |
| `VITE_FEATURE_MODEL_LEADERBOARD` | ✅ |
| `VITE_FEATURE_CASCADE_DAG` | ✅ |
| `VITE_FEATURE_REDCAP_VISIT_HEALTH` | ✅ |
| `VITE_FEATURE_ECG_QUALITY_MONITOR` | ✅ |
| `VITE_FEATURE_SPATIAL_ASSESSMENT_MATRIX` | ✅ |
| `VITE_FEATURE_ATTACHMENT_HEATMAP` | ✅ |

Conversely, the Makefile sets 3 flags that are **missing from CI**:

| Present in Makefile only |
|---|
| `VITE_FEATURE_DYN_INFANT_PASSPORT` |
| `VITE_FEATURE_DYN_CASCADE_SIMULATOR` |
| `VITE_FEATURE_MULTIMODAL_SYNCHRONY` |
| `VITE_FEATURE_DYN_CO_REGULATION_BRAID` |

**Impact**: Local `make pages-build` produces a different SPA bundle than CI. Routes gated behind the missing flags appear or disappear depending on where the build runs, causing visual regression and broken navigation for locally deployed builds versus CI-deployed builds.

**Fix**: Synchronize both locations. The single source of truth should be the Makefile, with the CI workflow importing the same flags:

```diff
--- a/Makefile
+++ b/Makefile
@@ -173,7 +173,7 @@
 	bash scripts/share_dashboard.sh
 
 pages-build:  ## Build the canonical Cloudflare Pages dashboard SPA artifact locally
-	VITE_USE_MOCKS=true VITE_LIVE_ASSISTANT=true VITE_FEATURE_CGA_RIVER=true VITE_FEATURE_COUNTY_COMPARATOR=true VITE_FEATURE_PARTICIPANT_TIMELINE_V2=true VITE_FEATURE_MODEL_CONFIDENCE_TERRAIN=true VITE_FEATURE_ATTRITION_FUNNEL_V2=true VITE_FEATURE_GUIDED_EXPLORER=true VITE_FEATURE_PUBLIC_INSIGHTS=true VITE_FEATURE_EXECUTIVE_MODE=true VITE_FEATURE_REDCAP_COMPLETENESS=true VITE_FEATURE_DYN_INFANT_PASSPORT=true VITE_FEATURE_DYN_CASCADE_SIMULATOR=true VITE_FEATURE_MULTIMODAL_SYNCHRONY=true VITE_FEATURE_SDOH_MAP=true VITE_FEATURE_DYN_CO_REGULATION_BRAID=true npm --prefix web run build
+	VITE_USE_MOCKS=true VITE_LIVE_ASSISTANT=true VITE_FEATURE_RSA_GROWTH_CURVES=true VITE_FEATURE_HDA_TIMELINE_PLAYER=true VITE_FEATURE_THERMAL_HEATMAP=true VITE_FEATURE_SWIMMER_PLOT=true VITE_FEATURE_ATTRITION_FUNNEL=true VITE_FEATURE_SDOH_MAP=true VITE_FEATURE_SHAP_BEESWARM=true VITE_FEATURE_CLUSTER_VIEWER=true VITE_FEATURE_MODEL_LEADERBOARD=true VITE_FEATURE_CASCADE_DAG=true VITE_FEATURE_REDCAP_COMPLETENESS=true VITE_FEATURE_REDCAP_VISIT_HEALTH=true VITE_FEATURE_ECG_QUALITY_MONITOR=true VITE_FEATURE_SPATIAL_ASSESSMENT_MATRIX=true VITE_FEATURE_ATTACHMENT_HEATMAP=true VITE_FEATURE_CGA_RIVER=true VITE_FEATURE_COUNTY_COMPARATOR=true VITE_FEATURE_PARTICIPANT_TIMELINE_V2=true VITE_FEATURE_MODEL_CONFIDENCE_TERRAIN=true VITE_FEATURE_ATTRITION_FUNNEL_V2=true VITE_FEATURE_GUIDED_EXPLORER=true VITE_FEATURE_PUBLIC_INSIGHTS=true VITE_FEATURE_EXECUTIVE_MODE=true VITE_FEATURE_DYN_INFANT_PASSPORT=true VITE_FEATURE_DYN_CASCADE_SIMULATOR=true VITE_FEATURE_MULTIMODAL_SYNCHRONY=true VITE_FEATURE_DYN_CO_REGULATION_BRAID=true npm --prefix web run build
 	$(PYTHON) scripts/build_pages_site.py
```

And in `deploy-pages.yml`, add the 4 missing flags:

```diff
--- a/.github/workflows/deploy-pages.yml
+++ b/.github/workflows/deploy-pages.yml
@@ -105,6 +105,10 @@
           VITE_FEATURE_EXECUTIVE_MODE: "true"
           VITE_USE_MOCKS: "true"
           VITE_LIVE_ASSISTANT: "true"
+          VITE_FEATURE_DYN_INFANT_PASSPORT: "true"
+          VITE_FEATURE_DYN_CASCADE_SIMULATOR: "true"
+          VITE_FEATURE_MULTIMODAL_SYNCHRONY: "true"
+          VITE_FEATURE_DYN_CO_REGULATION_BRAID: "true"
         run: |
           npm run build
```

---

## 3. High — `run_full_pipeline.sh` Swallows Non-Zero Exit Codes

**File**: [`scripts/run_full_pipeline.sh`](file:///Users/namomac/ESD-Lab-USC/scripts/run_full_pipeline.sh#L27-L38)

**Bug**: The `run_stage` function captures the exit code in the `else` branch of `if python "$@" ${DRY_RUN}; then`, but `$?` at that point is always `0` because the `local end; end=$(date +%s)` assignment inside the `then` block succeeds, and in the `else` branch, `$?` reflects the exit of the `if` conditional evaluation, which is `1` (the generic "command failed" status from Bash `if`), not the actual exit code of the Python command.

Specifically:
```bash
if python "$@" ${DRY_RUN}; then
    local end; end=$(date +%s)       # $? is now 0
    success "..."
else
    local exit_code=$?               # $? is 1 (from the failed if-test), NOT the actual Python exit code
    failure "..."
    exit "${exit_code}"              # Always exits 1, losing the real exit code
fi
```

**Impact**: Pipeline failures always report `exit 1` regardless of the actual Python exit code (e.g., `2` for config errors, `137` for OOM kills). This makes debugging harder and breaks any orchestrator that distinguishes exit codes.

**Fix**:

```diff
--- a/scripts/run_full_pipeline.sh
+++ b/scripts/run_full_pipeline.sh
@@ -27,13 +27,13 @@
 run_stage() {
     local name="$1"; shift
     log "--- Stage: ${name} START ---"
-    local start; start=$(date +%s)
-    if python "$@" ${DRY_RUN}; then
-        local end; end=$(date +%s)
+    local start exit_code
+    start=$(date +%s)
+    python "$@" ${DRY_RUN} && exit_code=0 || exit_code=$?
+    if [[ "$exit_code" -eq 0 ]]; then
+        local end
+        end=$(date +%s)
         success "${name} completed in $((end - start))s"
     else
-        local exit_code=$?
         failure "${name} failed (exit ${exit_code})"
         exit "${exit_code}"
     fi
```

---

## 4. High — `k8s-validate.yml` References a Non-Existent Path Trigger

**File**: [`.github/workflows/k8s-validate.yml`](file:///Users/namomac/ESD-Lab-USC/.github/workflows/k8s-validate.yml#L7)

**Bug**: The `on.pull_request.paths` trigger includes `"dashboard/k8s_pipeline/**"`, but this directory does not exist in the repository. The Kubernetes pipeline code lives at `k8s/pipeline/` instead.

```yaml
paths:
  - "dashboard/k8s_pipeline/**"   # ← does not exist
  - "k8s/**"
```

**Impact**: Changes to files that may have previously lived in `dashboard/k8s_pipeline/` (before being moved to `k8s/pipeline/`) will never trigger the validation workflow. This is a stale reference that could mislead future contributors.

**Fix**:

```diff
--- a/.github/workflows/k8s-validate.yml
+++ b/.github/workflows/k8s-validate.yml
@@ -4,7 +4,7 @@
   pull_request:
     branches: [develop, main]
     paths:
-      - "dashboard/k8s_pipeline/**"
+      - "k8s/pipeline/**"
       - "k8s/**"
       - ".github/workflows/k8s-validate.yml"
```

---

## 5. High — `check_github_workflows.py` Does Not Validate All Critical Workflows

**File**: [`scripts/check_github_workflows.py`](file:///Users/namomac/ESD-Lab-USC/scripts/check_github_workflows.py#L15-L22)

**Bug**: `REQUIRED_WORKFLOWS` omits `redcap_sync.yml` and `docker-build.yml`, two critical workflows for the dashboard data pipeline and Docker image CI.

```python
REQUIRED_WORKFLOWS = {
    "ci.yml",
    "deploy-pages.yml",
    "uptime-monitor.yml",
    "k8s-validate.yml",
    "sync_local_llm.yml",
    "daily-health-sweep.yml",
}
# Missing: "redcap_sync.yml", "docker-build.yml", "devcontainer-ci.yml"
```

**Impact**: If someone accidentally deletes `redcap_sync.yml` or `docker-build.yml`, the daily health sweep's "Validate GitHub workflow wiring" step will not catch it. The nightly REDCap data refresh or Docker image builds could silently break.

**Fix**:

```diff
--- a/scripts/check_github_workflows.py
+++ b/scripts/check_github_workflows.py
@@ -15,6 +15,8 @@
 REQUIRED_WORKFLOWS = {
     "ci.yml",
     "deploy-pages.yml",
+    "docker-build.yml",
+    "redcap_sync.yml",
     "uptime-monitor.yml",
     "k8s-validate.yml",
     "sync_local_llm.yml",
```

---

## 6. Medium — `daily-health-sweep.yml` ESLint Runs Inside `web/` Without `--prefix`-Relative `src` Path

**File**: [`.github/workflows/daily-health-sweep.yml`](file:///Users/namomac/ESD-Lab-USC/.github/workflows/daily-health-sweep.yml#L84)

**Bug**: The self-heal formatting step runs:
```yaml
npm --prefix web exec -- eslint --fix --ext .ts,.tsx src
```

When `npm --prefix web exec` is used, the command executes from the **repository root** (not `web/`), so `src` resolves to the repository root's `src/` (which is the Python `src/` directory), not `web/src/`. ESLint would either find no `.ts/.tsx` files (and do nothing) or error out on Python files.

**Impact**: The auto-fix step for TypeScript lint issues silently does nothing, so formatting drift accumulates and may cause `npm --prefix web run lint` to fail in the "Frontend checks" step later in the same workflow.

**Fix**:

```diff
--- a/.github/workflows/daily-health-sweep.yml
+++ b/.github/workflows/daily-health-sweep.yml
@@ -81,7 +81,7 @@
         run: |
           black src/ tests/ scripts/ redcap/
           isort src/ tests/ scripts/ redcap/
-          npm --prefix web exec -- eslint --fix --ext .ts,.tsx src
+          npm --prefix web exec -- eslint --fix --ext .ts,.tsx web/src
```

Alternatively, use a `working-directory: web` block:

```yaml
      - name: Safe self-heal formatting (frontend)
        working-directory: web
        run: npx eslint --fix --ext .ts,.tsx src
```

---

## 7. Medium — `redcap_sync.yml` Sets Both `REDCAP_API_TOKEN` and `REDCAP_API_KEY` From the Same Secret

**File**: [`.github/workflows/redcap_sync.yml`](file:///Users/namomac/ESD-Lab-USC/.github/workflows/redcap_sync.yml#L34-L41)

**Bug**: The workflow redundantly sets both `REDCAP_API_TOKEN` and `REDCAP_API_KEY` environment variables from the same `secrets.REDCAP_API_KEY` value. Since all Python scripts only read `REDCAP_API_TOKEN`, the `REDCAP_API_KEY` variable is unused dead code that adds confusion. It also suggests the secret naming was not finalized.

Additionally, the "Regenerate REDCap constants and context" step on line 52 only sets `REDCAP_API_KEY` but **not** `REDCAP_API_TOKEN`:

```yaml
      - name: Regenerate REDCap constants and context
        env:
          NANO_DATA_ROOT: ${{ runner.temp }}/nano-data
          REDCAP_API_URL: ${{ secrets.REDCAP_API_URL }}
          REDCAP_API_KEY: ${{ secrets.REDCAP_API_KEY }}  # ← but scripts need REDCAP_API_TOKEN!
```

If `extract_context.py --verify-redcap` calls `get_redcap_project()`, it will fail because `REDCAP_API_TOKEN` is not set in this step's env block.

**Fix**:

```diff
--- a/.github/workflows/redcap_sync.yml
+++ b/.github/workflows/redcap_sync.yml
@@ -48,8 +48,9 @@
       - name: Regenerate REDCap constants and context
         env:
           NANO_DATA_ROOT: ${{ runner.temp }}/nano-data
           REDCAP_API_URL: ${{ secrets.REDCAP_API_URL }}
-          REDCAP_API_KEY: ${{ secrets.REDCAP_API_KEY }}
+          REDCAP_API_TOKEN: ${{ secrets.REDCAP_API_TOKEN }}
+          REDCAP_API_KEY: ${{ secrets.REDCAP_API_TOKEN }}
         run: |
           node scripts/gen_redcap_constants.mjs
```

---

## 8. Medium — `check_live_surfaces.py` Imports `check_site_health` As a Bare Module

**File**: [`scripts/check_live_surfaces.py`](file:///Users/namomac/ESD-Lab-USC/scripts/check_live_surfaces.py#L19)

**Bug**: Line 19 uses:
```python
from check_site_health import check
```

This is a **bare module import** that only works if `scripts/` is the current working directory or is on `sys.path`. In CI, the workflow step runs `python scripts/check_live_surfaces.py` from the repository root, which puts `scripts/` on `sys.path` via Python's implicit parent directory insertion for script invocation. However, this is fragile and undocumented — if the script is ever invoked as a module (`python -m scripts.check_live_surfaces`) or from a different working directory, the import will fail with `ModuleNotFoundError`.

**Impact**: Currently works by accident in the specific CI invocation pattern, but any change to how the script is called will break the uptime monitor and daily health sweep.

**Fix**:

```diff
--- a/scripts/check_live_surfaces.py
+++ b/scripts/check_live_surfaces.py
@@ -14,9 +14,14 @@
 import argparse
 import json
 import os
+import sys
+from pathlib import Path
 from urllib.parse import urljoin
 
-from check_site_health import check
+# Ensure the scripts directory is on sys.path for sibling imports.
+_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
+if _SCRIPTS_DIR not in sys.path:
+    sys.path.insert(0, _SCRIPTS_DIR)
+
+from check_site_health import check  # noqa: E402
```

---

## 9. Medium — `redcap_daily_sync.py` Uses Naive `datetime.now()` (No Timezone)

**File**: [`scripts/redcap_daily_sync.py`](file:///Users/namomac/ESD-Lab-USC/scripts/redcap_daily_sync.py#L143-L159)

**Bug**: `datetime.now()` is used without timezone info on lines 144 and 159:
```python
f"Date/Time : {datetime.now().isoformat()}\n"
...
msg["Subject"] = f"[NANO] REDCap Daily Sync – {datetime.now().date()}"
```

When this runs in CI (UTC runner) vs. locally (EST/PST), the timestamps differ by hours. More importantly, Python 3.12+ deprecates naive `datetime.now()` and will eventually require an explicit timezone.

**Fix**:

```diff
--- a/scripts/redcap_daily_sync.py
+++ b/scripts/redcap_daily_sync.py
@@ -15,7 +15,7 @@
 import os
 import smtplib
 import sys
-from datetime import datetime
+from datetime import datetime, timezone
 from email.mime.text import MIMEText
 from pathlib import Path
 from typing import Any
@@ -140,7 +140,7 @@
     body = (
         f"NANO Study – REDCap Daily Sync Summary\n"
         f"{'=' * 45}\n"
-        f"Date/Time : {datetime.now().isoformat()}\n"
+        f"Date/Time : {datetime.now(timezone.utc).isoformat()}\n"
         f"Records pulled    : {n_records}\n"
         f"QC-flagged        : {n_flagged}\n"
         f"Incomplete (<80%) : {n_incomplete}\n"
@@ -156,7 +156,7 @@
 
     msg = MIMEText(body)
-    msg["Subject"] = f"[NANO] REDCap Daily Sync – {datetime.now().date()}"
+    msg["Subject"] = f"[NANO] REDCap Daily Sync – {datetime.now(timezone.utc).date()}"
     msg["From"] = smtp_user
     msg["To"] = pi_email
```

---

## 10. Medium — `deploy-pages.yml` Missing Feature Flags Present in Makefile

**File**: [`.github/workflows/deploy-pages.yml`](file:///Users/namomac/ESD-Lab-USC/.github/workflows/deploy-pages.yml#L82-L108)

**Bug**: The CI deploy is missing 4 feature flags that the Makefile `pages-build` enables:
- `VITE_FEATURE_DYN_INFANT_PASSPORT`
- `VITE_FEATURE_DYN_CASCADE_SIMULATOR`
- `VITE_FEATURE_MULTIMODAL_SYNCHRONY`
- `VITE_FEATURE_DYN_CO_REGULATION_BRAID`

**Impact**: These dashboard routes (infant passport, cascade simulator, multimodal synchrony view, co-regulation braid) will be **enabled** in local builds but **disabled** in the production Cloudflare Pages deploy. Users who were shown these features locally will find them missing on the live site.

**Fix**: (See combined fix in [Issue #2](#2-critical--feature-flag-drift-between-ci-deploy-and-makefile-pages-build) above.)

---

## 11. Low — `check_dashboard_runtime.py` Uses `/tmp` Unconditionally on Non-Linux

**File**: [`scripts/check_dashboard_runtime.py`](file:///Users/namomac/ESD-Lab-USC/scripts/check_dashboard_runtime.py#L28)

**Bug**: Line 28:
```python
SHARE_STATE_DIR = Path(os.environ.get("XDG_RUNTIME_DIR", "/tmp")) / "esd-lab-usc-share"
```

On macOS, `XDG_RUNTIME_DIR` is never set, so this always falls back to `/tmp/esd-lab-usc-share`. While `/tmp` exists on macOS, it's periodically cleaned by the OS (`/tmp` is actually a symlink to `/private/tmp`), so state files like `last_origin.txt` can disappear mid-session. This is inconsistent with the share script which uses the same pattern but is always run from the same session.

**Impact**: Low — only affects local development. The shared origin file may be cleaned between sessions, requiring a tunnel restart.

**Fix**: Use `tempfile.gettempdir()` for portability:

```diff
--- a/scripts/check_dashboard_runtime.py
+++ b/scripts/check_dashboard_runtime.py
@@ -20,6 +20,7 @@
 import re
 import subprocess
 import time
+import tempfile
 import urllib.request
 from pathlib import Path
 from typing import Any
@@ -25,7 +26,7 @@
 
 PROJECT_ROOT = Path(__file__).resolve().parents[1]
 DEFAULT_TOUCH_PATH = PROJECT_ROOT / "config" / "study_parameters.yml"
-SHARE_STATE_DIR = Path(os.environ.get("XDG_RUNTIME_DIR", "/tmp")) / "esd-lab-usc-share"
+SHARE_STATE_DIR = Path(os.environ.get("XDG_RUNTIME_DIR", tempfile.gettempdir())) / "esd-lab-usc-share"
```

---

## 12. Low — `daily-health-sweep.yml` Uses a Hardcoded Versioned URL Query String

**File**: [`.github/workflows/daily-health-sweep.yml`](file:///Users/namomac/ESD-Lab-USC/.github/workflows/daily-health-sweep.yml#L34)

**Bug**: The `VERSIONED_PAGES_URL` env variable is hardcoded to:
```yaml
VERSIONED_PAGES_URL: https://esd-lab-namo.pages.dev/?v=20260604-032545
```

This version stamp will never auto-update. As new deploys happen, the versioned URL becomes stale and the visual health check for the "versioned-root" route tests an outdated version string that the frontend may no longer recognize or route differently.

**Impact**: Low — the visual check will still load the page (the `?v=` param is likely ignored by the SPA router), but it's a maintenance smell. Future developers will wonder why this date never changes.

**Fix**: Either remove the versioned URL check or make it dynamic:

```diff
--- a/.github/workflows/daily-health-sweep.yml
+++ b/.github/workflows/daily-health-sweep.yml
@@ -31,7 +31,6 @@
     env:
       CANONICAL_PAGES_URL: https://esd-lab-namo.pages.dev
-      VERSIONED_PAGES_URL: https://esd-lab-namo.pages.dev/?v=20260604-032545
       DASHBOARD_LOCAL_URL: http://127.0.0.1:8080
```

And remove the reference in the browser visual checks step:

```diff
@@ -120,7 +119,6 @@
           if [ "${{ github.event_name }}" = "schedule" ] || [ "${{ inputs.live_visual }}" = "true" ]; then
             live_args+=(--live-url "${CANONICAL_PAGES_URL%/}/overview")
-            live_args+=(--live-url "$VERSIONED_PAGES_URL")
           fi
```

---

## 13. Low — `.env` File Contains Live Secrets

**File**: [`.env`](file:///Users/namomac/ESD-Lab-USC/.env)

**Bug**: The `.env` file in the repository root contains live credentials:
- `REDCAP_API_TOKEN` with a real 32-character hex token
- `CLOUDFLARE_API_TOKEN` with a real API token
- `CLOUDFLARE_TUNNEL_TOKEN` with a real Base64-encoded tunnel JWT
- `CLOUDFLARE_ACCOUNT_ID`

While `.env` is listed in `.gitignore`, the file exists locally and these secrets could be accidentally committed via `git add -f .env` or a force push. The `.env` file is also visible to any process on the local machine.

**Impact**: If this file is ever committed to the repository, all credentials would be exposed. The `.gitignore` protects against accidental commits, but the credentials should be rotated if this `.env` was ever shared.

**Fix**: No code change needed, but:
1. **Verify** `.env` has never been committed by running: `git log --all --full-history -- .env`
2. **Rotate** all credentials if there's any doubt
3. Consider using a secrets manager or encrypted file for local development

---

## 14. Low — `uptime-monitor.yml` Missing `pip install` for `check_live_surfaces.py`

**File**: [`.github/workflows/uptime-monitor.yml`](file:///Users/namomac/ESD-Lab-USC/.github/workflows/uptime-monitor.yml#L22-L47)

**Bug**: The workflow runs `python scripts/check_live_surfaces.py` which imports from `check_site_health`, but never runs `pip install` for any dependencies. Currently both scripts only use stdlib modules (`urllib`, `json`, `argparse`, `re`), so this works. However, if any future change adds a third-party import (like `requests` or `yaml`), the workflow will silently break.

**Impact**: Low — currently functional because all imports are stdlib. But fragile for future maintenance.

**Fix**: Add a minimal dependency install step:

```diff
--- a/.github/workflows/uptime-monitor.yml
+++ b/.github/workflows/uptime-monitor.yml
@@ -28,6 +28,10 @@
         with:
           python-version: "3.11"
 
+      - name: Install probe dependencies
+        run: |
+          python -m pip install --quiet "PyYAML>=6.0.1,<7"
+
       - name: Probe live site
```

---

## 15. Info — `devcontainer-ci.yml` Never Runs Lint or Tests

**File**: [`.github/workflows/devcontainer-ci.yml`](file:///Users/namomac/ESD-Lab-USC/.github/workflows/devcontainer-ci.yml)

**Bug**: The devcontainer CI only checks `python --version` and `pip check`. It does not run `pytest`, `black --check`, `flake8`, or any actual validation. This means the devcontainer could silently break test execution or have incompatible package versions without detection.

**Impact**: Informational — the main `ci.yml` covers test validation, so this is not blocking. But the devcontainer CI gives a false sense of confidence.

**Fix**: Add basic smoke test:

```diff
--- a/.github/workflows/devcontainer-ci.yml
+++ b/.github/workflows/devcontainer-ci.yml
@@ -23,3 +23,4 @@
           runCmd: |
             . .devcontainer/.venv/bin/activate
             python --version
             pip check
+            pytest tests/ -q --tb=short --ignore=tests/test_imputation.py -x
```

---

## Summary Priority Matrix

| # | Severity | Issue | Broken Pipeline? | Live Dashboard Impact? |
|---|----------|-------|-------------------|----------------------|
| 1 | 🔴 Critical | REDCap sync secret mismatch | ✅ REDCap sync fails | ✅ Stale dashboard data |
| 2 | 🔴 Critical | Feature flag drift (Makefile vs CI) | ❌ Both build | ✅ Missing routes on live site |
| 3 | 🟠 High | Pipeline exit code swallowed | ✅ Silent failures | ❌ Indirect |
| 4 | 🟠 High | K8s workflow stale path trigger | ✅ Dead trigger | ❌ No |
| 5 | 🟠 High | Workflow validator missing files | ✅ Gaps in safety net | ❌ Indirect |
| 6 | 🟡 Medium | ESLint self-heal wrong `src` path | ✅ No-op auto-fix | ❌ Lint drift |
| 7 | 🟡 Medium | REDCap regen step missing token | ✅ Context regen may fail | ✅ Stale context |
| 8 | 🟡 Medium | Bare module import fragility | ❌ Currently works | ❌ Future risk |
| 9 | 🟡 Medium | Naive `datetime.now()` | ❌ Functional | ❌ Cosmetic |
| 10 | 🟡 Medium | CI missing 4 feature flags | ❌ Build works | ✅ Missing routes |
| 11 | 🟢 Low | `/tmp` on macOS | ❌ | ❌ Local dev only |
| 12 | 🟢 Low | Hardcoded versioned URL | ❌ | ❌ Stale test |
| 13 | 🟢 Low | `.env` contains live secrets | ❌ | ❌ Security risk |
| 14 | 🟢 Low | Uptime probe no pip install | ❌ Currently fine | ❌ Future risk |
| 15 | ⚪ Info | Devcontainer CI no tests | ❌ | ❌ |
