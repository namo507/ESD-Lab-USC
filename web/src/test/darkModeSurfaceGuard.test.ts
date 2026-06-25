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
});
