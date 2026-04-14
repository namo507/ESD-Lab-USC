"""Configuration loader for NANO Study.

Loads config/paths.yml and config/study_parameters.yml via PyYAML.
Performs environment variable substitution and validates that critical
paths exist (when running in production mode).

All data paths in the project must be retrieved via this module —
never hardcoded.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import yaml

# ─── Constants ────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = PROJECT_ROOT / "config"

_config_cache: dict[str, Any] | None = None


def _substitute_env_vars(obj: Any) -> Any:
    """Recursively substitute ${ENV_VAR} patterns with environment values.

    Args:
        obj: YAML-parsed object (dict, list, or string).

    Returns:
        Object with environment variable references replaced by their values.
    """
    if isinstance(obj, dict):
        return {k: _substitute_env_vars(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_substitute_env_vars(item) for item in obj]
    if isinstance(obj, str):
        def replace_match(m: re.Match) -> str:
            var_name = m.group(1)
            value = os.environ.get(var_name)
            if value is None:
                return m.group(0)  # leave unreplaced if env var not set
            return value
        return re.sub(r"\$\{([^}]+)\}", replace_match, obj)
    return obj


def load_config(
    force_reload: bool = False,
    validate_paths: bool = False,
) -> dict[str, Any]:
    """Load and merge all NANO Study configuration files.

    Loads paths.yml, study_parameters.yml, and redcap_config.yml,
    substitutes environment variables, and optionally validates that
    critical paths (secure data drive) are accessible.

    Args:
        force_reload: If True, bypass the in-memory cache and reload
            from disk.
        validate_paths: If True, raise an error if NANO_DATA_ROOT is
            not accessible (secure drive not mounted).

    Returns:
        Dict with keys:
            - 'paths': contents of paths.yml
            - 'study': contents of study_parameters.yml
            - 'redcap': contents of redcap_config.yml
            - 'models': contents of model_config.yml

    Raises:
        FileNotFoundError: If a required config file is missing.
        EnvironmentError: If validate_paths=True and NANO_DATA_ROOT
            is not accessible.
    """
    global _config_cache
    if _config_cache is not None and not force_reload:
        return _config_cache

    config: dict[str, Any] = {}

    config_files = {
        "paths": CONFIG_DIR / "paths.yml",
        "study": CONFIG_DIR / "study_parameters.yml",
        "redcap": CONFIG_DIR / "redcap_config.yml",
        "models": CONFIG_DIR / "model_config.yml",
    }

    for key, cfg_path in config_files.items():
        if not cfg_path.exists():
            raise FileNotFoundError(
                f"Required config file not found: {cfg_path}. "
                f"Ensure you are running from the project root: {PROJECT_ROOT}"
            )
        with open(cfg_path, "r") as f:
            raw = yaml.safe_load(f)
        config[key] = _substitute_env_vars(raw)

    if validate_paths:
        data_root = os.environ.get("NANO_DATA_ROOT")
        if not data_root:
            raise EnvironmentError(
                "NANO_DATA_ROOT environment variable is not set. "
                "Configure it in .env and ensure the secure drive is mounted."
            )
        if not Path(data_root).exists():
            raise EnvironmentError(
                f"NANO_DATA_ROOT '{data_root}' does not exist. "
                "Mount the USC secure research drive first. See README.md."
            )

    _config_cache = config
    return config


def get_path(key_path: str, validate: bool = False) -> Path:
    """Retrieve a specific data path from configuration.

    Args:
        key_path: Dot-separated path into config['paths'], e.g.
            'raw.ecg_dir' or 'processed.hrv_features_dir'.
        validate: If True, raise FileNotFoundError if the path does not
            exist on disk.

    Returns:
        Path object for the requested data directory/file.

    Raises:
        KeyError: If the key_path is not found in paths config.
        FileNotFoundError: If validate=True and path does not exist.

    Example:
        >>> ecg_dir = get_path('raw.ecg_dir')
        >>> hrv_dir = get_path('processed.hrv_features_dir', validate=True)
    """
    config = load_config()
    parts = key_path.split(".")
    value: Any = config["paths"]

    for part in parts:
        if not isinstance(value, dict) or part not in value:
            raise KeyError(
                f"Config path key '{key_path}' not found. "
                f"Failed at '{part}'. Check config/paths.yml."
            )
        value = value[part]

    path = Path(str(value))
    if validate and not path.exists():
        raise FileNotFoundError(
            f"Configured path does not exist: {path} (key: '{key_path}'). "
            "Ensure the secure drive is mounted and NANO_DATA_ROOT is set."
        )
    return path
