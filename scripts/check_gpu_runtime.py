#!/usr/bin/env python3
"""Detect the GPU, pick the model tier that actually fits, and say so plainly.

Section 13 of the overhaul brief is specific: when the GPU is absent or busy,
fall back to CPU with a *reduced* model and tell the user speed is degraded --
never silently serve slower answers as though nothing changed. This script is
what makes that promise checkable rather than aspirational.

It answers three questions:

  1. Is there a GPU, and how much VRAM does it have?
  2. Which pinned model fits that VRAM, from models/MANIFEST.json?
  3. What should the runtime be configured with as a result?

    python scripts/check_gpu_runtime.py            # human-readable report
    python scripts/check_gpu_runtime.py --json     # machine-readable
    python scripts/check_gpu_runtime.py --env      # shell-sourceable config
    python scripts/check_gpu_runtime.py --require-gpu   # exit 1 with no GPU

Exit code is 0 whenever a usable configuration exists, GPU or not. A CPU-only
host is a supported configuration, not a failure -- it is just a slower one, and
the report says which.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = PROJECT_ROOT / "models" / "MANIFEST.json"

#: A Q4_K_M model needs its weights plus a KV cache plus the prefill batch.
#: Three quarters of VRAM is the working headroom rule; past it the model spills
#: to CPU and throughput collapses even though it technically loaded.
VRAM_USABLE_FRACTION = 0.75

#: Below this, treat the card as unusable for the generalist and stay on CPU.
MIN_USEFUL_VRAM_GB = 6.0


@dataclass
class GpuInfo:
    present: bool
    name: str = ""
    vram_gb: float = 0.0
    driver: str = ""
    #: How we found out, so a surprising result can be traced.
    detected_by: str = "none"
    notes: list[str] = field(default_factory=list)


def detect_gpu() -> GpuInfo:
    """Find an NVIDIA GPU through whichever channel is available.

    Checked in order of authority: nvidia-smi reports real VRAM, the device
    nodes prove passthrough without the CLI, and the CUDA libraries only tell us
    the toolkit is installed. A container can have any subset of these.
    """
    info = GpuInfo(present=False)

    if shutil.which("nvidia-smi"):
        try:
            proc = subprocess.run(  # noqa: S603
                ["nvidia-smi", "--query-gpu=name,memory.total,driver_version",
                 "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=20, check=False,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                first = proc.stdout.strip().splitlines()[0]
                parts = [p.strip() for p in first.split(",")]
                if len(parts) >= 3:
                    return GpuInfo(
                        present=True,
                        name=parts[0],
                        vram_gb=round(float(parts[1]) / 1024, 2),
                        driver=parts[2],
                        detected_by="nvidia-smi",
                    )
            info.notes.append(f"nvidia-smi present but returned no device (rc={proc.returncode})")
        except (subprocess.TimeoutExpired, OSError, ValueError) as exc:
            info.notes.append(f"nvidia-smi failed: {exc}")
    else:
        info.notes.append("nvidia-smi not on PATH")

    # Device nodes without the CLI: passthrough exists but the toolkit does not.
    nodes = sorted(Path("/dev").glob("nvidia*"))
    if nodes:
        info.present = True
        info.detected_by = "device-nodes"
        info.notes.append(
            f"{len(nodes)} /dev/nvidia* node(s) present but nvidia-smi is missing; "
            "VRAM unknown, so the CPU tier is assumed until it can be measured"
        )
        return info

    if not Path("/dev/dri").exists():
        info.notes.append("no /dev/dri, so no integrated GPU either")
    if not any(Path("/usr/lib/x86_64-linux-gnu").glob("libcuda.so*")):
        info.notes.append("no libcuda on the host")

    return info


def load_manifest() -> dict[str, Any] | None:
    if not MANIFEST_PATH.exists():
        return None
    try:
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def installed_models(base_url: str = "http://127.0.0.1:11434") -> list[dict[str, Any]]:
    """Ask the running Ollama what it actually has, if it is up."""
    import urllib.error
    import urllib.request

    try:
        with urllib.request.urlopen(f"{base_url}/api/tags", timeout=6) as response:  # noqa: S310
            return json.loads(response.read()).get("models", [])
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return []


def choose_tier(gpu: GpuInfo, manifest: dict[str, Any] | None, present: list[dict[str, Any]]) -> dict[str, Any]:
    """Pick the runtime configuration this host can actually serve."""
    budget_gb = round(gpu.vram_gb * VRAM_USABLE_FRACTION, 2) if gpu.vram_gb else 0.0
    models = (manifest or {}).get("models", [])
    pinned = {m["role"]: m for m in models}
    have = {m.get("name", "") for m in present}

    primary = pinned.get("primary")
    embedding = pinned.get("embedding")

    gpu_capable = gpu.present and gpu.vram_gb >= MIN_USEFUL_VRAM_GB
    fits = bool(primary) and gpu_capable and (primary["size_gb"] <= budget_gb)

    if fits:
        return {
            "tier": "gpu",
            "degraded": False,
            "generalist": primary["ref"],
            "generalist_resident": primary["ref"] in have,
            "embedding": (embedding or {}).get("ref"),
            "keep_alive": "30m",
            "max_loaded_models": 1,
            "num_gpu_layers": -1,           # offload everything
            "reason": (
                f"{primary['ref']} needs {primary['size_gb']:.2f} GB and the card offers "
                f"{budget_gb:.2f} GB of usable VRAM"
            ),
            "speed_warning": None,
            # Full pack: the GPU can prefill this without the user noticing.
            "context_budget": 12000,
            "max_new_tokens": 1024,
            "request_timeout_seconds": 45,
        }

    # CPU tier. Supported, and slower -- which is stated, not hidden.
    smaller = sorted(
        (m for m in present if m.get("size", 0) and "embed" not in m.get("name", "")),
        key=lambda m: m.get("size", 0),
    )
    cpu_generalist = smaller[0]["name"] if smaller else None

    if gpu.present and gpu.vram_gb == 0:
        reason = "a GPU is present but its VRAM could not be measured, so the CPU tier is assumed"
    elif gpu.present:
        reason = f"{gpu.vram_gb:.2f} GB VRAM is below the {MIN_USEFUL_VRAM_GB:.0f} GB floor for the generalist"
    else:
        reason = "no GPU detected on this host"

    return {
        "tier": "cpu",
        "degraded": True,
        "generalist": cpu_generalist,
        "generalist_resident": bool(cpu_generalist),
        "embedding": (embedding or {}).get("ref"),
        "keep_alive": "10m",
        "max_loaded_models": 1,
        "num_gpu_layers": 0,
        "reason": reason,
        "speed_warning": (
            "Running on CPU. Generation is roughly an order of magnitude slower than the "
            "GPU tier, and the pinned generalist is too large to be practical here. The "
            "deterministic and sparse-retrieval paths are unaffected."
        ),
        # Prefill dominates on CPU: the full 12,000-token pack took 78 s for a
        # single grounded answer on this host. A smaller pack and a shorter reply
        # keep the surface answerable; the deterministic path is untouched either
        # way, and the tier is reported so nobody reads this as normal speed.
        "context_budget": 2400,
        "max_new_tokens": 220,
        "request_timeout_seconds": 120,
    }


def build_report() -> dict[str, Any]:
    gpu = detect_gpu()
    manifest = load_manifest()
    present = installed_models()
    plan = choose_tier(gpu, manifest, present)
    return {
        "gpu": {
            "present": gpu.present,
            "name": gpu.name,
            "vram_gb": gpu.vram_gb,
            "driver": gpu.driver,
            "detected_by": gpu.detected_by,
            "notes": gpu.notes,
        },
        "manifest_pinned": [
            {"role": m["role"], "ref": m["ref"], "size_gb": m["size_gb"]}
            for m in (manifest or {}).get("models", [])
        ],
        "ollama_installed": [
            {"name": m.get("name"), "size_gb": round(m.get("size", 0) / 1e9, 2)} for m in present
        ],
        "plan": plan,
    }


ENV_TEMPLATE = """\
# Generated by scripts/check_gpu_runtime.py -- do not edit by hand.
DASHBOARD_ASSISTANT_LOCAL_ENABLED=true
DASHBOARD_ASSISTANT_LOCAL_RUNTIME=ollama
DASHBOARD_ASSISTANT_PROVIDER=ollama
DASHBOARD_ASSISTANT_LOCAL_API_BASE={api_base}
DASHBOARD_ASSISTANT_LOCAL_MODEL={generalist}
ESD_INDEX_EMBED_BASE={embed_base}
OLLAMA_KEEP_ALIVE={keep_alive}
OLLAMA_MAX_LOADED_MODELS={max_loaded}
DASHBOARD_ASSISTANT_CONTEXT_BUDGET={context_budget}
DASHBOARD_ASSISTANT_MAX_NEW_TOKENS={max_new_tokens}
DASHBOARD_ASSISTANT_REQUEST_TIMEOUT_SECONDS={request_timeout}
ESD_RUNTIME_TIER={tier}
ESD_RUNTIME_DEGRADED={degraded}
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--env", action="store_true", help="emit shell-sourceable configuration")
    parser.add_argument("--require-gpu", action="store_true", help="fail when no usable GPU is present")
    parser.add_argument("--ollama-url", default=os.environ.get("ESD_OLLAMA_URL", "http://127.0.0.1:11434"))
    args = parser.parse_args(argv)

    report = build_report()
    plan = report["plan"]

    if args.env:
        print(ENV_TEMPLATE.format(
            api_base=f"{args.ollama_url}/v1",
            generalist=plan["generalist"] or "",
            embed_base=args.ollama_url,
            keep_alive=plan["keep_alive"],
            max_loaded=plan["max_loaded_models"],
            context_budget=plan["context_budget"],
            max_new_tokens=plan["max_new_tokens"],
            request_timeout=plan["request_timeout_seconds"],
            tier=plan["tier"],
            degraded=str(plan["degraded"]).lower(),
        ), end="")
        return 0

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        gpu = report["gpu"]
        print("GPU")
        if gpu["present"]:
            print(f"  {gpu['name'] or 'device present'}  {gpu['vram_gb'] or '?'} GB  driver {gpu['driver'] or '?'}")
            print(f"  detected by {gpu['detected_by']}")
        else:
            print("  none detected")
        for note in gpu["notes"]:
            print(f"    · {note}")

        print("\nPinned models (models/MANIFEST.json)")
        for m in report["manifest_pinned"]:
            print(f"  {m['role']:<10} {m['ref']:<26} {m['size_gb']:>6.2f} GB")
        if not report["manifest_pinned"]:
            print("  (none; run `make models-resolve`)")

        print("\nInstalled locally")
        for m in report["ollama_installed"]:
            print(f"  {m['name']:<26} {m['size_gb']:>6.2f} GB")
        if not report["ollama_installed"]:
            print("  (Ollama not reachable)")

        print(f"\nSelected tier: {plan['tier'].upper()}")
        print(f"  generalist   {plan['generalist'] or '(none available)'}")
        print(f"  embedding    {plan['embedding'] or '(none)'}")
        print(f"  gpu layers   {plan['num_gpu_layers']}")
        print(f"  context      {plan['context_budget']} tokens, {plan['max_new_tokens']} max new")
        print(f"  reason       {plan['reason']}")
        if plan["speed_warning"]:
            print(f"\n  ⚠ {plan['speed_warning']}")

    if args.require_gpu and plan["tier"] != "gpu":
        print("\nFAILED: --require-gpu was set and no usable GPU tier is available.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
