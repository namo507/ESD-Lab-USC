# MATLAB Integration Guide — NANO Study / ESD Lab USC

> **Purpose**: Recommend the best plugins, connectors, skills, and management
> commands for integrating MATLAB scripts into the existing Python + R + Docker
> pipeline.  Every recommendation is mapped to a concrete part of this repo.

---

## 1 — Current Tech-Stack Snapshot

| Layer | Technology | Key Files |
|-------|-----------|-----------|
| Signal processing | Python (NeuroKit2, SciPy, BioSPPy, MNE) | `src/preprocessing/ecg_preprocessing.py`, `src/preprocessing/hrv_features.py` |
| Stats / LGCM / MICE | R (lavaan, lme4, mice) via `rpy2` bridge | `src/models/latent_growth_curves.R`, `src/imputation/mice_imputation.R` |
| ML / DL | Python (scikit-learn, XGBoost, PyTorch) | `src/models/ml_pipeline.py`, `src/models/deep_learning_ecg.py` |
| Data ingestion | Python (pandas, REDCap API) | `src/data_ingestion/` |
| Visualization | Python + R (matplotlib, seaborn, plotly, ggplot2) | `src/visualization/` |
| Dashboard / Web | Node.js (Vite), Docker, Cloudflare | `web/`, `docker-compose.yml` |
| CI/CD | GitHub Actions | `.github/workflows/ci.yml` |
| Dev environment | VS Code Dev Container (Python 3.11 + R) | `.devcontainer/` |

---

## 2 — Recommended VS Code Plugins / Extensions

> Add these to `.devcontainer/devcontainer.json` → `extensions` list and
> `.vscode/extensions.json` → `recommendations` array.

| # | Extension ID | What it does | Why you need it |
|---|-------------|--------------|-----------------|
| 1 | `MathWorks.language-matlab` | Official MATLAB syntax highlighting, linting, code navigation | Primary MATLAB editing experience inside VS Code |
| 2 | `Gimly81.matlab` | MATLAB snippets, run-selection, terminal integration | Quick script execution without leaving VS Code |
| 3 | `ms-python.python` | *(already installed)* Python IntelliSense | MATLAB↔Python interop via `matlab.engine` |
| 4 | `REditorSupport.r` | *(already installed)* R language support | Existing R scripts stay first-class |
| 5 | `ms-toolsai.jupyter` | *(already installed)* Jupyter notebooks | Run MATLAB kernel in Jupyter via `jupyter-matlab-proxy` |
| 6 | `ms-azuretools.vscode-docker` | *(already installed)* Docker management | Manage the MATLAB-enabled container |
| 7 | `streetsidesoftware.code-spell-checker` | Spell checker | Catches MATLAB function-name typos in docs |
| 8 | `eamodio.gitlens` | Git blame / history | Track who touched which `.m` file and when |

### Command: Update `devcontainer.json` extensions

```bash
# From repo root — append MATLAB extensions to the devcontainer config
cd /Users/namomac/ESD-Lab-USC-1
# Manually add these to .devcontainer/devcontainer.json under extensions:
#   "MathWorks.language-matlab",
#   "Gimly81.matlab"
```

### Command: Update `.vscode/extensions.json`

```bash
cat > .vscode/extensions.json << 'EOF'
{
  "recommendations": [
    "ms-python.python",
    "ms-python.vscode-pylance",
    "ms-toolsai.jupyter",
    "REditorSupport.r",
    "ms-vscode.makefile-tools",
    "ms-azuretools.vscode-docker",
    "MathWorks.language-matlab",
    "Gimly81.matlab",
    "eamodio.gitlens"
  ]
}
EOF
```

---

## 3 — Python ↔ MATLAB Connectors (Engine & Bridge Libraries)

