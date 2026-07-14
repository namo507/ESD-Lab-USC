"""
Continuously build and optionally deploy the canonical Cloudflare Pages site.

What this watcher does
----------------------
1. Polls the canonical Pages packaging inputs:
   - `web/build/**`
   - `web/lab-readings.json`
   - `dashboard/data/dashboard_data.json`
   - `dashboard/data/nano_dashboard_data.json`
   - `dashboard/data/readings_data.json`
   - `dashboard/data/runtime_status.json`
   - `dashboard/public/pages_wrapper/manifest.json`
2. When any of those files change, reruns `scripts/build_pages_site.py`.
3. By default, redeploys `dist/pages-wrapper` to the main Pages branch so
   `https://esd-lab-namo.pages.dev/` tracks the current local shell edits.

Run modes
---------
    python scripts/watch_pages_site.py                # foreground, build + deploy on change
    python scripts/watch_pages_site.py --once         # single build + deploy pass
    python scripts/watch_pages_site.py --no-deploy    # build only; never call wrangler
    python scripts/watch_pages_site.py --interval 3   # custom poll seconds

Required env for deploy mode:
    CLOUDFLARE_API_TOKEN      (Pages:Edit + Account:Read scopes)
    CLOUDFLARE_PAGES_PROJECT  default: esd-lab-namo
    CLOUDFLARE_PAGES_BRANCH   default: main
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD_ARTIFACT = ROOT / "dist" / "pages-wrapper" / "index.html"
WATCH_PATHS = [
    ROOT / "web" / "build",
    ROOT / "web" / "lab-readings.json",
    ROOT / "dashboard" / "data" / "dashboard_data.json",
    ROOT / "dashboard" / "data" / "nano_dashboard_data.json",
    ROOT / "dashboard" / "data" / "readings_data.json",
    ROOT / "dashboard" / "data" / "runtime_status.json",
    ROOT / "docs",
    ROOT / "dashboard" / "context_skill" / "references",
    ROOT / "dashboard" / "public" / "pages_wrapper" / "manifest.json",
    ROOT / "scripts" / "build_pages_site.py",
]


def _log(level: str, msg: str, quiet: bool = False) -> None:
    if quiet and level == "info":
        return
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts} {level:<5}] {msg}", flush=True)


def _load_env_token() -> bool:
    if os.environ.get("CLOUDFLARE_API_TOKEN"):
        return True
    env_file = ROOT / ".env"
    if not env_file.exists():
        return False
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value
    return bool(os.environ.get("CLOUDFLARE_API_TOKEN"))


def _signature() -> tuple[tuple[str, int | None, int | None], ...]:
    sig: list[tuple[str, int | None, int | None]] = []
    for path in WATCH_PATHS:
        if not path.exists():
            sig.append((str(path.relative_to(ROOT)), None, None))
            continue
        if path.is_file():
            stat = path.stat()
            sig.append((str(path.relative_to(ROOT)), stat.st_mtime_ns, stat.st_size))
            continue
        for child in sorted(path.rglob("*")):
            if not child.is_file():
                continue
            stat = child.stat()
            sig.append((str(child.relative_to(ROOT)), stat.st_mtime_ns, stat.st_size))
    return tuple(sig)


def _build_site(quiet: bool) -> bool:
    cmd = [sys.executable, str(ROOT / "scripts" / "build_pages_site.py")]
    try:
        proc = subprocess.run(
            cmd, cwd=ROOT, capture_output=True, text=True, check=False
        )
    except OSError as exc:
        _log("error", f"build_pages_site.py invocation failed: {exc}")
        return False
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip().splitlines()[-3:]
        _log("error", "build_pages_site failed: " + " | ".join(err))
        return False
    if not quiet:
        last = (proc.stdout or "").strip().splitlines()
        _log("info", last[-1] if last else "build_pages_site.py completed")
    return True


def _extract_url(stdout: str) -> str:
    for line in (stdout or "").splitlines()[::-1]:
        line = line.strip()
        if "https://" in line and ".pages.dev" in line:
            return line[line.find("https://") :].split()[0]
    return ""


def _deploy_site(quiet: bool) -> bool:
    if not BUILD_ARTIFACT.exists():
        _log("error", f"deploy artifact missing: {BUILD_ARTIFACT.relative_to(ROOT)}")
        return False
    npx = shutil.which("npx")
    if not npx:
        _log("error", "npx not found in PATH; wrangler cannot run")
        return False
    project = os.environ.get("CLOUDFLARE_PAGES_PROJECT", "esd-lab-namo")
    branch = os.environ.get("CLOUDFLARE_PAGES_BRANCH", "main")
    cmd = [
        npx,
        "--yes",
        "wrangler@3.112.0",
        "pages",
        "deploy",
        str(BUILD_ARTIFACT.parent),
        "--project-name",
        project,
        "--branch",
        branch,
        "--commit-dirty=true",
    ]
    try:
        proc = subprocess.run(
            cmd, cwd=ROOT, capture_output=True, text=True, check=False
        )
    except OSError as exc:
        _log("error", f"wrangler invocation failed: {exc}")
        return False
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip().splitlines()[-3:]
        _log("error", "wrangler deploy failed: " + " | ".join(err))
        return False
    preview = _extract_url(proc.stdout or "")
    _log("info", f"deploy ok · {(preview or f'https://{project}.pages.dev/')[:140]}")
    return True


def sync_once(*, deploy: bool, quiet: bool) -> int:
    if deploy and not _load_env_token():
        _log(
            "error",
            "CLOUDFLARE_API_TOKEN missing (.env or shell). Pages deploy will fail.",
        )
        return 78
    if not _build_site(quiet):
        return 1
    if deploy and not _deploy_site(quiet):
        return 1
    return 0


def watch_forever(interval: float, *, deploy: bool, quiet: bool) -> int:
    _log("info", f"watching canonical Pages inputs every {interval:g}s")
    if deploy and not _load_env_token():
        _log(
            "error",
            "CLOUDFLARE_API_TOKEN missing — watcher will idle until you set it in .env.",
        )
    last_sig: tuple[tuple[str, int | None, int | None], ...] | None = None
    backoff = interval
    while True:
        try:
            sig = _signature()
            if sig != last_sig:
                last_sig = sig
                rc = sync_once(deploy=deploy, quiet=quiet)
                if rc != 0:
                    backoff = min(60.0, max(interval * 2, backoff * 2))
                    _log("warn", f"sync failed (rc={rc}); backoff {backoff:.0f}s")
                    time.sleep(backoff)
                    continue
                backoff = interval
            time.sleep(interval)
        except KeyboardInterrupt:
            _log("info", "stopping watcher")
            return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--once", action="store_true", help="One sync pass, then exit.")
    parser.add_argument(
        "--interval",
        type=float,
        default=5.0,
        help="Polling interval in seconds (default 5).",
    )
    parser.add_argument(
        "--quiet", action="store_true", help="Only log warnings + errors."
    )
    parser.add_argument(
        "--no-deploy", action="store_true", help="Build only; skip wrangler deploy."
    )
    args = parser.parse_args(argv)
    if args.once:
        return sync_once(deploy=not args.no_deploy, quiet=args.quiet)
    return watch_forever(
        interval=args.interval, deploy=not args.no_deploy, quiet=args.quiet
    )


if __name__ == "__main__":
    raise SystemExit(main())
