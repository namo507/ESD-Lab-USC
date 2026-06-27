import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(TEST_DIR, "../..");

function read(relativePath: string): string {
  return readFileSync(path.join(WEB_DIR, relativePath), "utf-8");
}

describe("dark mode surface guard", () => {
  it("does not force light FastPaths on the dark-mode-sensitive routes", () => {
    for (const route of [
      "src/routes/QA.tsx",
      "src/routes/Redcap.tsx",
      "src/routes/Matlab.tsx",
      "src/routes/Results.tsx",
    ]) {
      expect(read(route)).not.toContain('FastPaths tone="light"');
    }
  });

  it("keeps diagnostic terminal surfaces on the dedicated terminal background token", () => {
    expect(read("src/routes/Runs.module.css")).toContain("background: var(--terminal-bg);");
    expect(read("src/components/qa/EpochInspector.module.css")).toContain("background: var(--terminal-bg);");
    expect(read("src/routes/ParticipantDetail.module.css")).toContain("background: var(--terminal-bg);");
  });

  it("avoids fixed white fast-row gradients on the scoped route modules", () => {
    const whiteGradient = /rgba\(255\s*,\s*255\s*,\s*255\s*,\s*0\.85\)/;
    for (const stylesheet of [
      "src/routes/QA.module.css",
      "src/routes/Redcap.module.css",
      "src/routes/Matlab.module.css",
      "src/routes/Results.module.css",
    ]) {
      expect(read(stylesheet)).not.toMatch(whiteGradient);
    }
  });

  it("defines a terminal background token in the shared theme layer", () => {
    const css = read("src/styles/global.css");
    expect(css).toContain("--terminal-bg:");
  });

  it("defines REDCap status color tokens for light and dark themes", () => {
    const css = read("src/styles/global.css");
    for (const token of ["--status-red:", "--status-amber:", "--status-green:", "--status-grey:", "--status-blue:"]) {
      expect(css.match(new RegExp(token, "g"))?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
    expect(read("src/routes/Redcap.tsx")).toContain("var(--status-green)");
  });

  /**
   * Core theme-inverting dashboard surfaces must resolve their background from
   * the warm-card token (directly or via the shared `.surface-card` variant),
   * NOT from a literal `bg-white` utility that only flips because of the global
   * `:root[data-theme="dark"] .bg-white` override. Relying on that override is
   * the exact drift this audit removed: a tile that "looks fine" only because a
   * global rule patches it, while genuinely white-alpha siblings (which the
   * override never matches) silently stay light. Alpha glass overlays
   * (`bg-white/[0.0x]`) are allowed ONLY on the permanently-dark agentic panel,
   * which is excluded here.
   */
  it("keeps shared dashboard surfaces on the warm-card token, not literal bg-white", () => {
    const surfaces = [
      "src/components/warm/MetricCard.tsx",
      "src/components/warm/ParticipantFlow.tsx",
      "src/components/warm/AnimatedDAG.tsx",
      "src/components/warm/ReadingsGeoMap.tsx",
      "src/components/shell/Sidebar.tsx",
      "src/components/shell/TopNav.tsx",
      "src/routes/Overview.tsx",
    ];
    for (const file of surfaces) {
      const src = read(file);
      expect(src, `${file} still ships a literal bg-white surface`).not.toMatch(/\bbg-white\b/);
      expect(
        /surface-card|bg-\[color:var\(--warm-card\)\]/.test(src),
        `${file} must reference the warm-card surface token`,
      ).toBe(true);
    }
  });

  it("defines the shared .surface-card variant on the warm-card token", () => {
    const css = read("src/styles/global.css");
    expect(css).toMatch(/\.surface-card\s*\{[^}]*background:\s*var\(--warm-card\)/);
    expect(css).toMatch(/\.surface-card\s*\{[^}]*border:\s*1px solid var\(--warm-border\)/);
  });

  it("keeps the light-tone FastPaths chips on theme-aware glass tokens, not raw white alpha", () => {
    const src = read("src/components/warm/FastPaths.tsx");
    // The light tone renders on inverting glass surfaces (chat drawer); raw
    // bg-white/NN never flips and would glare in dark mode.
    expect(src).not.toMatch(/bg-white\/(60|70)\b/);
    expect(src).not.toMatch(/hover:bg-white\b(?!\/)/);
    for (const token of ["var(--glass-200)", "var(--glass-300)", "var(--glass-400)"]) {
      expect(src, `FastPaths light tone should use ${token}`).toContain(token);
    }
  });

  it("renders the AnimatedDAG edges and dot-grid from theme tokens", () => {
    const src = read("src/components/warm/AnimatedDAG.tsx");
    expect(src).not.toContain("#e6e4e0");
    expect(src).toContain('stroke="var(--warm-border)"');
    expect(src).toContain("var(--dot-grid)");
  });

  it("defines the --dot-grid texture token for light and dark themes", () => {
    const css = read("src/styles/global.css");
    expect(css.match(/--dot-grid:/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("gives the landing hero + dynamics surfaces dark-mode overrides instead of an opaque white sheen", () => {
    const css = read("src/routes/Landing.module.css");
    expect(css).toMatch(/\[data-theme="dark"\]\)\s*\.heroSignalCard/);
    expect(css).toMatch(/\[data-theme="dark"\]\)\s*\.dynamicsPanel/);
  });

  it("keeps assistant drawer/bubble surfaces on theme-aware glass tokens, not raw white alpha", () => {
    // The chat drawer panel inverts via --glass-*; its bubbles, pills, close
    // button, and textarea must too. A raw rgba(255,255,255,…) background never
    // flips in dark mode and renders as a glaring near-white blob with
    // near-white (--ink) text on it (observed contrast 1.18).
    const whiteBg = /background:\s*rgba\(\s*255\s*,\s*255\s*,\s*255/;
    for (const file of [
      "src/components/shell/ChatDrawer.module.css",
      "src/components/shell/Buddy.module.css",
    ]) {
      expect(read(file), `${file} ships a raw white-alpha surface background`).not.toMatch(whiteBg);
    }
  });
});