| # | Connector | Install Command | Use Case in NANO | Direction |
|---|-----------|----------------|------------------|-----------|
| 1 | **MATLAB Engine for Python** (`matlab.engine`) | `cd /usr/local/MATLAB/R2024b/extern/engines/python && pip install .` | Call `.m` scripts from `run_full_pipeline.sh` stages | Python → MATLAB |
| 2 | **transplant** | `pip install transplant` | Lightweight alternative to `matlab.engine`; starts MATLAB as subprocess | Python → MATLAB |
| 3 | **Oct2Py** (GNU Octave bridge) | `pip install oct2py` | Free MATLAB-compatible fallback for CI runners without a license | Python → Octave |
| 4 | **MATLAB API for Python (RESTful)** | Built into MATLAB R2022b+ Production Server | Expose MATLAB ECG functions as REST endpoints consumed by the dashboard | Python → MATLAB (HTTP) |
| 5 | **matlabengineforpython** (PyPI mirror) | `pip install matlabengine` | Same as #1 but pip-installable from PyPI (MATLAB R2024a+) | Python → MATLAB |
| 6 | **matlab-kernel** (Jupyter) | `pip install matlab-kernel` | Run `.m` cells inside Jupyter notebooks alongside Python cells | Interactive |
| 7 | **jupyter-matlab-proxy** | `pip install jupyter-matlab-proxy` | Full MATLAB desktop in the browser via Jupyter integration | Interactive |
| 8 | **scipy.io.loadmat / savemat** | *(already installed — scipy)* | Read/write `.mat` data files from Python | Data I/O |
| 9 | **hdf5storage** | `pip install hdf5storage` | Read MATLAB v7.3+ `.mat` files (HDF5 format) | Data I/O |
| 10 | **mat73** | `pip install mat73` | Simpler reader for MATLAB v7.3 `.mat` files | Data I/O |

### Recommended Install Commands

```bash
# ── Core connector (requires local MATLAB installation) ──
# Option A: Use MATLAB Engine via pip (MATLAB R2024a+)
pip install matlabengine

# Option B: Manual install from MATLAB root
cd "$(matlab -batch "disp(matlabroot)" | tail -1)/extern/engines/python"
pip install .

# ── CI-friendly fallback (Octave, no MATLAB license needed) ──
# Install GNU Octave
brew install octave          # macOS
# sudo apt-get install -y octave  # Linux / Docker
pip install oct2py

# ── .mat file I/O ──
pip install hdf5storage mat73

# ── Jupyter MATLAB kernel ──
pip install matlab-kernel jupyter-matlab-proxy

# ── Add to requirements.txt ──
cat >> requirements.txt << 'EOF'

# ─── MATLAB Integration ────────────────────────────────────
matlabengine>=24.1.0       # MATLAB Engine for Python (needs MATLAB installed)
# oct2py>=5.7.0            # Octave bridge (uncomment for CI without MATLAB)
hdf5storage>=0.1.19        # Read MATLAB v7.3 .mat files
mat73>=0.62                # Simpler v7.3 .mat reader
# matlab-kernel>=0.17.1    # Jupyter MATLAB kernel (optional)
# jupyter-matlab-proxy>=0.12.0  # MATLAB in browser via Jupyter (optional)
EOF
```

---

## 4 — MATLAB Signal Processing Toolboxes & Skills

These are the MATLAB toolboxes/scripts that best replace or complement the
existing Python pipeline in `src/preprocessing/` and `src/models/`.

| # | MATLAB Toolbox / Skill | Purpose | Maps to Existing Code | Command to Verify |
|---|----------------------|---------|----------------------|-------------------|
| 1 | **Signal Processing Toolbox** | Bandpass filtering, spectral analysis | `ecg_preprocessing.py` → `bandpass_filter()` | `matlab -batch "ver('signal')"` |
| 2 | **Statistics and Machine Learning Toolbox** | Classification, regression, cross-validation | `ml_pipeline.py`, `model_evaluation.py` | `matlab -batch "ver('stats')"` |
| 3 | **Deep Learning Toolbox** | CNN, LSTM, transformer models | `deep_learning_ecg.py`, `transformer_ecg.py` | `matlab -batch "ver('nnet')"` |
| 4 | **Wavelet Toolbox** | CWT-based RSA estimation | `hrv_features.py` → `compute_rsa_cwt()` | `matlab -batch "ver('wavelet')"` |
| 5 | **Curve Fitting Toolbox** | Nonlinear growth curve fitting | `latent_growth_curves.R` | `matlab -batch "ver('curvefit')"` |
| 6 | **Parallel Computing Toolbox** | Batch ECG processing across participants | `ecg_batch_processor.py` (N_JOBS=-1) | `matlab -batch "ver('parallel')"` |
| 7 | **MATLAB Report Generator** | Auto-generate PDF/HTML quality reports | `generate_data_quality_report.py` | `matlab -batch "ver('rptgen')"` |
| 8 | **Database Toolbox** | Direct REDCap / SQL database connectors | `redcap_merge.py` | `matlab -batch "ver('database')"` |
| 9 | **MATLAB Compiler** | Package `.m` scripts as standalone binaries for CI | Pipeline CI runners without licenses | `matlab -batch "ver('compiler')"` |
| 10 | **MATLAB Production Server** | Deploy MATLAB functions as REST APIs | Dashboard backend integration | `matlab -batch "ver('prodserver')"` |

