"""HDA composition stream builder stub.

Production wiring should aggregate accepted HDA epochs by cohort group and CGA
month, returning the ``hda_composition`` dashboard_data.json block.
"""
from __future__ import annotations

from typing import Any


def build_hda_stream(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
    """Return a schema-valid HDA stream payload until real data is wired."""
    from dashboard.pipelines.generate_synthetic_dashboard_data import generate_hda_composition

    # TODO: Replace synthetic fallback with secure accepted-epoch phase counts.
    return generate_hda_composition()
