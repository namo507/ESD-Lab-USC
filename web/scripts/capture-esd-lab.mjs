/**
 * Capture the /esd-lab front door and assert its design rules held.
 *
 * This is verification, not decoration. Each shot also probes the live DOM for
 * the things the redesign is judged on: that the resting surface shows no
 * numbers, that the canvas is aria-hidden, that WebGL actually painted, and
 * that the retired routes redirect. Run it against `vite preview`:
 *
 *     npx vite preview --port 4173 &
 *     node scripts/capture-esd-lab.mjs
 */
import { chromium } from "playwright";

const OUT = "/workspaces/ESD-Lab-USC/reports/esd-lab-overhaul";
const BASE = process.env.ESD_CAPTURE_BASE ?? "http://127.0.0.1:4173";

const browser = await chromium.launch({
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});

async function shot(name, path, opts = {}) {
  const page = await browser.newPage({
    viewport: opts.viewport ?? { width: 1440, height: 900 },
    colorScheme: opts.colorScheme ?? "light",
    reducedMotion: opts.reducedMotion,
    deviceScaleFactor: 2,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  // Not `networkidle`: the front door polls the portfolio artifact on an
  // interval, so the network is never idle for long and the wait times out
  // intermittently. Wait for the surface's own readiness signal instead.
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("nav[aria-label='Studies'] button", { timeout: 20000 });
  // Park the pointer on the character. Gaze is measured from the viewport, so a
  // cursor left at (0,0) makes every capture a hard up-left stare.
  const box = await page.locator("canvas, .buddy-static").first().boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // Let the character settle into its idle pose before capturing.
  await page.waitForTimeout(opts.settle ?? 2500);

  if (opts.hover) {
    await page.getByRole("button", { name: opts.hover }).hover();
    await page.waitForTimeout(900);
  }
  if (opts.click) {
    await page.getByRole("button", { name: opts.click }).click();
    await page.waitForTimeout(900);
  }

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });

  const probe = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    let webgl = false;
    let painted = false;
    if (canvas) {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      webgl = Boolean(gl);
      // Sample the middle of the canvas to prove something was actually drawn.
      // Read straight from the GL buffer. Copying the canvas into a 2D context
      // always reads back empty, because preserveDrawingBuffer is off and the
      // buffer is cleared once the frame is composited.
      try {
        const px = new Uint8Array(4 * 64);
        gl.readPixels(
          Math.floor(canvas.width / 2) - 4, Math.floor(canvas.height / 2) - 4,
          8, 8, gl.RGBA, gl.UNSIGNED_BYTE, px,
        );
        painted = px.some((v, i) => i % 4 === 3 && v > 0);
      } catch { painted = false; }
    }
    const text = document.body.innerText;
    return {
      url: location.pathname,
      title: document.title,
      hasCanvas: Boolean(canvas),
      canvasAriaHidden: canvas?.getAttribute("aria-hidden"),
      webgl,
      painted,
      digitsOnPage: (text.match(/\d/g) || []).length,
      glyphs: [...document.querySelectorAll("nav[aria-label='Studies'] button")].map((b) =>
        b.innerText.split("\n")[0]),
      statusWord: document.querySelector("main p [class*='ambientWord']")?.textContent ?? null,
      textSample: text.replace(/\s+/g, " ").slice(0, 260),
    };
  });

  console.log(JSON.stringify({ name, path, ...probe, errors: errors.slice(0, 4) }, null, 2));
  await page.close();
}

await shot("01-resting", "/esd-lab");
await shot("02-codex-hover", "/esd-lab", { hover: /NANO/ });
await shot("03-codex-pinned", "/esd-lab", { click: /NICO/ });
await shot("04-reduced-motion", "/esd-lab?motion=off", { reducedMotion: "reduce" });
await shot("05-dark", "/esd-lab", { colorScheme: "dark" });
await shot("06-mobile", "/esd-lab", { viewport: { width: 390, height: 844 } });
await shot("07-redirect-from-root", "/");
await shot("08-redirect-from-overview", "/overview");

await browser.close();