### Command: Check all installed toolboxes

```bash
matlab -batch "v = ver; fprintf('%s  %s\n', v.Name, v.Version)"
```

---

## 5 — Docker & Dev Container Changes

### 5.1 Add MATLAB to the Dev Container

```dockerfile
# ── Append to .devcontainer/Dockerfile ──

# Install MATLAB dependencies (for MATLAB Engine for Python)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libxt6 \
        libxrender1 \
        libxcomposite1 \
        libxcursor1 \
        libxi6 \
        libxtst6 \
        libxrandr2 \
        libxinerama1 \
        libatk1.0-0 \
        libnss3 \
        libcups2 \
        libpango-1.0-0 \
        libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# OPTION A: Mount host MATLAB via volume (recommended for dev)
# Set in devcontainer.json → "mounts": ["source=/usr/local/MATLAB,target=/usr/local/MATLAB,type=bind"]

# OPTION B: Install MATLAB Runtime (MCR) for compiled scripts
# RUN wget -q https://ssd.mathworks.com/supportfiles/downloads/R2024b/Release/0/deployment_files/installer/complete/glnxa64/MATLAB_Runtime_R2024b_Update_0_glnxa64.zip \
#     && unzip -q MATLAB_Runtime_R2024b_*.zip -d /tmp/mcr \
#     && /tmp/mcr/install -mode silent -agreeToLicense yes -destinationFolder /opt/mcr \
#     && rm -rf /tmp/mcr MATLAB_Runtime_R2024b_*.zip

# Install GNU Octave as free fallback
RUN apt-get update && apt-get install -y --no-install-recommends \
        octave \
    && rm -rf /var/lib/apt/lists/*
```

### 5.2 Update `devcontainer.json` mounts

```jsonc
// Add to .devcontainer/devcontainer.json
{
  "mounts": [
    "source=/usr/local/MATLAB,target=/usr/local/MATLAB,type=bind,readonly"
  ],
  "containerEnv": {
    // ... existing vars ...
    "MATLAB_ROOT": "/usr/local/MATLAB/R2024b",
    "PATH": "/usr/local/MATLAB/R2024b/bin:${PATH}"
  }
}
```

---

## 6 — Project Structure Changes

### 6.1 Recommended new directories

```
ESD-Lab-USC-1/
├── matlab/                       # ← NEW: all MATLAB source files
│   ├── ecg/                      #   ECG preprocessing .m scripts
│   │   ├── bandpass_filter_ecg.m
│   │   ├── detect_rpeaks_matlab.m
│   │   └── compute_hrv_matlab.m
│   ├── models/                   #   MATLAB-native models
│   │   ├── lgcm_matlab.m
│   │   └── cnn_ecg_matlab.m
│   ├── utils/                    #   Shared MATLAB helpers
│   │   ├── load_nano_config.m
│   │   └── hipaa_audit_log.m
│   ├── tests/                    #   MATLAB unit tests
│   │   └── test_bandpass_filter.m
│   └── startup.m                 #   MATLAB path setup (auto-loads on start)
├── src/
│   └── utils/
│       └── matlab_bridge.py      # ← NEW: Python↔MATLAB wrapper
```

### 6.2 Command: Create directory structure

