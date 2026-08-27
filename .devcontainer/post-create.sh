#!/usr/bin/env bash
set -euo pipefail

VENV_DIR="${VENV:-.venv}"
R_LIBS_USER="${R_LIBS_USER:-$HOME/R/library}"
export R_LIBS_USER

mkdir -p "$R_LIBS_USER"

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
	python -m venv "${VENV_DIR}"
fi

source "${VENV_DIR}/bin/activate"

pip install --upgrade pip
pip install -r requirements.txt
pre-commit install

Rscript -e "if (!requireNamespace('renv', quietly = TRUE)) install.packages('renv', repos = 'https://cloud.r-project.org', lib = Sys.getenv('R_LIBS_USER'))"

echo "Dev container setup complete."
