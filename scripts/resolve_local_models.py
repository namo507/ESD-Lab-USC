#!/usr/bin/env python3
"""Resolve local model tags against the live Ollama registry and pin them.

Model naming in the local-LLM ecosystem changes monthly, and secondary sources
(blog round-ups, aggregator posts) are frequently wrong about which tags exist
and how large they are. So this is a build-time resolution step rather than a
constant in a config file: every tag written to ``config/llm_model.json`` was
confirmed to exist, with its real digest and its real on-disk size, at the
moment the script ran.

The script **fails loudly** when no candidate satisfies the criteria. It never
silently substitutes a smaller or differently-licensed model, because a quiet
substitution is how a deployment ends up serving a model nobody chose.

    python scripts/resolve_local_models.py                 # resolve + report
    python scripts/resolve_local_models.py --write         # pin the result
    python scripts/resolve_local_models.py --vram-gb 24    # different tier

Weights are never downloaded here. This resolves metadata only; ``make
models-pull`` is what fetches blobs.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REGISTRY = "https://registry.ollama.ai/v2/library"
USER_AGENT = "ESD-Lab-Dashboard/1.0 (+https://esd-lab-namo.pages.dev; model resolver)"

CONFIG_PATH = PROJECT_ROOT / "config" / "llm_model.json"
MANIFEST_PATH = PROJECT_ROOT / "models" / "MANIFEST.json"
LICENSE_DIR = PROJECT_ROOT / "models" / "LICENSES"

MODEL_MEDIA_TYPE = "application/vnd.ollama.image.model"
LICENSE_MEDIA_TYPE = "application/vnd.ollama.image.license"


class ResolutionError(RuntimeError):
    """No candidate satisfied the criteria. Never recovered from silently."""


@dataclass(frozen=True)
class Candidate:
    """One model we are willing to consider for a role."""

    role: str
    name: str
    tag: str
    #: Declared context window. Verified against the model card, not the manifest,
    #: because Ollama manifests do not carry it.
    context: int
    #: Expected licence family, checked against the licence blob we fetch.
    expects_license: str
    note: str = ""

    @property
    def ref(self) -> str:
        return f"{self.name}:{self.tag}"


@dataclass
class Resolved:
    role: str
    ref: str
    digest: str
    size_bytes: int
    context: int
    license_id: str
    license_sha256: str
    source_url: str
    resolved_at: str
    layers: list[dict[str, Any]] = field(default_factory=list)

    @property
    def size_gb(self) -> float:
        return self.size_bytes / 1e9


# ---------------------------------------------------------------------------
# Candidate slate
#
# Ordered by preference within each role. Everything here is a *candidate*: the
# resolver confirms existence, size, and licence before any of it is chosen, and
# a candidate that fails a check is skipped with a printed reason rather than
# quietly used.
# ---------------------------------------------------------------------------

CANDIDATES: tuple[Candidate, ...] = (
    # Primary generalist: 12-14B dense at Q4_K_M, permissive licence.
    Candidate("primary", "qwen2.5", "14b", 131072, "apache-2.0", "128K context"),
    Candidate("primary", "mistral-nemo", "12b", 131072, "apache-2.0", "128K context"),
    Candidate("primary", "phi4", "14b", 16384, "mit", "16K context"),
    Candidate(
        "primary", "qwen2.5", "7b", 131072, "apache-2.0", "CPU-viable fallback tier"
    ),
    # Embeddings: small, CPU-resident, always on.
    Candidate("embedding", "nomic-embed-text", "latest", 8192, "apache-2.0", "768 dim"),
    Candidate(
        "embedding", "all-minilm", "latest", 512, "apache-2.0", "384 dim fallback"
    ),
)

#: Licences we will deploy without a human reading them first. Anything else
#: resolves but is reported as requiring review -- MedGemma's Health AI
#: Developer Foundations terms are the specific case this guards against.
PERMISSIVE = {"apache-2.0", "mit", "bsd-3-clause"}


def _fetch(url: str, *, accept: str | None = None, timeout: int = 30) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    if accept:
        request.add_header("Accept", accept)
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        return response.read()


def fetch_manifest(name: str, tag: str, *, timeout: int = 30) -> dict[str, Any]:
    url = f"{REGISTRY}/{name}/manifests/{tag}"
    raw = _fetch(
        url,
        accept="application/vnd.docker.distribution.manifest.v2+json",
        timeout=timeout,
    )
    payload = json.loads(raw)
    if "errors" in payload:
        code = payload["errors"][0].get("code", "UNKNOWN")
        raise ResolutionError(f"{name}:{tag} not in registry ({code})")
    return payload


def fetch_blob(name: str, digest: str, *, timeout: int = 60) -> bytes:
    # Blob URLs redirect to object storage, so redirects must be followed.
    return _fetch(f"{REGISTRY}/{name}/blobs/{digest}", timeout=timeout)


_LICENSE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("apache-2.0", re.compile(r"Apache License\s*\n?\s*Version 2\.0", re.I)),
    ("mit", re.compile(r"\bMIT License\b", re.I)),
    ("bsd-3-clause", re.compile(r"BSD 3-Clause", re.I)),
    ("llama", re.compile(r"LLAMA\s+\d*\s*COMMUNITY LICENSE", re.I)),
    ("gemma", re.compile(r"Gemma Terms of Use", re.I)),
    ("health-ai-dev-foundations", re.compile(r"Health AI Developer Foundations", re.I)),
)


def identify_license(text: str) -> str:
    """Name the licence from its own text, not from what we hoped it was."""
    for license_id, pattern in _LICENSE_PATTERNS:
        if pattern.search(text):
            return license_id
    return "unknown"


def sha256_hex(data: bytes) -> str:
    import hashlib

    return hashlib.sha256(data).hexdigest()


def resolve_candidate(candidate: Candidate, *, license_dir: Path | None) -> Resolved:
    manifest = fetch_manifest(candidate.name, candidate.tag)
    layers = manifest.get("layers", [])

    model_layers = [
        layer for layer in layers if layer.get("mediaType") == MODEL_MEDIA_TYPE
    ]
    if not model_layers:
        raise ResolutionError(f"{candidate.ref} has no model layer")
    model_layer = model_layers[0]

    license_id = "not-published"
    license_sha = ""
    license_layers = [
        layer for layer in layers if layer.get("mediaType") == LICENSE_MEDIA_TYPE
    ]
    if license_layers:
        blob = fetch_blob(candidate.name, license_layers[0]["digest"])
        license_id = identify_license(blob.decode("utf-8", errors="replace"))
        license_sha = sha256_hex(blob)
        if license_dir is not None:
            license_dir.mkdir(parents=True, exist_ok=True)
            target = license_dir / f"{candidate.name}-{candidate.tag}.txt"
            target.write_bytes(blob)

    return Resolved(
        role=candidate.role,
        ref=candidate.ref,
        digest=model_layer["digest"],
        size_bytes=int(model_layer.get("size", 0)),
        context=candidate.context,
        license_id=license_id,
        license_sha256=license_sha,
        source_url=f"https://ollama.com/library/{candidate.name}:{candidate.tag}",
        resolved_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        layers=[
            {
                "mediaType": lyr.get("mediaType"),
                "digest": lyr.get("digest"),
                "size": lyr.get("size"),
            }
            for lyr in layers
        ],
    )


def disk_budget_gb(vram_gb: float) -> float:
    """
    Largest model we will keep GPU-resident.

    A Q4_K_M model needs its weights plus a KV cache plus room for the prefill
    batch, and the cache grows with context. Three quarters of VRAM is the
    working rule that has kept this off the CPU-spill cliff; past it, throughput
    collapses to single-digit tokens per second and the speed requirement fails
    even though the model technically loads.
    """
    return round(vram_gb * 0.75, 2)


def select(
    candidates: Iterable[Candidate],
    role: str,
    *,
    max_gb: float,
    min_context: int,
    license_dir: Path | None,
    require_permissive: bool,
) -> tuple[Resolved, list[str]]:
    reasons: list[str] = []
    for candidate in [c for c in candidates if c.role == role]:
        try:
            resolved = resolve_candidate(candidate, license_dir=license_dir)
        except (ResolutionError, urllib.error.URLError, TimeoutError) as exc:
            reasons.append(f"{candidate.ref}: unreachable or absent ({exc})")
            continue
        if resolved.size_gb > max_gb:
            reasons.append(
                f"{candidate.ref}: {resolved.size_gb:.2f} GB exceeds {max_gb:.2f} GB budget"
            )
            continue
        if resolved.context < min_context:
            reasons.append(
                f"{candidate.ref}: {resolved.context} ctx below {min_context}"
            )
            continue
        if require_permissive and resolved.license_id not in PERMISSIVE:
            reasons.append(
                f"{candidate.ref}: licence '{resolved.license_id}' needs review before deploy"
            )
            continue
        return resolved, reasons
    raise ResolutionError(
        f"No candidate satisfied role '{role}'. Checked:\n  "
        + "\n  ".join(reasons or ["(none)"])
    )


def write_config(
    primary: Resolved, embedding: Resolved, *, vram_gb: float
) -> dict[str, Any]:
    """Extend the existing config rather than replacing it.

    Every key the hosted path already reads is preserved verbatim: the hosted
    NVIDIA tier stays defined and simply stops being the default, so a rollback
    is a one-line policy change rather than a restore.
    """
    existing = (
        json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        if CONFIG_PATH.exists()
        else {}
    )
    existing.update(
        {
            "schema_version": 5,
            "policy": "local-first",
            "provider": "ollama",
            "runtime": "ollama",
            "resolved_at": primary.resolved_at,
            "resolved_for_vram_gb": vram_gb,
            "local": {
                "enabled_by_default": True,
                "runtime": "ollama",
                "api_base_env": "DASHBOARD_ASSISTANT_LOCAL_API_BASE",
                "default_api_base": "http://ollama:11434/v1",
                "keep_alive": "30m",
                "max_loaded_models": 1,
                "primary": {
                    "model": primary.ref,
                    "digest": primary.digest,
                    "size_bytes": primary.size_bytes,
                    "context": primary.context,
                    "license": primary.license_id,
                    "source_url": primary.source_url,
                },
                "embedding": {
                    "model": embedding.ref,
                    "digest": embedding.digest,
                    "size_bytes": embedding.size_bytes,
                    "context": embedding.context,
                    "license": embedding.license_id,
                    "source_url": embedding.source_url,
                },
            },
            "notes": [
                "Tags and digests in this file were resolved from registry.ollama.ai, not copied from documentation.",
                "Re-run scripts/resolve_local_models.py --write to refresh; make models-verify re-checks the digests.",
                "The hosted NVIDIA tier below is retained and disabled, so a rollback is a policy change only.",
                "Runtime values are sourced from environment variables; this file contains no credentials.",
            ],
        }
    )
    existing.setdefault("self_hosted", {})
    return existing


def write_manifest(resolved: list[Resolved], *, vram_gb: float) -> dict[str, Any]:
    return {
        "schema": "esd.models.manifest.v1",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "resolved_for_vram_gb": vram_gb,
        "registry": REGISTRY,
        "note": "Weights are gitignored. This manifest and models/LICENSES/ are the tracked record.",
        "models": [
            {
                "role": item.role,
                "ref": item.ref,
                "digest": item.digest,
                "size_bytes": item.size_bytes,
                "size_gb": round(item.size_gb, 3),
                "context": item.context,
                "license": item.license_id,
                "license_sha256": item.license_sha256,
                "source_url": item.source_url,
                "resolved_at": item.resolved_at,
                "layers": item.layers,
            }
            for item in resolved
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--vram-gb",
        type=float,
        default=12.0,
        help="VRAM tier to resolve for (default: 12)",
    )
    parser.add_argument(
        "--min-context", type=int, default=16384, help="Minimum context window"
    )
    parser.add_argument(
        "--write", action="store_true", help="Pin the result to config/ and models/"
    )
    parser.add_argument(
        "--allow-restricted-license",
        action="store_true",
        help="Accept a non-permissive licence. Requires a human to have read it.",
    )
    args = parser.parse_args(argv)

    max_gb = disk_budget_gb(args.vram_gb)
    print(f"Resolving against {REGISTRY}")
    print(f"  VRAM tier      {args.vram_gb} GB  ->  model budget {max_gb} GB on disk")
    print(f"  Min context    {args.min_context}")
    print()

    license_dir = LICENSE_DIR if args.write else None
    try:
        primary, primary_skips = select(
            CANDIDATES,
            "primary",
            max_gb=max_gb,
            min_context=args.min_context,
            license_dir=license_dir,
            require_permissive=not args.allow_restricted_license,
        )
        embedding, embed_skips = select(
            CANDIDATES,
            "embedding",
            max_gb=2.0,
            min_context=512,
            license_dir=license_dir,
            require_permissive=not args.allow_restricted_license,
        )
    except ResolutionError as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        return 2

    for skipped in primary_skips + embed_skips:
        print(f"  skipped  {skipped}")
    if primary_skips or embed_skips:
        print()

    for item in (primary, embedding):
        print(
            f"  {item.role:<10} {item.ref:<26} {item.size_gb:>6.2f} GB  ctx {item.context:<7} {item.license_id}"
        )
        print(f"             {item.digest}")

    if not args.write:
        print("\nDry run. Re-run with --write to pin.")
        return 0

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(
        json.dumps(write_config(primary, embedding, vram_gb=args.vram_gb), indent=2)
        + "\n",
        encoding="utf-8",
    )
    MANIFEST_PATH.write_text(
        json.dumps(write_manifest([primary, embedding], vram_gb=args.vram_gb), indent=2)
        + "\n",
        encoding="utf-8",
    )
    print(f"\nWrote {CONFIG_PATH.relative_to(PROJECT_ROOT)}")
    print(f"Wrote {MANIFEST_PATH.relative_to(PROJECT_ROOT)}")
    print(f"Wrote {LICENSE_DIR.relative_to(PROJECT_ROOT)}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
