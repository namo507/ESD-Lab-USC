#!/usr/bin/env bash
set -euo pipefail

VENV_DIR="${VENV:-.venv}"

if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
	python -m venv "${VENV_DIR}"
fi

source "${VENV_DIR}/bin/activate"

pip install --upgrade pip
pip install -r requirements.txt
pre-commit install

Rscript -e "if (!requireNamespace('renv', quietly = TRUE)) install.packages('renv', repos = 'https://cloud.r-project.org')"

echo "Dev container setup complete."
