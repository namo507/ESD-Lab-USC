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
DEFAULT_MANIFEST = (
    REPO_ROOT / "dashboard" / "public" / "pages_wrapper" / "manifest.json"
)


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
    return ("""
const API_ORIGIN = __API_ORIGIN__;

const presentationJobs = new Map();

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function ndjsonResponse(text) {
  const body = text
    .split(/(\\s+)/)
    .filter(Boolean)
    .map((part) => JSON.stringify({ delta: part }) + "\\n")
    .join("") + JSON.stringify({ done: true }) + "\\n";
  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function readJson(request) {
  if (!request) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function redcapProxy(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "Content-Type",
      },
    });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST for REDCap proxy calls." }, 405);
  }
  const token = env.REDCAP_API_TOKEN;
  const apiUrl = env.REDCAP_API_URL;
  if (!token || !apiUrl) {
    return jsonResponse({ error: "REDCap env vars not set in Cloudflare Pages." }, 500);
  }
  const body = await readJson(request);
  const allowed = new Set(["project", "metadata", "event", "formEventMapping", "record"]);
  if (body.content && !allowed.has(body.content)) {
    return jsonResponse({ error: `content '${body.content}' not permitted via proxy.` }, 403);
  }
  if (body.action === "import" || body.action === "delete") {
    return jsonResponse({ error: "Write actions are not allowed through the browser proxy." }, 403);
  }
  const form = new URLSearchParams({ ...body, token, format: "json", returnFormat: "json" });
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (error) {
    return jsonResponse({ error: `Cannot reach REDCap: ${String(error?.message || error)}` }, 502);
  }
}

function assistantStatus(reason = "upstream-unavailable") {
  return {
    status: "ready",
    ready: true,
    state: "ready",
    error: null,
    model: "pages://fallback-assistant",
    message:
      "Pages fallback assistant is active because the optional live Python assistant origin is unavailable.",
    reason,
    freshness: {
      readings: { last_indexed_at: null, total_indexed: null, payload_version: "pages-fallback" },
      pipeline: { state: "pages-fallback", warnings: [] },
      redcap: { generated_at: null, record_count: null, anomaly_count: null, source: "pages-fallback" },
    },
  };
}

function assistantReply(message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("carry-forward") || text.includes("visit health") || text.includes("csbs")) {
    return "The Visit Health Monitor checks CSBS caregiver completion across 6m, 9m, 12m, and 24m REDCap events. It emits R1-R5 carry-forward anomaly codes when an earlier incomplete or blank CSBS state conflicts with a later visit date or completion state.";
  }
  if (text.includes("visit entry") || text.includes("visit date")) {
    return "Visit dates come from the REDCap visit_occurred.visit_date anchor at visit events only. Browser REDCap writes are disabled; any source correction should run through the audited server-side REDCap scripts.";
  }
  if (text.includes("coverage") && text.includes("skip")) {
    return "Coverage = (Complete + Skipped) / Total expected. The SKIP missing data code marks intentionally skipped visits so the team can distinguish workflow errors from planned study design decisions.";
  }
  if (text.includes("cga") || text.includes("milestone river") || (text.includes("hda") && text.includes("river"))) {
    return "The CGA Milestone River shows aggregate HDA phase composition across corrected-age milestones for VPT, ASIB, and TD groups. It uses normalized orienting, sustained, inattention, and termination shares from the /api/v2/hda-composition contract.";
  }
  if (text.includes("county") || text.includes("sdoh") || text.includes("comparator")) {
    return "The County Comparator pairs two county-level aggregate profiles with the SDOH map, mirrored access bars, and completion context. It avoids participant identity and never exposes addresses, ZIP codes, or tract-level location.";
  }
  if (text.includes("participant timeline") || text.includes("passport timeline") || text.includes("swimlane")) {
    return "The Participant Passport Timeline arranges de-identified NANO IDs into swim lanes across visit, REDCap, ECG, QA, and pipeline events. Detail drawers are designed for scrubbed event metadata only.";
  }
  if (text.includes("model terrain") || text.includes("confidence terrain") || text.includes("contour")) {
    return "The Model Confidence Terrain turns aggregate SHAP and confidence summaries into contour-style explanation views, with heatmap and 3D controls ready for richer model payloads.";
  }
  if (text.includes("attrition funnel") || text.includes("retention") || text.includes("nih")) {
    return "The Attrition Funnel v2 summarizes consent-to-analysis retention stages, dropout reason codes, quarter trends, subgroup filters, and a copy-ready NIH report note.";
  }
  if (text.includes("guided") || text.includes("hypothesis")) {
    return "The Guided Explorer offers five hypothesis cards that open preconfigured dashboard views for CGA-HDA change, county access context, adherence timelines, model confidence, and attrition pressure.";
  }
  if (text.includes("public insights") || text.includes("stakeholder")) {
    return "Public Insights is an aggregate stakeholder story surface with CDC-style charts for study reach, enrollment trajectory, county context, HDA patterns, and retention. It does not show participant-level rows.";
  }
  if (text.includes("executive")) {
    return "Executive Mode is a compact stakeholder dashboard with enrollment, completion, model, SDOH, and retention KPIs plus a PPTX export path.";
  }
  if (text.includes("co-reg") || text.includes("coreg") || text.includes("dyad")) {
    return "The Dynamics & Dyads build adds co-regulation braids, lag surfaces, and dyad-level summaries behind the DYN feature flags. Use the Co-regulation route to compare infant arousal with caregiver speech and attention alignment.";
  }
  if (text.includes("phase") || text.includes("portrait") || text.includes("arousal")) {
    return "The phase portrait view maps arousal against attention in 2D, with dwell bins and transition traces for NANO-only participant IDs.";
  }
  if (text.includes("cva") || text.includes("gaze")) {
    return "The CVA gaze theater synchronizes caregiver vocal affect, gaze, infant arousal, and attention markers so reviewers can inspect timing without exposing PHI.";
  }
  if (text.includes("cascade") || text.includes("sim")) {
    return "The cascade simulator supports de-identified what-if planning and exports a seeded presentation-maker prompt for decision-support slides.";
  }
  if (text.includes("passport")) {
    return "The infant passport summarizes longitudinal modalities, completeness, and risk trend for a selected NANO ID using de-identified labels only.";
  }
  return "The public Pages fallback assistant can answer high-level dashboard navigation questions while the optional live local assistant tunnel is offline. Dashboard data remains mocked and de-identified in the browser build.";
}

function presentationPlan(concept, options = {}) {
  const topic = String(concept || "this concept").trim() || "this concept";
  const title = topic.charAt(0).toUpperCase() + topic.slice(1);
  const audience = ["beginner", "intermediate", "advanced"].includes(options.audience_level)
    ? options.audience_level
    : "beginner";
  const slides = [
    {
      id: "title-1",
      type: "title",
      title: `Understanding ${title}`,
      subtitle: `A simple, ${audience}-friendly explainer`,
      bullets: [],
      example: null,
      analogy: null,
      note: null,
      citations: [],
      visual: "clean title with a thin garnet divider",
    },
    {
      id: "why-2",
      type: "why",
      title: "Why this matters",
      subtitle: null,
      bullets: [
        `${title} shows up in dashboard review and study-planning conversations`,
        "A plain-language model helps reviewers align before deeper analysis",
        "The public fallback avoids PHI and avoids fabricated lab citations",
      ],
      example: null,
      analogy: null,
      note: null,
      citations: [],
      visual: null,
    },
    {
      id: "concept-3",
      type: "concept",
      title: `What ${title} means`,
      subtitle: null,
      bullets: [
        "Define the core idea in one sentence",
        "Name the key inputs and outputs",
        "Separate observed evidence from interpretation",
      ],
      example: null,
      analogy: null,
      note: "Keep the slide de-identified and study-safe.",
      citations: [],
      visual: null,
    },
    {
      id: "recap-4",
      type: "recap",
      title: "Recap",
      subtitle: null,
      bullets: [
        "Start with the dashboard view that owns the evidence",
        "Use NANO IDs only",
        "Treat model projections as decision support, not ground truth",
      ],
      example: null,
      analogy: null,
      note: null,
      citations: [],
      visual: "three-line summary with a gold underline",
    },
  ];
  return {
    plan: {
      title: `Understanding ${title}`,
      subtitle: `A simple, ${audience}-friendly explainer`,
      audience_level: audience,
      summary: `A clear, ${audience} introduction to ${title}.`,
      disclaimer:
        "This deck was generated by the Cloudflare Pages fallback while the optional live local assistant was unavailable. It is de-identified and carries no lab-specific citations.",
      grounded: false,
      citations: [],
      concept: topic,
      generated_at: new Date().toISOString().slice(0, 19),
      slides,
    },
  };
}

async function fallbackApiResponse(url, request, reason) {
  const path = url.pathname;
  if (path === "/api/healthz") {
    return jsonResponse({
      status: "ok",
      dashboard: true,
      readings: true,
      assistant: assistantStatus(reason),
      origin: "pages-fallback",
    });
  }
  if (path === "/api/assistant/status" || path === "/api/chat/status") {
    return jsonResponse(assistantStatus(reason));
  }
  if (path === "/api/assistant/freshness") {
    return jsonResponse({
      schema: "assistant_freshness.v1",
      mode: "pages-fallback",
      generated_at: new Date().toISOString(),
      assistant: assistantStatus(reason),
      readings: { last_indexed_at: null, total_indexed: null, payload_version: "pages-fallback" },
      pipeline: { state: "pages-fallback", warnings: [] },
      redcap: { generated_at: null, record_count: null, anomaly_count: null, source: "pages-fallback" },
    });
  }
  if (path === "/api/v2/redcap-visit-health" || path === "/api/v2/redcap-missing-data") {
    return jsonResponse({
      data: [],
      meta: { generatedAt: new Date().toISOString(), participantCount: 0, source: "mock" },
      anomalies: [],
      visitOptions: [
        { key: "sixMonth", label: "6m", eventName: "6_months_arm_1" },
        { key: "nineMonth", label: "9m", eventName: "9_months_arm_1" },
        { key: "twelveMonth", label: "12m", eventName: "12_months_arm_1" },
        { key: "twentyFourMonth", label: "24m", eventName: "24_months_arm_1" },
      ],
      error: "Backend offline - live REDCap data unavailable",
    });
  }
  if (path === "/api/v2/redcap-visit-entry" && request?.method === "POST") {
    return jsonResponse({ error: "Backend offline - REDCap visit entry unavailable" }, 503);
  }
  if (path === "/api/assistant/chat" && request?.method === "POST") {
    const payload = await readJson(request);
    return ndjsonResponse(assistantReply(payload.message));
  }
  if (path === "/api/chat" && request?.method === "POST") {
    const payload = await readJson(request);
    return jsonResponse({ reply: assistantReply(payload.message), status: assistantStatus(reason) });
  }
  if (path === "/api/presentation/plan" && request?.method === "POST") {
    const payload = await readJson(request);
    return jsonResponse(presentationPlan(payload.concept, payload.options));
  }
  if (path === "/api/presentation/jobs" && request?.method === "POST") {
    const payload = await readJson(request);
    const jobId = `pages_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const result = presentationPlan(payload.concept, payload.options);
    presentationJobs.set(jobId, result);
    return jsonResponse({
      job_id: jobId,
      status: "succeeded",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      progress_message: "Generated by the Pages fallback assistant.",
      poll_after_ms: 300,
    });
  }
  if (path.startsWith("/api/presentation/jobs/")) {
    const jobId = decodeURIComponent(path.slice("/api/presentation/jobs/".length));
    const result = presentationJobs.get(jobId) || presentationPlan("dashboard presentation", {});
    return jsonResponse({
      job_id: jobId,
      status: "succeeded",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      progress_message: null,
      result,
    });
  }
  return null;
}

async function proxyApi(request, url) {
  const target = new URL(url.pathname + url.search, API_ORIGIN);
  const fallbackRequest = request.method === "GET" || request.method === "HEAD"
    ? null
    : request.clone();
  try {
    const response = await fetch(new Request(target.toString(), request));
    if (response.status < 500) return response;
    const fallback = await fallbackApiResponse(url, fallbackRequest, `upstream-${response.status}`);
    return fallback || response;
  } catch (error) {
    const fallback = await fallbackApiResponse(url, fallbackRequest, "upstream-fetch-failed");
    if (fallback) return fallback;
    return jsonResponse(
      { error: "API origin unavailable", origin: API_ORIGIN, detail: String(error?.message || error) },
      502,
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const legacyDashboardPaths = new Set(["/dashboard", "/dashboard/", "/dashboard/index.html"]);
    if (legacyDashboardPaths.has(url.pathname)) {
      const target = new URL("/overview", url);
      return Response.redirect(target.toString(), 308);
    }

    if (url.pathname === "/api/redcap") {
      return redcapProxy(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return proxyApi(request, url);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    const lastSegment = url.pathname.split("/").pop() || "";
    if ((request.method === "GET" || request.method === "HEAD") && !lastSegment.includes(".")) {
      const fallbackUrl = new URL("/index.html", url);
      return env.ASSETS.fetch(new Request(fallbackUrl.toString(), request));
    }

    return assetResponse;
  },
};
""").lstrip().replace("__API_ORIGIN__", json.dumps(api_origin))


def _resolve_api_origin(api_origin: str | None, manifest_path: pathlib.Path) -> str:
    explicit = (
        api_origin or os.getenv("PAGES_API_ORIGIN") or os.getenv("DASHBOARD_API_ORIGIN")
    )
    if explicit:
        return _normalize_origin(explicit)

    if manifest_path.exists():
        try:
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            sys.exit(
                f"[build_pages_site] invalid manifest JSON at {manifest_path}: {exc}"
            )

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
    dashboard_data_out = out_dir / "dashboard" / "data"
    dashboard_data_out.mkdir(parents=True, exist_ok=True)
    for name in ("dashboard_data.json", "readings_data.json", "runtime_status.json"):
        source = REPO_ROOT / "dashboard" / "data" / name
        if source.exists():
            shutil.copy2(source, dashboard_data_out / name)

    out_index = out_dir / "index.html"
    html = _read(out_index)
    resolved_api_origin = _resolve_api_origin(api_origin, manifest_path)

    stamp = stamp or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
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
        "/dashboard /overview 308\n"
        "/dashboard/ /overview 308\n"
        "/dashboard/index.html /overview 308\n"
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
