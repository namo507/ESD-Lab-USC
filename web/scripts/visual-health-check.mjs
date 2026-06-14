#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ROUTES = [
  {
    name: "overview",
    path: "/overview",
    expect: ["Live NANO Pipeline", "Ingest", "Kubernetes readings pipeline"],
    reject: ["No pipeline stages"],
  },
  {
    name: "versioned-root",
    path: "/?v=20260604-032545",
    expect: ["The heartbeat", "The NANO pipeline, live"],
  },
  {
    name: "participants",
    path: "/participants",
    expect: ["Participants", "NANO-"],
  },
  {
    name: "runs",
    path: "/runs",
    expect: ["Run history & live logs", "run_2026"],
  },
  {
    name: "qa",
    path: "/qa",
    expect: ["Window QA"],
  },
  {
    name: "results",
    path: "/results",
    expect: ["Results"],
  },
];

const DEFAULT_VIEWPORTS = [
  { label: "desktop", width: 1440, height: 1100 },
  { label: "mobile", width: 390, height: 844 },
];

function usage() {
  console.log(`Usage:
  node web/scripts/visual-health-check.mjs [options]

Options:
  --base-url URL       Local dashboard origin to check (default: http://127.0.0.1:8080)
  --live-url URL       Live URL to check. Can be passed multiple times.
  --output-dir DIR     Directory for screenshots and visual-health-results.json
  --desktop-only       Skip mobile viewport.
  --mobile-only        Skip desktop viewport.
  --help              Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    baseUrl: "http://127.0.0.1:8080",
    liveUrls: [],
    outputDir: "artifacts/visual-health",
    desktopOnly: false,
    mobileOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      usage();
      process.exit(0);
    }
    if (arg === "--base-url") {
      args.baseUrl = argv[++i];
    } else if (arg === "--live-url") {
      args.liveUrls.push(argv[++i]);
    } else if (arg === "--output-dir") {
      args.outputDir = argv[++i];
    } else if (arg === "--desktop-only") {
      args.desktopOnly = true;
    } else if (arg === "--mobile-only") {
      args.mobileOnly = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.baseUrl) throw new Error("--base-url cannot be empty");
  return args;
}

function joinUrl(baseUrl, routePath) {
  return new URL(routePath, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function liveCheckFromUrl(url, index) {
  const parsed = new URL(url);
  const key =
    parsed.pathname === "/overview"
      ? "overview"
      : parsed.searchParams.has("v")
        ? "versioned-root"
        : "live";
  const template = DEFAULT_ROUTES.find((route) => route.name === key);
  return {
    name: `live-${key}-${index + 1}`,
    url,
    expect: template?.expect ?? ["NANO"],
    reject: template?.reject ?? [],
  };
}

function sanitizeName(value) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function runCheck(browser, check, viewport, outputDir) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];
  const failedRequests = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));
  page.on("response", (response) => {
    const status = response.status();
    const responseUrl = response.url();
    if (status >= 400 && !responseUrl.endsWith("/favicon.ico")) {
      badResponses.push(`${status} ${responseUrl}`);
    }
  });
  page.on("requestfailed", (request) => {
    const requestUrl = request.url();
    if (!requestUrl.endsWith("/favicon.ico")) {
      failedRequests.push(`${request.failure()?.errorText || "failed"} ${requestUrl}`);
    }
  });

  try {
    await page.goto(check.url, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForSelector("#root", { timeout: 15_000 });
    await page.waitForTimeout(750);

    const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    const rootBox = await page.locator("#root").boundingBox().catch(() => null);
    const missingText = check.expect.filter((needle) => !bodyText.includes(needle));
    const rejectedText = (check.reject ?? []).filter((needle) => bodyText.includes(needle));
    const screenshot = path.join(
      outputDir,
      `${sanitizeName(check.name)}-${viewport.label}.png`,
    );
    await page.screenshot({ path: screenshot, fullPage: true });

    const pass =
      bodyText.trim().length > 250 &&
      rootBox &&
      rootBox.height > 300 &&
      missingText.length === 0 &&
      rejectedText.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      badResponses.length === 0 &&
      failedRequests.length === 0;

    return {
      name: check.name,
      url: check.url,
      viewport: viewport.label,
      pass: Boolean(pass),
      textLength: bodyText.trim().length,
      rootHeight: rootBox?.height ?? 0,
      missingText,
      rejectedText,
      consoleErrors,
      pageErrors,
      badResponses,
      failedRequests,
      screenshot,
    };
  } catch (error) {
    return {
      name: check.name,
      url: check.url,
      viewport: viewport.label,
      pass: false,
      error: String(error?.message || error),
      consoleErrors,
      pageErrors,
      badResponses,
      failedRequests,
    };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(args.outputDir);
  await mkdir(outputDir, { recursive: true });

  const viewports = DEFAULT_VIEWPORTS.filter((viewport) => {
    if (args.desktopOnly) return viewport.label === "desktop";
    if (args.mobileOnly) return viewport.label === "mobile";
    return true;
  });

  const localChecks = DEFAULT_ROUTES.map((route) => ({
    ...route,
    name: `local-${route.name}`,
    url: joinUrl(args.baseUrl, route.path),
  }));
  const liveChecks = args.liveUrls.map(liveCheckFromUrl);
  const checks = [...localChecks, ...liveChecks];

  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const viewport of viewports) {
    for (const check of checks) {
      results.push(await runCheck(browser, check, viewport, outputDir));
    }
  }
  await browser.close();

  const resultPath = path.join(outputDir, "visual-health-results.json");
  await writeFile(resultPath, JSON.stringify(results, null, 2));

  for (const result of results) {
    const state = result.pass ? "PASS" : "FAIL";
    const rootHeight = Math.round(result.rootHeight ?? 0);
    console.log(
      `${state} ${result.viewport} ${result.name} text=${result.textLength ?? 0} root=${rootHeight}`,
    );
    for (const key of [
      "error",
      "missingText",
      "rejectedText",
      "consoleErrors",
      "pageErrors",
      "badResponses",
      "failedRequests",
    ]) {
      const value = result[key];
      if (Array.isArray(value) && value.length > 0) {
        console.log(`  ${key}: ${JSON.stringify(value).slice(0, 1000)}`);
      } else if (typeof value === "string" && value) {
        console.log(`  ${key}: ${value.slice(0, 1000)}`);
      }
    }
  }
  console.log(`Wrote ${resultPath}`);

  if (results.some((result) => !result.pass)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
