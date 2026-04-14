"""Shared pytest fixtures for the NANO Study ESD Lab test suite."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pytest
import yaml


@pytest.fixture
def synthetic_ecg_ibi() -> pd.Series:
    """Return 500 realistic IBI values (ms) with cumulative timestamps as index.

    IBIs are centred around 800 ms with physiological noise.
    """
    rng = np.random.default_rng(42)
    base = 800.0
    noise = rng.normal(0, 30, size=500)
    # Add slow sinusoidal drift to mimic RSA
    drift = 50 * np.sin(np.linspace(0, 4 * np.pi, 500))
    ibi_values = np.clip(base + noise + drift, 400, 1400)
    cumulative_ms = np.cumsum(ibi_values)
    return pd.Series(ibi_values, index=cumulative_ms, name="ibi_ms")


@pytest.fixture
def mock_redcap_records() -> list[dict[str, Any]]:
    """Return 10 dicts simulating REDCap API records."""
    rng = np.random.default_rng(0)
    records = []
    events = ["baseline_arm_1", "month_6_arm_1", "month_12_arm_1"]
    for i in range(1, 11):
        records.append(
            {
                "record_id": f"NANO-{i:04d}",
                "redcap_event_name": events[i % len(events)],
                "nano_id": f"N{i:03d}",
                "sex": "M" if i % 2 == 0 else "F",
                "ga_weeks": int(rng.integers(24, 42)),
                "group_code": "ASD" if i % 3 == 0 else "TD",
                "ados2_css_total": int(rng.integers(0, 20)),
                "bayley4_cog_composite": int(rng.integers(70, 130)),
                "ecg_duration_min": round(float(rng.uniform(5, 30)), 1),
            }
        )
    return records


@pytest.fixture
def config_override(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Create a temp paths.yml and patch NANO_DATA_ROOT; yield config dict."""
    data_root = tmp_path / "data"
    data_root.mkdir()
    for sub in ("raw", "processed", "deidentified", "logs"):
        (data_root / sub).mkdir()

    paths_config = {
        "data_root": str(data_root),
        "raw_ecg_dir": str(data_root / "raw" / "ecg"),
        "processed_dir": str(data_root / "processed"),
        "deidentified_dir": str(data_root / "deidentified"),
        "logs_dir": str(data_root / "logs"),
    }
    cfg_file = tmp_path / "paths.yml"
    cfg_file.write_text(yaml.dump(paths_config))

    monkeypatch.setenv("NANO_DATA_ROOT", str(data_root))
    monkeypatch.setenv("NANO_PATHS_CONFIG", str(cfg_file))

    yield paths_config


@pytest.fixture
def synthetic_temperature_df() -> pd.DataFrame:
    """Return a 24-hour, 1-min interval temperature DataFrame."""
    rng = np.random.default_rng(7)
    n = 24 * 60  # 1440 minutes
    timestamps = pd.date_range("2023-01-01 00:00", periods=n, freq="1min")
    temp_abdominal = rng.uniform(36.0, 38.0, size=n)
    temp_peripheral = rng.uniform(32.0, 35.0, size=n)
    cpTd = temp_abdominal - temp_peripheral
    return pd.DataFrame(
        {
            "timestamp": timestamps,
            "temp_abdominal": temp_abdominal,
            "temp_peripheral": temp_peripheral,
            "cpTd": cpTd,
        }
    )