```bash
cd /Users/namomac/ESD-Lab-USC-1

mkdir -p matlab/{ecg,models,utils,tests}

# Create MATLAB startup file (adds project paths automatically)
cat > matlab/startup.m << 'MEOF'
% NANO Study — MATLAB Startup
% Automatically adds all project subdirectories to the MATLAB path.
project_root = fileparts(mfilename('fullpath'));
addpath(genpath(project_root));
fprintf('✓ NANO MATLAB paths loaded from %s\n', project_root);

% Load study config
try
    config = load_nano_config();
    fprintf('✓ Study config loaded (data_root: %s)\n', config.data_root);
catch ME
    warning('NANO:startup', 'Could not load config: %s', ME.message);
end
MEOF

echo "✓ MATLAB directory structure created."
```

---

## 7 — Python ↔ MATLAB Bridge Utility

### Command: Create the bridge module

```bash
cat > src/utils/matlab_bridge.py << 'PYEOF'
"""Python ↔ MATLAB bridge for NANO Study.

Wraps ``matlab.engine`` or ``oct2py`` to call .m scripts from Python.
Falls back to Octave if no MATLAB license is available.

Usage::

    from src.utils.matlab_bridge import get_engine, call_matlab
    result = call_matlab("bandpass_filter_ecg", signal, 1024, 0.5, 40.0)
"""

from __future__ import annotations

import os
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_ENGINE = None
_BACKEND = None  # "matlab" | "octave"

MATLAB_DIR = Path(__file__).resolve().parents[2] / "matlab"


def get_engine():
    """Return a running MATLAB or Octave engine (singleton)."""
    global _ENGINE, _BACKEND

    if _ENGINE is not None:
        return _ENGINE

    # Try MATLAB first
    try:
        import matlab.engine  # type: ignore[import]
        _ENGINE = matlab.engine.start_matlab("-nosplash -nodesktop")
        _ENGINE.addpath(_ENGINE.genpath(str(MATLAB_DIR)), nargout=0)
        _BACKEND = "matlab"
        logger.info("MATLAB engine started (backend=matlab).")
        return _ENGINE
    except ImportError:
        logger.info("matlab.engine not found; trying Octave fallback.")
    except Exception as exc:
        logger.warning("MATLAB engine failed: %s; trying Octave.", exc)

    # Octave fallback
    try:
        from oct2py import Oct2Py  # type: ignore[import]
        _ENGINE = Oct2Py()
        _ENGINE.addpath(str(MATLAB_DIR))
        for sub in MATLAB_DIR.iterdir():
            if sub.is_dir() and sub.name != "tests":
                _ENGINE.addpath(str(sub))
        _BACKEND = "octave"
        logger.info("Octave engine started (backend=octave).")
        return _ENGINE
    except ImportError:
        raise RuntimeError(
            "Neither matlab.engine nor oct2py is installed. "
            "Install one: pip install matlabengine  OR  pip install oct2py"
        )


def call_matlab(func_name: str, *args: Any, nargout: int = 1) -> Any:
    """Call a MATLAB/Octave function by name.

    Args:
        func_name: Name of the .m function (without extension).
        *args:     Positional arguments forwarded to the function.
        nargout:   Number of expected output arguments.

    Returns:
        The MATLAB function's return value(s).
    """
    engine = get_engine()

    if _BACKEND == "matlab":
        fn = getattr(engine, func_name)
        return fn(*args, nargout=nargout)
    else:
        return engine.feval(func_name, *args, nout=nargout)


def shutdown():
    """Shut down the MATLAB/Octave engine cleanly."""
    global _ENGINE, _BACKEND
    if _ENGINE is not None:
        try:
            if _BACKEND == "matlab":
                _ENGINE.quit()
            else:
                _ENGINE.exit()
        except Exception:
            pass
        _ENGINE = None
        _BACKEND = None
        logger.info("MATLAB/Octave engine shut down.")
PYEOF

echo "✓ matlab_bridge.py created."
```

---

## 8 — CI/CD (GitHub Actions) Changes

