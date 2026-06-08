"""County profile builder stub.

Production wiring should expose county-level aggregate SDoH and engagement
profiles only. Do not emit ZIP, census tract, address, or participant-level
location data.
"""
from __future__ import annotations

from typing import Any


def build_county_profiles(*_args: Any, **_kwargs: Any) -> list[dict[str, Any]]:
    """Return public-safe county aggregate profiles until real data is wired."""
    from dashboard.pipelines.generate_synthetic_dashboard_data import generate_county_profiles

    # TODO: Replace synthetic fallback with de-identified county FIPS aggregates.
    return generate_county_profiles()
