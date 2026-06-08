"""Attrition funnel builder stub.

Production wiring should aggregate screening, consent, visit completion,
withdrawal, and missed-visit reason fields into the attrition_funnel block.
"""
from __future__ import annotations

from typing import Any


def build_attrition_funnel(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
    """Return a schema-valid retention funnel until REDCap reasons are wired."""
    from dashboard.pipelines.generate_synthetic_dashboard_data import generate_attrition_funnel

    # TODO: Replace synthetic fallback with REDCap withdrawal/missed-visit fields.
    return generate_attrition_funnel()