| # | Change | File | Purpose |
|---|--------|------|---------|
| 1 | Add Octave to CI runner | `.github/workflows/ci.yml` | Run `.m` tests without a MATLAB license |
| 2 | Add MATLAB lint step | `.github/workflows/ci.yml` | Static analysis on `.m` files via `checkcode` |
| 3 | Cache MATLAB Runtime | `.github/workflows/ci.yml` | Speed up MATLAB-compiled binary runs |
| 4 | Add `.m` file test job | `.github/workflows/ci.yml` | Run `matlab/tests/test_*.m` via Octave |

### Command: Add Octave to CI

```yaml
# Append this job to .github/workflows/ci.yml

  matlab-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install GNU Octave
        run: |
          sudo apt-get update
          sudo apt-get install -y octave octave-signal octave-statistics

      - name: Run MATLAB-compatible tests
        run: |
          cd matlab/tests
          for f in test_*.m; do
            echo "=== Running $f ==="
            octave --no-gui --eval "run('$f')"
          done
```

---

## 9 — Makefile Targets

Add these targets to the existing `Makefile`:

```makefile
# ─── MATLAB Integration ─────────────────────────────────────────────────────

matlab-check:  ## Verify MATLAB or Octave is available
	@command -v matlab >/dev/null 2>&1 && matlab -batch "disp('MATLAB OK')" \
	  || (command -v octave >/dev/null 2>&1 && octave --eval "disp('Octave OK')" \
	  || (echo "ERROR: Neither MATLAB nor Octave found." && exit 1))

matlab-test:  ## Run MATLAB unit tests (uses Octave if MATLAB unavailable)
	@if command -v matlab >/dev/null 2>&1; then \
	    matlab -batch "cd matlab/tests; results = runtests; disp(results)"; \
	else \
	    echo "Using Octave fallback..."; \
	    for f in matlab/tests/test_*.m; do \
	        echo "=== $$f ==="; \
	        octave --no-gui --eval "run('$$f')"; \
	    done; \
	fi

matlab-lint:  ## Run MATLAB code analyzer (checkcode) on all .m files
	@if command -v matlab >/dev/null 2>&1; then \
	    matlab -batch "files = dir('matlab/**/*.m'); for i=1:numel(files), checkcode(fullfile(files(i).folder, files(i).name)); end"; \
	else \
	    echo "MATLAB not available; skipping lint."; \
	fi

matlab-ecg:  ## Run MATLAB ECG processing pipeline
	@echo "Running MATLAB ECG pipeline..."
	$(VENV)/bin/python -c "from src.utils.matlab_bridge import call_matlab; call_matlab('run_ecg_pipeline')"
	@echo "✓ MATLAB ECG pipeline complete."
```

### Command: Append to Makefile

```bash
cat >> Makefile << 'MKEOF'

# ─── MATLAB Integration ─────────────────────────────────────────────────────

matlab-check:  ## Verify MATLAB or Octave is available
	@command -v matlab >/dev/null 2>&1 && matlab -batch "disp('MATLAB OK')" \
	  || (command -v octave >/dev/null 2>&1 && octave --eval "disp('Octave OK')" \
	  || (echo "ERROR: Neither MATLAB nor Octave found." && exit 1))

matlab-test:  ## Run MATLAB unit tests (uses Octave if MATLAB unavailable)
	@if command -v matlab >/dev/null 2>&1; then \
	    matlab -batch "cd matlab/tests; results = runtests; disp(results)"; \
	else \
	    echo "Using Octave fallback..."; \
	    for f in matlab/tests/test_*.m; do \
	        echo "=== $$$$f ==="; \
	        octave --no-gui --eval "run('$$$$f')"; \
	    done; \
	fi

matlab-lint:  ## Run MATLAB code analyzer (checkcode) on all .m files
	@if command -v matlab >/dev/null 2>&1; then \
	    matlab -batch "files = dir('matlab/**/*.m'); for i=1:numel(files), checkcode(fullfile(files(i).folder, files(i).name)); end"; \
	else \
	    echo "MATLAB not available; skipping lint."; \
	fi

matlab-ecg:  ## Run MATLAB ECG pipeline via Python bridge
	@echo "Running MATLAB ECG pipeline..."
	$(VENV)/bin/python -c "from src.utils.matlab_bridge import call_matlab; call_matlab('run_ecg_pipeline')"
	@echo "✓ MATLAB ECG pipeline complete."
MKEOF
```

