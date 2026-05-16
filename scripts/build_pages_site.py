#!/usr/bin/env python3
"""
build_pages_site.py
====================

Produce the Cloudflare Pages deploy artifact for esd-lab-namo.pages.dev.

Inputs
------
- web/dashboard-source.html   :: standalone Dashboard ESD v2 bundle (source)
- web/pages-overlay.css       :: layout audit overlay stylesheet
- web/pages-overlay.js        :: runtime overlay patches (scroll, sheen, IO)

Output
------
- dist/pages-wrapper/index.html  :: artifact uploaded by `wrangler pages deploy`

What it does
------------
1. Reads the standalone HTML source.
2. Injects the overlay <style> block into <head> (before </head>).
3. Appends the overlay <script> right before </body> so it runs after the
   bundler has finished unpacking.
4. Embeds a build-timestamp <meta> tag the overlay JS surfaces as a deploy
   pill so anyone visiting can tell when the deploy happened.
5. Writes the artifact deterministically with a final newline so git diffs
   stay clean.

Run locally
-----------
    python scripts/build_pages_site.py

Notes
-----
Pure stdlib. No third-party imports — the GitHub Actions runner picks it up
with whatever Python ships on `ubuntu-latest`.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import pathlib
import sys


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = REPO_ROOT / "web" / "dashboard-source.html"
DEFAULT_CSS = REPO_ROOT / "web" / "pages-overlay.css"
DEFAULT_JS = REPO_ROOT / "web" / "pages-overlay.js"
DEFAULT_OUT = REPO_ROOT / "dist" / "pages-wrapper" / "index.html"
DEFAULT_READINGS = REPO_ROOT / "web" / "lab-readings.json"


def _read(path: pathlib.Path) -> str:
    if not path.exists():
        sys.exit(f"[build_pages_site] missing required file: {path}")
    return path.read_text(encoding="utf-8")


def _short_sha(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]


def build(
    source_path: pathlib.Path = DEFAULT_SOURCE,
    css_path: pathlib.Path = DEFAULT_CSS,
    js_path: pathlib.Path = DEFAULT_JS,
    out_path: pathlib.Path = DEFAULT_OUT,
    readings_path: pathlib.Path = DEFAULT_READINGS,
    stamp: str | None = None,
) -> pathlib.Path:
    html = _read(source_path)
    css = _read(css_path)
    js = _read(js_path)

    # Lab readings JSON gets inlined as a global so the overlay's
    # Knowledge Hub + AI chatbot retrieval layer have data on first
    # paint, no fetch round-trip.
    readings_json = ""
    if readings_path.exists():
        readings_json = readings_path.read_text(encoding="utf-8").strip()
    else:
        readings_json = '{"summary":{"count":0},"readings":[]}'

    stamp = stamp or dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    build_sha = _short_sha(css + js + html[:4096] + readings_json[:1024])

    # Escape </script> inside the JSON to avoid prematurely closing
    # the inline script tag.
    readings_inline = readings_json.replace("</", "<\\/")

    head_inject = (
        f'\n<meta name="esd-deploy-stamp" content="{stamp}">\n'
        f'<meta name="esd-build-sha" content="{build_sha}">\n'
        f'<style id="esd-pages-overlay">\n{css}\n</style>\n'
    )

    body_inject = (
        f'\n<script id="esd-readings-data">\n'
        f'window.__ESD_READINGS__ = {readings_inline};\n'
        f'</script>\n'
        f'<script id="esd-pages-overlay-js">\n{js}\n</script>\n'
    )

    if "</head>" not in html:
        sys.exit("[build_pages_site] source HTML missing </head>")
    if "</body>" not in html:
        sys.exit("[build_pages_site] source HTML missing </body>")

    html = html.replace("</head>", head_inject + "</head>", 1)
    html = html.replace("</body>", body_inject + "</body>", 1)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    if not html.endswith("\n"):
        out_path.write_text(html + "\n", encoding="utf-8")

    size_kb = out_path.stat().st_size / 1024
    print(
        f"[build_pages_site] wrote {out_path.relative_to(REPO_ROOT)} "
        f"({size_kb:,.1f} KB, sha={build_sha}, stamp={stamp})"
    )
    return out_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=pathlib.Path, default=DEFAULT_SOURCE)
    parser.add_argument("--css", type=pathlib.Path, default=DEFAULT_CSS)
    parser.add_argument("--js", type=pathlib.Path, default=DEFAULT_JS)
    parser.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT)
    parser.add_argument("--readings", type=pathlib.Path, default=DEFAULT_READINGS)
    parser.add_argument("--stamp", type=str, default=None)
    args = parser.parse_args()

    build(
        source_path=args.source,
        css_path=args.css,
        js_path=args.js,
        out_path=args.out,
        readings_path=args.readings,
        stamp=args.stamp,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
