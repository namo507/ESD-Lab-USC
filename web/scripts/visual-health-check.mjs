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
    name: "nano-dashboard",
    path: "/nano/dashboard",
    expect: [
      "The heartbeat of every baby's first year.",
      "What is due next?",
      "Ask the lab, stay grounded",
    ],
    reject: ["NANO dashboard data is temporarily unavailable"],
  },
  {
    name: "versioned-root",
    path: "/?v=20260604-032545",
    expect: ["The heartbeat", "The NANO pipeline, live"],
  },
  {
    name: "docs",
    path: "/docs",
    expect: ["NANO dashboard reference", "Public landing reference", "Operator console reference"],
  },
  {
    name: "how-to",
    path: "/how-to",
    expect: [
      "Learn the dashboard by doing",
      "Every interactive feature",
      "Step-by-step, each linked to its route",
    ],
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
  { label: "desktop", width: 1280, height: 720 },
  { label: "mobile", width: 390, height: 844 },
];

const OPTIONAL_MAP_TILE_PREFIX =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/";

function usage() {
  console.log(`Usage:
  node web/scripts/visual-health-check.mjs [options]

Options:
  --base-url URL       Local dashboard origin to check (default: http://127.0.0.1:8080)
  --live-url URL       Live URL to check. Can be passed multiple times.
  --output-dir DIR     Directory for screenshots and visual-health-results.json
  --route NAME         Check one named local route. Can be passed multiple times.
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
    routes: [],
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
    } else if (arg === "--route") {
      args.routes.push(argv[++i]);
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
  const layoutErrors = [];
  let horizontalLayout = null;

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
    const errorText = request.failure()?.errorText || "failed";
    const isCancelledMapTile =
      errorText === "net::ERR_ABORTED" && requestUrl.startsWith(OPTIONAL_MAP_TILE_PREFIX);
    const isCancelledAudit =
      errorText === "net::ERR_ABORTED" && new URL(requestUrl).pathname === "/api/audit";
    if (!requestUrl.endsWith("/favicon.ico") && !isCancelledMapTile && !isCancelledAudit) {
      failedRequests.push(`${errorText} ${requestUrl}`);
    }
  });

  try {
    await page.goto(check.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForSelector("#root", { timeout: 15_000 });
    await page.waitForTimeout(750);
    await page
      .waitForFunction(
        (needles) => needles.every((needle) => document.body.innerText.includes(needle)),
        check.expect,
        { timeout: 10_000 },
      )
      .catch(() => {});

    const bodyText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
    const rootBox = await page.locator("#root").boundingBox().catch(() => null);
    const missingText = check.expect.filter((needle) => !bodyText.includes(needle));
    const rejectedText = (check.reject ?? []).filter((needle) => bodyText.includes(needle));
    const assistantLayoutErrors = [];
    let assistantComposer = null;
    if (check.name === "local-overview") {
      await page.getByRole("button", { name: "Toggle ESD Buddy" }).click();
      const dialog = page.getByRole("dialog", { name: "ESD Buddy" });
      await dialog.waitFor({ state: "visible", timeout: 5_000 });
      await page.waitForTimeout(450);

      const composer = page.getByPlaceholder("Ask about the study…");
      const sendButton = page.getByRole("button", { name: "Send message" });
      const form = composer.locator("..");
      const suggestions = dialog.getByLabel("Fast-path prompts");
      const suggestionsRegion = suggestions.locator("..");
      await composer.fill("Non-sensitive layout probe\nSecond line");
      await composer.focus();

      const [dialogBox, composerBox, sendBox, formBox, suggestionsBox, dialogMetrics] = await Promise.all([
        dialog.boundingBox(),
        composer.boundingBox(),
        sendButton.boundingBox(),
        form.boundingBox(),
        suggestionsRegion.boundingBox(),
        dialog.evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
      ]);
      const viewportSize = page.viewportSize();
      const validBox = (box) => Boolean(box && box.width > 0 && box.height > 0);
      const withinBox = (box, outer, tolerance = 2) =>
        Boolean(
          validBox(box) &&
          validBox(outer) &&
          box.x >= outer.x - tolerance &&
          box.y >= outer.y - tolerance &&
          box.x + box.width <= outer.x + outer.width + tolerance &&
          box.y + box.height <= outer.y + outer.height + tolerance,
        );
      const withinViewport = (box) =>
        Boolean(
          validBox(box) &&
          viewportSize &&
          box.x >= -2 &&
          box.y >= -2 &&
          box.x + box.width <= viewportSize.width + 2 &&
          box.y + box.height <= viewportSize.height + 2,
        );

      for (const [label, box] of [
        ["composer form", formBox],
        ["textarea", composerBox],
        ["Send button", sendBox],
      ]) {
        if (!validBox(box)) assistantLayoutErrors.push(`${label} has no visible box`);
        if (!withinBox(box, dialogBox)) assistantLayoutErrors.push(`${label} leaves the assistant dialog`);
        if (!withinViewport(box)) assistantLayoutErrors.push(`${label} leaves the viewport`);
      }
      if (
        validBox(suggestionsBox) &&
        validBox(formBox) &&
        suggestionsBox.y + suggestionsBox.height > formBox.y + 2
      ) {
        assistantLayoutErrors.push("Fast-path prompts overlap the composer form");
      }
      if (dialogMetrics.scrollWidth > dialogMetrics.clientWidth + 2) {
        assistantLayoutErrors.push("Assistant dialog has horizontal overflow");
      }
      if (!(await sendButton.isEnabled())) {
        assistantLayoutErrors.push("Send button stayed disabled after filling the textarea");
      }
      if (!(await composer.evaluate((element) => document.activeElement === element))) {
        assistantLayoutErrors.push("Textarea could not retain focus");
      }
      await sendButton.click({ trial: true, timeout: 2_000 }).catch((error) => {
        assistantLayoutErrors.push(`Send button is not actionable: ${String(error?.message || error)}`);
      });

      assistantComposer = {
        dialogBox,
        formBox,
        composerBox,
        sendBox,
        suggestionsBox,
        dialogMetrics,
      };
    }
    if (new URL(check.url).pathname === "/nano/dashboard") {
      const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const scrollStep = Math.max(360, Math.floor(viewport.height * 0.75));
      for (let y = 0; y <= documentHeight; y += scrollStep) {
        await page.evaluate((nextY) => window.scrollTo(0, nextY), y);
        await page.waitForTimeout(100);
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(700);

      horizontalLayout = await page.evaluate(() => {
        const root = document.querySelector("#root");
        const dashboard = document.querySelector('[data-testid="nano-study-dashboard"]');
        const pipeline = document.querySelector('[class*="pipelineSteps"]');
        const tableScroller = document.querySelector('[class*="tableScroll"]');
        return {
          viewportWidth: document.documentElement.clientWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          rootClientWidth: root?.clientWidth ?? 0,
          rootScrollWidth: root?.scrollWidth ?? 0,
          dashboardClientWidth: dashboard?.clientWidth ?? 0,
          dashboardScrollWidth: dashboard?.scrollWidth ?? 0,
          pipelineClientWidth: pipeline?.clientWidth ?? 0,
          pipelineScrollWidth: pipeline?.scrollWidth ?? 0,
          tableClientWidth: tableScroller?.clientWidth ?? 0,
          tableScrollWidth: tableScroller?.scrollWidth ?? 0,
        };
      });
      const pageScrollWidth = Math.max(
        horizontalLayout.documentScrollWidth,
        horizontalLayout.bodyScrollWidth,
        horizontalLayout.rootScrollWidth,
      );
      if (pageScrollWidth > horizontalLayout.viewportWidth + 2) {
        layoutErrors.push(
          `Document has horizontal overflow (${pageScrollWidth}px scroll width at ${horizontalLayout.viewportWidth}px viewport)`,
        );
      }
    }
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
      failedRequests.length === 0 &&
      assistantLayoutErrors.length === 0 &&
      layoutErrors.length === 0;

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
      assistantLayoutErrors,
      layoutErrors,
      assistantComposer,
      horizontalLayout,
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
      layoutErrors,
      horizontalLayout,
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

  const selectedRoutes = args.routes.length
    ? DEFAULT_ROUTES.filter((route) => args.routes.includes(route.name))
    : DEFAULT_ROUTES;
  const unknownRoutes = args.routes.filter(
    (name) => !DEFAULT_ROUTES.some((route) => route.name === name),
  );
  if (unknownRoutes.length > 0) {
    throw new Error(`Unknown route name: ${unknownRoutes.join(", ")}`);
  }

  const localChecks = selectedRoutes.map((route) => ({
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
      "assistantLayoutErrors",
      "layoutErrors",
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
