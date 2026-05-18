#!/usr/bin/env python3
"""Select the best small local GGUF chat model and write config/llm_model.json."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


FALLBACK_MODELS = [
    {
        "repo_id": "bartowski/SmolLM2-360M-Instruct-GGUF",
        "filename": "SmolLM2-360M-Instruct-Q2_K.gguf",
        "params_b": 0.36,
        "context_length": 2048,
        "min_memory_gib": 0.25,
        "max_tokens": 192,
        "reason": "fallback-primary: fits very constrained CPU containers",
    },
    {
        "repo_id": "bartowski/Qwen2.5-0.5B-Instruct-GGUF",
        "filename": "Qwen2.5-0.5B-Instruct-Q2_K.gguf",
        "params_b": 0.5,
        "context_length": 2048,
        "min_memory_gib": 0.3,
        "max_tokens": 192,
        "reason": "fallback-secondary: slightly stronger while still small",
    },
    {
        "repo_id": "bartowski/Qwen2.5-1.5B-Instruct-GGUF",
        "filename": "Qwen2.5-1.5B-Instruct-Q2_K.gguf",
        "params_b": 1.5,
        "context_length": 4096,
        "min_memory_gib": 0.8,
        "max_tokens": 256,
        "reason": "fallback-tertiary: only for roomier hosts",
    },
]

HF_API = "https://huggingface.co/api/models"
OUTPUT = Path(__file__).resolve().parents[1] / "config" / "llm_model.json"
PARAMS_PATTERN = re.compile(r"(?<!\d)(\d+(?:\.\d+)?)\s*[bB](?!\w)")


def _extract_params(model: dict[str, Any]) -> float | None:
    for candidate in [model.get("id", ""), *(model.get("tags") or [])]:
        match = PARAMS_PATTERN.search(str(candidate))
        if not match:
            continue
        try:
            value = float(match.group(1))
        except ValueError:
            continue
        if 0.1 < value <= 8.0:
            return value
    return None


def _pick_filename(model: dict[str, Any]) -> str:
    siblings = model.get("siblings") or []
    sibling_names = [
        sibling.get("rfilename")
        for sibling in siblings
        if isinstance(sibling, dict) and sibling.get("rfilename")
    ]

    params_b = _extract_params(model) or 4.0
    preferred_orders = []
    if params_b <= 0.6:
        preferred_orders = [
            ("Q2_K_L", "Q2_K", "IQ3_M", "IQ3_XS", "Q3_K_L", "Q3_K_M", "IQ4_XS", "Q4_K_M"),
        ]
    elif params_b <= 1.0:
        preferred_orders = [
            ("Q2_K", "Q2_K_L", "IQ3_M", "Q3_K_M", "Q3_K_L", "Q4_K_M"),
        ]
    else:
        preferred_orders = [
            ("Q4_K_M", "Q4", "Q3_K_M", "Q3_K_L", "Q2_K", "Q2_K_L"),
        ]

    for preferred_order in preferred_orders:
        for quant in preferred_order:
            for preferred in sibling_names:
                if preferred.endswith(".gguf") and quant in preferred:
                    return preferred
    for preferred in sibling_names:
        if preferred.endswith(".gguf"):
            return preferred

    repo_name = str(model.get("id", "model")).split("/")[-1]
    return f"{repo_name}-Q4_K_M.gguf"


def score(model: dict[str, Any]) -> float:
    downloads = model.get("downloads", 0) or 0
    last_modified = str(model.get("lastModified", ""))
    try:
        dt = datetime.fromisoformat(last_modified.replace("Z", "+00:00"))
        days_old = max(0.0, float((datetime.now(timezone.utc) - dt).days))
    except Exception:
        days_old = 365.0

    recency = max(0.0, 1.0 - days_old / 365.0)
    size_b = _extract_params(model) or 4.0
    size_efficiency = 1.0 / max(0.5, size_b)
    return 0.40 * min(1.0, downloads / 1_000_000) + 0.20 * recency + 0.40 * size_efficiency


def _runtime_defaults(params_b: float | None) -> dict[str, Any]:
    size_b = params_b or 0.5
    if size_b <= 0.4:
        return {"context_length": 2048, "min_memory_gib": 0.25, "max_tokens": 192}
    if size_b <= 0.6:
        return {"context_length": 2048, "min_memory_gib": 0.3, "max_tokens": 192}
    if size_b <= 1.5:
        return {"context_length": 4096, "min_memory_gib": 0.8, "max_tokens": 256}
    return {"context_length": 8192, "min_memory_gib": 1.2, "max_tokens": 256}


def fetch_candidates() -> list[dict[str, Any]]:
    headers: dict[str, str] = {}
    if token := os.getenv("HF_TOKEN"):
        headers["Authorization"] = f"Bearer {token}"

    params = {
        "filter": "gguf",
        "search": "instruct",
        "sort": "downloads",
        "direction": -1,
        "limit": 100,
        "full": "true",
    }

    try:
        response = requests.get(HF_API, params=params, headers=headers, timeout=20)
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, list) else []
    except Exception as exc:
        print(f"[warn] HF API request failed: {exc}")
        return []


def build_result(best: dict[str, Any]) -> dict[str, Any]:
    params_b = _extract_params(best)
    runtime = _runtime_defaults(params_b)
    return {
        "repo_id": best.get("id", FALLBACK_MODELS[0]["repo_id"]),
        "filename": _pick_filename(best),
        "params_b": params_b,
        "context_length": runtime["context_length"],
        "min_memory_gib": runtime["min_memory_gib"],
        "max_tokens": runtime["max_tokens"],
        "score": round(score(best), 4),
        "selected_at": datetime.now(timezone.utc).isoformat(),
        "source": "hf-api",
        "fallbacks": FALLBACK_MODELS,
    }


def main() -> None:
    candidates = fetch_candidates()
    eligible = [candidate for candidate in candidates if (_extract_params(candidate) or 9.0) <= 0.6]
    eligible.sort(key=score, reverse=True)

    if eligible:
        result = build_result(eligible[0])
    else:
        print("[warn] No eligible models found via API — using primary fallback.")
        primary = FALLBACK_MODELS[0]
        result = {
            **primary,
            "score": None,
            "selected_at": datetime.now(timezone.utc).isoformat(),
            "source": "fallback",
            "fallbacks": FALLBACK_MODELS[1:],
        }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"[ok] Wrote {OUTPUT}: {result['repo_id']}")


if __name__ == "__main__":
    main()