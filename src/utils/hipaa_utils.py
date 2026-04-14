"""HIPAA compliance utilities for NANO Study.

Provides:
  - safe_load_data(): Warns if loading from potentially unencrypted path
  - hash_participant_id(): SHA-256 pseudonymization of participant IDs
  - audit_trail: Decorator that logs all data transformation function calls
  - sanitize_for_logging(): Remove any PHI patterns from log strings

These utilities must be used throughout the pipeline to maintain HIPAA
compliance. All data loads should call safe_load_data() first.
"""

from __future__ import annotations

import functools
import hashlib
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, TypeVar

from src.utils.logging_utils import get_pipeline_logger

logger = get_pipeline_logger(__name__)

# ─── PHI Pattern Detection ────────────────────────────────────────────────────

# Patterns that may indicate PHI in strings
_PHI_PATTERNS = [
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),            # SSN
    re.compile(r"\b\d{10}\b"),                         # MRN (10-digit)
    re.compile(r"\b[A-Z][a-z]+ [A-Z][a-z]+\b"),       # Name pattern (First Last)
    re.compile(r"\b\d{1,2}/\d{1,2}/\d{4}\b"),         # Date MM/DD/YYYY
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),              # Date YYYY-MM-DD
    re.compile(r"\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b"),  # Email
    re.compile(r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b"),     # Phone number
]

F = TypeVar("F", bound=Callable[..., Any])


def safe_load_data(file_path: Path | str) -> None:
    """Warn if a data file is being loaded from a potentially unencrypted path.

    Checks whether the file path appears to be on an external encrypted drive.
    Issues a warning (not an error) if the path looks like a local disk.
    This is a reminder mechanism — ultimate responsibility lies with the user.

    Args:
        file_path: Path to the data file being loaded.
    """
    path = Path(file_path)
    path_str = str(path).lower()

    # Paths that suggest unencrypted local storage
    risky_prefixes = [
        "/tmp/",
        "/var/",
        "/home/",
        os.path.expanduser("~/desktop"),
        os.path.expanduser("~/downloads"),
        os.path.expanduser("~/documents"),
    ]

    # Acceptable secure paths
    nano_data_root = os.environ.get("NANO_DATA_ROOT", "")

    if nano_data_root and path_str.startswith(nano_data_root.lower()):
        return  # On configured secure drive

    for risky in risky_prefixes:
        if path_str.startswith(risky.lower()):
            logger.warning(
                "HIPAA WARNING: Loading data from potentially unencrypted path: %s. "
                "All NANO Study raw data must be on the USC encrypted secure drive "
                "mounted at NANO_DATA_ROOT=%s.",
                path.name,  # Log filename only, not full path
                nano_data_root or "(not set)",
            )
            return


def hash_participant_id(
    participant_id: str,
    salt: str | None = None,
) -> str:
    """Pseudonymize a NANO participant ID using SHA-256.

    Creates a deterministic pseudonym for the participant ID that:
    - Is irreversible without the salt
    - Is consistent across runs (same ID + salt → same hash)
    - Does not reveal the original ID

    Args:
        participant_id: The NANO participant ID string (e.g., 'NANO-0042').
        salt: Optional salt string for added security. If None, uses
            the REDCAP_API_TOKEN as salt (not ideal but available).
            For production, set a dedicated HASH_SALT environment variable.

    Returns:
        First 12 characters of the hex SHA-256 hash, prefixed with 'P_'.
        Example: 'P_3a7f9c12e401'

    Raises:
        ValueError: If participant_id is empty.
    """
    if not participant_id or not participant_id.strip():
        raise ValueError("participant_id cannot be empty.")

    if salt is None:
        salt = os.environ.get("HASH_SALT", os.environ.get("REDCAP_API_TOKEN", "nano_study_2024"))

    combined = f"{salt}:{participant_id.strip()}"
    digest = hashlib.sha256(combined.encode("utf-8")).hexdigest()
    return f"P_{digest[:12]}"


def sanitize_for_logging(message: str) -> str:
    """Remove potential PHI patterns from a string before logging.

    Replaces patterns that resemble SSNs, dates, names, phone numbers,
    and email addresses with redacted placeholders.

    Args:
        message: String to sanitize.

    Returns:
        String with PHI patterns replaced by '[REDACTED]'.
    """
    sanitized = message
    for pattern in _PHI_PATTERNS:
        sanitized = pattern.sub("[REDACTED]", sanitized)
    return sanitized


def audit_trail(func: F) -> F:
    """Decorator that logs data transformation function calls to audit log.

    Records:
    - Function name and module
    - Call timestamp
    - Input record count (if first argument is a DataFrame)
    - Output record count (if return value is a DataFrame)
    - Does NOT log any data values or PHI

    Args:
        func: Function to wrap with audit logging.

    Returns:
        Wrapped function with audit trail logging.
    """
    audit_logger = get_pipeline_logger("nano.audit_trail", log_file="data_access_audit.log")

    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        import pandas as pd

        func_name = f"{func.__module__}.{func.__qualname__}"
        timestamp = datetime.now().isoformat()

        # Count input rows if first arg is a DataFrame
        n_input = None
        if args and isinstance(args[0], pd.DataFrame):
            n_input = len(args[0])

        audit_logger.info(
            "CALL | %s | %s | input_rows=%s",
            func_name,
            timestamp,
            n_input if n_input is not None else "N/A",
        )

        result = func(*args, **kwargs)

        # Count output rows
        n_output = None
        if isinstance(result, pd.DataFrame):
            n_output = len(result)
        elif isinstance(result, tuple) and result and isinstance(result[0], pd.DataFrame):
            n_output = len(result[0])

        audit_logger.info(
            "RETURN | %s | %s | output_rows=%s",
            func_name,
            datetime.now().isoformat(),
            n_output if n_output is not None else "N/A",
        )

        return result

    return wrapper  # type: ignore[return-value]
