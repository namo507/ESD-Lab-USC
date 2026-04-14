"""Standardized logging utilities for NANO Study pipeline.

All pipeline steps log to logs/ directory with timestamps, record counts,
and data quality flags. PHI is NEVER logged.

Usage:
    from src.utils.logging_utils import get_pipeline_logger
    logger = get_pipeline_logger(__name__)
    logger.info("Processing %d records for event %s", n, event)
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import datetime
from pathlib import Path

# ─── Log Directory ────────────────────────────────────────────────────────────

LOG_DIR = Path(os.environ.get("LOG_DIR", "logs"))
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()

_loggers: dict[str, logging.Logger] = {}


def _ensure_log_dir() -> None:
    """Create log directory if it does not exist."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)


def get_pipeline_logger(
    name: str,
    log_file: str | None = None,
    level: str | None = None,
) -> logging.Logger:
    """Get or create a named pipeline logger.

    Configures both console (stderr) and file handlers. File logs are
    written to logs/<name>_YYYYMMDD.log. PHI must never be passed as
    log arguments — use record counts and aggregate statistics only.

    Args:
        name: Logger name, typically __name__ from the calling module.
        log_file: Optional custom log file name (without .log extension).
            Defaults to module name + today's date.
        level: Log level string ('DEBUG', 'INFO', 'WARNING', 'ERROR').
            Defaults to LOG_LEVEL environment variable or 'INFO'.

    Returns:
        Configured logging.Logger instance.
    """
    if name in _loggers:
        return _loggers[name]

    logger = logging.getLogger(name)

    if level is None:
        level = LOG_LEVEL

    numeric_level = getattr(logging, level, logging.INFO)
    logger.setLevel(numeric_level)

    # Avoid duplicate handlers if logger already configured
    if logger.handlers:
        _loggers[name] = logger
        return logger

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console handler (stderr)
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(numeric_level)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File handler
    try:
        _ensure_log_dir()
        today = datetime.now().strftime("%Y%m%d")
        safe_name = name.replace(".", "_").replace("/", "_")
        file_name = log_file or f"{safe_name}_{today}.log"
        file_path = LOG_DIR / file_name

        file_handler = logging.FileHandler(file_path, mode="a", encoding="utf-8")
        file_handler.setLevel(numeric_level)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except (OSError, PermissionError) as e:
        logger.warning("Could not create log file: %s. Logging to console only.", e)

    _loggers[name] = logger
    return logger


def log_data_summary(
    logger: logging.Logger,
    df_name: str,
    n_rows: int,
    n_cols: int,
    n_missing: int | None = None,
    pct_complete: float | None = None,
    extra: str | None = None,
) -> None:
    """Log a standardized data summary line (never logs PHI values).

    Args:
        logger: Logger instance.
        df_name: Name of the DataFrame or processing step.
        n_rows: Number of rows.
        n_cols: Number of columns.
        n_missing: Optional count of missing values.
        pct_complete: Optional completeness percentage.
        extra: Optional extra context string.
    """
    parts = [f"[{df_name}] rows={n_rows} cols={n_cols}"]
    if n_missing is not None:
        parts.append(f"missing={n_missing}")
    if pct_complete is not None:
        parts.append(f"complete={pct_complete:.1f}%")
    if extra:
        parts.append(extra)
    logger.info(" | ".join(parts))


def log_pipeline_step(
    logger: logging.Logger,
    step_name: str,
    n_input: int,
    n_output: int,
    elapsed_sec: float | None = None,
) -> None:
    """Log a pipeline step with input/output record counts.

    Args:
        logger: Logger instance.
        step_name: Descriptive name for the pipeline step.
        n_input: Number of records entering the step.
        n_output: Number of records exiting the step.
        elapsed_sec: Optional elapsed time in seconds.
    """
    msg = f"[STEP: {step_name}] input={n_input} → output={n_output}"
    if n_input > 0:
        pct_retained = n_output / n_input * 100
        msg += f" ({pct_retained:.1f}% retained)"
    if elapsed_sec is not None:
        msg += f" [{elapsed_sec:.2f}s]"
    if n_output < n_input:
        logger.warning(msg)
    else:
        logger.info(msg)
