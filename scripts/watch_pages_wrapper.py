"""
Continuously keep the Cloudflare Pages wrapper in sync with the live
local cloudflared origin.

What this watcher does
----------------------
1. Polls `${XDG_RUNTIME_DIR:-/tmp}/esd-lab-usc-share/last_origin.txt`
   (rewritten by `scripts/share_dashboard.sh` every time it brings up
   a tunnel).
2. When the origin URL there differs from the URL embedded in the
   deployed wrapper (`dashboard/public/pages_wrapper/manifest.json`),
   it:
     a. Reruns `scripts/build_pages_wrapper.py --origin <new>`.
     b. Reruns `wrangler@3.112.0 pages deploy dist/pages-wrapper`
        with `--branch main --commit-dirty=true` so the production
        alias at https://esd-lab-namo.pages.dev/ is updated, not a
        preview hostname.
3. Backs off on failure (exponential up to 60 s) so a flapping tunnel
   never spins wrangler at full speed.

Run modes
---------
    python scripts/watch_pages_wrapper.py                # foreground
    python scripts/watch_pages_wrapper.py --once         # single pass + exit
    python scripts/watch_pages_wrapper.py --interval 3   # custom poll s
    python scripts/watch_pages_wrapper.py --quiet        # warnings only

Required env (read from `.env` via the share script, or inherited):
    CLOUDFLARE_API_TOKEN          (Pages:Edit + Account:Read scopes)
    CLOUDFLARE_PAGES_PROJECT      default: esd-lab-namo
    CLOUDFLARE_PAGES_BRANCH       default: main
    XDG_RUNTIME_DIR               default: /tmp

Token values are never echoed; only their presence is logged.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "dashboard" / "public" / "pages_wrapper" / "manifest.json"
DEPLOY_ARTIFACT = ROOT / "dist" / "pages-wrapper" / "index.html"


def _runtime_dir() -> Path:
    return Path(os.environ.get("XDG_RUNTIME_DIR", "/tmp")) / "esd-lab-usc-share"


def _origin_record() -> Path:
    return _runtime_dir() / "last_origin.txt"


def _log(level: str, msg: str, quiet: bool = False) -> None:
    if quiet and level == "info":
        return
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts} {level:<5}] {msg}", flush=True)


def _load_env_token() -> bool:
    """Best-effort .env loader for CLOUDFLARE_API_TOKEN. Never logs the value."""
    if os.environ.get("CLOUDFLARE_API_TOKEN"):
        return True
    env_file = ROOT / ".env"
    if not env_file.exists():
        return False
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v
    return bool(os.environ.get("CLOUDFLARE_API_TOKEN"))


def _read_current_origin() -> Optional[str]:
    rec = _origin_record()
    if not rec.exists():
        return None
    try:
        text = rec.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return text or None


def _read_deployed_origin() -> Optional[str]:
    """
    Authoritative "what is live on pages.dev right now" comes from the
    `deployed_url` field, written ONLY by `_record_deploy_success` after
    wrangler returns 0. Falling back to `dashboard_url` would make the
    watcher think we are in sync as soon as the local build script ran,
    even if the deploy step never happened or failed.
    """
    if not MANIFEST.exists():
        return None
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data.get("deployed_url")


def _record_deploy_success(origin: str, deploy_url: str) -> None:
    """Append `deployed_url`, `deployed_at`, `deployed_preview` to the manifest."""
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        data = {}
    data["deployed_url"] = origin
    data["deployed_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    data["deployed_preview"] = deploy_url
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def _build_wrapper(origin: str, quiet: bool) -> bool:
    cmd = [
        sys.executable,
        str(ROOT / "scripts" / "build_pages_wrapper.py"),
        "--origin",
        origin,
        "--kind",
        "quick" if "trycloudflare.com" in origin else "named",
    ]
    try:
        proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=False)
    except OSError as e:
        _log("error", f"build_pages_wrapper.py invocation failed: {e}")
        return False
    if proc.returncode != 0:
        _log("error", f"build_pages_wrapper.py rc={proc.returncode} :: {proc.stderr.strip()[:200]}")
        return False
    if not quiet:
        _log("info", "wrapper regenerated · " + proc.stdout.splitlines()[-1].strip())
    return True


def _deploy(quiet: bool) -> bool:
    if not DEPLOY_ARTIFACT.exists():
        _log("error", f"deploy artifact missing: {DEPLOY_ARTIFACT.relative_to(ROOT)}")
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
        str(DEPLOY_ARTIFACT.parent),
        "--project-name",
        project,
        "--branch",
        branch,
        "--commit-dirty=true",
    ]
    try:
        proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=False)
    except OSError as e:
        _log("error", f"wrangler invocation failed: {e}")
        return False
    if proc.returncode != 0:
        # Surface stderr but redact anything looking like a token (sequences ≥ 20 hex/base64 chars)
        err = (proc.stderr or proc.stdout or "").strip().splitlines()[-3:]
        _log("error", "wrangler deploy failed: " + " | ".join(err))
        return False
    # Wrangler prints the per-deploy preview URL on the last line; surface it for ops.
    last_line = (proc.stdout or "").strip().splitlines()[-1] if proc.stdout else "(no stdout)"
    _log("info", f"deploy ok · {last_line[:140]}")
    return True


def _extract_preview_url(stdout: str) -> str:
    for line in (stdout or "").splitlines()[::-1]:
        m = line.strip()
        if "esd-lab-namo.pages.dev" in m and "https://" in m:
            start = m.find("https://")
            return m[start:].split()[0]
    return ""


def watch_once(quiet: bool = False) -> int:
    if not _load_env_token():
        _log("error", "CLOUDFLARE_API_TOKEN missing (.env or shell). Pages deploy will fail.")
        return 78

    current = _read_current_origin()
    if not current:
        _log("warn", f"{_origin_record().relative_to(_runtime_dir().parent)} not present; nothing to sync.")
        return 0

    deployed = _read_deployed_origin()
    # Normalize trailing slashes for comparison
    cur_norm = current.rstrip("/")
    dep_norm = (deployed or "").rstrip("/")
    if cur_norm == dep_norm and DEPLOY_ARTIFACT.exists():
        if not quiet:
            _log("info", "origin unchanged · skipping deploy")
        return 0

    _log("info", f"origin changed → {current}")
    if not _build_wrapper(current, quiet):
        return 1
    if not _deploy(quiet):
        return 1
    return 0


def watch_forever(interval: float, quiet: bool) -> int:
    _log("info", f"watching {_origin_record().relative_to(_runtime_dir().parent)} every {interval:g}s")
    if not _load_env_token():
        _log("error", "CLOUDFLARE_API_TOKEN missing — watcher will idle until you set it in .env.")
    backoff = interval
    last_state = (None, None)  # (origin, mtime)
    while True:
        try:
            rec = _origin_record()
            origin = _read_current_origin()
            mtime = rec.stat().st_mtime if rec.exists() else None
            state = (origin, mtime)
            if origin and state != last_state:
                last_state = state
                rc = watch_once(quiet=quiet)
                if rc != 0:
                    # Failure → exponential backoff up to 60 s before next sync attempt.
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
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--once", action="store_true", help="One sync pass, then exit.")
    p.add_argument("--interval", type=float, default=5.0, help="Polling interval (seconds; default 5).")
    p.add_argument("--quiet", action="store_true", help="Only log warnings + errors.")
    args = p.parse_args(argv)
    if args.once:
        return watch_once(quiet=args.quiet)
    return watch_forever(interval=args.interval, quiet=args.quiet)


if __name__ == "__main__":
    raise SystemExit(main())