---

## 10 — Config & Environment Variables

### Add to `.env.example`

```bash
cat >> .env.example << 'EOF'

# ─── MATLAB Integration ────────────────────────────────────
# Path to MATLAB installation root
MATLAB_ROOT=/usr/local/MATLAB/R2024b

# Backend: "matlab" (default) or "octave" (free fallback)
MATLAB_BACKEND=matlab

# Path to compiled MATLAB binaries (if using MATLAB Compiler)
MCR_ROOT=/opt/mcr/R2024b

# MATLAB license file (network or standalone)
MLM_LICENSE_FILE=27000@license-server.sc.edu
EOF
```

### Add to `config/paths.yml`

```yaml
# ─── MATLAB Scripts & Outputs ───────────────────────────────
matlab:
  scripts_dir: "matlab"
  ecg_scripts_dir: "matlab/ecg"
  models_scripts_dir: "matlab/models"
  utils_scripts_dir: "matlab/utils"
  output_dir: "${NANO_DATA_ROOT}/matlab_outputs"
```

---

## 11 — Recommended `.gitignore` Additions

```bash
cat >> .gitignore << 'EOF'

# ─── MATLAB ─────────────────────────────────────────────────
*.asv
*.mex*
*.mlappinstall
*.mlpkginstall
*.slxp
*.autosave
matlab/tests/results/
helpsearch*/
slprj/
sccprj/
codegen/
*.mexa64
*.mexmaci64
*.mexw64
EOF
```

---

## 12 — Complete Recommendations Summary Table

| Category | Tool / Plugin | Priority | Install / Enable Command | NANO Use Case |
|----------|--------------|----------|--------------------------|---------------|
| **VS Code Extension** | `MathWorks.language-matlab` | 🔴 Critical | `code --install-extension MathWorks.language-matlab` | MATLAB syntax, linting, code nav |
| **VS Code Extension** | `Gimly81.matlab` | 🟡 Recommended | `code --install-extension Gimly81.matlab` | Snippets, run-selection |
| **VS Code Extension** | `eamodio.gitlens` | 🟢 Nice-to-have | `code --install-extension eamodio.gitlens` | Git blame on `.m` files |
| **Python Connector** | `matlabengine` | 🔴 Critical | `pip install matlabengine` | Call `.m` from pipeline stages |
| **Python Connector** | `oct2py` | 🔴 Critical | `pip install oct2py` | Free CI fallback (no MATLAB license) |
| **Python Connector** | `hdf5storage` | 🟡 Recommended | `pip install hdf5storage` | Read v7.3 `.mat` files |
| **Python Connector** | `mat73` | 🟡 Recommended | `pip install mat73` | Simpler v7.3 `.mat` reader |
| **Python Connector** | `scipy.io` | ✅ Already installed | — | Read/write `.mat` v5 files |
| **Jupyter Skill** | `matlab-kernel` | 🟢 Nice-to-have | `pip install matlab-kernel` | MATLAB cells in Jupyter |
| **Jupyter Skill** | `jupyter-matlab-proxy` | 🟢 Nice-to-have | `pip install jupyter-matlab-proxy` | Full MATLAB GUI in browser |
| **MATLAB Toolbox** | Signal Processing | 🔴 Critical | `matlab -batch "ver('signal')"` | ECG bandpass, spectral analysis |
| **MATLAB Toolbox** | Statistics & ML | 🔴 Critical | `matlab -batch "ver('stats')"` | Classification, cross-val |
| **MATLAB Toolbox** | Deep Learning | 🟡 Recommended | `matlab -batch "ver('nnet')"` | CNN/LSTM ECG models |
| **MATLAB Toolbox** | Wavelet | 🟡 Recommended | `matlab -batch "ver('wavelet')"` | CWT-based RSA |
| **MATLAB Toolbox** | Parallel Computing | 🟡 Recommended | `matlab -batch "ver('parallel')"` | Batch ECG processing |
| **MATLAB Toolbox** | Compiler | 🟢 Nice-to-have | `matlab -batch "ver('compiler')"` | Standalone binaries for CI |
| **MATLAB Toolbox** | Report Generator | 🟢 Nice-to-have | `matlab -batch "ver('rptgen')"` | Auto PDF quality reports |
| **Docker** | MATLAB Runtime (MCR) | 🟡 Recommended | See §5.1 Dockerfile snippet | Compiled `.m` in containers |
| **Docker** | GNU Octave | 🔴 Critical | `apt-get install -y octave` | Free MATLAB compat in Docker/CI |
| **CI/CD** | Octave CI job | 🔴 Critical | See §8 `ci.yml` snippet | Automated `.m` tests |
| **Makefile** | `matlab-check` | 🔴 Critical | `make matlab-check` | Verify MATLAB/Octave available |
| **Makefile** | `matlab-test` | 🔴 Critical | `make matlab-test` | Run MATLAB unit tests |
| **Makefile** | `matlab-lint` | 🟡 Recommended | `make matlab-lint` | Static analysis on `.m` files |
| **Makefile** | `matlab-ecg` | 🟡 Recommended | `make matlab-ecg` | Run MATLAB ECG pipeline |
| **Config** | `config/paths.yml` | 🔴 Critical | See §10 YAML snippet | MATLAB script/output paths |
| **Config** | `.env.example` | 🔴 Critical | See §10 env snippet | MATLAB_ROOT, license vars |
| **Config** | `.gitignore` | 🟡 Recommended | See §11 snippet | Ignore MATLAB artifacts |

