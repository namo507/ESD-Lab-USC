"""Workspace REDCap package with PyCap compatibility.

This repository keeps local modules under ``redcap.api.*`` while some runtime
paths also expect ``redcap.Project`` from the external PyCap package. This file
extends the package search path to include PyCap's installed ``redcap``
directory so both sets of modules can coexist.
"""

from __future__ import annotations

from pathlib import Path
import sys


_HERE = Path(__file__).resolve()
_PROJECT_ROOT = _HERE.parent.parent.resolve()


for entry in sys.path:
    if not entry:
        continue
    try:
        resolved = Path(entry).resolve()
    except OSError:
        continue
    if resolved == _PROJECT_ROOT:
        continue
    candidate = resolved / "redcap"
    if candidate.is_dir() and candidate != _HERE.parent:
        __path__.append(str(candidate))
        break

try:
    from .project import Project
except ImportError:
    class Project:  # type: ignore[no-redef]
        def __init__(self, *args, **kwargs):
            raise ImportError("PyCap is not installed; redcap.Project is unavailable")


__all__ = ["Project"]