#!/usr/bin/env python3
"""
Package the React dashboard for Cloudflare Pages.

Inputs
------
- web/build/                            :: Vite production build output
- dashboard/public/pages_wrapper/manifest.json
                                        :: latest live tunnel origin used to
                                           derive the /api proxy target

Outputs
-------
- dist/pages-wrapper/                   :: Cloudflare Pages deploy artifact
   - index.html with deploy metadata
   - assets/* copied from the Vite build
    - _worker.js for /api proxy + SPA asset fallback
    - _redirects for static SPA fallback

Run locally
-----------
    cd web && VITE_USE_MOCKS=true VITE_LIVE_ASSISTANT=true npm run build
    python scripts/build_pages_site.py
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import shutil
import sys
from urllib.parse import urlparse


REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_BUILD_DIR = REPO_ROOT / "web" / "build"
DEFAULT_OUT_DIR = REPO_ROOT / "dist" / "pages-wrapper"
DEFAULT_MANIFEST = REPO_ROOT / "dashboard" / "public" / "pages_wrapper" / "manifest.json"


def _read(path: pathlib.Path) -> str:
    if not path.exists():
        sys.exit(f"[build_pages_site] missing required file: {path}")
    return path.read_text(encoding="utf-8")


def _fingerprint_tree(root: pathlib.Path) -> str:
    hasher = hashlib.sha1()
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        hasher.update(str(path.relative_to(root)).encode("utf-8"))
        hasher.update(path.read_bytes())
    return hasher.hexdigest()[:8]


def _normalize_origin(value: str) -> str:
    parsed = urlparse(value.strip())
    if not parsed.scheme or not parsed.netloc:
        sys.exit(f"[build_pages_site] invalid API origin: {value!r}")
    return f"{parsed.scheme}://{parsed.netloc}"


def _worker_source(api_origin: str) -> str:
    return (
        "const API_ORIGIN = "
        + json.dumps(api_origin)
        + ";\n\n"
        + "export default {\n"
        + "  async fetch(request, env) {\n"
        + "    const url = new URL(request.url);\n"
        + "    if (url.pathname.startsWith(\"/api/\")) {\n"
        + "      const target = new URL(url.pathname + url.search, API_ORIGIN);\n"
        + "      return fetch(new Request(target.toString(), request));\n"
        + "    }\n\n"
        + "    const assetResponse = await env.ASSETS.fetch(request);\n"
        + "    if (assetResponse.status !== 404) {\n"
        + "      return assetResponse;\n"
        + "    }\n\n"
        + "    const lastSegment = url.pathname.split(\"/\").pop() || \"\";\n"
        + "    if ((request.method === \"GET\" || request.method === \"HEAD\") && !lastSegment.includes(\".\")) {\n"
        + "      const fallbackUrl = new URL(\"/index.html\", url);\n"
        + "      return env.ASSETS.fetch(new Request(fallbackUrl.toString(), request));\n"
        + "    }\n\n"
        + "    return assetResponse;\n"
        + "  },\n"
        + "};\n"
    )


def _resolve_api_origin(api_origin: str | None, manifest_path: pathlib.Path) -> str:
    explicit = api_origin or os.getenv("PAGES_API_ORIGIN") or os.getenv("DASHBOARD_API_ORIGIN")
    if explicit:
        return _normalize_origin(explicit)

    if manifest_path.exists():
        try:
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            sys.exit(f"[build_pages_site] invalid manifest JSON at {manifest_path}: {exc}")

        dashboard_url = payload.get("dashboard_url") or payload.get("api_origin")
        if dashboard_url:
            return _normalize_origin(str(dashboard_url))

    sys.exit(
        "[build_pages_site] missing API origin. Set PAGES_API_ORIGIN or refresh "
        "dashboard/public/pages_wrapper/manifest.json via scripts/share_dashboard.sh."
    )


def build(
    build_dir: pathlib.Path = DEFAULT_BUILD_DIR,
    out_dir: pathlib.Path = DEFAULT_OUT_DIR,
    manifest_path: pathlib.Path = DEFAULT_MANIFEST,
    api_origin: str | None = None,
    stamp: str | None = None,
) -> pathlib.Path:
    index_path = build_dir / "index.html"
    if not index_path.exists():
        sys.exit(
            f"[build_pages_site] missing built SPA at {index_path}. "
            "Run `cd web && VITE_USE_MOCKS=true VITE_LIVE_ASSISTANT=true npm run build` first."
        )

    if out_dir.exists():
        shutil.rmtree(out_dir)
    shutil.copytree(build_dir, out_dir)

    out_index = out_dir / "index.html"
    html = _read(out_index)
    resolved_api_origin = _resolve_api_origin(api_origin, manifest_path)

    stamp = stamp or dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    build_sha = _fingerprint_tree(build_dir)

    if "</head>" not in html:
        sys.exit("[build_pages_site] built index.html missing </head>")

    head_inject = (
        f'\n<meta name="esd-deploy-stamp" content="{stamp}">\n'
        f'<meta name="esd-build-sha" content="{build_sha}">\n'
        f'<meta name="esd-api-origin" content="{resolved_api_origin}">\n'
    )
    html = html.replace("</head>", head_inject + "</head>", 1)
    out_index.write_text(html if html.endswith("\n") else html + "\n", encoding="utf-8")

    worker_path = out_dir / "_worker.js"
    worker_path.write_text(_worker_source(resolved_api_origin), encoding="utf-8")

    redirects_path = out_dir / "_redirects"
    redirects_path.write_text(
        "/* /index.html 200\n",
        encoding="utf-8",
    )

    size_kb = out_index.stat().st_size / 1024
    print(
        f"[build_pages_site] wrote {out_index.relative_to(REPO_ROOT)} "
        f"({size_kb:,.1f} KB, sha={build_sha}, stamp={stamp}, api={resolved_api_origin})"
    )
    print(
        f"[build_pages_site] wrote {redirects_path.relative_to(REPO_ROOT)} "
        "(static SPA fallback)"
    )
    print(
        f"[build_pages_site] wrote {worker_path.relative_to(REPO_ROOT)} "
        f"(advanced-mode /api proxy -> {resolved_api_origin})"
    )
    return out_index


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build-dir", type=pathlib.Path, default=DEFAULT_BUILD_DIR)
    parser.add_argument("--out-dir", type=pathlib.Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--manifest", type=pathlib.Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--api-origin", type=str, default=None)
    parser.add_argument("--stamp", type=str, default=None)
    args = parser.parse_args()

    build(
        build_dir=args.build_dir,
        out_dir=args.out_dir,
        manifest_path=args.manifest,
        api_origin=args.api_origin,
        stamp=args.stamp,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
