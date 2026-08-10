"""Single canonical loader for the repository ``.env`` file.

Every entry point that needs credentials -- REDCap sync jobs, the dashboard
server, the assistant, and operator scripts -- routes through this module so
there is exactly one secret file and one parsing behaviour.

Design rules:

* ``<repo>/.env`` is the only file read.  Historical side files such as
  ``.env.pre-ollama.bak`` are never loaded; :func:`stray_env_files` reports them
  so an operator can fold them in and delete them.
* Values already present in ``os.environ`` always win.  Compose, Kubernetes, and
  CI inject configuration explicitly and must not be shadowed by a developer's
  local file.
* ``python-dotenv`` is used when installed.  A dependency-free parser with the
  same semantics is used otherwise, so a slim container never loses its
  configuration just because an optional package is missing.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Iterable, Mapping

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = PROJECT_ROOT / ".env"
ENV_TEMPLATE_PATH = PROJECT_ROOT / ".env.example"

# Side files an operator may still have on disk from an older layout. They are
# reported by ``env-doctor`` and intentionally never loaded.
LEGACY_ENV_GLOBS = (".env.*",)

_SECRET_HINTS = ("token", "key", "secret", "password", "passwd", "credential")
_INTERPOLATION = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")
_ASSIGNMENT = re.compile(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$")

_loaded_from: Path | None = None


def is_secret_key(key: str) -> bool:
    """Return True when a variable name looks like it holds a credential."""
    lowered = key.lower()
    return any(hint in lowered for hint in _SECRET_HINTS)


def mask(value: str | None) -> str:
    """Render a value safe to print in operator diagnostics."""
    if value is None:
        return "<unset>"
    text = value.strip()
    if not text:
        return "<empty>"
    if len(text) <= 8:
        return "*" * len(text)
    return f"{text[:4]}...{text[-4:]} ({len(text)} chars)"


def _strip_inline_comment(value: str) -> str:
    """Drop a trailing ``# comment`` from an unquoted value."""
    out: list[str] = []
    quote: str | None = None
    previous = ""
    for index, char in enumerate(value):
        if quote:
            if char == quote and previous != "\\":
                quote = None
        elif char in "\"'":
            quote = char
        elif char == "#" and (index == 0 or value[index - 1].isspace()):
            break
        out.append(char)
        previous = char
    return "".join(out)


def _unquote(value: str) -> tuple[str, bool]:
    """Return the literal value plus whether it was single-quoted."""
    text = value.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        return text[1:-1], text[0] == "'"
    return text, False


def parse_env_text(text: str) -> dict[str, str]:
    """Parse dotenv content with ``${VAR}`` interpolation.

    Interpolation resolves against values defined earlier in the same file and
    then against the current process environment, matching ``python-dotenv``.
    Single-quoted values are taken literally, as in POSIX shells.
    """
    parsed: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = _ASSIGNMENT.match(line)
        if match is None:
            continue
        key, raw_value = match.group(1), match.group(2)
        value, literal = _unquote(_strip_inline_comment(raw_value))
        if not literal:
            value = _INTERPOLATION.sub(
                lambda m: parsed.get(m.group(1), os.environ.get(m.group(1), "")),
                value,
            )
        parsed[key] = value
    return parsed


def read_env_file(path: Path = ENV_PATH) -> dict[str, str]:
    """Parse a dotenv file without touching ``os.environ``."""
    if not path.is_file():
        return {}
    return parse_env_text(path.read_text(encoding="utf-8"))


def load_project_env(
    path: Path = ENV_PATH,
    *,
    override: bool = False,
    force: bool = False,
) -> bool:
    """Load the canonical ``.env`` into ``os.environ``.

    Returns True when a file was read. Repeat calls are cheap no-ops unless
    ``force`` is set, so importing several modules that each want configuration
    does not re-read the file.
    """
    global _loaded_from

    if _loaded_from is not None and not force:
        return True
    if not path.is_file():
        return False

    try:
        from dotenv import load_dotenv
    except Exception:
        for key, value in read_env_file(path).items():
            if override or key not in os.environ:
                os.environ[key] = value
    else:
        load_dotenv(path, override=override)

    _loaded_from = path
    return True


def loaded_from() -> Path | None:
    """Return the path this process loaded, or None when nothing was loaded."""
    return _loaded_from


def stray_env_files(root: Path = PROJECT_ROOT) -> list[Path]:
    """List extra ``.env.*`` files that are neither the template nor the file.

    These are the leftovers that make credentials drift across copies. They are
    never loaded; the doctor command reports them so they can be folded into
    ``.env`` and deleted.
    """
    keep = {ENV_PATH.name, ENV_TEMPLATE_PATH.name}
    found: list[Path] = []
    for pattern in LEGACY_ENV_GLOBS:
        for candidate in sorted(root.glob(pattern)):
            if candidate.is_file() and candidate.name not in keep:
                found.append(candidate)
    return found


def template_keys(path: Path = ENV_TEMPLATE_PATH) -> list[str]:
    """Return every variable name documented in ``.env.example``."""
    return list(read_env_file(path).keys())


def missing_keys(
    required: Iterable[str],
    *,
    env: Mapping[str, str] | None = None,
) -> list[str]:
    """Return required names that are absent or blank."""
    source: Mapping[str, str] = os.environ if env is None else env
    return [key for key in required if not str(source.get(key, "")).strip()]


def env_report(
    path: Path = ENV_PATH,
    *,
    template: Path = ENV_TEMPLATE_PATH,
) -> dict[str, Any]:
    """Build a masked configuration report for operator diagnostics.

    No raw secret value is ever included in the returned structure.
    """
    file_values = read_env_file(path)
    documented = template_keys(template)
    configured = {key: value for key, value in file_values.items() if value.strip()}

    mode = None
    if path.is_file():
        mode = oct(path.stat().st_mode & 0o777)

    return {
        "env_path": str(path),
        "env_present": path.is_file(),
        "env_mode": mode,
        "template_path": str(template),
        "documented_keys": len(documented),
        "configured_keys": len(configured),
        "blank_keys": sorted(set(file_values) - set(configured)),
        "undocumented_keys": sorted(set(file_values) - set(documented)),
        "missing_from_env": sorted(set(documented) - set(file_values)),
        "stray_files": [str(item) for item in stray_env_files(path.parent)],
        "values": {
            key: (mask(value) if is_secret_key(key) else value)
            for key, value in sorted(file_values.items())
        },
    }


__all__ = [
    "ENV_PATH",
    "ENV_TEMPLATE_PATH",
    "PROJECT_ROOT",
    "env_report",
    "is_secret_key",
    "load_project_env",
    "loaded_from",
    "mask",
    "missing_keys",
    "parse_env_text",
    "read_env_file",
    "stray_env_files",
    "template_keys",
]
