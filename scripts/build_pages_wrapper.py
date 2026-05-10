"""
Render the Cloudflare Pages wrapper from a tracked template.

Why this exists
---------------
The Pages-hosted public link `https://esd-lab-namo.pages.dev/` is the
operator's *canonical* shareable URL. It iframes the live dashboard origin —
either a stable named-tunnel hostname (e.g. https://dashboard.esdlabsc.com)
or, when no named tunnel is configured, the rotating quick-tunnel URL
(`https://<random>.trycloudflare.com/dashboard/`).

Before this script, the wrapper HTML at `temp/pages-wrapper/index.html` had a
specific quick-tunnel hostname *baked in*. Every restart of the share script
produced a new tunnel URL, but the wrapper kept embedding the dead one. The
operator had to remember to hand-edit + redeploy the wrapper. That broke
public sharing constantly.

This script replaces that pattern with a deterministic build:

1. Read the tracked template at `dashboard/public/pages_wrapper/template.html`.
2. Substitute the template tokens for `{{DASHBOARD_URL}}` and `{{GENERATED_AT}}`.
    Optional origin metadata tokens may also be present for non-visual uses.
3. Write to two outputs:
     - `dashboard/public/pages_wrapper/index.html` (committable preview)
     - `dist/pages-wrapper/index.html` (deploy artifact for `wrangler pages deploy`)
4. Write a JSON manifest with origin URL + timestamp + tunnel kind so the
   share script can detect drift.

The script is idempotent and never embeds secrets — only the public origin
URL the operator already prints to their team.

Usage
-----
    python scripts/build_pages_wrapper.py --origin https://abc-123.trycloudflare.com
    python scripts/build_pages_wrapper.py --origin https://dashboard.esdlabsc.com --kind named
    python scripts/build_pages_wrapper.py --check    # validate template only
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "dashboard" / "public" / "pages_wrapper" / "template.html"
PREVIEW = ROOT / "dashboard" / "public" / "pages_wrapper" / "index.html"
DEPLOY_DIR = ROOT / "dist" / "pages-wrapper"
DEPLOY = DEPLOY_DIR / "index.html"
MANIFEST = ROOT / "dashboard" / "public" / "pages_wrapper" / "manifest.json"

REQUIRED_TOKENS = {
    "{{DASHBOARD_URL}}",
    "{{GENERATED_AT}}",
}


def _ensure_dashboard_path(origin: str) -> str:
    """Append `/dashboard/` if the origin has no path. Strip query/fragment."""
    parsed = urlparse(origin.strip())
    if not parsed.scheme or not parsed.netloc:
        raise SystemExit(f"Invalid origin URL: {origin!r}")
    path = parsed.path or "/"
    if path == "/":
        path = "/dashboard/"
    elif not path.endswith("/"):
        path += "/"
    return f"{parsed.scheme}://{parsed.netloc}{path}"


def _classify(origin: str, kind: str | None) -> tuple[str, str, str]:
    """Return (pill_label, pill_class, display)."""
    host = urlparse(origin).netloc
    if kind == "named" or (kind is None and "trycloudflare.com" not in host):
        return ("STABLE NAMED TUNNEL", "", host)
    return ("EPHEMERAL QUICK TUNNEL", "warn", host)


def _validate_template(text: str) -> None:
    missing = [t for t in REQUIRED_TOKENS if t not in text]
    if missing:
        raise SystemExit(f"Template is missing tokens: {', '.join(missing)}")


def render(origin: str, kind: str | None) -> tuple[str, dict[str, str]]:
    if not TEMPLATE.exists():
        raise SystemExit(f"Template not found: {TEMPLATE}")
    text = TEMPLATE.read_text(encoding="utf-8")
    _validate_template(text)
    dashboard_url = _ensure_dashboard_path(origin)
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    pill_label, pill_class, display = _classify(dashboard_url, kind)
    rendered = (
        text
        .replace("{{DASHBOARD_URL}}", dashboard_url)
        .replace("{{GENERATED_AT}}", generated_at)
        .replace("{{ORIGIN_DISPLAY}}", display)
        .replace("{{ORIGIN_PILL_LABEL}}", pill_label)
        .replace("{{ORIGIN_PILL_CLASS}}", pill_class)
    )
    manifest = {
        "dashboard_url": dashboard_url,
        "origin_host": display,
        "tunnel_kind": kind or ("named" if "trycloudflare.com" not in display else "quick"),
        "generated_at": generated_at,
        "wrapper_canonical": "https://esd-lab-namo.pages.dev/",
    }
    return rendered, manifest


def write(rendered: str, manifest: dict[str, str]) -> None:
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    DEPLOY_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW.write_text(rendered, encoding="utf-8")
    DEPLOY.write_text(rendered, encoding="utf-8")
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--origin", help="Public origin URL of the live dashboard (https://...)")
    p.add_argument(
        "--kind",
        choices=("named", "quick"),
        default=None,
        help="Override the tunnel kind classification.",
    )
    p.add_argument("--check", action="store_true", help="Validate template only; do not write outputs.")
    args = p.parse_args(argv)

    if args.check:
        if not TEMPLATE.exists():
            print(f"[invalid] template missing: {TEMPLATE}", file=sys.stderr)
            return 2
        _validate_template(TEMPLATE.read_text(encoding="utf-8"))
        print("OK · template valid")
        return 0

    if not args.origin:
        print("--origin is required (or pass --check)", file=sys.stderr)
        return 2

    rendered, manifest = render(args.origin, args.kind)
    write(rendered, manifest)
    print("wrote")
    print(f"  preview: {PREVIEW.relative_to(ROOT)}")
    print(f"  deploy:  {DEPLOY.relative_to(ROOT)}")
    print(f"  manifest: {MANIFEST.relative_to(ROOT)}")
    print()
    print(f"canonical Pages wrapper → https://esd-lab-namo.pages.dev/")
    print(f"target origin            → {manifest['dashboard_url']}")
    print(f"tunnel kind              → {manifest['tunnel_kind']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