---

## 13 — Quick-Start Checklist

```bash
# ── 1. Install connectors ──
pip install matlabengine oct2py hdf5storage mat73

# ── 2. Create MATLAB directory structure ──
mkdir -p matlab/{ecg,models,utils,tests}

# ── 3. Verify MATLAB is accessible ──
make matlab-check

# ── 4. Install VS Code extensions ──
code --install-extension MathWorks.language-matlab
code --install-extension Gimly81.matlab

# ── 5. Test the Python↔MATLAB bridge ──
python -c "
from src.utils.matlab_bridge import get_engine, shutdown
eng = get_engine()
result = eng.sqrt(42.0)
print(f'sqrt(42) = {result}')
shutdown()
"

# ── 6. Run MATLAB tests ──
make matlab-test

# ── 7. Run full pipeline (now includes MATLAB stages) ──
make run-pipeline
```

---

## 14 — Migration Path: Python → MATLAB Equivalents

For scripts the lab already has in MATLAB, here is how each Python module maps:

| Python Module | MATLAB Equivalent | Migration Strategy |
|--------------|-------------------|-------------------|
| `ecg_preprocessing.py` → `bandpass_filter()` | `bandpass_filter_ecg.m` using `designfilt()` + `filtfilt()` | Keep Python as primary; call MATLAB via bridge for validation |
| `ecg_preprocessing.py` → `detect_rpeaks()` | `findpeaks()` + Pan-Tompkins in Signal Processing Toolbox | Dual-run both, compare R-peak indices |
| `hrv_features.py` → `compute_rsa_cwt()` | `cwt()` from Wavelet Toolbox | MATLAB CWT is more mature; consider MATLAB as primary |
| `hrv_features.py` → `compute_time_domain_hrv()` | Custom `.m` or PhysioNet HRV Toolbox for MATLAB | MATLAB HRV Toolbox has FDA-validated algorithms |
| `ml_pipeline.py` | Classification Learner app / `fitcensemble()` | Use MATLAB for rapid prototyping, Python for production |
| `deep_learning_ecg.py` | Deep Learning Toolbox `trainnet()` | Keep PyTorch for training; use MATLAB for ONNX export/validation |
| `latent_growth_curves.R` | Curve Fitting Toolbox or SEM via `fitlme()` | Keep R/lavaan as primary (more mature SEM ecosystem) |
| `mice_imputation.R` | No direct MATLAB equivalent | Keep R MICE; pass imputed data to MATLAB via `.mat` files |

---

> **Last updated**: 2026-05-21  
> **Author**: Auto-generated for NANO Study MATLAB integration planning
